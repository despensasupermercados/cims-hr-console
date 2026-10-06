// THE KEYMAN BOARD SHOWS TDG'S FILE, AND WHAT IS WRONG — pure, testable (Miguel, 5 Oct 2026; Brain
// recddHTPgWjLy39AU): "TDG is the one true source of knowledge. You need to force the Keyman tab to display
// what is in the TDG item, and you have to display what is wrong. We created a yellow thing for things to
// be manual, as a placeholder, but what you should be displaying is what is in the TDG file. If there is a
// change and you know that that person already ... completed his contract, you can put that person ...
// underneath as a contract completed."
//
// THE RULE
//   green seat     = the latest AdvancedQuery has the crew On board that hull (registry_sync), and the
//                    console does not KNOW their contract on that hull completed. Dates: the Contract
//                    Counter leg on that hull, else Rita's card on it, else none ("dates pending").
//   yellow         = Rita's placeholder (an open assignment). It stays until the file carries the person;
//                    when the file has them On board the same hull it is absorbed into the green seat.
//   underneath     = "Contract completed": a leg whose sign-off has passed and whose crew is not seated on
//                    that hull per the file. KNOWN completion = a recorded sign-off (Rita's, or the
//                    Counter's actual sign-off) within COMPLETION_DAYS; an older closure under a file that
//                    says On board the same hull is more likely a new contract the Counter does not carry.
//   what is wrong  = every disagreement between the file and the console, displayed and owned by Rita —
//                    never resolved by the console (§6, and the 7 Sep rule: crew data changes only through
//                    the TDG import).
// Nothing here writes, and nothing here reads a database: rotationSections hands it what it loaded.

export const COMPLETION_DAYS = 180;

const day = (s) => (s ? String(s).slice(0, 10) : "");
function daysBetween(a, b) {
  const x = Date.parse(day(a) + "T00:00:00Z"), y = Date.parse(day(b) + "T00:00:00Z");
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : null;
}

// The file's word per crew, with the hull canonicalised the board's way.
//   registry : registryFromStore rows
//   shipOf   : hull text -> the board's canonical ship name; keyOf: ship -> section key; valid: Set of keys
export function fileWordBySc(registry, { shipOf, keyOf, valid } = {}) {
  const out = {};
  for (const r of (registry || [])) {
    if (!r || !r.agency_id) continue;
    const raw = r.vessel_observed || null;
    const ship = raw ? (shipOf ? shipOf(raw) : raw) : null;
    const key = ship ? (keyOf ? keyOf(ship) : String(ship).toLowerCase()) : null;
    out[r.agency_id] = {
      status: r.status || null,
      raw, ship: ship || null, key,
      known: !!(key && (!valid || valid.has(key))),     // a hull the console knows
      at: day(r.run_at) || null, vesselAt: day(r.vessel_at) || null,
      hullUnknown: !!r.vessel_unknown,                  // bootstrap: older than an in-force card elsewhere
      source: r.source || null,
      name: r.name || null, rawStatus: r.raw_status || null, // the file's own words (kept copy only)
      onRoster: r.on_roster !== false,
    };
  }
  return out;
}

// The recorded sign-off that closed this crew's contract on this hull, if the console KNOWS it closed:
// a leg on the hull that is no longer current, whose sign-off has passed, within COMPLETION_DAYS, and no
// current leg left on that hull. Legs: the board schedule (boardLegs, recorded sign-offs already folded).
export function completedOff(legs, sc, key, today, keyOf, maxDays = COMPLETION_DAYS) {
  let off = null, current = false;
  for (const h of (legs || [])) {
    if (!h || !h.ours || h.sc !== sc || !h.ship) continue;
    if ((keyOf ? keyOf(h.ship) : String(h.ship).toLowerCase()) !== key) continue;
    if (h.is_current && h.on && day(h.on) <= today) { current = true; continue; }
    if (!h.is_current && h.off && day(h.off) < today && (!off || day(h.off) > off)) off = day(h.off);
  }
  if (current || !off) return null;
  const age = daysBetween(off, today);
  return age != null && age <= maxDays ? off : null;
}

const KIND_ORDER = ["empty_hull", "overridden", "held", "completed_still_aboard", "file_only", "status_unread", "unknown_ship", "onboard_no_ship"];

