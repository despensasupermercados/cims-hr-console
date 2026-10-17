// What the sign-off instructions email needs about one seat, read off the Keyman board (rotationSections) so the email
// says what the board says: the ship, the brand, the sign-off and its port, and who relieves the seat (Miguel, 16 Oct 2026:
// "you get all the info from the hr console .. shoot this email 2 week prior the seafarer sign off").
// Pure: (sections) => { [agency_id]: context }.
//
// The seat: a CURRENT contract with a sign-off (an earmark's planned sign-off is not a sign-off to instruct).
// The reliever: on the same ship, the first card or seat whose sign-on is after this seat's sign-on (the board's chain,
// earliest first); none dated -> TDG's Earmarked row for the hull ("EARMARK · TDG", no dates). Never a crew aboard
// alongside since before this seat (a second current seat is not a reliever) — and never a crew who joined more than
// RELIEF_WINDOW_DAYS before this sign-off: on a two-printer hull the second printer joined months ago and is a
// colleague, not the relief (16 Oct 2026: the email said "you overlap aboard for 180 days" about him).
// The port: Rita's or the Counter's typed port, else the itinerary's port ON the day (resolveCity "derived"); never the
// console's home-port seed (the ship's base, where the ship LIVES) and never a port a day away ("provisional") — no
// port in a crew-facing email beats a wrong one (16 Oct 2026).
export const RELIEF_WINDOW_DAYS = 45;
// NOT INSTRUCTED, AND NOBODY'S RELIEVER (Miguel, 17 Oct 2026, "Exclude him"): Jonathan Placer Alonzo receives the final
// count and sails ships on visits. TDG lists him On board as a Printer Specialist (Pursuit, embarked 16 Oct with A.J.
// Baleña), so the board seats him, the T-14 run would instruct him, and Kevin Jugao's email could name him the reliever.
// Nothing on his record tells him apart, hence the id. His seat stays on the board; only this email skips him.
export const NOT_INSTRUCTED = new Set(["SC-0041465"]);
export const instructed = (sc) => !NOT_INSTRUCTED.has(String(sc || ""));

const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";
const addDays = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
// A typed port (Rita's edit, the Counter's, a card's turnaround port) wins; the home-port SEED the board puts on a seat
// with nothing typed (disembarkSrc "home") is not one. Else the itinerary's port on the day itself.
export function portOf(c) {
  const typed = c.disembark && c.disembarkSrc !== "home" ? c.disembark : null;
  const itin = c.off_city && (c.off_conf === "override" || c.off_conf === "derived") ? c.off_city : null;
  return typed || itin || null;
}

export function seatContexts(sections) {
  const out = {};
  for (const s of sections || []) {
    const all = [].concat(s.crew || [], s.projections || []).filter((c) => c && c.agency_id && instructed(c.agency_id));
    for (const c of s.crew || []) {
      if (!c || !c.agency_id || !c.current || !iso(c.signOff)) continue;
      const on = iso(c.signOn), off = iso(c.signOff);
      const earliest = addDays(off, -RELIEF_WINDOW_DAYS);
      const dated = all
        .filter((x) => x.agency_id !== c.agency_id && !x.tdgEarmark && iso(x.signOn) && (!on || iso(x.signOn) > on) && iso(x.signOn) >= earliest)
        .sort((a, b) => (iso(a.signOn) < iso(b.signOn) ? -1 : 1));
      const pick = dated[0] || all.find((x) => x.agency_id !== c.agency_id && x.tdgEarmark) || null;
      out[c.agency_id] = {
        sc: c.agency_id,
        instruct: instructed(c.agency_id),
        name: c.name || null,
        ship: c.ship || s.ship || null,
        brand: s.brand || null,
        off: iso(c.signOff),
        port: portOf(c),
        reliever: pick ? { sc: pick.agency_id, name: pick.name || null, first: firstWord(pick.name), on: iso(pick.signOn), tdg: !!pick.tdgEarmark } : null,
      };
    }
  }
  return out;
}
