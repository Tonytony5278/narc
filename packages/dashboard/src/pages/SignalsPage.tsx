/**
 * Signal Detection Page
 *
 * Aggregates adverse event data to surface pharmacovigilance signals.
 * Shows:
 *   - High-level summary metrics (KPI cards)
 *   - Event timeline chart (pure CSS/SVG — no chart library dependency)
 *   - Per-drug signal ranking with risk scores and trend indicators
 *   - Per-category AE frequency breakdown
 *
 * Data comes from /api/signals endpoints which aggregate across all events.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchSignalSummary,
  fetchDrugSignals,
  fetchCategorySignals,
  fetchSignalTimeline,
  type SignalSummary,
  type DrugSignal,
  type CategorySignal,
  type TimelinePoint,
} from '../api/client';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  adverse_reaction:     'Adverse Reaction',
  off_label_use:        'Off-Label Use',
  off_label_dosing:     'Off-Label Dosing',
  pregnancy_exposure:   'Pregnancy Exposure',
  drug_interaction:     'Drug Interaction',
  serious_adverse_event:'Serious AE',
  overdose:             'Overdose',
  medication_error:     'Medication Error',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#000000',
  high:     '#7B0000',
  medium:   '#C45000',
  low:      '#B07A00',
};

const TREND_ICON: Record<DrugSignal['trend'], string> = {
  rising:  '📈',
  stable:  '➡️',
  falling: '📉',
};

const TREND_COLOR: Record<DrugSignal['trend'], string> = {
  rising:  '#C53030',
  stable:  '#718096',
  falling: '#48BB78',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function riskScoreColor(score: number): string {
  if (score >= 70) return '#C53030';
  if (score >= 40) return '#C25000';
  if (score >= 20) return '#B7791F';
  return '#48BB78';
}

function riskScoreLabel(score: number): string {
  if (score >= 70) return 'HIGH RISK';
  if (score >= 40) return 'MODERATE';
  if (score >= 20) return 'LOW';
  return 'MINIMAL';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  label, value, subtitle, color = '#1a1a2e', icon, borderColor,
}: {
  label: string; value: string | number; subtitle?: string; color?: string; icon?: string; borderColor?: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderTop: borderColor ? `3px solid ${borderColor}` : '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '18px 20px',
      flex: 1, minWidth: 130,
      boxShadow: 'var(--shadow-sm)',
      transition: 'box-shadow var(--transition)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.3 }}>
          {label}
        </div>
        {icon && <span style={{ fontSize: 16, opacity: 0.7 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
      {subtitle && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>{subtitle}</div>
      )}
    </div>
  );
}

/** Pure SVG timeline chart — no external libraries */
function TimelineChart({ data, days }: { data: TimelinePoint[]; days: number }) {
  if (data.length === 0) return null;

  const W = 700, H = 140;
  const PADDING = { top: 10, right: 16, bottom: 32, left: 36 };
  const plotW = W - PADDING.left - PADDING.right;
  const plotH = H - PADDING.top - PADDING.bottom;

  const maxCount = Math.max(...data.map((d) => d.aeCount), 1);
  const step     = plotW / (data.length - 1 || 1);

  const points = (key: keyof TimelinePoint) =>
    data
      .map((d, i) => {
        const v = d[key] as number;
        const x = PADDING.left + i * step;
        const y = PADDING.top + plotH - (v / maxCount) * plotH;
        return `${x},${y}`;
      })
      .join(' ');

  // X-axis labels: show every ~7 days
  const labelInterval = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % labelInterval === 0 || i === data.length - 1);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', maxWidth: W }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = PADDING.top + plotH * (1 - f);
          return (
            <g key={f}>
              <line x1={PADDING.left} y1={y} x2={W - PADDING.right} y2={y}
                stroke="#EDF2F7" strokeWidth="1" />
              <text x={PADDING.left - 4} y={y + 4} textAnchor="end"
                fontSize="9" fill="#A0AEC0">
                {Math.round(maxCount * f)}
              </text>
            </g>
          );
        })}

        {/* AE count area */}
        <polyline
          points={points('aeCount')}
          fill="none" stroke="#9B2335" strokeWidth="2" strokeLinejoin="round"
        />

        {/* Critical highlights */}
        {data.map((d, i) => {
          if (d.criticalCount === 0) return null;
          const x = PADDING.left + i * step;
          const y = PADDING.top + plotH - (d.aeCount / maxCount) * plotH;
          return <circle key={i} cx={x} cy={y} r="4" fill="#C53030" />;
        })}

        {/* X-axis labels */}
        {xLabels.map(({ d, i }) => (
          <text key={i}
            x={PADDING.left + i * step}
            y={H - 4}
            textAnchor="middle"
            fontSize="9" fill="#A0AEC0">
            {d.date.slice(5)} {/* MM-DD */}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 10.5, color: '#718096' }}>
        <span><span style={{ display: 'inline-block', width: 20, height: 2, background: '#9B2335', verticalAlign: 'middle', marginRight: 4 }} />AE Events</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#C53030', verticalAlign: 'middle', marginRight: 4 }} />Critical</span>
      </div>
    </div>
  );
}

