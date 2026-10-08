// src/ship_leg_source.js
// The board's live schedule: current legs from the Contract Counter (counter_legs.js, since
// 2026-09-14; before that the frozen ship_leg snapshot of the 6 Jul Counter) merged with the crew
// aboard per the relief board (in-force `assignment` rows). This module returns rows in the EXACT
// SHIP_HISTORY shape, so the existing readers only swap their data source — no logic change.
//
// Flip is a DATA change (no redeploy): app_config key 'board_source' = 'ship_leg' | 'ship_history'.
// 'ship_leg' means "the live database read" (its historical name); 'ship_history' / missing = the
// frozen SHIP_HISTORY code constant, fail-safe.

import { fetchCounterLegs } from "./counter_legs.js";
import { ABSORB_DAYS } from "./counter_sync.js";
import { VESSEL_REF } from "./vessel_ref.js";
import { buildShipKeys, canonShipWith, normShip, AZAMARA_SHORT } from "./shipname.js";
import { normalizeStatus } from "./crewimport.js";

const BRAND_SHORT = {
  "Royal Caribbean": "Royal",
  Celebrity: "Celebrity",
  Azamara: "Azamara",
  NCL: "NCL",
};

// Which source the board should read. Reads app_config; fails safe to 'ship_history'.
export async function boardSource(env) {
  try {
    const r = await env.DB.prepare(
      "SELECT value FROM app_config WHERE key='board_source'"
    ).first();
    return r && r.value ? r.value : "ship_history";
  } catch {
    return "ship_history";
  }
}

// Returns SHIP_HISTORY-shaped rows from the Contract Counter (counter_legs.COUNTER_LEG_SQL):
//   { ship, name, sc, ours, on, off, brand, is_current[, embark][, disembark], crew_id, source }
// off === null  => TBA sign-off (readers already treat null off as still-onboard).
//
// Until 2026-09-14 this read `ship_leg`, the frozen 6 Jul snapshot. Projected forward legs
// (leg_projection.js, source 'assignment:%', is_current=0) never enter: the Counter has none and
// the orphan arm admits keyman_roster rows only — a forward leg would otherwise win the schEnr
// date-enrichment race in rotationSections and rewrite a crew's displayed sign-on/off.
export async function legsFromCounter(env) {
  const results = await fetchCounterLegs(env);
  return (results || []).map((r) => {
    const o = {
      ship: r.ship_short,
      name: r.crew_name || null,
      sc: r.sc,
      ours: !!r.ours,
      on: r.on_date || null,
      off: r.off_date || null,
      brand: BRAND_SHORT[r.brand] || r.brand,
      is_current: !!r.is_current,
      crew_id: r.crew_id || null,
      source: r.source || "counter",
    };
    if (r.embark) o.embark = r.embark;
    if (r.disembark) o.disembark = r.disembark;
    return o;
  });
}
// Old name, same contract — kept so nothing that imported it breaks.
export const legsFromShipLeg = legsFromCounter;

// -----------------------------------------------------------------------------
// Crew currently ABOARD per the relief board (2026-09-04).
//
// ship_leg is a one-time keyman_roster snapshot; nothing writes a CURRENT leg to it any
// more. Every movement since has been recorded by the relief board in `assignment`, and
// leg_projection.js mirrors only the FUTURE ones (is_current=0): the day an assignment
// starts it is "not_future", its projected row is removed, and the crew vanishes from the
// board's current set. Verified read-only on prod 2026-09-04: 13 in-force assignments,
// 13 with no current ship_leg row, 0 overlap. Those 13 derived a wrong status, sat on the
// wrong ship (or in the pool) and were absent from /api/billing/month.
//
// Fixed at the READ layer, same precedence as roster_export.js (3 Sep): an in-force
// assignment (started, not signed off) counts as a current leg — but only for a crew who
// has no current ship_leg row; a current ship_leg still wins every field. One assignment
// per crew (latest sign_on). Nothing is written, is_current is untouched, the DR export and
// the ux_leg_current index are unchanged. Promotion into ship_leg remains Phase 2.
// -----------------------------------------------------------------------------

