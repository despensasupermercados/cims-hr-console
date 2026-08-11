import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER_SQL, EXPORT_FIELDS, coverage, apiRosterExport } from '../src/roster_export.js';

const req = (key) => new Request('https://x/api/roster/export', {
  headers: key == null ? {} : { 'X-Roster-Key': key },
});

const envWith = (rows, secret = 'shh') => ({
  ROSTER_KEY: secret,
  DB: { prepare: () => ({ all: async () => ({ results: rows }) }) },
});

test('never reads keyman_contract3 — bonus layer, not movements (P3.13)', () => {
  assert.doesNotMatch(ROSTER_SQL, /keyman_contract3/i);
});

test('reads ship_leg as the movement source, current + ours only', () => {
  assert.match(ROSTER_SQL, /FROM crew c/);
  assert.match(ROSTER_SQL, /JOIN ship_leg l/);
  assert.match(ROSTER_SQL, /l\.is_current = 1/);
  assert.match(ROSTER_SQL, /l\.ours = 1/);
});

test('honours the three exclusion flags', () => {
  assert.match(ROSTER_SQL, /c\.redacted = 0/);          // redact_crew() seam
  assert.match(ROSTER_SQL, /COALESCE\(o\.retired,0\) = 0/); // retired overrides must not win
});

test('uses only columns that exist on ship_leg', () => {
  // off_actual does not exist. An earlier draft referenced it and would have
  // thrown at runtime on every call.
  assert.doesNotMatch(ROSTER_SQL, /off_actual/);
});

test('no document, contact or identity-document field can leave', () => {
  const forbidden = ['pp_no', 'pp_exp', 'sirb_no', 'sirb_exp', 'med_cert_no',
    'med_exp', 'usv_no', 'usv_exp', 'sch_no', 'sch_exp', 'dob', 'phone',
    'province', 'baseline_count', 'notes'];
  for (const f of forbidden) assert.ok(!EXPORT_FIELDS.includes(f), `${f} must not be exported`);
});

test('403 without the key, and 403 when the secret is unset', async () => {
  assert.equal((await apiRosterExport(req(null), envWith([]))).status, 403);
  assert.equal((await apiRosterExport(req('wrong'), envWith([]))).status, 403);
  assert.equal((await apiRosterExport(req('shh'), { ROSTER_KEY: '', DB: null })).status, 403);
});

test('response carries only the allowlisted fields, even if the row has more', async () => {
  const env = envWith([{ ship_crew_id: '1', first_name: 'A', last_name: 'B',
    status: 'On board', email: 'a@b.c', pp_no: 'SHOULD-NOT-LEAK' }]);
  const body = await (await apiRosterExport(req('shh'), env)).json();
  assert.deepEqual(Object.keys(body.crew[0]).sort(), [...EXPORT_FIELDS].sort());
  assert.ok(!JSON.stringify(body).includes('SHOULD-NOT-LEAK'));
});

test('coverage counts the gaps that would otherwise be invisible', () => {
  const c = coverage([
    { status: 'On board', ship_crew_id: '1', email: 'a@b.c', sign_on: '2026-01-01' },
    { status: 'On board', ship_crew_id: '',  email: 'd@e.f', sign_on: null },
    { status: 'On Vacation', ship_crew_id: '', email: '', sign_on: null },
  ]);
  assert.equal(c.total, 3);
  assert.equal(c.on_board, 2);
  assert.equal(c.on_board_without_ship_crew_id, 1);
  assert.equal(c.on_board_without_current_leg, 1);
  assert.equal(c.on_board_without_email, 0);
});
