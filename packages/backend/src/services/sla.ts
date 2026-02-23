/**
 * SLA Engine
 *
 * Deadline offsets (from detected_at):
 *   critical → 1 hour
 *   high     → 4 hours
 *   medium   → 24 hours
 *   low      → 7 days
 *
 * Escalation thresholds (% of total deadline elapsed):
 *   0–50%    → on_track  / level 0
 *   50–75%   → at_risk   / level 1
 *   75–100%  → at_risk   / level 2
 *   >100%    → breached  / level 3
 *
 * Resolved events (reviewed, reported, dismissed, false_positive)
 * immediately transition to → met / level 0
 */

const SLA_DEADLINES_MS: Record<string, number> = {
  critical: 1  * 60 * 60 * 1_000,          // 1 hour
  high:     4  * 60 * 60 * 1_000,          // 4 hours
  medium:   24 * 60 * 60 * 1_000,          // 24 hours
  low:      7  * 24 * 60 * 60 * 1_000,     // 7 days
};

export const RESOLVED_STATUSES = new Set([
  'reviewed', 'reported', 'dismissed', 'false_positive',
]);

export function computeDeadline(severity: string, detectedAt: Date): Date {
  const ms = SLA_DEADLINES_MS[severity] ?? SLA_DEADLINES_MS.low;
  return new Date(detectedAt.getTime() + ms);
}

export interface SlaResult {
  sla_status: 'on_track' | 'at_risk' | 'breached' | 'met';
  escalation_level: 0 | 1 | 2 | 3;
}

export function computeSlaStatus(
  detectedAt: Date,
  deadlineAt: Date,
  isResolved: boolean,
  now: Date = new Date()
): SlaResult {
  if (isResolved) return { sla_status: 'met', escalation_level: 0 };

  const total   = deadlineAt.getTime() - detectedAt.getTime();
  const elapsed = now.getTime() - detectedAt.getTime();
  const pct     = elapsed / total;

  if (pct >= 1.0) return { sla_status: 'breached', escalation_level: 3 };
  if (pct >= 0.75) return { sla_status: 'at_risk',  escalation_level: 2 };
  if (pct >= 0.50) return { sla_status: 'at_risk',  escalation_level: 1 };
  return { sla_status: 'on_track', escalation_level: 0 };
}
