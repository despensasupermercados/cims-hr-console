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
      verdict = sameShip ? "confirmed" : fileShip ? "elsewhere" : "pending";
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
