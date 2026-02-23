import React, { useState } from 'react';
import type { AEFindingRecord } from '@narc/shared';
import { updateFindingStatus } from '../../utils/api';

const CATEGORY_LABELS: Record<string, string> = {
  adverse_reaction: 'Adverse Reaction',
  off_label_use: 'Off-Label Use',
  off_label_dosing: 'Off-Label Dosing',
  pregnancy_exposure: 'Pregnancy Exposure',
  drug_interaction: 'Drug Interaction',
  serious_adverse_event: 'Serious AE',
  overdose: 'Overdose',
  medication_error: 'Medication Error',
};

const CATEGORY_COLORS: Record<string, string> = {
  adverse_reaction: '#C45000',
  off_label_use: '#6A1B9A',
  off_label_dosing: '#4A148C',
  pregnancy_exposure: '#880E4F',
  drug_interaction: '#1565C0',
  serious_adverse_event: '#7B0000',
  overdose: '#4A0000',
  medication_error: '#2E5A1C',
};

// Severity color scale: black → maroon → orange → amber/yellow
const SEVERITY_STRIPE: Record<string, string> = {
  critical: '#000000',  // Black — death / life-threatening
  high:     '#7B0000',  // Dark maroon — serious, hospitalisation
  medium:   '#C45000',  // Burnt orange — moderate
  low:      '#B07A00',  // Dark amber/yellow — minor
};

const SEVERITY_LABEL_BG: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#000000', text: '#fff' },
  high:     { bg: '#7B0000', text: '#fff' },
  medium:   { bg: '#C45000', text: '#fff' },
  low:      { bg: '#B07A00', text: '#fff' },
};

const URGENCY_LABELS: Record<string, string> = {
  immediate:    '🚨 Report immediately',
  within_24h:   '⚡ Report within 24h',
  within_7_days:'📋 Report within 7 days',
  routine:      '📝 Routine report',
};

interface AECardProps {
  finding: AEFindingRecord;
  eventId: string;
  index: number;
}

export default function AECard({ finding, eventId, index }: AECardProps) {
  const [status, setStatus] = useState(finding.status);
  const [actionLoading, setActionLoading] = useState(false);

  const isDismissed = status === 'dismissed';
  const isReported  = status === 'reported';

  const stripeColor = SEVERITY_STRIPE[finding.severity] ?? '#718096';
  const severityLabel = SEVERITY_LABEL_BG[finding.severity] ?? { bg: '#718096', text: '#fff' };

  const handleAction = async (newStatus: 'reported' | 'dismissed') => {
    setActionLoading(true);
    try {
      await updateFindingStatus(eventId, finding.id, newStatus);
      setStatus(newStatus);
    } catch (err) {
      console.error('Failed to update finding:', err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        border: '1px solid #E2E8F0',
        borderLeft: `5px solid ${stripeColor}`,
        borderRadius: 8,
        marginBottom: 10,
        overflow: 'hidden',
        opacity: isDismissed ? 0.38 : 1,
        transition: 'opacity 0.25s ease',
        background: '#fff',
      }}
    >
      {/* Main card body */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Card header: category + severity */}
        <div
          style={{
            padding: '7px 12px',
            background: '#F7FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#718096', fontWeight: 700 }}>#{index + 1}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 10,
                background: CATEGORY_COLORS[finding.category] ?? '#718096',
                color: '#fff',
                letterSpacing: '0.01em',
              }}
            >
              {CATEGORY_LABELS[finding.category] ?? finding.category}
            </span>
          </div>

          {/* Severity badge */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 4,
              background: severityLabel.bg,
              color: severityLabel.text,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {finding.severity}
          </span>
        </div>

        {/* Highlighted excerpt — verbatim text in yellow */}
        <div
          style={{
            padding: '9px 12px',
            background: '#FFFBEA',
            borderBottom: '1px solid #FAF089',
          }}
        >
          <blockquote
            style={{
              margin: 0,
              paddingLeft: 10,
              borderLeft: `3px solid ${stripeColor}`,
              fontSize: 12,
              color: '#5D4037',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            "{finding.excerpt}"
          </blockquote>
        </div>

        {/* Explanation */}
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: '#4A5568', lineHeight: 1.5 }}>
          {finding.explanation}
        </div>

        {/* Urgency + confidence footer */}
        <div
          style={{
            padding: '5px 12px',
            background: '#F7FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 10.5,
            color: '#718096',
          }}
        >
          <span>{URGENCY_LABELS[finding.urgency] ?? finding.urgency}</span>
          <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
        </div>

        {/* Action buttons */}
        {!isDismissed && !isReported && (
          <div style={{ padding: '7px 12px', display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleAction('reported')}
              disabled={actionLoading}
              style={{
                flex: 1,
                padding: '5px 10px',
                background: '#1B5E20',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                opacity: actionLoading ? 0.6 : 1,
              }}
            >
              ✓ Report
            </button>
            <button
              onClick={() => handleAction('dismissed')}
              disabled={actionLoading}
              style={{
                flex: 1,
                padding: '5px 10px',
                background: '#fff',
                color: '#718096',
                border: '1px solid #CBD5E0',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer',
                opacity: actionLoading ? 0.6 : 1,
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Reported confirmation */}
        {isReported && (
          <div
            style={{
              padding: '7px 12px',
              background: '#F0FFF4',
              fontSize: 11.5,
              color: '#276749',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ✓ Reported to pharmacovigilance
          </div>
        )}
      </div>
    </div>
  );
}