// The ONLY place the in-force set is read. Mirrors roster_export.ROSTER_SQL's assignment
// arm: started (sign_on <= today), not signed off, one per crew PER SHIP (Miguel, 14 Sep 2026:
// "one crew can be in 2 ships" — travellers and jumpers; a second ship is never collapsed away).
export async function fetchCurrentAssignments(env, today) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.sign_on, a.planned_sign_off, a.on_port_seed, a.off_port_seed,
            COALESCE(v.name, a.vessel_name) AS ship, v.brand AS brand,
            c.id AS crew_id, c.agency_id AS sc,
            TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name
       FROM assignment a
       JOIN contract k ON k.id = a.contract_id
       JOIN crew     c ON c.id = k.crew_id
       LEFT JOIN vessel v ON v.id = a.vessel_id
      WHERE a.actual_sign_off IS NULL
        AND a.sign_on <= ?1
        AND a.id = (SELECT a2.id
                      FROM assignment a2
                      JOIN contract k2 ON k2.id = a2.contract_id
                     WHERE k2.crew_id = c.id
                       AND a2.actual_sign_off IS NULL
                       AND a2.sign_on <= ?1
                       AND COALESCE(a2.vessel_id, a2.vessel_name) = COALESCE(a.vessel_id, a.vessel_name)
                     ORDER BY a2.sign_on DESC
                     LIMIT 1)
      ORDER BY ship, a.sign_on`
  ).bind(today).all();
  return results || [];
}

// Assignments that ENDED via the relief board (actual_sign_off set) within the trailing window.
// fetchCurrentAssignments drops a row the moment Rita records the sign-off, and leg_projection
// never writes it to ship_leg — so without this arm a contract that just ended leaves no trace in
// the schedule: the scoring queue's "signed off in the last N days" and the Score Card's default
// span (the contract just completed) could never see it (2026-09-05 review of #87).
export const ENDED_WINDOW_DAYS = 60;
export async function fetchRecentSignoffs(env, today, days = ENDED_WINDOW_DAYS) {
  const from = new Date(today + "T00:00:00Z"); from.setUTCDate(from.getUTCDate() - days);
  const since = from.toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.sign_on, a.actual_sign_off, a.on_port_seed, a.off_port_seed,
            COALESCE(v.name, a.vessel_name) AS ship, v.brand AS brand,
            c.id AS crew_id, c.agency_id AS sc,
            TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name
       FROM assignment a
       JOIN contract k ON k.id = a.contract_id
       JOIN crew     c ON c.id = k.crew_id
       LEFT JOIN vessel v ON v.id = a.vessel_id
      WHERE a.actual_sign_off IS NOT NULL
        AND a.actual_sign_off >= ?1
        AND a.actual_sign_off <= ?2
      ORDER BY ship, a.actual_sign_off`
  ).bind(since, today).all();
  return results || [];
}

