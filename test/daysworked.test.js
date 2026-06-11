import { test } from "node:test";
import assert from "node:assert/strict";
import { contractDays, crewSeaDays, seaDaysTotals } from "../src/daysworked.js";

test("contractDays counts whole days, never negative, junk -> 0", () => {
  assert.equal(contractDays("2024-01-01", "2024-01-31"), 30);
  assert.equal(contractDays("2024-01-01", "2024-01-01"), 0);
  assert.equal(contractDays("2024-02-01", "2024-01-01"), 0); // reversed
  assert.equal(contractDays("", "2024-01-31"), 0);
  assert.equal(contractDays("bad", "data"), 0);
});

test("crewSeaDays aggregates per crew with contract count and last sign-off", () => {
  const rows = [
    { sc: "SC-1", on: "2023-01-01", off: "2023-07-01" }, // 181
    { sc: "SC-1", on: "2024-01-01", off: "2024-03-01" }, // 60
    { sc: "SC-2", on: "2023-05-01", off: "2023-06-01" }, // 31
  ];
  const m = crewSeaDays(rows);
  assert.equal(m["SC-1"].contracts, 2);
  assert.equal(m["SC-1"].days, 241);
  assert.equal(m["SC-1"].lastOff, "2024-03-01");
  assert.equal(m["SC-2"].days, 31);
});

test("seaDaysTotals sums across all rows and counts distinct crew", () => {
  const rows = [
    { sc: "SC-1", on: "2023-01-01", off: "2023-07-01" },
    { sc: "SC-1", on: "2024-01-01", off: "2024-03-01" },
    { sc: "SC-2", on: "2023-05-01", off: "2023-06-01" },
  ];
  const t = seaDaysTotals(rows);
  assert.equal(t.crew, 2);
  assert.equal(t.contracts, 3);
  assert.equal(t.days, 272);
});

test("empty input is safe", () => {
  assert.deepEqual(seaDaysTotals([]), { crew: 0, contracts: 0, days: 0 });
  assert.deepEqual(crewSeaDays([]), {});
});
