import { test } from "node:test";
import assert from "node:assert/strict";
import { apiCrewImportStage, apiCrewImportApply } from "../src/crew_import_routes.js";

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

test("apply is idempotent by file hash", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, dup: true }) };
  const res = await apiCrewImportApply(req({ review: { groups: {} }, decisions: {}, file_hash: "seen" }), env);
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "already_processed");
});
