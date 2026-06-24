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
