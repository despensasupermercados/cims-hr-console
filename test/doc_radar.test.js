import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docStatus, assessCrew, fetchDocRadar, buildDocRadarEmail, reconLine } from '../src/doc_radar.js';

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

test('an EXPIRED Schengen alone is advisory, not a flag', () => {
  // Bernard Paqueo, 2026-08-24: every critical document valid, Schengen lapsed 2024.
  // He was in the top five of an email headed "22 flagged".
  const a = assessCrew({ status: 'On board', pp_exp:'2028-10-19', sirb_exp:'2028-11-05', med_exp:'2028-05-22', usv_exp:'2036-05-21', sch_exp:'2024-07-15' }, TODAY);
  assert.equal(a.flagged, false, 'an optional visa must not read as a compliance failure');
  assert.equal(a.advisoryOnly, true);
  assert.equal(a.advExpired, 1);
  assert.ok(a.score < 100, 'and must never outscore a lapsed medical');
});

test('a lapsed medical always outranks any number of lapsed Schengens', () => {
  const med = assessCrew({ status: 'Earmarked', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:'2025-04-28', usv_exp:'2030-01-01', sch_exp:null }, TODAY);
  const sch = assessCrew({ status: 'On board', pp_exp:'2030-01-01', sirb_exp:'2030-01-01', med_exp:'2030-01-01', usv_exp:'2030-01-01', sch_exp:'2020-01-01' }, TODAY);
  assert.ok(med.score > sch.score);
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

test('fetchDocRadar: Schengen-only crew land in advisory, out of the headline count', async () => {
  const env = stubEnv([
    { agency_id:'SC-A', first_name:'Ana', last_name:'Reyes', status:'On board', pp_exp:'2032-01-01', sirb_exp:'2032-01-01', med_exp:'2025-01-01', usv_exp:'2032-01-01', sch_exp:null },
    { agency_id:'SC-P', first_name:'Bernard', last_name:'Paqueo', status:'On board', pp_exp:'2032-01-01', sirb_exp:'2032-01-01', med_exp:'2032-01-01', usv_exp:'2032-01-01', sch_exp:'2024-07-15' },
  ]);
  const r = await fetchDocRadar(env, TODAY);
  assert.equal(r.counts.crew, 1, 'headline counts only real compliance gaps');
  assert.equal(r.counts.advisory, 1);
  assert.equal(r.advisory[0].name, 'Bernard Paqueo');
  assert.equal(r.urgent.name, 'Ana Reyes', 'urgent callout never picks a Schengen-only crew');
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

test('buildDocRadarEmail: advisory block names the Schengen-only crew', () => {
  const html = buildDocRadarEmail({
    runDate: '2026-07-20', rows: [], counts: { crew:0, expired:0, expiring:0, missing:0, deployable:0 },
    urgent: null, advisory: [{ name: 'Bernard Paqueo' }, { name: 'Manuel Reyes' }] });
  assert.match(html, /Advisory · 2 crew/);
  assert.match(html, /Bernard Paqueo, Manuel Reyes/);
  assert.match(html, /No effect on joining a ship/);
});

test('reconLine: reports last import and outstanding changes', () => {
  const l = reconLine({ lastImportAt: '2026-08-22T10:43:38.669Z', lastImportBy: 'Rita', pendingStatus: 3, pendingIdentity: 1, pendingShip: 411 });
  assert.match(l, /22 Aug 2026/);
  assert.match(l, /Rita/);
  assert.match(l, /3 status/);
  assert.match(l, /1 identity/);
  assert.match(l, /411 ship/);
  assert.match(l, /unreconciled/);
});

test('reconLine: says so plainly when everything is reconciled', () => {
  const l = reconLine({ lastImportAt: '2026-08-22T10:43:38.669Z', lastImportBy: 'Rita', pendingStatus: 0, pendingIdentity: 0, pendingShip: 0 });
  assert.match(l, /all imported changes reconciled/);
});

test('reconLine: an absent import history is stated, never silently omitted', () => {
  const l = reconLine({ lastImportAt: null, pendingStatus: 0, pendingIdentity: 0, pendingShip: 0 });
  assert.match(l, /No TDG import on record/);
});

test('reconLine: singular when exactly one change is outstanding', () => {
  const l = reconLine({ lastImportAt: '2026-08-22T00:00:00Z', pendingStatus: 1, pendingIdentity: 0, pendingShip: 0 });
  assert.match(l, /1 status<\/strong> change still unreconciled/);
});

test('footer carries the reconciliation line into the email', () => {
  const html = buildDocRadarEmail({
    runDate: '2026-07-20', rows: [], counts: { crew:0, expired:0, expiring:0, missing:0, deployable:0 }, urgent: null,
    recon: { lastImportAt: '2026-08-22T00:00:00Z', lastImportBy: 'Rita', pendingStatus: 3, pendingIdentity: 1, pendingShip: 0 } });
  assert.match(html, /TDG roster last imported/);
  assert.match(html, /3 status \+ 1 identity/);
});
