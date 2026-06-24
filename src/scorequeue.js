// Score-queue window classifier — pure, testable. The Contributor Scoring window shows the crew
// whose contracts just ended or are about to end (the ones that need scoring). Given a crew's
// effective sign-off date, classify it relative to `today`:
//   "recent"   -> signed off within the last `days` (inclusive of today)
//   "upcoming" -> signing off within the next `days`
//   null       -> outside both windows or unparseable
// Default window = 14 days each side.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Whole days from a -> b (b minus a), both ISO 'YYYY-MM-DD'. null if either is unparseable.
export function dayDiff(a, b) {
  if (!ISO.test(a || "") || !ISO.test(b || "")) return null;
  const da = new Date(a + "T00:00:00Z"), db = new Date(b + "T00:00:00Z");
  if (isNaN(da) || isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

export function classifyWindow(signOff, today, days = 14) {
  const d = dayDiff(today, signOff); // signOff - today
  if (d === null) return null;
  if (d <= 0 && d >= -days) return "recent";   // already off, within the trailing window
  if (d > 0 && d <= days) return "upcoming";    // about to go off, within the leading window
  return null;
}
