// THE 16 OCT 2026 BUG HUNT — the console page (Miguel: "read the code.. find bugs and fix them .. also review the logic").
// Six readers, one per area; every finding traced to a real input before it was fixed. This file pins the PAGE's:
//   1. a tab renderer never paints over the tab the user moved to (§11d) — only openCrew checked VIEW_GEN;
//   2. the contract chip (Crew card, ledger) says months and days off the DAY, not a day count off the clock;
//   3. the ops dashboard says months and days (overdue tile, When cell, the week's empty-seat bar);
//   4. the ship header timeline projects an open earmark like the Fleet Gantt: month-end clamped, Azamara 5;
//   5. the relief panel's month arithmetic clamps (Jul 31 + 7 was SAVED as Mar 3) and its badge says months and days;
//   6. a relief overlay that cannot load says so and closes (Esc, backdrop); the iframe tells the parent;
//   7. the import review is signed by the session, never a hard-coded "Rita";
//   8. imported names are escaped on the Uploads screen; an entity is never passed through impEsc;
//   9. Fleet and Dashboard keep their filters across a background revalidation (the Travel tab's 16 Oct fix).
// The page's inline script runs in a vm with a stub DOM, as test/board_cards.test.js does; the vm is handed the host
// Date so the pinned clock reaches the page.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import vm from "node:vm";
import { RELIEF_HTML } from "../src/relief_ui.js";
import { buildOps } from "../src/ops_dashboard.js";

mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-16T14:00:00Z") });
const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__bh1016_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { APP_HTML };\n", "utf-8");
let APP_HTML;
try { ({ APP_HTML } = await import(TMP.href)); } finally { unlinkSync(TMP); }
const UI = readFileSync(new URL("../src/crew_import_ui.js", import.meta.url), "utf-8");

