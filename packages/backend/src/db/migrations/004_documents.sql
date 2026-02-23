-- Document Pipeline
-- Supports PDF text extraction and Claude Vision OCR fallback
-- Stores bounding box data for UI highlight overlays

CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  filename          TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  storage_path      TEXT NOT NULL,
  -- storage_path: {UPLOAD_DIR}/{event_id}/{doc_id}_{filename}
  -- abstracted for future S3 migration
  extraction_method TEXT NOT NULL DEFAULT 'pdf-parse',
  -- extraction_method: pdf-parse | claude-vision
  extracted_text    TEXT,
  ocr_confidence    REAL,
  -- null for pdf-parse, 0.85 default for claude-vision
  bounding_boxes    JSONB,
  -- [{page: int, x: float, y: float, width: float, height: float, text: string}]
  processing_status TEXT NOT NULL DEFAULT 'pending',
  -- pending | processing | completed | failed
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_event  ON documents(event_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(processing_status);
