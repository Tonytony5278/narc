import React from 'react';
import type { EventsFilter } from '../api/client';

interface FilterBarProps {
  filter: EventsFilter;
  onChange: (f: EventsFilter) => void;
  total: number;
}

const inputBase: React.CSSProperties = {
  padding: '7px 10px',
  border: '1.5px solid var(--border)',
  borderRadius: 7,
  fontSize: 13,
  background: '#fff',
  color: 'var(--text-primary)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  outline: 'none',
  width: '100%',
};

const labelBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 5,
  display: 'block',
};

function focusStyle(e: React.FocusEvent<HTMLElement>) {
  (e.target as HTMLElement).style.borderColor = 'var(--brand)';
  (e.target as HTMLElement).style.boxShadow   = '0 0 0 3px rgba(155,35,53,0.1)';
}
function blurStyle(e: React.FocusEvent<HTMLElement>) {
  (e.target as HTMLElement).style.borderColor = 'var(--border)';
  (e.target as HTMLElement).style.boxShadow   = 'none';
}

export default function FilterBar({ filter, onChange, total }: FilterBarProps) {
  const update = (key: keyof EventsFilter, value: string) =>
    onChange({ ...filter, [key]: value || undefined, offset: 0 });

  const hasFilters = !!(filter.search || filter.status || filter.severity || filter.category || filter.from || filter.to);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px 20px',
      marginBottom: 16,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>

        {/* Search */}
        <div style={{ flex: '1 1 220px', minWidth: 180 }}>
          <label style={labelBase}>Search</label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: '#A0AEC0', fontSize: 13, pointerEvents: 'none',
            }}>🔍</span>
            <input
              type="text"
              placeholder="Subject, sender, or body…"
              value={filter.search ?? ''}
              onChange={(e) => update('search', e.target.value)}
              onFocus={focusStyle} onBlur={blurStyle}
              style={{ ...inputBase, paddingLeft: 32 }}
            />
          </div>
        </div>

        {/* Status */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelBase}>Status</label>
          <select
            value={filter.status ?? ''}
            onChange={(e) => update('status', e.target.value)}
            onFocus={focusStyle} onBlur={blurStyle}
            style={{ ...inputBase, width: 'auto', paddingRight: 28, cursor: 'pointer', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23A0AEC0'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
            }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="reported">Reported</option>
            <option value="dismissed">Dismissed</option>
            <option value="escalated">Escalated</option>
            <option value="false_positive">False Positive</option>
          </select>
        </div>

        {/* Severity */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelBase}>Severity</label>
          <select
            value={filter.severity ?? ''}
            onChange={(e) => update('severity', e.target.value)}
            onFocus={focusStyle} onBlur={blurStyle}
            style={{ ...inputBase, width: 'auto', paddingRight: 28, cursor: 'pointer', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23A0AEC0'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
            }}
          >
            <option value="">All severities</option>
            <option value="critical">🔴 Critical</option>
            <option value="high">🟠 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
        </div>

        {/* Category */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelBase}>Category</label>
          <select
            value={filter.category ?? ''}
            onChange={(e) => update('category', e.target.value)}
            onFocus={focusStyle} onBlur={blurStyle}
            style={{ ...inputBase, width: 'auto', paddingRight: 28, cursor: 'pointer', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23A0AEC0'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
            }}
          >
            <option value="">All categories</option>
            <option value="adverse_reaction">Adverse Reaction</option>
            <option value="serious_adverse_event">Serious AE</option>
            <option value="off_label_use">Off-Label Use</option>
            <option value="off_label_dosing">Off-Label Dosing</option>
            <option value="pregnancy_exposure">Pregnancy Exposure</option>
            <option value="drug_interaction">Drug Interaction</option>
            <option value="overdose">Overdose</option>
            <option value="medication_error">Medication Error</option>
          </select>
        </div>

        {/* Date range */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelBase}>From</label>
          <input
            type="date"
            value={filter.from ?? ''}
            onChange={(e) => update('from', e.target.value)}
            onFocus={focusStyle} onBlur={blurStyle}
            style={{ ...inputBase, width: 'auto' }}
          />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelBase}>To</label>
          <input
            type="date"
            value={filter.to ?? ''}
            onChange={(e) => update('to', e.target.value)}
            onFocus={focusStyle} onBlur={blurStyle}
            style={{ ...inputBase, width: 'auto' }}
          />
        </div>

        {/* Right side: count + clear */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasFilters && (
            <button
              onClick={() => onChange({})}
              style={{
                padding: '6px 12px', background: 'transparent',
                color: 'var(--text-muted)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 12, cursor: 'pointer',
                transition: 'color var(--transition), border-color var(--transition)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.borderColor = 'var(--brand)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              ✕ Clear filters
            </button>
          )}
          <div style={{
            fontSize: 13, color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '6px 12px',
          }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{total}</strong>
            {' '}event{total !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
