// Crew import ROUTES — thin glue over the tested pure modules (crewimport, crew_review,
// crew_apply). Serves the review UI and the /stage + /apply endpoints. All decision logic
// lives in the pure modules; this file only talks to D1 (env.DB) and shapes HTTP.
//
// NOT YET WIRED into worker.js. Registration is a surgical edit (see docs/CREW_IMPORT_WIRING.md)
// and the /apply path must be validated on the STAGING Worker + staging D1 first (CLAUDE.md §4).
//
// Safety at this layer (defense in depth, on top of crew_apply's own guarantees):
//   - column names for UPDATE are whitelisted (CREW_WRITABLE) — vessel_observed is NOT in it,
//     so a ship value can never be written even if a bad plan slipped through. The ONE ship write
//     (plan.shipTakes, an explicit per-row "Take TDG", 2026-09-15) has its own fixed statement below.
//   - idempotent by import_run.file_hash (re-dropping the same file is a no-op).

import { mapRows, diffCrew } from "./crewimport.js";
import { buildReview, OVR_COL, unretireItems } from "./crew_review.js";
import { buildApplyPlan } from "./crew_apply.js";
import { CREW_IMPORT_HTML } from "./crew_import_ui.js";
import { htmlPage } from "./etag.js";
import { OVR_FIELDS } from "./override.js";
import { isMoneyUser } from "./policy.js";
import { reconcileShipFlags, boardShipsFromLegs, strictShipMatcher, AUTO_CLOSED } from "./crew_flags.js";
import { reconcileProjections, projectionSummary } from "./registry_sync.js";
import { VESSEL_REF } from "./vessel_ref.js";

const SHIP_OF = strictShipMatcher(VESSEL_REF); // built once per isolate, not per request

