// WHO IS ABOARD EACH SHIP, WHO LEAVES FIRST, AND WHO RELIEVES HIM — the Keyman board's answer, for the other apps.
//
// Miguel, 30 Oct 2026, on HON's Reflection handover email naming Michael Angelo Resposo as the man aboard ("why is the
// wrong crew in this ship??? review"; then "go"): HON read who is aboard from the console's tables itself — Rita's cards
// and the Contract Counter (`keyman_contract3`). Since 7 Oct the Counter is history (§10d): who is aboard is TDG's file.
// The Counter still had Resposo on Reflection 16 Jan – 17 Jul with no sign-off recorded; the file has Bernard Paqueo
// aboard since 17 Jul and Resposo on Apex since 7 Oct. HON now ASKS (the `SeatReader` entrypoint in worker.js) and this
// module answers, so a rule changed here reaches HON the same day. Nothing here decides a date or a status: it reads
// the board's sections.
//
// Aboard: the audit's rule (`aboardOf`, src/audit.js) — TDG's On board seat (held past the sign-off included), TDG's
// Earmarked word for the hull a contract still runs on, and Rita's card past its sign-on ("ABOARD · AWAITING TDG FILE").
// Never a training visit (`sec.visits`, never among the seats).
// Outgoing: of those aboard, the one whose contract ends first (no sign-off on record sorts last), then the earlier
// sign-on. Incoming: the reliever rule (reliever.js, one rule with the board, the email, the profile and the dashboard),
// with every seat aboard asking at once so one person relieves one seat. Pure.
import { aboardOf } from "./audit.js";
import { assignRelievers } from "./reliever.js";
import { relieverInTdg } from "./signoff_context.js";

const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const FAR = "9999-12-31";

function person(c) {
  return {
    sc: c.agency_id,
    name: c.name || null,
    on: c.tdgEarmark ? null : iso(c.signOn),
    off: c.tdgEarmark ? null : iso(c.signOff),
    offSource: c.offSource || null,            // tdg | rita | card | projected (null on a card: its planned sign-off)
    held: !!c.heldByFile,                      // past the sign-off, TDG still has them On board
    awaiting: !!c.awaiting,                    // Rita's card past its sign-on, not in a TDG file yet
    tdg: relieverInTdg(c),                     // TDG has them (seat, Earmarked row, or a card the file confirms)
    tdgEarmark: !!c.tdgEarmark,                // TDG's Earmarked row, no dates
    assignmentId: c.assignment_id || null,     // Rita's card, when the seat or the plan is one
  };
}

export function shipSeats(sections) {
  const ships = {};
  for (const s of sections || []) {
    if (!s || !s.ship) continue;
    const aboard = aboardOf(s).filter((c) => !c.visit);
    const all = [].concat(s.crew || [], s.projections || []).filter((c) => c && c.agency_id && !c.visit);
    const cands = all.filter((x) => x.tdgEarmark || iso(x.signOn)).map((x) => ({ sc: x.agency_id, on: x.tdgEarmark ? null : iso(x.signOn), x }));
    const order = aboard.slice().sort((a, b) => String(iso(a.signOff) || FAR).localeCompare(String(iso(b.signOff) || FAR))
      || String(iso(a.signOn) || FAR).localeCompare(String(iso(b.signOn) || FAR)));
    const hits = assignRelievers(order.map((c) => ({ sc: c.agency_id, on: iso(c.signOn), off: iso(c.signOff), azamara: s.brand === "Azamara", cands })));
    const out = order[0] || null;
    let inc = out && hits[0] ? hits[0].x : null;
    // Nobody aboard (a hull before its first printer, an empty seat): the first plan on the hull, dated first, else TDG's
    // undated Earmarked row — the same candidates, read in date order.
    if (!out) {
      const dated = cands.filter((c) => c.on).sort((a, b) => a.on.localeCompare(b.on));
      inc = (dated[0] || cands.find((c) => !c.on) || {}).x || null;
    }
    ships[s.ship] = {
      ship: s.ship,
      brand: s.brand || null,
      aboard: order.map(person),
      outgoing: out ? person(out) : null,
      incoming: inc ? person(inc) : null,
    };
  }
  return ships;
}
