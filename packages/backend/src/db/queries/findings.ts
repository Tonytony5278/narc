import { Pool, PoolClient } from 'pg';
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

export async function updateFindingStatus(
  id: string,
  status: string,
  client?: PoolClient
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    `UPDATE ae_findings
     SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    [status, id]
  );
  return (rowCount ?? 0) > 0;
}
