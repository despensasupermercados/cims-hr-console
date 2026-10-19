// THE 17 OCT 2026 LOGIC REVIEW (Miguel: "review the code and the goal here .. if u see anything u dont understand for
// the logic let me know"). Five readers, one per area, every finding traced to a production row before anything
// changed. The ones that contradict a rule CLAUDE.md already states are fixed here; the rest went to Miguel as questions.
//   1. the board's red "held" note names the reliever's OWN embark date, never the typed sign-off (§10d, PR #283);
//   2. the profile's time at sea runs a CURRENT contract (held, overdue) to today, like the statement (§11d);
//   3. the dashboard's crew-travel card counts CLOSED months, like the Travel tab (§10j "YTD = CLOSED months");
//   4. the Uploads review lists what the file says that nothing changes (§6, §11b, §11e);
//   5. the instructions email's plain text says the overlap in months and days (§11e, span_md);
//   6. Maria's "former crew" is the console's off-fleet word (§10f).
// (The home-port seed in the two sign-off emails is pinned in test/signoff_public.test.js.)
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import vm from "node:vm";
import { legsFromRegistry } from "../src/ship_leg_source.js";
import { instructionsEmail } from "../src/emails/hr.signoff.instructions.v2.js";

const SRC = new URL("../src/worker.js", import.meta.url);
const WORKER = readFileSync(SRC, "utf-8");
const TMP = new URL(`../src/__rv1017_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, WORKER + "\nexport { APP_HTML };\n", "utf-8");
let APP_HTML;
try { ({ APP_HTML } = await import(TMP.href)); } finally { unlinkSync(TMP); }

mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-17T12:00:00Z") });
function pageContext() {
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, innerHTML: "", value: "" });
  const ctx = {
    document: { readyState: "complete", addEventListener() {}, getElementById: el, querySelector: el, querySelectorAll() { return []; }, createElement: el, body: el(), documentElement: el(), cookie: "" },
    location: { href: "", search: "", pathname: "/" }, navigator: { userAgent: "node" },
    fetch: () => new Promise(() => {}),
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, console, Date,
    addEventListener() {}, alert() {}, confirm() { return true; }, requestAnimationFrame: (f) => f && f(),
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const code of [...APP_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])) new vm.Script(code).runInContext(ctx);
  return ctx;
}
const ctx = pageContext();

const F16 = "2026-10-16T13:36:44.757Z";
const VES = [{ name: "Pursuit", brand: "Azamara" }, { name: "Apex", brand: "Celebrity" }, { name: "Grandeur", brand: "Royal Caribbean" }];
const row = (sc, vessel, embarked_at) => ({ sc, status: "On board", raw_status: "On board", vessel, embarked_at, debarked_at: null, run_at: F16, crew_id: "c" + sc, crew_name: "Crew " + sc });

test("1. the reliever carries his OWN sign-on, so a typed sign-off is never printed as his embark (Jugao, Belhida, a card)", () => {
  const legs = legsFromRegistry({ rows: [
    row("SC-0039935", "MV AZAMARA PURSUIT", "2026-05-02"),   // Kevin Jugao; Rita typed 31 Oct
    row("SC-0041465", "MV AZAMARA PURSUIT", "2026-10-16"),   // aboard since 16 Oct (the file's cross-over)
    row("SC-0037752", "MV CELEBRITY APEX", "2026-03-14"),    // Dan Belhida; Rita typed 7 Oct
    row("SC-0038129", "MV CELEBRITY APEX", "2026-10-07"),
    row("SC-G1", "MV GRANDEUR OF THE SEAS", "2026-04-20"),   // relieved by a card only
  ], edits: [
    { sc: "SC-0039935", seq: 1, on_key: "2026-05-02", sign_off: "2026-10-31", updated_at: "2026-10-09T17:15:52.266Z" },
    { sc: "SC-0037752", seq: 1, on_key: "2026-03-14", sign_off: "2026-10-07", updated_at: "2026-10-08T17:53:01.926Z" },
  ], open: [{ id: "as_9", sc: "SC-G2", ship: "Grandeur", sign_on: "2026-11-18", crew_name: "Crew G2", updated_at: "2026-10-10T09:00:00Z" }],
  vessels: VES, today: "2026-10-17" });
  const L = Object.fromEntries(legs.map((l) => [l.sc, l]));
  assert.equal(L["SC-0039935"].off, "2026-10-31");
  assert.deepEqual({ sc: L["SC-0039935"].reliever.sc, on: L["SC-0039935"].reliever.on }, { sc: "SC-0041465", on: "2026-10-16" }, "the cross-over reliever embarked 16 Oct, not on Rita's 31 Oct");
  assert.equal(L["SC-0037752"].reliever.on, "2026-10-07");
  assert.deepEqual({ off: L["SC-G1"].off, on: L["SC-G1"].reliever.on }, { off: "2026-11-18", on: "2026-11-18" }, "a card reliever signs on the day the card says");
});

test("1b. the held note reads the reliever's embark, not the sign-off it outranked", () => {
  const held = { state: "green", agency_id: "SC-1", seq: 1, vessel_key: "Azamara|Pursuit", name: "Kevin Jugao", rank: "Printer Specialist", status: "On board", current: true,
    signOn: "2026-05-02", signOff: "2026-10-10", offSource: "rita", heldByFile: true, reliever: { sc: "SC-2", name: "Jonathan Alonzo", on: "2026-10-01" } };
  const h = ctx.rotCard(held);
  assert.match(h, /TDG still has them On board/);
  assert.match(h, /Jonathan Alonzo embarked Oct 1, 2026/);
  assert.doesNotMatch(h, /embarked Oct 10, 2026/, "the typed sign-off is not the reliever's embark");
  assert.doesNotMatch(ctx.rotCard({ ...held, reliever: { sc: "SC-2", name: "Jonathan Alonzo" } }), /embarked/, "no date known: none printed");
});

test("2. time at sea runs a CURRENT contract to today (held past Rita's 7 Oct on Apex), an ended one to its sign-off", () => {
  assert.equal(ctx.pfSeaTime([{ on: "2026-03-14", off: "2026-10-07", current: true }], "2026-10-17"), "7 mo 3 d", "Belhida: held, at sea to today like his statement");
  assert.equal(ctx.pfSeaTime([{ on: "2026-03-14", off: "2026-10-07", current: false }], "2026-10-17"), "6 mo 23 d", "ended: to the sign-off");
  assert.equal(ctx.pfSeaTime([{ on: "2026-08-01", off: "2027-03-01", current: true }], "2026-10-17"), "2 mo 16 d", "running: to today");
});

test("3. the dashboard's crew travel is the closed months, like the Travel tab (17 Oct 2026: $106,542 · 59%, not $108,460 · 60%)", () => {
  const h = ctx.opsTravel({ year: 2026, crew: 108460, crewYTD: 106542, budgetMo: 15000, ytdBudget: 135000, elapsedMo: 9, cats: { air: 50000 } });
  assert.match(h, /\$106,542/);
  assert.match(h, /59% used/);
  assert.doesNotMatch(h, /\$108,460|60% used/, "the running month and a later row are not 'used' yet");
  const q = WORKER.match(/SELECT COALESCE\(SUM\(air\),0\) air[^\n]*/)[0];
  assert.match(q, /kind!='shoreside' AND month <= CASE WHEN/, "the categories under it read the same closed months");
});

test("4. the Uploads review lists what the file says that nothing changes: a repeated id, a different cruise-line id, a row keyed on it, a new row with no status", () => {
  const h = ctx.impFlagged({ duplicate_ids: ["SC-0011111"], km_mismatch: [{ agency_id: "SC-0022222", roster: "358775", file: "359999" }],
    groups: { rekeyed: [{ agency_id: "SC-0033333", incoming_id: "361234", ship_crew_id: "361234" }], needs_status: [{ agency_id: "SC-0044444", fields: { first_name: "Ana", last_name: "Cruz", status: null, status_raw: "Shore Leave" } }] } });
  assert.match(h, /In the file, nothing changed/);
  assert.match(h, /SC-0011111[\s\S]*more than once/);
  assert.match(h, /358775[\s\S]*359999[\s\S]*kept as on the roster/);
  assert.match(h, /cruise-line id 361234/);
  assert.match(h, /Ana Cruz[\s\S]*Shore Leave[\s\S]*Not added/);
  assert.equal(ctx.impFlagged({ groups: {} }), "", "nothing flagged: no section");
  const render = WORKER.slice(WORKER.indexOf("function cimsRender(){"), WORKER.indexOf("function cimsRender(){") + 20000);
  assert.match(render, /L\+=impFlagged\(STAGE\.review\)/, "the Uploads screen draws it");
});

test("5. the plain-text part says the overlap in months and days, like the HTML (§11e: never a bare day count)", () => {
  const m = instructionsEmail({ firstName: "Kevin", ship: "Pursuit", brand: "Azamara", signOff: "2026-10-31", port: "HONG KONG, CHINA",
    reliever: { name: "A.J. Baleña", first: "A.J.", on: "2026-09-23" }, link: "https://cims.work/instr?t=x", today: "2026-10-17" });
  assert.match(m.text, /aboard with you for 1 month 8 days from 23 Sep/);
  assert.doesNotMatch(m.text, /\b38 days\b/);
});

test("6. Maria's former crew is the off-fleet status word, never the manual tag (Sison: Not for Rehire is listed by its name)", () => {
  const maria = WORKER.slice(WORKER.indexOf('if (name === "find_crew")'), WORKER.indexOf("const resolveCrewId = async"));
  assert.ok(maria.length > 200, "the Maria crew tools were found");
  assert.equal((maria.match(/const isRetired = \(c\) => isOffFleet\(c\.status\)/g) || []).length, 2, "find_crew and list_crew read one definition");
  assert.doesNotMatch(maria, /!!c\.retired/, "the tag is not a status: TDG's On board and Not for Rehire beat it");
  assert.match(maria, /\[\.\.\.OFF_FLEET\]\.find/, "asking for Not for Rehire includes the off-fleet crew");
});
