import { test } from "node:test";
import assert from "node:assert/strict";
import { dryDockStatus, fleetDryDock, inDockNow, upcomingDocks } from "../src/fleet.js";

test("dryDockStatus: upcoming / in_dock / completed", () => {
  assert.equal(dryDockStatus("2026-11-02", "2026-11-17", "2026-06-11"), "upcoming");
  assert.equal(dryDockStatus("2026-06-01", "2026-06-20", "2026-06-11"), "in_dock");
  assert.equal(dryDockStatus("2026-03-09", "2026-03-15", "2026-06-11"), "completed");
});

test("dryDockStatus: open-ended window counts as in_dock once started", () => {
  assert.equal(dryDockStatus("2027-04-15", null, "2027-05-01"), "in_dock");
  assert.equal(dryDockStatus("2027-04-15", null, "2027-04-01"), "upcoming");
});

const SCHED = [
  { ship: "Liberty", start: "2026-04-20", end: "2026-05-25" },
  { ship: "Beyond", start: "2026-11-02", end: "2026-11-17" },
  { ship: "Edge", start: "2026-06-01", end: "2026-06-20" },
];

test("inDockNow returns only ships currently in dock", () => {
  assert.deepEqual(inDockNow(SCHED, "2026-06-11"), ["Edge"]);
  assert.deepEqual(inDockNow(SCHED, "2026-08-01"), []);
});

test("upcomingDocks respects the lead-time window", () => {
  const up = upcomingDocks(SCHED, "2026-06-11", 120); // Beyond is ~144 days out -> excluded
  assert.deepEqual(up.map(d => d.ship), []);
  const up2 = upcomingDocks(SCHED, "2026-08-01", 120); // Beyond ~93 days out -> included
  assert.deepEqual(up2.map(d => d.ship), ["Beyond"]);
});

test("fleetDryDock annotates every row with a status", () => {
  const r = fleetDryDock(SCHED, "2026-06-11");
  assert.equal(r.length, 3);
  assert.ok(r.every(d => ["upcoming", "in_dock", "completed"].includes(d.status)));
});