function DrugSignalRow({ signal, rank }: { signal: DrugSignal; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const riskColor = riskScoreColor(signal.riskScore);
  const total     = Object.values(signal.severityDistribution).reduce((s, n) => s + n, 0);

  return (
    <div style={{
      border: '1px solid #E2E8F0',
      borderRadius: 8, marginBottom: 8, overflow: 'hidden',
      background: signal.riskScore >= 70 ? '#FFF5F5' : signal.riskScore >= 40 ? '#FFFAF0' : '#fff',
    }}>
      {/* Main row */}
      <div
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: 'flex', alignItems: 'center', padding: '10px 14px',
          cursor: 'pointer', gap: 12,
        }}
      >
        {/* Rank */}
        <div style={{ fontSize: 11, color: '#A0AEC0', width: 20, flexShrink: 0, textAlign: 'right' }}>
          #{rank}
        </div>

        {/* Drug name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{signal.drugName}</div>
          <div style={{ fontSize: 10.5, color: '#718096', marginTop: 1 }}>
            {signal.eventCount} report{signal.eventCount !== 1 ? 's' : ''} ·{' '}
            {signal.findingCount} finding{signal.findingCount !== 1 ? 's' : ''} ·{' '}
            Last: {formatRelative(signal.lastReportedAt)}
          </div>
        </div>

        {/* Trend */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 14 }}>{TREND_ICON[signal.trend]}</div>
          <div style={{ fontSize: 9, color: TREND_COLOR[signal.trend], fontWeight: 700 }}>
            {signal.trend.toUpperCase()}
          </div>
        </div>

        {/* Off-label flags */}
        {signal.offLabelFlags > 0 && (
          <div style={{
            fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: '#FAF5FF', color: '#6B46C1', border: '1px solid #E9D8FD',
            flexShrink: 0,
          }}>
            ⚠ {signal.offLabelFlags} off-label
          </div>
        )}

        {/* Risk score */}
        <div style={{ textAlign: 'center', flexShrink: 0, width: 56 }}>
          <div style={{
            fontSize: 16, fontWeight: 800, color: riskColor, lineHeight: 1,
          }}>
            {signal.riskScore}
          </div>
          <div style={{ fontSize: 8.5, color: riskColor, fontWeight: 700, letterSpacing: '0.04em' }}>
            {riskScoreLabel(signal.riskScore)}
          </div>
        </div>

        <span style={{ color: '#A0AEC0', fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid #EDF2F7', background: 'rgba(255,255,255,0.7)' }}>
          {/* Severity bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#718096', marginBottom: 4 }}>
              Severity distribution ({total} findings)
            </div>
            <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
              {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
                const count = signal.severityDistribution[sev] ?? 0;
                const pct   = total > 0 ? (count / total) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={sev}
                    title={`${sev}: ${count}`}
                    style={{
                      width: `${pct}%`, background: SEVERITY_COLORS[sev],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, color: '#fff', fontWeight: 700, minWidth: pct > 5 ? undefined : 0,
                    }}
                  >
                    {pct > 8 ? count : ''}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, color: '#718096' }}>
              {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
                const count = signal.severityDistribution[sev] ?? 0;
                if (count === 0) return null;
                return (
                  <span key={sev}>
                    <span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                      background: SEVERITY_COLORS[sev], verticalAlign: 'middle', marginRight: 3,
                    }} />
                    {sev}: {count}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Categories */}
          <div style={{ fontSize: 10.5, color: '#4A5568' }}>
            <span style={{ fontWeight: 700, color: '#718096' }}>AE Categories: </span>
            {signal.categories.map((c) => CATEGORY_LABELS[c] ?? c).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryBar({ cat }: { cat: CategorySignal }) {
  const total    = Object.values(cat.severityDistribution).reduce((s, n) => s + n, 0);
  const maxSev   = total > 0
    ? (['critical', 'high', 'medium', 'low'].find((s) => (cat.severityDistribution[s] ?? 0) > 0) ?? 'low')
    : 'low';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '8px 0',
      borderBottom: '1px solid #EDF2F7', gap: 10,
    }}>
      {/* Color dot */}
      <div style={{
        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
        background: SEVERITY_COLORS[maxSev] ?? '#718096',
      }} />

      {/* Label */}
      <div style={{ flex: '0 0 170px', fontSize: 12, fontWeight: 600, color: '#1a1a2e' }}>
        {CATEGORY_LABELS[cat.category] ?? cat.category}
      </div>

      {/* Bar */}
      <div style={{ flex: 1, height: 8, background: '#EDF2F7', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, (cat.findingCount / Math.max(total, 1)) * 100 || (cat.findingCount > 0 ? 20 : 0))}%`,
          minWidth: cat.findingCount > 0 ? 8 : 0,
          height: '100%',
          background: SEVERITY_COLORS[maxSev] ?? '#718096',
          borderRadius: 4,
        }} />
      </div>

      {/* Count */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', minWidth: 40, textAlign: 'right' }}>
        {cat.findingCount}
      </div>
      <div style={{ fontSize: 10, color: '#A0AEC0', minWidth: 50 }}>
        {cat.eventCount} events
      </div>
      <div style={{ fontSize: 10, color: '#A0AEC0', minWidth: 50 }}>
        {(cat.averageConfidence * 100).toFixed(0)}% conf.
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SignalsPage() {
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary,    setSummary]    = useState<SignalSummary | null>(null);
  const [drugs,      setDrugs]      = useState<DrugSignal[]>([]);
  const [categories, setCategories] = useState<CategorySignal[]>([]);
  const [timeline,   setTimeline]   = useState<TimelinePoint[]>([]);
  const [activeTab,  setActiveTab]  = useState<'drugs' | 'categories'>('drugs');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, drugData, catData, timeData] = await Promise.all([
        fetchSignalSummary(days),
        fetchDrugSignals(days),
        fetchCategorySignals(days),
        fetchSignalTimeline(Math.min(days, 60)),
      ]);
      setSummary(sum);
      setDrugs(drugData.signals);
      setCategories(catData.categories);
      setTimeline(timeData.timeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load signals');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
            Signal Detection
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Aggregate pharmacovigilance signal analysis across all adverse event reports.
          </p>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>Period</span>
          {[30, 60, 90, 180, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '5px 12px',
                background: days === d ? 'var(--navy)' : 'var(--bg-card)',
                color: days === d ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${days === d ? 'var(--navy)' : 'var(--border)'}`,
                borderRadius: 7, fontSize: 12, cursor: 'pointer',
                fontWeight: days === d ? 700 : 400,
                transition: 'background var(--transition), color var(--transition)',
              }}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={load}
            style={{
              padding: '5px 10px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 7,
              fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)',
              transition: 'background var(--transition)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; }}
            title="Refresh"
          >↺</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#C53030', fontSize: 13 }}>
          ⚠️ {error}{' '}
          <button onClick={load} style={{ background: 'none', border: 'none', color: '#C53030', textDecoration: 'underline', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {[1,2,3,4,5].map((i) => (
            <div key={i} style={{ flex: 1, height: 80, background: '#EDF2F7', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* KPI cards */}
      {!loading && summary && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <KPICard label="Total Events" value={summary.totalEvents} subtitle={`${days}-day window`} icon="📬" borderColor="#4A5568" />
          <KPICard label="AE Reports" value={summary.totalAEEvents} subtitle={`${summary.totalFindings} findings total`} color="#9B2335" icon="⚕" borderColor="#9B2335" />
          <KPICard label="Critical" value={summary.criticalCount} color="#7F1D1D" icon="🚨" borderColor="#DC2626" />
          <KPICard label="High Severity" value={summary.highCount} color="#7C2D12" icon="🔺" borderColor="#EA580C" />
          <KPICard label="SLA Breached" value={summary.slaBreachedCount} icon="⏱" color={summary.slaBreachedCount > 0 ? '#C53030' : '#276749'} borderColor={summary.slaBreachedCount > 0 ? '#DC2626' : '#10B981'} />
        </div>
      )}

      {/* Timeline chart */}
      {!loading && timeline.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '20px 24px', marginBottom: 20,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                AE Event Timeline
              </h2>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Daily adverse event counts</div>
            </div>
            <span style={{
              fontSize: 11, color: 'var(--text-muted)',
              background: 'var(--bg-subtle)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '3px 10px',
            }}>
              Last {Math.min(days, 60)} days
            </span>
          </div>
          <TimelineChart data={timeline} days={Math.min(days, 60)} />
        </div>
      )}

      {/* Tabs: drugs vs categories */}
      {!loading && (
        <>
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #E2E8F0', marginBottom: 16 }}>
            {(['drugs', 'categories'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  padding: '8px 20px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === t ? '2px solid #9B2335' : '2px solid transparent',
                  color: activeTab === t ? '#1a1a2e' : '#718096',
                  fontWeight: activeTab === t ? 700 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginBottom: -2,
                }}
              >
                {t === 'drugs' ? `💊 Drug Signals (${drugs.length})` : `📋 AE Categories (${categories.length})`}
              </button>
            ))}
          </div>

          {/* Drug signals panel */}
          {activeTab === 'drugs' && (
            <div>
              {drugs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#A0AEC0', fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💊</div>
                  No drug-specific signals detected in this period.
                  <div style={{ fontSize: 11, marginTop: 6 }}>
                    Signals appear when known drug names are mentioned in AE reports.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#718096', marginBottom: 12 }}>
                    {drugs.length} drug{drugs.length !== 1 ? 's' : ''} detected · Sorted by risk score
                    <span style={{ marginLeft: 8, fontSize: 10.5, background: '#FFF5F5', border: '1px solid #FEB2B2', padding: '2px 8px', borderRadius: 10, color: '#C53030' }}>
                      Risk score = volume + severity + off-label + trend
                    </span>
                  </div>
                  {drugs.map((signal, i) => (
                    <DrugSignalRow key={signal.drugName} signal={signal} rank={i + 1} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Category breakdown panel */}
          {activeTab === 'categories' && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px 20px' }}>
              {categories.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#A0AEC0', fontSize: 13 }}>
                  No AE findings in this period.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, padding: '0 0 8px', borderBottom: '1px solid #EDF2F7', marginBottom: 4, fontSize: 10.5, color: '#A0AEC0', fontWeight: 600 }}>
                    <div style={{ width: 10 }} />
                    <div style={{ flex: '0 0 170px' }}>Category</div>
                    <div style={{ flex: 1 }}>Frequency</div>
                    <div style={{ minWidth: 40, textAlign: 'right' }}>Findings</div>
                    <div style={{ minWidth: 50 }}>Events</div>
                    <div style={{ minWidth: 50 }}>Confidence</div>
                  </div>
                  {categories.map((cat) => (
                    <CategoryBar key={cat.category} cat={cat} />
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Disclaimer */}
      <div style={{
        marginTop: 24, background: '#EBF8FF', border: '1px solid #BEE3F8',
        borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#2B6CB0', lineHeight: 1.6,
      }}>
        <strong>ℹ️ Signal Detection Methodology:</strong> Risk scores are calculated from report volume, severity distribution,
        off-label use flags, and trend direction over the selected period. This is a screening tool only.
        All identified signals require qualified pharmacovigilance review before regulatory reporting.
        Signals are based on AI-extracted text and may contain false positives.
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
