// Document-expiry compliance — pure, testable. No DB, no side effects.
// Flags crew whose travel/medical documents are expired or expiring soon, so
// rotations are never booked on a seafarer who can't legally sail.
// Dates are plain ISO 'YYYY-MM-DD'. Source fields are dirty, so parsing is defensive.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Required docs (missing = a problem) and optional docs (missing = fine).
export const REQUIRED_DOCS = [
  ["Medical", "med_exp"],
  ["Seaman's Book", "sirb_exp"],
  ["Passport", "pp_exp"],
  ["US C1/D Visa", "usv_exp"],
];
export const OPTIONAL_DOCS = [
  ["Schengen", "sch_exp"],
];

const SEVERITY = { expired: 3, expiring: 2, missing: 1, ok: 0 };

// daysUntil: integer days from `today` to `iso` (negative = past). null if unparseable.
export function daysUntil(iso, today) {
  if (!iso || typeof iso !== "string" || !ISO.test(iso.trim())) return null;
  const d = new Date(iso.trim() + "T00:00:00Z");
  const t = new Date(today + "T00:00:00Z");
  if (isNaN(d) || isNaN(t)) return null;
  return Math.round((d - t) / 86400000);
}

export function docStatus(iso, today, warnDays = 60) {
  const n = daysUntil(iso, today);
  if (n === null) return { status: "missing", days: null };
  if (n < 0) return { status: "expired", days: n };
  if (n <= warnDays) return { status: "expiring", days: n };
  return { status: "ok", days: n };
}

// crewComplianceReport: returns only crew with at least one flag, sorted most-urgent first.
// today: ISO 'YYYY-MM-DD'. warnDays: lead-time window for "expiring".
export function crewComplianceReport(rows, today, warnDays = 60) {
  const out = [];
  for (const c of rows || []) {
    const flags = [];
    let worst = 0;
    let soonest = Infinity;
    for (const [label, field] of REQUIRED_DOCS) {
      const r = docStatus(c[field], today, warnDays);
      if (r.status !== "ok") {
        flags.push({ doc: label, field, status: r.status, days: r.days, exp: c[field] || null });
        worst = Math.max(worst, SEVERITY[r.status]);
        if (r.days != null) soonest = Math.min(soonest, r.days);
      }
    }
    for (const [label, field] of OPTIONAL_DOCS) {
      const r = docStatus(c[field], today, warnDays);
      // optional: only flag if present-but-expired/expiring, never "missing"
      if (r.status === "expired" || r.status === "expiring") {
        flags.push({ doc: label, field, status: r.status, days: r.days, exp: c[field] || null, optional: true });
        worst = Math.max(worst, SEVERITY[r.status]);
        if (r.days != null) soonest = Math.min(soonest, r.days);
      }
    }
    if (flags.length) {
      out.push({
        agency_id: c.agency_id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
        vessel: c.vessel_observed || null,
        status: c.status || null,
        severity: worst,                // 3 expired, 2 expiring, 1 missing
        soonestDays: soonest === Infinity ? null : soonest,
        flags,
      });
    }
  }
  // most urgent first: higher severity, then soonest expiry
  out.sort((a, b) =>
    b.severity - a.severity ||
    (a.soonestDays ?? 1e9) - (b.soonestDays ?? 1e9) ||
    String(a.name).localeCompare(String(b.name))
  );
  return out;
}
