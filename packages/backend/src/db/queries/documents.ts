import { PoolClient } from 'pg';
import { getPool } from '../pool';

function db(client?: PoolClient) {
  return client ?? getPool();
}

export interface DocumentRow {
  id: string;
  event_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  extraction_method: string;
  extracted_text: string | null;
  ocr_confidence: number | null;
  bounding_boxes: object | null;
  processing_status: string;
  error_message: string | null;
  created_at: Date;
}

export async function insertDocument(params: {
  eventId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}, client?: PoolClient): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO documents (event_id, filename, mime_type, size_bytes, storage_path, processing_status)
     VALUES ($1, $2, $3, $4, $5, 'processing')
     RETURNING id`,
    [params.eventId, params.filename, params.mimeType, params.sizeBytes, params.storagePath]
  );
  return rows[0].id;
}

export async function updateDocumentExtraction(params: {
  id: string;
  extractionMethod: string;
  extractedText: string;
  ocrConfidence: number | null;
  status: 'completed' | 'failed';
  errorMessage?: string;
}, client?: PoolClient): Promise<void> {
  await db(client).query(
    `UPDATE documents
     SET extraction_method = $1,
         extracted_text = $2,
         ocr_confidence = $3,
         processing_status = $4,
         error_message = $5
     WHERE id = $6`,
    [params.extractionMethod, params.extractedText, params.ocrConfidence,
     params.status, params.errorMessage ?? null, params.id]
  );
}

export async function getDocumentsByEvent(
  eventId: string,
  client?: PoolClient
): Promise<DocumentRow[]> {
  const { rows } = await db(client).query<DocumentRow>(
    'SELECT * FROM documents WHERE event_id = $1 ORDER BY created_at ASC',
    [eventId]
  );
  return rows;
}
