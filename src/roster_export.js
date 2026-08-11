// src/roster_export.js
//
// Read-only roster export for cims-timecard (rest-hour compliance records).
//
// WHY THIS EXISTS
// The timecard app must not keep its own copy of the crew list. A second roster
// drifts, and a drifted roster chases the wrong people for time cards and misses
// the right ones. It draws from here instead — the parts pattern.
//
// AUTHORITATIVE SOURCES (per the glossary in maria.js)
//   crew            identity, docs, status, ship_crew_id
//   crew_override   Rita's manual edits; ALWAYS win, but only when not retired
//   ship_leg        TRUTH for rotation/movements. brand + ship_short live here.
// NEVER keyman_contract3 — bonus/scoring only, never movements (P3.13 audit).
//
// WHAT LEAVES
// Identity, ship, status, email, leg dates. Nothing else. No passport, SIRB,
// visa, medical, DOB or phone crosses this boundary — the timecard app has no
// use for them and every field exported is a field that can leak.

/** Columns this endpoint is permitted to emit. Anything not listed cannot leave. */
export const EXPORT_FIELDS = [
  'ship_crew_id', 'agency_id', 'first_name', 'last_name',
  'rank', 'ship', 'brand', 'status', 'email', 'sign_on', 'sign_off',
];

export const ROSTER_SQL = `
  SELECT c.ship_crew_id,
         c.agency_id,
         COALESCE(NULLIF(o.first_name,''), c.first_name) AS first_name,
         COALESCE(NULLIF(o.last_name,''),  c.last_name)  AS last_name,
         COALESCE(NULLIF(o.rank_override,''), c.rank_override, c.rank_observed) AS rank,
         COALESCE(l.ship_short, NULLIF(o.vessel_observed,''), c.vessel_observed) AS ship,
         l.brand,
         COALESCE(NULLIF(o.status,''), c.status) AS status,
         COALESCE(NULLIF(o.email,''),  c.email)  AS email,
         l.on_date  AS sign_on,
         l.off_date AS sign_off
    FROM crew c
    LEFT JOIN crew_override o
           ON o.agency_id = c.agency_id
          AND COALESCE(o.retired,0) = 0
    LEFT JOIN ship_leg l
           ON l.crew_id = c.id
          AND l.is_current = 1
          AND l.ours = 1
   WHERE c.redacted = 0
`;

/**
 * Coverage counters travel with the payload on purpose.
 *
 * The timecard app matches crew to their Kronos card by ship_crew_id. A crew
 * member without one cannot be matched at all — they silently vanish from the
 * denominator, and "9 of 41 submitted" reads as good news when it should read
 * as an unknown. Reporting the gap is what stops a coverage hole from looking
 * like compliance.
 */
export function coverage(rows) {
  const onBoard = rows.filter((r) => r.status === 'On board');
  const has = (v) => v != null && v !== '';
  return {
    total: rows.length,
    on_board: onBoard.length,
    on_board_without_ship_crew_id: onBoard.filter((r) => !has(r.ship_crew_id)).length,
    on_board_without_email: onBoard.filter((r) => !has(r.email)).length,
    on_board_without_current_leg: onBoard.filter((r) => !has(r.sign_on)).length,
  };
}

/**
 * GET /api/roster/export
 *
 * Guarded by a shared-key header, NOT by a session: the caller is a Worker, not
 * a person. Must be dispatched BEFORE the session gate. See docs/ROSTER_EXPORT.md.
 */
export async function apiRosterExport(request, env) {
  const key = request.headers.get('X-Roster-Key');
  // Constant-time-ish: reject a missing secret outright rather than comparing to undefined.
  if (!env.ROSTER_KEY || key !== env.ROSTER_KEY) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
  }

  const { results } = await env.DB.prepare(ROSTER_SQL).all();
  const crew = (results || []).map((r) => {
    const out = {};
    for (const f of EXPORT_FIELDS) out[f] = r[f] ?? null;
    return out;
  });

  return new Response(JSON.stringify({ crew, coverage: coverage(crew) }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
