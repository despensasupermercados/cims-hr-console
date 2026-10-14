// Staging emails nobody but MAIL_ONLY_TO (src/mail_guard.js, 14 Oct 2026). Production is untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guardMailer, guardEnvelope, addrOf } from "../src/mail_guard.js";

const fakeMailer = () => { const sent = []; return { sent, fetch: async (u, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true })); } }; };

test("unset MAIL_ONLY_TO returns the binding itself (production unchanged)", () => {
  const m = fakeMailer();
  assert.equal(guardMailer(m, undefined), m);
  assert.equal(guardMailer(m, ""), m);
  assert.equal(guardMailer(undefined, "a@b.com"), undefined);
});

test("only allowed recipients pass; the subject says STAGING", async () => {
  const m = fakeMailer();
  const g = guardMailer(m, "Miguel.Sanmartin@dg3.com");
  const r = await g.fetch("https://mailer/send", { method: "POST", body: JSON.stringify({ to: ["crew@rccl.com", "CIMS Miguel <miguel.sanmartin@dg3.com>"], cc: ["rita.berenyi@dg3.com"], subject: "Hi" }) });
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(m.sent.length, 1);
  assert.deepEqual(m.sent[0].to, ["CIMS Miguel <miguel.sanmartin@dg3.com>"]);
  assert.deepEqual(m.sent[0].cc, []);
  assert.equal(m.sent[0].subject, "[STAGING] Hi");
});

test("nobody allowed in `to` = nothing sent, a refusal answered", async () => {
  const m = fakeMailer();
  const g = guardMailer(m, "miguel.sanmartin@dg3.com");
  const r = await (await g.fetch("x", { body: JSON.stringify({ to: ["crew@rccl.com"], cc: ["miguel.sanmartin@dg3.com"], subject: "S" }) })).json();
  assert.equal(r.ok, false); assert.equal(r.error, "mail_guard");
  assert.equal(m.sent.length, 0);
  const r2 = await (await g.fetch("x", { body: "not json" })).json();
  assert.equal(r2.ok, false); assert.equal(m.sent.length, 0);
});

test("addresses are compared without names or case; a string `to` is handled", () => {
  assert.equal(addrOf("  Ray <Ray.Guerra@DG3.com> "), "ray.guerra@dg3.com");
  const g = guardEnvelope({ to: "a@x.com", bcc: ["b@x.com"] }, "A@x.com");
  assert.deepEqual(g.envelope.to, ["a@x.com"]); assert.deepEqual(g.envelope.bcc, []); assert.equal(g.send, true);
});

test("every entry point of the worker guards the mailer", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /env = Object\.assign\(\{\}, env, \{ DB: batchingDb\(env\.DB\), MAILER: guardMailer\(env\.MAILER, env\.MAIL_ONLY_TO\) \}\);/);
  assert.match(W, /async scheduled\(event, env, ctx\) \{\n\s*env = Object\.assign\(\{\}, env, \{ MAILER: guardMailer\(env\.MAILER, env\.MAIL_ONLY_TO\) \}\);/);
  assert.match(W, /async email\(message, env, ctx\) \{\n\s*env = Object\.assign\(\{\}, env, \{ MAILER: guardMailer\(env\.MAILER, env\.MAIL_ONLY_TO\) \}\);/);
});
