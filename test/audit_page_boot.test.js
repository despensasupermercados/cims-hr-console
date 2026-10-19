// The audit app's page, booted for real in node:vm on a small fake DOM (19 Oct 2026). #299 gave the photo queue the name
// the home's search text already had (S.q = {}), so the ships list threw "S.q.toLowerCase is not a function" and
// audit.cims.work opened on "Could not load". Every route test was green: none of them ran the page. This one boots it
// the way a phone does (the icon script, the serialized rules, the app) and reads what lands in #main.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { AUDIT_HTML } from "../src/audit_ui.js";

function fakeEl(id) {
  const cls = new Set();
  const el = {
    id, innerHTML: "", textContent: "", value: "", hidden: false, disabled: false, style: {}, className: "", isConnected: true,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } },
    attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, hasAttribute(k) { return k in this.attrs; },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, focus() {}, click() {}, closest: () => null,
    querySelector: () => fakeEl(), querySelectorAll: () => [],
  };
  return el;
}
function boot(hash, api) {
  const els = new Map(), $ = (id) => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); };
  const store = new Map(), errors = [];
  const json = (o, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(o) });
  const ctx = {
    console, setTimeout, clearTimeout, Promise, Date, JSON, Math, URL, encodeURIComponent, decodeURIComponent,
    navigator: { onLine: true }, history: { length: 1, back() {} },
    location: { hash, pathname: "/", href: "https://audit.cims.work/" + hash, replace(h) { this.hash = h; } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { getElementById: $, querySelector: () => $("__q"), querySelectorAll: () => [], createElement: () => fakeEl(), addEventListener() {}, body: fakeEl("body") },
    fetch: (u) => { const p = new URL(u, "https://audit.cims.work").pathname; return p in api ? json(api[p]) : json({ error: "not found" }, 404); },
    addEventListener() {}, scrollTo() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const scripts = AUDIT_HTML.split("<script>").slice(1).map((s) => s.split("</script>")[0]);
  for (const s of scripts) { try { vm.runInContext(s, ctx); } catch (e) { errors.push(e.message); } }
  return { $, errors };
}
const SHIPS = { today: "2026-10-19", counts: { filed: 0, openFollowups: 0 }, ships: [
  { ship: "Oasis", brand: "Royal", aboard: [{ sc: "SC-1", name: "John Gorre", contract: "3 completed · on contract 4", signOn: "2026-06-02", signOff: "2027-01-03" }], last: null },
  { ship: "Pursuit", brand: "Azamara", aboard: [{ sc: "SC-9", name: "Kevin Jugao", contract: "2 completed", signOn: "2026-05-24", signOff: "2026-10-31" }], last: { id: "ar_1", at: "2026-10-16", status: "sent", crew: "Kevin Jugao", due: "2099-01-01T00:00:00Z" } }] };
const settle = () => new Promise((r) => setTimeout(r, 30));

test("the home opens on the ships, never on 'Could not load' (the photo queue is not the search text)", async () => {
  const P = boot("", { "/api/me": { email: "Dexter.Lawrence@dg3.com", open: true }, "/api/audit/ships": SHIPS });
  await settle();
  assert.deepEqual(P.errors, []);
  const main = P.$("main").innerHTML;
  assert.doesNotMatch(main, /Could not load/, main.slice(0, 200));
  assert.match(main, /Oasis/); assert.match(main, /Open requests/); assert.match(main, /Kevin Jugao/);
  assert.doesNotMatch(P.$("heroslot").innerHTML, /\[object Object\]/, "the search box is empty, not the queue");
});

test("the page script keeps one meaning per state key: the search text S.q is only ever a string", () => {
  const src = AUDIT_HTML;
  for (const m of src.matchAll(/\bS\.q\s*=(?!=)\s*([^;]+);/g)) assert.match(m[1], /^(""|qi\.value)$/, "S.q = " + m[1]);
  assert.doesNotMatch(src, /\bS\.q\[/, "the photo queue is S.pq");
});
