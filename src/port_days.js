// port_days.js — the itinerary rows a board actually needs (2026-09-15).
//
// vessel_port_day holds one row per ship per day for ~2.5 years (40,553 rows on prod, ~5 MB as a
// D1 result). Until today rotationSections and the relief board each read the WHOLE table on every
// request, and the Keyman page issues both after every save — that was the "takes forever to save"
// (measured locally: 0.05 s → 0.4 s per route with the rows loaded; on remote D1 the transfer is
// the larger part). The city resolver (city_resolver.js) only ever looks at the card's own dates
// ±1 day on the card's own ship, so that is all we fetch: every date a card can carry — Counter
// sign-on / projected / actual sign-off, Rita's edits, the assignments (open and ended), the
// ship_leg snapshot and any relief override — joined to the itinerary on ship + date ±1.
//
// D1 caps a compound SELECT at five terms, so the date sources are split across three queries that
// run together in the board's wave. The Azamara sign-off projection in the relief board needs the
// FUTURE turnarounds of the four Azamara hulls (relief_api.js AZAMARA_MONTHS): that is its own small
// query. Pinned by test/port_days.test.js (real SQLite) and test/perf_invariants.test.js.
const COLS = "v.brand, v.ship_short, v.berth_date, v.port_name, v.is_sea, v.is_turnaround";
const JOIN = "ON x.s IS NOT NULL AND x.d IS NOT NULL AND v.ship_short = x.s AND v.berth_date BETWEEN date(x.d,'-1 day') AND date(x.d,'+1 day')";

// Counter contracts + Rita's contract edits (ship names are the short vessel name in both).
export const PORT_DAYS_CONTRACTS_SQL =
  `SELECT DISTINCT ${COLS} FROM vessel_port_day v JOIN (
     SELECT ship AS s, sign_on AS d FROM keyman_contract3
     UNION SELECT ship, proj_off FROM keyman_contract3
     UNION SELECT ship, act_off FROM keyman_contract3
     UNION SELECT ship, sign_on FROM contract_edit
     UNION SELECT ship, sign_off FROM contract_edit
   ) x ${JOIN}`;
// The relief board's assignments (open and ended) + the ship_leg snapshot (port memory / orphans).
export const PORT_DAYS_ASSIGNMENTS_SQL =
  `SELECT DISTINCT ${COLS} FROM vessel_port_day v JOIN (
     SELECT COALESCE(ve.name, a.vessel_name) AS s, a.sign_on AS d FROM assignment a LEFT JOIN vessel ve ON ve.id = a.vessel_id
     UNION SELECT COALESCE(ve.name, a.vessel_name), a.planned_sign_off FROM assignment a LEFT JOIN vessel ve ON ve.id = a.vessel_id
     UNION SELECT COALESCE(ve.name, a.vessel_name), a.actual_sign_off FROM assignment a LEFT JOIN vessel ve ON ve.id = a.vessel_id
     UNION SELECT ship_short, on_date FROM ship_leg
     UNION SELECT ship_short, off_date FROM ship_leg
   ) x ${JOIN}`;
// Rita's relief overrides (leg_flags.override_off_date, keyed "<brand>|<ship>").
export const PORT_DAYS_FLAGS_SQL =
  `SELECT DISTINCT ${COLS} FROM vessel_port_day v JOIN (
     SELECT substr(vessel_key, instr(vessel_key, '|') + 1) AS s, override_off_date AS d FROM leg_flags
   ) x ${JOIN}`;
// Future crew-change ports of the Azamara hulls (their printer sign-off is projected onto one).
export const AZAMARA_TURNAROUNDS_SQL =
  `SELECT brand, ship_short, berth_date, port_name FROM vessel_port_day
    WHERE brand = 'Azamara' AND is_turnaround = 1 AND is_sea = 0 AND port_name IS NOT NULL
      AND berth_date >= date(?1, '-1 day')
    ORDER BY ship_short, berth_date`;

// One flat, de-duplicated list in the shape groupPortDays()/resolveCity() expect.
export async function fetchBoardPortDays(env) {
  const [a, b, c] = await Promise.all([
    env.DB.prepare(PORT_DAYS_CONTRACTS_SQL).all(),
    env.DB.prepare(PORT_DAYS_ASSIGNMENTS_SQL).all(),
    env.DB.prepare(PORT_DAYS_FLAGS_SQL).all().catch(() => ({ results: [] })), // leg_flags may not exist yet
  ]);
  const seen = new Set(), out = [];
  for (const r of [].concat(a.results || [], b.results || [], c.results || [])) {
    const k = r.brand + "|" + r.ship_short + "|" + r.berth_date;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out;
}

export async function fetchAzamaraTurnarounds(env, today) {
  const { results } = await env.DB.prepare(AZAMARA_TURNAROUNDS_SQL).bind(today).all();
  return results || [];
}
