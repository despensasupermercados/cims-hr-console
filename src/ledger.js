// Bonus-ledger math — pure, testable. The READ-ONLY money view (fleet ledger / Score Card display).
// NO payout math lives here (that stays in the locked src/bonus.js); this only assembles the
// consecutive-contract count, rank label, and next rung the ledger shows. Baseline is resolved
// through the SAME policy helper as the commit/PDF path so the displayed number can never drift
// from the number the payout uses (this replaces an inline override-wins copy in apiContracts).

import { ladderValue } from "./bonus.js";
import { resolveBaseline } from "./policy.js";

// Effective consecutive count: the last committed outcome's count_after is authoritative
// (event-sourced); before any outcome it is the baseline, or 0 when no baseline is set.
export function ledgerCount(lastCountAfter, baseline) {
  if (lastCountAfter != null) return lastCountAfter;
  return baseline == null ? 0 : baseline;
}

// One crew's money-display row. baseRow = crew.baseline_count, ovRow = crew_override.baseline_count
// (undefined when there is no override), lastOutcome = most recent bonus_outcome row (or null).
export function contractLedgerRow(baseBaseline, overrideBaseline, lastOutcome) {
  const baseline = resolveBaseline(baseBaseline, overrideBaseline === undefined ? null : overrideBaseline);
  const count = ledgerCount(lastOutcome ? lastOutcome.count_after : null, baseline);
  return {
    baseline,
    baseline_set: baseline != null,
    count,
    rank: count >= 1 ? "PS" : "Jr PS",
    nextRung: ladderValue(count + 1),
  };
}
