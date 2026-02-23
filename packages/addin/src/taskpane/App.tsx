import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AEFindingRecord } from '@narc/shared';
import Badge from './components/Badge';
import { SEVERITY_PALETTE } from './components/Badge';
import AEList from './components/AEList';
import LoadingState from './components/LoadingState';
import EmptyState from './components/EmptyState';
import LoginScreen from './components/LoginScreen';
import AttachmentBadge from './components/AttachmentBadge';
import MonographCard from './components/MonographCard';
import AttachmentScanPanel from './components/AttachmentScanPanel';
import {
  getEmailContext,
  fetchInboxMessages,
  ensureNarcCategories,
  applyAECategoryToMessage,
  convertToRestId,
  warmUpRestToken,
  type InboxMessage,
} from '../utils/office';
import { analyzeEmail, fetchMonographs, logout, BACKEND_URL, type MonographSummary } from '../utils/api';
import { getToken, getUser, clearToken } from '../utils/auth';

// ─── Types ─────────────────────────────────────────────────────────────────

type EmailState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; eventId: string; findings: AEFindingRecord[]; summary: string; maxSeverity: string; monograph: MonographSummary | null }
  | { phase: 'empty' }
  | { phase: 'error'; message: string }
  | { phase: 'no-email' };

interface InboxItem {
  msg: InboxMessage;
  status: 'pending' | 'scanning' | 'done' | 'error';
  findings: AEFindingRecord[];
  maxSeverity: string;
  eventId: string;
}

type InboxState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'scanning'; items: InboxItem[]; progress: number; total: number }
  | { phase: 'done'; items: InboxItem[] }
  | { phase: 'error'; message: string };

type Tab = 'current' | 'inbox' | 'attachments';

