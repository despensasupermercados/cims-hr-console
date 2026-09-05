// Crew import REVIEW layer — pure, testable. Classifies the diff produced by
// crewimport.diffCrew() into human-review tiers, so Rita ratifies changes before they
// touch the roster. No DB, no side effects (same shape as compliance.js / override.js).
//
// Design decisions — session 2026-07-13 (see docs/CREW_IMPORT_DECISIONS.md):
//   D1  Ship allocation is Rita's. The import NEVER writes vessel_observed; a change is a
//       FLAG only (reconciled on the board), never an auto-write.
//   D2  Certificates default ACCEPT (TDG maintains them). An expiry moving EARLIER is flagged.
//   D3  A change to a field with a LIVE crew_override defaults KEEP — never silently overwrites
//       a manual correction (reinforces the override-wins rule in override.js / CLAUDE.md §11).
//   D4  Crew present in the roster but absent from the file are FLAGGED, never auto-removed.
//   D5  Selective friction: only ship / status / override / earlier-expiry demand attention;
//       minor hygiene (province, etc.) auto-applies. An approval that fires on every trivial
//       row trains the reviewer to rubber-stamp — worse than no gate.

import { OVR_FIELDS } from "./override.js";

// Import field -> the crew_override column that overrides it, where the names differ. The file's
// "rank" lands on crew.rank_observed; Rita's manual rank lives in crew_override.rank_override.
// Without this map a rank change under a live manual rank was accepted silently (CERT tier) and
// never showed, because the override kept winning (2026-09-05 review of #89).
// (crew.rank_override — the base table's own lateral-hire column — would mask a rank the same way;
// 0 crew carry it in prod as of 2026-09-05, so it is not modelled here. Revisit if that changes.)
export const OVR_COL = { rank_observed: "rank_override" };
const ovrCol = (f) => OVR_COL[f] || f;
const importField = (col) => Object.keys(OVR_COL).find(k => OVR_COL[k] === col) || col;

export const TIER = {
  SHIP: "ship_flag",
  OVERRIDE: "override_conflict",
  CRITICAL: "critical",
  CERT: "cert",
  MINOR: "minor",
};

// Tracked cert fields (all are expiry dates in the AdvancedQuery import).
const CERT_FIELDS = new Set(["med_exp", "sirb_exp", "pp_exp", "sch_exp", "usv_exp"]);
// Low-stakes hygiene fields that auto-apply without asking.
const MINOR_FIELDS = new Set(["province"]);

// ISO 'YYYY-MM-DD' compares correctly as a string; guard nulls / non-strings.
function isEarlier(next, prev) {
  if (!next || !prev) return false;
  return String(next) < String(prev);
}

// The set of fields a crew_override actively sets (non-null, non-empty) and is not retired.
export function liveOverrideFields(ov) {
  const s = new Set();
  if (!ov || ov.retired) return s;
  for (const k of OVR_FIELDS) if (ov[k] != null && ov[k] !== "") s.add(k);
  return s;
}

// Classify a single changed field. Returns { tier, write, defaultAccept?, defaultKeep?, auto?, earlier? }.
export function classifyField(field, oldVal, newVal, liveOvr) {
  if (field === "vessel_observed") {
    // D1 — never written by the import; surface as a board reconciliation flag.
    return { tier: TIER.SHIP, write: false, defaultKeep: true };
  }
  if (liveOvr && liveOvr.has(ovrCol(field))) {
    // D3 — a live manual override sits here; keep it unless Rita explicitly accepts.
    return { tier: TIER.OVERRIDE, write: true, defaultKeep: true };
  }
  if (field === "status") {
    return { tier: TIER.CRITICAL, write: true, defaultKeep: true };
  }
  if (CERT_FIELDS.has(field)) {
    // D2 — trusted; accept by default, flag an expiry that moved earlier.
    return { tier: TIER.CERT, write: true, defaultAccept: true, earlier: isEarlier(newVal, oldVal) };
  }
  if (MINOR_FIELDS.has(field)) {
    return { tier: TIER.MINOR, write: true, auto: true };
  }
  // name / email / rank_observed — low-prominence, accept by default.
  return { tier: TIER.CERT, write: true, defaultAccept: true };
}

