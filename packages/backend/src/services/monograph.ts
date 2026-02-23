import { findMonographInText, findMonographByName, type DrugMonograph } from '../db/queries/monographs';

export type { DrugMonograph };

/**
 * Look up a monograph from free text (email body + subject).
 * Scans the text for any known drug brand or generic name.
 * If `drugName` is explicitly provided (from the analyze request), use that first.
 */
export async function lookupMonograph(
  text: string,
  drugName?: string | null
): Promise<DrugMonograph | null> {
  // Explicit drug name takes priority (provided by add-in or API caller)
  if (drugName) {
    const byName = await findMonographByName(drugName);
    if (byName) return byName;
  }

  // Fall back to scanning the email text for any known drug name
  return findMonographInText(text);
}

/**
 * Build a short monograph context block injected into the Claude system prompt.
 * Keeps it concise — Claude's context window is precious.
 */
export function buildMonographContext(m: DrugMonograph): string {
  const lines: string[] = [
    ``,
    `─── HEALTH CANADA DRUG MONOGRAPH CONTEXT ───`,
    `Drug: ${m.brand_name} (${m.generic_name})${m.din ? ` — DIN ${m.din}` : ''}`,
    ``,
    `Approved Indications:`,
    ...m.approved_indications.map((ind) => `  • ${ind}`),
    ``,
    `Approved Dosing:`,
    ...Object.entries(m.approved_dosing).map(([key, val]) => `  • ${key}: ${val}`),
  ];

  if (m.max_daily_dose) {
    lines.push(`  • Maximum daily dose: ${m.max_daily_dose}`);
  }

  if (m.off_label_signals && m.off_label_signals.length > 0) {
    lines.push(``, `OFF-LABEL SIGNALS TO FLAG (check for these patterns in the email):`);
    for (const sig of m.off_label_signals) {
      lines.push(`  • Pattern [${sig.pattern}] → FLAG: ${sig.flag}`);
    }
  }

  if (m.notes) {
    lines.push(``, `Additional Context: ${m.notes}`);
  }

  lines.push(
    ``,
    `INSTRUCTION: If the email mentions dosing, frequency, route of administration, or indications for ${m.brand_name}/${m.generic_name}, cross-reference against the approved dosing above. Flag any deviation as 'off_label_dosing' or 'off_label_use' accordingly. Pay close attention to the off-label signal patterns listed above.`,
    `─── END MONOGRAPH CONTEXT ───`,
    ``
  );

  return lines.join('\n');
}
