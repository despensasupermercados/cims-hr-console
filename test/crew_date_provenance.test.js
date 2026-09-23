// "Where is that sign-off date coming from?" — Rita, in the console, 21 Sep 2026.
//
// She asked because the weekly Movements email said Andrea Joyce Calayag signs off Fri 25 Sep. Maria
// answered 2026-09-18, called it the projected sign-off from the contract history, and named ship_leg
// as the table. Rita concluded the email was wrong and said so to Miguel.
//
// The email was right. Production for SC-0045797:
//   keyman_contract3  Navigator, sign_on 2026-02-02, proj_off 2026-09-18, act_off NULL, imported_at NULL
//   contract_edit     sign_off 2026-09-25, updated_at 2026-07-14
// imported_at is NULL, so counter_sync.resolveLeg treats the Counter as older than any edit and Rita's
// own recorded 25 Sep wins — which is what the board draws and what the email sent.
//
// The defect was that /api/rotation/crew (Maria's contract-history tool) read keyman_contract3 ONLY and
// never contract_edit, so the console's own assistant could not see what the console's own board shows.
// 33 crew carry an edit today and 8 of them disagree with the Counter, so this was not one seafarer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__prov_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { apiRotationCrew };\n", "utf-8");
let apiRotationCrew;
try { ({ apiRotationCrew } = await import(TMP.href)); } finally { unlinkSync(TMP); }

// Rita's row, exactly as production holds it.
const CREW = { agency_id: "SC-0045797", first_name: "Andrea Joyce", last_name: "Calayag", status: "On board" };
const LEG = { seq: 1, ship: "Navigator", sign_on: "2026-02-02", proj_off: "2026-09-18", act_off: null, imported_at: null };
const EDIT = { sc: "SC-0045797", seq: 1, sign_on: "2026-02-02", sign_off: "2026-09-25", ship: "Navigator", on_key: "2026-02-02", updated_at: "2026-07-14T10:33:13.054Z" };

function envFor({ legs = [LEG], edits = [EDIT] } = {}) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => (/FROM crew WHERE agency_id/.test(sql) ? CREW : null),
    all: async () => {
      if (/FROM keyman_contract3/.test(sql)) return { results: legs };
      if (/FROM contract_edit/.test(sql)) return { results: edits };
      return { results: [] };
    },
    run: async () => ({ success: true }),
  });
  return { DB: { prepare: (sql) => stmt(sql), batch: async (s) => s.map(() => ({ success: true })) } };
}
const call = async (env) => (await apiRotationCrew(env, new URL("https://x/api/rotation/crew?id=SC-0045797"))).json();

test("the answer is the date the BOARD shows, not the Counter's raw projection", async () => {
  const body = await call(envFor());
  const r = body.resolved[0];
  assert.equal(r.sign_off, "2026-09-25", "Rita's recorded date wins: the Counter row has no imported_at");
  assert.equal(r.source, "rita");
  assert.equal(r.shown_from, "recorded in the console");
  assert.equal(r.sign_off_is_projected, false, "a recorded sign-off is not a projection");
});

test("both sides stay visible, so 'where does it come from' has a real answer", async () => {
  const r = (await call(envFor())).resolved[0];
  assert.equal(r.counter.projected_sign_off, "2026-09-18", "what the Contract Counter says");
  assert.equal(r.counter.actual_sign_off, null);
  assert.equal(r.recorded.sign_off, "2026-09-25", "what Rita recorded");
  assert.equal(r.recorded.updated_at, "2026-07-14T10:33:13.054Z", "and when");
});

test("with no edit the Counter answers, and its projected date is labelled a plan", async () => {
  const r = (await call(envFor({ edits: [] }))).resolved[0];
  assert.equal(r.sign_off, "2026-09-18");
  assert.equal(r.source, "counter");
  assert.equal(r.shown_from, "Contract Counter (TDG)");
  assert.equal(r.sign_off_is_projected, true, "act_off is null: this is a plan, not a recorded sign-off");
  assert.equal(r.recorded, null);
});

test("a recorded ACTUAL sign-off is never called a projection", async () => {
  const legs = [{ ...LEG, act_off: "2026-09-19" }];
  const r = (await call(envFor({ legs, edits: [] }))).resolved[0];
  assert.equal(r.sign_off, "2026-09-19", "actual beats projected");
  assert.equal(r.sign_off_is_projected, false);
});

test("the raw Counter rows are still returned unchanged — the card modal renders them", async () => {
  const body = await call(envFor());
  assert.equal(body.legs[0].proj_off, "2026-09-18");
  assert.equal(body.legs[0].seq, 1);
  assert.ok(body.crew && body.ready, "crew and ready still present");
});

test("Maria is told which field is authoritative, and is no longer pointed at ship_leg", () => {
  const M = readFileSync(new URL("../src/maria.js", import.meta.url), "utf8");
  assert.match(M, /`resolved` is AUTHORITATIVE and is what the Keyman board shows/);
  assert.match(M, /contract_edit — the sign-on \/ sign-off \/ ship RITA RECORDED/,
    "she had no idea Rita's recorded dates existed, so she quoted the Counter as though it were the board");
  assert.match(M, /never name ship_leg as the source of a current leg or a sign-off date/);
  assert.doesNotMatch(M, /upcoming_movements \(ship_leg\)/, "this line is what produced the wrong table name");
});
