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
  fetchE2BData,
  type DocumentRecord,
  type E2BData,
  type MeddraSuggestion,
} from '../api/client';
import { buildE2BXml, downloadE2BXml, type E2BReaction } from '../utils/e2bXml';

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

// ─────────────────────────────────────────────────────────────────────────────
// E2B shared types + constants (used by E2BTab and EventDetailModal)
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmedTerm extends MeddraSuggestion {
  confirmed: boolean;
}

const CONFIDENCE_COLORS: Record<string, { bg: string; color: string }> = {
  high:   { bg: '#D4EDDA', color: '#155724' },
  medium: { bg: '#FFF3CD', color: '#856404' },
  low:    { bg: '#F8D7DA', color: '#721C24' },
};

const CATEGORY_LABELS_SHORT: Record<string, string> = {
  adverse_reaction:      'ADR',
  off_label_use:         'Off-Label Use',
  off_label_dosing:      'Off-Label Dose',
  pregnancy_exposure:    'Pregnancy',
  drug_interaction:      'Drug Interaction',
  serious_adverse_event: 'SAE',
  overdose:              'Overdose',
  medication_error:      'Med Error',
};

// ─────────────────────────────────────────────────────────────────────────────
// E2B Tab Component (self-contained for readability)
// ─────────────────────────────────────────────────────────────────────────────

interface E2BTabProps {
  eventId: string;
  e2bData: E2BData | null;
  e2bLoading: boolean;
  e2bError: string | null;
  confirmedTerms: Record<string, ConfirmedTerm>;
  setConfirmedTerms: React.Dispatch<React.SetStateAction<Record<string, ConfirmedTerm>>>;
  editingId: string | null;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  editDraft: Partial<ConfirmedTerm>;
  setEditDraft: React.Dispatch<React.SetStateAction<Partial<ConfirmedTerm>>>;
  userEmail: string;
  onRetry: () => void;
}

