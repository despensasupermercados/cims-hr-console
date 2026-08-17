// Effective crew status — pure, testable, and SHARED.
//
// Why this module exists: status used to be derived inline in worker.js only. Any reader that
// could not import from worker.js (doc_radar.js — worker.js imports IT, so the reverse is a
// cycle) had to fall back to the raw `crew.status` column, which is the stale imported value.
// That is exactly the regression CLAUDE.md §11 warns about, and it shipped: the Fleet Document
// Radar email reported 12 of 21 crew with a status the console disagreed with (2026-08-17,
// Maryjoy Manzanares -> Rita Berenyi).
//
// This module is the intended single home for the derivation.
//
// FOLLOW-UP REQUIRED: worker.js still carries its own identical copy of both functions. Removing
// it (delete the two definitions, add `import { scheduleBySc, crewStatus } from "./crew_status.js"`)
// is a 12-line edit that could not be pushed with this commit — worker.js is 437 KB and exceeds a
// single API write. Until that lands there are two copies, which is the very condition that caused
// this bug. Do not leave it.

import { deriveStatus } from "./contracts.js";
import { SHIP_HISTORY } from "./ship_history.js";

// Schedule assignments per crew, keyed by SC agency id, for the auto status derivation.
export function scheduleBySc(legs) {
  const m = {};
  for (const h of (legs || SHIP_HISTORY)) {
    if (!h.ours || !h.sc) continue;
    (m[h.sc] = m[h.sc] || []).push({ on: h.on, off: h.off });
  }
  return m;
}

// Effective status: manual 'Retired' tag wins; else a manual status edit wins; else auto-derive
// from the live schedule (on a ship now -> On board; signed off -> On Vacation; only future /
// none -> registry value).
export function crewStatus(base, ov, schedLegs, today) {
  ov = ov || {};
  if (ov.retired) return "Retired";
  if (ov.status != null && ov.status !== "") return ov.status;
  return deriveStatus(schedLegs || [], today, { imported: base && base.status });
}

// Crew who are off the fleet. Their expired documents are not action items, so every compliance
// view drops them. Kept here so "what counts as active" is defined once.
export const OFF_FLEET = new Set(["Retired", "Inactive"]);
export function isOffFleet(status) { return OFF_FLEET.has(status); }
