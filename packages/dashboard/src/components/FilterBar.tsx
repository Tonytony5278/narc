import React from 'react';
import type { EventsFilter } from '../api/client';

interface FilterBarProps {
  filter: EventsFilter;
  onChange: (f: EventsFilter) => void;
  total: number;
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #CBD5E0',
  borderRadius: 6,
  fontSize: 13,
  background: '#fff',
  color: '#1a1a2e',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#718096',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
  display: 'block',
};

export default function FilterBar({ filter, onChange, total }: FilterBarProps) {
  const update = (key: keyof EventsFilter, value: string) => {
    onChange({ ...filter, [key]: value || undefined, offset: 0 });
  };

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        gap: 20,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      {/* Search */}
      <div style={{ flex: '1 1 200px', minWidth: 160 }}>
        <label style={labelStyle}>Search</label>
        <input
          type="text"
          placeholder="Subject, sender, or body…"
          value={filter.search ?? ''}
          onChange={(e) => update('search', e.target.value)}
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>

      {/* Status filter */}
      <div>
        <label style={labelStyle}>Status</label>
        <select
          value={filter.status ?? ''}
          onChange={(e) => update('status', e.target.value)}
          style={inputStyle}
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

      {/* Severity filter */}
      <div>
        <label style={labelStyle}>Severity</label>
        <select
          value={filter.severity ?? ''}
          onChange={(e) => update('severity', e.target.value)}
          style={inputStyle}
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Category filter */}
      <div>
        <label style={labelStyle}>AE Category</label>
        <select
          value={filter.category ?? ''}
          onChange={(e) => update('category', e.target.value)}
          style={inputStyle}
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
      <div>
        <label style={labelStyle}>From</label>
        <input
          type="date"
          value={filter.from ?? ''}
          onChange={(e) => update('from', e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>To</label>
        <input
          type="date"
          value={filter.to ?? ''}
          onChange={(e) => update('to', e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Result count */}
      <div style={{ marginLeft: 'auto', fontSize: 13, color: '#718096', whiteSpace: 'nowrap' }}>
        <strong style={{ color: '#1a1a2e' }}>{total}</strong> event{total !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
