// ONE PERSON, ONE SHIP (bug hunt, 16 Nov 2026). On 9 Nov 2026 the console emailed Joe Art Eresmas (SC-0038131) "welcome
// aboard Norwegian Getaway": Rita's Getaway card carried a 9 Nov sign-on that was never moved, the last TDG file (7 Nov) was
// dated before it and so "could not contradict it" — while the same file had him On board Celebrity Solstice (embarked
// 23 Jul) and Rita's own typed sign-off for that contract read 15 Mar 2027 (typed 29 Oct, after the card). A card whose
// sign-on has come is aboard-awaiting-the-file ONLY while the schedule does not have the same crew under a DATED contract on
// another hull past that day. Rows below are production's, read 16 Nov 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legsFromRegistry, mergeBoardLegs, dropContradictedCards, dropOverlappedCards, cardOverlapsSeat } from "../src/ship_leg_source.js";
import { currentLeg } from "../src/welcome_context.js";
import { welcomeDue } from "../src/welcome_send.js";

const TODAY = "2026-11-09";
const FILE = "2026-11-07T12:21:48.325Z";
const ROWS = [{ sc: "SC-0038131", crew_name: "Joe Art Eresmas", status: "On board", raw_status: "On board", vessel: "MV CELEBRITY SOLSTICE", embarked_at: "2026-07-23", debarked_at: null, run_at: FILE }];
const VESSELS = [{ name: "Solstice", brand: "Celebrity" }, { name: "Getaway", brand: "NCL" }];
const CARD = { id: "as_getaway", sc: "SC-0038131", crew_name: "Joe Art Eresmas", ship: "Getaway", sign_on: "2026-11-09", planned_sign_off: "2027-05-23", updated_at: "2026-10-23T18:00:00.000Z" };
const typed = (off) => [{ sc: "SC-0038131", seq: 1, on_key: "2026-07-23", sign_on: "2026-07-23", sign_off: off, ship: "Solstice", off_conf: 1, updated_at: "2026-10-29T16:53:00.000Z" }];

function schedule({ edits = [], rows = ROWS, card = CARD, today = TODAY } = {}) {
  const registry = legsFromRegistry({ rows, edits, counter: [], open: [], vessels: VESSELS, today, turnarounds: {}, visits: [], trainers: [] });
  const cards = dropOverlappedCards(dropContradictedCards([card], rows, today), registry);
  return { registry, legs: mergeBoardLegs(registry, cards, today, []) };
}

test("Rita's typed sign-off on Solstice is months past the Getaway card's sign-on: the card is not his contract, nobody is welcomed", () => {
  const { registry, legs } = schedule({ edits: typed("2027-03-15") });
  const sol = registry.find((l) => l.sc === "SC-0038131");
  assert.equal(sol.off, "2027-03-15"); assert.equal(sol.offSource, "rita"); assert.equal(sol.is_current, true);
  assert.deepEqual(cardOverlapsSeat(CARD, registry), { ship: sol.ship, off: "2027-03-15", offSource: "rita" });
  assert.ok(!legs.some((l) => /getaway/i.test(l.ship)), "the card is no leg of the schedule");
  assert.match(currentLeg(legs, "SC-0038131").ship, /solstice/i);
  assert.deepEqual(welcomeDue(legs, TODAY, "2026-10-19"), [], "no welcome aboard Getaway");
});

test("a transfer Rita dated — the old ship's sign-off on or before the card's sign-on — is aboard awaiting the file, and welcomed", () => {
  const { registry, legs } = schedule({ edits: typed("2026-11-08") });
  assert.equal(cardOverlapsSeat(CARD, registry), null);
  const cur = currentLeg(legs, "SC-0038131");
  assert.match(cur.ship, /getaway/i);
  assert.deepEqual(welcomeDue(legs, TODAY, "2026-10-19").map((l) => l.sc), ["SC-0038131"]);
  // the same day: the sign-off IS the card's sign-on
  assert.equal(cardOverlapsSeat(CARD, schedule({ edits: typed("2026-11-09") }).registry), null);
});

test("a sign-off that is only projected says nothing, and a seat TDG holds past its sign-off has ended for Rita: the card stands", () => {
  const proj = schedule({ edits: [] });
  assert.equal(proj.registry.find((l) => l.sc === "SC-0038131").offSource, "projected");
  assert.equal(cardOverlapsSeat(CARD, proj.registry), null);
  assert.match(currentLeg(proj.legs, "SC-0038131").ship, /getaway/i);
  // held: Rita's sign-off (5 Nov) has passed, the file of 7 Nov still has him On board — he left as far as Rita knows
  const held = schedule({ edits: typed("2026-11-05") });
  assert.equal(held.registry.find((l) => l.sc === "SC-0038131").heldByFile, true);
  assert.equal(cardOverlapsSeat(CARD, held.registry), null);
});

test("another crew's contract, the same hull, a visit and a card not started are never an overlap", () => {
  const { registry } = schedule({ edits: typed("2027-03-15") });
  assert.equal(cardOverlapsSeat({ ...CARD, sc: "SC-OTHER" }, registry), null);
  assert.equal(cardOverlapsSeat({ ...CARD, ship: "Celebrity Solstice" }, registry), null, "his next contract on the same hull is a plan, not an overlap");
  assert.equal(cardOverlapsSeat({ ...CARD, sign_on: "2027-03-15" }, registry), null, "a card that starts the day he leaves");
  assert.equal(cardOverlapsSeat(CARD, registry.map((l) => ({ ...l, visit: true }))), null);
  assert.equal(cardOverlapsSeat({ sc: "SC-0038131", ship: null, sign_on: "2026-11-09" }, registry), null);
});

test("the board's awaiting test and the schedule read the one rule", () => {
  const w = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.match(w, /const awaitingCard = \(a\) => \{[^\n]*!cardOverlapsSeat\(\{ sc: a\.sc, ship: shipOf\(a\.ship\) \|\| a\.ship, sign_on: a\.sign_on \}, HIST\)/);
  const s = readFileSync(new URL("../src/ship_leg_source.js", import.meta.url), "utf-8");
  assert.match(s, /markAssignmentVisits\(dropOverlappedCards\(dropContradictedCards\(asg, rows, today\), registry\.concat\(history\)\), visits, trainers\)/);
});
