/**
 * Regulatory Submissions Page
 *
 * Dedicated workspace for Compliance Officers and Regulatory Affairs staff.
 * Shows cases that have been through PV triage and are confirmed for regulatory
 * review — i.e., events with status 'reported' or 'escalated'.
 *
 * From here, compliance staff can:
 *   • Review confirmed adverse event findings
 *   • Open the E2B(R3) MedDRA coding workflow
 *   • Download ICH E2B(R3) XML for submission to FDA FAERS / Health Canada MedEffect
 *
 * The E2B export tab inside EventDetailModal is visible because this page is
 * restricted to admin / supervisor roles.
 */

import React, { useState } from 'react';
import EventsTable from '../components/EventsTable';
import { useEvents } from '../hooks/useEvents';

interface RegulatoryPageProps {
  userRole: string;
}

const STATUS_OPTIONS = [
  { value: 'reported',  label: 'Reported' },
  { value: 'escalated', label: 'Escalated' },
] as const;

type StatusFilter = 'reported' | 'escalated' | 'all';

export default function RegulatoryPage({ userRole }: RegulatoryPageProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('reported');

  const filter = statusFilter === 'all' ? {} : { status: statusFilter };
  const { events, total, loading, error, refresh, updateStatus } = useEvents(filter);

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
            }}>
              Regulatory Submissions
            </h1>
            <p style={{
              margin: '5px 0 0',
              fontSize: 13,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              maxWidth: 560,
            }}>
              Confirmed adverse event cases ready for ICH E2B(R3) coding and regulatory submission.
              Open any case to review MedDRA terms and download the XML report.
            </p>
          </div>

          {/* Info pill */}
          <div style={{
            padding: '7px 14px',
            background: '#EBF4FF',
            border: '1px solid #BEE3F8',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: '#1E4D6B',
            fontWeight: 500,
          }}>
            E2B(R3) · MedDRA Coding · Compliance Review
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ marginTop: 20, borderBottom: '1px solid var(--border)' }} />
      </div>

      {/* ── Status filter tabs ── */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--border)',
        marginBottom: 20,
      }}>
        {([...STATUS_OPTIONS, { value: 'all' as const, label: 'All Confirmed' }]).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            style={{
              padding: '8px 18px',
              background: 'none',
              border: 'none',
              borderBottom: statusFilter === value ? '2px solid var(--brand)' : '2px solid transparent',
              color: statusFilter === value ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: statusFilter === value ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'color var(--transition)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: 'var(--danger-bg)',
          border: '1px solid #FECACA',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          marginBottom: 16,
          color: 'var(--danger)',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>Something went wrong loading cases.</span>
          <button onClick={refresh} style={{
            background: 'none', border: 'none', color: 'var(--danger)',
            textDecoration: 'underline', cursor: 'pointer', fontSize: 13, marginLeft: 'auto',
          }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Count strip ── */}
      {!loading && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span>
            <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{total}</strong>
            {' '}case{total !== 1 ? 's' : ''} pending E2B review
          </span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span>Click any case to open the E2B Export tab and begin MedDRA coding.</span>
        </div>
      )}

      {/* ── Cases table (reuses EventsTable — E2B tab visible for admin/supervisor) ── */}
      <EventsTable
        events={events}
        loading={loading}
        onStatusChange={updateStatus}
        onDelete={() => refresh()}
        userRole={userRole}
        defaultTab="e2b"
      />
    </div>
  );
}
