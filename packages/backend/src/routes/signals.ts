/**
 * Signal Detection API
 *
 * Aggregates adverse event findings across all events to surface safety signals.
 * Uses a simplified disproportionality approach (count-based pattern detection)
 * suitable for early-stage pharmacovigilance programs without a full PSUR pipeline.
 *
 * Endpoints:
 *   GET /api/signals             — top-level signal summary
 *   GET /api/signals/drugs       — per-drug breakdown
 *   GET /api/signals/timeline    — event counts over time (for charts)
 *   GET /api/signals/categories  — per-category AE frequency
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { getPool } from '../db/pool';
import { getFPInsights } from '../db/queries/findings';

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SignalSummary {
  totalEvents: number;
  totalFindings: number;
  totalAEEvents: number;          // events with ≥1 AE finding
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  slaBreachedCount: number;
  periodDays: number;
  generatedAt: string;
}

export interface DrugSignal {
  drugName: string;
  eventCount: number;
  findingCount: number;
  severityDistribution: Record<string, number>;
  categories: string[];
  offLabelFlags: number;
  lastReportedAt: string;
  trend: 'rising' | 'stable' | 'falling';  // based on recent vs previous period
  riskScore: number;                        // 0–100 composite score
}

export interface CategorySignal {
  category: string;
  findingCount: number;
  eventCount: number;
  severityDistribution: Record<string, number>;
  averageConfidence: number;
  lastSeenAt: string;
}

export interface TimelinePoint {
  date: string;          // YYYY-MM-DD
  eventCount: number;
  aeCount: number;
  criticalCount: number;
  highCount: number;
}

// ─── Helper: extract drug name from text ────────────────────────────────────

const KNOWN_DRUGS_PATTERNS = [
  // Biologics
  'avsola', 'infliximab', 'enbrel', 'etanercept', 'humira', 'adalimumab',
  'otezla', 'apremilast', 'stelara', 'ustekinumab', 'cosentyx', 'secukinumab',
  'taltz', 'ixekizumab', 'tremfya', 'guselkumab', 'skyrizi', 'risankizumab',
  'rinvoq', 'upadacitinib', 'xeljanz', 'tofacitinib', 'olumiant', 'baricitinib',
  'kevzara', 'sarilumab', 'actemra', 'tocilizumab', 'orencia', 'abatacept',
  'simponi', 'golimumab', 'cimzia', 'certolizumab',
  // Oncology
  'keytruda', 'pembrolizumab', 'opdivo', 'nivolumab', 'yervoy', 'ipilimumab',
  'tecentriq', 'atezolizumab', 'imfinzi', 'durvalumab', 'bavencio', 'avelumab',
  // Common drugs
  'methotrexate', 'prednisone', 'methylprednisolone', 'hydroxychloroquine',
  'sulfasalazine', 'leflunomide', 'azathioprine', 'mycophenolate',
  'warfarin', 'rivaroxaban', 'apixaban', 'dabigatran',
  'atorvastatin', 'rosuvastatin', 'simvastatin',
];

function extractDrugNames(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const drug of KNOWN_DRUGS_PATTERNS) {
    if (lower.includes(drug)) {
      // Capitalize first letter for display
      const display = drug.charAt(0).toUpperCase() + drug.slice(1);
      if (!found.includes(display)) found.push(display);
    }
  }
  return found;
}

function computeRiskScore(
  findingCount: number,
  criticalCount: number,
  highCount: number,
  offLabelFlags: number,
  trend: DrugSignal['trend']
): number {
  let score = 0;
  score += Math.min(findingCount * 5, 30);        // up to 30 pts for volume
  score += criticalCount * 20;                     // 20 pts per critical finding
  score += highCount * 10;                         // 10 pts per high finding
  score += offLabelFlags * 15;                     // 15 pts per off-label flag
  if (trend === 'rising') score += 15;
  score = Math.min(100, Math.max(0, score));
  return Math.round(score);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/signals
 * High-level summary statistics for the signals dashboard.
 * Query params: days (default: 90)
 */
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(parseInt(req.query.days as string ?? '90', 10), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const pool = getPool();

    const [eventsResult, findingsResult, slaResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                                                  AS total_events,
          COUNT(*) FILTER (WHERE ae_count > 0)::int                                     AS ae_events,
          COUNT(*) FILTER (WHERE max_severity = 'critical')::int                        AS critical_count,
          COUNT(*) FILTER (WHERE max_severity = 'high')::int                            AS high_count,
          COUNT(*) FILTER (WHERE max_severity = 'medium')::int                          AS medium_count,
          COUNT(*) FILTER (WHERE max_severity = 'low')::int                             AS low_count
        FROM events
        WHERE detected_at >= $1
      `, [since]),
      pool.query(`
        SELECT COUNT(*)::int AS total_findings
        FROM ae_findings f
        JOIN events e ON e.id = f.event_id
        WHERE e.detected_at >= $1
      `, [since]),
      pool.query(`
        SELECT COUNT(*)::int AS sla_breached
        FROM events
        WHERE detected_at >= $1 AND sla_status = 'breached'
      `, [since]),
    ]);

    const ev = eventsResult.rows[0];
    const summary: SignalSummary = {
      totalEvents:      ev.total_events,
      totalFindings:    findingsResult.rows[0].total_findings,
      totalAEEvents:    ev.ae_events,
      criticalCount:    ev.critical_count,
      highCount:        ev.high_count,
      mediumCount:      ev.medium_count,
      lowCount:         ev.low_count,
      slaBreachedCount: slaResult.rows[0].sla_breached,
      periodDays:       days,
      generatedAt:      new Date().toISOString(),
    };

    res.json(summary);
  } catch (err) { next(err); }
});

/**
 * GET /api/signals/drugs
 * Per-drug signal breakdown, sorted by risk score.
 * Query params: days (default: 90), minCount (default: 1)
 */
router.get('/drugs', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days     = Math.min(parseInt(req.query.days as string ?? '90', 10), 365);
    const minCount = parseInt(req.query.minCount as string ?? '1', 10);
    const since    = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const halfDays = new Date(Date.now() - (days / 2) * 24 * 60 * 60 * 1000).toISOString();
    const pool     = getPool();

    // Fetch all events + their findings in the window
    const eventsRows = await pool.query<{
      id: string;
      subject: string;
      body_excerpt: string;
      max_severity: string;
      detected_at: string;
    }>(
      `SELECT id, subject, body_excerpt, max_severity, detected_at
       FROM events
       WHERE detected_at >= $1 AND ae_count > 0
       ORDER BY detected_at DESC`,
      [since]
    );

    const findingsRows = await pool.query<{
      event_id: string;
      category: string;
      severity: string;
      confidence: number;
      excerpt: string;
    }>(
      `SELECT f.event_id, f.category, f.severity, f.confidence, f.excerpt
       FROM ae_findings f
       JOIN events e ON e.id = f.event_id
       WHERE e.detected_at >= $1`,
      [since]
    );

    // Build drug → events map
    const drugMap = new Map<string, {
      eventIds: Set<string>;
      findings: typeof findingsRows.rows;
      recentEventIds: Set<string>;   // events in recent half of window (for trend)
      lastReportedAt: string;
    }>();

    for (const ev of eventsRows.rows) {
      const text  = `${ev.subject} ${ev.body_excerpt}`;
      const drugs = extractDrugNames(text);

      for (const drug of drugs) {
        if (!drugMap.has(drug)) {
          drugMap.set(drug, { eventIds: new Set(), findings: [], recentEventIds: new Set(), lastReportedAt: '' });
        }
        const entry = drugMap.get(drug)!;
        entry.eventIds.add(ev.id);
        if (new Date(ev.detected_at) >= new Date(halfDays)) {
          entry.recentEventIds.add(ev.id);
        }
        if (!entry.lastReportedAt || ev.detected_at > entry.lastReportedAt) {
          entry.lastReportedAt = ev.detected_at;
        }
      }
    }

    // Map findings to drugs
    for (const finding of findingsRows.rows) {
      for (const [, entry] of drugMap) {
        if (entry.eventIds.has(finding.event_id)) {
          entry.findings.push(finding);
        }
      }
    }

    // Compile results
    const signals: DrugSignal[] = [];

    for (const [drugName, entry] of drugMap) {
      const eventCount   = entry.eventIds.size;
      if (eventCount < minCount) continue;

      const recentCount  = entry.recentEventIds.size;
      const prevCount    = eventCount - recentCount;

      const trend: DrugSignal['trend'] =
        recentCount > prevCount * 1.5 ? 'rising' :
        recentCount < prevCount * 0.5 ? 'falling' : 'stable';

      const severityDistribution: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
      const categoriesSet = new Set<string>();
      let offLabelFlags   = 0;

      for (const f of entry.findings) {
        severityDistribution[f.severity] = (severityDistribution[f.severity] ?? 0) + 1;
        categoriesSet.add(f.category);
        if (f.category === 'off_label_use' || f.category === 'off_label_dosing') offLabelFlags++;
      }

      signals.push({
        drugName,
        eventCount,
        findingCount:          entry.findings.length,
        severityDistribution,
        categories:            [...categoriesSet],
        offLabelFlags,
        lastReportedAt:        entry.lastReportedAt,
        trend,
        riskScore:             computeRiskScore(
          entry.findings.length,
          severityDistribution.critical,
          severityDistribution.high,
          offLabelFlags,
          trend
        ),
      });
    }

    // Sort by risk score descending
    signals.sort((a, b) => b.riskScore - a.riskScore);

    res.json({ signals, periodDays: days, generatedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

/**
 * GET /api/signals/categories
 * Per AE category breakdown.
 * Query params: days (default: 90)
 */
router.get('/categories', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days  = Math.min(parseInt(req.query.days as string ?? '90', 10), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const pool  = getPool();

    const result = await pool.query<{
      category: string;
      finding_count: number;
      event_count: number;
      critical_count: number;
      high_count: number;
      medium_count: number;
      low_count: number;
      avg_confidence: number;
      last_seen: string;
    }>(
      `SELECT
        f.category,
        COUNT(f.id)::int                                              AS finding_count,
        COUNT(DISTINCT f.event_id)::int                               AS event_count,
        COUNT(*) FILTER (WHERE f.severity = 'critical')::int          AS critical_count,
        COUNT(*) FILTER (WHERE f.severity = 'high')::int              AS high_count,
        COUNT(*) FILTER (WHERE f.severity = 'medium')::int            AS medium_count,
        COUNT(*) FILTER (WHERE f.severity = 'low')::int               AS low_count,
        AVG(f.confidence)                                             AS avg_confidence,
        MAX(e.detected_at)                                            AS last_seen
       FROM ae_findings f
       JOIN events e ON e.id = f.event_id
       WHERE e.detected_at >= $1
       GROUP BY f.category
       ORDER BY finding_count DESC`,
      [since]
    );

    const categories: CategorySignal[] = result.rows.map((row) => ({
      category:             row.category,
      findingCount:         row.finding_count,
      eventCount:           row.event_count,
      severityDistribution: {
        critical: row.critical_count,
        high:     row.high_count,
        medium:   row.medium_count,
        low:      row.low_count,
      },
      averageConfidence: Math.round((row.avg_confidence ?? 0) * 100) / 100,
      lastSeenAt:        row.last_seen ? new Date(row.last_seen as string | Date).toISOString() : new Date().toISOString(),
    }));

    res.json({ categories, periodDays: days, generatedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

/**
 * GET /api/signals/timeline
 * Day-by-day event counts for chart rendering.
 * Query params: days (default: 30)
 */
router.get('/timeline', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days  = Math.min(parseInt(req.query.days as string ?? '30', 10), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const pool  = getPool();

    const result = await pool.query<{
      date: string;
      event_count: number;
      ae_count: number;
      critical_count: number;
      high_count: number;
    }>(
      `SELECT
        TO_CHAR(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')         AS date,
        COUNT(*)::int                                                  AS event_count,
        COUNT(*) FILTER (WHERE ae_count > 0)::int                     AS ae_count,
        COUNT(*) FILTER (WHERE max_severity = 'critical')::int        AS critical_count,
        COUNT(*) FILTER (WHERE max_severity = 'high')::int            AS high_count
       FROM events
       WHERE detected_at >= $1
       GROUP BY 1
       ORDER BY 1 ASC`,
      [since]
    );

    // Fill in missing days with zeros
    const pointMap = new Map<string, TimelinePoint>();
    for (const row of result.rows) {
      pointMap.set(row.date, {
        date:          row.date,
        eventCount:    row.event_count,
        aeCount:       row.ae_count,
        criticalCount: row.critical_count,
        highCount:     row.high_count,
      });
    }

    // Generate full date range
    const timeline: TimelinePoint[] = [];
    for (let d = 0; d < days; d++) {
      const ts   = new Date(Date.now() - (days - 1 - d) * 24 * 60 * 60 * 1000);
      const date = ts.toISOString().slice(0, 10);
      timeline.push(
        pointMap.get(date) ?? {
          date,
          eventCount: 0,
          aeCount: 0,
          criticalCount: 0,
          highCount: 0,
        }
      );
    }

    res.json({ timeline, periodDays: days, generatedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

/**
 * GET /api/signals/fp-insights
 * Per-category false-positive analysis.
 * Returns dismiss rates, confidence gaps, top reasons, and threshold recommendations.
 * Query params: days (default: 90, max: 365)
 */
router.get('/fp-insights', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(parseInt(req.query.days as string ?? '90', 10) || 90, 365);
    const insights = await getFPInsights(days);
    res.json({
      insights,
      periodDays: days,
      generatedAt: new Date().toISOString(),
      disclaimer: 'Threshold recommendations are advisory. Apply via Policy page.',
    });
  } catch (err) { next(err); }
});

export default router;
