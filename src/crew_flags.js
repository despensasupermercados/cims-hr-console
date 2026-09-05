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

import { normShip, AZ_DISP, AZAMARA_SHORT } from "./shipname.js";

export const AUTO_CLOSED = 2;

// STRICT ship matcher for auto-closing: a real hull name must appear as a whole word of the raw
// string ("Harmony of the Seas" -> Harmony, "MV AZAMARA QUEST" -> Quest, "Celebrity Apex" -> Apex).
// The board's general canonicaliser (canonShipWith) matches by SUBSTRING and never returns null —
// "MV STARLIGHT" would read as "Star" — which is fine for grouping a board section but not for
// closing a flag nobody can reopen. Unknown or ambiguous -> null -> no auto-close on that crew.
export function strictShipMatcher(vesselRef) {
  const disp = {};
  for (const v of vesselRef || []) { const k = normShip(v.name); if (k) disp[k] = v.name; }
  for (const k of AZAMARA_SHORT) disp[k] = AZ_DISP[k];
  return (raw) => {
    const words = String(raw == null ? "" : raw).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const hits = new Set();
    for (const w of words) if (disp[w]) hits.add(disp[w]);
    // multi-word hull names ("of the seas" is a suffix, never part of the key): join adjacent words too
    for (let i = 0; i + 1 < words.length; i++) { const k = words[i] + words[i + 1]; if (disp[k]) hits.add(disp[k]); }
    return hits.size === 1 ? [...hits][0] : null;
  };
}

// open:      existing open ship flags [{ id, agency_id, new_value }]
// incoming:  ALL conflicts the apply plan wants to write (any field, any resolved)
// boardShip: (agency_id) -> canonical short ship the live board places the crew on today, or null
// shipOf:    (raw vessel string) -> canonical short ship, or null when unknown
export function reconcileShipFlags({ open = [], incoming = [], boardShip, shipOf }) {
  // Equality key for "same ship": the strict hull name when known, else the normalised raw text
  // (so two identical unknown strings still dedupe; an unknown never equals a board ship).
  const canon = (v) => (v == null || v === "" ? null : (shipOf(v) || ("raw:" + normShip(v))));
  const close = [], insert = [];
  const closed = new Set();
  const openBySc = {};
  for (const o of open) (openBySc[o.agency_id] = openBySc[o.agency_id] || []).push(o);
  const closeRow = (o, why) => { if (closed.has(o.id)) return; closed.add(o.id); close.push({ id: o.id, why }); };
  const counts = { closed_board_matches: 0, closed_superseded: 0, closed_dismissed: 0, skipped_board_matches: 0, skipped_duplicate: 0 };

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
    // The newest file is the current word on what TDG thinks: every open flag naming a DIFFERENT
    // ship for this crew is superseded — whether or not the new flag itself gets inserted.
    for (const o of mine) if (canon(o.new_value) !== want) closeRow(o, "superseded");
    if (want && boardShip(c.agency_id) === want) { counts.skipped_board_matches++; continue; } // board agrees: nothing to flag
    if (mine.some((o) => !closed.has(o.id) && canon(o.new_value) === want)) { counts.skipped_duplicate++; continue; } // already open
    insert.push(c);
  }
  for (const x of close) counts["closed_" + x.why]++;
  return { close, insert, counts };
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
