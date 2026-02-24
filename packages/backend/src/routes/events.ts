import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { EventStatusUpdateSchema, FindingStatusUpdateSchema, AuditActions } from '@narc/shared';
import { requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import { withTransaction } from '../db/pool';
import {
  getEvents,
  getEventById,
  updateEventStatus,
  deleteEvent,
  deleteAllEvents,
  EventsFilter,
} from '../db/queries/events';
import { updateFindingStatus } from '../db/queries/findings';

const router = Router();

const EventsQuerySchema = z.object({
  status: z.string().optional(),
  severity: z.string().optional(),
  category: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ─── Formatters ───────────────────────────────────────────────────────────────

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}

function formatFinding(f: {
  id: string; event_id: string; excerpt: string; category: string;
  severity: string; explanation: string; urgency: string; confidence: number;
  status: string; created_at: Date; updated_at: Date;
  model_version: string | null; highlight_spans: object | null;
  raw_confidence: number | null; calibrated_confidence: number | null;
}) {
  return {
    id: f.id,
    eventId: f.event_id,
    excerpt: f.excerpt,
    category: f.category,
    severity: f.severity,
    explanation: f.explanation,
    urgency: f.urgency,
    confidence: f.confidence,
    status: f.status,
    modelVersion: f.model_version,
    highlightSpans: f.highlight_spans,
    rawConfidence: f.raw_confidence,
    calibratedConfidence: f.calibrated_confidence,
    createdAt: toIso(f.created_at)!,
    updatedAt: toIso(f.updated_at)!,
  };
}

function formatEvent(e: {
  id: string; email_id: string; subject: string; sender: string;
  received_at: Date; body_excerpt: string; ae_count: number; max_severity: string;
  status: string; notes: string; created_at: Date; updated_at: Date;
  detected_at: Date | null; deadline_at: Date | null; sla_status: string;
  escalation_level: number; policy_version_id: string | null;
  agent_id: string | null; model_version: string | null;
  findings: Parameters<typeof formatFinding>[0][];
}) {
  return {
    id: e.id,
    emailId: e.email_id,
    subject: e.subject,
    sender: e.sender,
    receivedAt: toIso(e.received_at)!,
    bodyExcerpt: e.body_excerpt,
    aeCount: e.ae_count,
    maxSeverity: e.max_severity,
    status: e.status,
    notes: e.notes,
    createdAt: toIso(e.created_at)!,
    updatedAt: toIso(e.updated_at)!,
    detectedAt: toIso(e.detected_at),
    deadlineAt: toIso(e.deadline_at),
    slaStatus: e.sla_status,
    escalationLevel: e.escalation_level,
    policyVersionId: e.policy_version_id,
    agentId: e.agent_id,
    modelVersion: e.model_version,
    findings: e.findings.map(formatFinding),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/events
 * List flagged events. Agents only see their own (row-level security).
 */
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const query = EventsQuerySchema.parse(req.query);

    const filter: EventsFilter = {
      status: query.status,
      severity: query.severity,
      category: query.category,
      from: query.from,
      to: query.to,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
      agentId: actor.role === 'agent' ? actor.sub : undefined,
    };

    const { events, total } = await getEvents(filter);
    res.json({ events: events.map(formatEvent), total });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/events/:id
 * Get a single event with all findings.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const result = await getEventById(req.params.id);

    if (!result) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (actor.role === 'agent' && result.event.agent_id !== actor.sub) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json(formatEvent({ ...result.event, findings: result.findings }));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/events/:id
 * Update event status. Audited.
 */
router.patch('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const update = EventStatusUpdateSchema.parse(req.body);

    const current = await getEventById(req.params.id);
    if (!current) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (actor.role === 'agent' && current.event.agent_id !== actor.sub) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await withTransaction(async (client) => {
      const updated = await updateEventStatus(req.params.id, update.status, update.notes, client);
      if (!updated) throw Object.assign(new Error('Event not found'), { statusCode: 404 });

      await auditLog({
        actor: { id: actor.sub, role: actor.role },
        action: AuditActions.EVENT_STATUS,
        entityType: 'event',
        entityId: req.params.id,
        before: { status: current.event.status, notes: current.event.notes },
        after: { status: update.status, notes: update.notes ?? current.event.notes },
        req,
      }, client);
    });

    res.json({ success: true, id: req.params.id, status: update.status });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/events/:eventId/findings/:findingId
 * Update a finding's status. Audited.
 */
router.patch('/:eventId/findings/:findingId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const update = FindingStatusUpdateSchema.parse(req.body);

    if (actor.role === 'agent') {
      const event = await getEventById(req.params.eventId);
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      if (event.event.agent_id !== actor.sub) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    await withTransaction(async (client) => {
      const updated = await updateFindingStatus({
        id: req.params.findingId,
        status: update.status,
        dismissReason: update.dismissReason ?? null,
        dismissedBy: actor.sub,
      }, client);
      if (!updated) throw Object.assign(new Error('Finding not found'), { statusCode: 404 });

      await auditLog({
        actor: { id: actor.sub, role: actor.role },
        action: AuditActions.FINDING_STATUS,
        entityType: 'finding',
        entityId: req.params.findingId,
        before: null,
        after: { status: update.status, dismissReason: update.dismissReason ?? null, eventId: req.params.eventId },
        req,
      }, client);
    });

    res.json({ success: true, id: req.params.findingId, status: update.status });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/events
 * Bulk-delete ALL events and findings. Admin only. Used to clear test data.
 */
router.delete('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden — admin role required to bulk-delete events' });
      return;
    }
    const count = await deleteAllEvents();
    console.log(`[events] Bulk delete: ${count} event(s) cleared by admin ${actor.sub}`);
    res.json({ success: true, deleted: count });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/events/:id
 * Delete a single event and all its findings. Supervisor or admin only.
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    if (actor.role === 'agent') {
      res.status(403).json({ error: 'Forbidden — agents cannot delete events' });
      return;
    }
    const deleted = await deleteEvent(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    console.log(`[events] Deleted event ${req.params.id} by ${actor.role} ${actor.sub}`);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default router;
