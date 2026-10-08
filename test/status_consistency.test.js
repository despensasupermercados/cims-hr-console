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
    assert.match(b, /scheduleBySc\(HIST\)/, fn + " must feed the board legs into scheduleBySc");
  }
});

test("rotationSections seats a crew from TDG's file, never from a schedule self-heal (5 Oct 2026)", () => {
  const b = body("async function rotationSections(");
  assert.doesNotMatch(b, /schedEff|schedRows|SHIP_HISTORY\.filter/, "the self-heal placement (and its SHIP_HISTORY backfill) is gone: the seat is the file's");
  assert.match(b, /if \(w && w\.status === "On board" && w\.known && !absentSince\[sc\]\) \{/, "a green seat needs the file On board a known hull, and the crew still in the file");
  assert.match(b, /const off = completedOff\(HIST, sc, w\.key, today, keyOf\);/, "a contract the console KNOWS completed on that hull goes underneath");
  // A TBA sign-off is still aboard: the live-leg test reads the Counter's current flag, not the date.
  assert.match(b, /if \(h && h\.ours && h\.sc && h\.is_current && h\.on && h\.on <= today\) liveLeg\.add/);
});

// 2026-09-05: the feedback board + scoring queue gated on the RAW imported crew.status — a crew the
// board showed "On board" could sit on the feedback board as feedback-due. One rule, everywhere.
test("feedback board + scoring queue derive status with crewStatus() over the live schedule, never raw crew.status", () => {
  const st = body("async function loadFeedbackState(");
  assert.match(st, /crewStatus\(c, ovm\[c\.agency_id\], sched\[c\.agency_id\], today\)/, "status must come from crewStatus over scheduleBySc(HIST)");
  assert.match(st, /FROM crew_override/, "the manual status/retired override must be part of the rule");
  const fb = body("async function apiFeedbackBoard(");
  assert.doesNotMatch(fb, /DUE\[c\.status\]|c\.status in DUE/, "feedback board gates on raw crew.status again");
  assert.doesNotMatch(fb, /FROM ship_leg/, "feedback board reads ship_leg directly again instead of the board schedule");
  const sq = body("async function apiScoreQueue(");
  assert.doesNotMatch(sq, /status: c\.status/, "scoring queue reports raw crew.status again");
});

test("the crew importer receives the ONE live schedule (boardLegs) from the worker — never its own copy", () => {
  // openProjections (5 Oct 2026) is the same rule for the yellow cards: the worker's fetchOpenAssignments,
  // handed in, so the importer compares the file against the ONE projection feed and never its own query.
  // absorbCard / recordSignoff (7 Oct 2026): the relief board's own remover and the edit writer, handed in the same way.
  assert.match(SRC, /handleCrewImport\(request, url, env, session, \{ boardLegs, openProjections: fetchOpenAssignments, ensureRegistrySnapshot, absorbCard: removeReliefAssignment, recordSignoff: recordSignoffEdit, moveCard: saveReliefAssignment, createCard: createEarmarkCard, sendMail: sendViaMailer, recipient: deployRecipient, cc: deployCc, dismissed: dismissedEarmarks, markTold: \(env, id\) => markDeployed\(env, id, null, new Date\(\)\.toISOString\(\)\) \}\)/, "worker must hand boardLegs (and the ONE projection feed) to the importer");
  const routes = readFileSync(new URL("../src/crew_import_routes.js", import.meta.url), "utf-8");
  assert.doesNotMatch(routes, /FROM ship_leg|FROM assignment|SHIP_HISTORY/, "the importer must not read the schedule tables itself");
});

test("boardLegs reads ship_leg AND the relief board's in-force assignments, in one wave", () => {
  const b = body("async function boardLegs(");
  assert.match(b, /Promise\.all\(\[/, "boardSource + boardLegsFromDb must fire together (one round trip)");
  assert.match(b, /boardLegsFromDb\(env, TODAY\(\)\)/);
  assert.match(b, /throw db\.e/, "a live-source read failure must fail loud, never serve the frozen constant");
});

test("no route iterates the frozen constant directly: Score Card dates and the scoring queue read the live board", () => {
  assert.doesNotMatch(SRC, /for \(const h of SHIP_HISTORY\)/, "a route still loops over the July SHIP_HISTORY snapshot");
  // apiScoreQueue takes its legs from loadFeedbackState (one wave shared with the feedback board).
  for (const [fn, src] of [["async function apiBonusCrew(", "async function apiBonusCrew("], ["async function apiScoreQueue(", "async function loadFeedbackState("]]) {
    const b = body(fn), w = body(src);
    assert.match(w, /boardLegs\(env\)/, src + " must take the schedule from boardLegs(env)");
    assert.match(b, /for \(const h of HIST\)/, fn + " must consume the live legs (HIST)");
    assert.doesNotMatch(b, /SHIP_HISTORY/, fn + " must not touch the frozen constant at all");
    assert.match(w, /Promise\.all\(\[[^\]]*boardLegs\(env\)/, src + " must fetch boardLegs inside its read wave, not as an extra round trip (§12)");
  }
});

test("no route places a crew off the frozen constant: rotationSections never touches SHIP_HISTORY", () => {
  const b = body("async function rotationSections(");
  assert.doesNotMatch(b, /for \(const h of SHIP_HISTORY\)/, "rotationSections must not iterate the bare constant for placement");
  assert.doesNotMatch(b, /SHIP_HISTORY\.(filter|map|concat)/, "nor read it at all: the seat is TDG's file");
});

// §11 + import decision D6 (2026-09-09). crew_override.status is a MANUAL PIN: crewStatus()
// returns it verbatim and never reaches deriveStatus(). apiCrewAdd used to seed it with the
// starting status, which froze every manually added crew at that value for good — they stayed
// "Earmarked" after signing on, and the TDG file (which drives status under D6) could not move
// them either; only a D3 override-conflict ratification could clear it. The base crew.status is
// the correct home: deriveStatus falls back to it as `imported` when there is no dated leg.
test("apiCrewAdd does not seed crew_override.status (that pin disables schedule derivation)", () => {
  const add = body("async function apiCrewAdd(");
  const ins = add.slice(add.indexOf("INSERT INTO crew_override"));
  const cols = ins.slice(ins.indexOf("(") + 1, ins.indexOf(")"));
  assert.ok(cols.includes("agency_id"), "expected to find the crew_override column list, got: " + cols);
  assert.ok(!/\bstatus\b/.test(cols),
    "apiCrewAdd must not write status into crew_override — it permanently pins the crew's status. Columns: " + cols);
  assert.match(add, /INSERT INTO crew\b/, "the base crew row (which carries the starting status) must still be written");
});

// The Fleet Document Radar is a fourth view of the same seafarers, and it was the last one still
// reading the raw column: `COALESCE(o.status, c.status)` straight out of SQL. That is whatever the
// last AdvancedQuery import happened to say, so the weekly email could contradict the Crew tab —
// and `deployable`, which decides urgency, was decided by it. It now derives status like every
// other view, from boardLegs(env) handed in by the worker.
const RADAR = readFileSync(new URL("../src/doc_radar.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/[ \t]\/\/ [^\n"'`]*$/gm, "");

test("the doc radar derives status with crewStatus(), never from a raw status column", () => {
  assert.match(RADAR, /import \{[^}]*crewStatus[^}]*\} from "\.\/crew_status\.js"/,
    "doc_radar must share the ONE status rule, not keep its own");
  assert.match(RADAR, /crewStatus\(b, ov, sched\[b\.agency_id\], todayStr\)/,
    "status has to be derived per crew from the schedule");
  assert.doesNotMatch(RADAR, /COALESCE\(o\.status/,
    "a raw crew.status read in SQL is exactly the regression §11 forbids");
  assert.match(RADAR, /deps\.boardLegs \? deps\.boardLegs\(env\)/,
    "the schedule must come from the worker's boardLegs(env), never a local copy");
});

test("every doc radar entry point in the worker hands over boardLegs", () => {
  for (const fn of ["docRadarPreviewResponse", "docRadarSendResponse", "maybeSendDocRadar"]) {
    const re = new RegExp(fn + "\\([^)]*\\{ boardLegs \\}\\)");
    assert.match(SRC, re, fn + " must be given the live board, or it silently reports registry status");
  }
});

test("scheduleBySc and crewStatus live in ONE module, not copied per caller", () => {
  const MOD = readFileSync(new URL("../src/crew_status.js", import.meta.url), "utf8");
  assert.match(MOD, /export function scheduleBySc/);
  assert.match(MOD, /export function crewStatus/);
  // worker.js must import them rather than redeclare them (§3: deployed code equals tested code).
  assert.match(SRC, /import \{ scheduleBySc, crewStatus, NOT_IN_FILE, TDG_ABSENT_JOIN, TDG_ABSENT_COL \} from "\.\/crew_status\.js"/);
  assert.doesNotMatch(SRC, /^function (scheduleBySc|crewStatus)\(/m,
    "a second local copy is how two views start disagreeing");
});

test("scheduleBySc carries is_current through to deriveStatus (the overdue rule needs it; 5 Oct 2026)", async () => {
  const { scheduleBySc, crewStatus } = await import("../src/crew_status.js");
  const m = scheduleBySc([
    { ours: true, sc: "SC-1", on: "2026-01-10", off: "2026-07-10", is_current: 1 },
    { ours: true, sc: "SC-2", on: "2026-01-10", off: "2026-07-10", is_current: 0 },
    { ours: false, sc: "SC-3", on: "2026-01-10", off: "2026-07-10", is_current: 1 },
  ]);
  assert.deepEqual(m["SC-1"], [{ on: "2026-01-10", off: "2026-07-10", is_current: true, ship: null }]);
  assert.deepEqual(m["SC-2"], [{ on: "2026-01-10", off: "2026-07-10", is_current: false, ship: null }]);
  assert.equal(m["SC-3"], undefined, "not ours: not on the schedule");
  assert.equal(crewStatus({ status: "On board" }, {}, m["SC-1"], "2026-10-05"), "On board", "overdue seat: held");
  assert.equal(crewStatus({ status: "On board" }, {}, m["SC-2"], "2026-10-05"), "On Vacation", "closed leg: signed off");
  assert.equal(crewStatus({ status: "On board" }, { status: "Earmarked" }, m["SC-1"], "2026-10-05"), "Earmarked", "a manual edit still wins");
});

// Miguel, 5 Oct 2026: "TDG is the one true source of knowledge". The file's status stands; the schedule
// decides only where the file has no readable word; a crew the latest file dropped says so.
test("crewStatus: retired > manual > not in the TDG file > the file's word (unless the console KNOWS the contract on that hull ended) > schedule", async () => {
  const { crewStatus, knownCompleted, NOT_IN_FILE } = await import("../src/crew_status.js");
  const T = "2026-10-05";
  const aboardLeg = [{ on: "2026-05-01", off: "2026-11-01", is_current: true, ship: "Xcel" }];
  assert.equal(crewStatus({ status: "Earmarked" }, {}, aboardLeg, T), "Earmarked", "Purnama: the Counter leg does not overrule TDG's Earmarked");
  assert.equal(crewStatus({ status: "On board" }, {}, [], T), "On board", "Eresmas / Sapungan: aboard per TDG with no leg at all");
  assert.equal(crewStatus({ status: "On board", tdg_absent: 1 }, {}, aboardLeg, T), NOT_IN_FILE, "Jaramiz: dropped from the file");
  assert.equal(crewStatus({ status: "On board", tdg_absent: 0 }, {}, [], T), "On board");
  assert.equal(crewStatus({ status: "On board", tdg_absent: 1 }, { status: "Earmarked" }, [], T), "Earmarked", "a manual edit still wins");
  assert.equal(crewStatus({ status: "On board", tdg_absent: 1 }, { retired: 1 }, [], T), "Inactive"); // the manual tag reads Inactive (8 Oct 2026: Inactive replaces Retired)
  // Calayag: recorded sign-off 25 Sep on Navigator, the 5 Oct file still On board Navigator -> On Vacation
  const calayag = [{ on: "2026-02-02", off: "2026-09-25", is_current: false, ship: "Navigator" }];
  assert.equal(crewStatus({ status: "On board", tdg_ship: "MV NAVIGATOR OF THE SEAS" }, {}, calayag, T), "On Vacation");
  // Santos: recorded off Quest 29 Jul, the file has him On board WONDER -> a new contract, On board
  const santos = [{ on: "2026-01-06", off: "2026-07-29", is_current: false, ship: "Quest" }];
  assert.equal(crewStatus({ status: "On board", tdg_ship: "MV WONDER OF THE SEAS" }, {}, santos, T), "On board");
  // An overdue CURRENT leg is not a completion (§11): the file's word stands.
  assert.equal(crewStatus({ status: "On board", tdg_ship: "Freedom" }, {}, [{ on: "2025-12-08", off: "2026-08-22", is_current: true, ship: "Freedom" }], T), "On board");
  // No readable file word: the schedule decides, as before.
  assert.equal(crewStatus({ status: null }, {}, aboardLeg, T), "On board");
  assert.equal(knownCompleted([], T), false);
  assert.equal(knownCompleted([{ on: "2025-01-01", off: "2025-07-01", is_current: false, ship: "Anthem" }], T, "Anthem"), false, "older than 180 days: a new contract the Counter does not carry");
});

test("every crew read that feeds crewStatus carries the not-in-TDG-file column, by one shared join (no extra round trip)", () => {
  for (const fn of ["async function apiDataStatus(", "async function apiDashboard(", "async function apiCrew(", "async function apiCompliance(", "async function rotationSections(", "async function loadFeedbackState("]) {
    const b = body(fn);
    assert.match(b, /crewStatus\(/, fn + " derives status");
    assert.match(b, /" \+ TDG_ABSENT_COL \+ " FROM crew " \+ TDG_ABSENT_JOIN \+ " WHERE redacted=/, fn + " must read tdg_absent / tdg_ship with the shared join");
  }
  const DR = readFileSync(new URL("../src/doc_radar.js", import.meta.url), "utf8");
  assert.match(DR, /TDG_ABSENT_COL \+ " " \+\s*"FROM crew " \+ TDG_ABSENT_JOIN \+ " WHERE redacted=0"/, "the doc radar too");
});
