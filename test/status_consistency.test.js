import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// CLAUDE.md §11: status is derived at read time from the SCHEDULE, consistently in apiCrew,
// apiRotation AND apiDashboard. Until 2026-09-04 that was only true for the rotation board:
// apiCrew and apiDashboard called scheduleBySc() with NO argument, which silently fell back to
// the frozen SHIP_HISTORY code constant — so the crew list and the dashboard donut derived
// status from a July snapshot while the board read live data. Static pins, same approach as
// perf_invariants / sqlsafety (the behaviour is DB-bound and not unit-testable end to end).
// Inspect CODE, not prose: the comments around boardLegs deliberately describe the old bare call.
const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/[ \t]\/\/ [^\n"'`]*$/gm, "");

function body(name) {
  const i = SRC.indexOf(name);
  assert.notEqual(i, -1, name + " not found in worker.js");
  const rest = SRC.slice(i + name.length);
  const j = rest.search(/\n(?:async )?function \w+\(/);
  return rest.slice(0, j === -1 ? undefined : j);
}

test("no route derives status from the frozen constant: scheduleBySc() is never called bare", () => {
  assert.doesNotMatch(SRC, /scheduleBySc\(\s*\)/, "a bare scheduleBySc() call silently reads SHIP_HISTORY instead of the live board");
  assert.doesNotMatch(SRC, /legs \|\| SHIP_HISTORY/, "scheduleBySc must not fall back to the frozen constant");
});

test("apiCrew, apiDashboard, apiCompliance and rotationSections all take the schedule from boardLegs(env)", () => {
  for (const fn of ["async function apiCrew(", "async function apiDashboard(", "async function apiCompliance(", "async function rotationSections("]) {
    const b = body(fn);
    assert.match(b, /boardLegs\(env\)/, fn + " no longer reads the live board schedule");
    assert.match(b, /scheduleBySc\(HIST\)|scheduleBySc\(HIST\)|boardLegs\(env\),/, fn + " must feed the board legs into scheduleBySc");
  }
});

test("boardLegs reads ship_leg AND the relief board's in-force assignments, in one wave", () => {
  const b = body("async function boardLegs(");
  assert.match(b, /Promise\.all\(\[/, "boardSource + boardLegsFromDb must fire together (one round trip)");
  assert.match(b, /boardLegsFromDb\(env, TODAY\(\)\)/);
  assert.match(b, /throw db\.e/, "a live-source read failure must fail loud, never serve the frozen constant");
});

test("no route iterates the frozen constant directly: Score Card dates and the scoring queue read the live board", () => {
  assert.doesNotMatch(SRC, /for \(const h of SHIP_HISTORY\)/, "a route still loops over the July SHIP_HISTORY snapshot");
  for (const fn of ["async function apiBonusCrew(", "async function apiScoreQueue("]) {
    assert.match(body(fn), /boardLegs\(env\)/, fn + " must take the schedule from boardLegs(env)");
  }
});

test("self-heal placement prefers live board legs; the constant only backfills unknown crew", () => {
  const b = body("async function rotationSections(");
  assert.match(b, /const schedRows = HIST\.concat\(SHIP_HISTORY\.filter\(/);
  assert.match(b, /for \(const h of schedRows\)/);
  assert.doesNotMatch(b, /for \(const h of SHIP_HISTORY\)/, "rotationSections must not iterate the bare constant for placement");
});
