// The crew's page (audit.cims.work/audit/u/<link>), booted in node:vm on a small fake DOM (23 Oct 2026 review). Send used
// to go while the last count was still on its way, or after the server refused it: flush() found nothing queued (the
// 800 ms auto-save had already taken the numbers) and resolved at once, and a refused save resolved too. The server then
// filed the request without the number the crew had just typed.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { auditUploadHtml } from "../src/audit_upload_ui.js";

function el(id, attrs = {}) {
  return { id, innerHTML: "", textContent: "", value: "", className: "", disabled: false, style: {}, attrs,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, hasAttribute(k) { return k in this.attrs; }, setAttribute(k, v) { this.attrs[k] = String(v); },
    closest() { return null; }, focus() {}, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [] };
}
const STATE = { status: "sent", ship: "Pursuit", crew: "Kevin Jugao", auditor: "Dexter Lawrence", dueAt: "2099-01-01T00:00:00Z", test: false,
  machines: [{ serial: "S1", label: "Press 1", model: "C1100", down: null, p43: { read_state: "ok" }, mgmt: { read_state: "ok" } }],
  lines: [{ part_no: "P1", description: "Toner K" }], counted: { P1: null }, extras: [], gate: { open: true, missing: [] } };

function boot() {
  const html = auditUploadHtml({ token: "tok", ship: "Pursuit", crew: "Kevin Jugao" });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const els = new Map(), $ = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
  const on = {}, calls = [], timers = [], errors = [];
  const fetch = (url, init) => new Promise((resolve) => {
    const p = String(url).split("?")[0], body = init && init.body ? JSON.parse(init.body) : null;
    const reply = (o, status = 200) => resolve({ ok: status < 400, status, json: () => Promise.resolve(o) });
    calls.push({ p, body, reply });
    if (p === "/api/audit/u/state") reply(JSON.parse(JSON.stringify(STATE)));
  });
  const window = { addEventListener() {}, location: { hash: "" } };
  const document = { getElementById: $, querySelector: () => null, querySelectorAll: () => [], activeElement: null, visibilityState: "visible",
    addEventListener: (k, f) => { on[k] = f; } };
  const ctx = vm.createContext({ window, document, fetch, console: { log() {}, error: (e) => errors.push(e) }, JSON, Object, Array, String, Number, Math, Date, Promise, isNaN, encodeURIComponent,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: (i) => { if (timers[i - 1]) timers[i - 1].fn = null; } });
  window.__T = "tok";
  for (const s of scripts) vm.runInContext(s, ctx);
  const tick = () => new Promise((r) => setImmediate(r));
  const fire = (ms) => { for (const t of timers) if (t.fn && t.ms === ms) { const f = t.fn; t.fn = null; f(); } };
  const type = (part, v) => { const t = el("in", { "data-part": part }); t.value = v; on.input({ target: t }); };
  const send = () => { const b = el("submit"); b.id = "submit"; on.click({ target: { closest: () => b } }); return b; };
  const pending = (p) => calls.filter((c) => c.p === p);
  return { calls, pending, fire, type, send, tick, errors };
}

test("Send waits for the count already on its way, and goes once it landed", async () => {
  const P = boot(); await P.tick(); await P.tick();
  P.type("P1", "12");
  P.fire(800); await P.tick();                         // the auto-save takes the 12 and is on its way
  assert.equal(P.pending("/api/audit/u/count").length, 1);
  P.send(); await P.tick(); await P.tick();
  assert.equal(P.pending("/api/audit/u/submit").length, 0, "never submitted while the 12 is still on its way");
  P.pending("/api/audit/u/count")[0].reply({ ok: true });
  for (let i = 0; i < 6; i++) await P.tick();
  assert.equal(P.pending("/api/audit/u/submit").length, 1);
});

test("a count the server did not save holds Send, and says so; the button comes back", async () => {
  const P = boot(); await P.tick(); await P.tick();
  P.type("P1", "12");
  const b = P.send(); await P.tick();
  const c = P.pending("/api/audit/u/count");
  assert.equal(c.length, 1); assert.deepEqual(c[0].body.counts, { P1: "12" });
  c[0].reply({ ok: false, say: "No connection. Your numbers on this page are kept; try again." });
  for (let i = 0; i < 6; i++) await P.tick();
  assert.equal(P.pending("/api/audit/u/submit").length, 0, "nothing sent with a number missing");
  assert.equal(b.disabled, false);
});
