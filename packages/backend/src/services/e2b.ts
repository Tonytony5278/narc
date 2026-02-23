/**
 * E2B(R3) Report Service
 *
 * Generates AI-assisted MedDRA term suggestions for ICH E2B(R3) ICSR export.
 *
 * ⚠️  REGULATORY NOTICE: AI-suggested MedDRA codes are NOT verified against the
 * licensed MedDRA dictionary (MSSO). All codes must be confirmed by a qualified
 * pharmacovigilance professional before submission to any regulatory authority.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getPool } from '../db/pool';
import type { EventRow, FindingRow } from '../db/queries/events';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MeddraSuggestion {
  ptCode: string;    // Preferred Term code (5-digit MedDRA code)
  ptTerm: string;    // Preferred Term
  hltCode: string;   // High Level Term code
  hltTerm: string;   // High Level Term
  hlgtCode: string;  // High Level Group Term code
  hlgtTerm: string;  // High Level Group Term
  socCode: string;   // System Organ Class code
  socTerm: string;   // System Organ Class
  confidence: 'high' | 'medium' | 'low';
  aiGenerated: true;
  warning: string;
}

export interface E2BFinding {
  findingId: string;
  excerpt: string;
  category: string;
  severity: string;
  urgency: string;
  explanation: string;
  meddra: MeddraSuggestion;
}

export interface E2BData {
  eventId: string;
  event: {
    subject: string;
    sender: string;
    receivedAt: string;
    bodyExcerpt: string;
    maxSeverity: string;
  };
  generatedAt: string;
  meddraVersion: string;
  findings: E2BFinding[];
  disclaimer: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MEDDRA_VERSION = '27.0';

const AI_WARNING =
  'AI-suggested — must be verified against the current licensed MedDRA dictionary ' +
  '(MSSO) by a qualified pharmacovigilance professional before regulatory submission.';

const DISCLAIMER =
  'AI-SUGGESTED MEDDRA CODES — NOT FOR REGULATORY SUBMISSION WITHOUT QUALIFIED PERSON (QP) REVIEW. ' +
  'All MedDRA terms and codes suggested by AI must be verified against the current licensed MedDRA ' +
  'dictionary (MSSO) by a qualified pharmacovigilance professional before submission to any regulatory ' +
  'authority (FDA FAERS, EMA EudraVigilance, Health Canada MedEffect Canada). ' +
  'Codes marked "00000" indicate high uncertainty and require mandatory manual lookup.';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fallbackSuggestion(reason = 'Manual coding required'): MeddraSuggestion {
  return {
    ptCode: '00000',
    ptTerm: reason,
    hltCode: '00000',
    hltTerm: reason,
    hlgtCode: '00000',
    hlgtTerm: reason,
    socCode: '00000',
    socTerm: reason,
    confidence: 'low',
    aiGenerated: true,
    warning: `Could not generate AI suggestion — ${reason.toLowerCase()}`,
  };
}

// ─── Claude MedDRA suggestion ─────────────────────────────────────────────

/**
 * Call Claude to suggest MedDRA terms for a batch of AE findings.
 * Returns one MeddraSuggestion per finding (in order).
 */
