import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docStatus, assessCrew, fetchDocRadar, buildDocRadarEmail } from '../src/doc_radar.js';

const TODAY = '2026-07-14';

function stubEnv(rows) {
  return { DB: { prepare() { return { async all() { return { results: rows }; } }; } } };
}

test('docStatus: valid / expiring / expired / missing', () => {
  assert.equal(docStatus('2030-01-01', TODAY), 'valid');
  assert.equal(docStatus('2026-08-01', TODAY), 'expiring');
  assert.equal(docStatus('2026-01-01', TODAY), 'expired');
  assert.equal(docStatus(null, TODAY), 'missing');
  assert.equal(docStatus('', TODAY), 'missing');
});

test('assessCrew: counts, deployable, blank Schengen = na not missing', () => {
  const a = assessCrew({ status: 'Earmarked', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:'2025-04-28', usv_exp:'2030-01-01', sch_exp:null }, TODAY);
  assert.equal(a.expired, 1);
  assert.equal(a.missing, 0);
  assert.equal(a.cells.sch_exp, 'na');
  assert.equal(a.deployable, true);
  assert.equal(a.flagged, true);
});

test('assessCrew: missing critical doc is flagged', () => {
  const a = assessCrew({ status: 'On board', pp_exp:null, sirb_exp:'2030-01-01', med_exp:'2030-01-01', usv_exp:'2030-01-01', sch_exp:null }, TODAY);
  assert.equal(a.missing, 1);
  assert.equal(a.cells.pp_exp, 'missing');
  assert.equal(a.flagged, true);
});

test('assessCrew: all-valid crew is not flagged', () => {
  const a = assessCrew({ status: 'On board', pp_exp:'2032-01-01', sirb_exp:'2033-01-01', med_exp:'2031-01-01', usv_exp:'2034-01-01', sch_exp:null }, TODAY);
  assert.equal(a.flagged, false);
});

test('fetchDocRadar: filters, sorts worst-first, computes counts + urgent', async () => {
  const env = stubEnv([
    { agency_id:'SC-A', first_name:'Ana',  last_name:'Reyes', status:'On board',    pp_exp:'2032-01-01', sirb_exp:'2032-01-01', med_exp:'2026-08-05', usv_exp:'2032-01-01', sch_exp:null },
    { agency_id:'SC-B', first_name:'Ben',  last_name:'Cruz',  status:'Earmarked',   pp_exp:'2032-01-01', sirb_exp:'2032-01-01', med_exp:'2025-04-28', usv_exp:'2032-01-01', sch_exp:null },
    { agency_id:'SC-C', first_name:'Cy',   last_name:'Lim',   status:'On board',    pp_exp:'2032-01-01', sirb_exp:'2033-01-01', med_exp:'2031-01-01', usv_exp:'2034-01-01', sch_exp:null },
  ]);
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].name, 'Ben Cruz');
  assert.equal(r.counts.crew, 2);
  assert.equal(r.counts.expired, 1);
  assert.equal(r.counts.expiring, 1);
  assert.equal(r.urgent.name, 'Ben Cruz');
  assert.equal(r.urgent.deployable, true);
  assert.equal(r.urgent.label, 'MED');
});

test('buildDocRadarEmail: renders matrix, MISSING, expired banner, urgent line', async () => {
  const env = stubEnv([
    { agency_id:'SC-B', first_name:'Ben', last_name:'Cruz', status:'Earmarked', pp_exp:null, sirb_exp:'2032-01-01', med_exp:'2025-04-28', usv_exp:'2032-01-01', sch_exp:null },
  ]);
  const { rows, counts, urgent, truncated } = await fetchDocRadar(env, TODAY);
  const html = buildDocRadarEmail({ runDate: '2026-07-20', rows, counts, urgent, truncated });
  assert.match(html, /Fleet document radar/);
  assert.match(html, /Ben Cruz/);
  assert.match(html, /MISSING/);
  assert.match(html, /crew ·/);
  assert.match(html, /Most urgent/);
  assert.match(html, /Earmarked/);
});

test('buildDocRadarEmail: all-clear banner when nothing flagged', () => {
  const html = buildDocRadarEmail({ runDate: '2026-07-20', rows: [], counts: { crew:0, expired:0, expiring:0, missing:0, deployable:0 }, urgent: null });
  assert.match(html, /All clear/);
  assert.doesNotMatch(html, /Most urgent/);
});

// --- SUSPECT band ------------------------------------------------------------
// A document cannot plausibly have lapsed five years ago and still sit on an ACTIVE crew record.
// The live case: the duplicate crew row created on 2026-09-06 carried pp 1934-09-22 and
// usv 1930-02-28 — a mangled read of 2034 and 2030 — and its score of 200 put it at the top of a
// report whose whole job is to say who needs chasing THIS WEEK.
const IDA_SUSPECT = { status: 'On board', pp_exp: '1934-09-22', sirb_exp: '2027-10-06', med_exp: '2027-07-05', usv_exp: '1930-02-28', sch_exp: null };

