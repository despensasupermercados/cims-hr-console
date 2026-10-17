// A TRAINING VISIT IS A TRIP, NOT A CONTRACT (Miguel, 17 Oct 2026: Jonathan "sometimes he goes to the ship to teach as crew
// and then home [to] support .. same as Ohji"). Jonathan Placer Alonzo sailed a full contract on Rhapsody (Dec 2025 – Sep
// 2026) and then embarked Pursuit on 16 Oct 2026 to teach A.J. Baleña (Rita typed 24 Oct); Ohji Garcia Miranda taught on
// Onward 7–12 Sep. TDG's file lists both as Printer Specialists On board, so nothing in the file tells a visit from a
// contract. His choice of three: "Rita ticks 'Training visit'" — per trip, kept on contract_visit (sc + on_key = the
// trip's embark, the day the file gives; migrations/0032_contract_visit.sql).
//
// A trip is a visit when Rita ticked it, or when the crew is on the DG3 shoreside team below (every trip of theirs is a
// visit — the list rotationSections has kept off the seats, the pool and the bench since before this rule). A visit,
// his four answers of the same day:
//   - no sign-off instructions email (signoff_context: instruct false);
//   - never anybody's reliever, and its embark never dates the printer's sign-off (ship_leg_source: no cross-over);
//   - not a completed contract: its debark never adds to TDG's count (contract_count.completedSince);
//   - off the bench and off the seats: drawn on the ship as a visit line, not a printer seat (rotationSections, benchPool).
// Time at sea still counts its days. Pure.

// The shoreside DG3 team (not seafarers): TDG lists some of them, so their rows reach the file. Moved here from
// rotationSections (17 Oct 2026) so the schedule and the count read the same list as the board.
export const SHORE_IDS = new Set(["SC-0038392", "SC-0038378"]);
export const SHORE_NM = new Set(["deleonjoemar", "mirandaohji", "guerraray", "abellanrolando", "lawrencedexter", "sanmartinmiguel", "berenyirita"]);
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
// c: { agency_id, first_name, last_name } (crew row) — the name is the fallback for a shoreside person TDG has no id for.
export function isShoreCrew(c) {
  if (!c) return false;
  return SHORE_IDS.has(c.agency_id || c.sc) || SHORE_NM.has(fold((c.last_name || "") + (c.first_name || "")));
}

const day = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
export const visitKey = (sc, on) => String(sc || "") + "|" + (day(on) || "");
// rows: contract_visit rows ({ sc, on_key }) -> a Set of "sc|on". The tick belongs to the trip that embarked THAT day:
// a file that later moves the embark makes it a trip of its own again (shown as a seat, Rita ticks it again).
export function visitSet(rows) {
  const s = new Set();
  for (const r of (rows || [])) if (r && r.sc && day(r.on_key)) s.add(visitKey(r.sc, r.on_key));
  return s;
}
// Is this trip a visit? set = visitSet(...); crew = the crew row (for the shoreside team), optional.
export function isVisit(set, sc, on, crew) {
  if (crew && isShoreCrew(crew)) return true;
  return !!(set && sc && day(on) && set.has(visitKey(sc, on)));
}
