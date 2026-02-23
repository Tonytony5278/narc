/**
 * E2B(R3) Report Service
 *
 * Generates AI-assisted MedDRA term suggestions for ICH E2B(R3) ICSR export.
 * Full 5-level hierarchy: LLT → PT → HLT → HLGT → SOC.
 * Confirmed terms are persisted in e2b_meddra_terms table across sessions.
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
  lltCode: string;   // Lowest Level Term code (most specific)
  lltTerm: string;
  ptCode: string;    // Preferred Term code (5-digit MedDRA code)
  ptTerm: string;
  hltCode: string;   // High Level Term code
  hltTerm: string;
  hlgtCode: string;  // High Level Group Term code
  hlgtTerm: string;
  socCode: string;   // System Organ Class code
  socTerm: string;
  confidence: 'high' | 'medium' | 'low';
  aiGenerated: true;
  confirmed: boolean;       // true once QP has confirmed in the dashboard
  confirmedBy?: string;     // user ID of the QP who confirmed
  confirmedAt?: string;     // ISO timestamp of confirmation
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
  confirmedCount: number;
  totalCount: number;
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
    lltCode:  '00000', lltTerm:  reason,
    ptCode:   '00000', ptTerm:   reason,
    hltCode:  '00000', hltTerm:  reason,
    hlgtCode: '00000', hlgtTerm: reason,
    socCode:  '00000', socTerm:  reason,
    confidence:  'low',
    aiGenerated: true,
    confirmed:   false,
    warning: `Could not generate AI suggestion — ${reason.toLowerCase()}`,
  };
}

// ─── Claude MedDRA suggestion (full 5-level hierarchy) ────────────────────

/**
 * Call Claude to suggest the full 5-level MedDRA hierarchy for a batch of AE findings.
 * Returns one MeddraSuggestion per finding (in order).
 *
 * MedDRA hierarchy: LLT → PT → HLT → HLGT → SOC
 * LLT is the most specific term; usually LLT ≈ PT unless a more granular LLT exists.
 */
