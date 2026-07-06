import { test } from "node:test";
import assert from "node:assert/strict";
import { SHIP_HISTORY } from "../src/ship_history.js";

// Integrity guards for the SHIP_HISTORY board source. These run in CI (`node --test`) so bad data
// or a bad hand-edit fails the build instead of shipping to the board. As the fleet scales this is
// the cheap "catch bad code early" net.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BRANDS = new Set(["Royal", "Celebrity", "Azamara", "NCL"]);

// Dates are ISO when present. off:null = TBA sign-off (spec §5.1/§9.4/§18/§20-B); on:null = a
// sign-on the roster left blank (Rita fills in-app). on <= off enforced only when BOTH are set.
test("dates are valid ISO (or null for TBA/blank) with on <= off when both set", () => {
  for (const e of SHIP_HISTORY) {
    if (e.on != null) assert.match(e.on, ISO, `bad on-date for ${e.ship}/${e.name}: ${e.on}`);
    if (e.off != null) assert.match(e.off, ISO, `bad off-date for ${e.ship}/${e.name}: ${e.off}`);
    if (e.on != null && e.off != null) assert.ok(e.on <= e.off, `on after off for ${e.ship}/${e.name}: ${e.on} > ${e.off}`);
  }
});

test("ours=true rows carry a SC id; ours=false rows do not", () => {
  for (const e of SHIP_HISTORY) {
    if (e.ours) assert.match(String(e.sc), /^SC-\d+$/, `ours row missing SC id: ${e.ship}/${e.name}`);
    else assert.equal(e.sc, null, `non-ours row has an SC id: ${e.ship}/${e.name}`);
  }
});

test("ship and name are non-empty; brand is known", () => {
  for (const e of SHIP_HISTORY) {
    assert.ok(String(e.ship).trim().length > 0, "empty ship");
    assert.ok(String(e.name).trim().length > 0, `empty name on ${e.ship}`);
    assert.ok(BRANDS.has(e.brand), `unknown brand '${e.brand}' on ${e.ship}/${e.name}`);
  }
});

test("no exact-duplicate rows (ship+sc+on+off)", () => {
  const seen = new Set();
  for (const e of SHIP_HISTORY) {
    const k = [e.ship, e.sc, e.on, e.off].join("|");
    assert.ok(!seen.has(k), `duplicate row: ${k}`);
    seen.add(k);
  }
});

// §10 board invariants (history wiped; one current keyman per ship): exactly one row per ship,
// all bridged to our roster. This is a real invariant now that only the current legs are seeded
// (the old month-granular snapshot with handover overlaps is gone).
test("one current keyman per ship, all ours=true (spec §10)", () => {
  const ships = new Set();
  for (const e of SHIP_HISTORY) {
    assert.ok(e.ours === true, `non-ours row in a wiped-history board: ${e.ship}/${e.name}`);
    assert.ok(!ships.has(e.ship), `two current legs on ${e.ship}`);
    ships.add(e.ship);
  }
});
