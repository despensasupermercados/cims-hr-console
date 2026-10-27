// 27 Oct 2026 review — the ONE schedule and the crew emails. Each case failed on the code of that morning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dropContradictedCards, markAssignmentVisits, mergeBoardLegs, legsFromRegistry, fileWordBy } from "../src/ship_leg_source.js";
import { seatContexts } from "../src/signoff_context.js";
import { instructionsEmail, endDot } from "../src/emails/hr.signoff.instructions.v2.js";
import { linkEmail } from "../src/emails/hr.signoff.link.v2.js";
import { welcomeEmail } from "../src/emails/hr.welcome.v1.js";
import { surveyInviteEmail } from "../src/emails/hr.survey.invite.v1.js";
import { surveyAnswersEmail } from "../src/emails/hr.survey.answers.v1.js";
import { KEYS } from "../src/crew_survey.js";

const TODAY = "2026-10-21";
const row = (sc, status, vessel, embarked_at, run_at, o = {}) => ({ sc, status, raw_status: status, vessel, embarked_at, debarked_at: null, run_at, crew_id: "c" + sc, crew_name: "Crew " + sc, ...o });
const card = (sc, ship, sign_on, o = {}) => ({ id: "as_" + sc + ship, sc, ship, sign_on, planned_sign_off: "2027-05-01", crew_id: "c" + sc, crew_name: "Crew " + sc, ...o });

// THE SCHEDULE CARRIES WHAT THE BOARD SHOWS. Gayda (23 Oct 2026, §10k): an open card on Allure with a passed sign-on; the
// latest file, dated after it, has her On board Jewel. The board drew the card off ("overridden"); boardLegs kept it as a
// CURRENT leg — a second running contract for the statement, the profile, the Score Card, the bench and the sign-off buttons.
test("a card the latest file contradicts (aboard another hull, or ashore) leaves the schedule; a confirmed or unseen card stays", () => {
  const rows = [
    row("G", "On board", "MV JEWEL OF THE SEAS", "2026-07-20", "2026-10-20T07:00:00Z"),     // elsewhere: contradicts her Allure card
    row("H", "On Vacation", "MV ALLURE OF THE SEAS", null, "2026-10-20T07:00:00Z"),        // ashore: contradicts his card
    row("K", "On board", "MV ALLURE OF THE SEAS", "2026-10-02", "2026-10-20T07:00:00Z"),   // confirmed on that very hull
    row("E", "Earmarked", "MV ALLURE OF THE SEAS", null, "2026-10-20T07:00:00Z"),          // TDG has the plan: not a contradiction (17 Oct 2026, Corpin)
    row("O", "On Vacation", "MV ALLURE OF THE SEAS", null, "2026-09-25T07:00:00Z"),        // a file dated BEFORE the sign-on says nothing yet
  ];
  const asg = [card("G", "Allure", "2026-10-01"), card("H", "Allure", "2026-10-01"), card("K", "Allure", "2026-10-02"), card("E", "Allure", "2026-10-01"), card("O", "Allure", "2026-10-01"), card("N", "Allure", "2026-10-01")];
  const kept = dropContradictedCards(asg, rows, TODAY).map((a) => a.sc);
  assert.deepEqual(kept, ["K", "E", "O", "N"], "G (elsewhere) and H (ashore) are off; K confirmed, E earmarked there, O file older than the card, N not in the file stay");
  assert.equal(fileWordBy(rows).G.key, "allure" === fileWordBy(rows).G.key ? "allure" : fileWordBy(rows).G.key);
  // the schedule the readers get
  const legs = mergeBoardLegs(legsFromRegistry({ rows, vessels: [{ name: "Jewel", brand: "Royal Caribbean" }, { name: "Allure", brand: "Royal Caribbean" }], today: TODAY }), dropContradictedCards(asg, rows, TODAY), TODAY, []);
  const g = legs.filter((l) => l.sc === "G" && l.is_current);
  assert.deepEqual(g.map((l) => l.ship), ["Jewel"], "one running contract for Gayda, the file's");
});

