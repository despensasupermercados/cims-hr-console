import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRow } from "../src/crewimport.js";

// Regression guard: the real TDG "AdvancedQuery" layout puts "<DOC> NO", "<DOC> ISSUE",
// "<DOC> EXPIRATION", "<DOC> PLACE" side by side. A loose substring match ("medical",
// "passport", …) grabs the NO column (first) and imports null for every expiry. mapRow must
// target the EXPIRATION column specifically. Headers below are copied verbatim from the file,
// including the embedded newlines in the SIRB/PASSPORT headers.
const REAL_ROW = {
  "CREW ID": "SC-0038865", "LAST NAME": "Abutin", "FIRST NAME": "James", "MIDDLE NAME": "G",
  "CREW STATUS": "Inactive", "RANK": "Printer Specialist", "VESSEL NAME": "MV MARINER OF THE SEAS",
  "BIRTHDAY": "17 Oct 1997", "AGE": 27, "PROVINCE": "Cavite",
  "MOBILE NO.": "09676423969", "EMAIL ADDRESS": "a@b.com",
  "MEDICAL CERTIFICATE NO": "", "MEDICAL ISSUED DATE": "31 Jul 2024",
  "MEDICAL EXPIRATION DATE": "30 Jul 2026", "MEDICAL PLACE ISSUED": "Health Metrics",
  "SIRB NO.": "A0311647", "SIRB DATE OF ISSUE": "22 Mar 2024",
  "SIRB \nEXPIRATION DATE": "22 Mar 2034", "SIRB PLACE OF ISSUE": "MANILA",
  "PASSPORT NO.": "P5937592C", "PASSPORT DATE OF ISSUE": "14 Nov 2023",
  "PASSPORT\nEXPIRATION DATE": "13 Nov 2033", "PASSPORT PLACE OF ISSUE": "DFA MANILA",
  "SCHENGEN VISA NO": "", "SCHENGEN VISA ISSUE": "", "SCHENGEN VISA EXPIRATION": "", "SCHENGEN VISA PLACE": "",
  "US VISA NO.": "U7161286", "US VISA DATE OF ISSUE": "30 Jul 2024",
  "US VISA EXPIRATION DATE": "25 Jul 2034", "US VISA PLACE OF ISSUE": "US Embassy Manila",
};

test("mapRow reads EXPIRATION columns, not the NO columns", () => {
  const m = mapRow(REAL_ROW);
  assert.equal(m.med_exp, "2026-07-30", "medical expiry");
  assert.equal(m.sirb_exp, "2034-03-22", "sirb expiry");
  assert.equal(m.pp_exp, "2033-11-13", "passport expiry");
  assert.equal(m.usv_exp, "2034-07-25", "us visa expiry");
});

test("a blank expiry stays null (never a spurious value from the NO column)", () => {
  const m = mapRow(REAL_ROW);
  assert.equal(m.sch_exp, null, "blank schengen expiry is null");
});

test("identity/status still map correctly alongside the expiry fix", () => {
  const m = mapRow(REAL_ROW);
  assert.equal(m.agency_id, "SC-0038865");
  assert.equal(m.status, "Inactive");
  assert.equal(m.last_name, "Abutin");
});
