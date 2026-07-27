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
            l.embark, l.disembark, l.ours, l.is_current,
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
    };
    if (r.embark) o.embark = r.embark;
    if (r.disembark) o.disembark = r.disembark;
    return o;
  });
}
