// Crew card Hide/Void (/api/crew/hide) — authorization + the reversible redacted flag.
// Reading crew is any-session; HIDING/RESTORING (POST) is MONEY_USERS only (Miguel + Rita),
// mirroring the sbmtoggle gate. A crew with committed bonus history can never be hidden.
// Exercised end-to-end through the worker's fetch handler so the route stays inside the error
// boundary and behind the session wall.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken } from "../src/auth.js";
import worker from "../src/worker.js";

const SECRET = "crew-hide-test-secret";

// Minimal D1 fake: exactly the statements apiCrewHide issues (loud on drift). logActivity's
// activity_log INSERT is swallowed by its own try/catch, but we accept it here to be safe.
function fakeDB(state) {
  return {
    prepare(sql) {
      const S = String(sql);
      const s = { args: [] };
      s.bind = (...a) => { s.args = a; return s; };
      s.run = async () => {
        if (S.startsWith("UPDATE crew SET redacted=")) { state.redacted = s.args[0]; return { meta: { changes: 1 } }; }
        if (S.startsWith("INSERT INTO activity_log")) { state.logged = s.args[2]; return { meta: { changes: 1 } }; }
        throw new Error("fakeDB run: unhandled SQL: " + S);
      };
      s.first = async () => {
        if (S.startsWith("SELECT id FROM crew WHERE agency_id=")) return state.crewExists ? { id: "crew_" + s.args[0] } : null;
        if (S.startsWith("SELECT 1 x FROM bonus_outcome")) return state.bonusHistory ? { x: 1 } : null;
        throw new Error("fakeDB first: unhandled SQL: " + S);
      };
      s.all = async () => { throw new Error("fakeDB all: unhandled SQL: " + S); };
      return s;
    },
  };
}

async function cookie(email) {
  const t = await signToken({ p: "session", email, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  return "cims_sid=" + encodeURIComponent(t);
}
function req(cookieStr, body) {
  const headers = { "Content-Type": "application/json" };
  if (cookieStr) headers.Cookie = cookieStr;
  return new Request("https://x/api/crew/hide", { method: "POST", headers, body: JSON.stringify(body || {}) });
}

test("no session -> 401", async () => {
  const env = { SESSION_SECRET: SECRET, DB: fakeDB({}) };
  const r = await worker.fetch(req(null, { agency_id: "SC-1", hidden: 1 }), env);
  assert.equal(r.status, 401);
});

test("non-money user -> 403 money_users_only, DB untouched", async () => {
  const state = {};
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(state) };
  const r = await worker.fetch(req(await cookie("dexter@dg3.com"), { agency_id: "SC-1", hidden: 1 }), env);
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: "money_users_only" });
  assert.equal(state.redacted, undefined);
});

test("money user, missing agency_id -> 400 (no DB write)", async () => {
  const state = {};
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(state) };
  const r = await worker.fetch(req(await cookie("rita.berenyi@dg3.com"), { hidden: 1 }), env);
  assert.equal(r.status, 400);
  assert.equal(state.redacted, undefined);
});

test("money user hides an existing card -> redacted set to 1", async () => {
  const state = { crewExists: true };
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(state) };
  const r = await worker.fetch(req(await cookie("rita.berenyi@dg3.com"), { agency_id: "SC-1", hidden: 1 }), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, hidden: 1 });
  assert.equal(state.redacted, 1);
  assert.equal(state.logged, "crew_hide");
});

test("restore sets redacted back to 0", async () => {
  const state = { crewExists: true };
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(state) };
  const r = await worker.fetch(req(await cookie("miguel.sanmartin@dg3.com"), { agency_id: "SC-1", hidden: 0 }), env);
  assert.equal(r.status, 200);
  assert.equal(state.redacted, 0);
  assert.equal(state.logged, "crew_restore");
});

test("cannot hide a crew that has committed bonus history -> 409", async () => {
  const state = { crewExists: true, bonusHistory: true };
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(state) };
  const r = await worker.fetch(req(await cookie("rita.berenyi@dg3.com"), { agency_id: "SC-1", hidden: 1 }), env);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "has_bonus_history" });
  assert.equal(state.redacted, undefined); // never written
});
