// The Keyman board card, RUN rather than grepped.
//
// The board is one renderer with two states (Miguel, 14 Sep 2026): green is what TDG's Contract
// Counter says, yellow is what Rita planned. The rules below are behavioural — green is never
// draggable, yellow always is, a card only offers Remove when there is a projection to remove —
// and a static grep cannot tell you whether the function actually produces them. So the page's
// inline script is executed in a vm with a minimal DOM, and the real rotCard/rotShip are called.
//
// This also catches what three shadowed copies of reliefSlot hid for months: the LAST definition
// is the one the browser runs, and only running it tells you which that is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import vm from "node:vm";

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__cards_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { APP_HTML };\n", "utf-8");
let APP_HTML;
try { ({ APP_HTML } = await import(TMP.href)); } finally { unlinkSync(TMP); }

function pageContext() {
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, focus() {}, value: "", innerHTML: "", textContent: "", dataset: {} });
  const ctx = {
    // getElementById/querySelector hand back a node rather than null: the page boots an async
    // render on load, and a null here would fail the run for the stub's reasons, not the page's.
    document: { readyState: "complete", addEventListener() {}, getElementById: el, querySelector: el, querySelectorAll() { return []; }, createElement: el, body: el(), documentElement: el(), cookie: "" },
    location: { href: "", search: "", pathname: "/" }, navigator: { userAgent: "node" },
    // The page boots its first render from /api/... . A fetch that never settles leaves that boot
    // parked instead of feeding it empty objects it would then read fields off — the card rules
    // under test need the FUNCTIONS defined, not the page rendered.
    fetch: () => new Promise(() => {}),
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, console,
    addEventListener() {}, alert() {}, confirm() { return true; }, requestAnimationFrame: (f) => f && f(),
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const errors = [];
  for (const [i, code] of [...APP_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).entries()) {
    try { new vm.Script(code, { filename: "app" + i + ".js" }).runInContext(ctx); }
    catch (e) { errors.push(String(e && e.message)); }
  }
  return { ctx, errors };
}

const { ctx, errors } = pageContext();
// The live green fixture signs off ~200 days from WHENEVER the suite runs: the real cardOverdue()
// compares against today, and a literal date (2026-09-30 until 5 Oct 2026) turned this card overdue
// the day it passed and failed two tests that have nothing to do with overdue seats.
const GREEN_OFF = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
const GREEN = { state: "green", agency_id: "SC-1", seq: 1, vessel_key: "Royal Caribbean|Icon", name: "Ana Alpha", rank: "Printer Specialist", status: "On board", current: true, signOn: "2026-03-08", signOff: GREEN_OFF, on_city: "Miami", on_conf: "derived", eccr: 1 };
const YELLOW = { state: "yellow", agency_id: "SC-9", assignment_id: "as_1", vessel_key: "Royal Caribbean|Icon", name: "Ben Bravo", rank: "Junior PS", status: "Earmarked", signOn: "2026-11-02", signOff: "2027-05-02", aboard: false, on_city: "Barcelona", on_conf: "derived" };

test("the page's inline script runs top to bottom without throwing", () => {
  assert.deepEqual(errors, [], "a top-level error white-screens the console for every signed-in user");
  for (const fn of ["rotCard", "rotShip", "reliefSlot", "openRelief", "planDelete", "rcDrag", "rcClickP"]) {
    assert.equal(typeof ctx[fn], "function", fn + " is not defined on the page");
  }
});

// 15 Sep 2026 (Miguel: "I cannot drag and drop"): a green card DRAGS, but a drop never moves it —
// it creates a yellow projection on the target ship and the green stays (one crew, two ships).
// TDG still owns the green card: no Remove, no PLAN label, the click still opens the contract editor.
test("GREEN is a TDG card: drags to PLAN elsewhere, never moves; click opens the contract editor", () => {
  const h = ctx.rotCard(GREEN);
  assert.match(h, /class="rcard green cur"/);
  assert.match(h, /draggable="true"/, "a green card must drag: the drop creates a projection on the target ship");
  assert.match(h, /ondragstart="rcDrag\(event,this\)"/);
  assert.match(h, /title="TDG contract - click to edit, drag to another ship to earmark them there"/);
  assert.doesNotMatch(h, /planDelete/, "a TDG card has no Remove: what is in the import stays");
  assert.doesNotMatch(h, /rlab plan/);
  assert.match(h, /Ana Alpha/);
  assert.match(h, /<span class="rdate on">Mar 8, 2026<\/span>/, "the sign-on is on the card, as a calendar date (7 Oct 2026: 'we had them very well done')");
});

// 7 Oct 2026: one word — EARMARK (Miguel: "all the projections, people who are not on board but they're coming
// on board, we're going to call them earmarks").
test("YELLOW is Rita's earmark: draggable, labelled EARMARK, removable (Miguel, 5 + 7 Oct 2026)", () => {
  const h = ctx.rotCard(YELLOW);
  assert.match(h, /class="rcard plan"/);
  assert.match(h, /draggable="true"/);
  assert.match(h, /ondragstart="rcDrag\(event,this\)"/);
  assert.match(h, /<span class="rlab plan">EARMARK<\/span>/);
  assert.match(ctx.rotCard({ ...YELLOW, deployedAt: "2026-10-05" }), /<span class="rlab plan">EARMARK &middot; SENT TO TDG<\/span>/, "sent to Joy: the label says so");
  assert.match(ctx.rotCard({ ...YELLOW, registry: { verdict: "earmarked", status: "Earmarked", ship: "Icon", at: "2026-10-04" } }), /<span class="rlab tdg">EARMARK &middot; TDG<\/span>/, "TDG earmarks them too: confirmed from TDG's side");
  assert.match(h, /data-aid="as_1"/);
  assert.match(h, /onclick="planDelete\(event,this\)"/);
  assert.match(h, /data-vk="Royal Caribbean\|Icon"/, "clicking a projection must open the relief editor for its ship");
  assert.match(h, /not in a TDG file yet/);
});

test("a projection whose contract has started says ABOARD and keeps its solid outline", () => {
  const h = ctx.rotCard({ ...YELLOW, aboard: true, signOn: "2026-08-01" });
  assert.match(h, /class="rcard plan aboard"/);
  assert.match(h, /EARMARK &middot; ABOARD/);
});

// 7 Oct 2026 (Miguel: "this deploy CTA does not need it anymore .. the logic is not like that no more"): Joy is told
// from the import review, row by row. No card carries a Deploy button; every earmark card carries Remove.
test("no card carries the Deploy CTA any more; every earmark card carries Remove, TDG's own earmark included", () => {
  const h = ctx.rotCard(YELLOW);
  assert.doesNotMatch(h, /planDeploy|>Deploy</);
  assert.match(h, /class="pbtn danger" data-aid="as_1"[^>]*onclick="planDelete\(event,this\)">Remove</);
  assert.doesNotMatch(ctx.rotCard(GREEN), /planDeploy|planDelete/, "a TDG contract is neither ours to deploy nor to remove");
  // TDG's earmark drawn from the file (no assignment): Remove records the rejection and offers to tell Joy
  const t = ctx.rotCard({ ...YELLOW, ship: "Icon", assignment_id: null, tdgEarmark: true, signOn: null, signOff: null, registry: { verdict: "earmarked", status: "Earmarked", ship: "Icon", at: "2026-10-06" } });
  assert.match(t, /class="pbtn danger" data-crew="SC-9" data-ship="Icon"[^>]*data-at="2026-10-06" onclick="earmarkDismiss\(event,this\)">Remove</);
  // a console card TDG ALSO earmarks: Remove goes through the dismissal too, or the next Apply re-creates it
  const both = ctx.rotCard({ ...YELLOW, ship: "Icon", registry: { verdict: "earmarked", status: "Earmarked", ship: "Icon", at: "2026-10-06" } });
  assert.match(both, /data-dis="1" data-ship="Icon" data-crew="SC-9"[^>]*onclick="planDelete\(event,this\)"/);
  assert.equal(typeof ctx.earmarkDismiss, "function");
  assert.equal(typeof ctx.deployRestore, "function", "legacy sent lines still restore");
});

