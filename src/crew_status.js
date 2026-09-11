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
import { deriveStatus } from "./contracts.js";

// Schedule legs per crew, keyed by agency id. No legs = no schedule, and status falls back to the
// registry value. Feed this `boardLegs(env)` — the ONE schedule — never the frozen SHIP_HISTORY
// constant (§11).
export function scheduleBySc(legs) {
  const m = {};
  for (const h of (legs || [])) { if (!h.ours || !h.sc) continue; (m[h.sc] = m[h.sc] || []).push({ on: h.on, off: h.off }); }
  return m;
}

// Effective status: manual 'Retired' tag wins; else a manual status edit wins; else auto-derive from
// the live schedule (on a ship now -> On board; signed off -> On Vacation; only future / none -> registry).
export function crewStatus(base, ov, schedLegs, today) {
  ov = ov || {};
  if (ov.retired) return "Retired";
  if (ov.status != null && ov.status !== "") return ov.status;
  return deriveStatus(schedLegs || [], today, { imported: base && base.status });
}

// Crew who have left the fleet. An expired document on someone who is gone is not an action item,
// and reporting it buries the people who are still sailing.
export const OFF_FLEET = new Set(["Retired", "Inactive"]);
export function isOffFleet(status) { return OFF_FLEET.has(String(status || "")); }