// PURE. Merge the current ship_leg rows (SHIP_HISTORY shape, from legsFromShipLeg) with the
// in-force assignment rows (raw, from fetchCurrentAssignments). A crew whose current ship_leg
// row still spans `today` (off null = TBA, or off >= today) is never duplicated. A current
// ship_leg row whose off_date has PASSED does not block: nothing ever flips is_current back to
// 0 (2026-09-05 review), so without this every snapshot crew would be "taken" forever and their
// next relief-board contract would never reach status, the board, or billing. An assignment on
// a ship the board has never seen is still included — a vessel is never invented, but a crew is
// never dropped either: brand is simply null and downstream readers derive brand from VESSEL_REF.
export function mergeBoardLegs(shipLegRows, assignmentRows, today, endedRows) {
  const legs = shipLegRows || [];
  // "Taken" is per crew PER SHIP (Miguel, 14 Sep 2026: one crew can be on two ships — a jumper
  // holds a current leg on one hull and a next one on another). A Counter leg only suppresses the
  // assignment that duplicates it: same crew, same ship, still spanning today.
  const shipKey = (s) => String(s == null ? "" : s).trim().toLowerCase();
  const taken = new Set();
  const brandByShip = {};
  for (const r of legs) {
    if (r.is_current && (!today || !r.off || r.off >= today)) {
      if (r.sc) taken.add("sc:" + r.sc + "|" + shipKey(r.ship));
      if (r.crew_id) taken.add("id:" + r.crew_id + "|" + shipKey(r.ship));
    }
    if (r.ship && r.brand && !brandByShip[r.ship]) brandByShip[r.ship] = r.brand;
  }
  const bySc = new Map(); // one per crew per ship, latest sign_on wins (defensive; the SQL already picks one)
  for (const a of assignmentRows || []) {
    if (!a || !a.sc) continue;
    const sk = shipKey(a.ship);
    if (taken.has("sc:" + a.sc + "|" + sk) || (a.crew_id && taken.has("id:" + a.crew_id + "|" + sk))) continue;
    const key = a.sc + "|" + sk;
    const prev = bySc.get(key);
    if (prev && (prev.sign_on || "") >= (a.sign_on || "")) continue;
    bySc.set(key, a);
  }
  const out = legs.slice();
  for (const a of bySc.values()) {
    const ship = a.ship == null ? "" : String(a.ship).trim();
    if (!ship) continue; // no vessel at all -> nothing to place; the registry still carries them
    const o = {
      ship,
      name: a.crew_name || null,
      sc: a.sc,
      ours: true,
      on: a.sign_on || null,
      off: a.planned_sign_off || null, // null => TBA sign-off, exactly like a ship_leg row
      brand: (a.brand && (BRAND_SHORT[a.brand] || a.brand)) || brandByShip[ship] || null,
      is_current: true,
      crew_id: a.crew_id || null,
      source: "assignment",
      assignment_id: a.id || null,   // which projection placed them here: the card acts on this
    };
    if (a.on_port_seed) o.embark = a.on_port_seed;   // honest nulls: no homeport guess here
    if (a.off_port_seed) o.disembark = a.off_port_seed;
    out.push(o);
  }
  // Ended assignments -> NON-current history legs (off = the actual sign-off). Skipped when a
  // ship_leg row already records that same crew + sign-on (the snapshot has it).
  const onKey = new Set(legs.map((r) => (r.sc || "") + "|" + (r.on || "")));
  for (const a of endedRows || []) {
    if (!a || !a.sc || !a.actual_sign_off || !a.sign_on) continue;
    const ship = a.ship == null ? "" : String(a.ship).trim();
    if (!ship || onKey.has(a.sc + "|" + a.sign_on)) continue;
    const o = {
      ship, name: a.crew_name || null, sc: a.sc, ours: true,
      on: a.sign_on, off: a.actual_sign_off,
      brand: (a.brand && (BRAND_SHORT[a.brand] || a.brand)) || brandByShip[ship] || null,
      is_current: false, crew_id: a.crew_id || null, source: "assignment:ended",
    };
    if (a.on_port_seed) o.embark = a.on_port_seed;
    if (a.off_port_seed) o.disembark = a.off_port_seed;
    out.push(o);
  }
  return out;
}

