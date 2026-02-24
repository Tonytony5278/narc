import React from 'react';

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string; dot?: string }> = {
  // ── Case statuses ──
  pending:              { label: 'Pending',         bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#D97706' },
  pending_review:       { label: 'Pending Review',  bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#D97706' },
  reviewed:             { label: 'Reviewed',        bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0', dot: '#10B981' },
  reported:             { label: 'Reported',        bg: '#D1FAE5', color: '#064E3B', border: '#6EE7B7', dot: '#059669' },
  dismissed:            { label: 'Dismissed',       bg: '#F9FAFB', color: '#6B7280', border: '#E5E7EB', dot: '#9CA3AF' },
  escalated:            { label: 'Escalated',       bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', dot: '#EF4444' },
  false_positive:       { label: 'False Positive',  bg: '#F3F4F6', color: '#4B5563', border: '#D1D5DB', dot: '#9CA3AF' },
  // ── SLA / call statuses (added by Copilot post-call pipeline) ──
  on_track:             { label: 'On Track',        bg: '#D1FAE5', color: '#064E3B', border: '#6EE7B7', dot: '#059669' },
  at_risk:              { label: 'At Risk',         bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#D97706' },
  breached:             { label: 'Breached',        bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', dot: '#EF4444' },
  met:                  { label: 'Met',             bg: '#D1FAE5', color: '#064E3B', border: '#6EE7B7', dot: '#059669' },
  transcription_failed: { label: 'Failed',          bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', dot: '#EF4444' },
};

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; color: string; border: string; dot?: string; pulse?: boolean }> = {
  low:      { label: 'Low',      bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0', dot: '#10B981' },
  medium:   { label: 'Medium',   bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#D97706' },
  high:     { label: 'High',     bg: '#FFF7ED', color: '#9A3412', border: '#FDBA74', dot: '#EA580C' },
  critical: { label: 'Critical', bg: '#FEF2F2', color: '#7F1D1D', border: '#FECACA', dot: '#DC2626', pulse: true },
};

interface StatusBadgeProps {
  value: string;
  type: 'status' | 'severity';
  small?: boolean;
}

export default function StatusBadge({ value, type, small = false }: StatusBadgeProps) {
  const config =
    type === 'status'
      ? STATUS_CONFIG[value]   ?? { label: value, bg: '#F3F4F6', color: '#4B5563', border: '#D1D5DB', dot: '#9CA3AF' }
      : SEVERITY_CONFIG[value] ?? { label: value, bg: '#F3F4F6', color: '#4B5563', border: '#D1D5DB', dot: '#9CA3AF' };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: small ? 4 : 5,
      padding: small ? '2px 7px' : '4px 10px',
      borderRadius: 20,
      fontSize: small ? 11 : 12,
      fontWeight: 600,
      backgroundColor: config.bg,
      color: config.color,
      border: `1px solid ${config.border}`,
      whiteSpace: 'nowrap',
      lineHeight: 1.4,
    }}>
      {config.dot && (
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          {(config as typeof SEVERITY_CONFIG[string]).pulse && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: config.dot,
              animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
              opacity: 0.6,
            }} />
          )}
          <span style={{
            width: small ? 5 : 6, height: small ? 5 : 6,
            borderRadius: '50%',
            background: config.dot,
            display: 'inline-block',
            position: 'relative',
          }} />
        </span>
      )}
      {config.label}
    </span>
  );
}
