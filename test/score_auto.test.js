// The Score Card's automatic inputs (Miguel, 15 Oct 2026). Money (§1): every rule below is one of his answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoScore, auditPoints, HON_FROM, FW, computeBonus } from "../src/bonus.js";
import { pickHandover, parseFlag, shipKey, gatherAuto } from "../src/score_auto.js";

const C = { signOn: "2026-04-01", signOff: "2026-11-05" };
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
  const r = await gatherAuto(env, { sc: "SC-1", ship: "Quantum of the Seas", signOn: "2026-04-01", signOff: "2026-11-03", crewName: "Ryan Marto" }, { engine: "none" });
  assert.equal(r.gates.rush, true);
  assert.deepEqual(r.gateNote.map((t) => /CIMS-\d/.exec(t)[0]), ["CIMS-1"], "Anthem's miss is not Ryan's");
  assert.equal(r.sliders.sComm, 8);
  assert.equal(r.sliders.sHand, 0, "ends after 1 Nov with no signed HON handover");
});
