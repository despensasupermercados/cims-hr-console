// A PROJECTED SIGN-OFF LANDS ON A TURNAROUND DAY (Miguel, 8 Oct 2026, Alonzo's Allure card ending Jun 29, 2027 in
// Willemstad: "Curaçao is not a turnaround port ... look at the turnaround port, not the middle of the voyage. Even if
// you are a couple of days shorter or a couple of days over, it's okay ... Always look for the turnaround days").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { snapToTurnaround, turnaroundsByShip, MAX_SNAP_DAYS } from "../src/turnaround.js";
import { defaultProjectionDates } from "../src/projection.js";
import { legsFromRegistry } from "../src/ship_leg_source.js";
import { TURNAROUNDS_SQL, SHIP_TURNAROUNDS_SQL } from "../src/port_days.js";

const FLL = (d) => ({ berth_date: d, port_name: "FORT LAUDERDALE, FLORIDA" });
const ALLURE = ["2027-06-12", "2027-06-20", "2027-06-26", "2027-07-04", "2027-07-10"].map(FLL); // the real itinerary

test("the nearest turnaround wins, under or over; a tie goes to the later day; nothing within 14 days keeps the raw date", () => {
  assert.deepEqual(snapToTurnaround("2027-06-29", ALLURE), { date: "2027-06-26", port: "FORT LAUDERDALE, FLORIDA", snapped: true, delta: -3 }, "Alonzo: Jun 29 mid-voyage → Jun 26, three days under");
  assert.deepEqual(snapToTurnaround("2027-07-01", ALLURE), { date: "2027-07-04", port: "FORT LAUDERDALE, FLORIDA", snapped: true, delta: 3 }, "three days over when that is nearer");
  assert.deepEqual(snapToTurnaround("2027-06-26", ALLURE).snapped, false, "already a turnaround: untouched");
  assert.equal(snapToTurnaround("2027-06-26", ALLURE).port, "FORT LAUDERDALE, FLORIDA");
  // a 16-day voyage, the raw date in the middle: equidistant → the later day (a few days over, never cut short on a toss)
  const long = [{ berth_date: "2027-03-01", port_name: "A" }, { berth_date: "2027-03-17", port_name: "B" }];
  assert.deepEqual(snapToTurnaround("2027-03-09", long), { date: "2027-03-17", port: "B", snapped: true, delta: 8 });
  assert.deepEqual(snapToTurnaround("2027-05-01", ALLURE), { date: "2027-05-01", port: null, snapped: false, delta: 0 }, "no turnaround within " + MAX_SNAP_DAYS + " days: the raw date, said so");
  assert.deepEqual(snapToTurnaround("2027-05-01", []), { date: "2027-05-01", port: null, snapped: false, delta: 0 }, "no itinerary: the raw date");
  assert.deepEqual(snapToTurnaround(null, ALLURE), { date: null, port: null, snapped: false, delta: 0 });
  assert.equal(MAX_SNAP_DAYS, 14);
});

test("turnaroundsByShip keys the fleet's rows by lower-cased ship, dates sorted", () => {
  const by = turnaroundsByShip([{ ship_short: "Allure", berth_date: "2027-07-04", port_name: "FLL" }, { ship_short: "Allure", berth_date: "2027-06-26", port_name: "FLL" }, { ship_short: "Apex", berth_date: "2027-05-07", port_name: "SOU" }, { ship_short: null, berth_date: "x" }]);
  assert.deepEqual(Object.keys(by).sort(), ["allure", "apex"]);
  assert.deepEqual(by.allure.map((t) => t.berth_date), ["2027-06-26", "2027-07-04"]);
});

test("the one-tap / drag projection ends on the turnaround and carries its port; without itinerary rows the raw date stands", () => {
  const addMonths = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, d)); return t.toISOString().slice(0, 10); };
  const legs = [{ ship: "Allure", sc: "SC-V", ours: true, is_current: true, on: "2026-04-29", off: "2026-11-29" }];
  const d = defaultProjectionDates({ ship: "Allure", legs, today: "2026-10-08", brand: "Royal Caribbean", addMonths, turnarounds: ALLURE });
  assert.deepEqual(d, { signOn: "2026-11-29", signOff: "2027-06-26", follows: true, offPort: "FORT LAUDERDALE, FLORIDA", offSnapped: -3 });
  const raw = defaultProjectionDates({ ship: "Allure", legs, today: "2026-10-08", brand: "Royal Caribbean", addMonths });
  assert.deepEqual([raw.signOff, raw.offPort, raw.offSnapped], ["2027-06-29", null, 0]);
});

test("the board's projected sign-off snaps too (TDG's, Rita's and a card's dates never move), and the disembark port is the turnaround", () => {
  const rows = [{ sc: "SC-V", crew_name: "Raymond Villacortes", status: "On board", vessel: "MV ALLURE OF THE SEAS", embarked_at: "2026-11-29", debarked_at: null, run_at: "2026-12-01T08:00:00Z" }];
  const vessels = [{ name: "Allure", brand: "Royal Caribbean" }];
  const ta = { allure: ALLURE };
  const legs = legsFromRegistry({ rows, edits: [], counter: [], open: [], vessels, today: "2026-12-05", turnarounds: ta });
  assert.equal(legs.length, 1);
  assert.deepEqual([legs[0].off, legs[0].offSource, legs[0].offSnapped, legs[0].disembark], ["2027-06-26", "projected", -3, "FORT LAUDERDALE, FLORIDA"]);
  const plain = legsFromRegistry({ rows, edits: [], counter: [], open: [], vessels, today: "2026-12-05" });
  assert.deepEqual([plain[0].off, plain[0].offSnapped, plain[0].disembark], ["2027-06-29", undefined, undefined], "no itinerary: the raw seven months, as before");
  const typed = legsFromRegistry({ rows, edits: [{ sc: "SC-V", on_key: "2026-11-29", sign_off: "2027-06-29", updated_at: "2026-12-02" }], counter: [], open: [], vessels, today: "2026-12-05", turnarounds: ta });
  assert.deepEqual([typed[0].off, typed[0].offSource, typed[0].offSnapped], ["2027-06-29", "rita", undefined], "Rita's date is hers, never snapped");
});

test("static: the itinerary reads are bounded (never the whole table), the board wave fetches the fleet's turnarounds once, every projection route passes the ship's", () => {
  assert.match(TURNAROUNDS_SQL, /WHERE is_turnaround = 1 AND is_sea = 0 AND port_name IS NOT NULL\s+AND berth_date BETWEEN date\(\?1, '-45 days'\) AND date\(\?1, '\+15 months'\)/);
  assert.match(SHIP_TURNAROUNDS_SQL, /WHERE ship_short = \?1 AND is_turnaround = 1[\s\S]*BETWEEN date\(\?2, '-14 days'\) AND date\(\?2, '\+14 days'\)/);
  const S = readFileSync(new URL("../src/ship_leg_source.js", import.meta.url), "utf8");
  assert.match(S, /fetchTurnarounds\(env, today\)\.catch\(\(\) => \[\]\),/, "in the one wave");
  assert.match(S, /Object\.defineProperty\(out, "turnarounds", \{ value: turnarounds, enumerable: false \}\);/, "the map rides on the schedule for the bench");
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.equal((W.match(/turnarounds: fetchShipTurnarounds/g) || []).length, 3, "the drag, the TDG-earmark card and the one-tap route all snap");
});
