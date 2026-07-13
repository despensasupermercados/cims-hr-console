// Crew import APPLY planner — pure, testable. Turns Rita's per-item decisions (from the
// review screen) into a concrete, side-effect-free PLAN of DB operations. The route layer
// executes the plan in one D1 transaction; keeping the decision logic here makes it testable
// and keeps the money-adjacent Worker thin.
//
// Enforces the session decisions (docs/CREW_IMPORT_DECISIONS.md):
//   D1  vessel_observed is NEVER in crewUpdates (belt-and-suspenders filter). Ship changes
//       become sync_conflict flags only. (Allowed on a NEW-crew insert: no allocation exists yet.)
//   D2  cert fields default 'accept'.
//   D3  override_conflict + status default 'keep'; kept OR accepted, both write an audit
//       sync_conflict row (resolved=1) so we can prove Rita saw it.
//   D4  departed default 'flag' (open sync_conflict, resolved=0); never a delete.
//   D5  minor auto-applies regardless of decision.

const key = (agency_id, field) => `${agency_id}:${field}`;

export function buildApplyPlan(review, decisions = {}, meta = {}) {
  const dec = (k, d) => (decisions[k] ?? d);
  const g = (review && review.groups) || {};
  const crewUpdates = [];   // { agency_id, field, value }
  const newCrew = [];       // full mapped field object
  const conflicts = [];     // { agency_id, field, old_value, new_value, resolved }

  // cert (incl. name/email/rank) — default accept
  for (const it of g.cert || []) {
    if (dec(key(it.agency_id, it.field), "accept") === "accept")
      crewUpdates.push({ agency_id: it.agency_id, field: it.field, value: it.new });
  }
  // status — default keep; always audit
  for (const it of g.critical || []) {
    if (dec(key(it.agency_id, it.field), "keep") === "accept")
      crewUpdates.push({ agency_id: it.agency_id, field: it.field, value: it.new });
    conflicts.push({ agency_id: it.agency_id, field: it.field, old_value: it.old, new_value: it.new, resolved: 1 });
  }
  // override conflict — default keep (protect manual edit); always audit
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

  return { crewUpdates: safeUpdates, newCrew, conflicts, importRun, droppedShipWrites };
}