// A recorded actual sign-off, keyed "sc|sign_on" to match a leg's sc + on-date. Rita records a
// sign-off in the Keyman board (contract_edit.sign_off) / keyman act_off, but nothing ever closes
// the matching July ship_leg snapshot row — is_current is never flipped back to 0 — so the crew
// keeps holding their card and stays billed as current (rotationSections/apiBillingMonth bill a
// current crew through today). We read these and fold them in at the READ layer, the same
// precedence already used for in-force and ended assignments (3-5 Sep).
//
// THE EDIT BELONGS TO A CONTRACT, NOT A POSITION (5 Oct 2026 review): the join is by `on_key` (the leg's
// sign-on) and falls back to `seq` only for an edit written before on_key existed — the same ladder as
// counter_sync.editFor. Joining by seq alone would hand Rita's recorded sign-off to a 2023 contract the
// moment a multi-block Counter renumbers the rows (every live edit sits on seq 1 today).
// THE NEWER WRITE WINS (Miguel, 14 Sep 2026): a recorded sign-off closes the leg only when the edit is
// newer than the Counter row (an unstamped row — every row today — is older than anything); a Counter
// that arrived after the edit reopens the leg, exactly as the upload's dry-run promised ("overrides").
// k.act_off is TDG's own actual sign-off and always counts.
export async function fetchRecordedSignoffs(env) {
  const { results } = await env.DB.prepare(
    `SELECT k.sc, k.sign_on,
            CASE WHEN k.act_off IS NOT NULL THEN k.act_off
                 WHEN e.sign_off IS NOT NULL AND (k.imported_at IS NULL OR (e.updated_at IS NOT NULL AND e.updated_at > k.imported_at)) THEN e.sign_off
                 END AS recorded_off
       FROM keyman_contract3 k
       LEFT JOIN contract_edit e ON e.sc = k.sc
                                 AND ((e.on_key IS NOT NULL AND substr(e.on_key,1,10) = substr(k.sign_on,1,10))
                                      OR (e.on_key IS NULL AND e.seq = k.seq))
      WHERE k.act_off IS NOT NULL OR e.sign_off IS NOT NULL`
  ).all();
  const m = {};
  for (const r of results || []) if (r.recorded_off) m[(r.sc || "") + "|" + (r.sign_on || "")] = r.recorded_off;
  return m;
}

// PURE. The rule for one leg: a recorded sign-off sets the real off-date; if it has passed, the crew
// has left, so the leg is no longer current (drops the card, stops billing as current). A future
// recorded date keeps the leg current (aboard until then). No recorded date -> unchanged.
export function legWithRecordedSignoff(offDate, isCurrent, recordedOff, today) {
  if (!recordedOff) return { off: offDate || null, is_current: !!isCurrent };
  return { off: recordedOff, is_current: (today && recordedOff < today) ? false : !!isCurrent };
}

// PURE. Fold recorded sign-offs into the shaped snapshot legs (match on sc + on-date = sign_on).
export function applyRecordedSignoffs(legs, recMap, today) {
  if (!recMap) return legs || [];
  return (legs || []).map((r) => {
    const rec = recMap[(r.sc || "") + "|" + (r.on || "")];
    if (!rec) return r;
    const eff = legWithRecordedSignoff(r.off, r.is_current, rec, today);
    return { ...r, off: eff.off, is_current: eff.is_current };
  });
}


