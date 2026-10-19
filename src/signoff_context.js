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
// colleague, not the relief (16 Oct 2026: the email said "you overlap aboard for 180 days" about him). Since 17 Oct 2026
// the window counts from the EARLIER of the sign-off and the projected one, and the board, the profile and the
// dashboard read the same rule (reliever.js).
// The port: Rita's or the Counter's typed port, else the itinerary's port ON the day (resolveCity "derived"); never the
// console's home-port seed (the ship's base, where the ship LIVES) and never a port a day away ("provisional") — no
// port in a crew-facing email beats a wrong one (16 Oct 2026).
// The window and the pick are ONE rule now (reliever.js, Miguel 17 Oct 2026: "Adopt it everywhere"); re-exported for callers.
import { RELIEF_WINDOW_DAYS, assignRelievers } from "./reliever.js";
export { RELIEF_WINDOW_DAYS };
// A TRAINING VISIT IS NOT INSTRUCTED AND IS NOBODY'S RELIEVER (Miguel, 17 Oct 2026; visits.js): the board carries a visit
// on its section as `visits`, never among the seats. Its context is kept flagged (instruct: false, visit: true): the
// instructions and the 7-days-out sign-off link both skip it (Miguel, 17 Oct 2026: "yes" to the link too). Until that day this was Jonathan Placer
// Alonzo's id alone ("Exclude him"); he also sails full contracts, so the rule moved to the trip.

const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";
// A typed port (Rita's edit, the Counter's, a card's turnaround port) wins; the home-port SEED the board puts on a seat
// with nothing typed (disembarkSrc "home") is not one. Else the itinerary's port on the day itself.
export function portOf(c) {
  const typed = c.disembark && c.disembarkSrc !== "home" ? c.disembark : null;
  const itin = c.off_city && (c.off_conf === "override" || c.off_conf === "derived") ? c.off_city : null;
  return typed || itin || null;
}

// Does TDG have this reliever (the pass's IN TDG chip, and the gate for printing their phone and email, 19 Oct 2026)? TDG's
// own Earmarked row, a seat the file put aboard (state green), or Rita's card the file confirms or earmarks for this hull
// (the board's "EARMARK · TDG"; the dashboard's tdgHas reads the same). A card only the console holds, or one "sent to TDG"
// that the file does not carry yet, is not.
export function relieverInTdg(x) {
  if (!x) return false;
  if (x.tdgEarmark) return true;
  if (x.state && x.state !== "yellow") return true;
  const v = x.registry && x.registry.verdict;
  if (x.confirmed || v === "confirmed" || v === "earmarked") return true;
  return !!(x.file && x.file.status === "Earmarked" && x.file.ship && x.file.ship === x.ship);
}

export function seatContexts(sections) {
  const out = {};
  for (const s of sections || []) {
    const all = [].concat(s.crew || [], s.projections || []).filter((c) => c && c.agency_id && !c.visit);
    // Candidates: every dated card or seat on the ship, and TDG's undated Earmarked rows (on: null) as the last resort.
    const cands = all.filter((x) => x.tdgEarmark || iso(x.signOn)).map((x) => ({ sc: x.agency_id, on: x.tdgEarmark ? null : iso(x.signOn), x }));
    const seats = [].concat(s.crew || [], s.visits || []).filter((c) => c && c.agency_id && c.current && iso(c.signOff));
    // One rule with the board (reliever.js): the seat that leaves first takes the first reliever; a visit takes none.
    const prn = seats.filter((c) => !c.visit);
    const hits = assignRelievers(prn.map((c) => ({ sc: c.agency_id, on: iso(c.signOn), off: iso(c.signOff), azamara: s.brand === "Azamara", cands })));
    const relBy = new Map(prn.map((c, i) => [c, hits[i] ? hits[i].x : null]));
    for (const c of seats) {
      const pick = relBy.get(c) || null;
      out[c.agency_id] = {
        sc: c.agency_id,
        instruct: !c.visit, visit: !!c.visit,
        name: c.name || null,
        ship: c.ship || s.ship || null,
        brand: s.brand || null,
        on: iso(c.signOn),
        off: iso(c.signOff),
        port: portOf(c),
        reliever: pick ? { sc: pick.agency_id, name: pick.name || null, first: firstWord(pick.name), on: iso(pick.signOn), tdg: relieverInTdg(pick) } : null,
      };
    }
  }
  return out;
}
