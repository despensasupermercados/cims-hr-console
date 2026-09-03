// src/roster_export.js
//
// Read-only roster export for cims-timecard (rest-hour compliance records).
//
// WHY THIS EXISTS
// The timecard app must not keep its own copy of the crew list. A second roster
// drifts, and a drifted roster chases the wrong people for time cards and misses
// the right ones. It draws from here instead — the parts pattern.
//
// THIS ROUTE IS PUBLICLY REACHABLE. READ THIS BEFORE CHANGING IT.
// It must be dispatched BEFORE the console's `/api/` session gate, because the
// caller is a Worker with no session cookie. That means it also answers on the
// public hostname. The shared X-Roster-Key header is therefore the ONLY thing
// standing between the internet and 101 crew names and email addresses.
// Consequences:
//   - the key is a 256-bit random value, compared in constant time below
//   - if it ever leaks, rotate it on BOTH workers in the same change
//   - never widen EXPORT_FIELDS without re-reading this paragraph
//
// AUTHORITATIVE SOURCES (per the glossary in maria.js)
//   crew            identity, docs, status, ship_crew_id
//   crew_override   Rita's manual edits; ALWAYS win, but only when not retired
//   ship_leg        TRUTH for rotation/movements. brand + ship_short live here.
//   assignment      the relief board's record of who is on which hull NOW.
//                   Read ONLY as a fallback where ship_leg has no current leg.
// NEVER keyman_contract3 — bonus/scoring only, never movements (P3.13 audit).
//
// WHY assignment IS READ HERE (3 Sep 2026)
// ship_leg is a one-time keyman_roster snapshot; nothing writes a CURRENT leg to
// it any more. Every crew movement since then has been recorded by the relief
// board in `assignment`, and leg_projection.js mirrors those into ship_leg as
// is_current = 0 — deliberately, because is_current = 1 is the billing-visible
// set and promotion is a separate decision with its own review.
//
// The consequence, live on 2 Sep 2026: eleven crew came through this endpoint
// with a NULL ship and a NULL brand, because their only record of being aboard
// was an assignment row this query could not see. Downstream in cims-timecard a
// crew member with no ship cannot owe a time card, so they were never chased,
// their filed cards stranded with ship='?', and their VESSELS disappeared from
// the client compliance report altogether — Azamara read "2 of 2 ships
// reported" while Journey and Quest were simply absent and Quest's printer was
// holding a confirmed MLC rest-hour violation. A hull that vanishes does not
// merely go unreported; it improves the score.
//
// Miguel, 2 Sep 2026: "the assignment of the ship comes from the hr console.
// that is what dictates the ship of the crew ... if u cant read the ship? u can
// read the crew?? where the crew data comes?? from the hr console."
//
// Scope of the fallback, deliberately narrow:
//   - a CURRENT ship_leg still wins every field. Verified against production:
//     102 rows before, 102 rows after, and every single difference is
//     null -> value. No existing value is overwritten by this change.
//   - only an IN-FORCE assignment counts: already started, not yet signed off.
//     A future join does not place anybody aboard — Alonzo's Ovation contract
//     starts 2 Nov and is correctly ignored.
//   - exactly one assignment per crew (ORDER BY sign_on DESC LIMIT 1), so the
//     join can never multiply a crew row into two.
//   - is_current is NOT touched, no row is written, and ship_leg is unchanged.
//     Billing reads is_current = 1 and cannot see any of this.
//   - status is NOT consulted. The estate glossary is explicit that movements
//     are truth and status is not: Lazo is 'Earmarked' and has been on Harmony
//     since 18 Aug, with two of his time cards sitting in the intake queue.
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
         COALESCE(l.ship_short, av.name, a.vessel_name,
                  NULLIF(o.vessel_observed,''), c.vessel_observed) AS ship,
         COALESCE(l.brand, av.brand) AS brand,
         COALESCE(NULLIF(o.status,''), c.status) AS status,
         COALESCE(NULLIF(o.email,''),  c.email)  AS email,
         COALESCE(l.on_date,  a.sign_on) AS sign_on,
         COALESCE(l.off_date, a.actual_sign_off, a.planned_sign_off) AS sign_off
    FROM crew c
    LEFT JOIN crew_override o
           ON o.agency_id = c.agency_id
          AND COALESCE(o.retired,0) = 0
    LEFT JOIN ship_leg l
           ON l.crew_id = c.id
          AND l.is_current = 1
          AND l.ours = 1
    LEFT JOIN assignment a
           ON a.id = (
                SELECT a2.id
                  FROM assignment a2
                  JOIN contract k2 ON k2.id = a2.contract_id
                 WHERE k2.crew_id = c.id
                   AND a2.actual_sign_off IS NULL
                   AND a2.sign_on <= date('now')
                 ORDER BY a2.sign_on DESC
                 LIMIT 1)
    LEFT JOIN vessel av ON av.id = a.vessel_id
   WHERE c.redacted = 0
`;

/**
 * Timing-safe secret comparison.
 *
 * `a !== b` on strings short-circuits at the first differing byte, so response
 * time leaks how much of the key a guess got right. Digesting both to a fixed
 * 32 bytes first also stops length from leaking, and the XOR accumulation below
 * always walks all 32 bytes.
 */
async function secretEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(da), y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

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
 * Dispatch this BEFORE the `/api/` session gate in worker.js. The caller is a
 * Worker, not a person: it has no session cookie and would be rejected with
 * JSON 401 before ever reaching this function. Its credential is the header.
 */
export async function apiRosterExport(request, env) {
  const key = request.headers.get('X-Roster-Key');
  if (!env.ROSTER_KEY || !(await secretEquals(key, env.ROSTER_KEY))) {
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
