import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, docStatus, crewComplianceReport } from "../src/compliance.js";

const TODAY = "2026-06-11";

test("daysUntil computes signed day deltas; junk -> null", () => {
  assert.equal(daysUntil("2026-06-21", TODAY), 10);
  assert.equal(daysUntil("2026-06-01", TODAY), -10);
  assert.equal(daysUntil("", TODAY), null);
  assert.equal(daysUntil("see card", TODAY), null);
  assert.equal(daysUntil(null, TODAY), null);
});

test("docStatus classifies expired / expiring / ok / missing", () => {
  assert.equal(docStatus("2026-05-01", TODAY).status, "expired");
  assert.equal(docStatus("2026-07-01", TODAY, 60).status, "expiring"); // 20 days out
  assert.equal(docStatus("2027-01-01", TODAY, 60).status, "ok");
  assert.equal(docStatus("garbage", TODAY).status, "missing");
});

test("report flags a crew with an expired passport and sorts it most-urgent", () => {
  const rows = [
    { agency_id: "A1", first_name: "Ana", last_name: "Cruz", vessel_observed: "Wonder",
      status: "On board", med_exp: "2027-01-01", sirb_exp: "2027-01-01", pp_exp: "2026-04-01", usv_exp: "2027-01-01" },
    { agency_id: "A2", first_name: "Ben", last_name: "Diaz", vessel_observed: "Allure",
      status: "On Vacation", med_exp: "2027-01-01", sirb_exp: "2027-01-01", pp_exp: "2027-01-01", usv_exp: "2027-01-01" },
  ];
  const r = crewComplianceReport(rows, TODAY);
  assert.equal(r.length, 1);
  assert.equal(r[0].agency_id, "A1");
  assert.equal(r[0].severity, 3); // expired
  assert.equal(r[0].flags[0].doc, "Passport");
});

test("missing required doc is flagged; missing optional Schengen is not", () => {
  const rows = [{
    agency_id: "A3", first_name: "Cy", last_name: "Ere", vessel_observed: "Edge", status: "Earmarked",
    med_exp: "2027-01-01", sirb_exp: "2027-01-01", pp_exp: "2027-01-01", usv_exp: "", sch_exp: "",
  }];
  const r = crewComplianceReport(rows, TODAY);
  assert.equal(r.length, 1);
  const docs = r[0].flags.map((f) => f.doc);
  assert.ok(docs.includes("US C1/D Visa"));   // required, missing -> flagged
  assert.ok(!docs.includes("Schengen"));      // optional, missing -> not flagged
});

test("present-but-expiring Schengen IS flagged (optional only when held)", () => {
  const rows = [{
    agency_id: "A4", first_name: "Di", last_name: "Fox", vessel_observed: "Oasis", status: "On board",
    med_exp: "2027-01-01", sirb_exp: "2027-01-01", pp_exp: "2027-01-01", usv_exp: "2027-01-01", sch_exp: "2026-06-20",
  }];
  const r = crewComplianceReport(rows, TODAY);
  assert.equal(r.length, 1);
  assert.equal(r[0].flags[0].doc, "Schengen");
  assert.equal(r[0].flags[0].status, "expiring");
});

test("fully compliant crew produces no rows", () => {
  const rows = [{
    agency_id: "A5", first_name: "Em", last_name: "Gil", vessel_observed: "Apex", status: "On board",
    med_exp: "2028-01-01", sirb_exp: "2028-01-01", pp_exp: "2028-01-01", usv_exp: "2028-01-01",
  }];
  assert.equal(crewComplianceReport(rows, TODAY).length, 0);
});
