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
  assert.deepEqual(rankBench(pool, { ship: "Vision" }), { ready: [], outside: [], rules: [] }, "no relief date: nothing to rank");
});

test("benchDocIssues: expired by the sign-on, expiring before the sign-off, required and missing", () => {
  assert.deepEqual(benchDocIssues({ med_exp: "2027-02-01", sirb_exp: "2026-12-01", pp_exp: null, usv_exp: "2030-01-01", sch_exp: null }, "2027-01-25", "2027-08-25"),
    [{ doc: "Medical", exp: "2027-02-01", when: "before sign-off" }, { doc: "Seaman's Book", exp: "2026-12-01", when: "before sign-on" }, { doc: "Passport", exp: null, when: "missing" }]);
  assert.deepEqual(benchDocIssues(DOCS, "2027-01-25", "2027-08-25"), []);
});

test("static: the board builds the bench per seated ship with the earmark's own dates, serves it on the route, draws the yellow box with one-tap rows and Undo; the relief panel lists everyone", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /const d = defaultProjectionDates\(\{ ship: sec\.ship, legs: HIST, today, brand: sec\.brand, addMonths: addMonthsISO, turnarounds: \(HIST\.turnarounds \|\| \{\}\)\[String\(sec\.ship\)\.trim\(\)\.toLowerCase\(\)\] \|\| \[\] \}\);\s*const r = rankBench\(benchP, \{ \.\.\.benchArgs\(sec\), reliefDate: d\.signOn, signOff: d\.signOff \}\);/, "the list is measured on the day the one-tap earmark starts, on the turnaround");
  assert.match(W, /const benchArgs = \(sec\) => \(\{ ship: sec\.ship, brand: sec\.brand, block: sec\.brand === "Royal" && jrRule\[normShip\(sec\.ship\)\] === "block" \}\);/, "the brand and the Oasis / Icon rule ride on the hull");
  assert.match(W, /sec\.bench = \{ date: d\.signOn, signOff: d\.signOff, rows: r\.ready\.slice\(0, BENCH_TOP\), total: r\.ready\.length, rules: r\.rules \};/);
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

// THE BRAND RULE + THE OASIS / ICON RULE (Miguel, 8 Oct 2026, the same evening): "if we are looking within the Royal
// environment, you only display people who have done Royal Caribbean ships ... I don't want to see, on an Allure, a
// brand-new hire ... I don't want to have somebody from Celebrity, like Dan Belhida, on an Allure".
test("brand rule: Royal hulls list Royal crew, Celebrity hulls Celebrity crew, Azamara takes Azamara or Royal; a crew with no contract on record has no brand and passes", () => {
  const crew2 = [crew("SC-RY", "Royal Hand", "On Vacation"), crew("SC-CE", "Dan Belhida", "On Vacation"), crew("SC-AZ", "Az Hand", "On Vacation"), crew("SC-NH", "Brand New", "On Vacation")];
  const legs2 = [leg("SC-RY", "Symphony", "2026-01-01", "2026-08-01", false), leg("SC-CE", "Apex", "2026-03-14", "2026-10-07", false), leg("SC-AZ", "Onward", "2026-02-01", "2026-07-01", false)];
  legs2[0].brand = "Royal Caribbean"; legs2[1].brand = "Celebrity"; legs2[2].brand = "Azamara";
  const snap2 = [{ agency_id: "SC-RY", vessel: "MV SYMPHONY OF THE SEAS", debarked_at: "2026-08-01" }, { agency_id: "SC-CE", vessel: "MV CELEBRITY APEX", debarked_at: "2026-10-07" }, { agency_id: "SC-AZ", vessel: "MV AZAMARA ONWARD", debarked_at: "2026-07-01" }, { agency_id: "SC-NH", vessel: null, debarked_at: "2026-09-01" }];
  const brandOf = (s) => ({ Symphony: "Royal Caribbean", Apex: "Celebrity", Onward: "Azamara" })[s] || null;
  const pool = benchPool({ crew: crew2, legs: legs2, snapshot: snap2, open: [], today: TODAY, shipOf: (v) => { const m = String(v || "").toUpperCase().match(/SYMPHONY|APEX|ONWARD/); return m ? m[0][0] + m[0].slice(1).toLowerCase() : null; }, brandOf, contractsOf: (sc) => (sc === "SC-NH" ? 0 : 3) });
  assert.deepEqual(pool.map((p) => [p.sc, p.brands, p.newHire]), [["SC-RY", ["Royal"], false], ["SC-CE", ["Celebrity"], false], ["SC-AZ", ["Azamara"], false], ["SC-NH", [], true]]);
  const on = (ship, brand, block) => rankBench(pool, { ship, brand, block, reliefDate: "2026-11-29", signOff: "2027-06-29" }).ready.map((r) => r.sc);
  assert.deepEqual(on("Allure", "Royal", true), ["SC-RY"], "Oasis class: Royal crew, and never the new hire");
  assert.deepEqual(on("Vision", "Royal", false), ["SC-RY", "SC-NH"], "a Vision class hull takes the new hire");
  assert.deepEqual(on("Beyond", "Celebrity", false), ["SC-NH", "SC-CE"], "Celebrity: Belhida (and the new hire), never the Royal hand");
  assert.deepEqual(on("Quest", "Azamara", false), ["SC-AZ", "SC-RY", "SC-NH"], "Azamara takes Azamara or Royal crew, most rested first");
  assert.deepEqual(rankBench(pool, { ship: "Allure", brand: "Royal", block: true, reliefDate: "2026-11-29" }).rules, ["Royal crew only", "no Junior PS, no new hire"]);
  assert.deepEqual(rankBench(pool, { ship: "Quest", brand: "Azamara", reliefDate: "2026-11-29" }).rules, ["Azamara or Royal crew"]);
  const jr = benchPool({ crew: [{ ...crew("SC-JR", "Junior Hand", "On Vacation"), rank: "Junior Printer Specialist" }], legs: [Object.assign(leg("SC-JR", "Symphony", "2026-01-01", "2026-08-01", false), { brand: "Royal" })], snapshot: [{ agency_id: "SC-JR", vessel: "MV SYMPHONY OF THE SEAS", debarked_at: "2026-08-01" }], open: [], today: TODAY, brandOf, contractsOf: () => 1 });
  assert.deepEqual(rankBench(jr, { ship: "Allure", brand: "Royal", block: true, reliefDate: "2026-11-29" }).ready, [], "a Junior PS never on an Oasis / Icon hull");
  assert.equal(rankBench(jr, { ship: "Vision", brand: "Royal", block: false, reliefDate: "2026-11-29" }).ready.length, 1);
});
