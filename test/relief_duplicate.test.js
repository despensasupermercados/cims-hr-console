// The same seafarer drawn twice on one ship, and a covered handover reported as a hole.
//
// Anthem, 2026-09-14. Ian Alega appeared as a crew card ("On board · 5 mos 11 days") AND as the
// pending reliever ("Signs on · TBA ON 2026-09-12") on the same vessel, with a banner reading
// "2-day gap before reliever signs on". All three came from ONE assignment row:
//
//   role=reliever, vessel=Anthem, sign_on=2026-09-12, planned_sign_off=2027-02-23
//
// Three separate defects fed it:
//   1. mergeBoardLegs turns an in-force assignment whose sign-on has passed into a current board
//      leg (correct — he IS aboard), while buildReliefBoard still advertised him as pending.
//      Fifteen in-force reliever assignments in production had a sign-on in the past.
//   2. handoverStatus took Math.abs of the day difference, so a reliever boarding BEFORE the
//      printer leaves — an overlap, the seat covered throughout — read as a gap with nobody aboard.
//   3. relief_api's reliever query had no WHERE clause, so an assignment that already ended was
//      still a candidate for "who is relieving this printer".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReliefBoard, handoverStatus } from "../src/relief_board.js";

const CONFIG = { critical_days: 14, due_days: 30 };
const TODAY = "2026-09-14";
const KEY = "Royal Caribbean|Anthem";
const printer  = { id: "leg:anthem", role: "printer",  crew_name: "Andrew Lorono", vessel_key: KEY, on_date: "2026-03-08", off_date: "2026-09-14", on_port_seed: "Sydney", off_port_seed: "SEATTLE, WASHINGTON", has_deployment: true };
const ian      = { id: "as_ian",     role: "reliever", crew_name: "Ian Alega",     vessel_key: KEY, on_date: "2026-09-12", off_date: "2027-02-23", has_deployment: true };

test("a reliever who boarded BEFORE the printer leaves is an overlap, not a gap", () => {
  const o = handoverStatus({ off_date: "2026-09-14", off_city: "Seattle" }, { on_date: "2026-09-12", on_city: "Seattle" });
  assert.equal(o.kind, "overlap", "both are aboard for those two days — the seat is covered");
  assert.equal(o.days, 2);

  // and a real hole is still a gap, with the same magnitude
  const g = handoverStatus({ off_date: "2026-09-12", off_city: "Seattle" }, { on_date: "2026-09-14", on_city: "Seattle" });
  assert.equal(g.kind, "gap");
  assert.equal(g.days, 2);
});

test("an overlap ranks as covered, not as a problem to chase", () => {
  const rows = buildReliefBoard({ assignments: [printer, ian], config: CONFIG, today: TODAY });
  assert.equal(rows[0].handover.kind, "overlap");
  assert.equal(rows[0].status, "overlap");
});

test("a reliever already aboard is flagged, so the board does not re-advertise them", () => {
  const rows = buildReliefBoard({ assignments: [printer, ian], config: CONFIG, today: TODAY });
  assert.equal(rows[0].reliever.crew_name, "Ian Alega");
  assert.equal(rows[0].reliever.aboard, true, "his sign-on was two days ago — he is a crew card now, not a pending slot");
});

test("a reliever who has NOT boarded is preferred over one who has", () => {
  const next = { id: "as_next", role: "reliever", crew_name: "Next Reliever", vessel_key: KEY, on_date: "2027-02-23", has_deployment: true };
  const rows = buildReliefBoard({ assignments: [printer, ian, next], config: CONFIG, today: TODAY });
  assert.equal(rows[0].reliever.crew_name, "Next Reliever", "the open question is who comes NEXT");
  assert.equal(rows[0].reliever.aboard, false);
});

test("the earliest pending reliever wins, not merely the first row returned", () => {
  const late  = { id: "l", role: "reliever", crew_name: "Late",  vessel_key: KEY, on_date: "2027-06-01", has_deployment: true };
  const early = { id: "e", role: "reliever", crew_name: "Early", vessel_key: KEY, on_date: "2026-10-01", has_deployment: true };
  const rows = buildReliefBoard({ assignments: [printer, late, early], config: CONFIG, today: TODAY });
  assert.equal(rows[0].reliever.crew_name, "Early");
});

test("a reliever with no sign-on date still follows the printer (auto-handover kept)", () => {
  const auto = { id: "a", role: "reliever", crew_name: "Auto", vessel_key: KEY, has_deployment: true };
  const rows = buildReliefBoard({ assignments: [printer, auto], config: CONFIG, today: TODAY });
  assert.equal(rows[0].reliever.on_date, "2026-09-14", "inherits the printer's sign-off date");
  assert.equal(rows[0].reliever.auto_on, true);
  assert.equal(rows[0].reliever.aboard, false, "a date inherited today is not evidence anyone boarded");
});

