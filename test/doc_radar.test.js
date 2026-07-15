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