// -----------------------------------------------------------------------------
// THE SCHEDULE IS THE ADVANCEDQUERY (Miguel, 7 Oct 2026). The weekly TDG registry file now carries
// EMBARKEDDATE and DEBARKEDDATE per seafarer (first file: 7 Oct 2026, 104 rows, every On board row
// dated). The console keeps the file (registry_snapshot) and reads the schedule from it:
//
//   sign-on   = the file's embark date, full stop. The Contract Counter (keyman_contract3) is HISTORY
//               only: it never seats, never dates a seat, never says overdue. A Counter contract the
//               file carries (same crew, same hull, sign-on within ABSORB_DAYS) is dropped in favour
//               of the file's dates; the rest of the Counter is served non-current.
//   sign-off  = the first of these the console knows, in this order:
//               tdg        TDG's own word: a DEBARKEDDATE on the row (final), or the Counter's actual
//                          sign-off for the same contract (final). The file's own cross-over — a SECOND
//                          crew the same file has On board the same hull with a later embark — is the
//                          sign-off DATE (source tdg, with the reliever), never the end (see "held").
//               rita/card  whichever is NEWER: the sign-off Rita typed for this contract
//                          (contract_edit, keyed on the embark date), or Rita's yellow card for a
//                          RELIEVER on the same hull (its sign-on is the outgoing crew's sign-off —
//                          "the cross-over"). Her later action wins; the card is ignored once a file
//                          dated after its sign-on fails to have the reliever aboard.
//               projected  embark + CONTRACT_MONTHS (7; Azamara 5) — "TDG does not say the sign-off
//                          until very late", so every active seafarer gets a 7-month projection.
//   the swap  = when the reliever's sign-on (file or card) has PASSED, the outgoing contract ends on
//               that day (non-current → "Contract completed" underneath) and the reliever holds the
//               seat: from the file row if the file has them, else from the card (drawn green,
//               awaiting the next file, which absorbs the card when it carries them).
//   overdue   = a PROJECTED sign-off that has passed is still current (the seat is held, drawn red);
//               a tdg / rita / card sign-off that has passed ended the contract — UNLESS:
//   held      = "we follow what TDG has in the software" (Miguel, 8 Oct 2026, on Belhida / Reyes /
//               Villacortes: their relievers aboard since 2 and 7 Oct, TDG still listing them On board).
//               While the latest file — dated ON or AFTER that sign-off — still has the crew On board this
//               hull with no DEBARKEDDATE, the contract stays CURRENT: drawn red past its sign-off
//               (`heldByFile`), status On board. Only TDG ends it: a debark date, the Counter's actual
//               sign-off, or a file that no longer has them On board. A sign-off the file could not see
//               yet (after its date) still swaps as before.
//   ended     = a row On Vacation / Inactive / Reserved with embark + debark is the LAST contract,
//               non-current, dated by TDG (the Score Card's default span, the scoring queue's
//               "signed off recently").
// Pure (legsFromRegistry, foldCounterHistory); the reads join the board's one wave (CLAUDE.md §12).
// -----------------------------------------------------------------------------
export const CONTRACT_MONTHS = 7;
export const AZAMARA_CONTRACT_MONTHS = 5;
const SHIP_KEYS = buildShipKeys(VESSEL_REF);
const dayOf = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(0, 10) : null);
const shipKey = (s) => normShip(canonShipWith(s, SHIP_KEYS) || s || "");
function daysApart(a, b) {
  const x = dayOf(a), y = dayOf(b);
  if (!x || !y) return null;
  return Math.round((Date.parse(y + "T00:00:00Z") - Date.parse(x + "T00:00:00Z")) / 86400000);
}
function plusMonths(d, n) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return dt.toISOString().slice(0, 10);
}

// The kept file, one row per crew, with the roster's name and id beside it.
export async function fetchRegistryRows(env) {
  const { results } = await env.DB.prepare(
    `SELECT s.agency_id AS sc, s.status, s.raw_status, s.vessel, s.embarked_at, s.debarked_at, s.run_at,
            c.id AS crew_id,
            TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name
       FROM registry_snapshot s
       LEFT JOIN crew c ON c.agency_id = s.agency_id`
  ).all();
  return results || [];
}
// Every Counter contract's key, so a legacy edit (no on_key) and TDG's own actual sign-off can be
// matched to the file's contract by sign-on.
export async function fetchCounterKeys(env) {
  const { results } = await env.DB.prepare(
    "SELECT sc, seq, sign_on, act_off FROM keyman_contract3 WHERE sign_on IS NOT NULL"
  ).all();
  return results || [];
}
export async function fetchContractEdits(env) {
  const { results } = await env.DB.prepare(
    "SELECT sc, seq, on_key, sign_on, sign_off, embark, disembark, eccr, air, hotel, on_conf, off_conf, updated_at FROM contract_edit"
  ).all();
  return results || [];
}
export async function fetchVesselBrands(env) {
  const { results } = await env.DB.prepare("SELECT name, brand FROM vessel").all();
  return results || [];
}

