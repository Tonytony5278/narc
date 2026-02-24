/**
 * Platform-specific webhook adapters.
 * Each adapter normalises a platform's webhook payload into the universal
 * CallIngestPayload format and calls processCall().
 *
 * All routes authenticate via the X-NARC-Secret header.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { processCall } from '../services/callProcessor';

const router = Router();

// ─── Webhook auth ────────────────────────────────────────────────────────────

function requireWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.NARC_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NARC_AUTH) {
      console.warn('[webhooks] NARC_WEBHOOK_SECRET not set — rejecting request');
      res.status(401).json({ error: 'NARC_WEBHOOK_SECRET not configured' });
      return;
    }
    // Dev mode: allow without secret
    return next();
  }
  if (req.headers['x-narc-secret'] === secret) return next();
  res.status(401).json({ error: 'Invalid X-NARC-Secret' });
}

// ─── Amazon Connect ──────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/amazon-connect
 * Amazon Connect EventBridge/Lambda webhook payload.
 */
router.post(
  '/amazon-connect',
  requireWebhookSecret,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = req.body as Record<string, any>;

      const externalCallId = body.ContactId as string | undefined;
      const recordingUrl   = body.RecordingUrl as string | undefined;
      const agentEmail     = body.Agent?.Username as string | undefined;
      const startedAt      = body.InitiationTimestamp as string | undefined;
      const endedAt        = body.DisconnectTimestamp as string | undefined;
      const drugName       = body.Attributes?.DrugName as string | undefined;
      const patientRef     = body.Attributes?.PatientRef as string | undefined;

      let durationSeconds: number | undefined;
      if (startedAt && endedAt) {
        durationSeconds = Math.round(
          (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
        );
      }

      if (!recordingUrl) {
        res.status(400).json({ error: 'Amazon Connect webhook requires RecordingUrl' });
        return;
      }

      const { callId } = await processCall({
        audioUrl: recordingUrl,
        platform: 'amazon_connect',
        externalCallId,
        agentEmail,
        patientRef,
        drugName,
        startedAt,
        endedAt,
        durationSeconds,
        direction: 'inbound',
        recordingUrl,
      });

      res.status(202).json({ callId, message: 'Processing started' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Genesys Cloud ───────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/genesys
 * Genesys Cloud conversation webhook.
 */
router.post(
  '/genesys',
  requireWebhookSecret,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = req.body as Record<string, any>;

      const externalCallId = body.id as string | undefined;
      const recordingUrl   = body.mediaUris?.audio as string | undefined;

      // Find agent participant
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const participants: any[] = body.participants ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agent = participants.find((p: any) => p.purpose === 'agent');
      const agentEmail = agent?.userId ?? agent?.name;

      let durationSeconds: number | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const times = participants.flatMap((p: any) => [p.connectedTime, p.endTime]).filter(Boolean);
      if (times.length >= 2) {
        const sorted = times.map((t: string) => new Date(t).getTime()).sort((a: number, b: number) => a - b);
        durationSeconds = Math.round((sorted[sorted.length - 1] - sorted[0]) / 1000);
      }

      if (!recordingUrl) {
        res.status(400).json({ error: 'Genesys webhook requires mediaUris.audio' });
        return;
      }

      const { callId } = await processCall({
        audioUrl: recordingUrl,
        platform: 'genesys',
        externalCallId,
        agentEmail,
        durationSeconds,
        direction: 'inbound',
        recordingUrl,
      });

      res.status(202).json({ callId, message: 'Processing started' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── RingCentral ─────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/ringcentral
 * RingCentral call recording webhook.
 */
router.post(
  '/ringcentral',
  requireWebhookSecret,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = req.body as Record<string, any>;

      const externalCallId = body.uuid as string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recordings: any[] = body.recordings ?? [];
      const recording = recordings[0];
      const recordingUrl = recording?.contentUri as string | undefined;
      const durationSeconds = recording?.duration as number | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legs: any[] = body.legs ?? [];
      const leg = legs[0];
      const agentEmail = leg?.from?.name ?? leg?.from?.extensionNumber;
      const startedAt = leg?.startTime as string | undefined;
      const endedAt   = leg?.endTime as string | undefined;

      if (!recordingUrl) {
        res.status(400).json({ error: 'RingCentral webhook requires recordings[0].contentUri' });
        return;
      }

      const { callId } = await processCall({
        audioUrl: recordingUrl,
        platform: 'ringcentral',
        externalCallId,
        agentEmail,
        startedAt,
        endedAt,
        durationSeconds,
        direction: 'inbound',
        recordingUrl,
      });

      res.status(202).json({ callId, message: 'Processing started' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Generic ─────────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/generic
 * A generic webhook that any platform can use.
 */
router.post(
  '/generic',
  requireWebhookSecret,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        call_id?: string;
        recording_url?: string;
        agent_email?: string;
        patient_ref?: string;
        drug_name?: string;
        started_at?: string;
        ended_at?: string;
        platform?: string;
        duration_seconds?: number;
        direction?: 'inbound' | 'outbound';
      };

      const recordingUrl = body.recording_url;
      if (!recordingUrl) {
        res.status(400).json({ error: 'Generic webhook requires recording_url' });
        return;
      }

      let durationSeconds = body.duration_seconds;
      if (!durationSeconds && body.started_at && body.ended_at) {
        durationSeconds = Math.round(
          (new Date(body.ended_at).getTime() - new Date(body.started_at).getTime()) / 1000
        );
      }

      const { callId } = await processCall({
        audioUrl: recordingUrl,
        platform: body.platform ?? 'custom',
        externalCallId: body.call_id,
        agentEmail: body.agent_email,
        patientRef: body.patient_ref,
        drugName: body.drug_name,
        startedAt: body.started_at,
        endedAt: body.ended_at,
        durationSeconds,
        direction: body.direction ?? 'inbound',
        recordingUrl,
      });

      res.status(202).json({ callId, message: 'Processing started' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
