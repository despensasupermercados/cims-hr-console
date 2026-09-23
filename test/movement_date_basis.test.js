// A date in the weekly Movements email is either a FACT or a PLAN, and the email now says which.
//
// 21 Sep 2026: the email told Rita that Andrea Joyce Calayag signs off Fri 25 Sep. It did not say
// whether that was a recorded sign-off or a projection, she could not tell where it came from, and
// she concluded the report was wrong. The date was right (it was her own recorded date). What the
// email never printed was what KIND of date it was. Miguel, 23 Sep 2026: agreed, label it.
//
// confirmed = a real sign-on/off is recorded (the Counter's actual date, or the tick in the console)
// projected = the plan of record (TDG's projected sign-off, or a relief projection) — still a plan
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeMovements, buildSeafarerMovementEmail } from "../src/seafarer_movements.js";

const RUN = "2026-09-21"; // the Monday Rita read

// Two seats off in the same window: one recorded, one still projected.
const CREW = [
  { agency_id: "SC-0045797", name: "Calayag, Andrea Joyce", ship: "Navigator", disembark: "Port Canaveral",
    signOn: "2026-02-02", signOff: "2026-09-25", offConfirmed: true, contracts: 4 },
  { agency_id: "SC-0000001", name: "Dela Cruz, Juan", ship: "Symphony", disembark: "Miami",
    signOn: "2026-03-01", signOff: "2026-09-24", offConfirmed: false, contracts: 2 },
  { agency_id: "SC-0000002", name: "Reyes, Ana", ship: "Allure", embark: "Barcelona",
    signOn: "2026-09-23", signOff: "2027-03-23", onConfirmed: false, contracts: 1 },
];

test("shapeMovements carries the board's own confirmed flag, both directions", () => {
  const { signOns, signOffs } = shapeMovements(CREW, RUN);
  const rita = signOffs.find((p) => p.name === "Calayag, Andrea Joyce");
  const juan = signOffs.find((p) => p.name === "Dela Cruz, Juan");
  assert.equal(rita.confirmed, true, "a recorded sign-off is a fact");
  assert.equal(juan.confirmed, false, "an unrecorded one is the Counter's plan");
  assert.equal(signOns.find((p) => p.name === "Reyes, Ana").confirmed, false, "same rule on arrival");
});

test("a missing flag is PROJECTED, never confirmed — the safe default", () => {
  // A crew row from a source that never set the flag must not be promoted to a fact.
  const { signOffs } = shapeMovements([{ agency_id: "X", name: "No Flag", ship: "Quest", signOff: "2026-09-24" }], RUN);
  assert.equal(signOffs[0].confirmed, false);
});

test("the email prints the kind of date beside every date", () => {
  const { signOns, signOffs } = shapeMovements(CREW, RUN);
  const html = buildSeafarerMovementEmail({ runDate: RUN, signOns, signOffs });
  // Rita's card: the date she recorded, marked as recorded.
  assert.match(html, /off Fri 25 Sep <span[^>]*>confirmed<\/span>/, "her 25 Sep reads confirmed, right beside the date");
  // The projections say so.
  const projected = (html.match(/>projected</g) || []).length;
  assert.equal(projected, 2, "one projected sign-off + one projected sign-on");
  const confirmed = (html.match(/>confirmed</g) || []).length;
  assert.equal(confirmed, 1, "exactly the one recorded date");
});

test("the footer says what the two words mean — a label nobody can read is not a label", () => {
  const html = buildSeafarerMovementEmail({ runDate: RUN, signOns: [], signOffs: [] });
  assert.match(html, /Confirmed<\/strong> = a sign-on\/off is recorded/);
  assert.match(html, /Projected<\/strong> = the plan of record/);
  assert.match(html, /subject to change/);
});

test("the relief pill and the date mark stay different things", () => {
  // The right-hand pill is about COVERAGE (is there a reliever). The mark beside the date is about
  // the DATE. Confusing the two would answer Rita's question with the wrong fact.
  const { signOffs } = shapeMovements(CREW, RUN);
  signOffs[0].relief = { state: "none" };
  const html = buildSeafarerMovementEmail({ runDate: RUN, signOns: [], signOffs });
  assert.match(html, /No relief/, "coverage still renders");
  assert.match(html, /confirmed|projected/, "and so does the date mark");
});

test("the coverage pill names what it confirms, so one card never says 'confirmed' twice", () => {
  // Rendered preview, 23 Sep 2026: a card carried "off Fri 25 Sep CONFIRMED" beside a green
  // "CONFIRMED" pill — the date and the reliever, one word, two meanings.
  const { signOffs } = shapeMovements(CREW, RUN);
  signOffs[0].relief = { state: "confirmed", reliever: "Santos, Mark", signon: "2026-09-25" };
  const html = buildSeafarerMovementEmail({ runDate: RUN, signOns: [], signOffs });
  assert.match(html, /Relief confirmed/, "the pill says what it is about");
  // Every pill (the rounded chips) must name its subject; a bare "Confirmed" chip is the ambiguity.
  const pills = [...html.matchAll(/border-radius:20px;[^"]*">([^<]*)</g)].map((m) => m[1]);
  assert.ok(pills.length, "pills render");
  assert.equal(pills.filter((t) => /^Confirmed$|^Unconfirmed$/.test(t.trim())).length, 0, "no bare 'Confirmed' chip left to be misread");
});
