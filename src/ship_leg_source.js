// src/ship_leg_source.js
// Phase 2 (P3.12): the board reads leg data from the ship_leg D1 table (the write-master,
// spec §2.1/§6) instead of the SHIP_HISTORY code constant. This module returns rows in the
// EXACT SHIP_HISTORY shape, so the existing readers only swap their data source — no logic change.
//
// Flip is a DATA change (no redeploy): app_config key 'board_source' = 'ship_leg' | 'ship_history'.
// Default (missing/anything else) = 'ship_history' — the current behavior, fail-safe.

const BRAND_SHORT = {
  "Royal Caribbean": "Royal",
  Celebrity: "Celebrity",
  Azamara: "Azamara",
  NCL: "NCL",
};

// Which source the board should read. Reads app_config; fails safe to 'ship_history'.
export async function boardSource(env) {
  try {
    const r = await env.DB.prepare(
      "SELECT value FROM app_config WHERE key='board_source'"
    ).first();
    return r && r.value ? r.value : "ship_history";
  } catch {
    return "ship_history";
  }
}

// Returns SHIP_HISTORY-shaped rows from ship_leg:
//   { ship, name, sc, ours, on, off, brand, is_current[, embark][, disembark] }
// off === null  => TBA sign-off (readers already treat null off as still-onboard).
//
// EXCLUDES projected forward legs (2026-07-27). Unlike every other ship_leg
// reader this one has no `is_current = 1` filter, so the is_current=0 rows written
// by src/leg_projection.js WOULD flow into HIST -> scheduleBySc / schEnr / histByShip
// in rotationSections. A forward leg always has the latest off_date, so it would win
// the schEnr date-enrichment race and silently rewrite a crew member's displayed
// sign-on/sign-off — and, for crew with no keyman leg, their billed days via
// apiBillingMonth. Excluding them here is a NO-OP today (all 48 real rows are
// is_current=1) and keeps this reader admitting genuine history if it is ever
// backfilled.
export async function legsFromShipLeg(env) {
  const { results } = await env.DB.prepare(
    `SELECT l.brand, l.ship_short, l.sc, l.on_date, l.off_date,
            l.embark, l.disembark, l.ours, l.is_current, l.crew_id,
            TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name
       FROM ship_leg l
       LEFT JOIN crew c ON c.id = l.crew_id
      WHERE l.ours = 1
        AND NOT (l.source LIKE 'assignment:%' AND l.is_current = 0)
      ORDER BY l.brand, l.ship_short, l.on_date`
  ).all();
  return (results || []).map((r) => {
    const o = {
      ship: r.ship_short,
      name: r.crew_name || null,
      sc: r.sc,
      ours: !!r.ours,
      on: r.on_date || null,
      off: r.off_date || null,
      brand: BRAND_SHORT[r.brand] || r.brand,
      is_current: !!r.is_current,
      crew_id: r.crew_id || null,
    };
    if (r.embark) o.embark = r.embark;
    if (r.disembark) o.disembark = r.disembark;
    return o;
  });
}

// -----------------------------------------------------------------------------
// Crew currently ABOARD per the relief board (2026-09-04).
//
// ship_leg is a one-time keyman_roster snapshot; nothing writes a CURRENT leg to it any
// more. Every movement since has been recorded by the relief board in `assignment`, and
// leg_projection.js mirrors only the FUTURE ones (is_current=0): the day an assignment
// starts it is "not_future", its projected row is removed, and the crew vanishes from the
// board's current set. Verified read-only on prod 2026-09-04: 13 in-force assignments,
// 13 with no current ship_leg row, 0 overlap. Those 13 derived a wrong status, sat on the
// wrong ship (or in the pool) and were absent from /api/billing/month.
//
// Fixed at the READ layer, same precedence as roster_export.js (3 Sep): an in-force
// assignment (started, not signed off) counts as a current leg — but only for a crew who
// has no current ship_leg row; a current ship_leg still wins every field. One assignment
// per crew (latest sign_on). Nothing is written, is_current is untouched, the DR export and
// the ux_leg_current index are unchanged. Promotion into ship_leg remains Phase 2.
// -----------------------------------------------------------------------------

