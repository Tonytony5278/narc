-- Seed Health Canada monograph data for common biologics in patient support programs.
-- Uses ON CONFLICT DO NOTHING so re-running migrations is safe.

-- Avsola (infliximab-axxq) — Health Canada DIN 02479435
-- Approved: RA, AS, PsA, CD, UC, PsO (same as originator Remicade)
-- Approved maintenance: 5 mg/kg q8W after induction (0, 2, 6 weeks)
INSERT INTO drug_monographs (brand_name, generic_name, din, approved_indications, approved_dosing, max_daily_dose, off_label_signals, notes)
VALUES (
  'Avsola',
  'infliximab-axxq',
  '02479435',
  ARRAY[
    'Rheumatoid Arthritis (RA) — in combination with methotrexate',
    'Ankylosing Spondylitis (AS)',
    'Psoriatic Arthritis (PsA)',
    'Crohn''s Disease (CD) — moderate to severe',
    'Ulcerative Colitis (UC) — moderate to severe',
    'Plaque Psoriasis (PsO) — chronic, severe'
  ],
  '{
    "induction": "5 mg/kg IV at weeks 0, 2, and 6",
    "maintenance": "5 mg/kg IV every 8 weeks (q8W)",
    "RA_maintenance": "3 mg/kg IV every 8 weeks (q8W) in combination with methotrexate",
    "dose_escalation": "Up to 10 mg/kg or q4W may be considered for loss of response in CD/UC (consult monograph)"
  }',
  '10 mg/kg per infusion',
  '[
    {"pattern": "q4w|q4 week|every 4 week|every four week|q4weekly|4-weekly", "flag": "Dosing interval halved — Health Canada approved maintenance is q8W (every 8 weeks). q4W frequency is off-label except in specific loss-of-response scenarios."},
    {"pattern": "q2w|every 2 week|every two week|bi-weekly|biweekly", "flag": "q2W interval is off-label — approved maintenance is q8W. Frequency dramatically increased."},
    {"pattern": "10 mg/kg|10mg/kg|double dose|doubled dose", "flag": "10 mg/kg dose is at the maximum approved ceiling — verify indication and loss-of-response criteria."},
    {"pattern": "subcutaneous|subq|sub-q|inject at home|self-inject", "flag": "Avsola/infliximab must be administered IV by a healthcare professional. Subcutaneous route is off-label and not approved."}
  ]',
  'Biosimilar to Remicade (infliximab). Health Canada approved. Interchangeable in most provinces. Pregnancy Category: Use only if clearly needed (TNF inhibitors cross placenta).'
) ON CONFLICT (brand_name) DO NOTHING;

-- Enbrel (etanercept) — Health Canada DIN 02240205
-- Approved: RA, JIA, AS, PsA, PsO
-- Approved adult dose: 50 mg SC once weekly; or 25 mg twice weekly
INSERT INTO drug_monographs (brand_name, generic_name, din, approved_indications, approved_dosing, max_daily_dose, off_label_signals, notes)
VALUES (
  'Enbrel',
  'etanercept',
  '02240205',
  ARRAY[
    'Rheumatoid Arthritis (RA)',
    'Juvenile Idiopathic Arthritis (JIA) — ages 2 and up',
    'Ankylosing Spondylitis (AS)',
    'Psoriatic Arthritis (PsA)',
    'Plaque Psoriasis (PsO) — moderate to severe, adults'
  ],
  '{
    "adult_standard": "50 mg subcutaneous (SC) once weekly",
    "adult_alternative": "25 mg SC twice weekly (same total weekly dose)",
    "JIA_2_to_17": "0.8 mg/kg SC once weekly (max 50 mg/dose)",
    "PsO_induction": "50 mg SC twice weekly for 3 months, then 50 mg once weekly"
  }',
  '50 mg per week',
  '[
    {"pattern": "twice weekly|biweekly|bi-weekly|two times a week|2x week", "flag": "25 mg twice weekly is approved only as an equivalent to 50 mg once weekly. If dose is 50 mg twice weekly, that is double the approved weekly dose."},
    {"pattern": "100 mg|double dose|doubled", "flag": "100 mg/week exceeds the approved maximum adult dose of 50 mg/week."},
    {"pattern": "IV|intravenous|infusion", "flag": "Enbrel (etanercept) is approved for subcutaneous injection only. IV administration is off-label."},
    {"pattern": "Crohn|colitis|IBD|inflammatory bowel", "flag": "IBD (Crohn''s disease, UC) is NOT an approved indication for etanercept — use infliximab or adalimumab instead. Off-label use."}
  ]',
  'Original TNF inhibitor biologic. Not a biosimilar. Subcutaneous self-injection. Approved for pediatric JIA from age 2.'
) ON CONFLICT (brand_name) DO NOTHING;

