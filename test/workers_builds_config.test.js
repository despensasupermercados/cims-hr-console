import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTrigger, planTriggerUpdates } from "../scripts/workers_builds_config.mjs";

// Shapes taken from the live account (survey 2026-09-05): every git-connected worker has a
// production trigger on ["main"] and a non-production trigger on ["*"] excluding main.
const prod = { trigger_uuid: "p1", trigger_name: "Deploy production", branch_includes: ["main"], branch_excludes: [], path_includes: [] };
const nonprod = { trigger_uuid: "n1", trigger_name: "Deploy non-production branches", branch_includes: ["*"], branch_excludes: ["main"], path_includes: ["*"], path_excludes: [], build_command: "", deploy_command: "npx wrangler versions upload", root_directory: "/", build_caching_enabled: false, build_token_uuid: "tok", external_script_id: "sid", created_on: "x", deleted_on: null };

test("classifyTrigger names the four states and refuses to guess at anything else", () => {
  assert.equal(classifyTrigger(prod, "main"), "production");
  assert.equal(classifyTrigger(nonprod, "main"), "non-production");
  assert.equal(classifyTrigger({ branch_includes: [] }, "main"), "disabled", "fires on no branch, whatever it once was");
  assert.equal(classifyTrigger({ branch_includes: [], branch_excludes: ["main"] }, "main"), "disabled");
  // How we turn it off: every branch excluded. Must read back as disabled, not as non-production.
  assert.equal(classifyTrigger({ branch_includes: ["*"], branch_excludes: ["*"] }, "main"), "disabled");
  assert.equal(classifyTrigger({ branch_includes: ["main", "release"] }, "main"), "unknown");
  assert.equal(classifyTrigger({ branch_includes: ["claude/read-this"] }, "main"), "unknown",
    "a worker whose production branch is not main must not be silently retargeted");
  assert.equal(classifyTrigger({ branch_includes: ["release"] }, "release"), "production", "production branch is a parameter");
});

test("the default plan disables non-production builds and leaves the production trigger alone", () => {
  const { updates, skips } = planTriggerUpdates([prod, nonprod]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "n1");
  assert.deepEqual(updates[0].patch.branch_excludes, ["*"], "every branch excluded");
  assert.equal(updates[0].patch.deploy_command, "npx wrangler versions upload", "the rest of the config is sent back verbatim");
  assert.equal(updates[0].patch.trigger_uuid, undefined, "read-only metadata is never sent");
  assert.equal(updates[0].verify({ branch_excludes: ["*"] }), true);
  assert.equal(updates[0].verify({ branch_excludes: ["main"] }), false, "an ignored PATCH must not read as success");
  assert.match(skips.find((s) => s.id === "p1").reason, /left untouched/);
});

// The whole point is that production keeps deploying. A worker whose ONLY trigger is ["*"]
// builds production FROM that trigger; emptying it would stop production deploys entirely.
test("REFUSES to disable the only trigger a worker has", () => {
  const { updates, skips } = planTriggerUpdates([nonprod]);
  assert.equal(updates.length, 0);
  const s = skips.find((x) => x.id === "n1");
  assert.equal(s.blocked, true);
  assert.match(s.reason, /REFUSED/);
  assert.match(s.reason, /would stop production deploys/);
});

test("a re-run is a no-op after the real disable (branch_excludes ['*'])", () => {
  const done = planTriggerUpdates([prod, { ...nonprod, branch_excludes: ["*"] }]);
  assert.equal(done.updates.length, 0);
  assert.match(done.skips.find((s) => s.id === "n1").reason, /already disabled/);
});

test("a re-run is a no-op: an already-disabled trigger produces no update", () => {
  const { updates, skips } = planTriggerUpdates([prod, { ...nonprod, branch_includes: [] }]);
  assert.equal(updates.length, 0);
  assert.match(skips.find((s) => s.id === "n1").reason, /already disabled/);
  // and with no branch_excludes either — the disable PATCH only empties branch_includes
  const bare = planTriggerUpdates([prod, { ...nonprod, branch_includes: [], branch_excludes: [] }]);
  assert.equal(bare.updates.length, 0);
  assert.match(bare.skips.find((s) => s.id === "n1").reason, /already disabled/);
});