test('docStatus: an implausible date is SUSPECT, not expired', () => {
  assert.equal(docStatus('1934-09-22', TODAY), 'suspect');
  assert.equal(docStatus('1930-02-28', TODAY), 'suspect');
  assert.equal(docStatus('2999-01-01', TODAY), 'suspect');
  // The band edges still behave: a normal lapse and a long-dated document are unaffected.
  assert.equal(docStatus('2022-01-01', TODAY), 'expired', 'a 4-year-old lapse is a real lapse');
  assert.equal(docStatus('2036-01-01', TODAY), 'valid', 'a 10-year passport is ordinary');
});

test('assessCrew: a suspect date is still flagged, and scores below a real lapse', () => {
  const ida = assessCrew(IDA_SUSPECT, TODAY);
  assert.equal(ida.suspect, 2);
  assert.equal(ida.expired, 0, 'a parse artifact must not be counted as an expired document');
  assert.equal(ida.flagged, true, 'suspect is relabelled, never hidden');
  assert.equal(ida.cells.pp_exp, 'suspect');

  const realLapse = assessCrew({ status: 'On board', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:'2026-06-01', usv_exp:'2030-01-01', sch_exp:null }, TODAY);
  assert.equal(realLapse.expired, 1);
  assert.ok(realLapse.score > ida.score, `one real expiry (${realLapse.score}) must outrank two suspect dates (${ida.score})`);
});

test('assessCrew: a suspect date never sets the earliest-date tiebreak', () => {
  const a = assessCrew(IDA_SUSPECT, TODAY);
  assert.equal(a.earliest, null, '1930 must not become the report’s earliest bad date');
});

test('fetchDocRadar: a suspect date does not take the most-urgent headline', async () => {
  const env = stubEnv([
    { agency_id:'SC-DUP', first_name:'Ida', last_name:'Purnama', ...IDA_SUSPECT },
    { agency_id:'SC-REAL', first_name:'Real', last_name:'Lapse', status:'Earmarked', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:'2026-06-01', usv_exp:'2030-01-01', sch_exp:null },
  ]);
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.counts.suspect, 2);
  assert.equal(r.urgent.name, 'Real Lapse', 'the headline belongs to the seafarer actually at risk');
  assert.equal(r.rows[0].agency_id, 'SC-REAL', 'worst-first means the real lapse sorts first');
});

test('fetchDocRadar: the worst-first sort is a real comparator, not always -1', async () => {
  // `b.score - a.score || cond ? -1 : 1` parses as `((b.score-a.score) || cond) ? -1 : 1`, so any
  // score difference returned -1 whichever way round the pair arrived. Order was luck.
  const mk = (id, med) => ({ agency_id:id, first_name:id, last_name:'X', status:'On board', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:med, usv_exp:'2030-01-01', sch_exp:null });
  const r = await fetchDocRadar(stubEnv([
    mk('SOON', '2026-08-20'),   // expiring  -> 10
    mk('GONE', '2026-01-01'),   // expired   -> 100
  ]), TODAY);
  assert.deepEqual(r.rows.map(x => x.agency_id), ['GONE', 'SOON']);
  // and the reverse input order must give the same answer
  const r2 = await fetchDocRadar(stubEnv([mk('GONE', '2026-01-01'), mk('SOON', '2026-08-20')]), TODAY);
  assert.deepEqual(r2.rows.map(x => x.agency_id), ['GONE', 'SOON']);
});

test('buildDocRadarEmail: suspect dates print the full year and carry an instruction', () => {
  const rows = [{ agency_id:'SC-DUP', name:'Ida Purnama', status:'On board', docs:{ pp_exp:'1934-09-22', sirb_exp:'2027-10-06', med_exp:'2027-07-05', usv_exp:'1930-02-28', sch_exp:null }, ...assessCrew(IDA_SUSPECT, TODAY) }];
  const html = buildDocRadarEmail({ runDate: TODAY, rows, counts: { crew:1, expired:0, expiring:0, missing:0, suspect:2, deployable:0 }, urgent: null });
  assert.ok(html.includes('22 Sep 1934'), 'the full year is what makes the defect obvious');
  assert.ok(!html.includes('22 Sep 34'), 'a 2-digit year is how this hid in the matrix');
  assert.match(html, /2 suspect dates/);
  assert.match(html, /treat as a data error, not a lapse/);
  assert.match(html, /Suspect date/, 'the legend has to explain the colour');
});

test('buildDocRadarEmail: no suspect dates means no suspect note', () => {
  const html = buildDocRadarEmail({ runDate: TODAY, rows: [], counts: { crew:0, expired:0, expiring:0, missing:0, suspect:0, deployable:0 }, urgent: null });
  assert.ok(!html.includes('treat as a data error'));
});
