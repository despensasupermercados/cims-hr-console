import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileShipFlags, boardShipsFromLegs, AUTO_CLOSED } from "../src/crew_flags.js";

// prod 2026-09-05: 411 open ship flags for 58 distinct crew+ship pairs, none ever closed.
const shipOf = (v) => ({ "celebrity apex": "Apex", "apex": "Apex", "harmony of the seas": "Harmony", "harmony": "Harmony", "mv azamara quest": "Quest", "quest": "Quest" }[String(v || "").toLowerCase()] || null);
const flag = (agency_id, new_value, resolved = 0) => ({ agency_id, field: "vessel_observed", old_value: null, new_value, resolved });
const board = (m) => (sc) => m[sc] || null;

test("an open flag the board already satisfies closes; the same flag arriving again is not inserted", () => {
  const r = reconcileShipFlags({ open: [{ id: "f1", agency_id: "SC-1", new_value: "Celebrity Apex" }], incoming: [flag("SC-1", "Celebrity Apex")], boardShip: board({ "SC-1": "Apex" }), shipOf });
  assert.deepEqual(r.close, [{ id: "f1", why: "board_matches" }]);
  assert.deepEqual(r.insert, []);
  assert.equal(r.counts.closed_board_matches, 1);
  assert.equal(r.counts.skipped_board_matches, 1);
});

test("a duplicate of an open flag (same crew, same ship, board disagrees) is NOT inserted again", () => {
  const r = reconcileShipFlags({ open: [{ id: "f1", agency_id: "SC-1", new_value: "MV AZAMARA QUEST" }], incoming: [flag("SC-1", "Quest")], boardShip: board({ "SC-1": "Harmony" }), shipOf });
  assert.deepEqual(r.close, []);
  assert.deepEqual(r.insert, []);
});

test("a newer file naming a DIFFERENT ship supersedes the older open flag for that crew", () => {
  const r = reconcileShipFlags({ open: [{ id: "f1", agency_id: "SC-1", new_value: "Quest" }], incoming: [flag("SC-1", "Apex")], boardShip: board({ "SC-1": "Harmony" }), shipOf });
  assert.deepEqual(r.close, [{ id: "f1", why: "superseded" }]);
  assert.equal(r.insert.length, 1);
  assert.equal(r.insert[0].new_value, "Apex");
});

test("a flag Rita dismissed keeps its audit row and closes the older open copies", () => {
  const r = reconcileShipFlags({ open: [{ id: "f1", agency_id: "SC-1", new_value: "Apex" }], incoming: [flag("SC-1", "Celebrity Apex", 1)], boardShip: board({}), shipOf });
  assert.deepEqual(r.close, [{ id: "f1", why: "dismissed" }]);
  assert.equal(r.insert.length, 1, "the resolved=1 audit row is still written");
});

test("a genuinely new disagreement is inserted; non-ship conflicts pass through untouched", () => {
  const status = { agency_id: "SC-2", field: "status", old_value: "On board", new_value: "Inactive", resolved: 1 };
  const r = reconcileShipFlags({ open: [], incoming: [flag("SC-1", "Apex"), status], boardShip: board({ "SC-1": "Harmony" }), shipOf });
  assert.deepEqual(r.insert, [flag("SC-1", "Apex"), status]);
  assert.deepEqual(r.close, []);
});

test("boardShipsFromLegs: the leg spanning today decides; ended and future legs do not", () => {
  const legs = [
    { ours: true, sc: "SC-1", ship: "Harmony of the Seas", on: "2026-08-01", off: "2027-02-01" },
    { ours: true, sc: "SC-2", ship: "Quest", on: "2026-01-01", off: "2026-07-01" },   // ended
    { ours: true, sc: "SC-3", ship: "Apex", on: "2026-10-01", off: null },            // future
    { ours: true, sc: "SC-4", ship: "Apex", on: "2026-08-01", off: null },            // TBA off = aboard
    { ours: false, sc: "SC-5", ship: "Apex", on: "2026-08-01", off: null },
  ];
  const b = boardShipsFromLegs(legs, "2026-09-05", shipOf);
  assert.equal(b("SC-1"), "Harmony");
  assert.equal(b("SC-2"), null);
  assert.equal(b("SC-3"), null);
  assert.equal(b("SC-4"), "Apex");
  assert.equal(b("SC-5"), null);
  assert.equal(AUTO_CLOSED, 2, "0 open · 1 decided by a person · 2 closed automatically");
});
