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
export function classifyTrigger(t, productionBranch = "main") {
  const inc = t.branch_includes || [], exc = t.branch_excludes || [];
  // Fires on no branch at all: disabled, whatever it once was. Checked FIRST so a re-run
  // reads "already disabled" instead of "unrecognised", which would look like a fault.
  // Two ways to be off: every branch excluded (how we turn it off), or nothing included.
  if (exc.includes("*") || inc.length === 0) return "disabled";
  if (inc.includes("*")) return "non-production";
  if (inc.every((b) => b === productionBranch)) return "production";
  return "unknown";
}

// Decide what to PATCH. Returns { updates, skips } — updates carry the smallest possible
// body, and a trigger already in the wanted state produces no update at all (so a re-run
// is a no-op and the output says "already correct" rather than pretending to work).
export function planTriggerUpdates(triggers, opts = {}) {
  const productionBranch = opts.productionBranch || "main";
  const watchPaths = opts.watchPaths || null; // null = leave path filters untouched
  const updates = [], skips = [];
  const all = triggers || [];
  const roles = all.map((t) => classifyTrigger(t, productionBranch));
  // SAFETY: only disable a non-production trigger when a separate production trigger
  // exists to keep deploying. A worker whose ONLY trigger is branch_includes:["*"] builds
  // production FROM that trigger; emptying it would stop production deploys altogether.
  const hasProduction = roles.includes("production");
  for (let i = 0; i < all.length; i++) {
    const t = all[i], role = roles[i];
    const id = t.trigger_uuid, name = t.trigger_name || "(unnamed)";
    if (role === "disabled") { skips.push({ id, name, role, reason: "already disabled (fires on no branch)" }); continue; }
    if (role === "unknown") {
      skips.push({ id, name, role, reason: `branch_includes ${JSON.stringify(t.branch_includes || [])} is neither "${productionBranch}" nor "*" — left alone` });
      continue;
    }
    if (role === "non-production") {
      if (!hasProduction) {
        skips.push({ id, name, role, blocked: true,
          reason: `REFUSED: this is the only build trigger, so production deploys from it. Disabling it would stop production deploys. Give the worker a production trigger on "${productionBranch}" first.` });
        continue;
      }
      // HOW "off" IS EXPRESSED (settled 2026-09-07 by dumping a live trigger, after the API
      // rejected branch_includes: [] with "12002 Invalid request body"): exclude every branch.
      // The trigger keeps its build/deploy commands and its build token, so re-enabling is one
      // PATCH back to branch_excludes: ["main"]. The dashboard checkbox appears to DELETE the
      // trigger instead (the row carries a deleted_on field) — this is the reversible equivalent.
      // Sent as a PAIR: "12002 Invalid request body" came back for branch_includes alone and for
      // branch_excludes alone, so the branch filter is likely validated as one unit.
      updates.push({ id, name, role, patch: { branch_includes: ["*"], branch_excludes: ["*"] },
        verify: (x) => (x.branch_excludes || []).includes("*"),
        reason: `disable non-production builds (branch_excludes ${JSON.stringify(t.branch_excludes || [])} -> ["*"], every branch excluded)` });
      continue;
    }
    // production
    if (!watchPaths) { skips.push({ id, name, role, reason: "production trigger left untouched (no --watch-paths given)" }); continue; }
    const cur = t.path_includes || [];
    if (JSON.stringify(cur) === JSON.stringify(watchPaths)) { skips.push({ id, name, role, reason: "watch paths already correct" }); continue; }
    updates.push({ id, name, role, patch: { path_includes: watchPaths },
      verify: (x) => JSON.stringify(x.path_includes || []) === JSON.stringify(watchPaths),
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
    // "12002 Invalid request body" on its own is not actionable. Cloudflare usually says which
    // field it disliked in errors[].error_chain / messages, so surface the whole envelope
    // (errors + messages only — never the result, and the token is not echoed back).
    const errs = (j.errors || []).map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${r.status}`;
    const detail = JSON.stringify({ errors: j.errors, messages: j.messages });
    throw new Error(`${method} ${path.replace(/\/accounts\/[^/]+/, "/accounts/***")} -> ${errs}\n       full: ${detail}\n       sent: ${body ? JSON.stringify(body) : "(no body)"}`);
  }
  return j.result;
}

// What a trigger really looks like, with anything sensitive removed. environment_variables
// are build-time values that may hold credentials, so only their KEYS are shown, and the
// build token id is masked (CLAUDE.md §7).
export function redactTrigger(t) {
  const o = { ...t };
  if (o.environment_variables && typeof o.environment_variables === "object") {
    o.environment_variables = Object.keys(o.environment_variables).sort().map((k) => k + "=<redacted>");
  }
  if (o.build_token_uuid) o.build_token_uuid = "<redacted>";
  return o;
}

export async function run({ token, accountId, workers, watchPaths, productionBranch, apply, dump, log = console.log }) {
  const scripts = await cf(`/accounts/${accountId}/workers/scripts`, { token });
  const tagByName = Object.fromEntries((scripts || []).map((s) => [s.id, s.tag]));
  let changed = 0, planned = 0, missing = 0, blocked = 0, unverified = 0;
  for (const name of workers) {
    const tag = tagByName[name];
    log(`\n## ${name}`);
    if (!tag) { log("   NOT FOUND on this account — nothing was changed for it"); missing++; continue; }
    const triggers = await cf(`/accounts/${accountId}/builds/workers/${tag}/triggers`, { token });
    if (dump) for (const t of triggers || []) log("   " + JSON.stringify(redactTrigger(t)));
    const { updates, skips } = planTriggerUpdates(triggers, { watchPaths, productionBranch });
    for (const s of skips) { if (s.blocked) blocked++; log(`   - ${s.role.padEnd(15)} ${s.name}: ${s.reason}`); }
    for (const u of updates) {
      planned++;
      log(`   ${apply ? "*" : "~"} ${u.role.padEnd(15)} ${u.name}: ${u.reason}`);
      if (!apply) continue;
      try {
        await cf(`/accounts/${accountId}/builds/triggers/${u.id}`, { token, method: "PATCH", body: u.patch });
      } catch (e) {
        // One worker's rejection must not abandon the other four half-done. Report and carry on;
        // the non-zero exit at the end still makes the run fail.
        unverified++; log(`     PATCH REJECTED — ${e.message}`); continue;
      }
      // A 200 is not the change (CLAUDE.md §9): re-read and prove it stuck.
      const after = (await cf(`/accounts/${accountId}/builds/workers/${tag}/triggers`, { token }) || [])
        .find((x) => x.trigger_uuid === u.id);
      if (after && u.verify(after)) { changed++; log("     verified"); }
      else { unverified++; log(`     NOT VERIFIED — re-read shows ${JSON.stringify(redactTrigger(after || {}))}`); }
    }
    if (!updates.length && !skips.length) log("   (no build triggers — this worker is not connected to git)");
  }
  return { planned, changed, missing, blocked, unverified };
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
  const dump = process.argv.includes("--dump");
  console.log(apply ? "APPLYING changes." : "DRY RUN — nothing will be changed. Re-run with apply = true.");
  const res = await run({ token, accountId, workers, productionBranch: arg("production-branch", "main"),
    watchPaths: wp ? wp.split(",").map((s) => s.trim()).filter(Boolean) : null, apply, dump });
  console.log(`\n${apply ? "Changed and verified" : "Would change"} ${apply ? res.changed : res.planned} trigger(s).`);
  // Exit non-zero on anything left unresolved: a green run must mean the estate is covered,
  // not that a mistyped worker name was quietly skipped.
  const problems = [];
  if (res.missing) problems.push(`${res.missing} worker(s) not found on this account`);
  if (res.blocked) problems.push(`${res.blocked} trigger(s) refused for safety`);
  if (res.unverified) problems.push(`${res.unverified} PATCH(es) did not verify`);
  if (problems.length) { console.error(`\nUNRESOLVED: ${problems.join("; ")}. See the lines above.`); process.exit(1); }
  if (!apply && res.planned) console.log("Re-run with apply = true to make it so.");
}
