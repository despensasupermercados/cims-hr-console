// The Score Card's automatic inputs (Miguel, 15 Oct 2026). Money (§1): every rule below is one of his answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoScore, auditPoints, HON_FROM, FW, computeBonus } from "../src/bonus.js";
import { pickHandover, parseFlag, shipKey, gatherAuto } from "../src/score_auto.js";

// the roster the Parts Portal's typed names are placed on (travel_match.js, the same bridge as the travel ledger)
const ROSTER = [{ agency_id: "SC-1", first_name: "Ryan Paolo", last_name: "Marto" }, { agency_id: "SC-2", first_name: "Michael Angelo", last_name: "Resposo" },
  { agency_id: "SC-3", first_name: "Bernard Winzon", last_name: "Paqueo" }, { agency_id: "SC-4", first_name: "Ida Bagus Made", last_name: "Purnama" }, { agency_id: "SC-5", first_name: "Ida", last_name: "Purnama" }];
const C = { signOn: "2026-04-01", signOff: "2026-11-05", today: "2026-11-10" }; // the contract has ended: its handover is due
const BEST = { ray: { order: "No", ontime: "Always", acc: "Accurate", par: "Maintained", audit: "No" } };

test("a vessel-side miss in the contract: on-time ordering 0 AND the rush gate (no bonus, the streak resets)", () => {
  const r = autoScore({ ...C, answers: BEST, misses: [{ ref: "CIMS-260708-AB", at: "2026-07-08T10:00:00Z", total: 1807.75 }] });
  assert.equal(r.sliders.sOrder, 0);
  assert.equal(r.gates.rush, true);
  assert.match(r.gateNote.join(" "), /CIMS-260708-AB.*1,807\.75/);
  const b = computeBonus({ count: 4, sliders: r.sliders, evalScore: 5, gates: { complete: true, ...r.gates } });
  assert.equal(b.gate, "rush"); assert.equal(b.nextCount, 0); assert.equal(b.pay, 0);
  const outside = autoScore({ ...C, answers: BEST, misses: [{ ref: "X", at: "2026-03-01" }] });
  assert.equal(outside.sliders.sOrder, 20, "a miss before this contract belongs to the previous one");
  assert.ok(!outside.gates.rush);
});

test("Dexter's audit replaces Communication: 5 = 10, 4 = 8, 3 or below = 0, no audit = 10, the lowest of several", () => {
  assert.deepEqual([5, 4, 3, 2, 1, null].map(auditPoints), [10, 8, 0, 0, 0, 10]);
  assert.equal(autoScore({ ...C, audits: [] }).sliders.sComm, 10);
  assert.equal(autoScore({ ...C, audits: [{ score: 5, at: "2026-06-01" }, { score: 4, at: "2026-09-01" }] }).sliders.sComm, 8);
  assert.equal(autoScore({ ...C, audits: [{ score: 3, at: "2026-12-01" }] }).sliders.sComm, 0, "filed up to 30 days after the sign-off still counts");
  assert.equal(autoScore({ ...C, audits: [{ score: 2, at: "2026-03-01" }] }).sliders.sComm, 10, "an audit of the previous contract does not");
});

test("handover: HON from contracts ending 1 Nov 2026; before that, Rolando's answers as before", () => {
  assert.equal(HON_FROM, "2026-11-01");
  assert.equal(autoScore({ ...C, handover: { signedAt: "2026-11-02" } }).sliders.sHand, 10);
  assert.equal(autoScore({ ...C, handover: null, answers: { rolando: { clean: "Excellent", pm: "Excellent", unres: "Excellent" } } }).sliders.sHand, 0, "no signed HON = 0, whatever Rolando said");
  const before = autoScore({ signOn: "2026-03-01", signOff: "2026-10-20", handover: null, answers: { rolando: { clean: "Acceptable", pm: "Excellent", unres: "Excellent" } } });
  assert.equal(before.sliders.sHand, 7, "ended before 1 Nov: Rolando's deductions");
});

test("Ray's answers are all or nothing; a field report about accuracy or par zeroes it until Ray answers after it", () => {
  const r = autoScore({ ...C, answers: BEST, rayAt: "2026-06-01", flags: [{ at: "2026-08-01", accuracy: true, par: false, quote: "wrong drum part ordered" }] });
  assert.equal(r.sliders.sAcc, 0); assert.equal(r.sliders.sPar, 15);
  assert.ok(r.evidence.some((e) => e.factor === "sAcc" && /wrong drum part/.test(e.text)));
  const later = autoScore({ ...C, answers: BEST, rayAt: "2026-09-01", flags: [{ at: "2026-08-01", accuracy: true, par: true, quote: "x" }] });
  assert.equal(later.sliders.sAcc, 25, "Ray answered after the report: his answer stands");
  assert.equal(later.sliders.sPar, 15);
  assert.equal(autoScore({ ...C, answers: { ray: { ontime: "Mostly" } } }).sliders.sOrder, 0);
});

