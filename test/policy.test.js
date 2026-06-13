import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBaseline, isMoneyUser, feedbackSubmittable, MONEY_USERS } from "../src/policy.js";

// ---- resolveBaseline: override ALWAYS wins; 0 is a valid set value ----
test("resolveBaseline: override wins over base", () => {
  assert.equal(resolveBaseline(null, 5), 5);
  assert.equal(resolveBaseline(2, 5), 5);
});
test("resolveBaseline: override of 0 still wins (0 is a real baseline, not unset)", () => {
  assert.equal(resolveBaseline(5, 0), 0);
  assert.equal(resolveBaseline(null, 0), 0);
});
test("resolveBaseline: falls back to base when no override", () => {
  assert.equal(resolveBaseline(7, null), 7);
  assert.equal(resolveBaseline(0, null), 0);
  assert.equal(resolveBaseline(7, undefined), 7);
});
test("resolveBaseline: null when neither set", () => {
  assert.equal(resolveBaseline(null, null), null);
  assert.equal(resolveBaseline(undefined, undefined), null);
});
// Regression for the silent-underpayment bug: a baseline saved to the override
// must be the number the payout math uses — not the base row's NULL (=> 0).
test("resolveBaseline: baseline set via override is NOT treated as unset", () => {
  const baseRowValue = null;        // AdvancedQuery never sets baseline
  const ritaOverride = 6;           // Rita confirmed 6 via the Edit modal
  assert.equal(resolveBaseline(baseRowValue, ritaOverride), 6);
});

// ---- isMoneyUser: only GM + HR, case-insensitive, trimmed ----
test("isMoneyUser: GM and HR are authorised", () => {
  assert.equal(isMoneyUser("Miguel.Sanmartin@dg3.com"), true);
  assert.equal(isMoneyUser("rita.berenyi@dg3.com"), true);
  assert.equal(isMoneyUser("  RITA.BERENYI@DG3.COM  "), true);
});
test("isMoneyUser: feedback contributors are NOT authorised for money", () => {
  for (const e of ["Ray.Guerra@dg3.com", "Rolando.Abellan@dg3.com", "Dexter.Lawrence@dg3.com", "joemar.deleon@dg3.com", "Ohji.Miranda@dg3.com"]) {
    assert.equal(isMoneyUser(e), false, e + " must not be a money user");
  }
});
test("isMoneyUser: empty/garbage is false", () => {
  assert.equal(isMoneyUser(""), false);
  assert.equal(isMoneyUser(null), false);
  assert.equal(isMoneyUser(undefined), false);
  assert.equal(isMoneyUser("attacker@evil.com"), false);
});
test("MONEY_USERS is exactly GM + HR (guards against accidental widening)", () => {
  assert.deepEqual([...MONEY_USERS].sort(), ["miguel.sanmartin@dg3.com", "rita.berenyi@dg3.com"]);
});

// ---- feedbackSubmittable: single-use ----
test("feedbackSubmittable: only a fresh window accepts a submission", () => {
  assert.equal(feedbackSubmittable("pending"), true);
  assert.equal(feedbackSubmittable(null), true);
  assert.equal(feedbackSubmittable(undefined), true);
});
test("feedbackSubmittable: answered or N/A is closed (no replay)", () => {
  assert.equal(feedbackSubmittable("answered"), false);
  assert.equal(feedbackSubmittable("na"), false);
});
