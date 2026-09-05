// Crew import — pure, testable. Maps raw spreadsheet rows (AdvancedQuery) to crew
// fields with tolerant header matching, normalizes dates/status, and diffs against the
// existing roster. NEVER touches baseline_count (money — gated for Rita).

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Find the value in a raw row whose header matches any of the given normalized substrings.
function pick(row, patterns) {
  const keys = Object.keys(row || {});
  for (const p of patterns) {
    const np = norm(p);
    const k = keys.find(h => norm(h).includes(np));
    if (k != null) { const v = row[k]; return v == null ? "" : String(v).trim(); }
  }
  return "";
}

// A real calendar date or null. Every branch below ends here, so an impossible date
// (2034-23-09, 2027-02-30) can never be stored — the console read those as a MISSING document.
function realDate(y, mo, da) {
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
  const d = new Date(iso + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

// Numeric a/b/YYYY (optionally followed by a time, as xlsx->csv exports add " 0:00").
const AB_YEAR = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/;
// Does this raw cell PROVE day-first order? Only a first field > 12 can.
export function looksDMY(v) {
  const m = String(v == null ? "" : v).trim().match(AB_YEAR);
  return !!m && +m[1] > 12 && +m[2] <= 12;
}

// opts.dmy: the ROW is known to be day-first (see mapRow) — read every a/b/YYYY cell as D/M.
export function normalizeDate(v, opts) {
  const dmy = !!(opts && opts.dmy);
  if (v == null || v === "") return null;
  if (typeof v === "number" && isFinite(v)) {
    // Excel serial date (epoch 1899-12-30)
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (m) return realDate(+m[1], +m[2], +m[3]); // ISO, validated too (a stored 2034-23-09 must not round-trip)
  // Numeric a/b/YYYY. AdvancedQuery emits M/D/YYYY (US) for the PHL roster; the rows Rita hand-pastes
  // for non-PHL crew (E1-format, e.g. Joseph, Purnama — 2026-08-25) arrive as D/M/YYYY. Before
  // 2026-09-04 this branch assumed US and turned "23/09/2034" into "2034-23-09". Rule: the row's
  // order is decided once in mapRow (any cell with a first field > 12 proves day-first for the whole
  // row, so a sibling "05/03/2027" in the same row is read as 5 March, not 3 May); a lone ambiguous
  // cell with both fields <= 12 stays US, the roster's own format.
  m = s.match(AB_YEAR);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    let mo = a, da = b;                              // M/D/YYYY (US)
    if (dmy || (a > 12 && b <= 12)) { mo = b; da = a; } // D/M/YYYY
    return realDate(y, mo, da);
  }
  // Text forms ("23 Sep 2034"). Local components, not toISOString(): the suite must not depend on
  // the machine's time zone (Rita is UTC+8; Workers run UTC).
  const d = new Date(s);
  return isNaN(d) ? null : realDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function normalizeStatus(v) {
  const s = norm(v);
  if (!s) return null;
  if (s.includes("board")) return "On board";
  if (s.includes("vac")) return "On Vacation";
  if (s.includes("earmark")) return "Earmarked";
  if (s.includes("inactive")) return "Inactive";
  return null; // unknown -> caller decides (skip / keep existing)
}

// Map one raw row to crew fields. Returns null if no agency_id found.
export function mapRow(row) {
  const agency_id = pick(row, ["crew id", "crewid", "agency id", "agencyid", "crew no", "crewno"]);
  if (!agency_id) return null;
  const raw = {
    dob: pick(row, ["date of birth", "birth", "dob"]),
    med_exp: pick(row, ["medical expiration", "medical exp", "med expiration", "med exp"]),
    sirb_exp: pick(row, ["sirb expiration", "seamans book expiration", "seafarer expiration", "seaman expiration"]),
    pp_exp: pick(row, ["passport expiration", "passport exp"]),
    sch_exp: pick(row, ["schengen visa expiration", "schengen expiration", "schengen exp"]),
    usv_exp: pick(row, ["us visa expiration", "usa visa expiration", "us visa exp", "c1d expiration", "c1/d expiration"]),
  };
  // Date order is a property of the ROW (one source pasted it), not of each cell.
  const dmy = Object.values(raw).some(looksDMY);
  const date = (k) => normalizeDate(raw[k], { dmy });
  return {
    agency_id,
    first_name: pick(row, ["first name", "firstname", "given"]) || null,
    middle_name: pick(row, ["middle"]) || null,
    last_name: pick(row, ["last name", "lastname", "surname"]) || null,
    status: normalizeStatus(pick(row, ["status"])),
    rank_observed: pick(row, ["rank", "position", "rating"]) || null,
    vessel_observed: pick(row, ["vessel", "ship"]) || null,
    dob: date("dob"),
    province: pick(row, ["province"]) || null,
    phone: pick(row, ["mobile", "phone", "cell", "contact no"]) || null,
    email: pick(row, ["email", "e-mail"]) || null,
    // Match the EXPIRATION column specifically. The real AdvancedQuery layout has
    // "<DOC> NO", "<DOC> ISSUE/DATE OF ISSUE", "<DOC> EXPIRATION", "<DOC> PLACE" — and a
    // loose substring ("medical"/"passport"/…) hits the NO column first, importing null.
    // Specific "… expiration" patterns come first; loose ones stay as fallbacks for other formats.
    med_exp: date("med_exp"), sirb_exp: date("sirb_exp"), pp_exp: date("pp_exp"), sch_exp: date("sch_exp"), usv_exp: date("usv_exp"),
  };
}

export function mapRows(rows) {
  const mapped = [], invalid = [];
  for (const r of rows || []) { const m = mapRow(r); if (m) mapped.push(m); else invalid.push(r); }
  return { mapped, invalidCount: invalid.length };
}

const TRACK = ["first_name", "middle_name", "last_name", "status", "rank_observed",
  "vessel_observed", "dob", "province", "phone", "email",
  "med_exp", "sirb_exp", "pp_exp", "sch_exp", "usv_exp"];

// Diff incoming mapped rows vs existing roster (map agency_id -> existing crew row).
// New rows with an unknown/invalid status are flagged (status is NOT NULL + CHECK in D1).
export function diffCrew(incoming, existingByAgency) {
  const add = [], change = [], needsStatus = [];
  let unchanged = 0;
  for (const m of incoming || []) {
    const ex = existingByAgency[m.agency_id];
    if (!ex) {
      if (!m.status) { needsStatus.push(m.agency_id); continue; }
      add.push(m.agency_id);
      continue;
    }
    const changed = TRACK.filter(f => {
      const nv = m[f]; if (nv == null) return false;            // blank in source = don't clobber
      return String(nv) !== String(ex[f] == null ? "" : ex[f]);
    });
    if (changed.length) change.push({ agency_id: m.agency_id, changed });
    else unchanged++;
  }
  return { add, change, unchanged, needsStatus, total: (incoming || []).length };
}
