// Score-queue window classifier — pure, testable. The Contributor Scoring window shows the crew
// whose contracts just ended or are about to end (the ones that need scoring). Given a crew's
// effective sign-off date, classify it relative to `today`:
//   "recent"   -> signed off within the last `days` (inclusive of today)
//   "upcoming" -> signing off within the next `days`
//   null       -> outside both windows or unparseable
// Default window = 14 days each side.

import { GAP_DAYS } from "./contracts.js";

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

// A CREW'S CONTRACTS, FOR SCORING (Miguel, 17 Oct 2026, answers to the logic review). One schedule (boardLegs), grouped:
//   - A TRANSFER IS ONE CONTRACT ("One contract"): 21 days or less (contracts.GAP_DAYS) between one leg's sign-off and the
//     next leg's sign-on, on any ship, is one contract and one Score Card — Jeadrig Tuazon, Explorer 6 Jun – 23 Aug then
//     Jewel from 28 Aug, scored twice would take the count 0 -> 1 -> 2 on what TDG counts as his first contract. Legs that
//     OVERLAP are not merged: on one hull that is TDG's two files disagreeing (Quiming, §11d), never reconciled here.
//   - A TRAINING VISIT is a trip, not a contract (visits.js): never scored.
export function scoreContracts(legs, sc) {
  const L = (legs || []).filter((h) => h && h.ours && h.sc === sc && ISO.test(h.on || "") && !h.visit)
    .slice().sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const out = [];
  for (const h of L) {
    const cur = out[out.length - 1];
    const gap = cur && cur.off ? dayDiff(cur.off, h.on) : null;
    if (cur && !cur.current && gap != null && gap >= 0 && gap <= GAP_DAYS) {
      cur.legs.push(h); cur.off = h.off || null; cur.current = !!h.is_current; cur.held = cur.held || !!h.heldByFile;
      if (h.ship && !cur.ships.includes(h.ship)) cur.ships.push(h.ship);
    } else out.push({ sc, on: h.on, off: h.off || null, ships: h.ship ? [h.ship] : [], current: !!h.is_current, held: !!h.heldByFile, legs: [h] });
  }
  return out;
}
const covered = (c, outcomes) => (outcomes || []).some((o) => o && o.span_start && o.span_end && c.on <= o.span_end && (c.off || "9999") >= o.span_start);
// Ended: TDG's word, Rita's or a card's sign-off that has passed — never a contract still current (held by TDG's On board,
// or past a PROJECTED sign-off: overdue, not gone, §10d).
const endedBy = (c, today) => !c.current && !!c.off && c.off <= today;

// THE CONTRACT THE SCORE CARD OPENS ON. Since 17 Oct 2026 ("After sign-off, oldest first"): the OLDEST ended contract
// nobody has scored, within SCORE_RECENT_DAYS (older ones are the baseline's, §10c); else the one running now (shown,
// not committable until its sign-off); else the most recent; else the next. The night watch's first cut (same morning)
// opened a running contract that ends sooner before an older unscored one — Miguel chose the order the other way.
export const SCORE_RECENT_DAYS = 180;
export function defaultScoreLeg(legs, sc, today, opts = {}) {
  const outcomes = (opts && opts.outcomes) || [];
  const C = scoreContracts(legs, sc);
  const shape = (c) => (c ? { on: c.on, off: c.off, ship: c.ships.join(", ") || null } : null);
  const open = C.filter((c) => endedBy(c, today) && !covered(c, outcomes) && dayDiff(c.off, today) <= SCORE_RECENT_DAYS);
  if (open.length) return { leg: shape(open[0]), contract: open[0], why: "ended_unscored" };
  const current = C.filter((c) => c.on <= today && !endedBy(c, today)).pop() || null;
  if (current) return { leg: shape(current), contract: current, why: current.held ? "held" : "current" };
  const past = C.filter((c) => endedBy(c, today)).pop() || null;
  if (past) return { leg: shape(past), contract: past, why: "ended" };
  const next = C.find((c) => c.on > today) || null;
  return { leg: shape(next), contract: next, why: next ? "next" : "none" };
}

// MAY THIS SPAN BE COMMITTED? (Miguel, 17 Oct 2026). null = yes; else { error, ... } in the page's words:
//   not_ended     — the sign-off has not come ("After sign-off");
//   held_by_tdg   — TDG still lists the crew On board past the sign-off ("Wait for TDG": Belhida, Apex, 7 Oct);
//   still_aboard  — the contract is still running per the schedule (past a projected sign-off: overdue, not gone);
//   visit         — a training visit is not a contract;
//   older_first   — an older ended contract within SCORE_RECENT_DAYS has no outcome yet ("oldest first").
export function commitBlock(legs, sc, today, outcomes, spanStart, spanEnd) {
  if (!ISO.test(spanStart || "") || !ISO.test(spanEnd || "")) return null;   // the commit's own span checks answer that
  if (spanEnd > today) return { error: "not_ended", off: spanEnd };
  const all = (legs || []).filter((h) => h && h.ours && h.sc === sc && ISO.test(h.on || ""));
  const hits = all.filter((h) => h.on <= spanEnd && (h.off || "9999") >= spanStart);
  if (hits.length && hits.every((h) => h.visit)) return { error: "visit" };
  const C = scoreContracts(legs, sc);
  const mine = C.filter((c) => c.on <= spanEnd && (c.off || "9999") >= spanStart);
  const held = mine.find((c) => c.held);
  if (held) return { error: "held_by_tdg", on: held.on, off: held.off, ship: held.ships.join(", ") };
  const running = mine.find((c) => c.current);
  if (running) return { error: "still_aboard", on: running.on, off: running.off, ship: running.ships.join(", ") };
  const older = C.find((c) => endedBy(c, today) && c.off < spanStart && !mine.includes(c) && !covered(c, outcomes) && dayDiff(c.off, today) <= SCORE_RECENT_DAYS);
  if (older) return { error: "older_first", on: older.on, off: older.off, ship: older.ships.join(", ") };
  return null;
}
