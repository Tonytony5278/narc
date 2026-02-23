import React from 'react';

interface BadgeProps {
  count: number;
  maxSeverity?: string;
  summary?: string;
}

// Color scale: black = death/critical, down to yellow = minor
export const SEVERITY_PALETTE: Record<string, { bg: string; border: string; label: string; text: string }> = {
  critical: { bg: '#0D0D0D', border: '#000000', label: 'CRITICAL', text: '#fff' },
  high:     { bg: '#7B0000', border: '#4A0000', label: 'HIGH',     text: '#fff' },
  medium:   { bg: '#C45000', border: '#8B3800', label: 'MEDIUM',   text: '#fff' },
  low:      { bg: '#B07A00', border: '#7A5500', label: 'LOW',      text: '#fff' },
};

export default function Badge({ count, maxSeverity = 'low', summary }: BadgeProps) {
  if (count === 0) return null;

  const palette = SEVERITY_PALETTE[maxSeverity] ?? SEVERITY_PALETTE.low;

  return (
    <div
      style={{
        background: palette.bg,
        borderBottom: `4px solid ${palette.border}`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: palette.text,
      }}
    >
      {/* Count circle */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)',
          border: '2px solid rgba(255,255,255,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {count}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.01em' }}>
            {count} potential AE{count !== 1 ? 's' : ''} detected
          </span>
          {/* Severity pill */}
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.2)',
              letterSpacing: '0.08em',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            {palette.label}
          </span>
        </div>
        {summary && (
          <div style={{ fontSize: 11, opacity: 0.82, marginTop: 3, lineHeight: 1.4 }}>
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}
