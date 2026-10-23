// The operational dashboard (13 Oct 2026, mock-up B v4 "each fact once"; Miguel: "deploy"). buildOps only sorts what
// the Keyman board already says into the questions Rita acts on — these tests pin the rules and the ship codes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOps, relieverDocs, daysBetween, addDays } from "../src/ops_dashboard.js";
import { shipCode, SHIP_CODES } from "../src/ship_codes.js";

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const TODAY = "2026-10-13";

test("ship codes are the cruise lines' own, not the first two letters (six pairs would collide)", () => {
  assert.equal(Object.keys(SHIP_CODES).length, 48, "one code per hull of the fleet (ship_contact, 13 Oct 2026)");
  assert.equal(new Set(Object.values(SHIP_CODES)).size, 48, "no two hulls share a code");
  for (const [n, c] of [["Quantum", "QN"], ["Quest", "QS"], ["Independence", "ID"], ["Infinity", "IN"], ["Apex", "AX"], ["Ascent", "AT"],
    ["Liberty", "LB"], ["Legend", "LE"], ["Odyssey", "OY"], ["Wonder", "WN"], ["Constellation", "CS"]]) assert.equal(shipCode(n), c, n);
  assert.equal(shipCode("MV CELEBRITY CONSTELLATION"), "CS", "the TDG file's vessel string");
  assert.equal(shipCode("MV LIBERTY OF THE SEAS"), "LB");
  assert.equal(shipCode("Azamara Quest"), "QS");
  assert.equal(shipCode("Galaxy"), "GA", "a hull not in the table falls back to its first two letters, never blank");
  assert.equal(shipCode(""), "");
});

test("date helpers are calendar days", () => {
  assert.equal(daysBetween("2026-10-13", "2026-10-22"), 9);
  assert.equal(daysBetween("2026-10-13", "2026-09-28"), -15);
  assert.equal(addDays("2026-10-08", 7), "2026-10-15");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
});

test("a reliever's documents: expired or missing = cannot sail, lapsing = sails but renews, valid = nothing", () => {
  assert.equal(relieverDocs(null), null);
  assert.deepEqual(relieverDocs({ worst: "expired", items: [{ doc: "Seaman's Book" }], expiringItems: [], missing: 0 }), { kind: "bad", label: "Seaman's book", docs: ["Seaman's book"] });
  assert.equal(relieverDocs({ worst: "expired", items: [{ doc: "US C1/D Visa" }, { doc: "Schengen" }], expiringItems: [] }).label, "US visa +1");
  assert.deepEqual(relieverDocs({ worst: "expiring", items: [], expiringItems: [{ doc: "Medical" }] }), { kind: "warn", label: "Medical lapses", docs: ["Medical"] });
  assert.equal(relieverDocs({ worst: "missing", items: [], expiringItems: [], missing: 2 }).label, "2 missing");
});