// buildReview: turn a diffCrew() result into review groups the UI renders and the apply route consumes.
//   diff              : output of crewimport.diffCrew()  ({ add, change, needsStatus, ... })
//   existingByAgency  : agency_id -> existing base crew row
//   incomingByAgency  : agency_id -> mapped incoming row (crewimport.mapRow output)
//   overrideByAgency  : agency_id -> crew_override row (may be undefined)
// Pure. Writes nothing.
export function buildReview(diff, existingByAgency = {}, incomingByAgency = {}, overrideByAgency = {}) {
  const groups = {
    ship_flag: [], override_conflict: [], critical: [], cert: [], minor: [],
    new: [], departed: [], needs_status: [],
  };

  const seen = new Set(); // agency:field already raised
  for (const ch of diff.change || []) {
    const ex = existingByAgency[ch.agency_id] || {};
    const inc = incomingByAgency[ch.agency_id] || {};
    const ov = overrideByAgency[ch.agency_id];
    const liveOvr = liveOverrideFields(ov);
    for (const field of ch.changed) {
      const c = classifyField(field, ex[field] ?? null, inc[field] ?? null, liveOvr);
      const item = { agency_id: ch.agency_id, field, old: ex[field] ?? null, new: inc[field] ?? null, ...c };
      if (c.tier === TIER.OVERRIDE) {
        // What Rita sees on the card, and what an accept replaces, is the MANUAL value — not the
        // base row the file is diffed against. Carry it so the card, the audit row and the clear
        // all name the value actually being superseded (2026-09-05 review).
        item.override_field = ovrCol(field);
        item.override_value = ov[item.override_field];
        item.base = item.old;
        item.old = item.override_value;
      }
      seen.add(ch.agency_id + ":" + field);
      (c.auto ? groups.minor : groups[c.tier]).push(item);
    }
  }
  // diffCrew compares the file with the BASE row. When the base already equals the file but a
  // live manual override says otherwise (e.g. an earlier accept wrote the base while the override
  // kept winning), no change is detected and the disagreement would never surface. Raise it here
  // so Rita decides. Ship allocation is excluded: it is never written by the import (D1).
  for (const [id, inc] of Object.entries(incomingByAgency)) {
    const ex = existingByAgency[id];
    if (!ex) continue;
    const ov = overrideByAgency[id];
    for (const col of liveOverrideFields(ov)) {
      const field = importField(col); // the file's name for this field
      if (field === "vessel_observed" || seen.has(id + ":" + field)) continue;
      const nv = inc[field];
      if (nv == null || nv === "") continue;
      if (String(nv) === String(ov[col])) continue;
      const c = classifyField(field, ex[field] ?? null, nv, new Set([col]));
      groups[TIER.OVERRIDE].push({ agency_id: id, field, override_field: col, old: ov[col], base: ex[field] ?? null, new: nv, override_value: ov[col], ...c });
      seen.add(id + ":" + field);
    }
  }

  for (const id of diff.add || []) {
    groups.new.push({ agency_id: id, fields: incomingByAgency[id] || {} });
  }
  for (const id of diff.needsStatus || []) {
    groups.needs_status.push({ agency_id: id, fields: incomingByAgency[id] || {} });
  }
  // D4 — departed: in the roster, absent from this file. Flag only.
  for (const id of Object.keys(existingByAgency)) {
    if (!incomingByAgency[id]) groups.departed.push({ agency_id: id, last: existingByAgency[id] });
  }

  const counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
  const attention = counts.ship_flag + counts.override_conflict + counts.critical +
    groups.cert.filter(c => c.earlier).length;
  return { groups, counts, attention };
}
