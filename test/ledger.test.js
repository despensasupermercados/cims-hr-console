import { test } from "node:test";
import assert from "node:assert/strict";
import { ledgerCount, contractLedgerRow } from "../src/ledger.js";
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

test("contractLedgerRow: rank threshold + baseline_set + nextRung", () => {
  const r0 = contractLedgerRow(null, null, null); // unset baseline, no outcome
  assert.deepEqual({ count: r0.count, set: r0.baseline_set, rank: r0.rank, next: r0.nextRung },
    { count: 0, set: false, rank: "Jr PS", next: ladderValue(1) });
  const r1 = contractLedgerRow(0, null, null); // baseline 0 -> set, still Jr PS
  assert.deepEqual({ count: r1.count, set: r1.baseline_set, rank: r1.rank }, { count: 0, set: true, rank: "Jr PS" });
  const r2 = contractLedgerRow(3, null, null); // baseline 3 -> PS
  assert.deepEqual({ count: r2.count, rank: r2.rank, next: r2.nextRung }, { count: 3, rank: "PS", next: ladderValue(4) });
  const r3 = contractLedgerRow(3, null, { count_after: 6 }); // outcome overrides baseline
  assert.deepEqual({ count: r3.count, rank: r3.rank, next: r3.nextRung }, { count: 6, rank: "PS", next: ladderValue(7) });
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
      rank: count >= 1 ? "PS" : "Jr PS",
      nextRung: ladderValue(count + 1),
    };
    // ---- new helper ----
    const got = contractLedgerRow(b, ov, lo);
    assert.deepEqual(got, expected, `mismatch for base=${b} ov=${ov} lo=${JSON.stringify(lo)}`);
  }
});