// A page context whose fetches the test answers by hand: pending[url](json) settles the request.
function pageContext() {
  const els = {}, pending = {};
  const mk = (id) => els[id] || (els[id] = { id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, querySelector: () => mk("q" + Math.random()), querySelectorAll() { return []; }, insertAdjacentHTML() {}, focus() {}, innerHTML: "", textContent: "", value: "", dataset: {} });
  const ctx = {
    document: { readyState: "complete", addEventListener() {}, removeEventListener() {}, getElementById: mk, querySelector: (s) => mk(s.replace(/^#/, "")), querySelectorAll() { return []; }, createElement: () => mk("tmp" + Math.random()), body: mk("body"), documentElement: mk("html"), cookie: "", hidden: false },
    location: { href: "", search: "", pathname: "/", hash: "" }, navigator: { userAgent: "node" },
    fetch: (u) => new Promise((res) => { pending[String(u).replace(/\?.*$/, "")] = (j) => res({ ok: true, status: 200, json: async () => j }); }),
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, console, Date,
    addEventListener() {}, removeEventListener() {}, alert() {}, confirm() { return true; }, requestAnimationFrame: (f) => f && f(),
    history: { replaceState(_s, _t, h) { ctx.location.hash = h; }, pushState() {} }, matchMedia() { return { matches: false, addEventListener() {} }; },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const code of [...APP_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])) new vm.Script(code).runInContext(ctx);
  return { ctx, els, pending, view: () => mk("view").innerHTML };
}
const tick = () => new Promise((r) => setTimeout(r, 15));

test("1. a slow earlier tab never paints over the tab the user moved to (VIEW_GEN in every renderer)", async () => {
  const { ctx, pending, view } = pageContext();
  ctx.show("rotation"); await tick();            // Keyman asked, not yet answered
  ctx.show("crew"); await tick();                // the user moves on
  pending["/api/crew"]({ crew: [{ agency_id: "SC-1", first_name: "Ana", last_name: "Alpha", status: "On board" }] }); await tick();
  assert.match(view(), /id=crrail/, "Crew painted");
  pending["/api/rotation"]({ counts: {}, sections: [{ ship: "Icon", brand: "Royal", crew: [], projections: [] }] });
  pending["/api/relief/board"]({ board: [] }); await tick(); await tick();
  assert.equal(ctx.location.hash, "#crew");
  assert.match(view(), /id=crrail/, "the late Keyman answer did not replace the Crew tab");
  assert.doesNotMatch(view(), /id=rotwrap/);
});

test("2. the contract chip reads months and days off the calendar day, never a clock-based day count", () => {
  const { ctx } = pageContext();
  const today = "2026-10-16";
  assert.match(ctx.contractPass("2026-03-08", today).chip, />OFF today</, "sign-off today, clock 14:00: not 'OFF 1 d ago'");
  assert.match(ctx.contractPass("2026-10-17", "2027-05-17").chip, />ON in 1 d</, "tomorrow is 1 d, not 0");
  assert.match(ctx.contractPass("2026-03-08", "2026-12-08").chip, new RegExp(">OFF in " + ctx.spanCompact(today, "2026-12-08") + "<"), "53 days read as 1 mo 22 d");
  assert.match(ctx.contractPass("2026-01-01", "2026-09-06").chip, new RegExp(">OFF " + ctx.spanCompact("2026-09-06", today) + " ago<"));
  assert.doesNotMatch(ctx.contractPass("2026-03-08", "2026-12-08").chip, />OFF in \d{2,3} d</, "never a bare 53 d");
});

test("3. the ops dashboard says months and days: the overdue tile, the When cell, the week's empty seat", () => {
  const { ctx } = pageContext();
  const k = { overdue: { n: 1, items: [{ code: "QN", days: 42 }] }, noReliever: { n: 0, of: 3, first: [] }, cantSail: { n: 0, of: 3, first: null }, aboard: { n: 48, ships: 48, doubled: [] }, bench: { ready: 2, ashore: 9, now: [], next: [] } };
  const kp = ctx.opsKpis(k);
  assert.match(kp, /QN 1 mo 1\d d/); assert.doesNotMatch(kp, /QN 42 d/);
  const row = (o) => ({ off: "2026-11-27", days: 42, overdue: false, group: "2026-11", surname: "Alpha", code: "QS", ship: "Quest", mark: "ok", reliever: null, travel: {}, kit: {}, soon: false, next: "", ...o });
  const rows = ctx.opsRows([row({}), row({ off: "2026-10-04", days: -12, overdue: true, group: "overdue" })]);
  assert.match(rows, /in 1 mo 11 d</); assert.match(rows, /12 d over</); assert.doesNotMatch(rows, /in 42 d/);
  assert.doesNotMatch(APP_HTML, /'empty '\+\(dayNum\(rd\)-dayNum\(f\.date\)\)\+' d'/, "the week lane's gap is spanCompact");
});

test("4. the ship header timeline projects an open earmark like the Fleet Gantt: month-end clamped, Azamara 5 months", () => {
  const { ctx } = pageContext();
  const em = { state: "yellow", agency_id: "SC-9", assignment_id: "as_1", name: "Ben Bravo", rank: "PS", status: "Earmarked", signOn: "2026-07-31", signOff: null, aboard: false };
  const az = ctx.shipTimeline({ ship: "Quest", brand: "Azamara", crew: [], projections: [{ ...em, vessel_key: "Azamara|Quest" }], history: [], deployed: [] });
  assert.match(az, /Dec 31, 2026/, "Jul 31 + 5 months on Azamara, clamped"); assert.doesNotMatch(az, /Mar 3, 2027/);
  const ry = ctx.shipTimeline({ ship: "Icon", brand: "Royal", crew: [], projections: [{ ...em, vessel_key: "Royal Caribbean|Icon" }], history: [], deployed: [] });
  assert.match(ry, /Feb 28, 2027/, "Jul 31 + 7 months, clamped"); assert.doesNotMatch(ry, /Mar 3, 2027/);
});

test("5. the relief panel clamps its month arithmetic (the saved sign-off) and says months and days on the printer badge", () => {
  const src = (RELIEF_HTML.match(/function addMonths\(d,n\)\{[\s\S]*?\n/) || [])[0];
  assert.ok(src, "addMonths found");
  const addMonths = new Function(src + "return addMonths;")();
  assert.equal(addMonths("2026-07-31", 7), "2027-02-28");
  assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonths("2026-09-30", 5), "2027-02-28");
  assert.equal(addMonths("2026-03-15", 7), "2026-10-15");
  assert.doesNotMatch(RELIEF_HTML, /'OFF in '\+d\+'d'/, "the printer badge is mdN(d)");
});

test("6. a relief overlay that cannot load says so and closes: Esc and the backdrop close it, the iframe reports a board without the ship", () => {
  assert.match(APP_HTML, /function reliefDismiss\(\)/);
  assert.match(APP_HTML, /key==='Escape'[^\n]*reliefDismiss\(\)/);
  assert.match(APP_HTML, /The relief board did not load/);
  assert.match(RELIEF_HTML, /postMessage\(\{t:"reliefClose",error:"board"\}/, "no board or a hull not on it: tell the parent instead of staying invisible");
});

test("7. the import review is signed by the session's email: no hard-coded run_by on either page", () => {
  assert.doesNotMatch(APP_HTML, /run_by:"Rita"/);
  assert.doesNotMatch(UI, /run_by:"Rita"/);
  const routes = readFileSync(new URL("../src/crew_import_routes.js", import.meta.url), "utf-8");
  assert.match(routes, /runBy: session && session\.email/);
  assert.match(routes, /const run_by = \(deps && deps\.runBy\) \|\| body\.run_by \|\| "unknown"/);
});

test("8. imported names are escaped on the Uploads screen, and an entity is never run through impEsc", () => {
  assert.match(APP_HTML, /r\.sampleUnmatched\.map\(impEsc\)\.join\('<br>'\)/);
  assert.doesNotMatch(APP_HTML, /impEsc\(f\.vessel_observed\|\|"&mdash;"\)/);
  assert.match(APP_HTML, /impEsc\(u\.last\+', '\+u\.first\)\+' &middot; contract '/);
});

test("9. Fleet and the Dashboard keep their filters across a background revalidation", () => {
  assert.match(APP_HTML, /cachedJson\('\/api\/fleet',fleetRefresh\)/);
  assert.match(APP_HTML, /cachedJson\('\/api\/ops',opsRefresh\)/);
  assert.match(APP_HTML, /function fleetRefresh\(\)/); assert.match(APP_HTML, /function opsRefresh\(\)/);
});

// The dashboard through the refactored paint path, on a real buildOps output: it paints, says months and days, and a
// background revalidation keeps the week page the user turned to.
test("10. the dashboard paints from buildOps and a revalidation keeps the week page", async () => {
  const seat = (o) => Object.assign({ current: true, state: "green", status: "On board", eccr: false, air: false, hotel: false, offConfirmed: false, heldByFile: false }, o);
  const card = (o) => Object.assign({ current: false, state: "yellow", status: "Earmarked", assignment_id: "as_" + o.agency_id, registry: { verdict: "earmarked" }, docs: null }, o);
  const sections = [
    { ship: "Grandeur", brand: "Royal", crew: [seat({ agency_id: "A", name: "Mark Joseph Dela Rosa", signOn: "2026-02-28", signOff: "2026-09-28", offSource: "projected" }), card({ agency_id: "B", name: "Archiegale Corpin", signOn: "2026-10-08", signOff: "2027-05-08" })], projections: [] },
    { ship: "Allure", brand: "Royal", crew: [seat({ agency_id: "G", name: "John Jeffrey Gorre", signOn: "2026-04-29", signOff: "2026-11-29", offSource: "rita", offConfirmed: true })], projections: [] },
  ];
  const ops = buildOps({ today: "2026-10-16", sections, pool: [], sources: { registry: { at: "2026-10-16", crew: 2, dated: 2 }, count: { as_of: "2026-10-08" }, counter: { stamp: null } }, issues: [],
    crew: [{ sc: "A", first: "Mark Joseph", last: "Dela Rosa" }, { sc: "G", first: "John Jeffrey", last: "Gorre" }], dash: { workforce: {}, travel: { year: 2026 } }, queue: { recent: [] }, kit: { instr: [], link: [] } });
  const { ctx, pending, view } = pageContext();
  const p = ctx.show("dashboard"); await tick();
  pending["/api/ops"](ops); await p; await tick();
  const h = view();
  assert.match(h, /class=ops/, "the dashboard painted");
  assert.match(h, /GR 18 d/, "the overdue tile in days under a month (Sep 28 -> Oct 16)");
  assert.match(h, /in 1 mo 13 d</, "the When cell in months and days (Nov 29)");
  // never a bare day count of a month or more ("42 d", "159 d"): months and days everywhere (Miguel, 16 Oct 2026)
  assert.doesNotMatch(h, /\b([3-9]\d|\d{3}) d( over)?</);
  assert.match(h, /18 d over</, "under a month stays days");
  // the user turns to the next week; a changed answer lands behind the paint
  ctx.OPS_WK = 1;
  ctx.API_CACHE["/api/ops"].data = { ...ops, today: "2026-10-16", tdg: { ...ops.tdg } };
  ctx.opsRefresh(); await tick();
  assert.equal(ctx.OPS_WK, 1, "the revalidation kept the week page (renderDashboard reset it to 0)");
  assert.match(view(), /class=ops/);
});

// The relay under the contract card labelled a predecessor / successor read off the Contract Counter "in the TDG file";
// the Counter is history, not the file (§10d).
test("11. the relay names the Contract Counter as the Counter, never as the TDG file", () => {
  assert.match(APP_HTML, /a\.src==='counter'\?'per the Contract Counter'/);
});

test("12. the Score Card: the Windows are asked with the card's sign-on, and the automatic read takes back a Windows value it did not confirm", async () => {
  const { ctx, els, pending } = pageContext();
  const urls = []; const f0 = ctx.fetch; ctx.fetch = (u, o) => { urls.push(String(u)); return f0(u, o); };
  ctx.openScore("SC-1"); await tick();
  pending["/api/bonus/crew"]({ crew: { agency_id: "SC-1", first_name: "Jim", last_name: "Olid", status: "On board" }, count: 0, contracts: 2, contracts_source: "tdg", rank: "PS", base_salary_usd: 1000, baseline_set: true, nextRungIfClean: 250, outcomes: [], lastLeg: { on: "2026-10-07", off: "2027-05-07", ship: "Odyssey" } });
  await tick(); await tick();
  assert.ok(urls.some((u) => /\/api\/feedback\/crew\?id=SC-1&on=2026-10-07$/.test(u)), "the Windows read carries the card's sign-on: " + urls.join(" "));
  // an answer handed back anyway (a date changed after the open): the automatic read, which applies the sign-on rule, drops it
  pending["/api/feedback/crew"]({ ok: true, requests: [{ role: "ray", status: "answered" }], answers: { ray: { acc: "Accurate" } }, prefill: { sliders: { sAcc: 25, sPar: 15 }, gates: { rush: true }, evidence: ["Ray: ..."], gateNote: ["Rush (Ray)"] }, previous: [] });
  await tick(); await tick();
  assert.equal(String(els.sAcc.value), "25"); assert.equal(els.gRush.checked, true);
  pending["/api/score/auto"]({ ok: true, sliders: { sComm: 10, sMono: 5 }, gates: {}, gateNote: [], evidence: [], audits: [] });
  await tick(); await tick();
  assert.equal(String(els.sAcc.value), "0", "a Windows value the read did not confirm goes back to 0");
  assert.equal(String(els.sPar.value), "0");
  assert.equal(els.gRush.checked, false, "a rush gate the read does not confirm is cleared");
  assert.equal(String(els.sComm.value), "10");
});

// NIGHT WATCH, 20 Oct 2026 — the contract modal posted both port selects as they stood. A seat whose sign-off is not a
// turnaround day shows the ship's HOMEPORT SEED as the selected option, so ticking AIR and Save stored the seed as Rita's
// typed port: production's contract_edit held eight (Noche, Constellation, disembark "San Juan"; embark "Los Angeles",
// "Sydney", "Port Canaveral", "Colon", "Galveston", "Fort Lauderdale" ×2), and the seat then reads disembarkSrc "rita" —
// the sign-off email would print the seed (§11e, §11f). A port is sent when Rita changed it; unchanged, the port already
// saved for THIS contract is sent again (never cleared); else nothing.
test("night watch 20 Oct: the contract modal writes a port only when Rita changed it, keeps the one she saved, never the seed", async () => {
  const { ctx, els } = pageContext();
  const field = (value, attrs = {}) => ({ value, checked: false, textContent: "", getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute(k, v) { attrs[k] = v; } });
  const sent = [];
  ctx.fetch = (u, o) => { sent.push({ u: String(u), body: o && o.body ? JSON.parse(o.body) : null }); return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: "stop" }) }); };
  const save = async (emb, dis) => {
    Object.assign(els, { eKey: field("2026-10-05"), eEmb: emb, eDis: dis, eOn: field("2026-10-05"), eOff: field("2027-05-05", { "data-init": "2027-05-05", "data-proj": "1" }), eShip: field("Constellation"), cEccr: field(""), cAir: Object.assign(field(""), { checked: true }), cHotel: field(""), cOn: field(""), cOff: field(""), cmtmsg: field("") });
    sent.length = 0; await ctx.saveContract("SC-0044814", 1);
    return sent.find((x) => x.u === "/api/rotation/contract").body;
  };
  // Noche on Constellation: nothing typed, the selects show the seed (embark from the itinerary's day, disembark the seed)
  const a = await save(field("KOTOR, MONTENEGRO", { "data-init": "KOTOR, MONTENEGRO", "data-saved": "" }), field("San Juan", { "data-init": "San Juan", "data-saved": "" }));
  assert.equal(a.disembark, null, "the homeport seed the modal only displayed is not written as Rita's port");
  assert.equal(a.embark, null, "nor the displayed embark port");
  assert.equal(a.air, true, "the tick she made is saved");
  assert.equal(a.sign_off, null, "the projected sign-off stays projected (8 Oct 2026)");
  // a port she saved earlier, the select showing the itinerary's port: the saved one is sent again, never cleared
  const b = await save(field("KOTOR, MONTENEGRO", { "data-init": "KOTOR, MONTENEGRO", "data-saved": "KOTOR, MONTENEGRO" }), field("TAMPA, FLORIDA", { "data-init": "TAMPA, FLORIDA", "data-saved": "SAN JUAN, PUERTO RICO" }));
  assert.deepEqual([b.embark, b.disembark], ["KOTOR, MONTENEGRO", "SAN JUAN, PUERTO RICO"]);
  // a port she picked: sent
  const c = await save(field("KOTOR, MONTENEGRO", { "data-init": "KOTOR, MONTENEGRO", "data-saved": "" }), field("CARTAGENA, COLOMBIA", { "data-init": "San Juan", "data-saved": "" }));
  assert.deepEqual([c.embark, c.disembark], [null, "CARTAGENA, COLOMBIA"]);
  // the saved row is the contract's: by on_key, else an unkeyed row at the same position
  const P = [{ seq: 1, on_key: "2026-03-01", embark: "OLD", disembark: "OLD" }, { seq: 2, on_key: "2026-10-05", embark: "E", disembark: "D" }, { seq: 3, on_key: null, embark: "U", disembark: "V" }];
  assert.equal(ctx.savedPorts(P, "2026-10-05", 1).disembark, "D");
  assert.equal(ctx.savedPorts(P, "2027-01-01", 3).embark, "U");
  assert.equal(JSON.stringify(ctx.savedPorts(P, "2027-01-01", 9)), "{}", "no saved row for this contract: nothing to keep");
  // the open path carries what was saved and what was shown; the read returns the saved ports
  assert.match(APP_HTML, /<select id=eDis data-saved="'\+escHtml\(_sp\.disembark\|\|''\)\+'"/);
  assert.match(APP_HTML, /\['eEmb','eDis'\]\.forEach\(function\(x\)\{var s=document\.getElementById\(x\);if\(s\)s\.setAttribute\('data-init',s\.value\|\|''\);\}\);/);
  const W = readFileSync(SRC, "utf-8");
  assert.match(W, /SELECT sc, seq, sign_on, sign_off, ship, on_key, embark, disembark, updated_at FROM contract_edit WHERE sc=\?/);
  assert.match(W, /ready: r \|\| \{ eccr: 0, air: 0, hotel: 0, note: "" \}, ports \}\);/);
});
