// A TRAINING VISIT IS A TRIP, NOT A CONTRACT (Miguel, 17 Oct 2026: Jonathan "sometimes he goes to the ship to teach as crew
// and then home [to] support .. same as Ohji"). Jonathan Placer Alonzo sailed a full contract on Rhapsody (Dec 2025 – Sep
// 2026) and then embarked Pursuit on 16 Oct 2026 to teach A.J. Baleña (Rita typed 24 Oct); Ohji Garcia Miranda taught on
// Onward 7–12 Sep. TDG's file lists both as Printer Specialists On board, so nothing in the file tells a visit from a
// contract. Per trip, kept on contract_visit (sc + on_key = the trip's embark, the day the file gives;
// migrations/0032_contract_visit.sql, kind since 0033).
//
// A trip is a visit when (17 Oct 2026, Miguel's second answer: "tag the 3 guys as trainers"):
//   - Rita marked THIS trip (contract_visit.kind): 'contract' = a full contract whoever sails it, 'visit' = a visit;
//   - else the crew is a TRAINER (crew_trainer: Jonathan Placer Alonzo, Ohji Garcia Miranda, Joemar De Leon — they sail
//     to teach, then go home to support): every trip is a visit unless Rita marks it a full contract. Why this default,
//     not a tick per visit: a forgotten tick named the trainer as somebody's reliever in a crew email (wrong email out);
//     a forgotten "full contract" leaves the ship empty / red on the board and the Gantt (loud, internal, Rita fixes it);
//   - else the crew is on the shoreside team below (staff who never sail as printers): every trip is a visit.
// A visit, his answers of the same day:
//   - no sign-off instructions email and no 7-days-out sign-off link (signoff_context: instruct / visit);
//   - never anybody's reliever, and its embark never dates the printer's sign-off (ship_leg_source: no cross-over);
//   - not a completed contract: its debark never adds to TDG's count (contract_count.completedSince);
//   - off the bench and off the seats: drawn on the ship as a visit line, not a printer seat (rotationSections, benchPool).
// Time at sea still counts its days. Pure.

// The shoreside DG3 team who never sail as printers. Trainers are shoreside too (off the pool, the bench and the counts
// while ashore) but come from crew_trainer, which Rita sets in Edit crew. Read by the schedule, the count and the board.
export const SHORE_NM = new Set(["guerraray", "abellanrolando", "lawrencedexter", "sanmartinmiguel", "berenyirita"]);
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
// c: { agency_id, first_name, last_name, trainer } — trainer = the crew_trainer tag.
export function isShoreCrew(c) {
  if (!c) return false;
  return !!c.trainer || SHORE_NM.has(fold((c.last_name || "") + (c.first_name || "")));
}

const day = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
export const visitKey = (sc, on) => String(sc || "") + "|" + (day(on) || "");
// rows: contract_visit rows ({ sc, on_key, kind }) -> Map "sc|on" -> 'visit' | 'contract'. The mark belongs to the trip
// that embarked THAT day: a file that later moves the embark makes it a trip of its own again.
export function visitMap(rows) {
  const m = new Map();
  for (const r of (rows || [])) if (r && r.sc && day(r.on_key)) m.set(visitKey(r.sc, r.on_key), r.kind === "contract" ? "contract" : "visit");
  return m;
}
// Is this trip a visit? map = visitMap(...); crew = the crew row with its trainer tag (and name, for the shoreside team).
export function isVisit(map, sc, on, crew) {
  const k = map && sc && day(on) ? map.get(visitKey(sc, on)) : null;
  if (k === "contract") return false;
  if (k === "visit") return true;
  return isShoreCrew(crew);
}
// crew_trainer rows ({ sc }) -> Set of agency ids.
export const trainerSet = (rows) => new Set((rows || []).map((r) => r && r.sc).filter(Boolean));
