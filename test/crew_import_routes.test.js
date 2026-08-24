import { test } from "node:test";
import assert from "node:assert/strict";
import { apiCrewImportStage, apiCrewImportApply, handleCrewImport } from "../src/crew_import_routes.js";

function fakeDB({ existing = [], overrides = [], dup = false } = {}) {
  const batched = [];
  function route(sql) {
    if (/FROM import_run WHERE file_hash/i.test(sql)) return { __first: dup ? { x: 1 } : null };
    if (/FROM crew_override/i.test(sql)) return { __all: { results: overrides } };
    if (/FROM crew\b/i.test(sql)) return { __all: { results: existing } };
    return { __first: null, __all: { results: [] } };
  }
  const mk = (sql, args = []) => ({
    sql, args,
    bind(...a) { return mk(sql, a); },
    async first() { return route(sql).__first ?? null; },
    async all() { return route(sql).__all ?? { results: [] }; },
  });
  return {
    _batched: batched,
    prepare(sql) { return mk(sql); },
    async batch(stmts) { batched.push(...stmts); return stmts.map(() => ({ success: true })); },
  };
}
const req = (body) => ({ json: async () => body });

const EXISTING = [
  { agency_id: "SC-1", first_name: "Jomar", last_name: "Dela Cruz", status: "On board",
    vessel_observed: "Celebrity Edge", med_exp: "2026-03-19" },
];
const ROWS = [
  { "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board",
    "VESSEL NAME": "Celebrity Apex", "MEDICAL EXPIRATION DATE": "2028-03-19" },
];

test("stage returns tiered review and writes nothing", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const res = await apiCrewImportStage(req({ rows: ROWS, file_hash: "h1", filename: "f.xls" }), env);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.review.counts.ship_flag, 1);
  assert.equal(body.review.counts.cert, 1);
  assert.equal(env.DB._batched.length, 0);
});

test("stage rejects an already-imported file hash", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, dup: true }) };
  const res = await apiCrewImportStage(req({ rows: ROWS, file_hash: "seen" }), env);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "already_processed");
});

test("apply NEVER emits a vessel_observed UPDATE and logs the ship as a conflict", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h2" }), env)).json();
  const res = await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h2", run_by: "Rita" }), env);
  const body = await res.json();
  assert.equal(body.ok, true);
  const sqls = env.DB._batched.map(s => s.sql);
  assert.equal(sqls.some(s => /UPDATE crew SET vessel_observed/i.test(s)), false, "no ship write");
  assert.ok(sqls.some(s => /INSERT INTO import_run/i.test(s)), "import_run logged");
  assert.ok(sqls.some(s => /INSERT INTO sync_conflict/i.test(s)), "ship flagged as conflict");
  assert.ok(sqls.some(s => /UPDATE crew SET med_exp/i.test(s)), "cert applied");
});

test("D6 end-to-end: a TDG status change reaches an UPDATE crew SET status", async () => {
  const env = { DB: fakeDB({ existing: [{ agency_id: "SC-5", first_name: "A", last_name: "B", status: "Earmarked" }] }) };
  const rows = [{ "CREW ID": "SC-5", "FIRST NAME": "A", "LAST NAME": "B", "CREW STATUS": "On board" }];
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "s1" }), env)).json();
  const res = await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "s1", run_by: "Rita" }), env);
  const body = await res.json();
  const sqls = env.DB._batched.map(s => s.sql);
  assert.ok(sqls.some(s => /UPDATE crew SET status/i.test(s)), "status must actually be written");
  assert.equal(body.status_applied, 1);
  assert.equal(body.status_kept, 0);
});

test("D7 end-to-end: a cruise-line-keyed row updates the existing crew, no INSERT", async () => {
  const env = { DB: fakeDB({ existing: [{ agency_id: "SC-0040010", ship_crew_id: "349195",
    first_name: "Ida Bagus Made", last_name: "Purnama", status: "Earmarked" }] }) };
  const rows = [{ "CREW ID": "349195", "FIRST NAME": "Ida", "LAST NAME": "Purnama", "CREW STATUS": "On board" }];
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "s2" }), env)).json();
  assert.equal(stage.review.counts.new, 0, "no duplicate proposed");
  assert.equal(stage.review.counts.rekeyed, 1);
  const res = await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "s2", run_by: "Rita" }), env);
  const sqls = env.DB._batched.map(s => s.sql);
  assert.equal(sqls.some(s => /INSERT INTO crew\b/i.test(s)), false, "must not insert a second Purnama");
  assert.ok(sqls.some(s => /UPDATE crew SET status/i.test(s)));
  assert.equal(sqls.some(s => /UPDATE crew SET agency_id/i.test(s)), false, "identity never rewritten");
  assert.equal((await res.json()).ok, true);
});

test("apply is idempotent by file hash", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, dup: true }) };
  const res = await apiCrewImportApply(req({ review: { groups: {} }, decisions: {}, file_hash: "seen" }), env);
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "already_processed");
});

test("handleCrewImport routes stage + unknown path returns null", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const staged = await handleCrewImport(
    { ...req({ rows: ROWS, file_hash: "hr" }), method: "POST" },
    { pathname: "/api/crew/import/stage" }, env);
  assert.ok(staged, "stage route returns a Response");
  assert.equal((await staged.json()).ok, true);
  const miss = await handleCrewImport({ method: "GET" }, { pathname: "/api/other" }, env);
  assert.equal(miss, null, "unknown path returns null so worker.js falls through");
});
