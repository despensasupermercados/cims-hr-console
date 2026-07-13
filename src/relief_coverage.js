// src/relief_coverage.js
// -----------------------------------------------------------------------------
// ADVISORY relief-coverage annotation for the weekly Seafarer Movements email.
//
// WHY THIS EXISTS
// The movements email reads ship_leg, which holds exactly ONE current leg per
// ship and no successor legs. So it can only ever show who is LEAVING, never who
// is ARRIVING to replace them — every sign-off looks uncovered. This module adds
// a per-sign-off answer to the only question that matters operationally:
//   "Is there a reliever for this seat, and is it confirmed?"
//
// SOURCE (read this before trusting the output)
// Forward relief data does not live in ship_leg. Today the only place it exists
// is the contract/assignment layer (assignment + contract + crew). Per the CIMS
// data dictionary, that layer must NEVER be used as movement/billing TRUTH — so
// this is used ONLY as an ADVISORY flag on an INTERNAL email, never to move a
// seat or bill a client. The lookup is deliberately isolated in ONE function
// (`fetchRelievers`) so the source can be swapped in a single place once the
// authoritative relief source is confirmed with crewing (Rita).
//
// STATES
//   confirmed = a reliever exists and is already 'On board'
//   planned   = a reliever exists but is not yet on board (Earmarked / vacation)
//   none      = no reliever found in the console within +/- MATCH_DAYS of sign-off
//               ("none" means NOT IN THE SYSTEM, not proven empty — the record may
//                simply never have been entered.)
// -----------------------------------------------------------------------------

const MATCH_DAYS = 30;
const DAY = 86400000;

function ymd(d) {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}
function addDaysStr(s, n) {
  const d = new Date(ymd(s) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.abs((new Date(ymd(a)) - new Date(ymd(b))) / DAY);
}

// The ONLY place the relief data source is defined. Swap this query when the
// authoritative relief source is confirmed. Returns rows: { ship, signon, reliever, status }.
async function fetchRelievers(env, minDate, maxDate) {
  const { results } = await env.DB.prepare(
    `SELECT a.vessel_name AS ship,
            a.sign_on     AS signon,
            TRIM(COALESCE(rc.first_name,'') || ' ' || COALESCE(rc.last_name,'')) AS reliever,
            rc.status     AS status
       FROM assignment a
       JOIN contract ct ON ct.id = a.contract_id
       JOIN crew     rc ON rc.id = ct.crew_id
      WHERE a.sign_on BETWEEN ? AND ?`
  ).bind(minDate, maxDate).all();
  return results || [];
}

// Annotate each sign-off with a `relief` object. Pure matching; all IO is in
// fetchRelievers. Safe no-op (all 'none', flagged degraded) if the query fails.
async function annotateReliefCoverage(env, signOffs) {
  const offs = signOffs || [];
  if (!offs.length) return offs;

  const dates = offs.map((o) => ymd(o.date)).sort();
  const minDate = addDaysStr(dates[0], -MATCH_DAYS);
  const maxDate = addDaysStr(dates[dates.length - 1], MATCH_DAYS);

  let rows;
  try {
    rows = await fetchRelievers(env, minDate, maxDate);
  } catch (e) {
    console.error("relief_coverage", (e && e.stack) || e);
    for (const o of offs) o.relief = { state: "unknown", reliever: null, signon: null };
    return offs;
  }

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const o of offs) {
    const shipKey = norm(o.vessel);
    const cands = rows.filter(
      (r) => norm(r.ship) === shipKey && r.reliever && daysBetween(r.signon, o.date) <= MATCH_DAYS
    );
    if (!cands.length) {
      o.relief = { state: "none", reliever: null, signon: null };
      continue;
    }
    // Prefer a confirmed (on board) reliever; otherwise the nearest-dated planned one.
    cands.sort((a, b) => {
      const ca = a.status === "On board" ? 0 : 1;
      const cb = b.status === "On board" ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return daysBetween(a.signon, o.date) - daysBetween(b.signon, o.date);
    });
    const best = cands[0];
    o.relief = {
      state: best.status === "On board" ? "confirmed" : "planned",
      reliever: best.reliever,
      signon: ymd(best.signon),
    };
  }
  return offs;
}

export { annotateReliefCoverage };