function E2BTab({
  eventId, e2bData, e2bLoading, e2bError,
  confirmedTerms, setConfirmedTerms,
  editingId, setEditingId, editDraft, setEditDraft,
  userEmail, onRetry,
}: E2BTabProps) {

  const confirmed   = Object.values(confirmedTerms).filter(t => t.confirmed).length;
  const total       = e2bData?.findings.length ?? 0;
  const allConfirmed = confirmed === total && total > 0;

  const handleConfirm = (findingId: string) => {
    setConfirmedTerms(prev => ({
      ...prev,
      [findingId]: { ...prev[findingId], confirmed: true },
    }));
  };

  const handleConfirmAll = () => {
    setConfirmedTerms(prev => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = { ...next[id], confirmed: true };
      return next;
    });
  };

  const handleStartEdit = (findingId: string) => {
    setEditDraft({ ...(confirmedTerms[findingId] ?? {}) });
    setEditingId(findingId);
  };

  const handleApplyEdit = (findingId: string) => {
    setConfirmedTerms(prev => ({
      ...prev,
      [findingId]: { ...prev[findingId], ...editDraft, confirmed: true, aiGenerated: true },
    }));
    setEditingId(null);
    setEditDraft({});
  };

  const handleDownload = () => {
    if (!e2bData) return;
    const reactions: E2BReaction[] = e2bData.findings.map(f => ({
      findingId: f.findingId,
      excerpt:   f.excerpt,
      category:  f.category,
      severity:  f.severity,
      urgency:   f.urgency,
      meddra: {
        ...(confirmedTerms[f.findingId] ?? f.meddra),
        confirmed: confirmedTerms[f.findingId]?.confirmed ?? false,
      },
    }));
    const xml = buildE2BXml({
      eventId,
      event:         e2bData.event,
      reactions,
      meddraVersion: e2bData.meddraVersion,
      exportedBy:    userEmail,
    });
    downloadE2BXml(xml, eventId);
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (e2bLoading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 14 }}>⚕</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e', marginBottom: 8 }}>
          Preparing E2B(R3) Report…
        </div>
        <div style={{ fontSize: 13, color: '#718096', maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
          Claude is analysing each adverse event finding and suggesting MedDRA PT / HLT / SOC codes.
          This may take 10–30 seconds.
        </div>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%', background: '#9B2335',
              animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,80%,100%{opacity:.2} 40%{opacity:1} }`}</style>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (e2bError) {
    return (
      <div style={{ padding: 24, background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, color: '#C53030' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ Failed to prepare E2B report</div>
        <div style={{ fontSize: 13, marginBottom: 14 }}>{e2bError}</div>
        <button onClick={onRetry} style={{ padding: '6px 16px', background: '#9B2335', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
          ↺ Try Again
        </button>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!e2bData) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#A0AEC0', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Header / Progress ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
              ICH E2B(R3) Export — MedDRA Term Review
            </h3>
            <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>
              MedDRA v{e2bData.meddraVersion} · Generated {new Date(e2bData.generatedAt).toLocaleTimeString()}
            </div>
          </div>
          {/* Progress pill */}
          <div style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: allConfirmed ? '#D4EDDA' : confirmed > 0 ? '#FFF3CD' : '#F7FAFC',
            color: allConfirmed ? '#155724' : confirmed > 0 ? '#856404' : '#718096',
            border: `1px solid ${allConfirmed ? '#C3E6CB' : confirmed > 0 ? '#FFEEBA' : '#E2E8F0'}`,
          }}>
            {allConfirmed ? `✓ All ${total} terms confirmed` : `${confirmed} / ${total} terms confirmed`}
          </div>
        </div>

        {/* Disclaimer banner */}
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 8,
          background: '#FFFAF0', border: '1px solid #F6AD55',
          fontSize: 12, color: '#744210', lineHeight: 1.5,
        }}>
          <strong>⚠️ AI-Suggested MedDRA Codes — Review Required</strong><br />
          All codes below were generated by AI and must be verified against the licensed MedDRA dictionary
          (MSSO) by a qualified pharmacovigilance professional before submission to any regulatory authority
          (FDA FAERS, EMA EudraVigilance, Health Canada MedEffect). Codes showing "00000" require mandatory
          manual lookup.
        </div>
      </div>

      {/* ── Confirm-all shortcut ── */}
      {!allConfirmed && (
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleConfirmAll}
            style={{
              padding: '5px 14px', background: '#EBF8FF', color: '#2B6CB0',
              border: '1px solid #BEE3F8', borderRadius: 6, fontSize: 12,
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            ✓ Confirm All AI Suggestions as Reviewed
          </button>
        </div>
      )}

      {/* ── Finding cards ── */}
      {e2bData.findings.map((finding, idx) => {
        const term     = confirmedTerms[finding.findingId] ?? { ...finding.meddra, confirmed: false };
        const isEditing = editingId === finding.findingId;
        const confCol  = CONFIDENCE_COLORS[term.confidence] ?? CONFIDENCE_COLORS.low;

        return (
          <div key={finding.findingId} style={{
            border: `1px solid ${term.confirmed ? '#C3E6CB' : '#E2E8F0'}`,
            borderRadius: 10, marginBottom: 14, overflow: 'hidden',
            transition: 'border-color 0.2s',
            boxShadow: term.confirmed ? '0 0 0 1px #C3E6CB' : 'none',
          }}>

            {/* Card header */}
            <div style={{
              background: term.confirmed ? '#F0FFF4' : '#F7FAFC',
              padding: '10px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #E2E8F0',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#718096' }}>
                  Finding {idx + 1}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: CATEGORY_COLORS[finding.category] ?? '#718096', color: '#fff' }}>
                  {CATEGORY_LABELS_SHORT[finding.category] ?? finding.category}
                </span>
                <StatusBadge value={finding.severity} type="severity" small />
                {/* Confidence badge */}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                  background: confCol.bg, color: confCol.color,
                }}>
                  {term.confidence.toUpperCase()} confidence
                </span>
              </div>
              {/* Status badge */}
              {term.confirmed
                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#155724', background: '#D4EDDA', padding: '2px 10px', borderRadius: 10 }}>✓ Confirmed</span>
                : <span style={{ fontSize: 11, fontWeight: 700, color: '#856404', background: '#FFF3CD', padding: '2px 10px', borderRadius: 10 }}>⚠️ AI Suggested</span>
              }
            </div>

            {/* Finding excerpt */}
            <div style={{ padding: '8px 14px 0', background: '#FFFBEA', borderBottom: '1px solid #F6E05E30' }}>
              <blockquote style={{ margin: 0, paddingLeft: 10, borderLeft: '3px solid #F6AD55', fontSize: 12, color: '#744210', fontStyle: 'italic' }}>
                "{finding.excerpt.slice(0, 200)}{finding.excerpt.length > 200 ? '…' : ''}"
              </blockquote>
            </div>

            {/* MedDRA hierarchy */}
            {!isEditing ? (
              <div style={{ padding: '12px 14px' }}>
                {/* Hierarchy table */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 12 }}>
                  {[
                    { level: 'PT',   code: term.ptCode,   term: term.ptTerm,   label: 'Preferred Term' },
                    { level: 'HLT',  code: term.hltCode,  term: term.hltTerm,  label: 'High Level Term' },
                    { level: 'HLGT', code: term.hlgtCode, term: term.hlgtTerm, label: 'HLT Group Term' },
                    { level: 'SOC',  code: term.socCode,  term: term.socTerm,  label: 'System Organ Class' },
                  ].map(({ level, code, term: termName, label }) => (
                    <div key={level} style={{
                      background: '#F7FAFC', borderRadius: 6, padding: '8px 10px',
                      border: code === '00000' ? '1px solid #FEB2B2' : '1px solid #E2E8F0',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#9B2335', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{level}</span>
                        <span style={{
                          fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                          color: code === '00000' ? '#C53030' : '#2B6CB0',
                          background: code === '00000' ? '#FFF5F5' : '#EBF4FF',
                          padding: '1px 5px', borderRadius: 4,
                        }}>{code}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#1a1a2e', fontWeight: 500, lineHeight: 1.3 }}>{termName}</div>
                      <div style={{ fontSize: 10, color: '#A0AEC0', marginTop: 1 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* AI warning */}
                {!term.confirmed && (
                  <div style={{ fontSize: 11, color: '#744210', background: '#FFFAF0', border: '1px solid #F6AD55', borderRadius: 6, padding: '5px 10px', marginBottom: 10 }}>
                    ⚠️ {term.warning}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {!term.confirmed && (
                    <button
                      onClick={() => handleConfirm(finding.findingId)}
                      style={{
                        padding: '5px 14px', background: '#2D6A4F', color: '#fff',
                        border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      ✓ Confirm Term
                    </button>
                  )}
                  <button
                    onClick={() => handleStartEdit(finding.findingId)}
                    style={{
                      padding: '5px 14px',
                      background: term.confirmed ? '#EBF8FF' : '#fff',
                      color: term.confirmed ? '#2B6CB0' : '#4A5568',
                      border: `1px solid ${term.confirmed ? '#BEE3F8' : '#CBD5E0'}`,
                      borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    ✏️ {term.confirmed ? 'Edit Confirmed Term' : 'Edit & Confirm'}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Inline edit form ── */
              <div style={{ padding: '12px 14px', background: '#EBF8FF' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#2B6CB0', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ✏️ Edit MedDRA Terms
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px 10px', alignItems: 'center' }}>
                  {[
                    { key: 'ptCode',   label: 'PT Code',   type: 'code' },
                    { key: 'ptTerm',   label: 'PT Term',   type: 'term' },
                    { key: 'hltCode',  label: 'HLT Code',  type: 'code' },
                    { key: 'hltTerm',  label: 'HLT Term',  type: 'term' },
                    { key: 'hlgtCode', label: 'HLGT Code', type: 'code' },
                    { key: 'hlgtTerm', label: 'HLGT Term', type: 'term' },
                    { key: 'socCode',  label: 'SOC Code',  type: 'code' },
                    { key: 'socTerm',  label: 'SOC Term',  type: 'term' },
                  ].map(({ key, label, type }) => (
                    <React.Fragment key={key}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#4A5568' }}>{label}</label>
                      <input
                        type="text"
                        value={(editDraft as Record<string, string>)[key] ?? ''}
                        onChange={e => setEditDraft(prev => ({ ...prev, [key]: e.target.value }))}
                        maxLength={type === 'code' ? 5 : 150}
                        placeholder={type === 'code' ? '00000' : 'Enter term…'}
                        style={{
                          padding: '5px 8px', border: '1px solid #BEE3F8', borderRadius: 5,
                          fontSize: 12, fontFamily: type === 'code' ? 'monospace' : 'inherit',
                          background: '#fff', outline: 'none',
                          letterSpacing: type === 'code' ? '0.1em' : 'normal',
                        }}
                      />
                    </React.Fragment>
                  ))}
                  {/* Confidence selector */}
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#4A5568' }}>Confidence</label>
                  <select
                    value={editDraft.confidence ?? 'medium'}
                    onChange={e => setEditDraft(prev => ({ ...prev, confidence: e.target.value as 'high' | 'medium' | 'low' }))}
                    style={{ padding: '5px 8px', border: '1px solid #BEE3F8', borderRadius: 5, fontSize: 12, background: '#fff' }}
                  >
                    <option value="high">High — certain of term and code</option>
                    <option value="medium">Medium — term correct, code uncertain</option>
                    <option value="low">Low — best clinical guess</option>
                  </select>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleApplyEdit(finding.findingId)}
                    style={{ padding: '5px 14px', background: '#2D6A4F', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ✓ Apply & Confirm
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditDraft({}); }}
                    style={{ padding: '5px 14px', background: '#fff', color: '#718096', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Download section ── */}
      <div style={{
        marginTop: 8, padding: '16px 18px', background: '#F7FAFC',
        border: '1px solid #E2E8F0', borderRadius: 10,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a2e', marginBottom: 4 }}>
          Download E2B(R3) XML
        </div>
        <div style={{ fontSize: 12, color: '#718096', marginBottom: 12, lineHeight: 1.5 }}>
          {allConfirmed
            ? '✅ All MedDRA terms confirmed. XML ready for qualified-person review before regulatory submission.'
            : `⚠️ ${total - confirmed} term(s) not yet confirmed. You can still download — unconfirmed codes will be clearly marked in the XML.`
          }
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleDownload}
            style={{
              padding: '8px 20px',
              background: allConfirmed ? '#9B2335' : '#2B6CB0',
              color: '#fff', border: 'none', borderRadius: 7,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            <span>⬇</span>
            {allConfirmed ? 'Download E2B(R3) XML' : 'Download Draft XML (terms unconfirmed)'}
          </button>
          <div style={{ fontSize: 11, color: '#718096' }}>
            ICH E2B(R3) · MedDRA v{e2bData.meddraVersion} · {e2bData.findings.length} reaction(s)
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#A0AEC0', lineHeight: 1.5 }}>
          After download: verify all MedDRA codes against the licensed dictionary, complete patient demographics,
          and submit via Health Canada MedEffect, FDA FAERS Gateway, or EMA EvWeb.
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface EventDetailModalProps {
  event: EventRecord;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  userRole?: string;
}

type ActiveTab = 'findings' | 'sla' | 'body' | 'documents' | 'submit' | 'e2b';

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

  // E2B state
  const [e2bData, setE2bData] = useState<E2BData | null>(null);
  const [e2bLoading, setE2bLoading] = useState(false);
  const [e2bError, setE2bError] = useState<string | null>(null);
  // confirmedTerms: findingId → ConfirmedTerm (copies AI suggestion, user can edit/confirm)
  const [confirmedTerms, setConfirmedTerms] = useState<Record<string, ConfirmedTerm>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ConfirmedTerm>>({});

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
    if (tab === 'e2b' && !e2bData && !e2bLoading) {
      setE2bLoading(true);
      setE2bError(null);
      fetchE2BData(event.id)
        .then((data) => {
          setE2bData(data);
          // Initialise confirmed-terms map from AI suggestions (not yet confirmed)
          const initial: Record<string, ConfirmedTerm> = {};
          for (const f of data.findings) {
            initial[f.findingId] = { ...f.meddra, confirmed: false };
          }
          setConfirmedTerms(initial);
        })
        .catch((err) => setE2bError(err instanceof Error ? err.message : 'Failed to prepare E2B report'))
        .finally(() => setE2bLoading(false));
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

  const confirmedCount = Object.values(confirmedTerms).filter(t => t.confirmed).length;
  const totalFindings  = e2bData?.findings.length ?? 0;

  const TAB_LABELS: { id: ActiveTab; label: string }[] = [
    { id: 'findings',  label: `Findings (${findings.length})` },
    { id: 'body',      label: 'Email Body' },
    { id: 'sla',       label: 'SLA' },
    { id: 'documents', label: 'Documents' },
    ...(isSupervisor ? [{ id: 'submit' as ActiveTab, label: 'Submit' }] : []),
    ...(isSupervisor ? [{ id: 'e2b'  as ActiveTab, label: `⚕ E2B Export${confirmedCount > 0 && confirmedCount === totalFindings ? ' ✓' : ''}` }] : []),
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

          {/* ── E2B Export tab ── */}
          {tab === 'e2b' && isSupervisor && (
            <E2BTab
              eventId={event.id}
              e2bData={e2bData}
              e2bLoading={e2bLoading}
              e2bError={e2bError}
              confirmedTerms={confirmedTerms}
              setConfirmedTerms={setConfirmedTerms}
              editingId={editingId}
              setEditingId={setEditingId}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              userEmail={typeof (event as EventRecord & { agentEmail?: string }).agentEmail === 'string'
                ? (event as EventRecord & { agentEmail?: string }).agentEmail!
                : 'safety@narc.local'}
              onRetry={() => {
                setE2bData(null);
                setE2bError(null);
                setConfirmedTerms({});
                setTab('findings');
                setTimeout(() => setTab('e2b'), 50);
              }}
            />
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
