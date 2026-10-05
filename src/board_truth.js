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

const KIND_ORDER = ["empty_hull", "dropped", "contradicted", "completed_still_aboard", "counter", "held", "no_dates", "unknown_ship", "onboard_no_ship", "earmarked_no_card"];

// The "what is wrong" list. Every row: { kind, sc, name, ship, text }. Plain text: the page escapes it.
//   crew        : [{ sc, name, manual, held, retired, absentSince, last: {status, ship} }]  visible, non-shore
//                 manual = a crew_override.status; held = crew.status where it differs from the file's word;
//                 fileRaw = { status, ship } the import still writes under a manual edit (crew.status + last hull)
//   file        : fileWordBySc
//   seats       : { sc: { key, ship, dated } }        green seats drawn from the file
//   cards       : [{ sc, name, ship, key, aboard, verdict, at, fileStatus, fileShip, on }] Rita's open placeholders
//   counter     : [{ sc, ship, key, on, off }]        Counter legs current today (incl. overdue)
//   completed   : { "sc|key": off }                   known completions (completedOff)
//   sections    : [{ ship, key, seated, fileAboard, aboardCards }] every hull on the board
export function boardIssues({ crew, file, seats, cards, counter, completed, sections, today } = {}) {
  const rows = [];
  const F = file || {}, S = seats || {}, C = completed || {};
  const name = {}; for (const c of (crew || [])) name[c.sc] = c.name || c.sc;
  const word = (w) => (w ? (w.status || "status not readable") + (w.ship ? ", " + w.ship : "") : "no word");
  const fileAt = (w) => (w && w.at ? " " + w.at : "");
  // 1. A hull with nobody per the file. Not raised while a placeholder aboard is merely unconfirmed
  //    (the bootstrap cannot read the file's hull for it yet) — only when every card aboard is contradicted.
  for (const s of (sections || [])) {
    if (s.seated || s.fileAboard) continue;   // fileAboard: the file has someone aboard whom Rita's edit keeps off
    const aboard = (s.aboardCards || []);
    if (aboard.length && aboard.some((v) => v !== "ashore" && v !== "elsewhere")) continue;
    rows.push({ kind: "empty_hull", sc: null, name: s.ship, ship: s.ship, text: "Nobody on board per the TDG file" + (aboard.length ? " · your card here is contradicted" : "") });
  }
  for (const c of (crew || [])) {
    // Rita's Retired tag or status edit against a file that still has them On board (Valdesco: tagged
    // Retired in July, TDG's file On board Brilliance since 17 Sep). Reported, never resolved.
    if ((c.retired || c.manual) && c.fileRaw && c.fileRaw.status === "On board" && !c.absentSince) {
      rows.push({ kind: "held", sc: c.sc, name: c.name, ship: c.fileRaw.ship || null, text: "Your status edit: " + (c.retired ? "Retired" : c.manual) + " · TDG file: On board" + (c.fileRaw.ship ? ", " + c.fileRaw.ship : "") });
      continue;
    }
    if (c.retired) continue;
    const w = F[c.sc];
    // 2. Dropped from the file while the console still knows them.
    if (c.absentSince) {
      rows.push({ kind: "dropped", sc: c.sc, name: c.name, ship: (c.last && c.last.ship) || null, text: "Not in the TDG file since " + c.absentSince + (c.last && c.last.status ? " · last TDG word: " + c.last.status + (c.last.ship ? ", " + c.last.ship : "") : "") });
      continue;
    }
    if (!w) continue;
    // 3. The file has them On board a hull the console knows they left.
    if (w.status === "On board" && w.key && C[c.sc + "|" + w.key]) {
      rows.push({ kind: "completed_still_aboard", sc: c.sc, name: c.name, ship: w.ship, text: "Your recorded sign-off " + C[c.sc + "|" + w.key] + " · TDG file" + fileAt(w) + " still: On board, " + w.ship });
    }
    // 4. A status edit or a held status change against the file.
    if (c.manual && w.status && c.manual !== w.status && !(c.fileRaw && c.fileRaw.status === "On board")) rows.push({ kind: "held", sc: c.sc, name: c.name, ship: w.ship, text: "Your status edit: " + c.manual + " · TDG file" + fileAt(w) + ": " + word(w) });
    else if (!c.manual && w.status && c.held && c.held !== w.status) rows.push({ kind: "held", sc: c.sc, name: c.name, ship: w.ship, text: "Status held at " + c.held + " · TDG file" + fileAt(w) + ": " + word(w) });
    // 5. On board with no hull the console can place.
    if (w.status === "On board" && !w.hullUnknown) {
      if (!w.raw) rows.push({ kind: "onboard_no_ship", sc: c.sc, name: c.name, ship: null, text: "TDG file" + fileAt(w) + ": On board, no ship named" });
      else if (!w.known) rows.push({ kind: "unknown_ship", sc: c.sc, name: c.name, ship: null, text: "TDG file" + fileAt(w) + " names '" + w.raw + "', not a ship the console knows" });
    }
    // 6. TDG earmarks a hull and the board has no card for it.
    if (w.status === "Earmarked" && w.known && !(cards || []).some((k) => k.sc === c.sc && (k.key === w.key || k.verdict === "elsewhere" || k.verdict === "ashore"))) {
      rows.push({ kind: "earmarked_no_card", sc: c.sc, name: c.name, ship: w.ship, text: "TDG earmarks for " + w.ship + (w.vesselAt ? " (named " + w.vesselAt + ")" : "") + " · no card on the board" });
    }
  }
  // 7. Rita's placeholder the file contradicts.
  for (const k of (cards || [])) {
    if (k.verdict !== "ashore" && k.verdict !== "elsewhere") continue;
    rows.push({ kind: "contradicted", sc: k.sc, name: k.name || name[k.sc] || k.sc, ship: k.ship, text: "Your card: " + (k.aboard ? "aboard " + k.ship + " since " + k.on : k.ship + " from " + k.on) + " · TDG file" + (k.at ? " " + k.at : "") + ": " + (k.fileStatus || "status not readable") + (k.fileShip ? ", " + k.fileShip : "") });
  }
  // 8. A seat with no dates anywhere.
  for (const sc in S) if (!S[sc].dated) rows.push({ kind: "no_dates", sc, name: name[sc] || sc, ship: S[sc].ship, text: "TDG file: On board " + S[sc].ship + " · no contract dates yet (no Counter leg, no card)" });
  // 9. The Contract Counter says mid-contract on a hull where the file has no seat for them. A Counter
  //    leg whose projected sign-off has PASSED while the file no longer has them aboard is not wrong: the
  //    file changed and the date is past — that contract completed (Miguel), and it sits underneath.
  for (const l of (counter || [])) {
    const w = F[l.sc];
    if (!w || (S[l.sc] && S[l.sc].key === l.key) || C[l.sc + "|" + l.key]) continue;
    if (w.hullUnknown) continue;
    if (l.off && day(l.off) < today) continue;
    const said = w.status === "On board" && w.ship ? "On board " + w.ship : word(w);
    rows.push({ kind: "counter", sc: l.sc, name: name[l.sc] || l.sc, ship: l.ship, text: "Contract Counter: " + l.ship + " " + (l.on || "?") + " → " + (l.off || "TBA") + " · TDG file" + fileAt(w) + ": " + said });
  }
  rows.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || String(a.ship || "").localeCompare(String(b.ship || "")) || String(a.name || "").localeCompare(String(b.name || "")));
  return rows;
}
