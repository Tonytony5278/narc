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
import type { EventsFilter } from './api/client';
import { clearAllEvents } from './api/client';

type ActiveTab = 'events' | 'audit' | 'policy' | 'monographs' | 'users' | 'monitor';

export default function App() {
  const { user, isAuthenticated, isAdmin, login, logout } = useAuth();
  const [tab, setTab] = useState<ActiveTab>('events');
  const [filter, setFilter] = useState<EventsFilter>({});
  const { events, total, loading, error, refresh, updateStatus, newEvents, clearNewEvents } = useEvents(filter);

  // Dev mode: if NARC_AUTH is not set, backend bypasses auth (mock admin UUID)
  const [devBypass, setDevBypass] = useState<boolean>(false);
  const [clearing, setClearing] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check dev bypass on first load
  React.useEffect(() => {
    fetch('/api/events?limit=1')
      .then((r) => { if (r.ok) setDevBypass(true); })
      .catch(() => {});
    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Show toast + browser notification when new AE events arrive
  useEffect(() => {
    if (newEvents.length === 0) return;
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 8000);

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      const critical = newEvents.filter((e) => e.maxSeverity === 'critical' || e.maxSeverity === 'high');
      const title = critical.length > 0
        ? `🚨 NARC: ${critical.length} critical/high AE detected`
        : `⚠️ NARC: ${newEvents.length} new AE event${newEvents.length > 1 ? 's' : ''} detected`;
      const body = newEvents[0].subject ?? 'New adverse event requires review';
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }, [newEvents]);

  // Show login page if not authenticated and not in dev bypass mode
  if (!isAuthenticated && !devBypass) {
    return <LoginPage onLogin={async (email, password) => { await login(email, password); }} />;
  }

  const navBtn = (id: ActiveTab, label: string, adminOnly = false) => {
    if (adminOnly && !isAdmin && !devBypass) return null;
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
          borderBottom: tab === id ? '2px solid #9B2335' : '2px solid transparent',
          color: tab === id ? '#fff' : '#A0AEC0',
          fontWeight: tab === id ? 600 : 400,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'color 0.15s',
          position: 'relative',
        }}
      >
        {label}
        {showBadge && (
          <span style={{
            position: 'absolute', top: 8, right: 4,
            background: '#E53E3E', color: '#fff',
            borderRadius: '50%', width: 16, height: 16,
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {newEvents.length > 9 ? '9+' : newEvents.length}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F5F7FA' }}>
      {/* Top nav */}
      <header style={{ background: '#1a1a2e', color: '#fff', padding: '0 24px', height: 54, display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        {/* Logo + tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 20, borderRight: '1px solid rgba(255,255,255,0.1)', marginRight: 8 }}>
            <div style={{ width: 30, height: 30, background: '#9B2335', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>⚕</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', lineHeight: 1.2 }}>NARC</div>
              <div style={{ fontSize: 10, color: '#A0AEC0' }}>Pharmacovigilance</div>
            </div>
          </div>
          {navBtn('events', 'Events')}
          {navBtn('audit', 'Audit Log', true)}
          {navBtn('policy', 'Policy', true)}
          {navBtn('monographs', 'Monographs', true)}
          {navBtn('users', 'Users', true)}
          {navBtn('monitor', '📡 Monitor', true)}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {tab === 'events' && (
            <>
              <button onClick={refresh} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                ↺ Refresh
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
                  style={{ padding: '4px 10px', background: 'rgba(197,48,48,0.3)', color: '#FEB2B2', border: '1px solid rgba(197,48,48,0.5)', borderRadius: 6, fontSize: 12, cursor: clearing ? 'not-allowed' : 'pointer', opacity: clearing ? 0.6 : 1 }}
                >
                  {clearing ? 'Clearing…' : '🗑 Clear All'}
                </button>
              )}
            </>
          )}
          {devBypass && !user && (
            <span style={{ fontSize: 11, color: '#F6AD55', padding: '2px 8px', border: '1px solid #F6AD55', borderRadius: 4 }}>Dev mode</span>
          )}
          {user && (
            <span style={{ fontSize: 12, color: '#A0AEC0' }}>
              {user.email} <span style={{ fontSize: 10, color: '#718096', padding: '1px 5px', background: 'rgba(255,255,255,0.07)', borderRadius: 3, marginLeft: 4 }}>{user.role}</span>
            </span>
          )}
          {(user || isAuthenticated) && (
            <button onClick={logout} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.07)', color: '#A0AEC0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px' }}>

        {/* ── Events tab ── */}
        {tab === 'events' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>Adverse Event Review</h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#718096' }}>
                Review and manage adverse events detected by NARC. SLA timers update in real-time.
              </p>
            </div>

            {error && (
              <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#C53030', fontSize: 13 }}>
                ⚠️ {error}{' '}
                <button onClick={refresh} style={{ background: 'none', border: 'none', color: '#C53030', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Retry</button>
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

        {/* ── Audit Log tab ── */}
        {tab === 'audit' && <AuditLogPage />}

        {/* ── Policy tab ── */}
        {tab === 'policy' && <PolicyPage />}

        {/* ── Monographs tab ── */}
        {tab === 'monographs' && <MonographPage />}

        {/* ── Users tab ── */}
        {tab === 'users' && <UsersPage />}

        {/* ── Monitor tab ── */}
        {tab === 'monitor' && <MonitorPage />}

      </main>

      {/* ── New AE Toast Notification ── */}
      {toastVisible && newEvents.length > 0 && (
        <div
          onClick={() => { setTab('events'); clearNewEvents(); setToastVisible(false); }}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            background: newEvents.some(e => e.maxSeverity === 'critical' || e.maxSeverity === 'high') ? '#9B2335' : '#744210',
            color: '#fff', borderRadius: 12, padding: '14px 20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            cursor: 'pointer', maxWidth: 340,
            animation: 'slideIn 0.3s ease',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}
        >
          <span style={{ fontSize: 22, flexShrink: 0 }}>
            {newEvents.some(e => e.maxSeverity === 'critical' || e.maxSeverity === 'high') ? '🚨' : '⚠️'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
              {newEvents.length} new AE event{newEvents.length > 1 ? 's' : ''} detected
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
              {newEvents[0].subject ?? 'Adverse event requires review'}
              {newEvents.length > 1 ? ` (+${newEvents.length - 1} more)` : ''}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Click to review →</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setToastVisible(false); }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
