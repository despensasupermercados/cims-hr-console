import { test } from "node:test";
import assert from "node:assert/strict";
import { Pdf } from "../src/pdf.js";
import { composeStatement, docStatus } from "../src/statement.js";

test("Pdf builds a structurally valid PDF", () => {
  const pdf = new Pdf();
  pdf.text("Hello", { size: 12, bold: true });
  pdf.rule();
  pdf.row(["a", "b"], [0, 100]);
  const bytes = pdf.build();
  const s = Buffer.from(bytes).toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.includes("/Type /Catalog"));
  assert.ok(s.includes("startxref"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
});

test("docStatus flags expired / expiring / ok", () => {
  assert.match(docStatus("2024-01-01", "2026-06-12").txt, /EXPIRED/);
  assert.match(docStatus("2026-07-01", "2026-06-12").txt, /<90d/);
  assert.equal(docStatus("2030-01-01", "2026-06-12").txt, "2030-01-01");
  assert.equal(docStatus("", "2026-06-12").txt, "-");
});

test("composeStatement returns a PDF and stays ASCII-safe (no '?' substitution for em-dashes)", () => {
  const bytes = composeStatement({
    crew: { agency_id: "SC-1", first_name: "Ana", last_name: "Cruz", status: "On board", vessel_observed: "Wonder", med_exp: "2027-01-31" },
    contracts: [{ seq: 1, ship: "Allure", on: "2023-01-10", proj: "2023-09-10", act: "2023-09-12" }],
    bonus: { rank: "Printer Specialist", count: 3, baseline_set: true, nextRungIfClean: 750, outcomes: [] },
    daysWorked: 520, generatedAt: "2026-06-12",
  });
  const s = Buffer.from(bytes).toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(bytes.length > 1500);
  // The title separator should be a hyphen, not a '?' from a dropped em-dash.
  assert.ok(s.includes("DG3 CIMS  -  Crew Statement"));
});

test("composeStatement handles a crew with no contracts/bonus", () => {
  const bytes = composeStatement({ crew: { agency_id: "SC-2", first_name: "Bo" }, contracts: [], bonus: null, generatedAt: "2026-06-12" });
  assert.ok(Buffer.from(bytes).toString("latin1").startsWith("%PDF-1.4"));
});
