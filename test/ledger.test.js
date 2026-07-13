import { test } from "node:test";
import assert from "node:assert/strict";
import { ledgerCount, contractLedgerRow, psRank, psSalary, tierContracts } from "../src/ledger.js";
import { ladderValue } from "../src/bonus.js";

test("ledgerCount: committed outcome's count_after is authoritative", () => {
  assert.equal(ledgerCount(5, 2), 5);   // outcome wins over baseline
  assert.equal(ledgerCount(0, 7), 0);   // a reset (count_after 0) wins, is not treated as 'unset'
});

test("ledgerCount: before any outcome, falls back to baseline, else 0", () => {
  assert.equal(ledgerCount(null, 3), 3);
  assert.equal(ledgerCount(null, 0), 0);   // baseline 0 is a set value
  assert.equal(ledgerCount(null, null), 0);
});

test("contractLedgerRow: baseline resolves override-wins (incl. 0)", () => {
  assert.equal(contractLedgerRow(5, 2, null).baseline, 2);    // override wins
  assert.equal(contractLedgerRow(5, 0, null).baseline, 0);    // override 0 wins
  assert.equal(contractLedgerRow(5, null, null).baseline, 5); // no override -> base
  assert.equal(contractLedgerRow(5, undefined, null).baseline, 5); // missing override row -> base
  assert.equal(contractLedgerRow(null, null, null).baseline, null); // nothing set
});

test("contractLedgerRow: baseline_set + count + nextRung (rank is no longer here)", () => {
  const r0 = contractLedgerRow(null, null, null);
  assert.deepEqual({ count: r0.count, set: r0.baseline_set, next: r0.nextRung }, { count: 0, set: false, next: ladderValue(1) });
  const r1 = contractLedgerRow(0, null, null);
  assert.deepEqual({ count: r1.count, set: r1.baseline_set }, { count: 0, set: true });
  const r2 = contractLedgerRow(3, null, null);
  assert.deepEqual({ count: r2.count, next: r2.nextRung }, { count: 3, next: ladderValue(4) });
  const r3 = contractLedgerRow(3, null, { count_after: 6 });
  assert.deepEqual({ count: r3.count, next: r3.nextRung }, { count: 6, next: ladderValue(7) });
  assert.equal(r0.rank, undefined); // rank moved out of the ledger row into psRank(contracts)
});

test("psRank: DG3 pay ladder by CUMULATIVE completed contracts — 0=Jr, 1-6=PS, 7+=Sr", () => {
  assert.equal(psRank(0), "Jr PS");
  assert.equal(psRank(1), "PS");           // 1 completed -> Printer Specialist (was Jr under old rule)
  assert.equal(psRank(5), "PS");
  assert.equal(psRank(6), "PS");           // 6 completed still PS (matches Robles/Malkevich on the sheet)
  assert.equal(psRank(7), "Sr PS");        // Senior lands at the 7th completed (matches Espenilla)
  assert.equal(psRank(12), "Sr PS");
  assert.equal(psRank(null), "Jr PS");
  assert.equal(psRank(0, true), "Junior Printer Specialist");
  assert.equal(psRank(3, true), "Printer Specialist");
  assert.equal(psRank(7, true), "Senior Printer Specialist");
});

test("psSalary: pay bands track the tier exactly — $1,600 / $1,800 / $1,900", () => {
  assert.equal(psSalary(0), 1600);
  assert.equal(psSalary(1), 1800);
  assert.equal(psSalary(6), 1800);
  assert.equal(psSalary(7), 1900);
  assert.equal(psSalary(20), 1900);
  assert.equal(psSalary(null), 1600);
  // grade and pay must never disagree
  for (const n of [0, 1, 5, 6, 7, 9]) {
    const jr = psRank(n) === "Jr PS", sr = psRank(n) === "Sr PS";
    assert.equal(psSalary(n), jr ? 1600 : sr ? 1900 : 1800);
  }
});

test("tierContracts: cumulative = seeded baseline + full legs since (monotonic, null-safe)", () => {
  assert.equal(tierContracts(6, 1), 7);        // veteran completes one more -> promotes to Senior
  assert.equal(tierContracts(null, 0), 0);     // baseline pending, no legs -> Junior
  assert.equal(tierContracts(3, null), 3);     // seeded only, no legs yet
  assert.equal(tierContracts(0, 0), 0);        // confirmed first-contract junior
  assert.equal(psRank(tierContracts(6, 1), true), "Senior Printer Specialist");
});

// Behavior-equivalence guard: the new helper must match the exact inline logic that previously
// lived in apiContracts, across a matrix of base/override/outcome combinations. If a refactor ever
// changes the displayed money number, this fails.
test("contractLedgerRow matches the original inline apiContracts math", () => {
  const bases = [null, 0, 2, 9];
  const overrides = [undefined, null, 0, 1, 5];
  const outcomes = [null, { count_after: 0 }, { count_after: 4 }, { count_after: 9 }];
  for (const b of bases) for (const ov of overrides) for (const lo of outcomes) {
    // ---- original inline logic (copied verbatim from pre-refactor apiContracts) ----
    const baseline = ov != null ? ov : b;          // ov here stands in for ov.baseline_count
    const count = lo ? lo.count_after : (baseline == null ? 0 : baseline);
    const expected = {
      baseline: baseline == null ? null : baseline,
      baseline_set: baseline != null,
      count,
      nextRung: ladderValue(count + 1),
    };
    // ---- new helper ----
    const got = contractLedgerRow(b, ov, lo);
    assert.deepEqual(got, expected, `mismatch for base=${b} ov=${ov} lo=${JSON.stringify(lo)}`);
  }
});
