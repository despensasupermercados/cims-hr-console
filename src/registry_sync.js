// registry_sync.js — what an AdvancedQuery (TDG registry) upload says about Rita's projections.
//
// Miguel, 5 Oct 2026, Jewel: "rita uploaded the tdg file yesterday .. if the person is onboard .. and if
// rita has already a card in there .. it should automatically compare with what the tdg file has and
// deploy it and remove the one in draft .. so this would never happen again".
//
// Until today the two TDG files closed the loop differently. The Contract Counter (dates) ABSORBS a
// projection it carries (counter_sync.diffCounter) — but no Counter has ever been uploaded through the
// console. The AdvancedQuery (status + vessel, uploaded weekly) never looked at the yellow cards at
// all: Gayda sat on Jewel as "Your projection · not in a TDG file yet" for eleven weeks while Rita
// dropped five registry files. This module is the comparison the registry upload now makes.
//
// The registry carries NO dates, so it cannot replace a projection the way the Counter does. What it
// can say about a yellow card, per crew:
//   confirmed  the file has them ON BOARD this ship — the loop closes: the card turns green, keeps
//              Rita's dates until the Counter carries the leg, and loses its Deploy button (TDG
//              already has them aboard; there is nothing to send Joy).
//   earmarked  the file has them EARMARKED for this ship — corroborated, not aboard yet.
//   elsewhere  the file puts them on a DIFFERENT ship (aboard or earmarked) — flagged on the card.
//   ashore     the card says they are aboard (sign-on has passed) but the file says On Vacation /
//              Inactive / earmarked elsewhere — NOT confirmed. Flagged, never auto-removed (§6).
//   pending    a future plan the file neither confirms nor contradicts — nothing to say yet.
// A crew the file does not carry at all is skipped: silence is not a verdict.
//
// Pure: no IO, no dates of its own. Identity is deterministic — the match is the agency id the file
// itself keys on, never a name (CLAUDE.md §10). The ship match uses the STRICT hull matcher
// (crew_flags.strictShipMatcher): "MV JEWEL OF THE SEAS" meets "Jewel"; an unreadable vessel never
// confirms anything.
import { normalizeStatus } from "./crewimport.js";

export const VERDICTS = ["confirmed", "earmarked", "elsewhere", "ashore", "pending"];

const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(0, 10) : null);
const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

// projections : open assignments [{ id, sc, crew_name, ship, sign_on, planned_sign_off }]
// registry    : the file's rows [{ agency_id, status, vessel_observed }] (crewimport.mapRows output)
// today       : ISO date; a projection whose sign_on <= today claims the crew is aboard
// shipOf      : (raw vessel string) -> canonical hull name, or null when unknown / ambiguous
export function reconcileProjections({ projections, registry, today, shipOf } = {}) {
  const of = typeof shipOf === "function" ? shipOf : (s) => (s == null || s === "" ? null : String(s).trim());
  const byId = {};
  for (const r of (registry || [])) if (r && r.agency_id) byId[String(r.agency_id).trim()] = r;
  const items = [];
  for (const p of (projections || [])) {
    if (!p || !p.id || !p.sc || !p.ship) continue;
    const r = byId[String(p.sc).trim()];
    if (!r) continue;                                   // the file says nothing about them: no verdict
    const status = r.status || null;
    const fileShip = of(r.vessel_observed);              // null = blank or unreadable
    const cardShip = of(p.ship) || String(p.ship).trim();
    const sameShip = !!fileShip && norm(fileShip) === norm(cardShip);
    const aboardByCard = !!(day(p.sign_on) && today && day(p.sign_on) <= today);
    // THE FILE CAN ONLY CONTRADICT WHAT IT COULD SEE (6 Oct 2026, Pintucan: card aboard Wonder from 6 Oct,
    // the 5 Oct file still On Vacation — read as "TDG says otherwise" the morning he joined). A card says
    // "aboard, and the file disagrees" only when its sign-on is BEFORE the file's date; joining on or after
    // it, the file predates the sign-on and says nothing yet (pending until the next upload).
    const fileDay = day(r.run_at) || today;
    const seen = aboardByCard && !!fileDay && day(p.sign_on) < fileDay;
    let verdict;
    if (status === "On board") {
      // On board with no readable vessel: TDG says aboard but not where — nothing to confirm or contradict.
      // On board on ANOTHER hull contradicts a card that says they are aboard HERE; it says nothing against
      // a FUTURE plan (a crew aboard Quantum today with a Utopia plan for January is exactly normal).
      // On board on THIS hull confirms only a card that says they are aboard NOW: a NEXT contract Rita
      // projected on the same ship for January is still a plan — the file speaks to the current contract.
      verdict = sameShip ? (aboardByCard ? "confirmed" : "pending") : fileShip ? (seen ? "elsewhere" : "pending") : "pending";
    } else if (status === "Earmarked") {
      verdict = sameShip ? "earmarked" : fileShip ? (seen ? "ashore" : aboardByCard ? "pending" : "elsewhere") : (seen ? "ashore" : "pending");
    } else if (status === "On Vacation" || status === "Inactive" || status === "Reserved" || status === "Not for Rehire") {
      verdict = seen ? "ashore" : "pending";
    } else {
      verdict = "pending";                               // status the file left blank or unreadable
    }
    items.push({
      id: p.id, sc: p.sc, crew_name: p.crew_name || null,
      ship: cardShip, sign_on: day(p.sign_on), sign_off: day(p.planned_sign_off),
      aboard_by_card: aboardByCard,
      verdict,
      file: { status, ship: r.vessel_observed == null ? null : String(r.vessel_observed), ship_canon: fileShip },
    });
  }
  const counts = {};
  for (const v of VERDICTS) counts[v] = 0;
  for (const it of items) counts[it.verdict]++;
  items.sort((a, b) => VERDICTS.indexOf(a.verdict) - VERDICTS.indexOf(b.verdict) || (String(a.ship) < String(b.ship) ? -1 : String(a.ship) > String(b.ship) ? 1 : 0) || (String(a.sc) < String(b.sc) ? -1 : 1));
  return { items, counts };
}

