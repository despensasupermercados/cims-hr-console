// PRINTSHOP AUDIT — the pure rules (no I/O). docs/AUDIT_DESIGN.md + docs/AUDIT_BUILD_PLAN.md, 14 Oct 2026.
//
// What lives here is what a test can pin without a database: which host serves the audit, who a request is
// addressed to, what the seafarer may see on the count sheet (never the on-hand), when the gate opens, the blind
// count against OBP, the upload checks that need no reader. The routes (audit_routes.js) only fetch and store.
//
// NOTHING HERE IS MONEY (CLAUDE.md §1). The audit never imports bonus.js, never writes bonus_outcome, never feeds a
// contributor window or the supervisor evaluation. Pinned by test/audit_guards.test.js.

import { parseCount, AUDIT_RATINGS, GRADE_NOTE_MIN, rating, auditScore, gradeProblems } from "./audit_steps.js";
export { parseCount, AUDIT_RATINGS, GRADE_NOTE_MIN, rating, auditScore, gradeProblems };

export const AUDIT_HOST = "audit.cims.work";
export const REQUEST_HOURS = 24;   // Miguel, 14 Oct 2026: "about 24 hours"
export const REMIND_HOURS = 12;    // the first nudge, half-way
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024; // HON's own reader ceiling (P43_MAX_BYTES / MML_MAX_BYTES)

export const isAuditHost = (host) => String(host || "").toLowerCase().split(":")[0] === AUDIT_HOST;

// The shell lives at "/" on audit.cims.work and at "/audit" on cims.work. Everything under /api stays the API.
export function auditShellPath(host, path) {
  const p = String(path || "/");
  if (isAuditHost(host)) return !p.startsWith("/api/") && !p.startsWith("/auth/") && p !== "/login" && !p.startsWith("/audit/u") && !p.startsWith("/audit/sw.js") && !p.startsWith("/audit/manifest");
  return p === "/audit" || p === "/audit/";
}
export const auditBase = (host) => (isAuditHost(host) ? "/" : "/audit");

