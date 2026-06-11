// Rotation board grouping — pure, testable. Groups crew for an at-a-glance view.
// Uses the data already in D1 (status, vessel_observed). Authoritative vessel is
// via assignment once contracts exist; this is the observed-state board.

const STATUS_ORDER = ["On board", "On Vacation", "Earmarked", "Inactive"];

export function buildRotationBoard(rows) {
  const byStatus = {};
  for (const s of STATUS_ORDER) byStatus[s] = [];
  const other = [];
  const byVessel = {};

  for (const c of rows || []) {
    const item = {
      agency_id: c.agency_id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
      vessel: c.vessel_observed || "—",
      status: c.status || "Unknown",
      rank: c.rank_override || c.rank_observed || null,
    };
    if (byStatus[item.status]) byStatus[item.status].push(item);
    else other.push(item);

    const v = item.vessel;
    (byVessel[v] = byVessel[v] || []).push(item);
  }

  const counts = {};
  for (const s of STATUS_ORDER) counts[s] = byStatus[s].length;
  counts.other = other.length;
  counts.total = (rows || []).length;
  counts.vessels = Object.keys(byVessel).filter((v) => v !== "—").length;

  return { byStatus, other, byVessel, counts };
}
