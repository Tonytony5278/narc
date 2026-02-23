import cron from 'node-cron';
import { getOpenEventsForSla, updateEventSla } from '../db/queries/events';
import { computeSlaStatus, RESOLVED_STATUSES } from '../services/sla';
import { auditLog } from '../services/audit';
import { sendSLAAlert } from '../services/alertService';
import { AuditActions } from '@narc/shared';

/** System actor used for automated SLA escalation audit entries */
const SYSTEM_ACTOR = {
  id: '00000000-0000-0000-0000-000000000001',
  role: 'system',
};

/**
 * Evaluate SLA status for all open events and escalate as needed.
 * Called every minute by the cron job.
 */
async function tickSla(): Promise<void> {
  const events = await getOpenEventsForSla();

  for (const event of events) {
    const isResolved = RESOLVED_STATUSES.has(event.status);
    const { sla_status, escalation_level } = computeSlaStatus(
      new Date(event.detected_at),
      new Date(event.deadline_at),
      isResolved
    );

    if (sla_status !== event.sla_status || escalation_level !== event.escalation_level) {
      await updateEventSla(event.id, sla_status, escalation_level);

      await auditLog({
        actor: SYSTEM_ACTOR,
        action: AuditActions.SLA_ESCALATION,
        entityType: 'event',
        entityId: event.id,
        before: { sla_status: event.sla_status, escalation_level: event.escalation_level },
        after:  { sla_status, escalation_level },
      });

      if (sla_status === 'breached') {
        console.warn(
          `[SLA] 🚨 Event ${event.id} BREACHED SLA (${event.max_severity} severity)`
        );
      } else if (sla_status === 'at_risk') {
        console.warn(
          `[SLA] ⚠️  Event ${event.id} AT RISK — escalation level ${escalation_level} (${event.max_severity})`
        );
      }

      // Send email alert on SLA status changes (at_risk or breached)
      sendSLAAlert({
        eventId: event.id,
        subject: '(see dashboard)',   // subject not stored in SLA query — link to dashboard
        sender: '',
        maxSeverity: event.max_severity,
        deadlineAt: event.deadline_at instanceof Date
          ? event.deadline_at.toISOString()
          : String(event.deadline_at),
        escalationLevel: escalation_level,
        previousStatus: event.sla_status,
        newStatus: sla_status,
      }).catch((err) => console.error('[SLA] Alert error:', err));
    }
  }
}

/**
 * Start the SLA background worker.
 * Runs every minute and updates event sla_status + escalation_level.
 */
export function startSlaWorker(): void {
  cron.schedule('* * * * *', async () => {
    try {
      await tickSla();
    } catch (err) {
      console.error('[SLA Worker] Error during tick:', err);
    }
  });
  console.log('✅ SLA worker started (1-minute tick)');
}
