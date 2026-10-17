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

test("defaultScoreLeg: a contract signing off in a week is pre-scored before an older unscored one", () => {
  const legs = [
    { ship: "Apex", sc: "X", ours: true, on: "2026-04-01", off: "2026-10-24", is_current: true },
    { ship: "Edge", sc: "X", ours: true, on: "2025-09-01", off: "2026-03-20", is_current: false },
  ];
  const r = defaultScoreLeg(legs, "X", T17);
  assert.equal(r.leg.ship, "Apex"); // 7 days to go < 211 days since Edge ended
  assert.equal(r.why, "current");
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

test("defaultScoreLeg: the fallbacks are unchanged — ended when nothing runs, next when nothing ended, null when nothing", () => {
  assert.equal(defaultScoreLeg([{ ship: "Edge", sc: "X", ours: true, on: "2026-02-01", off: "2026-09-01" }], "X", T17).why, "ended");
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
  assert.match(src, /import \{ classifyWindow, defaultScoreLeg \} from "\.\/scorequeue\.js"/);
});
