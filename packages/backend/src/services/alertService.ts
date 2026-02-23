/**
 * Alert Service
 *
 * Sends email notifications when critical or high-severity AEs are detected,
 * and when SLA deadlines are breached.
 *
 * Environment variables (all optional — alerts silently disabled if not set):
 *   ALERT_EMAIL_TO      Supervisor / safety team email(s), comma-separated
 *   ALERT_EMAIL_FROM    From address  (default: "NARC Alerts" <narc@noreply.local>)
 *   ALERT_SMTP_HOST     SMTP hostname  (e.g. smtp.gmail.com, smtp.office365.com)
 *   ALERT_SMTP_PORT     SMTP port      (default: 587)
 *   ALERT_SMTP_USER     SMTP username
 *   ALERT_SMTP_PASS     SMTP password / app password
 *   ALERT_SMTP_SECURE   "true" for port-465 TLS, omit/false for STARTTLS (port 587)
 *   DASHBOARD_URL       Dashboard URL for "Review" link  (default: http://localhost:5173)
 */

import nodemailer from 'nodemailer';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AEAlertPayload {
  eventId: string;
  subject: string;
  sender: string;
  maxSeverity: string;
  aeCount: number;
  detectedAt: string;
  deadlineAt: string;
  summary: string;
  source: 'inbox_monitor' | 'agent_review';
  findings: Array<{
    category: string;
    severity: string;
    excerpt: string;
    explanation: string;
    urgency: string;
  }>;
}

export interface SLABreachPayload {
  eventId: string;
  subject: string;
  sender: string;
  maxSeverity: string;
  deadlineAt: string;
  escalationLevel: number;
  previousStatus: string;
  newStatus: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#C53030',
  high: '#C25000',
  medium: '#B7791F',
  low: '#276749',
};

const CATEGORY_LABEL: Record<string, string> = {
  adverse_reaction: 'Adverse Reaction',
  off_label_use: 'Off-Label Use',
  off_label_dosing: 'Off-Label Dosing',
  pregnancy_exposure: 'Pregnancy Exposure',
  drug_interaction: 'Drug Interaction',
  serious_adverse_event: 'Serious Adverse Event',
  overdose: 'Overdose',
  medication_error: 'Medication Error',
};

// ─── Transport ─────────────────────────────────────────────────────────────

function createTransport() {
  const host = process.env.ALERT_SMTP_HOST;
  const user = process.env.ALERT_SMTP_USER;
  const pass = process.env.ALERT_SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.ALERT_SMTP_PORT ?? '587', 10),
    secure: process.env.ALERT_SMTP_SECURE === 'true',
    auth: { user, pass },
    tls: { rejectUnauthorized: false },  // allow self-signed certs in dev
  });
}

function getRecipients(): string | null {
  const to = process.env.ALERT_EMAIL_TO?.trim();
  return to || null;
}

function getDashboardUrl(): string {
  return process.env.DASHBOARD_URL ?? 'http://localhost:5173';
}

// ─── AE Detection Alert ────────────────────────────────────────────────────

/**
 * Send an email alert when a critical or high-severity AE is detected.
 * Silently skips if SMTP or recipient is not configured.
 */
