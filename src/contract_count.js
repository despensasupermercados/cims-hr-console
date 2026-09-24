// src/contract_count.js
// TDG's own COMPLETED-CONTRACT COUNT — "DG3 Printer Specialist Completed Contract as of <date>.xlsx".
//
// Miguel, 24 Sep 2026: "the contract counter is something u got it on a excel file .. after that YOU
// suppose to count contract .. what happened ?? u forgot ?"  He is right, and this file settles HOW the
// count is known: TDG STATES IT. The console used to derive it from Contract Counter dates
// (contracts.js: ≤21-day gap = one contract, full = ≥6 months / ≥5 Azamara). Measured against this file
// on 24 Sep: of 41 comparable crew, 18 disagreed and the derivation was LOW every single time — Espenilla
// Zandro TDG 7 / derived 0, Dela Rosa 4 / 2, Villacortes 3 / 1. The duration rule drops contracts TDG
// counts as completed (short contracts, early departures, transfers). Rank and the ladder sit on this
// number, so the count is an IMPORT, not a calculation. Brain: recM1e5dbyfvhfm5m holds both tabs in full.
//
// THE FILE. Two tabs, ACTIVE and INACTIVE, four columns each:
//   CREW ID | CREW NAME | COMPLETED CONTRACTS | POSITION
// CREW ID is a 6-digit Royal id, or "PCN 6141HEL65159" / "PCN: …" (Celebrity), or "AZAM488831". The
// console stores the bare value in crew.ship_crew_id, so the PCN prefix is stripped before matching.
// COMPLETED CONTRACTS reads "4 Contracts", "1 Contract", "2 Contract" (the wording drifts) or "Ongoing"
// — a Junior with no completed contract yet, which is 0, not unknown. POSITION is the rank as TDG holds it.
//
// Pure: no IO. Everything here is unit-tested, and the importer route in worker.js is the only writer.

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z]/g, "");
export const normId = (v) => String(v == null ? "" : v).replace(/^\s*pcn\s*:?\s*/i, "").replace(/\.0$/, "").trim();

// One tab (array-of-arrays, header row first) -> rows. Tab name is carried so the record says which.
export function parseCountTab(aoa, tab) {
  const out = [], unparsed = [];
  const rows = Array.isArray(aoa) ? aoa : [];
  // Locate the header by its content, not its position: someone will one day add a title row.
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const j = (rows[i] || []).map(norm).join("|");
    if (j.includes("crewid") && j.includes("completed")) { start = i + 1; break; }
  }
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const id = normId(r[0]), name = String(r[1] == null ? "" : r[1]).trim();
    const raw = String(r[2] == null ? "" : r[2]).trim(), position = String(r[3] == null ? "" : r[3]).trim();
    if (!name && !id) continue;                                   // a blank spacer row
    let completed = null;
    const m = /^(\d+)\s*contract/i.exec(raw);
    if (m) completed = Number(m[1]);
    else if (/^ongoing/i.test(raw)) completed = 0;                // a junior still on the first one
    else if (/^\d+$/.test(raw)) completed = Number(raw);
    if (completed == null) { unparsed.push({ tab, row: i + 1, id, name, raw }); continue; }
    out.push({ id, name, completed, position, tab, row: i + 1 });
  }
  return { rows: out, unparsed };
}

// Both tabs. `sheets` = { ACTIVE: aoa, INACTIVE: aoa } (keys matched case-insensitively). A workbook
// missing either tab is refused: the rule Miguel set is "acknowledge both", and a half file silently
// imported reads as a whole one.
export function parseCompletedContracts(sheets) {
  const keys = Object.keys(sheets || {});
  const find = (want) => keys.find((k) => k.trim().toUpperCase() === want);
  const kA = find("ACTIVE"), kI = find("INACTIVE");
  if (!kA || !kI) return { error: "need_both_tabs", have: keys, rows: [], unparsed: [], duplicates: [] };
  const a = parseCountTab(sheets[kA], "ACTIVE"), b = parseCountTab(sheets[kI], "INACTIVE");
  const rows = a.rows.concat(b.rows);
  // A crew id appearing twice is a defect in the FILE (Paygane, Erik: 517755 twice in INACTIVE, 2 and
  // 4). CLAUDE.md §6: flag, never pick. Neither row is imported until the file says one thing.
  const seen = {}, duplicates = [];
  for (const r of rows) if (r.id) (seen[r.id] = seen[r.id] || []).push(r);
  for (const id of Object.keys(seen)) if (seen[id].length > 1) duplicates.push({ id, rows: seen[id] });
  const dupIds = new Set(duplicates.map((d) => d.id));
  return {
    rows: rows.filter((r) => !dupIds.has(r.id)),
    unparsed: a.unparsed.concat(b.unparsed),
    duplicates,
    tabs: { ACTIVE: a.rows.length, INACTIVE: b.rows.length },
  };
}

// Bridge each file row to an SC agency id. Order: the persistent cruise-line id (crew.ship_crew_id),
// then exact "last|first-word", then a unique surname. Same ladder as keymanimport.bridgeName so the two
// TDG files cannot disagree about who somebody is. Roster = [{agency_id, first_name, last_name, ship_crew_id}].
export function bridgeCounts(parsed, roster) {
  const byKm = {}, full = {}, byLast = {};
  for (const c of (roster || [])) {
    if (!c || !c.agency_id) continue;
    const km = normId(c.ship_crew_id);
    if (km) byKm[km] = c.agency_id;
    const ln = norm(c.last_name), fn = norm(String(c.first_name || "").split(" ")[0]);
    if (ln) { full[ln + "|" + fn] = c.agency_id; (byLast[ln] = byLast[ln] || []).push(c.agency_id); }
  }
  const matched = [], unmatched = [];
  for (const r of (parsed && parsed.rows) || []) {
    const [lastRaw, firstRaw = ""] = String(r.name).split(",");
    const ln = norm(lastRaw), fn = norm(firstRaw.trim().split(" ")[0]);
    let sc = byKm[r.id] || full[ln + "|" + fn] || null;
    if (!sc) { const arr = byLast[ln] || []; if (arr.length === 1) sc = arr[0]; }
    if (!sc) { unmatched.push(r); continue; }
    matched.push({ ...r, sc });
  }
  return { matched, unmatched };
}

// What an apply would change. current = { sc: completed today } (from contract_count), derived =
// { sc: the console's date-derived count } for the comparison the dry-run shows.
export function diffCounts(matched, current, derived) {
  const changes = [], same = [];
  for (const m of matched) {
    const before = current && current[m.sc] != null ? current[m.sc] : null;
    const d = derived && derived[m.sc] != null ? derived[m.sc] : null;
    const row = { sc: m.sc, name: m.name, id: m.id, tab: m.tab, position: m.position, before, after: m.completed, derived: d };
    if (before === m.completed) same.push(row); else changes.push(row);
  }
  changes.sort((x, y) => (y.after - (y.before || 0)) - (x.after - (x.before || 0)));
  return { changes, same };
}
