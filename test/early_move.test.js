// A TDG file that moves a crew to their next ship before they leave the one they are on (night watch, 12 Nov 2026).
// The AdvancedQuery applied 2026-11-10T18:27Z had Bernard Winzon Paqueo (SC-0038115) "On board MV RADIANCE OF THE SEAS,
// EMBARKEDDATE 14 Nov 2026" while the kept file had him On board MV CELEBRITY REFLECTION (embarked 17 Jul, Rita's sign-off
// 13 Nov). The file keeps one row per crew: applying it took his Reflection contract off the schedule, Reflection read
// nobody aboard, and HON voided the Reflection handover count (stock_swap 2a86ce58…, Paqueo to Darryl Ramos, 13 Nov) at
// 22:50 UTC. The review showed only "Current ship: Reflection → Radiance · Take TDG". The stage now lists the move, the page
// says what applying does; Apply is unchanged (warn, never block).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import vm from "node:vm";
import * as R from "../src/crew_import_routes.js";
import { strictShipMatcher } from "../src/crew_flags.js";
import { VESSEL_REF } from "../src/vessel_ref.js";

const SHIP_OF = strictShipMatcher(VESSEL_REF);
const KEPT = [
  { agency_id: "SC-0038115", status: "On board", raw_status: "On board", vessel: "MV CELEBRITY REFLECTION", debarked_at: null },
  { agency_id: "SC-0045824", status: "On board", raw_status: "On board", vessel: "MV RADIANCE OF THE SEAS", debarked_at: null },
  { agency_id: "SC-0038104", status: "Earmarked", raw_status: "Earmarked", vessel: "MV CELEBRITY REFLECTION", debarked_at: null },
];
const PAQUEO = { agency_id: "SC-0038115", status: "On board", vessel_observed: "MV RADIANCE OF THE SEAS", name: "Bernard Winzon Paqueo", embarked_at: "2026-11-14", debarked_at: null };

test("the 10 Nov file: Paqueo On board Radiance from 14 Nov while the kept file has him on Reflection is listed", () => {
  assert.equal(typeof R.earlyMoves, "function");
  const out = R.earlyMoves([PAQUEO,
    { agency_id: "SC-0045824", status: "On board", vessel_observed: "MV RADIANCE OF THE SEAS", name: "Michael Gonzales", embarked_at: "2026-03-06" },
    { agency_id: "SC-0038104", status: "Earmarked", vessel_observed: "MV CELEBRITY REFLECTION", name: "Darryl Dhan Ramos", embarked_at: null },
  ], KEPT, "2026-11-10", SHIP_OF);
  assert.deepEqual(out, [{ agency_id: "SC-0038115", name: "Bernard Winzon Paqueo", from: "Reflection", to: "Radiance", embark: "2026-11-14" }]);
});

test("not listed: the embark has come, the same ship, a crew the kept file had ashore or already debarked, an Earmarked row", () => {
  const f = (row, kept, today = "2026-11-10") => R.earlyMoves([row], kept, today, SHIP_OF);
  assert.deepEqual(f(PAQUEO, KEPT, "2026-11-14"), [], "embark today: the move is the file's word");
  assert.deepEqual(f({ ...PAQUEO, vessel_observed: "MV CELEBRITY REFLECTION", embarked_at: "2026-11-14" }, KEPT), [], "the same ship (TDG redated the embark)");
  assert.deepEqual(f(PAQUEO, [{ ...KEPT[0], status: "On Vacation" }]), [], "the kept file had them ashore: a new contract");
  assert.deepEqual(f(PAQUEO, [{ ...KEPT[0], debarked_at: "2026-11-09" }]), [], "the kept file had them debarked already");
  assert.deepEqual(f({ ...PAQUEO, status: "Earmarked" }, KEPT), [], "Earmarked for the next ship is the normal plan");
  assert.deepEqual(f(PAQUEO, []), [], "a crew the kept file did not carry");
  assert.deepEqual(f({ ...PAQUEO, embarked_at: null }, KEPT), [], "no embark date: #372's case, not this one");
});

