import { test } from "node:test";
import assert from "node:assert/strict";
import { SHIP_HISTORY } from "../src/ship_history.js";

// Integrity guards for the SHIP_HISTORY board source. These run in CI (`node --test`) so bad data
// or a bad hand-edit fails the build instead of shipping to the board. As the fleet scales this is
// the cheap "catch bad code early" net.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BRANDS = new Set(["Royal", "Celebrity", "Azamara", "NCL"]);

test("every entry has valid ISO on/off dates with on <= off", () => {
  for (const e of SHIP_HISTORY) {
    assert.match(e.on, ISO, `bad on-date for ${e.ship}/${e.name}: ${e.on}`);
    assert.match(e.off, ISO, `bad off-date for ${e.ship}/${e.name}: ${e.off}`);
    assert.ok(e.on <= e.off, `on after off for ${e.ship}/${e.name}: ${e.on} > ${e.off}`);
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

// NOTE (known debt): SHIP_HISTORY is a month-granular schedule snapshot with ~75 legitimate
// handover/rounding overlaps, most pre-existing. The board renders these fine, so we deliberately
// do NOT assert single-onboard here — the source never held that invariant. Overlap cleanup is a
// data task tracked in the scaling note, not a unit-test concern (a magic baseline would be its
// own fragile "bad code"). The structural guards above are the ones that catch real rot.
