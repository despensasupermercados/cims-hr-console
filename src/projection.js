// projection.js — a drop on the Keyman board creates a PROJECTION (yellow card), 2026-09-15.
//
// Until today dropping a crew with no card on a ship went through /api/rotation/assign, which wrote
// crew_override.vessel_observed — the registry ship. That is not a plan: the card came back GREEN,
// with no dates, not draggable, and it out-voted the TDG registry for that seafarer (Miguel, 15 Sep:
// "It's not yellow"). The plan (Keyman Board Redesign v5, phase 3) retired that path: a drag moves
// or creates an assignment. This module is the create half; the route in worker.js is its only caller.
//
// Dates follow the relief modal's rule (relief_ui.js): sign-on = the day the ship's current printer
// signs off (their projected / recorded sign-off, if still ahead), else today; sign-off = sign-on
// + 6 months, + 5 on Azamara. Rita adjusts either on the card afterwards.

export function defaultProjectionDates({ ship, legs, today, brand, addMonths, months = 6, azamaraMonths = 5 }) {
  const offs = (legs || [])
    .filter((l) => l && l.is_current && l.ours && l.ship === ship && l.off && l.off >= today)
    .map((l) => l.off)
    .sort();
  const signOn = offs[0] || today;
  const n = /azamara/i.test(String(brand || "")) ? azamaraMonths : months;
  return { signOn, signOff: addMonths(signOn, n), follows: !!offs[0] };
}

// deps: { boardLegs(env), save(env, payload) -> {ok,id}, addMonths(iso, n) }
export async function createProjection(env, { agencyId, ship, today }, deps) {
  const { boardLegs, save, addMonths } = deps;
  agencyId = String(agencyId || "").trim(); ship = String(ship || "").trim();
  if (!agencyId || !ship || ship === "__POOL__") return { ok: false, error: "bad_request" };
  const [cr, ves, legs, dup] = await Promise.all([
    env.DB.prepare("SELECT id FROM crew WHERE agency_id=? AND redacted=0").bind(agencyId).first(),
    env.DB.prepare("SELECT id, name, brand FROM vessel WHERE name=?").bind(ship).first(),
    boardLegs(env),
    env.DB.prepare(
      `SELECT a.id FROM assignment a
         JOIN contract k ON k.id = a.contract_id
         JOIN crew c ON c.id = k.crew_id
         LEFT JOIN vessel v ON v.id = a.vessel_id
        WHERE c.agency_id = ?1 AND a.actual_sign_off IS NULL AND COALESCE(v.name, a.vessel_name) = ?2
        LIMIT 1`
    ).bind(agencyId, ship).first(),
  ]);
  if (!cr) return { ok: false, error: "not_found" };
  if (!ves) return { ok: false, error: "unknown_ship" };
  if (dup) return { ok: false, error: "already_projected", id: dup.id }; // one crew, two ships is fine; the same ship twice is a slip
  const d = defaultProjectionDates({ ship: ves.name, legs, today, brand: ves.brand, addMonths });
  const res = await save(env, {
    crew_id: cr.id, role: "reliever", vessel_id: ves.id, vessel_name: ves.name,
    sign_on: d.signOn, planned_sign_off: d.signOff,
  });
  return res && res.ok ? { ...res, sign_on: d.signOn, planned_sign_off: d.signOff, follows: d.follows } : res;
}
