// WHO CAN TAKE THE SEAT (Miguel, 8 Oct 2026, Vision's empty earmark box): "every crew member who is active, not on
// board the ship, on vacation ... everybody who has been home already for a minimum of 6 weeks, but with a cutoff of
// 6 months ... a total of 9 names ... if Rita picks one ... the whole thing ... should pick up all the information".
// Mock-up B "polished, real list" approved with "go": time home is measured on the EARMARK'S START DATE (the day the
// ship's printer signs off), and crew aboard another ship count from their sign-off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { benchPool, rankBench, benchDocIssues, BENCH_MIN_DAYS, BENCH_MAX_MONTHS, BENCH_TOP } from "../src/earmark_bench.js";

const TODAY = "2026-10-08";
const DOCS = { med_exp: "2028-01-01", sirb_exp: "2030-01-01", pp_exp: "2030-01-01", usv_exp: "2030-01-01", sch_exp: null };
const crew = (sc, name, status, docs = DOCS) => ({ sc, name, rank: "PS", status, docs });
const leg = (sc, ship, on, off, cur = true) => ({ sc, ship, on, off, is_current: cur, ours: true });

const CREW = [
  crew("SC-R", "Darryl Ramos", "On Vacation"),            // home since 5 Oct (TDG debark)
  crew("SC-A", "Jonathan Alonzo", "On Vacation", { ...DOCS, med_exp: "2027-01-31" }),
  crew("SC-D", "Joemar De Leon", "Reserved"),              // home since 7 Feb: over 6 months by Jan 25
  crew("SC-P", "Jeremy Padilla", "On board"),              // aboard Ascent, off 6 Oct per the board (held), home by Jan 25
  crew("SC-B", "Dan Angelo Bo", "On board"),               // aboard Vision itself: the outgoing seat
  crew("SC-G", "Edward Guazon", "On board"),               // aboard Liberty until 31 Oct: 86 days by Jan 25
  crew("SC-X", "Late Off", "On board"),                    // off 20 Dec: only 36 days by Jan 25
  crew("SC-I", "Someone Inactive", "Inactive"),
  crew("SC-M", "Already Marked", "On Vacation"),           // has an earmark to come
  crew("SC-T", "Tdg Marked", "On Vacation"),               // TDG earmarks them
  crew("SC-U", "No Date", "On Vacation"),                  // nothing dates their time home
  crew("SC-S", "Shore Person", "On Vacation"),
];
CREW[11].shore = true;
const LEGS = [
  leg("SC-P", "Ascent", "2026-03-06", "2026-10-06"), leg("SC-B", "Vision", "2026-06-25", "2027-01-25"),
  leg("SC-G", "Liberty", "2026-02-09", "2026-10-31"), leg("SC-X", "Oasis", "2026-05-20", "2026-12-20"),
  leg("SC-A", "Symphony", "2026-02-12", "2026-09-12", false),
];
const SNAP = [{ agency_id: "SC-R", vessel: "MV CELEBRITY CONSTELLATION", debarked_at: "2026-10-05" }, { agency_id: "SC-A", vessel: "MV SYMPHONY OF THE SEAS", debarked_at: "2026-09-12" }, { agency_id: "SC-D", vessel: "MV AZAMARA ONWARD", debarked_at: "2026-02-07" }];
const OPEN = [{ sc: "SC-M", sign_on: "2027-03-01" }, { sc: "SC-R", sign_on: "2026-01-01" }]; // Ramos's old card has started: not a plan to come
const shipOf = (v) => { const m = String(v || "").toUpperCase().match(/CONSTELLATION|SYMPHONY|ONWARD/); return m ? m[0][0] + m[0].slice(1).toLowerCase() : null; };

test("benchPool: active crew whose time home can be dated — ashore from TDG's debark, aboard from the board's sign-off; earmarked, inactive, shore and undatable crew are out", () => {
  const pool = benchPool({ crew: CREW, legs: LEGS, snapshot: SNAP, open: OPEN, tdgEarmarked: new Set(["SC-T"]), today: TODAY, shipOf });
  assert.deepEqual(pool.map((p) => [p.sc, p.aboardShip, p.homeFrom, p.lastShip]), [
    ["SC-R", null, "2026-10-05", "Constellation"], ["SC-A", null, "2026-09-12", "Symphony"], ["SC-D", null, "2026-02-07", "Onward"],
    ["SC-P", "Ascent", "2026-10-06", "Ascent"], ["SC-B", "Vision", "2027-01-25", "Vision"], ["SC-G", "Liberty", "2026-10-31", "Liberty"], ["SC-X", "Oasis", "2026-12-20", "Oasis"],
  ]);
});

