import React, { useState, useEffect, useCallback } from 'react';
import { fetchAuditLog, type AuditEntry } from '../api/client';

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterActor, setFilterActor] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLog({
        actor: filterActor || undefined,
        action: filterAction || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [filterActor, filterAction, filterFrom, filterTo, page]);

  useEffect(() => { load(); }, [load]);

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #CBD5E0', borderRadius: 6,
    fontSize: 13, background: '#fff', color: '#1a1a2e',
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>Audit Log</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#718096' }}>
          SHA-256 hash-chained immutable audit trail. {total.toLocaleString()} entries total.
        </p>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Actor ID</label>
          <input value={filterActor} onChange={(e) => { setFilterActor(e.target.value); setPage(0); }} placeholder="UUID or email…" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>Action</label>
          <input value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setPage(0); }} placeholder="analyze.email…" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>From</label>
          <input type="date" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setPage(0); }} style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', marginBottom: 4 }}>To</label>
          <input type="date" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setPage(0); }} style={inputStyle} />
        </div>
        <button onClick={() => { setFilterActor(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); setPage(0); }}
          style={{ padding: '6px 12px', background: '#fff', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#718096' }}>
          Clear
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#718096', fontSize: 13 }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#A0AEC0', fontSize: 13 }}>No audit entries found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F7FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['#', 'Timestamp', 'Actor', 'Action', 'Entity', 'Hash', ''].map((h) => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#718096', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr style={{ borderBottom: '1px solid #EDF2F7', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F7FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '8px 12px', color: '#A0AEC0', fontVariantNumeric: 'tabular-nums' }}>{entry.sequence}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#4A5568' }}>
                      {new Date(entry.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#4A5568', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.actor_id ? entry.actor_id.slice(0, 8) + '…' : '—'}
                      {entry.actor_role && <span style={{ marginLeft: 4, fontSize: 10, color: '#A0AEC0', padding: '1px 4px', background: '#EDF2F7', borderRadius: 3 }}>{entry.actor_role}</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <code style={{ fontSize: 11, background: '#EDF2F7', padding: '1px 5px', borderRadius: 3, color: '#1a1a2e' }}>{entry.action}</code>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#718096', fontSize: 11 }}>
                      <span style={{ color: '#4A5568', fontWeight: 500 }}>{entry.entity_type}</span>
                      <span style={{ marginLeft: 4, color: '#A0AEC0' }}>{entry.entity_id.slice(0, 8)}…</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <code style={{ fontSize: 10, color: '#718096' }}>{entry.hash.slice(0, 12)}…</code>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <button onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        style={{ fontSize: 11, padding: '2px 8px', background: '#EBF4FF', color: '#2B6CB0', border: '1px solid #BEE3F8', borderRadius: 5, cursor: 'pointer' }}>
                        {expanded === entry.id ? 'Hide' : 'Detail'}
                      </button>
                    </td>
                  </tr>
                  {expanded === entry.id && (
                    <tr style={{ background: '#F7FAFC' }}>
                      <td colSpan={7} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', marginBottom: 4 }}>Before</div>
                            <pre style={{ margin: 0, fontSize: 11, color: '#4A5568', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: '8px 10px', overflow: 'auto', maxHeight: 120 }}>
                              {entry.before_state ? JSON.stringify(entry.before_state, null, 2) : 'null'}
                            </pre>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', marginBottom: 4 }}>After</div>
                            <pre style={{ margin: 0, fontSize: 11, color: '#4A5568', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: '8px 10px', overflow: 'auto', maxHeight: 120 }}>
                              {entry.after_state ? JSON.stringify(entry.after_state, null, 2) : 'null'}
                            </pre>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 10, color: '#A0AEC0' }}>
                          Full hash: <code style={{ letterSpacing: '0.03em' }}>{entry.hash}</code>
                          {entry.ip_address && <> · IP: {entry.ip_address}</>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13 }}>
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
            style={{ padding: '5px 12px', border: '1px solid #CBD5E0', borderRadius: 6, background: '#fff', cursor: page === 0 ? 'not-allowed' : 'pointer', color: '#4A5568' }}>
            ← Prev
          </button>
          <span style={{ color: '#718096' }}>Page {page + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
            style={{ padding: '5px 12px', border: '1px solid #CBD5E0', borderRadius: 6, background: '#fff', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: '#4A5568' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
