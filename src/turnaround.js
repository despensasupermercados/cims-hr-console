// src/turnaround.js — A PROJECTED SIGN-OFF LANDS ON A TURNAROUND DAY (Miguel, 8 Oct 2026, on Alonzo's Allure card
// ending Jun 29, 2027 in Willemstad: "Curaçao is not a turnaround port ... look at the 7 months, I also want you to look
// at the turnaround port, not the middle of the voyage. Even if you are a couple of days shorter or a couple of days
// over, it's okay because it's a projected day ... If it's a voyage of 15 days and you are right in the middle, you
// will have to make a decision ... Always look for the turnaround days").
//
// PURE. `snapToTurnaround(date, turnarounds)` moves a projected date to the NEAREST turnaround day of that ship's
// itinerary (vessel_port_day.is_turnaround), under or over; an exact tie goes to the later day (a few days over the
// seven months, never a contract cut short on a coin toss). No turnaround within MAX_SNAP_DAYS either side — a ship
// without an itinerary loaded, or a gap in it — keeps the raw date, and says so (`snapped: false`). Only PROJECTED
// dates are snapped: TDG's own debark, Rita's typed sign-off and a reliever card's sign-on are never moved.
export const MAX_SNAP_DAYS = 14;

const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(0, 10) : null);
const DAY = 86400000;
const diff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

// turnarounds: [{ berth_date, port_name }] for ONE ship (any order). Returns { date, port, snapped, delta }:
// delta = days moved (negative = earlier than the raw date).
export function snapToTurnaround(date, turnarounds, maxDays = MAX_SNAP_DAYS) {
  const d = day(date);
  if (!d) return { date: null, port: null, snapped: false, delta: 0 };
  let best = null;
  for (const t of (turnarounds || [])) {
    const td = day(t && t.berth_date);
    if (!td) continue;
    const delta = diff(d, td);
    if (Math.abs(delta) > maxDays) continue;
    if (!best || Math.abs(delta) < Math.abs(best.delta) || (Math.abs(delta) === Math.abs(best.delta) && delta > best.delta)) best = { date: td, port: t.port_name || null, delta };
  }
  return best ? { date: best.date, port: best.port, snapped: best.delta !== 0, delta: best.delta } : { date: d, port: null, snapped: false, delta: 0 };
}

// The fleet's turnaround days keyed by ship (lower-cased name), from rows { ship_short, berth_date, port_name }.
export function turnaroundsByShip(rows) {
  const by = {};
  for (const r of (rows || [])) {
    if (!r || !r.ship_short || !day(r.berth_date)) continue;
    const k = String(r.ship_short).trim().toLowerCase();
    (by[k] = by[k] || []).push({ berth_date: day(r.berth_date), port_name: r.port_name || null });
  }
  for (const k in by) by[k].sort((a, b) => (a.berth_date < b.berth_date ? -1 : 1));
  return by;
}