async function suggestMeddraBatch(findings: FindingRow[]): Promise<MeddraSuggestion[]> {
  if (findings.length === 0) return [];

  const client = new Anthropic();

  const findingsText = findings
    .map(
      (f, i) =>
        `Finding ${i + 1}:\n` +
        `  Category: ${f.category}\n` +
        `  Severity: ${f.severity}\n` +
        `  Excerpt: "${f.excerpt.slice(0, 250)}"\n` +
        `  Explanation: ${f.explanation.slice(0, 250)}`
    )
    .join('\n\n---\n\n');

  const systemPrompt = `You are a senior pharmacovigilance coder with deep expertise in MedDRA \
(Medical Dictionary for Regulatory Activities, version ${MEDDRA_VERSION}).

Your task: suggest the most appropriate MedDRA coding hierarchy for each adverse event finding.

RULES:
1. You do NOT have access to the licensed MedDRA dictionary. Use your training knowledge.
2. For each finding, provide the complete 4-level MedDRA hierarchy: PT → HLT → HLGT → SOC.
3. Use real 5-digit MedDRA codes when you are confident. Use "00000" for uncertain codes.
4. Confidence: "high" = certain term + code, "medium" = term likely correct / code uncertain, "low" = best clinical guess.
5. Always select the PRIMARY SOC (the one MedDRA marks as primary for that PT).

COMMON SOC REFERENCE:
• Injection/infusion site reactions → SOC: General disorders and administration site conditions (10018065)
• Cardiac / heart events → SOC: Cardiac disorders (10007541)
• GI disorders → SOC: Gastrointestinal disorders (10017947)
• Infections → SOC: Infections and infestations (10021881)
• Skin / rash → SOC: Skin and subcutaneous tissue disorders (10040785)
• Respiratory → SOC: Respiratory, thoracic and mediastinal disorders (10038738)
• Musculoskeletal → SOC: Musculoskeletal and connective tissue disorders (10028395)
• Neurological → SOC: Nervous system disorders (10029205)
• Blood / lymphatic → SOC: Blood and lymphatic system disorders (10005329)
• Metabolism → SOC: Metabolism and nutrition disorders (10027433)
• Psychiatric → SOC: Psychiatric disorders (10037175)
• Hepatic → SOC: Hepatobiliary disorders (10019805)
• Renal → SOC: Renal and urinary disorders (10038359)
• Reproductive → SOC: Reproductive system and breast disorders (10038604)
• Pregnancy → SOC: Pregnancy, puerperium and perinatal conditions (10036585)
• Neoplasms → SOC: Neoplasms benign, malignant and unspecified (10029104)
• Immune → SOC: Immune system disorders (10021428)
• Off-label / dosing → SOC: Social circumstances (10041244) or primary reaction SOC

Respond ONLY with a raw JSON array — no markdown fences, no explanation.`;

  const userMessage =
    `Provide MedDRA coding for these ${findings.length} AE finding(s):\n\n` +
    findingsText +
    `\n\nReturn a JSON array with exactly ${findings.length} elements (in order):\n` +
    `[\n  {\n` +
    `    "ptCode": "12345",\n` +
    `    "ptTerm": "Preferred Term",\n` +
    `    "hltCode": "12345",\n` +
    `    "hltTerm": "High Level Term",\n` +
    `    "hlgtCode": "12345",\n` +
    `    "hlgtTerm": "High Level Group Term",\n` +
    `    "socCode": "12345",\n` +
    `    "socTerm": "System Organ Class",\n` +
    `    "confidence": "high|medium|low"\n` +
    `  }\n]`;

  try {
    console.log(`[e2b] Requesting MedDRA suggestions for ${findings.length} finding(s)…`);

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';

    // Extract JSON array — Claude sometimes wraps in markdown code blocks
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[e2b] Could not parse MedDRA response, using fallback. Raw:', text.slice(0, 300));
      return findings.map(() => fallbackSuggestion('AI response could not be parsed'));
    }

    type RawSuggestion = Omit<MeddraSuggestion, 'aiGenerated' | 'warning'>;
    const parsed = JSON.parse(jsonMatch[0]) as RawSuggestion[];

    if (!Array.isArray(parsed) || parsed.length !== findings.length) {
      console.warn(`[e2b] Response array length mismatch (${parsed.length ?? 0} vs ${findings.length})`);
    }

    // Pad or trim to exact finding count, attach metadata
    return findings.map((_, i) => {
      const s = parsed[i];
      if (!s) return fallbackSuggestion('AI did not return a suggestion for this finding');
      return {
        ptCode:   String(s.ptCode   ?? '00000'),
        ptTerm:   String(s.ptTerm   ?? 'Unknown'),
        hltCode:  String(s.hltCode  ?? '00000'),
        hltTerm:  String(s.hltTerm  ?? 'Unknown'),
        hlgtCode: String(s.hlgtCode ?? '00000'),
        hlgtTerm: String(s.hlgtTerm ?? 'Unknown'),
        socCode:  String(s.socCode  ?? '00000'),
        socTerm:  String(s.socTerm  ?? 'Unknown'),
        confidence: (['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : 'low') as MeddraSuggestion['confidence'],
        aiGenerated: true as const,
        warning: AI_WARNING,
      };
    });
  } catch (err) {
    console.error('[e2b] MedDRA suggestion error:', err instanceof Error ? err.message : err);
    return findings.map(() => fallbackSuggestion('AI service error'));
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Generate E2B(R3) data for a given event.
 * Fetches event + findings from DB, calls Claude for MedDRA suggestions,
 * and returns structured data for the dashboard to render and export as XML.
 */
export async function generateE2BData(eventId: string): Promise<E2BData> {
  const pool = getPool();

  const [eventResult, findingsResult] = await Promise.all([
    pool.query<EventRow>('SELECT * FROM events WHERE id = $1', [eventId]),
    pool.query<FindingRow>(
      'SELECT * FROM ae_findings WHERE event_id = $1 ORDER BY created_at ASC',
      [eventId]
    ),
  ]);

  const event = eventResult.rows[0];
  if (!event) {
    throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  }

  const findings = findingsResult.rows;
  const suggestions = await suggestMeddraBatch(findings);

  const e2bFindings: E2BFinding[] = findings.map((f, i) => ({
    findingId: f.id,
    excerpt: f.excerpt,
    category: f.category,
    severity: f.severity,
    urgency: f.urgency,
    explanation: f.explanation,
    meddra: suggestions[i] ?? fallbackSuggestion(),
  }));

  const receivedAt =
    event.received_at instanceof Date
      ? event.received_at.toISOString()
      : String(event.received_at);

  console.log(`[e2b] ✅ Generated E2B data for event ${eventId} — ${e2bFindings.length} finding(s)`);

  return {
    eventId: event.id,
    event: {
      subject:     event.subject,
      sender:      event.sender,
      receivedAt,
      bodyExcerpt: event.body_excerpt,
      maxSeverity: event.max_severity,
    },
    generatedAt:  new Date().toISOString(),
    meddraVersion: MEDDRA_VERSION,
    findings:     e2bFindings,
    disclaimer:   DISCLAIMER,
  };
}
