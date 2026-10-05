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
    let verdict;
    if (status === "On board") {
      // On board with no readable vessel: TDG says aboard but not where — nothing to confirm or contradict.
      // On board on ANOTHER hull contradicts a card that says they are aboard HERE; it says nothing against
      // a FUTURE plan (a crew aboard Quantum today with a Utopia plan for January is exactly normal).
      // On board on THIS hull confirms only a card that says they are aboard NOW: a NEXT contract Rita
      // projected on the same ship for January is still a plan — the file speaks to the current contract.
      verdict = sameShip ? (aboardByCard ? "confirmed" : "pending") : fileShip ? (aboardByCard ? "elsewhere" : "pending") : "pending";
    } else if (status === "Earmarked") {
      verdict = sameShip ? "earmarked" : fileShip ? (aboardByCard ? "ashore" : "elsewhere") : (aboardByCard ? "ashore" : "pending");
    } else if (status === "On Vacation" || status === "Inactive") {
      verdict = aboardByCard ? "ashore" : "pending";
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
// openFlags   : open ship flags [{ agency_id, new_value, created_at }]
// statusAudit : the LATEST run's status audit rows [{ agency_id, new_value }] — written for every status
//               change the file brought, accepted OR held (crew_apply D3/D6), so new_value is the file's
//               word even when Rita held it and crew.status kept the old value
// absent      : agency ids the latest file did NOT carry (open 'presence' flags) — silence is not a verdict
// lastRun     : when the last registry file was applied (import_run.run_at), for the fallback's date
export function registryFromStore({ snapshot, crew, openFlags, statusAudit, absent, lastRun } = {}) {
  const snap = {};
  for (const r of (snapshot || [])) if (r && r.agency_id) snap[r.agency_id] = r;
  const flag = {};
  for (const f of (openFlags || [])) {
    if (!f || !f.agency_id) continue;
    const cur = flag[f.agency_id];
    if (!cur || String(f.created_at || "") > String(cur.created_at || "")) flag[f.agency_id] = f;
  }
  const audit = {};
  for (const a of (statusAudit || [])) if (a && a.agency_id && !(a.agency_id in audit)) audit[a.agency_id] = a;
  const gone = new Set((absent || []).map((x) => (x && x.agency_id) || x).filter(Boolean));
  const out = [];
  const seen = new Set();
  for (const c of (crew || [])) {
    if (!c || !c.agency_id || seen.has(c.agency_id)) continue;
    seen.add(c.agency_id);
    if (gone.has(c.agency_id)) continue;                 // the latest file does not carry them: no word
    const s = snap[c.agency_id];
    if (s) { out.push({ agency_id: c.agency_id, status: s.status || null, vessel_observed: s.vessel || null, run_at: s.run_at || null, source: "snapshot" }); continue; }
    // FALLBACK, for a crew with no snapshot row yet. The status is the file's: the latest run's audit
    // row where the file changed it (accepted or HELD — a held change leaves crew.status at the old
    // value), else crew.status (D6 writes it on every upload), unknown under a manual status edit.
    // crew.vessel_observed is NOT the file's vessel — the import never writes it (D1), so it can be
    // months stale (De Torres: 'MV JEWEL OF THE SEAS' from July while the file has him earmarked
    // elsewhere). Only an OPEN ship flag carries the file's vessel, and it is dated by the file that
    // raised it (an older flag stays open when a later file comes back into agreement, see
    // crew_flags.reconcileShipFlags `agree`); without one the ship is unknown — never confirm, never
    // name a hull.
    const f = flag[c.agency_id];
    const a = audit[c.agency_id];
    out.push({
      agency_id: c.agency_id,
      status: a ? (a.new_value || null) : (c.manual ? null : (c.status || null)),
      vessel_observed: (f && f.new_value) || null,
      run_at: (f && f.new_value && f.created_at) ? f.created_at : (lastRun || null),
      source: "registry",
    });
  }
  for (const id in snap) if (!seen.has(id) && !gone.has(id)) out.push({ agency_id: id, status: snap[id].status || null, vessel_observed: snap[id].vessel || null, run_at: snap[id].run_at || null, source: "snapshot" });
  return out;
}
