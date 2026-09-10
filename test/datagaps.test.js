import { test } from "node:test";
import assert from "node:assert/strict";
import { crewDataGaps, hasGaps } from "../src/datagaps.js";

// Volume is not quality. The Data page counted rows and looked healthy while 20 of ~57 active crew
// had no vessel on file and NINE of those were marked "On board" — at sea on a ship the console
// could not name. These pin the counting rules.

const ROWS = [
  { agency_id: "SC-1", status: "On board",    vessel: "Reflection", email: "a@x.com", ship_crew_id: "123456" },
  { agency_id: "SC-2", status: "On board",    vessel: "",           email: "b@x.com", ship_crew_id: "123457" },
  { agency_id: "SC-3", status: "On board",    vessel: null,         email: null,      ship_crew_id: null },
  { agency_id: "SC-4", status: "On Vacation", vessel: "   ",        email: "d@x.com", ship_crew_id: "123458" },
  { agency_id: "SC-5", status: "Earmarked",   vessel: null,         email: "e@x.com", ship_crew_id: "123459" },
  { agency_id: "SC-6", status: "Retired",     vessel: null,         email: null,      ship_crew_id: null },
  { agency_id: "SC-7", status: "Inactive",    vessel: null,         email: null,      ship_crew_id: null },
];

test("off-fleet crew are excluded — their blanks are not action items", () => {
  const g = crewDataGaps(ROWS);
  assert.equal(g.active, 5, "Retired and Inactive must not be counted as active");
  assert.equal(g.on_board, 3);
  assert.ok(!g.active_without_vessel.ids.includes("SC-6"));
  assert.ok(!g.active_without_vessel.ids.includes("SC-7"));
});

test("the headline case: On board with no vessel", () => {
  const g = crewDataGaps(ROWS);
  assert.equal(g.on_board_without_vessel.count, 2);
  assert.deepEqual(g.on_board_without_vessel.ids, ["SC-2", "SC-3"]);
});

test("whitespace is not a value", () => {
  // SC-4's vessel is "   ". A blank-looking field that passes a null check is exactly how a gap
  // hides from a count.
  const g = crewDataGaps(ROWS);
  assert.ok(g.active_without_vessel.ids.includes("SC-4"));
  assert.equal(g.active_without_vessel.count, 4); // SC-2, SC-3, SC-4, SC-5
});

test("email and ship_crew_id gaps are counted over ACTIVE crew", () => {
  const g = crewDataGaps(ROWS);
  assert.deepEqual(g.active_without_email.ids, ["SC-3"]);
  assert.deepEqual(g.active_without_ship_crew_id.ids, ["SC-3"]);
});

test("ids are capped so the page cannot be flooded, but the count stays true", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ agency_id: "SC-" + i, status: "On board", vessel: null }));
  const g = crewDataGaps(many, { cap: 5 });
  assert.equal(g.on_board_without_vessel.count, 40, "the count must not be capped");
  assert.equal(g.on_board_without_vessel.ids.length, 5, "only the listed ids are capped");
});

test("hasGaps stays quiet on a clean roster", () => {
  const clean = [{ agency_id: "SC-9", status: "On board", vessel: "Utopia", email: "z@x.com", ship_crew_id: "999999" }];
  assert.equal(hasGaps(crewDataGaps(clean)), false);
  assert.equal(hasGaps(crewDataGaps(ROWS)), true);
  assert.equal(hasGaps(null), false);
});

test("empty / rubbish input does not throw", () => {
  for (const bad of [null, undefined, [], [null, undefined]]) {
    assert.doesNotThrow(() => crewDataGaps(bad));
  }
  assert.equal(crewDataGaps([]).active, 0);
});
