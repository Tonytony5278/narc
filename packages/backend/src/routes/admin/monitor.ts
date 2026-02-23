/**
 * GET  /api/admin/monitor         — Returns monitor status
 * POST /api/admin/monitor/test    — Sends a test alert email
 * POST /api/admin/monitor/stop    — Stop the monitor (admin only)
 * POST /api/admin/monitor/start   — Start the monitor (admin only)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { getMonitorStatus, startMailMonitor, stopMailMonitor } from '../../services/mailMonitor';
import { sendTestAlert } from '../../services/alertService';

const router = Router();

/** GET /api/admin/monitor — current status */
router.get('/', requireAuth, (req: Request, res: Response) => {
  const status = getMonitorStatus();
  const alertConfigured = !!(
    process.env.ALERT_SMTP_HOST &&
    process.env.ALERT_SMTP_USER &&
    process.env.ALERT_SMTP_PASS &&
    process.env.ALERT_EMAIL_TO
  );
  res.json({
    monitor: status,
    alertConfigured,
    alertRecipient: process.env.ALERT_EMAIL_TO ?? null,
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5173',
  });
});

/** POST /api/admin/monitor/test — send a test alert email */
router.post('/test', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recipientOverride = (req.body as { email?: string }).email;
    const result = await sendTestAlert(recipientOverride);
    if (result.ok) {
      res.json({ success: true, message: `Test alert sent to ${process.env.ALERT_EMAIL_TO ?? recipientOverride}` });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/monitor/stop — stop the mail monitor */
router.post('/stop', requireAuth, (_req: Request, res: Response) => {
  stopMailMonitor();
  res.json({ success: true, message: 'Mail monitor stopped' });
});

/** POST /api/admin/monitor/start — (re)start the mail monitor */
router.post('/start', requireAuth, (_req: Request, res: Response) => {
  startMailMonitor();
  res.json({ success: true, message: 'Mail monitor start requested', status: getMonitorStatus() });
});

export default router;
