import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// THE CONSOLE USES TWO DATE BASES. This pins which is which. (2026-09-10)
//
// Found during the full code audit. There is no bug here today and this test changes no
// behaviour — it makes an inconsistency VISIBLE so it cannot spread by accident.
//
//   TODAY()     -> new Date().toISOString().slice(0,10)   = UTC calendar day
//   nyDateStr() -> Intl, timeZone America/New_York        = New York calendar day
//
// They disagree for roughly five hours every day (UTC rolls over first). The split is coherent
// once stated:
//   NEW YORK = "when does this FIRE" — cron gating, the weekly Movements email, the daily backup,
//              the doc radar, the forward-leg projection. Wall-clock things for a US audience.
//   UTC      = "what day is it for DATA" — status derivation, the dashboard, billing, crew reads.
//
// Changing a function from one basis to the other moves real dates: a crew can flip to On board a
// day early, or a leg can land in the wrong billing month. That must be a deliberate act with a
// reason, not a copy-paste. If this test fails, someone changed a basis — decide whether that was
// intended and update the list here in the same commit.
//
// It was left as-is deliberately: no symptom has ever been traced to it, and rewriting date
// semantics next to a billing export is risk without a payoff. Revisit only with a real symptom.
const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

test("the two date helpers keep their definitions (this is what makes them differ)", () => {
  assert.match(SRC, /const TODAY = \(\) => new Date\(\)\.toISOString\(\)\.slice\(0, 10\);/,
    "TODAY() must stay the UTC calendar day");
  assert.match(SRC, /function nyDateStr\([\s\S]{0,200}?timeZone: 'America\/New_York'/,
    "nyDateStr() must stay pinned to America/New_York");
});

// Map every call site to its enclosing top-level function.
function callSites(pattern, isDefinition) {
  const out = new Set();
  let cur = "(top level)";
  for (const line of SRC.split("\n")) {
    const m = line.match(/^\s*(?:async )?function (\w+)|^\s*async (\w+)\(.*\) \{/);
    if (m) cur = m[1] || m[2];
    if (pattern.test(line) && !isDefinition(line)) out.add(cur);
  }
  return [...out].sort();
}

test("New York (wall-clock) basis is used by exactly these functions", () => {
  const actual = callSites(/nyDateStr\(/, (l) => /^function nyDateStr/.test(l.trim()));
  assert.deepEqual(actual, [
    "apiMovementsPreview", "apiMovementsSend", "apiRotationUpcoming",
    "mariaExecTool", "maybeExportBackup", "maybeSendMovements", "scheduled",
  ], "a function changed its date basis to New York (or stopped using it) — was that deliberate?");
});

test("UTC basis is used by exactly these functions", () => {
  const actual = callSites(/TODAY\(\)/, (l) => /^const TODAY/.test(l.trim()));
  assert.deepEqual(actual, [
    // The Deploy installer hands TODAY to keyman_deploy.js at module scope, as a lazy arrow: TODAY
    // is a const declared further down, so reading it eagerly there is a temporal-dead-zone crash.
    // The deployment card therefore shares the console's UTC basis, which is the point of listing it.
    "(top level)",
    "apiAsk", "apiBillingMonth", "apiBonusCrew",
    // 2026-09-24: TDG's completed-contract count is stamped with the file's as-of date; when the
    // filename carries none, the import day — the console's UTC day, like every other import.
    "apiContractCountImport",
    "apiCrew",
    // 2026-09-15: a ship on the Add-crew form is a projection (same path and day basis as a drop).
    "apiCrewAdd",
    "apiCrewOne",
    "apiDashboard", "apiDataStatus", "apiDaysWorked", "apiFleet", "apiMariaEval",
    "apiMariaKnowledge",
    // 2026-09-15: a drop creates a projection dated from the board's own day (TODAY, UTC) — the same
    // basis boardLegs/rotationSections use, so "sign-on = today" lands on the day the card shows.
    "apiRotationProject",
    "boardLegs", "loadFeedbackState", "rotationSections",
  ], "a function changed its date basis to UTC (or stopped using it) — was that deliberate?");
});

test("the money-adjacent reads stay on ONE basis as each other", () => {
  // boardLegs feeds status; rotationSections feeds the billing export; apiDashboard must agree with
  // both or the donut and the board disagree by a day. Whatever basis they use, it must be the SAME.
  const utc = callSites(/TODAY\(\)/, (l) => /^const TODAY/.test(l.trim()));
  for (const fn of ["boardLegs", "rotationSections", "apiDashboard", "apiBillingMonth"]) {
    assert.ok(utc.includes(fn), fn + " must share the same date basis as the rest of the read path");
  }
});
