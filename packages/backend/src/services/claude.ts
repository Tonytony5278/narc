import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AnalyzeRequest, AnalyzeResponse, AnalyzeResponseSchema } from '@narc/shared';
import type { ActivePolicy } from './policy';

// Lazy-initialised so dotenv has time to populate process.env before first call
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export const MODEL_VERSION = 'claude-opus-4-6';

// ─── System Prompt ─────────────────────────────────────────────────────────
// This is the core IP of the NARC product.
// Carefully calibrated for pharma patient support program context.
const SYSTEM_PROMPT = `You are an expert pharmacovigilance analyst working for a pharmaceutical patient support program. Your job is to screen patient and caregiver communications for potential Adverse Events (AEs) that may require FDA/Health Canada reporting under 21 CFR Part 314 and ICH E2A/E2B guidelines.

REGULATORY CONTEXT:
You are analyzing communications from patients enrolled in a manufacturer patient support program. These communications may contain spontaneous AE reports, which under FDA/Health Canada regulations must be reported within strict timeframes when they describe:
1. A serious adverse event (death, life-threatening, hospitalization, disability, congenital anomaly, or any event requiring medical intervention to prevent permanent impairment)
2. Any adverse event associated with the program medication
3. Off-label use or dosing errors, overdoses, or drug interactions
4. Pregnancy or lactation exposure to program medications

YOUR TASK:
Analyze the provided email communication and identify every potential Adverse Event. For each AE you find, extract:
- The EXACT verbatim text from the email that triggered the finding (do not paraphrase or summarize — use the patient's own words)
- The most specific AE category
- Clinical severity
- A clear explanation of the regulatory significance
- Recommended reporting urgency
- highlight_spans: The character offsets [start, end) of the excerpt within the EMAIL BODY section below. Count characters from the first character of the email body text (after the "─── EMAIL BODY ───" marker line). Include start (inclusive) and end (exclusive) offsets plus the exact matched text.

CATEGORY DEFINITIONS:
- adverse_reaction: Patient reports an unwanted physical or psychological effect after taking the medication (e.g., rash, nausea, fatigue, chest pain, headache, vision changes, etc.)
- off_label_use: The medication is being used for a condition not listed in its approved indication. Look for disease states, symptoms, or conditions being treated that don't match the approved label.
- off_label_dosing: The dose, frequency, route of administration, or duration of use differs from the approved prescribing information (e.g., "my doctor told me to take double the dose", "I've been using it for 3 years"). If a DRUG MONOGRAPH CONTEXT is provided below, cross-reference the dosing against the approved dosing and flag any deviation.
- pregnancy_exposure: The patient mentions being pregnant, trying to become pregnant, breastfeeding, or having recently given birth while on the medication
- drug_interaction: The patient reports taking another medication concurrently with the program medication, especially if symptoms align with a known or potential interaction
- serious_adverse_event: Any report involving hospitalization, emergency room visit, disability, permanent injury, or death — this supersedes adverse_reaction if the event is serious
- overdose: Patient took more than their prescribed dose, or reports accidental ingestion (e.g., by a child)
- medication_error: Wrong drug dispensed, wrong patient received medication, wrong route used, patient took someone else's medication

SEVERITY CALIBRATION:
- critical: Death, life-threatening events, hospitalization, ICU admission, permanent disability, or events that would have resulted in death without intervention
- high: Significant medical intervention required, emergency room visit, severe symptoms preventing normal function, or events requiring a physician visit
- medium: Clinically meaningful side effects that are manageable but warrant physician contact; not immediately dangerous
- low: Mild, self-limiting symptoms (minor discomfort, brief headache, slight nausea); patient not significantly impacted

URGENCY CALIBRATION:
- immediate: Life-threatening or fatal events — escalate within hours
- within_24h: Serious adverse events (hospitalization, ER visits, pregnancy exposures) — report same business day
- within_7_days: Non-serious AEs with regulatory significance — standard expedited report window
- routine: Mild AEs and off-label use/dosing — periodic safety report

CONSERVATISM RULE (critical):
In pharmaceutical safety reporting, a missed AE is far more serious than a false positive. Under-reporting can result in regulatory action against the manufacturer and, more importantly, harm to other patients. Therefore:
- If you are UNCERTAIN whether something is an AE, INCLUDE IT with a lower confidence score and explain your uncertainty in the explanation field
- When in doubt, classify at the higher severity level
- A borderline finding that a nurse reviews and dismisses is far preferable to a missed reportable event

DO NOT:
- Invent AEs not present in the text
- Report purely administrative content (appointment scheduling, prescription refill requests, insurance questions) as AEs UNLESS they contain safety-relevant content
- Include the same event twice under different categories — choose the most specific/severe category
- Paraphrase the patient's words in the excerpt — always use verbatim text from the email
- Report general health questions as AEs unless they contain safety signals

EDGE CASES:
- "I stopped taking it because of side effects" — this IS an AE (adverse reaction, potentially serious if stopped abruptly)
- "My friend also takes this medication" — NOT an AE for this patient (different patient), note in analysisNotes if relevant
- "I read online it can cause..." — NOT an AE (hypothetical concern, not an actual event)
- "I think I missed a dose" — NOT an AE unless harm resulted from the missed dose

OUTPUT:
Return ONLY the tool call. No prose, no preamble, no commentary outside the tool response.`;

