// Crew import ROUTES — thin glue over the tested pure modules (crewimport, crew_review,
// crew_apply). Serves the review UI and the /stage + /apply endpoints. All decision logic
// lives in the pure modules; this file only talks to D1 (env.DB) and shapes HTTP.
//
// NOT YET WIRED into worker.js. Registration is a surgical edit (see docs/CREW_IMPORT_WIRING.md)
// and the /apply path must be validated on the STAGING Worker + staging D1 first (CLAUDE.md §4).
//
// Safety at this layer (defense in depth, on top of crew_apply's own guarantees):
//   - column names for UPDATE are whitelisted (CREW_WRITABLE) — vessel_observed is NOT in it,
//     so a ship value can never be written even if a bad plan slipped through.
//   - idempotent by import_run.file_hash (re-dropping the same file is a no-op).

import { mapRows, diffCrew } from "./crewimport.js";
import { buildReview } from "./crew_review.js";
import { buildApplyPlan } from "./crew_apply.js";
import { CREW_IMPORT_HTML } from "./crew_import_ui.js";
import { OVR_FIELDS } from "./override.js";

// Fields this route is allowed to UPDATE on crew. vessel_observed deliberately absent (D1).
export const CREW_WRITABLE = new Set([
  "first_name", "middle_name", "last_name", "status", "rank_observed",
  "dob", "province", "phone", "email",
  "med_exp", "sirb_exp", "pp_exp", "sch_exp", "usv_exp",
]);

// crew_override columns an ACCEPTED override conflict may set to NULL — only fields that exist on
// both sides (never vessel_observed: it is not writable, so it is never accepted either).
export const OVR_CLEARABLE = new Set(OVR_FIELDS.filter(f => CREW_WRITABLE.has(f)));

// Columns written when INSERTing a brand-new crew member (agency_code has a DB default).
const INSERT_COLS = ["id", "agency_id", "first_name", "middle_name", "last_name", "status",
  "rank_observed", "vessel_observed", "dob", "province", "phone", "email",
  "med_exp", "sirb_exp", "pp_exp", "sch_exp", "usv_exp", "created_at", "updated_at"];

const J = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const str = (v) => (v == null ? null : String(v));

// GET /api/crew/import — the review UI (session-gated by the caller).
export function crewImportPage() {
  return new Response(CREW_IMPORT_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function loadContext(env) {
  const ex = await env.DB.prepare("SELECT * FROM crew").all();
  const existingByAgency = Object.fromEntries((ex.results || []).map(r => [r.agency_id, r]));
  const ov = await env.DB.prepare("SELECT * FROM crew_override WHERE COALESCE(retired,0)=0").all();
  const overrideByAgency = Object.fromEntries((ov.results || []).map(r => [r.agency_id, r]));
  return { existingByAgency, overrideByAgency };
}

// POST /api/crew/import/stage — body { rows, file_hash, filename }. WRITES NOTHING.
export async function apiCrewImportStage(request, env) {
  const body = await request.json();
  const rows = body.rows || [];
  const file_hash = body.file_hash || null;
  if (file_hash) {
    const dup = await env.DB.prepare("SELECT 1 AS x FROM import_run WHERE file_hash=?").bind(file_hash).first();
    if (dup) return J({ ok: false, error: "already_processed" });
  }
  const { mapped, invalidCount } = mapRows(rows);
  const incomingByAgency = Object.fromEntries(mapped.map(m => [m.agency_id, m]));
  const { existingByAgency, overrideByAgency } = await loadContext(env);
  const diff = diffCrew(mapped, existingByAgency);
  const review = buildReview(diff, existingByAgency, incomingByAgency, overrideByAgency);
  return J({ ok: true, file_hash, filename: body.filename || null, rows_seen: rows.length, invalidCount, review });
}

// POST /api/crew/import/apply — body { review, decisions, file_hash, filename, rows_seen, run_by }.
// Executes the plan as one D1 batch (transaction). Idempotent by file_hash.
export async function apiCrewImportApply(request, env) {
  const body = await request.json();
  const file_hash = body.file_hash || null;
  if (file_hash) {
    const dup = await env.DB.prepare("SELECT 1 AS x FROM import_run WHERE file_hash=?").bind(file_hash).first();
    if (dup) return J({ ok: false, error: "already_processed" }, 409);
  }
  const run_at = new Date().toISOString();
  const run_by = body.run_by || "unknown";
  const plan = buildApplyPlan(body.review, body.decisions || {}, {
    file_hash, filename: body.filename || null, rows_seen: body.rows_seen ?? null, run_by, run_at,
  });

  const importRunId = crypto.randomUUID();
  const stmts = [];
  stmts.push(env.DB.prepare(
    "INSERT INTO import_run (id,file_hash,filename,rows_seen,rows_upserted,conflicts,run_by,run_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(importRunId, file_hash, plan.importRun.filename, plan.importRun.rows_seen,
      plan.importRun.rows_upserted, plan.importRun.conflicts, run_by, run_at));

  for (const u of plan.crewUpdates) {
    if (!CREW_WRITABLE.has(u.field)) continue; // hard whitelist — no vessel_observed, no injection
    stmts.push(env.DB.prepare(`UPDATE crew SET ${u.field}=?, updated_at=? WHERE agency_id=?`)
      .bind(u.value ?? null, run_at, u.agency_id));
  }
  // D3 accepted: the manual value is superseded by the ratified TDG value. Clear ONLY that field
  // (the rest of the override row — retired flag, notes, other fields — stays), else the override
  // keeps winning at read time and the accept is a no-op on the card.
  for (const o of plan.overrideClears || []) {
    if (!OVR_CLEARABLE.has(o.field)) continue;
    stmts.push(env.DB.prepare(`UPDATE crew_override SET ${o.field}=NULL, updated_at=? WHERE agency_id=?`)
      .bind(run_at, o.agency_id));
  }
  for (const n of plan.newCrew) {
    const vals = INSERT_COLS.map(c =>
      c === "id" ? crypto.randomUUID()
        : c === "created_at" || c === "updated_at" ? run_at
          : (n[c] ?? null));
    stmts.push(env.DB.prepare(
      `INSERT INTO crew (${INSERT_COLS.join(",")}) VALUES (${INSERT_COLS.map(() => "?").join(",")})`).bind(...vals));
  }
  for (const c of plan.conflicts) {
    stmts.push(env.DB.prepare(
      "INSERT INTO sync_conflict (id,import_run_id,agency_id,field,old_value,new_value,resolved,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), importRunId, c.agency_id, c.field, str(c.old_value), str(c.new_value), c.resolved, run_at));
  }

  await env.DB.batch(stmts);
  return J({
    ok: true, import_run_id: importRunId,
    applied: plan.crewUpdates.length, added: plan.newCrew.length,
    override_cleared: (plan.overrideClears || []).filter(o => OVR_CLEARABLE.has(o.field)).length,
    open_conflicts: plan.importRun.conflicts, droppedShipWrites: plan.droppedShipWrites,
  });
}

// Router — mirrors relief_api.handleRelief(request, url, env): returns a Response or null.
// worker.js delegates to this exactly like it does handleRelief (same session gate applies).
// NOTE: /apply mutates crew — restrict to MONEY_USERS (Miguel + Rita) at the worker gate.
export async function handleCrewImport(request, url, env) {
  const p = url.pathname;
  if (p === "/api/crew/import" && request.method === "GET") return crewImportPage();
  if (p === "/api/crew/import/stage" && request.method === "POST") return apiCrewImportStage(request, env);
  if (p === "/api/crew/import/apply" && request.method === "POST") return apiCrewImportApply(request, env);
  return null;
}
