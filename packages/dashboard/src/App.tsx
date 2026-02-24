import React, { useState, useEffect, useRef } from 'react';
import FilterBar from './components/FilterBar';
import EventsTable from './components/EventsTable';
import { useEvents } from './hooks/useEvents';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import AuditLogPage from './pages/AuditLogPage';
import PolicyPage from './pages/PolicyPage';
import MonographPage from './pages/MonographPage';
import UsersPage from './pages/UsersPage';
import MonitorPage from './pages/MonitorPage';
import SignalsPage from './pages/SignalsPage';
import RegulatoryPage from './pages/RegulatoryPage';
import CallsPage from './pages/CallsPage';
import type { EventsFilter } from './api/client';
import { clearAllEvents } from './api/client';

type ActiveTab = 'events' | 'calls' | 'signals' | 'regulatory' | 'audit' | 'policy' | 'monographs' | 'users' | 'monitor';

const NAV_ITEMS: { id: ActiveTab; label: string; adminOnly?: boolean }[] = [
  { id: 'events',      label: 'Events' },
  { id: 'calls',       label: 'Calls',       adminOnly: true },
  { id: 'signals',     label: 'Signals',     adminOnly: true },
  { id: 'regulatory',  label: 'Regulatory',  adminOnly: true },
  { id: 'monitor',     label: 'Monitor',     adminOnly: true },
  { id: 'monographs',  label: 'Monographs',  adminOnly: true },
  { id: 'policy',      label: 'Policy',      adminOnly: true },
  { id: 'audit',       label: 'Audit Log',   adminOnly: true },
  { id: 'users',       label: 'Users',       adminOnly: true },
];

/** Human-readable labels for backend role slugs */
const ROLE_DISPLAY: Record<string, string> = {
  admin:      'Administrator',
  supervisor: 'Supervisor',
  agent:      'Case Manager',
};

