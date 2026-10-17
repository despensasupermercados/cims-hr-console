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

// THE CONTRACT THE SCORE CARD OPENS ON (night watch, 17 Oct 2026). `apiBonusCrew` used to take the contract spanning
// today first, else the most recently ended: a crew who signed off and re-embarked before anyone scored him opened on the
// NEW contract — Olid, Alonzo, Santos, De Torres, Noche and Resposo on the 17 Oct 2026 board: off a hull in July or August,
// aboard another since October, no outcome on file — with "completed in full" ticked and every automatic read run on the
// wrong dates. The rule: an ENDED contract nobody has scored yet, within SCORE_RECENT_DAYS, comes before a running one
// when its sign-off is the nearer of the two (a contract signing off in a week is still pre-scored first); a contract an
// outcome already covers is done; else the running one, else the most recent, else the next. Pure; the committed-span
// swap and the Counter fallback stay in apiBonusCrew.
export const SCORE_RECENT_DAYS = 180;
export function defaultScoreLeg(legs, sc, today, opts = {}) {
  const outcomes = (opts && opts.outcomes) || [];
  let current = null, bestPast = null, bestFut = null;
  for (const h of legs || []) {
    if (!h || !h.ours || h.sc !== sc || !h.on) continue;
    const off = h.off || "9999"; // TBA sign-off = still aboard (same rule as the board and deriveStatus)
    if (h.on <= today && off >= today) { if (!current || off > (current.off || "9999")) current = h; } // spanning today
    else if (off < today) { if (!bestPast || off > bestPast.off) bestPast = h; }                       // last ended
    else if (!bestFut || off < (bestFut.off || "9999")) bestFut = h;                                   // next one
  }
  const scored = (h) => outcomes.some((o) => o && o.span_start && o.span_end && h.on <= o.span_end && (h.off || "9999") >= o.span_start);
  if (current && bestPast && !scored(bestPast)) {
    const ago = dayDiff(bestPast.off, today), toGo = current.off ? dayDiff(today, current.off) : null;
    if (ago != null && ago <= SCORE_RECENT_DAYS && (toGo == null || ago < toGo)) return { leg: bestPast, why: "ended_unscored" };
  }
  return { leg: current || bestPast || bestFut || null, why: current ? "current" : bestPast ? "ended" : bestFut ? "next" : "none" };
}
