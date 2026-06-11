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

export function normalizeDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && isFinite(v)) {
    // Excel serial date (epoch 1899-12-30)
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // M/D/YYYY (US)
  if (m) { const [_, a, b, y] = m; return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`; }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
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
  return {
    agency_id,
    first_name: pick(row, ["first name", "firstname", "given"]) || null,
    middle_name: pick(row, ["middle"]) || null,
    last_name: pick(row, ["last name", "lastname", "surname"]) || null,
    status: normalizeStatus(pick(row, ["status"])),
    rank_observed: pick(row, ["rank", "position", "rating"]) || null,
    vessel_observed: pick(row, ["vessel", "ship"]) || null,
    dob: normalizeDate(pick(row, ["date of birth", "birth", "dob"])),
    province: pick(row, ["province"]) || null,
    phone: pick(row, ["mobile", "phone", "cell", "contact no"]) || null,
    email: pick(row, ["email", "e-mail"]) || null,
    med_exp: normalizeDate(pick(row, ["medical"])),
    sirb_exp: normalizeDate(pick(row, ["seaman", "sirb", "seamans book", "seafarer"])),
    pp_exp: normalizeDate(pick(row, ["passport"])),
    sch_exp: normalizeDate(pick(row, ["schengen"])),
    usv_exp: normalizeDate(pick(row, ["us visa", "usvisa", "c1d", "c1/d", "usa visa", "american visa"])),
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
