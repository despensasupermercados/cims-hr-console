// Deployment-aware HR helpers — pure. Links a crew's ship to where it operates so HR can
// check the right visa and see the next dry-dock (a forced crew change). Uses VESSEL_REF +
// DRY_DOCK (already encoded from the deployment reference); no spreadsheet parse needed.

// Which entry document a region's ports require of crew. Simplification for a first-pass HR
// flag — real rules vary by nationality/itinerary; this catches the common gaps.
const REGION_VISA = {
  "Florida/Caribbean": { label: "US C1/D", field: "usv_exp" },
  "Gulf of Mexico":    { label: "US C1/D", field: "usv_exp" },
  "Northeast US":      { label: "US C1/D", field: "usv_exp" },
  "West Coast/Alaska": { label: "US C1/D", field: "usv_exp" },
  "Mediterranean":     { label: "Schengen", field: "sch_exp" },
  "Northern Europe":   { label: "Schengen", field: "sch_exp" },
  // Asia-Pacific / South America / Galapagos: requirements vary by nationality — no single flag.
};

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Match a crew's observed vessel name (e.g. "Wonder of the Seas") to a VESSEL_REF row
// (e.g. "Wonder"). Longest ref-name contained in the observed name wins.
export function shipRef(vesselObserved, vesselRef) {
  const v = norm(vesselObserved);
  if (!v) return null;
  let best = null;
  for (const r of vesselRef || []) {
    const rn = norm(r.name);
    if (rn && v.includes(rn) && (!best || rn.length > norm(best.name).length)) best = r;
  }
  return best;
}

// Next dry-dock window for a ship at/after `today` (ISO). Returns the row or null.
export function nextDryDock(shipName, dryDock, today) {
  const n = norm(shipName);
  const up = (dryDock || [])
    .filter((d) => norm(d.ship) === n && (d.end || d.start) >= today)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  return up[0] || null;
}

// Document status vs today: expired / expiring (<90d) / ok / missing.
export function docState(dt, today) {
  if (!dt) return "missing";
  const days = (new Date(dt) - new Date(today)) / 86400000;
  if (days < 0) return "expired";
  if (days < 90) return "expiring";
  return "ok";
}

// Visa fit for a crew given their ship's region. Returns null when the region has no single rule.
export function visaFit(crew, region, today) {
  const rule = REGION_VISA[region];
  if (!rule) return null;
  const exp = crew ? crew[rule.field] : null;
  return { required: rule.label, field: rule.field, exp: exp || null, status: docState(exp, today) };
}

// One-call HR deployment summary for a crew member.
export function crewDeployment(crew, vesselRef, dryDock, today) {
  const ref = shipRef(crew && crew.vessel_observed, vesselRef);
  if (!ref) return { matched: false, vessel: (crew && crew.vessel_observed) || null };
  return {
    matched: true,
    vessel: ref.name, brand: ref.brand, cls: ref.cls,
    homeport: ref.homeport, region: ref.region,
    nextDryDock: nextDryDock(ref.name, dryDock, today),
    visa: visaFit(crew, ref.region, today),
  };
}