// ─── User message builder ──────────────────────────────────────────────────

function buildUserMessage(
  req: AnalyzeRequest,
  policy: ActivePolicy | null,
  monographContext: string | null
): string {
  const parts = [
    `PATIENT EMAIL COMMUNICATION`,
    `Date/Time: ${req.receivedAt}`,
    `From: ${req.sender || '(unknown sender)'}`,
    `Subject: ${req.subject || '(no subject)'}`,
  ];

  if (req.drugName) {
    parts.push(`Program Medication: ${req.drugName}`);
  }

  if (policy) {
    const enabledRules = policy.rules.filter((r) => r.is_enabled);
    if (enabledRules.length > 0) {
      parts.push(
        '',
        `ACTIVE DETECTION POLICY: ${policy.name} (v${policy.version})`,
        'Pay extra attention to the following categories and keywords:',
        ...enabledRules.map(
          (r) => `  • ${r.category}: ${r.keywords.join(', ')}`
        )
      );
    }
  }

  // Inject Health Canada monograph context for off-label dosing detection
  if (monographContext) {
    parts.push(monographContext);
  }

  parts.push(
    '',
    '─── EMAIL BODY ───',
    req.emailBody,
    '─── END OF EMAIL ───',
    '',
    'Please analyze the above email for potential Adverse Events and return your findings using the report_ae_findings tool. Include highlight_spans for each finding.'
  );

  return parts.join('\n');
}

// ─── Main analysis function ────────────────────────────────────────────────

export async function analyzeEmail(
  req: AnalyzeRequest,
  policy: ActivePolicy | null = null,
  monographContext: string | null = null
): Promise<AnalyzeResponse & { modelVersion: string }> {
  // Convert the Zod schema to JSON Schema for Anthropic's tool input_schema.
  // Use `as any` on the function to bypass TypeScript's type instantiation
  // depth limit on complex nested Zod schemas — runtime behavior is identical.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSchema = (zodToJsonSchema as any)(AnalyzeResponseSchema, {
    name: 'AEAnalysis',
    $refStrategy: 'none', // flatten $refs for compatibility
  }) as Record<string, unknown>;

  // Anthropic requires input_schema to have "type": "object" at the root.
  // zodToJsonSchema may omit this — ensure it is always present.
  const jsonSchema: Record<string, unknown> = {
    type: 'object',
    ...rawSchema,
  };

  const message = await getClient().messages.create({
    model: MODEL_VERSION,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildUserMessage(req, policy, monographContext),
      },
    ],
    tools: [
      {
        name: 'report_ae_findings',
        description:
          'Report the structured adverse event findings from the email analysis. ' +
          'Call this tool with all findings, summary, and analysis metadata.',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input_schema: jsonSchema as any,
      },
    ],
    // Force Claude to always use the tool — prevents raw-text fallback
    tool_choice: { type: 'tool', name: 'report_ae_findings' },
  });

  // Extract the tool_use block
  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block — unexpected response format');
  }

  // Validate against our Zod schema (throws ZodError on mismatch)
  const validated = AnalyzeResponseSchema.parse(toolUse.input);
  return { ...validated, modelVersion: MODEL_VERSION };
}
