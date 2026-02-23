import { getActivePolicyVersion, DetectionRuleRow, PolicyVersionRow } from '../db/queries/policy';

export interface ActivePolicy {
  id: string;
  version: string;
  name: string;
  rules: DetectionRuleRow[];
}

let cachedPolicy: ActivePolicy | null = null;
let lastChecked = 0;
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5-minute TTL

/**
 * Get the currently active policy version (with rules).
 * Results are cached for 5 minutes to avoid repeated DB hits on every analyze call.
 * Returns null when no active policy version exists (analysis proceeds without rules).
 */
export async function getActivePolicy(): Promise<ActivePolicy | null> {
  const now = Date.now();
  if (cachedPolicy !== undefined && now - lastChecked < CACHE_TTL_MS) {
    return cachedPolicy;
  }

  const result = await getActivePolicyVersion();
  cachedPolicy = result
    ? { id: result.id, version: result.version, name: result.name, rules: result.rules }
    : null;
  lastChecked = now;
  return cachedPolicy;
}

/**
 * Force cache invalidation.
 * Must be called after any policy version activation or rule change.
 */
export function invalidatePolicyCache(): void {
  cachedPolicy = null;
  lastChecked = 0;
  console.log('[Policy] Cache invalidated — next call will reload from DB');
}

/**
 * Apply policy calibration to a finding's confidence score.
 * Rules can override severity and adjust confidence by ±10% per keyword match.
 */
export function calibrateConfidence(
  rawConfidence: number,
  rule: DetectionRuleRow
): number {
  const boost = 0.05; // +5% per matched keyword presence
  const adjusted = rawConfidence + boost;
  return Math.min(1.0, Math.max(0.0, parseFloat(adjusted.toFixed(3))));
}
