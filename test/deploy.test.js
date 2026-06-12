import { test } from "node:test";
import assert from "node:assert/strict";
import { shipRef, nextDryDock, docState, visaFit, crewDeployment } from "../src/deploy.js";

const REF = [
  { name: "Wonder", brand: "RCI", cls: "Oasis", homeport: "Miami", region: "Florida/Caribbean", lead: 50 },
  { name: "Infinity", brand: "CEL", cls: "Millennium", homeport: "Athens", region: "Mediterranean", lead: 90 },
  { name: "Spectrum", brand: "RCI", cls: "Quantum", homeport: "Shanghai", region: "Asia-Pacific", lead: 130 },
];
const DOCK = [
  { ship: "Wonder", start: "2027-01-20", end: "2027-01-25", loc: "Freeport", note: "" },
  { ship: "Infinity", start: "2028-01-18", end: "2028-02-23", loc: "Marseille", note: "" },
];

test("shipRef matches observed vessel name to the ref (longest contained)", () => {
  assert.equal(shipRef("Wonder of the Seas", REF).name, "Wonder");
  assert.equal(shipRef("Celebrity Infinity", REF).name, "Infinity");
  assert.equal(shipRef("Unknown Ship", REF), null);
});

test("docState flags by expiry", () => {
  assert.equal(docState(null, "2026-06-12"), "missing");
  assert.equal(docState("2025-01-01", "2026-06-12"), "expired");
  assert.equal(docState("2026-07-01", "2026-06-12"), "expiring");
  assert.equal(docState("2030-01-01", "2026-06-12"), "ok");
});

test("visaFit: US region needs US C1/D, Med needs Schengen, Asia has no single rule", () => {
  const crew = { usv_exp: "2030-01-01", sch_exp: null };
  assert.equal(visaFit(crew, "Florida/Caribbean", "2026-06-12").required, "US C1/D");
  assert.equal(visaFit(crew, "Florida/Caribbean", "2026-06-12").status, "ok");
  assert.equal(visaFit(crew, "Mediterranean", "2026-06-12").status, "missing"); // no schengen
  assert.equal(visaFit(crew, "Asia-Pacific", "2026-06-12"), null);
});

test("nextDryDock returns the soonest upcoming window for the ship", () => {
  assert.equal(nextDryDock("Wonder", DOCK, "2026-06-12").loc, "Freeport");
  assert.equal(nextDryDock("Wonder", DOCK, "2027-06-01"), null); // past
});

test("crewDeployment ties it together; unmatched vessel is reported", () => {
  const d = crewDeployment({ vessel_observed: "Wonder of the Seas", usv_exp: "2030-01-01" }, REF, DOCK, "2026-06-12");
  assert.equal(d.matched, true);
  assert.equal(d.region, "Florida/Caribbean");
  assert.equal(d.visa.required, "US C1/D");
  assert.equal(d.nextDryDock.loc, "Freeport");
  assert.equal(crewDeployment({ vessel_observed: "Mystery Boat" }, REF, DOCK, "2026-06-12").matched, false);
});