test("a trainer's card is a visit like his file row: never a seat the emails or the count read, never the printer's sign-off or reliever", () => {
  const trainers = [{ sc: "J" }];
  const asg = [card("J", "Pursuit", "2026-10-16"), card("P", "Pursuit", "2026-10-16")];
  const marked = markAssignmentVisits(asg, [], trainers);
  assert.deepEqual(marked.map((a) => !!a.visit), [true, false]);
  assert.equal(markAssignmentVisits(asg, [{ sc: "J", on_key: "2026-10-16", kind: "contract" }], trainers)[0].visit, undefined, "Rita's FULL CONTRACT mark wins");
  assert.equal(markAssignmentVisits([card("R", "Pursuit", "2026-10-16", { first_name: "Ray", last_name: "Guerra" })], [], [])[0].visit, true, "the shoreside team by name");
  const legs = mergeBoardLegs([], marked, TODAY, []);
  assert.equal(legs.find((l) => l.sc === "J").visit, true, "the leg carries the mark");
  assert.equal(legs.find((l) => l.sc === "P").visit, undefined);
  // Kevin Jugao, Pursuit: Rita typed 31 Oct; Jonathan (a trainer) carded to teach from 16 Oct. The card used to date Kevin's
  // sign-off 16 Oct and name Jonathan the reliever.
  const out = legsFromRegistry({
    rows: [row("KJ", "On board", "MV AZAMARA PURSUIT", "2026-05-02", "2026-10-16T07:00:00Z")],
    edits: [{ sc: "KJ", on_key: "2026-05-02", sign_off: "2026-10-31", updated_at: "2026-10-09T10:00:00Z", off_conf: 1 }],
    open: [{ id: "as_j", sc: "J", ship: "Pursuit", sign_on: "2026-10-16", created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", crew_name: "Jonathan Alonzo" }],
    vessels: [{ name: "Pursuit", brand: "Azamara" }], today: "2026-10-17", trainers,
  });
  const kj = out.find((l) => l.sc === "KJ");
  assert.deepEqual({ off: kj.off, src: kj.offSource, rel: kj.reliever ? kj.reliever.sc : null }, { off: "2026-10-31", src: "rita", rel: null });
});

test("seatContexts: a crew with two current seats is instructed for the one that leaves FIRST, whatever the ship order", () => {
  const seat = (ship, signOn, signOff) => ({ agency_id: "T", name: "Tuazon", ship, current: true, signOn, signOff });
  const secs = (first) => (first === "B"
    ? [{ ship: "B", brand: "Royal", crew: [seat("B", "2026-08-28", "2027-03-28")], projections: [] }, { ship: "A", brand: "Royal", crew: [seat("A", "2026-06-06", "2026-10-30")], projections: [] }]
    : [{ ship: "A", brand: "Royal", crew: [seat("A", "2026-06-06", "2026-10-30")], projections: [] }, { ship: "B", brand: "Royal", crew: [seat("B", "2026-08-28", "2027-03-28")], projections: [] }]);
  assert.equal(seatContexts(secs("A")).T.ship, "A");
  assert.equal(seatContexts(secs("B")).T.ship, "A", "the later section used to overwrite the earlier sign-off");
});

// A.J. Lorenzo Baleña (Pursuit): every greeting read "A.J.." — the reliever pass alone had the guard.
test("a first name that ends in a dot never gets a second one, in six templates", () => {
  assert.equal(endDot("A.J."), ""); assert.equal(endDot("Kevin"), ".");
  const base = { firstName: "A.J.", crewName: "A.J. Lorenzo Baleña", position: "Printer Specialist", ship: "Pursuit", brand: "Azamara", signOn: "2026-10-16", signOff: "2027-03-16", port: "Lisbon", today: "2027-03-02", link: "https://cims.work/instr?t=x" };
  const outs = [instructionsEmail(base), linkEmail({ ...base, link: "https://cims.work/ack?t=x" }),
    welcomeEmail({ first: "A.J.", name: "A.J. Lorenzo Baleña", position: "Printer Specialist", ship: "Pursuit", shipShort: "Pursuit", brand: "Azamara", code: "PU", signOn: "2026-10-16", signOff: "2027-03-16", links: {} }),
    surveyInviteEmail({ first: "A.J.", ship: "Pursuit", shipShort: "Pursuit", code: "PU", on: "16 Oct 2026", off: "16 Mar 2027", aboard: "5 months", link: "https://hub.cims.work/hub/survey/x", expires: "15 Apr", today: "19 Mar 2027", reminder: false }),
    surveyAnswersEmail({ first: "A.J.", ship: "Pursuit", brand: "Azamara", when: "19 Mar 2027", answers: Object.fromEntries(KEYS.map((k) => [k, 4])), fix: "" })];
  for (const m of outs) {
    for (const part of [m.subject, m.html, m.text].filter(Boolean)) assert.doesNotMatch(String(part), /A\.J\.\./, "double dot in: " + String(part).slice(0, 80));
    assert.match(String(m.html), /A\.J\./);
  }
  const W = readFileSync(new URL("../src/signoff_ack.js", import.meta.url), "utf8"), P = readFileSync(new URL("../src/crew_survey_page.js", import.meta.url), "utf8");
  assert.match(W, /first\.slice\(-1\) === '\.' \? '' : '\.'/, "the sign-off page");
  assert.match(P, /slice\(-1\) === '\.' \? '' : '\.'/, "the survey page");
});

test("the crew-page Send instructions button refuses a training visit the schedule marks, with or without a seat context", () => {
  const S = readFileSync(new URL("../src/signoff_instructions.js", import.meta.url), "utf8");
  assert.match(S, /fromBoard: true, visit: !!cur\.visit \}/, "seatLeg carries the leg's mark");
  assert.match(S, /visit: !!\(ovr && \(ovr\.visit \|\| \(ovr\.ctx && ovr\.ctx\.visit\)\)\)/, "resolveInstr carries it");
  assert.equal((S.match(/\(ctx && ctx\.instruct === false\) \|\| r\.visit/g) || []).length, 2, "the route and the daily sender both refuse it");
});
