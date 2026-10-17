import { test } from "node:test";
import assert from "node:assert/strict";
import { dayDiff, classifyWindow } from "../src/scorequeue.js";

const TODAY = "2026-06-24";

test("dayDiff: whole days, null on bad input", () => {
  assert.equal(dayDiff("2026-06-24", "2026-06-24"), 0);
  assert.equal(dayDiff("2026-06-24", "2026-06-30"), 6);
  assert.equal(dayDiff("2026-06-24", "2026-06-10"), -14);
  assert.equal(dayDiff("", "2026-06-10"), null);
  assert.equal(dayDiff("2026-06-24", "not-a-date"), null);
  assert.equal(dayDiff(null, null), null);
});

test("classifyWindow: recent = signed off within the last 14 days (incl today)", () => {
  assert.equal(classifyWindow("2026-06-24", TODAY), "recent");  // today
  assert.equal(classifyWindow("2026-06-20", TODAY), "recent");  // 4 days ago
  assert.equal(classifyWindow("2026-06-10", TODAY), "recent");  // exactly 14 days ago
  assert.equal(classifyWindow("2026-06-09", TODAY), null);      // 15 days ago -> out
});

test("classifyWindow: upcoming = signing off within the next 14 days", () => {
  assert.equal(classifyWindow("2026-06-25", TODAY), "upcoming"); // tomorrow
  assert.equal(classifyWindow("2026-07-08", TODAY), "upcoming"); // exactly 14 days out
  assert.equal(classifyWindow("2026-07-09", TODAY), null);       // 15 days out -> out
});

test("classifyWindow: unparseable / null sign-off -> null", () => {
  assert.equal(classifyWindow(null, TODAY), null);
  assert.equal(classifyWindow("", TODAY), null);
  assert.equal(classifyWindow("bad", TODAY), null);
});

test("classifyWindow: custom window size", () => {
  assert.equal(classifyWindow("2026-06-04", TODAY, 30), "recent");  // 20 days ago, 30-day window
  assert.equal(classifyWindow("2026-06-04", TODAY, 14), null);      // 20 days ago, 14-day window
});

/* ---- THE CONTRACT THE SCORE CARD OPENS ON (night watch, 17 Oct 2026) ---- */
import { defaultScoreLeg, SCORE_RECENT_DAYS } from "../src/scorequeue.js";
import { readFileSync } from "node:fs";

const T17 = "2026-10-17";
// Jim Olid on the 17 Oct 2026 board: the Symphony Counter contract ended 23 Aug (history, nobody scored it);
// TDG's file has him On board Odyssey since 7 Oct, projected off in May 2027.
const OLID = [
  { ship: "Symphony", sc: "SC-0040153", ours: true, on: "2026-03-15", off: "2026-08-23", is_current: false },
  { ship: "Odyssey", sc: "SC-0040153", ours: true, on: "2026-10-07", off: "2027-05-07", is_current: true },
  { ship: "Anthem", sc: "SC-0099999", ours: true, on: "2026-01-01", off: "2026-10-01", is_current: false }, // another crew
  { ship: "Jewel", sc: "SC-0040153", ours: false, on: "2026-01-01", off: "2026-02-01", is_current: false },  // not ours
];

test("defaultScoreLeg: an ended contract nobody scored comes before the one that just began (Olid, 17 Oct 2026)", () => {
  const r = defaultScoreLeg(OLID, "SC-0040153", T17, { outcomes: [] });
  assert.equal(r.leg.ship, "Symphony");
  assert.equal(r.why, "ended_unscored");
});

test("defaultScoreLeg: once the ended contract has an outcome, the running one is next", () => {
  const outs = [{ span_start: "2026-03-15", span_end: "2026-08-23" }];
  const r = defaultScoreLeg(OLID, "SC-0040153", T17, { outcomes: outs });
  assert.equal(r.leg.ship, "Odyssey");
  assert.equal(r.why, "current");
});

