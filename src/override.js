// Manual-override merge — pure, testable. crew_override holds per-field manual edits that ALWAYS
// win over the imported base crew row. The import never writes crew_override EXCEPT the one case
// Rita ratifies: an accepted override conflict (D3) clears that single field so the ratified TDG
// value can show (crew_import_routes.js; audited in sync_conflict). This is the single
// merge used by every crew read. baseline_count is money: 0 is a valid override (Jr PS) and must
// win; an empty string is treated as "not set" and never clobbers the base.

export const OVR_FIELDS = ["first_name", "middle_name", "last_name", "status", "rank_override",
  "vessel_observed", "dob", "province", "phone", "email", "pp_no", "med_exp", "sirb_exp",
  "pp_exp", "usv_exp", "sch_exp", "baseline_count", "notes"];

export function applyOverride(base, ov) {
  if (!ov) return base;
  const o = { ...base };
  for (const k of OVR_FIELDS) { if (ov[k] != null && ov[k] !== "") o[k] = ov[k]; }
  return o;
}
