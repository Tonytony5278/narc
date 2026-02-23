import React, { useState } from 'react';
import type { MonographSummary } from '../../utils/api';

interface MonographCardProps {
  monograph: MonographSummary;
}

export default function MonographCard({ monograph }: MonographCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      margin: '8px 12px',
      border: '1px solid #BEE3F8',
      borderLeft: '4px solid #2B6CB0',
      borderRadius: 8,
      background: '#EBF4FF',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>
            📋 {monograph.brand_name}
            <span style={{ fontWeight: 400, color: '#4A5568', marginLeft: 4 }}>({monograph.generic_name})</span>
          </div>
          <div style={{ fontSize: 10, color: '#2B6CB0', marginTop: 1 }}>Health Canada monograph context active</div>
        </div>
        <span style={{ fontSize: 14, color: '#718096', userSelect: 'none' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 12px 10px', borderTop: '1px solid #BEE3F8' }}>
          {/* Approved dosing */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#2B6CB0', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Approved Dosing
            </div>
            {Object.entries(monograph.approved_dosing).map(([k, v]) => (
              <div key={k} style={{ fontSize: 11, color: '#4A5568', marginBottom: 2 }}>
                <strong style={{ color: '#1a1a2e' }}>{k}:</strong> {v}
              </div>
            ))}
            {monograph.max_daily_dose && (
              <div style={{ fontSize: 11, color: '#4A5568', marginTop: 2 }}>
                <strong style={{ color: '#1a1a2e' }}>Max daily dose:</strong> {monograph.max_daily_dose}
              </div>
            )}
          </div>

          {/* Off-label signals */}
          {monograph.off_label_signals.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#C53030', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                Off-Label Signals to Watch
              </div>
              {monograph.off_label_signals.map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: '#744210', background: '#FFFBEA', border: '1px solid #F6E05E', borderRadius: 4, padding: '3px 7px', marginBottom: 4, lineHeight: 1.4 }}>
                  ⚠ {s.flag}
                </div>
              ))}
            </div>
          )}

          {/* DIN */}
          {monograph.din && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#718096' }}>
              Health Canada DIN: <strong>{monograph.din}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