// A board on 13 Oct 2026 shaped like rotationSections' output.
const seat = (o) => Object.assign({ current: true, state: "green", status: "On board", eccr: false, air: false, hotel: false, offConfirmed: false, heldByFile: false }, o);
const card = (o) => Object.assign({ current: false, state: "yellow", status: "Earmarked", assignment_id: "as_" + o.agency_id, registry: { verdict: "earmarked" }, docs: null }, o);
const SECTIONS = [
  // overdue: projected sign-off passed; TDG earmarks Corpin, whose card's sign-on (8 Oct) passed too
  { ship: "Grandeur", brand: "Royal", crew: [seat({ agency_id: "A", name: "Mark Joseph Dela Rosa", signOn: "2026-02-28", signOff: "2026-09-28", offSource: "projected" }),
    card({ agency_id: "B", name: "Archiegale Corpin", signOn: "2026-10-08", signOff: "2027-05-08" })], projections: [] },
  // 9 days out: reliever in TDG, flight only, no kit
  { ship: "Quantum", brand: "Royal", crew: [seat({ agency_id: "C", name: "Ryan Paolo Marto", signOn: "2026-01-30", signOff: "2026-10-22", offSource: "card", air: true, reliever: { sc: "D" } })],
    projections: [card({ agency_id: "D", name: "Allen Edward Cedilla", signOn: "2026-10-22", signOff: "2027-05-22" })] },
  // 29 days out: reliever's seaman's book expired
  { ship: "Onward", brand: "Azamara", crew: [seat({ agency_id: "E", name: "Mary Vivien Medidas", signOn: "2026-06-11", signOff: "2026-11-11", offSource: "card" })],
    projections: [card({ agency_id: "F", name: "Adrian Dexter Domingo", signOn: "2026-11-11", signOff: "2027-04-11", docs: { worst: "expired", items: [{ doc: "Seaman's Book" }], expiringItems: [] } })] },
  // 47 days out, Rita confirmed, nobody planned
  { ship: "Allure", brand: "Royal", crew: [seat({ agency_id: "G", name: "John Jeffrey Gorre", signOn: "2026-04-29", signOff: "2026-11-29", offSource: "rita", offConfirmed: true })], projections: [] },
  // a reliever Rita planned that TDG does not have yet
  { ship: "Star", brand: "Royal", crew: [seat({ agency_id: "H", name: "Maria Murillo", signOn: "2026-03-08", signOff: "2026-11-29", offSource: "rita" })],
    projections: [card({ agency_id: "I", name: "New Person", signOn: "2026-11-29", signOff: "2027-06-29", registry: null })] },
  // held by the file: the old crew still On board per TDG next to the reliever already aboard
  { ship: "Apex", brand: "Celebrity", crew: [seat({ agency_id: "J", name: "Dan Andrew Belhida", signOn: "2026-03-14", signOff: "2026-10-07", offSource: "tdg", heldByFile: true, reliever: { sc: "K", name: "Michael Angelo Resposo", on: "2026-10-07" } }),
    seat({ agency_id: "K", name: "Michael Angelo Resposo", signOn: "2026-10-07", signOff: "2027-05-07", offSource: "projected" })], projections: [] },
  // aboard per TDG with no embark date
  { ship: "Radiance", brand: "Royal", crew: [seat({ agency_id: "L", name: "Andrea Calayag", signOn: null, signOff: null })], projections: [] },
  // covered beyond the 90-day window: not a crew change
  { ship: "Vision", brand: "Royal", crew: [seat({ agency_id: "M", name: "Far Away", signOn: "2026-07-25", signOff: "2027-02-25", offSource: "projected" })], projections: [],
    bench: { rows: [{ sc: "N", name: "Jonathan Alonzo", aboardShip: null, lastShip: "Symphony", homeFrom: "2026-09-12" }] } },
];
const CREW = [
  { sc: "A", first: "Mark Joseph", last: "Dela Rosa", dob: "1985-10-14" },
  { sc: "K", first: "Michael Angelo", last: "Resposo", dob: "1990-01-01", docs: { med: "2027-01-11" } },
  { sc: "C", first: "Ryan", last: "Marto", docs: { med: "2026-10-01" } },
  { sc: "N", first: "Jonathan", last: "Alonzo", dob: "1988-10-20" },
  { sc: "Z", first: "Not", last: "Rotation", dob: "1980-10-15" },
];
const ops = () => buildOps({
  today: TODAY, sections: SECTIONS, pool: [{ agency_id: "N" }], sources: { registry: { at: "2026-10-08", crew: 105, dated: 87 }, count: { as_of: "2026-09-26" }, counter: { stamp: null } },
  issues: [], crew: CREW, dash: { workforce: { on_vacation: 3, reserved: 1 }, travel: { year: 2026 } },
  queue: { recent: [{ name: "Darryl Ramos", ship: "Constellation", signOff: "2026-10-05", feedback: { ray: "none", rolando: "none", dexter: "none" } }] },
  kit: { instr: [], link: [] },
});

test("the crew-change rows: overdue first, then by date; held and undated seats are TDG's, never a row", () => {
  const r = ops().changes.rows;
  assert.deepEqual(r.map((x) => x.code), ["GR", "QN", "ON", "AL", "ST"], "Vision (beyond 90 days), Apex (held) and Radiance (undated) are not rows");
  assert.equal(r[0].overdue, true); assert.equal(r[0].days, -15); assert.equal(r[0].group, "overdue");
  assert.equal(r[0].surname, "Dela Rosa", "the roster's surname, not the last word of the name");
  assert.equal(r[1].group, "2026-10");
  assert.equal(r[3].mark, "ok", "Rita's confirmed sign-off is marked"); assert.equal(r[0].mark, "proj", "a projected one reads ~");
});