test("watch paths are opt-in and only ever touch the production trigger's path_includes", () => {
  const wp = ["src/**", "wrangler.toml"];
  const { updates } = planTriggerUpdates([prod, nonprod], { watchPaths: wp });
  const p = updates.find((u) => u.id === "p1");
  assert.deepEqual(p.patch, { path_includes: wp });
  assert.equal(p.verify({ path_includes: wp }), true);
  assert.equal(p.verify({ path_includes: [] }), false);
  // The non-production trigger resends its own path_includes verbatim (full-config patch);
  // what matters is that the requested watch paths are NEVER applied to it.
  assert.deepEqual(updates.find((u) => u.id === "n1").patch.path_includes, ["*"], "its own value, untouched");
  assert.notDeepEqual(updates.find((u) => u.id === "n1").patch.path_includes, wp, "watch paths are a production-only change");
  const again = planTriggerUpdates([{ ...prod, path_includes: wp }, nonprod], { watchPaths: wp });
  assert.equal(again.updates.find((u) => u.id === "p1"), undefined, "idempotent");
});

test("an unrecognised trigger is reported, never patched", () => {
  const odd = { trigger_uuid: "x1", trigger_name: "custom", branch_includes: ["main", "staging"] };
  const { updates, skips } = planTriggerUpdates([odd]);
  assert.equal(updates.length, 0);
  assert.match(skips[0].reason, /left alone/);
});

// The 2026-09-07 apply run was rejected with "12002 Invalid request body" for
// branch_includes: []. Before guessing again, the run can print what a trigger actually
// looks like — with nothing sensitive in it.
test("redactTrigger keeps the shape but never leaks build-time values or the build token", async () => {
  const { redactTrigger } = await import("../scripts/workers_builds_config.mjs");
  const out = redactTrigger({
    trigger_uuid: "u1", trigger_name: "np", branch_includes: ["*"], branch_excludes: ["main"],
    build_token_uuid: "super-secret-token-id",
    environment_variables: { API_KEY: "live-value-here", NODE_VERSION: "22" },
  });
  assert.equal(out.trigger_uuid, "u1");
  assert.deepEqual(out.branch_includes, ["*"]);
  assert.equal(out.build_token_uuid, "<redacted>");
  assert.deepEqual(out.environment_variables, ["API_KEY=<redacted>", "NODE_VERSION=<redacted>"]);
  const s = JSON.stringify(out);
  assert.equal(s.includes("live-value-here"), false);
  assert.equal(s.includes("super-secret-token-id"), false);
});

test("fullTriggerPatch resends every writable field and drops read-only metadata", async () => {
  const { fullTriggerPatch, TRIGGER_WRITABLE } = await import("../scripts/workers_builds_config.mjs");
  const out = fullTriggerPatch(nonprod, { branch_excludes: ["*"] });
  assert.deepEqual(out.branch_excludes, ["*"], "the one intended change");
  assert.deepEqual(out.branch_includes, ["*"], "everything else verbatim");
  assert.equal(out.deploy_command, "npx wrangler versions upload");
  assert.equal(out.build_caching_enabled, false, "false is a real value and must survive");
  for (const k of ["trigger_uuid", "external_script_id", "created_on", "deleted_on"]) {
    assert.equal(out[k], undefined, k + " is read-only and must not be sent");
  }
  for (const k of Object.keys(out)) assert.ok(TRIGGER_WRITABLE.includes(k), k + " is not a writable field");
});

test("a patch body carrying the build token and env values is redacted before it can reach a log", async () => {
  const { redactTrigger, fullTriggerPatch } = await import("../scripts/workers_builds_config.mjs");
  const body = fullTriggerPatch({ ...nonprod, environment_variables: { API_KEY: "live-value" } }, { branch_excludes: ["*"] });
  assert.equal(body.build_token_uuid, "tok", "the real value is sent to Cloudflare");
  const logged = JSON.stringify(redactTrigger(body));
  assert.equal(logged.includes("live-value"), false);
  assert.equal(logged.includes('"tok"'), false);
});
