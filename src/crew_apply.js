// Crew import APPLY planner — pure, testable. Turns Rita's per-item decisions (from the
// review screen) into a concrete, side-effect-free PLAN of DB operations. The route layer
// executes the plan in one D1 transaction; keeping the decision logic here makes it testable
// and keeps the money-adjacent Worker thin.
//
// Enforces the session decisions (docs/CREW_IMPORT_DECISIONS.md):
//   D1  vessel_observed is NEVER in crewUpdates (belt-and-suspenders filter). Ship changes
//       become sync_conflict flags only. (Allowed on a NEW-crew insert: no allocation exists yet.)
//   D2  cert fields default 'accept'.
//   D3  override_conflict defaults 'keep'; kept OR accepted, both write an audit
//       sync_conflict row (resolved=1) so we can prove Rita saw it.
//   D4  departed default 'flag' (open sync_conflict, resolved=0); never a delete.
//   D5  minor auto-applies regardless of decision.
//   D6  status defaults 'accept' (TDG is the source of truth). An APPLIED status closes the
//       conflict (resolved=1: registry and TDG now agree). A KEPT status leaves it OPEN
//       (resolved=0) — the registry deliberately disagrees with the source of truth and
//       somebody has to go fix TDG. See the note on resolved-means-agreement below.
//   D7  rekeyed (matched on cruise-line id under a different agency id) is a flag only —
//       agency_id is the roster's stable key and is never rewritten by an import.
//
// WHY resolved=1 CHANGED MEANING
// Until 2026-08-24 a status row was written resolved=1 whether or not the new value was
// applied — "resolved" meant "the reviewer saw it". That made the audit table actively
// misleading: 198 status rows all marked resolved while 32 crew carried a stale status for
// six weeks, and nothing in the system could tell you the difference. resolved=1 now means
// exactly one thing: THE REGISTRY AGREES WITH THE SOURCE OF TRUTH. Anything unresolved is
// real, outstanding work.

const key = (agency_id, field) => `${agency_id}:${field}`;

export function buildApplyPlan(review, decisions = {}, meta = {}) {
  const dec = (k, d) => (decisions[k] ?? d);
  const g = (review && review.groups) || {};
  const crewUpdates = [];   // { agency_id, field, value }
  const newCrew = [];       // full mapped field object
  const conflicts = [];     // { agency_id, field, old_value, new_value, resolved }
  let statusApplied = 0, statusKept = 0;

  // cert (incl. name/email/rank) — default accept
  for (const it of g.cert || []) {
    if (dec(key(it.agency_id, it.field), "accept") === "accept")
      crewUpdates.push({ agency_id: it.agency_id, field: it.field, value: it.new });
  }
  // D6 status — TDG-authoritative, default ACCEPT; always audited either way.
  for (const it of g.critical || []) {
    const applied = dec(key(it.agency_id, it.field), "accept") === "accept";
    if (applied) { crewUpdates.push({ agency_id: it.agency_id, field: it.field, value: it.new }); statusApplied++; }
    else statusKept++;
    conflicts.push({
      agency_id: it.agency_id, field: it.field,
      old_value: it.old,
      new_value: applied ? it.new : `KEPT ${it.old} — source of truth says ${it.new}`,
      resolved: applied ? 1 : 0,
    });
  }
  // override conflict — default keep (protect manual edit); always audit. A deliberate,
  // standing divergence, so it is resolved either way.
  for (const it of g.override_conflict || []) {
    if (dec(key(it.agency_id, it.field), "keep") === "accept")
      crewUpdates.push({ agency_id: it.agency_id, field: it.field, value: it.new });
    conflicts.push({ agency_id: it.agency_id, field: it.field, old_value: it.old, new_value: it.new, resolved: 1 });
  }
  // ship flag — NEVER a crew write; open to-do unless dismissed
  for (const it of g.ship_flag || []) {
    const dismissed = dec(`ship:${it.agency_id}`, "flag") === "dismiss";
    conflicts.push({ agency_id: it.agency_id, field: "vessel_observed", old_value: it.old, new_value: it.new, resolved: dismissed ? 1 : 0 });
  }
  // D7 rekeyed — the file used the cruise-line id for someone we already hold. We matched
  // them (so no duplicate is inserted) and raise an open flag to get the export fixed.
  for (const it of g.rekeyed || []) {
    conflicts.push({
      agency_id: it.agency_id, field: "identity",
      old_value: it.agency_id,
      new_value: `file keyed this crew as ${it.incoming_id} (cruise-line id ${it.ship_crew_id || "?"}) — matched, not duplicated`,
      resolved: 0,
    });
  }
  // minor — auto-apply
  for (const it of g.minor || []) {
    crewUpdates.push({ agency_id: it.agency_id, field: it.field, value: it.new });
  }
  // new crew — default add (vessel_observed allowed here: initial observed value, no allocation yet)
  for (const it of g.new || []) {
    if (dec(`new:${it.agency_id}`, "add") === "add")
      newCrew.push({ agency_id: it.agency_id, ...(it.fields || {}) });
  }
  // departed — flag only, default flag
  for (const it of g.departed || []) {
    const dismissed = dec(`departed:${it.agency_id}`, "flag") === "dismiss";
    conflicts.push({ agency_id: it.agency_id, field: "presence", old_value: (it.last && it.last.vessel_observed) || null, new_value: null, resolved: dismissed ? 1 : 0 });
  }

  // D1 belt-and-suspenders: no vessel_observed may ever reach a crew UPDATE.
  const safeUpdates = crewUpdates.filter(u => u.field !== "vessel_observed");
  const droppedShipWrites = crewUpdates.length - safeUpdates.length;

  const touched = new Set(safeUpdates.map(u => u.agency_id).concat(newCrew.map(n => n.agency_id)));
  const importRun = {
    file_hash: meta.file_hash ?? null,
    filename: meta.filename ?? null,
    rows_seen: meta.rows_seen ?? null,
    rows_upserted: touched.size,
    conflicts: conflicts.filter(c => c.resolved === 0).length,
    run_by: meta.run_by ?? null,
    run_at: meta.run_at ?? null,
  };

  return { crewUpdates: safeUpdates, newCrew, conflicts, importRun, droppedShipWrites, statusApplied, statusKept };
}
