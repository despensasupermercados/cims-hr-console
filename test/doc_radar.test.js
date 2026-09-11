import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docStatus, assessCrew, fetchDocRadar, buildDocRadarEmail, fetchReconciliation, reconLine } from '../src/doc_radar.js';

const TODAY = '2026-07-14';

// SQL-aware: fetchDocRadar issues TWO reads (crew, crew_override). A stub that answers both with
// the same rows passes by accident — the crew rows arrive as their own overrides and every value
// agrees with itself. Dispatch on the statement so the override path is actually exercised.
function stubEnv(rows, overrides = []) {
  return { DB: { prepare(sql) {
    const isOverride = String(sql).includes('FROM crew_override');
    return { async all() { return { results: isOverride ? overrides : rows }; } };
  } } };
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

// --- status comes from the board, not the raw crew.status column (CLAUDE.md §11) -------------
// The radar used to read COALESCE(crew_override.status, crew.status) directly. That is whatever
// the last AdvancedQuery import happened to say, so this email could contradict the Crew tab
// about the same seafarer — and `deployable`, which drives urgency, was decided by it.
const legsFor = (sc, on, off) => [{ ours: 1, sc, on, off }];

test('fetchDocRadar: a crew the board shows aboard is On board, whatever the import said', async () => {
  const rows = [{ agency_id:'SC-1', first_name:'A', last_name:'B', status:'Earmarked', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:'2026-08-01', usv_exp:'2030-01-01', sch_exp:null }];
  const noBoard = await fetchDocRadar(stubEnv(rows), TODAY);
  assert.equal(noBoard.rows[0].status, 'Earmarked');
  assert.equal(noBoard.rows[0].deployable, true, 'without a board we fall back to the registry value');

  const withBoard = await fetchDocRadar(stubEnv(rows), TODAY, { boardLegs: async () => legsFor('SC-1', '2026-05-01', '2026-11-01') });
  assert.equal(withBoard.rows[0].status, 'On board');
  assert.equal(withBoard.rows[0].deployable, false, 'someone already aboard is not about to join a ship');
  assert.equal(withBoard.counts.deployable, 0);
});

test('fetchDocRadar: a manual override status still wins over the board', async () => {
  const rows = [{ agency_id:'SC-1', first_name:'A', last_name:'B', status:'On board', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:'2026-08-01', usv_exp:'2030-01-01', sch_exp:null }];
  const r = await fetchDocRadar(stubEnv(rows, [{ agency_id:'SC-1', status:'Earmarked', retired:0 }]), TODAY,
    { boardLegs: async () => legsFor('SC-1', '2026-05-01', '2026-11-01') });
  assert.equal(r.rows[0].status, 'Earmarked', 'a manual pin beats derivation');
});

test('fetchDocRadar: a retired crew is dropped, not reported', async () => {
  const rows = [
    { agency_id:'SC-GONE', first_name:'Left', last_name:'Fleet', status:'On board', pp_exp:'2026-01-01', sirb_exp:'2030-01-01', med_exp:'2030-01-01', usv_exp:'2030-01-01', sch_exp:null },
    { agency_id:'SC-HERE', first_name:'Still', last_name:'Sailing', status:'On board', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:'2026-08-01', usv_exp:'2030-01-01', sch_exp:null },
  ];
  const r = await fetchDocRadar(stubEnv(rows, [{ agency_id:'SC-GONE', retired:1 }]), TODAY);
  assert.deepEqual(r.rows.map(x => x.agency_id), ['SC-HERE'], 'an expired passport on someone who has left is not an action item');
  assert.equal(r.counts.offFleet, 1, 'the skip is counted, not silent');
});

test('fetchDocRadar: a crew whose import said Inactive is still dropped', async () => {
  const rows = [{ agency_id:'SC-X', first_name:'In', last_name:'Active', status:'Inactive', pp_exp:'2026-01-01', sirb_exp:'2030-01-01', med_exp:'2030-01-01', usv_exp:'2030-01-01', sch_exp:null }];
  const r = await fetchDocRadar(stubEnv(rows), TODAY);
  assert.deepEqual(r.rows, []);
  assert.equal(r.counts.offFleet, 1);
});

test('fetchDocRadar: a manual document correction wins over the imported expiry', async () => {
  const rows = [{ agency_id:'SC-1', first_name:'A', last_name:'B', status:'On board', pp_exp:'2026-01-01', sirb_exp:'2030-01-01', med_exp:'2030-01-01', usv_exp:'2030-01-01', sch_exp:null }];
  const r = await fetchDocRadar(stubEnv(rows, [{ agency_id:'SC-1', retired:0, pp_exp:'2033-01-01' }]), TODAY);
  assert.deepEqual(r.rows, [], 'the corrected passport is valid, so nothing is flagged');
});

test('fetchDocRadar: a RETIRED override contributes no document values', async () => {
  // retired=1 means the whole override is out of force, documents included — the same rule the
  // crew list applies. Taking its dates anyway would resurrect a correction we no longer honour.
  const rows = [{ agency_id:'SC-1', first_name:'A', last_name:'B', status:'On board', pp_exp:'2026-01-01', sirb_exp:'2030-01-01', med_exp:'2030-01-01', usv_exp:'2030-01-01', sch_exp:null }];
  const r = await fetchDocRadar(stubEnv(rows, [{ agency_id:'SC-1', retired:1, pp_exp:'2033-01-01' }]), TODAY);
  assert.deepEqual(r.rows, [], 'retired means off-fleet, so the crew is dropped entirely');
  assert.equal(r.counts.offFleet, 1);
});

// --- reconciliation footer ---------------------------------------------------
// The import writes sync_conflict rows and nothing read them back. On 2026-09-11 production held
// 292 open vessel flags (oldest 23 July, newest 6 September), 5 absences and one identity
// collision — a backlog invisible because no report named it. The radar lands in Rita's inbox
// every week, so the number goes there.
function reconEnv({ run, conflicts, throwOn }) {
  return { DB: { prepare(sql) {
    const S = String(sql);
    if (throwOn && S.includes(throwOn)) throw new Error('boom');
    if (S.includes('FROM import_run')) return { async first() { return run || null; } };
    if (S.includes('FROM sync_conflict')) return { async all() { return { results: conflicts || [] }; } };
    throw new Error('unhandled SQL: ' + S);
  } } };
}

test('fetchReconciliation: counts the open flags by kind and names the last import', async () => {
  const r = await fetchReconciliation(reconEnv({
    run: { run_at: '2026-09-06T07:46:17.428Z', run_by: 'Rita.Berenyi@dg3.com' },
    conflicts: [
      { field: 'vessel_observed', n: 292 },
      { field: 'presence', n: 5 },
      { field: 'identity', n: 1 },
      { field: 'status', n: 3 },
      { field: 'something_else', n: 9 },   // unknown kinds are ignored, not miscounted
    ],
  }));
  assert.equal(r.lastImportAt, '2026-09-06T07:46:17.428Z');
  assert.equal(r.lastImportBy, 'Rita.Berenyi@dg3.com');
  assert.equal(r.pendingShip, 292);
  assert.equal(r.pendingAbsence, 5);
  assert.equal(r.pendingIdentity, 1);
  assert.equal(r.pendingStatus, 3);
});

test('fetchReconciliation: a broken footer never stops the compliance report', async () => {
  const r = await fetchReconciliation(reconEnv({ throwOn: 'sync_conflict' }));
  assert.deepEqual(r, { lastImportAt: null, lastImportBy: null, pendingStatus: 0, pendingIdentity: 0, pendingShip: 0, pendingAbsence: 0 });
});

test('reconLine: reads as a sentence, and says so plainly when nothing is pending', () => {
  const busy = reconLine({ lastImportAt: '2026-09-06T07:46:17.428Z', lastImportBy: 'Rita', pendingShip: 292, pendingStatus: 3, pendingIdentity: 1, pendingAbsence: 5 });
  assert.match(busy, /06 Sep 2026/);
  assert.match(busy, /by Rita/);
  assert.match(busy, /301 changes<\/strong> still unreconciled/, 'lead with the total, not a sum to do in your head');
  assert.match(busy, /292 ship, 3 status, 1 identity, 5 absence/);

  const clean = reconLine({ lastImportAt: '2026-09-06T00:00:00Z', pendingShip: 0, pendingStatus: 0, pendingIdentity: 0, pendingAbsence: 0 });
  assert.match(clean, /all imported changes reconciled/);

  assert.match(reconLine({}), /No TDG import on record/);
  assert.equal(reconLine(null), '', 'no data means no line, not a broken one');
});

test('reconLine: one pending change is singular', () => {
  assert.match(reconLine({ lastImportAt: '2026-09-06T00:00:00Z', pendingIdentity: 1 }), /1 change<\/strong> still unreconciled &mdash; 1 identity/);
});

test('reconLine: an import operator name cannot inject markup into the email', () => {
  const line = reconLine({ lastImportAt: '2026-09-06T00:00:00Z', lastImportBy: '<script>alert(1)</script>' });
  assert.ok(!line.includes('<script>'), 'run_by is stored data and must be escaped');
  assert.match(line, /&lt;script&gt;/);
});

test('buildDocRadarEmail: the footer carries the reconciliation line', () => {
  const counts = { crew:0, expired:0, expiring:0, missing:0, suspect:0, deployable:0 };
  const withRecon = buildDocRadarEmail({ runDate: TODAY, rows: [], counts, urgent: null, recon: { lastImportAt: '2026-09-06T00:00:00Z', pendingShip: 292 } });
  assert.match(withRecon, /292 ship/);
  assert.match(withRecon, /Automated weekly report/, 'the standing footer text survives');

  const without = buildDocRadarEmail({ runDate: TODAY, rows: [], counts, urgent: null });
  assert.ok(!without.includes('unreconciled'), 'no recon data means no half-written line');
  assert.match(without, /Automated weekly report/);
});
