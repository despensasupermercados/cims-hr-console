/**
 * THE TDG FILE PLACES WHOEVER NOTHING ELSE PLACES — 11 Oct 2026.
 *
 * On 8 Oct 2026 the relief board's in-force contracts and assignments were rebuilt, and every
 * assignment left starts on 16 Oct or later. The export's two placements (a Counter leg, an in-force
 * assignment) then placed nobody for seventeen printers TDG has On board, and cims-timecard counted
 * 30 ships owing a card against 47 hulls with a printer aboard. Valdesco's September card for
 * Brilliance was owed with nobody chasing it. The route answered 200 the whole time.
 *
 * These tests call apiRosterExport end to end (mocked D1, the same shape the other route tests use)
 * and pin the rule in placeFromRegistry: TDG On board + embark already happened + a known hull, and
 * either nothing else dates the crew or the file's embark is strictly newer.
 *
 * Run: node --test test/roster_export_registry.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRosterExport, placeFromRegistry, vesselIndex, EXPORT_FIELDS } from '../src/roster_export.js';

const VESSELS = [
  { id: 'ves_brilliance', name: 'Brilliance', brand: 'Royal Caribbean' },
  { id: 'ves_journey', name: 'Journey', brand: 'Azamara' },
  { id: 'ves_summit', name: 'Summit', brand: 'Celebrity' },
  { id: 'ves_constellation', name: 'Constellation', brand: 'Celebrity' },
  { id: 'ves_star', name: 'Star', brand: 'Royal Caribbean' },
  { id: 'ves_apex', name: 'Apex', brand: 'Celebrity' },
];
const VIDX = vesselIndex(VESSELS);
const TODAY = '2026-10-11';
const blank = { ship: null, brand: null, sign_on: null, sign_off: null };

test('nothing else places the crew: the TDG row supplies ship, brand and embark (Valdesco)', () => {
  const p = placeFromRegistry(blank, { status: 'On board', vessel: 'MV BRILLIANCE OF THE SEAS', embarked_at: '2026-09-02', debarked_at: null }, VIDX, TODAY);
  assert.deepEqual(p, { ship: 'Brilliance', brand: 'Royal Caribbean', sign_on: '2026-09-02', sign_off: null });
});

test('Azamara and Celebrity long names resolve to the short hull', () => {
  assert.equal(placeFromRegistry(blank, { status: 'On board', vessel: 'MV AZAMARA JOURNEY', embarked_at: '2026-07-25' }, VIDX, TODAY).ship, 'Journey');
  assert.equal(placeFromRegistry(blank, { status: 'On board', vessel: 'MV CELEBRITY SUMMIT', embarked_at: '2026-07-17' }, VIDX, TODAY).brand, 'Celebrity');
  // Longest key first: CONSTELLATION must not be read as STAR.
  assert.equal(placeFromRegistry(blank, { status: 'On board', vessel: 'MV CELEBRITY CONSTELLATION', embarked_at: '2026-10-05' }, VIDX, TODAY).ship, 'Constellation');
});

test('a newer TDG embark replaces a stale Counter leg (Noche: Summit ended 17 Jul, Constellation from 5 Oct)', () => {
  const counter = { ship: 'Summit', brand: 'Celebrity', sign_on: '2025-10-05', sign_off: '2026-07-17' };
  const p = placeFromRegistry(counter, { status: 'On board', vessel: 'MV CELEBRITY CONSTELLATION', embarked_at: '2026-10-05' }, VIDX, TODAY);
  assert.deepEqual(p, { ship: 'Constellation', brand: 'Celebrity', sign_on: '2026-10-05', sign_off: null });
});

test('a tie or an older TDG embark changes nothing — Rita\'s recorded sign-off stands', () => {
  const placed = { ship: 'Apex', brand: 'Celebrity', sign_on: '2026-03-14', sign_off: '2026-10-07' };
  assert.equal(placeFromRegistry(placed, { status: 'On board', vessel: 'MV CELEBRITY APEX', embarked_at: '2026-03-14' }, VIDX, TODAY), null);
  assert.equal(placeFromRegistry(placed, { status: 'On board', vessel: 'MV CELEBRITY APEX', embarked_at: '2026-01-01' }, VIDX, TODAY), null);
});

test('a relief-board placement newer than the file is kept (the reliever aboard before the next upload)', () => {
  const reliever = { ship: 'Journey', brand: 'Azamara', sign_on: '2026-10-09', sign_off: '2027-03-09' };
  assert.equal(placeFromRegistry(reliever, { status: 'On board', vessel: 'MV AZAMARA JOURNEY', embarked_at: '2026-07-25' }, VIDX, TODAY), null);
});

test('the file places nobody it does not have On board, nor a future embark', () => {
  for (const status of ['Earmarked', 'On Vacation', 'Inactive', null]) {
    assert.equal(placeFromRegistry(blank, { status, vessel: 'MV AZAMARA JOURNEY', embarked_at: '2026-07-25' }, VIDX, TODAY), null, String(status));
  }
  assert.equal(placeFromRegistry(blank, { status: 'On board', vessel: 'MV AZAMARA JOURNEY', embarked_at: null }, VIDX, TODAY), null);
  assert.equal(placeFromRegistry(blank, { status: 'On board', vessel: 'MV AZAMARA JOURNEY', embarked_at: '2026-10-12' }, VIDX, TODAY), null);
});

test('an unrecognised vessel places nobody — a guessed hull is worse than none', () => {
  assert.equal(placeFromRegistry(blank, { status: 'On board', vessel: 'MV NORWEGIAN PRIMA', embarked_at: '2026-07-25' }, VIDX, TODAY), null);
  assert.equal(placeFromRegistry(blank, { status: 'On board', vessel: '', embarked_at: '2026-07-25' }, VIDX, TODAY), null);
});

test("TDG's DEBARKEDDATE is the only sign-off it supplies", () => {
  const p = placeFromRegistry(blank, { status: 'On board', vessel: 'MV AZAMARA JOURNEY', embarked_at: '2026-07-25', debarked_at: '2026-10-10' }, VIDX, TODAY);
  assert.equal(p.sign_off, '2026-10-10');
});

/* ------------------------------------------------------------------ *
 * End to end through the route
 * ------------------------------------------------------------------ */
