// Contract grouping — pure, testable. A real CONTRACT can span several ships (transfers). The tell
// is the GAP between assignments: <= 3 weeks between one leg's sign-off and the next leg's sign-on
// is the same contract (a transfer); a bigger gap is a holiday, which means the contract ended and a
// new one begins. A contract counts as FULL only when its total duration reaches the cruise-line
// minimum (Azamara >= 5 months, Royal/Celebrity/NCL >= 6 months; all cap around 12). The full-contract
// count — NOT the raw leg count — drives the rank tier (Jr/PS/Sr). Informational; never a payout input.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function parse(s) { if (!ISO.test(s || "")) return null; const d = new Date(s + "T00:00:00Z"); return isNaN(d) ? null : d; }
function dayDiff(a, b) { const x = parse(a), y = parse(b); if (!x || !y) return null; return Math.round((y - x) / 86400000); }
function months(a, b) { const d = dayDiff(a, b); return d == null ? 0 : d / 30.44; }

export const GAP_DAYS = 21;            // > 3 weeks between legs = holiday = contract boundary
export const MIN_AZ = 5, MIN_RCL = 6;  // full-contract minimum, in months

// Azamara short ship names (Keyman uses short names). Anything else is treated as Royal/Celebrity/NCL.
const AZ = new Set(["journey", "quest", "pursuit", "onward"]);
export function isAzamaraShip(ship) { return AZ.has(String(ship || "").trim().toLowerCase()); }

// legs: [{ on, end, ship }] where end = actual sign-off || projected. Groups consecutive legs into
// contracts using the gap rule. Returns [[leg,...], ...] sorted by sign-on.
export function groupContracts(legs, gapDays = GAP_DAYS) {
  const L = (legs || [])
    .filter(l => l && l.on && l.end)
    .map(l => ({ on: l.on, end: l.end, ship: l.ship || "" }))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const groups = [];
  let cur = null, curEnd = null;
  for (const l of L) {
    if (!cur) { cur = [l]; curEnd = l.end; continue; }
    const gap = dayDiff(curEnd, l.on);
    if (gap != null && gap > gapDays) { groups.push(cur); cur = [l]; curEnd = l.end; }
    else { cur.push(l); if (l.end > curEnd) curEnd = l.end; }
  }
  if (cur) groups.push(cur);
  return groups;
}

// One grouped contract -> { months, az, full }. Duration = first sign-on to last sign-off.
export function contractSpan(group) {
  if (!group || !group.length) return { months: 0, az: false, full: false };
  const start = group[0].on;
  const end = group.reduce((m, x) => (x.end > m ? x.end : m), group[0].end);
  const az = group.some(x => isAzamaraShip(x.ship));
  const m = months(start, end);
  const min = az ? MIN_AZ : MIN_RCL;
  return { months: Math.round(m * 10) / 10, az, full: m >= (min - 0.2) };
}

// Headline numbers for a crew: how many grouped contracts, and how many of those are FULL.
export function contractCounts(legs, gapDays = GAP_DAYS) {
  const groups = groupContracts(legs, gapDays);
  let full = 0;
  for (const g of groups) if (contractSpan(g).full) full++;
  return { contracts: groups.length, full };
}

// Convenience: the full-contract count that feeds the rank tier.
export function fullContracts(legs, gapDays = GAP_DAYS) { return contractCounts(legs, gapDays).full; }

/* ---- Status auto-tagging (derived from the live schedule assignments) ----
   On a ship right now (an assignment spans today) -> on board. Signed off, with a past assignment and
   no current one -> on holiday (the contract ended). Only future assignments / none -> fall back to the
   imported registry status. A manual Inactive tag (the old "Retired" tag) always wins. Schedule legs are {on, off}. */
export function liveState(legs, today) {
  const L = (legs || []).filter(l => l && l.on)
    .map(l => ({ on: l.on, off: l.off || null }))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  if (!L.length) return "none";
  for (const l of L) if (l.on <= today && (l.off ? today <= l.off : true)) return "onboard";
  const lastOff = L.reduce((m, l) => (l.off && l.off > m ? l.off : m), "");
  if (lastOff && lastOff < today) return "holiday"; // signed off -> contract ended
  return "scheduled";                                // only future assignment(s)
}
export const RETIRE_MONTHS = 6; // no assignment longer than this -> Inactive (it read "Retired" until 8 Oct 2026)
// The words TDG's AdvancedQuery uses (crewimport.normalizeStatus); anything else is no word. Reserved and Not for
// Rehire are their own words since 8 Oct 2026 (they read On Vacation / Inactive before).
export const REGISTRY_STATUSES = new Set(["On board", "On Vacation", "Earmarked", "Inactive", "Reserved", "Not for Rehire"]);

// Final status string. opts: { retired:bool, imported:string }.
//   INACTIVE REPLACES RETIRED (Miguel, 8 Oct 2026: "inactive replace retired"): the console has no Retired
//   status any more. The manual tag (crew_override.retired, kept as the column) reads Inactive, and so does
//   the long-ashore rule. Inactive = has sailed with us, no ship, out of the rotation until someone decides
//   otherwise.
//   manual tag wins -> Inactive. On a ship now -> On board. Only future assignment(s) -> keep
//   the registry value (e.g. Earmarked). Signed off: within RETIRE_MONTHS -> On Vacation (on holiday,
//   contract ended); longer than that -> Inactive (auto). No dated schedule -> keep the registry value.
//   A manual status edit (handled by the caller) still wins, so Rita can pull someone back to Earmarked.
//   OVERDUE (Miguel, 5 Oct 2026: "we follow TDG file"): a leg still CURRENT whose projected sign-off has
//   passed with nothing recorded — the schedule does not know whether they left (the seat is held as
//   overdue, §11), and TDG's weekly registry does: its status stands; with no registry word, On board.
//   Until today this read as "signed off" → On Vacation, then Retired after six months, while the board
//   held the seat: two screens, two answers.
export function deriveStatus(legs, today, opts) {
  opts = opts || {};
  if (opts.retired) return "Inactive";
  const L = (legs || []).filter(l => l && l.on)
    .map(l => ({ on: l.on, off: l.off || null, cur: !!l.is_current }))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  for (const l of L) if (l.on <= today && (l.off ? today <= l.off : true)) return "On board";
  if (L.some(l => l.cur && l.on <= today && l.off && l.off < today)) {
    return REGISTRY_STATUSES.has(opts.imported) ? opts.imported : "On board";
  }
  if (L.length && L.every(l => l.on > today)) return opts.imported || "Earmarked"; // only future
  const lastOff = L.reduce((m, l) => (l.off && l.off > m ? l.off : m), "");
  if (lastOff) return months(lastOff, today) > RETIRE_MONTHS ? "Inactive" : "On Vacation";
  return opts.imported || "Earmarked"; // no dated schedule -> registry value
}
