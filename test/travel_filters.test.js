// THE TRAVEL TAB — its filters, its decisions, its one period (Miguel, 16 Oct 2026: "I dont think this filter is working
// correctly .. review this and all the filters and fix the bugs"; 17 Oct 2026: "improve this .. fresh, young, luxury
// feeling .. place the filters like we have done elsewhere on the left .. allowing rita to make decisions").
// The page's inline script runs in a vm with a stub DOM (as test/bughunt_1016.test.js does), on a small workbook + bill:
//   1. a background refresh keeps every filter (it used to re-run renderTravel and reset them);
//   2. ONE period — the chosen month, else the year's CLOSED months — reads the hero, the rail and every section;
//   3. the budget is crew travel only, every category, every cruise line: shoreside / one line / one category show the year
//      against last year, never a budget (Miguel, 16 Oct 2026);
//   4. "Needs a decision" lists what the data holds — a month over $15,000, TDG's bill against the workbook, a category up on
//      last year, names the roster cannot place — each with the button that opens it; it settles nothing (§6);
//   5. the Training centre view keeps View + Year only; the search lists people inside the period;
//   6. every monthly chart draws last year beside this year through tBars (PR #270).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import vm from "node:vm";

const SRC = new URL("../src/worker.js", import.meta.url);
const W = readFileSync(SRC, "utf-8");
const TMP = new URL(`../src/__tv_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, W + "\nexport { APP_HTML };\n", "utf-8");
let APP_HTML;
try { ({ APP_HTML } = await import(TMP.href)); } finally { unlinkSync(TMP); }
const fn = (name) => { const i = W.indexOf("function " + name + "("); assert.ok(i >= 0, name + " exists"); const j = W.indexOf("\nfunction ", i + 10); return W.slice(i, j < 0 ? undefined : j); };

function pageContext() {
  const els = {}, pending = {};
  const mk = (id) => els[id] || (els[id] = { id, style: {}, value: "", innerHTML: "", classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, scrollIntoView() {}, focus() {} });
  const ctx = {
    document: { readyState: "complete", addEventListener() {}, removeEventListener() {}, getElementById: mk, querySelector: (s) => mk(s.replace(/^#/, "")), querySelectorAll() { return []; }, createElement: () => mk("x" + Math.random()), body: mk("body"), activeElement: null },
    location: { href: "", search: "", pathname: "/", hash: "" }, navigator: { userAgent: "node" },
    fetch: (u) => new Promise((res) => { pending[String(u).replace(/\?.*$/, "")] = (j) => res({ ok: true, status: 200, json: async () => j }); }),
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, console, Date,
    addEventListener() {}, removeEventListener() {}, alert() {}, confirm() { return true; }, requestAnimationFrame: (f) => f && f(), scrollTo() {},
    history: { replaceState(_s, _t, h) { ctx.location.hash = h; }, pushState() {} }, matchMedia() { return { matches: false, addEventListener() {} }; },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const code of [...APP_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])) new vm.Script(code).runInContext(ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return { ctx, els, pending, run, body: () => mk("trbody").innerHTML, rail: () => mk("tvfacets").innerHTML };
}
const tick = () => new Promise((r) => setTimeout(r, 15));
const rec = (year, month, o) => Object.assign({ year, month, kind: "crew", client: "royal", air: 0, hotel: 0, medical: 0, visa: 0, food: 0, transport: 0, other: 0, crew_name: "Alpha, Ana", agency_id: "SC-1", leg: "on", ship: "Icon" }, o, { total: ["air", "hotel", "medical", "visa", "food", "transport", "other"].reduce((a, k) => a + ((o && o[k]) || 0), 0) });
// 2026: Jan–Sep closed (today 17 Oct), Aug over the $15,000; Oct running. 2025: the same months lower, hotel much lower.
const RECORDS = [];
for (let m = 1; m <= 9; m++) RECORDS.push(rec(2026, m, { air: m === 8 ? 15500 : 9000, hotel: 1500 }));
RECORDS.push(rec(2026, 10, { air: 4000 }));
for (let m = 1; m <= 12; m++) RECORDS.push(rec(2025, m, { air: 8000, hotel: 200 }));
RECORDS.push(rec(2026, 3, { kind: "shoreside", client: "shoreside", air: 700, crew_name: "Shore, Sam", agency_id: null }));
RECORDS.push(rec(2025, 3, { kind: "shoreside", client: "shoreside", air: 500, crew_name: "Shore, Sam", agency_id: null }));
RECORDS.push(rec(2026, 5, { client: "celebrity", air: 1200, crew_name: "Beta, Bo", agency_id: "SC-2", ship: "Apex" }));
RECORDS.push(rec(2025, 6, { client: "celebrity", air: 900, crew_name: "Gamma, Gil", agency_id: "SC-3", ship: "Apex" }));
const TRAVEL = { years: [2026, 2025], today: "2026-10-17", closed: { 2026: 9, 2025: 12 }, budgetMo: 15000, records: RECORDS,
  unmatched: [{ crew_name: "Nobody, Known", how: "none", rows: 2, total: 640, years: [2026] }] };
// TDG billed March air $1,000 more than the workbook carries; April's hotel is billed $500 high and May's $500 low (one
// charge in the next month's bill: nets to zero over the year); every other month agrees.
const SGA = { today: "2026-10-17", lines: [], files: [{ year: 2026, month: 9, sga_no: "39-A", rows: 0, total: 1 }],
  summary: Array.from({ length: 9 }, (_, i) => ({ year: 2026, month: i + 1, air: (i + 1 === 8 ? 15500 : 9000) + (i + 1 === 3 ? 1000 : 0) + (i + 1 === 5 ? 1200 : 0), hotel: 1500 + (i + 1 === 4 ? 500 : 0) - (i + 1 === 5 ? 500 : 0), medical: 0, visa: 0, medical_repat: 0, crew_total: 30000 })),
  training: [{ year: 2026, month: 1, total: 1000, rental: 800, utilities: 200 }, { year: 2025, month: 1, total: 900, rental: 800, utilities: 100 }] };

async function openTravel() {
  const p = pageContext();
  p.ctx.show("travel"); await tick();
  p.pending["/api/travel"](TRAVEL); await tick();
  p.pending["/api/sga"](SGA); await tick(); await tick();
  return p;
}

test("1. a background refresh keeps every filter; renderTravel is never the revalidation target", async () => {
  assert.match(W, /cachedJson\('\/api\/travel',travelRefresh\)/);
  assert.match(W, /cachedJson\('\/api\/sga',travelRefresh\)/);
  assert.doesNotMatch(W, /cachedJson\('\/api\/(travel|sga)',renderTravel\)/, "renderTravel resets TF");
  assert.doesNotMatch(fn("travelRefresh"), /TF=\{/, "the refresh never resets the filters");
  const p = await openTravel();
  p.run("TF.year='2025';TF.month='9';TF.cat='hotel';paintTravel()");
  p.run("API_CACHE['/api/travel'].data=JSON.parse(JSON.stringify(API_CACHE['/api/travel'].data));API_CACHE['/api/travel'].data.records[0].air+=1;travelRefresh()");
  assert.deepEqual(JSON.parse(p.run("JSON.stringify([TF.year,TF.month,TF.cat,TF.kind])")), ["2025", "9", "hotel", "crew"]);
  assert.match(p.body(), /Crew travel · Hotel · Sep 2025/, "the body repainted under the same filters");
  // a year that left the data falls back to All years instead of an empty page
  p.run("TF.year='2019';travelRefresh()");
  assert.equal(p.run("TF.year"), "");
});

test("2. ONE period: the hero, the rail and every section read the year's closed months, or the chosen month", async () => {
  const p = await openTravel();
  const closed = 8 * 10500 + 17000 + 1200;   // Jan–Sep 2026 crew: 8 × (9,000 + 1,500), Aug 17,000, Beta's May 1,200; Oct NOT counted
  assert.match(p.body(), new RegExp("<div class=tvbig>\\$" + closed.toLocaleString() + "</div>"), "the hero is the closed months");
  assert.match(p.rail(), /Crew travel<\/span><span class=n>\$102\.2k</, "the rail's View amount is the same period (Oct's $4,000 not counted)");
  assert.match(p.body(), /9 closed months · Oct running, not counted yet · the latest year/);
  p.run("TF.month='8';paintTravel()");
  assert.match(p.body(), /<div class=tvbig>\$17,000<\/div>/);
  assert.match(p.body(), /Over budget · \$2,000 over/);
  assert.match(p.rail(), /class="on" data-tv="month" data-key="8"/, "the month chip is lit");
  p.run("TF.month='10';paintTravel()");
  assert.match(p.body(), /Oct is still running/, "a running month has no budget verdict");
  assert.doesNotMatch(p.body(), /On budget|Over budget/);
});

test("3. the budget is crew travel only: shoreside, one cruise line and one category compare with last year", async () => {
  const p = await openTravel();
  assert.match(p.body(), /On budget · \$/);
  assert.match(p.body(), /Against the \$180,000 year/);
  for (const set of ["TF.kind='shoreside'", "TF.client='celebrity'", "TF.cat='air'"]) {
    p.run("TF.kind='crew';TF.client='';TF.cat='';" + set + ";paintTravel()");
    assert.doesNotMatch(p.body(), /On budget|Over budget|Against the \$180,000/, set + " has no budget");
    assert.match(p.body(), /No budget for this view · year against year/, set);
    assert.match(p.body(), /vs 2025<\/span>/, set + " still compares with 2025");
  }
  p.run("TF.kind='shoreside';TF.client='';TF.cat='';paintTravel()");
  assert.doesNotMatch(p.rail(), /Cruise line/, "no cruise-line facet on the shoreside view");
});

test("4. Needs a decision: what the data holds, each with its button; nothing is settled", async () => {
  const p = await openTravel();
  const b = p.body();
  assert.match(b, /Aug ran \$2,000 over the \$15,000 budget/);
  assert.match(b, /tvGo\(&quot;month&quot;,8\)/, "the row opens August");
  assert.match(b, /Air · Jan–Sep 2026: TDG billed \$1,000 the workbook does not have/, "ONE net gap per category over the months the bill covers");
  assert.match(b, /over the 9 months on the bill \(1 differs by \$150\+\)/);
  const dec = b.slice(b.indexOf("Needs a decision"), b.indexOf("Month by month"));
  assert.doesNotMatch(dec, /Hotel · /, "a charge typed in the neighbouring month nets to zero: not a decision");
  assert.doesNotMatch(dec, /Air · Mar/, "no month-by-month rows on the year");
  // a chosen month is that month alone: April's hotel gap shows there
  p.run("TF.month='4';paintTravel()");
  assert.match(p.body(), /Hotel · Apr 2026: TDG billed \$500 the workbook does not have/);
  p.run("TF.month='';paintTravel()");
  assert.match(b, /tvOpen\(&quot;tvsga&quot;\)/);
  assert.match(b, /Air is up 22% on 2025/, "the category that grew most (in dollars, 20%+ and $1,000+) against last year's same months");
  assert.match(b, /1 name the crew registry cannot place/);
  assert.doesNotMatch(b, /Air · May/, "Beta's May is in both the bill and the workbook: no gap");
  // the over-budget row is the budgeted view's only
  p.run("TF.kind='shoreside';paintTravel()");
  assert.doesNotMatch(p.body(), /over the \$15,000 budget/);
  // a closed month with workbook spend and no TDG bill on file says so (no button: finance sends it)
  p.run("TF.kind='crew';TF.year='2025';TF.month='3';paintTravel()");
  assert.match(p.body(), /No TDG bill on file for Mar 2025/);
  // nothing to decide: a calm line, not an empty card
  p.run("TF.kind='shoreside';TF.year='2025';TF.month='3';paintTravel()");
  assert.match(p.body(), /Nothing needs a decision in Mar 2025/);
  // tvGo sets one filter and repaints
  p.run("TF.kind='crew';TF.year='';TF.month='';tvGo('month',8)");
  assert.equal(p.run("TF.month"), "8");
  // ONE definition of the bill per month, shared by the decisions and the comparison table
  assert.match(fn("sgaCompareHTML"), /var B=sgaBillOf\(LY,monthsSel\)/);
  assert.match(fn("tvDecisions"), /sgaBillOf\(LY,P\.mo\?\[P\.mo\]:null\)/);
});

test("5. the rail is the Crew tab's; Training centre keeps View + Year; the search lists people inside the period", async () => {
  const p = await openTravel();
  assert.match(p.ctx.document.getElementById("view").innerHTML, /<aside class=crrail id=trrail>/);
  assert.match(p.ctx.document.getElementById("view").innerHTML, /id=tq type=search/, "the search box is drawn once, outside the repainted facets");
  for (const l of ["View", "Year", "Month", "Category", "Cruise line"]) assert.match(p.rail(), new RegExp(">" + l + "<"), l);
  p.run("TF.kind='training';paintTravel()");
  assert.match(p.rail(), />View</); assert.match(p.rail(), />Year</);
  assert.doesNotMatch(p.rail(), />Month<|>Category<|>Cruise line</, "the training statement has no month, category or line filter");
  assert.match(p.body(), /Training centre · 2026 through Jan/);
  assert.match(p.body(), /▲ 11% vs 2025/);
  p.run("TF.kind='crew';TF.q='beta';TF.year='2025';paintTravel()");
  assert.match(p.body(), /No one matches “beta” in 2025/, "Beta travelled in 2026 only");
  p.run("TF.year='2026';paintTravel()");
  assert.match(p.body(), /Every expense for this person/);
});

test("6. every monthly chart draws last year beside this year through tBars", () => {
  const b = fn("tBars");
  assert.match(b, /hasPrev=!!prev&&prev\.some\(function\(v\)\{return v>0;\}\)/, "no previous year → the plain bar");
  assert.match(b, /d=\(hasPrev&&pv0>0&&m<=upto\)/, "no percentage for a month still running or not started");
  assert.match(fn("paintTraining"), /h\+=tBars\(curT,\{prev:prevT,ly:LY,py:PY,upto:lastMo,/);
  assert.match(fn("paintTravel"), /tBars\(curB,\{prev:hasPY\?prevB:null,ly:LY,py:PY,budget:TBUD,upto:lastMo,dim:dim,color:/, "the budget chart");
  assert.match(fn("paintTravel"), /tBars\(curB,\{prev:hasPY\?prevB:null,ly:LY,py:PY,upto:lastMo,dim:dim\}\)/, "the year-against-year chart");
  assert.doesNotMatch(fn("paintTravel"), /gap:8px;height:150px/, "no hand-rolled bar loop");
  // a negative amount reads -$655, never $-655
  assert.match(W, /function usd0\(n\)\{var v=Number\(n\|\|0\);return \(v<0\?'-':''\)\+'\$'\+Math\.abs\(v\)/);
});

test("Needs a decision names a bill the inbox HELD (Miguel, 17 Oct 2026: \"Hold it for Rita\"), in every view of its year", async () => {
  const p = pageContext();
  p.ctx.show("travel"); await tick();
  p.pending["/api/travel"](TRAVEL); await tick();
  const held = { file_key: "mail:abc@abc", name: "DG3 SGA EXCEL OCTOBER'26.xlsx", held_at: "2026-11-02T03:12:00Z", year: 2026, month: 10, lines_total: 1428.52, others: 0, grand_total: 1500, gap: 71.48, rows: 1, hash: "a".repeat(64) };
  p.pending["/api/sga"]({ ...SGA, held: [held] }); await tick(); await tick();
  const dec = (b) => b.slice(b.indexOf("Needs a decision"), b.indexOf("Month by month"));
  let d = dec(p.body());
  assert.match(d, /TDG’s bill for Oct 2026 is held: its lines do not add up/);
  assert.match(d, /Lines \$1,428\.52 against TDG’s grand total \$1,500\.00 · \$71\.48 missing\. It arrived on Nov 2, 2026 and loaded nothing\./);
  assert.match(d, /window\.open\(&quot;\/api\/sga\/file\?hash=a{64}&quot;\)">Download →/);
  p.run("TF.kind='shoreside';paintTravel()");
  assert.match(dec(p.body()), /is held: its lines do not add up/, "the bill is the whole SGA: every view of its year");
  p.run("TF.kind='crew';TF.year='2025';paintTravel()");
  assert.doesNotMatch(dec(p.body()), /is held/, "another year does not carry it");
});

test("Acknowledge hides a decision for everyone until its number changes (Miguel, 19 Oct 2026: \"once acknowledge .. they should disappear\")", async () => {
  const p = await openTravel();
  const dec = (b) => b.slice(b.indexOf("Needs a decision"), b.indexOf("Month by month"));
  let d = dec(p.body());
  assert.match(d, /Aug ran \$2,000 over the \$15,000 budget/);
  assert.match(d, /class=tvack onclick="tvAck\(\d+\)"[^>]*>Acknowledge</, "every keyed row carries Acknowledge");
  const i = p.run("TVDEC.findIndex(function(x){return /^Aug ran/.test(x.t);})");
  const key = p.run("TVDEC[" + i + "].k");
  assert.equal(key, "over:2026-8:17000", "the key names the fact AND its figure");
  p.run("tvAck(" + i + ")"); await tick();
  assert.ok(p.pending["/api/travel/ack"], "Acknowledge posts to the server: shared by Rita and Miguel, not one browser");
  p.pending["/api/travel/ack"]({ ok: true, acks: [{ key, label: "Aug ran $2,000 over the $15,000 budget", ack_by: "rita@dg3.com", ack_at: "2026-10-19T10:00:00Z" }] }); await tick();
  d = dec(p.body());
  assert.doesNotMatch(d, /<div class=t>Aug ran/, "an acknowledged row leaves the list");
  assert.match(d, /1 acknowledged · show/);
  p.run("TVACKOPEN=true;paintTravel()");
  d = dec(p.body());
  assert.match(d, /class=tvacki><span class=t>Aug ran \$2,000 over the \$15,000 budget<\/span><span class=b>rita · Oct 19, 2026<\/span><button class=tvgo onclick="tvAck\(\d+,true\)">Undo/);
  // the same fact with another number (a corrected workbook) is a new key: it comes back
  p.run("TRV.acks=[{key:'over:2026-8:16500',label:'x',ack_by:'rita@dg3.com',ack_at:'2026-10-19T10:00:00Z'}];paintTravel()");
  assert.match(dec(p.body()), /<div class=t>Aug ran \$2,000 over/, "a changed figure is not the fact Rita acknowledged");
  // a held bill is never acknowledged away: it loaded nothing until Rita loads it
  assert.doesNotMatch(fn("tvDecisions"), /out\.push\(\{k:[^}]*is held/);
});

test("View is ticks: one, several or all (Miguel, 20 Oct 2026: \"allow to select multiple items .. u can single them out\")", async () => {
  const p = await openTravel();
  const tick = (v) => p.run("tvRailClick({target:{closest:function(){return {getAttribute:function(a){return a==='data-tv'?'kind':'" + v + "';}};}}})");
  const hero = () => { const b = p.body(); return b.slice(0, b.indexOf("Needs a decision")); };
  assert.equal((p.rail().match(/data-tv="kind"[^>]*><input type=checkbox/g) || []).length, 3, "three ticks: crew, shoreside, training centre");
  assert.doesNotMatch(p.rail(), /Crew \+ shoreside/, "the combination is two ticks, not a row of its own");
  // crew alone: the budget, as before
  assert.match(hero(), /Crew travel · 2026 to date/); assert.match(hero(), /\$102,200/); assert.match(hero(), /On budget/);
  // + shoreside: both kinds of travel, no budget
  tick("shoreside");
  assert.equal(p.run("TF.kind"), "", "crew + shoreside is the old 'both'");
  assert.match(hero(), /Crew \+ shoreside · 2026 to date/); assert.match(hero(), /\$102,900/); assert.doesNotMatch(hero(), /On budget|Over budget/);
  // + training centre: TDG's training statement joins the hero, the months and Where it goes
  tick("training");
  assert.equal(p.run("TF.withTr"), true);
  assert.match(hero(), /Crew \+ shoreside \+ training centre · 2026 to date/);
  assert.match(hero(), /\$103,900/, "102,900 of travel + 1,000 of the training statement");
  assert.match(hero(), /No budget for this view · year against year/);
  assert.match(p.body(), /<span>Training centre<\/span>.*?<b>\$1,000<\/b>/s, "the centre is one row of Where it goes");
  // a cruise line has no training centre: the slice is travel only
  p.run("TF.client='celebrity';paintTravel()");
  assert.doesNotMatch(hero(), /training centre/); p.run("TF.client='';paintTravel()");
  // single it out: untick the two travel views and the training centre's own page opens
  tick("crew"); tick("shoreside");
  assert.equal(p.run("TF.kind"), "training");
  assert.match(p.body(), /Training centre · 2026 through Jan/);
  tick("training");
  assert.equal(p.run("TF.kind"), "training", "the last tick stays: a view is never empty");
  // back to crew alone
  tick("crew"); tick("training");
  assert.equal(p.run("TF.kind"), "crew"); assert.equal(p.run("TF.withTr"), false);
  assert.match(hero(), /On budget/, "crew alone gets its budget back");
});
