// WHAT REACHED THE SHIP THIS CONTRACT — paper, toner and parts, in dollars (Miguel, 16 Oct 2026, on the audit briefing:
// "i want a total parts shipped to this ship on the crew contract .. a summary by product .. paper, toner and parts ..
// only display what has a $$ value").
//
// The source is OBP's own received ledger (acceptedorderdetails), which the weekly orders app loads every night into
// cims-hon's D1 as `weekly_obp_order` — every line a ship accepted, with its price, quantity and received date. It is
// read here SELECT-only (HON_DB), the newest export only (each export carries the whole ledger). The Parts Portal
// (order.cims.work) is NOT added on top: its orders reach OBP's ledger once the ship receives them (Edge's 4 Aug sensors
// are EGMANUAL009, received 11 Sep), so adding both would count one box twice, and the portal carries no paper.
//
// The three products, from OBP's own fields — nothing guessed from a price:
//   paper = OBP category "Supplies" (on 15 Oct 2026 every Supplies line in the ledger is paper: DG3 Paper, Veritiv,
//           Office Depot);
//   toner = a toner cartridge by its name (TN…, TNP…, "TONER T01 …"); a waste toner box / bottle / container, a toner
//           filter or a toner supply unit is a PART;
//   parts = everything else (OBP "Parts" and "Service Parts": drums, developers, rollers, staples, boards).
// Pure; pinned by test/ship_supply.test.js.

export const SUPPLY_PRODUCTS = [
  { key: "paper", label: "Paper" },
  { key: "toner", label: "Toner" },
  { key: "parts", label: "Parts" },
];

const NOT_TONER = /\b(WASTE|FILTER|SUPPLY|HOPPER|CONTAINER|BOTTLE|BOX|CARTRIDGE HOLDER|SENSOR|MOTOR|FAN|BELT|SEAL)\b/;

export function productOf(category, description) {
  if (String(category || "").trim().toLowerCase() === "supplies") return "paper";
  const d = String(description || "").toUpperCase();
  if (NOT_TONER.test(d)) return "parts";
  if (/^TN[P-]?\d/.test(d) || /\bTONER\b/.test(d)) return "toner";
  return "parts";
}

// One statement, grouped by day and item: a ship has a few hundred lines a year. `from` is a lower bound wide enough
// for any contract; the summary cuts it to the contract's own sign-on.
export const SUPPLY_SQL =
  "SELECT received_date AS d, category AS c, description AS t, SUM(price * accepted_qty) AS v, SUM(accepted_qty) AS q, " +
  "MAX(snapshot_date) AS s FROM weekly_obp_order " +
  "WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM weekly_obp_order) AND LOWER(ship) = ? AND received_date >= ? AND received_date <= ? " +
  "GROUP BY received_date, category, description";

// The ship is matched as OBP spells it, one word ("Xcel", "Wonder"): the caller binds audit.js normShip(ship).

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// rows: SUPPLY_SQL's answer. Returns null when there is nothing to say a window over (no sign-on), else
// { from, to, asOf, total, products: [...] } with ONLY the products that carry a dollar value (Miguel), each with its
// biggest items first.
export function supplySummary(rows, { from, to, topN = 8 } = {}) {
  if (!from) return null;
  const by = new Map(SUPPLY_PRODUCTS.map((p) => [p.key, { key: p.key, label: p.label, value: 0, qty: 0, items: new Map() }]));
  let asOf = null;
  for (const r of rows || []) {
    if (r && r.s && (!asOf || String(r.s) > asOf)) asOf = String(r.s).slice(0, 10);
    const d = String((r && r.d) || "").slice(0, 10);
    if (!d || d < from || (to && d > to)) continue;
    const v = Number(r.v), q = Number(r.q);
    if (!(v > 0)) continue;
    const g = by.get(productOf(r.c, r.t));
    g.value += v; g.qty += q > 0 ? q : 0;
    const name = String(r.t || "").trim() || "Unnamed item";
    const it = g.items.get(name) || { name, value: 0, qty: 0 };
    it.value += v; it.qty += q > 0 ? q : 0;
    g.items.set(name, it);
  }
  const products = [];
  for (const g of by.values()) {
    if (!(g.value > 0)) continue;
    const items = [...g.items.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    products.push({
      key: g.key, label: g.label, value: round2(g.value), qty: Math.round(g.qty * 100) / 100,
      items: items.slice(0, topN).map((i) => ({ name: i.name, qty: Math.round(i.qty * 100) / 100, value: round2(i.value) })),
      more: Math.max(0, items.length - topN),
    });
  }
  return { from, to: to || null, asOf, total: round2(products.reduce((s, p) => s + p.value, 0)), products };
}
