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

test("hot read routes issue their D1 reads as a concurrent wave (Promise.all), not sequentially", () => {
  for (const fn of ["async function apiDashboard(", "async function apiCrew(", "async function rotationSections("]) {
    const b = body(fn);
    assert.match(b, /await Promise\.all\(\[/, fn + " lost its concurrent query wave — each sequential `await env.DB` re-adds a full Worker->D1 round trip on the hot path");
  }
});

test("ensure* schema guards stay memoized (once per isolate), not per-request DDL", () => {
  assert.match(SRC, /function memoEnsure\(/, "memoEnsure helper removed");
  for (const g of ["ensureKeyman", "ensureTravel", "ensureCrewExtras", "ensureReady", "ensureContractEdit"]) {
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
