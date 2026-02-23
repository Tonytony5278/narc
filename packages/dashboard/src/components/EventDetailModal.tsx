import React, { useState, useEffect, useRef } from 'react';
import type { EventRecord, AEFindingRecord } from '@narc/shared';
import StatusBadge from './StatusBadge';
import SlaTimer from './SlaTimer';
import {
  updateEventStatus,
  updateFindingStatus,
  fetchDocuments,
  uploadDocument,
  generateCasePacket,
  submitCase,
  fetchSubmissions,
  type DocumentRecord,
} from '../api/client';

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
  adverse_reaction: '#E65100',
  off_label_use: '#6A1B9A',
  off_label_dosing: '#4A148C',
  pregnancy_exposure: '#880E4F',
  drug_interaction: '#1565C0',
  serious_adverse_event: '#B71C1C',
  overdose: '#BF360C',
  medication_error: '#33691E',
};

const SEVERITY_HIGHLIGHT: Record<string, string> = {
  critical: 'rgba(197,48,48,0.18)',
  high:     'rgba(194,80,0,0.15)',
  medium:   'rgba(214,158,46,0.18)',
  low:      'rgba(56,161,105,0.12)',
};

interface HighlightSpan { start: number; end: number; text: string; }

/** Render email body text with highlight_spans overlaid as <mark> elements */
function HighlightedBody({ body, findings }: { body: string; findings: AEFindingRecord[] }) {
  // Collect all spans with their severity
  const spans: Array<{ start: number; end: number; severity: string }> = [];
  for (const f of findings) {
    const extF = f as AEFindingRecord & { highlight_spans?: HighlightSpan[] };
    if (extF.highlight_spans) {
      for (const s of extF.highlight_spans) {
        spans.push({ start: s.start, end: s.end, severity: f.severity });
      }
    }
  }
  spans.sort((a, b) => a.start - b.start);

  if (spans.length === 0) {
    return (
      <pre style={{ margin: 0, fontSize: 13, color: '#4A5568', fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {body}
      </pre>
    );
  }

  // Build segments
  const segments: React.ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      segments.push(<span key={`text-${cursor}`}>{body.slice(cursor, span.start)}</span>);
    }
    const start = Math.max(span.start, cursor);
    const end = Math.min(span.end, body.length);
    if (start < end) {
      segments.push(
        <mark key={`mark-${start}`} style={{
          background: SEVERITY_HIGHLIGHT[span.severity] ?? 'rgba(214,158,46,0.18)',
          borderBottom: `2px solid ${span.severity === 'critical' ? '#C53030' : span.severity === 'high' ? '#C25000' : '#D69E2E'}`,
          borderRadius: 2,
          padding: '0 1px',
        }}>
          {body.slice(start, end)}
        </mark>
      );
      cursor = end;
    }
  }
  if (cursor < body.length) {
    segments.push(<span key={`text-end`}>{body.slice(cursor)}</span>);
  }

  return (
    <pre style={{ margin: 0, fontSize: 13, color: '#4A5568', fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
      {segments}
    </pre>
  );
}

interface EventDetailModalProps {
  event: EventRecord;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  userRole?: string;
}

type ActiveTab = 'findings' | 'sla' | 'body' | 'documents' | 'submit';

export default function EventDetailModal({ event, onClose, onStatusChange, userRole }: EventDetailModalProps) {
  const [findings, setFindings] = useState<AEFindingRecord[]>(event.findings);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(event.notes ?? '');
  const [tab, setTab] = useState<ActiveTab>('findings');

  // Documents state
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission state
  const [submissions, setSubmissions] = useState<unknown[]>([]);
  const [packetLoading, setPacketLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [packetData, setPacketData] = useState<unknown | null>(null);

  const isSupervisor = userRole === 'supervisor' || userRole === 'admin';
  const ext = event as EventRecord & { slaStatus?: string; deadlineAt?: string | null; escalationLevel?: number; bodyExcerpt?: string };

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load documents when tab is opened
  useEffect(() => {
    if (tab === 'documents' && docs.length === 0 && !docsLoading) {
      setDocsLoading(true);
      fetchDocuments(event.id).then(setDocs).catch(() => {}).finally(() => setDocsLoading(false));
    }
    if (tab === 'submit' && submissions.length === 0) {
      fetchSubmissions(event.id).then(setSubmissions).catch(() => {});
    }
  }, [tab, event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEventAction = async (status: string) => {
    setSaving(true);
    try {
      await updateEventStatus(event.id, status, notes);
      onStatusChange(event.id, status);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleFindingAction = async (finding: AEFindingRecord, status: string) => {
    await updateFindingStatus(event.id, finding.id, status);
    setFindings((prev) =>
      prev.map((f) =>
        f.id === finding.id ? { ...f, status: status as AEFindingRecord['status'] } : f
      )
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(event.id, file);
      // Reload documents list
      const updated = await fetchDocuments(event.id);
      setDocs(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGeneratePacket = async () => {
    setPacketLoading(true);
    try {
      const data = await generateCasePacket(event.id);
      setPacketData(data);
      // Trigger download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `case-packet-${event.id}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate packet');
    } finally {
      setPacketLoading(false);
    }
  };

  const handleSubmitCase = async () => {
    if (!confirm('Submit this case to the pharmacovigilance safety mailbox?')) return;
    setSubmitLoading(true);
    try {
      await submitCase(event.id);
      const updated = await fetchSubmissions(event.id);
      setSubmissions(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitLoading(false);
    }
  };

  const TAB_LABELS: { id: ActiveTab; label: string }[] = [
    { id: 'findings', label: `Findings (${findings.length})` },
    { id: 'body',     label: 'Email Body' },
    { id: 'sla',      label: 'SLA' },
    { id: 'documents', label: 'Documents' },
    ...(isSupervisor ? [{ id: 'submit' as ActiveTab, label: 'Submit' }] : []),
  ];

  const tabBtn = (id: ActiveTab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      style={{
        padding: '7px 14px',
        background: 'none',
        border: 'none',
        borderBottom: tab === id ? '2px solid #9B2335' : '2px solid transparent',
        color: tab === id ? '#1a1a2e' : '#718096',
        fontWeight: tab === id ? 700 : 400,
        fontSize: 13,
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 860, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px 0', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#718096', marginBottom: 3 }}>
                {event.sender} • {new Date(event.receivedAt).toLocaleString()}
              </div>
              <h2 style={{ margin: 0, fontSize: 17, color: '#1a1a2e' }}>{event.subject || '(no subject)'}</h2>
              <div style={{ marginTop: 7, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge value={event.status} type="status" />
                <StatusBadge value={event.maxSeverity} type="severity" />
                <SlaTimer deadlineAt={ext.deadlineAt ?? null} slaStatus={ext.slaStatus ?? 'on_track'} small />
                <span style={{ fontSize: 12, color: '#718096' }}>{event.aeCount} finding{event.aeCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              title="Close (Esc)"
              style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 8, width: 36, height: 36, fontSize: 20, cursor: 'pointer', color: '#4A5568', lineHeight: '34px', textAlign: 'center', flexShrink: 0, marginLeft: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E2E8F0', marginTop: 4 }}>
            {TAB_LABELS.map(({ id, label }) => tabBtn(id, label))}
          </div>
        </div>

        {/* Scrollable tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── Findings tab ── */}
          {tab === 'findings' && (
            <>
              {findings.map((finding) => (
                <div key={finding.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, marginBottom: 16, overflow: 'hidden', opacity: finding.status === 'dismissed' ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                  <div style={{ background: '#F7FAFC', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: CATEGORY_COLORS[finding.category] ?? '#718096', color: '#fff' }}>
                        {CATEGORY_LABELS[finding.category] ?? finding.category}
                      </span>
                      <StatusBadge value={finding.severity} type="severity" small />
                      <span style={{ fontSize: 11, color: '#718096' }}>Urgency: <strong>{finding.urgency.replace(/_/g, ' ')}</strong></span>
                      <span style={{ fontSize: 11, color: '#718096' }}>Confidence: <strong>{Math.round(finding.confidence * 100)}%</strong></span>
                    </div>
                    <StatusBadge value={finding.status} type="status" small />
                  </div>
                  <div style={{ padding: '12px 14px', background: '#FFFBEA', borderBottom: '1px solid #E2E8F0' }}>
                    <blockquote style={{ margin: 0, paddingLeft: 12, borderLeft: '3px solid #F6AD55', fontSize: 13, color: '#744210', fontStyle: 'italic' }}>
                      "{finding.excerpt}"
                    </blockquote>
                  </div>
                  <div style={{ padding: '10px 14px', fontSize: 13, color: '#4A5568', lineHeight: 1.5 }}>
                    {finding.explanation}
                  </div>
                  {finding.status === 'pending' && (
                    <div style={{ padding: '8px 14px 12px', display: 'flex', gap: 8 }}>
                      <button onClick={() => handleFindingAction(finding, 'reported')} style={{ padding: '5px 14px', background: '#2D6A4F', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Mark Reported</button>
                      <button onClick={() => handleFindingAction(finding, 'dismissed')} style={{ padding: '5px 14px', background: '#fff', color: '#718096', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Dismiss</button>
                    </div>
                  )}
                </div>
              ))}

              {/* Notes */}
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                  Supervisor Notes
                </label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this event…" rows={3}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            </>
          )}

          {/* ── Email Body tab ── */}
          {tab === 'body' && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Email Body — highlights show AE-flagged text
              </div>
              <div style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.6 }}>
                <HighlightedBody body={(ext.bodyExcerpt ?? '') + ((ext.bodyExcerpt?.length ?? 0) >= 500 ? '…' : '')} findings={findings} />
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {['critical', 'high', 'medium', 'low'].map((sev) => (
                  <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#718096' }}>
                    <span style={{ display: 'inline-block', width: 16, height: 10, background: SEVERITY_HIGHLIGHT[sev], border: `1px solid ${sev === 'critical' ? '#C53030' : sev === 'high' ? '#C25000' : sev === 'medium' ? '#D69E2E' : '#48BB78'}`, borderRadius: 2 }} />
                    {sev.charAt(0).toUpperCase() + sev.slice(1)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SLA tab ── */}
          {tab === 'sla' && (
            <div>
              <div style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>SLA Status</div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>Deadline</div>
                    <SlaTimer deadlineAt={ext.deadlineAt ?? null} slaStatus={ext.slaStatus ?? 'on_track'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>Escalation Level</div>
                    <span style={{ fontWeight: 700, fontSize: 20, color: (ext.escalationLevel ?? 0) > 1 ? '#C53030' : '#1a1a2e' }}>
                      {ext.escalationLevel ?? 0} / 3
                    </span>
                  </div>
                  {ext.deadlineAt && (
                    <div>
                      <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>Deadline Date/Time</div>
                      <div style={{ fontSize: 13, color: '#4A5568', fontWeight: 500 }}>
                        {new Date(ext.deadlineAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#718096', lineHeight: 1.6 }}>
                <strong>SLA Logic:</strong> Critical = 1h deadline, High = 4h, Medium = 24h, Low = 7 days.<br />
                Escalation: 0–50% elapsed → on_track, 50–75% → at_risk (level 1), 75–100% → at_risk (level 2), &gt;100% → breached (level 3).
              </div>
            </div>
          )}

          {/* ── Documents tab ── */}
          {tab === 'documents' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Attachments ({docs.length})
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ padding: '6px 14px', background: '#2B6CB0', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                >
                  {uploading ? 'Uploading…' : '+ Upload File'}
                </button>
                <input ref={fileInputRef} type="file" hidden
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.rtf,.txt,application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf,text/plain"
                  onChange={handleFileUpload}
                />
              </div>

              {docsLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#718096', fontSize: 13 }}>Loading documents…</div>
              ) : docs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#A0AEC0', fontSize: 13, border: '2px dashed #E2E8F0', borderRadius: 8 }}>
                  No attachments yet. Click "Upload File" to add PDFs, images, DOCX, RTF or TXT files.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {docs.map((doc) => (
                    <div key={doc.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a2e' }}>{doc.filename}</div>
                        <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>
                          {doc.extraction_method} · {Math.round(doc.size_bytes / 1024)}KB ·{' '}
                          <span style={{ color: doc.processing_status === 'completed' ? '#276749' : doc.processing_status === 'failed' ? '#C53030' : '#B7791F', fontWeight: 600 }}>
                            {doc.processing_status}
                          </span>
                        </div>
                      </div>
                      {doc.extracted_text && (
                        <button
                          onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
                          style={{ padding: '4px 10px', background: '#EBF4FF', color: '#2B6CB0', border: '1px solid #BEE3F8', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                        >
                          {selectedDoc?.id === doc.id ? 'Hide' : 'View Text'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Extracted text drawer */}
              {selectedDoc && selectedDoc.extracted_text && (
                <div style={{ marginTop: 14, border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ background: '#F7FAFC', padding: '8px 14px', fontSize: 11, fontWeight: 600, color: '#4A5568' }}>
                    {selectedDoc.filename} — Extracted Text ({selectedDoc.extraction_method})
                  </div>
                  <pre style={{ margin: 0, padding: '12px 14px', fontSize: 12, color: '#4A5568', fontFamily: 'inherit', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', background: '#fff' }}>
                    {selectedDoc.extracted_text}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* ── Submit tab ── */}
          {tab === 'submit' && isSupervisor && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Case Submission</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleGeneratePacket}
                    disabled={packetLoading}
                    style={{ padding: '8px 18px', background: '#2B6CB0', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: packetLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {packetLoading ? 'Generating…' : '⬇ Generate Case Packet (JSON)'}
                  </button>
                  <button
                    onClick={handleSubmitCase}
                    disabled={submitLoading}
                    style={{ padding: '8px 18px', background: '#9B2335', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: submitLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {submitLoading ? 'Submitting…' : '✉ Submit to Safety Mailbox'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#718096', marginTop: 8 }}>
                  The case packet includes all AE findings, audit trail, and attached documents in ICH E2B-compatible format.
                </div>
              </div>

              {submissions.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Submission History ({submissions.length})
                  </div>
                  {(submissions as Array<{ id: string; submitted_at: string; destination: string; status: string }>).map((sub) => (
                    <div key={sub.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a2e' }}>{sub.destination}</div>
                        <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>{new Date(sub.submitted_at).toLocaleString()}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: sub.status === 'sent' ? '#D4EDDA' : '#FFF3CD', color: sub.status === 'sent' ? '#155724' : '#856404' }}>
                        {sub.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', background: '#fff', color: '#4A5568', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            ← Close
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => handleEventAction('false_positive')} disabled={saving}
            style={{ padding: '7px 16px', background: '#fff', color: '#718096', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            False Positive
          </button>
          <button onClick={() => handleEventAction('dismissed')} disabled={saving}
            style={{ padding: '7px 16px', background: '#fff', color: '#E53E3E', border: '1px solid #FC8181', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            Dismiss All
          </button>
          <button onClick={() => handleEventAction('escalated')} disabled={saving}
            style={{ padding: '7px 16px', background: '#9B2335', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Escalate
          </button>
          <button onClick={() => handleEventAction('reported')} disabled={saving}
            style={{ padding: '7px 16px', background: '#2D6A4F', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving…' : '✓ Confirm Reported'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