test("the ship section shows what was sent to TDG, with Restore, until the Counter brings it back", () => {
  const sent = { id: "dep_1", agency_id: "SC-9", name: "Ben Bravo", ship: "Icon", signOn: "2026-11-02", sentAt: "2026-09-14", aboard: false };
  const sec = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, crew: [], projections: [], deployed: [sent], history: [] });
  assert.match(sec, /sent to TDG on 2026-09-14/);
  assert.match(sec, /awaiting the Counter/);
  assert.match(sec, /data-log="dep_1"[^>]*onclick="deployRestore\(this\)"/);
  assert.doesNotMatch(sec, /1 sent to TDG/, "7 Oct 2026: the header carries no counts — the sent row says it");
  const ab = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, crew: [], projections: [], deployed: [{ ...sent, aboard: true }], history: [] });
  assert.match(ab, /aboard per your board, awaiting the Counter/);
  const none = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, crew: [], projections: [], deployed: [], history: [] });
  assert.doesNotMatch(none, /sent to TDG/);
});

test("a yellow card with no projection behind it offers no Remove", () => {
  // An aboard reliever drawn from the schedule may reach the card without an assignment id.
  const h = ctx.rotCard({ ...YELLOW, assignment_id: null });
  assert.doesNotMatch(h, /planDelete/);
  assert.doesNotMatch(h, /data-aid="null"/);
});

test("the card names who set the dates, and says when TDG replaced an edit", () => {
  assert.match(ctx.rotCard({ ...GREEN, dateSource: "rita", dateSourceAt: "2026-09-12" }), /Your dates, 2026-09-12 &middot; newer than the TDG file/);
  assert.match(ctx.rotCard({ ...GREEN, overridden: true, dateSource: "counter", dateSourceAt: "2026-09-20" }), /<b>TDG dates<\/b> from the 2026-09-20 file &middot; newer than your edit/);
  assert.doesNotMatch(ctx.rotCard(GREEN), /srcnote/, "no note when nobody has touched the TDG values");
});

test("a sign-off that has passed reads as elapsed on both states, never as a negative countdown", () => {
  const past = "2026-01-01";
  // Option C wording (6 Oct 2026): "<span> · PAST SIGN-OFF" — elapsed, never "-N". Since 7 Oct 2026 the span is
  // calendar months + days ("9 mo 6 d"), never a bare day count once a month has passed.
  assert.match(ctx.rotCard({ ...GREEN, signOff: past }), /<b>\d+ mo( \d+ d)?<\/b><i>PAST SIGN-OFF<\/i>/);
  assert.match(ctx.rotCard({ ...YELLOW, aboard: true, signOn: "2025-06-01", signOff: past }), /<b>\d+ mo( \d+ d)?<\/b><i>PAST SIGN-OFF<\/i>/);
  assert.doesNotMatch(ctx.rotCard({ ...GREEN, signOff: past }), /TO SIGN-OFF|-\d+ ?d/);
});

