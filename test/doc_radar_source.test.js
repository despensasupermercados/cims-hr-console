// Regression tests for the 2026-08-17 Fleet Document Radar defect.
//
// Reported by Maryjoy Manzanares to Rita Berenyi: 14 discrepancies on the 17 Aug radar — 12 wrong
// statuses and 2 wrong document readings. Root cause: fetchDocRadar read the raw `crew` table
// (`WHERE status != 'Inactive'`) and never opened `crew_override`, so the email disagreed with the
// Crew tab, which is the authority. These tests pin the radar to the Crew tab's reading.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { docStatus, assessCrew, fetchDocRadar, buildDocRadarEmail } from '../src/doc_radar.js';

const TODAY = '2026-08-17';
const SRC = readFileSync(new URL('../src/doc_radar.js', import.meta.url), 'utf8');

// crew rows + crew_override rows, in the order fetchDocRadar issues them.
function stubEnv(crew, overrides = []) {
  return {
    DB: {
      prepare(sql) {
        const rows = /crew_override/.test(sql) ? overrides : crew;
        return { async all() { return { results: rows }; } };
      },
    },
  };
}
const OK = { pp_exp:'2032-01-01', sirb_exp:'2032-01-01', med_exp:'2032-01-01', usv_exp:'2032-01-01', sch_exp:null };

test('STATIC: fetchDocRadar must not filter on the raw crew.status column (CLAUDE.md §11)', () => {
  assert.doesNotMatch(SRC, /status\s*!=\s*'Inactive'/,
    "raw-status SQL filter is back — status must be derived, not read from the crew column");
  assert.match(SRC, /crew_override/, 'radar must read crew_override');
  assert.match(SRC, /applyOverride/, 'radar must merge manual overrides');
  assert.match(SRC, /crewStatus/, 'radar must derive status the way the Crew tab does');
});

test('STATIC: the two independent reads stay one concurrent wave (CLAUDE.md §12)', () => {
  assert.match(SRC, /Promise\.all\(\[/, 'reads must not become a sequential await chain');
});

test('a retired crew is dropped even though the base row still says On Vacation', async () => {
  // Larry Sison / Vincent Esteban / King John Lee Manzano: Rita tagged them retired=1 in
  // crew_override; the base crew row still reads 'On Vacation'. The old radar reported all three.
  const env = stubEnv(
    [{ agency_id:'SC-0044467', first_name:'Larry', last_name:'Sison', status:'On Vacation', ...OK, med_exp:'2026-08-21' }],
    [{ agency_id:'SC-0044467', retired: 1 }],
  );
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.rows.length, 0, 'retired crew must not appear on the radar');
  assert.equal(r.counts.offFleetSkipped, 1);
});

test('a manual document correction in crew_override wins over the imported row', async () => {
  // Ida Purnama: the imported row carried pp 1934-09-22; the correct date is on the override.
  const env = stubEnv(
    [{ agency_id:'SC-0040010', first_name:'Ida', last_name:'Purnama', status:'On board', ...OK, pp_exp:'1934-09-22' }],
    [{ agency_id:'SC-0040010', pp_exp:'2034-09-23' }],
  );
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.rows.length, 0, 'corrected passport must clear the flag');
});

test('an empty override field does NOT clobber a good base value', async () => {
  const env = stubEnv(
    [{ agency_id:'SC-1', first_name:'A', last_name:'B', status:'On board', ...OK }],
    [{ agency_id:'SC-1', pp_exp:'', med_exp:null }],
  );
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.rows.length, 0);
});

test('derived status, not the base column, decides `deployable`', async () => {
  // Base says Earmarked; the manual override says On board. Earmarked would add the +25
  // "next to deploy" urgency bump and print an amber pill — On board must not.
  const env = stubEnv(
    [{ agency_id:'SC-0038229', first_name:'Rudy', last_name:'Bugarin', status:'Earmarked', ...OK, sch_exp:'2026-05-20' }],
    [{ agency_id:'SC-0038229', status:'On board' }],
  );
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.rows[0].status, 'On board');
  assert.equal(r.rows[0].deployable, false);
});

test('docStatus: an absurd date is SUSPECT, a real lapse is still EXPIRED', () => {
  assert.equal(docStatus('1934-09-22', TODAY), 'suspect');
  assert.equal(docStatus('1930-02-28', TODAY), 'suspect');
  assert.equal(docStatus('2090-01-01', TODAY), 'suspect');
  // real lapses must be untouched — Bernard Paqueo's Schengen genuinely expired in Jul 2024
  assert.equal(docStatus('2024-07-15', TODAY), 'expired');
  assert.equal(docStatus('2022-01-01', TODAY), 'expired');
  assert.equal(docStatus('2026-08-21', TODAY), 'expiring');
  assert.equal(docStatus('2032-01-01', TODAY), 'valid');
});

test('a suspect date never takes the "Most urgent" headline from a real lapse', async () => {
  const env = stubEnv([
    { agency_id:'349195', first_name:'Ida', last_name:'Purnama', status:'On board', ...OK, pp_exp:'1934-09-22', usv_exp:'1930-02-28' },
    { agency_id:'SC-0038115', first_name:'Bernard', last_name:'Paqueo', status:'On board', ...OK, sch_exp:'2024-07-15' },
  ]);
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.counts.suspect, 2);
  assert.equal(r.urgent.name, 'Bernard Paqueo', 'a real expiry must headline, not a 1934 typo');
  assert.match(r.urgent.date, /^2024-07-15/);
});

test('a suspect date is still reported, with its full year, and is never silently dropped', async () => {
  const env = stubEnv([
    { agency_id:'349195', first_name:'Ida', last_name:'Purnama', status:'On board', ...OK, pp_exp:'1934-09-22' },
  ]);
  const { rows, counts, urgent } = await fetchDocRadar(env, TODAY);
  assert.equal(rows.length, 1, 'suspect rows must still print — relabelled, not hidden');
  const html = buildDocRadarEmail({ runDate: TODAY, rows, counts, urgent });
  assert.match(html, /22 Sep 1934/, 'suspect cells print a 4-digit year so the error is visible');
  assert.match(html, /Suspect date/, 'legend must explain the new state');
  assert.match(html, /Correct it on the Crew tab/);
  assert.doesNotMatch(html, /Most urgent/, 'no real lapse here, so no urgent headline');
});

test('assessCrew: suspect counts as flagged but scores below a real expiry', () => {
  const susp = assessCrew({ status:'On board', ...OK, pp_exp:'1934-09-22' }, TODAY);
  const real = assessCrew({ status:'On board', ...OK, pp_exp:'2024-01-01' }, TODAY);
  assert.equal(susp.suspect, 1);
  assert.equal(susp.expired, 0);
  assert.equal(susp.flagged, true);
  assert.ok(real.score > susp.score, 'a real expiry must outrank a data error');
});

test('missing crew_override table degrades to base rows instead of killing the cron', async () => {
  const env = { DB: { prepare(sql) { return {
    async all() {
      if (/crew_override/.test(sql)) throw new Error('no such table: crew_override');
      return { results: [{ agency_id:'SC-1', first_name:'A', last_name:'B', status:'On board', ...OK, med_exp:'2026-08-21' }] };
    } }; } } };
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.rows.length, 1);
});
