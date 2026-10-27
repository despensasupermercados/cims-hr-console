// THE INVENTORY COUNT ON THE SCORE CARD (Miguel, 27 Oct 2026; money, §1: his merge).
// "if discrepancies the bonus gate will default as wrong inventory .. so it shodul be 0", for contracts ending on or
// after 1 Nov 2026. HON judges the two blind counts at the crew change by its own rules; Ray or Rolando may override.
// The handover factor (10) is earned by a signed handover AND an inventory that is not wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoScore, inventoryCount, FW } from "../src/bonus.js";
import { pickCount, gatherAuto } from "../src/score_auto.js";

const C = { signOn: "2026-04-22", signOff: "2026-11-02", today: "2026-11-10", handover: { signedAt: "2026-10-30" } };
const hand = (x) => autoScore({ ...C, ...x });
const said = (r) => r.evidence.filter((e) => e.factor === "sHand").map((e) => e.text);

test("wrong inventory zeroes the handover factor even with a signed handover", () => {
  const r = hand({ count: { state: "judged", verdict: "wrong", gaps: 2, spareGaps: 1 } });
  assert.equal(r.sliders.sHand, 0);
  assert.ok(said(r).includes("Inventory count: wrong inventory (2 gaps, 1 on a spare). Ray or Rolando can clear it on the record"));
});

test("no gaps keeps the 10; an override wins over HON's verdict, either way, and says who and why", () => {
  assert.equal(hand({ count: { state: "judged", verdict: "clean" } }).sliders.sHand, FW.sHand);
  const cleared = hand({ count: { state: "judged", verdict: "wrong", gaps: 1, override: "cleared", by: "Ray Guerra", reason: "drum logged late" } });
  assert.equal(cleared.sliders.sHand, FW.sHand);
  assert.ok(said(cleared).includes("Inventory count: CLEARED by Ray Guerra: drum logged late (HON found 1 gap)"));
  const upheld = hand({ count: { state: "judged", verdict: "clean", override: "upheld", by: "Rolando Abellan", reason: "count copied" } });
  assert.equal(upheld.sliders.sHand, 0);
});

test("a count not judged yet, or one HON could not read, holds the factor at 0 and says why", () => {
  const open = hand({ count: { state: "open" } });
  assert.equal(open.sliders.sHand, 0);
  assert.match(said(open).join(" "), /not judged yet/);
  const unread = hand({ count: { state: "unread" } });
  assert.equal(unread.sliders.sHand, 0);
  assert.match(said(unread).join(" "), /could not be read/);
});

test("no count on file leaves the signed handover alone, and says so; no handover is 0 whatever the count", () => {
  const none = hand({ count: null });
  assert.equal(none.sliders.sHand, FW.sHand);
  assert.ok(said(none).includes("No inventory count on file for this sign-off: the signed handover alone decides"));
  assert.equal(hand({ handover: null, count: { state: "judged", verdict: "clean" } }).sliders.sHand, 0);
  assert.equal(inventoryCount(null).zero, false);
});

test("a contract ending before 1 Nov 2026 is untouched by the count", () => {
  const r = autoScore({ signOn: "2026-03-01", signOff: "2026-10-27", today: "2026-11-01", handover: null,
    answers: { rolando: { clean: "Excellent", pm: "Excellent", unres: "Excellent" } }, count: { state: "judged", verdict: "wrong", gaps: 3 } });
  assert.equal(r.sliders.sHand, FW.sHand, "Rolando's answers, as before the gate");
  assert.equal(said(r).filter((t) => /Inventory/.test(t)).length, 0);
});

test("pickCount reads HON's row for one of the card's ships, the latest sign-off in the window", () => {
  const rows = [
    { ship: "Ovation", status: "judged", verdict: "wrong", override: null, findings: JSON.stringify({ gaps: 2, spareGaps: 1 }), out_sign_off: "2026-11-02" },
    { ship: "Anthem", status: "judged", verdict: "clean", findings: "{}", out_sign_off: "2026-11-05" },
  ];
  assert.deepEqual(pickCount(rows, ["ovation"]), { state: "judged", verdict: "wrong", override: null, by: null, reason: null, gaps: 2, spareGaps: 1, ship: "Ovation" });
  assert.equal(pickCount(rows, ["wonder"]), null);
  assert.equal(pickCount([{ ship: "Ovation", status: "open", findings: null, out_sign_off: "2026-11-02" }], ["ovation"]).state, "open");
});

test("gatherAuto reads the count by the crew's SC id in the handover window; a failed read holds the factor at 0", async () => {
  const st = (rows) => ({ bind: (...a) => ({ all: async () => ({ results: rows, binds: a }), first: async () => rows[0] || null, run: async () => ({}) }) });
  const seen = [];
  const hon = (countRows, throwCount = false) => ({ prepare: (sql) => {
    if (/FROM stock_swap/.test(sql)) return { bind: (...a) => { seen.push(a); return { all: async () => { if (throwCount) throw new Error("D1 down"); return { results: countRows }; } }; } };
    if (/FROM handover/.test(sql)) return st([{ id: "h1", ship: "Ovation", outgoing_name: "Christjhelen Racho", outgoing_crew_id: "SC-0043298", signed_at: "2026-10-30 10:00:00" }]);
    return st([]);
  } });
  const DB = { prepare: () => st([]) };
  const base = { sc: "SC-0043298", ship: "Ovation", signOn: "2026-04-22", signOff: "2026-11-02", crewName: "Christjhelen Racho", today: "2026-11-10" };
  const wrong = await gatherAuto({ DB, HON_DB: hon([{ ship: "Ovation", status: "judged", verdict: "wrong", findings: JSON.stringify({ gaps: 1, spareGaps: 1 }), out_sign_off: "2026-11-02" }]) }, base);
  assert.equal(wrong.sliders.sHand, 0);
  assert.deepEqual(seen[0], ["SC-0043298", "2026-10-03", "2026-11-12"], "his id, 30 days before to 10 after the sign-off");
  const failed = await gatherAuto({ DB, HON_DB: hon([], true) }, base);
  assert.equal(failed.sliders.sHand, 0);
  assert.ok(failed.evidence.some((e) => /inventory count could not be read \(D1 down\)/.test(e.text)));
  const none = await gatherAuto({ DB, HON_DB: hon([]) }, base);
  assert.equal(none.sliders.sHand, FW.sHand, "the flow did not reach this sign-off: the signed handover alone");
});
