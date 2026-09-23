/**
 * THE TIMECARD MUST SEE WHAT THE BOARD SHOWS.
 *
 * Alonzo, SC-0041465, 23 Sep 2026 — three sources, three answers:
 *   keyman_contract3 (July Counter, no import stamp)  Rhapsody   2025-12-06 -> 2026-08-01
 *   contract_edit    (recorded 22 Aug 2026)           Symphony   2026-08-09 -> 2026-09-12
 *   assignment       (a projection for his next one)  Ovation    from 2026-11-02
 *
 * The board resolves that by the newer write: Symphony, off 12 Sep. The export read the Counter and
 * the relief board and NEVER contract_edit, so cims-timecard was told Rhapsody, off 1 Aug — a
 * seafarer on a different ship, six weeks out, in the system that chases his rest-hour cards.
 *
 * This calls apiRosterExport itself, so the resolution is proved end to end rather than by reading
 * the SQL. The rule is not re-implemented here or in the query: the route runs editFor + resolveLeg,
 * the same pair the board runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRosterExport } from '../src/roster_export.js';

const CREW_ROW = {
  ship_crew_id: '570848', agency_id: 'SC-0041465', first_name: 'Jonathan', last_name: 'Alonzo',
  rank: 'Printer Specialist', ship: 'Rhapsody', brand: 'Royal Caribbean', status: 'On board',
  email: 'j@example.invalid', sign_on: '2025-12-06', sign_off: '2026-08-01',
};
const LEG = { sc: 'SC-0041465', seq: 1, ship: 'Rhapsody', sign_on: '2025-12-06', proj_off: '2026-08-01', act_off: null, imported_at: null };
const EDIT = { sc: 'SC-0041465', seq: 1, sign_on: '2026-08-09', sign_off: '2026-09-12', ship: 'Symphony', on_key: '2025-12-06', updated_at: '2026-08-22T14:10:29.026Z' };

function envWith({ legs = [LEG], edits = [EDIT], crew = [CREW_ROW] } = {}) {
  return {
    ROSTER_KEY: 'k',
    DB: {
      prepare: (sql) => ({
        all: async () => {
          // ROSTER_SQL itself contains "FROM keyman_contract3" (inside COUNTER_LEG_SELECT), so the
          // two side queries are matched on their own leading SELECT, not on a table name.
          const q = String(sql).trim();
          if (q.startsWith('SELECT sc, seq, sign_on, sign_off, ship, on_key, updated_at')) return { results: edits };
          if (q.startsWith('SELECT sc, seq, ship, sign_on, proj_off, act_off, imported_at')) return { results: legs };
          return { results: crew };
        },
      }),
    },
  };
}
const call = async (env) => (await apiRosterExport(new Request('https://x/api/roster', { headers: { 'X-Roster-Key': 'k' } }), env)).json();

test('the recorded ship and sign-off reach the timecard, not the stale Counter', async () => {
  const body = await call(envWith());
  const a = body.crew[0];
  assert.equal(a.ship, 'Symphony', 'the board says Symphony, so the export says Symphony');
  assert.equal(a.sign_off, '2026-09-12', 'and the recorded sign-off, not the July projection');
  assert.equal(a.sign_on, '2026-08-09');
});

test('with no recorded edit the Counter stands — nothing is invented', async () => {
  const a = (await call(envWith({ edits: [] }))).crew[0];
  assert.equal(a.ship, 'Rhapsody');
  assert.equal(a.sign_off, '2026-08-01');
});

test('a newer Counter beats the edit, the same way the card does', async () => {
  const stamped = { ...LEG, imported_at: '2026-09-01T00:00:00.000Z' };
  const a = (await call(envWith({ legs: [stamped] }))).crew[0];
  assert.equal(a.ship, 'Rhapsody', 'the file is the newer write');
  assert.equal(a.sign_off, '2026-08-01');
});

test('a crew placed by the relief board alone is untouched', async () => {
  // No Counter row at all: the ship and dates came from `assignment` and must survive.
  const reliefOnly = { ...CREW_ROW, agency_id: 'SC-9999999', ship: 'Ovation', sign_on: '2026-11-02', sign_off: '2027-05-02' };
  const a = (await call(envWith({ crew: [reliefOnly], legs: [], edits: [] }))).crew[0];
  assert.equal(a.ship, 'Ovation');
  assert.equal(a.sign_on, '2026-11-02');
});

test('no export field is added or dropped by the resolution', async () => {
  const a = (await call(envWith())).crew[0];
  assert.deepEqual(Object.keys(a).sort(), [
    'agency_id', 'brand', 'email', 'first_name', 'last_name', 'rank', 'ship', 'ship_crew_id', 'sign_off', 'sign_on', 'status',
  ]);
});
