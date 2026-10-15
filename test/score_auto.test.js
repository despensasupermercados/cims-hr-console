// The Score Card's automatic inputs (Miguel, 15 Oct 2026). Money (§1): every rule below is one of his answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoScore, auditPoints, HON_FROM, FW, computeBonus } from "../src/bonus.js";
import { pickHandover, parseFlag, shipKey, gatherAuto } from "../src/score_auto.js";

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
  assert.equal(hits.length, 2);
  for (const m of hits) assert.match(m[2].trim(), /^SELECT\b/i);
  assert.doesNotMatch(s, /(PARTS_DB|HON_DB)\.(batch|exec)\(/);
});

test("gatherAuto: the miss on HIS ship, his handover, his audits, in one call", async () => {
  const st = (rows) => ({ bind: () => ({ all: async () => ({ results: rows }), first: async () => rows[0] || null, run: async () => ({}) }) });
  const env = {
    DB: { prepare: (sql) => st(/FROM crew WHERE/.test(sql) ? [{ id: "c1" }] : /audit_eval/.test(sql) ? [{ request_id: "ar_1", ship: "Quantum", score: 4, filed_at: "2026-09-02T10:00:00Z" }] : /feedback_response2/.test(sql) ? [{ role: "ray", answers_json: JSON.stringify(BEST.ray), submitted_at: "2026-09-10" }] : []) },
    PARTS_DB: { prepare: () => st([{ order_ref: "CIMS-1", ship: "Quantum", submitted_at: "2026-07-08T10:00:00", grand_total: 900 }, { order_ref: "CIMS-2", ship: "Anthem", submitted_at: "2026-07-09T10:00:00", grand_total: 50 }]) },
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
  const MISSES = [{ order_ref: "CIMS-Q", ship: "Quantum", submitted_at: "2026-05-08T10:00:00", grand_total: 900 }, { order_ref: "CIMS-A", ship: "Anthem", submitted_at: "2026-07-09T10:00:00", grand_total: 50 }, { order_ref: "CIMS-OLD", ship: "Quantum", submitted_at: "2024-01-01T10:00:00" }];
  const env = { DB: { prepare: (sql) => st(/audit_eval/.test(sql) ? [{ request_id: "ar_9", ship: "Oasis", score: 2, filed_at: "2026-09-02T10:00:00Z" }] : []) },
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