test("the seat card is a thin progress bar with the two calendar dates under it — no lane, no dots, no TODAY tick", () => {
  const h = ctx.rotCard({ ...GREEN, signOn: "2026-07-02", signOff: "2027-01-16" });
  assert.match(h, /<div class="pbar"><i style="width:\d+%"><\/i><\/div><span class="rdate on">Jul 2, 2026<\/span><span class="rdate off">Jan 16, 2027<\/span>/);
  assert.doesNotMatch(h, /class="lane|TODAY|2026-07-02|2027-01-16| aboard<| to go</, "no lane, no TODAY tick, no ISO date, no aboard / to-go row");
  const late = ctx.rotCard({ ...GREEN, signOff: "2026-01-01", offSource: "projected" });
  assert.match(late, /<div class="pbar late"><i style="width:100%"><\/i><\/div><span class="rdate on">Mar 8, 2026<\/span><span class="rdate off">Jan 1, 2026<\/span>/, "overdue fills the bar");
  const plan = ctx.rotCard({ ...YELLOW, signOn: "2099-01-01", signOff: "2099-08-01" });
  assert.match(plan, /<div class="pbar plan"><\/div><span class="rdate on">Jan 1, 2099<\/span><span class="rdate off">Aug 1, 2099<\/span>/, "an earmark: empty dashed track, its planned dates");
  const hist = ctx.histCard({ name: "X", on: "2025-09-22", off: "2026-04-01" });
  assert.match(hist, /Sep 22, 2025 → Apr 1, 2026/);
  assert.doesNotMatch(hist, /2025-09-22/);
});

test("the ship header carries Miguel's timeline: one segment per crew, ticks with calendar dates, TODAY, names above", () => {
  const sec = { ship: "Icon", brand: "Royal", onboard: 1, crew: [GREEN], projections: [{ ...YELLOW, signOn: GREEN_OFF, signOff: "2027-12-01" }], history: [], deployed: [] };
  const h = ctx.rotShip(sec);
  assert.match(h, /<span class=nm>Icon<\/span><div class=stl /, "the timeline sits in the header after the ship name");
  assert.match(h, /<i class="sg seat/, "the active crew is a green segment");
  assert.match(h, /<i class="sg earmark proj" /, "the earmark is a yellow segment, dashed while its sign-off is a plan");
  assert.match(h, /<b class=swho [^>]*>Alpha<\/b>/, "the name above the segment");
  assert.match(h, /<span class="std first" [^>]*>Mar 8, 2026<\/span>/, "the first tick is the active crew's sign-on, as a calendar date");
  assert.match(h, /<span class="std last" [^>]*>Dec 1, 2027<\/span>/, "the last tick is the last earmark's sign-off");
  assert.match(h, /<i class=snow [^>]*><em>TODAY<\/em><\/i>/, "TODAY is marked");
  assert.doesNotMatch(h, /sgap/, "a handover on the same day is not a gap");
  const gap = ctx.rotShip({ ...sec, projections: [{ ...YELLOW, signOn: "2099-01-01", signOff: "2099-08-01" }] });
  assert.match(gap, /<i class=sgap /, "the ship uncovered between two contracts draws red");
  const empty = ctx.rotShip({ ship: "Jewel", brand: "Royal", onboard: 0, crew: [], projections: [], history: [], deployed: [] });
  assert.match(empty, /<div class="stl none">.*no crew aboard, nobody earmarked/, "an empty hull says so on the line");
  // 7 Oct 2026 (Miguel: "here you have 3 people .. so you should have 3 in the timeline"): a TDG earmark with no dates is a
  // named stub after the last dated contract, "no dates" under it; the dated part keeps its scale.
  const und = ctx.rotShip({ ...sec, projections: [{ ...YELLOW, tdgEarmark: true, signOn: null, signOff: null, name: "Cy Talucod", registry: { verdict: "earmarked", status: "Earmarked", ship: "Icon" } }] });
  assert.match(und, /<i class="sg tdg und" style="left:92\.00%;width:8\.00%;top:0" title="Cy Talucod · TDG earmark · no dates yet"><\/i><b class=swho [^>]*>Talucod<\/b><span class="std soft" [^>]*>no dates<\/span>/);
  assert.match(und, /<i class="sg seat" style="left:0\.00%;width:(8[5-9]|9[01])\.\d\d%/, "the dated contract is scaled into the first 91%");
  const only = ctx.rotShip({ ...sec, crew: [], projections: [{ ...YELLOW, tdgEarmark: true, signOn: null, signOff: null, name: "Cy Talucod", registry: { verdict: "earmarked" } }] });
  assert.match(only, /<i class="sg tdg und" style="left:0\.00%;width:99\.00%/, "an earmark alone spans the line");
  assert.doesNotMatch(only, /snow/, "no TODAY without a dated contract");
  const two = ctx.rotShip({ ...sec, projections: [{ ...YELLOW, awaiting: true, aboard: true, signOn: "2026-10-01", signOff: "2027-05-01" }] });
  assert.match(two, /<i class="sg await[^"]*" style="[^"]*top:9px"/, "two crew at once → the second takes the lane below");
});

test("the chip reads months and days off the calendar, not a raw day count (Miguel, 7 Oct 2026: '3M 22 days')", () => {
  const iso = (d) => d.toISOString().slice(0, 10);
  const t0 = new Date(iso(new Date()) + "T00:00:00Z");
  const plus = (m, d) => { const x = new Date(t0); x.setUTCMonth(x.getUTCMonth() + m); x.setUTCDate(x.getUTCDate() + d); return iso(x); };
  // under a month: days alone, the number stays big
  assert.match(ctx.rotCard({ ...GREEN, signOff: plus(0, 22) }), /class="offchip due"><b>22 d<\/b><i>TO SIGN-OFF<\/i>/);
  // past a month: "<M> mo <D> d", the chip carries the long class so the name keeps its room
  assert.match(ctx.rotCard({ ...GREEN, signOff: plus(3, 22) }), /class="offchip long"><b>3 mo 22 d<\/b><i>TO SIGN-OFF<\/i>/);
  assert.match(ctx.rotCard({ ...GREEN, signOff: plus(3, 0) }), /<b>3 mo<\/b><i>TO SIGN-OFF<\/i>/, "no '0 d' tail");
  // a plan counts down to its sign-on the same way
  assert.match(ctx.rotCard({ ...YELLOW, signOn: plus(2, 5), signOff: plus(9, 5) }), /<b>2 mo 5 d<\/b><i>TO SIGN-ON<\/i>/);
  // elapsed reads the same, red
  assert.match(ctx.rotCard({ ...GREEN, signOff: plus(-1, -3) }), /class="offchip crit long"><b>1 mo 3 d<\/b><i>PAST SIGN-OFF<\/i>/);
  assert.doesNotMatch(ctx.rotCard({ ...GREEN, signOff: plus(3, 22) }), /<b>\d{2,3} d<\/b>/, "never '113 d'");
});

test("a future projection counts down to its sign-on, not to a sign-off it has not reached", () => {
  const h = ctx.rotCard({ ...YELLOW, signOn: "2099-01-01", signOff: "2099-07-01" });
  assert.match(h, /<b>\d+ mo( \d+ d)?<\/b><i>TO SIGN-ON<\/i>/);
  assert.doesNotMatch(h, /TO SIGN-OFF/);
});

test("the ship section draws both feeds through the ONE renderer and counts them apart", () => {
  const sec = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 1, crew: [GREEN], projections: [YELLOW], history: [] });
  assert.equal((sec.match(/class="rcard /g) || []).length, 2, "one green, one yellow");
  // 15 Sep 2026: the header used to read "N current", counting CARDS — it called a seafarer whose
  // sign-off passed weeks ago "current" alongside the one actually at work. It now states what is true.
  // 7 Oct 2026 (Miguel: "we don't need to have this royal one on board"): the header is the name, the timeline and a
  // chevron — no brand, no counts. What is true is on the cards and the line.
  const hdr = sec.slice(0, sec.indexOf("<div class=\"shipbody"));
  assert.match(hdr, /<span class=meta><span class="arw">▾<\/span><\/span><\/div>$/, "only the chevron after the timeline");
  assert.doesNotMatch(hdr, /Royal|onboard|current|earmarked|overdue|completed/, "no counts, no brand word in the header");
  const ovd = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, crew: [{ ...GREEN, current: false, status: "On Vacation", signOff: "2020-01-01" }], projections: [], history: [] });
  assert.match(ovd, /class="rcard green overdue"/, "a green card past its sign-off is drawn overdue on the card itself");
  assert.doesNotMatch(ovd.slice(0, ovd.indexOf("<div class=\"shipbody")), /onboard|overdue/, "and the header stays quiet");
  const sec0 = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, crew: [], projections: [], history: [] });
  assert.doesNotMatch(sec0, /planned/, "no projections, no count");
  assert.match(sec0, /drag crew here/);
});

test("a ship with ONLY a projection still renders the card, not the empty hint", () => {
  const sec = ctx.rotShip({ ship: "Vision", brand: "Royal", onboard: 0, crew: [], projections: [YELLOW], history: [] });
  assert.match(sec, /class="rcard plan"/);
  assert.doesNotMatch(sec, /drag crew here/);
});

test("expired documents are a warning on BOTH states, never a block", () => {
  const docs = { worst: "expired", label: "2 EXPIRED", title: "Expired: Passport, Seaman's Book", expired: 2, missing: 0, expiring: 0 };
  for (const card of [{ ...GREEN, docs }, { ...YELLOW, docs }]) {
    const h = ctx.rotCard(card);
    assert.match(h, /class="rtag bad"[^>]*>2 EXPIRED</);
    assert.match(h, /title="Expired: Passport, Seaman&quot;?.?s Book"|title="Expired: Passport, Seaman's Book"/);
  }
  const soon = ctx.rotCard({ ...YELLOW, docs: { worst: "expiring", label: "1 EXPIRING", title: "Within 90 days: US C1/D Visa", expiring: 1 } });
  assert.match(soon, /class="rtag warn"[^>]*>1 EXPIRING</);
  assert.doesNotMatch(ctx.rotCard(GREEN), /rtag bad|rtag warn/, "a clean seafarer carries no document chip");
  // Remove is still there: a warning never blocks anything (7 Oct 2026: the Deploy button is gone from the card).
  assert.match(ctx.rotCard({ ...YELLOW, docs }), /planDelete/);
});

test("a Junior PS on a restricted hull is flagged on the card, and the drop asks before it moves", () => {
  const h = ctx.rotCard({ ...YELLOW, jrWarn: "block" });
  assert.match(h, /Junior PS on a <b>block<\/b> ship/);
  assert.doesNotMatch(ctx.rotCard(YELLOW), /jrnote/, "no rule, no note");
  const sec = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, jrPsRule: "block", crew: [], projections: [], history: [] });
  assert.match(sec, /data-jr="block"/, "the drop zone carries the rule, so the warning happens before anything is written");
});

