// "Update TG" wiring — the return leg of the AdvancedQuery loop.
//
// PR #79 built the modules and left them unreachable: nothing in worker.js imported them, so the
// feature existed in the repo and not in the product. These pins make sure it stays wired, stays
// inside the error boundary, and stays behind the session gate.
//
// The rule that matters most: the digest never goes to a guessed recipient. A list of who is
// joining and leaving which ship, mailed to a default address, is worse than not sending at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installTgUpdate } from "../src/tg_update.js";

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

test("the TG routes are registered, authenticated, and inside the error boundary", () => {
  assert.match(SRC, /import \{ installTgUpdate \} from "\.\/tg_update\.js"/, "the modules must be reachable");
  assert.match(SRC, /const _tgUpdate = installTgUpdate\(\{/, "installed once per isolate, not per request");
  const reg = /if \(session\) \{ const tg = await _tgUpdate\(p, request, env, url, session\); if \(tg\) return tg; \}/;
  assert.match(SRC, reg, "the router has to be called with the session");

  // Inside the boundary IIFE: a rejection outside it returns Cloudflare's raw 500 (§11).
  const open = SRC.indexOf("const res = await (async () => {");
  const close = SRC.indexOf("})();", open);
  const at = SRC.search(reg);
  assert.ok(open !== -1 && close !== -1 && at > open && at < close, "the TG router must sit inside the error boundary");

  // And below the session gate, so it can never serve an unauthenticated caller.
  const gate = SRC.indexOf("const session = await getSession(request, env);");
  assert.ok(gate !== -1 && at > gate, "registered above the session gate");
});

// --- behaviour: the three refusals the module promises --------------------------------------
function stubDeps(sent) {
  return {
    json: (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } }),
    htmlResponse: (h) => new Response(h, { headers: { "content-type": "text/html" } }),
    logActivity: async () => {},
    sendViaMailer: async (env, msg) => { sent.push(msg); return { ok: true }; },
    shipOf: (v) => v,
    brandFor: () => "",
  };
}
// Every read tg_update issues returns empty; writes are recorded.
function stubEnv(extra = {}) {
  const writes = [];
  return {
    writes,
    DB: { prepare(sql) {
      const s = { bind: (...a) => (s.args = a, s) };
      s.run = async () => { writes.push(String(sql)); return { meta: { changes: 1 } }; };
      s.first = async () => null;
      s.all = async () => ({ results: [] });
      return s;
    } },
    ...extra,
  };
}

test("nothing changed means nothing sent — and no watermark is stamped", async () => {
  const sent = [];
  const env = stubEnv({ TG_NOTIFY: "joy@example.com" });
  const res = await installTgUpdate(stubDeps(sent))("/api/tg/send", new Request("https://x/api/tg/send", { method: "POST" }), env, new URL("https://x/api/tg/send"), { email: "rita@dg3.com" });
  const body = await res.json();
  assert.equal(body.empty, true);
  assert.deepEqual(sent, [], "Miguel's rule: no updates, no email");
  assert.ok(!env.writes.some(w => w.includes("INSERT INTO tg_update_run")), "an empty run must not move the watermark");
});

test("an unset recipient is a hard error, never a default address", async () => {
  const sent = [];
  // Force a non-empty payload by giving the collector one in-force assignment.
  const env = stubEnv();          // no TG_NOTIFY
  env.DB = { prepare(sql) {
    const S = String(sql);
    const s = { bind: (...a) => (s.args = a, s) };
    s.run = async () => ({ meta: { changes: 1 } });
    s.first = async () => null;
    s.all = async () => ({ results: S.includes("FROM crew_override WHERE updated_at") ? [{ agency_id: "SC-1", vessel_observed: "Quest", updated_at: "2026-09-10T00:00:00Z" }]
      : S.includes("FROM crew WHERE redacted") ? [{ agency_id: "SC-1", first_name: "A", last_name: "B", status: "On board", vessel_observed: "Reflection" }]
      : [] });
    return s;
  } };
  const res = await installTgUpdate(stubDeps(sent))("/api/tg/send", new Request("https://x/api/tg/send", { method: "POST" }), env, new URL("https://x/api/tg/send"), { email: "rita@dg3.com" });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /TG_NOTIFY/);
  assert.deepEqual(sent, [], "a crew-movement digest must never go to a guessed recipient");
});

test("the router ignores paths that are not its own", async () => {
  const r = await installTgUpdate(stubDeps([]))("/api/crew", new Request("https://x/api/crew"), stubEnv(), new URL("https://x/api/crew"), {});
  assert.equal(r, null);
});

test("the button opens the rendered email before it can send", () => {
  // cims-email-standard §5: sign-off is on the rendered email, never on a description. The click
  // handler must open the preview and then confirm — in that order.
  const h = SRC.slice(SRC.indexOf("async function tgUpdateClick()"));
  const fn = h.slice(0, h.indexOf("\n}"));
  const openAt = fn.indexOf("window.open('/api/tg/preview'");
  const confirmAt = fn.indexOf("if(!confirm(");
  const postAt = fn.indexOf("'/api/tg/send'");
  assert.ok(openAt !== -1 && confirmAt > openAt && postAt > confirmAt,
    "preview, then confirm, then send — in that order");
  assert.match(fn, /if\(!j\.recipient\)\{ alert\(/, "an unconfigured recipient is explained, not a 500");
  assert.match(fn, /if\(!n\)\{ alert\('Nothing has changed/, "no changes means say so, not send an empty digest");
});
