import { z } from 'zod';

// ─── AE Category ────────────────────────────────────────────────────────────

export const AECategory = z.enum([
  'adverse_reaction',       // unwanted drug effects reported by patient
  'off_label_use',          // medication used for unapproved indication
  'off_label_dosing',       // dose/route/frequency outside prescribing info
  'pregnancy_exposure',     // pregnant or breastfeeding while on medication
  'drug_interaction',       // concurrent medication causing potential interaction
  'serious_adverse_event',  // hospitalization, death, or life-threatening event
  'overdose',               // patient took more than prescribed or accidental ingestion
  'medication_error',       // wrong drug, wrong patient, wrong route, missed doses
]);

export type AECategoryType = z.infer<typeof AECategory>;

// ─── Severity & Urgency ─────────────────────────────────────────────────────

export const AESeverity = z.enum(['low', 'medium', 'high', 'critical']);
export type AESeverityType = z.infer<typeof AESeverity>;

export const AEUrgency = z.enum([
  'immediate',       // life-threatening — report within hours
  'within_24h',      // serious — report same business day
  'within_7_days',   // standard FDA 15-day expedited window
  'routine',         // non-urgent, for periodic safety reporting
]);
export type AEUrgencyType = z.infer<typeof AEUrgency>;

// ─── Highlight Span ──────────────────────────────────────────────────────────

export const HighlightSpanSchema = z.object({
  start: z.number().int().describe('Start character offset (inclusive) within the email body'),
  end: z.number().int().describe('End character offset (exclusive) within the email body'),
  text: z.string().describe('The highlighted text at these offsets'),
});

export type HighlightSpan = z.infer<typeof HighlightSpanSchema>;

// ─── AE Finding ─────────────────────────────────────────────────────────────

