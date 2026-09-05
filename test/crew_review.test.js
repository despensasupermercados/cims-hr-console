import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRows, diffCrew } from "../src/crewimport.js";
import { buildReview, classifyField, liveOverrideFields, TIER } from "../src/crew_review.js";

// --- shared fixture -------------------------------------------------------
const existing = {
  "SC-1": { agency_id: "SC-1", first_name: "Jomar", last_name: "Dela Cruz",
    status: "On board", vessel_observed: "Celebrity Edge", med_exp: "2026-03-19",
    pp_exp: "2030-01-01", phone: "+63900000000", province: "Cavite" },
  "SC-2": { agency_id: "SC-2", first_name: "Maria", last_name: "Murillo",
    status: "On board", vessel_observed: "Icon of the Seas", med_exp: "2026-09-01" },
  "SC-3": { agency_id: "SC-3", first_name: "Kevin", last_name: "Tibay",
    status: "On board", vessel_observed: "Adventure of the Seas" },
};

const rawRows = [
  { "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board",
    "VESSEL NAME": "Celebrity Apex", "MEDICAL EXPIRATION DATE": "2028-03-19",
    "MOBILE NO.": "09171112222", "PROVINCE": "Cavite" },
  { "CREW ID": "SC-2", "FIRST NAME": "Maria", "LAST NAME": "Murillo", "CREW STATUS": "On board",
    "VESSEL NAME": "Icon of the Seas", "MEDICAL EXPIRATION DATE": "2026-07-20" },
  { "CREW ID": "SC-9", "FIRST NAME": "New", "LAST NAME": "Guy", "CREW STATUS": "Earmarked",
    "VESSEL NAME": "Wonder of the Seas" },
];

const overrides = {
  "SC-1": { agency_id: "SC-1", phone: "+63999999999", retired: 0 },
};

function review() {
  const { mapped } = mapRows(rawRows);
  const incomingByAgency = Object.fromEntries(mapped.map(m => [m.agency_id, m]));
  const diff = diffCrew(mapped, existing);
  return buildReview(diff, existing, incomingByAgency, overrides);
}

test("D1 vessel_observed change is a ship_flag and is never written", () => {
  const c = classifyField("vessel_observed", "Celebrity Edge", "Celebrity Apex", new Set());
  assert.equal(c.tier, TIER.SHIP);
  assert.equal(c.write, false);
  const r = review();
  const ship = r.groups.ship_flag.find(x => x.agency_id === "SC-1");
  assert.ok(ship, "SC-1 ship change present in ship_flag group");
  assert.equal(ship.write, false);
  assert.equal(r.groups.cert.some(x => x.field === "vessel_observed"), false);
});

test("D2 cert renewal (later) defaults accept, not flagged earlier", () => {
  const c = classifyField("med_exp", "2026-03-19", "2028-03-19", new Set());
  assert.equal(c.tier, TIER.CERT);
  assert.equal(c.defaultAccept, true);
  assert.equal(c.earlier, false);
});

test("D2 medical expiry moving EARLIER is flagged", () => {
  const c = classifyField("med_exp", "2026-09-01", "2026-07-20", new Set());
  assert.equal(c.tier, TIER.CERT);
  assert.equal(c.earlier, true);
  const r = review();
  const m = r.groups.cert.find(x => x.agency_id === "SC-2" && x.field === "med_exp");
  assert.ok(m && m.earlier, "SC-2 earlier medical is flagged");
});

// The file's "rank" is crew.rank_observed; Rita's manual rank is crew_override.rank_override. They
// are the same field with two names — a rank change under a live manual rank must be a D3 conflict
// (it used to slip through the CERT tier and be accepted silently, invisible behind the override).
test("rank_observed under a live rank_override is an override_conflict, naming the override column", () => {
  const ex = { "SC-7": { agency_id: "SC-7", first_name: "Ana", last_name: "Cruz", status: "On board", rank_observed: "Cook" } };
  const rows = [{ "CREW ID": "SC-7", "FIRST NAME": "Ana", "LAST NAME": "Cruz", "CREW STATUS": "On board", "RANK": "Sous Chef" }];
  const { mapped } = mapRows(rows);
  const inc = Object.fromEntries(mapped.map(m => [m.agency_id, m]));
  const ov = { "SC-7": { agency_id: "SC-7", rank_override: "Chef de Partie", retired: 0 } };
  const r = buildReview(diffCrew(mapped, ex), ex, inc, ov);
  const it = r.groups.override_conflict.find(x => x.agency_id === "SC-7" && x.field === "rank_observed");
  assert.ok(it, "rank change under a manual rank must land in the override tier");
  assert.equal(it.override_field, "rank_override");
  assert.equal(it.old, "Chef de Partie", "the card shows the manual rank as the value being replaced");
  assert.equal(it.new, "Sous Chef");
  assert.equal(r.groups.cert.some(x => x.field === "rank_observed"), false, "and NOT silently in the accept-by-default tier");
  // base already equals the file, override still differs -> still raised (second pass)
  const ex2 = { "SC-7": { ...ex["SC-7"], rank_observed: "Sous Chef" } };
  const r2 = buildReview(diffCrew(mapped, ex2), ex2, inc, ov);
  assert.ok(r2.groups.override_conflict.some(x => x.field === "rank_observed" && x.override_field === "rank_override"));
});

test("D3 change to a field with a live override is an override_conflict, default keep", () => {
  const live = liveOverrideFields(overrides["SC-1"]);
  assert.ok(live.has("phone"));
  const c = classifyField("phone", "+63900000000", "+63917...", live);
  assert.equal(c.tier, TIER.OVERRIDE);
  assert.equal(c.defaultKeep, true);
  const r = review();
  assert.ok(r.groups.override_conflict.some(x => x.agency_id === "SC-1" && x.field === "phone"));
});

test("retired override does not protect a field", () => {
  const live = liveOverrideFields({ phone: "+63x", retired: 1 });
  assert.equal(live.has("phone"), false);
});

test("D4 crew absent from file is flagged departed", () => {
  const r = review();
  assert.ok(r.groups.departed.some(x => x.agency_id === "SC-3"));
});

test("new crew surfaces in the new group", () => {
  const r = review();
  assert.ok(r.groups.new.some(x => x.agency_id === "SC-9"));
});

test("attention counts ship + override + earlier-expiry", () => {
  const r = review();
  assert.equal(r.attention, 3);
});
