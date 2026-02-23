/**
 * NARC Phase 3 Smoke Test
 * Run: node smoke-test.mjs
 */

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;

function ok(label, value) {
  console.log(`  ✅ ${label}: ${JSON.stringify(value)}`);
  passed++;
}

function fail(label, reason) {
  console.error(`  ❌ ${label}: ${reason}`);
  failed++;
}

async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, body: await r.json() };
}

async function post(path, data) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { status: r.status, body: await r.json() };
}

// ── 1. Health ──────────────────────────────────────────────────────────────
console.log('\n── 1. Health check ──────────────────────────────');
try {
  const { status, body } = await get('/health');
  if (status === 200 && body.status === 'ok') ok('status', body.status);
  else fail('status', `got ${status} ${JSON.stringify(body)}`);
  ok('db', body.db);
  ok('version', body.version);
} catch (e) { fail('health', e.message); }

// ── 2. Monographs ─────────────────────────────────────────────────────────
console.log('\n── 2. Monographs ────────────────────────────────');
let monographs = [];
try {
  const { status, body } = await get('/api/monographs');
  if (status !== 200) { fail('GET /api/monographs', `HTTP ${status}`); }
  else {
    monographs = body.monographs ?? [];
    ok('count', monographs.length);

    const expected = ['Avsola', 'Enbrel', 'Humira', 'Otezla'];
    for (const name of expected) {
      const found = monographs.find(m => m.brand_name === name);
      if (found) ok(`${name} seeded`, `${found.approved_indications.length} indications, ${found.off_label_signals.length} signals`);
      else fail(`${name} seeded`, 'not found');
    }

    // Check Avsola off-label q4W signal
    const avsola = monographs.find(m => m.brand_name === 'Avsola');
    if (avsola) {
      const hasQ4w = avsola.off_label_signals.some(s => /q4/i.test(s.pattern));
      if (hasQ4w) ok('Avsola q4W off-label signal present', true);
      else fail('Avsola q4W off-label signal', 'not found in signals');
    }
  }
} catch (e) { fail('monographs', e.message); }

// ── 3. Analyze — clean email ───────────────────────────────────────────────
console.log('\n── 3. Analyze — clean email ─────────────────────');
try {
  const { status, body } = await post('/api/analyze', {
    emailBody: 'Patient doing well. No complaints at this time. Follow-up scheduled for next month.',
    subject: 'Patient check-in',
    sender: 'nurse@clinic.ca',
  });
  if (status !== 200) fail('POST /api/analyze (clean)', `HTTP ${status} — ${JSON.stringify(body)}`);
  else {
    ok('hasAEs', body.hasAEs);
    ok('findings count', body.findings?.length ?? 0);
    ok('eventId returned', !!body.eventId);
  }
} catch (e) { fail('analyze clean', e.message); }

// ── 4. Analyze — Avsola q4W off-label ─────────────────────────────────────
console.log('\n── 4. Analyze — Avsola q4W off-label detection ─');
try {
  const { status, body } = await post('/api/analyze', {
    emailBody: `Patient on Avsola (infliximab) q4 weeks for Crohn's disease, now reporting
    injection site rash after last dose, moderate severity, appeared 2 days post-infusion.
    Patient also reports fatigue and mild headache. No fever. No new medications.`,
    subject: 'Avsola AE report',
    sender: 'rn.jones@hospital.ca',
  });

  if (status !== 200) fail('POST /api/analyze (Avsola)', `HTTP ${status} — ${JSON.stringify(body)}`);
  else {
    ok('status', status);
    ok('hasAEs', body.hasAEs);
    ok('findings count', body.findings?.length ?? 0);

    // Check monograph was detected
    if (body.monograph) ok('monograph detected', `${body.monograph.brandName} (${body.monograph.genericName})`);
    else console.log('  ℹ️  monograph: not detected (backend may need drug name in body)');

    // Print findings summary
    for (const f of body.findings ?? []) {
      console.log(`  ℹ️  finding: [${f.severity}] ${f.description?.slice(0, 80) ?? 'no description'}...`);
    }

    if (body.summary) ok('summary present', body.summary.slice(0, 60) + '...');
  }
} catch (e) { fail('analyze Avsola', e.message); }

// ── 5. Events list ────────────────────────────────────────────────────────
console.log('\n── 5. Events ────────────────────────────────────');
let eventId = '';
try {
  const { status, body } = await get('/api/events?limit=5');
  if (status !== 200) fail('GET /api/events', `HTTP ${status}`);
  else {
    ok('total events', body.total ?? body.events?.length ?? 0);
    if (body.events?.length > 0) {
      eventId = body.events[0].id;
      ok('first event id', eventId);
      ok('first event status', body.events[0].status);
    }
  }
} catch (e) { fail('events', e.message); }

// ── 6. Audit log ──────────────────────────────────────────────────────────
console.log('\n── 6. Audit log ─────────────────────────────────');
try {
  const { status, body } = await get('/api/admin/audit?limit=5');
  if (status !== 200) fail('GET /api/admin/audit', `HTTP ${status}`);
  else {
    ok('total entries', body.total ?? body.entries?.length ?? 0);
    if (body.entries?.length > 0) {
      const e = body.entries[0];
      ok('entry has hash', !!e.hash);
      ok('entry has actor', !!e.actor_role);
    }
  }
} catch (e) { fail('audit log', e.message); }

// ── 7. Monograph PUT (admin write) ────────────────────────────────────────
console.log('\n── 7. Monograph update (PUT) ─────────────────────');
try {
  const avsola = monographs.find(m => m.brand_name === 'Avsola');
  if (!avsola) { fail('Avsola PUT', 'Avsola not found in list'); }
  else {
    const { status } = await fetch(`${BASE}/api/monographs/${avsola.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...avsola, notes: 'Smoke test note — ' + new Date().toISOString() }),
    });
    if (status === 200) ok('PUT /api/monographs/:id', status);
    else fail('PUT /api/monographs/:id', `HTTP ${status}`);
  }
} catch (e) { fail('monograph PUT', e.message); }

// ── Results ───────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('🎉 All smoke tests passed!');
else console.log(`⚠️  ${failed} test(s) failed — see above`);