test("the Junior PS rule is Royal Caribbean's only: a Celebrity or Azamara hull is open whatever the vessel row says", () => {
  // Miguel, 7 Oct 2026 (Edge, a Celebrity hull, warned "Junior PS on a block ship"): "this only applies to a Royal
  // Caribbean ship ... For Celebrity ... all apply the same way. For Azamara, it's exactly the same as Celebrity."
  const src = readFileSync(SRC, "utf-8");
  assert.match(src, /SELECT name, brand, jr_ps_rule FROM vessel/, "the brand rides the vessel read");
  assert.match(src, /jrRule\[normShip\(v\.name\)\] = \/royal\/i\.test\(String\(v\.brand \|\| ""\)\) \? \(v\.jr_ps_rule \|\| null\) : "open";/,
    "a non-Royal hull is open regardless of its jr_ps_rule word");
});

test("exactly one definition of each relief renderer survives — the shadowing is gone for good", () => {
  const src = readFileSync(SRC, "utf-8");
  for (const fn of ["reliefSlot", "openRelief", "rotCard"]) {
    const n = (src.match(new RegExp("function " + fn + "\\(", "g")) || []).length;
    assert.equal(n, 1, fn + " is defined " + n + " times; the last one silently wins and the others are dead weight");
  }
});

/* ---- review, 14 Sep 2026: the drag path ---- */

