import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runSweep, checkSplitBrain, checkLegVesselResolves, checkBrandKeyDupes,
  checkOrphanCityRows, checkNameIntegrity, checkSoftCityT14, firstEnableT14, checkNclZeroLegs,
} from "../src/watcher.js";

const vessels = [
  { id: "v1", brand: "Royal Caribbean", ship_short: "Star" },
  { id: "v2", brand: "NCL", ship_short: "Star" },       // the collision that broke leg↔vessel joins
  { id: "v3", brand: "Royal Caribbean", ship_short: "Adventure" },
];

test("INV3 REGRESSION: a brand-less leg for 'Star' matches two hulls (fails); adding brand fixes it", () => {
  // Old behaviour: leg carried no brand -> ambiguous. We simulate by matching name only.
  const legNoBrand = { sc: "A", ship: "Star", brand: undefined };
  const ambiguous = vessels.filter((v) => v.ship_short === legNoBrand.ship).length;
  assert.equal(ambiguous, 2); // this is the bug the watcher caught

  // Fixed behaviour: leg is brand-qualified -> resolves to exactly one.
  const legWithBrand = { sc: "A", ship: "Star", brand: "Royal Caribbean" };
  assert.deepEqual(checkLegVesselResolves([legWithBrand], vessels), []);
  // and a brand-less leg is now REPORTED as a violation, not silently mis-joined
  assert.equal(checkLegVesselResolves([legNoBrand], vessels)[0].inv, "INV3");
});

test("INV1 split-brain: firm sign-off city must equal vessel_port_day", () => {
  const vpd = [{ ship_short: "Adventure", berth_date: "2026-11-29", stop_seq: 1, port_name: "FORT LAUDERDALE, FLORIDA" }];
  const ok = [{ sc: "A", ship: "Adventure", disembark: "FORT LAUDERDALE, FLORIDA", sign_off: "2026-11-29", off_conf: 1 }];
  const bad = [{ sc: "A", ship: "Adventure", disembark: "MIAMI, FLORIDA", sign_off: "2026-11-29", off_conf: 1 }];
  assert.deepEqual(checkSplitBrain(ok, vpd), []);
  assert.equal(checkSplitBrain(bad, vpd)[0].sev, "CRITICAL");
});

test("INV2 brand-key dupes only fire on same (brand, ship_short)", () => {
  assert.deepEqual(checkBrandKeyDupes(vessels), []); // Star RCCL vs Star NCL is allowed
  const dup = [...vessels, { id: "v4", brand: "NCL", ship_short: "Star" }];
  assert.equal(checkBrandKeyDupes(dup).length, 1);
});

test("INV4 orphan city rows", () => {
  const legs = [{ sc: "A" }];
  const cityRows = [{ sc: "A" }, { sc: "Z" }];
  assert.deepEqual(checkOrphanCityRows(legs, cityRows), [{ inv: "INV4", sev: "HIGH", sc: "Z" }]);
});

test("INV5 name integrity: km must be a real crew id", () => {
  const crew = new Set(["SC-0038360"]);
  const legs = [{ sc: "A", km: "SC-0038360" }, { sc: "B", km: "SC-9999999" }, { sc: "C", km: null }];
  const v = checkNameIntegrity(legs, crew);
  assert.equal(v.length, 1);
  assert.equal(v[0].km, "SC-9999999");
});

test("INV6 soft-city T-14 hold fires only when city is soft and due", () => {
  const today = "2026-07-06";
  const soonSoft = [{ sc: "A", ship: "Allure", proj_off: "2026-07-16", off_conf: 0 }]; // T-14 = 07-02, soft -> HOLD
  const soonFirm = [{ sc: "B", ship: "Jewel", proj_off: "2026-07-16", off_conf: 1 }];   // firm -> no hold
  assert.equal(checkSoftCityT14(soonSoft, today).length, 1);
  assert.deepEqual(checkSoftCityT14(soonFirm, today), []);
});

test("INV7 first-enable T-14 lists elapsed/imminent, sorted", () => {
  const today = "2026-07-06";
  const legs = [
    { sc: "A", ship: "Jewel", proj_off: "2026-07-20" },       // T-14 = 07-06 (today)
    { sc: "B", ship: "Independence", proj_off: "2026-07-16" },// T-14 = 07-02 (elapsed)
    { sc: "C", ship: "FarOff", proj_off: "2026-12-01" },      // not yet
  ];
  const l = firstEnableT14(legs, today);
  assert.equal(l.length, 2);
  assert.equal(l[0].ship, "Independence"); // earliest first
});

test("INV8 NCL carries zero legs", () => {
  assert.deepEqual(checkNclZeroLegs([{ sc: "A", ship: "Adventure", brand: "Royal Caribbean" }], vessels), []);
  assert.equal(checkNclZeroLegs([{ sc: "A", ship: "Star", brand: "NCL" }], vessels).length, 1);
});

test("runSweep is healthy on a clean 1-leg board", () => {
  const r = runSweep({
    legs: [{ sc: "A", km: "SC-1", ship: "Adventure", brand: "Royal Caribbean", proj_off: "2026-11-29", off_conf: 1 }],
    vessels,
    vpd: [{ ship_short: "Adventure", berth_date: "2026-11-29", stop_seq: 1, port_name: "FORT LAUDERDALE, FLORIDA" }],
    cityRows: [{ sc: "A", ship: "Adventure", disembark: "FORT LAUDERDALE, FLORIDA", sign_off: "2026-11-29", off_conf: 1 }],
    crewIds: new Set(["SC-1"]),
    today: "2026-07-06",
  });
  assert.equal(r.healthy, true);
  assert.equal(r.critical.length, 0);
});