// Rita's open projections (the yellow cards) come in through deps.openProjections — the worker's
// fetchOpenAssignments, the ONE yellow-card feed (ship_leg_source.js). This module never reads the
// schedule tables itself (status_consistency.test.js); without the dep (tests, tools) there are no
// projections to show in the review. The comparison here is for the REVIEW SCREEN and the apply
// sentence; the board derives the same verdict itself at read time from the snapshot written below.
const openProjections = (env, deps) => (deps && deps.openProjections ? deps.openProjections(env).catch(() => []) : Promise.resolve([]));
// What the file says per crew, carried from stage to apply inside the review (the groups only hold
// CHANGES, and a crew whose status is still "On board" has no change to show).
// name + status_raw (5 Oct 2026): the file's own words, so the board can list a row it cannot match to
// the roster by the name TDG gives it, and a status word the console cannot read.
const registryOf = (mapped) => mapped.map((m) => ({
  agency_id: m.agency_id, status: m.status || null, vessel_observed: m.vessel_observed || null,
  name: [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || null, status_raw: m.status_raw || null,
}));
// THE FILE'S WORD PER CREW, kept (registry_snapshot, 5 Oct 2026). One row per crew the file carried:
// status + vessel exactly as the file said them, stamped with the run. The Keyman board derives each
// projection's verdict from this at READ time (registry_sync.registryFromStore + reconcileProjections)
// — not from a value written here — so the board reflects the last upload the moment it is applied,
// and a crew without a snapshot row yet falls back to crew.status + the open ship flag. This is NOT a
// ship allocation (D1): nothing here reaches crew.vessel_observed or the board's placement.
const SNAPSHOT_SQL =
  "INSERT INTO registry_snapshot (agency_id, status, vessel, run_at, import_run_id, name, raw_status) VALUES (?,?,?,?,?,?,?) " +
  "ON CONFLICT(agency_id) DO UPDATE SET status=excluded.status, vessel=excluded.vessel, run_at=excluded.run_at, import_run_id=excluded.import_run_id, name=excluded.name, raw_status=excluded.raw_status";
const snapshotStmt = (env, r, runAt, runId) =>
  env.DB.prepare(SNAPSHOT_SQL).bind(String(r.agency_id), r.status ?? null, r.vessel_observed ?? null, runAt, runId, r.name ?? null, r.status_raw ?? null);

// The file's word per crew, from the parsed rows: the LAST row of a repeated agency id stands, and a row
// the file keyed on the cruise-line id (D7 rekeyed) is carried under the crew's real agency id.
function stagedRegistry(mapped, diff) {
  const realId = {}; for (const rk of (diff.rekeyed || [])) realId[String(rk.incoming_id)] = String(rk.agency_id);
  return registryOf(mapped).map(r => (realId[r.agency_id] ? { ...r, agency_id: realId[r.agency_id] } : r));
}

// THE SAME FILE, DROPPED AGAIN, FILLS THE BOARD'S COPY (Miguel, 5 Oct 2026: "I dont think so u are
// reading well the tdg file"). The console kept no copy of a registry file until #134; the 5 Oct 18:54
// upload ran before it, so the board rebuilt ships from change flags. Re-dropping that file used to be a
// no-op (already_processed). Now, when it is the LATEST run and the board holds no copy of it, its rows
// are kept as that run's snapshot — nothing else: no crew row, flag or status is touched (they were
// applied the first time). An older file never overwrites a newer word. Returns the rows kept.
async function keepCopyOfAppliedFile(env, deps, mapped, file_hash) {
  if (!deps || !deps.ensureRegistrySnapshot || !file_hash) return 0;
  await deps.ensureRegistrySnapshot(env);
  const [run, latest] = await Promise.all([
    env.DB.prepare("SELECT id, run_at FROM import_run WHERE file_hash=?").bind(file_hash).first(),
    env.DB.prepare("SELECT id FROM import_run ORDER BY run_at DESC LIMIT 1").first(),
  ]);
  if (!run || !latest || run.id !== latest.id) return 0;
  const held = await env.DB.prepare("SELECT COUNT(*) AS n FROM registry_snapshot WHERE import_run_id=?").bind(run.id).first();
  if (held && Number(held.n) > 0) return 0;
  const { existingByAgency } = await loadContext(env, null);
  const registry = stagedRegistry(mapped, diffCrew(mapped, existingByAgency)).filter(r => r && r.agency_id);
  if (!registry.length) return 0;
  const stmts = registry.map(r => snapshotStmt(env, r, run.run_at, run.id));
  stmts.push(env.DB.prepare("DELETE FROM registry_snapshot WHERE import_run_id IS NOT ?").bind(run.id));
  await env.DB.batch(stmts);
  return registry.length;
}

// Fields this route is allowed to UPDATE on crew. vessel_observed deliberately absent (D1).
export const CREW_WRITABLE = new Set([
  "first_name", "middle_name", "last_name", "status", "rank_observed",
  "dob", "province", "phone", "email", "gender",
  "med_exp", "sirb_exp", "pp_exp", "sch_exp", "usv_exp",
]);

// crew_override columns an ACCEPTED override conflict may set to NULL — only fields that exist on
// both sides (never vessel_observed: it is not writable, so it is never accepted either).
export const OVR_CLEARABLE = new Set(OVR_FIELDS.filter(f => CREW_WRITABLE.has(f) || Object.values(OVR_COL).includes(f)));

// Columns written when INSERTing a brand-new crew member (agency_code has a DB default).
const INSERT_COLS = ["id", "agency_id", "first_name", "middle_name", "last_name", "status",
  "rank_observed", "vessel_observed", "dob", "province", "phone", "email", "gender",
  "med_exp", "sirb_exp", "pp_exp", "sch_exp", "usv_exp", "created_at", "updated_at"];

const J = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const str = (v) => (v == null ? null : String(v));

// GET /api/crew/import — the review UI (session-gated by the caller).
export function crewImportPage() {
  return htmlPage(CREW_IMPORT_HTML); // revalidated, 304 when unchanged (16 Sep 2026, Starlink)
}

async function loadContext(env, deps) {
  // The projection feed reads assignment.deployed_at (5 Oct 2026), a column the memoized guard adds;
  // a dry run on a fresh isolate must not be the first reader of a column nobody has created yet.
  if (deps && deps.ensureRegistrySnapshot) await deps.ensureRegistrySnapshot(env);
  // One wave (§12): the roster, the manual overrides and Rita's open projections travel together.
  const [ex, ov, projections, rt] = await Promise.all([
    env.DB.prepare("SELECT * FROM crew").all(),
    env.DB.prepare("SELECT * FROM crew_override WHERE COALESCE(retired,0)=0").all(),
    openProjections(env, deps),
    env.DB.prepare("SELECT agency_id, status FROM crew_override WHERE COALESCE(retired,0)=1").all(), // tagged Retired
  ]);
  const existingByAgency = Object.fromEntries((ex.results || []).map(r => [r.agency_id, r]));
  const overrideByAgency = Object.fromEntries((ov.results || []).map(r => [r.agency_id, r]));
  const retiredByAgency = Object.fromEntries(((rt && rt.results) || []).map(r => [r.agency_id, r]));
  return { existingByAgency, overrideByAgency, retiredByAgency, projections: projections || [] };
}

// POST /api/crew/import/stage — body { rows, file_hash, filename }. WRITES NOTHING — except the board's
// copy of a file that was already applied, when it is dropped again (keepCopyOfAppliedFile).
export async function apiCrewImportStage(request, env, deps) {
  const body = await request.json();
  const rows = body.rows || [];
  const file_hash = body.file_hash || null;
  const { mapped: mappedAll, invalidCount, unparsed } = mapRows(rows);
  // The same agency id twice in one file (5 Oct 2026 review): two INSERTs for a new crew failed the
  // whole batch (UNIQUE), and for an existing crew the first row's values were silently ignored. The
  // LAST row stands (what the review already compared against) and the repeat is reported (§6).
  const lastRow = {}, duplicateIds = [];
  for (const m of mappedAll) { if (m.agency_id in lastRow) duplicateIds.push(m.agency_id); lastRow[m.agency_id] = m; }
  const mapped = Object.values(lastRow);
  if (file_hash) {
    const dup = await env.DB.prepare("SELECT 1 AS x FROM import_run WHERE file_hash=?").bind(file_hash).first();
    if (dup) {
      const kept = await keepCopyOfAppliedFile(env, deps, mapped, file_hash);
      return J(kept ? { ok: false, error: "already_processed", snapshot_saved: kept } : { ok: false, error: "already_processed" });
    }
  }
  const incomingByAgency = Object.fromEntries(mapped.map(m => [m.agency_id, m]));
  const { existingByAgency, overrideByAgency, retiredByAgency, projections } = await loadContext(env, deps);
  const diff = diffCrew(mapped, existingByAgency);
  const review = buildReview(diff, existingByAgency, incomingByAgency, overrideByAgency);
  // THE BOARD AGAINST THE FILE (Miguel, 5 Oct 2026). Every open projection is compared with what the
  // registry says about that crew — shown here, written on Apply. The file's per-crew word travels
  // inside the review so Apply compares against what Rita reviewed, not a second reading. A row the
  // file keyed on the cruise-line id (D7 rekeyed) is carried under the crew's REAL agency id, so the
  // snapshot, the verdict and the flag closures all find them.
  const today = new Date().toISOString().slice(0, 10);
  const registry = stagedRegistry(mapped, diff);
  const proj = reconcileProjections({ projections, registry, today, shipOf: SHIP_OF });
  review.projections = proj.items;
  review.projection_counts = proj.counts;
  review.registry = registry;
  review.groups.unretire = unretireItems(registry, retiredByAgency);
  review.counts.unretire = review.groups.unretire.length;
  review.duplicate_ids = [...new Set(duplicateIds)];
  // unparsed: non-empty date cells no reading could make a real date (kept as-is on the roster;
  // before 2026-09-05 they vanished silently because null means "blank in source").
  return J({ ok: true, file_hash, filename: body.filename || null, rows_seen: rows.length, invalidCount, unparsed, review });
}

// POST /api/crew/import/apply — body { review, decisions, file_hash, filename, rows_seen, run_by }.
// Executes the plan as one D1 batch (transaction). Idempotent by file_hash.
// deps.boardLegs(env) = the ONE live schedule (worker.js boardLegs, CLAUDE.md §11) — used to close
// ship flags the board already satisfies. Without it (tests, tools) no flag auto-closes on that rule.
export async function apiCrewImportApply(request, env, deps) {
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

  // Ship flags: dedupe against what is already open, close what the board already satisfies or a
  // newer file supersedes (crew_flags.js). One read of the open flags + the live board, together.
  // The import itself never depends on the board: if the live read fails, the apply still runs and
  // only the "board already matches" rule is off for this run (reported as board_unavailable).
  const today = run_at.slice(0, 10);
  // registry_snapshot must exist before its upserts join the batch (one D1 transaction: a missing
  // table would fail the whole import). Memoized once per isolate by the caller (worker.js
  // ensureRegistrySnapshot); absent in tests and tools.
  if (deps && deps.ensureRegistrySnapshot) await deps.ensureRegistrySnapshot(env);
  const [openRes, legs, projections] = await Promise.all([
    env.DB.prepare("SELECT id, agency_id, field, new_value FROM sync_conflict WHERE field IN ('vessel_observed','presence') AND resolved=0").all(),
    deps && deps.boardLegs ? deps.boardLegs(env).catch(() => null) : Promise.resolve(null),
    openProjections(env, deps),
  ]);
  const board_unavailable = !!(deps && deps.boardLegs) && legs == null;
  // Rita's projections against the file (registry_sync.js), for the response; the file's word per crew
  // is the one staged (review.registry), kept below as the snapshot.
  const registry = Array.isArray(body.review && body.review.registry) ? body.review.registry : [];
  // Crew whose vessel in this file AGREES with the registry: the file names a vessel and the plan raised
  // no ship flag for them. Their older open flags close (crew_flags `agree`). A blank vessel in the file
  // says nothing and closes nothing.
  const flaggedNow = new Set(plan.conflicts.filter(c => c.field === "vessel_observed").map(c => c.agency_id));
  const agree = new Set(registry.filter(r => r && r.agency_id && r.vessel_observed && !flaggedNow.has(r.agency_id)).map(r => String(r.agency_id)));
  const present = new Set(registry.filter(r => r && r.agency_id).map(r => String(r.agency_id)));
  const flags = reconcileShipFlags({ open: openRes.results || [], incoming: plan.conflicts, boardShip: boardShipsFromLegs(legs || [], today, SHIP_OF), shipOf: SHIP_OF, agree, present });
  const openInserted = flags.insert.filter(c => c.resolved === 0).length;
  const proj = reconcileProjections({ projections: projections || [], registry, today, shipOf: SHIP_OF });

  const importRunId = crypto.randomUUID();
  const stmts = [];
  stmts.push(env.DB.prepare(
    "INSERT INTO import_run (id,file_hash,filename,rows_seen,rows_upserted,conflicts,run_by,run_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(importRunId, file_hash, plan.importRun.filename, plan.importRun.rows_seen,
      plan.importRun.rows_upserted, openInserted, run_by, run_at));
  for (const c of flags.close) {
    stmts.push(env.DB.prepare("UPDATE sync_conflict SET resolved=? WHERE id=? AND resolved=0").bind(AUTO_CLOSED, c.id));
  }

  for (const u of plan.crewUpdates) {
    if (!CREW_WRITABLE.has(u.field)) continue; // hard whitelist — no vessel_observed, no injection
    stmts.push(env.DB.prepare(`UPDATE crew SET ${u.field}=?, updated_at=? WHERE agency_id=?`)
      .bind(u.value ?? null, run_at, u.agency_id));
  }
  // D3 accepted: the manual value is superseded by the ratified TDG value. Clear ONLY that field
  // (the rest of the override row — retired flag, notes, other fields — stays), else the override
  // keeps winning at read time and the accept is a no-op on the card. The clear is bound to the
  // value Rita reviewed (`IS ?`): if someone changed the card between stage and apply, that newer
  // manual value is left alone and reported as skipped, never wiped unseen.
  const clears = (plan.overrideClears || []).filter(o => OVR_CLEARABLE.has(o.field));
  const clearIdx = [];
  for (const o of clears) {
    clearIdx.push(stmts.length);
    stmts.push(env.DB.prepare(`UPDATE crew_override SET ${o.field}=NULL, updated_at=? WHERE agency_id=? AND ${o.field} IS ?`)
      .bind(run_at, o.agency_id, o.expect ?? null));
  }
  // D1 amendment (2026-09-15): an explicit per-row "Take TDG" adopts the file's ship into the registry.
  // Fixed statement, no column interpolation, fed ONLY by plan.shipTakes (which only the ship_flag tier
  // with decision "take" can populate). The manual override ship is cleared with it — else the override
  // keeps winning at read time and the take never reaches the card (the same lesson as D3).
  // A Retired tag the file contradicts (TDG has them On board / Earmarked): the tag and the manual status kept
  // with it come off — bound to "still tagged", so a tag someone cleared since the review is left alone.
  for (const u of plan.unretire || []) {
    stmts.push(env.DB.prepare("UPDATE crew_override SET retired=0, status=NULL, updated_at=? WHERE agency_id=? AND COALESCE(retired,0)=1")
      .bind(run_at, u.agency_id));
  }
  for (const t of plan.shipTakes || []) {
    stmts.push(env.DB.prepare("UPDATE crew SET vessel_observed=?, updated_at=? WHERE agency_id=?")
      .bind(t.value ?? null, run_at, t.agency_id));
    stmts.push(env.DB.prepare("UPDATE crew_override SET vessel_observed=NULL, updated_at=? WHERE agency_id=? AND vessel_observed IS NOT NULL")
      .bind(run_at, t.agency_id));
  }
  for (const n of plan.newCrew) {
    const vals = INSERT_COLS.map(c =>
      c === "id" ? crypto.randomUUID()
        : c === "created_at" || c === "updated_at" ? run_at
          : (n[c] ?? null));
    stmts.push(env.DB.prepare(
      `INSERT INTO crew (${INSERT_COLS.join(",")}) VALUES (${INSERT_COLS.map(() => "?").join(",")})`).bind(...vals));
  }
  for (const c of flags.insert) {
    stmts.push(env.DB.prepare(
      "INSERT INTO sync_conflict (id,import_run_id,agency_id,field,old_value,new_value,resolved,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), importRunId, c.agency_id, c.field, str(c.old_value), str(c.new_value), c.resolved, run_at));
  }
  // THE LOOP CLOSES FROM THE REGISTRY TOO (Miguel, 5 Oct 2026). The file's row per crew is kept, and the
  // board derives each projection's verdict from it at read time: one the file confirms aboard turns
  // green by itself; one it contradicts is flagged ON THE CARD; nothing is removed (§6: flag, never
  // silently fix). crew, Counter and override rows are untouched, and the Counter still absorbs the
  // card when it finally carries the leg.
  let kept = 0;
  for (const r of registry) {
    if (!r || !r.agency_id) continue;
    stmts.push(snapshotStmt(env, r, run_at, importRunId));
    kept++;
  }
  // A crew the latest file does NOT carry has no word in it: their old snapshot row goes, so the board
  // never shows a previous file's verdict as current (silence is not a verdict). Only when this body
  // actually carried the file's rows — an empty list (an old cached page) must not wipe the table.
  if (kept) stmts.push(env.DB.prepare("DELETE FROM registry_snapshot WHERE import_run_id IS NOT ?").bind(importRunId));

  const results = await env.DB.batch(stmts);
  // A clear that matched 0 rows means the manual value moved since the review; count it as skipped.
  let override_cleared = 0;
  for (const i of clearIdx) { const m = results && results[i] && results[i].meta; if (!m || m.changes == null || m.changes > 0) override_cleared++; }
  const res = {
    ok: true, import_run_id: importRunId,
    applied: plan.crewUpdates.length, added: plan.newCrew.length,
    override_cleared, override_skipped: clears.length - override_cleared,
    ship_taken: (plan.shipTakes || []).length, unretired: (plan.unretire || []).length,
    open_conflicts: openInserted, ship_flags: flags.counts, board_unavailable, droppedShipWrites: plan.droppedShipWrites,
    projections: { counts: proj.counts, items: proj.items.map(i => ({ id: i.id, sc: i.sc, crew_name: i.crew_name, ship: i.ship, verdict: i.verdict, file: i.file })) },
  };
  res.summary = applySummary(res); // ONE sentence for both import screens (they used to each compose their own)
  return J(res);
}

// The post-apply sentence, worded once from the counters. Both import screens render it verbatim.
export function applySummary(r) {
  const n = (k, one, many) => k === 1 ? "1 " + one : k + " " + many;
  const parts = ["Applied " + n(r.applied, "change", "changes"), "added " + n(r.added, "crew", "crew"), n(r.open_conflicts, "flag", "flags") + " for the board"];
  const f = r.ship_flags || {};
  const closed = [];
  if (f.closed_board_matches) closed.push(n(f.closed_board_matches, "already matched the board", "already matched the board"));
  if (f.closed_superseded) closed.push(n(f.closed_superseded, "superseded by this file", "superseded by this file"));
  if (f.closed_dismissed) closed.push(n(f.closed_dismissed, "dismissed", "dismissed"));
  if (f.closed_taken) closed.push(n(f.closed_taken, "settled by taking the file's ship", "settled by taking the file's ship"));
  if (f.closed_file_agrees) closed.push(n(f.closed_file_agrees, "the file now agrees with the registry", "the file now agrees with the registry"));
  if (f.closed_reappeared) closed.push(n(f.closed_reappeared, "crew back in the file", "crew back in the file"));
  if (closed.length) parts.push("earlier flags closed: " + closed.join(", "));
  if (r.board_unavailable) parts.push("board unavailable this run (no flag closed on the board rule)");
  if (r.ship_taken) parts.push(n(r.ship_taken, "ship taken from the file", "ships taken from the file") + " (registry updated)");
  if (r.unretired) parts.push(n(r.unretired, "Retired tag", "Retired tags") + " cleared (TDG has them active)");
  if (r.override_cleared) parts.push(n(r.override_cleared, "manual entry", "manual entries") + " replaced by the file" + (r.override_skipped ? " (" + n(r.override_skipped, "changed", "changed") + " since review, left alone)" : ""));
  const pj = r.projections && r.projections.counts ? projectionSummary(r.projections.counts) : "";
  if (pj) parts.push(pj);
  parts.push("logged to import history");
  return parts.join(" · ") + ".";
}

// Router — mirrors relief_api.handleRelief(request, url, env): returns a Response or null.
// worker.js delegates to this exactly like it does handleRelief (same session gate applies).
// /apply mutates crew AND (on an accepted D3) crew_override — MONEY_USERS only (Miguel + Rita).
// Any signed-in user may view the page and stage (stage writes nothing).
export async function handleCrewImport(request, url, env, session, deps) {
  const p = url.pathname;
  if (p === "/api/crew/import" && request.method === "GET") return crewImportPage();
  if (p === "/api/crew/import/stage" && request.method === "POST") return apiCrewImportStage(request, env, deps);
  if (p === "/api/crew/import/apply" && request.method === "POST") {
    if (!isMoneyUser(session && session.email)) return J({ ok: false, error: "money_users_only" }, 403);
    return apiCrewImportApply(request, env, deps);
  }
  return null;
}
