import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTrigger, planTriggerUpdates } from "../scripts/workers_builds_config.mjs";

// Shapes taken from the live account (survey 2026-09-05): every git-connected worker has a
// production trigger on ["main"] and a non-production trigger on ["*"] excluding main.
const prod = { trigger_uuid: "p1", trigger_name: "Deploy production", branch_includes: ["main"], branch_excludes: [], path_includes: [] };
const nonprod = { trigger_uuid: "n1", trigger_name: "Deploy non-production branches", branch_includes: ["*"], branch_excludes: ["main"], path_includes: [] };

test("classifyTrigger separates the two shapes and refuses to guess at anything else", () => {
  assert.equal(classifyTrigger(prod, "main"), "production");
  assert.equal(classifyTrigger(nonprod, "main"), "non-production");
  assert.equal(classifyTrigger({ branch_includes: ["main", "release"] }, "main"), "unknown");
  assert.equal(classifyTrigger({ branch_includes: [] }, "main"), "unknown");
  assert.equal(classifyTrigger({ branch_includes: ["claude/read-this"] }, "main"), "unknown",
    "a worker whose production branch is not main must not be silently retargeted");
});

test("the default plan disables non-production builds and leaves the production trigger alone", () => {
  const { updates, skips } = planTriggerUpdates([prod, nonprod]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "n1");
  assert.deepEqual(updates[0].patch, { branch_includes: [] }, "smallest possible body: nothing else on the trigger is touched");
  assert.equal(skips.find((s) => s.id === "p1").reason.includes("left untouched"), true);
});

test("a re-run is a no-op: an already-disabled trigger produces no update", () => {
  const { updates, skips } = planTriggerUpdates([prod, { ...nonprod, branch_includes: [] }]);
  assert.equal(updates.length, 0);
  assert.equal(skips.find((s) => s.id === "n1").reason, "already disabled");
});

test("watch paths are opt-in and only ever touch the production trigger's path_includes", () => {
  const wp = ["src/**", "wrangler.toml"];
  const { updates } = planTriggerUpdates([prod, nonprod], { watchPaths: wp });
  const p = updates.find((u) => u.id === "p1");
  assert.deepEqual(p.patch, { path_includes: wp });
  assert.equal(updates.find((u) => u.id === "n1").patch.path_includes, undefined, "non-production still only gets branch_includes");
  const again = planTriggerUpdates([{ ...prod, path_includes: wp }, nonprod], { watchPaths: wp });
  assert.equal(again.updates.find((u) => u.id === "p1"), undefined, "idempotent");
});

test("an unrecognised trigger is reported, never patched", () => {
  const odd = { trigger_uuid: "x1", trigger_name: "custom", branch_includes: ["main", "staging"] };
  const { updates, skips } = planTriggerUpdates([odd]);
  assert.equal(updates.length, 0);
  assert.match(skips[0].reason, /matches neither/);
});
