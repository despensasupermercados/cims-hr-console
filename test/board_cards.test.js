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
const GREEN = { state: "green", agency_id: "SC-1", seq: 1, vessel_key: "Royal Caribbean|Icon", name: "Ana Alpha", rank: "Printer Specialist", status: "On board", current: true, signOn: "2026-03-08", signOff: "2026-09-30", on_city: "Miami", on_conf: "derived", eccr: 1 };
const YELLOW = { state: "yellow", agency_id: "SC-9", assignment_id: "as_1", vessel_key: "Royal Caribbean|Icon", name: "Ben Bravo", rank: "Junior PS", status: "Earmarked", signOn: "2026-11-02", signOff: "2027-05-02", aboard: false, on_city: "Barcelona", on_conf: "derived" };

test("the page's inline script runs top to bottom without throwing", () => {
  assert.deepEqual(errors, [], "a top-level error white-screens the console for every signed-in user");
  for (const fn of ["rotCard", "rotShip", "reliefSlot", "reliefBanner", "openRelief", "planDelete", "rcDrag", "rcClickP"]) {
    assert.equal(typeof ctx[fn], "function", fn + " is not defined on the page");
  }
});

test("GREEN is a TDG card: never draggable, click opens the contract editor", () => {
  const h = ctx.rotCard(GREEN);
  assert.match(h, /class="rcard green cur"/);
  assert.doesNotMatch(h, /draggable/, "a TDG contract is not Rita's to drag — she edits it, TDG moves it");
  assert.doesNotMatch(h, /ondragstart/);
  assert.match(h, /title="TDG contract - click to edit"/);
  assert.doesNotMatch(h, /planDelete/, "a TDG card has no Remove: what is in the import stays");
  assert.doesNotMatch(h, /rlab plan/);
  assert.match(h, /Ana Alpha/);
  assert.match(h, /2026-03-08/);
});

test("YELLOW is Rita's projection: draggable, labelled PLAN, removable", () => {
  const h = ctx.rotCard(YELLOW);
  assert.match(h, /class="rcard plan"/);
  assert.match(h, /draggable="true"/);
  assert.match(h, /ondragstart="rcDrag\(event,this\)"/);
  assert.match(h, /<span class="rlab plan">PLAN<\/span>/);
  assert.match(h, /data-aid="as_1"/);
  assert.match(h, /onclick="planDelete\(event,this\)"/);
  assert.match(h, /data-vk="Royal Caribbean\|Icon"/, "clicking a projection must open the relief editor for its ship");
  assert.match(h, /not in a TDG file yet/);
});

test("a projection whose contract has started says ABOARD and keeps its solid outline", () => {
  const h = ctx.rotCard({ ...YELLOW, aboard: true, signOn: "2026-08-01" });
  assert.match(h, /class="rcard plan aboard"/);
  assert.match(h, /PLAN &middot; ABOARD/);
});

test("YELLOW carries the Deploy CTA; green never does", () => {
  const h = ctx.rotCard(YELLOW);
  assert.match(h, /onclick="planDeploy\(event,this\)"/);
  assert.match(h, /class="pbtn go"[^>]*>Deploy</);
  assert.doesNotMatch(ctx.rotCard(GREEN), /planDeploy/, "a TDG contract is not ours to deploy");
  assert.equal(typeof ctx.planDeploy, "function");
  assert.equal(typeof ctx.dpvSend, "function");
  assert.equal(typeof ctx.deployRestore, "function");
});

test("the ship section shows what was sent to TDG, with Restore, until the Counter brings it back", () => {
  const sent = { id: "dep_1", agency_id: "SC-9", name: "Ben Bravo", ship: "Icon", signOn: "2026-11-02", sentAt: "2026-09-14", aboard: false };
  const sec = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, crew: [], projections: [], deployed: [sent], history: [] });
  assert.match(sec, /sent to TDG on 2026-09-14/);
  assert.match(sec, /awaiting the Counter/);
  assert.match(sec, /data-log="dep_1"[^>]*onclick="deployRestore\(this\)"/);
  assert.match(sec, /1 sent to TDG/);
  const ab = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, crew: [], projections: [], deployed: [{ ...sent, aboard: true }], history: [] });
  assert.match(ab, /aboard per your board, awaiting the Counter/);
  const none = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, crew: [], projections: [], deployed: [], history: [] });
  assert.doesNotMatch(none, /sent to TDG/);
});

test("a yellow card with no projection behind it offers no Remove", () => {
  // An aboard reliever drawn from the schedule may reach the card without an assignment id.
  const h = ctx.rotCard({ ...YELLOW, assignment_id: null });
  assert.doesNotMatch(h, /planDelete/);
  assert.doesNotMatch(h, /planDeploy/, "nothing to deploy either");
  assert.doesNotMatch(h, /data-aid="null"/);
});

