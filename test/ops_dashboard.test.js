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
  { ship: "Apex", brand: "Celebrity", crew: [seat({ agency_id: "J", name: "Dan Andrew Belhida", signOn: "2026-03-14", signOff: "2026-10-07", offSource: "tdg", heldByFile: true }),
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

test("the 14-day calendar: changes by ship code, the TDG file, a score card not asked, the bench, birthdays of the rotation", () => {
  const c = ops().calendar, day = (d) => c.days.find((x) => x.date === d).items.map((i) => i.kind + ":" + (i.code || i.label));
  assert.equal(c.days.length, 14); assert.equal(c.days[0].date, TODAY); assert.equal(c.days[0].dow, "Tue");
  assert.deepEqual(day("2026-10-13"), ["score:CS"], "Ramos signed off 5 Oct and nobody was asked for feedback");
  assert.deepEqual(day("2026-10-14"), ["bday:GR"]);
  assert.deepEqual(day("2026-10-15"), ["file:TDG file"], "weekly AdvancedQuery, 7 days after 8 Oct");
  assert.deepEqual(day("2026-10-20"), ["bday:SY"], "an ashore crew's birthday carries the last ship");
  assert.deepEqual(day("2026-10-22"), ["off:QN", "on:QN"]);
  assert.deepEqual(day("2026-10-24"), ["bench:SY"]);
  assert.equal(c.days.some((d) => d.items.some((i) => /Rotation/.test(i.title))), false, "a crew outside the rotation has no birthday chip");
  assert.deepEqual(c.after, [{ code: "ON", off: "2026-11-11" }, { code: "AL", off: "2026-11-29" }], "the next two after the window");
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
  assert.match(SRC, /d=await cachedJson\('\/api\/ops',renderDashboard\)/);
  // The Joy email is held for Miguel's sign-off on the rendered email (CIMS email standard): no send from this page yet.
  const page = SRC.slice(SRC.indexOf("var OPS=null,OPS_F='all';"), SRC.indexOf("async function renderDashboard(){"));
  assert.doesNotMatch(page, /fetch\(|sendViaMailer|\/api\/ops\/tdg/, "the dashboard sends nothing");
});

// Miguel, 14 Oct 2026: "You're not utilizing the space ... you have enough space for you to not double-line". On a wide
// screen every crew-change row is one line (the countdown beside the date, travel and kit side by side); they stack only
// below 1180px.
test("crew-change rows are one line on a wide screen and stack only when narrow", () => {
  assert.match(SRC, /\.ops \.oc-tk\{display:inline-flex;flex-wrap:nowrap;gap:4px\}/);
  assert.doesNotMatch(SRC, /\.ops \.oc-w b\{display:block/, "the date and its countdown share the line");
  assert.match(SRC, /@media \(max-width:1180px\)\{\.ops \.oc-w small\{display:block;margin-left:0\}\.ops \.oc-tk\{flex-wrap:wrap;max-width:150px\}\}/);
});
