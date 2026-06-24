import { test } from "node:test";
import assert from "node:assert/strict";
import { groupContracts, contractSpan, contractCounts, fullContracts, isAzamaraShip } from "../src/contracts.js";

test("isAzamaraShip recognises the four Azamara ships", () => {
  ["Journey", "Quest", "Pursuit", "Onward"].forEach(s => assert.equal(isAzamaraShip(s), true));
  ["Allure", "Edge", "Vision"].forEach(s => assert.equal(isAzamaraShip(s), false));
});

test("legs <=3 weeks apart merge into one contract; bigger gap splits", () => {
  const legs = [
    { on: "2024-01-01", end: "2024-04-01", ship: "Allure" },   // leg A
    { on: "2024-04-15", end: "2024-07-01", ship: "Oasis" },    // 14-day gap -> same contract (transfer)
    { on: "2024-10-01", end: "2024-12-20", ship: "Oasis" },    // ~3-month gap -> new contract (holiday)
  ];
  const g = groupContracts(legs);
  assert.equal(g.length, 2);
  assert.equal(g[0].length, 2);
  assert.equal(g[1].length, 1);
});

test("a transfer contract's duration spans first sign-on to last sign-off", () => {
  const g = groupContracts([
    { on: "2024-01-01", end: "2024-03-20", ship: "Allure" },
    { on: "2024-04-01", end: "2024-07-10", ship: "Oasis" },   // 12-day gap
  ]);
  const s = contractSpan(g[0]);
  // Jan 1 -> Jul 10 = ~6.3 months -> full for Royal (>=6)
  assert.equal(s.full, true);
  assert.ok(s.months >= 6);
});

test("Azamara full threshold is 5 months, Royal is 6", () => {
  const az = contractSpan(groupContracts([{ on: "2024-01-01", end: "2024-06-05", ship: "Onward" }])[0]); // ~5.1mo
  assert.equal(az.az, true);
  assert.equal(az.full, true);
  const rcl = contractSpan(groupContracts([{ on: "2024-01-01", end: "2024-06-05", ship: "Vision" }])[0]); // ~5.1mo
  assert.equal(rcl.az, false);
  assert.equal(rcl.full, false); // under 6 months
});

test("contractCounts: short segments don't count as full contracts", () => {
  // three short same-ship stints, each <2 months, each separated by long holidays
  const legs = [
    { on: "2022-01-01", end: "2022-02-20", ship: "Vision" },
    { on: "2022-07-01", end: "2022-09-10", ship: "Vision" },
    { on: "2023-02-01", end: "2023-04-10", ship: "Vision" },
  ];
  const c = contractCounts(legs);
  assert.equal(c.contracts, 3);
  assert.equal(c.full, 0);
  assert.equal(fullContracts(legs), 0);
});

test("missing dates are ignored, empty input is safe", () => {
  assert.deepEqual(contractCounts([]), { contracts: 0, full: 0 });
  assert.deepEqual(contractCounts([{ on: "2024-01-01", end: null, ship: "X" }]), { contracts: 0, full: 0 });
});
