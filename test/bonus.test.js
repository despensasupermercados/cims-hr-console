// Golden tests for the bonus engine. THIS IS THE DEPLOY GATE.
// If any case fails, the build must not deploy. Each case encodes a clause of
// the locked SOP; do not weaken a case to make a change pass — that is a money change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBonus, ladderValue, FLOOR } from "../src/bonus.js";

const MAX = { sOrder: 20, sAcc: 25, sPar: 15, sHand: 10, sComm: 10, sMono: 5 }; // perfect operational = 85

test("ladder values match locked SOP", () => {
  assert.equal(ladderValue(0), 0);
  assert.equal(ladderValue(1), 0);     // first completion: rank, $0
  assert.equal(ladderValue(2), 250);
  assert.equal(ladderValue(3), 500);
  assert.equal(ladderValue(8), 1750);
  assert.equal(ladderValue(9), 2000);  // cap
  assert.equal(ladderValue(20), 2000); // stays capped
});

test("FLOOR is 80", () => assert.equal(FLOOR, 80));

test("A: clean perfect completion pays full rung", () => {
  const r = computeBonus({ count: 2, sliders: MAX, evalScore: 5, gates: { complete: true } });
  assert.equal(r.score, 100);
  assert.equal(r.gate, null);
  assert.equal(r.nextCount, 3);
  assert.equal(r.pay, 500); // round(500*100/100)
});

test("B: completion below floor advances count but pays 0", () => {
  // operational 64 + eval15 = 79  (<80)
  const s = { sOrder: 20, sAcc: 25, sPar: 15, sHand: 4, sComm: 0, sMono: 0 };
  const r = computeBonus({ count: 3, sliders: s, evalScore: 5, gates: { complete: true } });
  assert.equal(r.score, 79);
  assert.equal(r.gate, null);
  assert.equal(r.nextCount, 4); // advances
  assert.equal(r.pay, 0);       // below floor
});

test("C: rush gate resets count to 0 and pays 0 even at perfect score", () => {
  const r = computeBonus({ count: 5, sliders: MAX, evalScore: 5, gates: { complete: true, rush: true } });
  assert.equal(r.gate, "rush");
  assert.equal(r.resets, true);
  assert.equal(r.nextCount, 0);
  assert.equal(r.pay, 0);
});

test("D: not completed (no compassion) resets and pays 0", () => {
  const r = computeBonus({ count: 4, sliders: MAX, evalScore: 5, gates: { complete: false, compassion: false } });
  assert.equal(r.gate, "not_completed");
  assert.equal(r.nextCount, 0);
  assert.equal(r.pay, 0);
});

test("E: compassionate bypass lets a non-completed contract still pay & advance", () => {
  const r = computeBonus({ count: 2, sliders: MAX, evalScore: 5, gates: { complete: false, compassion: true } });
  assert.equal(r.gate, null);
  assert.equal(r.nextCount, 3); // advances
  assert.equal(r.pay, 500);
});

test("F: eval below 3 holds count (no reset, no advance) and pays 0", () => {
  const r = computeBonus({ count: 3, sliders: MAX, evalScore: 2, gates: { complete: true } });
  assert.equal(r.gate, "eval_below_3");
  assert.equal(r.forfeitOnly, true);
  assert.equal(r.resets, false);
  assert.equal(r.nextCount, 3); // holds
  assert.equal(r.pay, 0);
});

test("G: gate precedence — not_completed beats rush", () => {
  const r = computeBonus({ count: 3, sliders: MAX, evalScore: 5, gates: { complete: false, compassion: false, rush: true } });
  assert.equal(r.gate, "not_completed");
});

test("H: gate precedence — rush beats audit", () => {
  const r = computeBonus({ count: 3, sliders: MAX, evalScore: 5, gates: { complete: true, rush: true, audit: true } });
  assert.equal(r.gate, "rush");
});

test("I: gate precedence — audit beats eval<3", () => {
  const r = computeBonus({ count: 3, sliders: MAX, evalScore: 2, gates: { complete: true, audit: true } });
  assert.equal(r.gate, "audit");
});

test("J: proportional payout rounds correctly", () => {
  // operational 72 + eval15 = 87 ; count 2 -> rung 500 ; round(500*87/100)=435
  const s = { sOrder: 20, sAcc: 25, sPar: 15, sHand: 10, sComm: 2, sMono: 0 };
  const r = computeBonus({ count: 2, sliders: s, evalScore: 5, gates: { complete: true } });
  assert.equal(r.score, 87);
  assert.equal(r.pay, 435);
});

test("K: sliders clamp to their max", () => {
  const s = { sOrder: 999, sAcc: 25, sPar: 15, sHand: 10, sComm: 10, sMono: 5 };
  const r = computeBonus({ count: 2, sliders: s, evalScore: 5, gates: { complete: true } });
  assert.equal(r.breakdown.sOrder, 20);
  assert.equal(r.score, 100);
});

test("L: ladder caps at count 9+ (pays 2000)", () => {
  const r = computeBonus({ count: 9, sliders: MAX, evalScore: 5, gates: { complete: true } });
  assert.equal(r.nextCount, 10);
  assert.equal(r.pay, 2000);
});

test("M: first completion (count 0 -> 1) earns rank but $0", () => {
  const r = computeBonus({ count: 0, sliders: MAX, evalScore: 5, gates: { complete: true } });
  assert.equal(r.nextCount, 1);
  assert.equal(r.rung, 0);
  assert.equal(r.pay, 0);
});

test("N: second completion (count 1 -> 2) pays 250 at perfect score", () => {
  const r = computeBonus({ count: 1, sliders: MAX, evalScore: 5, gates: { complete: true } });
  assert.equal(r.nextCount, 2);
  assert.equal(r.pay, 250);
});

test("O: eval exactly 3 grants the 15 eval points", () => {
  const r = computeBonus({ count: 2, sliders: MAX, evalScore: 3, gates: { complete: true } });
  assert.equal(r.breakdown.sEval, 15);
  assert.equal(r.score, 100);
});
