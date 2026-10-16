// What the sign-off instructions email needs about one seat, read off the Keyman board (rotationSections) so the email
// says what the board says: the ship, the brand, the sign-off and its port, and who relieves the seat (Miguel, 16 Oct 2026:
// "you get all the info from the hr console .. shoot this email 2 week prior the seafarer sign off").
// Pure: (sections) => { [agency_id]: context }.
//
// The seat: a CURRENT contract with a sign-off (an earmark's planned sign-off is not a sign-off to instruct).
// The reliever: on the same ship, the first card or seat whose sign-on is after this seat's sign-on (the board's chain,
// earliest first); none dated -> TDG's Earmarked row for the hull ("EARMARK · TDG", no dates). Never a crew aboard
// alongside since before this seat (a second current seat is not a reliever).

const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";

export function seatContexts(sections) {
  const out = {};
  for (const s of sections || []) {
    const all = [].concat(s.crew || [], s.projections || []).filter((c) => c && c.agency_id);
    for (const c of s.crew || []) {
      if (!c || !c.agency_id || !c.current || !iso(c.signOff)) continue;
      const on = iso(c.signOn);
      const dated = all
        .filter((x) => x.agency_id !== c.agency_id && !x.tdgEarmark && iso(x.signOn) && (!on || iso(x.signOn) > on))
        .sort((a, b) => (iso(a.signOn) < iso(b.signOn) ? -1 : 1));
      const pick = dated[0] || all.find((x) => x.agency_id !== c.agency_id && x.tdgEarmark) || null;
      out[c.agency_id] = {
        sc: c.agency_id,
        name: c.name || null,
        ship: c.ship || s.ship || null,
        brand: s.brand || null,
        off: iso(c.signOff),
        port: c.disembark || c.off_city || null,
        reliever: pick ? { sc: pick.agency_id, name: pick.name || null, first: firstWord(pick.name), on: iso(pick.signOn), tdg: !!pick.tdgEarmark } : null,
      };
    }
  }
  return out;
}
