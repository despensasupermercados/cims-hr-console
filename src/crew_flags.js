// Ship-flag reconciliation — pure, testable. Decides which open "ship flag" sync_conflict rows
// (field = vessel_observed: the TDG file names a ship the registry does not) can close on their
// own, and which of a new import's flags are worth inserting at all.
//
// Why (2026-09-05, Miguel's decision): every weekly AdvancedQuery drop re-raised the same flags —
// prod held 411 open rows for only 58 distinct crew+ship pairs — and nothing ever closed one. A flag
// that the relief board already satisfies (the crew IS on the ship the file names) carries no
// information; a flag repeated for the same crew and ship is noise; a flag for the same crew and a
// DIFFERENT ship is superseded by the newer file. Ship allocation stays Rita's: this never writes
// vessel_observed (D1) — it only decides what remains open for her to reconcile on the board.
//
// resolved values on sync_conflict: 0 open · 1 seen/decided by a person · 2 closed automatically.

export const AUTO_CLOSED = 2;

// open:      existing open ship flags [{ id, agency_id, new_value }]
// incoming:  ALL conflicts the apply plan wants to write (any field, any resolved)
// boardShip: (agency_id) -> canonical short ship the live board places the crew on today, or null
// shipOf:    (raw vessel string) -> canonical short ship, or null when unknown
export function reconcileShipFlags({ open = [], incoming = [], boardShip, shipOf }) {
  const canon = (v) => (v == null || v === "" ? null : (shipOf(v) || String(v).trim()));
  const close = [], insert = [];
  const closed = new Set();
  const openBySc = {};
  for (const o of open) (openBySc[o.agency_id] = openBySc[o.agency_id] || []).push(o);
  const closeRow = (o, why) => { if (closed.has(o.id)) return; closed.add(o.id); close.push({ id: o.id, why }); };

  // 1) Open flags the board already satisfies: the crew is on the ship the file named.
  for (const o of open) {
    const b = boardShip(o.agency_id);
    if (b && canon(o.new_value) === b) closeRow(o, "board_matches");
  }
  // 2) This import's flags.
  for (const c of incoming) {
    if (c.field !== "vessel_observed") { insert.push(c); continue; }
    const want = canon(c.new_value);
    const mine = openBySc[c.agency_id] || [];
    if (c.resolved !== 0) {
      // Dismissed by Rita on this review: the audit row is kept, and older open copies close with it.
      for (const o of mine) if (canon(o.new_value) === want) closeRow(o, "dismissed");
      insert.push(c);
      continue;
    }
    if (want && boardShip(c.agency_id) === want) continue;                 // board agrees: nothing to flag
    if (mine.some((o) => !closed.has(o.id) && canon(o.new_value) === want)) continue; // already open: no duplicate
    for (const o of mine) closeRow(o, "superseded");                       // a different ship was flagged before
    insert.push(c);
  }
  const why = (w) => close.filter((x) => x.why === w).length;
  return {
    close, insert,
    counts: { closed_board_matches: why("board_matches"), closed_superseded: why("superseded"), closed_dismissed: why("dismissed"),
      skipped_board_matches: incoming.filter((c) => c.field === "vessel_observed" && c.resolved === 0).length - insert.filter((c) => c.field === "vessel_observed" && c.resolved === 0).length },
  };
}

// The ship each crew is on TODAY per the live board legs (SHIP_HISTORY shape), canonicalised.
export function boardShipsFromLegs(legs, today, shipOf) {
  const m = {};
  for (const h of legs || []) {
    if (!h || !h.ours || !h.sc || !h.on || h.on > today) continue;
    if (h.off && h.off < today) continue;
    const s = shipOf(h.ship) || (h.ship ? String(h.ship).trim() : null);
    if (s) m[h.sc] = s;
  }
  return (sc) => m[sc] || null;
}
