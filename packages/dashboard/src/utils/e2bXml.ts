/**
 * ICH E2B(R3) XML Builder (client-side)
 *
 * Generates a standards-compliant ICH E2B(R3) Individual Case Safety Report (ICSR)
 * XML file from confirmed event data and (user-reviewed) MedDRA terms.
 *
 * Reference: ICH E2B(R3) Implementation Guide (2018)
 *            https://www.ich.org/page/e2b
 *
 * ⚠️  AI-suggested MedDRA codes must be confirmed by a qualified pharmacovigilance
 *     professional before regulatory submission.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface E2BReaction {
  findingId: string;
  excerpt: string;
  category: string;
  severity: string;
  urgency: string;
  meddra: {
    lltCode: string;    // Lowest Level Term (most specific; defaults to PT values when no distinct LLT)
    lltTerm: string;
    ptCode: string;
    ptTerm: string;
    hltCode: string;
    hltTerm: string;
    hlgtCode: string;
    hlgtTerm: string;
    socCode: string;
    socTerm: string;
    confidence: 'high' | 'medium' | 'low';
    aiGenerated: boolean;
    confirmed: boolean;  // Has a human reviewed this term?
  };
}

export interface E2BXmlOptions {
  eventId: string;
  event: {
    subject: string;
    sender: string;
    receivedAt: string;
    maxSeverity: string;
    bodyExcerpt: string;
  };
  reactions: E2BReaction[];
  meddraVersion: string;
  exportedBy: string;    // User email
  receiver?: string;     // Regulatory destination (default: Health Canada MedEffect)
  senderOrg?: string;    // Sender organisation name
  country?: string;      // ISO 3166-1 alpha-2 country (default: CA)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format ISO date → yyyyMMdd (E2B date format 102) */
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10).replace(/-/g, '');
  } catch {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
}

/** Format ISO date → yyyyMMddHHmmss (E2B date format 204) */
function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toISOString().replace(/[-:T]/g, '').slice(0, 14);
  } catch {
    return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }
}

/**
 * Map AE max severity to ICH E2B(R3) seriousness criteria.
 * Returns "1" (yes) or "2" (no) for each criterion.
 */
function getSeriousness(
  maxSeverity: string,
  reactions: E2BReaction[]
): Record<'serious' | 'death' | 'lifeThreat' | 'hosp' | 'disabling' | 'congenital' | 'other', string> {
  const isCritical = maxSeverity === 'critical';
  const isHigh     = maxSeverity === 'high';
  const isSerious  = isCritical || isHigh;
  const hasHosp    = reactions.some(r => r.category === 'serious_adverse_event');

  return {
    serious:    isSerious ? '1' : '2',
    death:      '2',                   // Cannot reliably infer from email text
    lifeThreat: isCritical ? '1' : '2',
    hosp:       hasHosp   ? '1' : '2',
    disabling:  '2',
    congenital: reactions.some(r => r.category === 'pregnancy_exposure') ? '1' : '2',
    other:      (isSerious && !isCritical && !hasHosp) ? '1' : '2',
  };
}

/**
 * Map reporter email/name to ICH qualification code:
 * 1=physician, 2=pharmacist, 3=other HP, 4=lawyer, 5=consumer
 */
function getQualification(sender: string): string {
  const lower = sender.toLowerCase();
  if (lower.includes('dr.') || lower.includes('md') || lower.includes('physician') || lower.includes('doctor')) return '1';
  if (lower.includes('pharm') || lower.includes('rph'))   return '2';
  if (lower.includes('nurse') || lower.includes('rn') || lower.includes('np')) return '3';
  return '5';
}

/** Map AE severity to ICH reaction outcome code */
function getOutcome(severity: string): string {
  // 1=recovered, 2=recovering, 3=not recovered, 4=recovered with sequelae, 5=fatal, 6=unknown
  if (severity === 'critical') return '3';  // serious, not recovered (conservative)
  if (severity === 'high')     return '6';  // unknown
  return '6';                               // unknown (default)
}

