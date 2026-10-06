// Effective crew status — the ONE rule, in one place (CLAUDE.md §11).
//
// Status is DERIVED AT READ TIME from the live board schedule, not read off the raw `crew.status`
// column. `crew.status` is what the last AdvancedQuery import happened to say; the board is what
// is actually true. Every view that reports status must use this rule, or two screens disagree
// about the same seafarer — which is exactly how the crew list and the dashboard diverged before
// 2026-09-04, and how the Fleet Document Radar came to report 5 crew Rita had tagged Retired.
//
// Precedence: a manual `retired` flag wins, then a manual `crew_override.status`, then the
// schedule, then the registry value as the fallback.
//
// Extracted from worker.js (2026-09-11) so doc_radar.js can share the rule instead of growing a
// second copy of it — §3: deployed code must equal tested code, and duplication is how the two
// drift apart.
import { deriveStatus, REGISTRY_STATUSES } from "./contracts.js";
import { VESSEL_REF } from "./vessel_ref.js";
import { buildShipKeys, canonShipWith, normShip } from "./shipname.js";
import { normalizeStatus } from "./crewimport.js";

const SHIP_KEYS = buildShipKeys(VESSEL_REF);
const hullKey = (v) => (v ? normShip(canonShipWith(v, SHIP_KEYS) || v) : "");

// A crew the latest AdvancedQuery does not carry (an open 'presence' flag, crew_apply D4). Their last
// word is not today's (Jaramiz Tuazon: absent from seven files since 6 Sep 2026 while the console still
// counted him On board, Explorer). The status says so instead of freezing at the last word.
export const NOT_IN_FILE = "Not in TDG file";
// ONE way every crew read learns that fact: one LEFT JOIN, no extra round trip (§12). Splice it after
// `FROM crew` and select TDG_ABSENT_COL; crewStatus reads base.tdg_absent.
// It also brings the hull the file last NAMED (the newest ship flag, any state; else the registry column):
// tdg_ship, which tells a completed contract on THAT hull from an old one elsewhere (knownCompleted).
// THE FILE ITSELF (6 Oct 2026): the kept copy of the latest AdvancedQuery (registry_snapshot) brings the
// file's status word (tdg_status, tdg_raw) and vessel for every crew it carries — the same join, no extra
// round trip. A crew without a kept row falls back to the flags and the registry column, as before.
export const TDG_ABSENT_JOIN = "LEFT JOIN (SELECT DISTINCT agency_id AS ab_id FROM sync_conflict WHERE field='presence' AND resolved=0) ab ON ab.ab_id = crew.agency_id " +
  "LEFT JOIN (SELECT agency_id AS vf_id, new_value AS vf_ship FROM (SELECT agency_id, new_value, ROW_NUMBER() OVER (PARTITION BY agency_id ORDER BY created_at DESC, resolved ASC) AS vf_rn FROM sync_conflict WHERE field='vessel_observed') WHERE vf_rn=1) vf ON vf.vf_id = crew.agency_id " +
  // aliased in a subquery: the snapshot's own agency_id/status/vessel columns would make the readers'
  // unqualified `SELECT agency_id, status, ...` ambiguous (caught 6 Oct 2026 by the real-SQLite run).
  "LEFT JOIN (SELECT agency_id AS rs_id, status AS rs_status, vessel AS rs_vessel, raw_status AS rs_raw FROM registry_snapshot) rs ON rs.rs_id = crew.agency_id";
export const TDG_ABSENT_COL = "(ab.ab_id IS NOT NULL) AS tdg_absent, COALESCE(rs.rs_vessel, vf.vf_ship, crew.vessel_observed) AS tdg_ship, rs.rs_status AS tdg_status, rs.rs_raw AS tdg_raw";

// The latest file's own status word for this crew, from the kept copy: null when the console holds no
// copy for them (then crew.status, which every upload writes, D6, stands in).
export function fileStatusOf(base) {
  if (!base) return null;
  return base.tdg_status || normalizeStatus(base.tdg_raw) || null;
}