test("mono: under 20% = 5, 20% or more = 0, no click data = 5", () => {
  assert.equal(autoScore({ ...C, mono: { pct: 8.4 } }).sliders.sMono, 5);
  assert.equal(autoScore({ ...C, mono: { pct: 20 } }).sliders.sMono, 0);
  assert.equal(autoScore({ ...C, mono: null }).sliders.sMono, 5);
});

test("a perfect contract with no audit and no data still scores 85 operational + the eval", () => {
  const r = autoScore({ ...C, answers: BEST, handover: { signedAt: "2026-11-04" } });
  const op = Object.keys(FW).reduce((a, k) => a + (r.sliders[k] || 0), 0);
  assert.equal(op, 85);
});

test("the handover that closes this contract: same ship, near the sign-off, and HON's name when it gives one", () => {
  const rows = [
    { id: "a", ship: "Wonder", outgoing_name: "Raymond Villacortes", signed_at: "2026-10-06 21:21:09" },
    { id: "b", ship: "Odyssey", outgoing_name: null, signed_at: "2026-09-30 08:39:54" },
  ];
  assert.equal(pickHandover(rows, { ship: "MV WONDER OF THE SEAS", signOff: "2026-10-08", crewName: "Raymond Villacortes" }).id, "a");
  assert.equal(pickHandover(rows, { ship: "Wonder", signOff: "2026-10-08", crewName: "Francis Pintucan" }), null, "HON names someone else");
  assert.equal(pickHandover(rows, { ship: "Odyssey", signOff: "2026-10-07", crewName: "Manuel Reyes" }).id, "b", "no name on the record: ship and date");
  assert.equal(pickHandover(rows, { ship: "Odyssey", signOff: "2026-12-30", crewName: "Manuel Reyes" }), null, "too far from the sign-off");
  assert.equal(shipKey("Celebrity Apex"), shipKey("APEX"));
});

test("a field report is flagged only with its own words as the quote", () => {
  const src = "Ryan submitted incorrect statistics and ordered the wrong drum.";
  assert.deepEqual(parseFlag('{"accuracy":true,"par":false,"quote":"ordered the wrong drum"}', src), { accuracy: true, par: false, quote: "ordered the wrong drum" });
  assert.equal(parseFlag('{"accuracy":true,"par":false,"quote":"ordered 40 wrong drums"}', src).accuracy, false, "a quote the report does not contain flags nothing");
  assert.equal(parseFlag("no json", src), null);
});

