// THE AUDITS BEFORE THE APP — the Forms survey "Printshop Audit", Sep 2024 to Sep 2026, 61 rows (Printshop_Audit1-61.xlsx,
// Miguel's export). Miguel, 20 Oct 2026, asked "The 61 old audits. Import the Forms survey into History?": "yes to all on
// the 5th point". Pure: the sheet's rows in, the records out; worker.js reads them, the session wrote them once.
//
// What it is, and what it is never:
//   - History, read on the audit app (History and the one-audit page). Kept in its own table, `audit_forms`.
//   - NEVER the Score Card. The bonus reads `audit_eval` only (§1, §10j: Dexter's audit replaced "Communication"); an
//     audit from the survey counting there would be a money change, and that is Miguel's to make, not an import's.
//   - The survey's own words, kept as typed. Nothing is re-scored: the score shown is the same rule as a filed audit
//     (`auditScore`: Overall, else the average of the three rounded down), for reading the list.
//
// Who the audit was on (§6, §10: "a wrong match is a false record on the wrong seafarer"): the survey has a free-text
// name ("Haziel", "Edward Guazon", "JHOCSON JEYUSON", "Sharene \ Karl") and no id. A row is placed on a crew only when
//   1. the typed name has a first name AND a surname and the travel name bridge (travel_match.js, the same rules the
//      Travel tab uses) finds exactly ONE crew on the roster, or
//   2. the schedule has exactly one crew aboard that hull on the audit's date whose first name the typed word agrees
//      with (a first name alone is never placed on the roster: a 2024 audit may be on someone no longer on it).
// Anything else keeps the name as typed, with no crew linked, and says why. Two names in one box are never split.
//
// The test rows are listed here by number, with the reason, and not imported (FORMS_TESTS).
import { matchTravelName, buildCrewIndex, fold } from "./travel_match.js";
import { SHIP_CODES } from "./ship_codes.js";
import { auditScore, rating, WORKSTATION, TOOLS } from "./audit_steps.js";

export const FORMS_SOURCE = "Forms survey · Printshop Audit (Sep 2024 – Sep 2026)";

// Read row by row on 20 Oct 2026. A row is a test when its ship is a test word, its boxes are keyboard filler, or every
// box carries the same pasted news article. Row 2's ship had not sailed yet and its feedback is Miguel's note on the form.
export const FORMS_TESTS = {
  1: "ship 'Test'",
  2: "a trial of the form: Star of the Seas had not sailed in Sep 2024, and the feedback is a note on the form itself",
  3: "a trial: every box reads 'asasa'",
  4: "ship 'test'",
  7: "a trial: every box reads 'asas'",
  8: "ship 'TEST'",
  9: "ship 'ABC Test'",
  10: "a trial: a news article pasted in every box",
  11: "a trial: a news article pasted in every box",
};

// The survey's column headers, read by their words (never by position: a survey can gain a question).
const COLS = {
  id: /^id$/i, started: /^start time/i, completed: /^completion time/i, date: /^date$/i, ship: /^ship$/i, crew: /^crew'?s name/i,
  contracts: /^number of contracts/i, folder: /^dg3 folder/i, onenote: /^one ?note/i, browser: /^internet browser/i,
  labels: /^was all hardware labeled/i, obp: /^obp with actual/i, repair: /^repair items not in obp/i,
  inv: /^inventory management \(1\)/i, invNote: /^inventory management \(2\)/i,
  tech: /^technical services \(1\)/i, techNote: /^technical services \(2\)/i,
  coll: /^customer collaterals inciden\w* \(1\)/i, collNote: /^customer collaterals inciden\w* \(2\)/i,
  hr: /^hr tdg: dispatch \/ arrival \(1\)/i, hrNote: /^hr tdg: dispatch \/ arrival \(2\)/i,
  tools: /^tools not on inventory/i, checks: /^machine status/i, overall: /^ship overall operation/i, feedback: /^reviewer feedback/i,
  files: /^upload file/i,
};
export function formsColumns(header) {
  const at = {};
  (header || []).forEach((h, i) => { const t = String(h == null ? "" : h).replace(/\s+/g, " ").trim(); for (const k in COLS) if (at[k] == null && COLS[k].test(t)) at[k] = i; });
  return at;
}

