// Identity matching on the import — CLAUDE.md §6 (data integrity is a first-class job).
//
// A seafarer carries TWO ids: our agency id ("SC-0040010") and the cruise line's numeric crew
// id ("349195"). Until 2026-09-11 the importer matched on agency_id alone, so a file row keyed
// on the cruise-line id looked brand new and was INSERTed as a second person.
//
// That is not a hypothetical. On 2026-09-06 it produced a duplicate "Ida Purnama / 349195" of
// "Ida Bagus Made Purnama / SC-0040010" — whose row already carried ship_crew_id = 349195. The
// duplicate split her from her contract, her two ship legs and her baseline_count of 3, so
// scoring her under the new id would have started her bonus ladder at zero.
//
// The rule these tests pin: MATCH her, never insert; and never rewrite agency_id — raise a flag
// a human resolves at the source export (D7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffCrew, buildIdentityIndex, resolveExisting, normKm, mapRow } from "../src/crewimport.js";
import { buildReview } from "../src/crew_review.js";
import { buildApplyPlan } from "../src/crew_apply.js";

// The real pair, as the rows actually stood in production.
const IDA_EXISTING = {
  agency_id: "SC-0040010", ship_crew_id: "349195",
  first_name: "Ida Bagus Made", middle_name: "Nmn", last_name: "Purnama",
  status: "On board", rank_observed: "Printer Specialist", vessel_observed: "MV CELEBRITY XCEL",
};
const IDA_INCOMING = {
  agency_id: "349195", ship_crew_id: null,
  first_name: "Ida Bagus Made", middle_name: null, last_name: "Purnama",
  status: "On board", rank_observed: "Printer Specialist", vessel_observed: "Celebrity Xcel",
};

test("normKm takes a bare cruise-line id and refuses an agency id", () => {
  assert.equal(normKm("349195"), "349195");
  assert.equal(normKm("349195.0"), "349195");   // spreadsheets float-ify ids
  assert.equal(normKm(" 349195 "), "349195");
  assert.equal(normKm(349195), "349195");
  assert.equal(normKm("SC-0040010"), null);     // an agency id must never match as a crew id
  assert.equal(normKm("123"), null);            // too short to be one
  assert.equal(normKm(""), null);
  assert.equal(normKm(null), null);
});

test("the mapped row carries ship_crew_id when the export has that column", () => {
  const m = mapRow({ "CREW ID": "SC-0040010", "SHIP CREW ID": "349195", "FIRST NAME": "Ida", "LAST NAME": "Purnama", STATUS: "On board" });
  assert.equal(m.agency_id, "SC-0040010");
  assert.equal(m.ship_crew_id, "349195");
});

test("ship_crew_id is NOT a tracked field — identity never shows up as a field change", () => {
  const existing = { "SC-0040010": { ...IDA_EXISTING } };
  const incoming = [{ ...IDA_EXISTING, ship_crew_id: "999999" }];   // identity differs, nothing else
  const d = diffCrew(incoming, existing);
  assert.deepEqual(d.change, [], "a changed ship_crew_id must not be diffed as a field edit");
  assert.equal(d.unchanged, 1);
});

test("a row keyed on the cruise-line id is MATCHED, not added (the Ida case)", () => {
  const existing = { "SC-0040010": { ...IDA_EXISTING } };
  const d = diffCrew([{ ...IDA_INCOMING }], existing);

  assert.deepEqual(d.add, [], "matching on agency_id alone put 349195 here and inserted a second seafarer");
  assert.equal(d.rekeyed.length, 1);
  assert.deepEqual(d.rekeyed[0], { agency_id: "SC-0040010", incoming_id: "349195", ship_crew_id: "349195" });
  // The change is keyed on the id we already hold, never the id the file used.
  assert.equal(d.change.length, 1);
  assert.equal(d.change[0].agency_id, "SC-0040010");
  assert.equal(d.change[0].incoming_id, "349195");
  // middle_name is blank in the file, so it is correctly NOT a change ("don't clobber").
  // The real difference is the vessel spelling, and it lands on the existing id.
  assert.ok(d.change[0].changed.includes("vessel_observed"));
  assert.ok(!d.change[0].changed.includes("middle_name"));
});

test("a genuinely new crew is still added — the fallback does not swallow real arrivals", () => {
  const existing = { "SC-0040010": { ...IDA_EXISTING } };
  const d = diffCrew([{ agency_id: "SC-0099999", status: "Earmarked", first_name: "New", last_name: "Joiner" }], existing);
  assert.deepEqual(d.add, ["SC-0099999"]);
  assert.deepEqual(d.rekeyed, []);
});

