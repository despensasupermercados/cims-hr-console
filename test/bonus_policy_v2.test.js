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
