// Days-worked / sea-days computation — pure, testable. Feeds the billing export.
// Off date precedence for billing: actual sign-off > projected > (open → asOf).
// Days are whole calendar days between sign-on and the effective sign-off,
// clipped to the requested billing period. Never negative.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function parse(s) { if (!ISO.test(s || "")) return null; const d = new Date(s + "T00:00:00Z"); return isNaN(d) ? null : d; }

export function contractDays(on, off) {
  const a = parse(on), b = parse(off);
  if (!a || !b) return 0;
  const d = Math.round((b - a) / 86400000);
  return d > 0 ? d : 0;
}

// Effective sign-off for billing: actual, else projected, else asOf (still onboard).
export function effectiveOff(c, asOf) { return c.act || c.proj || asOf || null; }

// Whole days of [on, off] that fall inside [from, to]. Null bound = open on that side.
export function periodDays(on, off, from, to) {
  const a = parse(on), b = parse(off);
  if (!a || !b) return 0;
  const f = parse(from), t = parse(to);
  const start = f && f > a ? f : a;
  const end = t && t < b ? t : b;
  const d = Math.round((end - start) / 86400000);
  return d > 0 ? d : 0;
}

function basisOf(x) { return x.actual && x.projected ? "mixed" : x.actual ? "actual" : "projected"; }

// rows: [{sc, ship, on, proj, act, ...}]. opts: {from, to, asOf}.
// Returns per-crew and per-vessel day totals within the period, plus basis flags.
export function billingReport(rows, opts = {}) {
  const asOf = opts.asOf || null;
  const from = opts.from || null;
  const to = opts.to || asOf || null;
  const crew = {}, vessel = {};
  let totalDays = 0, totalContracts = 0;
  for (const c of rows || []) {
    const off = effectiveOff(c, asOf);
    const days = periodDays(c.on, off, from, to);
    if (days <= 0) continue;
    const basis = c.act ? "actual" : "projected";
    totalDays += days; totalContracts++;
    const k = c.sc;
    if (!crew[k]) crew[k] = { sc: k, days: 0, contracts: 0, actual: 0, projected: 0 };
    crew[k].days += days; crew[k].contracts++; crew[k][basis]++;
    const v = c.ship || "—";
    if (!vessel[v]) vessel[v] = { ship: v, days: 0, crew: new Set(), contracts: 0, actual: 0, projected: 0 };
    vessel[v].days += days; vessel[v].crew.add(k); vessel[v].contracts++; vessel[v][basis]++;
  }
  const perCrew = Object.values(crew)
    .map(x => ({ sc: x.sc, days: x.days, contracts: x.contracts, basis: basisOf(x) }))
    .sort((a, b) => b.days - a.days);
  const perVessel = Object.values(vessel)
    .map(x => ({ ship: x.ship, days: x.days, crew: x.crew.size, contracts: x.contracts, basis: basisOf(x) }))
    .sort((a, b) => b.days - a.days);
  return { from, to, asOf, totals: { days: totalDays, contracts: totalContracts, crew: perCrew.length, vessels: perVessel.length }, perCrew, perVessel };
}
