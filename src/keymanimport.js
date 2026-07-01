// Keyman "Contract Counter" importer — pure, testable. The sheet is WIDE: one row per crew with up to
// 7 contract blocks across the columns:
//   col 0 Company · 1 Ship · 2 Status · 3 Ships's Crew ID (km) · 4 Last Name · 5 Name (first) ·
//   then repeating [Sign-on, Projected sign-off, Ttl months] from col 6 (6/7/8, 9/10/11, ...).
// The sheet's "km" is a cruise-line crew ID, not our SC agency id. Crew are bridged to SC by their
// PERSISTENT cruise-line id (crew.ship_crew_id) when we have it — exact and immune to name drift —
// and fall back to NAME matching only for crew whose ship_crew_id isn't filled yet.
// Informational only — NEVER a payout input.

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z]/g, "");
// Normalise a cruise-line crew id for comparison: string, trimmed, drop a trailing ".0" spreadsheet float artifact.
const normKm = (v) => String(v == null ? "" : v).trim().replace(/\.0$/, "");

export function normDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); // M/D/YYYY
  if (m) return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// aoa = the whole sheet as array-of-arrays. Returns one entry per crew with their contract blocks.
export function parseContractCounter(aoa) {
  const out = [];
  for (const row of (aoa || [])) {
    if (!row) continue;
    const km = row[3];
    if (km == null || km === "") continue;
    const last = String(row[4] == null ? "" : row[4]).trim();
    const first = String(row[5] == null ? "" : row[5]).trim();
    if (!last || norm(last) === "lastname") continue; // header / blank row
    const contracts = [];
    for (let c = 6, seq = 1; c < row.length; c += 3, seq++) {
      const on = normDate(row[c]);
      if (on) contracts.push({ seq, on, proj: normDate(row[c + 1]) });
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
  return out;
}

// roster: [{agency_id, last_name, first_name, ship_crew_id}] -> id + name lookup helpers.
//   byKm  : persistent cruise-line id -> SC agency id (authoritative)
//   full  : "last|first" -> SC agency id (fallback)
//   byLast: last -> [SC agency id, ...] (fallback)
export function buildBridge(roster) {
  const full = {}, byLast = {}, byKm = {};
  for (const c of (roster || [])) {
    const km = normKm(c.ship_crew_id);
    if (km && c.agency_id) byKm[km] = c.agency_id; // authoritative bridge, when the persistent id is known
    const ln = norm(c.last_name), fn = norm(c.first_name);
    if (!c.agency_id || !ln) continue;
    full[ln + "|" + fn] = c.agency_id;
    (byLast[ln] = byLast[ln] || []).push(c.agency_id);
  }
  return { full, byLast, byKm };
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
  if (!sc) { const arr = bridge.byLast[ln] || []; if (arr.length === 1) sc = arr[0]; }
  if (!sc) { const sw = bridge.full[fn + "|" + ln]; if (sw) sc = sw; }
  return sc || null;
}

// Build keyman_contract3-shaped rows for all matched crew. Ship = the crew's current ship (per-contract
// ship isn't in the sheet). Returns { rows, matched:[sc], unmatched:[{last,first,km}] }.
export function buildKeymanRows(parsed, roster) {
  const bridge = buildBridge(roster);
  const rows = [], matched = new Set(), unmatched = [];
  for (const pc of (parsed || [])) {
    const sc = bridgeName(pc, bridge);
    if (!sc) { unmatched.push({ last: pc.last, first: pc.first, km: pc.km }); continue; }
    matched.add(sc);
    for (const ct of pc.contracts) {
      rows.push({ sc, km: pc.km, ship: pc.ship, st: pc.status, seq: ct.seq, sign_on: ct.on, proj_off: ct.proj || null, act_off: null });
    }
  }
  return { rows, matched: [...matched], unmatched };
}