test("each row's next step says what to do, in this order", () => {
  const by = Object.fromEntries(ops().changes.rows.map((x) => [x.code, x]));
  assert.equal(by.GR.next, "Confirm Corpin's sign-on", "overdue, and the reliever's card sign-on has passed");
  assert.equal(by.GR.reliever.passed, true);
  assert.equal(by.QN.next, "Book ECCR, hotel", "inside 30 days: the travel still missing");
  assert.deepEqual(by.QN.travel, { eccr: false, air: true, hotel: false });
  assert.equal(by.ON.next, "Chase seaman's book", "the reliever's document fails the contract");
  assert.equal(by.AL.next, "Pick from bench");
  assert.equal(by.AL.travel, null, "travel is not due beyond 30 days");
  assert.equal(by.ST.next, "Not in TDG yet", "a reliever only Rita has planned");
  assert.equal(by.ST.reliever.tdg, false);
});

test("the headline tiles count the board, once", () => {
  const k = ops().kpis;
  assert.deepEqual(k.overdue, { n: 1, items: [{ code: "GR", days: 15 }] });
  assert.equal(k.noReliever.n, 1); assert.equal(k.noReliever.of, 4, "the overdue seat is its own tile, not part of the 90 days");
  assert.equal(k.cantSail.n, 1); assert.equal(k.cantSail.of, 3); assert.deepEqual(k.cantSail.first, { code: "ON", on: "2026-11-11" });
  assert.equal(k.aboard.n, 9); assert.deepEqual(k.aboard.doubled, ["AX"]);
  assert.equal(k.bench.ashore, 4); assert.equal(k.bench.ready, 0);
  assert.deepEqual(k.bench.next.map((b) => [b.surname, b.code, b.ready]), [["Alonzo", "SY", "2026-10-24"]], "six weeks home, by the last ship's code");
  assert.deepEqual(ops().changes.counts, { all: 5, overdue: 1, nobody: 1, docs: 1, soon: 2 });
});

test("the next 7 days: one lane per ship changing crew, To do, birthdays of the rotation; two weeks of data for one page turn", () => {
  const w = ops().week;
  assert.equal(w.size, 7); assert.equal(w.days.length, 14, "this week and the next, the page shows 7 at a time");
  assert.equal(w.days[0].date, TODAY); assert.equal(w.days[0].dow, "Tue");
  assert.deepEqual(w.ships.map((s) => [s.code, s.off.surname, s.off.date, s.off.past, s.on && s.on.surname, s.on && s.on.date, s.on && s.on.tdg]),
    [["QN", "Marto", "2026-10-22", false, "Cedilla", "2026-10-22", true]],
    "GR is overdue and Corpin's sign-on (8 Oct) has passed: the Past sign-off tile holds it, not the week");
  assert.deepEqual([w.ships[0].off.sc, w.ships[0].on.sc], ["C", "D"], "each name carries its crew id: a click opens that crew's card on the board");
  assert.deepEqual(w.todo.map((x) => [x.kind, x.date]), [["score", "2026-10-13"], ["file", "2026-10-15"], ["bench", "2026-10-24"]]);
  assert.deepEqual(w.todo[0].people, [{ sc: null, code: "CS", surname: "Ramos", off: "2026-10-05" }], "Ramos signed off 5 Oct and nobody was asked for feedback");
  assert.equal(w.todo[1].last, "2026-10-08", "weekly AdvancedQuery, 7 days after 8 Oct");
  assert.deepEqual([w.todo[2].surname, w.todo[2].code, w.todo[2].sc], ["Alonzo", "SY", "N"]);
  assert.deepEqual(w.bdays.map((b) => [b.date, b.surname, b.code, b.age]), [["2026-10-14", "Dela Rosa", "GR", 41], ["2026-10-20", "Alonzo", "SY", 38]],
    "the roster's surname and the age they turn; an ashore crew carries the last ship; a crew outside the rotation has none");
  assert.deepEqual(w.later.map((x) => [x.code, x.off, x.surname, x.on]),
    [["QN", "2026-10-22", "Marto", "Cedilla"], ["ON", "2026-11-11", "Medidas", "Domingo"], ["AL", "2026-11-29", "Gorre", null], ["ST", "2026-11-29", "Murillo", "Person"]],
    "the crew changes after the first 7 days, for the page's Then line");
});

