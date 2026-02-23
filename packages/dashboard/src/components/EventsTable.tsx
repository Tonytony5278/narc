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
}

export default function EventsTable({ events, loading, onStatusChange, onDelete, userRole }: EventsTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#718096' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
        Loading events…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#718096', background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
        <strong style={{ display: 'block', fontSize: 16, color: '#1a1a2e', marginBottom: 4 }}>No events found</strong>
        No adverse events match your current filters.
      </div>
    );
  }

  return (
    <>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7FAFC', borderBottom: '1px solid #E2E8F0' }}>
              {['Received', 'Sender', 'Subject', 'AEs', 'Severity', 'SLA', 'Status', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#718096', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              // Access extended SLA fields from Phase 2 DB columns (camelCase from API)
              const ext = event as EventRecord & {
                slaStatus?: string;
                deadlineAt?: string | null;
                escalationLevel?: number;
              };

              return (
                <tr
                  key={event.id}
                  style={{ borderBottom: '1px solid #EDF2F7', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F7FAFC')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#718096' }}>
                    {new Date(event.receivedAt).toLocaleDateString()}<br />
                    <span style={{ fontSize: 11 }}>{new Date(event.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.sender || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.subject || <em style={{ color: '#718096' }}>(no subject)</em>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 26, height: 26, borderRadius: '50%',
                      background: event.aeCount > 0 ? '#E53E3E' : '#E2E8F0',
                      color: event.aeCount > 0 ? '#fff' : '#718096',
                      fontWeight: 700, fontSize: 12,
                    }}>
                      {event.aeCount}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <StatusBadge value={event.maxSeverity} type="severity" small />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <SlaTimer
                      deadlineAt={ext.deadlineAt ?? null}
                      slaStatus={ext.slaStatus ?? 'on_track'}
                      small
                    />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <StatusBadge value={event.status} type="status" small />
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setSelectedEvent(event)}
                      style={{ padding: '4px 12px', background: '#EBF4FF', color: '#2B6CB0', border: '1px solid #BEE3F8', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
                    >
                      View
                    </button>
                    {canDelete && (
                      <button
                        onClick={(e) => handleDelete(e, event)}
                        disabled={deletingId === event.id}
                        title="Delete event"
                        style={{ marginLeft: 6, padding: '4px 8px', background: '#FFF5F5', color: '#C53030', border: '1px solid #FEB2B2', borderRadius: 6, fontSize: 12, cursor: deletingId === event.id ? 'not-allowed' : 'pointer', opacity: deletingId === event.id ? 0.6 : 1 }}
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
          onStatusChange={(id, status) => {
            onStatusChange(id, status);
            setSelectedEvent(null);
          }}
          userRole={userRole}
        />
      )}
    </>
  );
}