test("PARTS_DB and HON_DB are read, never written", () => {
  const s = readFileSync(new URL("../src/score_auto.js", import.meta.url), "utf8");
  const hits = [...s.matchAll(/(PARTS_DB|HON_DB)\.prepare\(\s*["'`]([^"'`]*)/g)];
  assert.equal(hits.length, 3, "the Parts Portal's misses, HON's handovers, OBP's clicks (20 Oct 2026)");
  for (const m of hits) assert.match(m[2].trim(), /^SELECT\b/i);
  assert.doesNotMatch(s, /(PARTS_DB|HON_DB)\.(batch|exec)\(/);
});

test("gatherAuto: the miss on HIS ship, his handover, his audits, in one call", async () => {
  const st = (rows) => ({ bind: () => ({ all: async () => ({ results: rows }), first: async () => rows[0] || null, run: async () => ({}) }) });
  const env = {
    DB: { prepare: (sql) => st(/FROM crew WHERE/.test(sql) ? [{ id: "c1" }] : /FROM crew$/.test(sql) ? ROSTER : /audit_eval/.test(sql) ? [{ request_id: "ar_1", ship: "Quantum", score: 4, filed_at: "2026-09-02T10:00:00Z" }] : /feedback_response2/.test(sql) ? [{ role: "ray", answers_json: JSON.stringify(BEST.ray), submitted_at: "2026-09-10" }] : []) },
    PARTS_DB: { prepare: () => st([{ order_ref: "CIMS-1", ship: "Quantum", submitted_at: "2026-07-08T10:00:00", grand_total: 900, requester: "Ryan Marto" }, { order_ref: "CIMS-2", ship: "Anthem", submitted_at: "2026-07-09T10:00:00", grand_total: 50, requester: "Ryan Marto" }]) },
    HON_DB: { prepare: () => st([]) },
  };
  const r = await gatherAuto(env, { sc: "SC-1", ship: "Quantum of the Seas", signOn: "2026-04-01", signOff: "2026-11-03", crewName: "Ryan Marto", today: "2026-11-10" }, { engine: "none" });
  assert.equal(r.gates.rush, true);
  assert.deepEqual(r.gateNote.map((t) => /CIMS-\d/.exec(t)[0]), ["CIMS-1"], "Anthem's miss is not Ryan's");
  assert.equal(r.sliders.sComm, 8);
  assert.equal(r.sliders.sHand, 0, "ends after 1 Nov with no signed HON handover");
});

test("15 Oct review: no ship or no sign-on reads nothing; a transfer is every ship; Ray answering the same day AFTER the report stands", async () => {
  const st = (rows) => ({ bind: () => ({ all: async () => ({ results: rows }), first: async () => rows[0] || null, run: async () => ({}) }) });
  const MISSES = [{ order_ref: "CIMS-Q", ship: "Quantum", submitted_at: "2026-05-08T10:00:00", grand_total: 900, requester: "Ryan Marto" }, { order_ref: "CIMS-A", ship: "Anthem", submitted_at: "2026-07-09T10:00:00", grand_total: 50, requester: "Ryan Marto" }, { order_ref: "CIMS-OLD", ship: "Quantum", submitted_at: "2024-01-01T10:00:00", requester: "Ryan Marto" }];
  const env = { DB: { prepare: (sql) => st(/FROM crew$/.test(sql) ? ROSTER : /audit_eval/.test(sql) ? [{ request_id: "ar_9", ship: "Oasis", score: 2, filed_at: "2026-09-02T10:00:00Z" }] : []) },
    PARTS_DB: { prepare: (sql) => ({ bind: (a, b) => ({ all: async () => ({ results: MISSES.filter((m) => m.submitted_at >= a && m.submitted_at <= b) }) }) }) }, HON_DB: { prepare: () => st([]) } };
  const base = { sc: "SC-1", signOn: "2026-04-01", signOff: "2026-10-01", crewName: "R M", today: "2026-10-15" };
  const blank = await gatherAuto(env, { ...base, ship: "" }, { engine: "none" });
  assert.ok(!blank.gates.rush, "a blank ship matched every miss in the fleet");
  assert.match(blank.evidence.map((e) => e.text).join(" | "), /No ship on the Score Card/);
  const noOn = await gatherAuto(env, { ...base, ship: "Quantum", signOn: "" }, { engine: "none" });
  assert.ok(!noOn.gates.rush, "a blank sign-on read every miss in the ship's history");
  const tr = await gatherAuto(env, { ...base, ship: "MV QUANTUM OF THE SEAS, MV ANTHEM OF THE SEAS" }, { engine: "none" });
  assert.deepEqual(tr.gateNote.map((t) => /CIMS-\w+/.exec(t)[0]).sort(), ["CIMS-A", "CIMS-Q"], "a transfer: both ships' misses");
  assert.equal(tr.sliders.sComm, 10, "an audit on another ship (Oasis 2/5) is not this contract's");
  assert.equal(tr.allAudits.length, 1, "but it is still listed");
  const r = autoScore({ ...C, answers: BEST, rayAt: "2026-08-01 15:00:00", flags: [{ at: "2026-08-01T08:00:00Z", accuracy: true, quote: "orders were wrong again" }] });
  assert.equal(r.sliders.sAcc, 25, "Ray answered at 15:00, after the 08:00 report: his answer stands");
  const run = autoScore({ signOn: "2026-06-01", signOff: "2027-01-05", today: "2026-10-15", handover: null, answers: { rolando: { clean: "Excellent", pm: "Excellent", unres: "Excellent" } } });
  assert.notEqual(run.sliders.sHand, 0, "a running contract's handover is not due yet");
});

test("15 Oct review: the AI flag needs a true yes and a real quote; HON's crew id decides the handover", () => {
  const src = "Ray says the orders were wrong again and par was not kept on the crossing.";
  assert.equal(parseFlag('{"accuracy":"false","par":false,"quote":"the orders were wrong again"}', src).accuracy, false, "the string false is not a yes");
  assert.equal(parseFlag('{"accuracy":true,"par":false,"quote":"the"}', src).accuracy, false, "a one-word quote is in every report");
  assert.equal(parseFlag('{"accuracy":true,"par":false,"quote":"the orders were wrong again"}', src).accuracy, true);
  const rows = [{ id: "h1", ship: "Wonder", outgoing_name: "Raymond Villacortes Jr.", outgoing_crew_id: null, signed_at: "2026-10-06 21:21:09" },
    { id: "h2", ship: "Wonder", outgoing_name: "Raymond Villacortes", outgoing_crew_id: "SC-0099999", signed_at: "2026-10-07 10:00:00" }];
  assert.equal(pickHandover(rows, { ship: "Wonder of the Seas", signOff: "2026-10-08", crewName: "Raymond Villacortes", sc: "SC-0038350" }).id, "h1", "another crew id is not his; Jr. is still his surname");
  assert.equal(pickHandover([{ ...rows[1], outgoing_crew_id: "SC-0038350", outgoing_name: "someone else" }], { ship: "Wonder", signOff: "2026-10-08", crewName: "Raymond Villacortes", sc: "SC-0038350" }).id, "h2", "the id wins over the name");
});

test("the Score Card page as served: the gate note's regex keeps its backslashes, contributor rows escape names", async () => {
  const { signToken } = await import("../src/auth.js");
  const worker = (await import("../src/worker.js")).default;
  const DB = { prepare: (sql) => { const s = { bind: () => s }; s.run = async () => ({ meta: {} }); s.first = async () => (/FROM users/i.test(sql) ? { email: "miguel.sanmartin@dg3.com" } : null); s.all = async () => ({ results: [] }); return s; }, batch: async (l) => Promise.all(l.map((x) => (x.all ? x.all() : x.run()))) };
  const tok = await signToken({ p: "session", email: "miguel.sanmartin@dg3.com", exp: Math.floor(Date.now() / 1000) + 3600 }, "x");
  const page = await (await worker.fetch(new Request("https://cims.work/", { headers: { Cookie: "cims_sid=" + encodeURIComponent(tok) } }), { SESSION_SECRET: "x", DB }, { waitUntil() {} })).text();
  assert.ok(page.includes("v.replace(/(\\s*·\\s*){2,}/g"), "a template literal ate the backslashes: the regex would match the letter s");
  const row = page.slice(page.indexOf("function swRow"), page.indexOf("var _swt"));
  assert.match(row, /escHtml\(c\.name/); assert.doesNotMatch(row, /swPickCrew\(\\'.+c\.agency_id/);
  assert.match(page, /id=ships onchange="applyAuto\(\)"/, "editing the ship re-reads the systems");
});

test("16 Oct (Miguel: 'only the one who missed the order'): a miss counts against the crew who placed it", async () => {
  const { missOwner } = await import("../src/score_auto.js");
  const { buildCrewIndex } = await import("../src/travel_match.js");
  const ix = buildCrewIndex(ROSTER);
  assert.equal(missOwner("Michael Resposo", "SC-2", ix).mine, true, "a short name is still his");
  assert.equal(missOwner("michael resposo / bernard paqueo", "SC-3", ix).mine, true, "a joint order counts against each");
  assert.equal(missOwner("Michael Resposo", "SC-3", ix).mine, false, "the other crew of the handover is not charged");
  assert.deepEqual(missOwner("Ida Bagus Made Purnama", "SC-4", ix).unplaced, ["Ida Bagus Made Purnama"], "two roster rows: flagged, never picked");
  assert.deepEqual(missOwner("", "SC-1", ix).unplaced, ["(no name on the order)"]);
  const st = (rows) => ({ bind: () => ({ all: async () => ({ results: rows }), first: async () => rows[0] || null, run: async () => ({}) }) });
  const env = { DB: { prepare: (sql) => st(/FROM crew$/.test(sql) ? ROSTER : []) }, HON_DB: { prepare: () => st([]) },
    PARTS_DB: { prepare: () => st([{ order_ref: "CIMS-R", ship: "Reflection", submitted_at: "2026-07-08T19:08:50Z", grand_total: 300, requester: "Michael Resposo" },
      { order_ref: "CIMS-X", ship: "Reflection", submitted_at: "2026-07-09T10:00:00Z", grand_total: 80, requester: "Ray Guerra" }]) } };
  const inp = { ship: "Reflection", signOn: "2026-04-01", signOff: "2026-10-01", today: "2026-10-16" };
  const his = await gatherAuto(env, { ...inp, sc: "SC-2", crewName: "Michael Angelo Resposo" }, { engine: "none" });
  assert.equal(his.gates.rush, true); assert.equal(his.sliders.sOrder, 0);
  assert.match(his.gateNote.join(" "), /CIMS-R .*placed by Michael Resposo/);
  const other = await gatherAuto(env, { ...inp, sc: "SC-3", crewName: "Bernard Winzon Paqueo" }, { engine: "none" });
  assert.ok(!other.gates.rush, "the relief aboard the same hull is not charged for his colleague's miss");
  const lines = other.evidence.map((e) => e.text).join(" | ");
  assert.match(lines, /CIMS-R .*another crew's miss, not counted/);
  assert.match(lines, /CIMS-X .*not on the roster, not counted\. Check who placed it/);
});

test("16 Oct, second answer: the miss is the crew ABOARD that day; two aboard -> the one aboard 4+ weeks", async () => {
  const { missOwnerByBoard, aboardOn } = await import("../src/score_auto.js");
  const { buildCrewIndex } = await import("../src/travel_match.js");
  const ix = buildCrewIndex(ROSTER);
  // Resposo aboard Reflection since 1 Mar; Paqueo joins 1 Jul for the handover; Resposo signs off 10 Jul
  const legs = [{ ship: "Reflection", sc: "SC-2", name: "Michael Angelo Resposo", on: "2026-03-01", off: "2026-07-10", is_current: false },
    { ship: "Celebrity Reflection", sc: "SC-3", name: "Bernard Winzon Paqueo", on: "2026-07-01", off: "2027-02-01", is_current: true }];
  assert.deepEqual(aboardOn(legs, "Reflection", "2026-07-05").map((a) => a.sc), ["SC-2", "SC-3"]);
  const rescueByReliever = { order_ref: "R1", ship: "Reflection", submitted_at: "2026-07-05T10:00:00Z", requester: "Bernard Paqueo" };
  const a = missOwnerByBoard(rescueByReliever, "SC-2", ix, legs);
  assert.equal(a.mine, true, "the reliever typed it, but Resposo had been aboard 4+ weeks: his miss");
  assert.match(a.why, /aboard 18 weeks, the other under 4/);
  assert.equal(missOwnerByBoard(rescueByReliever, "SC-3", ix, legs).mine, false, "the reliever 4 days aboard is not charged");
  const later = { order_ref: "R2", ship: "Reflection", submitted_at: "2026-07-20T10:00:00Z", requester: "michael resposo" };
  assert.equal(missOwnerByBoard(later, "SC-3", ix, legs).mine, true, "after the sign-off only Paqueo is aboard: his, whoever typed it");
  // two printers aboard 4+ weeks (a two-printer hull): the order's name decides; no name -> nobody, flagged
  const two = [{ ship: "Oasis", sc: "SC-2", name: "R", on: "2026-01-01", is_current: true }, { ship: "Oasis", sc: "SC-3", name: "P", on: "2026-02-01", is_current: true }];
  assert.equal(missOwnerByBoard({ ship: "Oasis", submitted_at: "2026-07-05", requester: "Bernard Paqueo" }, "SC-3", ix, two).mine, true);
  const nobody = missOwnerByBoard({ ship: "Oasis", submitted_at: "2026-07-05", requester: "Ray Guerra" }, "SC-2", ix, two);
  assert.equal(nobody.mine, false); assert.equal(nobody.owner, null); assert.ok(nobody.unplaced.length, "flagged, never picked");
  // nobody aboard per the schedule: the typed name decides, as before
  assert.equal(missOwnerByBoard({ ship: "Apex", submitted_at: "2026-07-05", requester: "Michael Resposo" }, "SC-2", ix, legs).rule, "name");
});

// ---- 16 Oct 2026 bug hunt — the automatic read (money, §1: a draft for Miguel; each case reproduced first) --------------
const stOf = (rows) => ({ bind: () => ({ all: async () => ({ results: rows }), first: async () => rows[0] || null, run: async () => ({}) }) });

test("S1: Ray's answer from BEFORE this contract's sign-on is not this contract's pre-fill — it is listed as earlier feedback, not used", async () => {
  // Ray answered on 10 Mar for the previous contract; nobody has asked him about this one (sign-on 1 Apr)
  const RESP = [{ role: "ray", answers_json: JSON.stringify(BEST.ray), submitted_at: "2026-03-10T09:00:00Z" }];
  const env = { DB: { prepare: (sql) => stOf(/FROM crew$/.test(sql) ? ROSTER : /feedback_response2/.test(sql) ? RESP : []) }, HON_DB: { prepare: () => stOf([]) } };
  const r = await gatherAuto(env, { sc: "SC-1", ship: "Quantum", signOn: "2026-04-01", signOff: "2026-11-05", crewName: "Ryan Marto", today: "2026-11-10" }, { engine: "none" });
  assert.equal(r.sliders.sOrder, undefined, "no on-time pre-fill from a March answer about an April-to-November contract");
  assert.equal(r.sliders.sAcc, undefined); assert.equal(r.sliders.sPar, undefined);
  assert.match(r.evidence.map((e) => e.text).join(" | "), /Ray.*2026-03-10.*before this contract.*not used/);
  const inside = await gatherAuto({ ...env, DB: { prepare: (sql) => stOf(/FROM crew$/.test(sql) ? ROSTER : /feedback_response2/.test(sql) ? [{ ...RESP[0], submitted_at: "2026-06-10T09:00:00Z" }] : []) } },
    { sc: "SC-1", ship: "Quantum", signOn: "2026-04-01", signOff: "2026-11-05", crewName: "Ryan Marto", today: "2026-11-10" }, { engine: "none" });
  assert.equal(inside.sliders.sOrder, 20, "an answer given during the contract is this contract's");
});

test("S2: aboardOn — a contract that ENDED without a recorded sign-off date is not 'aboard for ever'", async () => {
  const { aboardOn } = await import("../src/score_auto.js");
  const legs = [{ sc: "SC-1", name: "Old", ship: "Quantum", on: "2025-01-30", off: null, is_current: false }, { sc: "SC-2", name: "Now", ship: "Quantum", on: "2026-06-01", off: "2027-01-01", is_current: true }];
  assert.deepEqual(aboardOn(legs, "Quantum", "2026-08-01").map((a) => a.sc), ["SC-2"], "the ended leg with no date cannot say he was aboard a year later");
  const held = [{ sc: "SC-3", name: "Held", ship: "Quantum", on: "2026-01-01", off: "2026-07-01", is_current: true }];
  assert.deepEqual(aboardOn(held, "Quantum", "2026-08-01").map((a) => a.sc), ["SC-3"], "a CURRENT leg past its sign-off (held / overdue) is still aboard");
});

test("S4: HON's outgoing name must be THIS crew — a shared surname on the same hull is not his handover", () => {
  const rows = [{ id: "h1", ship: "Quantum", outgoing_name: "Juan Santos", signed_at: "2026-11-04" }];
  assert.equal(pickHandover(rows, { ship: "Quantum", signOff: "2026-11-05", crewName: "Pedro Santos", sc: "SC-9" }), null, "Juan is not Pedro");
  assert.ok(pickHandover(rows, { ship: "Quantum", signOff: "2026-11-05", crewName: "Juan Carlos Santos", sc: "SC-9" }), "a first-name token agrees: his");
  assert.ok(pickHandover([{ id: "h2", ship: "Quantum", outgoing_name: "Villacortes Jr.", signed_at: "2026-11-04" }], { ship: "Quantum", signOff: "2026-11-05", crewName: "Raymond Villacortes", sc: "SC-9" }), "a surname with only a suffix beside it still matches (Villacortes Jr.)");
  assert.ok(pickHandover([{ id: "h3", ship: "Quantum", outgoing_name: "Santos", signed_at: "2026-11-04" }], { ship: "Quantum", signOff: "2026-11-05", crewName: "Pedro Santos", sc: "SC-9" }), "a bare surname cannot disagree");
});

test("S5: a Parts Portal or HON read that FAILS is said on the card, never read as 'no miss' / 'no handover'", async () => {
  const boom = { prepare: () => ({ bind: () => ({ all: async () => { throw new Error("D1_ERROR: storage"); }, first: async () => { throw new Error("D1_ERROR"); } }) }) };
  const env = { DB: { prepare: (sql) => stOf(/FROM crew$/.test(sql) ? ROSTER : []) }, PARTS_DB: boom, HON_DB: boom };
  const r = await gatherAuto(env, { sc: "SC-1", ship: "Quantum", signOn: "2026-04-01", signOff: "2026-11-05", crewName: "Ryan Marto", today: "2026-11-10" }, { engine: "none" });
  const txt = r.evidence.map((e) => e.text).join(" | ");
  assert.match(txt, /Parts Portal.*could not be read/i, "the miss read failed: said, not 'full points'");
  assert.match(txt, /HON.*could not be read/i);
  assert.equal(r.sources.partsRead, false); assert.equal(r.sources.honRead, false);
  assert.ok(!r.gates.rush, "a failed read never arms a gate either");
  assert.equal(r.sliders.sHand, 0, "the handover factor still cannot be earned without a signed HON row — the card says why");
});

// OBP's clicks (Jerwin's daily clicks.csv, read by the weekly-orders app into cims-hon's D1 since 20 Oct 2026): the mono
// share of PRESS clicks on the card's ships over the contract. The rule (under 20% = 5) is bonus.js's, unchanged.
test("mono: OBP's press clicks on the card's ships over the contract feed the mono factor", async () => {
  const CLICKS = [{ ship: "Navigator", c: 75000, m: 25000, a: "2026-04-01", b: "2026-10-18" }, { ship: "Quantum", c: 90000, m: 9000, a: "2026-04-01", b: "2026-10-18" },
    { ship: "Anthem", c: 50000, m: 1000, a: "2026-05-02", b: "2026-10-18" }];
  let bound = null;
  const st = (rows, keep) => ({ bind: (...a) => { if (keep) bound = a; return { all: async () => ({ results: rows }), first: async () => rows[0] || null, run: async () => ({}) }; } });
  const env = (hon) => ({ DB: { prepare: (sql) => st(/FROM crew$/.test(sql) ? ROSTER : []) }, PARTS_DB: { prepare: () => st([]) }, HON_DB: hon });
  const clicksOnly = (rows) => ({ prepare: (sql) => (/weekly_obp_clicks/.test(sql) ? st(rows, true) : { bind: () => ({ all: async () => ({ results: [] }) }) }) });
  const base = { sc: "SC-1", signOn: "2026-04-01", signOff: "2026-11-05", crewName: "Ryan Marto", today: "2026-11-10" };
  const nav = await gatherAuto(env(clicksOnly(CLICKS)), { ...base, ship: "Navigator of the Seas" }, { engine: "none" });
  assert.equal(nav.sliders.sMono, 0, "Navigator 25% mono: 20% or more = 0");
  assert.deepEqual(bound, ["2026-04-01", "2026-11-05"], "the contract's own days");
  const ev = nav.evidence.filter((e) => e.factor === "sMono").map((e) => e.text).join(" | ");
  assert.match(ev, /Mono 25% of press clicks/);
  assert.match(ev, /Press clicks on Navigator, 2026-04-01 to 2026-10-18: 25,000 mono of 100,000/);
  assert.doesNotMatch(ev, /Quantum|Anthem/, "another ship's clicks are not his");
  const q = await gatherAuto(env(clicksOnly(CLICKS)), { ...base, ship: "Quantum" }, { engine: "none" });
  assert.equal(q.sliders.sMono, 5, "Quantum 9.1% mono: under 20% = 5");
  // A transfer is every ship on the card, EACH ON ITS OWN LEG'S DAYS (27 Oct 2026 review, Tuazon "Explorer, Jewel": both hulls
  // summed over the whole contract read his successor's clicks). Quantum Apr 1 – Jun 30, Anthem Jul 5 – Nov 5: Quantum's
  // August day and Anthem's June day are somebody else's.
  const DAYS = [{ ship: "Quantum", day: "2026-04-10", c: 40000, m: 4000, a: "2026-04-10", b: "2026-04-10" }, { ship: "Quantum", day: "2026-08-10", c: 50000, m: 5000, a: "2026-08-10", b: "2026-08-10" },
    { ship: "Anthem", day: "2026-06-10", c: 20000, m: 500, a: "2026-06-10", b: "2026-06-10" }, { ship: "Anthem", day: "2026-08-10", c: 30000, m: 500, a: "2026-08-10", b: "2026-08-10" }];
  const LEGS = [{ sc: "SC-1", ours: true, ship: "Quantum", on: "2026-04-01", off: "2026-06-30", is_current: false }, { sc: "SC-1", ours: true, ship: "Anthem", on: "2026-07-05", off: "2026-11-05", is_current: false }];
  const tr = await gatherAuto(env(clicksOnly(DAYS)), { ...base, ship: "Quantum, Anthem" }, { engine: "none", boardLegs: async () => LEGS });
  assert.match(tr.evidence.map((e) => e.text).join(" | "), /Press clicks on Quantum, Anthem, 2026-04-10 to 2026-08-10[^:]*: 4,500 mono of 74,500/, "a transfer is every ship on the card, each on its own days");
  const trNoLegs = await gatherAuto(env(clicksOnly(DAYS)), { ...base, ship: "Quantum, Anthem" }, { engine: "none" });
  assert.equal(trNoLegs.sources.clicksRead, false, "without the legs whose clicks are whose is unknown: said, never guessed");
  assert.match(trNoLegs.evidence.map((e) => e.text).join(" | "), /mono was NOT checked/);
  const late = await gatherAuto(env(clicksOnly(CLICKS)), { ...base, ship: "Anthem", signOn: "2026-04-20" }, { engine: "none" });
  assert.match(late.evidence.map((e) => e.text).join(" | "), /OBP's clicks on file begin 2026-05-02; the contract began 2026-04-20/, "a contract older than the clicks on file says so");
  // Azamara: the clicks file's ShipIDs for the Azamara hulls are not on OBP's ship list yet, so no row carries the name
  const az = await gatherAuto(env(clicksOnly(CLICKS)), { ...base, ship: "Azamara Quest" }, { engine: "none" });
  assert.equal(az.sliders.sMono, 5);
  assert.match(az.evidence.map((e) => e.text).join(" | "), /No click data for this contract yet: full points/);
  // before the weekly app has created its table: no data, not a failure
  const noTable = { prepare: (sql) => (/weekly_obp_clicks/.test(sql) ? { bind: () => ({ all: async () => { throw new Error("D1_ERROR: no such table: weekly_obp_clicks"); } }) } : { bind: () => ({ all: async () => ({ results: [] }) }) }) };
  const nt = await gatherAuto(env(noTable), { ...base, ship: "Navigator" }, { engine: "none" });
  assert.equal(nt.sliders.sMono, 5); assert.equal(nt.sources.clicksRead, true);
  assert.doesNotMatch(nt.evidence.map((e) => e.text).join(" | "), /could not be read/);
  // any other error is said on the card, never read as "no data"
  const boom = { prepare: (sql) => (/weekly_obp_clicks/.test(sql) ? { bind: () => ({ all: async () => { throw new Error("D1_ERROR: storage"); } }) } : { bind: () => ({ all: async () => ({ results: [] }) }) }) };
  const bm = await gatherAuto(env(boom), { ...base, ship: "Navigator" }, { engine: "none" });
  assert.equal(bm.sources.clicksRead, false);
  assert.match(bm.evidence.map((e) => e.text).join(" | "), /OBP's clicks could not be read \(D1_ERROR: storage\): mono was NOT checked/);
  // no sign-on or no ship: nothing dated is read
  bound = null;
  await gatherAuto(env(clicksOnly(CLICKS)), { ...base, ship: "Navigator", signOn: "" }, { engine: "none" });
  assert.equal(bound, null);
});

test("aboardOn: a training visitor holds no seat and is never charged a miss (Miguel, 17 Oct 2026: never charged)", async () => {
  const { aboardOn, missOwnerByBoard } = await import("../src/score_auto.js");
  const { buildCrewIndex } = await import("../src/travel_match.js");
  const ix = buildCrewIndex([{ agency_id: "SC-0041465", first_name: "Jonathan", last_name: "Alonzo" }, { agency_id: "SC-7", first_name: "A.J.", last_name: "Balena" }]);
  const legs = [
    { sc: "SC-0041465", name: "Jonathan Alonzo", ship: "Pursuit", on: "2026-10-16", off: "2026-10-16", is_current: true, visit: true },
    { sc: "SC-7", name: "A.J. Balena", ship: "Pursuit", on: "2026-10-16", off: "2027-03-16", is_current: true },
  ];
  assert.deepEqual(aboardOn(legs, "Pursuit", "2026-10-16").map((a) => a.sc), ["SC-7"]);
  const order = { ship: "Pursuit", submitted_at: "2026-10-16", requester: "Jonathan Alonzo" };
  assert.equal(missOwnerByBoard(order, "SC-0041465", ix, legs).mine, false, "the visitor is not charged even when he typed the order");
  assert.equal(missOwnerByBoard(order, "SC-7", ix, legs).mine, true, "the seat aboard is: the only crew aboard");
});

test("an audit belongs to the contract it was REQUESTED in, whenever Dexter grades it (Miguel, 17 Oct 2026)", async () => {
  const { autoScore } = await import("../src/bonus.js");
  // contract A: Quantum, 1 Mar -> 31 Oct; Dexter asks on 25 Oct, grades 3/5 on 20 Nov; contract B starts 10 Nov
  const aud = [{ id: "ar1", score: 3, at: "2026-11-20T10:00:00Z", requestedAt: "2026-10-25T09:00:00Z" }];
  const A = autoScore({ signOn: "2026-03-01", signOff: "2026-10-31", today: "2026-12-01", audits: aud });
  assert.equal(A.sliders.sComm, 0, "A's audit, a 3: 0 points");
  const B = autoScore({ signOn: "2026-11-10", signOff: "2027-06-10", today: "2026-12-01", audits: aud });
  assert.equal(B.sliders.sComm, 10, "graded during B, asked during A: not B's (the grading-day window gave B the 3)");
  // graded more than 30 days after the sign-off: still A's (the old window lost it)
  const late = autoScore({ signOn: "2026-03-01", signOff: "2026-10-31", today: "2027-01-10", audits: [{ ...aud[0], at: "2026-12-15T10:00:00Z" }] });
  assert.equal(late.sliders.sComm, 0);
  // an audit with no request date keeps the grading window
  const legacy = autoScore({ signOn: "2026-03-01", signOff: "2026-10-31", today: "2026-12-01", audits: [{ id: "v1", score: 4, at: "2026-11-15" }] });
  assert.equal(legacy.sliders.sComm, 8);
  // the read carries the request's date: sent, else created
  const src = (await import("node:fs")).readFileSync(new URL("../src/score_auto.js", import.meta.url), "utf8");
  assert.match(src, /COALESCE\(r\.sent_at, r\.created_at\) AS requested_at FROM audit_eval e LEFT JOIN audit_request r/);
  assert.match(src, /requestedAt: a\.requested_at \|\| null/);
});