// PURE. rows: fetchRegistryRows · edits: fetchContractEdits · counter: fetchCounterKeys · open: the open
// assignments (fetchOpenAssignments, with created_at/updated_at) · vessels: [{name, brand}] · today.
export function legsFromRegistry({ rows, edits, counter, open, vessels, today } = {}) {
  const brandOf = {};
  for (const v of (vessels || [])) if (v && v.name) brandOf[shipKey(v.name)] = BRAND_SHORT[v.brand] || v.brand || null;
  const isAz = (k) => AZAMARA_SHORT.includes(k);
  // Rita's edits for a crew: by contract key (on_key), and by Counter position for rows older than on_key.
  const editsBy = {};
  for (const e of (edits || [])) if (e && e.sc) (editsBy[e.sc] = editsBy[e.sc] || []).push(e);
  const counterBy = {};
  for (const k of (counter || [])) if (k && k.sc) (counterBy[k.sc] = counterBy[k.sc] || []).push(k);
  const near = (a, b) => { const g = daysApart(a, b); return g != null && Math.abs(g) <= ABSORB_DAYS; };
  // The edit that belongs to THIS contract: keyed on its embark date (within the absorb window — TDG
  // books the real port day, the Counter the nearest turnaround), else a legacy seq-keyed edit whose
  // Counter position carries the same sign-on. Never an edit that KNOWS it belongs to another contract.
  const editFor = (sc, on) => {
    const list = editsBy[sc] || [];
    let best = null;
    for (const e of list) if (e.on_key && near(e.on_key, on) && (!best || Math.abs(daysApart(e.on_key, on)) < Math.abs(daysApart(best.on_key, on)))) best = e;
    if (best) return best;
    for (const k of (counterBy[sc] || [])) if (near(k.sign_on, on)) { const e = list.find((x) => !x.on_key && x.seq != null && Number(x.seq) === Number(k.seq)); if (e) return e; }
    return null;
  };
  const counterActOff = (sc, on) => { for (const k of (counterBy[sc] || [])) if (near(k.sign_on, on) && dayOf(k.act_off)) return dayOf(k.act_off); return null; };
  const fileBy = {};
  const current = [], ended = [];
  for (const r of (rows || [])) {
    if (!r || !r.sc) continue;
    const status = r.status || normalizeStatus(r.raw_status) || null;
    const ship = r.vessel ? (canonShipWith(r.vessel, SHIP_KEYS) || String(r.vessel).trim()) : null;
    const key = ship ? normShip(ship) : null;
    const on = dayOf(r.embarked_at), off = dayOf(r.debarked_at);
    fileBy[r.sc] = { status, key, at: dayOf(r.run_at) };
    if (!ship || !on) continue;
    const base = { ship, name: r.crew_name || null, sc: r.sc, ours: true, on, brand: brandOf[key] || (isAz(key) ? "Azamara" : null), crew_id: r.crew_id || null, source: "registry", fileAt: dayOf(r.run_at) };
    if (status === "On board") current.push({ ...base, key, tdgOff: off && off >= on ? off : null });
    else if ((status === "On Vacation" || status === "Inactive") && off && off >= on) ended.push({ ...base, off, is_current: false, offSource: "tdg", offAt: dayOf(r.run_at) });
  }
  const out = [];
  for (const L of current) {
    const cand = [];
    // 1. TDG's word, final: the row's own debark, the Counter's actual sign-off, or the file's cross-over.
    if (L.tdgOff) cand.push({ off: L.tdgOff, source: "tdg", at: L.fileAt, final: true });
    const act = counterActOff(L.sc, L.on);
    if (!L.tdgOff && act && act >= L.on) cand.push({ off: act, source: "tdg", at: null, final: true });
    const next = current.filter((o) => o.sc !== L.sc && o.key === L.key && o.on > L.on).map((o) => o.on).sort()[0];
    // The cross-over dates the sign-off but is not final: the same file still lists this crew On board (held).
    const cross = next ? { off: next, source: "tdg", at: L.fileAt, reliever: current.find((o) => o.key === L.key && o.on === next) } : null;
    // 2. Rita: the sign-off she typed for this contract, or her reliever card on this hull — the newer wins.
    const e = editFor(L.sc, L.on);
    if (e && dayOf(e.sign_off) && dayOf(e.sign_off) >= L.on) cand.push({ off: dayOf(e.sign_off), source: "rita", at: String(e.updated_at || ""), conf: e.off_conf != null ? !!e.off_conf : false });
    let card = null;
    for (const a of (open || [])) {
      if (!a || !a.sc || a.sc === L.sc || !a.ship || !dayOf(a.sign_on)) continue;
      if (shipKey(a.ship) !== L.key || dayOf(a.sign_on) <= L.on) continue;
      // A card whose sign-on has passed holds only while no later file contradicts it: a file dated after
      // the sign-on that does not have the reliever On board this hull says the relief did not happen.
      const w = fileBy[a.sc];
      if (dayOf(a.sign_on) <= today && w && w.at && w.at >= dayOf(a.sign_on) && !(w.status === "On board" && w.key === L.key)) continue;
      if (!card || dayOf(a.sign_on) < card.on) card = { on: dayOf(a.sign_on), at: String(a.updated_at || a.created_at || ""), id: a.id || null, sc: a.sc, name: a.crew_name || null };
    }
    if (card) cand.push({ off: card.on, source: "card", at: card.at, reliever: { sc: card.sc, name: card.name, cardId: card.id } });
    let pick = cand.find((c) => c.final) || null;
    if (pick) { const t = cand.filter((c) => c.final).sort((a, b) => (a.off < b.off ? -1 : 1)); pick = t[0]; }
    if (!pick && cross) pick = cross;
    if (!pick) {
      const rc = cand.filter((c) => c.source === "rita" || c.source === "card");
      if (rc.length === 1) pick = rc[0];
      else if (rc.length === 2) pick = rc[0].at === rc[1].at ? rc.find((c) => c.source === "rita") : (rc[0].at > rc[1].at ? rc[0] : rc[1]);
    }
    if (!pick) pick = { off: plusMonths(L.on, isAz(L.key) ? AZAMARA_CONTRACT_MONTHS : CONTRACT_MONTHS), source: "projected", at: null };
    const passed = pick.off < today;
    // HELD (8 Oct 2026): a sign-off that is not TDG's final word, passed, and the file dated on/after it still
    // has them On board this hull — the file wins, the contract stays current (red, past its sign-off).
    const held = passed && !pick.final && pick.source !== "projected" && !!L.fileAt && L.fileAt >= pick.off;
    const leg = { ship: L.ship, name: L.name, sc: L.sc, ours: true, on: L.on, off: pick.off, brand: L.brand, is_current: pick.source === "projected" || held ? true : !passed, crew_id: L.crew_id, source: "registry", offSource: pick.source, offAt: pick.at ? dayOf(pick.at) : null, fileAt: L.fileAt };
    if (held) leg.heldByFile = true;
    if (pick.reliever) leg.reliever = { sc: pick.reliever.sc, name: pick.reliever.name || null, cardId: pick.reliever.cardId || null };
    if (pick.source === "rita" && pick.conf && !held) leg.offConfirmed = true;
    if (e) { if (e.embark) leg.embark = e.embark; if (e.disembark) leg.disembark = e.disembark; leg.edit = { eccr: !!e.eccr, air: !!e.air, hotel: !!e.hotel, onConfirmed: !!e.on_conf, seq: e.seq != null ? Number(e.seq) : null }; }
    out.push(leg);
  }
  for (const E of ended) { const { key, ...leg } = E; out.push(leg); }
  return out;
}