test("a direct agency_id hit never reports a rekey", () => {
  const existing = { "SC-0040010": { ...IDA_EXISTING } };
  const d = diffCrew([{ ...IDA_EXISTING, status: "On Vacation" }], existing);
  assert.deepEqual(d.rekeyed, []);
  assert.equal(d.change.length, 1);
  assert.equal(d.change[0].agency_id, "SC-0040010");
  assert.equal(d.change[0].incoming_id, undefined, "no incoming_id when the ids agree");
});

test("diffCrew still accepts the legacy agency_id -> row map", () => {
  const idx = buildIdentityIndex([IDA_EXISTING]);
  const viaIndex = diffCrew([{ ...IDA_INCOMING }], idx);
  const viaMap = diffCrew([{ ...IDA_INCOMING }], { "SC-0040010": IDA_EXISTING });
  assert.deepEqual(viaIndex.rekeyed, viaMap.rekeyed);
});

test("resolveExisting reports HOW it matched, so the flag is evidence not a guess", () => {
  const idx = buildIdentityIndex([IDA_EXISTING]);
  assert.equal(resolveExisting({ agency_id: "SC-0040010" }, idx).via, "agency_id");
  assert.equal(resolveExisting({ agency_id: "349195" }, idx).via, "ship_crew_id");
  assert.equal(resolveExisting({ agency_id: "SC-0099999" }, idx).via, null);
});

test("the review files it under identity, not under new crew", () => {
  const existing = { "SC-0040010": { ...IDA_EXISTING } };
  const incomingByAgency = { "349195": { ...IDA_INCOMING } };
  const d = diffCrew([{ ...IDA_INCOMING }], existing);
  const r = buildReview(d, existing, incomingByAgency, {});

  assert.equal(r.groups.rekeyed.length, 1);
  assert.deepEqual(r.groups.new, [], "a matched crew must never be offered as a new add");
  assert.ok(r.attention >= 1, "an identity collision has to demand a human");
});

test("the matched crew is NOT reported as departed just because the file used another id", () => {
  const existing = { "SC-0040010": { ...IDA_EXISTING } };
  const incomingByAgency = { "349195": { ...IDA_INCOMING } };
  const d = diffCrew([{ ...IDA_INCOMING }], existing);
  const r = buildReview(d, existing, incomingByAgency, {});
  assert.deepEqual(r.groups.departed, [], "she is in the file, just under the cruise-line id");
});

test("applying raises an OPEN identity flag and writes nothing to the crew row (D7)", () => {
  const existing = { "SC-0040010": { ...IDA_EXISTING } };
  const incomingByAgency = { "349195": { ...IDA_INCOMING } };
  const d = diffCrew([{ ...IDA_INCOMING }], existing);
  const r = buildReview(d, existing, incomingByAgency, {});
  const plan = buildApplyPlan(r, {}, {});

  const ident = (plan.conflicts || []).filter(c => c.field === "identity");
  assert.equal(ident.length, 1, "the collision must reach sync_conflict");
  assert.equal(ident[0].agency_id, "SC-0040010");
  assert.equal(ident[0].resolved, 0, "an identity collision stays OPEN until the export is fixed");
  assert.match(String(ident[0].new_value), /349195/);

  assert.deepEqual(plan.newCrew, [], "never insert the duplicate");
  for (const u of plan.crewUpdates || []) {
    assert.notEqual(u.field, "agency_id", "agency_id is the roster's stable key — never rewritten by an import");
    assert.equal(u.agency_id, "SC-0040010", "writes land on the crew we already hold");
  }
});

// Regression: the legacy caller shape. Some callers pass { "SC-1": { first_name, ... } } where
// the row object does NOT repeat agency_id — the map key is the id. Reading the id off the row
// made every such crew look brand new, which would have turned an ordinary import into a
// wholesale re-add of the roster. Caught by test/crewimport.test.js on the first attempt.
test("the map key is authoritative when the row does not repeat agency_id", () => {
  const existing = { "SC-1": { first_name: "Ana", status: "On board" } };   // no agency_id inside
  const d = diffCrew([{ agency_id: "SC-1", first_name: "Ana", status: "On Vacation" }], existing);
  assert.deepEqual(d.add, [], "an existing crew must not be re-added because the row omits its own id");
  assert.equal(d.change.length, 1);
  assert.equal(d.change[0].agency_id, "SC-1");
});