// The ONLY place the in-force set is read. Mirrors roster_export.ROSTER_SQL's assignment
// arm: started (sign_on <= today), not signed off, exactly one per crew.
export async function fetchCurrentAssignments(env, today) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.sign_on, a.planned_sign_off, a.on_port_seed, a.off_port_seed,
            COALESCE(v.name, a.vessel_name) AS ship, v.brand AS brand,
            c.id AS crew_id, c.agency_id AS sc,
            TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name
       FROM assignment a
       JOIN contract k ON k.id = a.contract_id
       JOIN crew     c ON c.id = k.crew_id
       LEFT JOIN vessel v ON v.id = a.vessel_id
      WHERE a.actual_sign_off IS NULL
        AND a.sign_on <= ?1
        AND a.id = (SELECT a2.id
                      FROM assignment a2
                      JOIN contract k2 ON k2.id = a2.contract_id
                     WHERE k2.crew_id = c.id
                       AND a2.actual_sign_off IS NULL
                       AND a2.sign_on <= ?1
                     ORDER BY a2.sign_on DESC
                     LIMIT 1)
      ORDER BY ship, a.sign_on`
  ).bind(today).all();
  return results || [];
}

// PURE. Merge the current ship_leg rows (SHIP_HISTORY shape, from legsFromShipLeg) with the
// in-force assignment rows (raw, from fetchCurrentAssignments). A crew whose current ship_leg
// row still spans `today` (off null = TBA, or off >= today) is never duplicated. A current
// ship_leg row whose off_date has PASSED does not block: nothing ever flips is_current back to
// 0 (2026-09-05 review), so without this every snapshot crew would be "taken" forever and their
// next relief-board contract would never reach status, the board, or billing. An assignment on
// a ship the board has never seen is still included — a vessel is never invented, but a crew is
// never dropped either: brand is simply null and downstream readers derive brand from VESSEL_REF.
export function mergeBoardLegs(shipLegRows, assignmentRows, today) {
  const legs = shipLegRows || [];
  const taken = new Set();
  const brandByShip = {};
  for (const r of legs) {
    if (r.is_current && (!today || !r.off || r.off >= today)) {
      if (r.sc) taken.add("sc:" + r.sc);
      if (r.crew_id) taken.add("id:" + r.crew_id);
    }
    if (r.ship && r.brand && !brandByShip[r.ship]) brandByShip[r.ship] = r.brand;
  }
  const bySc = new Map(); // one per crew, latest sign_on wins (defensive; the SQL already picks one)
  for (const a of assignmentRows || []) {
    if (!a || !a.sc) continue;
    if (taken.has("sc:" + a.sc) || (a.crew_id && taken.has("id:" + a.crew_id))) continue;
    const prev = bySc.get(a.sc);
    if (prev && (prev.sign_on || "") >= (a.sign_on || "")) continue;
    bySc.set(a.sc, a);
  }
  const out = legs.slice();
  for (const a of bySc.values()) {
    const ship = a.ship == null ? "" : String(a.ship).trim();
    if (!ship) continue; // no vessel at all -> nothing to place; the registry still carries them
    const o = {
      ship,
      name: a.crew_name || null,
      sc: a.sc,
      ours: true,
      on: a.sign_on || null,
      off: a.planned_sign_off || null, // null => TBA sign-off, exactly like a ship_leg row
      brand: (a.brand && (BRAND_SHORT[a.brand] || a.brand)) || brandByShip[ship] || null,
      is_current: true,
      crew_id: a.crew_id || null,
      source: "assignment",
    };
    if (a.on_port_seed) o.embark = a.on_port_seed;   // honest nulls: no homeport guess here
    if (a.off_port_seed) o.disembark = a.off_port_seed;
    out.push(o);
  }
  return out;
}

// Board legs from the database: current ship_leg rows + crew aboard per the relief board.
// Both reads fire together (one Worker->D1 round trip, CLAUDE.md §12).
export async function boardLegsFromDb(env, today) {
  const [legs, asg] = await Promise.all([legsFromShipLeg(env), fetchCurrentAssignments(env, today)]);
  return mergeBoardLegs(legs, asg, today);
}