// The survey's desk checklist → the app's WORKSTATION keys (the app's list was drawn from this survey, audit_steps.js B1).
// A row lists what WAS ticked; what the app calls missing is the item not ticked. The MFD manuals are one item in the
// app, three boxes on the survey: all three ticked, or it is missing.
const DESK = [
  ["svc_prod", ["[prod] service manuals"]], ["parts_prod", ["[prod] parts manual (machine, pfu, finisher)"]], ["maint_prod", ["[prod] maintenance manual"]],
  ["mfd_manuals", ["[mfd] service manual", "[mfd] parts manual", "[mfd] maintenance manual"]], ["mfd_consumables", ["[mfd] consumables list"]],
  ["sops", ["sops [ordering, requesting & transferring parts]"]],
  ["ips", ["containing machine and controller ip's"]], ["contacts", ["dg3 shoreside contacts"]],
  ["bm_obp", ["onboard print"]], ["bm_zendesk", ["zendesk"]], ["bm_crunchtime", ["crunchtime"]], ["bm_fleet", ["fleet visitor request"]],
  ["bm_eccr", ["eccr request"]], ["bm_master", ["master loading \\ order schedule"]],
];
const opt = (s) => String(s || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const list = (v) => String(v == null ? "" : v).split(";").map((s) => s.trim()).filter(Boolean);
// `offered`: the boxes the form had on that day. The survey grew: "SOPs [Ordering, Requesting & Transferring Parts]" is
// first ticked on row 36 (5 May 2025) and on every row after it, so the 30 audits before it never had the box. An item
// the form did not offer is unknown, never "missing".
export function deskMissing(folder, onenote, browser, offered) {
  const ticked = new Set([folder, onenote, browser].flatMap(list).map(opt));
  if (!ticked.size) return null; // the desk was not answered: nothing to say, never "everything missing"
  return DESK.filter(([, need]) => (!offered || need.every((o) => offered.has(o))) && !need.every((o) => ticked.has(o))).map(([k]) => k);
}
// The box was on the form from the first row that ticked it (rows in the survey's own order, by its ID).
export function offeredFrom(body, at) {
  const first = {};
  const ordered = body.map((r) => ({ id: Number(String(r[at.id] || "").trim()), r })).filter((x) => x.id).sort((a, b) => a.id - b.id);
  for (const { id, r } of ordered) for (const c of ["folder", "onenote", "browser"]) if (at[c] != null) for (const o of list(r[at[c]]).map(opt)) if (first[o] == null) first[o] = id;
  return (form) => new Set(Object.keys(first).filter((o) => first[o] <= form));
}
// The survey's "Tools NOT on Inventory" → the app's TOOLS keys where the app kept the tool; the others keep the survey's words.
const TOOL_KEY = { "2-fiery back-up hdd": "fiery_hdd", "print driver thump drive": "thumb_drive", magnetizer: "magnetizer", "head lamp": "head_lamp" };
export function toolsMissing(v) { return list(v).map((s) => TOOL_KEY[opt(s)] || s); }

// "QS - Azamara", "CEL-SUMMIT", "Harmony of the Seas", "OY", "Celebrity - Eclispe" → the hull's short name, or null.
const HULLS = Object.keys(SHIP_CODES);
const BY_CODE = Object.fromEntries(Object.entries(SHIP_CODES).map(([w, c]) => [c, w]));
// Two hulls were typed misspelled on the survey; named here so the import never guesses at a near name.
const TYPOS = { eclispe: "eclipse", consellation: "constellation" };
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
export function formsShip(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const words = fold(s).replace(/[^a-z ]+/g, " ").split(" ").filter(Boolean);
  for (const w of words) { const t = TYPOS[w] || w; if (HULLS.includes(t)) return cap(t); }
  for (const tok of s.toUpperCase().split(/[^A-Z]+/)) if (tok.length === 2 && BY_CODE[tok]) return cap(BY_CODE[tok]);
  return null;
}

// "9/12/2024" → "2024-09-12"; anything else → null.
export function formsDate(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(v || "").trim());
  if (!m) return null;
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return y + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
}
const num = (v) => rating(v == null ? null : String(v).trim());
const text = (v) => { const t = String(v == null ? "" : v).replace(/\r/g, "").trim(); return t && !/^(na|n\/a|none)$/i.test(t) ? t : null; };