test("the card names who set the dates, and says when TDG replaced an edit", () => {
  assert.match(ctx.rotCard({ ...GREEN, dateSource: "rita", dateSourceAt: "2026-09-12" }), /Your dates, 2026-09-12 &middot; newer than the TDG file/);
  assert.match(ctx.rotCard({ ...GREEN, overridden: true, dateSource: "counter", dateSourceAt: "2026-09-20" }), /<b>TDG dates<\/b> from the 2026-09-20 file &middot; newer than your edit/);
  assert.doesNotMatch(ctx.rotCard(GREEN), /srcnote/, "no note when nobody has touched the TDG values");
});

test("a sign-off that has passed reads as elapsed on both states, never as a negative countdown", () => {
  const past = "2026-01-01";
  assert.match(ctx.rotCard({ ...GREEN, signOff: past }), /OFF was \d+d ago/);
  assert.match(ctx.rotCard({ ...YELLOW, aboard: true, signOn: "2025-06-01", signOff: past }), /OFF was \d+d ago/);
  assert.doesNotMatch(ctx.rotCard({ ...GREEN, signOff: past }), /OFF in -/);
});

test("a future projection counts down to its sign-on, not to a sign-off it has not reached", () => {
  const h = ctx.rotCard({ ...YELLOW, signOn: "2099-01-01", signOff: "2099-07-01" });
  assert.match(h, /ON in \d+d/);
  assert.doesNotMatch(h, /OFF in/);
});

test("the ship section draws both feeds through the ONE renderer and counts them apart", () => {
  const sec = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 1, crew: [GREEN], projections: [YELLOW], history: [] });
  assert.equal((sec.match(/class="rcard /g) || []).length, 2, "one green, one yellow");
  assert.match(sec, /1 current/);
  assert.match(sec, /1 planned/);
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
  // The Deploy button is still there: a warning never blocks the send.
  assert.match(ctx.rotCard({ ...YELLOW, docs }), /planDeploy/);
});

test("a Junior PS on a restricted hull is flagged on the card, and the drop asks before it moves", () => {
  const h = ctx.rotCard({ ...YELLOW, jrWarn: "block" });
  assert.match(h, /Junior PS on a <b>block<\/b> ship/);
  assert.doesNotMatch(ctx.rotCard(YELLOW), /jrnote/, "no rule, no note");
  const sec = ctx.rotShip({ ship: "Icon", brand: "Royal", onboard: 0, jrPsRule: "block", crew: [], projections: [], history: [] });
  assert.match(sec, /data-jr="block"/, "the drop zone carries the rule, so the warning happens before anything is written");
});

test("exactly one definition of each relief renderer survives — the shadowing is gone for good", () => {
  const src = readFileSync(SRC, "utf-8");
  for (const fn of ["reliefSlot", "reliefBanner", "openRelief", "rotCard"]) {
    const n = (src.match(new RegExp("function " + fn + "\\(", "g")) || []).length;
    assert.equal(n, 1, fn + " is defined " + n + " times; the last one silently wins and the others are dead weight");
  }
});

/* ---- review, 14 Sep 2026: the drag path ---- */

test("dropping a PROJECTION moves the assignment; it never writes the crew's registry ship", () => {
  const src = readFileSync(SRC, "utf-8");
  assert.equal(typeof ctx.moveProjection, "function", "moveProjection must exist on the page");
  const drop = src.slice(src.indexOf("z.ondrop=function(e){e.preventDefault();z.classList.remove('dragover');"));
  const body = drop.slice(0, drop.indexOf("};", 0) + 2);
  assert.match(body, /var aid=DRAGEL&&DRAGEL\.getAttribute\('data-aid'\)/, "the drop must look at WHICH card was dragged");
  assert.match(body, /if\(aid\)\{moveProjection\(aid,ship\);\}else\{assignCrew\(DRAGID,ship\);\}/,
    "a yellow card goes through moveProjection; the crew_override path is only for a card with no projection behind it");
  const mv = src.slice(src.indexOf("async function moveProjection(aid,ship){"));
  assert.match(mv.slice(0, mv.indexOf("\n}")), /fetch\('\/api\/relief\/save'[\s\S]*vessel_name:ship/, "the move is the relief board's own save: id + vessel_name");
  assert.doesNotMatch(mv.slice(0, mv.indexOf("\n}")), /rotation\/assign/, "never the registry-ship route");
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
  assert.match(between, /catch \{\}/, "the ALTER's try must be CLOSED before the UPDATE begins — a thrown ALTER must not skip the backfill, and a thrown backfill must not be lost behind an ALTER that already succeeded");
  assert.match(body.slice(upd), /WHERE on_key IS NULL/, "idempotent: a no-op once backfilled");
});