/** Extract sender name and email from "Name <email>" format */
function parseSender(sender: string): { name: string; email: string } {
  const match = sender.match(/^(.*?)\s*<(.+)>\s*$/);
  if (match) return { name: match[1].trim() || 'Unknown', email: match[2].trim() };
  // If it looks like a plain email
  if (sender.includes('@')) return { name: sender.split('@')[0], email: sender };
  return { name: sender || 'Unknown Reporter', email: '' };
}

/** Attempt to extract drug product names from finding text */
function extractDrugNames(reactions: E2BReaction[]): string[] {
  const names = new Set<string>();
  for (const r of reactions) {
    // Match capitalised pharmaceutical-style names (e.g. Humira, Avsola, Otezla, Enbrel)
    const matches = r.excerpt.match(/\b[A-Z][a-zA-Z]+(?:mab|nib|lib|zib|ximab|umab|olumab|uzumab|tinib|ciclib|statin|sartan|prazole|mycin|cycline|cillin|vir|vac)\b/g);
    if (matches) matches.forEach(m => names.add(m));
    // Also look for any single proper-noun-like word in the drug category findings
    if (r.category === 'off_label_use' || r.category === 'off_label_dosing') {
      const words = r.excerpt.match(/\b[A-Z][a-z]{4,}\b/g);
      if (words) words.slice(0, 2).forEach(w => names.add(w));
    }
  }
  return [...names].slice(0, 3); // max 3 suspect drugs
}

// ─── XML Builder ─────────────────────────────────────────────────────────────

/**
 * Build an ICH E2B(R3) compliant XML string from confirmed event data.
 *
 * The output is ready to be saved as .xml and submitted to:
 * • Health Canada MedEffect Canada
 * • FDA MedWatch / FAERS
 * • EMA EudraVigilance (via EvWeb or gateway)
 *
 * After manual MedDRA code verification by a qualified person.
 */
