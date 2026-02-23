import React, { useState, useEffect, memo } from 'react';

interface SlaTimerProps {
  deadlineAt: string | null;
  slaStatus: string;
  small?: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  on_track: { bg: '#F0FFF4', text: '#276749', border: '#9AE6B4' },
  at_risk:  { bg: '#FFFBEB', text: '#B7791F', border: '#F6E05E' },
  breached: { bg: '#FFF5F5', text: '#C53030', border: '#FC8181' },
  met:      { bg: '#F7FAFC', text: '#718096', border: '#CBD5E0' },
};

function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const past = ms < 0;

  const secs = Math.floor(abs / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let str: string;
  if (days > 0) str = `${days}d ${hours % 24}h`;
  else if (hours > 0) str = `${hours}h ${mins % 60}m`;
  else if (mins > 0) str = `${mins}m ${secs % 60}s`;
  else str = `${secs}s`;

  return past ? `${str} overdue` : `${str} left`;
}

const SlaTimer = memo(function SlaTimer({ deadlineAt, slaStatus, small = false }: SlaTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (slaStatus === 'met') return; // no need to tick
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [slaStatus]);

  const colors = STATUS_COLORS[slaStatus] ?? STATUS_COLORS.on_track;

  if (slaStatus === 'met') {
    return (
      <span style={{
        fontSize: small ? 11 : 12,
        padding: small ? '2px 6px' : '3px 8px',
        borderRadius: 10,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}>
        ✓ Met
      </span>
    );
  }

  if (!deadlineAt) {
    return <span style={{ fontSize: 11, color: '#A0AEC0' }}>—</span>;
  }

  const deadline = new Date(deadlineAt).getTime();
  const remaining = deadline - now;
  const label = formatDuration(remaining);

  return (
    <span style={{
      fontSize: small ? 11 : 12,
      padding: small ? '2px 6px' : '3px 8px',
      borderRadius: 10,
      background: colors.bg,
      color: colors.text,
      border: `1px solid ${colors.border}`,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {slaStatus === 'breached' ? '⚠ ' : ''}{label}
    </span>
  );
});

export default SlaTimer;
