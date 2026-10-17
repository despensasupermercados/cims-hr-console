// THE RELIEVER — ONE RULE (Miguel, 17 Oct 2026: "Adopt it everywhere"). The board, the crew profile, the dashboard and the
// sign-off instructions email each decided "who relieves him" their own way, and on the 16 Oct file they named three
// different people: the board and the profile named Jonathan Alonzo (teaching aboard Pursuit) for Kevin Jugao and Myrna
// Suarez (a Spa Hairdresser in TDG's file) for Jeffrey Valderrama; the email named A.J. Baleña and Karl Lanuza.
//
// The reliever of a contract is the FIRST person to sign on that ship after him — never a training visit (visits.js) —
// counted from RELIEF_WINDOW_DAYS before the EARLIER of his shown sign-off and his projected one (sign-on + 7 months,
// Azamara 5). Earlier than that is a colleague, not the relief (a second crew aboard since months: "u will have cases
// where u see 2 ppl onboard for few weeks only", Miguel 30 Sep 2026). The projected date keeps the anchor when Rita
// extends a contract: a reliever who boarded on the original plan stays the reliever however long the extension.
// Nothing dated → TDG's undated Earmarked row for the hull (no dates; the caller passes it with `on: null`).
// Pure: the callers hand it their own candidates and keep their own shapes.

export const RELIEF_WINDOW_DAYS = 45;
export const CONTRACT_MONTHS = 7;
export const AZAMARA_CONTRACT_MONTHS = 5;

const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const addDays = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
// Calendar months, clamped to the month's end (Jul 31 + 7 = Feb 28/29), like plusMonths / addMonthsISO.
function addMonths(d, n) {
  const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n, day = +d.slice(8, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
}

// The day a reliever may sign on from: RELIEF_WINDOW_DAYS before the earlier of the shown sign-off and the projected one.
// No sign-on and no sign-off → null (no window: anything after him counts).
export function reliefFrom(on, off, azamara) {
  const a = iso(on), b = iso(off);
  const proj = a ? addMonths(a, azamara ? AZAMARA_CONTRACT_MONTHS : CONTRACT_MONTHS) : null;
  const anchor = b && proj ? (b < proj ? b : proj) : (b || proj);
  return anchor ? addDays(anchor, -RELIEF_WINDOW_DAYS) : null;
}

// seat: { sc, on, off, azamara } · candidates: [{ sc, on (ISO, or null for TDG's undated Earmarked row), visit? }]
// Returns the chosen candidate itself (the caller's object), or null.
export function pickReliever(seat, candidates) {
  const s = seat || {}, on = iso(s.on), from = reliefFrom(s.on, s.off, s.azamara);
  const ok = (x) => x && x.sc && x.sc !== s.sc && !x.visit;
  let best = null;
  for (const x of (candidates || [])) {
    const d = ok(x) ? iso(x.on) : null;
    if (!d || (on && d <= on) || (from && d < from)) continue;
    if (!best || d < iso(best.on)) best = x;               // the earliest; a tie keeps the first given
  }
  if (best) return best;
  for (const x of (candidates || [])) if (ok(x) && !iso(x.on)) return x;
  return null;
}

// ONE PERSON RELIEVES ONE SEAT. Several outgoing seats on one hull (a handover overlap, a crew held past his sign-off, a
// second printer) each take the first person after them; when two seats want the same person he relieves the seat whose
// sign-off is NEAREST his sign-on, and the other seat looks further (Villacortes leaving 30 Oct takes Pintucan joining
// 28 Oct, not Santos held aboard since her 1 Sep sign-off; a second printer is not relieved by the first's relief).
// seats: [{ sc, on, off, azamara, cands }] → the chosen candidate per seat, in the input's order (null for none).
const dayN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
export function assignRelievers(seats) {
  const S = seats || [], out = new Array(S.length).fill(null), taken = new Set();
  const gap = (s, c) => (iso(s.off) ? Math.abs(dayN(iso(c.on)) - dayN(iso(s.off))) : Infinity);
  for (let round = 0; round <= S.length; round++) {
    const claims = new Map();
    S.forEach((s, i) => {
      if (out[i]) return;
      const hit = pickReliever(s, (s.cands || []).filter((c) => c && iso(c.on) && !taken.has(c.sc)));
      if (!hit) return;
      const k = hit.sc + "|" + iso(hit.on);
      if (!claims.has(k)) claims.set(k, { hit, by: [] });
      claims.get(k).by.push(i);
    });
    if (!claims.size) break;
    for (const { hit, by } of claims.values()) {
      const win = by.slice().sort((a, b) => gap(S[a], hit) - gap(S[b], hit) || String(iso(S[a].off) || "9999").localeCompare(String(iso(S[b].off) || "9999")) || a - b)[0];
      out[win] = (S[win].cands || []).find((c) => c && c.sc === hit.sc && iso(c.on) === iso(hit.on)) || hit;
      taken.add(hit.sc);
    }
  }
  // Nothing dated for a seat: TDG's undated Earmarked row, the last resort (pickReliever's own fallback).
  S.forEach((s, i) => { if (!out[i]) out[i] = pickReliever(s, (s.cands || []).filter((c) => c && !iso(c.on))); });
  return out;
}
