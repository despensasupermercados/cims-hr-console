// THE 16 NOV 2026 BUG HUNT — the three Score Card findings (MONEY, §1: a draft for Miguel, never merged by the agent).
// Each was reproduced on the old code first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { legsFromRegistry, foldCounterHistory, mergeBoardLegs } from "../src/ship_leg_source.js";
import { commitBlock, defaultScoreLeg } from "../src/scorequeue.js";
import { inventoryCount } from "../src/bonus.js";
import { missOwnerByBoard } from "../src/score_auto.js";
import { buildCrewIndex } from "../src/travel_match.js";

const row = (sc, first, last, status, vessel, on, off, run) => ({ sc, status, raw_status: status, vessel, embarked_at: on, debarked_at: off, run_at: run, crew_id: "crew_" + sc, first_name: first, last_name: last, crew_name: first + " " + last });

// ---- 1. an ended Counter contract with no sign-off date ------------------------------------------------------------------------
// 11 keyman_contract3 rows carry no projected sign-off (§11e). Served as history, such a leg was read as running to "9999":
// after the crew's first outcome every later contract was refused as already_scored.
test("an ENDED contract with no sign-off date does not block every later commit; a RUNNING one with no date still does", () => {
  const vessels = [{ name: "Infinity", brand: "Celebrity" }, { name: "Apex", brand: "Celebrity" }, { name: "Edge", brand: "Celebrity" }];
  const counter = [{ ship: "Infinity", name: "Quin Example", sc: "SC-Q", ours: true, on: "2025-01-30", off: null, brand: "Celebrity", is_current: true, crew_id: "crew_SC-Q", source: "counter" }];
  const schedule = (rows, today) => { const reg = legsFromRegistry({ rows, edits: [], counter: [], open: [], vessels, today, turnarounds: {}, visits: [], trainers: [] }); return mergeBoardLegs(reg.concat(foldCounterHistory(counter, reg)), [], today, []); };
  const outcomes = [{ span_start: "2026-04-01", span_end: "2026-11-05" }];           // his Apex contract, scored
  const legs = schedule([row("SC-Q", "Quin", "Example", "On Vacation", "Edge", "2027-01-10", "2027-08-08", "2027-08-13")], "2027-08-16");
  assert.ok(legs.some((l) => l.source === "counter" && !l.off && !l.is_current), "the date-less Counter leg is served as history");
  assert.equal(commitBlock(legs, "SC-Q", "2027-08-16", outcomes, "2027-01-10", "2027-08-08"), null, "the Edge contract can be committed");
  assert.equal(defaultScoreLeg(legs, "SC-Q", "2027-08-16", { outcomes }).leg.on, "2027-01-10", "and the card opens on it");
  // a contract still RUNNING with no date is open-ended, as before
  const running = [{ sc: "SC-R", ours: true, ship: "Apex", on: "2026-04-01", off: null, is_current: true, source: "registry" }];
  assert.equal(commitBlock(running, "SC-R", "2026-11-16", [], "2026-04-01", "2026-11-10").error, "still_aboard");
  // one outcome per contract still holds for a dated one
  assert.equal(commitBlock(legs, "SC-Q", "2027-08-16", outcomes.concat([{ span_start: "2027-01-10", span_end: "2027-08-08" }]), "2027-01-11", "2027-08-08").error, "already_scored");
});

// ---- 2. HON's verdict on the inventory count --------------------------------------------------------------------------------------
test("the inventory count pays the handover factor only on HON's word 'clean'; a word the console does not know holds it at 0", () => {
  assert.deepEqual(inventoryCount({ state: "judged", verdict: "clean" }), { zero: false, text: "Inventory count: no gaps" });
  assert.equal(inventoryCount({ state: "judged", verdict: "wrong", gaps: 2 }).zero, true);
  for (const verdict of ["partial", "disputed", "Wrong", "", null]) {
    const r = inventoryCount({ state: "judged", verdict });
    assert.equal(r.zero, true, JSON.stringify(verdict)); assert.match(r.text, /is not one the console reads|is blank/);
  }
  // Ray's or Rolando's override still wins either way; nothing on file is still the handover alone
  assert.equal(inventoryCount({ state: "judged", verdict: "partial", override: "cleared", by: "Ray" }).zero, false);
  assert.equal(inventoryCount({ state: "judged", verdict: "clean", override: "upheld", by: "Ray" }).zero, true);
  assert.equal(inventoryCount(null).zero, false);
});

// ---- 3. whose miss, when the schedule no longer has the outgoing printer -------------------------------------------------------
test("a reliever in his first weeks is not charged an order naming a crew the schedule has no record of on that ship", () => {
  const roster = [{ agency_id: "SC-P", first_name: "Pedro", last_name: "Predecessor" }, { agency_id: "SC-A", first_name: "Andres", last_name: "Reliever" }];
  const ix = buildCrewIndex(roster);
  const vessels = [{ name: "Journey", brand: "Azamara" }, { name: "Quest", brand: "Azamara" }];
  const schedule = (rows, today) => mergeBoardLegs(legsFromRegistry({ rows, edits: [], counter: [], open: [], vessels, today, turnarounds: {}, visits: [], trainers: [] }), [], today, []);
  const miss = { order_ref: "PO-1022", ship: "Azamara Journey", submitted_at: "2026-10-22T14:00:00Z", grand_total: 1800, requester: "Pedro Predecessor" };
  // while the file still has Pedro's Journey contract: his (aboard 22 weeks, the reliever 2 days)
  const nov = schedule([row("SC-P", "Pedro", "Predecessor", "On Vacation", "Journey", "2026-05-20", "2026-10-27", "2026-11-13"), row("SC-A", "Andres", "Reliever", "On board", "Journey", "2026-10-20", null, "2026-11-13")], "2026-11-16");
  assert.equal(missOwnerByBoard(miss, "SC-P", ix, nov).mine, true);
  assert.equal(missOwnerByBoard(miss, "SC-A", ix, nov).mine, false);
  // March: Pedro re-embarked Quest, so the file no longer carries his Journey contract. Andres is "the only crew aboard".
  const mar = schedule([row("SC-P", "Pedro", "Predecessor", "On board", "Quest", "2027-01-10", null, "2027-03-22"), row("SC-A", "Andres", "Reliever", "On Vacation", "Journey", "2026-10-20", "2027-03-20", "2027-03-22")], "2027-03-25");
  const a = missOwnerByBoard(miss, "SC-A", ix, mar);
  assert.equal(a.mine, false, "not charged on a schedule that forgot the man the order names");
  assert.equal(a.owner, null); assert.match(a.unplaced[0], /not on record for this ship/);
  // Miguel's rule stands wherever the schedule knows the other man on the hull (score_auto.test.js pins both cases), and
  // for a crew aboard 4+ weeks whoever the order names
  const late = { ...miss, submitted_at: "2026-12-15T10:00:00Z" };
  assert.equal(missOwnerByBoard(late, "SC-A", ix, mar).mine, true, "8 weeks aboard: his, whoever typed it");
  assert.equal(missOwnerByBoard({ ...miss, requester: "" }, "SC-A", ix, mar).mine, true, "no name on the order: the only crew aboard");
});
