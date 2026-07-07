import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCity, groupPortDays } from "../src/city_resolver.js";

const PD = [
  { berth_date: "2026-07-25", port_name: "Berlin (Warnemunde), Germany", is_sea: 0 },
  { berth_date: "2026-08-01", port_name: "Reykjavik, Iceland", is_sea: 0 },
  { berth_date: "2026-08-10", port_name: null, is_sea: 1 },
];

test("override always wins (spec §3.1)", () => {
  assert.deepEqual(resolveCity({ date: "2026-07-25", seed: "Seedville", override: "Real City", portDays: PD }), { city: "Real City", conf: "override" });
});
test("exact port-day hit -> derived", () => {
  assert.deepEqual(resolveCity({ date: "2026-07-25", seed: null, portDays: PD }), { city: "Berlin (Warnemunde), Germany", conf: "derived" });
});
test("+/-1 day of a port-day -> provisional", () => {
  const r = resolveCity({ date: "2026-07-26", seed: null, portDays: PD });
  assert.equal(r.conf, "provisional"); assert.equal(r.city, "Berlin (Warnemunde), Germany");
});
test("no date but seed present -> seed (§3.3)", () => {
  assert.deepEqual(resolveCity({ date: "", seed: "Port Louis", portDays: PD }), { city: "Port Louis", conf: "seed" });
});
test("no date, no seed -> TBA", () => {
  assert.deepEqual(resolveCity({ date: null, seed: null, portDays: PD }), { city: null, conf: "TBA" });
});
test("sea day -> seed if present, else TBA (§3.6)", () => {
  assert.deepEqual(resolveCity({ date: "2026-08-10", seed: "SeedPort", portDays: PD }), { city: "SeedPort", conf: "seed" });
  assert.deepEqual(resolveCity({ date: "2026-08-10", seed: null, portDays: PD }), { city: null, conf: "TBA" });
});
test("no coverage far from any port-day -> seed or TBA (§3.7)", () => {
  assert.deepEqual(resolveCity({ date: "2026-12-25", seed: "Xmas Port", portDays: PD }), { city: "Xmas Port", conf: "seed" });
  assert.deepEqual(resolveCity({ date: "2026-12-25", seed: null, portDays: PD }), { city: null, conf: "TBA" });
});
test("no deployment (NCL) -> TBA, never fabricate (invariant #6)", () => {
  assert.deepEqual(resolveCity({ date: "2026-07-25", seed: null, portDays: [], hasDeployment: false }), { city: null, conf: "TBA" });
});
test("no deployment but seed present -> seed", () => {
  assert.deepEqual(resolveCity({ date: "2026-07-25", seed: "Getaway Seed", portDays: [], hasDeployment: false }), { city: "Getaway Seed", conf: "seed" });
});
test("groupPortDays keys by brand|ship_short", () => {
  const g = groupPortDays([
    { brand: "Azamara", ship_short: "Journey", berth_date: "2026-07-25", port_name: "Berlin", is_sea: 0 },
    { brand: "Azamara", ship_short: "Journey", berth_date: "2026-08-01", port_name: "Reykjavik", is_sea: 0 },
    { brand: "Celebrity", ship_short: "Apex", berth_date: "2026-03-14", port_name: "Orlando", is_sea: 0 },
  ]);
  assert.equal(g["Azamara|Journey"].length, 2); assert.equal(g["Celebrity|Apex"].length, 1);
});
