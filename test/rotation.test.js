import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRotationBoard } from "../src/rotation.js";

const rows = [
  { agency_id: "1", first_name: "Ana", last_name: "Cruz", status: "On board", vessel_observed: "Wonder", rank_observed: "Printer Specialist" },
  { agency_id: "2", first_name: "Ben", last_name: "Diaz", status: "On board", vessel_observed: "Wonder" },
  { agency_id: "3", first_name: "Cy", last_name: "Ere", status: "On Vacation", vessel_observed: "Allure" },
  { agency_id: "4", first_name: "Di", last_name: "Fox", status: "Earmarked", vessel_observed: "" },
];

test("groups by status with stable order and counts", () => {
  const b = buildRotationBoard(rows);
  assert.equal(b.counts["On board"], 2);
  assert.equal(b.counts["On Vacation"], 1);
  assert.equal(b.counts["Earmarked"], 1);
  assert.equal(b.counts.total, 4);
});

test("groups by vessel; blank vessel becomes em-dash and is excluded from vessel count", () => {
  const b = buildRotationBoard(rows);
  assert.equal(b.byVessel["Wonder"].length, 2);
  assert.equal(b.byVessel["Allure"].length, 1);
  assert.equal(b.byVessel["—"].length, 1);
  assert.equal(b.counts.vessels, 2); // Wonder + Allure, not the em-dash
});

test("rank falls back override -> observed -> null", () => {
  const b = buildRotationBoard([
    { agency_id: "x", first_name: "L", last_name: "M", status: "On board", vessel_observed: "V", rank_override: "Lead", rank_observed: "Junior" },
    { agency_id: "y", first_name: "N", last_name: "O", status: "On board", vessel_observed: "V" },
  ]);
  assert.equal(b.byVessel["V"][0].rank, "Lead");
  assert.equal(b.byVessel["V"][1].rank, null);
});

test("unknown status lands in 'other', not lost", () => {
  const b = buildRotationBoard([{ agency_id: "z", first_name: "P", last_name: "Q", status: "Weird", vessel_observed: "V" }]);
  assert.equal(b.other.length, 1);
  assert.equal(b.counts.other, 1);
});

test("empty input is safe", () => {
  const b = buildRotationBoard([]);
  assert.equal(b.counts.total, 0);
  assert.equal(b.counts.vessels, 0);
});
