import { PoolClient } from 'pg';
import { getPool } from '../pool';

function db(client?: PoolClient) {
  return client ?? getPool();
}

export interface SubmissionRow {
  id: string;
  event_id: string;
  submitted_by: string | null;
  submitted_at: Date;
  destination: string;
  packet_json: object;
  status: string;
}

export async function insertSubmission(params: {
  eventId: string;
  submittedBy: string | null;
  destination: string;
  packetJson: object;
}, client?: PoolClient): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO submissions (event_id, submitted_by, destination, packet_json, status)
     VALUES ($1, $2, $3, $4, 'sent')
     RETURNING id`,
    [params.eventId, params.submittedBy, params.destination, JSON.stringify(params.packetJson)]
  );
  return rows[0].id;
}

export async function getSubmissionsByEvent(
  eventId: string,
  client?: PoolClient
): Promise<SubmissionRow[]> {
  const { rows } = await db(client).query<SubmissionRow>(
    'SELECT * FROM submissions WHERE event_id = $1 ORDER BY submitted_at DESC',
    [eventId]
  );
  return rows;
}
