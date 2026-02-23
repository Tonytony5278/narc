-- Amgevita (adalimumab - Amgen biosimilar of Humira)
-- Wezlana (ustekinumab - Amgen biosimilar of Stelara)

INSERT INTO drug_monographs (
  brand_name, generic_name, din,
  approved_indications, approved_dosing, max_daily_dose,
  off_label_signals, notes
) VALUES (
  'Amgevita',
  'adalimumab',
  '02475316',
  ARRAY[
    'Rheumatoid arthritis (RA) - moderate to severe',
    'Psoriatic arthritis (PsA)',
    'Ankylosing spondylitis (AS)',
    'Crohn''s disease - moderate to severe (adult and pediatric 6 years and older)',
    'Ulcerative colitis - moderate to severe (adult)',
    'Plaque psoriasis - moderate to severe (adult)',
    'Juvenile idiopathic arthritis (JIA) - polyarticular (2 years and older)',
    'Hidradenitis suppurativa (HS)',
    'Non-infectious intermediate, posterior, or panuveitis (adult)'
  ],
  '{
    "RA maintenance": "40 mg SC every other week (EOW); may increase to 40 mg weekly if not on MTX",
    "PsA maintenance": "40 mg SC every other week",
    "AS maintenance": "40 mg SC every other week",
    "Crohns induction": "160 mg SC week 0, 80 mg week 2, then 40 mg EOW",
    "UC induction": "160 mg SC week 0, 80 mg week 2, then 40 mg EOW",
    "Plaque psoriasis": "80 mg SC week 0, 40 mg week 1, then 40 mg EOW",
    "JIA 15-30 kg": "20 mg SC every other week",
    "JIA 30 kg and over": "40 mg SC every other week",
    "HS": "160 mg week 0, 80 mg week 2, then 40 mg weekly",
    "Uveitis": "80 mg week 0, then 40 mg EOW from week 1"
  }',
  '40 mg per dose (80 mg loading where indicated)',
  '[
    {"pattern": "every.?week|q1w|qw\\b|weekly|q7d|once.?a.?week|q1week",
     "flag": "Amgevita/adalimumab approved EOW (every other week) for most maintenance indications - weekly dosing is off-label except for RA patients not on MTX or HS"},
    {"pattern": "IV\\b|intravenous|infusion",
     "flag": "Amgevita/adalimumab is subcutaneous (SC) injection only - intravenous administration is not approved"},
    {"pattern": "80mg.*weekly|160mg.*maintenance|40mg.*daily",
     "flag": "Dose escalation beyond 40 mg EOW not approved for this indication - review for off-label intensification"},
    {"pattern": "concurrent.*biologic|biologic.*combination|alongside.*biologic",
     "flag": "Concurrent biologic therapy not approved - risk of severe immunosuppression"}
  ]',
  'Amgen adalimumab biosimilar. Subcutaneous only. Do NOT confuse with infliximab products (Avsola, Remicade) - different mechanism, SC not IV, different dosing schedule. Citrate-free formulation.'
) ON CONFLICT (brand_name) DO NOTHING;


INSERT INTO drug_monographs (
  brand_name, generic_name, din,
  approved_indications, approved_dosing, max_daily_dose,
  off_label_signals, notes
) VALUES (
  'Wezlana',
  'ustekinumab',
  '02520826',
  ARRAY[
    'Plaque psoriasis - moderate to severe (adult)',
    'Psoriatic arthritis (PsA) - active (adult)',
    'Crohn''s disease - moderate to severe (adult)',
    'Ulcerative colitis - moderate to severe (adult)'
  ],
  '{
    "Psoriasis 100 kg or under": "45 mg SC at week 0, week 4, then 45 mg q12w",
    "Psoriasis over 100 kg": "90 mg SC at week 0, week 4, then 90 mg q12w",
    "PsA": "45 mg SC at week 0, week 4, then 45 mg q12w (90 mg if coexistent moderate-severe psoriasis)",
    "Crohns/UC induction": "Single IV dose weight-based: 260 mg (55 kg or under), 390 mg (over 55 to 85 kg), 520 mg (over 85 kg)",
    "Crohns/UC maintenance": "90 mg SC q8w starting 8 weeks after IV induction; q12w for patients in remission",
    "Crohns/UC dose escalation": "If inadequate response at q12w, may intensify to q8w"
  }',
  '90 mg per SC dose; 520 mg IV induction only',
  '[
    {"pattern": "q4w|q6w|every.?4.?week|every.?6.?week|4.?week.*cycle|6.?week.*cycle|bi-?monthly",
     "flag": "Wezlana/ustekinumab approved for q8w (Crohns/UC maintenance) or q12w (psoriasis) - dosing more frequent than q8w is off-label"},
    {"pattern": "IV.*maintenance|maintenance.*IV|ongoing.*IV|continuing.*intravenous|IV.*q\\d",
     "flag": "IV route approved for induction dose only - all maintenance dosing must be 90 mg SC; IV maintenance is off-label"},
    {"pattern": "child|pediatric|paediatric|adolescent|year.*old|juvenile",
     "flag": "Wezlana/ustekinumab not approved for pediatric use in Canada - adult indication only"},
    {"pattern": "q8w.*psoriasis|psoriasis.*q8w|plaque.*8.?week|8.?week.*plaque",
     "flag": "Q8w maintenance approved for Crohns/UC - psoriasis/PsA maintenance schedule is q12w"},
    {"pattern": "45mg.*q8w|45.*mg.*8.?week|45mg.*crohn|45mg.*colitis",
     "flag": "Crohns/UC maintenance dose is 90 mg SC q8w - 45 mg is the psoriasis/PsA dose and is not approved for IBD maintenance"}
  ]',
  'Amgen ustekinumab biosimilar of Stelara (Janssen). IL-12/23 inhibitor - NOT a TNF inhibitor. Crohns/UC induction is IV; all maintenance is SC. Weight-based dosing for psoriasis. No pediatric indication in Canada.'
) ON CONFLICT (brand_name) DO NOTHING;
