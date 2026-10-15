// What reached the ship this contract (src/ship_supply.js) — Miguel, 16 Oct 2026: "a total parts shipped to this ship on
// the crew contract .. a summary by product .. paper, toner and parts .. only display what has a $$ value".
// Descriptions and prices below are OBP's own, copied from weekly_obp_order on 15 Oct 2026 (Infinity / Silhouette).
import { test } from "node:test";
import assert from "node:assert/strict";
import { productOf, supplySummary, SUPPLY_SQL } from "../src/ship_supply.js";
import { normShip } from "../src/audit.js";

test("paper is OBP's Supplies; toner is a cartridge by its name; a waste box, filter or supply unit is a part", () => {
  assert.equal(productOf("Supplies", "20 LBS 11 x 17 DG3 PAPER"), "paper");
  assert.equal(productOf("Supplies", "RADIANT WHITE 28# 11x17"), "paper");
  assert.equal(productOf("Supplies", "8.5 x 11 80# CARD STOCK"), "paper");
  for (const t of ["TN619C CYAN TONER", "TN634K BLACK TONER", "TN-328K BLACK TONER", "TNP44", "TNP64 STD", "TNP79K - BLACK TONER (YIELD: 13K )", "TONER T01 BLACK*"])
    assert.equal(productOf("Parts", t), "toner", t);
  for (const t of ["WASTE TONER BOX (DG3)", "CONTAINER, WASTE TONER, WT-401*", "WB-P05 WASTE TONER BOTTLE", "TONER FILTER ASSY", "TONER SUPPLY UNIT ASSY", "DR620 COLOR DRUM", "DV614Y YELLOW DEVELOPER*", "FUSING ROLLER /LW*", "STAPLE CARTRIDGE REFILLABLE C4070 SK-703"])
    assert.equal(productOf("Parts", t), "parts", t);
  assert.equal(productOf("Service Parts", "WASTE TONER BOX*"), "parts");
});

const ROWS = [
  { d: "2026-03-01", c: "Supplies", t: "20 LBS 11 x 17 DG3 PAPER", v: 3648, q: 100, s: "2026-10-15" }, // before the sign-on
  { d: "2026-04-10", c: "Supplies", t: "20 LBS 11 x 17 DG3 PAPER", v: 1459.2, q: 40, s: "2026-10-15" },
  { d: "2026-04-10", c: "Supplies", t: "RADIANT WHITE 28# 11x17", v: 894.5, q: 10, s: "2026-10-15" },
  { d: "2026-08-11", c: "Parts", t: "TN619C CYAN TONER", v: 845.1, q: 10, s: "2026-10-15" },
  { d: "2026-08-11", c: "Parts", t: "TN634K BLACK TONER", v: 333.2, q: 10, s: "2026-10-15" },
  { d: "2026-09-17", c: "Parts", t: "TN619C CYAN TONER", v: 1605.69, q: 19, s: "2026-10-15" },
  { d: "2026-09-11", c: "Parts", t: "WASTE TONER BOX (DG3)", v: 40, q: 2, s: "2026-10-15" },
  { d: "2026-09-11", c: "Parts", t: "FUSING ROLLER /LW*", v: 95.41, q: 1, s: "2026-10-15" },
  { d: "2026-09-12", c: "Parts", t: "FREE SAMPLE", v: 0, q: 3, s: "2026-10-15" }, // no dollar value: not shown
  { d: "2026-10-20", c: "Parts", t: "DR620 COLOR DRUM", v: 500, q: 1, s: "2026-10-15" }, // after the window
];

test("the contract's own window, each product with its dollars, biggest items first, only what has a value", () => {
  const s = supplySummary(ROWS, { from: "2026-04-01", to: "2026-10-15" });
  assert.equal(s.from, "2026-04-01"); assert.equal(s.asOf, "2026-10-15");
  assert.deepEqual(s.products.map((p) => p.key), ["paper", "toner", "parts"]);
  const [paper, toner, parts] = s.products;
  assert.equal(paper.value, 2353.7); assert.equal(paper.qty, 50, "the March paper predates the sign-on");
  assert.equal(toner.value, 2783.99); assert.equal(toner.qty, 39);
  assert.deepEqual(toner.items.map((i) => i.name), ["TN619C CYAN TONER", "TN634K BLACK TONER"], "one line per item, the days added up");
  assert.equal(toner.items[0].value, 2450.79); assert.equal(toner.items[0].qty, 29);
  assert.deepEqual(parts.items.map((i) => i.name), ["FUSING ROLLER /LW*", "WASTE TONER BOX (DG3)"], "a $0 line and a later drum are left out");
  assert.equal(parts.value, 135.41);
  assert.equal(s.total, 5273.1);
});

test("a product with no dollar value is not shown; no sign-on = no summary; nothing received is an empty list", () => {
  const onlyToner = supplySummary(ROWS.filter((r) => /TONER$/.test(r.t)), { from: "2026-04-01", to: "2026-10-15" });
  assert.deepEqual(onlyToner.products.map((p) => p.key), ["toner"]);
  assert.equal(supplySummary(ROWS, { from: null }), null);
  const none = supplySummary([], { from: "2026-04-01", to: "2026-10-15" });
  assert.deepEqual(none.products, []); assert.equal(none.total, 0);
});

test("the top items are capped and the rest counted", () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ d: "2026-05-01", c: "Parts", t: "PART " + i, v: 10 + i, q: 1 }));
  const p = supplySummary(many, { from: "2026-04-01", to: "2026-10-15" }).products[0];
  assert.equal(p.items.length, 8); assert.equal(p.more, 3); assert.equal(p.items[0].name, "PART 10");
});

test("the read is one SELECT on the newest OBP export, matched on OBP's one-word ship name", () => {
  assert.match(SUPPLY_SQL.trim(), /^SELECT\b/i, "HON's database is read, never written");
  assert.match(SUPPLY_SQL, /snapshot_date = \(SELECT MAX\(snapshot_date\) FROM weekly_obp_order\)/, "each export is the whole ledger: one export, never summed across");
  assert.match(SUPPLY_SQL, /LOWER\(ship\) = \?/);
  assert.equal(normShip("Celebrity Xcel"), "xcel");
  assert.equal(normShip("Wonder of the Seas"), "wonder");
  assert.equal(normShip("Infinity"), "infinity");
});
