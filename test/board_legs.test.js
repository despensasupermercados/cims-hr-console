import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeBoardLegs, fetchCurrentAssignments, fetchRecentSignoffs, boardLegsFromDb } from "../src/ship_leg_source.js";

// The board's current set = ship_leg is_current=1 rows PLUS crew aboard per the relief board
// (in-force `assignment` rows). Verified on prod 2026-09-04: 13 crew were aboard per Rita's
// board with no current ship_leg row at all, so they derived the wrong status, landed on the
// wrong ship / in the pool, and were missing from /api/billing/month. These tests pin the
// merge rules (pure) and the SQL wiring (arity + filters), the two halves a live DB would only
// reveal after serving a wrong number.

const leg = (o = {}) => ({
  ship: "Harmony", name: "A B", sc: "SC-1", ours: true, on: "2026-02-01", off: "2026-09-01",
  brand: "Royal", is_current: true, crew_id: "c1", ...o,
});
const asg = (o = {}) => ({
  id: "as_1", sign_on: "2026-08-18", planned_sign_off: "2027-02-18", on_port_seed: null,
  off_port_seed: null, ship: "Harmony", brand: "Royal Caribbean", crew_id: "c9", sc: "SC-9",
  crew_name: "Lazo X", ...o,
});
const SHAPE = ["ship", "name", "sc", "ours", "on", "off", "brand", "is_current"];

test("an in-force assignment becomes a CURRENT leg in the SHIP_HISTORY shape", () => {
  const out = mergeBoardLegs([leg()], [asg()]);
  assert.equal(out.length, 2);
  const a = out[1];
  for (const k of SHAPE) assert.ok(k in a, "missing key " + k);
  assert.equal(a.is_current, true);
  assert.equal(a.ours, true);
  assert.equal(a.sc, "SC-9");
  assert.equal(a.on, "2026-08-18");
  assert.equal(a.off, "2027-02-18");
  assert.equal(a.brand, "Royal");     // full vessel brand mapped to the board's short form
  assert.equal(a.source, "assignment");
});

test("ship_leg rows are returned first and untouched", () => {
  const rows = [leg(), leg({ sc: "SC-2", crew_id: "c2", ship: "Quest", brand: "Azamara" })];
  const out = mergeBoardLegs(rows, [asg()]);
  assert.deepEqual(out.slice(0, 2), rows);
});

const TODAY = "2026-08-25"; // inside leg()'s span (2026-02-01 .. 2026-09-01)

test("a crew with a current ship_leg row spanning today is never duplicated — by sc", () => {
  const out = mergeBoardLegs([leg({ sc: "SC-9", crew_id: "cX" })], [asg({ sc: "SC-9", crew_id: "c9" })], TODAY);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, undefined);
});

test("a crew with a current ship_leg row spanning today is never duplicated — by crew_id", () => {
  const out = mergeBoardLegs([leg({ sc: "SC-OLD", crew_id: "c9" })], [asg({ sc: "SC-9", crew_id: "c9" })], TODAY);
  assert.equal(out.length, 1);
});

// Nothing ever flips is_current back to 0. A snapshot crew whose leg ENDED must not be "taken"
// forever, or their next relief-board contract never reaches status, the board, or billing.
test("a current ship_leg row whose off_date has passed does NOT block the crew's next assignment", () => {
  const out = mergeBoardLegs([leg({ sc: "SC-9", crew_id: "c9", off: "2026-08-10" })], [asg({ ship: "Jewel", sign_on: "2026-09-01" })], "2026-09-05");
  assert.equal(out.length, 2);
  assert.equal(out[1].ship, "Jewel");
  assert.equal(out[1].source, "assignment");
});

test("a current ship_leg row with a TBA (null) sign-off still blocks — the crew is still aboard", () => {
  const out = mergeBoardLegs([leg({ sc: "SC-9", crew_id: "c9", off: null })], [asg()], "2026-09-05");
  assert.equal(out.length, 1);
});

test("a NON-current ship_leg row (history) does not block the assignment", () => {
  const out = mergeBoardLegs([leg({ sc: "SC-9", crew_id: "c9", is_current: false })], [asg()]);
  assert.equal(out.length, 2);
  assert.equal(out[1].is_current, true);
});

