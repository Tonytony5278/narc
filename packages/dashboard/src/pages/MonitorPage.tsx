import React, { useEffect, useState } from 'react';

interface MonitorStatus {
  enabled: boolean;
  connected: boolean;
  host: string | null;
  user: string | null;
  mailbox: string;
  lastChecked: string | null;
  processedTotal: number;
  aeDetectedTotal: number;
  errorCount: number;
  lastError: string | null;
  startedAt: string | null;
  reconnectCount: number;
}

interface MonitorPageResponse {
  monitor: MonitorStatus;
  alertConfigured: boolean;
  alertRecipient: string | null;
  dashboardUrl: string;
}

async function fetchMonitorStatus(): Promise<MonitorPageResponse> {
  const token = localStorage.getItem('narc_token');
  const res = await fetch('/api/admin/monitor', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Failed to load monitor status: ${res.statusText}`);
  return res.json() as Promise<MonitorPageResponse>;
}

async function sendTestAlert(email?: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const token = localStorage.getItem('narc_token');
  const res = await fetch('/api/admin/monitor/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ email }),
  });
  return res.json() as Promise<{ success: boolean; message?: string; error?: string }>;
}

export default function MonitorPage() {
  const [data, setData] = useState<MonitorPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchMonitorStatus()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);  // auto-refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const handleTestAlert = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await sendTestAlert(testEmail || undefined);
      setTestResult(res.success ? `✅ ${res.message}` : `❌ ${res.error}`);
    } catch (err) {
      setTestResult(`❌ ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setTestLoading(false);
    }
  };

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#718096' }}>Loading monitor status…</div>;
  }

  if (error) {
    return (
      <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, padding: 16, color: '#C53030' }}>
        ⚠️ {error}
      </div>
    );
  }

  const m = data!.monitor;
  const isEnabled = m.enabled;
  const isConnected = m.connected;

  const statusColor = isEnabled && isConnected ? '#276749' : isEnabled ? '#B7791F' : '#718096';
  const statusBg = isEnabled && isConnected ? '#F0FFF4' : isEnabled ? '#FFFAF0' : '#F7FAFC';
  const statusBorder = isEnabled && isConnected ? '#68D391' : isEnabled ? '#F6AD55' : '#CBD5E0';
  const statusLabel = isEnabled && isConnected ? '🟢 Connected' : isEnabled ? '🟡 Connecting…' : '⚫ Disabled';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>Inbox Auto-Scan Monitor</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#718096' }}>
          Automatically analyzes all incoming emails in the monitored safety mailbox via IMAP. No Azure AD required.
        </p>
      </div>

      {/* Status card */}
      <div style={{ background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 10, padding: '18px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: statusColor }}>{statusLabel}</div>
            {m.user && m.host && (
              <div style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>
                {m.user} @ {m.host} / {m.mailbox}
              </div>
            )}
            {m.startedAt && (
              <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                Started: {new Date(m.startedAt).toLocaleString()}
              </div>
            )}
          </div>
          <button
            onClick={load}
            style={{ padding: '6px 14px', background: '#EBF4FF', color: '#2B6CB0', border: '1px solid #BEE3F8', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
          >
            ↺ Refresh
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Emails Processed', value: m.processedTotal },
            { label: 'AEs Detected', value: m.aeDetectedTotal, accent: m.aeDetectedTotal > 0 },
            { label: 'Errors', value: m.errorCount, warn: m.errorCount > 0 },
            { label: 'Reconnects', value: m.reconnectCount },
          ].map(({ label, value, accent, warn }) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 16px', minWidth: 100, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: accent ? '#9B2335' : warn ? '#B7791F' : '#1a1a2e' }}>{value}</div>
              <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>{label}</div>
            </div>
          ))}
          {m.lastChecked && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>
                {new Date(m.lastChecked).toLocaleTimeString()}
              </div>
              <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>Last Checked</div>
            </div>
          )}
        </div>

        {m.lastError && (
          <div style={{ marginTop: 12, background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#C53030' }}>
            ⚠️ Last error: {m.lastError}
          </div>
        )}
      </div>

      {/* Alert configuration card */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '18px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>
          Email Alerts
          <span style={{ marginLeft: 10, fontSize: 11, padding: '2px 8px', borderRadius: 10, background: data!.alertConfigured ? '#C6F6D5' : '#EDF2F7', color: data!.alertConfigured ? '#276749' : '#718096', fontWeight: 600 }}>
            {data!.alertConfigured ? '✓ Configured' : 'Not configured'}
          </span>
        </div>

        {data!.alertConfigured ? (
          <div style={{ fontSize: 13, color: '#4A5568', marginBottom: 12 }}>
            Alerts will be sent to: <strong>{data!.alertRecipient}</strong> for critical and high-severity AEs, and when SLA deadlines are breached.
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>
            Configure SMTP settings in <code style={{ background: '#EDF2F7', padding: '1px 5px', borderRadius: 3 }}>packages/backend/.env</code> to receive email alerts.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder={data!.alertRecipient ?? 'test@example.com'}
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, width: 240 }}
          />
          <button
            onClick={handleTestAlert}
            disabled={testLoading}
            style={{ padding: '7px 16px', background: '#2B6CB0', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: testLoading ? 'not-allowed' : 'pointer', opacity: testLoading ? 0.7 : 1 }}
          >
            {testLoading ? 'Sending…' : '✉ Send Test Alert'}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, color: testResult.startsWith('✅') ? '#276749' : '#C53030' }}>
              {testResult}
            </span>
          )}
        </div>
      </div>

      {/* Setup guide */}
      {!isEnabled && (
        <div style={{ background: '#EBF4FF', border: '1px solid #BEE3F8', borderRadius: 10, padding: '18px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#2B6CB0', marginBottom: 14 }}>
            📋 Setup Guide — Enable Auto-Scan in 3 Steps
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
            <Step n={1} title="Generate an App Password">
              <div>
                <strong>Outlook / Hotmail / Office 365:</strong><br />
                Go to <a href="https://account.microsoft.com/security" target="_blank" rel="noreferrer" style={{ color: '#2B6CB0' }}>account.microsoft.com/security</a> → Advanced security → App passwords → Create new app password
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Gmail:</strong><br />
                Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" style={{ color: '#2B6CB0' }}>myaccount.google.com/security</a> → 2-Step Verification → App passwords → Select "Mail"
              </div>
            </Step>

            <Step n={2} title="Add credentials to packages/backend/.env">
              <pre style={{ background: '#1a1a2e', color: '#E2E8F0', padding: '12px 14px', borderRadius: 6, fontSize: 12, overflowX: 'auto', margin: 0, lineHeight: 1.6 }}>
{`# For Outlook / Office 365 / Hotmail:
MONITOR_EMAIL_HOST=outlook.office365.com
MONITOR_EMAIL_USER=safety@yourcompany.com
MONITOR_EMAIL_PASS=your-16-char-app-password

# For Gmail:
MONITOR_EMAIL_HOST=imap.gmail.com
MONITOR_EMAIL_USER=safety@yourdomain.com
MONITOR_EMAIL_PASS=your-16-char-app-password

# Alert emails (optional but recommended):
ALERT_EMAIL_TO=supervisor@yourcompany.com
ALERT_SMTP_HOST=smtp.office365.com
ALERT_SMTP_PORT=587
ALERT_SMTP_USER=safety@yourcompany.com
ALERT_SMTP_PASS=your-app-password`}
              </pre>
            </Step>

            <Step n={3} title="Restart the backend">
              <code style={{ background: '#EDF2F7', padding: '4px 10px', borderRadius: 4, fontSize: 12 }}>
                npm run dev -w packages/backend
              </code>
              <div style={{ marginTop: 6, color: '#718096', fontSize: 12 }}>
                The monitor will connect automatically and begin processing unseen emails immediately.
              </div>
            </Step>
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2B6CB0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0, marginTop: 2 }}>
        {n}
      </div>
      <div>
        <div style={{ fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>{title}</div>
        <div style={{ color: '#4A5568', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}