async function suggestMeddraBatch(findings: FindingRow[]): Promise<MeddraSuggestion[]> {
  if (findings.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

Your task: suggest the most appropriate FULL 5-level MedDRA coding hierarchy for each adverse event finding.

MedDRA HIERARCHY (most specific → broadest):
  LLT  = Lowest Level Term  (patient/reporter-reported verbatim term mapped to MedDRA)
  PT   = Preferred Term     (standardised medical concept; LLT often = PT code unless more specific LLT exists)
  HLT  = High Level Term    (groups related PTs by anatomy/pathology/aetiology)
  HLGT = High Level Group Term (groups related HLTs)
  SOC  = System Organ Class (27 top-level organ/function categories)

RULES:
1. You do NOT have access to the licensed MedDRA dictionary. Use your training knowledge.
2. For LLT: provide the most specific verbatim term; if no more-specific LLT exists, use same code/term as PT.
3. Use real 5-digit MedDRA codes when confident. Use "00000" only when genuinely uncertain.
4. Confidence: "high" = confident in both term AND code; "medium" = term likely correct, code uncertain; "low" = best clinical guess.
5. Always select the PRIMARY SOC (the one MedDRA marks as primary, not secondary, for that PT).
6. Ensure hierarchical consistency: PT must belong to the HLT; HLT to the HLGT; HLGT to the SOC.

SOC REFERENCE (name + code):
• Injection/infusion site → General disorders and administration site conditions (10018065)
• Cardiac → Cardiac disorders (10007541)
• GI → Gastrointestinal disorders (10017947)
• Infections → Infections and infestations (10021881)
• Skin/rash → Skin and subcutaneous tissue disorders (10040785)
• Respiratory → Respiratory, thoracic and mediastinal disorders (10038738)
• Musculoskeletal → Musculoskeletal and connective tissue disorders (10028395)
• Neurological → Nervous system disorders (10029205)
• Blood/lymphatic → Blood and lymphatic system disorders (10005329)
• Metabolism → Metabolism and nutrition disorders (10027433)
• Psychiatric → Psychiatric disorders (10037175)
• Hepatic → Hepatobiliary disorders (10019805)
• Renal → Renal and urinary disorders (10038359)
• Reproductive → Reproductive system and breast disorders (10038604)
• Pregnancy → Pregnancy, puerperium and perinatal conditions (10036585)
• Neoplasms → Neoplasms benign, malignant and unspecified (10029104)
• Immune → Immune system disorders (10021428)
• Eye → Eye disorders (10015919)
• Ear → Ear and labyrinth disorders (10013993)
• Endocrine → Endocrine disorders (10014698)
• Vascular → Vascular disorders (10047065)
• Investigations/lab → Investigations (10022891)
• Social circumstances → Social circumstances (10041244)
• Injury/poisoning → Injury, poisoning and procedural complications (10022117)
• Congenital → Congenital, familial and genetic disorders (10010331)

COMMON PT EXAMPLES:
• Injection site erythema: LLT=10022474 PT=10022474 HLT=10066779 HLGT=10019993 SOC=10018065
• Fatigue: LLT=10016256 PT=10016256 HLT=10022894 HLGT=10022893 SOC=10018065
• Nausea: LLT=10028813 PT=10028813 HLT=10028794 HLGT=10017974 SOC=10017947
• Rash: LLT=10037844 PT=10037844 HLT=10040753 HLGT=10040785 SOC=10040785
• Headache: LLT=10019211 PT=10019211 HLT=10019231 HLGT=10019228 SOC=10029205
• Dyspnoea: LLT=10013968 PT=10013968 HLT=10013964 HLGT=10038723 SOC=10038738
• Arthralgia: LLT=10003246 PT=10003246 HLT=10003248 HLGT=10028379 SOC=10028395
• Diarrhoea: LLT=10012735 PT=10012735 HLT=10012740 HLGT=10017974 SOC=10017947
• URTI: LLT=10046306 PT=10046306 HLT=10046286 HLGT=10021876 SOC=10021881
• Off-label use: LLT=10062568 PT=10062568 HLT=10062569 HLGT=10040850 SOC=10041244

Respond ONLY with a raw JSON array — no markdown fences, no explanation.`;

  const userMessage =
    `Provide the full 5-level MedDRA coding hierarchy for these ${findings.length} AE finding(s):\n\n` +
    findingsText +
    `\n\nReturn a JSON array with exactly ${findings.length} elements (in order):\n` +
    `[\n  {\n` +
    `    "lltCode": "12345",\n` +
    `    "lltTerm": "Lowest Level Term",\n` +
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
    console.log(`[e2b] Requesting 5-level MedDRA suggestions for ${findings.length} finding(s)…`);

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[e2b] Could not parse MedDRA response, using fallback. Raw:', text.slice(0, 300));
      return findings.map(() => fallbackSuggestion('AI response could not be parsed'));
    }

    type RawSuggestion = {
      lltCode?: string; lltTerm?: string;
      ptCode?: string;  ptTerm?: string;
      hltCode?: string; hltTerm?: string;
      hlgtCode?: string; hlgtTerm?: string;
      socCode?: string; socTerm?: string;
      confidence?: string;
    };
    const parsed = JSON.parse(jsonMatch[0]) as RawSuggestion[];

    if (!Array.isArray(parsed) || parsed.length !== findings.length) {
      console.warn(`[e2b] Response length mismatch (${parsed.length ?? 0} vs ${findings.length})`);
    }

    return findings.map((_, i) => {
      const s = parsed[i];
      if (!s) return fallbackSuggestion('AI did not return a suggestion for this finding');

      const ptCode = String(s.ptCode ?? '00000');
      const ptTerm = String(s.ptTerm ?? 'Unknown');
      // LLT defaults to PT if not returned separately
      const lltCode = String(s.lltCode ?? ptCode);
      const lltTerm = String(s.lltTerm ?? ptTerm);

      return {
        lltCode,  lltTerm,
        ptCode,   ptTerm,
        hltCode:  String(s.hltCode  ?? '00000'),
        hltTerm:  String(s.hltTerm  ?? 'Unknown'),
        hlgtCode: String(s.hlgtCode ?? '00000'),
        hlgtTerm: String(s.hlgtTerm ?? 'Unknown'),
        socCode:  String(s.socCode  ?? '00000'),
        socTerm:  String(s.socTerm  ?? 'Unknown'),
        confidence:  (['high', 'medium', 'low'].includes(s.confidence ?? '') ? s.confidence : 'low') as MeddraSuggestion['confidence'],
        aiGenerated: true as const,
        confirmed:   false,
        warning:     AI_WARNING,
      };
    });
  } catch (err) {
    console.error('[e2b] MedDRA suggestion error:', err instanceof Error ? err.message : err);
    return findings.map(() => fallbackSuggestion('AI service error'));
  }
}

// ─── Persistent term storage ──────────────────────────────────────────────────

interface ConfirmedTermRow {
  finding_id: string;
  llt_code: string;    llt_term: string;
  pt_code: string;     pt_term: string;
  hlt_code: string;    hlt_term: string;
  hlgt_code: string;   hlgt_term: string;
  soc_code: string;    soc_term: string;
  confidence: string;
  ai_generated: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

/**
 * Load any previously confirmed (or cached) MedDRA terms for an event.
 * Returns a map of findingId → MeddraSuggestion.
 */
async function loadConfirmedTerms(eventId: string): Promise<Map<string, MeddraSuggestion>> {
  const pool = getPool();
  try {
    const result = await pool.query<ConfirmedTermRow>(
      `SELECT finding_id, llt_code, llt_term, pt_code, pt_term,
              hlt_code, hlt_term, hlgt_code, hlgt_term,
              soc_code, soc_term, confidence, ai_generated, confirmed_by, confirmed_at
       FROM e2b_meddra_terms
       WHERE event_id = $1`,
      [eventId]
    );

    const map = new Map<string, MeddraSuggestion>();
    for (const row of result.rows) {
      map.set(row.finding_id, {
        lltCode:  row.llt_code,    lltTerm:  row.llt_term,
        ptCode:   row.pt_code,     ptTerm:   row.pt_term,
        hltCode:  row.hlt_code,    hltTerm:  row.hlt_term,
        hlgtCode: row.hlgt_code,   hlgtTerm: row.hlgt_term,
        socCode:  row.soc_code,    socTerm:  row.soc_term,
        confidence:  (row.confidence ?? 'low') as MeddraSuggestion['confidence'],
        aiGenerated: true,
        confirmed:   !!row.confirmed_by,
        confirmedBy: row.confirmed_by ?? undefined,
        confirmedAt: row.confirmed_at ?? undefined,
        warning:     row.ai_generated ? AI_WARNING : '',
      });
    }
    return map;
  } catch {
    // Table may not exist yet (migration not run yet) — return empty map
    return new Map();
  }
}

/**
 * Save a QP-confirmed MedDRA term for a finding (upsert).
 * Called from the cases route when the user confirms a term in the dashboard.
 */
export async function saveConfirmedTerm(
  eventId: string,
  findingId: string,
  term: Omit<MeddraSuggestion, 'aiGenerated' | 'warning' | 'confirmed'>,
  confirmedById: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO e2b_meddra_terms
       (finding_id, event_id, llt_code, llt_term, pt_code, pt_term,
        hlt_code, hlt_term, hlgt_code, hlgt_term, soc_code, soc_term,
        confidence, ai_generated, confirmed_by, confirmed_at, meddra_version, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14,NOW(),$15,NOW())
     ON CONFLICT (finding_id) DO UPDATE SET
       llt_code     = EXCLUDED.llt_code,    llt_term     = EXCLUDED.llt_term,
       pt_code      = EXCLUDED.pt_code,     pt_term      = EXCLUDED.pt_term,
       hlt_code     = EXCLUDED.hlt_code,    hlt_term     = EXCLUDED.hlt_term,
       hlgt_code    = EXCLUDED.hlgt_code,   hlgt_term    = EXCLUDED.hlgt_term,
       soc_code     = EXCLUDED.soc_code,    soc_term     = EXCLUDED.soc_term,
       confidence   = EXCLUDED.confidence,
       ai_generated = false,
       confirmed_by = EXCLUDED.confirmed_by,
       confirmed_at = NOW(),
       updated_at   = NOW()`,
    [
      findingId, eventId,
      term.lltCode, term.lltTerm,
      term.ptCode,  term.ptTerm,
      term.hltCode, term.hltTerm,
      term.hlgtCode, term.hlgtTerm,
      term.socCode, term.socTerm,
      term.confidence, confirmedById, MEDDRA_VERSION,
    ]
  );
}

/**
 * Save AI-generated suggestions to the DB (without confirming them).
 * Allows fast reloads without re-calling Claude.
 */
async function saveAISuggestions(
  eventId: string,
  findings: FindingRow[],
  suggestions: MeddraSuggestion[]
): Promise<void> {
  const pool = getPool();
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const s = suggestions[i];
    if (!f || !s) continue;
    try {
      await pool.query(
        `INSERT INTO e2b_meddra_terms
           (finding_id, event_id, llt_code, llt_term, pt_code, pt_term,
            hlt_code, hlt_term, hlgt_code, hlgt_term, soc_code, soc_term,
            confidence, ai_generated, meddra_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14)
         ON CONFLICT (finding_id) DO NOTHING`,
        [
          f.id, eventId,
          s.lltCode, s.lltTerm,
          s.ptCode,  s.ptTerm,
          s.hltCode, s.hltTerm,
          s.hlgtCode, s.hlgtTerm,
          s.socCode, s.socTerm,
          s.confidence, MEDDRA_VERSION,
        ]
      );
    } catch {
      // Non-critical — don't fail the E2B response
    }
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Generate E2B(R3) data for a given event.
 * 1. Loads confirmed/cached terms from DB first (no Claude call needed for those).
 * 2. Calls Claude only for findings without cached terms.
 * 3. Persists new AI suggestions to DB for subsequent fast loads.
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

  // ── Load existing confirmed / cached suggestions ──────────────────────
  const cachedTerms = await loadConfirmedTerms(eventId);

  // ── Only call Claude for findings that aren't already cached ────────────
  const uncachedFindings = findings.filter((f) => !cachedTerms.has(f.id));
  let newSuggestions: MeddraSuggestion[] = [];

  if (uncachedFindings.length > 0) {
    newSuggestions = await suggestMeddraBatch(uncachedFindings);
    // Persist new AI suggestions asynchronously (don't block response)
    saveAISuggestions(eventId, uncachedFindings, newSuggestions).catch(() => {});
  }

  // ── Merge cached + new suggestions ────────────────────────────────────
  let uncachedIdx = 0;
  const e2bFindings: E2BFinding[] = findings.map((f) => {
    let meddra: MeddraSuggestion;
    if (cachedTerms.has(f.id)) {
      meddra = cachedTerms.get(f.id)!;
    } else {
      meddra = newSuggestions[uncachedIdx++] ?? fallbackSuggestion();
    }
    return {
      findingId:   f.id,
      excerpt:     f.excerpt,
      category:    f.category,
      severity:    f.severity,
      urgency:     f.urgency,
      explanation: f.explanation,
      meddra,
    };
  });

  const confirmedCount = e2bFindings.filter((f) => f.meddra.confirmed).length;

  const receivedAt =
    event.received_at instanceof Date
      ? event.received_at.toISOString()
      : String(event.received_at);

  console.log(
    `[e2b] ✅ E2B data for event ${eventId} — ${e2bFindings.length} finding(s), ` +
    `${confirmedCount} confirmed, ${uncachedFindings.length} new AI suggestion(s)`
  );

  return {
    eventId:       event.id,
    event: {
      subject:     event.subject,
      sender:      event.sender,
      receivedAt,
      bodyExcerpt: event.body_excerpt,
      maxSeverity: event.max_severity,
    },
    generatedAt:   new Date().toISOString(),
    meddraVersion: MEDDRA_VERSION,
    findings:      e2bFindings,
    disclaimer:    DISCLAIMER,
    confirmedCount,
    totalCount:    e2bFindings.length,
  };
}