test("defaultScoreLeg: oldest first — an unscored ended contract comes before a running one, even one signing off in a week (Miguel, 17 Oct 2026)", () => {
  const legs = [
    { ship: "Apex", sc: "X", ours: true, on: "2026-06-01", off: "2026-10-24", is_current: true },
    { ship: "Edge", sc: "X", ours: true, on: "2025-10-01", off: "2026-05-01", is_current: false },
  ];
  const r = defaultScoreLeg(legs, "X", T17);
  assert.equal(r.leg.ship, "Edge"); // the night watch's first cut opened Apex (7 days to go < 169 days since Edge ended)
  assert.equal(r.why, "ended_unscored");
});

test("defaultScoreLeg: an unscored contract older than SCORE_RECENT_DAYS does not outrank a running one", () => {
  assert.equal(SCORE_RECENT_DAYS, 180);
  const legs = [
    { ship: "Apex", sc: "X", ours: true, on: "2026-10-01", off: "2027-05-01", is_current: true },
    { ship: "Edge", sc: "X", ours: true, on: "2025-06-01", off: "2026-01-10", is_current: false }, // 280 days ago
  ];
  assert.equal(defaultScoreLeg(legs, "X", T17).leg.ship, "Apex");
});

test("defaultScoreLeg: a running contract with no sign-off yet (TBA) still yields to a recent unscored one", () => {
  const legs = [
    { ship: "Apex", sc: "X", ours: true, on: "2026-10-01", off: null, is_current: true },
    { ship: "Edge", sc: "X", ours: true, on: "2026-02-01", off: "2026-09-01", is_current: false },
  ];
  const r = defaultScoreLeg(legs, "X", T17);
  assert.equal(r.leg.ship, "Edge");
});

test("defaultScoreLeg: the fallbacks — a recent ended one is unscored, an old one ended, next when nothing ended, null when nothing", () => {
  assert.equal(defaultScoreLeg([{ ship: "Edge", sc: "X", ours: true, on: "2026-02-01", off: "2026-09-01" }], "X", T17).why, "ended_unscored");
  assert.equal(defaultScoreLeg([{ ship: "Edge", sc: "X", ours: true, on: "2025-09-01", off: "2026-03-01" }], "X", T17).why, "ended"); // past SCORE_RECENT_DAYS
  const next = defaultScoreLeg([{ ship: "Edge", sc: "X", ours: true, on: "2026-11-01", off: "2027-06-01" }], "X", T17);
  assert.equal(next.why, "next"); assert.equal(next.leg.ship, "Edge");
  assert.equal(defaultScoreLeg([], "X", T17).leg, null);
  assert.equal(defaultScoreLeg(null, "X", T17).why, "none");
  // two ended: the latest; two running: the one ending last (as before)
  const two = defaultScoreLeg([
    { ship: "A", sc: "X", ours: true, on: "2025-01-01", off: "2025-08-01" }, { ship: "B", sc: "X", ours: true, on: "2025-09-01", off: "2026-04-01" }], "X", T17);
  assert.equal(two.leg.ship, "B");
});

test("apiBonusCrew opens the Score Card through defaultScoreLeg, never the inline 'current first' loop", () => {
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const i = src.indexOf("async function apiBonusCrew(");
  assert.ok(i > 0, "apiBonusCrew found");
  const body = src.slice(i, src.indexOf("\nasync function apiContracts(", i));
  assert.match(body, /defaultScoreLeg\(HIST, cr\.agency_id, td, \{ outcomes: outs\.results \|\| \[\] \}\)/);
  assert.doesNotMatch(body, /const sched = current \|\| bestPast \|\| bestFut/);
  assert.match(src, /import \{ classifyWindow, defaultScoreLeg, commitBlock \} from "\.\/scorequeue\.js"/);
});