// The one sentence the import screen prints about the projections, worded once.
export function projectionSummary(counts) {
  const c = counts || {};
  const n = (k, one, many) => (k === 1 ? "1 " + one : k + " " + many);
  const parts = [];
  if (c.confirmed) parts.push(n(c.confirmed, "projection confirmed aboard by the file", "projections confirmed aboard by the file"));
  if (c.elsewhere) parts.push(n(c.elsewhere, "projection the file puts on another ship", "projections the file puts on another ship"));
  if (c.ashore) parts.push(n(c.ashore, "card aboard per your board but not per the file", "cards aboard per your board but not per the file"));
  if (c.earmarked) parts.push(n(c.earmarked, "projection earmarked by TDG", "projections earmarked by TDG"));
  return parts.join(" · ");
}

// THE FILE'S WORD, READ FROM WHAT THE CONSOLE ALREADY HOLDS (Miguel, 5 Oct 2026, an hour after the
// first cut: "still see no updates in the console"). Writing the verdict only at upload time meant the
// board could not say what the 4 Oct file said until the NEXT file. It can: the registry import already
// wrote crew.status (D6) and raised a ship flag (sync_conflict, field vessel_observed) where the file's
// vessel differs from the registry. From now on each apply also keeps a per-crew snapshot of the file's
// row (registry_snapshot); until a crew has one, the raw crew row + the latest open ship flag stand in.
//
// snapshot    : registry_snapshot rows [{ agency_id, status, vessel, run_at }] (the column is `vessel`: it is the FILE's word, not an allocation)
// crew        : RAW crew rows before derivation / override merge [{ agency_id, status, vessel_observed, manual }]
//               (`manual` = a crew_override.status is live, so crew.status is NOT the file's)
// openFlags   : open ship flags [{ agency_id, new_value, created_at }] (used when vesselFlags is absent)
// vesselFlags : the NEWEST ship flag per crew, any state [{ agency_id, new_value, created_at, resolved }]
// inForce     : Rita's cards aboard today, per crew { sc: [{ hull, on }] } — guards a stale hull
// shipKey     : hull text -> comparable key (the board's normShip∘shipOf)
// statusAudit : the LATEST run's status audit rows [{ agency_id, new_value }] — written for every status
//               change the file brought, accepted OR held (crew_apply D3/D6), so new_value is the file's
//               word even when Rita held it and crew.status kept the old value
// absent      : agency ids the latest file did NOT carry (open 'presence' flags) — silence is not a verdict
// lastRun     : when the last registry file was applied (import_run.run_at), for the fallback's date
export function registryFromStore({ snapshot, crew, openFlags, vesselFlags, statusAudit, absent, lastRun, inForce, shipKey } = {}) {
  const snap = {};
  for (const r of (snapshot || [])) if (r && r.agency_id) snap[r.agency_id] = r;
  // The file's last NAMED hull per crew: the newest ship flag of ANY state (vesselFlags), else the newest
  // open one (openFlags, the pre-6-Oct input). An open flag is the file disagreeing with the registry; a
  // flag closed automatically (resolved=2) was closed because the board already had the crew on that hull
  // (board_matches) or a newer flag superseded it; one closed by a person (resolved=1) was taken into the
  // registry or dismissed — in every case the FILE named that hull. On a tie an open flag wins.
  const flag = {};
  for (const f of (vesselFlags || openFlags || [])) {
    if (!f || !f.agency_id || !f.new_value) continue;
    const cur = flag[f.agency_id];
    const fa = String(f.created_at || ""), ca = cur ? String(cur.created_at || "") : "";
    if (!cur || fa > ca || (fa === ca && Number(f.resolved || 0) < Number(cur.resolved || 0))) flag[f.agency_id] = f;
  }
  const audit = {};
  for (const a of (statusAudit || [])) if (a && a.agency_id && !(a.agency_id in audit)) audit[a.agency_id] = a;
  const gone = new Set((absent || []).map((x) => (x && x.agency_id) || x).filter(Boolean));
  const key = typeof shipKey === "function" ? shipKey : (v) => String(v == null ? "" : v).trim().toLowerCase();
  const out = [];
  const seen = new Set();
  for (const c of (crew || [])) {
    if (!c || !c.agency_id || seen.has(c.agency_id)) continue;
    seen.add(c.agency_id);
    if (gone.has(c.agency_id)) continue;                 // the latest file does not carry them: no word
    const s = snap[c.agency_id];
    if (s) { out.push(snapRow(c.agency_id, s)); continue; }
    // FALLBACK (BOOTSTRAP), for a crew with no snapshot row yet — every crew until the first registry
    // upload after 5 Oct 2026 fills registry_snapshot. The STATUS is the file's: the latest run's audit
    // row where the file changed it (accepted or HELD — a held change leaves crew.status at the old
    // value), else crew.status (D6 writes it on every upload), unknown under a manual status edit.
    // THE HULL (Miguel, 5 Oct 2026: "TDG is the one true source ... display what is in the TDG file"):
    // the console never stored the file's vessel, but it can be read back. The import raises a ship flag
    // whenever the file names a hull the registry does not hold, so the newest flag is the last hull the
    // file named; with no flag ever, every file agreed with the registry column (crew.vessel_observed) —
    // or left the vessel blank, which says nothing.
    // THE IMPORT IS SILENT WHEN THE FILE AGREES WITH THE BOARD (crew_flags: skipped_board_matches): once
    // Rita's card put a crew aboard hull A, a file naming A raises nothing. So an older hull is NOT the
    // file's word against an in-force card on a DIFFERENT hull that started after it was named (Calang:
    // flag Edge 22 Aug, card aboard Silhouette since 5 Sep) — the hull is then unknown until the next
    // upload writes the snapshot, and the card stays a placeholder, neither confirmed nor contradicted.
    // THE DATE IS THE LATEST FILE'S for the status (Gayda read "TDG registry 2026-08-22" an hour after the
    // 5 Oct upload). A flag is stamped when it was FIRST raised, so vessel_at dates the hull, not the word.
    const f = flag[c.agency_id];
    const a = audit[c.agency_id];
    let hull = null, hullAt = null, from = null;
    if (f) { hull = f.new_value; hullAt = f.created_at || null; from = "flag"; }
    else if (c.vessel_observed) { hull = c.vessel_observed; hullAt = null; from = "registry"; }
    let unknown = false;
    const cards = (inForce && inForce[c.agency_id]) || [];
    if (hull && cards.length) {
      const k = key(hull);
      const same = cards.some((x) => key(x.hull) === k);
      const later = cards.some((x) => key(x.hull) !== k && (!hullAt || String(x.on || "") > String(hullAt).slice(0, 10)));
      if (!same && later) { unknown = true; hull = null; }
    }
    const vesselAt = (hull && from === "flag") ? hullAt : null;
    out.push({
      agency_id: c.agency_id,
      status: a ? (a.new_value || null) : (c.manual ? null : (c.status || null)),
      vessel_observed: hull || null,
      run_at: lastRun || vesselAt || null,
      vessel_at: vesselAt,
      vessel_from: hull ? from : null,
      vessel_unknown: unknown,
      source: "registry",
    });
  }
  // A file row the roster does not carry (no crew under that agency id): kept, with the name the FILE
  // gives it, so the board can list it rather than lose it.
  for (const id in snap) if (!seen.has(id) && !gone.has(id)) out.push({ ...snapRow(id, snap[id]), on_roster: false });
  return out;
}
// One kept row of the file: status + vessel as written, the file's name for the row and its own status
// word (raw_status: a word the console cannot read leaves status null but stays visible).
function snapRow(id, s) {
  return { agency_id: id, status: s.status || normalizeStatus(s.raw_status) || null, vessel_observed: s.vessel || null, run_at: s.run_at || null, vessel_at: null, vessel_from: "snapshot", vessel_unknown: false, source: "snapshot", name: s.name || null, raw_status: s.raw_status || null, embarked_at: s.embarked_at || null, debarked_at: s.debarked_at || null };
}
