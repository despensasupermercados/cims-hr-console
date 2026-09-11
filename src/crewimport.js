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
// A cruise-line crew id arrives from spreadsheets as "349195" or "349195.0". Same
// normalisation keymanimport.js uses for the money bridge: 4+ digits, nothing else.
// An agency id ("SC-0040010") deliberately does NOT qualify — only a bare numeric id.
export function normKm(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\.0+$/, "");
  return /^\d{4,}$/.test(s) ? s : null;
}

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
  // Text forms ("23 Sep 2034") only: a day, a month word and a 4-digit year must all be present.
  // new Date() alone turns "12" into 2001-12-01 and "Sep 2027" into 2027-09-01 — real-looking
  // dates from typos, which the accept-by-default cert tier would then store. Local components,
  // not toISOString(): the suite must not depend on the machine's time zone (Rita is UTC+8).
  if (!/\b\d{4}\b/.test(s) || !/[A-Za-z]{3}/.test(s) || !/(^|\D)\d{1,2}(\D|$)/.test(s)) return null;
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

// Map one raw row to crew fields plus the date cells no reading could make a real date.
// Returns null if no agency_id found. mapRow() below is the row-only view.
export function mapRowFull(row) {
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
  const dates = {}; for (const k of Object.keys(raw)) dates[k] = normalizeDate(raw[k], { dmy });
  const date = (k) => dates[k];
  // A non-empty cell that no reading makes a real date. null downstream means "blank, keep the
  // stored value" — so without this list a typo like 2/30/2027 would silently keep a stale expiry.
  const unparsed = Object.keys(raw).filter(k => raw[k] !== "" && dates[k] == null).map(k => ({ field: k, raw: raw[k] }));
  const out = {
    agency_id,
    // The cruise-line crew id, when the export carries it in its own column. Identity only —
    // deliberately absent from TRACK below, so it is never diffed or written as a field change.
    ship_crew_id: normKm(pick(row, ["ship crew id", "shipcrewid", "km id", "kmid", "keyman id"])),
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
  return { row: out, unparsed };
}
export function mapRow(row) { const r = mapRowFull(row); return r ? r.row : null; }

export function mapRows(rows) {
  const mapped = [], invalid = [], unparsed = [];
  for (const r of rows || []) {
    const m = mapRowFull(r);
    if (!m) { invalid.push(r); continue; }
    mapped.push(m.row);
    for (const u of m.unparsed) unparsed.push({ agency_id: m.row.agency_id, ...u });
  }
  return { mapped, invalidCount: invalid.length, unparsed };
}

const TRACK = ["first_name", "middle_name", "last_name", "status", "rank_observed",
  "vessel_observed", "dob", "province", "phone", "email",
  "med_exp", "sirb_exp", "pp_exp", "sch_exp", "usv_exp"];

// --- identity ---------------------------------------------------------------
// A crew member carries TWO ids: our agency id ("SC-0040010") and the cruise line's numeric
// crew id ("349195"). Matching on agency_id alone means a file row that arrives keyed on the
// cruise-line id looks brand new and is INSERTed as a second seafarer.
//
// That is not hypothetical. On 2026-09-06 an import did exactly this and created a duplicate
// "Ida Purnama / 349195" of the existing "Ida Bagus Made Purnama / SC-0040010" — whose row
// already carried ship_crew_id = 349195. The duplicate split her from her contract, her two
// ship legs and her baseline_count of 3, so scoring her under the new id would have started
// her bonus ladder at zero. Found and retired 2026-09-11.
//
// Prefer the agency id; fall back to the cruise-line id. Same prefer-then-fall-back shape as
// keymanimport.buildBridge.
// Index entries are { agency_id, row }: the id is carried alongside the row because callers
// pass maps whose row objects do not always repeat agency_id inside them (the map KEY is the
// id). Reading it off the row instead silently matched nothing for those callers.
function indexEntries(pairs) {
  const byAgency = {}, byShipCrewId = {};
  for (const [id, row] of pairs) {
    if (row == null || id == null) continue;
    const e = { agency_id: String(id), row };
    byAgency[e.agency_id] = e;
    const km = normKm(row.ship_crew_id);
    if (km && !byShipCrewId[km]) byShipCrewId[km] = e;   // first wins; a collision is data damage, not a merge rule
  }
  return { byAgency, byShipCrewId };
}
export function buildIdentityIndex(existingRows) {
  return indexEntries((existingRows || []).filter(r => r != null).map(r => [r.agency_id, r]));
}

// Accepts either an index (buildIdentityIndex) or the legacy agency_id -> row map, so every
// existing caller keeps working and simply gains the fallback.
function asIndex(x) {
  if (x && x.byAgency && x.byShipCrewId) return x;
  return indexEntries(Object.entries(x || {}).map(([k, r]) => [(r && r.agency_id != null) ? r.agency_id : k, r]));
}

// Resolve an incoming mapped row to an existing crew row. `via` records HOW we matched, so the
// review layer can show it — an id-based match is evidence a human can check, not a guess.
export function resolveExisting(m, index) {
  const idx = asIndex(index);
  const direct = idx.byAgency[String(m.agency_id)];
  if (direct) return { row: direct.row, agency_id: direct.agency_id, via: "agency_id" };
  // The export sometimes puts the cruise-line id in the crew-id column itself; try both.
  const km = normKm(m.ship_crew_id) || normKm(m.agency_id);
  if (km) {
    const e = idx.byShipCrewId[km];
    if (e) return { row: e.row, agency_id: e.agency_id, via: "ship_crew_id" };
  }
  return { row: null, agency_id: null, via: null };
}

// Diff incoming mapped rows vs the existing roster.
// New rows with an unknown/invalid status are flagged (status is NOT NULL + CHECK in D1).
// `rekeyed` = matched by cruise-line id under a DIFFERENT agency id. NEVER an auto-write of
// agency_id (it is the roster's stable key) — always a flag for a human (D7, CLAUDE.md §6).
export function diffCrew(incoming, existing) {
  const idx = asIndex(existing);
  const add = [], change = [], needsStatus = [], rekeyed = [];
  let unchanged = 0;
  for (const m of incoming || []) {
    const { row: ex, agency_id: exId, via } = resolveExisting(m, idx);
    if (!ex) {
      if (!m.status) { needsStatus.push(m.agency_id); continue; }
      add.push(m.agency_id);
      continue;
    }
    if (via === "ship_crew_id" && String(exId) !== String(m.agency_id)) {
      rekeyed.push({ agency_id: exId, incoming_id: m.agency_id, ship_crew_id: normKm(m.ship_crew_id) || normKm(m.agency_id) });
    }
    const changed = TRACK.filter(f => {
      const nv = m[f]; if (nv == null) return false;            // blank in source = don't clobber
      return String(nv) !== String(ex[f] == null ? "" : ex[f]);
    });
    // Key every change on the EXISTING agency id — never the id the file happened to use.
    // `incoming_id` is carried so the review layer can still find the incoming row.
    if (changed.length) {
      const entry = { agency_id: exId, changed };
      if (String(exId) !== String(m.agency_id)) entry.incoming_id = m.agency_id;
      change.push(entry);
    } else unchanged++;
  }
  return { add, change, unchanged, needsStatus, rekeyed, total: (incoming || []).length };
}
