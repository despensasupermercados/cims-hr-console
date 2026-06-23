import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOverride, OVR_FIELDS } from "../src/override.js";

test("null override returns base unchanged", () => {
  const base = { agency_id: "SC-1", status: "On board", baseline_count: 3 };
  assert.equal(applyOverride(base, null), base);
  assert.equal(applyOverride(base, undefined), base);
});

test("override field wins over base", () => {
  const base = { status: "On board", vessel_observed: "Wonder", baseline_count: 2 };
  const out = applyOverride(base, { status: "On Vacation", vessel_observed: "Allure" });
  assert.equal(out.status, "On Vacation");
  assert.equal(out.vessel_observed, "Allure");
  assert.equal(out.baseline_count, 2); // untouched
});

test("baseline_count override of 0 WINS (Jr PS is a valid set baseline)", () => {
  const base = { baseline_count: 5 };
  assert.equal(applyOverride(base, { baseline_count: 0 }).baseline_count, 0);
});

test("empty-string and null override values do NOT clobber the base", () => {
  const base = { status: "On board", vessel_observed: "Wonder", baseline_count: 4 };
  const out = applyOverride(base, { status: "", vessel_observed: null, baseline_count: "" });
  assert.equal(out.status, "On board");
  assert.equal(out.vessel_observed, "Wonder");
  assert.equal(out.baseline_count, 4);
});

test("does not mutate the base object", () => {
  const base = { status: "On board" };
  applyOverride(base, { status: "Inactive" });
  assert.equal(base.status, "On board");
});

test("only OVR_FIELDS are merged (stray override keys ignored)", () => {
  const base = { status: "On board" };
  const out = applyOverride(base, { status: "Earmarked", hacker: "x", id: 99 });
  assert.equal(out.status, "Earmarked");
  assert.equal(out.hacker, undefined);
  assert.equal(out.id, undefined);
  assert.ok(OVR_FIELDS.includes("baseline_count"));
});