test("the week lanes: a seat without a reliever, an empty seat between two crew, an overdue seat whose reliever joins this week", () => {
  const S = [
    { ship: "Legend", brand: "Royal", crew: [seat({ agency_id: "P", name: "Pat Nobody", signOn: "2026-03-16", signOff: "2026-10-16", offSource: "rita" })], projections: [] },
    { ship: "Wonder", brand: "Royal", crew: [seat({ agency_id: "Q", name: "Quin Early", signOn: "2026-03-15", signOff: "2026-10-15", offSource: "rita", reliever: { sc: "R" } })],
      projections: [card({ agency_id: "R", name: "Rae Late", signOn: "2026-10-18", signOff: "2027-05-18", registry: null })] },
    { ship: "Odyssey", brand: "Royal", crew: [seat({ agency_id: "S", name: "Sam Over", signOn: "2026-03-01", signOff: "2026-10-01", offSource: "projected", reliever: { sc: "T" } })],
      projections: [card({ agency_id: "T", name: "Tia Joins", signOn: "2026-10-17", signOff: "2027-05-17" })] },
  ];
  const w = buildOps({ today: TODAY, sections: S, crew: [], queue: {}, sources: {} }).week;
  const by = Object.fromEntries(w.ships.map((s) => [s.code, s]));
  assert.deepEqual(w.ships.map((s) => s.code), ["WN", "LE", "OY"], "ordered by the first thing that happens in the window");
  assert.equal(by.LE.on, null, "no reliever: the page draws the seat empty after the sign-off");
  assert.deepEqual([by.WN.off.date, by.WN.on.date, by.WN.on.tdg], ["2026-10-15", "2026-10-18", false], "three days empty, and the reliever is not in TDG yet");
  assert.deepEqual([by.OY.off.past, by.OY.on.date], [true, "2026-10-17"], "past its sign-off, the reliever joins this week");
});