test("dropping a PROJECTION moves the assignment; dropping anything else CREATES one; the registry ship is never written", () => {
  const src = readFileSync(SRC, "utf-8");
  assert.equal(typeof ctx.moveProjection, "function", "moveProjection must exist on the page");
  assert.equal(typeof ctx.createProjection, "function", "createProjection must exist on the page");
  assert.equal(typeof ctx.removeProjection, "function", "removeProjection must exist on the page");
  const drop = src.slice(src.indexOf("z.ondrop=function(e){e.preventDefault();z.classList.remove('dragover');"));
  const body = drop.slice(0, drop.indexOf("createProjection(DRAGID,ship);") + "createProjection(DRAGID,ship);".length);
  assert.match(body, /var aid=DRAGEL&&DRAGEL\.getAttribute\('data-aid'\)/, "the drop must look at WHICH card was dragged");
  assert.match(body, /if\(ship==='__POOL__'\)\{if\(aid\)\{removeProjection\(aid\);\}/, "a projection dropped on the pool is removed; nothing else happens to a green card there");
  assert.match(body, /if\(aid\)\{[^\n]*moveProjection\(aid,ship\);return;\}/, "a yellow card goes through moveProjection");
  assert.match(body, /createProjection\(DRAGID,ship\);/, "a green or pool card creates a projection on the target ship (15 Sep 2026)");
  // The registry-write path is gone for good: no client caller, no route, no handler.
  assert.doesNotMatch(src, /assignCrew\(/, "the old drag path (crew_override.vessel_observed) must not come back");
  assert.doesNotMatch(src, /"\/api\/rotation\/assign"/, "the registry-ship route is retired");
  assert.doesNotMatch(src, /async function apiRotationAssign/, "the registry-ship handler is retired");
  assert.match(src, /"\/api\/rotation\/project" && request\.method === "POST"/, "the projection route is wired");
  const mv = src.slice(src.indexOf("async function moveProjection(aid,ship){"));
  assert.match(mv.slice(0, mv.indexOf("\n}")), /fetch\('\/api\/relief\/save'[\s\S]*vessel_name:ship/, "the move is the relief board's own save: id + vessel_name");
  const cp = src.slice(src.indexOf("async function createProjection(id,ship){"));
  assert.match(cp.slice(0, cp.indexOf("\n}")), /fetch\('\/api\/rotation\/project'[\s\S]*agency_id:id,ship:ship/, "create posts crew + ship; the server picks the dates");
});

test("a Counter leg takes its edit from editFor only — no position fallback that could reattach an edit", () => {
  const src = readFileSync(SRC, "utf-8");
  const eff = src.slice(src.indexOf("const eff = (leg) => {"));
  const body = eff.slice(0, eff.indexOf("}; };") + 5);
  assert.match(body, /const o = editFor\(leg, editIdx\) \|\| \{\};/);
  assert.doesNotMatch(body, /emap\[leg\.sc/, "emap[sc|seq] is keyed by POSITION — exactly what on_key exists to stop");
  assert.doesNotMatch(src, /emap\[c\.agency_id\+"\|"\+\(enr\.seq\|\|1\)\]/, "the readiness flags must come through the same resolved edit, not a second position lookup");
});

test("the on_key backfill is its own statement, not hidden inside the ALTER's try", () => {
  const src = readFileSync(SRC, "utf-8");
  const fn = src.slice(src.indexOf("async function ensureContractEditImpl("));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);
  const alter = body.indexOf("ALTER TABLE contract_edit ADD COLUMN on_key");
  const upd = body.indexOf("UPDATE contract_edit SET on_key");
  assert.ok(alter > 0 && upd > alter, "both statements present, ALTER first");
  const between = body.slice(alter, upd);
  assert.match(between, /catch \{\}|\.catch\(\(\) => null\)/, "the ALTER's try must be CLOSED before the UPDATE begins — a thrown ALTER must not skip the backfill, and a thrown backfill must not be lost behind an ALTER that already succeeded");
  assert.match(body.slice(upd), /WHERE on_key IS NULL/, "idempotent: a no-op once backfilled");
});

/* ---- 15 Sep 2026: the page dropped the projections on the way to the renderer ---- */

test("drawRotation hands the ship renderer its projections, deployed lines and Junior PS rule", () => {
  const src = readFileSync(SRC, "utf-8");
  const draw = src.slice(src.indexOf("function drawRotation(){"));
  const body = draw.slice(0, draw.indexOf("document.getElementById('rotbody').innerHTML=h;"));
  const map = body.match(/return \{ship:s\.ship,[^\n]*\};/);
  assert.ok(map, "the per-section rebuild must still exist");
  for (const k of ["projections:", "deployed:", "jrPsRule:", "crew:", "history:"]) {
    assert.ok(map[0].includes(k), "the rebuilt section lost `" + k + "` — rotShip reads it, so it silently rendered nothing (this hid 26 yellow cards)");
  }
  assert.match(map[0], /projections:pfilt\(s\.projections\)/, "the status/month filter applies to projections like it does to crew");
  // Inactive replaces Retired (Miguel, 8 Oct 2026): the seat/pool filter hides Inactive crew; an earmark is never
  // hidden for its status (pfilt has no status test) — a plan on an Inactive crew is Rita's to settle.
  assert.match(src, /var sfilt=function\(arr\)\{return pfilt\(arr\)\.filter\(function\(x\)\{return x\.status!=='Inactive'/);
  assert.match(src, /var pfilt=function\(arr\)\{return \(arr\|\|\[\]\)\.filter\(function\(x\)\{return \(!ROT_F\|\|x\.status===ROT_F\)&&legInFilter\(x\);\}\);\};/);
  assert.match(body, /s\.crew\.length>0\|\|s\.projections\.length>0/, "a ship with only projections must survive the status filter");
});

// Miguel, 15 Sep 2026: "the yellow always go last, not in front of the people who are already onboard".
// An aboard plan (state 'yellow') sat inside promByShip with the greens and sorted among them by name.
test("inside a ship section every TDG (green) card precedes every plan (yellow) card", () => {
  const src = readFileSync(SRC, "utf-8");
  const i = src.indexOf("const crew = (promByShip[ship] || []).slice().sort(");
  assert.ok(i > 0, "section sort not found");
  const sortSrc = src.slice(i, src.indexOf(";", i));
  // (5 Oct 2026) a yellow card the registry has CONFIRMED aboard is one of the people already onboard —
  // it sorts with the greens; the rule Miguel stated is about plans, and a confirmed card is no longer one.
  // (7 Oct 2026) a card aboard that the file has not seen yet (awaiting) is the active seafarer: it sorts with them too.
  assert.match(sortSrc, /\(a\.state === "yellow" && !a\.confirmed && !a\.awaiting \? 1 : 0\) - \(b\.state === "yellow" && !b\.confirmed && !b\.awaiting \? 1 : 0\)\s*\|\| \(b\.current \? 1 : 0\) - \(a\.current \? 1 : 0\)/,
    "state (green first, confirmed and awaiting count as green) must be the FIRST sort key, current the second, name the third");
  // Behavioural check of the same comparator on a sample.
  const cmp = new Function("a", "b", "return " + sortSrc.slice(sortSrc.indexOf("(a, b) =>") + "(a, b) =>".length).trim().replace(/\)$/, ""));
  const rows = [
    { name: "Alpha", state: "yellow", current: true }, { name: "Bravo", state: "green", current: false },
    { name: "Charlie", state: "green", current: true }, { name: "Delta", state: "yellow", current: false },
    { name: "Echo", state: "yellow", current: true, confirmed: true },
    { name: "Foxtrot", state: "yellow", current: false, awaiting: true },
  ].sort(cmp).map((x) => x.name);
  assert.deepEqual(rows, ["Charlie", "Echo", "Bravo", "Foxtrot", "Alpha", "Delta"], "Echo is confirmed aboard and Foxtrot awaits the file: among the greens, before the plans");
});

/* ---- 15 Sep 2026, Freedom: the UI of a ship section, read off the screenshot Miguel sent ----
   Two cards side by side. Queencel Sapungan: "On board", and an EMPTY box stretched to the height of his
   neighbour — no dates, nothing. Norman Osorio: "On Vacation · 8 mos 14 days", a sign-off planned for
   2026-08-22 that passed 24 days ago, and NOT ONE MARK on his card; only an unnamed red banner under both
   of them said a sign-off was overdue. Plus "Miami" (red) above "MIAMI, FLORIDA" (green) on the same card,
   and a header reading "1 onboard · 2 current" for a section with one person actually at work. */

const OVERDUE = { ...GREEN, current: false, status: "On Vacation", signOn: "2025-12-08", signOff: "2020-08-22" };

test("a seat whose sign-off has passed is marked ON THE CARD, whatever the derived status says", () => {
  const h = ctx.rotCard(OVERDUE);
  assert.match(h, /class="rcard green overdue"/, "the ring is on the card that needs attention");
  // Option C (6 Oct 2026): the chip is the ONE number — days since, red, "PAST SIGN-OFF"; still never a negative count.
  assert.match(h, /class="offchip crit long"><b>\d+ mo( \d+ d)?<\/b><i>PAST SIGN-OFF<\/i>/, "the countdown chip is not reserved for people the status calls current");
  assert.doesNotMatch(h, /-\d+ ?d/, "never a negative day count");
  assert.match(h, /Past the projected sign-off\./, "say why the seat is still held (7 Oct 2026: the sign-off is a projection until TDG, a card or Rita sets it)");
  // the old rule: live = status === 'On board', so this exact card carried no chip and no ring at all
  assert.doesNotMatch(ctx.rotCard({ ...GREEN, signOff: "2099-01-01" }), /overdue/, "a future sign-off is not overdue");
  assert.doesNotMatch(ctx.rotCard({ ...YELLOW, signOff: "2020-01-01" }), /rcard plan overdue/, "a plan is Rita's to move, not an overdue seat");
});

test("a card with no contract dates says so instead of rendering an empty box", () => {
  const h = ctx.rotCard({ ...GREEN, ship: "Icon", signOn: null, signOff: null });
  assert.match(h, /No contract dates/, "an empty card reads as broken; this one names the gap");
  // The unassigned pool and the shoreside team have no contract dates BY DEFINITION (no ship on the card).
  assert.doesNotMatch(ctx.rotCard({ ...GREEN, ship: null, signOn: null, signOff: null }), /No contract dates/,
    "a pool or shoreside card is not a seat with a missing contract");
  assert.match(h, /the TDG file has them aboard without an embark date/, "and where the seat came from: the file (7 Oct 2026: its embark date is the sign-on)");
  assert.doesNotMatch(h, /class=rrot/, "no empty date block");
  assert.doesNotMatch(ctx.rotCard(GREEN), /No contract dates/, "a dated card says nothing");
});

test("ports read the same whichever source they came from, and no source is painted as an error", () => {
  const h = ctx.rotCard({ ...GREEN, on_city: "Miami", on_conf: "seed", off_city: "MIAMI, FLORIDA", off_conf: "derived" });
  assert.match(h, />Miami</, "the homeport seed stays as it is");
  assert.match(h, />Miami, Florida</, "the itinerary's ALL-CAPS port is cased to match it");
  assert.match(h, /class="pc pc-seed" title="the homeport of the ship[^"]*"/, "a fallback port explains itself");
  assert.match(h, /class="pc pc-derived" title="from the itinerary[^"]*"/);
  // #b0342f is this palette's danger red. A port taken from the homeport is low confidence, not an error.
  assert.doesNotMatch(h, /b0342f/, "seed must not be painted in the danger colour");
  const keep = ctx.rotCard({ ...GREEN, on_city: "ST. THOMAS, USVI", on_conf: "derived" });
  assert.match(keep, />St\. Thomas, USVI</, "an abbreviation survives the casing pass");
});

test("cards size to their own content — the grid must not stretch a short card to a tall neighbour", () => {
  const src = readFileSync(SRC, "utf-8");
  // 7 Oct 2026: the ship body is a flex row (every card side by side, Miguel) — the rule stands: a card keeps its own height.
  const m = src.match(/\.shipbody\{display:flex;[^}]*\}/);
  assert.ok(m, ".shipbody flex rule not found");
  assert.match(m[0], /align-items:start/, "without this a crew with no dates renders as a tall empty box");
  assert.match(src, /\.shipbody\.onerow\{flex-wrap:nowrap\}\.shipbody\.onerow>\.rcard\{flex:1 1 0\}/, "a ship's cards share ONE row at equal width");
  assert.match(src, /class="shipbody shipdrop onerow/, "the ship section opts into the one row; the pool and the shore list still wrap");
  assert.match(src, /\.rtags\{[^}]*align-items:center/, "chips stretched to the tallest chip in the row");
});

test("a yellow card whose sign-on has passed reads ABOARD, whichever feed built it", () => {
  // Anthem, local render 15 Sep 2026: the relief banner said "Relieved · aboard since 2026-09-12" while
  // the same seafarer's card said "PLAN" with no countdown. A card turns yellow through EITHER the
  // projection feed (which set `aboard`) or the crew feed (a Counter leg Rita's newer assignment
  // overrode, which did not). The renderer no longer trusts one feed to have set the flag.
  const started = ctx.rotCard({ ...YELLOW, aboard: undefined, signOn: "2020-01-02", signOff: "2099-01-01" });
  assert.match(started, /EARMARK &middot; ABOARD/);
  assert.match(started, /class="rcard plan aboard"/);
  assert.match(started, /class="offchip/, "someone aboard gets their sign-off countdown");
  assert.match(ctx.rotCard({ ...YELLOW, aboard: undefined }), /class="rlab plan">EARMARK</, "a future sign-on is still just an earmark");
  const src = readFileSync(SRC, "utf-8");
  assert.match(src, /aboard: !!\(\(enr\.signOn \|\| sEnr\.on\) && \(enr\.signOn \|\| sEnr\.on\) <= today\)/,
    "the crew feed must set aboard by the same rule as the projection feed");
});

// THE LOOP CLOSES FROM THE REGISTRY TOO (Miguel, 5 Oct 2026, Jewel). A projection the last AdvancedQuery
// upload has ON BOARD its ship is a fact, not a draft: green, labelled, no Deploy. One it contradicts says
// so on the card and stays yellow. Server side: rotationSections DERIVES `registry` + `confirmed` at read
// time (registry_sync.js: the kept file row per crew, else crew.status + the open ship flag) and carries it
// on BOTH card paths (the roster loop draws an aboard projection the schedule already places — Gayda on
// Jewel — and the projection loop draws the rest).
const CONFIRMED = { ...YELLOW, aboard: true, signOn: "2026-07-20", signOff: "2027-01-20", confirmed: true,
  registry: { verdict: "confirmed", status: "On board", ship: "Jewel", at: "2026-10-04", confirmedAt: "2026-10-04" } };

test("a projection the registry confirmed aboard draws green, says so, keeps Remove and drag, offers no Deploy", () => {
  const h = ctx.rotCard(CONFIRMED);
  assert.match(h, /class="rcard green cur confirmed"/, "green, not a plan card");
  assert.match(h, /<span class="rlab tdg">ABOARD &middot; TDG REGISTRY<\/span>/);
  assert.match(h, /Aboard per the TDG registry<\/b> \(file of 2026-10-04\) &middot; your dates until the Counter carries them/);
  assert.doesNotMatch(h, /planDeploy/, "TDG already has them aboard: nothing to send Joy");
  assert.match(h, /planDelete/, "Rita may still delete a card");
  assert.match(h, /data-plan="1"/, "still an assignment: dragging it MOVES the plan");
  assert.doesNotMatch(h, /not in a TDG file yet/);
});

test("a projection the registry contradicts stays yellow and prints the file's word on the card", () => {
  const ashore = ctx.rotCard({ ...YELLOW, aboard: true, signOn: "2026-07-20", registry: { verdict: "ashore", status: "Inactive", ship: null, at: "2026-10-04" } });
  assert.match(ashore, /class="rcard plan aboard"/);
  assert.match(ashore, /TDG registry 2026-10-04: Inactive<\/b> &middot; not aboard here per the file/);
  assert.match(ashore, /planDelete/, "a contradicted plan is still Rita's to remove (7 Oct 2026: nothing to deploy from the card)");
  const elsewhere = ctx.rotCard({ ...YELLOW, registry: { verdict: "elsewhere", status: "On board", ship: "Odyssey", at: "2026-10-04" } });
  assert.match(elsewhere, /TDG registry 2026-10-04: On board &middot; Odyssey<\/b> &middot; not this ship/);
  const earmarked = ctx.rotCard({ ...YELLOW, registry: { verdict: "earmarked", status: "Earmarked", ship: "Icon", at: "2026-10-04" } });
  assert.match(earmarked, /TDG earmarks them for this ship<\/b> \(file of 2026-10-04\) &middot; your earmark agrees/);
  const pending = ctx.rotCard({ ...YELLOW, registry: { verdict: "pending", status: "On Vacation", ship: null, at: "2026-10-04" } });
  assert.match(pending, /Your earmark &middot; TDG registry 2026-10-04: On Vacation<\/div>/);
  const unplaced = ctx.rotCard({ ...YELLOW, aboard: true, signOn: "2026-07-02", registry: { verdict: "pending", status: "On board", ship: null, at: "2026-10-04" } });
  assert.match(unplaced, /TDG registry 2026-10-04: On board \(ship not on file yet\)/, "Bornea's shape today: the file has him aboard but the registry row carries no ship");
  assert.match(ctx.rotCard(YELLOW), /Your earmark &middot; not in a TDG file yet<\/div>/, "no verdict yet: the old line, reworded");
  // 7 Oct 2026: a deployed earmark a LATER file still lacks says so on the card (reported, never re-sent by itself)
  const late = ctx.rotCard({ ...YELLOW, deployedAt: "2026-10-01", registry: { verdict: "pending", status: "On Vacation", ship: null, at: "2026-10-07" } });
  assert.match(late, /Sent to TDG 2026-10-01<\/b> &middot; the 2026-10-07 file does not carry this earmark yet/);
  assert.doesNotMatch(ctx.rotCard({ ...YELLOW, deployedAt: "2026-10-08", registry: { verdict: "pending", status: "On Vacation", ship: null, at: "2026-10-07" } }), /does not carry this earmark yet/, "a file OLDER than the send says nothing yet");
});

test("rotationSections DERIVES the registry verdict at read time from the stored file word, carries it on both card paths, and sorts confirmed cards first (static)", () => {
  const src = readFileSync(SRC, "utf-8");
  const b = src.slice(src.indexOf("async function rotationSections("), src.indexOf("const sections = Object.values(shipNames)"));
  // The file's word is READ, never a verdict column written at upload: the board reflects the last
  // upload the moment it is applied (Miguel, 5 Oct: "still see no updates in the console").
  assert.match(b, /const rawReg = crewRows\.map\(\(c\) => \{ const o = ovMap\[c\.agency_id\]; return \{ agency_id: c\.agency_id, status: c\.status, vessel_observed: c\.vessel_observed, manual: !!\(o && o\.status != null && o\.status !== ""\) \}; \}\);/, "the RAW registry row is captured before the override merge and the schedule derivation, flagged when a manual status edit is live");
  assert.ok(b.indexOf("const rawReg = crewRows.map(") < b.indexOf("for (const c of crewRows) if (ovVessel[c.agency_id])"), "captured BEFORE manual ships are merged in");
  assert.ok(b.indexOf("const rawReg = crewRows.map(") < b.indexOf("c.status = crewStatus("), "captured BEFORE status is derived");
  assert.match(b, /const registry = registryFromStore\(\{/);
  assert.match(b, /const verdicts = reconcileProjections\(\{ projections: openAsg \|\| \[\], registry, today, shipOf: STRICT_SHIP \}\);/, "the STRICT hull matcher, the same one the import's ship flags use");
  assert.match(b, /const regByAsg = \{\};/);
  assert.doesNotMatch(b, /registry_verdict/, "no verdict column: the verdict is derived, like status (§11)");
  // the three small reads ride the existing wave (§12)
  const at = b.indexOf("= await Promise.all([");
  const wave = b.slice(at, b.indexOf("]);", at));
  assert.match(wave, /FROM registry_snapshot/);
  // open presence flags + the latest run's status audit + the NEWEST ship flag per crew of any state
  // (the last hull the file named — the board's bootstrap of TDG's word): still one read (§12)
  assert.match(wave, /FROM sync_conflict WHERE \(field='presence' AND resolved=0\) OR \(field='status' AND import_run_id=\(SELECT id FROM import_run ORDER BY run_at DESC LIMIT 1\)\) UNION ALL SELECT agency_id, field, new_value, created_at, resolved FROM \(SELECT agency_id, field, new_value, created_at, resolved, ROW_NUMBER\(\) OVER \(PARTITION BY agency_id ORDER BY created_at DESC, resolved ASC\) AS rn FROM sync_conflict WHERE field='vessel_observed'\) WHERE rn=1/, "presence, status audit and the newest ship flag: one read");
  assert.match(b, /vesselFlags: ship,/, "the newest ship flag of any state is the file's last named hull");
  assert.match(b, /inForce, shipKey: keyOf,/, "an in-force card on another hull guards a stale hull");
  assert.match(b, /statusAudit: sc\.filter\(\(r\) => r\.field === "status"\),/);
  assert.match(b, /absent: sc\.filter\(\(r\) => r\.field === "presence"\),/);
  assert.match(wave, /SELECT MAX\(run_at\) AS run_at FROM import_run/);
  // the roster-loop card (an aboard projection the schedule already places) and the projection-loop card
  assert.match(b, /state: x\.state, assignment_id: x\.asgId \|\| null, registry: regOf\(x\.asgId\), confirmed: !!x\.confirmed, deployedAt: deployedAtOf\(x\.asgId\),/, "the seat card carries the card it absorbed, or the placeholder it is");
  assert.match(b, /registry: regOf\(a\.id\), confirmed: regConfirmed\(a\.id\),/);
  assert.match(b, /projByShip\[ship\]\.sort\(\(a, b\) => \(\(b\.confirmed \|\| b\.awaiting\) \? 1 : 0\) - \(\(a\.confirmed \|\| a\.awaiting\) \? 1 : 0\)/);
  const tail = src.slice(src.indexOf("const sections = Object.values(shipNames)"), src.indexOf("async function rotationSections(") + 60000);
  assert.match(tail, /\(a\.state === "yellow" && !a\.confirmed && !a\.awaiting \? 1 : 0\) - \(b\.state === "yellow" && !b\.confirmed && !b\.awaiting \? 1 : 0\)/, "a confirmed or awaiting card sorts with the people aboard, not with the plans");
  assert.match(b, /ensureRegistrySnapshot\(env\)\]\);/, "the snapshot table guard runs in the ensure wave, before the read wave");
  const S = readFileSync(new URL("../src/ship_leg_source.js", import.meta.url), "utf-8");
  assert.doesNotMatch(S, /registry_verdict/, "the yellow-card feed carries no verdict column");
});

// 5 Oct 2026 review, three card rules.
test("a green card with a RECORDED sign-off never says 'No sign-off recorded' (a manual status pin keeps the seat)", () => {
  const past = "2026-01-01";
  assert.match(ctx.rotCard({ ...GREEN, signOff: past }), /Past the projected sign-off/);
  assert.doesNotMatch(ctx.rotCard({ ...GREEN, signOff: past, offConfirmed: true }), /Past the projected sign-off/);
  assert.equal(ctx.cardOverdue({ ...GREEN, signOff: past, offConfirmed: true }), false);
});
test("monthsDays reads UTC fields: exactly six months is '6 mos' in every time zone", () => {
  assert.equal(ctx.monthsDays("2026-03-01", "2026-09-01"), "6 mos");
  assert.equal(ctx.monthsDays("2025-11-15", "2026-08-28"), "9 mos 13 days");
});
test("the 'sent to TDG' line closes on a Counter leg within ABSORB_DAYS of the deployed sign-on, never on any green card; a drop on the card's own section is ignored (static)", () => {
  const src = readFileSync(SRC, "utf-8");
  const b = src.slice(src.indexOf("async function rotationSections("), src.indexOf("const sections = Object.values(shipNames)"));
  // (7 Oct 2026) the AdvancedQuery carries the dates now: a registry leg within the window closes the line too.
  assert.match(b, /if \(!h \|\| !h\.ours \|\| !h\.sc \|\| !h\.on \|\| \(h\.source !== "counter" && h\.source !== "registry"\)\) continue;/, "only TDG-sourced legs (Counter or registry) close a line");
  assert.match(b, /const carriedByCounter = \(sc, ship, signOn\) => .*Math\.abs\(g\) <= ABSORB_DAYS/, "the same ±7-day test as the Counter upload's absorb");
  assert.match(b, /if \(carriedByCounter\(d\.sc, cs, d\.sign_on\)\) continue;/);
  assert.doesNotMatch(b, /greenOn\.has\(d\.sc/, "a registry-only or current-contract green card used to hide the line at once");
  const drop = src.slice(src.indexOf("z.ondrop=function(e){"), src.indexOf("createProjection(DRAGID,ship);"));
  assert.match(drop, /if\(DRAGEL&&DRAGEL\.parentNode===z\)\{DRAGID=null;DRAGEL=null;return;\}/, "a slipped drag back onto its own ship creates nothing");
  assert.match(src, /\/relief\?open='\+encodeURIComponent\(vk\)\+\(aid\?\('&aid='\+encodeURIComponent\(aid\)\):''\)/, "the editor opens THIS card's projection");
});

// Miguel, 5 Oct 2026 ("keep the card"): Deploy no longer removes the projection. The card stays on the
// ship stamped SENT TO TDG; the Deploy button becomes "Sent <date>" and a second click asks before
// emailing Joy again. The ship section's own "sent to TDG" line is for legacy sends whose card is gone.
test("a told earmark stays on the ship: SENT TO TDG tag (7 Oct 2026: the stamp now comes from 'Tell Joy' in the import review)", () => {
  const h = ctx.rotCard({ ...YELLOW, deployedAt: "2026-10-05" });
  assert.match(h, /class="rtag on"[^>]*>SENT TO TDG 2026-10-05</);
  assert.doesNotMatch(h, /planDeploy|>Deploy<|data-sent/, "no Deploy or re-send button on the card");
  assert.match(h, /rcard plan/, "still a yellow card: Rita's, draggable, removable");
  assert.match(h, /planDelete/, "Restore is not needed: the card never left");
  const fresh = ctx.rotCard(YELLOW);
  assert.doesNotMatch(fresh, /SENT TO TDG|data-sent/, "an untold card carries no stamp");
  assert.doesNotMatch(ctx.rotCard({ ...GREEN, deployedAt: "2026-10-05" }), /SENT TO TDG/, "the stamp is a plan's; a Counter card is TDG's own");
});

test("the send dialog asks before a resend and posts resend:true; the server stamps the card instead of removing it", () => {
  const src = APP_HTML;
  const dpv = src.slice(src.indexOf("async function dpvSend("), src.indexOf("async function deployRestore("));
  assert.match(dpv, /if\(DPV\.sentAt\)\{if\(!confirm\('This card was already sent to TDG on '\+DPV\.sentAt\+/);
  assert.match(dpv, /body:JSON\.stringify\(\{id:DPV\.id,resend:resend\}\)/);
  assert.match(dpv, /r\.markError/, "a stamp failure after the email went is said on the screen");
  assert.match(src, /DPV=\{id:id,sentAt:el\.getAttribute\('data-sent'\)\|\|null,contra:el\.getAttribute\('data-contra'\)\|\|null\};/, "the button's date and the file's contradiction reach the dialog");
  assert.doesNotMatch(src, /Send to TDG and clear the card/, "the button no longer promises to clear anything");
  const WSRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  const sec = WSRC.slice(WSRC.indexOf("async function rotationSections("), WSRC.indexOf("async function rotationSections(") + 60000);
  assert.match(sec, /if \(d\.assignment_id && openIds\.has\(d\.assignment_id\)\) continue;/, "a sent card still on the board is not ALSO a 'sent to TDG' line");
  assert.equal((sec.match(/deployedAt: deployedAtOf\(/g) || []).length, 2, "the stamp rides BOTH card paths (roster loop + projection loop)");
  assert.match(WSRC, /const markDeployed = async \(env, id, logId, at\) => \{ const r = await env\.DB\.prepare\("UPDATE assignment SET deployed_at=\?, deploy_log_id=\?, updated_at=\? WHERE id=\? AND actual_sign_off IS NULL"\)/);
  assert.match(WSRC, /installKeymanDeploy\(\{[^}]*markDeployed[^}]*\}\)/, "the Worker hands the stamp to the deploy module");
  const dep = readFileSync(new URL("../src/keyman_deploy.js", import.meta.url), "utf-8");
  assert.doesNotMatch(dep.slice(dep.indexOf("/api/keyman/deploy/send")), /await removeReliefAssignment\(/, "the send path never removes a card");
});

test("no ALSO ON tag any more: the file names one hull per crew, a Counter leg elsewhere is a row in issues (5 Oct 2026)", () => {
  assert.doesNotMatch(ctx.rotCard({ ...GREEN, alsoOn: ["Harmony"] }), /ALSO ON/, "the jumper tag was the console drawing a second seat TDG's file does not hold");
  assert.doesNotMatch(APP_HTML, /x\.alsoOn/, "nothing reads it");
});

// Miguel, 5 Oct 2026 ("still appearing like this"): Gayda's card read "TDG registry 2026-08-22: Inactive,
// Voyager" an hour after Rita applied the 5 Oct file. The line is dated by the latest file; a hull first
// named by an older file says so beside the hull.
test("the registry line is dated by the latest file, and a hull named by an older file says when", () => {
  const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.match(SRC, /shipAt: \(shipAt && shipAt !== at\) \? shipAt : null/, "the server hands the older hull date to the card only when it differs from the line's date");
  const ashore = ctx.regNote({ verdict: "ashore", status: "Inactive", ship: "Voyager", at: "2026-10-05", shipAt: "2026-08-22" }, false);
  assert.match(ashore, /TDG registry 2026-10-05: Inactive, Voyager \(named 2026-08-22\)/);
  assert.match(ashore, /not aboard here per the file/);
  const same = ctx.regNote({ verdict: "ashore", status: "Inactive", ship: "Voyager", at: "2026-10-05", shipAt: null }, false);
  assert.match(same, /TDG registry 2026-10-05: Inactive, Voyager</);
  assert.doesNotMatch(same, /named/);
  assert.match(ctx.regNote({ verdict: "elsewhere", status: "On board", ship: "Odyssey", at: "2026-10-05", shipAt: "2026-09-01" }, false), /Odyssey \(named 2026-09-01\)/);
});

// Miguel, 5 Oct 2026: "display what is in the TDG file, and ... what is wrong".
test("the 'TDG says otherwise' list renders every row, escapes it, and jumps to the ship", () => {
  assert.equal(ctx.rotIssuesBlock([]), "", "nothing wrong, nothing drawn");
  const h = ctx.rotIssuesBlock([
    { kind: "empty_hull", sc: null, name: "Jewel", ship: "Jewel", text: "Nobody on board per the TDG file" },
    { kind: "contradicted", sc: "GAY", name: "Cherry <b>Gayda</b>", ship: "Jewel", text: "Your card: aboard Jewel since 2026-07-20 · TDG file 2026-10-05: Inactive, Voyager" },
  ]);
  assert.match(h, /<span class=nm>TDG overrides &middot; to clean up<\/span><span class=meta>2 &middot; the board shows the TDG file/);
  assert.match(h, /data-jump="Jewel" onclick="rotJump\(this\)"><b>Jewel<\/b><span class=istxt>Nobody on board per the TDG file<\/span>/, "a hull row names the hull once");
  assert.match(h, /<b>Cherry &lt;b&gt;Gayda&lt;\/b&gt;<\/b><span class=isship>Jewel<\/span><span class=istxt>Your card: aboard Jewel since 2026-07-20/);
  assert.equal(typeof ctx.rotJump, "function");
  assert.match(APP_HTML, /h\+=rotIssuesBlock\(b\.issues\|\|\[\]\);/, "drawn on the Keyman tab, from the server's list");
  assert.match(APP_HTML, /\(c\['Not in TDG file'\]\?rfTile\(c\['Not in TDG file'\],'Not in TDG file','red','Not in TDG file'\):''\)/, "a tile for crew the file dropped, when there are any");
});

test("a card TDG's file contradicts prints the file's word on the card and keeps Remove (7 Oct 2026: nothing to deploy, the review decides)", () => {
  const h = ctx.rotCard({ ...YELLOW, aboard: true, signOn: "2026-07-20", registry: { verdict: "ashore", status: "Inactive", ship: "Voyager", at: "2026-10-05" } });
  assert.match(h, /TDG registry 2026-10-05: Inactive, Voyager<\/b> &middot; not aboard here per the file/);
  assert.match(h, /planDelete/);
  assert.doesNotMatch(h, /data-contra|planDeploy/);
});

test("a card the file confirms renders once, green, with Remove; the ship lists what completed underneath", () => {
  const h = ctx.rotCard({ ...YELLOW, aboard: true, signOn: "2026-08-09", confirmed: true, registry: { verdict: "confirmed", status: "On board", ship: "Beyond", at: "2026-10-05" } });
  assert.match(h, /class="rcard green cur confirmed"|rcard green/);
  assert.match(h, /ABOARD &middot; TDG REGISTRY/);
  assert.match(h, /planDelete/, "Rita may still delete her card");
  assert.doesNotMatch(h, /planDeploy/, "TDG already has them aboard: nothing to deploy");
  const sec = ctx.rotShip({ ship: "Navigator", brand: "Royal", onboard: 0, crew: [], projections: [], deployed: [], history: [{ name: "Andrea Calayag", sc: "SC-1", ours: true, on: "2026-02-02", off: "2026-09-25" }] });
  assert.match(sec, /Contract completed · 1/);
  assert.doesNotMatch(sec, /1 completed</, "7 Oct 2026: no counts in the header; the history section carries its own");
  assert.doesNotMatch(sec, /Also served this ship/);
});
