import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApplyPlan } from "../src/crew_apply.js";

function sampleReview() {
  return {
    groups: {
      ship_flag: [{ agency_id: "SC-1", field: "vessel_observed", old: "Celebrity Edge", new: "Celebrity Apex", write: false }],
      override_conflict: [{ agency_id: "SC-1", field: "phone", old: "+63900", new: "+63911" }],
      critical: [{ agency_id: "SC-2", field: "status", old: "On board", new: "Inactive" }],
      cert: [
        { agency_id: "SC-3", field: "med_exp", old: "2026-03-19", new: "2028-03-19", defaultAccept: true },
        { agency_id: "SC-4", field: "med_exp", old: "2026-09-01", new: "2026-07-20", earlier: true, defaultAccept: true },
      ],
      minor: [{ agency_id: "SC-3", field: "province", old: null, new: "Cavite", auto: true }],
      new: [{ agency_id: "SC-9", fields: { agency_id: "SC-9", first_name: "New", last_name: "Guy", status: "Earmarked", vessel_observed: "Icon of the Seas" } }],
      departed: [{ agency_id: "SC-8", last: { agency_id: "SC-8", vessel_observed: "Adventure of the Seas" } }],
    },
  };
}

test("D1 ship change is NEVER a crew update — only a sync_conflict", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  assert.equal(plan.crewUpdates.some(u => u.field === "vessel_observed"), false);
  const ship = plan.conflicts.find(c => c.field === "vessel_observed" && c.agency_id === "SC-1");
  assert.ok(ship);
  assert.equal(ship.resolved, 0);
});

test("D1 belt-and-suspenders: an errantly-accepted ship write is dropped and counted", () => {
  const review = { groups: { cert: [{ agency_id: "SC-1", field: "vessel_observed", old: "A", new: "B" }] } };
  const plan = buildApplyPlan(review, { "SC-1:vessel_observed": "accept" });
  assert.equal(plan.crewUpdates.length, 0);
  assert.equal(plan.droppedShipWrites, 1);
});

test("D2 certs default accept -> crew updates", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  assert.ok(plan.crewUpdates.some(u => u.agency_id === "SC-3" && u.field === "med_exp" && u.value === "2028-03-19"));
  assert.ok(plan.crewUpdates.some(u => u.agency_id === "SC-4" && u.field === "med_exp"));
});

test("D3 override defaults KEEP: no base write, but an audit conflict is logged", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  assert.equal(plan.crewUpdates.some(u => u.agency_id === "SC-1" && u.field === "phone"), false);
  const audit = plan.conflicts.find(c => c.agency_id === "SC-1" && c.field === "phone");
  assert.ok(audit && audit.resolved === 1);
});

test("D3 override explicitly accepted -> base write + audit", () => {
  const plan = buildApplyPlan(sampleReview(), { "SC-1:phone": "accept" });
  assert.ok(plan.crewUpdates.some(u => u.agency_id === "SC-1" && u.field === "phone" && u.value === "+63911"));
});

test("status defaults keep (no write) but audited", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  assert.equal(plan.crewUpdates.some(u => u.field === "status"), false);
  assert.ok(plan.conflicts.some(c => c.agency_id === "SC-2" && c.field === "status" && c.resolved === 1));
});

test("D4 departed -> open presence conflict, never a delete", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  const dep = plan.conflicts.find(c => c.agency_id === "SC-8" && c.field === "presence");
  assert.ok(dep && dep.resolved === 0);
});

test("D5 minor auto-applies", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  assert.ok(plan.crewUpdates.some(u => u.agency_id === "SC-3" && u.field === "province"));
});

test("new crew added by default (vessel allowed on insert)", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  const nc = plan.newCrew.find(n => n.agency_id === "SC-9");
  assert.ok(nc && nc.vessel_observed === "Icon of the Seas");
});

test("new crew can be skipped", () => {
  const plan = buildApplyPlan(sampleReview(), { "new:SC-9": "skip" });
  assert.equal(plan.newCrew.length, 0);
});

test("importRun summary counts touched rows and open conflicts", () => {
  const plan = buildApplyPlan(sampleReview(), {}, { file_hash: "abc", run_by: "Rita" });
  assert.equal(plan.importRun.file_hash, "abc");
  assert.equal(plan.importRun.rows_upserted, 3);
  assert.equal(plan.importRun.conflicts, 2);
});
