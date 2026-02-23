import { Router, Request, Response, NextFunction } from 'express';
import { buildCasePacket } from '../services/casePacket';
import { generateE2BData } from '../services/e2b';
import { insertSubmission, getSubmissionsByEvent } from '../db/queries/submissions';
import { updateEventStatus } from '../db/queries/events';
import { auditLog } from '../services/audit';
import { withTransaction } from '../db/pool';
import { AuditActions } from '@narc/shared';

const router = Router();

/**
 * POST /api/cases/:eventId/packet
 * Generate a full case packet (event + findings + documents + audit trail).
 * Requires supervisor or admin role.
 */
router.post('/:eventId/packet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const actor = req.actor!;

    const packet = await buildCasePacket(eventId, actor);

    await auditLog({
      actor: { id: actor.sub, role: actor.role },
      action: AuditActions.CASE_PACKET,
      entityType: 'event',
      entityId: eventId,
      before: null,
      after: { exportedBy: actor.email, findingCount: packet.findings.length },
      req,
    });

    res.json(packet);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cases/:eventId/submit
 * Submit the case to the safety mailbox.
 * Marks event as 'reported'. Records submission. Requires supervisor or admin.
 */
router.post('/:eventId/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const actor = req.actor!;
    const destination = (req.body.destination as string | undefined) ?? 'safety-mailbox@narc.local';

    // Build the case packet that will be stored with the submission
    const packet = await buildCasePacket(eventId, actor);

    const submissionId = await withTransaction(async (client) => {
      // Insert submission record
      const id = await insertSubmission({
        eventId,
        submittedBy: actor.sub,
        destination,
        packetJson: packet as object,
      }, client);

      // Mark event as reported
      await updateEventStatus(eventId, 'reported', undefined, client);

      await auditLog({
        actor: { id: actor.sub, role: actor.role },
        action: AuditActions.CASE_SUBMIT,
        entityType: 'event',
        entityId: eventId,
        before: { status: packet.event.status },
        after: { status: 'reported', submissionId: id, destination },
        req,
      }, client);

      return id;
    });

    res.status(201).json({
      submissionId,
      eventId,
      destination,
      status: 'sent',
      submittedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cases/:eventId/submissions
 * List all submissions for an event.
 */
router.get('/:eventId/submissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const submissions = await getSubmissionsByEvent(eventId);
    res.json({ submissions, total: submissions.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cases/:eventId/e2b
 * Generate E2B(R3) report data with AI-suggested MedDRA terms.
 * Claude suggests MedDRA PT/HLT/HLGT/SOC for each finding.
 * ⚠️  All AI-suggested codes must be confirmed by a qualified person before regulatory submission.
 */
router.get('/:eventId/e2b', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const actor = req.actor!;

    const e2bData = await generateE2BData(eventId);

    await auditLog({
      actor: { id: actor.sub, role: actor.role },
      action: AuditActions.E2B_PREPARE,
      entityType: 'event',
      entityId: eventId,
      before: null,
      after: {
        findingCount: e2bData.findings.length,
        meddraVersion: e2bData.meddraVersion,
        generatedAt: e2bData.generatedAt,
      },
      req,
    });

    res.json(e2bData);
  } catch (err) {
    next(err);
  }
});

export default router;
