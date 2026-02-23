import { getPool } from '../pool';

export interface OffLabelSignal {
  pattern: string;
  flag: string;
}

export interface DrugMonograph {
  id: string;
  brand_name: string;
  generic_name: string;
  din: string | null;
  approved_indications: string[];
  approved_dosing: Record<string, string>;
  max_daily_dose: string | null;
  off_label_signals: OffLabelSignal[];
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function listMonographs(): Promise<DrugMonograph[]> {
  const pool = getPool();
  const { rows } = await pool.query<DrugMonograph>(
    'SELECT * FROM drug_monographs ORDER BY brand_name ASC'
  );
  return rows;
}

export async function getMonographById(id: string): Promise<DrugMonograph | null> {
  const pool = getPool();
  const { rows } = await pool.query<DrugMonograph>(
    'SELECT * FROM drug_monographs WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Case-insensitive search across brand_name and generic_name.
 * Returns the first match.
 */
export async function findMonographByName(name: string): Promise<DrugMonograph | null> {
  const pool = getPool();
  const { rows } = await pool.query<DrugMonograph>(
    `SELECT * FROM drug_monographs
     WHERE LOWER(brand_name) = LOWER($1) OR LOWER(generic_name) = LOWER($1)
     LIMIT 1`,
    [name]
  );
  return rows[0] ?? null;
}

/**
 * Search all monographs for any brand or generic name present in `text`.
 * Returns the first match found (most specific match wins if multiple).
 */
export async function findMonographInText(text: string): Promise<DrugMonograph | null> {
  const pool = getPool();
  const { rows } = await pool.query<DrugMonograph>(
    'SELECT * FROM drug_monographs ORDER BY brand_name ASC'
  );

  const lowerText = text.toLowerCase();
  for (const row of rows) {
    if (
      lowerText.includes(row.brand_name.toLowerCase()) ||
      lowerText.includes(row.generic_name.toLowerCase())
    ) {
      return row;
    }
  }
  return null;
}

export interface UpsertMonographData {
  brand_name: string;
  generic_name: string;
  din?: string | null;
  approved_indications?: string[];
  approved_dosing?: Record<string, string>;
  max_daily_dose?: string | null;
  off_label_signals?: OffLabelSignal[];
  notes?: string | null;
}

export async function insertMonograph(data: UpsertMonographData): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO drug_monographs
       (brand_name, generic_name, din, approved_indications, approved_dosing, max_daily_dose, off_label_signals, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      data.brand_name,
      data.generic_name,
      data.din ?? null,
      data.approved_indications ?? [],
      JSON.stringify(data.approved_dosing ?? {}),
      data.max_daily_dose ?? null,
      JSON.stringify(data.off_label_signals ?? []),
      data.notes ?? null,
    ]
  );
  return rows[0].id;
}

export async function updateMonograph(
  id: string,
  data: Partial<UpsertMonographData>
): Promise<boolean> {
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const addField = (col: string, val: unknown, asJson = false) => {
    sets.push(`${col} = $${idx++}`);
    values.push(asJson ? JSON.stringify(val) : val);
  };

  if (data.brand_name !== undefined) addField('brand_name', data.brand_name);
  if (data.generic_name !== undefined) addField('generic_name', data.generic_name);
  if (data.din !== undefined) addField('din', data.din);
  if (data.approved_indications !== undefined) addField('approved_indications', data.approved_indications);
  if (data.approved_dosing !== undefined) addField('approved_dosing', data.approved_dosing, true);
  if (data.max_daily_dose !== undefined) addField('max_daily_dose', data.max_daily_dose);
  if (data.off_label_signals !== undefined) addField('off_label_signals', data.off_label_signals, true);
  if (data.notes !== undefined) addField('notes', data.notes);

  if (sets.length === 0) return false;

  sets.push(`updated_at = NOW()`);
  values.push(id);

  const { rowCount } = await pool.query(
    `UPDATE drug_monographs SET ${sets.join(', ')} WHERE id = $${idx}`,
    values
  );
  return (rowCount ?? 0) > 0;
}
