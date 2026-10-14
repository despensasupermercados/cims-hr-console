// One sign-in for cims.work and audit.cims.work (Miguel, 14 Oct 2026: "why cant [I] enter to the site?"). He signed in on
// cims.work at 13:51; audit.cims.work had no cookie (host-only) and showed the console's own login page, titled
// "HR Operational Console", which looked like the wrong site. Driven through the worker's fetch handler.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken } from "../src/auth.js";
import worker from "../src/worker.js";

const SECRET = "audit-signin-test-secret";
// A permissive D1 fake: the allowlist answers yes, writes succeed, reads are empty.
function fakeDB() {
  const st = (sql) => {
    const s = { bind: () => s };
    s.run = async () => ({ meta: { changes: 1 } });
    s.first = async () => (/FROM users/i.test(sql) ? { email: "miguel.sanmartin@dg3.com" } : null);
    s.all = async () => ({ results: /FROM users/i.test(sql) ? [{ email: "miguel.sanmartin@dg3.com" }] : [] });
    return s;
  };
  return { prepare: st, batch: async (list) => Promise.all(list.map((x) => x.run())) };
}
const env = () => ({ SESSION_SECRET: SECRET, DB: fakeDB() });
const cookies = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("Set-Cookie")]).filter(Boolean);

test("audit.cims.work/login says Printshop Audit; cims.work/login stays the console's", async () => {
  const a = await worker.fetch(new Request("https://audit.cims.work/login"), env(), {});
  const at = await a.text();
  assert.equal(a.status, 200);
  assert.match(at, /<h1>Printshop Audit<\/h1>/); assert.match(at, /<title>Printshop Audit · Sign in<\/title>/);
  assert.match(at, /\/api\/auth\/request/, "the same sign-in script and route");
  const c = await (await worker.fetch(new Request("https://cims.work/login"), env(), {})).text();
  assert.match(c, /<h1>HR Operational Console<\/h1>/);
});

test("a sign-in on either host sets ONE cookie for cims.work; other hosts stay host-only", async () => {
  const tok = await signToken({ p: "login", email: "miguel.sanmartin@dg3.com", exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);
  for (const host of ["audit.cims.work", "cims.work"]) {
    const r = await worker.fetch(new Request(`https://${host}/auth/verify?token=${encodeURIComponent(tok)}`), env(), {});
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("Location"), `https://${host}/`, "back to the site the link was asked from");
    assert.match(cookies(r)[0], /; Domain=cims\.work$/, host + " must share the session");
    assert.match(cookies(r)[0], /HttpOnly; Secure; SameSite=Lax/);
  }
  const w = await worker.fetch(new Request(`https://cims-hr-console.x.workers.dev/auth/verify?token=${encodeURIComponent(tok)}`), env(), {});
  assert.doesNotMatch(cookies(w)[0], /Domain=/, "never widen a cookie off cims.work");
});

test("an older host-only session is re-issued for cims.work when the console opens; logout clears both", async () => {
  const sess = await signToken({ p: "session", email: "miguel.sanmartin@dg3.com", exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);
  const r = await worker.fetch(new Request("https://cims.work/", { headers: { Cookie: "cims_sid=" + encodeURIComponent(sess) } }), env(), {});
  assert.equal(r.status, 200);
  const up = cookies(r).find((c) => c.startsWith("cims_sid="));
  assert.ok(up && /; Domain=cims\.work$/.test(up) && up.includes(encodeURIComponent(sess)), "the same token, now domain-wide");
  const o = await worker.fetch(new Request("https://audit.cims.work/api/auth/logout"), env(), {});
  const out = cookies(o);
  assert.equal(out.length, 2);
  assert.ok(out.some((c) => /Max-Age=0$/.test(c)) && out.some((c) => /Max-Age=0; Domain=cims\.work$/.test(c)));
});
