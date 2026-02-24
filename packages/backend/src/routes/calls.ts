import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AuditActions } from '@narc/shared';
import { requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import { processCall } from '../services/callProcessor';
import {
  getCalls,
  getCallById,
  updateCallStatus,
  updateCallFindingStatus,
  getOpenCallsForSla,
  CallsFilter,
} from '../db/queries/calls';

const router = Router();

// Multer: accept audio files in memory (max 50MB — Whisper limit is 25MB but allow headroom)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
      'audio/wav', 'audio/wave', 'audio/webm', 'audio/ogg',
      'video/mp4', 'video/webm',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|mp4|m4a|wav|webm|ogg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  },
});

const CallsQuerySchema = z.object({
  status:   z.string().optional(),
  severity: z.string().optional(),
  platform: z.string().optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
  search:   z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(200).optional().default(50),
  offset:   z.coerce.number().int().min(0).optional().default(0),
});

const CallStatusUpdateSchema = z.object({
  status: z.enum(['pending_review', 'reviewed', 'reported', 'dismissed', 'false_positive']),
  notes:  z.string().optional(),
});

const FindingStatusUpdateSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'dismissed', 'false_positive']),
});

// ─── Webhook auth helper ─────────────────────────────────────────────────────

function checkWebhookSecret(req: Request, res: Response): boolean {
  const secret = process.env.NARC_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NARC_AUTH) {
      console.warn('[calls/ingest] NARC_WEBHOOK_SECRET not set — rejecting unauthenticated request');
      res.status(401).json({ error: 'NARC_WEBHOOK_SECRET not configured' });
      return false;
    }
    // Dev mode: allow without secret
    return true;
  }
  const provided = req.headers['x-narc-secret'];
  if (provided === secret) return true;
  res.status(401).json({ error: 'Invalid X-NARC-Secret' });
  return false;
}

// ─── Auth middleware that allows both JWT and webhook secret ─────────────────

function requireAuthOrSecret(req: Request, res: Response, next: NextFunction): void {
  // Try webhook secret first
  const secret = process.env.NARC_WEBHOOK_SECRET;
  if (secret && req.headers['x-narc-secret'] === secret) {
    // Inject a system actor so downstream code works
    req.actor = {
      sub: '00000000-0000-0000-0000-000000000001',
      email: 'webhook@narc.system',
      role: 'admin',
      iat: 0,
      exp: 9_999_999_999,
    };
    return next();
  }
  // Fall back to JWT auth
  requireAuth(req, res, next);
}

/**
 * POST /api/calls/ingest
 * Universal ingestion endpoint — accepts multipart audio upload or JSON with audioUrl.
 */
router.post(
  '/ingest',
  requireAuthOrSecret,
  upload.single('audio'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!;

      let platform: string;
      let externalCallId: string | undefined;
      let agentEmail: string | undefined;
      let patientRef: string | undefined;
      let drugName: string | undefined;
      let startedAt: string | undefined;
      let endedAt: string | undefined;
      let durationSeconds: number | undefined;
      let direction: 'inbound' | 'outbound' | undefined;
      let recordingUrl: string | undefined;
      let audioUrl: string | undefined;

      if (req.file) {
        // Multipart upload
        platform        = String(req.body.platform ?? 'manual');
        externalCallId  = req.body.externalCallId ?? req.body.external_call_id;
        agentEmail      = req.body.agentEmail ?? req.body.agent_email;
        patientRef      = req.body.patientRef ?? req.body.patient_ref;
        drugName        = req.body.drugName ?? req.body.drug_name;
        startedAt       = req.body.startedAt ?? req.body.started_at;
        endedAt         = req.body.endedAt ?? req.body.ended_at;
        durationSeconds = req.body.durationSeconds ? Number(req.body.durationSeconds) : undefined;
        direction       = req.body.direction as 'inbound' | 'outbound' | undefined;
        recordingUrl    = req.body.recordingUrl ?? req.body.recording_url;
      } else {
        // JSON body with audioUrl
        const body = req.body as Record<string, unknown>;
        platform        = String(body.platform ?? 'webhook');
        audioUrl        = String(body.audioUrl ?? body.audio_url ?? '');
        externalCallId  = body.externalCallId as string | undefined ?? body.external_call_id as string | undefined;
        agentEmail      = body.agentEmail as string | undefined ?? body.agent_email as string | undefined;
        patientRef      = body.patientRef as string | undefined ?? body.patient_ref as string | undefined;
        drugName        = body.drugName as string | undefined ?? body.drug_name as string | undefined;
        startedAt       = body.startedAt as string | undefined ?? body.started_at as string | undefined;
        endedAt         = body.endedAt as string | undefined ?? body.ended_at as string | undefined;
        durationSeconds = body.durationSeconds ? Number(body.durationSeconds) : undefined;
        direction       = body.direction as 'inbound' | 'outbound' | undefined;
        recordingUrl    = body.recordingUrl as string | undefined ?? body.recording_url as string | undefined;

        if (!audioUrl) {
          res.status(400).json({ error: 'Request must include a multipart audio file or audioUrl in JSON body' });
          return;
        }
      }

      const result = await processCall({
        audioBuffer: req.file?.buffer,
        audioUrl,
        filename: req.file?.originalname,
        mimeType: req.file?.mimetype,
        platform,
        externalCallId,
        agentEmail,
        agentId: actor.sub,
        patientRef,
        drugName,
        startedAt,
        endedAt,
        durationSeconds,
        direction,
        recordingUrl,
      }, actor.sub);

      res.status(201).json({ callId: result.callId });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/calls
 * List calls with filtering and pagination.
 */
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = CallsQuerySchema.parse(req.query);
    const filter: CallsFilter = {
      status:   query.status,
      severity: query.severity,
      platform: query.platform,
      from:     query.from,
      to:       query.to,
      search:   query.search,
      limit:    query.limit,
      offset:   query.offset,
    };

    const { calls, total } = await getCalls(filter);

    res.json({ calls, total });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/calls/sla/open
 * Internal endpoint for SLA worker — returns calls needing SLA evaluation.
 */
router.get('/sla/open', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const calls = await getOpenCallsForSla();
    res.json({ calls });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/calls/:id
 * Get a single call with all findings.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getCallById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/calls/:id
 * Update call status (reviewed, dismissed, false_positive, reported).
 */
router.patch('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const { status, notes } = CallStatusUpdateSchema.parse(req.body);

    const existing = await getCallById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    const updated = await updateCallStatus(req.params.id, status, notes);
    if (!updated) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    await auditLog({
      actor: { id: actor.sub, role: actor.role },
      action: AuditActions.STATUS_UPDATE,
      entityType: 'call',
      entityId: req.params.id,
      before: { status: existing.call.status },
      after:  { status, notes },
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/calls/:id/findings/:findingId
 * Update individual finding status.
 */
router.patch('/:id/findings/:findingId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const { status } = FindingStatusUpdateSchema.parse(req.body);

    const updated = await updateCallFindingStatus(req.params.id, req.params.findingId, status);
    if (!updated) {
      res.status(404).json({ error: 'Finding not found' });
      return;
    }

    await auditLog({
      actor: { id: actor.sub, role: actor.role },
      action: AuditActions.STATUS_UPDATE,
      entityType: 'call_finding',
      entityId: req.params.findingId,
      before: null,
      after:  { status },
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
