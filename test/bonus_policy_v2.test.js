// Bonus policy v2 and the commit's evidence (Miguel, 16 Oct 2026: "agree. both"). Money (§1): v2 must keep v1's rules to
// the character — only what sComm measures changed — and every commit must say which policy scored it and what the
// systems said. On REAL SQLite: the migrations as written, not a belief about them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { POLICY_VERSION, FW } from "../src/bonus.js";

const sql = (f) => readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8");

test("v2 copies v1's ladder, floor, weights, eval rule, gates and aggregation exactly; the outcome table gains evidence_json", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(sql("0001_init.sql"));
  db.exec(sql("0028_bonus_policy_v2.sql"));
  const [v1, v2] = db.prepare("SELECT * FROM bonus_policy ORDER BY version").all();
  assert.equal(v2.version, 2); assert.equal(POLICY_VERSION, 2);
  for (const k of ["ladder_json", "floor_pct", "weights_json", "eval_rule", "gates_json", "agg_policy"]) assert.equal(v2[k], v1[k], k + " must not move");
  const w = JSON.parse(v2.weights_json); for (const k in FW) assert.equal(w[k], FW[k], "the engine's weights are the policy's");
  assert.match(v2.notes, /Dexter's audit/);
  assert.ok(db.prepare("SELECT name FROM pragma_table_info('bonus_outcome') WHERE name='evidence_json'").get(), "evidence_json exists");
  db.exec(sql("0028_bonus_policy_v2.sql").replace(/ALTER TABLE[^;]+;/, "")); // the INSERT is idempotent
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bonus_policy").get().n, 2);
});

test("the commit writes POLICY_VERSION and the server's own read of the systems, never a literal 1", () => {
  const w = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const fn = w.slice(w.indexOf("async function apiBonusCommit("), w.indexOf("/* ----------------------- feedback windows"));
  assert.match(fn, /await ensureBonusV2\(env\)/);
  assert.match(fn, /const evidence = await commitEvidence\(env, cr, b, ships\)/);
  assert.match(fn, /committed_at,evidence_json\) VALUES/);
  assert.match(fn, /cr\.id, POLICY_VERSION, JSON\.stringify\(r\.breakdown\)/);
  assert.doesNotMatch(fn, /cr\.id, 1, JSON\.stringify/);
  const ce = w.slice(w.indexOf("async function commitEvidence("), w.indexOf("async function apiBonusCommit("));
  assert.match(ce, /engine: "none"/, "a commit never waits on a model: cached AI answers only");
  assert.match(ce, /catch \(e\) \{ return JSON\.stringify\(\{ at: new Date\(\)\.toISOString\(\), error/, "a failed read never blocks a commit");
});

// ONE OUTCOME PER CONTRACT SPAN (17 Oct 2026 logic review). The commit's backstop cited a UNIQUE index "migration 0004"
// that no migration created: production carried only non-unique indexes, so two racing commits paid twice. On real SQLite.
function commitDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(sql("0001_init.sql"));
  db.exec(sql("0028_bonus_policy_v2.sql"));
  db.exec(sql("0033_bonus_outcome_unique.sql"));
  db.exec("INSERT INTO crew (id, agency_id, first_name, last_name, status, created_at, updated_at) VALUES ('c1','SC-1','Ana','Cruz','On board','t','t')");
  return db;
}
// The three writes apiBonusCommit sends as ONE D1 batch (a transaction), in its order: contract, its legs, the outcome.
function commit(db, n, corrects = null) {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO contract (id,crew_id,contract_group_id,status,created_at,updated_at) VALUES (?,?,?,'Closed','t','t')").run("k" + n, "c1", "SC-1-C" + n);
    db.prepare("INSERT INTO assignment (id,contract_id,vessel_name,is_transfer,sign_on,actual_sign_off,end_reason,created_at,updated_at) VALUES (?,?,'Apex',0,'2026-03-14','2026-10-07','completed','t','t')").run("a" + n, "k" + n);
    db.prepare("INSERT INTO bonus_outcome (id,contract_id,contract_group_id,crew_id,policy_version,scorecard_json,score_pct,count_before,count_after,pay_usd,span_start,span_end,ships_json,committed_by,committed_at,corrects_id) VALUES (?,?,?,'c1',2,'{}',90,2,3,450,'2026-03-14','2026-10-07','[\"Apex\"]','rita','t',?)").run("bo" + n, "k" + n, "SC-1-C" + n, corrects);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

test("the database refuses a second primary outcome for the same crew and span, and the refused commit leaves nothing behind", () => {
  const db = commitDb();
  commit(db, 1);
  assert.throws(() => commit(db, 2), /UNIQUE/, "a second click on the same span is refused: no double pay, no double count");
  const n = (t) => db.prepare("SELECT COUNT(*) n FROM " + t).get().n;
  assert.deepEqual({ outcomes: n("bonus_outcome"), contracts: n("contract"), legs: n("assignment") }, { outcomes: 1, contracts: 1, legs: 1 }, "no orphan contract or leg");
  commit(db, 3, "bo1");
  assert.equal(n("bonus_outcome"), 2, "a correction (corrects_id) restates the span by design");
});

test("the commit writes contract, legs and outcome as one batch after the evidence read; the guard creates the index at runtime", () => {
  const w = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const fn = w.slice(w.indexOf("async function apiBonusCommit("), w.indexOf("/* ----------------------- feedback windows"));
  const ev = fn.indexOf("const evidence = await commitEvidence("), ba = fn.indexOf("await env.DB.batch(writes)");
  assert.ok(ev > 0 && ba > ev, "the evidence is read first, then ONE batch writes");
  assert.doesNotMatch(fn, /INSERT INTO (contract|assignment|bonus_outcome)[^\n]*\)\.run\(\)/, "no write runs on its own outside the batch");
  const g = w.slice(w.indexOf("const ensureBonusV2 = memoEnsure("), w.indexOf("async function commitEvidence("));
  assert.match(g, /CREATE UNIQUE INDEX IF NOT EXISTS ux_bonus_outcome_span ON bonus_outcome\(crew_id, span_start, span_end\) WHERE corrects_id IS NULL/);
  assert.match(sql("0033_bonus_outcome_unique.sql"), /CREATE UNIQUE INDEX IF NOT EXISTS ux_bonus_outcome_span ON bonus_outcome\(crew_id, span_start, span_end\) WHERE corrects_id IS NULL;/, "the migration and the guard say the same");
});
