// Days-worked / sea-days computation — pure, testable. Feeds the billing export.
// A contract's days = (sign_off - sign_on), in whole days, never negative.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function contractDays(on, off) {
  if (!ISO.test(on || "") || !ISO.test(off || "")) return 0;
  const a = new Date(on + "T00:00:00Z"), b = new Date(off + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) return 0;
  const d = Math.round((b - a) / 86400000);
  return d > 0 ? d : 0;
}

// Per-crew aggregation keyed by sc (SC- agency id). rows: [{sc, on, off, ...}]
export function crewSeaDays(rows) {
  const m = {};
  for (const r of rows || []) {
    const k = r.sc;
    if (!m[k]) m[k] = { sc: k, contracts: 0, days: 0, lastOff: null };
    m[k].contracts++;
    m[k].days += contractDays(r.on, r.off);
    if (r.off && (!m[k].lastOff || r.off > m[k].lastOff)) m[k].lastOff = r.off;
  }
  return m;
}

export function seaDaysTotals(rows) {
  const crew = new Set();
  let days = 0;
  for (const r of rows || []) { days += contractDays(r.on, r.off); crew.add(r.sc); }
  return { crew: crew.size, contracts: (rows || []).length, days };
}