export const AEFindingSchema = z.object({
  excerpt: z
    .string()
    .min(1)
    .describe('Verbatim quote from the email that triggered this finding — do not paraphrase'),
  category: AECategory.describe('Classification of the adverse event type'),
  severity: AESeverity.describe(
    'Clinical severity: low=mild discomfort, medium=significant but manageable, ' +
    'high=serious/hospitalization risk, critical=life-threatening or death'
  ),
  explanation: z
    .string()
    .min(10)
    .describe(
      'Why this excerpt constitutes a potential AE and what FDA reporting obligation it may trigger'
    ),
  urgency: AEUrgency.describe('Recommended reporting timeframe per FDA pharmacovigilance guidelines'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Model confidence this is a genuine AE (0.0 = uncertain, 1.0 = definitive)'),
  highlight_spans: z
    .array(HighlightSpanSchema)
    .optional()
    .describe(
      'Character offset spans [start, end) locating this excerpt within the email body. ' +
      'Use the exact character positions from the EMAIL BODY section of the user message.'
    ),
});

export type AEFinding = z.infer<typeof AEFindingSchema>;

// ─── Analyze Response (Claude output schema) ─────────────────────────────────

export const AnalyzeResponseSchema = z.object({
  findings: z.array(AEFindingSchema).describe('All detected adverse event findings'),
  summary: z
    .string()
    .describe('1-2 sentence summary of AE risk in this email, suitable for supervisor review'),
  hasAEs: z.boolean().describe('True if at least one potential AE was detected'),
  analysisNotes: z
    .string()
    .optional()
    .describe('Any caveats or important context about the analysis (missing info, ambiguity, etc.)'),
});

export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

// ─── Analyze Request (API input) ────────────────────────────────────────────

export const AnalyzeRequestSchema = z.object({
  emailBody: z.string().min(1).max(50000),
  subject: z.string().optional().default(''),
  sender: z.string().optional().default(''),
  receivedAt: z.string().optional().default(() => new Date().toISOString()),
  emailId: z.string().optional(),
  drugName: z
    .string()
    .optional()
    .describe('The name of the program medication, if known — helps Claude classify off-label use'),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

// ─── Event Status ────────────────────────────────────────────────────────────

export const EventStatus = z.enum([
  'pending',
  'reviewed',
  'reported',
  'dismissed',
  'escalated',
  'false_positive',
]);
export type EventStatusType = z.infer<typeof EventStatus>;

export const FindingStatus = z.enum(['pending', 'reported', 'dismissed']);
export type FindingStatusType = z.infer<typeof FindingStatus>;

// ─── SLA + RBAC ──────────────────────────────────────────────────────────────

export const UserRole = z.enum(['agent', 'supervisor', 'admin']);
export type UserRoleType = z.infer<typeof UserRole>;

export const SlaStatus = z.enum(['on_track', 'at_risk', 'breached', 'met']);
export type SlaStatusType = z.infer<typeof SlaStatus>;

// ─── Status Update Requests ──────────────────────────────────────────────────

export const EventStatusUpdateSchema = z.object({
  status: EventStatus,
  notes: z.string().optional(),
});

export const FindingStatusUpdateSchema = z.object({
  status: FindingStatus,
});

// ─── Database record types (what the API returns) ───────────────────────────

export const AEFindingRecordSchema = AEFindingSchema.extend({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  status: FindingStatus,
  modelVersion: z.string().nullable().optional(),
  rawConfidence: z.number().nullable().optional(),
  calibratedConfidence: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AEFindingRecord = z.infer<typeof AEFindingRecordSchema>;

export const EventRecordSchema = z.object({
  id: z.string().uuid(),
  emailId: z.string(),
  subject: z.string(),
  sender: z.string(),
  receivedAt: z.string(),
  bodyExcerpt: z.string(),
  aeCount: z.number().int(),
  maxSeverity: AESeverity,
  status: EventStatus,
  notes: z.string().optional().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  findings: z.array(AEFindingRecordSchema),
});

export type EventRecord = z.infer<typeof EventRecordSchema>;

// ─── Extended Event Record (SLA + RBAC + policy + detection fields) ──────────

export const EventRecordExtendedSchema = EventRecordSchema.extend({
  detectedAt: z.string().nullable().optional(),
  deadlineAt: z.string().nullable().optional(),
  slaStatus: SlaStatus.default('on_track'),
  escalationLevel: z.number().int().default(0),
  policyVersionId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
  modelVersion: z.string().nullable().optional(),
});

export type EventRecordExtended = z.infer<typeof EventRecordExtendedSchema>;

// ─── Document ────────────────────────────────────────────────────────────────

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  storagePath: z.string(),
  extractionMethod: z.string(),
  extractedText: z.string().nullable().optional(),
  ocrConfidence: z.number().nullable().optional(),
  boundingBoxes: z.unknown().nullable().optional(),
  processingStatus: z.string(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type Document = z.infer<typeof DocumentSchema>;

// ─── Submission ───────────────────────────────────────────────────────────────

export const SubmissionSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  submittedBy: z.string().uuid().nullable().optional(),
  submittedAt: z.string(),
  destination: z.string(),
  packetJson: z.unknown(),
  status: z.string(),
});

export type Submission = z.infer<typeof SubmissionSchema>;

// ─── Policy ───────────────────────────────────────────────────────────────────

export const DetectionRuleSchema = z.object({
  id: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  category: z.string(),
  ruleName: z.string(),
  severityOverride: z.string().nullable().optional(),
  isEnabled: z.boolean(),
  conditions: z.unknown(),
  keywords: z.array(z.string()),
  createdAt: z.string(),
});

export type DetectionRule = z.infer<typeof DetectionRuleSchema>;

export const PolicyVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  effectiveDate: z.string(),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});

export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: UserRole,
  isActive: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable().optional(),
});

export type User = z.infer<typeof UserSchema>;

// ─── API Response Types ──────────────────────────────────────────────────────

export const AnalyzeApiResponseSchema = z.object({
  eventId: z.string().uuid(),
  findings: z.array(AEFindingRecordSchema),
  summary: z.string(),
  hasAEs: z.boolean(),
  analysisNotes: z.string().optional(),
});

export type AnalyzeApiResponse = z.infer<typeof AnalyzeApiResponseSchema>;

export const EventsApiResponseSchema = z.object({
  events: z.array(EventRecordSchema),
  total: z.number().int(),
});

export type EventsApiResponse = z.infer<typeof EventsApiResponseSchema>;
