// The night watch's merge gate (scripts/night_merge_gate.mjs, Miguel 16 Oct 2026: "merge small fixes"). It must say
// MERGE_OK only for a small, tested fix that touches no money, auth, schema, crew-data write, email, config or deps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, parseDiff, MAX_SRC_LINES } from "../scripts/night_merge_gate.mjs";

const f = (path, added = ["x"], removed = []) => ({ path, added, removed });

test("a small tested fix in a page module may merge", () => {
  const r = judge([f("src/audit_ui.js", ["  if (S.view === key) fail(e);"], ["  fail(e);"]), f("test/audit_request.test.js", ["test(...)"])]);
  assert.equal(r.ok, true, r.reasons.join("; "));
});

test("money, auth, schema, config, workflows, emails, deps and TDG imports never merge", () => {
  for (const p of ["src/bonus.js", "src/bonus_commit.js", "src/score_auto.js", "src/seval.js", "src/auth.js", "src/policy.js",
    "migrations/0031_x.sql", "wrangler.toml", ".github/workflows/test.yml", "src/emails/hr.audit.docsin.v1.js", "package.json",
    "package-lock.json", "src/crewimport.js", "src/registry_sync.js", "src/contract_count.js", "src/intelai.js", "src/crewmatch.js"]) {
    const r = judge([f(p), f("test/x.test.js")]);
    assert.equal(r.ok, false, p + " must not merge");
  }
});

test("a D1 write or schema statement anywhere in src/ never merges", () => {
  for (const sql of ['"INSERT INTO crew (a) VALUES (?)"', '"UPDATE crew SET status=?"', '"DELETE FROM assignment WHERE id=?"',
    '"INSERT OR REPLACE INTO x VALUES (1)"', '"CREATE UNIQUE INDEX ux ON t (a)"', '"ALTER TABLE crew ADD COLUMN z"', '"DROP TABLE t"']) {
    assert.equal(judge([f("src/audit_request.js", [sql]), f("test/x.test.js")]).ok, false, sql);
    assert.equal(judge([f("src/audit_request.js", [], [sql]), f("test/x.test.js")]).ok, false, "removing one is a change too: " + sql);
  }
  assert.equal(judge([f("src/audit_request.js", ['"SELECT * FROM audit_request WHERE id=?"']), f("test/x.test.js")]).ok, true, "a read is fine");
});

test("no test, or more than the small-fix size, never merges", () => {
  assert.match(judge([f("src/audit_ui.js")]).reasons.join(" "), /no test/);
  const big = judge([f("src/audit_ui.js", Array(MAX_SRC_LINES + 1).fill("x")), f("test/x.test.js")]);
  assert.equal(big.ok, false); assert.match(big.reasons.join(" "), /not a small fix/);
});

test("the diff parser reads paths and changed lines, never the +++/--- headers", () => {
  const files = parseDiff("diff --git a/src/a.js b/src/a.js\nindex 1..2 100644\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/test/a.test.js b/test/a.test.js\n+++ b/test/a.test.js\n+t\n");
  assert.deepEqual(files, [{ path: "src/a.js", added: ["new"], removed: ["old"], ctx: [] }, { path: "test/a.test.js", added: ["t"], removed: [], ctx: [] }]);
});

// THE MONEY AND AUTH PATHS LIVE INSIDE worker.js TOO (night watch, 17 Oct 2026). PR #281's hunk — which contract the Score
// Card opens on, inside apiBonusCrew — printed MERGE_OK because the gate judged the FILE, and worker.js is nobody's file.
test("a hunk that lands inside a bonus / Score Card function never merges, whatever its lines say", () => {
  const diff = "diff --git a/src/worker.js b/src/worker.js\n--- a/src/worker.js\n+++ b/src/worker.js\n@@ -3301,12 +3301,8 @@ async function apiBonusCrew(env, url) {\n-  const td = TODAY();\n+  const td = TODAY(); // today\ndiff --git a/test/x.test.js b/test/x.test.js\n+++ b/test/x.test.js\n+t\n";
  const r = judge(parseDiff(diff));
  assert.equal(r.ok, false, "a hunk inside apiBonusCrew must not merge");
  assert.match(r.reasons.join(" "), /money/);
});

test("a hunk that names a bonus, Score Card, feedback-window or supervisor-evaluation symbol never merges", () => {
  for (const line of ["  const sched = defaultScoreLeg(HIST, sc, td);", "  applyAuto();", "  if (isMoneyUser(email)) return x;",
    '  await env.DB.prepare("SELECT 1 FROM bonus_outcome").first()', "  _seval.sevalGet(env, sc, off)", "  return apiFeedbackCrew(env, url);", "  recalcScore();"]) {
    const r = judge([f("src/worker.js", [line]), f("test/x.test.js")]);
    assert.equal(r.ok, false, line);
    assert.match(r.reasons.join(" "), /money/, line);
  }
  // a removed line is a change too
  assert.equal(judge([f("src/worker.js", [], ["  commitBonus();"]), f("test/x.test.js")]).ok, false);
});

test("a hunk inside or naming the sign-in / session path never merges; an unknown function is not auth by itself", () => {
  assert.equal(judge([{ path: "src/worker.js", added: ["  x"], removed: [], ctx: ["function noticeHTML(title, msg) {"] }, f("test/x.test.js")]).ok, true);
  assert.equal(judge([{ path: "src/worker.js", added: ["  x"], removed: [], ctx: ["async function stillAllowed(env, email) {"] }, f("test/x.test.js")]).ok, false);
  for (const line of ["  const p = await verifyToken(t, env.SESSION_SECRET);", "  if (!(await stillAllowed(env, s.email))) return null;", '  getCookie(request, "s")', "  signToken({ p: \"fb\" }, env.SESSION_SECRET)"]) {
    const r = judge([f("src/worker.js", [line]), f("test/x.test.js")]);
    assert.equal(r.ok, false, line);
    assert.match(r.reasons.join(" "), /auth/, line);
  }
});

test("the diff parser keeps each hunk's function context (git's hunk header), empty when the header carries none", () => {
  const files = parseDiff("diff --git a/src/worker.js b/src/worker.js\n--- a/src/worker.js\n+++ b/src/worker.js\n@@ -10,3 +10,3 @@ async function apiBonusCrew(env, url) {\n-a\n+b\n@@ -50,2 +50,2 @@\n-c\n+d\n");
  assert.deepEqual(files[0].ctx, ["async function apiBonusCrew(env, url) {"]);
  assert.deepEqual(files[0].added, ["b", "d"]);
  assert.deepEqual(files[0].removed, ["a", "c"]);
});
