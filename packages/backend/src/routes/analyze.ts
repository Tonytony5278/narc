import { Router, Request, Response, NextFunction } from 'express';
import { AnalyzeRequestSchema, AuditActions } from '@narc/shared';
import { requireAuth } from '../middleware/auth';
import { analyzeEmail, prescreenEmail } from '../services/claude';
import { getActivePolicy, calibrateConfidence } from '../services/policy';
import { computeDeadline, computeSlaStatus } from '../services/sla';
import { auditLog } from '../services/audit';
import { withTransaction } from '../db/pool';
import { insertEvent, getEventByEmailId } from '../db/queries/events';
import { insertFinding } from '../db/queries/findings';
import { lookupMonograph, buildMonographContext } from '../services/monograph';

const router = Router();

const MODEL_VERSION = 'claude-opus-4-6';

const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * POST /api/analyze
 * Analyze an email for potential adverse events using Claude.
 * Persists the event and findings in a single transaction with audit log.
 * Injects Health Canada monograph context when a known drug is detected.
 */
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;

    // Validate request body
    const analyzeReq = AnalyzeRequestSchema.parse(req.body);

    // ── Pre-screener gate (skip with x-skip-prescreen: true for tests) ────────
    let prescreenerPassed: boolean | null = null;
    let prescreenerReason: string | null = null;

    const skipPrescreen = req.headers['x-skip-prescreen'] === 'true';
    if (!skipPrescreen) {
      const ps = await prescreenEmail(
        analyzeReq.subject,
        analyzeReq.emailBody,
        analyzeReq.sender
      );
      prescreenerPassed = ps.isAERelated;
      prescreenerReason = ps.reason;

      if (!ps.isAERelated) {
        console.log(`[analyze] Pre-screener filtered out email from ${analyzeReq.sender} — "${ps.reason}" (conf: ${ps.confidence})`);
        return res.json({
          eventId: null,
          findings: [],
          hasAEs: false,
          prescreened: true,
          summary: ps.reason,
          analysisNotes: `Pre-screener determined this email is not AE-related (confidence: ${(ps.confidence * 100).toFixed(0)}%).`,
          monograph: null,
        });
      }
    }

    // Load active policy (cached, non-blocking)
    const policy = await getActivePolicy();

    // Look up drug monograph from email text or explicit drugName
    const searchText = [analyzeReq.subject, analyzeReq.emailBody].filter(Boolean).join(' ');
    const monograph = await lookupMonograph(searchText, analyzeReq.drugName);
    const monographContext = monograph ? buildMonographContext(monograph) : null;

    // Run Claude AE detection (with optional monograph context)
    console.log(`[analyze] Analyzing email from ${analyzeReq.sender} — subject: "${analyzeReq.subject}"${monograph ? ` — drug: ${monograph.brand_name}` : ''}`);
    const aiResponse = await analyzeEmail(analyzeReq, policy, monographContext);

    // Determine max severity across all findings
    const maxSeverity = aiResponse.findings.reduce<string>((max, f) => {
      return (SEVERITY_ORDER[f.severity] ?? 0) > (SEVERITY_ORDER[max] ?? 0) ? f.severity : max;
    }, 'low');

    // Compute SLA deadline
    const detectedAt = new Date();
    const deadlineAt = computeDeadline(maxSeverity, detectedAt);
    const slaResult = computeSlaStatus(detectedAt, deadlineAt, false);

    const bodyExcerpt = analyzeReq.emailBody.slice(0, 500);
    const emailId = analyzeReq.emailId
      ?? `hash-${Buffer.from(analyzeReq.emailBody.slice(0, 100)).toString('base64').slice(0, 16)}`;

    // ── Deduplication: if an event already exists for this email, return it ──
    const existing = await getEventByEmailId(emailId);
    if (existing) {
      console.log(`[analyze] Dedup hit — returning existing event ${existing.event.id} for email_id "${emailId}"`);
      const { event: ev, findings: existingFindings } = existing;
      return res.json({
        eventId: ev.id,
        findings: existingFindings.map((f) => ({
          id: f.id,
          eventId: ev.id,
          excerpt: f.excerpt,
          category: f.category,
          severity: f.severity,
          explanation: f.explanation,
          urgency: f.urgency,
          confidence: f.confidence,
          status: f.status,
          modelVersion: f.model_version,
          rawConfidence: f.raw_confidence,
          calibratedConfidence: f.calibrated_confidence,
          createdAt: ev.created_at instanceof Date ? ev.created_at.toISOString() : String(ev.created_at),
          updatedAt: ev.updated_at instanceof Date ? ev.updated_at.toISOString() : String(ev.updated_at),
        })),
        summary: `Previously analyzed — ${existingFindings.length} finding(s) on record.`,
        hasAEs: existingFindings.length > 0,
        analysisNotes: 'Result returned from cache (same email ID). No new event created.',
        monograph: null,
      });
    }

    // Apply policy calibration: find matching rule per finding
    const calibrated = aiResponse.findings.map((finding) => {
      const rule = policy?.rules.find(
        (r) => r.is_enabled && r.category === finding.category &&
        r.keywords.some((kw) => finding.excerpt.toLowerCase().includes(kw.toLowerCase()))
      );
      const rawConfidence = finding.confidence;
      const calibratedConfidence = rule ? calibrateConfidence(rawConfidence, rule) : rawConfidence;
      const severity = (rule?.severity_override as string | undefined) ?? finding.severity;
      return { finding, rawConfidence, calibratedConfidence, severity, rule };
    });

    // ── Confidence threshold gating (post-calibration) ────────────────────────
    // Gate AFTER calibration so calibration can raise a score above the floor.
    const thresholdFiltered = calibrated.filter(({ calibratedConfidence, rule }) => {
      const minConf = (rule as { min_confidence?: number | null } | undefined)?.min_confidence ?? null;
      return minConf == null || calibratedConfidence >= minConf;
    });
    const filteredCount = calibrated.length - thresholdFiltered.length;
    if (filteredCount > 0) {
      console.log(`[analyze] Threshold gating removed ${filteredCount} finding(s) below min_confidence floor`);
    }

    // Persist everything in one ACID transaction
    const eventId = await withTransaction(async (client) => {
      const id = await insertEvent({
        email_id: emailId,
        subject: analyzeReq.subject,
        sender: analyzeReq.sender,
        received_at: analyzeReq.receivedAt,
        body_excerpt: bodyExcerpt,
        ae_count: thresholdFiltered.length,
        max_severity: maxSeverity,
        status: 'pending',
        notes: '',
        raw_request: analyzeReq as object,
        raw_response: aiResponse as object,
        detected_at: detectedAt.toISOString(),
        deadline_at: deadlineAt.toISOString(),
        sla_status: slaResult.sla_status,
        escalation_level: slaResult.escalation_level,
        policy_version_id: policy?.id ?? null,
        agent_id: actor.sub,
        model_version: MODEL_VERSION,
        prescreener_passed: prescreenerPassed,
        prescreener_reason: prescreenerReason,
      }, client);

      for (const { finding, rawConfidence, calibratedConfidence, severity } of thresholdFiltered) {
        await insertFinding({
          event_id: id,
          excerpt: finding.excerpt,
          category: finding.category,
          severity,
          explanation: finding.explanation,
          urgency: finding.urgency,
          confidence: calibratedConfidence,
          status: 'pending',
          model_version: MODEL_VERSION,
          highlight_spans: finding.highlight_spans ?? null,
          raw_confidence: rawConfidence,
          calibrated_confidence: calibratedConfidence,
        }, client);
      }

      await auditLog({
        actor: { id: actor.sub, role: actor.role },
        action: AuditActions.ANALYZE_EMAIL,
        entityType: 'event',
        entityId: id,
        before: null,
        after: {
          ae_count: thresholdFiltered.length,
          max_severity: maxSeverity,
          sla_status: slaResult.sla_status,
          policy_version: policy?.version ?? null,
          drug: monograph?.brand_name ?? null,
          prescreener_passed: prescreenerPassed,
        },
        req,
      }, client);

      return id;
    });

    console.log(`[analyze] ✅ ${thresholdFiltered.length} AE(s) (${calibrated.length - thresholdFiltered.length} threshold-gated), max severity: ${maxSeverity}, deadline: ${deadlineAt.toISOString()}`);

    res.json({
      eventId,
      findings: thresholdFiltered.map(({ finding, rawConfidence, calibratedConfidence, severity }, i) => ({
        id: `pending-${i}`,  // real IDs require a second DB read; use pending for immediate response
        eventId,
        ...finding,
        severity,
        rawConfidence,
        calibratedConfidence,
        status: 'pending' as const,
        modelVersion: MODEL_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      summary: aiResponse.summary,
      hasAEs: aiResponse.hasAEs,
      analysisNotes: aiResponse.analysisNotes,
      monograph: monograph ? { brandName: monograph.brand_name, genericName: monograph.generic_name } : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