function envWith({ crew, legs = [], edits = [], registry = [], vessels = VESSELS }) {
  return {
    ROSTER_KEY: 'k',
    DB: {
      prepare: (sql) => ({
        all: async () => {
          const q = String(sql).trim();
          if (q.startsWith('SELECT sc, seq, sign_on, sign_off, ship, on_key, updated_at')) return { results: edits };
          if (q.startsWith('SELECT sc, seq, ship, sign_on, proj_off, act_off, imported_at')) return { results: legs };
          if (q.startsWith('SELECT agency_id, status, vessel, embarked_at, debarked_at FROM registry_snapshot')) return { results: registry };
          if (q.startsWith('SELECT id, name, brand FROM vessel')) return { results: vessels };
          return { results: crew };
        },
      }),
    },
  };
}
const call = async (env) => (await apiRosterExport(new Request('https://x/api/roster/export', { headers: { 'X-Roster-Key': 'k' } }), env)).json();
const row = (agency, last, extra = {}) => ({
  ship_crew_id: null, agency_id: agency, first_name: 'X', last_name: last, rank: null,
  ship: null, brand: null, status: 'On board', email: null, sign_on: null, sign_off: null, ...extra,
});

test('route: the seventeen come back with a hull, and coverage stops counting them as unplaced', async () => {
  const body = await call(envWith({
    crew: [row('SC-0042899', 'Valdesco'), row('SC-0038134', 'Vicedo')],
    registry: [
      { agency_id: 'SC-0042899', status: 'On board', vessel: 'MV BRILLIANCE OF THE SEAS', embarked_at: '2026-09-02', debarked_at: null },
      { agency_id: 'SC-0038134', status: 'On board', vessel: 'MV AZAMARA JOURNEY', embarked_at: '2026-07-25', debarked_at: null },
    ],
  }));
  const by = Object.fromEntries(body.crew.map((c) => [c.last_name, c]));
  assert.equal(by.Valdesco.ship, 'Brilliance');
  assert.equal(by.Valdesco.brand, 'Royal Caribbean');
  assert.equal(by.Valdesco.sign_on, '2026-09-02');
  assert.equal(by.Vicedo.ship, 'Journey');
  assert.equal(body.coverage.on_board_without_current_leg, 0);
});

test('route: a Counter crew the file agrees with is byte-for-byte unchanged', async () => {
  const c = row('SC-0037752', 'Belhida', { ship: 'Apex', brand: 'Celebrity', sign_on: '2026-03-14', sign_off: '2026-10-18' });
  const body = await call(envWith({
    crew: [c],
    legs: [{ sc: 'SC-0037752', seq: 1, ship: 'Apex', sign_on: '2026-03-14', proj_off: '2026-10-18', act_off: null, imported_at: null }],
    edits: [{ sc: 'SC-0037752', seq: 1, sign_on: '2026-03-14', sign_off: '2026-10-07', ship: 'Apex', on_key: '2026-03-14', updated_at: '2026-10-08T17:53:01.926Z' }],
    registry: [{ agency_id: 'SC-0037752', status: 'On board', vessel: 'MV CELEBRITY APEX', embarked_at: '2026-03-14', debarked_at: null }],
  }));
  assert.equal(body.crew[0].ship, 'Apex');
  assert.equal(body.crew[0].sign_off, '2026-10-07', "Rita's recorded sign-off still reaches the timecard");
});

test('route: no field is added or dropped', async () => {
  const body = await call(envWith({
    crew: [row('SC-0042899', 'Valdesco')],
    registry: [{ agency_id: 'SC-0042899', status: 'On board', vessel: 'MV BRILLIANCE OF THE SEAS', embarked_at: '2026-09-02', debarked_at: null }],
  }));
  assert.deepEqual(Object.keys(body.crew[0]).sort(), [...EXPORT_FIELDS].sort());
});

test('route: a missing registry_snapshot or vessel table degrades to today\'s answer, never a 500', async () => {
  const env = envWith({ crew: [row('SC-0042899', 'Valdesco')] });
  const base = env.DB.prepare;
  env.DB.prepare = (sql) => {
    const q = String(sql).trim();
    if (q.includes('FROM registry_snapshot') || q.startsWith('SELECT id, name, brand FROM vessel')) {
      return { all: async () => { throw new Error('no such table'); } };
    }
    return base(sql);
  };
  const res = await apiRosterExport(new Request('https://x/api/roster/export', { headers: { 'X-Roster-Key': 'k' } }), env);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).crew[0].ship, null);
});