// PURE. The Counter is history once the file dates a crew: its legs go non-current, and a Counter
// contract the file itself carries (same crew, same hull, sign-on within ABSORB_DAYS of the embark) is
// dropped — the file's dates stand. A crew the file gives no dates for keeps their Counter legs as they
// were (the seat still comes from the file; this is the fallback for an older file without the columns).
export function foldCounterHistory(counterLegs, registryLegs) {
  const reg = {};
  for (const r of (registryLegs || [])) if (r && r.sc) (reg[r.sc] = reg[r.sc] || []).push(r);
  const out = [];
  for (const h of (counterLegs || [])) {
    const rs = h && h.sc ? reg[h.sc] : null;
    if (!rs || !rs.length) { out.push(h); continue; }
    const k = shipKey(h.ship);
    const dup = rs.some((r) => shipKey(r.ship) === k && (() => { const g = daysApart(r.on, h.on); return g != null && Math.abs(g) <= ABSORB_DAYS; })());
    if (dup) continue;
    out.push(h.is_current ? { ...h, is_current: false } : h);
  }
  return out;
}

// Board legs from the database — the file's schedule first (legsFromRegistry), the Counter folded in as
// history, then crew aboard per the relief board. All reads fire together (one wave, CLAUDE.md §12).
export async function boardLegsFromDb(env, today) {
  const [legs, asg, ended, recMap, rows, edits, counter, open, vessels] = await Promise.all([
    legsFromCounter(env), fetchCurrentAssignments(env, today), fetchRecentSignoffs(env, today), fetchRecordedSignoffs(env),
    fetchRegistryRows(env), fetchContractEdits(env), fetchCounterKeys(env), fetchOpenAssignments(env), fetchVesselBrands(env),
  ]);
  const registry = legsFromRegistry({ rows, edits, counter, open, vessels, today });
  const history = foldCounterHistory(applyRecordedSignoffs(legs, recMap, today), registry);
  return mergeBoardLegs(registry.concat(history), asg, today, ended);
}

