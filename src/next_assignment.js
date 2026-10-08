// src/next_assignment.js — THE NEXT ASSIGNMENT ON A SEAT CARD (Miguel, 8 Oct 2026, on Harmony: "If he has a projected
// assignment, or if the same crew member is earmarked for a future vessel, I want you to display it there ... Right
// after that ... how many months and days of vacation or space between the contracts").
// PURE. Reads the board's own cards, writes nothing: every card that is a seafarer ABOARD (a TDG seat, or an earmark
// whose sign-on has arrived) gets `next` = the same crew's earliest earmark still to come (Rita's card or TDG's
// Earmarked row), on any ship — the same hull too (a next contract there) — never the card itself.
//   next = { ship, signOn, signOff, tdg, gapDays }   gapDays = next sign-on − this sign-off (negative = overlap),
//   null when either date is unknown (a TDG earmark has no dates until Rita plans them).
const dayMs = 86400000;
const daysBetween = (a, b) => (a && b ? Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / dayMs) : null);

export function attachNextAssignments(sections, today) {
  const isAboard = (c) => !!c && (c.state !== "yellow" || c.confirmed || c.awaiting || (c.signOn && c.signOn <= today));
  const ahead = {}; // sc -> earmarks still to come
  for (const sec of (sections || [])) {
    for (const c of [].concat(sec.crew || [], sec.projections || [])) {
      if (!c || !c.agency_id || c.state !== "yellow" || isAboard(c)) continue;
      (ahead[c.agency_id] = ahead[c.agency_id] || []).push({ ship: c.ship || sec.ship, signOn: c.signOn || null, signOff: c.signOff || null, tdg: !!c.tdgEarmark, ref: c });
    }
  }
  for (const sc in ahead) ahead[sc].sort((a, b) => String(a.signOn || "9999").localeCompare(String(b.signOn || "9999")));
  for (const sec of (sections || [])) {
    for (const c of [].concat(sec.crew || [], sec.projections || [])) {
      if (!c || !c.agency_id || !isAboard(c)) continue;
      const n = (ahead[c.agency_id] || []).find((e) => e.ref !== c && (!e.signOn || !c.signOn || e.signOn >= c.signOn));
      c.next = n ? { ship: n.ship, signOn: n.signOn, signOff: n.signOff, tdg: n.tdg, gapDays: daysBetween(c.signOff, n.signOn) } : null;
    }
  }
  return sections;
}
