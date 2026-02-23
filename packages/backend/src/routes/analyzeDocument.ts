/**
 * POST /api/analyze/document
 *
 * Standalone document AE scanner.
 * Accepts a file upload (PDF, image, DOCX, RTF, TXT), extracts text using the
 * existing document pipeline (Claude Vision OCR for faxes / handwriting), then
 * runs full AE detection and returns findings immediately.
 *
 * This is the critical path for attachment pre-read in the Outlook add-in:
 *   1. Add-in fetches attachment bytes from Outlook REST API (base64)
 *   2. Decodes → Blob → multipart POST to this endpoint
 *   3. Backend: extract text → Claude AE analysis → persist event → return findings
 *
 * Optionally links the new event to an existing event via `linkedEventId`.
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { extractText } from '../services/documents';
import { analyzeEmail } from '../services/claude';
import { getActivePolicy, calibrateConfidence } from '../services/policy';
import { computeDeadline, computeSlaStatus } from '../services/sla';
import { lookupMonograph, buildMonographContext } from '../services/monograph';
import { withTransaction } from '../db/pool';
import { insertEvent, getEventByEmailId } from '../db/queries/events';
import { insertFinding } from '../db/queries/findings';
import { auditLog } from '../services/audit';
import { AuditActions } from '@narc/shared';

const router = Router();

const MODEL_VERSION = 'claude-opus-4-6';
const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/rtf',
  'text/plain',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/analyze/document
 *
 * Multipart fields:
 *   document   (required) — the file
 *   filename   (optional) — original filename for display
 *   subject    (optional) — email subject context
 *   sender     (optional) — email sender context
 *   receivedAt (optional) — ISO timestamp
 *   emailId    (optional) — parent email ID for dedup linkage
 *   drugName   (optional) — explicit drug name hint
 */