// Who the audit was on. legs: [{ sc, ship (short name), on, off }] — the schedule the caller holds; crew: the roster.
export function placeCrew(raw, ship, date, { crew = [], legs = [] } = {}) {
  const typed = String(raw || "").trim();
  if (!typed) return { sc: null, how: "none", why: "no name on the form" };
  if (/[\\\/&]|\band\b/i.test(typed)) return { sc: null, how: "none", why: "two names in one box" };
  const words = fold(typed).replace(/[^a-z ]+/g, " ").split(" ").filter(Boolean);
  // 2. the schedule that day: one crew aboard the hull whose first name agrees with the typed word(s)
  const aboard = ship && date ? legs.filter((l) => l && l.sc && fold(l.ship) === fold(ship) && l.on && l.on <= date && (!l.off || date <= l.off)) : [];
  const byId = Object.fromEntries(crew.map((c) => [c.agency_id, c]));
  const firstOf = (sc) => fold((byId[sc] && byId[sc].first_name) || "").replace(/[^a-z ]+/g, " ").split(" ").filter(Boolean);
  const lastOf = (sc) => fold((byId[sc] && byId[sc].last_name) || "").replace(/[^a-z ]+/g, " ").split(" ").filter(Boolean);
  const agrees = (sc) => words.every((w) => firstOf(sc).concat(lastOf(sc)).some((t) => t === w || (w.length >= 4 && t.startsWith(w))));
  const onBoard = [...new Set(aboard.map((l) => l.sc))].filter(agrees);
  if (onBoard.length === 1) return { sc: onBoard[0], how: "schedule", why: "aboard " + ship + " that day per the schedule, name agrees" };
  // 1. a full name on the roster
  if (words.length >= 2) {
    const m = matchTravelName(typed, buildCrewIndex(crew));
    if (m && m.agency_id) return { sc: m.agency_id, how: "name", why: "the full name, one crew on the roster" };
    if (m && m.how === "ambiguous") return { sc: null, how: "none", why: "the name fits " + m.candidates.length + " crew" };
  }
  if (onBoard.length > 1) return { sc: null, how: "none", why: "the name fits " + onBoard.length + " crew aboard that day" };
  return { sc: null, how: "none", why: words.length >= 2 ? "no crew on the roster by that name" : "a first name only, and no schedule for that day" };
}

