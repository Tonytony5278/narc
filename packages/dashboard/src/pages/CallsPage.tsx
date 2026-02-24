import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCalls,
  fetchCall,
  updateCallStatus,
  updateCallFindingStatus,
  uploadCallRecording,
  type CallRecord,
  type CallFindingRecord,
  type CallsFilter,
} from '../api/client';
import SlaTimer from '../components/SlaTimer';
import StatusBadge from '../components/StatusBadge';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  amazon_connect: '#FF9900',
  genesys:        '#009BDE',
  ringcentral:    '#0E7EF8',
  manual:         '#718096',
  webhook:        '#805AD5',
  custom:         '#718096',
};

const PLATFORM_LABELS: Record<string, string> = {
  amazon_connect: 'Amazon Connect',
  genesys:        'Genesys Cloud',
  ringcentral:    'RingCentral',
  manual:         'Manual Upload',
  webhook:        'Webhook',
  custom:         'Custom',
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#FFF5F5', text: '#C53030', border: '#FEB2B2' },
  high:     { bg: '#FFFAF0', text: '#C05621', border: '#FBD38D' },
  medium:   { bg: '#FFFFF0', text: '#B7791F', border: '#FAF089' },
  low:      { bg: '#F0FFF4', text: '#276749', border: '#9AE6B4' },
};

const CATEGORY_LABELS: Record<string, string> = {
  adverse_reaction:    'Adverse Reaction',
  off_label_use:       'Off-Label Use',
  off_label_dosing:    'Off-Label Dosing',
  pregnancy_exposure:  'Pregnancy Exposure',
  drug_interaction:    'Drug Interaction',
  serious_adverse_event: 'Serious AE',
  overdose:            'Overdose',
  medication_error:    'Medication Error',
};

const CATEGORY_COLORS: Record<string, string> = {
  adverse_reaction:    '#E65100',
  off_label_use:       '#6A1B9A',
  off_label_dosing:    '#4A148C',
  pregnancy_exposure:  '#880E4F',
  drug_interaction:    '#1565C0',
  serious_adverse_event: '#B71C1C',
  overdose:            '#BF360C',
  medication_error:    '#33691E',
};

// ─── Upload Card ──────────────────────────────────────────────────────────────

interface UploadCardProps {
  onUploaded: (callId: string) => void;
}

