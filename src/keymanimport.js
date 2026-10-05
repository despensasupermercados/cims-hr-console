// Keyman "Contract Counter" importer — pure, testable. The sheet is WIDE: one row per crew with up to
// 7 contract blocks across the columns:
//   col 0 Company · 1 Ship · 2 Status · 3 Ships's Crew ID (km) · 4 Last Name · 5 Name (first) ·
//   then repeating [Sign-on, Projected sign-off, Ttl months] from col 6 (6/7/8, 9/10/11, ...).
// The sheet's "km" is a cruise-line crew ID, not our SC agency id. Crew are bridged to SC by their
// PERSISTENT cruise-line id (crew.ship_crew_id) when we have it — exact and immune to name drift —
// and fall back to NAME matching only for crew whose ship_crew_id isn't filled yet.
// Informational only — NEVER a payout input.
import { normalizeDate, looksDMY } from "./crewimport.js";

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z]/g, "");
// Normalise a cruise-line crew id for comparison: string, trimmed, drop a trailing ".0" spreadsheet float artifact.
const normKm = (v) => String(v == null ? "" : v).trim().replace(/\.0$/, "");

export function normDate(v, opts) {
  // One validated parser for the whole console (crewimport.normalizeDate): ISO with or without a
  // time, M/D/YYYY, D/M/YYYY when the row proves it (opts.dmy), text forms; an impossible date is
  // null, never stored (julianday() of "2034-23-09" is NULL and silently skips the leg).
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  return normalizeDate(v, opts);
}

// aoa = the whole sheet as array-of-arrays. Returns { crew: one entry per crew with their contract
// blocks, unparsed: date cells no reading could make a real date }. A leg whose sign-on is
// unreadable is SKIPPED (it used to be stored as an impossible date that julianday() ignored) —
// the skip is reported, never silent: rank and the Contracts number are computed from these legs.
export function parseContractCounterFull(aoa) {
  const out = [], unparsed = [];
  for (const row of (aoa || [])) {
    if (!row) continue;
    const km = row[3] == null ? "" : row[3];
    const last = String(row[4] == null ? "" : row[4]).trim();
    const first = String(row[5] == null ? "" : row[5]).trim();
    // A row with NO cruise-line id (a new hire whose id is not issued yet) still reaches the name ladder
    // and, failing that, the unmatched list — it used to vanish before anyone could count it (5 Oct 2026).
    if (km === "" && !last) continue;
    if (!last || norm(last) === "lastname") continue; // header / blank row
    // Day-first is a property of the ROW: one cell with a first field > 12 decides every cell in it.
    const dmy = row.some(looksDMY);
    const contracts = [];
    const bad = (seq, field, raw) => unparsed.push({ km: String(km).replace(/\.0$/, ""), last, first, seq, field, raw: String(raw) });
    for (let c = 6, seq = 1; c < row.length; c += 3, seq++) {
      const on = normDate(row[c], { dmy }), proj = normDate(row[c + 1], { dmy });
      if (!on && row[c] != null && row[c] !== "") bad(seq, "sign_on", row[c]);
      if (!proj && row[c + 1] != null && row[c + 1] !== "") bad(seq, "proj_off", row[c + 1]);
      if (on) contracts.push({ seq, on, proj });
    }
    if (!contracts.length) continue;
    out.push({
      km: String(km).replace(/\.0$/, ""), last, first,
      company: String(row[0] == null ? "" : row[0]).trim(),
      ship: String(row[1] == null ? "" : row[1]).trim(),
      status: String(row[2] == null ? "" : row[2]).trim(),
      contracts,
    });
  }
  return { crew: out, unparsed };
}
export function parseContractCounter(aoa) { return parseContractCounterFull(aoa).crew; }

// roster: [{agency_id, last_name, first_name, ship_crew_id}] -> id + name lookup helpers.
//   byKm  : persistent cruise-line id -> SC agency id (authoritative)
//   full  : "last|first" -> SC agency id (fallback)
//   byLast: last -> [SC agency id, ...] (fallback)
export function buildBridge(roster) {
  const full = {}, byLast = {}, byKm = {}, firstBySc = {}, ambiguous = new Set();
  for (const c of (roster || [])) {
    const km = normKm(c.ship_crew_id);
    if (km && c.agency_id) byKm[km] = c.agency_id; // authoritative bridge, when the persistent id is known
    const ln = norm(c.last_name), fn = norm(c.first_name);
    if (!c.agency_id || !ln) continue;
    // Two roster crew with the same full key ("Santos, Juan" / "Santos, Juan" under two ids) make the
    // key AMBIGUOUS: it resolves nobody rather than whoever was listed last (§6: flag, never pick).
    const key = ln + "|" + fn;
    if (key in full && full[key] !== c.agency_id) ambiguous.add(key);
    full[key] = c.agency_id;
    firstBySc[c.agency_id] = String(c.first_name || "");
    (byLast[ln] = byLast[ln] || []).push(c.agency_id);
  }
  for (const key of ambiguous) delete full[key];
  return { full, byLast, byKm, firstBySc };
}

// Do two first names belong to the same person? Equal, one the prefix of the other ("Mark" / "Mark
// Anthony"), or the same first word. A blank on either side cannot disagree. The surname-only step
// below used to put "Garcia, Jose" on the roster's only Garcia, "Maria" (5 Oct 2026 review).
export function firstNameAgrees(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return true;
  if (na === nb || na.startsWith(nb) || nb.startsWith(na)) return true;
  const a0 = norm(String(a).trim().split(/\s+/)[0]), b0 = norm(String(b).trim().split(/\s+/)[0]);
  return !!a0 && a0 === b0;
}

