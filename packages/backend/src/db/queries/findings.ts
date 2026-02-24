import { Pool, PoolClient } from 'pg';
import type { DismissReasonType } from '@narc/shared';
import { getPool } from '../pool';

function db(client?: PoolClient | Pool): Pool | PoolClient {
  return client ?? getPool();
}

export interface InsertFindingParams {
  event_id: string;
  excerpt: string;
  category: string;
  severity: string;
  explanation: string;
  urgency: string;
  confidence: number;
  status: string;
  model_version: string | null;
  highlight_spans: object | null;
  raw_confidence: number | null;
  calibrated_confidence: number | null;
}

export async function insertFinding(
  params: InsertFindingParams,
  client?: PoolClient
): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO ae_findings (
       event_id, excerpt, category, severity, explanation,
       urgency, confidence, status,
       model_version, highlight_spans, raw_confidence, calibrated_confidence
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      params.event_id, params.excerpt, params.category, params.severity, params.explanation,
      params.urgency, params.confidence, params.status,
      params.model_version,
      params.highlight_spans ? JSON.stringify(params.highlight_spans) : null,
      params.raw_confidence, params.calibrated_confidence,
    ]
  );
  return rows[0].id;
}

// ─── Update finding status ────────────────────────────────────────────────────

export interface UpdateFindingStatusParams {
  id: string;
  status: string;
  dismissReason?: DismissReasonType | null;
  dismissedBy?: string | null;
}

export async function updateFindingStatus(
  params: UpdateFindingStatusParams,
  client?: PoolClient
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    `UPDATE ae_findings
     SET status         = $1,
         dismiss_reason = $2,
         dismissed_by   = $3,
         dismissed_at   = CASE WHEN $1 = 'dismissed' THEN NOW() ELSE NULL END,
         updated_at     = NOW()
     WHERE id = $4`,
    [params.status, params.dismissReason ?? null, params.dismissedBy ?? null, params.id]
  );
  return (rowCount ?? 0) > 0;
}

// ─── FP Insights ─────────────────────────────────────────────────────────────

export interface FPInsightRow {
  category: string;
  totalCount: number;
  dismissedCount: number;
  dismissRate: number;                          // 0–1
  avgConfidenceKept: number | null;
  avgConfidenceDismissed: number | null;
  topReasons: { reason: string; count: number }[];
  recommendedMinConfidence: number | null;      // p70 of dismissed when dismissRate > 0.3
}

export async function getFPInsights(
  days = 90,
  client?: PoolClient
): Promise<FPInsightRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Query 1: per-category totals + dismiss counts + avg confidence split
  const { rows: statsRows } = await db(client).query<{
    category: string;
    total_count: number;
    dismissed_count: number;
    avg_confidence_kept: string | null;
    avg_confidence_dismissed: string | null;
  }>(
    `SELECT
       f.category,
       COUNT(*)::int                                                             AS total_count,
       COUNT(*) FILTER (WHERE f.status = 'dismissed')::int                      AS dismissed_count,
       AVG(f.calibrated_confidence) FILTER (WHERE f.status != 'dismissed')      AS avg_confidence_kept,
       AVG(f.calibrated_confidence) FILTER (WHERE f.status = 'dismissed')       AS avg_confidence_dismissed
     FROM ae_findings f
     JOIN events e ON e.id = f.event_id
     WHERE e.detected_at >= $1
     GROUP BY f.category
     ORDER BY dismissed_count DESC`,
    [since]
  );

  if (statsRows.length === 0) return [];

  // Query 2: top dismiss reasons per category
  const { rows: reasonRows } = await db(client).query<{
    category: string;
    dismiss_reason: string;
    reason_count: number;
  }>(
    `SELECT
       f.category,
       f.dismiss_reason,
       COUNT(*)::int AS reason_count
     FROM ae_findings f
     JOIN events e ON e.id = f.event_id
     WHERE e.detected_at >= $1 AND f.dismiss_reason IS NOT NULL
     GROUP BY f.category, f.dismiss_reason
     ORDER BY f.category, reason_count DESC`,
    [since]
  );

  // Query 3: p70 confidence threshold for dismissed findings per category
  const { rows: p70Rows } = await db(client).query<{
    category: string;
    p70_confidence: string | null;
  }>(
    `SELECT
       category,
       PERCENTILE_CONT(0.7) WITHIN GROUP (ORDER BY calibrated_confidence) AS p70_confidence
     FROM ae_findings f
     JOIN events e ON e.id = f.event_id
     WHERE e.detected_at >= $1
       AND f.status = 'dismissed'
       AND f.calibrated_confidence IS NOT NULL
     GROUP BY category`,
    [since]
  );

  // Build lookup maps
  const reasonMap = new Map<string, { reason: string; count: number }[]>();
  for (const row of reasonRows) {
    if (!reasonMap.has(row.category)) reasonMap.set(row.category, []);
    reasonMap.get(row.category)!.push({ reason: row.dismiss_reason, count: row.reason_count });
  }

  const p70Map = new Map<string, number>();
  for (const row of p70Rows) {
    if (row.p70_confidence != null) {
      p70Map.set(row.category, parseFloat(row.p70_confidence));
    }
  }

  return statsRows.map((row) => {
    const dismissRate = row.total_count > 0 ? row.dismissed_count / row.total_count : 0;
    const p70 = p70Map.get(row.category) ?? null;
    const topReasons = (reasonMap.get(row.category) ?? []).slice(0, 4);

    return {
      category: row.category,
      totalCount: row.total_count,
      dismissedCount: row.dismissed_count,
      dismissRate: Math.round(dismissRate * 1000) / 1000,
      avgConfidenceKept: row.avg_confidence_kept != null
        ? Math.round(parseFloat(row.avg_confidence_kept) * 1000) / 1000
        : null,
      avgConfidenceDismissed: row.avg_confidence_dismissed != null
        ? Math.round(parseFloat(row.avg_confidence_dismissed) * 1000) / 1000
        : null,
      topReasons,
      // Only recommend a threshold when >30% dismissal rate AND we have p70 data
      recommendedMinConfidence: dismissRate > 0.3 && p70 != null
        ? Math.round(p70 * 100) / 100
        : null,
    };
  });
}
