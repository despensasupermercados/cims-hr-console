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
// + 7 months (Miguel, 7 Oct 2026: a contract is seven months; six until then), + 5 on Azamara. Rita adjusts
// either on the card afterwards.

// turnarounds: that ship's turnaround days (8 Oct 2026): the projected sign-off lands on the nearest one (turnaround.js).
import { snapToTurnaround } from "./turnaround.js";

// THE NEXT EARMARK FOLLOWS THE LAST ONE (Miguel, 8 Oct 2026, on Beyond and Allure: "if I pick somebody ... automatically
// I need you to give me a third card, which would be a second earmark"). `chain` = the ship's earmarks still to come
// ([{ on, off, name }]: open cards whose sign-on is after today). When one ends after the printer's sign-off, the new
// earmark starts on the LAST one's sign-off — never a second person relieving the same printer on the same day.
export function defaultProjectionDates({ ship, legs, today, brand, addMonths, months = 7, azamaraMonths = 5, turnarounds, chain }) {
  // Ship names meet case-insensitively: a Counter row's "navigator" is the vessel table's "Navigator".
  const key = (s) => String(s == null ? "" : s).trim().toLowerCase();
  const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(0, 10) : null);
  const offs = (legs || [])
    .filter((l) => l && l.is_current && l.ours && key(l.ship) === key(ship) && l.off && l.off >= today)
    .map((l) => l.off)
    .sort();
  const n = /azamara/i.test(String(brand || "")) ? azamaraMonths : months;
  let signOn = offs[0] || today, after = null;
  for (const e of (chain || [])) {
    // An earmark saved without a sign-off still holds the seat for a contract: its sign-on + the contract length.
    const on = day(e && e.on), off = day(e && e.off) || (on ? addMonths(on, n) : null);
    if (!on || !off || on <= today || off < signOn) continue;
    if (off > signOn || !after) { signOn = off; after = (e && e.name) || null; }
  }
  const raw = addMonths(signOn, n);
  const sn = snapToTurnaround(raw, turnarounds || []);
  return { signOn, signOff: sn.date || raw, follows: !!(offs[0] || after), offPort: sn.port || null, offSnapped: sn.snapped ? sn.delta : 0, ...(after ? { after } : {}) };
}

// The ship's earmarks still to come, for the chain above: open cards on that hull whose sign-on is after today.
export const SHIP_EARMARKS_SQL = `SELECT a.sign_on AS "on", a.planned_sign_off AS "off",
         TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS name
    FROM assignment a
    JOIN contract k ON k.id = a.contract_id
    JOIN crew c ON c.id = k.crew_id
    LEFT JOIN vessel v ON v.id = a.vessel_id
   WHERE a.actual_sign_off IS NULL AND COALESCE(v.name, a.vessel_name) = ?1 AND a.sign_on > ?2`;

// deps: { boardLegs(env), save(env, payload) -> {ok,id}, addMonths(iso, n), turnarounds?(env, ship, around) -> rows }
export async function createProjection(env, { agencyId, ship, today }, deps) {
  const { boardLegs, save, addMonths } = deps;
  agencyId = String(agencyId || "").trim(); ship = String(ship || "").trim();
  if (!agencyId || !ship || ship === "__POOL__") return { ok: false, error: "bad_request" };
  // deps.chain (the drag, the one-tap bench, Add crew): the new card follows the ship's last earmark. The TDG-earmark
  // card at Apply does not chain (the review may be removing the earmark it would follow in the same batch).
  const [cr, ves, legs, dup, chain] = await Promise.all([
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
    deps.chain ? env.DB.prepare(SHIP_EARMARKS_SQL).bind(ship, today).all().then((r) => (r && r.results) || []).catch(() => []) : Promise.resolve([]),
  ]);
  if (!cr) return { ok: false, error: "not_found" };
  if (!ves) return { ok: false, error: "unknown_ship" };
  if (dup) return { ok: false, error: "already_projected", id: dup.id }; // one crew, two ships is fine; the same ship twice is a slip
  const d0 = defaultProjectionDates({ ship: ves.name, legs, today, brand: ves.brand, addMonths, chain });
  // The ship's turnaround days around the raw sign-off (one small read), so the card ends on a crew-change day.
  const ta = deps.turnarounds ? await deps.turnarounds(env, ves.name, d0.signOff).catch(() => []) : [];
  const d = defaultProjectionDates({ ship: ves.name, legs, today, brand: ves.brand, addMonths, turnarounds: ta, chain });
  const res = await save(env, {
    crew_id: cr.id, role: "reliever", vessel_id: ves.id, vessel_name: ves.name,
    sign_on: d.signOn, planned_sign_off: d.signOff, ...(d.offPort ? { off_port_seed: d.offPort } : {}),
  });
  return res && res.ok ? { ...res, sign_on: d.signOn, planned_sign_off: d.signOff, follows: d.follows, after: d.after || null, off_port: d.offPort || null, off_snapped: d.offSnapped || 0 } : res;
}
