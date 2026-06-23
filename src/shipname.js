// Ship-name canonicalization — pure, testable. SINGLE SOURCE OF TRUTH for turning any
// raw ship string (registry "MV CELEBRITY REFLECTION", keyman leg "Reflection", schedule-tab
// "Celebrity Reflection" / "Azamara Quest" / "MV AZAMARA QUEST") into ONE canonical short
// name ("Reflection", "Quest"). The rotation board keys registry, keyman history and schedule
// history off this; if the three disagree, sections fragment and history silently disappears
// (the bug this module fixes: ~38% of schedule history rows were dropped because the schedule
// tabs prefix Celebrity ships and use Azamara short names that VESSEL_REF does not contain).

export function normShip(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }

// Azamara is NOT in VESSEL_REF (the reference snapshot has no Azamara hulls), and the registry
// writes "MV AZAMARA QUEST" while keyman/schedule use the bare short name "Quest". Map both.
export const AZ_DISP = { journey: "Journey", onward: "Onward", quest: "Quest", pursuit: "Pursuit" };
export const AZAMARA_SHORT = Object.keys(AZ_DISP);

// Precompute the VESSEL_REF match keys once (longest-first so "Constellation" beats "Star" etc.).
export function buildShipKeys(vesselRef) {
  return (vesselRef || [])
    .map(v => ({ key: normShip(v.name), name: v.name }))
    .filter(v => v.key)
    .sort((a, b) => b.key.length - a.key.length);
}

// Canonicalize against precomputed keys. Resolution order:
//   1. longest VESSEL_REF short name contained in the raw string  -> canonical VESSEL_REF casing
//   2. an Azamara short name contained in the raw string          -> "Journey"/"Onward"/"Quest"/"Pursuit"
//   3. fallback: strip "MV " prefix + " of the Seas" suffix, trim -> prettified raw (unknown ship)
// Returns null only for empty/whitespace input. Unknown-but-nonempty names are preserved so the
// caller's own valid-ship guard (not this function) decides whether to surface them.
export function canonShipWith(raw, keys) {
  const nv = normShip(raw);
  if (!nv) return null;
  for (const v of keys) if (nv.indexOf(v.key) >= 0) return v.name;
  for (const k of AZAMARA_SHORT) if (nv.indexOf(k) >= 0) return AZ_DISP[k];
  return String(raw).replace(/^mv\s+/i, "").replace(/\s+of the seas\s*$/i, "").trim() || null;
}

// Convenience: canonicalize a single raw name against a VESSEL_REF array.
export function canonShip(raw, vesselRef) { return canonShipWith(raw, buildShipKeys(vesselRef)); }

// The set of normShip keys that are "real" ships and may anchor a history-only board section:
// every VESSEL_REF hull plus the four Azamara short names. Junk schedule cells (e.g. a stray
// "# of flights:" header) canonicalize to themselves, are absent here, and are dropped.
export function validShipKeys(vesselRef) {
  const s = new Set((vesselRef || []).map(v => normShip(v.name)));
  for (const k of AZAMARA_SHORT) s.add(k);
  return s;
}
