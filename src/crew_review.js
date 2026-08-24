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
//   D5  Selective friction: only ship / override / earlier-expiry / identity demand attention;
//       minor hygiene (province, etc.) auto-applies. An approval that fires on every trivial
//       row trains the reviewer to rubber-stamp — worse than no gate.
//   D6  (2026-08-24) STATUS IS TDG'S, and defaults ACCEPT. See below.
//   D7  (2026-08-24) Identity is agency_id first, cruise-line id second; an id collision is
//       a flag, never an auto-rekey.

import { OVR_FIELDS } from "./override.js";

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
  if (liveOvr && liveOvr.has(field)) {
    // D3 — a live manual override sits here; keep it unless Rita explicitly accepts.
    return { tier: TIER.OVERRIDE, write: true, defaultKeep: true };
  }
  if (field === "status") {
    // D6 — TDG owns crew status. It is the register of who is aboard, on leave, earmarked
    // or inactive; the console has no independent way to know. It therefore defaults to
    // ACCEPT, like the certificates in D2.
    //
    // Why this changed: status previously defaulted to KEEP. Because the reviewer has to
    // flip every row by hand to make a keep-by-default field move, the roster simply stopped
    // tracking reality — 32 crew sat on a stale status for six weeks while every weekly
    // import dutifully logged the correct value to sync_conflict and threw it away. The
    // Fleet Document Radar of 2026-08-24 went out with 22 flagged crew, most of them wrong,
    // and proposed retiring five men who were aboard. Status is high-consequence, which is
    // an argument for making it VISIBLE and REVERSIBLE, not for making it hard to apply.
    // It stays in the CRITICAL tier so it is still shown prominently and can still be kept
    // per row — but the default now moves the registry toward the source of truth.
    return { tier: TIER.CRITICAL, write: true, defaultAccept: true };
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
//   diff              : output of crewimport.diffCrew()  ({ add, change, needsStatus, rekeyed, ... })
//   existingByAgency  : agency_id -> existing base crew row
//   incomingByAgency  : agency_id -> mapped incoming row (crewimport.mapRow output)
//   overrideByAgency  : agency_id -> crew_override row (may be undefined)
// Pure. Writes nothing.
export function buildReview(diff, existingByAgency = {}, incomingByAgency = {}, overrideByAgency = {}) {
  const groups = {
    ship_flag: [], override_conflict: [], critical: [], cert: [], minor: [],
    new: [], departed: [], needs_status: [], rekeyed: [],
  };

  // Rows the file keyed on a cruise-line id that we matched to an existing crew member.
  // Without this they would have been INSERTed as duplicates.
  const rekeyedIncoming = new Set();
  for (const rk of diff.rekeyed || []) {
    groups.rekeyed.push(rk);
    rekeyedIncoming.add(String(rk.incoming_id));
  }

  for (const ch of diff.change || []) {
    const ex = existingByAgency[ch.agency_id] || {};
    const inc = incomingByAgency[ch.incoming_id ?? ch.agency_id] || {};
    const liveOvr = liveOverrideFields(overrideByAgency[ch.agency_id]);
    for (const field of ch.changed) {
      const c = classifyField(field, ex[field] ?? null, inc[field] ?? null, liveOvr);
      const item = { agency_id: ch.agency_id, field, old: ex[field] ?? null, new: inc[field] ?? null, ...c };
      (c.auto ? groups.minor : groups[c.tier]).push(item);
    }
  }

  for (const id of diff.add || []) {
    if (rekeyedIncoming.has(String(id))) continue; // matched an existing member — not new
    groups.new.push({ agency_id: id, fields: incomingByAgency[id] || {} });
  }
  for (const id of diff.needsStatus || []) {
    groups.needs_status.push({ agency_id: id, fields: incomingByAgency[id] || {} });
  }
  // D4 — departed: in the roster, absent from this file. Flag only.
  const seen = new Set(Object.keys(incomingByAgency));
  for (const ch of diff.change || []) seen.add(String(ch.agency_id));
  for (const id of Object.keys(existingByAgency)) {
    if (!seen.has(String(id))) groups.departed.push({ agency_id: id, last: existingByAgency[id] });
  }

  const counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
  // What genuinely needs a human: ship placement, a live override, an identity collision,
  // and an expiry that moved backwards. Status is no longer here — it is applied by default
  // and reported, which is what D6 is for.
  const attention = counts.ship_flag + counts.override_conflict + counts.rekeyed +
    groups.cert.filter(c => c.earlier).length;
  return { groups, counts, attention };
}
