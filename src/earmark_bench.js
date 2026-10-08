// src/earmark_bench.js — WHO CAN TAKE THE SEAT (Miguel, 8 Oct 2026, on Vision's empty earmark box: "give Rita ...
// available options ... every crew member who is active, not on board the ship, on vacation ... Give her everybody who
// has been home already for a minimum of 6 weeks, but with a cutoff of 6 months ... a total of 9 names"; then "go" on
// the mock-up that measured both on the EARMARK'S SIGN-ON DATE and counted crew aboard elsewhere who will be home by then).
//
// PURE. Two steps, so the board (top 9 per ship) and the relief panel (everyone) read the same answer:
//   benchPool  — once per board read: every seafarer who could be earmarked, with the day their time home starts.
//   rankBench  — per ship: who is home 6 weeks to 6 months on that ship's relief date, most rested first.
// A seafarer qualifies when they are active (On board / On Vacation / Reserved per the console's status), have no
// earmark already (Rita's open card still to come, or TDG's Earmarked), and their time home on the relief date is in
// the window. Aboard another ship = home from that contract's sign-off (the board's own, after every rule that dates
// it); ashore = home from TDG's DEBARKEDDATE, else the last sign-off on the schedule. Nobody's date is guessed: a crew
// whose time home cannot be dated is left out. The one-click earmark uses the same relief date
// (projection.defaultProjectionDates), so the card always starts on the day the list measured.

export const BENCH_MIN_DAYS = 42;   // 6 weeks
export const BENCH_MAX_MONTHS = 6;  // the cut-off: longer at home is somebody who chose a long vacation
export const BENCH_TOP = 9;

const ACTIVE = new Set(["On board", "On Vacation", "Reserved"]);
const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(0, 10) : null);
const key = (s) => String(s == null ? "" : s).trim().toLowerCase();
const DAY = 86400000;
export const daysBetween = (a, b) => (a && b ? Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY) : null);
function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

const DOCS = [["Medical", "med_exp", true], ["Seaman's Book", "sirb_exp", true], ["Passport", "pp_exp", true], ["US visa", "usv_exp", true], ["Schengen", "sch_exp", false]];

// crew  : [{ sc, name, rank, status, shore, docs: { med_exp, ... } }]   (status = crewStatus, the board's word)
// legs  : the ONE schedule (boardLegs) — { sc, ship, on, off, is_current, ours }
// snapshot : registry_snapshot rows { agency_id, vessel, debarked_at }
// open  : open assignments { sc, sign_on } · tdgEarmarked: Set of sc · shipOf: raw hull -> canonical name
export function benchPool({ crew, legs, snapshot, open, tdgEarmarked, today, shipOf } = {}) {
  const of = typeof shipOf === "function" ? shipOf : (s) => s || null;
  const legsBy = {};
  for (const l of (legs || [])) if (l && l.ours && l.sc) (legsBy[l.sc] = legsBy[l.sc] || []).push(l);
  const snapBy = {};
  for (const r of (snapshot || [])) if (r && r.agency_id) snapBy[r.agency_id] = r;
  const planned = new Set();
  for (const a of (open || [])) if (a && a.sc && day(a.sign_on) && day(a.sign_on) > today) planned.add(a.sc);
  const marked = tdgEarmarked instanceof Set ? tdgEarmarked : new Set(tdgEarmarked || []);
  const out = [];
  for (const c of (crew || [])) {
    if (!c || !c.sc || c.shore || !ACTIVE.has(c.status) || planned.has(c.sc) || marked.has(c.sc)) continue;
    const L = legsBy[c.sc] || [];
    const cur = L.filter((l) => l.is_current && l.on && l.on <= today);
    let homeFrom = null, aboardShip = null, lastShip = null;
    if (cur.length) {
      if (cur.some((l) => !day(l.off))) continue;                       // aboard with no sign-off: cannot be dated
      const last = cur.reduce((m, l) => (day(l.off) > day(m.off) ? l : m), cur[0]);
      homeFrom = day(last.off); aboardShip = last.ship || null; lastShip = aboardShip;
    } else {
      if (c.status === "On board") continue;                            // the file has them aboard, the schedule cannot date it
      const s = snapBy[c.sc];
      const ended = L.filter((l) => day(l.off) && day(l.off) <= today).sort((a, b) => (day(a.off) < day(b.off) ? 1 : -1));
      homeFrom = (s && day(s.debarked_at)) || (ended[0] ? day(ended[0].off) : null);
      lastShip = (s && s.vessel ? of(s.vessel) || s.vessel : null) || (ended[0] ? ended[0].ship : null);
      if (!homeFrom) continue;
    }
    out.push({ sc: c.sc, name: c.name, rank: c.rank || null, status: c.status, aboardShip, lastShip, homeFrom, docs: c.docs || {} });
  }
  return out;
}

// The documents that will not carry the contract: expired by the sign-on, or expiring before the planned sign-off.
// Required documents with no date on record are named too. Returned short: [{ doc, exp, when: "before sign-on" | ... }].
export function benchDocIssues(docs, signOn, signOff) {
  const out = [];
  for (const [label, f, required] of DOCS) {
    const exp = day(docs && docs[f]);
    if (!exp) { if (required) out.push({ doc: label, exp: null, when: "missing" }); continue; }
    if (signOn && exp < signOn) out.push({ doc: label, exp, when: "before sign-on" });
    else if (signOff && exp < signOff) out.push({ doc: label, exp, when: "before sign-off" });
  }
  return out;
}

// pool: benchPool · ship: the hull being planned · reliefDate / signOff: the earmark's dates (defaultProjectionDates)
// Returns { ready: in the window, most rested first; outside: ashore crew outside it (shown faded in the panel) }.
export function rankBench(pool, { ship, reliefDate, signOff } = {}) {
  const ready = [], outside = [];
  if (!reliefDate) return { ready, outside };
  for (const p of (pool || [])) {
    if (p.aboardShip && key(p.aboardShip) === key(ship)) continue;      // aboard this ship: the outgoing seat, not a relief
    const days = daysBetween(p.homeFrom, reliefDate);
    if (days == null) continue;
    const row = { sc: p.sc, name: p.name, rank: p.rank, aboardShip: p.aboardShip, lastShip: p.lastShip, homeFrom: p.homeFrom, days,
      docs: benchDocIssues(p.docs, reliefDate, signOff) };
    if (days >= BENCH_MIN_DAYS && addMonths(p.homeFrom, BENCH_MAX_MONTHS) >= reliefDate) ready.push(row);
    else if (!p.aboardShip && days > 0) outside.push(row);
  }
  const by = (a, b) => b.days - a.days || String(a.name).localeCompare(String(b.name));
  ready.sort(by); outside.sort(by);
  return { ready, outside };
}
