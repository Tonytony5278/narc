import React, { useState } from 'react';
import type { EventRecord } from '@narc/shared';
import StatusBadge from './StatusBadge';
import SlaTimer from './SlaTimer';
import EventDetailModal from './EventDetailModal';
import { deleteEvent } from '../api/client';

interface EventsTableProps {
  events: EventRecord[];
  loading: boolean;
  onStatusChange: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
  userRole?: string;
  /** Tab to open by default when a case is clicked (e.g. 'e2b' on Regulatory page) */
  defaultTab?: string;
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: '#C53030',
  high:     '#C25000',
  medium:   '#D69E2E',
  low:      '#48BB78',
};

const SEVERITY_ROW_BG: Record<string, string> = {
  critical: 'rgba(197,48,48,0.03)',
  high:     'rgba(194,80,0,0.025)',
  medium:   '',
  low:      '',
};

function SkeletonRow() {
  const shimmer: React.CSSProperties = {
    background: 'linear-gradient(90deg, #EDF2F7 25%, #E2E8F0 50%, #EDF2F7 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    borderRadius: 4,
    display: 'inline-block',
  };
  return (
    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
      <td style={{ padding: '13px 16px' }}><span style={{ ...shimmer, width: 64, height: 12, marginBottom: 4 }} /><br /><span style={{ ...shimmer, width: 40, height: 10 }} /></td>
      <td style={{ padding: '13px 16px' }}><span style={{ ...shimmer, width: 110, height: 12 }} /></td>
      <td style={{ padding: '13px 16px' }}><span style={{ ...shimmer, width: 180, height: 12 }} /></td>
      <td style={{ padding: '13px 16px', textAlign: 'center' }}><span style={{ ...shimmer, width: 24, height: 24, borderRadius: '50%' }} /></td>
      <td style={{ padding: '13px 16px' }}><span style={{ ...shimmer, width: 60, height: 20, borderRadius: 10 }} /></td>
      <td style={{ padding: '13px 16px' }}><span style={{ ...shimmer, width: 70, height: 14 }} /></td>
      <td style={{ padding: '13px 16px' }}><span style={{ ...shimmer, width: 66, height: 20, borderRadius: 10 }} /></td>
      <td style={{ padding: '13px 16px' }}><span style={{ ...shimmer, width: 50, height: 28, borderRadius: 6 }} /></td>
    </tr>
  );
}

export default function EventsTable({ events, loading, onStatusChange, onDelete, userRole, defaultTab }: EventsTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const canDelete = userRole === 'supervisor' || userRole === 'admin';

  const handleDelete = async (e: React.MouseEvent, event: EventRecord) => {
    e.stopPropagation();
    if (!confirm(`Delete event "${event.subject || '(no subject)'}"? This cannot be undone.`)) return;
    setDeletingId(event.id);
    try {
      await deleteEvent(event.id);
      onDelete?.(event.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                {['Received', 'Sender', 'Subject', 'AEs', 'Severity', 'SLA', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1,2,3,4,5,6].map(i => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '64px 20px',
        background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, #D4EDDA, #C3E6CB)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, margin: '0 auto 16px',
        }}>✓</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
          No events found
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, margin: '0 auto' }}>
          No adverse events match your current filters. Adjust the filters above or wait for new reports.
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .event-row { transition: background 0.1s; }
        .event-row:hover .view-btn { opacity: 1 !important; }
      `}</style>

      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
              {['Received', 'Sender', 'Subject', 'AEs', 'Severity', 'SLA', 'Status', 'Actions'].map((h) => (
                <th key={h} style={{
                  padding: '10px 16px', textAlign: 'left',
                  fontWeight: 600, color: 'var(--text-muted)',
                  fontSize: 11, textTransform: 'uppercase',
                  letterSpacing: '0.05em', whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const ext = event as EventRecord & {
                slaStatus?: string;
                deadlineAt?: string | null;
                escalationLevel?: number;
              };
              const isHovered = hoveredId === event.id;
              const severityBorder = SEVERITY_BORDER[event.maxSeverity] ?? '#E2E8F0';
              const rowBg = isHovered
                ? 'var(--bg-subtle)'
                : SEVERITY_ROW_BG[event.maxSeverity] ?? '';

              return (
                <tr
                  key={event.id}
                  className="event-row"
                  onClick={() => setSelectedEvent(event)}
                  onMouseEnter={() => setHoveredId(event.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    borderBottom: '1px solid var(--border-light)',
                    cursor: 'pointer',
                    background: rowBg,
                    borderLeft: `3px solid ${severityBorder}`,
                    transition: 'background 0.1s',
                  }}
                >
                  {/* Received */}
                  <td style={{ padding: '12px 14px 12px 13px', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {new Date(event.receivedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {new Date(event.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>

                  {/* Sender */}
                  <td style={{ padding: '12px 16px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {event.sender ? event.sender.replace(/<.*>/, '').trim() || event.sender : '—'}
                    </div>
                  </td>

                  {/* Subject */}
                  <td style={{ padding: '12px 16px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {event.subject || <em style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(no subject)</em>}
                    </span>
                  </td>

                  {/* AE count badge */}
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 24, height: 24, borderRadius: 6,
                      background: event.aeCount > 0
                        ? (event.maxSeverity === 'critical' ? '#FED7D7' : event.maxSeverity === 'high' ? '#FEEBC8' : '#E9D8FD')
                        : 'var(--border)',
                      color: event.aeCount > 0
                        ? (event.maxSeverity === 'critical' ? '#C53030' : event.maxSeverity === 'high' ? '#C25000' : '#553C9A')
                        : 'var(--text-muted)',
                      fontWeight: 700, fontSize: 12, padding: '0 5px',
                    }}>
                      {event.aeCount}
                    </span>
                  </td>

                  {/* Severity */}
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge value={event.maxSeverity} type="severity" small />
                  </td>

                  {/* SLA */}
                  <td style={{ padding: '12px 16px' }}>
                    <SlaTimer deadlineAt={ext.deadlineAt ?? null} slaStatus={ext.slaStatus ?? 'on_track'} small />
                  </td>

                  {/* Status */}
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge value={event.status} type="status" small />
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <button
                      className="view-btn"
                      onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }}
                      style={{
                        padding: '5px 14px',
                        background: isHovered ? 'var(--brand)' : '#EBF4FF',
                        color: isHovered ? '#fff' : '#2B6CB0',
                        border: isHovered ? 'none' : '1px solid #BEE3F8',
                        borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'background var(--transition), color var(--transition)',
                      }}
                    >
                      View
                    </button>
                    {canDelete && (
                      <button
                        onClick={(e) => handleDelete(e, event)}
                        disabled={deletingId === event.id}
                        title="Delete event"
                        style={{
                          marginLeft: 6, padding: '5px 8px',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                          borderRadius: 6, fontSize: 12,
                          cursor: deletingId === event.id ? 'not-allowed' : 'pointer',
                          opacity: deletingId === event.id ? 0.5 : 0.7,
                          transition: 'opacity var(--transition), color var(--transition)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = '#FEB2B2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        {deletingId === event.id ? '…' : '🗑'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onStatusChange={(id, status) => { onStatusChange(id, status); setSelectedEvent(null); }}
          userRole={userRole}
          defaultTab={defaultTab}
        />
      )}
    </>
  );
}
