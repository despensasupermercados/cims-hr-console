import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate, normalizeStatus, mapRow, mapRows, diffCrew,
         buildIdentityIndex, resolveExisting, isSaneDocDate, normKm } from "../src/crewimport.js";

test("normalizeDate handles ISO, US, Excel serial, junk", () => {
  assert.equal(normalizeDate("2027-01-31"), "2027-01-31");
  assert.equal(normalizeDate("1/31/2027"), "2027-01-31");
  assert.equal(normalizeDate(45000), "2023-03-15"); // excel serial
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate("n/a"), null);
});

test("REGRESSION: two-digit year pivots to 2000s, not 1934", () => {
  // The 2026-08-24 radar led with "Ida Purnama, PP lapsed 22 Sep 1934" because
  // new Date("9/22/34") resolves to 1934. A 2034 passport must stay in 2034.
  assert.equal(normalizeDate("9/22/34"), "2034-09-22");
  assert.equal(normalizeDate("09/22/34"), "2034-09-22");
  assert.equal(normalizeDate("9-22-34"), "2034-09-22");
  assert.equal(normalizeDate("1/1/69"), "2069-01-01");  // pivot boundary, below
  assert.equal(normalizeDate("1/1/70"), "1970-01-01");  // pivot boundary, at
  assert.equal(normalizeDate("6/23/26"), "2026-06-23");
});

test("isSaneDocDate rejects parse artifacts; mapRow drops them rather than alarming", () => {
  assert.equal(isSaneDocDate("2034-09-22"), true);
  assert.equal(isSaneDocDate("1934-09-22"), false);
  assert.equal(isSaneDocDate("0201-05-01"), false);
  assert.equal(isSaneDocDate(null), false);
  const m = mapRow({ "CREW ID": "SC-1", "Status": "On board", "Passport Expiration": "1934-09-22" });
  assert.equal(m.pp_exp, null, "an impossible expiry becomes MISSING, never 'expired 90 years ago'");
});

test("normalizeStatus maps tolerant variants to the D1 enum", () => {
  assert.equal(normalizeStatus("On Board"), "On board");
  assert.equal(normalizeStatus("ONVACATION"), "On Vacation");
  assert.equal(normalizeStatus("earmarked"), "Earmarked");
  assert.equal(normalizeStatus("Inactive"), "Inactive");
  assert.equal(normalizeStatus("weird"), null);
});

test("mapRow tolerant header matching + requires agency_id", () => {
  const row = {
    "CREW ID": "SC-0038391", "Last Name": "Cruz", "First Name": "Ana",
    "STATUS": "On board", "Vessel Name": "Wonder",
    "Medical Expiration Date": "2027-01-31", "US Visa Exp": "1/15/2030", "Passport Exp": "2029-05-15",
  };
  const m = mapRow(row);
  assert.equal(m.agency_id, "SC-0038391");
  assert.equal(m.last_name, "Cruz");
  assert.equal(m.status, "On board");
  assert.equal(m.vessel_observed, "Wonder");
  assert.equal(m.med_exp, "2027-01-31");
  assert.equal(m.usv_exp, "2030-01-15");
  assert.equal(m.pp_exp, "2029-05-15");
  assert.equal(mapRow({ "Name": "no id here" }), null);
});

test("mapRows separates valid from invalid", () => {
  const r = mapRows([{ "Crew ID": "SC-1", "Status": "On board" }, { "x": 1 }]);
  assert.equal(r.mapped.length, 1);
  assert.equal(r.invalidCount, 1);
});

test("normKm normalises the spreadsheet .0 artifact and rejects SC ids", () => {
  assert.equal(normKm("349195"), "349195");
  assert.equal(normKm("349195.0"), "349195");
  assert.equal(normKm("SC-0040010"), null);
  assert.equal(normKm(null), null);
});

test("diffCrew classifies add / change / unchanged and blanks don't clobber", () => {
  const existing = {
    "SC-1": { agency_id: "SC-1", first_name: "Ana", status: "On board", vessel_observed: "Wonder", med_exp: "2027-01-31" },
    "SC-2": { agency_id: "SC-2", first_name: "Ben", status: "On Vacation", vessel_observed: "Allure", med_exp: "2026-01-01" },
  };
  const incoming = [
    { agency_id: "SC-1", first_name: "Ana", status: "On board", vessel_observed: "Wonder", med_exp: "2027-01-31" },
    { agency_id: "SC-2", first_name: "Ben", status: "Earmarked", vessel_observed: "Allure", med_exp: null },
    { agency_id: "SC-3", first_name: "Cy", status: "On board" },
    { agency_id: "SC-4", first_name: "Di", status: null },
  ];
  const d = diffCrew(incoming, existing);
  assert.deepEqual(d.add, ["SC-3"]);
  assert.equal(d.unchanged, 1);
  assert.equal(d.change.length, 1);
  assert.equal(d.change[0].agency_id, "SC-2");
  assert.deepEqual(d.change[0].changed, ["status"]);
  assert.deepEqual(d.needsStatus, ["SC-4"]);
});

test("REGRESSION: a row keyed on the cruise-line id matches, it does not duplicate", () => {
  // Reproduces the 2026-08-14 import that created a second Purnama.
  const existing = {
    "SC-0040010": { agency_id: "SC-0040010", ship_crew_id: "349195",
      first_name: "Ida Bagus Made", last_name: "Purnama", status: "Earmarked", pp_exp: "2034-09-23" },
  };
  const incoming = [{ agency_id: "349195", first_name: "Ida", last_name: "Purnama", status: "On board" }];
  const d = diffCrew(incoming, existing);
  assert.deepEqual(d.add, [], "must NOT be treated as a new crew member");
  assert.equal(d.rekeyed.length, 1);
  assert.equal(d.rekeyed[0].agency_id, "SC-0040010");
  assert.equal(d.rekeyed[0].incoming_id, "349195");
  assert.equal(d.change[0].agency_id, "SC-0040010", "change keyed on the STABLE agency id");
  assert.equal(d.change[0].incoming_id, "349195");
  assert.ok(d.change[0].changed.includes("status"));
});

test("ship_crew_id match also works from a dedicated column, with .0 artifact", () => {
  const idx = buildIdentityIndex([{ agency_id: "SC-9", ship_crew_id: "358775" }]);
  const r = resolveExisting({ agency_id: "SOMETHING-NEW", ship_crew_id: "358775.0" }, idx);
  assert.equal(r.via, "ship_crew_id");
  assert.equal(r.row.agency_id, "SC-9");
});

test("agency_id always wins over the cruise-line id", () => {
  const idx = buildIdentityIndex([
    { agency_id: "SC-A", ship_crew_id: "111111" },
    { agency_id: "SC-B", ship_crew_id: "222222" },
  ]);
  const r = resolveExisting({ agency_id: "SC-B", ship_crew_id: "111111" }, idx);
  assert.equal(r.via, "agency_id");
  assert.equal(r.row.agency_id, "SC-B");
});

test("diffCrew still accepts the legacy agency_id->row map", () => {
  const d = diffCrew([{ agency_id: "SC-1", status: "Inactive" }],
    { "SC-1": { agency_id: "SC-1", status: "On board" } });
  assert.equal(d.change.length, 1);
});
