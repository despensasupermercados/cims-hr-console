// A card removed or changed on the Keyman board leaves a record of who and when (CLAUDE.md §8: every change is audited).
// Night watch, 10 Nov 2026. Joe Art Eresmas's Getaway card (as_3ae41623-48f3-4702-9596-9c87ec4b1237, contract
// ct_831beb00-48a1-496b-8271-da666db6bd38) was in D1 on 9 Nov 08:05 UTC and gone on 10 Nov 07:50 UTC, and
// activity_log holds nothing after 9 Nov 12:01 UTC: /api/relief/remove deleted the card and its contract shell and wrote
// no row, and /api/relief/save changed a card's dates the same way (the card's updated_at 23 Oct 15:14:24 has no row
// either). Creating the card was logged (projection_create); changing or removing it was not. Real SQLite (node:sqlite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRelief, removeReliefAssignment } from "../src/relief_api.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SCHEMA = `
CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT, first_name TEXT, last_name TEXT);
CREATE TABLE contract (id TEXT PRIMARY KEY, crew_id TEXT, contract_group_id TEXT, status TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE assignment (id TEXT PRIMARY KEY, contract_id TEXT, vessel_id TEXT, vessel_name TEXT, role TEXT, sign_on TEXT NOT NULL,
  planned_sign_off TEXT, actual_sign_off TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE vessel (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE bonus_outcome (id TEXT, contract_id TEXT);
CREATE TABLE feedback_request (id TEXT, contract_id TEXT);
CREATE TABLE feedback_response (id TEXT, contract_id TEXT);
CREATE TABLE ship_leg (id TEXT, source TEXT, is_current INTEGER);
CREATE TABLE relief_comment (id TEXT, assignment_id TEXT, vessel_key TEXT, body TEXT, created_at TEXT);
CREATE TABLE activity_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, detail TEXT, at TEXT);
INSERT INTO crew VALUES ('crew_joe','SC-0038131','Joe Art','Eresmas');
INSERT INTO vessel VALUES ('ves_getaway','Getaway'),('ves_solstice','Solstice');
INSERT INTO contract VALUES ('ct_831beb00-48a1-496b-8271-da666db6bd38','crew_joe','ct_831beb00-48a1-496b-8271-da666db6bd38','Active','2026-10-23T15:07:20.861Z','2026-10-23T15:07:20.861Z');
INSERT INTO assignment VALUES ('as_3ae41623-48f3-4702-9596-9c87ec4b1237','ct_831beb00-48a1-496b-8271-da666db6bd38','ves_getaway','Getaway','reliever',
  '2026-11-09','2027-05-23',NULL,'2026-10-23T15:07:20.861Z','2026-10-23T15:14:24.121Z');
`;
const CARD = "as_3ae41623-48f3-4702-9596-9c87ec4b1237";

function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { d.prepare(sql).run(...args); return { success: true }; },
  });
  // a D1 batch is one transaction: all or nothing
  const batch = async (st) => { d.exec("BEGIN"); try { const o = []; for (const x of st) o.push(await x.run()); d.exec("COMMIT"); return o; } catch (e) { d.exec("ROLLBACK"); throw e; } };
  return { DB: { prepare: (sql) => stmt(sql), batch } };
}
const db = () => { const d = new DatabaseSync(":memory:"); d.exec(SCHEMA); return d; };
const post = (body) => ({ method: "POST", json: async () => body });
const RITA = { email: "rita.berenyi@dg3.com", p: "session" };
const log = (d, action) => d.prepare("SELECT user_id, action, detail, at FROM activity_log WHERE action=?").all(action);

test("node:sqlite is available", () => { assert.ok(DatabaseSync); });

test("Remove on the board: the card goes, and the log says who removed which card", async () => {
  const d = db();
  const r = await handleRelief(post({ id: CARD }), new URL("https://cims.work/api/relief/remove"), envFor(d), RITA);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM assignment").get().n, 0, "the card is removed");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM contract").get().n, 0, "and its contract shell");
  const rows = log(d, "relief_remove");
  assert.equal(rows.length, 1, "one record of the removal");
  assert.equal(rows[0].user_id, "rita.berenyi@dg3.com", "who removed it");
  assert.match(rows[0].detail, /^SC-0038131 Getaway 2026-11-09 → 2027-05-23 \(as_3ae41623-48f3-4702-9596-9c87ec4b1237\)$/, "whose card, which ship, which dates");
  assert.match(rows[0].at, /^\d{4}-\d\d-\d\dT/, "when");
});

test("A removal refused (bonus history) writes nothing: no card lost, no record of a removal that did not happen", async () => {
  const d = db();
  d.exec("INSERT INTO bonus_outcome VALUES ('bo_1','ct_831beb00-48a1-496b-8271-da666db6bd38')");
  const r = await handleRelief(post({ id: CARD }), new URL("https://cims.work/api/relief/remove"), envFor(d), RITA);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "has_bonus_history");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM assignment").get().n, 1);
  assert.equal(log(d, "relief_remove").length, 0);
});

test("The record travels in the removal's own batch: if the removal fails, no record of it stands", async () => {
  const d = db();
  d.exec("DROP TABLE relief_comment"); // a delete in the batch fails
  await assert.rejects(() => removeReliefAssignment(envFor(d), CARD, { by: "rita.berenyi@dg3.com" }));
  assert.equal(d.prepare("SELECT COUNT(*) n FROM assignment").get().n, 1, "the card is still there");
  assert.equal(log(d, "relief_remove").length, 0, "and no record says it was removed");
});

test("The system's own removals (the import absorbing a card, an earmark dismissed) are unchanged: they log in their own words", async () => {
  const d = db();
  const r = await removeReliefAssignment(envFor(d), CARD);
  assert.equal(r.ok, true);
  assert.equal(log(d, "relief_remove").length, 0, "no second row for a caller that keeps its own record");
});

test("Save on a card (Rita's date correction): the log says who changed which card to what", async () => {
  const d = db();
  const r = await handleRelief(post({ id: CARD, sign_on: "2026-11-09", planned_sign_off: "2027-05-23" }), new URL("https://cims.work/api/relief/save"), envFor(d), RITA);
  assert.equal(r.status, 200);
  const rows = log(d, "relief_save");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, "rita.berenyi@dg3.com");
  assert.match(rows[0].detail, /^update as_3ae41623-48f3-4702-9596-9c87ec4b1237: sign_on=2026-11-09, planned_sign_off=2027-05-23$/);
});

test("A new card from the panel is logged with the crew and the ship", async () => {
  const d = db();
  const r = await handleRelief(post({ crew_id: "crew_joe", vessel_name: "Solstice", role: "reliever", sign_on: "2026-12-01" }), new URL("https://cims.work/api/relief/save"), envFor(d), RITA);
  assert.equal(r.status, 200);
  const j = await r.json();
  const rows = log(d, "relief_save");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detail.startsWith("insert " + j.id + ": "), true, rows[0].detail);
  assert.match(rows[0].detail, /crew_id=crew_joe/);
  assert.match(rows[0].detail, /vessel_name=Solstice/);
});

test("A save refused writes no record", async () => {
  const d = db();
  const r = await handleRelief(post({ id: CARD, sign_on: "" }), new URL("https://cims.work/api/relief/save"), envFor(d), RITA);
  assert.equal(r.status, 400);
  assert.equal(log(d, "relief_save").length, 0);
});

test("The board's relief routes are handed the session", async () => {
  const { readFileSync } = await import("node:fs");
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /const rr = await handleRelief\(request, url, env, session\); if \(rr\) return rr;/);
});
