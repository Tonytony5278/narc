/**
 * Canonical audit action strings used across the platform.
 * Stored in audit_log.action — must remain stable across versions.
 */
export const AuditActions = {
  // Authentication
  LOGIN:             'auth.login',
  LOGIN_FAILED:      'auth.login_failed',

  // AE Analysis
  ANALYZE_EMAIL:     'analyze.email',

  // Event lifecycle
  EVENT_STATUS:      'event.status_change',
  FINDING_STATUS:    'finding.status_change',

  // Policy governance
  POLICY_CREATED:    'policy.created',
  POLICY_ACTIVATED:  'policy.activated',
  RULE_CREATED:      'policy.rule_created',

  // Documents
  DOCUMENT_UPLOAD:   'document.upload',

  // Case submission
  CASE_PACKET:       'case.packet_generated',
  CASE_SUBMIT:       'case.submit',

  // SLA (system actor)
  SLA_ESCALATION:    'sla.escalation',

  // User management (admin actor)
  USER_CREATED:      'user.created',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_DEACTIVATED:  'user.deactivated',
  USER_ACTIVATED:    'user.activated',

  // Drug monographs
  MONOGRAPH_UPDATED: 'monograph.updated',
  MONOGRAPH_CREATED: 'monograph.created',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];
