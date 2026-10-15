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
  assert.deepEqual(files, [{ path: "src/a.js", added: ["new"], removed: ["old"] }, { path: "test/a.test.js", added: ["t"], removed: [] }]);
});
