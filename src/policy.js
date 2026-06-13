// Pure policy helpers — baseline resolution, money authority, feedback single-use.
// Imported by the Worker; pinned by the test suite. NO bonus MATH lives here
// (that stays in the locked src/bonus.js); this is only "which value / who / when".

// Effective bonus baseline. A manual override (crew_override.baseline_count) ALWAYS
// wins over the imported base crew row, so the payout math, the Score Card, and the
// PDF statement use the SAME number the crew card and ledger already display.
// NOTE: 0 is a valid baseline (Jr PS, count 0) and must be treated as "set", not unset.
export function resolveBaseline(base, override) {
  if (override !== undefined && override !== null) return override;
  return base === undefined ? null : base;
}

// Money authority: only these users may commit a bonus outcome or set a bonus baseline.
// All console users are role 'full' today; this is the first real money-scope gate.
// Lower-cased; auth is case-insensitive.
export const MONEY_USERS = ["miguel.sanmartin@dg3.com", "rita.berenyi@dg3.com"];
export function isMoneyUser(email) {
  if (!email) return false;
  return MONEY_USERS.includes(String(email).trim().toLowerCase());
}

// Feedback links are single-use: once a window is answered (or marked N/A) it is closed.
// Only a brand-new ('pending'/unset) window accepts a submission.
export function feedbackSubmittable(status) {
  return status == null || status === "pending";
}
