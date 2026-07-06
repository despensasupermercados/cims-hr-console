// CIMS Watcher — read-only invariant engine (SPEC v5 §15). v1 = DETECT only; never mutates,
// never deploys. Pure functions over plain row arrays so they unit-test without D1. The worker
// wires this by fetching rows once and calling runSweep(); alerting reuses the CIMS Brain
// WhatsApp path, exception-only (silence = healthy). Remediation (§15.4) and code-fix PRs
// (§15.5) are v2 — this module only reports.
//
// Row shapes (as read from D1):
//   leg     : { sc, km, ship, brand, sign_on, proj_off, off_conf }   // keyman_contract3 (+ contract_edit.off_conf, ship==ship_short)
//   vessel  : { id, brand, ship_short }
//   vpd     : { brand, ship_short, berth_date, stop_seq, port_name, is_sea }
//   cityRow : { sc, ship, disembark, sign_off, off_conf }            // contract_edit
//   crewIds : Set<string> of crew.agency_id

const norm = (s) => String(s == null ? "" : s).trim();

// INV1 [CRITICAL] split-brain: a firm derived sign-off city must equal the deployment (vessel_port_day).
export function checkSplitBrain(cityRows, vpd) {
  const idx = new Map();
  for (const v of vpd) if (Number(v.stop_seq) === 1)
    idx.set(`${norm(v.ship_short)}|${norm(v.berth_date)}`, v.port_name);
  const out = [];
  for (const c of cityRows) {
    if (Number(c.off_conf) !== 1 || !c.sign_off) continue;
    const dep = idx.get(`${norm(c.ship)}|${norm(c.sign_off)}`);
    if (dep !== undefined && norm(dep) !== norm(c.disembark))
      out.push({ inv: "INV1", sev: "CRITICAL", sc: c.sc, ship: c.ship, board: c.disembark, deployment: dep });
  }
  return out;
}

// INV2 [HIGH] brand-key: no duplicate (brand, ship_short) in the registry.
export function checkBrandKeyDupes(vessels) {
  const seen = new Map(), out = [];
  for (const v of vessels) {
    const k = `${norm(v.brand)}|${norm(v.ship_short)}`;
    if (seen.has(k)) out.push({ inv: "INV2", sev: "HIGH", brand: v.brand, ship_short: v.ship_short });
    seen.set(k, true);
  }
  return out;
}

// INV3 [HIGH] a leg must resolve to EXACTLY ONE vessel by (brand, ship_short).
// This is the invariant that caught the NCL Star/Jewel regression: joining by ship name alone
// (no brand) matches two hulls once Norwegian is registered.
export function checkLegVesselResolves(legs, vessels) {
  const out = [];
  for (const leg of legs) {
    const matches = vessels.filter(
      (v) => norm(v.ship_short) === norm(leg.ship) && norm(v.brand) === norm(leg.brand)
    ).length;
    if (matches !== 1)
      out.push({ inv: "INV3", sev: "HIGH", sc: leg.sc, ship: leg.ship, brand: leg.brand, matches });
  }
  return out;
}

// INV4 [HIGH] orphan (sc): a city/override row with no owning leg.
export function checkOrphanCityRows(legs, cityRows) {
  const legSc = new Set(legs.map((l) => l.sc));
  return cityRows.filter((c) => !legSc.has(c.sc))
    .map((c) => ({ inv: "INV4", sev: "HIGH", sc: c.sc }));
}

// INV5 [HIGH] name integrity: a bound km must be a real crew agency_id (TDG legal record).
export function checkNameIntegrity(legs, crewIds) {
  return legs.filter((l) => l.km != null && !crewIds.has(norm(l.km)))
    .map((l) => ({ inv: "INV5", sev: "HIGH", sc: l.sc, km: l.km }));
}

// INV6 [HIGH] notice-safety: hold T-14 if the sign-off city is soft (off_conf != 1).
export function checkSoftCityT14(legs, today = new Date()) {
  const out = [];
  for (const l of legs) {
    if (!l.proj_off || Number(l.off_conf) === 1) continue;
    if (daysUntil(minus14(l.proj_off), today) <= 2)
      out.push({ inv: "INV6", sev: "HIGH", sc: l.sc, ship: l.ship, proj_off: l.proj_off });
  }
  return out;
}

// INV7 first-enable guard (§14.5): T-14 already elapsed / imminent (info list for [G5]).
export function firstEnableT14(legs, today = new Date()) {
  return legs.filter((l) => l.proj_off && daysUntil(minus14(l.proj_off), today) <= 2)
    .map((l) => ({ inv: "INV7", sev: "INFO", sc: l.sc, ship: l.ship, proj_off: l.proj_off, t14: minus14(l.proj_off) }))
    .sort((a, b) => a.proj_off.localeCompare(b.proj_off));
}

// INV8 [HIGH] NCL foundation intact: NCL vessels carry zero legs.
export function checkNclZeroLegs(legs, vessels) {
  const ncl = new Set(vessels.filter((v) => norm(v.brand) === "NCL").map((v) => norm(v.ship_short)));
  return legs
    .filter((l) => norm(l.brand) === "NCL" || (ncl.has(norm(l.ship)) && norm(l.brand) === "NCL"))
    .map((l) => ({ inv: "INV8", sev: "HIGH", sc: l.sc, ship: l.ship }));
}

// Aggregate. data = { legs, vessels, vpd, cityRows, crewIds:Set, today }
export function runSweep(data) {
  const { legs = [], vessels = [], vpd = [], cityRows = [], crewIds = new Set(), today = new Date() } = data;
  const violations = [
    ...checkSplitBrain(cityRows, vpd),
    ...checkBrandKeyDupes(vessels),
    ...checkLegVesselResolves(legs, vessels),
    ...checkOrphanCityRows(legs, cityRows),
    ...checkNameIntegrity(legs, crewIds),
    ...checkSoftCityT14(legs, today),
    ...checkNclZeroLegs(legs, vessels),
  ];
  const info = firstEnableT14(legs, today);
  const critical = violations.filter((v) => v.sev === "CRITICAL");
  const high = violations.filter((v) => v.sev === "HIGH");
  return { healthy: violations.length === 0, critical, high, info, violations };
}

// --- date helpers (YYYY-MM-DD) ---
function minus14(d) { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - 14); return t.toISOString().slice(0, 10); }
function daysUntil(dateStr, today) {
  const a = new Date(dateStr + "T00:00:00Z");
  const todayStr = today && today.toISOString ? today.toISOString().slice(0, 10) : String(today);
  const b = new Date(todayStr + "T00:00:00Z");
  return Math.round((a - b) / 86400000);
}
