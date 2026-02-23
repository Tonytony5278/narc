import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  insertDocument,
  updateDocumentExtraction,
  getDocumentsByEvent,
} from '../db/queries/documents';
import { getEventById } from '../db/queries/events';
import { extractText } from '../services/documents';
import { auditLog } from '../services/audit';
import { AuditActions } from '@narc/shared';

const router = Router({ mergeParams: true }); // mergeParams for :id from parent

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/rtf',
  'text/rtf',
  'text/plain',
]);

const storage = multer.memoryStorage(); // Keep in memory for processing
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported: PDF, images (PNG/JPEG/GIF/WebP), DOCX, RTF, TXT`));
    }
  },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/events/:id/documents
 * Upload a PDF, image, DOCX, RTF, or TXT attachment for an event.
 * Returns 202 immediately — extraction runs async.
 */
router.post('/', upload.single('document'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = (req.params as { id: string }).id;
    const actor = req.actor!;

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Use multipart field name "document".' });
      return;
    }

    // Verify event exists and actor has access
    const result = await getEventById(eventId);
    if (!result) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    // Row-level: agents can only attach to their own events
    if (actor.role === 'agent' && result.event.agent_id !== actor.sub) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Persist file to disk
    const eventUploadDir = path.join(UPLOAD_DIR, eventId);
    fs.mkdirSync(eventUploadDir, { recursive: true });
    const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = path.join(eventUploadDir, safeFilename);
    fs.writeFileSync(storagePath, req.file.buffer);

    // Insert document row (status: processing)
    const docId = await insertDocument({
      eventId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storagePath,
    });

    // Audit the upload
    await auditLog({
      actor: { id: actor.sub, role: actor.role },
      action: AuditActions.DOCUMENT_UPLOAD,
      entityType: 'document',
      entityId: docId,
      before: null,
      after: { eventId, filename: req.file.originalname, sizeBytes: req.file.size, mimeType: req.file.mimetype },
      req,
    });

    // Run extraction asynchronously (don't block HTTP response)
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    setImmediate(async () => {
      try {
        const extraction = await extractText(fileBuffer, mimeType);

        await updateDocumentExtraction({
          id: docId,
          extractionMethod: extraction.method,
          extractedText: extraction.text,
          ocrConfidence: extraction.confidence,
          status: 'completed',
        });
        console.log(`[Documents] Extracted ${extraction.text.length} chars from ${docId} via ${extraction.method}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Extraction failed';
        await updateDocumentExtraction({
          id: docId,
          extractionMethod: 'pdf-parse',
          extractedText: '',
          ocrConfidence: null,
          status: 'failed',
          errorMessage: msg,
        });
        console.error(`[Documents] Extraction failed for ${docId}:`, err);
      }
    });

    // Return 202 Accepted — extraction is async
    res.status(202).json({
      id: docId,
      eventId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      processing_status: 'processing',
      message: 'File accepted. Text extraction is in progress.',
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/events/:id/documents
 * List all documents for an event.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = (req.params as { id: string }).id;
    const actor = req.actor!;

    const result = await getEventById(eventId);
    if (!result) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    if (actor.role === 'agent' && result.event.agent_id !== actor.sub) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const docs = await getDocumentsByEvent(eventId);
    res.json({ documents: docs, total: docs.length });
  } catch (err) { next(err); }
});

export default router;
