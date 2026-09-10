// Crew data-quality gaps — pure, testable. No DB, no side effects.
//
// WHY THIS EXISTS (2026-09-10)
// The Data page reports how MANY rows each dataset has. Volume is not quality: on the day this was
// written, 20 of ~57 active crew had no vessel on file and NINE of those were marked "On board" —
// a seafarer the console believes is at sea on a ship it cannot name. Nothing anywhere said so.
// The counts all looked healthy because counting rows cannot see a hole inside them.
//
// This is the same idea roster_export.coverage() already applies at the timecard boundary, brought
// back into the console. That comment is worth repeating here: a crew member missing the field a
// downstream system matches on does not show up as an error, they silently vanish from the
// denominator — and "9 of 41 submitted" reads as good news when it should read as an unknown.
//
// DELIBERATELY REPORT-ONLY. It writes nothing and fixes nothing. Crew data changes only through the
// TDG AdvancedQuery importer (CLAUDE.md §6 and Miguel's standing rule) — the job here is to make the
// gap impossible to miss, so it reaches the next import instead of sitting unseen.

/** Statuses that mean the crew is off the fleet, so a missing field is not an action item. */
const OFF_FLEET = new Set(["Retired", "Inactive"]);

const has = (v) => v != null && String(v).trim() !== "";

/**
 * rows: [{ agency_id, status, vessel, email, ship_crew_id }] — status ALREADY DERIVED by the
 * caller (crewStatus + boardLegs), so this agrees with the dashboard and crew list rather than
 * re-deriving from a raw column. Returns counts plus the agency_ids behind each, capped, so the
 * page can name names instead of only showing a number nobody can act on.
 */
export function crewDataGaps(rows, opts = {}) {
  const cap = opts.cap == null ? 25 : opts.cap;
  const active = (rows || []).filter((r) => r && !OFF_FLEET.has(r.status));
  const onBoard = active.filter((r) => r.status === "On board");

  const pick = (list, test) => {
    const hits = list.filter(test);
    return { count: hits.length, ids: hits.slice(0, cap).map((r) => r.agency_id) };
  };

  return {
    active: active.length,
    on_board: onBoard.length,
    // The worst one first: the console says they are at sea, on a ship it cannot name.
    on_board_without_vessel: pick(onBoard, (r) => !has(r.vessel)),
    active_without_vessel: pick(active, (r) => !has(r.vessel)),
    // No address = auto-timing cannot send them instructions or a sign-off link. auto_send already
    // reports these daily in its digest; surfacing them here means they are visible without waiting
    // for a crew member to reach the T-14 window.
    active_without_email: pick(active, (r) => !has(r.email)),
    // The bridge to the client's own systems. Missing = unmatchable downstream (see roster_export).
    active_without_ship_crew_id: pick(active, (r) => !has(r.ship_crew_id)),
  };
}

/** True when anything needs attention — lets the page stay quiet on a clean day. */
export function hasGaps(g) {
  if (!g) return false;
  return ["on_board_without_vessel", "active_without_vessel", "active_without_email", "active_without_ship_crew_id"]
    .some((k) => (g[k] || {}).count > 0);
}
