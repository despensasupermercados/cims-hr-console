import { test } from "node:test";
import assert from "node:assert/strict";
import { contractDays, effectiveOff, periodDays, billingReport } from "../src/daysworked.js";

test("contractDays counts whole days, never negative, junk -> 0", () => {
  assert.equal(contractDays("2024-01-01", "2024-01-31"), 30);
  assert.equal(contractDays("2024-02-01", "2024-01-01"), 0);
  assert.equal(contractDays("", "2024-01-31"), 0);
});

test("effectiveOff prefers actual, then projected, then asOf", () => {
  assert.equal(effectiveOff({ act: "2024-05-01", proj: "2024-06-01" }, "2024-12-31"), "2024-05-01");
  assert.equal(effectiveOff({ act: null, proj: "2024-06-01" }, "2024-12-31"), "2024-06-01");
  assert.equal(effectiveOff({ act: null, proj: null }, "2024-12-31"), "2024-12-31");
});

test("periodDays clips to the billing window", () => {
  // contract Jan1–Jul1; window Mar1–May1 => Mar1..May1 = 61 days
  assert.equal(periodDays("2024-01-01", "2024-07-01", "2024-03-01", "2024-05-01"), 61);
  // fully inside window
  assert.equal(periodDays("2024-03-10", "2024-03-20", "2024-01-01", "2024-12-31"), 10);
  // no overlap
  assert.equal(periodDays("2024-01-01", "2024-02-01", "2024-06-01", "2024-07-01"), 0);
  // open-ended window (null bounds) = full contract
  assert.equal(periodDays("2024-01-01", "2024-01-31", null, null), 30);
});

const ROWS = [
  { sc: "SC-1", ship: "Wonder", on: "2024-01-01", proj: "2024-07-01", act: "2024-06-20" }, // actual 171
  { sc: "SC-1", ship: "Wonder", on: "2024-09-01", proj: "2025-03-01", act: null },          // projected
  { sc: "SC-2", ship: "Allure", on: "2024-02-01", proj: "2024-08-01", act: null },          // projected 182
];

test("billingReport aggregates per crew and per vessel with basis flags", () => {
  const r = billingReport(ROWS, { from: "2024-01-01", to: "2024-12-31", asOf: "2025-06-11" });
  assert.equal(r.totals.crew, 2);
  assert.equal(r.totals.vessels, 2);
  const sc1 = r.perCrew.find(x => x.sc === "SC-1");
  assert.equal(sc1.contracts, 2);
  assert.equal(sc1.basis, "mixed");          // one actual + one projected
  const wonder = r.perVessel.find(x => x.ship === "Wonder");
  assert.equal(wonder.crew, 1);
  assert.equal(wonder.contracts, 2);
});

test("billingReport uses actual sign-off when present", () => {
  const r = billingReport([ROWS[0]], { from: null, to: null, asOf: "2025-06-11" });
  // actual 2024-06-20 - 2024-01-01 = 171 days (not the projected 182)
  assert.equal(r.totals.days, 171);
  assert.equal(r.perCrew[0].basis, "actual");
});

test("still-onboard contract bills to asOf when no sign-off", () => {
  const r = billingReport([{ sc: "SC-9", ship: "Edge", on: "2025-01-01", proj: null, act: null }],
    { from: null, to: "2025-04-01", asOf: "2025-04-01" });
  assert.equal(r.totals.days, 90); // Jan1 -> Apr1
});

test("empty input is safe", () => {
  const r = billingReport([], {});
  assert.equal(r.totals.days, 0);
  assert.deepEqual(r.perCrew, []);
});