// Match one parsed crew to an SC id.
//   0) AUTHORITATIVE: exact cruise-line crew id (km) -> SC. Persistent, immune to name spelling/drift.
//   fallback (only when km is blank/unknown): full last+first, then last+first-token, then unique
//   surname, then a swapped last/first (some rows have the columns reversed). null if no confident match.
export function bridgeName(pc, bridge) {
  const km = normKm(pc && pc.km);
  if (km && bridge.byKm && Object.prototype.hasOwnProperty.call(bridge.byKm, km)) return bridge.byKm[km];
  const ln = norm(pc.last), fn = norm(pc.first);
  let sc = bridge.full[ln + "|" + fn];
  if (!sc) { const f0 = norm(String(pc.first).split(" ")[0]); sc = bridge.full[ln + "|" + f0]; }
  // A unique surname matches only when the first names agree: "Garcia, Jose" is not the roster's one
  // Garcia, "Maria" (§6). firstBySc is absent on a bridge built elsewhere: then the old rule holds.
  if (!sc) {
    const arr = bridge.byLast[ln] || [];
    if (arr.length === 1 && (!bridge.firstBySc || firstNameAgrees(pc.first, bridge.firstBySc[arr[0]]))) sc = arr[0];
  }
  if (!sc) { const sw = bridge.full[fn + "|" + ln]; if (sw) sc = sw; }
  return sc || null;
}

// Two file rows that resolve to the SAME crew: neither is imported — the second would silently replace
// the first (INSERT OR REPLACE on (sc, seq); the count upsert in file order). Returns { kept, collisions }
// where kept = the entries whose sc is unique and collisions = [{ sc, rows }]. entries: [{ sc, ...row }].
export function splitCollisions(entries) {
  const by = {};
  for (const e of (entries || [])) if (e && e.sc) (by[e.sc] = by[e.sc] || []).push(e);
  const collided = new Set(Object.keys(by).filter((sc) => by[sc].length > 1));
  return {
    kept: (entries || []).filter((e) => e && e.sc && !collided.has(e.sc)),
    collisions: [...collided].sort().map((sc) => ({ sc, rows: by[sc] })),
  };
}

// Build keyman_contract3-shaped rows for all matched crew. Ship = the crew's current ship (per-contract
// ship isn't in the sheet). Returns { rows, matched:[sc], unmatched:[{last,first,km}] }.
export function buildKeymanRows(parsed, roster) {
  const bridge = buildBridge(roster);
  const rows = [], matched = new Set(), unmatched = [], resolved = [];
  for (const pc of (parsed || [])) {
    const sc = bridgeName(pc, bridge);
    if (!sc) { unmatched.push({ last: pc.last, first: pc.first, km: pc.km }); continue; }
    resolved.push({ sc, pc });
  }
  // Two sheet rows on one crew: neither is imported (the second would replace the first's contracts
  // row for row — the 2024 leg gone, the "current" leg someone else's). Flagged, never picked (§6).
  const { kept, collisions } = splitCollisions(resolved);
  for (const c of collisions) for (const e of c.rows) unmatched.push({ last: e.pc.last, first: e.pc.first, km: e.pc.km, collision: c.sc });
  for (const { sc, pc } of kept) {
    matched.add(sc);
    for (const ct of pc.contracts) {
      rows.push({ sc, km: pc.km || null, ship: pc.ship, st: pc.status, seq: ct.seq, sign_on: ct.on, proj_off: ct.proj || null, act_off: null });
    }
  }
  return { rows, matched: [...matched], unmatched, collisions: collisions.map((c) => ({ sc: c.sc, rows: c.rows.map((e) => ({ last: e.pc.last, first: e.pc.first, km: e.pc.km })) })) };
}

// The 6 Jul 2026 lesson: a Counter shaped as ONE block per crew (a current-roster export) was applied
// over a 216-row history and silently replaced 48 crew's multi-contract history with a single row each
// (data_log 2026-07-06 16:45). Apply is "the file wins for matched crew" by design; what was missing
// is the FLAG (CLAUDE.md §6). currentCounts: { sc: rows in keyman_contract3 today }. Returns the
// matched crew whose row count would DROP, so the dry-run can say so before anyone clicks Apply.
export function shrinkReport(rows, currentCounts) {
  const after = {};
  for (const r of (rows || [])) if (r && r.sc) after[r.sc] = (after[r.sc] || 0) + 1;
  const out = [];
  for (const sc in after) {
    const before = Number((currentCounts || {})[sc] || 0);
    if (before > after[sc]) out.push({ sc, before, after: after[sc] });
  }
  return out.sort((a, b) => (b.before - b.after) - (a.before - a.after) || (a.sc < b.sc ? -1 : 1));
}

// Group the apply into batches where a crew's DELETE and their INSERTs always land in the SAME
// batch (a D1 batch is one transaction). The previous shape — one batch of every DELETE, then
// INSERTs in chunks of 80 — could leave matched crew with NO rows if a later chunk failed.
// Returns [[{op:'delete',sc} , {op:'insert',row}, ...], ...]; a batch holds at most maxStmts
// statements unless a single crew alone exceeds it (they are never split).
export function replacePlan(rows, matched, maxStmts = 80) {
  const bySc = {};
  for (const r of (rows || [])) if (r && r.sc) (bySc[r.sc] = bySc[r.sc] || []).push(r);
  const batches = [];
  let cur = [];
  for (const sc of (matched || [])) {
    const group = [{ op: "delete", sc }, ...(bySc[sc] || []).map((row) => ({ op: "insert", row }))];
    if (cur.length && cur.length + group.length > maxStmts) { batches.push(cur); cur = []; }
    cur.push(...group);
  }
  if (cur.length) batches.push(cur);
  return batches;
}
