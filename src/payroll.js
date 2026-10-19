// PAYROLL DATES — the days each month's pay lands (Miguel, 19 Oct 2026: "with payroll 2027, I will have to give you that
// later and you will have to update the payload to receive it. I don't want something really complicated"). DATA, not
// code: a new year is one more list of twelve [pay for month, paid on] pairs, from payroll's own PDF ("Payroll dates
// <year>.pdf"), typed as payroll published it. Never derived, never guessed. Read by the Crew Hub (src/crew_hub.js).
// Not money (§1): it says when pay lands, never how much. Pinned by test/crew_hub.test.js.
export const PAYROLL = {
  2026: [["01", "2026-02-04"], ["02", "2026-03-04"], ["03", "2026-04-01"], ["04", "2026-04-29"], ["05", "2026-06-03"], ["06", "2026-07-01"],
    ["07", "2026-08-03"], ["08", "2026-09-02"], ["09", "2026-09-30"], ["10", "2026-11-04"], ["11", "2026-12-02"], ["12", "2026-12-30"]],
};

const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

// One year's rows, oldest first: [{ year, m, paid }]. A year payroll has not published is [].
export function payrollRows(year, table = PAYROLL) {
  const y = String(year);
  return (table[y] || []).map(([m, paid]) => ({ year: +y, m: +m, paid }));
}

// The next payday on or after `today`, this year or the next published one; null when none is published yet.
export function nextPayday(today, table = PAYROLL) {
  const t = iso(today);
  if (!t) return null;
  const y = +t.slice(0, 4);
  const hit = [...payrollRows(y, table), ...payrollRows(y + 1, table)].find((r) => r.paid >= t);
  return hit ? { ...hit, inDays: Math.round((day(hit.paid) - day(t)) / 864e5) } : null;
}