export async function sendAEAlert(payload: AEAlertPayload): Promise<void> {
  const to = getRecipients();
  const transport = createTransport();

  if (!to || !transport) {
    console.log(`[alerts] Skipping AE alert for event ${payload.eventId} — SMTP not configured`);
    return;
  }

  const sev = payload.maxSeverity;
  const emoji = SEVERITY_EMOJI[sev] ?? '⚠️';
  const color = SEVERITY_COLOR[sev] ?? '#718096';
  const dashUrl = getDashboardUrl();
  const deadline = new Date(payload.deadlineAt).toLocaleString();
  const detectedTime = new Date(payload.detectedAt).toLocaleString();
  const sourceLabel = payload.source === 'inbox_monitor' ? '🤖 Auto-detected by inbox monitor' : '👤 Flagged by pharmacovigilance agent';

  const findingsHtml = payload.findings.map((f, i) => `
    <div style="margin:10px 0;padding:12px 14px;border-left:4px solid ${SEVERITY_COLOR[f.severity] ?? '#718096'};background:#FAFAFA;border-radius:0 6px 6px 0;">
      <div style="font-weight:700;color:#1a1a2e;margin-bottom:4px;font-size:13px;">
        ${i + 1}. ${CATEGORY_LABEL[f.category] ?? f.category} — <span style="color:${SEVERITY_COLOR[f.severity] ?? '#718096'}">${f.severity.toUpperCase()}</span>
      </div>
      <blockquote style="margin:4px 0 8px;padding:6px 10px;background:#FFFBEA;border-left:3px solid #F6AD55;font-style:italic;color:#744210;font-size:12px;border-radius:0 4px 4px 0;">
        "${f.excerpt}"
      </blockquote>
      <div style="font-size:12px;color:#4A5568;line-height:1.5;">${f.explanation}</div>
      <div style="font-size:11px;color:#718096;margin-top:6px;">
        Urgency: <strong>${f.urgency.replace(/_/g, ' ')}</strong>
      </div>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">

        <!-- Header -->
        <div style="background:#1a1a2e;padding:18px 24px;display:flex;align-items:center;gap:14px;">
          <div style="background:#9B2335;border-radius:7px;padding:6px 14px;font-weight:800;font-size:18px;color:#fff;letter-spacing:-0.02em;">NARC</div>
          <div>
            <div style="font-size:17px;font-weight:700;color:#fff;">${emoji} ${sev.toUpperCase()} Adverse Event Detected</div>
            <div style="font-size:12px;color:#A0AEC0;margin-top:2px;">Pharmacovigilance Alert — Immediate Review Required</div>
          </div>
        </div>

        <!-- Alert banner -->
        <div style="background:${sev === 'critical' ? '#FFF5F5' : '#FFFAF0'};border-bottom:1px solid ${sev === 'critical' ? '#FEB2B2' : '#FBD38D'};padding:14px 24px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#4A5568;">
            <tr><td style="padding:3px 0;width:120px;">📧 <strong>Email</strong></td><td>${payload.subject}</td></tr>
            <tr><td style="padding:3px 0;">👤 <strong>From</strong></td><td>${payload.sender}</td></tr>
            <tr><td style="padding:3px 0;">🔍 <strong>Detected</strong></td><td>${detectedTime}</td></tr>
            <tr><td style="padding:3px 0;">⏰ <strong>SLA Deadline</strong></td><td style="font-weight:700;color:${color};">${deadline}</td></tr>
            <tr><td style="padding:3px 0;">📊 <strong>Findings</strong></td><td>${payload.aeCount} adverse event(s)</td></tr>
            <tr><td style="padding:3px 0;">🔄 <strong>Source</strong></td><td>${sourceLabel}</td></tr>
          </table>
        </div>

        <!-- Summary -->
        <div style="padding:16px 24px;background:#EBF4FF;border-bottom:1px solid #BEE3F8;">
          <div style="font-size:12px;font-weight:700;color:#2B6CB0;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">AI Summary</div>
          <div style="font-size:13px;color:#1a1a2e;line-height:1.6;">${payload.summary}</div>
        </div>

        <!-- Findings -->
        <div style="padding:16px 24px;">
          <div style="font-size:12px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Detected Findings (${payload.findings.length})</div>
          ${findingsHtml}
        </div>

        <!-- CTA -->
        <div style="padding:16px 24px;border-top:1px solid #E2E8F0;text-align:center;">
          <a href="${dashUrl}" style="display:inline-block;background:#9B2335;color:#fff;padding:11px 28px;border-radius:7px;text-decoration:none;font-weight:700;font-size:14px;">
            Review in NARC Dashboard →
          </a>
          <div style="font-size:11px;color:#A0AEC0;margin-top:8px;">Case ID: ${payload.eventId}</div>
        </div>

      </div>
    </body>
    </html>
  `;

  const text = [
    `NARC PHARMACOVIGILANCE ALERT — ${sev.toUpperCase()} AE DETECTED`,
    ``,
    `Email:     ${payload.subject}`,
    `From:      ${payload.sender}`,
    `Detected:  ${detectedTime}`,
    `Deadline:  ${deadline}`,
    `Findings:  ${payload.aeCount}`,
    `Source:    ${sourceLabel}`,
    ``,
    `Summary: ${payload.summary}`,
    ``,
    ...payload.findings.map((f, i) => [
      `Finding ${i + 1}: ${CATEGORY_LABEL[f.category] ?? f.category} (${f.severity.toUpperCase()})`,
      `Excerpt: "${f.excerpt}"`,
      `Explanation: ${f.explanation}`,
      `Urgency: ${f.urgency.replace(/_/g, ' ')}`,
    ].join('\n')),
    ``,
    `Case ID: ${payload.eventId}`,
    `Review: ${dashUrl}`,
  ].join('\n');

  try {
    await transport.sendMail({
      from: process.env.ALERT_EMAIL_FROM ?? '"NARC Alerts" <narc-alerts@noreply.local>',
      to,
      subject: `${emoji} [NARC] ${sev.toUpperCase()} AE — ${payload.subject}`,
      text,
      html,
    });
    console.log(`[alerts] ✉️  AE alert sent to ${to} (event ${payload.eventId}, ${sev})`);
  } catch (err) {
    // Never block event creation because of alert failure
    console.error(`[alerts] Failed to send AE alert for event ${payload.eventId}:`, err);
  }
}

// ─── SLA Breach Alert ──────────────────────────────────────────────────────

/**
 * Send an alert when an event's SLA transitions to at_risk or breached.
 * Called from the SLA worker when status changes.
 */
export async function sendSLAAlert(payload: SLABreachPayload): Promise<void> {
  const to = getRecipients();
  const transport = createTransport();

  if (!to || !transport) return;

  // Only alert on meaningful escalations (not every minor change)
  const isBreached = payload.newStatus === 'breached';
  const isNewlyAtRisk = payload.newStatus === 'at_risk' && payload.previousStatus === 'on_track';
  if (!isBreached && !isNewlyAtRisk) return;

  const emoji = isBreached ? '🚨' : '⚠️';
  const statusLabel = isBreached ? 'SLA BREACHED' : 'SLA AT RISK';
  const sev = payload.maxSeverity;
  const deadline = new Date(payload.deadlineAt).toLocaleString();
  const dashUrl = getDashboardUrl();

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#FFF5F5;border:2px solid #FEB2B2;border-radius:10px;overflow:hidden;">
      <div style="background:${isBreached ? '#C53030' : '#C25000'};padding:14px 20px;">
        <div style="font-size:16px;font-weight:800;color:#fff;">${emoji} ${statusLabel}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:2px;">NARC Pharmacovigilance — Escalation Level ${payload.escalationLevel}/3</div>
      </div>
      <div style="padding:16px 20px;font-size:13px;color:#4A5568;line-height:1.8;">
        <strong>Email:</strong> ${payload.subject}<br>
        <strong>From:</strong> ${payload.sender}<br>
        <strong>Severity:</strong> ${sev.toUpperCase()}<br>
        <strong>Deadline:</strong> <span style="color:#C53030;font-weight:700;">${deadline}</span>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #FEB2B2;text-align:center;">
        <a href="${dashUrl}" style="background:#C53030;color:#fff;padding:9px 22px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;">
          Review Immediately →
        </a>
        <div style="font-size:11px;color:#A0AEC0;margin-top:6px;">Case ID: ${payload.eventId}</div>
      </div>
    </div>
  `;

  try {
    await transport.sendMail({
      from: process.env.ALERT_EMAIL_FROM ?? '"NARC Alerts" <narc-alerts@noreply.local>',
      to,
      subject: `${emoji} [NARC] ${statusLabel} — ${payload.subject}`,
      text: `${statusLabel}\n\nEmail: ${payload.subject}\nFrom: ${payload.sender}\nSeverity: ${sev.toUpperCase()}\nDeadline: ${deadline}\n\nReview: ${dashUrl}\nCase ID: ${payload.eventId}`,
      html,
    });
    console.log(`[alerts] ✉️  SLA ${statusLabel} alert sent to ${to} (event ${payload.eventId})`);
  } catch (err) {
    console.error(`[alerts] Failed to send SLA alert for event ${payload.eventId}:`, err);
  }
}

// ─── Test alert ────────────────────────────────────────────────────────────

/**
 * Send a test alert to verify SMTP configuration is working.
 */
export async function sendTestAlert(recipientOverride?: string): Promise<{ ok: boolean; error?: string }> {
  const to = recipientOverride ?? getRecipients();
  const transport = createTransport();

  if (!to) return { ok: false, error: 'ALERT_EMAIL_TO not configured' };
  if (!transport) return { ok: false, error: 'SMTP not configured (missing ALERT_SMTP_HOST/USER/PASS)' };

  try {
    await transport.sendMail({
      from: process.env.ALERT_EMAIL_FROM ?? '"NARC Alerts" <narc-alerts@noreply.local>',
      to,
      subject: '✅ [NARC] Test Alert — SMTP Configuration Working',
      text: `This is a test alert from NARC Pharmacovigilance Platform.\n\nYour email alert configuration is working correctly.\n\nDashboard: ${getDashboardUrl()}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#F0FFF4;border:2px solid #68D391;border-radius:10px;text-align:center;">
        <div style="font-size:40px;margin-bottom:8px;">✅</div>
        <h2 style="color:#276749;margin:0 0 8px;">SMTP Configuration Working</h2>
        <p style="color:#4A5568;font-size:14px;">NARC email alerts are properly configured.<br>You will receive notifications for critical and high-severity adverse events.</p>
        <a href="${getDashboardUrl()}" style="display:inline-block;margin-top:16px;background:#9B2335;color:#fff;padding:9px 22px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">Open Dashboard</a>
      </div>`,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
