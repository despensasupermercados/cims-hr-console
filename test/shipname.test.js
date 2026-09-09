import { test } from "node:test";
import assert from "node:assert/strict";
import { normShip, canonShip, canonShipWith, buildShipKeys, validShipKeys, AZ_DISP, AZAMARA_SHORT, clientOf, UNASSIGNED} from "../src/shipname.js";
import { VESSEL_REF } from "../src/vessel_ref.js";
import { SHIP_HISTORY } from "../src/ship_history.js";

const C = (s) => canonShip(s, VESSEL_REF);

test("normShip strips case and non-alphanumerics", () => {
  assert.equal(normShip("MV Celebrity Reflection"), "mvcelebrityreflection");
  assert.equal(normShip("Legend (LE)"), "legendle");
  assert.equal(normShip(null), "");
  assert.equal(normShip(undefined), "");
});

test("registry 'MV X OF THE SEAS' -> canonical short name", () => {
  assert.equal(C("MV WONDER OF THE SEAS"), "Wonder");
  assert.equal(C("Wonder of the Seas"), "Wonder");
  assert.equal(C("MV SYMPHONY OF THE SEAS"), "Symphony");
});

test("Celebrity-prefixed schedule names map to the bare VESSEL_REF hull", () => {
  // These are exactly the names the AZAMARA/CELEBRITY schedule tabs use, which used to
  // miss the registry/keyman section (bare names) and silently drop their history.
  assert.equal(C("Celebrity Reflection"), "Reflection");
  assert.equal(C("Celebrity Edge"), "Edge");
  assert.equal(C("Celebrity Millennium"), "Millennium");
  assert.equal(C("Celebrity Constellation"), "Constellation");
  assert.equal(C("Celebrity Xcel"), "Xcel");
  assert.equal(C("MV CELEBRITY SUMMIT"), "Summit");
});

test("Azamara: registry 'MV AZAMARA X' and short 'X' both canonicalize to the short name", () => {
  assert.equal(C("MV AZAMARA QUEST"), "Quest");
  assert.equal(C("Azamara Quest"), "Quest");
  assert.equal(C("Quest"), "Quest");
  assert.equal(C("Azamara Journey"), "Journey");
  assert.equal(C("Journey"), "Journey");
  assert.equal(C("Onward"), "Onward");
  assert.equal(C("Pursuit"), "Pursuit");
});

test("case and parenthetical noise normalize via VESSEL_REF match", () => {
  assert.equal(C("STAR"), "Star");
  assert.equal(C("Legend (LE)"), "Legend");
});

test("longest VESSEL_REF key wins (no short-name shadowing)", () => {
  // 'Constellation' must not be shadowed by a shorter contained key.
  assert.equal(C("Celebrity Constellation"), "Constellation");
  // every VESSEL_REF hull canonicalizes to itself
  for (const v of VESSEL_REF) assert.equal(C(v.name), v.name, `self-map ${v.name}`);
});

test("empty / whitespace input -> null", () => {
  assert.equal(C(""), null);
  assert.equal(C("   "), null);
  assert.equal(C(null), null);
  assert.equal(C(undefined), null);
});

test("unknown but non-empty names are preserved (caller's guard decides)", () => {
  assert.equal(C("Unassigned"), "Unassigned");
  assert.equal(C("# of flights:"), "# of flights:");
});

test("canonShipWith matches canonShip given prebuilt keys", () => {
  const keys = buildShipKeys(VESSEL_REF);
  assert.equal(canonShipWith("MV AZAMARA QUEST", keys), "Quest");
  assert.equal(canonShipWith("Celebrity Edge", keys), "Edge");
});

test("validShipKeys covers VESSEL_REF hulls + Azamara, excludes junk", () => {
  const v = validShipKeys(VESSEL_REF);
  assert.ok(v.has("reflection"));
  assert.ok(v.has("symphony"));
  for (const k of AZAMARA_SHORT) assert.ok(v.has(k), `azamara ${k}`);
  assert.ok(!v.has("offlights")); // "# of flights:" junk
  assert.ok(!v.has(""));
});

// Regression guard for the dropped-history bug: every TDG (ours) schedule-history row must
// canonicalize to a REAL ship that can anchor a board section. If a future data refresh
// reintroduces a prefixed/typo'd/junk ship name, this fails loudly instead of silently hiding rows.
test("no ours schedule-history row canonicalizes to a non-board ship", () => {
  const keys = buildShipKeys(VESSEL_REF);
  const valid = validShipKeys(VESSEL_REF);
  const dropped = {};
  let ours = 0;
  for (const h of SHIP_HISTORY) {
    if (!h.ours) continue;
    ours++;
    const cs = canonShipWith(h.ship, keys);
    const k = cs ? normShip(cs) : "";
    if (!valid.has(k)) dropped[h.ship] = (dropped[h.ship] || 0) + 1;
  }
  assert.ok(ours > 0, "expected ours-history rows present");
  assert.deepEqual(dropped, {}, "history rows dropped for these raw ship names: " + JSON.stringify(dropped));
});

// ---- clientOf --------------------------------------------------------------------
// Moved out of worker.js 2026-09-09. The bug it fixes: the old version returned
// "Royal Caribbean" for EVERY unrecognised input, blank included, so the dashboard's
// client donut counted every crew with no vessel on file as an RCI crew. In production
// that was 20 of ~57 active crew drawn into the wrong slice.

test("clientOf: brand words win, in any casing or surrounding text", () => {
  assert.equal(clientOf("MV CELEBRITY REFLECTION"), "Celebrity");
  assert.equal(clientOf("Azamara Quest"), "Azamara");
  assert.equal(clientOf("Norwegian Getaway"), "NCL");
  assert.equal(clientOf("NCL Epic"), "NCL");
});

test("clientOf: a NAMED but unmatched hull is still Royal Caribbean", () => {
  // RCI hulls carry no brand word, so the catch-all is correct here and must not change.
  assert.equal(clientOf("Wonder of the Seas"), "Royal Caribbean");
  assert.equal(clientOf("Utopia"), "Royal Caribbean");
});

test("clientOf: NO vessel is Unassigned, never a brand", () => {
  // The whole point. A crew we have not placed is not an RCI crew.
  for (const blank of [null, undefined, "", "   ", "\t"]) {
    assert.equal(clientOf(blank), UNASSIGNED, JSON.stringify(blank) + " must not be counted as a brand");
  }
  assert.notEqual(clientOf(""), "Royal Caribbean");
});