test("no reliever at all still reads as an open slot", () => {
  const rows = buildReliefBoard({ assignments: [printer], config: CONFIG, today: TODAY });
  assert.equal(rows[0].reliever, null);
  assert.equal(rows[0].handover.kind, "none");
});

// --- the two IO-side fixes (static: both are SQL and served script) --------------------------
test("the reliever query reads IN-FORCE assignments only", () => {
  const SRC = readFileSync(new URL("../src/relief_api.js", import.meta.url), "utf8");
  const q = SRC.slice(SRC.indexOf("SELECT a.id, a.role, a.sign_on"));
  const body = q.slice(0, q.indexOf("`"));
  assert.match(body, /WHERE a\.actual_sign_off IS NULL/,
    "without this an assignment that ended months ago is still a candidate reliever");
});

test("the board does not draw a reliever who is already aboard", () => {
  const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  // The LAST definition of each is the one the browser runs.
  const slot = SRC.slice(SRC.lastIndexOf("function reliefSlot(rb){"));
  assert.match(slot.slice(0, slot.indexOf("\n")), /if\(rb\.reliever&&rb\.reliever\.aboard\)return '';/,
    "an aboard reliever is already on the ship as a crew card — drawing the slot too is the duplicate");
  const banner = SRC.slice(SRC.lastIndexOf("function reliefBanner(rb){"));
  const bline = banner.slice(0, banner.indexOf("\n"));
  assert.match(bline, /aboard since/, "say they were relieved, not that someone is still due");
  assert.match(bline, /overlap/, "an overlap must not be announced as a gap");
});

// --- a sign-off that already passed is not a countdown ---------------------------------------
// Freedom, 2026-09-14. Norman Osorio's card read "On Vacation · 8 mos 14 days" — the derived
// status was right, he had left — while the same panel said "Reliever needed · signs off in
// -23 days" and offered an "OFF IN -23D" slot. His ship_leg still carried is_current=1 because
// the planned off date (2026-08-22) passed and no ACTUAL sign-off was ever recorded, and the
// console deliberately will not invent one. Fifteen of the forty-eight current legs are in that
// state. Nobody knows who holds those seats, which makes it the most urgent thing on the board.
import { urgency as urgencyFn } from "../src/relief_board.js";

test("a planned sign-off already in the past is overdue, never a negative countdown", () => {
  assert.equal(urgencyFn(-23, CONFIG), "overdue");
  assert.equal(urgencyFn(-1, CONFIG), "overdue");
  assert.equal(urgencyFn(0, CONFIG), "critical", "today is still a countdown, not a miss");
  assert.equal(urgencyFn(10, CONFIG), "critical");
  assert.equal(urgencyFn(20, CONFIG), "due");
  assert.equal(urgencyFn(40, CONFIG), "open");
  assert.equal(urgencyFn(null, CONFIG), "open");
});

test("an overdue seat outranks every other state on the board", () => {
  const gone = { id: "leg:freedom", role: "printer", crew_name: "Norman Osorio", vessel_key: "Royal Caribbean|Freedom", on_date: "2025-12-08", off_date: "2026-08-22", has_deployment: true };
  const soon = { id: "leg:x", role: "printer", crew_name: "Someone", vessel_key: "Royal Caribbean|X", on_date: "2026-01-01", off_date: "2026-09-20", has_deployment: true };
  const rows = buildReliefBoard({ assignments: [soon, gone], config: CONFIG, today: TODAY });
  assert.equal(rows[0].vessel_key, "Royal Caribbean|Freedom");
  assert.equal(rows[0].urgency, "overdue");
  assert.equal(rows[0].status, "overdue", "no reliever, so urgency drives the status");
  assert.equal(rows[0].days_to_off, -23);
  assert.equal(rows[1].urgency, "critical");
});

test("the board never prints a negative day count at the reader", () => {
  const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const slot = SRC.slice(SRC.lastIndexOf("function reliefSlot(rb){"));
  assert.match(slot.slice(0, slot.indexOf("\n")), /OFF WAS '\+\(-d\)\+'D AGO/,
    "a past sign-off reads as elapsed, not as a countdown");
  const banner = SRC.slice(SRC.lastIndexOf("function reliefBanner(rb){"));
  assert.match(banner.slice(0, banner.indexOf("\n")), /Sign-off overdue/);
  assert.match(banner.slice(0, banner.indexOf("\n")), /no sign-off recorded/,
    "say WHY the seat is unresolved: nobody recorded the sign-off");
  // the crew card carried the same defect ("OFF in -1d" on Anthem)
  assert.match(SRC, /dd<0\?\('OFF was '\+\(-dd\)\+'d ago'\)/);
});
