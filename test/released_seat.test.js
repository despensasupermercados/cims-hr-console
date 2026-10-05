// A contract the console KNOWS completed goes underneath the ship — never a green seat, never a red one.
//
// History: Miguel, 5 Oct 2026, Navigator: Calayag's card read "On Vacation" and, on the same card, "OFF was
// 6d ago · No sign-off recorded. The seat stays held" — Rita HAD recorded the sign-off (25 Sep). The first
// fix (releasedSeatKeys) moved the seat off the registry column; the same evening Miguel set the rule this
// file now pins (Brain recddHTPgWjLy39AU): "TDG is the one true source ... If ... you know that that person
// ... completed his contract, you can put that person ... underneath as a contract completed."
// So the seat is TDG's file (board_truth.js), and board_truth.completedOff decides "known completed":
// a recorded sign-off on THAT hull, past, within COMPLETION_DAYS, nothing current on it since.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyRecordedSignoffs } from "../src/ship_leg_source.js";
import { completedOff, COMPLETION_DAYS } from "../src/board_truth.js";

const TODAY = "2026-10-05";
const leg = (o) => ({ ours: true, source: "counter", ...o });
const key = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

test("a leg closed by a recorded sign-off is a KNOWN completion; a projected sign-off that merely passed is not", () => {
  const legs = [
    leg({ sc: "SC-0045797", ship: "Navigator", on: "2026-02-02", off: "2026-09-18", is_current: true }), // Calayag
    leg({ sc: "SC-0038401", ship: "Freedom", on: "2026-02-10", off: "2026-08-22", is_current: true }),   // Osorio-shaped: overdue
  ];
  const hist = applyRecordedSignoffs(legs, { "SC-0045797|2026-02-02": "2026-09-25" }, TODAY);
  assert.equal(completedOff(hist, "SC-0045797", "navigator", TODAY, key), "2026-09-25", "Calayag: underneath Navigator");
  assert.equal(completedOff(hist, "SC-0038401", "freedom", TODAY, key), null, "overdue, not gone (§11): no recorded sign-off");
});

test("known completion is per HULL: a current leg on the hull keeps it open; another hull says nothing", () => {
  const hist = [
    leg({ sc: "SC-1", ship: "Harmony", on: "2025-01-01", off: "2025-07-01", is_current: false }),
    leg({ sc: "SC-1", ship: "Harmony", on: "2026-05-01", off: "2026-11-01", is_current: true }),
    leg({ sc: "SC-2", ship: "Jewel", on: "2025-11-15", off: "2026-08-28", is_current: false }),          // De Torres: recorded off Jewel
    { ours: true, source: "assignment", sc: "SC-2", ship: "Navigator", on: "2026-09-25", off: "2027-03-18", is_current: true },
  ];
  assert.equal(completedOff(hist, "SC-1", "harmony", TODAY, key), null, "a crew with a current leg on the hull is not completed there");
  assert.equal(completedOff(hist, "SC-2", "jewel", TODAY, key), "2026-08-28", "De Torres completed Jewel");
  assert.equal(completedOff(hist, "SC-2", "navigator", TODAY, key), null, "his Navigator card is running");
});

test("an old closure is history, not knowledge: past COMPLETION_DAYS a file saying On board that hull is a new contract", () => {
  assert.equal(COMPLETION_DAYS, 180);
  const hist = [leg({ sc: "SC-3", ship: "Anthem", on: "2025-01-01", off: "2025-07-01", is_current: false })];
  assert.equal(completedOff(hist, "SC-3", "anthem", TODAY, key), null);
  assert.equal(completedOff([leg({ sc: "SC-4", ship: "Icon", on: "2026-06-01", off: null, is_current: false })], "SC-4", "icon", TODAY, key), null, "a TBA sign-off is not a completion");
  assert.equal(completedOff([{ ours: false, sc: "SC-5", ship: "Edge", on: "2026-01-01", off: "2026-09-01", is_current: false }], "SC-5", "edge", TODAY, key), null, "not ours");
  assert.equal(completedOff(null, "SC-5", "edge", TODAY, key), null);
});

test("the board seats from the file and sends a known completion underneath (static)", () => {
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  const b = src.slice(src.indexOf("async function rotationSections("), src.indexOf("const histByShip = {}, histDisp = {};"));
  assert.match(b, /const off = completedOff\(HIST, sc, w\.key, today, keyOf\);\s*if \(off\) completedBy\[sc \+ "\|" \+ w\.key\] = off;/, "known completed: no seat, a row in issues, the leg underneath");
  assert.doesNotMatch(b, /releasedSeatKeys|heldSeatsBySc|manualStatus\(/, "the registry-column seat and its detours are gone");
  assert.doesNotMatch(b, /shipOf\(c\.vessel_observed\)/, "the seat is never the registry column");
  // The rule runs on HIST already in the wave (§12): no new D1 read for it.
  const at = b.indexOf("= await Promise.all([");
  assert.doesNotMatch(b.slice(at, b.indexOf("]);", at)), /completedOff|completedBy/);
  // Contract completed = legs whose sign-off has passed; a running leg is never history.
  const tail = src.slice(src.indexOf("const sections = Object.values(shipNames)"), src.indexOf("// WHAT IS WRONG (board_truth.boardIssues)"));
  assert.match(tail, /\.filter\(h => h\.on && h\.off && h\.off !== h\.on && h\.off < today\)/);
  assert.match(tail, /x\.signOff >= today\) continue;/);
});
