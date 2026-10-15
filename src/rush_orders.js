// RUSH ORDERS THIS CONTRACT — what the order portal tagged as a MISS on the crew's ship while he was aboard, and what
// it cost (Miguel, 16 Oct 2026, on the audit briefing: "what I need to show is the stuff that has been tagged as 'miss'
// from the order portal ... if I had to spend any money on any item, as in I had to rush it because he didn't pay
// attention"). It replaces the OBP "Shipped this contract" card of the same morning: what reached the ship over a whole
// contract "doesn't have any value".
//
// Source: the Parts Portal (order.cims.work, PARTS_DB cims-parts-orders), SELECT only: orders with order_type='missed',
// not voided, on this hull, submitted from the contract's sign-on to its sign-off (today while it runs). Each carries the
// portal's own tag (miss_reason / miss_label: Vessel-side miss · Equipment / unexpected · Shore planning miss), the
// parts, and the money: parts + freight + customs (grand_total), the rush part being freight + customs.
//
// WHOSE miss is the Score Card's own rule, never a second copy: score_auto.js missOwnerByBoard (the crew aboard that
// day; of two, the one aboard 4+ weeks; else the name on the order; else flagged, §6). It is read only for a
// vessel-side miss, the one tag that is the crew's: an equipment failure or a shore planning miss is rush money spent
// while he was aboard, shown, never his. Display only: nothing here scores, writes or pays (§1 stays in bonus.js).
import { shipKey, missOwner, missOwnerByBoard } from "./score_auto.js";
import { buildCrewIndex } from "./travel_match.js";

// one statement: the table is small (31 missed orders on 16 Oct 2026); the hull is matched in code by shipKey, the
// same match the Score Card uses ("Reflection" = "Celebrity Reflection").
export const RUSH_SQL =
  "SELECT order_ref, ship, submitted_at, miss_reason, miss_label, miss_note, requester, subtotal, freight, clearance, grand_total, items " +
  "FROM orders WHERE order_type = 'missed' AND voided_at IS NULL AND submitted_at >= ? AND submitted_at <= ? ORDER BY submitted_at DESC";

export const RUSH_TAGS = { vessel: "Vessel-side miss", equipment: "Equipment / unexpected", shore: "Shore planning miss" };
const day = (v) => (v ? String(v).slice(0, 10) : "");
const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

function itemsOf(json) {
  let a = [];
  try { a = JSON.parse(json || "[]"); } catch (e) { a = []; }
  return (Array.isArray(a) ? a : []).map((i) => ({
    name: String((i && (i.description || i.partNumber)) || "").trim() || "Unnamed part",
    pn: i && i.partNumber ? String(i.partNumber) : null,
    qty: Number(i && i.qty) || 0,
    value: n2(i && (i.lineTotal != null ? i.lineTotal : (Number(i.unitPrice) || 0) * (Number(i.qty) || 0))),
  }));
}

// rows: RUSH_SQL's answer (any hull, any date — cut here). legs: the board's ONE schedule (boardLegs), or null.
// roster: crew rows for the name bridge, or null. Returns null without a sign-on (nothing to window over).
export function rushSummary(rows, { sc, ship, from, to, roster = null, legs = null } = {}) {
  if (!from || !ship) return null;
  const k = shipKey(ship), end = to || "9999-12-31";
  const ix = buildCrewIndex(roster || []);
  const orders = [];
  for (const r of rows || []) {
    const d = day(r && r.submitted_at);
    if (!d || d < from || d > end || shipKey(r.ship) !== k) continue;
    const reason = String(r.miss_reason || "").toLowerCase();
    const o = {
      ref: r.order_ref, at: d, reason, tag: RUSH_TAGS[reason] || r.miss_label || "Miss", note: r.miss_note || null,
      by: r.requester || null, parts: n2(r.subtotal), rush: n2((Number(r.freight) || 0) + (Number(r.clearance) || 0)),
      total: n2(r.grand_total), items: itemsOf(r.items), his: null, why: null, owner: null,
    };
    if (reason === "vessel") {
      const w = legs ? missOwnerByBoard({ ...r, ship: r.ship }, sc, ix, legs) : missOwner(r.requester, sc, ix);
      o.his = w.mine ? true : (w.unplaced && w.unplaced.length ? null : false);
      o.why = w.why || (w.mine ? "his name is on the order" : null);
      o.owner = w.mine ? null : (w.owner || (w.others && w.others[0]) || null);
    }
    orders.push(o);
  }
  // his misses lead, then a vessel-side miss nobody can be charged with, then the rest; newest first within each
  const rank = (o) => (o.his === true ? 0 : o.reason === "vessel" && o.his === null ? 1 : 2);
  orders.sort((a, b) => rank(a) - rank(b) || b.at.localeCompare(a.at) || String(b.ref).localeCompare(String(a.ref)));
  const his = orders.filter((o) => o.his === true);
  return {
    from, to: to || null, ship,
    count: orders.length, total: n2(orders.reduce((s, o) => s + o.total, 0)), rush: n2(orders.reduce((s, o) => s + o.rush, 0)),
    his: { count: his.length, total: n2(his.reduce((s, o) => s + o.total, 0)) },
    check: orders.filter((o) => o.reason === "vessel" && o.his === null).length,
    orders,
  };
}

// The briefing's reads, injected by worker.js (the audit modules never import score code): the orders in the briefing's
// wave, the roster and the schedule only when a vessel-side miss needs an owner (most contracts have none).
export function installRushOrders({ boardLegs }) {
  return {
    read: (env, from, to) => (env.PARTS_DB ? env.PARTS_DB.prepare(RUSH_SQL).bind(from, to + "T23:59:59").all().then((r) => r.results || [], () => null) : Promise.resolve(null)),
    async summarize(env, rows, args) {
      const k = shipKey(args.ship);
      const needOwner = (rows || []).some((r) => String(r.miss_reason).toLowerCase() === "vessel" && shipKey(r.ship) === k && day(r.submitted_at) >= args.from);
      let roster = null, legs = null;
      if (needOwner) {
        [roster, legs] = await Promise.all([
          env.DB.prepare("SELECT agency_id, first_name, last_name FROM crew").bind().all().then((r) => r.results || [], () => []),
          Promise.resolve().then(() => boardLegs(env)).catch(() => null),
        ]);
      }
      return rushSummary(rows, { ...args, roster, legs });
    },
  };
}
