import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMonthSheet, parseTravelSheets, summarize, travelNameKey, monthNum } from "../src/travel.js";

// Two crew sections: ON (name col 8) and OFF (name col 15), each name + 6 categories.
const r0 = ["2024-09-25", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANSPORT", "", "CREW 1 / ON", "", "", "", "", "", "", "CREW 2 / OFF"];
const r1 = ["", "", "", "", "", "", "", "", "Crew", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANS", "Crew", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANS"];
const r2 = ["Adventure", 0, 0, 0, 0, 0, 0, "", "Macay, Jamicah", 754.91, 0, 130, 192.21, 30, 0, "Espenilla, Zandro", 895, 0, 0, 0, 0, 0];
const r3 = ["Allure", 0, 0, 0, 0, 0, 0, "", "", "", "", "", "", "", "", "Osorio, Norman", 868.1, 0, 0, 0, 0, 0];

test("monthNum maps month sheet names", () => {
  assert.equal(monthNum("SEPT"), 9);
  assert.equal(monthNum("april"), 4);
  assert.equal(monthNum("SUMMARY"), null);
});

test("parseMonthSheet extracts crew-leg records, ignores the ship column, uses passed year", () => {
  const recs = parseMonthSheet("SEPT", [r0, r1, r2, r3], 2025);
  assert.equal(recs.length, 3); // Macay(on), Espenilla(off), Osorio(off)
  const macay = recs.find(r => r.crew_name.startsWith("Macay"));
  assert.equal(macay.year, 2025); // from arg, NOT the 2024 cell
  assert.equal(macay.leg, "on");
  assert.equal(macay.air, 754.91);
  assert.equal(macay.medical, 130);
  assert.equal(macay.total, Math.round((754.91 + 130 + 192.21 + 30) * 100) / 100);
  assert.equal(recs.find(r => r.crew_name.startsWith("Espenilla")).leg, "off");
});

test("parseMonthSheet drops zero-spend name rows and non-month sheets", () => {
  const zero = ["Ship", 0, 0, 0, 0, 0, 0, "", "Nobody, Zero", 0, 0, 0, 0, 0, 0];
  assert.equal(parseMonthSheet("JAN", [r0, r1, zero], 2025).length, 0);
  assert.equal(parseMonthSheet("SUMMARY", [r0, r1, r2], 2025).length, 0);
});

test("parseTravelSheets only reads month sheets (SUMMARY skipped)", () => {
  // r2 alone yields 2 records (Macay on + Espenilla off); SUMMARY must contribute 0.
  const recs = parseTravelSheets({ SUMMARY: [r0, r1, r2], SEPT: [r0, r1, r2] }, 2025);
  assert.equal(recs.length, 2);
});

test("summarize rolls up totals by leg / category", () => {
  const s = summarize(parseMonthSheet("SEPT", [r0, r1, r2, r3], 2025));
  assert.equal(s.crew, 3);
  assert.ok(s.total > 0);
  assert.ok(s.byLeg.off > 0 && s.byLeg.on > 0);
  assert.equal(Math.round(s.byCat.air * 100) / 100, Math.round((754.91 + 895 + 868.1) * 100) / 100);
});

test("travelNameKey normalizes 'Last, First' to 'first last'", () => {
  assert.equal(travelNameKey("Macay, Jamicah"), "jamicah macay");
  assert.equal(travelNameKey("Espenilla, Zandro (Orlando)"), "zandro orlando espenilla");
});