// The sheet (2-D, header first) → { rows: records to keep, skipped: [{ form, why }], problems: [...] }.
export function readForms(sheet, deps = {}) {
  const [header, ...body] = sheet || [];
  const at = formsColumns(header);
  const need = ["id", "date", "ship", "inv", "tech", "coll"].filter((k) => at[k] == null);
  if (need.length) return { rows: [], skipped: [], problems: ["missing columns: " + need.join(", ")] };
  const get = (r, k) => (at[k] == null ? null : r[at[k]]);
  const rows = [], skipped = [], problems = [];
  const offered = offeredFrom(body.filter((r) => !FORMS_TESTS[Number(String(get(r, "id") || "").trim())]), at);
  for (const r of body) {
    const form = Number(String(get(r, "id") || "").trim());
    if (!form) continue;
    if (FORMS_TESTS[form]) { skipped.push({ form, why: FORMS_TESTS[form] }); continue; }
    const date = formsDate(get(r, "date")), ship = formsShip(get(r, "ship"));
    if (!date || !ship) { problems.push({ form, why: !date ? "date not readable: " + get(r, "date") : "ship not known: " + get(r, "ship") }); continue; }
    const ratings = { inventory: num(get(r, "inv")), technical: num(get(r, "tech")), collaterals: num(get(r, "coll")), dispatch: num(get(r, "hr")), overall: num(get(r, "overall")) };
    const sc = auditScore(ratings);
    const crewRaw = text(get(r, "crew"));
    const who = placeCrew(crewRaw, ship, date, deps);
    const person = who.sc && (deps.crew || []).find((c) => c.agency_id === who.sc);
    rows.push({
      id: "forms-" + form, form, date, ship, shipRaw: String(get(r, "ship") || "").trim(),
      crewRaw, sc: who.sc, crew: person ? [person.first_name, person.last_name].filter(Boolean).join(" ") : crewRaw, placed: who.how, placedWhy: who.why,
      contracts: text(get(r, "contracts")),
      ratings, score: sc.score, scoreFrom: sc.from,
      notes: { inventory: text(get(r, "invNote")), technical: text(get(r, "techNote")), collaterals: text(get(r, "collNote")), dispatch: text(get(r, "hrNote")),
        obp: text(get(r, "obp")), repair: text(get(r, "repair")), feedback: text(get(r, "feedback")) },
      labels: /^yes$/i.test(String(get(r, "labels") || "").trim()) ? true : /^no$/i.test(String(get(r, "labels") || "").trim()) ? false : null,
      deskMissing: deskMissing(get(r, "folder"), get(r, "onenote"), get(r, "browser"), offered(form)),
      tools: get(r, "tools") == null || String(get(r, "tools")).trim() === "" ? null : toolsMissing(get(r, "tools")),
      checks: list(get(r, "checks")),
      files: list(get(r, "files")).filter((u) => /^https:\/\//i.test(u)),
      started: text(get(r, "started")), completed: text(get(r, "completed")),
    });
  }
  return { rows, skipped, problems };
}

// The History row shape (audit_request.js history()), so the page reads a survey audit beside a filed one. `steps` false
// keeps "graded before the audit had steps" off it; `source` says where it came from.
export function formsHistoryRow(f) {
  return {
    id: f.id, source: "forms", ship: f.ship, sc: f.sc || null, crew: f.crew || null, filedAt: f.date, openedAt: null, filedBy: "Dexter (Forms survey)",
    ratings: f.ratings, score: f.score, from: f.scoreFrom, steps: false,
    missing: { ws: f.deskMissing || [], tools: f.tools || [], ppe: [] },
    repeat: {}, found: null, photos: 0, files: (f.files || []).length, followups: { open: 0, fixed: 0 },
  };
}

// The one statement that writes a record (the session ran it once, staging first). Every value is a bound parameter.
export const FORMS_INSERT_SQL = "INSERT OR IGNORE INTO audit_forms (id, form_no, audit_date, ship, normalized_ship, ship_raw, crew_raw, agency_id, crew_name, placed, placed_why, contracts_raw, r_inventory, r_technical, r_collaterals, r_dispatch, r_overall, score, score_from, notes_json, labels, desk_missing_json, tools_json, checks_json, files_json, started_raw, completed_raw, imported_at, imported_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
export function formsInsertParams(f, normShip, at, by) {
  const J = (v) => (v == null ? null : JSON.stringify(v));
  return [f.id, f.form, f.date, f.ship, normShip(f.ship), f.shipRaw, f.crewRaw, f.sc, f.crew, f.placed, f.placedWhy, f.contracts,
    f.ratings.inventory, f.ratings.technical, f.ratings.collaterals, f.ratings.dispatch, f.ratings.overall, f.score, f.scoreFrom,
    J(f.notes), f.labels == null ? null : f.labels ? 1 : 0, J(f.deskMissing), J(f.tools), J(f.checks), J(f.files), f.started, f.completed, at, by];
}
// A stored row → the record readForms returns (the reader's half of the same shape).
export function formsFromRow(r) {
  const P = (v) => { try { return v == null ? null : JSON.parse(v); } catch (e) { return null; } };
  return {
    id: r.id, form: r.form_no, date: r.audit_date, ship: r.ship, shipRaw: r.ship_raw, crewRaw: r.crew_raw, sc: r.agency_id || null, crew: r.crew_name || null,
    placed: r.placed, placedWhy: r.placed_why, contracts: r.contracts_raw,
    ratings: { inventory: r.r_inventory, technical: r.r_technical, collaterals: r.r_collaterals, dispatch: r.r_dispatch, overall: r.r_overall },
    score: r.score, scoreFrom: r.score_from, notes: P(r.notes_json) || {}, labels: r.labels == null ? null : !!r.labels,
    deskMissing: P(r.desk_missing_json), tools: P(r.tools_json), checks: P(r.checks_json) || [], files: P(r.files_json) || [],
  };
}
export { WORKSTATION, TOOLS };