export default function App() {
  const { user, isAuthenticated, isAdmin, login, logout } = useAuth();
  const [tab, setTab] = useState<ActiveTab>('events');
  const [filter, setFilter] = useState<EventsFilter>({});
  const { events, total, loading, error, refresh, updateStatus, newEvents, clearNewEvents } = useEvents(filter);

  const [devBypass, setDevBypass] = useState<boolean>(false);
  const [clearing, setClearing] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check dev bypass on first load
  React.useEffect(() => {
    fetch('/api/events?limit=1')
      .then((r) => { if (r.ok) setDevBypass(true); })
      .catch(() => {});
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Toast + browser notification when new AE events arrive
  useEffect(() => {
    if (newEvents.length === 0) return;
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 8000);
    if ('Notification' in window && Notification.permission === 'granted') {
      const critical = newEvents.filter((e) => e.maxSeverity === 'critical' || e.maxSeverity === 'high');
      const title = critical.length > 0
        ? `🚨 NARC: ${critical.length} critical/high AE detected`
        : `⚠️ NARC: ${newEvents.length} new AE event${newEvents.length > 1 ? 's' : ''} detected`;
      new Notification(title, {
        body: newEvents[0].subject ?? 'New adverse event requires review',
        icon: '/favicon.ico',
      });
    }
  }, [newEvents]);

  if (!isAuthenticated && !devBypass) {
    return <LoginPage onLogin={async (email, password) => { await login(email, password); }} />;
  }

  // Stats for status bar
  const pendingCount   = events.filter(e => e.status === 'pending').length;
  const criticalCount  = events.filter(e => e.maxSeverity === 'critical').length;
  const escalatedCount = events.filter(e => e.status === 'escalated').length;

  const canAccess = (adminOnly?: boolean) => !adminOnly || isAdmin || devBypass;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>

      {/* ── Top Nav ── */}
      <header style={{
        background: 'var(--navy)',
        color: '#fff',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 200,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}>
        {/* Left: Logo + tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {/* Logo */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            paddingRight: 20, marginRight: 4,
            borderRight: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div style={{
              width: 32, height: 32,
              background: 'linear-gradient(135deg, #9B2335, #C53030)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(155,35,53,0.4)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5z"
                  fill="rgba(255,255,255,0.92)" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em', lineHeight: 1.1 }}>NARC</div>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Pharmacovigilance
              </div>
            </div>
          </div>

          {/* Nav tabs */}
          {NAV_ITEMS.filter(n => canAccess(n.adminOnly)).map(({ id, label }) => {
            const isActive  = tab === id;
            const showBadge = id === 'events' && newEvents.length > 0;
            return (
              <button
                key={id}
                onClick={() => { setTab(id); if (id === 'events') clearNewEvents(); }}
                style={{
                  padding: '0 16px',
                  height: '100%',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #9B2335' : '2px solid transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 13,
                  letterSpacing: '0.01em',
                  cursor: 'pointer',
                  transition: 'color var(--transition)',
                  position: 'relative',
                  display: 'flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.82)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
              >
                {label}
                {showBadge && (
                  <span style={{
                    background: '#9B2335', color: '#fff',
                    borderRadius: 10, minWidth: 18, height: 18,
                    fontSize: 9.5, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px',
                    letterSpacing: 0,
                  }}>
                    {newEvents.length > 9 ? '9+' : newEvents.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab === 'events' && (
            <>
              <button
                onClick={refresh}
                style={{
                  padding: '5px 12px', background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  transition: 'background var(--transition)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              >
                <span style={{ fontSize: 13 }}>↺</span> Refresh
              </button>
              {(isAdmin || devBypass) && (
                <button
                  disabled={clearing}
                  onClick={async () => {
                    if (!confirm('Delete ALL events and findings? This cannot be undone.')) return;
                    setClearing(true);
                    try { const n = await clearAllEvents(); refresh(); alert(`Cleared ${n} event(s).`); }
                    catch (err) { alert(err instanceof Error ? err.message : 'Clear failed'); }
                    finally { setClearing(false); }
                  }}
                  style={{
                    padding: '5px 12px', background: 'rgba(197,48,48,0.2)',
                    color: '#FC8181', border: '1px solid rgba(197,48,48,0.35)',
                    borderRadius: 6, fontSize: 12,
                    cursor: clearing ? 'not-allowed' : 'pointer',
                    opacity: clearing ? 0.6 : 1,
                  }}
                >
                  {clearing ? '…' : '🗑 Clear All'}
                </button>
              )}
            </>
          )}

          {/* Dev mode badge */}
          {devBypass && !user && (
            <span style={{
              fontSize: 10.5, color: '#F6AD55', padding: '3px 8px',
              border: '1px solid rgba(246,173,85,0.4)', borderRadius: 4,
              background: 'rgba(246,173,85,0.08)',
              letterSpacing: '0.03em',
            }}>
              ⚡ Dev
            </span>
          )}

          {/* User info */}
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, #9B2335, #C53030)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.85)', fontWeight: 500, lineHeight: 1.2 }}>
                  {user.email.split('@')[0]}
                </div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {ROLE_DISPLAY[user.role] ?? user.role}
                </div>
              </div>
            </div>
          )}

          {(user || isAuthenticated) && (
            <button
              onClick={logout}
              style={{
                padding: '5px 10px', background: 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, fontSize: 12, cursor: 'pointer',
                transition: 'background var(--transition)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* ── Status bar (events tab only) ── */}
      {tab === 'events' && (pendingCount > 0 || criticalCount > 0 || escalatedCount > 0) && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(155,35,53,0.06) 0%, transparent 100%)',
          borderBottom: '1px solid rgba(155,35,53,0.12)',
          padding: '6px 24px',
          display: 'flex', gap: 20, alignItems: 'center',
          fontSize: 12,
        }}>
          <span style={{ color: '#718096', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Status:
          </span>
          {pendingCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#744210' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D69E2E', display: 'inline-block' }} />
              <strong>{pendingCount}</strong> pending review
            </span>
          )}
          {criticalCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#C53030' }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#C53030',
                display: 'inline-block', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
              }} />
              <strong>{criticalCount}</strong> critical
            </span>
          )}
          {escalatedCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#721C24' }}>
              <span style={{ fontSize: 10 }}>🔺</span>
              <strong>{escalatedCount}</strong> escalated
            </span>
          )}
        </div>
      )}

      {/* ── Main content ── */}
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px' }}>

        {/* Events tab */}
        {tab === 'events' && (
          <>
            <div style={{ marginBottom: 22 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                Adverse Event Review
              </h1>
              <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Review and manage AI-detected adverse events. SLA timers update live.
              </p>
            </div>

            {error && (
              <div style={{
                background: 'var(--danger-bg)', border: '1px solid #FEB2B2',
                borderRadius: 8, padding: '12px 16px', marginBottom: 16,
                color: 'var(--danger)', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>⚠️</span>
                <span>{error}</span>
                <button onClick={refresh} style={{
                  background: 'none', border: 'none', color: 'var(--danger)',
                  textDecoration: 'underline', cursor: 'pointer', fontSize: 13, marginLeft: 'auto',
                }}>Retry</button>
              </div>
            )}

            <FilterBar filter={filter} onChange={setFilter} total={total} />
            <EventsTable
              events={events}
              loading={loading}
              onStatusChange={updateStatus}
              onDelete={() => refresh()}
              userRole={user?.role ?? (devBypass ? 'admin' : undefined)}
            />
          </>
        )}

        {tab === 'calls'       && <CallsPage />}
        {tab === 'audit'       && <AuditLogPage />}
        {tab === 'policy'      && <PolicyPage />}
        {tab === 'monographs'  && <MonographPage />}
        {tab === 'users'       && <UsersPage />}
        {tab === 'monitor'     && <MonitorPage />}
        {tab === 'signals'     && <SignalsPage />}
        {tab === 'regulatory'  && <RegulatoryPage userRole={user?.role ?? (devBypass ? 'admin' : 'agent')} />}
      </main>

      {/* ── New AE Toast ── */}
      {toastVisible && newEvents.length > 0 && (
        <div
          onClick={() => { setTab('events'); clearNewEvents(); setToastVisible(false); }}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            background: newEvents.some(e => e.maxSeverity === 'critical' || e.maxSeverity === 'high')
              ? 'linear-gradient(135deg, #9B2335, #C53030)'
              : 'linear-gradient(135deg, #744210, #C45000)',
            color: '#fff', borderRadius: 12, padding: '16px 20px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
            cursor: 'pointer', maxWidth: 360,
            animation: 'slideIn 0.35s cubic-bezier(0.16,1,0.3,1) both',
            display: 'flex', alignItems: 'flex-start', gap: 14,
          }}
        >
          <span style={{ fontSize: 24, flexShrink: 0, marginTop: -2 }}>
            {newEvents.some(e => e.maxSeverity === 'critical' || e.maxSeverity === 'high') ? '🚨' : '⚠️'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, lineHeight: 1.3 }}>
              {newEvents.length} new AE event{newEvents.length > 1 ? 's' : ''} detected
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8, lineHeight: 1.4 }}>
              {newEvents[0].subject ?? 'Adverse event requires review'}
              {newEvents.length > 1 ? ` (+${newEvents.length - 1} more)` : ''}
            </div>
            <div style={{
              fontSize: 11, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              Click to review <span style={{ fontSize: 12 }}>→</span>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setToastVisible(false); }}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              borderRadius: 6, padding: '3px 7px', cursor: 'pointer',
              fontSize: 13, flexShrink: 0,
              transition: 'background var(--transition)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          >✕</button>
        </div>
      )}
    </div>
  );
}