// -----------------------------------------------------------------------------
// Rita's projections — every OPEN assignment, with what a board card needs.
//
// This is the yellow-card feed (Miguel, 14 Sep 2026: "rita create projections .. and when she is
// sure .. cta is trigger to joy"). Unlike fetchCurrentAssignments it has NO date filter: a
// projection that has not started yet is exactly the card Rita is working on, and a projection
// whose sign-on has passed is a seafarer aboard per her board and not yet in a Contract Counter.
// Nothing here feeds status or the schedule — boardLegs still decides who is aboard.
// -----------------------------------------------------------------------------
export async function fetchOpenAssignments(env) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.role, a.sign_on, a.planned_sign_off, a.on_port_seed, a.off_port_seed,
            a.override_on_city, a.override_off_city, a.succeeds_assignment_id,
            a.eccr, a.air, a.hotel, a.on_date_conf, a.off_date_conf,
            a.instructions_sent_at, a.signoff_link_sent_at, a.review_invite_sent_at,
            a.deployed_at, a.deploy_log_id, a.created_at, a.updated_at,
            COALESCE(v.name, a.vessel_name) AS ship, v.brand AS brand,
            c.id AS crew_id, c.agency_id AS sc,
            COALESCE(NULLIF(o.rank_override,''), c.rank_override, c.rank_observed) AS rank,
            TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name
       FROM assignment a
       JOIN contract k ON k.id = a.contract_id
       JOIN crew     c ON c.id = k.crew_id
       LEFT JOIN vessel v ON v.id = a.vessel_id
       LEFT JOIN crew_override o ON o.agency_id = c.agency_id
      WHERE a.actual_sign_off IS NULL
      ORDER BY ship, a.sign_on`
  ).all();
  return results || [];
}

// PURE. Which open assignments still need a card of their own.
//
// An assignment already drawn on the board — its crew is standing on that ship because of it —
// must not be drawn twice. `drawn` is the set of "sc|ship" a caller has already rendered as a
// yellow card. Everything else is a projection: a future contract, or a crew Rita has placed on a
// ship the board does not otherwise show them on.
export function pendingProjections(open, drawn) {
  const key = (sc, ship) => sc + "|" + String(ship == null ? "" : ship).trim().toLowerCase();
  const seen = drawn instanceof Set ? drawn : new Set(drawn || []);
  const out = [];
  for (const a of (open || [])) {
    if (!a || !a.sc || !a.ship) continue;
    if (seen.has(key(a.sc, a.ship))) continue;
    out.push(a);
  }
  return out;
}
