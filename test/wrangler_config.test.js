import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static guard on wrangler.toml — same approach as sqlsafety/perf_invariants.
//
// WHY THIS EXISTS (2026-09-07). Workers Builds runs `wrangler versions upload` for every
// commit on a non-production branch. That uploads a version of THIS worker with the
// PRODUCTION bindings (D1 `cims-hr-console`, R2 `cims-hr-exports`, the MAILER service)
// and, unless preview URLs are off, serves it at a public
// `<version>-cims-hr-console.<subdomain>.workers.dev` URL that Cloudflare posts on the PR.
// Unreviewed code, real crew data, public address.
//
// wrangler 3.x treats a MISSING preview_urls key as "enabled" (the opt-in default only
// lands in wrangler >= 4.34), so this line has to be present and false — a silent
// deletion re-opens the hole with no other symptom.
const TOML = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("preview URLs are explicitly disabled", () => {
  assert.match(
    TOML,
    /^preview_urls\s*=\s*false\s*$/m,
    "wrangler.toml must set `preview_urls = false` — without it wrangler 3.x publishes every " +
      "non-production branch build at a public preview URL bound to the production D1",
  );
});

test("preview_urls is set at the top level, before any [table]", () => {
  const firstTable = TOML.search(/^\[/m);
  const setting = TOML.search(/^preview_urls\s*=/m);
  assert.notEqual(setting, -1, "preview_urls not found");
  assert.ok(
    firstTable === -1 || setting < firstTable,
    "preview_urls must sit above the first [table] header or TOML scopes it into that table",
  );
});

test("the pinned wrangler is new enough to honour preview_urls", () => {
  // `preview_urls` was added in wrangler 3.91.0. An older pin would ignore the key and
  // leave preview URLs on while this file still read as if they were off.
  const range = (PKG.devDependencies || {}).wrangler || (PKG.dependencies || {}).wrangler;
  assert.ok(range, "wrangler is not a dependency");
  const major = Number(String(range).replace(/^[^\d]*/, "").split(".")[0]);
  assert.ok(major >= 3, `wrangler pin ${range} is older than 3.x`);
});

// 2026-09-15: `wrangler deploy` (what Workers Builds runs on every merge) deletes every
// plain-text variable set in the dashboard unless keep_vars is true. A DEPLOY_TO typed into
// the dashboard would silently die on the next merge and the Deploy button would refuse
// again with `no_recipient`. Keep both the switch and the recipient in this file.
test("dashboard variables survive deploys (keep_vars = true, top level)", () => {
  assert.match(
    TOML,
    /^keep_vars\s*=\s*true\s*$/m,
    "wrangler.toml must set `keep_vars = true` — otherwise every deploy wipes dashboard-set vars",
  );
  const firstTable = TOML.search(/^\[/m);
  const setting = TOML.search(/^keep_vars\s*=/m);
  assert.ok(
    firstTable === -1 || setting < firstTable,
    "keep_vars must sit above the first [table] header or TOML scopes it into that table",
  );
});

test("the Keyman Deploy recipient is pinned in [vars] to a dg3.com address", () => {
  assert.match(
    TOML,
    /^DEPLOY_TO\s*=\s*"[^"@\s]+@dg3\.com"\s*$/m,
    "wrangler.toml [vars] must carry DEPLOY_TO (a dg3.com address) — the Deploy button refuses without it",
  );
  const vars = TOML.search(/^\[vars\]/m);
  const setting = TOML.search(/^DEPLOY_TO\s*=/m);
  const nextTable = TOML.slice(vars + 1).search(/^\[/m) + vars + 1;
  assert.ok(vars !== -1 && setting > vars && setting < nextTable, "DEPLOY_TO must sit inside [vars]");
});