// WHAT IS LEFT TO CLEAN UP (Miguel, 6 Oct 2026: "look at how many issues we have now .. adapt the keyman
// and the console to ensure it reflect the tdg import"). The board APPLIES the file — a green seat for On
// board, a TDG earmark card for Earmarked, the file's status over a Retired tag or a status edit, a card the
// file contradicts taken off the ship — so this list is no longer every difference: it is only what a person
// must act on. Every row: { kind, sc, name, ship, text }. Plain text: the page escapes it.
//   empty_hull            a ship with no printer on board per the file (an operational gap, not an error)
//   overridden            Rita's card the file contradicts: off the board, still on record — remove it
//   held                  Rita's Retired tag or status edit the file overrides (or still disagrees with)
//   completed_still_aboard the console recorded the sign-off; TDG's file has not caught up
//   file_only             an active row of the file the roster lacks (needs adding) / a hidden crew
//   status_unread         a status word the console cannot read
//   unknown_ship / onboard_no_ship   On board where the console cannot place the hull
// Not rows any more (the board shows them, or they are not a disagreement with the file): a crew the file
// does not carry (their status says "Not in TDG file"), a seat without dates (the Contract Counter is the
// dates file; the sources line says how old it is), a Counter leg the file overrides, an earmark with no card.
//   crew        : [{ sc, name, manual, retired, held, fileRaw, absentSince, shown }]  visible, non-shore
//   file        : fileWordBySc
//   cards       : [{ sc, name, ship, aboard, on, verdict, at, fileStatus, fileShip, overridden }] Rita's open cards
//   completed   : { "sc|key": off }                   known completions (completedOff)
//   sections    : [{ ship, key, seated, fileAboard, aboardCards }] every hull on the board
//   fileKept    : the console holds a copy of the latest file (registry_snapshot)
export function boardIssues({ crew, file, cards, completed, sections, fileKept = true, confirmedSc: shownSc } = {}) {
  const rows = [];
  const F = file || {}, C = completed || {};
  const name = {}; for (const c of (crew || [])) name[c.sc] = c.name || c.sc;
  const hull = (ship, w) => (ship ? ", " + ship + (w && w.vesselAt ? " (ship named " + w.vesselAt + ")" : "") : "");
  const word = (w) => (w ? (w.status || (w.rawStatus ? "'" + w.rawStatus + "'" : "status not readable")) + hull(w.ship, w) : "no word");
  const fileAt = (w) => (w && w.at ? " " + w.at : "");
  const confirmedSc = shownSc instanceof Set ? shownSc : new Set((cards || []).filter((k) => k.verdict === "confirmed").map((k) => k.sc));
  for (const s of (sections || [])) {
    if (s.seated || s.fileAboard) continue;
    if ((s.aboardCards || []).some((v) => v !== "ashore" && v !== "elsewhere")) continue;
    rows.push({ kind: "empty_hull", sc: null, name: s.ship, ship: s.ship, text: fileKept ? "No printer on board per the TDG file" : "No printer on board in the TDG uploads the console kept" });
  }
  for (const k of (cards || [])) {
    if (!k.overridden) continue;
    const w = F[k.sc];
    rows.push({ kind: "overridden", sc: k.sc, aid: k.aid || null, name: k.name || name[k.sc] || k.sc, ship: k.ship, text: "TDG file" + (k.at ? " " + k.at : "") + ": " + (k.fileStatus || "status not readable") + hull(k.fileShip, w) + " · your card " + (k.aboard ? "aboard " + k.ship + " since " + k.on : k.ship + " from " + k.on) + " is off the board · remove it" });
  }
  for (const c of (crew || [])) {
    const w = F[c.sc];
    // Rita's Retired tag or status edit where the file has them ACTIVE: the file wins on every screen.
    if ((c.retired || c.manual) && c.fileRaw && (c.fileRaw.status === "On board" || c.fileRaw.status === "Earmarked") && !c.absentSince) {
      rows.push({ kind: "held", sc: c.sc, name: c.name, ship: c.fileRaw.ship || null, text: "TDG file: " + c.fileRaw.status + (c.fileRaw.ship ? ", " + c.fileRaw.ship : "") + " · your " + (c.retired ? "Retired tag" : "status edit '" + c.manual + "'") + " is overridden · remove it" });
      continue;
    }
    if (c.retired || c.absentSince || !w) continue;
    if (w.status === "On board" && w.key && C[c.sc + "|" + w.key]) {
      rows.push({ kind: "completed_still_aboard", sc: c.sc, name: c.name, ship: w.ship, text: "TDG not updated yet · your recorded sign-off " + C[c.sc + "|" + w.key] + " · TDG file" + fileAt(w) + " still: On board" + hull(w.ship, w) });
    }
    // A status edit the file disagrees with, where the file is not active (the edit still shows): Rita's call.
    if (c.manual && w.status && c.manual !== w.status) rows.push({ kind: "held", sc: c.sc, name: c.name, ship: w.ship, text: "Your status edit: " + c.manual + " · TDG file" + fileAt(w) + ": " + word(w) });
    else if (!c.manual && w.status && c.held && c.held !== w.status) rows.push({ kind: "held", sc: c.sc, name: c.name, ship: w.ship, text: "Status held at " + c.held + " · TDG file" + fileAt(w) + ": " + word(w) });
    if (!w.status && w.rawStatus) rows.push({ kind: "status_unread", sc: c.sc, name: c.name, ship: w.ship || null, text: "TDG file" + fileAt(w) + " status '" + w.rawStatus + "' is not one the console reads · it still shows " + (c.shown || "the older status") });
    if (w.status === "On board" && !w.hullUnknown) {
      if (!w.raw) rows.push({ kind: "onboard_no_ship", sc: c.sc, name: c.name, ship: null, text: "TDG file" + fileAt(w) + ": On board, no ship named" });
      else if (!w.known) rows.push({ kind: "unknown_ship", sc: c.sc, name: c.name, ship: null, text: "TDG file" + fileAt(w) + " names '" + w.raw + "', not a ship the console knows" });
    }
  }
  // An ACTIVE row of the file the roster does not show: a crew to add (the next upload adds them now that
  // every TDG status reads), or a hidden one with no card to show them by.
  for (const sc in F) {
    const w = F[sc];
    if (!w || w.onRoster !== false) continue;
    const active = w.status === "On board" || w.status === "Earmarked" || (!w.status && w.rawStatus);
    if (!active || (w.hidden && confirmedSc.has(sc))) continue;
    rows.push({ kind: "file_only", sc, name: w.name || sc, ship: w.ship || null, text: "In the TDG file " + (w.at || "") + " as " + sc + (w.hidden ? " · hidden on the console" : " · not on the console roster") + " · " + word(w) });
  }
  rows.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || String(a.ship || "").localeCompare(String(b.ship || "")) || String(a.name || "").localeCompare(String(b.name || "")));
  return rows;
}
