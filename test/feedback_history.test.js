// PAST FEEDBACK IS KEPT, NOT CARRIED (Miguel, 9 Oct 2026: "I like your idea but we need to keep stored somewhere the
// previous feedback"). Run through the real worker routes on real SQLite: a Rush flagged for contract 1 must not come
// pre-ticked on contract 2's Score Card, and the contract-1 answer must still be there to read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken } from "../src/auth.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

function d1(d) {
  const mk = (sql, args = []) => ({
    bind: (...a) => mk(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { const r = d.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => mk(sql), batch: async (sts) => { const out = []; for (const s of sts) out.push(await s.run()); return out; } };
}

test("a new feedback window supersedes the old answers: kept in previous, out of the prefill, the board and the queue", async () => {
  assert.ok(DatabaseSync, "node:sqlite unavailable");
  const W = await import("../src/worker.js");
  const d = new DatabaseSync(":memory:");
  // the table as production has it today: WITHOUT superseded_at (the guard must add it)
  d.exec(`CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT, first_name TEXT, middle_name TEXT, last_name TEXT, vessel_observed TEXT, redacted INTEGER DEFAULT 0);
    INSERT INTO crew (id, agency_id, first_name, last_name, vessel_observed) VALUES ('c1','SC-1','Ana','Alpha','Allure');
    CREATE TABLE users (email TEXT); INSERT INTO users VALUES ('rita@test.local');
    CREATE TABLE activity_log (id TEXT, user_id TEXT, action TEXT, detail TEXT, at TEXT);
    CREATE TABLE feedback_response2 (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, crew_id TEXT NOT NULL, role TEXT NOT NULL, answers_json TEXT NOT NULL, submitted_at TEXT NOT NULL);`);
  const env = { DB: d1(d), SESSION_SECRET: "test-only-not-a-secret" };
  const sess = await signToken({ p: "session", email: "rita@test.local", exp: Math.floor(Date.now() / 1000) + 3600 }, env.SESSION_SECRET);
  const call = async (path, body, auth = true) => {
    const r = await W.default.fetch(new Request("https://t.local" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(auth ? { cookie: "cims_sid=" + sess } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
    return r.json();
  };
  // contract 1: Ray reports a rush caused by the crew
  const w1 = await call("/api/feedback/request", { agency_id: "SC-1", role: "ray" });
  assert.equal(w1.ok, true);
  const t1 = new URL(w1.link).searchParams.get("t");
  const s1 = await call("/api/feedback/submit", { t: t1, answers: { order: "Yes", rushcause: "Crew ordering failure", ontime: "Always", acc: "Accurate", par: "Maintained", audit: "No" } }, false);
  assert.equal(s1.ok, true);
  let f = await call("/api/feedback/crew?id=SC-1");
  assert.equal(f.prefill.gates.rush, true, "contract 1's Score Card shows the rush");
  assert.equal(f.previous.length, 0);
  // contract 2: Rita fires a new Ray window (a second later: two links signed in the same second are the same token)
  await new Promise((r) => setTimeout(r, 1100));
  const w2 = await call("/api/feedback/request", { agency_id: "SC-1", role: "ray" });
  assert.equal(w2.ok, true);
  f = await call("/api/feedback/crew?id=SC-1");
  assert.equal(f.prefill.gates.rush, undefined, "contract 2 starts clean: the old rush is NOT pre-ticked");
  assert.deepEqual(f.answers, {}, "no current answer until Ray answers the new window");
  assert.equal(f.previous.length, 1, "the contract-1 answer is kept");
  assert.equal(f.previous[0].role, "ray");
  assert.equal(f.previous[0].answers.rushcause, "Crew ordering failure");
  assert.ok(f.previous[0].superseded_at, "stamped when the new window went out");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM feedback_response2").get().n, 1, "nothing deleted");
  // the old link is revoked; the new answer becomes the current one, the old stays history
  assert.equal((await call("/api/feedback/submit", { t: t1, answers: { order: "No" } }, false)).error, "revoked");
  const t2 = new URL(w2.link).searchParams.get("t");
  assert.equal((await call("/api/feedback/submit", { t: t2, answers: { order: "No", ontime: "Always", acc: "Accurate", par: "Maintained", audit: "No" } }, false)).ok, true);
  f = await call("/api/feedback/crew?id=SC-1");
  assert.equal(f.answers.ray.order, "No");
  assert.equal(f.prefill.gates.rush, undefined);
  assert.equal(f.previous.length, 1);
  // the in-app form answered twice keeps the first answer too
  await call("/api/feedback/score", { agency_id: "SC-1", role: "dexter", answers: { assessed: "Yes", overall: "Good" } });
  await call("/api/feedback/score", { agency_id: "SC-1", role: "dexter", answers: { assessed: "Yes", overall: "Excellent" } });
  f = await call("/api/feedback/crew?id=SC-1");
  assert.equal(f.answers.dexter.overall, "Excellent");
  assert.ok(f.previous.some((p) => p.role === "dexter" && p.answers.overall === "Good"), "the earlier in-app answer is kept");
});