test("the stage carries the list in the review, read from the kept file it already reads (no extra round trip)", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-10T18:20:00Z") });
  try {
    const reads = [];
    const mk = (sql, args = []) => ({
      bind(...a) { return mk(sql, a); },
      async first() { return null; },
      async all() {
        reads.push(sql);
        if (/FROM registry_snapshot/i.test(sql)) return { results: KEPT };
        if (/FROM crew\b/i.test(sql) && !/crew_override/i.test(sql)) return { results: [{ agency_id: "SC-0038115", first_name: "Bernard Winzon", last_name: "Paqueo", status: "On board", vessel_observed: "MV CELEBRITY REFLECTION" }] };
        return { results: [] };
      },
    });
    const env = { DB: { prepare: (s) => mk(s), batch: async (st) => st.map(() => ({ success: true })) } };
    const rows = [{ "CREW ID": "SC-0038115", "FIRST NAME": "Bernard Winzon", "LAST NAME": "Paqueo", "CREW STATUS": "On board", "VESSEL NAME": "MV RADIANCE OF THE SEAS", "EMBARKEDDATE": "14 Nov 2026", "DEBARKEDDATE": "-" }];
    const body = await (await R.apiCrewImportStage({ json: async () => ({ rows, file_hash: "h-1110" }) }, env)).json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.review.early_moves, [{ agency_id: "SC-0038115", name: "Bernard Winzon Paqueo", from: "Reflection", to: "Radiance", embark: "2026-11-14" }]);
    assert.equal(reads.filter((s) => /FROM registry_snapshot/i.test(s)).length, 1, "the kept file is read once, as before");
  } finally { mock.timers.reset(); }
});

test("the Uploads review says it before Apply, in words", async () => {
  const SRC = new URL("../src/worker.js", import.meta.url);
  const WORKER = readFileSync(SRC, "utf-8");
  const TMP = new URL(`../src/__early_${process.pid}__.mjs`, import.meta.url);
  writeFileSync(TMP, WORKER + "\nexport { APP_HTML };\n", "utf-8");
  let APP_HTML;
  try { ({ APP_HTML } = await import(TMP.href)); } finally { unlinkSync(TMP); }
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, innerHTML: "", value: "" });
  const ctx = {
    document: { readyState: "complete", addEventListener() {}, getElementById: el, querySelector: el, querySelectorAll() { return []; }, createElement: el, body: el(), documentElement: el(), cookie: "" },
    location: { href: "", search: "", pathname: "/" }, navigator: { userAgent: "node" }, fetch: () => new Promise(() => {}),
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, console, Date, addEventListener() {}, alert() {}, confirm() { return true; }, requestAnimationFrame: (f) => f && f(),
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const code of [...APP_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])) new vm.Script(code).runInContext(ctx);
  assert.equal(typeof ctx.impEarly, "function");
  const h = ctx.impEarly({ early_moves: [{ agency_id: "SC-0038115", name: "Bernard Winzon Paqueo", from: "Reflection", to: "Radiance", embark: "2026-11-14" }] });
  assert.match(h, /Moved to the next ship before they sign off/);
  assert.match(h, /On board <b>Radiance<\/b> from Nov 14, 2026/);
  assert.match(h, /on <b>Reflection<\/b> until then\. Applying it takes them off Reflection now/);
  assert.match(h, /Ask Joy to keep them On board until they sign off, with the next ship as Earmarked/);
  assert.equal(ctx.impEarly({ early_moves: [] }), "", "nothing to say: no section");
  const render = WORKER.slice(WORKER.indexOf("function cimsRender(){"), WORKER.indexOf("function cimsRender(){") + 20000);
  assert.match(render, /L\+=impEarly\(STAGE\.review\);/, "the Uploads screen draws it");
});
