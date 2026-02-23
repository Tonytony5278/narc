import React, { useState, useEffect } from 'react';
import { fetchMonographs, updateMonograph, type MonographRecord } from '../api/client';

export default function MonographPage() {
  const [monographs, setMonographs] = useState<MonographRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MonographRecord | null>(null);
  const [editDraft, setEditDraft] = useState<MonographRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [signalsText, setSignalsText] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMonographs();
      setMonographs(data);
    } catch (err) {
      console.error('Failed to load monographs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (m: MonographRecord) => {
    setSelected(m);
    setEditDraft({ ...m });
    setSignalsText(JSON.stringify(m.off_label_signals, null, 2));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editDraft) return;
    setSaving(true);
    setSaveError(null);
    try {
      let signals = editDraft.off_label_signals;
      try { signals = JSON.parse(signalsText); } catch { /* keep existing */ }
      await updateMonograph(editDraft.id, { ...editDraft, off_label_signals: signals });
      await load();
      setSelected(null);
      setEditDraft(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid #CBD5E0',
    borderRadius: 6, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#718096', fontSize: 13 }}>Loading monographs…</div>;
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Left: drug list */}
      <div style={{ flex: '0 0 300px' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>Drug Monographs</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#718096' }}>
            Health Canada monograph data for off-label detection.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {monographs.map((m) => (
            <button key={m.id} onClick={() => openEdit(m)}
              style={{
                textAlign: 'left', padding: '12px 14px',
                background: selected?.id === m.id ? '#EBF4FF' : '#fff',
                border: `1px solid ${selected?.id === m.id ? '#BEE3F8' : '#E2E8F0'}`,
                borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{m.brand_name}</div>
              <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>{m.generic_name}</div>
              <div style={{ fontSize: 11, color: '#A0AEC0', marginTop: 3 }}>
                {m.approved_indications.length} indication{m.approved_indications.length !== 1 ? 's' : ''} · {m.off_label_signals.length} signal{m.off_label_signals.length !== 1 ? 's' : ''}
                {m.din && <> · DIN {m.din}</>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: edit form */}
      <div style={{ flex: 1 }}>
        {!editDraft ? (
          <div style={{ background: '#F7FAFC', border: '2px dashed #E2E8F0', borderRadius: 10, padding: 40, textAlign: 'center', color: '#A0AEC0', fontSize: 13, marginTop: 48 }}>
            Select a drug monograph to view and edit
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, color: '#1a1a2e' }}>{editDraft.brand_name}</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setSelected(null); setEditDraft(null); }}
                  style={{ padding: '6px 14px', background: '#fff', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#718096' }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '6px 14px', background: '#2D6A4F', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

            {saveError && (
              <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 6, padding: '8px 12px', marginBottom: 14, color: '#C53030', fontSize: 12 }}>
                {saveError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Brand Name</label>
                <input value={editDraft.brand_name} onChange={(e) => setEditDraft({ ...editDraft, brand_name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Generic Name</label>
                <input value={editDraft.generic_name} onChange={(e) => setEditDraft({ ...editDraft, generic_name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>DIN (Health Canada)</label>
                <input value={editDraft.din ?? ''} onChange={(e) => setEditDraft({ ...editDraft, din: e.target.value || null })} placeholder="e.g. 02479435" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Max Daily Dose</label>
                <input value={editDraft.max_daily_dose ?? ''} onChange={(e) => setEditDraft({ ...editDraft, max_daily_dose: e.target.value || null })} placeholder="e.g. 10 mg/kg" style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>
                Approved Indications <span style={{ fontWeight: 400, textTransform: 'none' }}>(one per line)</span>
              </label>
              <textarea
                value={editDraft.approved_indications.join('\n')}
                onChange={(e) => setEditDraft({ ...editDraft, approved_indications: e.target.value.split('\n').filter(Boolean) })}
                rows={4} style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Notes</label>
              <textarea
                value={editDraft.notes ?? ''}
                onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value || null })}
                rows={2} style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Clinical context, pregnancy category, etc."
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>
                Off-Label Signals <span style={{ fontWeight: 400, textTransform: 'none' }}>(JSON array of <code>{'{pattern, flag}'}</code>)</span>
              </label>
              <textarea
                value={signalsText}
                onChange={(e) => setSignalsText(e.target.value)}
                rows={8}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                spellCheck={false}
              />
              <div style={{ fontSize: 11, color: '#A0AEC0', marginTop: 4 }}>
                Pattern is a pipe-separated regex. Flag is the human-readable warning for nurses.
              </div>
            </div>

            {/* Preview: approved dosing (read-only display) */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 6 }}>Approved Dosing (read-only preview)</div>
              <div style={{ background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#4A5568', lineHeight: 1.7 }}>
                {Object.entries(editDraft.approved_dosing).map(([k, v]) => (
                  <div key={k}><strong>{k}:</strong> {v}</div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#A0AEC0', marginTop: 4 }}>
                To edit approved_dosing, use the backend API (PUT /api/monographs/:id).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