// The console KNOWS the contract ended: nothing on the schedule spans today, no current leg is overdue,
// the newest started leg was closed by a recorded sign-off within the last 180 days, and — when the file
// names a hull — it was on THAT hull. An older closure, or one on another hull (Santos: Quest closed 29 Jul,
// the file has him On board Wonder), under a file that says On board is a new contract the Counter does not
// carry yet, not a completed one.
export function knownCompleted(legs, today, fileShip, maxDays = 180) {
  const L = (legs || []).filter((l) => l && l.on && l.on <= today);
  if (!L.length) return false;
  for (const l of L) {
    if (!l.off || today <= l.off) return false;      // aboard today per the schedule
    if (l.is_current) return false;                  // past its PROJECTED sign-off: overdue, not gone
  }
  const last = L.reduce((m, l) => (l.on > m.on ? l : m), L[0]);
  if (fileShip && last.ship && hullKey(last.ship) !== hullKey(fileShip)) return false;
  const off = Date.parse(last.off + "T00:00:00Z"), now = Date.parse(today + "T00:00:00Z");
  return Number.isFinite(off) && Number.isFinite(now) && (now - off) / 86400000 <= maxDays;
}

// Schedule legs per crew, keyed by agency id. No legs = no schedule, and status falls back to the
// registry value. Feed this `boardLegs(env)` — the ONE schedule — never the frozen SHIP_HISTORY
// constant (§11).
export function scheduleBySc(legs) {
  const m = {};
  // is_current rides along (5 Oct 2026): deriveStatus needs to tell a leg past its PROJECTED sign-off
  // (still current: overdue, not gone) from one Rita closed with a recorded sign-off.
  for (const h of (legs || [])) { if (!h.ours || !h.sc) continue; (m[h.sc] = m[h.sc] || []).push({ on: h.on, off: h.off, is_current: !!h.is_current, ship: h.ship || null }); }
  return m;
}

// Effective status (Miguel, 5 Oct 2026: "TDG is the one true source of knowledge"):
//   1. the manual 'Retired' tag; 2. a manual status edit (Rita's — the board lists it where it disagrees
//   with the file); 3. not in the latest TDG file -> NOT_IN_FILE; 4. THE FILE'S WORD (crew.status, which the
//   registry import writes every upload, D6) — except On board where the console KNOWS the contract ended
//   (a recorded sign-off, nothing aboard since): On Vacation, and the board lists the disagreement;
//   5. no readable word -> derived from the live schedule, as before 5 Oct.
// Until 5 Oct the schedule outranked the file: a July Counter leg kept a crew On board after TDG said On
// Vacation, and a crew TDG had aboard on a contract the Counter did not carry read On Vacation.
// 6 Oct 2026 (Miguel: "adapt the keyman and the console to ensure it reflect the tdg import"): when the
// kept file says ON BOARD or EARMARKED, that word wins over Rita's Retired tag and status edit — TDG has
// them active, so the console does too (Valdesco: tagged Retired in July, On board Brilliance per TDG). The
// tag stays on the record and the board lists it for removal. Only the KEPT file can do this: crew.status
// under a manual edit is not the file's word (D3 keeps the old value there).
export function crewStatus(base, ov, schedLegs, today) {
  ov = ov || {};
  const absent = !!(base && (base.tdg_absent === true || Number(base.tdg_absent) > 0));
  const kept = fileStatusOf(base);
  if (!absent && (kept === "On board" || kept === "Earmarked")) {
    if (kept === "On board" && knownCompleted(schedLegs, today, base.tdg_ship || null)) return "On Vacation";
    return kept;
  }
  if (ov.retired) return "Retired";
  if (ov.status != null && ov.status !== "") return ov.status;
  if (absent) return NOT_IN_FILE;
  const file = kept || (base && base.status);
  if (REGISTRY_STATUSES.has(file)) {
    if (file === "On board" && knownCompleted(schedLegs, today, base.tdg_ship || null)) return "On Vacation";
    return file;
  }
  return deriveStatus(schedLegs || [], today, { imported: file });
}

// Crew who have left the fleet. An expired document on someone who is gone is not an action item,
// and reporting it buries the people who are still sailing.
export const OFF_FLEET = new Set(["Retired", "Inactive"]);
export function isOffFleet(status) { return OFF_FLEET.has(String(status || "")); }