function UploadCard({ onUploaded }: UploadCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [drugName, setDrugName] = useState('');
  const [patientRef, setPatientRef] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [platform, setPlatform] = useState('manual');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) { setError('Please select an audio file'); return; }
    setUploading(true);
    setError(null);
    try {
      setProgress('Uploading…');
      await new Promise((r) => setTimeout(r, 300)); // brief visual delay
      setProgress('Transcribing… (this may take 30–60s)');
      const { callId } = await uploadCallRecording(file, {
        platform,
        drugName: drugName || undefined,
        patientRef: patientRef || undefined,
        agentEmail: agentEmail || undefined,
      });
      setProgress('✅ Done!');
      setTimeout(() => {
        setFile(null);
        setProgress(null);
        setDrugName('');
        setPatientRef('');
        setAgentEmail('');
        onUploaded(callId);
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setProgress(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>📞 Analyze Call Recording</div>
      <div style={{ fontSize: 12, color: '#718096', marginBottom: 16 }}>
        Upload an audio file (MP3, WAV, M4A, WebM, OGG, MP4) to transcribe and analyze for adverse events.
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? '#9B2335' : file ? '#276749' : '#CBD5E0'}`,
          borderRadius: 8,
          padding: '24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? '#FFF5F5' : file ? '#F0FFF4' : '#F7FAFC',
          marginBottom: 16,
          transition: 'all 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.mp4,.m4a,.wav,.webm,.ogg"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div>
            <div style={{ fontSize: 22, marginBottom: 4 }}>🎵</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#276749' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB — click to change
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 28, marginBottom: 4 }}>🎙️</div>
            <div style={{ fontSize: 13, color: '#4A5568' }}>Drag & drop or <strong>click to browse</strong></div>
            <div style={{ fontSize: 11, color: '#A0AEC0', marginTop: 4 }}>MP3, WAV, M4A, WebM, OGG, MP4 · Max 25MB</div>
          </div>
        )}
      </div>

      {/* Metadata fields */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 4 }}>Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, background: '#fff' }}
          >
            <option value="manual">Manual Upload</option>
            <option value="amazon_connect">Amazon Connect</option>
            <option value="genesys">Genesys Cloud</option>
            <option value="ringcentral">RingCentral</option>
            <option value="custom">Other</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 4 }}>Drug Name (optional)</label>
          <input
            type="text"
            placeholder="e.g. Humira"
            value={drugName}
            onChange={(e) => setDrugName(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 4 }}>Patient Ref (optional)</label>
          <input
            type="text"
            placeholder="e.g. PT-001"
            value={patientRef}
            onChange={(e) => setPatientRef(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 4 }}>Agent Email (optional)</label>
          <input
            type="email"
            placeholder="agent@psp.com"
            value={agentEmail}
            onChange={(e) => setAgentEmail(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {error && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#C53030', marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}

      {progress && (
        <div style={{ background: '#EBF8FF', border: '1px solid #BEE3F8', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#2B6CB0', marginBottom: 12 }}>
          ⏳ {progress}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={uploading || !file}
        style={{
          padding: '9px 20px',
          background: uploading || !file ? '#A0AEC0' : '#9B2335',
          color: '#fff',
          border: 'none',
          borderRadius: 7,
          fontSize: 13,
          fontWeight: 700,
          cursor: uploading || !file ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? '⏳ Processing…' : '🔍 Analyze Call Recording'}
      </button>
    </div>
  );
}

// ─── Platform Badge ───────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] ?? '#718096';
  const label = PLATFORM_LABELS[platform] ?? platform;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

// ─── Severity Badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low;
  return (
    <span style={{
      padding: '2px 8px',
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
    }}>
      {severity}
    </span>
  );
}

// ─── Calls Filter Bar ─────────────────────────────────────────────────────────

interface CallsFilterBarProps {
  filter: CallsFilter;
  onChange: (f: CallsFilter) => void;
  total: number;
}

function CallsFilterBar({ filter, onChange, total }: CallsFilterBarProps) {
  const s = { padding: '6px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, background: '#fff' };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ fontSize: 12, color: '#718096' }}>{total} call{total !== 1 ? 's' : ''}</span>
      <select style={s} value={filter.status ?? ''} onChange={(e) => onChange({ ...filter, status: e.target.value || undefined, offset: 0 })}>
        <option value="">All statuses</option>
        <option value="pending_review">Pending Review</option>
        <option value="reviewed">Reviewed</option>
        <option value="reported">Reported</option>
        <option value="dismissed">Dismissed</option>
        <option value="false_positive">False Positive</option>
        <option value="transcription_failed">Transcription Failed</option>
      </select>
      <select style={s} value={filter.severity ?? ''} onChange={(e) => onChange({ ...filter, severity: e.target.value || undefined, offset: 0 })}>
        <option value="">All severities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select style={s} value={filter.platform ?? ''} onChange={(e) => onChange({ ...filter, platform: e.target.value || undefined, offset: 0 })}>
        <option value="">All platforms</option>
        <option value="manual">Manual</option>
        <option value="amazon_connect">Amazon Connect</option>
        <option value="genesys">Genesys</option>
        <option value="ringcentral">RingCentral</option>
        <option value="webhook">Webhook</option>
        <option value="custom">Custom</option>
      </select>
      <input
        type="text"
        placeholder="Search…"
        value={filter.search ?? ''}
        onChange={(e) => onChange({ ...filter, search: e.target.value || undefined, offset: 0 })}
        style={{ ...s, width: 180 }}
      />
      {(filter.status || filter.severity || filter.platform || filter.search) && (
        <button onClick={() => onChange({})} style={{ padding: '5px 12px', background: '#EDF2F7', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
          ✕ Clear
        </button>
      )}
    </div>
  );
}

// ─── Calls List ───────────────────────────────────────────────────────────────

interface CallsListProps {
  calls: CallRecord[];
  loading: boolean;
  onSelect: (call: CallRecord) => void;
  selectedId?: string;
}

function CallsList({ calls, loading, onSelect, selectedId }: CallsListProps) {
  if (loading && calls.length === 0) {
    return <div style={{ textAlign: 'center', padding: 32, color: '#A0AEC0' }}>Loading calls…</div>;
  }
  if (calls.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#A0AEC0' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📞</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#4A5568' }}>No calls yet</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Upload a call recording above to get started.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {calls.map((call) => {
        const isSelected = call.id === selectedId;
        const sev = SEVERITY_COLORS[call.max_severity] ?? SEVERITY_COLORS.low;
        return (
          <div
            key={call.id}
            onClick={() => onSelect(call)}
            style={{
              background: isSelected ? '#FFF5F5' : '#fff',
              border: `1px solid ${isSelected ? '#FC8181' : '#E2E8F0'}`,
              borderLeft: `4px solid ${sev.text}`,
              borderRadius: 8,
              padding: '12px 16px',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <PlatformBadge platform={call.platform} />
                  <SeverityBadge severity={call.max_severity} />
                  <StatusBadge value={call.status} type="status" />
                </div>
                <div style={{ fontSize: 12, color: '#4A5568', marginTop: 4 }}>
                  {call.agent_email && <span style={{ marginRight: 12 }}>👤 {call.agent_email}</span>}
                  {call.patient_ref && <span style={{ marginRight: 12 }}>🏷 {call.patient_ref}</span>}
                  {call.drug_name && <span style={{ marginRight: 12 }}>💊 {call.drug_name}</span>}
                  {call.duration_seconds && (
                    <span style={{ marginRight: 12 }}>⏱ {Math.round(call.duration_seconds / 60)}m</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {call.ae_count > 0 ? (
                  <div style={{ fontSize: 20, fontWeight: 800, color: sev.text, lineHeight: 1 }}>{call.ae_count}</div>
                ) : (
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#A0AEC0', lineHeight: 1 }}>0</div>
                )}
                <div style={{ fontSize: 10, color: '#A0AEC0' }}>AEs</div>
              </div>
            </div>
            {call.deadline_at && call.status === 'pending_review' && (
              <div style={{ marginTop: 6 }}>
                <SlaTimer deadlineAt={call.deadline_at} slaStatus={call.sla_status} small />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Transcript Highlighter ───────────────────────────────────────────────────

function HighlightedTranscript({ transcript, findings }: { transcript: string; findings: CallFindingRecord[] }) {
  // Build a set of excerpt substrings to highlight
  interface Span { start: number; end: number; severity: string }
  const spans: Span[] = [];

  for (const f of findings) {
    if (f.highlight_start !== null && f.highlight_end !== null) {
      spans.push({ start: f.highlight_start, end: f.highlight_end, severity: f.severity });
    } else if (f.excerpt) {
      // Fall back to substring search
      const idx = transcript.indexOf(f.excerpt);
      if (idx !== -1) spans.push({ start: idx, end: idx + f.excerpt.length, severity: f.severity });
    }
  }
  spans.sort((a, b) => a.start - b.start);

  if (spans.length === 0) {
    return (
      <pre style={{ margin: 0, fontSize: 13, color: '#4A5568', fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
        {transcript}
      </pre>
    );
  }

  const HIGHLIGHT: Record<string, string> = {
    critical: 'rgba(197,48,48,0.2)',
    high:     'rgba(194,80,0,0.15)',
    medium:   'rgba(214,158,46,0.2)',
    low:      'rgba(56,161,105,0.12)',
  };

  const segments: React.ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) segments.push(<span key={`t${cursor}`}>{transcript.slice(cursor, span.start)}</span>);
    const start = Math.max(span.start, cursor);
    const end = Math.min(span.end, transcript.length);
    if (start < end) {
      segments.push(
        <mark key={`m${start}`} style={{
          background: HIGHLIGHT[span.severity] ?? HIGHLIGHT.medium,
          borderBottom: `2px solid ${span.severity === 'critical' ? '#C53030' : span.severity === 'high' ? '#C25000' : '#D69E2E'}`,
          borderRadius: 2,
          padding: '0 1px',
        }}>
          {transcript.slice(start, end)}
        </mark>
      );
      cursor = end;
    }
  }
  if (cursor < transcript.length) segments.push(<span key="tend">{transcript.slice(cursor)}</span>);

  return (
    <pre style={{ margin: 0, fontSize: 13, color: '#4A5568', fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
      {segments}
    </pre>
  );
}

// ─── Call Detail Modal ────────────────────────────────────────────────────────

interface CallDetailModalProps {
  callId: string;
  onClose: () => void;
  onStatusChange: () => void;
}

function CallDetailModal({ callId, onClose, onStatusChange }: CallDetailModalProps) {
  const [data, setData] = useState<{ call: CallRecord; findings: CallFindingRecord[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'findings' | 'transcript' | 'sla' | 'submit'>('findings');
  const [statusNote, setStatusNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchCall(callId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call');
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = async (status: string) => {
    if (!data) return;
    setUpdating(true);
    try {
      await updateCallStatus(callId, status, statusNote || undefined);
      await load();
      onStatusChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const handleFindingStatus = async (findingId: string, status: string) => {
    try {
      await updateCallFindingStatus(callId, findingId, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const call = data?.call;
  const findings = data?.findings ?? [];

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === t ? '2px solid #9B2335' : '2px solid transparent',
    color: activeTab === t ? '#9B2335' : '#718096',
    fontWeight: activeTab === t ? 700 : 400,
    fontSize: 13,
    cursor: 'pointer',
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            {loading || !call ? (
              <div style={{ color: '#A0AEC0', fontSize: 14 }}>Loading…</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <PlatformBadge platform={call.platform} />
                  <SeverityBadge severity={call.max_severity} />
                  <StatusBadge value={call.status} type="status" />
                </div>
                <div style={{ fontSize: 12, color: '#718096' }}>
                  {call.agent_email && <span style={{ marginRight: 12 }}>👤 {call.agent_email}</span>}
                  {call.patient_ref && <span style={{ marginRight: 12 }}>🏷 {call.patient_ref}</span>}
                  {call.drug_name && <span style={{ marginRight: 12 }}>💊 {call.drug_name}</span>}
                  {call.duration_seconds && <span style={{ marginRight: 12 }}>⏱ {Math.round(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</span>}
                  {call.transcript_language && <span>🌐 {call.transcript_language.toUpperCase()}</span>}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} style={{ background: '#EDF2F7', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: '#4A5568' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #E2E8F0', display: 'flex', padding: '0 12px' }}>
          <button style={tabStyle('findings')} onClick={() => setActiveTab('findings')}>
            Findings {findings.length > 0 && <span style={{ marginLeft: 4, background: '#9B2335', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{findings.length}</span>}
          </button>
          <button style={tabStyle('transcript')} onClick={() => setActiveTab('transcript')}>Transcript</button>
          <button style={tabStyle('sla')} onClick={() => setActiveTab('sla')}>SLA</button>
          <button style={tabStyle('submit')} onClick={() => setActiveTab('submit')}>Submit</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {error && (
            <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#C53030', marginBottom: 12 }}>
              ⚠️ {error}
            </div>
          )}

          {/* ── Findings tab ── */}
          {activeTab === 'findings' && (
            <div>
              {!loading && findings.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: '#A0AEC0' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <div style={{ fontWeight: 600, color: '#4A5568' }}>No AE findings detected</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>No adverse events were identified in this call transcript.</div>
                </div>
              )}
              {findings.map((f) => {
                const catColor = CATEGORY_COLORS[f.category] ?? '#718096';
                const sev = SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.low;
                return (
                  <div key={f.id} style={{ background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ padding: '2px 8px', background: `${catColor}22`, color: catColor, border: `1px solid ${catColor}44`, borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                        {CATEGORY_LABELS[f.category] ?? f.category}
                      </span>
                      <SeverityBadge severity={f.severity} />
                      <span style={{ fontSize: 11, color: '#718096' }}>Urgency: {f.urgency.replace(/_/g, ' ')}</span>
                      {f.confidence !== null && (
                        <span style={{ fontSize: 11, color: '#718096', marginLeft: 'auto' }}>
                          Confidence: {Math.round((f.confidence ?? 0) * 100)}%
                        </span>
                      )}
                    </div>
                    <blockquote style={{ margin: '0 0 8px', padding: '8px 12px', background: 'rgba(255,255,255,0.7)', borderLeft: `3px solid ${sev.text}`, borderRadius: 4, fontSize: 13, color: '#2D3748', fontStyle: 'italic', lineHeight: 1.6 }}>
                      "{f.excerpt}"
                    </blockquote>
                    <div style={{ fontSize: 12, color: '#4A5568', lineHeight: 1.6, marginBottom: 10 }}>{f.explanation}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {f.status === 'pending' && (
                        <>
                          <button onClick={() => handleFindingStatus(f.id, 'confirmed')} style={{ padding: '4px 10px', fontSize: 11, background: '#C6F6D5', color: '#276749', border: '1px solid #9AE6B4', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>✓ Confirm</button>
                          <button onClick={() => handleFindingStatus(f.id, 'dismissed')} style={{ padding: '4px 10px', fontSize: 11, background: '#FED7D7', color: '#C53030', border: '1px solid #FEB2B2', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>✕ Dismiss</button>
                          <button onClick={() => handleFindingStatus(f.id, 'false_positive')} style={{ padding: '4px 10px', fontSize: 11, background: '#EDF2F7', color: '#718096', border: '1px solid #CBD5E0', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>⊘ False Positive</button>
                        </>
                      )}
                      {f.status !== 'pending' && (
                        <span style={{ fontSize: 11, padding: '4px 10px', background: '#EDF2F7', borderRadius: 5, color: '#4A5568', fontWeight: 600 }}>
                          Status: {f.status.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Transcript tab ── */}
          {activeTab === 'transcript' && (
            <div>
              {call?.transcript_language && (
                <div style={{ fontSize: 12, color: '#718096', marginBottom: 8 }}>
                  Language: <strong>{call.transcript_language.toUpperCase()}</strong>
                  {call.transcript && <span style={{ marginLeft: 12 }}>Words: <strong>{call.transcript.split(/\s+/).filter(Boolean).length}</strong></span>}
                  {call.duration_seconds && <span style={{ marginLeft: 12 }}>Duration: <strong>{Math.round(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</strong></span>}
                </div>
              )}
              {!call?.transcript && !loading && (
                <div style={{ textAlign: 'center', padding: 32, color: '#A0AEC0' }}>
                  {call?.status === 'transcription_failed'
                    ? '❌ Transcription failed. ' + (call.notes ?? '')
                    : 'No transcript available.'}
                </div>
              )}
              {call?.transcript && (
                <div style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px', maxHeight: '50vh', overflowY: 'auto' }}>
                  <HighlightedTranscript transcript={call.transcript} findings={findings} />
                </div>
              )}
              {findings.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 11, color: '#718096' }}>
                  🔴 Highlighted sections correspond to AE findings
                </div>
              )}
            </div>
          )}

          {/* ── SLA tab ── */}
          {activeTab === 'sla' && call && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'SLA Status', value: <StatusBadge value={call.sla_status} type="status" /> },
                  { label: 'Escalation Level', value: call.escalation_level },
                  { label: 'Max Severity', value: <SeverityBadge severity={call.max_severity} /> },
                  { label: 'AE Count', value: call.ae_count },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
                  </div>
                ))}
              </div>
              {call.deadline_at && (
                <div style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#718096', marginBottom: 6 }}>Deadline</div>
                  <SlaTimer deadlineAt={call.deadline_at} slaStatus={call.sla_status} />
                </div>
              )}
              {call.detected_at && (
                <div style={{ fontSize: 12, color: '#718096' }}>
                  Detected at: {new Date(call.detected_at).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {/* ── Submit tab ── */}
          {activeTab === 'submit' && call && (
            <div>
              <div style={{ fontSize: 13, color: '#4A5568', marginBottom: 16, lineHeight: 1.6 }}>
                Update the call status to progress through the regulatory workflow. Use notes to document your review decision.
              </div>
              <textarea
                placeholder="Add review notes (optional)…"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  disabled={updating}
                  onClick={() => handleStatusUpdate('reviewed')}
                  style={{ padding: '8px 16px', background: '#C6F6D5', color: '#276749', border: '1px solid #9AE6B4', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: updating ? 'not-allowed' : 'pointer' }}
                >
                  ✓ Mark Reviewed
                </button>
                <button
                  disabled={updating}
                  onClick={() => handleStatusUpdate('reported')}
                  style={{ padding: '8px 16px', background: '#BEE3F8', color: '#2B6CB0', border: '1px solid #90CDF4', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: updating ? 'not-allowed' : 'pointer' }}
                >
                  📋 Mark Reported
                </button>
                <button
                  disabled={updating}
                  onClick={() => handleStatusUpdate('dismissed')}
                  style={{ padding: '8px 16px', background: '#FED7D7', color: '#C53030', border: '1px solid #FEB2B2', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: updating ? 'not-allowed' : 'pointer' }}
                >
                  ✕ Dismiss
                </button>
                <button
                  disabled={updating}
                  onClick={() => handleStatusUpdate('false_positive')}
                  style={{ padding: '8px 16px', background: '#EDF2F7', color: '#718096', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: updating ? 'not-allowed' : 'pointer' }}
                >
                  ⊘ False Positive
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main CallsPage ───────────────────────────────────────────────────────────

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CallsFilter>({});
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const filterKey = JSON.stringify(filter);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCalls(filter);
      setCalls(data.calls);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>Call Recording Analysis</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#718096' }}>
          Platform-agnostic post-call adverse event detection. Works with Amazon Connect, Genesys, RingCentral, or any platform via direct upload.
        </p>
      </div>

      {/* Upload card */}
      <UploadCard onUploaded={(callId) => { load(); setSelectedCallId(callId); }} />

      {/* Error banner */}
      {error && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#C53030', fontSize: 13 }}>
          ⚠️ {error}{' '}
          <button onClick={load} style={{ background: 'none', border: 'none', color: '#C53030', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Retry</button>
        </div>
      )}

      {/* Filter + list */}
      <CallsFilterBar filter={filter} onChange={setFilter} total={total} />
      <CallsList
        calls={calls}
        loading={loading}
        onSelect={(c) => setSelectedCallId(c.id)}
        selectedId={selectedCallId ?? undefined}
      />

      {/* Modal */}
      {selectedCallId && (
        <CallDetailModal
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
          onStatusChange={load}
        />
      )}
    </div>
  );
}