test("the week is drawn as lanes on a wide screen and as a list on a phone, and pages once", () => {
  assert.match(SRC, /function opsWeek\(w\)\{/);
  assert.doesNotMatch(SRC, /function opsCal\(/, "the 14-day strip is gone");
  assert.match(SRC, /opsKpis\(d\.kpis\)\+opsWeek\(d\.week\)/);
  assert.match(SRC, /OPS=d;OPS_WK=0;/, "every open starts on the next 7 days from today");
  assert.match(SRC, /data-wk=1/); assert.match(SRC, /class=oc-wlist/);
  assert.match(SRC, /@media \(max-width:700px\)\{\.ops \.oc-wkw\{display:none\}\.ops \.oc-wlist\{display:flex\}\}/);
  assert.match(SRC, /\.ops \.oc-b\.ab\{background:#2E9E5B/, "the Fleet Gantt's aboard green");
  assert.match(SRC, /function opsGoShip\(ship,sc\)/, "a crew name opens that crew's card on the Keyman board (Miguel, 14 Oct 2026)");
  assert.match(SRC, /q=sc\?'\.rcard\[data-crew="'/, "only the card itself (.rcard) is matched, never its toggles, Remove button or a history card (Safari, 14 Oct 2026: 'the wrong person')");
  assert.match(SRC, /function opsGoShip\(ship,sc\)\{Promise\.resolve\(show\('rotation'\)\)\.then\(function\(\)\{\s*try\{ROT_F='';ROT_BRANDS=\[\];ROT_SHIPS=\[\];ROT_FIND='';ROT_YEAR='';ROT_MONTHS=\[\];/,
    "a jump clears a Keyman search / tile / facet left from before (a crew profile's Keyman link leaves the search on its ship)");
  assert.match(SRC, /rotRail\(secs\.length,allSecs\);\n  if\(typeof opsReaim==='function'\)opsReaim\(\);/, "a board redraw right after the jump re-aims at the card");
  assert.match(SRC, /all\[i\]\.style\.contentVisibility='visible';if\(all\[i\]===sec\)break;/, "the ships above are laid out for real before the scroll");
  assert.match(SRC, /role=button tabindex=0 data-ship="'\+escHtml\(s\.ship\)\+'"'\+\(r\.sc\?' data-sc=/, "the reliever's bar carries the ship and the crew");
  assert.match(SRC, /return x\?x\.dow\+' '\+parseInt\(d\.slice\(8\),10\):opsD\(d\);/, "a date outside the two weeks reads '31 Oct', never a bare '31'");
  assert.match(SRC, /\.ops \.oc-kpi\{align-items:center;text-align:center\}/, "the five tiles read centred (Miguel, 14 Oct 2026: \"also center this\")");
  assert.match(SRC, /\.ops \.oc-dh\{display:flex;align-items:baseline;justify-content:center;/, "day names centred over their columns (Miguel, 14 Oct 2026: \"just center them\")");
  assert.match(SRC, /\.ops \.oc-b\.em\{background:#F2B01E/, "the Fleet Gantt's earmark amber");
});

test("TDG: held crew and an undated seat are to correct; the files say their age", () => {
  const t = ops().tdg;
  assert.deepEqual(t.fixes.map((f) => [f.code, f.kind, f.surname, f.by || null]), [["AX", "held", "Belhida", "Resposo"], ["RD", "undated", "Calayag", null]]);
  assert.deepEqual(t.advq, { at: "2026-10-08", age: 5, every: 7, crew: 105, dated: 87 });
  assert.equal(t.count.age, 17);
  assert.deepEqual(t.earmarks, { agree: 3, total: 4 }, "Rita's own earmark on Star is not in TDG");
});

test("fleet coverage: an overdue seat is past whatever its earmark says; otherwise the latest dated end", () => {
  const all = Object.fromEntries(ops().coverage.brands.flatMap((b) => b.tiles).map((x) => [x.code, x]));
  assert.equal(all.GR.tier, "past", "Corpin's card runs to May, but the seat is past its sign-off");
  assert.equal(all.QN.tier, "ok"); assert.equal(all.AL.tier, "lt2"); assert.equal(all.ON.tier, "ok");
  assert.deepEqual(ops().coverage.brands.map((b) => b.brand), ["Royal", "Celebrity", "Azamara"]);
});

test("documents aboard: expired at sea, or lapsing before this contract's sign-off", () => {
  const d = ops().docsAboard;
  assert.deepEqual(d.expired.map((x) => [x.code, x.doc]), [["QN", "Medical"]]);
  assert.deepEqual(d.lapses.map((x) => [x.code, x.surname, x.doc, x.exp, x.off]), [["AX", "Resposo", "Medical", "2027-01-11", "2027-05-07"]]);
});

test("the route and the page: one wave, the board's own reads, and the page reads /api/ops", () => {
  assert.match(SRC, /if \(p === "\/api\/ops"\)\s+return apiOps\(env\);/);
  const i = SRC.indexOf("async function apiOps("), body = SRC.slice(i, SRC.indexOf("\n}\n", i));
  assert.match(body, /await Promise\.all\(\[\s*rotationSections\(env\),\s*apiDashboard\(env\),/, "one concurrent wave over the board (§12)");
  assert.doesNotMatch(body, /\n\s+await env\.DB/, "no sequential D1 round trip");
  assert.match(SRC, /d=await cachedJson\('\/api\/ops',opsRefresh\)/); // 16 Oct 2026: a revalidation repaints under the same week page and filter
  // The Joy email, wired 23 Oct 2026 (Miguel: "all approved"): the page's ONE send is "Email Joy" through /api/ops/tdg-fixes,
  // a dry run first and a confirm before anything goes; nothing else on the dashboard writes.
  const page = SRC.slice(SRC.indexOf("var OPS=null,OPS_F='all';"), SRC.indexOf("async function renderDashboard(){"));
  assert.deepEqual([...new Set((page.match(/fetch\('[^']+'/g) || []))], ["fetch('/api/ops/tdg-fixes'"]);
  const fx = page.slice(page.indexOf("function opsTdgFix("), page.indexOf("function OPS_addDays("));
  assert.ok(fx.indexOf("post({})") < fx.indexOf("confirm(") && fx.indexOf("confirm(") < fx.indexOf("post({send:true"), "dry run, confirm, then send");
  assert.doesNotMatch(page, /sendViaMailer/);
});

// Miguel, 14 Oct 2026: "You're not utilizing the space ... you have enough space for you to not double-line". On a wide
// screen every crew-change row is one line (the countdown beside the date, travel and kit side by side); they stack only
// below 1180px.
test("crew-change rows are one line on a wide screen and stack only when narrow", () => {
  assert.match(SRC, /\.ops \.oc-tk\{display:inline-flex;flex-wrap:nowrap;gap:4px\}/);
  assert.doesNotMatch(SRC, /\.ops \.oc-w b\{display:block/, "the date and its countdown share the line");
  assert.match(SRC, /@media \(max-width:1180px\)\{\.ops \.oc-w small\{display:block;margin-left:0\}\.ops \.oc-tk\{flex-wrap:wrap;max-width:150px\}\}/);
});
