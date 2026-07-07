// src/city_resolver.js
// Relief board — city derivation (spec §3). Reproduces the CityResolver precedence so the
// worker derives geography the SAME way the engine does, instead of reinventing it.
//
// THE RULE (spec §0/§5.1): a city is DERIVED from (vessel, date) against vessel_port_day and
// carries a confidence tag. It is NEVER stored as truth. The only writable city is override_*.
//
// Confidence enum, in precedence order:  override > TBA > derived > provisional > seed
//   override   — an override_* value is set (human-entered truth)
//   derived    — exact berth-day hit in vessel_port_day (a real port on that date)
//   provisional— hit within ±1 day of a berth-day boundary (near, not exact)
//   seed       — immutable Keyman.xlsx seed, used when no live coverage / no date / sea day
//   TBA        — no date and no seed, or a sea day with no seed, or has_deployment=false (NCL)
//
// Pure + testable. No DB, no I/O — callers pass the port-days for the vessel.

function dayDiff(a, b) {
  const t1 = Date.parse(a), t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return NaN;
  return Math.round((t1 - t2) / 86400000);
}

// Resolve ONE city.
//   date      : ISO 'YYYY-MM-DD' or null/'' (TBA)
//   seed      : immutable port seed (on_port_seed / off_port_seed) or null
//   override  : override_on_city / override_off_city or null
//   portDays  : array of { berth_date, port_name, is_sea } for THIS vessel (may be empty)
//   hasDeployment : false for NCL etc. → forced TBA (invariant #6), unless seed/override present
// Returns { city, conf }.
export function resolveCity({ date, seed, override, portDays, hasDeployment = true } = {}) {
  seed = seed || null;
  override = override || null;
  const days = Array.isArray(portDays) ? portDays : [];

  // 1) override always wins
  if (override) return { city: override, conf: "override" };

  // NCL / no deployment coverage: cannot derive. Never fabricate. (invariant #6)
  if (!hasDeployment) return seed ? { city: seed, conf: "seed" } : { city: null, conf: "TBA" };

  // 2/3) no usable date → seed if present (never blank a seed), else TBA
  if (!date) return seed ? { city: seed, conf: "seed" } : { city: null, conf: "TBA" };

  // 4) exact berth-day hit
  const exact = days.find((d) => d.berth_date === date);
  if (exact) {
    // sea day / no real port → seed if present, else TBA
    if (exact.is_sea || !exact.port_name) {
      return seed ? { city: seed, conf: "seed" } : { city: null, conf: "TBA" };
    }
    return { city: exact.port_name, conf: "derived" };
  }

  // 5) within ±1 day of a real port-day boundary → provisional
  const near = days.find(
    (d) => d.port_name && !d.is_sea && Math.abs(dayDiff(d.berth_date, date)) <= 1
  );
  if (near) return { city: near.port_name, conf: "provisional" };

  // 7) no coverage → seed if present, else TBA
  return seed ? { city: seed, conf: "seed" } : { city: null, conf: "TBA" };
}

// Group flat vessel_port_day rows into { "<brand>|<ship_short>": [ {berth_date,port_name,is_sea}, ... ] }
export function groupPortDays(rows) {
  const m = {};
  for (const r of rows || []) {
    const k = r.brand + "|" + r.ship_short;
    (m[k] = m[k] || []).push({ berth_date: r.berth_date, port_name: r.port_name, is_sea: !!r.is_sea });
  }
  return m;
}
