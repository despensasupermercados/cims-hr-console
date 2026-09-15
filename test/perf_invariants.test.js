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
  "async function apiContracts(": 0,
};

test("hot read routes issue their D1 reads as a concurrent wave (Promise.all), not sequentially", () => {
  for (const fn of [
    "async function apiDashboard(", "async function apiCrew(", "async function rotationSections(",
    // 2026-09: the per-crew card/rotation reads and the feedback board/queue were still sequential.
    "async function apiCrewOne(", "async function apiRotationCrew(",
    // 2026-09-05: the feedback board + scoring queue read ONE shared state (loadFeedbackState).
    "async function loadFeedbackState(",
    // 2026-09-10: the contract ledger was still six sequential round trips — two ensures back to
    // back, then four independent reads one after another. It is a user-facing read page and was
    // simply missed when the others were converted.
    "async function apiContracts(",
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

// 15 Sep 2026 — "still takes sooo much to save". The D1 primary is one fixed region; every SEQUENTIAL
// round trip from a distant Worker pays that distance. These pin the save path at its new shape.
test("Add crew writes crew + override + activity_log in ONE batch and places the plan in the background", () => {
  const i = SRC.indexOf("async function apiCrewAdd(");
  const add = SRC.slice(i, SRC.indexOf("\n}\n", i));
  assert.match(add, /await env\.DB\.batch\(writes\)/, "one batch for the three inserts");
  assert.doesNotMatch(add, /\)\.run\(\);/, "no per-statement .run() left on the save path");
  assert.match(add, /if \(ctx && ctx\.waitUntil\) \{ ctx\.waitUntil\(placePlan\(\)\);/, "the projection rides behind the response");
  assert.match(add, /Promise\.all\(\[\s*env\.DB\.prepare\("SELECT agency_id FROM crew WHERE agency_id=\?"\)[^]*?ensureCrewExtras\(env\),\s*\]\)/, "the exists check and the schema guard leave together");
});

test("saveReliefAssignment inserts contract + assignment in ONE batch", () => {
  const R = readFileSync(new URL("../src/relief_api.js", import.meta.url), "utf8");
  const i = R.indexOf("export async function saveReliefAssignment(");
  const fn = R.slice(i, R.indexOf("\n}\n", i));
  assert.match(fn, /await env\.DB\.batch\(\[contractIns, env\.DB\.prepare\("INSERT INTO assignment/);
  assert.doesNotMatch(fn, /INSERT INTO contract[^]*?\.run\(\)/, "the contract insert must not be its own round trip");
});

test("the board's two reads (rotation + relief board) are in flight together, and slow /api requests are logged off the request path", () => {
  const i = SRC.indexOf("async function renderRotation(){");
  const fn = SRC.slice(i, i + 1500);
  assert.match(fn, /var _relP=fetch\('\/api\/relief\/board'\)/, "relief board fetch starts before the rotation await");
  assert.ok(fn.indexOf("var _relP=fetch('/api/relief/board')") < fn.indexOf("var _rr=await fetch('/api/rotation')"));
  assert.match(SRC, /if \(dur > 600 && ctx && ctx\.waitUntil\) ctx\.waitUntil\(logSlowRequest\(/, "slow requests are persisted after the response");
  assert.match(SRC, /const ensurePerfLog = memoEnsure\(/, "perf_log DDL is memoized like every other guard (§12)");
  assert.match(SRC, /async fetch\(request, env, ctx\) \{/, "the handler must accept ctx to have waitUntil at all");
});

// 15 Sep 2026, perf_log from prod: /api/rotation 2043ms, /api/dashboard 1494ms at GRU against the PRG
// primary — nearly all of it the cold-start guards, one ~220ms round trip per statement. Each guard is
// now at most: one batch (CREATEs + reference rows), then ONE more round trip (an ALTER that must stay
// out of the batch, or the ALTER beside a single combined read). Sequential .run()/.first() chains in
// these bodies are the regression this pins against.
test("the board's cold-start guards are two round trips at most, not one per statement", () => {
  const k = body("async function ensureKeymanImpl(");
  assert.match(k, /await Promise\.all\(\[\s*env\.DB\.prepare\("CREATE TABLE IF NOT EXISTS keyman_contract3[^\n]*\.run\(\),\s*env\.DB\.prepare\("CREATE TABLE IF NOT EXISTS data_meta/, "the two CREATEs leave together");
  assert.match(k, /SELECT \(SELECT COUNT\(\*\) FROM keyman_contract3\) AS n, \(SELECT v FROM data_meta WHERE k='keyman_version'\) AS v/, "count + version are ONE read");
  assert.match(k, /await Promise\.all\(\[\s*env\.DB\.prepare\("ALTER TABLE keyman_contract3 ADD COLUMN imported_at TEXT"\)\.run\(\)\.catch/, "the ALTER rides beside the read");
  const c = body("async function ensureCrewExtrasImpl(");
  assert.match(c, /await env\.DB\.batch\(\[/, "crew_override + crew_note_log + the MAN agency row are one batch");
  assert.equal((c.match(/\.run\(\)/g) || []).length, 1, "only the retired-column ALTER runs alone");
  const r = body("async function ensureReadyImpl(");
  assert.match(r, /await Promise\.all\(\[\s*env\.DB\.prepare\("CREATE TABLE IF NOT EXISTS crew_ready/, "CREATE and legacy ALTER leave together");
  const e = body("async function ensureContractEditImpl(");
  assert.match(e, /CREATE TABLE IF NOT EXISTS contract_edit \([^"]*, on_key TEXT, PRIMARY KEY \(sc, seq\)\)/, "the CREATE carries on_key (as a column, before the table constraint) so the ALTER is legacy-only");
  assert.match(e, /await Promise\.all\(\[\s*env\.DB\.prepare\("CREATE TABLE IF NOT EXISTS contract_edit/, "CREATE and ALTER leave together; only the backfill follows");
  const R = readFileSync(new URL("../src/relief_api.js", import.meta.url), "utf8");
  assert.match(R, /const _commentEnsured = new WeakMap\(\);\nfunction ensureCommentTable\(env\)/, "relief_comment DDL is memoized, not per request");
});

test("the board is not blanked while it refreshes after a save or drag", () => {
  const fn = body("async function renderRotation(");
  assert.match(fn, /if\(document\.querySelector\('#view \.shipsec'\)\)\{document\.body\.classList\.add\('rot-refreshing'\);\}/);
  assert.match(fn, /drawRotation\(\); loadAutoToggle\(\); document\.body\.classList\.remove\('rot-refreshing'\);/);
  assert.match(SRC, /body\.rot-refreshing #view\{opacity:\.6/);
});

// 15 Sep 2026, round two. perf_log after PR #117 (Worker GRU, D1 primary PRG): /api/rotation fell from
// 2043ms to 760ms warm but /api/dashboard did not move at all (1494 -> 1636). apiDashboard is the caller
// of ensureTravel, the one guard PR #117 left on the old shape. And the instrument could not say whether
// a slow request paid a cold start or its own reads — so it now measures that too.
test("the travel guard steady-states in ONE round trip, like every other guard", () => {
  const t = body("async function ensureTravelImpl(");
  assert.match(t, /await Promise\.all\(\[\s*env\.DB\.prepare\("CREATE TABLE IF NOT EXISTS travel_expense/,
    "the CREATE is a no-op on a live table and must not block the count that follows it");
  assert.match(t, /SELECT COUNT\(\*\) total, SUM\(CASE WHEN kind='shoreside'[^)]*\) shore FROM travel_expense"\)\.first\(\)\.catch/,
    "the count rides with it and falls back to the migrate-once path when the table is legacy");
});

test("a slow /api response says how much of it was a cold start, not just how long it took", () => {
  assert.match(SRC, /const GUARDS = \{ ms: 0, n: 0 \};/, "guard time is accumulated where the guards actually run");
  const memo = body("function memoEnsure(");
  assert.match(memo, /GUARDS\.ms \+= Date\.now\(\) - t0; GUARDS\.n \+= 1;/, "timed on both the success and the failure path");
  assert.match(SRC, /const g0 = GUARDS\.ms, gn0 = GUARDS\.n;/, "snapshotted at request start");
  assert.match(SRC, /const gms = GUARDS\.ms - g0, gn = GUARDS\.n - gn0;/);
  assert.match(SRC, /"Server-Timing", "app;dur=" \+ dur \+ ", guards;dur=" \+ gms/, "visible in devtools without a query");
  assert.match(SRC, /INSERT INTO perf_log \(at,path,method,dur,colo,guard_ms,guards\)/);
  const ens = body("const ensurePerfLog = memoEnsure(");
  assert.match(ens, /ALTER TABLE perf_log ADD COLUMN guard_ms INTEGER/, "prod already holds a perf_log without these columns");
});
