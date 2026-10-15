// Rush orders this contract (src/rush_orders.js) — Miguel, 16 Oct 2026: "what I need to show is the stuff that has
// been tagged as 'miss' from the order portal ... if I had to spend any money on any item, as in I had to rush it
// because he didn't pay attention". Rows mirror the Parts Portal's orders table (order.cims.work), 16 Oct 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rushSummary, installRushOrders, RUSH_SQL } from "../src/rush_orders.js";

const item = (description, qty, lineTotal) => ({ partNumber: "PN-" + description.length, description, qty, lineTotal });
const ORD = (ref, ship, at, reason, requester, subtotal, freight, clearance, items) => ({
  order_ref: ref, ship, submitted_at: at + "T14:00:00.000Z", miss_reason: reason, miss_label: null, miss_note: null, requester,
  subtotal, freight, clearance, grand_total: subtotal + freight + clearance, items: JSON.stringify(items) });
const ROWS = [
  ORD("CIMS-1", "Reflection", "2026-09-28", "equipment", "Bernard Winzon Paqueo", 64.56, 90, 10, [item("FUSING ROLLER /LW*", 1, 64.56)]),
  ORD("CIMS-2", "Reflection", "2026-09-10", "vessel", "Bernard Winzon Paqueo", 300, 200, 76, [item("TN619C CYAN TONER", 2, 169.02), item("DR620 COLOR DRUM", 1, 130.98)]),
  ORD("CIMS-3", "Reflection", "2026-08-20", "shore", "Bernard Winzon Paqueo", 500, 120, 35, [item("TRANSFER BELT /H*", 2, 500)]),
  ORD("CIMS-4", "Reflection", "2026-06-01", "vessel", "Old Crew", 99, 90, 10, [item("FILTER", 1, 99)]),   // before the sign-on
  ORD("CIMS-5", "Apex", "2026-09-12", "vessel", "Michael Angelo Resposo", 162, 200, 76, [item("BOARD", 1, 162)]), // another hull
];
const ROSTER = [{ agency_id: "SC-1", first_name: "Bernard Winzon", last_name: "Paqueo" }, { agency_id: "SC-2", first_name: "Rex", last_name: "Relief" }];

test("every order the portal tagged as a miss on THIS hull inside the contract, his misses first, then newest first, with its money", () => {
  const r = rushSummary(ROWS, { sc: "SC-1", ship: "Celebrity Reflection", from: "2026-07-01", to: "2026-10-16", roster: ROSTER });
  assert.deepEqual(r.orders.map((o) => o.ref), ["CIMS-2", "CIMS-1", "CIMS-3"], "his vessel-side miss leads; June is before the sign-on; Apex is another hull");
  assert.deepEqual(r.orders.map((o) => o.tag), ["Vessel-side miss", "Equipment / unexpected", "Shore planning miss"]);
  assert.equal(r.count, 3);
  assert.equal(r.total, 164.56 + 576 + 655);
  assert.equal(r.rush, 100 + 276 + 155, "freight + customs is the rush money");
  const v = r.orders[0];
  assert.equal(v.parts, 300); assert.equal(v.rush, 276); assert.equal(v.total, 576);
  assert.deepEqual(v.items.map((i) => [i.name, i.qty, i.value]), [["TN619C CYAN TONER", 2, 169.02], ["DR620 COLOR DRUM", 1, 130.98]]);
});

