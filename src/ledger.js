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
    nextRung: ladderValue(count + 1),
  };
}

// Printer-specialist rank TIER by CUMULATIVE completed contracts (seniority). This is the HR/pay
// grade and is deliberately monotonic — it must never drop on a bonus reset, so it is driven by the
// cumulative completed-contract count (seeded baseline + full contracts since), NOT by the
// consecutive bonus `count`. It is display/HR only and is NEVER a payout input (see src/bonus.js).
//
// DG3 pay ladder (Miguel, 2026-07; matches the validated Contract Counter sheet exactly):
//   0 completed  -> Junior Printer Specialist  ($1,600/mo)   [on their 1st contract]
//   1-6 completed-> Printer Specialist          ($1,800/mo)   [2nd through 7th sign-on]
//   7+ completed -> Senior Printer Specialist   ($1,900/mo)
// Note: promotion to Senior lands once the 7th contract is COMPLETED (count reaches 7). A crew member
// who has completed 6 and is currently sailing their 7th still reads PS until that 7th closes — this
// reproduces the source sheet (Robles/Malkevich, 6 done = PS; Espenilla, 7 done = Sr). If the business
// rule is "Senior the moment they SIGN ON to the 7th", flip the >=7 threshold to >=6 (one line).
export function psRank(contracts, long) {
  const n = contracts || 0;
  if (n >= 7) return long ? "Senior Printer Specialist" : "Sr PS";
  if (n >= 1) return long ? "Printer Specialist" : "PS";
  return long ? "Junior Printer Specialist" : "Jr PS";
}

// Monthly base salary (USD) for the tier the cumulative completed-contract count implies. Same
// thresholds as psRank so the grade and the pay never disagree. Display/HR only — not a payout input.
export function psSalary(contracts) {
  const n = contracts || 0;
  if (n >= 7) return 1900;
  if (n >= 1) return 1800;
  return 1600;
}

// The number that drives the tier/pay grade: cumulative completed contracts = seeded historical
// baseline + full contracts completed since (from the schedule legs). Monotonic; never resets.
// (The consecutive bonus count lives separately in ledgerCount and DOES reset on gates.)
export function tierContracts(baseline, fullSinceBaseline) {
  return (baseline || 0) + (fullSinceBaseline || 0);
}