/* --------------------------------- names and dates --------------------------------- */
export const normShip = (s) => String(s || "").toLowerCase().replace(/^(celebrity|azamara|royal caribbean|norwegian)\s+/i, "") /* "Norwegian Getaway" = "Getaway" (20 Oct 2026) */
  .replace(/\bof the seas\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const iso = (d) => (d ? String(d).slice(0, 10) : null);
export function plusHours(at, h) { const t = Date.parse(at); return isNaN(t) ? null : new Date(t + h * 3600 * 1000).toISOString(); }
export function hoursLeft(dueAt, now) { const a = Date.parse(dueAt), b = Date.parse(now); return isNaN(a) || isNaN(b) ? null : Math.round((a - b) / 360000) / 10; }

// "3 completed · on contract 4": the contract number with DG3, from TDG's count (cumulativeContracts), never derived here.
export function contractLabel(completed, current) {
  const n = completed == null || completed === "" ? NaN : Number(completed);
  if (!Number.isFinite(n)) return current ? "On contract · count not on file" : "Count not on file";
  return n + " completed" + (current ? " · on contract " + (n + 1) : "");
}

/* --------------------------------- addressing --------------------------------- */
// Miguel, 14 Oct 2026: "use the ship email and his personal email .. u can display the ship email only .. his personal
// email gets a copy." The ship mailboxes are cims-timecard's ship_contact (Brain recPHlvv1wzYOEFzg): Royal
// printer_specialist @rccl.com, Celebrity printer @celebritycruises.com (55 rows at @celebrity.com, confirmed OK by
// Miguel 14 Oct), Azamara printer_manager @azamaraships.com. No ship mailbox = the request is BLOCKED and says why;
// a missing personal address only drops the copy.
export const SHIP_ROLE_ORDER = ["printer_specialist", "printer", "printer_manager"];
const emailOk = (e) => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(String(e || "").trim());

export function shipMailbox(contacts, ship) {
  const want = normShip(ship);
  const rows = (Array.isArray(contacts) ? contacts : []).filter((r) => r && normShip(r.ship) === want && emailOk(r.email));
  rows.sort((a, b) => rankRole(a.role) - rankRole(b.role));
  return rows.length ? String(rows[0].email).trim() : null;
}
const rankRole = (r) => { const i = SHIP_ROLE_ORDER.indexOf(String(r || "")); return i < 0 ? 99 : i; };

export function addressFor({ contacts, ship, personal }) {
  const box = shipMailbox(contacts, ship);
  const mine = emailOk(personal) ? String(personal).trim() : null;
  if (!box) return { ok: false, reason: "no_ship_mailbox", shown: null, to: [], cc: mine ? [mine] : [] };
  const cc = mine && mine.toLowerCase() !== box.toLowerCase() ? [mine] : [];
  return { ok: true, shown: box, to: [box], cc, noPersonal: !mine };
}

/* --------------------------------- the blind count --------------------------------- */
// Miguel, 14 Oct 2026: "display in the upload landing page all items the crew has available in the OBP portal .. so he
// can enter the total. dont show him what is on hand .. allow him to count blind and report." The sheet the crew
// sees is built ONLY from this function: part number, description, category. No quantity field leaves it, ever.
export function blindLines(obpLines) {
  const seen = new Set(), out = [];
  for (const l of Array.isArray(obpLines) ? obpLines : []) {
    const part = String((l && (l.part_number || l.part_no)) || "").trim();
    if (!part || seen.has(part)) continue;
    seen.add(part);
    out.push({ part_no: part, description: String(l.description || "").trim() || null, category: String(l.category || "").trim() || null });
  }
  out.sort((a, b) => String(a.category || "~").localeCompare(String(b.category || "~")) || a.part_no.localeCompare(b.part_no));
  return out;
}

// A count is a whole number, 0 included ("0 is a count"). Blank is not a count. (audit_steps.js makeRules, re-exported.)

export function countCompleteness(lines, counted) {
  const got = counted || {};
  const missing = (lines || []).filter((l) => parseCount(got[l.part_no]) == null).map((l) => l.part_no);
  return { total: (lines || []).length, done: (lines || []).length - missing.length, missing };
}

// The crew's blind count against OBP. Brain recCJuYi54i9HAor9 (1 Oct 2026): a one-unit gap on a part OBP moved the
// day of the count (or the day before) is TIMING — a consumption not yet booked — and is named as such, not as a
// discrepancy; it is a discrepancy only if it does not close the next day.
export function countDiff(obpLines, counted, countDate) {
  const by = {};
  for (const l of Array.isArray(obpLines) ? obpLines : []) {
    const k = String((l && (l.part_number || l.part_no)) || "").trim();
    if (k) by[k] = l;
  }
  const rows = [];
  for (const [part, raw] of Object.entries(counted || {})) {
    const n = parseCount(raw);
    const l = by[part];
    if (n == null || !l) continue;
    const obp = Number(l.on_hand);
    if (!Number.isFinite(obp)) continue;
    const diff = n - obp;
    if (!diff) continue;
    const moved = iso(l.update_date);
    const near = moved && countDate && Math.abs((Date.parse(countDate) - Date.parse(moved)) / 86400000) <= 1;
    rows.push({ part_no: part, description: l.description || null, obp, counted: n, diff, kind: Math.abs(diff) === 1 && near ? "timing" : "gap", obpMoved: moved });
  }
  rows.sort((a, b) => (a.kind === b.kind ? Math.abs(b.diff) - Math.abs(a.diff) : a.kind === "gap" ? -1 : 1));
  return rows;
}

/* --------------------------------- uploads --------------------------------- */
// The checks that need no reader. Whether a bundle has twelve pages and every colour, and which of the three
// Management List documents arrived, is HON's reader's answer (PR G), not a guess here.
export const UPLOAD_KINDS = { p43: "Pattern 43", mgmt: "Management List", photo: "Photo" };
const OK_TYPES = /^(application\/pdf|image\/(jpeg|png|heic|heif|webp))$/i;
export function checkUpload({ kind, type, size, name }) {
  if (!UPLOAD_KINDS[kind]) return { ok: false, reason: "unknown_kind" };
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "empty", say: "The file is empty. Scan it again." };
  if (n > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_big", say: "The file is " + Math.round(n / 1048576) + " MB; the limit is " + Math.round(MAX_UPLOAD_BYTES / 1048576) + " MB. Scan at a lower resolution." };
  const t = String(type || "").trim() || guessType(name);
  if (!OK_TYPES.test(t)) return { ok: false, reason: "type", say: "Send a PDF or a photo." };
  if (kind === "photo" && !/^image\//i.test(t)) return { ok: false, reason: "type", say: "A photo, please." };
  return { ok: true, type: t };
}
function guessType(name) {
  const e = String(name || "").toLowerCase().split(".").pop();
  return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", webp: "image/webp" }[e] || "";
}
export const safeName = (s) => String(s || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";

/* --------------------------------- the gate --------------------------------- */
// Miguel, 14 Oct 2026: "without that completion, I don't want him to start the audit." No override, not even his
// (decision 13, open in round 2 only as a confirmation). The gate opens when EVERY press on the register has either
// both documents in — and READ, once the reader is wired (PR G) — or is reported down with a reason, AND every OBP
// line has a count. Anything short of that is listed, line by line, so Dexter and the crew see the same list.
// A seafarer the board has aboard a ship NOW: TDG's On board seat, dated or not. A seat with no embark date yet ("No
// contract dates yet") is still aboard per the file — it used to read "Nobody aboard" and was refused a request.
// THE OPEN REQUEST, one definition (Miguel, 20 Oct 2026: "we do 1 person at the time per ship"). A request is open from
// its draft until it is graded: draft, sent, or in (complete) and not graded yet. A TEST request is open while it waits and
// finished once in (it cannot be graded, §10i). While one is open on a ship, no request is made on that ship for anyone;
// the next is asked once it is graded or cancelled. The SQL reads `audit_request r LEFT JOIN audit_eval e ON e.request_id
// = r.id`; the JS reads a row carrying the eval's score as `grade`.
export const OPEN_REQ_SQL = "(r.status IN ('draft','sent') OR (r.status = 'complete' AND e.request_id IS NULL AND COALESCE(r.test_mode, 0) = 0))";
export const SHIP_OPEN_SQL = "SELECT r.id, r.agency_id, r.crew_name, r.status FROM audit_request r LEFT JOIN audit_eval e ON e.request_id = r.id WHERE r.normalized_ship = ? AND " + OPEN_REQ_SQL + " ORDER BY r.created_at DESC LIMIT 1";
export const isOpenRequest = (r) => !!r && (r.status === "draft" || r.status === "sent" || (r.status === "complete" && r.grade == null && !r.test_mode));

export const aboardNow = (c) => !!(c && c.current && (c.aboard || !c.signOn));

export function gateState({ request, machines, uploads, down, lines, counted, requireRead = true }) {
  const missing = [];
  if (!request || request.status === "cancelled") return { open: false, missing: [{ what: "request", say: "No request sent." }] };
  const ups = (uploads || []).filter((u) => u && !u.superseded_at);
  const downBy = {};
  for (const d of down || []) if (d && d.serial && String(d.reason || "").trim()) downBy[d.serial] = d;
  for (const m of machines || []) {
    if (downBy[m.serial]) continue;
    for (const kind of ["p43", "mgmt"]) {
      const u = ups.filter((x) => x.serial === m.serial && x.kind === kind).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
      const label = (m.label || m.serial) + " · " + UPLOAD_KINDS[kind];
      if (!u) missing.push({ what: kind, serial: m.serial, say: label + " not sent" });
      else if (requireRead && u.read_state !== "ok") missing.push({ what: kind, serial: m.serial, say: label + (u.read_state === "pending" || !u.read_state ? " not read yet" : " needs a new file") });
    }
  }
  const c = countCompleteness(lines, counted);
  if (c.missing.length) missing.push({ what: "count", say: c.missing.length + " of " + c.total + " parts not counted" });
  return { open: missing.length === 0, missing, count: c };
}

/* --------------------------------- the audit grade --------------------------------- */
// The grade rules (AUDIT_RATINGS, GRADE_NOTE_MIN, rating, auditScore, gradeProblems) live in audit_steps.js makeRules
// since 19 Oct 2026, unchanged, so the audit page and the server run ONE definition; re-exported here for every importer.