test("whose miss: only a vessel-side miss is the crew's, by the Score Card's own rule (missOwnerByBoard)", () => {
  // alone aboard the hull that day -> his, whoever typed it
  const legs = [{ sc: "SC-1", name: "Bernard Winzon Paqueo", ship: "Reflection", on: "2026-07-01", off: "2027-02-01", is_current: true }];
  const r = rushSummary(ROWS, { sc: "SC-1", ship: "Reflection", from: "2026-07-01", to: "2026-10-16", roster: ROSTER, legs });
  const [vs, eq, sh] = r.orders;
  assert.equal(vs.his, true); assert.equal(vs.why, "the only crew aboard");
  assert.equal(eq.his, null, "an equipment failure is never the crew's"); assert.equal(sh.his, null, "nor a shore planning miss");
  assert.deepEqual(r.his, { count: 1, total: 576 });
  // a reliever aboard 3 days when the order went in, the outgoing crew 10 weeks: the outgoing crew's, not the reliever's
  const legs2 = [legs[0], { sc: "SC-2", name: "Rex Relief", ship: "Reflection", on: "2026-09-07", is_current: true }];
  const r2 = rushSummary(ROWS, { sc: "SC-2", ship: "Reflection", from: "2026-09-07", to: "2026-10-16", roster: ROSTER, legs: legs2 });
  const vs2 = r2.orders.find((o) => o.ref === "CIMS-2");
  assert.equal(vs2.his, false); assert.equal(vs2.owner, "Bernard Winzon Paqueo"); assert.match(vs2.why, /aboard 10 weeks, the other under 4/);
  assert.equal(r2.his.count, 0);
});

test("a vessel-side miss nobody can be charged with is flagged, never picked (§6)", () => {
  const legs = [{ sc: "SC-1", name: "A", ship: "Reflection", on: "2026-01-01", is_current: true }, { sc: "SC-2", name: "B", ship: "Reflection", on: "2026-02-01", is_current: true }];
  const rows = [ORD("CIMS-9", "Reflection", "2026-09-10", "vessel", "", 10, 90, 10, [])];
  const r = rushSummary(rows, { sc: "SC-1", ship: "Reflection", from: "2026-01-01", to: "2026-10-16", roster: ROSTER, legs });
  assert.equal(r.orders[0].his, null); assert.equal(r.check, 1); assert.equal(r.his.count, 0);
});

test("no sign-on or no ship = no card; a clean contract is an empty list, said as such", () => {
  assert.equal(rushSummary(ROWS, { sc: "SC-1", ship: "Reflection", from: null }), null);
  assert.equal(rushSummary(ROWS, { sc: "SC-1", ship: null, from: "2026-07-01" }), null);
  const none = rushSummary(ROWS, { sc: "SC-1", ship: "Oasis", from: "2026-07-01", to: "2026-10-16" });
  assert.equal(none.count, 0); assert.deepEqual(none.orders, []); assert.equal(none.total, 0);
});

test("the read: one SELECT of missed, not voided orders; the roster and the schedule only when a vessel-side miss needs an owner", async () => {
  assert.match(RUSH_SQL.trim(), /^SELECT\b/i);
  assert.match(RUSH_SQL, /order_type = 'missed' AND voided_at IS NULL/);
  let rosterReads = 0, legReads = 0;
  const env = { PARTS_DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: ROWS }) }) }) },
    DB: { prepare: () => ({ bind: () => ({ all: async () => { rosterReads++; return { results: ROSTER }; } }) }) } };
  const R = installRushOrders({ boardLegs: async () => { legReads++; return []; } });
  const rows = await R.read(env, "2026-07-01", "2026-10-16");
  await R.summarize(env, rows, { sc: "SC-1", ship: "Oasis", from: "2026-07-01", to: "2026-10-16" });
  assert.equal(rosterReads + legReads, 0, "no vessel-side miss on the hull: nothing more is read");
  const r = await R.summarize(env, rows, { sc: "SC-1", ship: "Reflection", from: "2026-07-01", to: "2026-10-16" });
  assert.equal(rosterReads, 1); assert.equal(legReads, 1);
  assert.equal(r.orders.find((o) => o.ref === "CIMS-2").his, true, "the schedule is empty: the name on the order decides");
  assert.equal(await R.read({}, "2026-07-01", "2026-10-16"), null, "no portal binding: no card, never a zero");
});
