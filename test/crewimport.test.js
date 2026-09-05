import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate, normalizeStatus, mapRow, mapRows, diffCrew, looksDMY } from "../src/crewimport.js";

test("normalizeDate handles ISO, US, Excel serial, junk", () => {
  assert.equal(normalizeDate("2027-01-31"), "2027-01-31");
  assert.equal(normalizeDate("1/31/2027"), "2027-01-31");
  assert.equal(normalizeDate(45000), "2023-03-15"); // excel serial
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate("n/a"), null);
});

// 2026-09-04 (Rita, 25 Aug): the non-PHL rows she pastes into the AdvancedQuery file carry
// D/M/YYYY. The parser assumed US and stored "2034-23-09" — an impossible date — which the
// console then reported as a MISSING document. A first field > 12 can only be a day.
test("normalizeDate: D/M/YYYY when the first field cannot be a month; never stores an impossible date", () => {
  assert.equal(normalizeDate("23/09/2034"), "2034-09-23");   // Joseph's passport expiry, as pasted
  assert.equal(normalizeDate("23-09-2034"), "2034-09-23");
  assert.equal(normalizeDate("9/23/2034"), "2034-09-23");    // the same date in the roster's US form
  assert.equal(normalizeDate("1/31/2027"), "2027-01-31");    // US stays US
  assert.equal(normalizeDate("3/4/2026"), "2026-03-04");     // both <= 12: ambiguous, stays US by rule
  assert.equal(normalizeDate("13/13/2030"), null);           // no reading makes this a date
  assert.equal(normalizeDate("2/30/2027"), null);            // rolls over in JS; must not be stored
  assert.equal(normalizeDate("23 Sep 2034"), "2034-09-23");  // text form still parses
  assert.equal(normalizeDate("23/09/2034 0:00"), "2034-09-23"); // xlsx->csv time suffix
  assert.equal(normalizeDate("2034-23-09"), null);           // an already-stored bad value must not round-trip
  assert.equal(normalizeDate("2027-02-30"), null);
  assert.equal(normalizeDate("5/3/2027", { dmy: true }), "2027-03-05"); // row known day-first
});

// Date order is decided per ROW: one cell with a day > 12 proves the whole pasted row is day-first,
// so its ambiguous siblings are read the same way instead of silently becoming a wrong US date.
test("mapRow: a day-first cell makes the whole row day-first; a US-only row stays US", () => {
  const dmyRow = mapRow({ "CREW ID": "358775", "Passport Exp": "23/09/2034", "Medical Expiration Date": "05/03/2027" });
  assert.equal(dmyRow.pp_exp, "2034-09-23");
  assert.equal(dmyRow.med_exp, "2027-03-05");   // 5 March, not 3 May
  const usRow = mapRow({ "CREW ID": "SC-1", "Passport Exp": "9/23/2034", "Medical Expiration Date": "5/3/2027" });
  assert.equal(usRow.pp_exp, "2034-09-23");
  assert.equal(usRow.med_exp, "2027-05-03");    // roster format
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

test("diffCrew classifies add / change / unchanged and blanks don't clobber", () => {
  const existing = {
    "SC-1": { first_name: "Ana", status: "On board", vessel_observed: "Wonder", med_exp: "2027-01-31" },
    "SC-2": { first_name: "Ben", status: "On Vacation", vessel_observed: "Allure", med_exp: "2026-01-01" },
  };
  const incoming = [
    { agency_id: "SC-1", first_name: "Ana", status: "On board", vessel_observed: "Wonder", med_exp: "2027-01-31" }, // unchanged
    { agency_id: "SC-2", first_name: "Ben", status: "Earmarked", vessel_observed: "Allure", med_exp: null },        // status change; null med ignored
    { agency_id: "SC-3", first_name: "Cy", status: "On board" },                                                    // add
    { agency_id: "SC-4", first_name: "Di", status: null },                                                          // new but no status -> needsStatus
  ];
  const d = diffCrew(incoming, existing);
  assert.deepEqual(d.add, ["SC-3"]);
  assert.equal(d.unchanged, 1);
  assert.equal(d.change.length, 1);
  assert.equal(d.change[0].agency_id, "SC-2");
  assert.deepEqual(d.change[0].changed, ["status"]);
  assert.deepEqual(d.needsStatus, ["SC-4"]);
});
