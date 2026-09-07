// Workers Builds branch control, as code.
//
// Why (2026-09-07): every worker in the estate builds PR branches under the PRODUCTION
// service. A non-production build runs `wrangler versions upload`, which creates a version
// of the production worker WITH PRODUCTION BINDINGS and posts its preview URL on the PR.
// Unreviewed branch code is therefore reachable against the production D1. The dashboard
// fix is a checkbox per worker; this is the same change through the Builds API so it is
// reviewable, repeatable and does not depend on anyone remembering the click.
//
// Token: the Builds API requires a USER-SCOPED token (account-scoped returns "Invalid
// token"). Permissions: "Workers Builds Configuration: Edit" + "Workers Scripts: Read".
// This is NOT the account-scoped deploy token in CLOUDFLARE_API_TOKEN — keep them separate
// so the deploy token never gains build-config rights. The token is read from the
// environment and never logged (CLAUDE.md §7).
//
// Default action is a DRY RUN that changes nothing and prints the plan.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://api.cloudflare.com/client/v4";

// ---------- pure ----------------------------------------------------------------

// Classify one trigger. A worker has at most two: production (fires on the production
// branch) and non-production (fires on everything else, `branch_includes: ["*"]`).
// Anything that matches neither shape is left ALONE and reported — never guessed at.
export function classifyTrigger(t, productionBranch) {
  const inc = t.branch_includes || [], exc = t.branch_excludes || [];
  if (inc.includes("*")) return "non-production";
  // Already disabled by a previous run: includes emptied, the production branch still
  // excluded. Without this a second run reports it as unrecognised, which reads like a
  // fault rather than "nothing left to do".
  if (inc.length === 0 && exc.length) return "non-production";
  if (inc.length && inc.every((b) => b === productionBranch)) return "production";
  return "unknown";
}

// Decide what to PATCH. Returns { updates, skips } — updates carry the smallest possible
// body, and a trigger already in the wanted state produces no update at all (so a re-run
// is a no-op and the output says "already correct" rather than pretending to work).
export function planTriggerUpdates(triggers, opts = {}) {
  const productionBranch = opts.productionBranch || "main";
  const watchPaths = opts.watchPaths || null; // null = leave path filters untouched
  const updates = [], skips = [];
  for (const t of triggers || []) {
    const role = classifyTrigger(t, productionBranch);
    const id = t.trigger_uuid, name = t.trigger_name || "(unnamed)";
    if (role === "unknown") {
      skips.push({ id, name, role, reason: `branch_includes ${JSON.stringify(t.branch_includes || [])} matches neither the production nor the non-production shape` });
      continue;
    }
    if (role === "non-production") {
      if ((t.branch_includes || []).length === 0) { skips.push({ id, name, role, reason: "already disabled" }); continue; }
      updates.push({ id, name, role, patch: { branch_includes: [] },
        reason: `disable non-production builds (was ${JSON.stringify(t.branch_includes)})` });
      continue;
    }
    // production
    if (!watchPaths) { skips.push({ id, name, role, reason: "production trigger left untouched (no --watch-paths given)" }); continue; }
    const cur = t.path_includes || [];
    if (JSON.stringify(cur) === JSON.stringify(watchPaths)) { skips.push({ id, name, role, reason: "watch paths already correct" }); continue; }
    updates.push({ id, name, role, patch: { path_includes: watchPaths },
      reason: `limit production builds to ${watchPaths.join(", ")} (was ${cur.length ? JSON.stringify(cur) : "everything"})` });
  }
  return { updates, skips };
}

// ---------- network -------------------------------------------------------------

async function cf(path, { token, method = "GET", body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const errs = (j.errors || []).map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${r.status}`;
    throw new Error(`${method} ${path.replace(/\/accounts\/[^/]+/, "/accounts/***")} -> ${errs}`);
  }
  return j.result;
}

export async function run({ token, accountId, workers, watchPaths, apply, log = console.log }) {
  const scripts = await cf(`/accounts/${accountId}/workers/scripts`, { token });
  const tagByName = Object.fromEntries((scripts || []).map((s) => [s.id, s.tag]));
  let changed = 0, planned = 0, missing = 0;
  for (const name of workers) {
    const tag = tagByName[name];
    if (!tag) { log(`\n## ${name}\n   NOT FOUND on this account — skipped`); missing++; continue; }
    const triggers = await cf(`/accounts/${accountId}/builds/workers/${tag}/triggers`, { token });
    const { updates, skips } = planTriggerUpdates(triggers, { watchPaths });
    log(`\n## ${name}`);
    for (const s of skips) log(`   - ${s.role.padEnd(15)} ${s.name}: ${s.reason}`);
    for (const u of updates) {
      planned++;
      log(`   ${apply ? "*" : "~"} ${u.role.padEnd(15)} ${u.name}: ${u.reason}`);
      if (apply) { await cf(`/accounts/${accountId}/builds/triggers/${u.id}`, { token, method: "PATCH", body: u.patch }); changed++; }
    }
    if (!updates.length && !skips.length) log("   (no build triggers — this worker is not connected to git)");
  }
  return { planned, changed, missing };
}

// ---------- CLI -----------------------------------------------------------------

// Realpath-resolved, like scripts/verify_client_scripts.mjs: import.meta.url is resolved by
// the ESM loader, so a checkout under a symlinked directory would otherwise make this false
// and the whole run a silent no-op.
const isCli = (() => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
})();
if (isCli) {
  const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
  const token = process.env.CLOUDFLARE_BUILDS_TOKEN, accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) { console.error("Missing CLOUDFLARE_BUILDS_TOKEN or CLOUDFLARE_ACCOUNT_ID."); process.exit(2); }
  const workers = arg("workers", "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!workers.length) { console.error("Pass --workers=name1,name2"); process.exit(2); }
  const wp = arg("watch-paths", "");
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLYING changes." : "DRY RUN — nothing will be changed. Re-run with --apply.");
  const res = await run({ token, accountId, workers, watchPaths: wp ? wp.split(",").map((s) => s.trim()).filter(Boolean) : null, apply });
  console.log(`\n${apply ? "Changed" : "Would change"} ${apply ? res.changed : res.planned} trigger(s). ${res.missing} worker(s) not found.`);
  if (!apply && res.planned) console.log("Re-run this workflow with apply = true to make it so.");
}