test("one leg per crew: the latest sign_on wins when two in-force assignments exist", () => {
  const out = mergeBoardLegs([], [
    asg({ id: "a", sign_on: "2026-07-01", ship: "Jewel" }),
    asg({ id: "b", sign_on: "2026-08-20", ship: "Harmony" }),
    asg({ id: "c", sign_on: "2026-05-01", ship: "Vision" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].ship, "Harmony");
});

test("brand falls back to the board's own brand for that ship, else null — the row is kept", () => {
  const known = mergeBoardLegs([leg({ ship: "Quest", brand: "Azamara" })], [asg({ ship: "Quest", brand: null })]);
  assert.equal(known[1].brand, "Azamara");
  const unknown = mergeBoardLegs([leg()], [asg({ ship: "Getaway", brand: null })]);
  assert.equal(unknown.length, 2, "an unknown vessel never drops the crew");
  assert.equal(unknown[1].brand, null);
});

test("honest nulls: embark/disembark appear only when a port seed exists (no homeport guess)", () => {
  const bare = mergeBoardLegs([], [asg()])[0];
  assert.equal("embark" in bare, false);
  assert.equal("disembark" in bare, false);
  const seeded = mergeBoardLegs([], [asg({ on_port_seed: "MIAMI", off_port_seed: "SAN JUAN" })])[0];
  assert.equal(seeded.embark, "MIAMI");
  assert.equal(seeded.disembark, "SAN JUAN");
});

test("TBA sign-off: a null planned_sign_off stays null (readers treat null off as still aboard)", () => {
  assert.equal(mergeBoardLegs([], [asg({ planned_sign_off: null })])[0].off, null);
});

test("an assignment with no vessel or no crew id is skipped, never invented", () => {
  assert.equal(mergeBoardLegs([], [asg({ ship: "" })]).length, 0);
  assert.equal(mergeBoardLegs([], [asg({ ship: null })]).length, 0);
  assert.equal(mergeBoardLegs([], [asg({ sc: null })]).length, 0);
});

/* ---- SQL wiring ---- */

function stubEnv({ legs = [], assignments = [], ended = [] } = {}) {
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        const rec = { sql: sql.replace(/\s+/g, " ").trim(), args: null, t: null };
        return {
          bind(...args) { rec.args = args; return this; },
          async all() {
            rec.t = calls.length; calls.push(rec);
            if (/actual_sign_off IS NOT NULL/i.test(rec.sql)) return { results: ended };
            if (/FROM assignment/i.test(rec.sql)) return { results: assignments };
            if (/FROM ship_leg/i.test(rec.sql)) return { results: legs };
            return { results: [] };
          },
        };
      },
    },
  };
  return { env, calls };
}

test("fetchCurrentAssignments: only ?1 placeholders, exactly one bound arg, in-force filters present", async () => {
  const { env, calls } = stubEnv();
  await fetchCurrentAssignments(env, "2026-09-04");
  assert.equal(calls.length, 1);
  const c = calls[0];
  const ph = c.sql.match(/\?\d*/g) || [];
  assert.ok(ph.length >= 2, "expected the today placeholder in both the outer and inner WHERE");
  assert.ok(ph.every((p) => p === "?1"), "every placeholder must be ?1: " + ph.join(","));
  assert.deepEqual(c.args, ["2026-09-04"]);
  assert.match(c.sql, /a\.actual_sign_off IS NULL/);
  assert.match(c.sql, /a\.sign_on <= \?1/);
  assert.match(c.sql, /ORDER BY a2\.sign_on DESC LIMIT 1/, "one assignment per crew");
  assert.doesNotMatch(c.sql, /FROM ship_leg/i, "exclusion by current ship_leg is done in JS (mergeBoardLegs), not SQL");
});

test("fetchRecentSignoffs: trailing window [today-60, today], both bound, actual_sign_off filter", async () => {
  const { env, calls } = stubEnv();
  await fetchRecentSignoffs(env, "2026-09-05");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["2026-07-07", "2026-09-05"]);
  assert.match(calls[0].sql, /a\.actual_sign_off IS NOT NULL/);
});

// A contract that ENDED on the relief board must still be in the schedule as history: the scoring
// queue's "signed off in the last N days" and the Score Card's default span depend on it.
test("an ended assignment becomes a NON-current leg with off = actual sign-off; a snapshot row for the same sign-on wins", () => {
  const ended = { id: "e1", sign_on: "2026-03-01", actual_sign_off: "2026-09-01", ship: "Symphony", brand: "Royal Caribbean", crew_id: "c7", sc: "SC-7", crew_name: "Q R" };
  const out = mergeBoardLegs([], [], "2026-09-05", [ended]);
  assert.equal(out.length, 1);
  assert.equal(out[0].is_current, false);
  assert.equal(out[0].off, "2026-09-01");
  assert.equal(out[0].source, "assignment:ended");
  const dup = mergeBoardLegs([leg({ sc: "SC-7", crew_id: "c7", on: "2026-03-01", off: "2026-09-01" })], [], "2026-09-05", [ended]);
  assert.equal(dup.length, 1, "snapshot already records that sign-on");
  assert.equal(mergeBoardLegs([], [], "2026-09-05", [{ ...ended, actual_sign_off: null }]).length, 0, "no actual sign-off = not ended");
});

test("boardLegsFromDb fires all three reads concurrently and merges", async () => {
  const { env, calls } = stubEnv({
    legs: [{ brand: "Royal Caribbean", ship_short: "Harmony", sc: "SC-1", crew_id: "c1", on_date: "2026-02-01", off_date: "2026-09-01", ours: 1, is_current: 1, crew_name: "A B" }],
    assignments: [asg()],
  });
  const out = await boardLegsFromDb(env, "2026-09-04");
  assert.equal(calls.length, 3);
  assert.equal(out.length, 2);
  assert.equal(out[0].sc, "SC-1");
  assert.equal(out[0].brand, "Royal");
  assert.equal(out[0].crew_id, "c1", "legsFromShipLeg must expose crew_id so the merge can exclude by id");
  assert.equal(out[1].sc, "SC-9");
  assert.equal(out[1].is_current, true);
});