router.post(
  '/',
  requireAuth,
  upload.single('document'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!;

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Use multipart field "document".' });
        return;
      }

      const {
        subject: rawSubject,
        sender: rawSender,
        receivedAt: rawReceivedAt,
        emailId: rawEmailId,
        drugName,
      } = req.body as Record<string, string>;

      const filename      = req.file.originalname || rawSubject || 'attachment';
      const subject       = rawSubject       ?? `Document: ${filename}`;
      const sender        = rawSender        ?? 'attachment-upload';
      const receivedAt    = rawReceivedAt    ?? new Date().toISOString();
      const mimeType      = req.file.mimetype;

      console.log(`[analyze/doc] Processing: "${filename}" (${mimeType}, ${req.file.size} bytes)`);

      // ── Step 1: Extract text ────────────────────────────────────────────
      const extraction = await extractText(req.file.buffer, mimeType);
      console.log(
        `[analyze/doc] Extracted ${extraction.text.length} chars via ${extraction.method}` +
        (extraction.confidence ? ` (confidence: ${extraction.confidence})` : '')
      );

      if (!extraction.text || extraction.text.length < 10) {
        res.status(422).json({
          error: 'Could not extract readable text from this file.',
          method: extraction.method,
          hint: 'Ensure the file is not password-protected, corrupt, or completely blank.',
        });
        return;
      }

      // ── Step 2: Build a stable dedup key ───────────────────────────────
      // Use provided emailId if given (e.g. Outlook item ID), else hash filename+text
      const emailId =
        rawEmailId ??
        `doc-${Buffer.from(`${filename}::${extraction.text.slice(0, 120)}`).toString('base64').slice(0, 20)}`;

      // ── Step 3: Dedup check ────────────────────────────────────────────
      const existing = await getEventByEmailId(emailId);
      if (existing) {
        const { event: ev, findings: existingFindings } = existing;
        console.log(`[analyze/doc] Dedup hit — returning existing event ${ev.id}`);
        return res.json({
          eventId: ev.id,
          filename,
          extractionMethod: extraction.method,
          extractedChars: extraction.text.length,
          hasAEs: existingFindings.length > 0,
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
          })),
          summary: `Previously analyzed — ${existingFindings.length} finding(s) on record.`,
          analysisNotes: 'Result from cache (same document ID). No new event created.',
        });
      }

      // ── Step 4: Policy + monograph context ────────────────────────────
      const policy        = await getActivePolicy();
      const monograph     = await lookupMonograph(
        [subject, extraction.text.slice(0, 500)].join(' '),
        drugName
      );
      const monographContext = monograph ? buildMonographContext(monograph) : null;

      // ── Step 5: Claude AE analysis ────────────────────────────────────
      const analyzeReq = {
        subject,
        sender,
        emailBody: extraction.text,
        receivedAt,
        emailId,
      };

      const aiResponse = await analyzeEmail(analyzeReq, policy, monographContext);

      // ── Step 6: Max severity + SLA ────────────────────────────────────
      const maxSeverity = aiResponse.findings.reduce<string>((max, f) => {
        return (SEVERITY_ORDER[f.severity] ?? 0) > (SEVERITY_ORDER[max] ?? 0) ? f.severity : max;
      }, 'low');

      const detectedAt  = new Date();
      const deadlineAt  = computeDeadline(maxSeverity, detectedAt);
      const slaResult   = computeSlaStatus(detectedAt, deadlineAt, false);

      // ── Step 7: Calibrate findings ────────────────────────────────────
      const calibrated = aiResponse.findings.map((finding) => {
        const rule = policy?.rules.find(
          (r) =>
            r.is_enabled &&
            r.category === finding.category &&
            r.keywords.some((kw) => finding.excerpt.toLowerCase().includes(kw.toLowerCase()))
        );
        const rawConfidence        = finding.confidence;
        const calibratedConfidence = rule ? calibrateConfidence(rawConfidence, rule) : rawConfidence;
        const severity             = (rule?.severity_override as string | undefined) ?? finding.severity;
        return { finding, rawConfidence, calibratedConfidence, severity };
      });

      // ── Step 8: Persist ────────────────────────────────────────────────
      const eventId = await withTransaction(async (client) => {
        const id = await insertEvent(
          {
            email_id:          emailId,
            subject,
            sender,
            received_at:       receivedAt,
            body_excerpt:      extraction.text.slice(0, 500),
            ae_count:          aiResponse.findings.length,
            max_severity:      maxSeverity,
            status:            'pending',
            notes:             `Source: document upload — ${filename} (${extraction.method})`,
            raw_request:       analyzeReq as object,
            raw_response:      aiResponse as object,
            detected_at:       detectedAt.toISOString(),
            deadline_at:       deadlineAt.toISOString(),
            sla_status:        slaResult.sla_status,
            escalation_level:  slaResult.escalation_level,
            policy_version_id: policy?.id ?? null,
            agent_id:          actor.sub,
            model_version:     MODEL_VERSION,
          },
          client
        );

        for (const { finding, rawConfidence, calibratedConfidence, severity } of calibrated) {
          await insertFinding(
            {
              event_id:              id,
              excerpt:               finding.excerpt,
              category:              finding.category,
              severity,
              explanation:           finding.explanation,
              urgency:               finding.urgency,
              confidence:            calibratedConfidence,
              status:                'pending',
              model_version:         MODEL_VERSION,
              highlight_spans:       finding.highlight_spans ?? null,
              raw_confidence:        rawConfidence,
              calibrated_confidence: calibratedConfidence,
            },
            client
          );
        }

        await auditLog(
          {
            actor:      { id: actor.sub, role: actor.role },
            action:     AuditActions.ANALYZE_EMAIL,
            entityType: 'event',
            entityId:   id,
            before:     null,
            after: {
              source:         'document_upload',
              filename,
              mime_type:      mimeType,
              extraction_method: extraction.method,
              ae_count:       aiResponse.findings.length,
              max_severity:   maxSeverity,
              sla_status:     slaResult.sla_status,
              drug:           monograph?.brand_name ?? null,
            },
            req,
          },
          client
        );

        return id;
      });

      console.log(
        `[analyze/doc] ✅ Event ${eventId} created — ${aiResponse.findings.length} AE(s), severity: ${maxSeverity}`
      );

      res.json({
        eventId,
        filename,
        extractionMethod: extraction.method,
        extractedChars:   extraction.text.length,
        ocrConfidence:    extraction.confidence,
        hasAEs:           aiResponse.hasAEs,
        findings:         calibrated.map(({ finding, rawConfidence, calibratedConfidence, severity }, i) => ({
          id:                    `pending-${i}`,
          eventId,
          excerpt:               finding.excerpt,
          category:              finding.category,
          severity,
          explanation:           finding.explanation,
          urgency:               finding.urgency,
          confidence:            calibratedConfidence,
          status:                'pending' as const,
          modelVersion:          MODEL_VERSION,
          rawConfidence,
          calibratedConfidence,
          highlight_spans:       finding.highlight_spans ?? null,
          createdAt:             new Date().toISOString(),
          updatedAt:             new Date().toISOString(),
        })),
        summary:      aiResponse.summary,
        analysisNotes: aiResponse.analysisNotes ?? null,
        monograph:    monograph ? { brandName: monograph.brand_name, genericName: monograph.generic_name } : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