export function buildE2BXml(options: E2BXmlOptions): string {
  const {
    eventId,
    event,
    reactions,
    meddraVersion,
    exportedBy,
    receiver   = 'Health Canada MedEffect Canada',
    senderOrg  = 'NARC Pharmacovigilance System',
    country    = 'CA',
  } = options;

  const reportId   = `NARC-${eventId.slice(0, 8).toUpperCase()}`;
  const now        = new Date().toISOString();
  const seriousness = getSeriousness(event.maxSeverity, reactions);
  const { name: reporterName, email: reporterEmail } = parseSender(event.sender);
  const reporterFirstName = reporterName.split(' ')[0] ?? reporterName;
  const reporterLastName  = reporterName.split(' ').slice(1).join(' ') || 'Unknown';
  const drugNames = extractDrugNames(reactions);
  const narrative =
    `NARC automated pharmacovigilance report. ` +
    `Source email subject: ${event.subject}. ` +
    `${reactions.length} adverse event finding(s) detected. ` +
    `Maximum severity: ${event.maxSeverity}. ` +
    `Body excerpt: ${event.bodyExcerpt.slice(0, 200)}${event.bodyExcerpt.length > 200 ? '...' : ''}`;

  const unconfirmedCount = reactions.filter(r => !r.meddra.confirmed).length;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- =====================================================================`,
    `     ICH E2B(R3) Individual Case Safety Report (ICSR)`,
    `     Generated by NARC Pharmacovigilance System`,
    `     Report ID: ${reportId}`,
    `     Generated: ${now}`,
    `     Exported by: ${exportedBy}`,
    `     `,
    `     ⚠️  AI-SUGGESTED MEDDRA CODES`,
    `     ${unconfirmedCount > 0 ? unconfirmedCount + ' term(s) NOT yet confirmed by a qualified person.' : 'All terms confirmed by reviewer.'}`,
    `     All codes marked "00000" or "AI Suggested" MUST be verified against`,
    `     the current licensed MedDRA dictionary (MSSO) before submission.`,
    `     =====================================================================`,
    `     Regulatory destinations (once codes are verified):`,
    `       • Health Canada MedEffect: www.canada.ca/adverse-reactions`,
    `       • FDA FAERS:               www.fda.gov/safety/medwatch`,
    `       • EMA EudraVigilance:      www.ema.europa.eu/eudravigilance`,
    `     ===================================================================== -->`,
    '',
    '<ichicsr lang="en">',
    '',
    '  <!-- ── Message Header ── -->',
    '  <ichicsrmessageheader>',
    '    <messagetype>ichicsr</messagetype>',
    '    <messageformatversion>5.02</messageformatversion>',
    '    <messageformatrelease>2</messageformatrelease>',
    `    <messagenumb>${escapeXml(reportId)}-${fmtDate(now)}</messagenumb>`,
    `    <messagesenderidentifier>${escapeXml(senderOrg)}</messagesenderidentifier>`,
    `    <messagereceiveridentifier>${escapeXml(receiver)}</messagereceiveridentifier>`,
    '    <messagedateformat>204</messagedateformat>',
    `    <messagedate>${fmtDateTime(now)}</messagedate>`,
    '  </ichicsrmessageheader>',
    '',
    '  <!-- ── Safety Report ── -->',
    '  <safetyreport>',
    '',
    '    <!-- Case identifiers -->',
    `    <safetyreportid>${escapeXml(reportId)}</safetyreportid>`,
    '    <safetyreportversion>1</safetyreportversion>',
    `    <primarysourcecountry>${country}</primarysourcecountry>`,
    `    <occurcountry>${country}</occurcountry>`,
    '    <transmissiondateformat>102</transmissiondateformat>',
    `    <transmissiondate>${fmtDate(now)}</transmissiondate>`,
    '',
    '    <!-- Report classification -->',
    '    <!-- reporttype: 1=spontaneous, 2=study, 3=other, 4=not available -->',
    '    <reporttype>1</reporttype>',
    '',
    '    <!-- Seriousness criteria -->',
    `    <serious>${seriousness.serious}</serious>`,
    `    <seriousnessdeath>${seriousness.death}</seriousnessdeath>`,
    `    <seriousnesslifethreatening>${seriousness.lifeThreat}</seriousnesslifethreatening>`,
    `    <seriousnesshospitalization>${seriousness.hosp}</seriousnesshospitalization>`,
    `    <seriousnessdisabling>${seriousness.disabling}</seriousnessdisabling>`,
    `    <seriousnesscongenitalanomali>${seriousness.congenital}</seriousnesscongenitalanomali>`,
    `    <seriousnessother>${seriousness.other}</seriousnessother>`,
    '',
    '    <!-- Primary source (reporter) -->',
    '    <primarysource>',
    `      <reporterfirstname>${escapeXml(reporterFirstName)}</reporterfirstname>`,
    `      <reporterlastname>${escapeXml(reporterLastName)}</reporterlastname>`,
    reporterEmail ? `      <reporteremail>${escapeXml(reporterEmail)}</reporteremail>` : '',
    `      <reportercountry>${country}</reportercountry>`,
    `      <!-- qualification: 1=physician, 2=pharmacist, 3=other HP, 4=lawyer, 5=consumer -->`,
    `      <qualification>${getQualification(event.sender)}</qualification>`,
    '    </primarysource>',
    '',
    '    <!-- Sender (MAH / safety database) -->',
    '    <sender>',
    '      <!-- sendertype: 1=pharmaceutical company, 2=regulatory authority, 3=distributor, etc. -->',
    '      <sendertype>1</sendertype>',
    `      <senderorganization>${escapeXml(senderOrg)}</senderorganization>`,
    '      <senderdepartment>Pharmacovigilance</senderdepartment>',
    `      <senderemail>${escapeXml(exportedBy)}</senderemail>`,
    '    </sender>',
    '',
    '    <!-- Receiver (regulatory authority) -->',
    '    <receiver>',
    '      <!-- receivertype: 1=pharma, 2=regulatory, 3=distributor, 4=investigator, 5=other -->',
    '      <receivertype>2</receivertype>',
    `      <receiverorganization>${escapeXml(receiver)}</receiverorganization>`,
    '    </receiver>',
    '',
    '    <!-- Patient data (anonymised) -->',
    '    <patient>',
    '      <!-- Patient identity anonymised as per privacy regulations -->',
    '      <patientinitial>ANON</patientinitial>',
    '      <!-- patientsex: 0=unknown, 1=male, 2=female, 3=other -->',
    '      <patientsex>0</patientsex>',
    '      <!-- patientagegroup: 1=neonate, 2=infant, 3=child, 4=adolescent, 5=adult, 6=elderly -->',
    '      <patientagegroup>5</patientagegroup>',
    '',
  ].filter(s => s !== null);

  // ── Reactions (one per AE finding) ──────────────────────────────────────

  lines.push('      <!-- ── Adverse Reactions ── -->');
  for (let i = 0; i < reactions.length; i++) {
    const r = reactions[i];
    const m = r.meddra;
    const confirmStatus = m.confirmed
      ? '✓ CONFIRMED BY REVIEWER'
      : '⚠️ AI SUGGESTED — REQUIRES VERIFICATION';
    const outcomeCd = getOutcome(r.severity);

    lines.push(
      '',
      `      <!-- Reaction ${i + 1}: ${escapeXml(r.category)} / ${r.severity} | ${confirmStatus} -->`,
      '      <reaction>',
      `        <primarysourcereaction>${escapeXml(r.excerpt.slice(0, 500))}</primarysourcereaction>`,
      `        <reactionmeddraversionpt>${escapeXml(meddraVersion)}</reactionmeddraversionpt>`,
      `        <!-- PT Code: ${m.ptCode} | Confidence: ${m.confidence} | ${confirmStatus} -->`,
      `        <reactionmeddrapt>${escapeXml(m.ptTerm)}</reactionmeddrapt>`,
      `        <reactionmeddraversionllt>${escapeXml(meddraVersion)}</reactionmeddraversionllt>`,
      `        <!-- LLT Code: ${m.lltCode ?? m.ptCode} | ${confirmStatus} -->`,
      `        <!-- LLT defaults to PT when no more specific term exists per MedDRA hierarchy -->`,
      `        <reactionmeddralllt>${escapeXml(m.lltTerm ?? m.ptTerm)}</reactionmeddralllt>`,
      `        <!-- HLT: ${m.hltCode} / ${escapeXml(m.hltTerm)} -->`,
      `        <!-- HLGT: ${m.hlgtCode} / ${escapeXml(m.hlgtTerm)} -->`,
      `        <!-- SOC: ${m.socCode} / ${escapeXml(m.socTerm)} -->`,
      `        <!-- reactionoutcome: 1=recovered, 2=recovering, 3=not recovered, 4=sequelae, 5=fatal, 6=unknown -->`,
      `        <reactionoutcome>${outcomeCd}</reactionoutcome>`,
      '      </reaction>',
    );
  }

  // ── Drugs ────────────────────────────────────────────────────────────────

  lines.push('', '      <!-- ── Suspect Drugs ── -->');
  const drugsToWrite = drugNames.length > 0 ? drugNames : ['Unknown - see narrative'];
  for (const drug of drugsToWrite) {
    lines.push(
      '      <drug>',
      '        <!-- drugcharacterization: 1=suspect, 2=concomitant, 3=interacting, 4=drug not administered -->',
      '        <drugcharacterization>1</drugcharacterization>',
      `        <medicinalproduct>${escapeXml(drug)}</medicinalproduct>`,
      `        <!-- activesubstancename: Fill in INN/generic name -->`,
      `        <activesubstancename>TBD</activesubstancename>`,
      '      </drug>',
    );
  }

  // ── Narrative ────────────────────────────────────────────────────────────

  lines.push(
    '',
    '      <!-- ── Case Narrative ── -->',
    '      <summary>',
    `        <narrativeincludespatient>${escapeXml(narrative)}</narrativeincludespatient>`,
    '      </summary>',
    '',
    '    </patient>',
    '',
    '  </safetyreport>',
    '',
    '</ichicsr>',
  );

  return lines.join('\n');
}

/**
 * Trigger a browser download of the E2B XML file.
 */
export function downloadE2BXml(xml: string, eventId: string): void {
  const reportId = `NARC-${eventId.slice(0, 8).toUpperCase()}`;
  const dateStr  = new Date().toISOString().slice(0, 10);
  const filename = `e2b-icsr-${reportId}-${dateStr}.xml`;

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