test("rankBench for Vision on Jan 25: 6 weeks to 6 months home on that day, most rested first; the ship's own printer never; outside = ashore beyond the window", () => {
  const pool = benchPool({ crew: CREW, legs: LEGS, snapshot: SNAP, open: OPEN, tdgEarmarked: new Set(["SC-T"]), today: TODAY, shipOf });
  const r = rankBench(pool, { ship: "Vision", reliefDate: "2027-01-25", signOff: "2027-08-25" });
  assert.deepEqual(r.ready.map((x) => [x.name, x.days, x.aboardShip]), [["Jonathan Alonzo", 135, null], ["Darryl Ramos", 112, null], ["Jeremy Padilla", 111, "Ascent"], ["Edward Guazon", 86, "Liberty"]]);
  assert.deepEqual(r.outside.map((x) => [x.name, x.days]), [["Joemar De Leon", 352]], "over 6 months: shown faded in the panel, never on the board");
  assert.ok(!r.ready.concat(r.outside).some((x) => x.sc === "SC-X"), "36 days home by Jan 25 is under 6 weeks");
  assert.ok(!r.ready.concat(r.outside).some((x) => x.sc === "SC-B"), "the outgoing printer is the seat, not a relief");
  assert.deepEqual(r.ready[0].docs, [{ doc: "Medical", exp: "2027-01-31", when: "before sign-off" }], "a medical that lapses mid-contract is named");
  // the ship's own printer IS a candidate elsewhere: Bo, home from 25 Jan, for a ship relieved in April
  const r2 = rankBench(pool, { ship: "Allure", reliefDate: "2027-04-01", signOff: "2027-11-01" });
  assert.ok(r2.ready.some((x) => x.sc === "SC-B" && x.days === 66));
  assert.equal(BENCH_MIN_DAYS, 42); assert.equal(BENCH_MAX_MONTHS, 6); assert.equal(BENCH_TOP, 9);
  assert.deepEqual(rankBench(pool, { ship: "Vision" }), { ready: [], outside: [] }, "no relief date: nothing to rank");
});

test("benchDocIssues: expired by the sign-on, expiring before the sign-off, required and missing", () => {
  assert.deepEqual(benchDocIssues({ med_exp: "2027-02-01", sirb_exp: "2026-12-01", pp_exp: null, usv_exp: "2030-01-01", sch_exp: null }, "2027-01-25", "2027-08-25"),
    [{ doc: "Medical", exp: "2027-02-01", when: "before sign-off" }, { doc: "Seaman's Book", exp: "2026-12-01", when: "before sign-on" }, { doc: "Passport", exp: null, when: "missing" }]);
  assert.deepEqual(benchDocIssues(DOCS, "2027-01-25", "2027-08-25"), []);
});

test("static: the board builds the bench per seated ship with the earmark's own dates, serves it on the route, draws the yellow box with one-tap rows and Undo; the relief panel lists everyone", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /const d = defaultProjectionDates\(\{ ship: sec\.ship, legs: HIST, today, brand: sec\.brand, addMonths: addMonthsISO \}\);\s*const r = rankBench\(benchP, \{ ship: sec\.ship, reliefDate: d\.signOn, signOff: d\.signOff \}\);/, "the list is measured on the day the one-tap earmark starts");
  assert.match(W, /sec\.bench = \{ date: d\.signOn, signOff: d\.signOff, rows: r\.ready\.slice\(0, BENCH_TOP\), total: r\.ready\.length \};/);
  assert.match(W, /if \(p === "\/api\/rotation\/bench" && request\.method === "GET"\) return apiRotationBench\(url, env\);/);
  assert.match(W, /function benchBox\(rb,sec\)\{var b=sec&&sec\.bench;if\(!b\|\|!b\.rows\|\|!b\.rows\.length\)return null;/, "no candidates: the plain Add earmark slot stays");
  assert.match(W, /onclick="benchPick\(event,this\)"/);
  assert.match(W, /fetch\('\/api\/rotation\/project',\{method:'POST'[^\n]*agency_id:sc,ship:ship/, "one tap = the drag's own route");
  assert.match(W, /benchToast\(nm,ship,r\)/); assert.match(W, /<button type=button>Undo<\/button>/);
  assert.match(W, /\.ebench\{background:#FFFAE8!important/, "soft yellow, the earmark colour");
  const U = readFileSync(new URL("../src/relief_ui.js", import.meta.url), "utf8");
  assert.match(U, /if\(!node&&role==="reliever"&&printer\)loadBench\(shipName\(key\)\);/);
  assert.match(U, /fetch\("\/api\/rotation\/bench\?ship="\+encodeURIComponent\(ship\)\)/);
  assert.match(U, /Everyone available · /); assert.match(U, /Most rested · /);
  const A = readFileSync(new URL("../src/relief_api.js", import.meta.url), "utf8");
  assert.match(A, /SELECT c\.id, c\.agency_id, TRIM/, "the picker rows carry the agency id the bench rows are keyed on");
});
