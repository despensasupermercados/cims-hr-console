// TIME IS SAID IN MONTHS AND DAYS, NEVER AS A DAY COUNT (Miguel, 16 Oct 2026, on the audit's "Day 170 of 214": "we dont
// count days .. never. what we do .. is months and days .. for example 4m 27days .. review and correct across the app").
// Calendar months from the dates themselves, then the days left after them, month-end clamped (Jul 31 -> Mar 1 = 7 mo 1 d,
// never 7 mo -2 d) — the same rule as the page's monthsDaysParts and the statement email's span(). Pure; ISO dates in.
const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);

export function mdParts(a, b) {
  a = iso(a); b = iso(b);
  if (!a || !b || b < a) return null;
  let m = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  let d = +b.slice(8, 10) - +a.slice(8, 10);
  if (d < 0) {
    m -= 1;
    const ay = +a.slice(0, 4), am = +a.slice(5, 7) - 1 + m, ad = Math.min(+a.slice(8, 10), new Date(Date.UTC(ay, am + 1, 0)).getUTCDate());
    d = Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(ay, am, ad)) / 864e5);
  }
  return m < 0 ? null : { m, d };
}
// "4 mo 27 d", "22 d", "3 mo" — the board chip's shape (spanCompact on the page). "" when the dates do not say.
export function mdShort(a, b) {
  const p = mdParts(a, b); if (!p) return "";
  if (!p.m) return p.d + " d";
  return p.m + " mo" + (p.d ? " " + p.d + " d" : "");
}
// A day offset from a date as months and days: "in 40 days" from today is mdShort(today, today + 40).
export function addDaysISO(d, n) { const t = iso(d); if (!t) return null; return new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10) + n)).toISOString().slice(0, 10); }