/* ---- MIGUEL'S ANSWERS OF 17 OCT 2026: one contract per transfer, after the sign-off, oldest first, TDG ends it ---- */
import { scoreContracts, commitBlock } from "../src/scorequeue.js";

// Jaramiz Melen Tuazon: relieved on Explorer by Espenilla on 23 Aug, aboard Jewel from 28 Aug — one contract, TDG's count.
const TUAZON = [
  { ship: "Explorer", sc: "SC-0046075", ours: true, on: "2026-06-06", off: "2026-08-23", is_current: false, source: "counter" },
  { ship: "Jewel", sc: "SC-0046075", ours: true, on: "2026-08-28", off: "2027-03-28", is_current: true, source: "registry" },
];

test("scoreContracts: a transfer (21 days or less between ships) is ONE contract; 22 days, an overlap or a running leg are not", () => {
  const C = scoreContracts(TUAZON, "SC-0046075");
  assert.equal(C.length, 1);
  assert.deepEqual(C[0].ships, ["Explorer", "Jewel"]);
  assert.equal(C[0].on, "2026-06-06"); assert.equal(C[0].off, "2027-03-28"); assert.equal(C[0].current, true);
  const leg = (ship, on, off, cur = false) => ({ ship, sc: "X", ours: true, on, off, is_current: cur });
  assert.equal(scoreContracts([leg("A", "2026-01-01", "2026-03-01"), leg("B", "2026-03-22", "2026-08-01")], "X").length, 1, "21 days: a transfer");
  assert.equal(scoreContracts([leg("A", "2026-01-01", "2026-03-01"), leg("B", "2026-03-23", "2026-08-01")], "X").length, 2, "22 days: a holiday");
  assert.equal(scoreContracts([leg("A", "2026-01-01", "2026-05-01"), leg("A", "2026-04-08", "2026-10-01")], "X").length, 2, "an overlap is TDG's two files disagreeing, never merged here (§11d)");
  assert.equal(scoreContracts([leg("A", "2026-01-01", "2026-03-01", true), leg("B", "2026-03-10", "2026-08-01")], "X").length, 2, "a running contract absorbs nothing");
  assert.equal(scoreContracts([{ ...leg("A", "2026-01-01", "2026-03-01"), visit: true }], "X").length, 0, "a training visit is no contract");
});

test("defaultScoreLeg + commitBlock: the first leg of a transfer is never scored alone while the contract runs (Tuazon)", () => {
  const d = defaultScoreLeg(TUAZON, "SC-0046075", T17);
  assert.equal(d.why, "current"); assert.equal(d.leg.ship, "Explorer, Jewel"); assert.equal(d.leg.on, "2026-06-06");
  const blk = commitBlock(TUAZON, "SC-0046075", T17, [], "2026-06-06", "2026-08-23");
  assert.equal(blk.error, "still_aboard", "the Explorer leg alone used to be committable: the count went 0 -> 1 -> 2 on one TDG contract");
  assert.equal(commitBlock(TUAZON, "SC-0046075", T17, [], "2026-06-06", "2027-03-28").error, "not_ended");
});

test("commitBlock: TDG still On board past the sign-off waits for TDG (Belhida, Apex, 7 Oct 2026)", () => {
  const BEL = [{ ship: "Apex", sc: "SC-0037752", ours: true, on: "2026-03-14", off: "2026-10-07", is_current: true, heldByFile: true, offSource: "tdg" }];
  assert.equal(defaultScoreLeg(BEL, "SC-0037752", T17).why, "held");
  const blk = commitBlock(BEL, "SC-0037752", T17, [], "2026-03-14", "2026-10-07");
  assert.equal(blk.error, "held_by_tdg"); assert.equal(blk.ship, "Apex"); assert.equal(blk.off, "2026-10-07");
  // past a PROJECTED sign-off (overdue, not gone, §10d): still running, scored once TDG ends it
  const OVR = [{ ship: "Edge", sc: "X", ours: true, on: "2026-02-01", off: "2026-09-01", is_current: true, offSource: "projected" }];
  assert.equal(commitBlock(OVR, "X", T17, [], "2026-02-01", "2026-09-01").error, "still_aboard");
  // once TDG ends it (a debark date: not current), it may be committed
  const END = [{ ship: "Edge", sc: "X", ours: true, on: "2026-02-01", off: "2026-09-01", is_current: false, offSource: "tdg" }];
  assert.equal(commitBlock(END, "X", T17, [], "2026-02-01", "2026-09-01"), null);
});

