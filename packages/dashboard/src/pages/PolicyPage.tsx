import React, { useState, useEffect } from 'react';
import { fetchPolicies, activatePolicy, type PolicyVersion } from '../api/client';

export default function PolicyPage() {
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPolicies();
      setVersions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      await activatePolicy(id);
      await load(); // reload to reflect new active
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate policy');
    } finally {
      setActivating(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>Detection Policy</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#718096' }}>
          Manage versioned detection rules that fine-tune Claude's AE detection behavior.
        </p>
      </div>

      {error && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#C53030', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#718096', fontSize: 13 }}>Loading…</div>
      ) : versions.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 40, textAlign: 'center', color: '#A0AEC0', fontSize: 13 }}>
          No policy versions found. Policies are created via the backend admin API.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {versions.map((v) => (
            <div key={v.id} style={{
              background: '#fff',
              border: `1px solid ${v.is_active ? '#9AE6B4' : '#E2E8F0'}`,
              borderLeft: `4px solid ${v.is_active ? '#276749' : '#CBD5E0'}`,
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>{v.name}</span>
                  <code style={{ fontSize: 11, background: '#EDF2F7', padding: '1px 6px', borderRadius: 3, color: '#4A5568' }}>v{v.version}</code>
                  {v.is_active && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#D4EDDA', color: '#155724' }}>● ACTIVE</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#718096' }}>
                  Created {new Date(v.created_at).toLocaleDateString()}
                  {v.effective_date && <> · Effective {new Date(v.effective_date).toLocaleDateString()}</>}
                </div>
              </div>
              {!v.is_active && (
                <button
                  onClick={() => handleActivate(v.id)}
                  disabled={activating === v.id}
                  style={{ padding: '7px 16px', background: '#2D6A4F', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: activating === v.id ? 'not-allowed' : 'pointer' }}
                >
                  {activating === v.id ? 'Activating…' : 'Activate'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', fontSize: 12, color: '#718096', lineHeight: 1.7 }}>
        <strong style={{ color: '#4A5568' }}>Policy notes:</strong><br />
        • Detection rules allow supervisor calibration of Claude's sensitivity per AE category.<br />
        • Active policy is injected into every analysis prompt as keyword emphasis hints.<br />
        • Confidence scores are calibrated by ±0.1 based on rule match (boost/suppress).<br />
        • Changing the active policy only affects new analyses — existing events are unchanged.<br />
        • New policy versions are created via the backend API (POST /api/admin/policy).
      </div>
    </div>
  );
}
