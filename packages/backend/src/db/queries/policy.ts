import { PoolClient } from 'pg';
import { getPool } from '../pool';

function db(client?: PoolClient) {
  return client ?? getPool();
}

export interface PolicyVersionRow {
  id: string;
  version: string;
  name: string;
  description: string;
  is_active: boolean;
  effective_date: Date;
  created_by: string | null;
  created_at: Date;
}

export interface DetectionRuleRow {
  id: string;
  policy_version_id: string;
  category: string;
  rule_name: string;
  severity_override: string | null;
  is_enabled: boolean;
  conditions: object;
  keywords: string[];
  created_at: Date;
}

export async function getActivePolicyVersion(
  client?: PoolClient
): Promise<(PolicyVersionRow & { rules: DetectionRuleRow[] }) | null> {
  const { rows: versionRows } = await db(client).query<PolicyVersionRow>(
    'SELECT * FROM policy_versions WHERE is_active = TRUE LIMIT 1'
  );
  if (!versionRows[0]) return null;

  const { rows: ruleRows } = await db(client).query<DetectionRuleRow>(
    'SELECT * FROM detection_rules WHERE policy_version_id = $1 AND is_enabled = TRUE',
    [versionRows[0].id]
  );

  return { ...versionRows[0], rules: ruleRows };
}

export async function listPolicyVersions(client?: PoolClient): Promise<PolicyVersionRow[]> {
  const { rows } = await db(client).query<PolicyVersionRow>(
    'SELECT * FROM policy_versions ORDER BY created_at DESC'
  );
  return rows;
}

export async function createPolicyVersion(params: {
  version: string;
  name: string;
  description: string;
  createdBy: string;
}, client?: PoolClient): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO policy_versions (version, name, description, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [params.version, params.name, params.description, params.createdBy]
  );
  return rows[0].id;
}

export async function activatePolicyVersion(
  id: string,
  client?: PoolClient
): Promise<void> {
  // Deactivate all existing active versions first
  await db(client).query(
    'UPDATE policy_versions SET is_active = FALSE WHERE is_active = TRUE'
  );
  await db(client).query(
    'UPDATE policy_versions SET is_active = TRUE WHERE id = $1',
    [id]
  );
}

export async function insertDetectionRule(params: {
  policyVersionId: string;
  category: string;
  ruleName: string;
  severityOverride: string | null;
  conditions: object;
  keywords: string[];
}, client?: PoolClient): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO detection_rules
       (policy_version_id, category, rule_name, severity_override, conditions, keywords)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [params.policyVersionId, params.category, params.ruleName, params.severityOverride,
     JSON.stringify(params.conditions), params.keywords]
  );
  return rows[0].id;
}