test("commitBlock: oldest first — a newer contract waits while an older one inside SCORE_RECENT_DAYS has no outcome", () => {
  const legs = [
    { ship: "Edge", sc: "X", ours: true, on: "2025-10-01", off: "2026-05-01", is_current: false },
    { ship: "Apex", sc: "X", ours: true, on: "2026-06-01", off: "2026-10-05", is_current: false },
  ];
  const blk = commitBlock(legs, "X", T17, [], "2026-06-01", "2026-10-05");
  assert.equal(blk.error, "older_first"); assert.equal(blk.ship, "Edge"); assert.equal(blk.on, "2025-10-01");
  assert.equal(commitBlock(legs, "X", T17, [], "2025-10-01", "2026-05-01"), null, "the older one first");
  assert.equal(commitBlock(legs, "X", T17, [{ span_start: "2025-10-01", span_end: "2026-05-01" }], "2026-06-01", "2026-10-05"), null, "then the newer");
  const old = [{ ...legs[0], on: "2025-06-01", off: "2026-01-10" }, legs[1]]; // ended 280 days ago: the baseline's, not a block
  assert.equal(commitBlock(old, "X", T17, [], "2026-06-01", "2026-10-05"), null);
});

test("commitBlock: a training visit is not scored; a span the board does not know is left to the commit's own checks", () => {
  const V = [{ ship: "Pursuit", sc: "SC-0041465", ours: true, on: "2026-10-16", off: "2026-10-16", is_current: false, visit: true }];
  assert.equal(commitBlock(V, "SC-0041465", T17, [], "2026-10-16", "2026-10-16").error, "visit");
  assert.equal(defaultScoreLeg(V, "SC-0041465", T17).why, "none");
  assert.equal(commitBlock([], "X", T17, [], "2026-01-01", "2026-07-01"), null);
  assert.equal(commitBlock([], "X", T17, [], "2026-01-01", "2026-11-01").error, "not_ended", "the sign-off has not come, whatever the board says");
  assert.equal(commitBlock([], "X", T17, [], "", "2026-07-01"), null, "span_required answers a blank span");
});

test("apiBonusCommit refuses on commitBlock BEFORE it writes anything, and the page says why in words", () => {
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const i = src.indexOf("async function apiBonusCommit(");
  const body = src.slice(i, src.indexOf("\n/* ----------------------- feedback windows", i));
  const blk = body.indexOf("commitBlock(HIST, cr.agency_id, TODAY(), prior.results || [], b.spanStart, b.spanEnd)");
  assert.ok(blk > 0, "the commit asks commitBlock on the board schedule");
  assert.ok(blk < body.indexOf("INSERT INTO contract") && blk < body.indexOf("commitEvidence("), "before the evidence read and the writes");
  assert.match(body, /if \(blk\) return json\(blk, 409\);/);
  const crew = src.slice(src.indexOf("async function apiBonusCrew("), src.indexOf("\nasync function apiContracts("));
  assert.match(crew, /scoring: \{ why: pickd\.why, block \}/);
  for (const e of ["not_ended", "held_by_tdg", "still_aboard", "visit", "older_first"]) assert.ok(src.includes("e.error==='" + e + "'"), "the page words " + e);
  assert.match(src, /alert\(msgs\[res\.error\]\|\|scBlockMsg\(res\)\|\|/);
});
