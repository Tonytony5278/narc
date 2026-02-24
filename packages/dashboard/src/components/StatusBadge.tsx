import React from 'react';

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending:         { label: 'Pending',         bg: '#FFF3CD', color: '#856404' },
  pending_review:  { label: 'Pending Review',  bg: '#FFF3CD', color: '#856404' },
  reviewed:        { label: 'Reviewed',        bg: '#D1ECF1', color: '#0C5460' },
  reported:        { label: 'Reported',        bg: '#D4EDDA', color: '#155724' },
  dismissed:       { label: 'Dismissed',       bg: '#F8F9FA', color: '#6C757D' },
  escalated:       { label: 'Escalated',       bg: '#F8D7DA', color: '#721C24' },
  false_positive:  { label: 'False Positive',  bg: '#E2E3E5', color: '#383D41' },
  on_track:        { label: 'On Track',        bg: '#D4EDDA', color: '#155724' },
  at_risk:         { label: 'At Risk',         bg: '#FFF3CD', color: '#856404' },
  breached:        { label: 'Breached',        bg: '#F8D7DA', color: '#721C24' },
  met:             { label: 'Met',             bg: '#D4EDDA', color: '#155724' },
  transcription_failed: { label: 'Failed',     bg: '#F8D7DA', color: '#721C24' },
};

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  low:      { label: 'Low',      bg: '#E2F0CB', color: '#3D6B22' },
  medium:   { label: 'Medium',   bg: '#FFF3CD', color: '#856404' },
  high:     { label: 'High',     bg: '#FFE0B2', color: '#BF360C' },
  critical: { label: 'Critical', bg: '#FFCDD2', color: '#B71C1C' },
};

interface StatusBadgeProps {
  value: string;
  type: 'status' | 'severity';
  small?: boolean;
}

export default function StatusBadge({ value, type, small = false }: StatusBadgeProps) {
  const config =
    type === 'status'
      ? STATUS_CONFIG[value] ?? { label: value, bg: '#E2E3E5', color: '#383D41' }
      : SEVERITY_CONFIG[value] ?? { label: value, bg: '#E2E3E5', color: '#383D41' };

  return (
    <span
      style={{
        display: 'inline-block',
        padding: small ? '2px 6px' : '3px 10px',
        borderRadius: 12,
        fontSize: small ? 11 : 12,
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.color,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}