// Extended API response — backend returns `monograph` in analyze response
interface AnalyzeApiResponseExtended {
  eventId: string;
  hasAEs: boolean;
  findings: AEFindingRecord[];
  summary: string;
  monograph?: { brandName: string; genericName: string } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getMaxSeverity(findings: AEFindingRecord[]): string {
  const order = { low: 0, medium: 1, high: 2, critical: 3 };
  return findings.reduce<string>((max, f) => {
    return (order[f.severity as keyof typeof order] ?? 0) > (order[max as keyof typeof order] ?? 0)
      ? f.severity : max;
  }, 'low');
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Severity strip for inbox list ─────────────────────────────────────────

const SEVERITY_STRIP_COLOR: Record<string, string> = {
  critical: '#000000',
  high:     '#7B0000',
  medium:   '#C45000',
  low:      '#B07A00',
};

// ─── Components ────────────────────────────────────────────────────────────

function InboxRow({ item, onSelect }: { item: InboxItem; onSelect: () => void }) {
  const hasAEs = item.status === 'done' && item.findings.length > 0;
  const isScanning = item.status === 'scanning';

  const stripColor = hasAEs
    ? (SEVERITY_STRIP_COLOR[item.maxSeverity] ?? '#B07A00')
    : '#E2E8F0';

  const palette = hasAEs ? SEVERITY_PALETTE[item.maxSeverity] : null;

  return (
    <div
      onClick={hasAEs ? onSelect : undefined}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid #EDF2F7',
        cursor: hasAEs ? 'pointer' : 'default',
        background: hasAEs ? '#fffdf9' : '#fff',
        transition: 'background 0.15s',
        minHeight: 56,
      }}
    >
      {/* Left severity stripe */}
      <div
        style={{
          width: 5,
          flexShrink: 0,
          background: isScanning ? '#CBD5E0' : stripColor,
          transition: 'background 0.3s',
        }}
      />

      {/* Email info */}
      <div style={{ flex: 1, padding: '8px 10px 8px 10px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: item.msg.isRead ? 400 : 700,
              color: '#1a1a2e',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {item.msg.subject || '(no subject)'}
          </span>
          <span style={{ fontSize: 10, color: '#A0AEC0', flexShrink: 0 }}>
            {formatRelativeTime(item.msg.receivedAt)}
          </span>
        </div>

        <div style={{ fontSize: 10.5, color: '#718096', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.msg.from}
        </div>

        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {isScanning && (
            <span style={{ fontSize: 10, color: '#718096', fontStyle: 'italic' }}>Scanning…</span>
          )}
          {hasAEs && palette && (
            <>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: palette.bg,
                  color: palette.text,
                  letterSpacing: '0.06em',
                }}
              >
                {item.findings.length} AE{item.findings.length !== 1 ? 's' : ''} · {palette.label}
              </span>
              <span style={{ fontSize: 10, color: '#718096' }}>Click to view →</span>
            </>
          )}
          {item.status === 'done' && item.findings.length === 0 && (
            <span style={{ fontSize: 10, color: '#48BB78' }}>✓ Clean</span>
          )}
          {item.status === 'error' && (
            <span style={{ fontSize: 10, color: '#FC8181' }}>⚠ Scan failed</span>
          )}
          {/* Attachment badge — shown whenever email has attachments */}
          {item.msg.hasAttachments && (
            <AttachmentBadge count={1} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('current');
  const [emailState, setEmailState] = useState<EmailState>({ phase: 'idle' });
  const [inboxState, setInboxState] = useState<InboxState>({ phase: 'idle' });
  const [drugName] = useState<string | undefined>(undefined);
  const scanAbortRef = useRef(false);

  // ── Current email context (for attachment panel) ────────────────────
  const [currentEmailCtx, setCurrentEmailCtx] = useState<{
    itemId: string; subject: string; sender: string; receivedAt: string; hasAttachments: boolean;
  } | null>(null);

  // ── Auth state ─────────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getToken());
  const [checkingDevMode, setCheckingDevMode] = useState<boolean>(() => !getToken());

  // ── Monograph state ────────────────────────────────────────────────────
  const [monographs, setMonographs] = useState<MonographSummary[]>([]);
  const monographsRef = useRef<MonographSummary[]>([]);

  // Keep ref in sync with state (avoids stale closure in callbacks)
  useEffect(() => {
    monographsRef.current = monographs;
  }, [monographs]);

  // ── Dev mode detection ─────────────────────────────────────────────────
  // If no token, probe the backend: if it responds without 401, NARC_AUTH is off
  useEffect(() => {
    if (isAuthenticated) {
      setCheckingDevMode(false);
      return;
    }
    fetch(`${BACKEND_URL}/api/events?limit=1`)
      .then((r) => {
        if (r.status !== 401) {
          // Backend accessible without auth — dev mode
          setIsAuthenticated(true);
        }
      })
      .catch(() => {
        // Backend unreachable — stay on login screen
      })
      .finally(() => setCheckingDevMode(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load monographs + ensure Outlook categories once authenticated ────
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchMonographs()
      .then(setMonographs)
      .catch(() => {}); // non-critical — MonographCard just won't show
    warmUpRestToken();     // prime the REST token cache before inbox scan is triggered
    ensureNarcCategories(); // create NARC colour categories in mailbox (cosmetic, silent)
  }, [isAuthenticated]);

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Match a drug name from the backend response against the loaded monograph list. */
  function matchMonograph(
    apiMonograph?: { brandName: string; genericName: string } | null
  ): MonographSummary | null {
    if (!apiMonograph) return null;
    return (
      monographsRef.current.find(
        (m) =>
          m.brand_name === apiMonograph.brandName ||
          m.generic_name === apiMonograph.genericName
      ) ?? null
    );
  }

  // ── Current email analysis ─────────────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    setEmailState({ phase: 'loading' });
    try {
      const emailCtx = await getEmailContext();
      if (!emailCtx.body.trim()) {
        setEmailState({ phase: 'no-email' });
        return;
      }

      // Capture email context for the attachment panel
      const item = Office.context.mailbox.item as Office.MessageRead | null;
      const hasAttachments = (item?.attachments?.length ?? 0) > 0;
      setCurrentEmailCtx({
        itemId:         emailCtx.itemId,
        subject:        emailCtx.subject,
        sender:         emailCtx.sender,
        receivedAt:     emailCtx.receivedAt,
        hasAttachments,
      });

      const result = (await analyzeEmail({
        emailBody: emailCtx.body,
        subject: emailCtx.subject,
        sender: emailCtx.sender,
        receivedAt: emailCtx.receivedAt,
        emailId: emailCtx.itemId,
        drugName,
      })) as unknown as AnalyzeApiResponseExtended;

      if (!result.hasAEs || result.findings.length === 0) {
        setEmailState({ phase: 'empty' });
      } else {
        const maxSeverity = getMaxSeverity(result.findings);
        setEmailState({
          phase: 'done',
          eventId: result.eventId,
          findings: result.findings,
          summary: result.summary,
          maxSeverity,
          monograph: matchMonograph(result.monograph),
        });
        // Apply coloured Outlook category so this email is flagged in the inbox list
        applyAECategoryToMessage(
          convertToRestId(emailCtx.itemId),
          maxSeverity as 'critical' | 'high' | 'medium' | 'low'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('No email item')) {
        setEmailState({ phase: 'no-email' });
      } else {
        setEmailState({ phase: 'error', message: msg });
      }
    }
  }, [drugName]); // monographsRef is stable — no dep needed

  // ── Inbox scanner ──────────────────────────────────────────────────────

  const runInboxScan = useCallback(async () => {
    scanAbortRef.current = false;
    setInboxState({ phase: 'loading' });

    let messages: InboxMessage[];
    try {
      messages = await fetchInboxMessages(25);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch inbox';
      // REST token failure is a known limitation in the new Outlook for Windows
      // with consumer Hotmail/Outlook.com accounts. Surface a clear explanation.
      const isRestTokenError = msg.toLowerCase().includes('rest token') || msg.toLowerCase().includes('internal error');
      setInboxState({
        phase: 'error',
        message: isRestTokenError
          ? 'REST_TOKEN_UNSUPPORTED'
          : msg,
      });
      return;
    }

    // Initialise all as pending
    const initial: InboxItem[] = messages.map((msg) => ({
      msg,
      status: 'pending',
      findings: [],
      maxSeverity: 'low',
      eventId: '',
    }));

    setInboxState({ phase: 'scanning', items: initial, progress: 0, total: messages.length });

    // Analyse emails sequentially (concurrency=1 to avoid hammering Claude)
    for (let i = 0; i < initial.length; i++) {
      if (scanAbortRef.current) break;

      // Mark this one as scanning
      setInboxState((prev) => {
        if (prev.phase !== 'scanning') return prev;
        const items = prev.items.map((it, idx) =>
          idx === i ? { ...it, status: 'scanning' as const } : it
        );
        return { ...prev, items, progress: i };
      });

      try {
        const msg = messages[i];
        const result = (await analyzeEmail({
          emailBody: msg.body,
          subject: msg.subject,
          sender: msg.from,
          receivedAt: msg.receivedAt,
          emailId: msg.id,
          drugName,
        })) as unknown as AnalyzeApiResponseExtended;

        const findings = result.findings ?? [];
        const maxSeverity = findings.length > 0 ? getMaxSeverity(findings) : 'low';

        // Apply coloured Outlook category — makes flagged emails visible in inbox list
        if (findings.length > 0) {
          applyAECategoryToMessage(
            msg.id,
            maxSeverity as 'critical' | 'high' | 'medium' | 'low'
          );
        }

        setInboxState((prev) => {
          if (prev.phase !== 'scanning') return prev;
          const items = prev.items.map((it, idx) =>
            idx === i
              ? { ...it, status: 'done' as const, findings, maxSeverity, eventId: result.eventId }
              : it
          );
          return { ...prev, items, progress: i + 1 };
        });
      } catch {
        setInboxState((prev) => {
          if (prev.phase !== 'scanning') return prev;
          const items = prev.items.map((it, idx) =>
            idx === i ? { ...it, status: 'error' as const } : it
          );
          return { ...prev, items, progress: i + 1 };
        });
      }
    }

    // Transition to done
    setInboxState((prev) => {
      if (prev.phase !== 'scanning') return prev;
      return { phase: 'done', items: prev.items };
    });
  }, [drugName]);

  // ── Bootstrap — only after auth ────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) return;

    runAnalysis();
    Office.context.mailbox.addHandlerAsync(
      Office.EventType.ItemChanged,
      () => runAnalysis(),
      {}
    );
  }, [runAnalysis, isAuthenticated]);

  // ── Handle logout ──────────────────────────────────────────────────────

  const handleLogout = useCallback(() => {
    logout();
    clearToken();
    setIsAuthenticated(false);
    setEmailState({ phase: 'idle' });
    setInboxState({ phase: 'idle' });
    setMonographs([]);
  }, []);

  // ── Render: auth gates ─────────────────────────────────────────────────

  // While probing backend for dev mode
  if (checkingDevMode) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#F8F9FA' }}>
        <LoadingState message="Connecting…" />
      </div>
    );
  }

  // Show login screen when not authenticated
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={() => {
          setIsAuthenticated(true);
        }}
      />
    );
  }

  // ── Render: main UI ────────────────────────────────────────────────────

  const inboxItems = (inboxState.phase === 'scanning' || inboxState.phase === 'done')
    ? inboxState.items
    : [];

  const inboxAECount = inboxItems.filter(
    (it) => it.status === 'done' && it.findings.length > 0
  ).length;

  const currentUser = getUser();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F8F9FA' }}>

      {/* Header */}
      <div style={{ background: '#1a1a2e', color: '#fff', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <img
          src="assets/icon-32.png"
          alt="NARC"
          style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, objectFit: 'cover' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>NARC</div>
          <div style={{ fontSize: 9.5, color: '#A0AEC0', marginTop: -1 }}>
            {currentUser ? currentUser.email : 'Adverse Event Detector'}
          </div>
        </div>
        {tab === 'current' && emailState.phase !== 'loading' && (
          <button
            onClick={runAnalysis}
            title="Re-analyze this email"
            style={{ padding: '3px 8px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 5, fontSize: 10.5, cursor: 'pointer' }}
          >
            ↺
          </button>
        )}
        {/* Sign out button */}
        <button
          onClick={handleLogout}
          title="Sign out"
          style={{ padding: '3px 8px', background: 'rgba(255,255,255,0.08)', color: '#A0AEC0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}
        >
          ⏏
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E2E8F0', background: '#fff', flexShrink: 0 }}>
        <button
          onClick={() => setTab('current')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: tab === 'current' ? 700 : 400,
            color: tab === 'current' ? '#1a1a2e' : '#718096',
            background: 'none',
            border: 'none',
            borderBottom: tab === 'current' ? '2px solid #9B2335' : '2px solid transparent',
            cursor: 'pointer',
            marginBottom: -2,
          }}
        >
          Current Email
        </button>
        <button
          onClick={() => {
            setTab('inbox');
            if (inboxState.phase === 'idle') runInboxScan();
          }}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: tab === 'inbox' ? 700 : 400,
            color: tab === 'inbox' ? '#1a1a2e' : '#718096',
            background: 'none',
            border: 'none',
            borderBottom: tab === 'inbox' ? '2px solid #9B2335' : '2px solid transparent',
            cursor: 'pointer',
            marginBottom: -2,
            position: 'relative',
          }}
        >
          Inbox Scan
          {inboxAECount > 0 && (
            <span style={{ marginLeft: 5, background: '#7B0000', color: '#fff', borderRadius: 10, padding: '1px 5px', fontSize: 9, fontWeight: 800 }}>
              {inboxAECount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('attachments')}
          style={{
            flex: 1,
            padding: '7px 4px',
            fontSize: 11,
            fontWeight: tab === 'attachments' ? 700 : 400,
            color: tab === 'attachments' ? '#1a1a2e' : '#718096',
            background: 'none',
            border: 'none',
            borderBottom: tab === 'attachments' ? '2px solid #9B2335' : '2px solid transparent',
            cursor: 'pointer',
            marginBottom: -2,
            position: 'relative',
          }}
        >
          📎 Docs
          {currentEmailCtx?.hasAttachments && (
            <span style={{ marginLeft: 3, width: 6, height: 6, background: '#C45000', borderRadius: '50%', display: 'inline-block', verticalAlign: 'middle' }} />
          )}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Current Email Tab ── */}
        {tab === 'current' && (
          <>
            {emailState.phase === 'idle' || emailState.phase === 'loading' ? (
              <LoadingState />
            ) : emailState.phase === 'no-email' ? (
              <EmptyState type="no-email" />
            ) : emailState.phase === 'error' ? (
              <EmptyState type="error" message={emailState.message} onRetry={runAnalysis} />
            ) : emailState.phase === 'empty' ? (
              <EmptyState type="no-ae" />
            ) : (
              <>
                <Badge
                  count={emailState.findings.length}
                  maxSeverity={emailState.maxSeverity}
                  summary={emailState.summary}
                />
                {/* Monograph context card — shown when a known drug was detected */}
                {emailState.monograph && (
                  <MonographCard monograph={emailState.monograph} />
                )}
                <AEList findings={emailState.findings} eventId={emailState.eventId} />
                <div style={{ height: 16 }} />
              </>
            )}
          </>
        )}

        {/* ── Attachments Tab ── */}
        {tab === 'attachments' && (
          <>
            {!currentEmailCtx ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#A0AEC0', fontSize: 11 }}>
                Open an email to scan its attachments.
              </div>
            ) : !currentEmailCtx.hasAttachments ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
                <div style={{ fontSize: 12, color: '#718096' }}>
                  This email has no attachments.
                </div>
                <div style={{ fontSize: 10.5, color: '#A0AEC0', marginTop: 4 }}>
                  Open an email with PDF, image, or document attachments to scan them for adverse events.
                </div>
              </div>
            ) : (
              <AttachmentScanPanel
                key={currentEmailCtx.itemId}
                messageId={currentEmailCtx.itemId}
                subject={currentEmailCtx.subject}
                sender={currentEmailCtx.sender}
                receivedAt={currentEmailCtx.receivedAt}
              />
            )}
          </>
        )}

        {/* ── Inbox Scanner Tab ── */}
        {tab === 'inbox' && (
          <>
            {inboxState.phase === 'idle' || inboxState.phase === 'loading' ? (
              <LoadingState message="Fetching inbox…" />
            ) : inboxState.phase === 'error' ? (
              inboxState.message === 'REST_TOKEN_UNSUPPORTED' ? (
                /* Known limitation: new Outlook for Windows blocks REST tokens for consumer accounts */
                <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📬</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a2e', marginBottom: 8 }}>
                    Inbox scan unavailable
                  </div>
                  <div style={{ fontSize: 11.5, color: '#718096', lineHeight: 1.6, marginBottom: 16 }}>
                    The new Outlook for Windows does not allow add-ins to access your inbox list for
                    Hotmail / Outlook.com accounts.
                  </div>
                  <div style={{ background: '#EBF8FF', border: '1px solid #BEE3F8', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#2B6CB0', textAlign: 'left', lineHeight: 1.6 }}>
                    <strong>✓ What still works:</strong><br />
                    Open any email and NARC will instantly analyze it for adverse events — just use the <strong>Current Email</strong> tab.
                  </div>
                  <div style={{ marginTop: 12, fontSize: 10.5, color: '#A0AEC0' }}>
                    Full inbox scan works in classic Outlook or with a Microsoft 365 / Exchange account.
                  </div>
                </div>
              ) : (
                <EmptyState
                  type="error"
                  message={inboxState.message}
                  onRetry={runInboxScan}
                />
              )
            ) : (
              <>
                {/* Progress bar while scanning */}
                {inboxState.phase === 'scanning' && (
                  <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#718096', marginBottom: 5 }}>
                      <span>Scanning inbox for adverse events…</span>
                      <span>{inboxState.progress}/{inboxState.total}</span>
                    </div>
                    <div style={{ background: '#EDF2F7', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${(inboxState.progress / inboxState.total) * 100}%`,
                          height: '100%',
                          background: '#9B2335',
                          transition: 'width 0.3s ease',
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Scan complete summary */}
                {inboxState.phase === 'done' && (
                  <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: inboxAECount > 0 ? '#7B0000' : '#2D6A4F', fontWeight: 700 }}>
                      {inboxAECount > 0
                        ? `⚠ ${inboxAECount} email${inboxAECount !== 1 ? 's' : ''} with potential AEs`
                        : '✓ No AEs found in recent inbox'}
                    </span>
                    <button
                      onClick={runInboxScan}
                      style={{ fontSize: 10, padding: '3px 8px', background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: 5, cursor: 'pointer', color: '#718096' }}
                    >
                      ↺ Rescan
                    </button>
                  </div>
                )}

                {/* Email list */}
                <div>
                  {inboxItems.map((item) => (
                    <InboxRow
                      key={item.msg.id}
                      item={item}
                      onSelect={() => setTab('current')}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '5px 12px', borderTop: '1px solid #E2E8F0', fontSize: 9.5, color: '#A0AEC0', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span>NARC v1.0 — Powered by Claude AI</span>
        <button
          onClick={() => {
            try {
              // openBrowserWindow is the official Office API for launching URLs
              Office.context.ui.openBrowserWindow('http://localhost:5173');
            } catch {
              // Fallback for contexts where openBrowserWindow is unavailable
              window.open('http://localhost:5173', '_blank');
            }
          }}
          title="Open NARC Dashboard"
          style={{
            fontSize: 9.5,
            padding: '2px 8px',
            background: '#1a1a2e',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          📊 Dashboard
        </button>
      </div>
    </div>
  );
}
