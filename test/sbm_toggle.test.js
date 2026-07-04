// SBM master ON/OFF toggle (/api/sbmtoggle) — authorization + flag semantics.
// Mirrors /api/autosend EXACTLY: any signed-in session may read + flip the flag,
// no session = 401 (the /api/* session wall plus apiSbmToggle's own check).
// Storage is the same mechanism as auto-timing's flag: app_setting k='sbm_enabled',
// absent row = OFF. Exercised end-to-end through the worker's fetch handler so the
// route stays inside the error boundary and behind the session wall.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken } from "../src/auth.js";
import worker from "../src/worker.js";

const SECRET = "sbm-toggle-test-secret";

/* Minimal D1 fake: exactly the statements apiSbmToggle issues (loud on drift). */
function fakeDB(settings) {
  return {
    prepare(sql) {
      const S = String(sql);
      const s = { args: [] };
      s.bind = (...a) => { s.args = a; return s; };
      s.run = async () => {
        if (S.startsWith("CREATE TABLE IF NOT EXISTS app_setting")) return { meta: { changes: 0 } };
        if (S.includes("INSERT INTO app_setting (k,v) VALUES ('sbm_enabled'")) {
          settings.sbm_enabled = s.args[0];
          return { meta: { changes: 1 } };
        }
        throw new Error("fakeDB run: unhandled SQL: " + S);
      };
      s.first = async () => {
        if (S.includes("FROM app_setting WHERE k='sbm_enabled'"))
          return settings.sbm_enabled == null ? null : { v: settings.sbm_enabled };
        throw new Error("fakeDB first: unhandled SQL: " + S);
      };
      s.all = async () => { throw new Error("fakeDB all: unhandled SQL: " + S); };
      return s;
    },
  };
}

async function sessionCookie(secret) {
  const t = await signToken({ p: "session", email: "rita.berenyi@dg3.com", exp: Math.floor(Date.now() / 1000) + 3600 }, secret);
  return "cims_sid=" + encodeURIComponent(t);
}

function req(method, cookie, body) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  return new Request("https://cims.test/api/sbmtoggle", {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("GET/POST /api/sbmtoggle without a session -> 401 (same wall as /api/autosend)", async () => {
  const settings = {};
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(settings) };
  const g = await worker.fetch(req("GET", null), env);
  assert.equal(g.status, 401);
  assert.deepEqual(await g.json(), { error: "unauthorized" });
  const p = await worker.fetch(req("POST", null, { enabled: true }), env);
  assert.equal(p.status, 401);
  assert.equal(settings.sbm_enabled, undefined); // nothing written
});

test("a session cookie signed with the wrong secret never flips the flag", async () => {
  const settings = {};
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(settings) };
  const forged = await signToken({ p: "session", email: "rita.berenyi@dg3.com", exp: Math.floor(Date.now() / 1000) + 3600 }, "not-the-secret");
  const r = await worker.fetch(req("POST", "cims_sid=" + encodeURIComponent(forged), { enabled: true }), env);
  assert.equal(r.status, 401);
  assert.equal(settings.sbm_enabled, undefined);
});

test("with a session: default OFF, POST flips ON and OFF, GET reflects the state", async () => {
  const settings = {};
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(settings) };
  const cookie = await sessionCookie(SECRET);
  let r = await (await worker.fetch(req("GET", cookie), env)).json();
  assert.equal(r.enabled, false);                              // absent row = OFF (default)
  r = await (await worker.fetch(req("POST", cookie, { enabled: true }), env)).json();
  assert.deepEqual(r, { ok: true, enabled: true });
  assert.equal(settings.sbm_enabled, "true");
  r = await (await worker.fetch(req("GET", cookie), env)).json();
  assert.equal(r.enabled, true);
  r = await (await worker.fetch(req("POST", cookie, { enabled: false }), env)).json();
  assert.deepEqual(r, { ok: true, enabled: false });
  r = await (await worker.fetch(req("GET", cookie), env)).json();
  assert.equal(r.enabled, false);
  // strict boolean: anything but `true` disarms (no truthy-coercion surprises)
  r = await (await worker.fetch(req("POST", cookie, { enabled: "yes" }), env)).json();
  assert.deepEqual(r, { ok: true, enabled: false });
  assert.equal(settings.sbm_enabled, "false");
});
