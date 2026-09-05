import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Perf invariants from the 2026-07-17 round-trip fix (PR #60). The production D1 is tiny and
// sub-millisecond; console latency comes from Worker->D1 ROUND TRIPS. That fix collapsed the hot
// read routes into concurrent waves and stopped re-running ensure* DDL on every request. These
// are unit-untestable behaviours (latency-bound, not output-bound), so — same approach as
// sqlsafety.test.js — we statically pin the load-bearing patterns so a future edit (human or
// nightly agent) cannot quietly regress them. If one of these fails, do NOT weaken the test:
// restore the pattern, or consciously change the SOP with review (CLAUDE.md §2, §11).
const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

// Slice out one function's body (from its declaration to the next top-level "async function"/
// "function" declaration). Coarse but stable for static pinning.
function body(name) {
  const i = SRC.indexOf(name);
  assert.notEqual(i, -1, name + " not found in worker.js");
  const rest = SRC.slice(i + name.length);
  const j = rest.search(/\n(?:async )?function \w+\(/);
  return rest.slice(0, j === -1 ? undefined : j);
}

// Sequential `await env.DB.prepare` statements each function may keep (post-write read-backs etc.).
// Lowering a number is fine; raising one is a perf regression and needs a reason in the PR.
const SEQ_READ_ALLOW = {
  "async function apiDashboard(": 0, "async function apiCrew(": 0, "async function rotationSections(": 0,
  "async function apiCrewOne(": 0, "async function apiRotationCrew(": 0, "async function loadFeedbackState(": 0,
};

test("hot read routes issue their D1 reads as a concurrent wave (Promise.all), not sequentially", () => {
  for (const fn of [
    "async function apiDashboard(", "async function apiCrew(", "async function rotationSections(",
    // 2026-09: the per-crew card/rotation reads and the feedback board/queue were still sequential.
    "async function apiCrewOne(", "async function apiRotationCrew(",
    // 2026-09-05: the feedback board + scoring queue read ONE shared state (loadFeedbackState).
    "async function loadFeedbackState(",
  ]) {
    const b = body(fn);
    assert.match(b, /await Promise\.all\(\[/, fn + " lost its concurrent query wave — each sequential `await env.DB` re-adds a full Worker->D1 round trip on the hot path");
    // The wave must be the READ wave, not just the ensure wave: an `await Promise.all([ensureX(env), ...])`
    // alone satisfied the line above while the reads went back to sequential (2026-09-05 review).
    assert.match(b, /Promise\.all\(\[[^\]]*env\.DB\.prepare\(/, fn + " has a Promise.all but its D1 reads are not inside it");
    const seq = (b.match(/^\s*(?:const|let|var)?\s*[\w\[\], {}]*=?\s*await env\.DB\.prepare\(/mg) || []).length;
    assert.ok(seq <= SEQ_READ_ALLOW[fn], fn + " has " + seq + " sequential `await env.DB.prepare` statements (allowed " + SEQ_READ_ALLOW[fn] + ")");
  }
});

test("feedback board + scoring queue issue no D1 reads of their own — they consume loadFeedbackState", () => {
  for (const fn of ["async function apiFeedbackBoard(", "async function apiScoreQueue("]) {
    const b = body(fn);
    assert.doesNotMatch(b, /env\.DB\.prepare\(/, fn + " reads D1 directly again — two views, two waves, and a second status rule");
    assert.match(b, /loadFeedbackState\(env\)/, fn + " must fall back to loadFeedbackState");
  }
  const tool = SRC.slice(SRC.indexOf('name === "scoring_board"'), SRC.indexOf('name === "billing_range"'));
  assert.match(tool, /loadFeedbackState\(env\)/, "Maria's scoring_board must load the state once");
  assert.match(tool, /Promise\.all\(\[apiFeedbackBoard/, "Maria's scoring_board must render both views concurrently");
});

test("cold-start ensure guards seed/DDL in ONE batch, not one round trip per statement", () => {
  for (const fn of ["async function ensureUsersImpl(", "async function ensureMariaKBImpl(", "async function ensureFbImpl("]) {
    const b = body(fn);
    assert.match(b, /env\.DB\.batch\(/, fn + " lost its batch");
    assert.doesNotMatch(b, /\.run\(\)/, fn + " has a sequential .run() again");
  }
  const intel = body("async function ensureIntelImpl(");
  assert.match(intel, /env\.DB\.batch\(/, "ensureIntelImpl CREATEs must be batched");
  assert.equal((intel.match(/\.run\(\)/g) || []).length, 2, "only the two ALTERs may run alone (a failing ALTER would abort a batch)");
});

test("ensure* schema guards stay memoized (once per isolate), not per-request DDL", () => {
  assert.match(SRC, /function memoEnsure\(/, "memoEnsure helper removed");
  for (const g of [
    "ensureKeyman", "ensureTravel", "ensureCrewExtras", "ensureReady", "ensureContractEdit",
    // 2026-09: these four were still raw — DDL on every feedback/intel/Maria/login request.
    "ensureUsers", "ensureMariaKB", "ensureFb", "ensureIntel",
  ]) {
    assert.match(SRC, new RegExp("const " + g + " = memoEnsure\\("), g + " is no longer memoized — its CREATE/ALTER DDL would run on every request again");
  }
});

test("every /api response is stamped with Server-Timing (the measurement instrument)", () => {
  assert.match(SRC, /Server-Timing/, "Server-Timing instrumentation removed — perf regressions become invisible again");
});

test("dashboard compliance counts stay consolidated into one pass over crew", () => {
  const b = body("async function apiDashboard(");
  // One aggregate query instead of five COUNT(*) round trips.
  assert.match(b, /SUM\(CASE WHEN med_exp/, "apiDashboard compliance counts were split back into separate queries");
});
