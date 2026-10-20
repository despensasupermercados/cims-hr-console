// The audit app's page, booted for real in node:vm on a small fake DOM (19 Oct 2026). #299 gave the photo queue the name
// the home's search text already had (S.q = {}), so the ships list threw "S.q.toLowerCase is not a function" and
// audit.cims.work opened on "Could not load". Every route test was green: none of them ran the page. This one boots it
// the way a phone does (the icon script, the serialized rules, the app) and reads what lands in #main.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { AUDIT_HTML } from "../src/audit_ui.js";
import { startVisit } from "../src/audit_steps.js";

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
const HANG = Symbol("hang"), DOWN = Symbol("down");
// opt.store seeds localStorage; opt.clock swaps the page's timers for a list the test fires by hand (fire(ms)), so a
// 15-second ceiling is tested without waiting 15 seconds.
function boot(hash, api, opt = {}) {
  const els = new Map(), $ = (id) => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); };
  const store = new Map(Object.entries(opt.store || {})), errors = [], calls = [];
  const json = (o, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(o) });
  const timers = new Map(); let tid = 0;
  const st = opt.clock ? (fn, ms) => { timers.set(++tid, { fn, ms: ms || 0 }); return tid; } : setTimeout;
  const ct = opt.clock ? (id) => { timers.delete(id); } : clearTimeout;
  const fire = (ms) => { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); } };
  const ctx = {
    console, setTimeout: st, clearTimeout: ct, Promise, Date, JSON, Math, URL, encodeURIComponent, decodeURIComponent,
    navigator: { onLine: true }, history: { length: 1, back() {} },
    location: { hash, pathname: "/", href: "https://audit.cims.work/" + hash, replace(h) { this.hash = h; } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { getElementById: $, querySelector: () => $("__q"), querySelectorAll: () => [], createElement: () => fakeEl(), addEventListener() {}, body: fakeEl("body") },
    fetch: (u) => {
      const p = new URL(u, "https://audit.cims.work").pathname; calls.push(p);
      if (api[p] === HANG) return new Promise(() => {});
      if (api[p] === DOWN) return Promise.reject(new TypeError("Failed to fetch"));
      return p in api ? json(api[p]) : json({ error: "not found" }, 404);
    },
    addEventListener() {}, scrollTo() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const scripts = AUDIT_HTML.split("<script>").slice(1).map((s) => s.split("</script>")[0]);
  for (const s of scripts) { try { vm.runInContext(s, ctx); } catch (e) { errors.push(e.message); } }
  return { $, errors, store, calls, fire, timers };
}
const SHIPS = { today: "2026-10-19", counts: { filed: 0, openFollowups: 0 }, ships: [
  { ship: "Oasis", brand: "Royal", aboard: [{ sc: "SC-1", name: "John Gorre", contract: "3 completed · on contract 4", signOn: "2026-06-02", signOff: "2027-01-03" }], last: null },
  { ship: "Pursuit", brand: "Azamara", aboard: [{ sc: "SC-9", name: "Kevin Jugao", contract: "2 completed", signOn: "2026-05-24", signOff: "2026-10-31" }], open: true, last: { id: "ar_1", at: "2026-10-16", status: "sent", crew: "Kevin Jugao", sc: "SC-9", due: "2099-01-01T00:00:00Z" } }] };
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

const HIST = { today: "2026-10-19", audits: [
  { id: "ar_2", ship: "Oasis", sc: "SC-1", crew: "John Gorre", filedAt: "2026-10-14T18:00:00Z", openedAt: "2026-10-12T09:00:00Z", ratings: { inventory: 3, technical: 4, collaterals: 5, overall: 4, dispatch: 2 }, score: 4, from: "overall", steps: true, missing: { ws: ["sops"], tools: ["fiery_hdd"], ppe: ["shoes"] }, repeat: { sops: 2 }, photos: 2, followups: { open: 1, fixed: 0 } },
  { id: "ar_1", ship: "Pursuit", sc: "SC-9", crew: "Kevin Jugao", filedAt: "2026-07-02T15:00:00Z", openedAt: null, ratings: { inventory: 4, technical: 4, collaterals: 4, overall: null, dispatch: null }, score: 4, from: "average", steps: false, missing: null, repeat: {}, photos: 0, followups: { open: 0, fixed: 0 } }],
  followups: [
  { id: "f1", request: "ar_2", ship: "Oasis", sc: "SC-1", crew: "John Gorre", owner: "Rolando", due: "2026-10-01", text: "Confirm the cyan line", status: "open", carried: 0, createdAt: "2026-10-14T18:00:00Z" },
  { id: "f2", request: "ar_2", ship: "Oasis", sc: "SC-1", crew: "John Gorre", owner: "Ray", due: "2026-11-01", text: "Labels on the presses", status: "fixed", carried: 0, createdAt: "2026-10-14T18:00:00Z", closedAt: "2026-10-16T10:00:00Z", closedBy: "Dexter.Lawrence@dg3.com (open site, no sign-in)", closedOnVisit: false }] };

test("History opens on every filed audit: the ratings, what was missing (2nd time), a grade with no steps said so", async () => {
  const P = boot("#hist", { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": SHIPS, "/api/audit/history": HIST });
  await settle();
  assert.deepEqual(P.errors, []);
  const main = P.$("main").innerHTML;
  assert.match(main, /2 audits/); assert.match(main, /Oct 12–14, 2026/);
  assert.match(main, /class="gq lo">3<\/b>Inventory/, "3 or below is the problem line");
  assert.match(main, /class="gq p">2<\/b>Dispatch/, "the dispatch rating is Rita's, never coloured");
  assert.match(main, /Missing: SOPs · ordering &amp; transfers \(2nd time\), 2-Fiery back-up HDD, Safety shoes/);
  assert.match(main, /Graded before the audit had steps/);
  assert.match(main, /data-go="q=ar_2"/, "a row opens its audit");
});

test("Follow-ups: the late one first, its owner and date, two buttons; the fixed one folded with who closed it", async () => {
  const P = boot("#fu", { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": SHIPS, "/api/audit/history": HIST });
  await settle();
  assert.deepEqual(P.errors, []);
  const main = P.$("main").innerHTML;
  assert.match(main, /Confirm the cyan line<\/b><span class="st r">Overdue/);
  assert.match(main, /data-fix="f1"/); assert.doesNotMatch(main, /data-fix="f2"/, "a fixed follow-up has nothing to close");
  assert.match(main, /Fixed Oct 16, 2026 by Dexter Lawrence · open site from this list/);
});

// 19 Oct 2026, Miguel, a screenshot of the home on its placeholders: "something is broken or taking way to long to load".
// The server answered in under a second every time (perf_log); the page had no ceiling on a read, drew nothing until the
// whole fleet's board came back, and re-drew the home only for an empty address.
const KEPT = { at: "2026-10-19T10:42:00Z", today: "2026-10-19", counts: { filed: 3, openFollowups: 1 }, ships: [SHIPS.ships[0]] };

test("a read that never answers ends: one more try, then 'Could not load' with Try again, never placeholders for ever", async () => {
  const P = boot("", { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": HANG }, { clock: true });
  await settle();
  assert.match(P.$("main").innerHTML, /class="sk"/, "the placeholders while it waits");
  P.fire(3000);
  assert.match(P.$("main").innerHTML, /Still loading the ships/, "past 3 s it says it is still loading");
  P.fire(15000); await settle();
  assert.equal(P.calls.filter((c) => c === "/api/audit/ships").length, 2, "a second try before anything is said");
  P.fire(15000); await settle();
  const main = P.$("main").innerHTML;
  assert.match(main, /Could not load: no answer in 15 s\./);
  assert.match(main, /data-retry>Try again</);
  assert.equal(P.timers.size, 0, "nothing left running");
});

test("the home paints at once from the list this phone kept, and says so only while the fresh one is late", async () => {
  const P = boot("", { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": HANG }, { clock: true, store: { "aud:ships": JSON.stringify(KEPT) } });
  let main = P.$("main").innerHTML;
  assert.match(main, /Oasis/, "drawn before any answer"); assert.doesNotMatch(main, /class="sk"/);
  assert.match(main, /3 audits filed/); assert.doesNotMatch(main, /Updating/, "quiet while the fresh list is on time");
  P.fire(3000);
  assert.match(P.$("main").innerHTML, /Updating\. This is the list from \d\d:\d\d|Updating\. This is the list from Oct 19, \d\d:\d\d/);
  P.fire(15000); await settle(); P.fire(15000); await settle();
  main = P.$("main").innerHTML;
  assert.match(main, /Oasis/, "a failed update keeps the kept list on screen");
  assert.match(main, /Could not update: no answer in 15 s\. This is the list from/);
  assert.match(main, /data-retry>Try again</);
});

test("the fresh list replaces the kept one and is kept for the next open", async () => {
  const P = boot("", { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": SHIPS }, { store: { "aud:ships": JSON.stringify(KEPT) } });
  await settle();
  const main = P.$("main").innerHTML;
  assert.match(main, /Pursuit/); assert.match(main, /None filed yet/); assert.doesNotMatch(main, /This is the list from/);
  const k = JSON.parse(P.store.get("aud:ships"));
  assert.equal(k.ships.length, 2); assert.ok(Date.parse(k.at) > Date.parse(KEPT.at));
});

test("an address the page does not know opens the home and fills it when the list lands", async () => {
  for (const h of ["#zz", "#q", "#%E0%A4%A"]) {
    const P = boot(h, { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": SHIPS });
    await settle();
    assert.deepEqual(P.errors, []);
    assert.match(P.$("main").innerHTML, /Oasis/, h);
  }
});

test("a lost connection on the boot read: tried twice, then said, with Try again", async () => {
  const P = boot("", { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": DOWN });
  await settle();
  assert.equal(P.calls.filter((c) => c === "/api/audit/ships").length, 2);
  assert.match(P.$("main").innerHTML, /Could not load: no connection\.<\/span><button class="retry" data-retry>Try again/);
});

// 19 Oct 2026, Miguel, on the Workstation step's "All present / Something missing" switch: "i dont like this game of dual
// stuff .. make it one .. defaulted to all present .. so he can mark what is not there". One list; the line under the
// question says the state and is not a control.
const VISIT = { id: "ar_9", ship: "Oasis", crew: "John Gorre", status: "complete", today: "2026-10-19", machines: [], count: { diff: [], extras: [] }, followups: [], photos: [], previous: null };
const STEP_API = { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": SHIPS, "/api/audit/visit": VISIT };

test("the Workstation step is one list, everything present until tapped: no All present / Something missing switch", async () => {
  const P = boot("#a=ar_9|1", STEP_API);
  await settle();
  assert.deepEqual(P.errors, []);
  const main = P.$("main").innerHTML;
  assert.match(main, /What is not on the desktop\?/);
  assert.match(main, /class="wsum">.*All present<\/div>/);
  assert.doesNotMatch(main, /Something missing|data-a="ws-all"|class="seg"/, "no second control");
  assert.doesNotMatch(main, /class="(cell|itm) (bad|miss)/, "nothing starts missing");
  assert.match(main, /data-a="ws" data-k="sops"/, "each item is tappable");
});

test("what Dexter marked missing is said once, in red, and the item reads Missing", async () => {
  const d = startVisit({ machines: [], diff: [] }); d.ws.missing = ["sops"];
  const P = boot("#a=ar_9|1", STEP_API, { store: { "aud:d:ar_9": JSON.stringify(d) } });
  await settle();
  const main = P.$("main").innerHTML;
  assert.match(main, /class="wsum bad">.*1 missing<\/div>/);
  assert.match(main, /class="itm miss" data-a="ws" data-k="sops"/);
});

// The same evening, on the machine card ("this is confusing to operate .. think about it") and the inventory ("the dual thing ..
// not my favorite"): ONE way to answer on every step. A row starts in its normal state, one tap marks it wrong, a second tap
// takes it back; OBP against the shelf is measured from the lines. No two-button question is left anywhere in the audit.
const VISIT2 = Object.assign({}, VISIT, {
  machines: [{ serial: "AC58011020823", label: "Print shop", model: "C4070", down: null, p43: { state: "findings", items: [{ head: "LINES ALONG THE FEED IN CYAN", where: "cyan half tone · green", part: "CYAN DRUM OR CHARGING POLE" }] }, life: [] },
    { serial: "S2", label: "MFD deck 5", model: "bizhub", down: "Paper feed error", p43: null, life: [] }],
  count: { total: 116, asOf: "2026-10-16", diff: [{ part_no: "ACF0033", obp: 2, counted: 1, kind: "gap" }], extras: [{ id: "x1", text: "Fusing gears", counted: 2 }] },
  parts: [{ part_no: "ACF0033", description: "TNP75 BLACK TONER", obp: 2, counted: 1 }],
  followups: [{ id: "f1", text: "Confirm the cyan line", owner: "Rolando", due: "2099-01-01", at: "2026-09-01T10:00:00Z", crew: "John Gorre", carried: 0 }] });
const API2 = { "/api/me": { email: "d@dg3.com" }, "/api/audit/ships": SHIPS, "/api/audit/visit": VISIT2 };
const noDual = (main) => assert.doesNotMatch(main, /class="seg"|Yes, accurate|No, discrepancies|>Still open<\/button>|>Fixed<\/button>|class="ck/, "no two-button question");

test("Machines: one list per machine, every row working until tapped; the Pattern 43 mark says Not seen; no Past life cell", async () => {
  const P = boot("#a=ar_9|2", API2);
  await settle();
  assert.deepEqual(P.errors, []);
  const main = P.$("main").innerHTML; noDual(main);
  assert.match(main, /What is not working\?/);
  assert.match(main, /data-a="labeled"[^>]*aria-pressed="false"><span class="tx">All hardware labeled/);
  assert.match(main, /data-a="chk" data-k="test" data-s="AC58011020823"[^>]*><span class="tx">Test pattern prints clean/);
  assert.match(main, /data-a="p43"[^>]*><span class="tx">Lines along the feed in cyan<span class="sm">.*Print one and look; Rolando confirms\.<\/span><\/span><span class="st m">Not seen<\/span>/);
  assert.match(main, /data-a="down"[^>]*data-s="S2"[^>]*><span class="tx">Reported down by John<span class="sm">“Paper feed error”<\/span><\/span><span class="st m">Running now<\/span>/);
  assert.doesNotMatch(main, />Past life</, "past rated life is information, never a check");
  assert.equal((main.match(/class="st g">Working</g) || []).length, 2, "both machines read Working until something is tapped");
});

test("Machines: a mark seen on the print or a machine still down reads red and asks for one sentence", async () => {
  const d = startVisit({ machines: VISIT2.machines, diff: VISIT2.count.diff, extras: VISIT2.count.extras });
  d.hw.machines.AC58011020823.p43 = "seen"; d.hw.machines.S2.down = "still";
  const P = boot("#a=ar_9|2", API2, { store: { "aud:d:ar_9": JSON.stringify(d) } });
  await settle();
  const main = P.$("main").innerHTML;
  assert.match(main, /class="itm miss" data-a="p43"[^>]*>.*<span class="st r">Seen<\/span>/);
  assert.match(main, /class="st r">Problem</); assert.match(main, /class="st r">Down</);
  assert.match(main, /class="itm miss" data-a="down"[^>]*>.*<span class="st r">Still down<\/span>/);
  assert.doesNotMatch(main.split('data-s="S2"')[2] || "", /Scan to email works/, "a machine still down asks nothing it cannot do");
  assert.equal((main.match(/What you found/g) || []).length, 2);
});

test("Inventory: OBP against the shelf is measured, not asked; one shelf box per line, no tick; the repair item is one row", async () => {
  const P = boot("#a=ar_9|3", API2);
  await settle();
  let main = P.$("main").innerHTML; noDual(main);
  assert.match(main, /id="obpv">.*OBP is off on 1 line<\/div>/, "Kevin counted 1 where OBP says 2");
  assert.match(main, /data-shelf="ACF0033"[^>]*placeholder="1"/);
  assert.match(main, /data-a="rep" data-k="x1"[^>]*><span class="tx">Fusing gears<span class="sm">John counted 2/);
  const d = startVisit({ machines: VISIT2.machines, diff: VISIT2.count.diff, extras: VISIT2.count.extras }); d.inv.lines.ACF0033 = { shelf: 2, checked: true };
  const Q = boot("#a=ar_9|3", API2, { store: { "aud:d:ar_9": JSON.stringify(d) } });
  await settle();
  main = Q.$("main").innerHTML;
  assert.match(main, /class="wsum" id="obpv">.*OBP matches the shelf<\/div>/, "the shelf says OBP was right");
  assert.equal(JSON.parse(Q.store.get("aud:d:ar_9")).inv.accurate, true, "the kept draft carries the measured answer");
});

test("Crew: the HON app is one row; Review: an open follow-up stays open until tapped Fixed", async () => {
  const P = boot("#a=ar_9|5", API2);
  await settle();
  let main = P.$("main").innerHTML; noDual(main);
  assert.match(main, /data-a="hon"[^>]*aria-pressed="false"><span class="tx">Uses the HON app/);
  const R = boot("#a=ar_9|7", API2);
  await settle();
  main = R.$("main").innerHTML; noDual(main);
  assert.match(main, /tap what is fixed/);
  assert.match(main, /data-a="close" data-k="f1" aria-pressed="false"><span class="tx">Confirm the cyan line<span class="sm">Rolando · by Jan 1, 2099.*<span class="st a">Still open<\/span>/);
});
