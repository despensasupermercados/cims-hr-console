/**
 * A FAILED READ FAILS THE EXPORT — 30 Oct 2026.
 *
 * On 29 Oct 2026 cims-timecard's 10:00 UTC roster sync recorded 29 crew owing
 * a September card where the previous morning's sync — same code on both
 * sides, materially the same data — had recorded 47. The export's four side
 * reads (contract_edit, keyman_contract3, registry_snapshot, vessel) each
 * carried `.catch(() => ({ results: [] }))`, so ONE transient D1 failure made
 * the route answer 200 with every TDG placement missing: eighteen crew left
 * the compliance denominator with their hulls, and every check stayed green.
 * The exact silent-narrowing shape of 2 Sep and 8 Oct, this time from a
 * swallowed read instead of missing data.
 *
 * The rule these tests hold: the export either answers with ALL its sources
 * or says 503 with which read failed. It never answers 200 with a silently
 * degraded crew list. The caller (cims-timecard syncRoster) records a FAILED
 * sync on a non-200 and keeps yesterday's roster, and its own collapse gate
 * (test/synccollapse.test.js over there) is the second wall.
 *
 * Run: node --test test/roster_export_reads.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRosterExport } from '../src/roster_export.js';

const req = () => new Request('https://x/api/roster/export', { headers: { 'X-Roster-Key': 'k' } });

/** The healthy mocked D1 the other export tests use, with one read made to fail. */
function envFailing(failWhen) {
  return {
    ROSTER_KEY: 'k',
    DB: {
      prepare: (sql) => ({
        all: async () => {
          const q = String(sql).trim();
          if (failWhen(q)) throw new Error('D1_ERROR: network connection lost');
          if (q.startsWith('SELECT sc, seq, sign_on, sign_off, ship, on_key, updated_at')) return { results: [] };
          if (q.startsWith('SELECT sc, seq, ship, sign_on, proj_off, act_off, imported_at')) return { results: [] };
          if (q.startsWith('SELECT agency_id, status, vessel, embarked_at, debarked_at FROM registry_snapshot')) return { results: [] };
          if (q.startsWith('SELECT id, name, brand FROM vessel')) return { results: [] };
          return { results: [] }; // ROSTER_SQL
        },
      }),
    },
  };
}

for (const [name, match] of [
  ['registry_snapshot', 'FROM registry_snapshot'],
  ['vessel', 'FROM vessel'],
  ['contract_edit', 'FROM contract_edit'],
  // ROSTER_SQL itself joins keyman_contract3, so match the side read's own
  // SELECT list rather than the table name.
  ['keyman_contract3', 'SELECT sc, seq, ship, sign_on, proj_off'],
]) {
  test(`a failed ${name} read is a 503 naming the read, never a 200 with a narrowed fleet`, async () => {
    const res = await apiRosterExport(req(), envFailing((q) => q.includes(match)));
    assert.equal(res.status, 503, 'the export must refuse to answer without this source');
    const body = await res.json();
    assert.equal(body.error, 'export_read_failed');
    assert.match(String(body.detail), new RegExp(name), 'the detail says WHICH read failed');
    assert.ok(!('crew' in body), 'no crew list leaves on a failed read — partial truth is the bug');
  });
}

test('a failed main roster read is a 503 too, not an unhandled rejection', async () => {
  const res = await apiRosterExport(req(), envFailing((q) => q.startsWith('\n  SELECT c.ship_crew_id') || q.startsWith('SELECT c.ship_crew_id')));
  assert.equal(res.status, 503);
  assert.match(String((await res.json()).detail), /roster read failed/);
});

test('with every read healthy the export still answers 200 as before', async () => {
  const res = await apiRosterExport(req(), envFailing(() => false));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.crew));
  assert.ok(body.coverage);
});
