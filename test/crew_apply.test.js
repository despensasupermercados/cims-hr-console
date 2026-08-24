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

// --- D6: the behaviour change this PR exists for ---------------------------
test("D6 status defaults ACCEPT and is written to crew", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  const w = plan.crewUpdates.find(u => u.agency_id === "SC-2" && u.field === "status");
  assert.ok(w, "status must be applied by default — the old keep-by-default froze the roster");
  assert.equal(w.value, "Inactive");
  assert.equal(plan.statusApplied, 1);
  assert.equal(plan.statusKept, 0);
});

test("D6 an APPLIED status closes the conflict (registry agrees with TDG)", () => {
  const plan = buildApplyPlan(sampleReview(), {});
  const c = plan.conflicts.find(x => x.agency_id === "SC-2" && x.field === "status");
  assert.ok(c);
  assert.equal(c.resolved, 1);
  assert.equal(c.new_value, "Inactive");
});

test("D6 a KEPT status stays OPEN — resolved=1 now means 'agrees with source of truth'", () => {
  // The old code wrote resolved=1 on a KEPT status too. That is how 198 rows could read
  // 'resolved' while 32 crew carried a stale status for six weeks.
  const plan = buildApplyPlan(sampleReview(), { "SC-2:status": "keep" });
  assert.equal(plan.crewUpdates.some(u => u.field === "status"), false);
  assert.equal(plan.statusKept, 1);
  const c = plan.conflicts.find(x => x.agency_id === "SC-2" && x.field === "status");
  assert.equal(c.resolved, 0, "a deliberate divergence from TDG is outstanding work, not 'resolved'");
  assert.match(c.new_value, /source of truth says Inactive/);
});

test("D7 a rekeyed row raises an OPEN identity flag and never rewrites agency_id", () => {
  const review = { groups: { rekeyed: [{ agency_id: "SC-0040010", incoming_id: "349195", ship_crew_id: "349195" }] } };
  const plan = buildApplyPlan(review, {});
  assert.equal(plan.crewUpdates.some(u => u.field === "agency_id"), false);
  const c = plan.conflicts.find(x => x.field === "identity");
  assert.ok(c && c.resolved === 0);
  assert.match(c.new_value, /349195/);
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
  assert.equal(plan.importRun.rows_upserted, 4); // SC-2 now touched: status applies by default
  assert.equal(plan.importRun.conflicts, 2);     // ship + departed (status now resolved)
});