-- Humira (adalimumab) — Health Canada DIN 02269112
-- Approved for a broad range of conditions including RA, CD, UC, PsA, AS, PsO, HS, uveitis
-- Approved adult dose: 40 mg SC every other week (EOW); some indications weekly induction
INSERT INTO drug_monographs (brand_name, generic_name, din, approved_indications, approved_dosing, max_daily_dose, off_label_signals, notes)
VALUES (
  'Humira',
  'adalimumab',
  '02269112',
  ARRAY[
    'Rheumatoid Arthritis (RA)',
    'Psoriatic Arthritis (PsA)',
    'Ankylosing Spondylitis (AS)',
    'Crohn''s Disease (CD) — moderate to severe',
    'Ulcerative Colitis (UC) — moderate to severe',
    'Plaque Psoriasis (PsO) — moderate to severe',
    'Hidradenitis Suppurativa (HS)',
    'Non-infectious Uveitis (anterior)',
    'Juvenile Idiopathic Arthritis (JIA) — ages 4 and up',
    'Paediatric Crohn''s Disease — ages 6 and up'
  ],
  '{
    "RA_PsA_AS_standard": "40 mg SC every other week (EOW / q2W)",
    "RA_with_MTX_option": "40 mg SC weekly if not on methotrexate",
    "CD_induction": "160 mg SC at week 0, then 80 mg at week 2",
    "CD_maintenance": "40 mg SC every other week starting week 4",
    "UC_induction": "160 mg SC at week 0, then 80 mg at week 2",
    "UC_maintenance": "40 mg SC every other week starting week 4",
    "PsO": "80 mg SC at week 0, then 40 mg EOW starting week 1",
    "HS": "160 mg SC at week 0, 80 mg at week 2, then 40 mg weekly from week 4",
    "Uveitis": "80 mg SC at week 0, then 40 mg EOW starting week 1"
  }',
  '160 mg (induction load only)',
  '[
    {"pattern": "weekly|every week|once a week|q1w|q1 week", "flag": "Weekly adalimumab (40 mg/week) is approved only for RA patients NOT on methotrexate, and for HS maintenance. For most other indications, approved frequency is every other week (EOW). Verify indication."},
    {"pattern": "80 mg maintenance|80mg maintenance|80 mg every|80mg every", "flag": "80 mg is an induction dose only. Approved maintenance for most indications is 40 mg EOW. Using 80 mg as maintenance is off-label."},
    {"pattern": "IV|intravenous|infusion", "flag": "Humira (adalimumab) is approved for subcutaneous injection only. IV administration is off-label."}
  ]',
  'Original adalimumab biologic (AbbVie). Multiple biosimilars available in Canada. Broadest indication list of all TNF inhibitors.'
) ON CONFLICT (brand_name) DO NOTHING;

-- Otezla (apremilast) — Health Canada DIN 02442647
-- Approved: PsA, PsO, Behcet disease oral ulcers
-- Approved dose: 30 mg BID after titration; oral tablet — NOT a biologic/injection
INSERT INTO drug_monographs (brand_name, generic_name, din, approved_indications, approved_dosing, max_daily_dose, off_label_signals, notes)
VALUES (
  'Otezla',
  'apremilast',
  '02442647',
  ARRAY[
    'Psoriatic Arthritis (PsA) — active',
    'Moderate to Severe Plaque Psoriasis (PsO) — adults',
    'Oral Ulcers associated with Behcet''s Disease'
  ],
  '{
    "titration": "Days 1-5 dose titration: 10 mg AM day 1, 10 mg BID day 2, 10 mg AM + 20 mg PM day 3, 20 mg BID day 4, 20 mg AM + 30 mg PM day 5",
    "maintenance": "30 mg orally twice daily (BID) — morning and evening, with or without food",
    "renal_impairment": "Severe renal impairment (CrCl < 30 mL/min): reduce to 30 mg once daily"
  }',
  '60 mg/day (30 mg BID)',
  '[
    {"pattern": "inject|injection|subcutaneous|IV|intravenous|infusion|shot", "flag": "Otezla (apremilast) is an ORAL tablet — it is NOT administered by injection or infusion. Any injection report is a medication error or confusion with another drug."},
    {"pattern": "once daily|once a day|q1d|qd|every day", "flag": "Standard Otezla maintenance is 30 mg TWICE daily (BID). Once-daily dosing is approved only for severe renal impairment (CrCl < 30 mL/min) — verify renal function."},
    {"pattern": "60 mg|double dose|doubled", "flag": "60 mg at a single time point exceeds the approved single dose of 30 mg. Approved total daily maximum is 60 mg (30 mg BID)."},
    {"pattern": "Crohn|colitis|IBD|inflammatory bowel|ankylosing|AS|uveitis", "flag": "IBD, AS, and uveitis are NOT approved indications for apremilast. Off-label use — consider alternative biologics."},
    {"pattern": "child|pediatric|paediatric|kid|infant|year old", "flag": "Otezla is approved for adults only. Pediatric use is off-label."}
  ]',
  'Small molecule PDE4 inhibitor (NOT a biologic). Oral tablet, no injection required, no TB screening required. PML risk not applicable. Safe in mild-moderate renal impairment at standard dose.'
) ON CONFLICT (brand_name) DO NOTHING;
