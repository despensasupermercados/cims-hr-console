// src/earmark.js — THE EARMARK LOOP (Miguel, 7 Oct 2026).
//
// "Earmark is anybody that Rita places as a projection ... Joy will put that person as an earmark [in TDG].
//  ... we're all going to use the same terminology: all the projections, people who are not on board but
//  they're coming on board, we're going to call them earmarks. ... If there is any discrepancy in that
//  upload related to the earmark, you need to tell Rita ... either keep what she has already in the HR
//  console or accept the changes that are coming from the TDG software. ... If Rita rejects that import,
//  you need to send an email back to Joy and copy Rita ... so Joy can correct it in the TDG software."
//
// So an EARMARK is Rita's open card (an `assignment` with no actual sign-off) and TDG's "Earmarked" row is
// the same thing seen from TDG's side. Deploy (keyman_deploy.js) is the CTA that tells Joy. Each registry
// upload compares the two sides; what disagrees is listed here, row by row, for Rita to decide:
//   accept  TDG wins: a different hull moves the card there (her dates kept); Inactive / Not for Rehire
//           removes the card; an embark more than ABSORB_DAYS from the card's sign-on absorbs the card
//           (the file's row is the seat). Default — "follow the TDG file always".
//   keep    the console stands, and Joy gets ONE email per seafarer, Rita in copy, with everything CIMS
//           holds (the record, the earmark, the file's word) so she corrects TDG and Rita re-imports.
// TDG's Earmarked rows carry "-" for both dates, so a file can only disagree on the HULL or the STATUS;
// dates become checkable the day the crew embarks. A deployed earmark the next file still lacks is
// reported ("sent, not in TDG yet"), never emailed on its own: Joy may simply be late.
// Pure where it can be (earmarkDiscrepancies, the renderers); the loader and the sender are IO.
import { mastRows, M } from "./cims-mast.js";
import { documentLines, esc } from "./keyman_deploy.js";
import { normalizeStatus } from "./crewimport.js";
import { daysBetween, ABSORB_DAYS } from "./counter_sync.js";

export const TEMPLATE_ID = "hr.keyman.earmark_discrepancy.v1";
export const KINDS = ["hull", "other_person", "inactive", "not_aboard", "embark_date", "not_in_tdg"];

const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(0, 10) : null);
const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();
// How recent a DEBARKEDDATE on an ashore row still reads as "just signed off" (8 Oct 2026).
export const SIGNED_OFF_DAYS = 30;

// PURE. The earmarks the file disagrees with, and the deployed ones it does not carry yet.
//   projections : open assignments [{ id, sc, crew_name, ship, sign_on, planned_sign_off, deployed_at }]
//   registry    : the file's rows [{ agency_id, status, status_raw?, vessel_observed, embarked_at, run_at }]
//   today       : ISO date · shipOf: raw hull -> canonical name or null (the strict matcher)
// Returns { items } — every row is Rita's decision. not_in_tdg (7 Oct 2026, the Deploy CTA retired: "the logic is
// not like that no more") is a FUTURE earmark TDG does not carry yet: Rita tells Joy from the review ("Tell Joy"),
// holds it ("Not yet", the default — a plan she is not sure of must not reach Joy), or drops it. A told earmark
// carries told_at (assignment.deployed_at) so the next review says "told Joy on <date>, TDG still has no earmark".
// previous (8 Oct 2026): the file's rows from the LAST upload (registry_snapshot: agency_id, status, raw_status,
// vessel, debarked_at). A crew the last file had On board ANOTHER ship who is no longer aboard it in this file has
// just signed off: their earmark here is ready for TDG (signed_off, Tell Joy by default). A crew this file still
// has On board another ship is waiting: TDG cannot earmark a seafarer who is aboard elsewhere (waiting).
export function earmarkDiscrepancies({ projections, registry, today, shipOf, previous } = {}) {
  const of = typeof shipOf === "function" ? shipOf : (s) => (s == null || s === "" ? null : String(s).trim());
  const byId = {};
  for (const r of (registry || [])) if (r && r.agency_id) byId[String(r.agency_id).trim()] = r;
  const prevById = {};
  for (const r of (previous || [])) if (r && r.agency_id) prevById[String(r.agency_id).trim()] = r;
  // TDG's earmarks per hull (who the file earmarks where), and the crews holding a card per hull.
  const tdgMarks = {};
  for (const r of (registry || [])) {
    if (!r || !r.agency_id) continue;
    const st = r.status || normalizeStatus(r.status_raw) || null;
    const sh = st === "Earmarked" ? of(r.vessel_observed) : null;
    if (sh) (tdgMarks[norm(sh)] = tdgMarks[norm(sh)] || []).push({ sc: String(r.agency_id).trim(), name: r.name || null });
  }
  const carded = new Set();
  for (const p of (projections || [])) if (p && p.sc && p.ship) carded.add(String(p.sc).trim() + "|" + norm(of(p.ship) || p.ship));
  const items = [];
  for (const p of (projections || [])) {
    if (!p || !p.id || !p.sc || !p.ship) continue;
    const r = byId[String(p.sc).trim()];
    const cardShip = of(p.ship) || String(p.ship).trim();
    const signOn = day(p.sign_on);
    const aboard = !!(signOn && today && signOn <= today);
    const base = { id: p.id, sc: p.sc, crew_name: p.crew_name || null, ship: cardShip, sign_on: signOn, sign_off: day(p.planned_sign_off), aboard, deployed_at: day(p.deployed_at) };
    const status = r ? (r.status || normalizeStatus(r.status_raw) || null) : null;
    const fileShip = r ? of(r.vessel_observed) : null;
    // The staged rows carry no run_at (the file is being read): the file is dated today, like reconcileProjections.
    const fileAt = r ? (day(r.run_at) || today) : null;
    const embark = r ? day(r.embarked_at) : null;
    const sameShip = !!fileShip && norm(fileShip) === norm(cardShip);
    const file = { status, ship: fileShip || (r && r.vessel_observed ? String(r.vessel_observed) : null), embarked_at: embark, at: fileAt };
    // The file can only contradict what it could see (6 Oct 2026): a file dated BEFORE the card's sign-on
    // says nothing yet about an aboard card.
    const seen = aboard && !!fileAt && signOn < fileAt;
    let kind = null, text = null;
    if (status === "Inactive" || status === "Not for Rehire") {
      kind = "inactive"; text = "TDG file" + (fileAt ? " " + fileAt : "") + ": " + ((r && r.status_raw) || "Inactive") + " · your earmark for " + cardShip + (signOn ? " from " + signOn : "");
    } else if (status === "Earmarked" && fileShip && !sameShip) {
      kind = "hull"; text = "TDG file" + (fileAt ? " " + fileAt : "") + " earmarks them for " + fileShip + " · your earmark is for " + cardShip + (signOn ? " from " + signOn : "");
    } else if (status === "On board" && fileShip && !sameShip && seen) {
      kind = "hull"; text = "TDG file" + (fileAt ? " " + fileAt : "") + ": On board " + fileShip + " · your card has them aboard " + cardShip + " since " + signOn;
    } else if (status === "On board" && sameShip && embark && signOn && Math.abs(daysBetween(embark, signOn)) > ABSORB_DAYS) {
      kind = "embark_date"; text = "TDG file" + (fileAt ? " " + fileAt : "") + ": embarked " + cardShip + " on " + embark + " · your earmark says " + signOn;
    } else if ((status === "On Vacation" || status === "Reserved" || (status === "Earmarked" && !fileShip)) && seen) {
      kind = "not_aboard"; text = "TDG file" + (fileAt ? " " + fileAt : "") + ": " + ((r && r.status_raw) || status) + " · your card has them aboard " + cardShip + " since " + signOn;
    }
    if (kind) { items.push({ ...base, kind, file, text }); continue; }
    // ANOTHER PERSON (the case Miguel described: Rita earmarks X, Joy earmarks Y for the same ship): nothing about
    // THIS crew disagrees, but the file earmarks somebody else for this hull — somebody with no card of their own
    // there — and not Rita's crew. Only for a FUTURE earmark: an aboard card is the seat, not a plan.
    const myMark = status === "Earmarked" && sameShip;
    const others = (tdgMarks[norm(cardShip)] || []).filter((o) => o.sc !== String(p.sc).trim() && !carded.has(o.sc + "|" + norm(cardShip)));
    if (!aboard && !myMark && others.length) {
      const o = others[0];
      const at0 = day((byId[o.sc] || {}).run_at) || today;
      items.push({ ...base, kind: "other_person", file: { status: "Earmarked", ship: cardShip, embarked_at: null, at: at0, other: o }, text: "TDG file" + (at0 ? " " + at0 : "") + " earmarks " + (o.name || o.sc) + " for " + cardShip + " · your earmark there is " + (p.crew_name || p.sc) + (signOn ? " from " + signOn : "") });
      continue;
    }

    // NOT IN TDG YET: a future earmark the file neither earmarks nor seats on this hull (or a crew the file does
    // not carry at all). Rita's row: Tell Joy / Not yet / Drop mine. An aboard card is the seat, never this.
    if (!aboard && !(sameShip && (status === "Earmarked" || status === "On board"))) {
      const at0 = fileAt || today;
      const item = { ...base, kind: "not_in_tdg", told_at: base.deployed_at || null,
        file: r ? { status, ship: fileShip || (r.vessel_observed ? String(r.vessel_observed) : null), embarked_at: embark, at: at0 } : { status: null, ship: null, embarked_at: null, at: at0, absent: true },
        text: (base.deployed_at ? "Told Joy " + base.deployed_at + " · " : "") + "TDG file" + (at0 ? " " + at0 : "") + ": " + (r ? ((r.status_raw || status || "no status") + (fileShip ? ", " + fileShip : "")) : "not in the file") + " · no earmark for " + cardShip + " yet" };
      // Miguel, 8 Oct 2026: TDG cannot earmark a seafarer who is On board another ship, so CIMS holds the earmark;
      // "when that crew signs off, you will email Joy and CC Rita".
      const prev = prevById[String(p.sc).trim()];
      const prevStatus = prev ? (prev.status || normalizeStatus(prev.raw_status) || null) : null;
      const prevShip = prev ? of(prev.vessel) : null;
      if (status === "On board" && fileShip && !sameShip) {
        item.waiting = { ship: fileShip };
        item.text = "TDG file" + (at0 ? " " + at0 : "") + ": On board " + fileShip + " · TDG cannot earmark them for " + cardShip + " until they sign off — Joy is emailed when the file shows the sign-off";
      } else if (r && prevStatus === "On board" && prevShip && norm(prevShip) !== norm(cardShip) && !(status === "On board" && fileShip && norm(fileShip) === norm(prevShip))) {
        item.signed_off = { ship: prevShip, on: day(r.debarked_at) || null };
        item.text = "Signed off " + prevShip + (item.signed_off.on ? " on " + item.signed_off.on : "") + " per the TDG file " + at0 + " · your earmark for " + cardShip + (signOn ? " from " + signOn : "") + " is ready for TDG";
      } else if (r && (status === "On Vacation" || status === "Reserved") && fileShip && !sameShip && day(r.debarked_at) && (daysBetween(r.debarked_at, at0) ?? 999) >= 0 && daysBetween(r.debarked_at, at0) <= SIGNED_OFF_DAYS) {
        // The file alone says it too: ashore, debarked another ship within SIGNED_OFF_DAYS of the file's date (an
        // upload skipped, or a snapshot not kept yet, must not lose the sign-off).
        item.signed_off = { ship: fileShip, on: day(r.debarked_at) };
        item.text = "Signed off " + fileShip + (item.signed_off.on ? " on " + item.signed_off.on : "") + " per the TDG file " + at0 + " · your earmark for " + cardShip + (signOn ? " from " + signOn : "") + " is ready for TDG";
      }
      items.push(item);
    }
  }
  const order = (k) => KINDS.indexOf(k);
  items.sort((a, b) => order(a.kind) - order(b.kind) || String(a.ship).localeCompare(String(b.ship)) || String(a.sc).localeCompare(String(b.sc)));
  return { items, missing: [] };
}

// PURE. TDG earmarks the console has no card for: a file row Earmarked for a hull the console knows, for a
// crew with NO open card at all (a crew with a card on another hull is a discrepancy row above — Accept moves
// that card; two paths must not both act). Each becomes a console earmark on Apply (the same card Rita would
// have dragged: sign-on = the hull's current printer's projected sign-off, + 7 months).
// `exclude`: "sc|hull" pairs an other_person row already decides (Accept creates that card; Keep does not).
export function tdgEarmarksWithoutCard({ projections, registry, shipOf, exclude } = {}) {
  const of = typeof shipOf === "function" ? shipOf : (s) => (s == null || s === "" ? null : String(s).trim());
  const have = new Set();
  for (const p of (projections || [])) if (p && p.sc && p.ship) have.add(String(p.sc).trim());
  const skip = exclude instanceof Set ? exclude : new Set(exclude || []);
  const out = [];
  for (const r of (registry || [])) {
    if (!r || !r.agency_id) continue;
    const status = r.status || normalizeStatus(r.status_raw) || null;
    if (status !== "Earmarked") continue;
    const ship = of(r.vessel_observed);
    if (!ship) continue;
    if (have.has(String(r.agency_id).trim())) continue;
    if (skip.has(String(r.agency_id).trim() + "|" + norm(ship))) continue;
    out.push({ sc: String(r.agency_id).trim(), ship, name: r.name || null, at: day(r.run_at) });
  }
  return out;
}

// The one sentence the import screens print about the earmarks.
export function earmarkSummary({ kept = 0, accepted = 0, emails = 0, cards = 0, told = 0, held = 0, edited = 0 } = {}) {
  const n = (k, one, many) => (k === 1 ? "1 " + one : k + " " + many);
  const parts = [];
  if (accepted) parts.push(n(accepted, "earmark corrected to the TDG file", "earmarks corrected to the TDG file"));
  if (kept) parts.push(n(kept, "earmark kept as yours", "earmarks kept as yours") + (emails ? " (" + n(emails, "discrepancy email", "discrepancy emails") + " to Joy, Rita in copy)" : ""));
  if (edited) parts.push(n(edited, "earmark edited by Rita (Joy emailed the correction)", "earmarks edited by Rita (Joy emailed the corrections)"));
  if (told) parts.push(n(told, "earmark sent to Joy to enter in TDG", "earmarks sent to Joy to enter in TDG"));
  if (held) parts.push(n(held, "earmark not in TDG yet, held", "earmarks not in TDG yet, held"));
  if (cards) parts.push(n(cards, "TDG earmark given a card", "TDG earmarks given cards"));
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ *
 * IO: everything CIMS holds for the seafarer behind one earmark
 * ------------------------------------------------------------------ */
export async function loadEarmarkRecord(env, assignmentId) {
  const a = await env.DB.prepare(
    `SELECT a.id, a.sign_on, a.planned_sign_off, a.on_port_seed, a.off_port_seed, a.override_on_city, a.override_off_city,
            a.deployed_at, COALESCE(v.name, a.vessel_name) AS ship, v.brand AS brand,
            c.id AS crew_id, c.agency_id AS sc, c.ship_crew_id, c.first_name, c.last_name,
            COALESCE(NULLIF(o.rank_override,''), c.rank_override, c.rank_observed) AS rank,
            COALESCE(NULLIF(o.email,''), c.email) AS email, COALESCE(NULLIF(o.phone,''), c.phone) AS phone,
            COALESCE(NULLIF(o.dob,''), c.dob) AS dob, COALESCE(NULLIF(o.province,''), c.province) AS province,
            COALESCE(NULLIF(o.med_exp,''), c.med_exp) AS med_exp, COALESCE(NULLIF(o.sirb_exp,''), c.sirb_exp) AS sirb_exp,
            COALESCE(NULLIF(o.pp_exp,''), c.pp_exp) AS pp_exp, COALESCE(NULLIF(o.usv_exp,''), c.usv_exp) AS usv_exp,
            COALESCE(NULLIF(o.sch_exp,''), c.sch_exp) AS sch_exp, c.pp_no
       FROM assignment a
       JOIN contract k ON k.id = a.contract_id
       JOIN crew     c ON c.id = k.crew_id
       LEFT JOIN vessel v ON v.id = a.vessel_id
       LEFT JOIN crew_override o ON o.agency_id = c.agency_id
      WHERE a.id = ?`).bind(String(assignmentId)).first();
  return a || null;
}

/* ------------------------------------------------------------------ *
 * PURE: the email to Joy, Rita in copy (CIMS email standard: tables, inline styles, no gradient/rgba)
 * ------------------------------------------------------------------ */
const T = { ink: "#16293D", body: "#374151", mut: "#6B7280", border: "#E5E7EB", cloud: "#F3F4F6", red: "#96281B", redbg: "#F4E5E3", amber: "#B7791F", amberbg: "#F6EEE1", green: "#5FB946", greenink: "#3E7F2E" };
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";
const dash = (s) => (s == null || s === "" ? "—" : esc(s));
const KIND_WORD = {
  hull: "TDG names a different ship",
  other_person: "TDG earmarks a different seafarer for this ship",
  inactive: "TDG has the seafarer as Inactive / Not for Rehire",
  not_aboard: "TDG does not have the seafarer aboard",
  embark_date: "TDG's embark date differs from the earmark's sign-on",
  not_in_tdg: "TDG has no earmark yet for this seafarer on this ship",
  rejected: "CIMS does not plan this seafarer for this ship",
  signed_off: "the seafarer has signed off their last ship and can be earmarked in TDG now",
  edited: "Rita has corrected the CIMS earmark",
};
// What Joy is asked to do, by the mode the notice is sent in.
const MODE = {
  kept:   { title: "Earmark discrepancy", ask: "Rita has kept the CIMS earmark. Please correct TDG so the next export agrees; Rita is in copy and will re-import." },
  add:    { title: "Earmark for TDG", ask: "Please enter this earmark in TDG so the next export carries it; Rita is in copy and will re-import." },
  reject: { title: "Earmark not planned by CIMS", ask: "Please remove this earmark in TDG so the next export agrees; Rita is in copy and will re-import." },
  // 8 Oct 2026: the seafarer was On board another ship (TDG cannot earmark them there); the file now shows the sign-off.
  signed_off: { title: "Earmark for TDG", ask: "" },
  // 8 Oct 2026: Rita edited her earmark in the upload review instead of accepting the file or keeping hers as it was.
  edited: { title: "Earmark corrected by CIMS", ask: "Rita has corrected the CIMS earmark below. Please set TDG to match so the next export agrees; Rita is in copy and will re-import." },
};

// A crew's record without a card (a TDG earmark Rita rejects has no card of hers): the roster row with the
// manual corrections on top.
export async function loadCrewRecord(env, sc) {
  const c = await env.DB.prepare(
    `SELECT c.id AS crew_id, c.agency_id AS sc, c.ship_crew_id, c.first_name, c.last_name,
            COALESCE(NULLIF(o.rank_override,''), c.rank_override, c.rank_observed) AS rank,
            COALESCE(NULLIF(o.email,''), c.email) AS email, COALESCE(NULLIF(o.phone,''), c.phone) AS phone,
            COALESCE(NULLIF(o.dob,''), c.dob) AS dob, COALESCE(NULLIF(o.province,''), c.province) AS province,
            COALESCE(NULLIF(o.med_exp,''), c.med_exp) AS med_exp, COALESCE(NULLIF(o.sirb_exp,''), c.sirb_exp) AS sirb_exp,
            COALESCE(NULLIF(o.pp_exp,''), c.pp_exp) AS pp_exp, COALESCE(NULLIF(o.usv_exp,''), c.usv_exp) AS usv_exp,
            COALESCE(NULLIF(o.sch_exp,''), c.sch_exp) AS sch_exp, c.pp_no
       FROM crew c
       LEFT JOIN crew_override o ON o.agency_id = c.agency_id
      WHERE c.agency_id = ?`).bind(String(sc)).first();
  return c || null;
}

// record: loadEarmarkRecord / loadCrewRecord · item: one earmarkDiscrepancies row · today · mode: kept | add | reject
export function buildEarmarkNotice({ record, item, today, mode } = {}) {
  const r = record || {}, it = item || {};
  const m = MODE[mode] ? mode : "kept";
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || it.crew_name || r.sc || null;
  const ship = r.ship || it.ship || null, signOn = day(r.sign_on) || it.sign_on || null, signOff = day(r.planned_sign_off) || it.sign_off || null;
  const onCity = r.override_on_city || r.on_port_seed || null;
  const so = it.signed_off || null;
  let ask = MODE[m].ask, title = MODE[m].title;
  if (m === "signed_off") {
    title = "Earmark for TDG" + (so && so.ship ? " — signed off " + so.ship : "");
    ask = (name || "The seafarer") + " signed off " + ((so && so.ship) || "their last ship") + (so && so.on ? " on " + so.on : "") + ". Please earmark " + (name || "them") +
      " in TDG for " + (ship || "the ship below") + (signOn ? ", sign-on " + signOn + (onCity ? " (" + onCity + ")" : "") : "") + (signOff ? ", projected sign-off " + signOff : "") +
      " — as planned by CIMS. Rita is in copy and will re-import.";
  }
  // Documents against the PLANNED CONTRACT (8 Oct 2026): not valid = expired, missing, or expiring before the
  // planned sign-off; listed first so Joy sees what is missing before she enters the earmark.
  const docs = documentLines(r, today || day(new Date().toISOString())).map((d) => {
    const short = !!(d.exp && signOff && String(d.exp).slice(0, 10) < signOff && d.status !== "expired");
    const valid = !(d.status === "expired" || (d.status === "missing" && d.required) || short);
    return { ...d, before_off: short, valid, note: d.status === "expired" ? "expired" : (d.status === "missing" ? (d.required ? "missing" : "not held") : short ? "expires before the planned sign-off " + signOff : d.status === "expiring" ? "expires soon" : "valid") };
  });
  docs.sort((a, b) => (a.valid === b.valid ? 0 : a.valid ? 1 : -1));
  return {
    assignment_id: r.id || it.id || null, sc: r.sc || it.sc || null, ship_crew_id: r.ship_crew_id || null, name,
    rank: r.rank || null, email: r.email || null, phone: r.phone || null, dob: r.dob || null, province: r.province || null, pp_no: r.pp_no || null,
    earmark: { ship, brand: r.brand || null, sign_on: signOn, sign_off: signOff,
               on_city: onCity, off_city: r.override_off_city || r.off_port_seed || null, deployed_at: day(r.deployed_at) || it.deployed_at || null },
    kind: it.kind || null, kind_word: KIND_WORD[m === "signed_off" || m === "edited" ? m : it.kind] || "the TDG file disagrees with the earmark",
    mode: m, title, ask, signed_off: so,
    file: it.file || null, text: it.text || null,
    documents: docs,
    today: today || null,
  };
}

export function earmarkSubject(n) {
  const c = n || {};
  return (c.title || "Earmark discrepancy") + " — " + (c.name || c.sc || "seafarer") + " · " + ((c.earmark && c.earmark.ship) || "ship") + ((c.earmark && c.earmark.sign_on) ? " (" + c.earmark.sign_on + ")" : "");
}

const row = (label, value) =>
  '<tr><td style="padding:5px 0;font-family:' + FB + ';font-size:12px;color:' + T.mut + ';width:38%;">' + esc(label) +
  '</td><td style="padding:5px 0;font-family:' + FB + ';font-size:13px;color:' + T.ink + ';font-weight:600;">' + dash(value) + "</td></tr>";
const cell = (txt, bold) => '<td style="padding:7px 10px;border-top:1px solid ' + T.border + ';font-family:' + FB + ';font-size:13px;color:' + (bold ? T.ink : T.body) + ';' + (bold ? "font-weight:600;" : "") + '">' + txt + "</td>";

// The opening paragraph, by mode: only a KEPT discrepancy says the export "does not match".
function introOf(c) {
  const f = c.file || {};
  if (c.mode === "kept") return { lead: "The TDG export" + (f.at ? " of " + f.at : "") + " does not match what CIMS holds for this seafarer: ", word: c.kind_word, ask: c.ask || "" };
  if (c.mode === "signed_off" || c.mode === "edited") return { lead: "", word: "", ask: c.ask || "" };
  return { lead: "", word: c.kind_word ? c.kind_word.charAt(0).toUpperCase() + c.kind_word.slice(1) : "", ask: c.ask || "" };
}

// Miguel, 8 Oct 2026: "Put the not valid items first, the valid items second, and the bottom part following that."
export function renderEarmarkEmail(n, opts = {}) {
  const c = n || {}, e = c.earmark || {}, f = c.file || {};
  const toName = opts.toName || "Joy";
  const docs = c.documents || [];
  const bad = docs.filter((d) => d.valid === false), good = docs.filter((d) => d.valid !== false);
  const docRow = (d, color) => "<tr>" + cell(esc(d.doc) + (d.required ? "" : ' <span style="color:' + T.mut + ';font-size:11px;">(optional)</span>'), true) + cell(dash(d.exp)) +
    cell('<span style="font-family:' + FH + ';font-size:10px;font-weight:700;letter-spacing:.04em;color:' + color + ';">' + esc(String(d.note || d.status || "").toUpperCase()) + "</span>") + "</tr>";
  const head = (txt, color) => '<tr><td style="padding:14px 24px 4px;"><div style="font-family:' + FH + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + color + ';">' + esc(txt) + "</div></td></tr>";
  const table = (rows) => '<tr><td style="padding:0 24px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ' + T.border + ';">' + rows + "</table></td></tr>";
  const docBlock =
    head("Not valid — needs action (" + bad.length + ")", bad.length ? T.red : T.mut) +
    (bad.length ? table(bad.map((d) => docRow(d, T.red)).join("")) : '<tr><td style="padding:0 24px 6px;font-family:' + FB + ';font-size:13px;color:' + T.body + ';">None — every document on record is valid through the planned sign-off.</td></tr>') +
    head("Valid (" + good.length + ")", T.greenink) +
    (good.length ? table(good.map((d) => docRow(d, d.status === "expiring" ? T.amber : T.greenink)).join("")) : '<tr><td style="padding:0 24px 6px;font-family:' + FB + ';font-size:13px;color:' + T.body + ';">None on record.</td></tr>');
  const compare = "<tr>" + cell("", true) + cell('<b style="color:' + T.ink + ';">CIMS earmark</b>') + cell('<b style="color:' + T.ink + ';">TDG file' + (f.at ? " " + esc(f.at) : "") + "</b>") + "</tr>" +
    "<tr>" + cell("Status", true) + cell(c.mode === "reject" ? "Not planned" : "Earmarked") + cell(dash(f.status) + (f.other ? " · " + esc(f.other.name || f.other.sc) : "")) + "</tr>" +
    "<tr>" + cell("Ship", true) + cell(dash(e.ship)) + cell(dash(f.ship)) + "</tr>" +
    "<tr>" + cell("Sign on / embark", true) + cell(dash(e.sign_on) + (e.on_city ? " · " + esc(e.on_city) : "")) + cell(dash(f.embarked_at) + (f.embarked_at && f.ship && e.ship && norm(f.ship) !== norm(e.ship) ? " (" + esc(f.ship) + ")" : "")) + "</tr>" +
    "<tr>" + cell("Projected sign off", true) + cell(dash(e.sign_off) + (e.off_city ? " · " + esc(e.off_city) : "")) + cell("—") + "</tr>" +
    (c.signed_off ? "<tr>" + cell("Last ship", true) + cell("Signed off " + dash(c.signed_off.ship) + (c.signed_off.on ? " · " + esc(c.signed_off.on) : "")) + cell("—") + "</tr>" : "");
  const intro = introOf(c);
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:' + T.cloud + ';">' +
    '<div style="display:none;font-size:1px;color:' + T.cloud + ';max-height:0;overflow:hidden;">' + esc(c.kind_word) + " — " + esc(c.name || c.sc || "") + ", " + esc(e.ship || "") + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + T.cloud + '" style="background:' + T.cloud + ';"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:640px;background:#FFFFFF;">' +
    mastRows() +
    '<tr><td style="padding:22px 24px 6px;"><div style="font-family:' + FH + ';font-size:20px;font-weight:700;color:' + M.navy + ';line-height:1.25;">' + esc(c.title || "Earmark discrepancy") + '</div>' +
    '<div style="font-family:' + FB + ';font-size:14px;color:' + T.body + ';margin-top:8px;">Hi ' + esc(toName) + ',</div>' +
    '<div style="font-family:' + FB + ';font-size:14px;color:' + T.body + ';margin-top:8px;">' + esc(intro.lead) + (intro.word ? "<b>" + esc(intro.word) + "</b>. " : "") + esc(intro.ask) + "</div></td></tr>" +
    docBlock +
    '<tr><td style="padding:16px 24px 6px;"><div style="font-family:' + FH + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + T.mut + ';">Earmark</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ' + T.border + ';margin-top:4px;">' + compare + "</table></td></tr>" +
    '<tr><td style="padding:16px 24px 18px;"><div style="font-family:' + FH + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + T.mut + ';">Seafarer</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    row("Name", c.name) + row("Agency ID", c.sc) + row("Ship's Crew ID", c.ship_crew_id) + row("Rank", c.rank) + row("Passport no.", c.pp_no) + row("Date of birth", c.dob) + row("Province", c.province) +
    row("Contact", [c.email, c.phone].filter(Boolean).join(" · ")) + (e.deployed_at ? row("Earmark first sent to TDG", e.deployed_at) : "") +
    "</table></td></tr>" +
    '<tr><td style="padding:14px 24px 24px;border-top:1px solid ' + T.border + ';"><div style="font-family:' + FB + ';font-size:12px;color:' + T.mut + ';">Sent from the CIMS HR console' + (opts.sender ? " by " + esc(opts.sender) : "") + (c.today ? " on " + esc(c.today) : "") + ", from the CIMS Keyman board." + (c.mode === "reject" ? "" : " The earmark stands on the CIMS Keyman board.") + "</div></td></tr>" +
    "</table></td></tr></table></body></html>";
}

export function renderEarmarkText(n, opts = {}) {
  const c = n || {}, e = c.earmark || {}, f = c.file || {};
  const intro = introOf(c);
  const L = ["Hi " + (opts.toName || "Joy") + ",", "", intro.lead + (intro.word ? intro.word + ". " : "") + intro.ask, ""];
  const docs = c.documents || [];
  const bad = docs.filter((d) => d.valid === false), good = docs.filter((d) => d.valid !== false);
  L.push("NOT VALID — needs action (" + bad.length + "):");
  if (!bad.length) L.push("  none");
  for (const d of bad) L.push("  - " + d.doc + ": " + (d.exp || "not on record") + " [" + (d.note || d.status) + "]");
  L.push("", "VALID (" + good.length + "):");
  if (!good.length) L.push("  none");
  for (const d of good) L.push("  - " + d.doc + ": " + (d.exp || "not on record") + " [" + (d.note || d.status) + "]");
  L.push("", (c.mode === "reject" ? "CIMS: not planned for " : "CIMS earmark: ") + (e.ship || "—") + (c.mode === "reject" ? "" : " · sign on " + (e.sign_on || "—") + (e.on_city ? " (" + e.on_city + ")" : "") + " · projected sign off " + (e.sign_off || "—")));
  L.push("TDG file" + (f.at ? " " + f.at : "") + ": " + (f.status || "—") + (f.other ? " · " + (f.other.name || f.other.sc) : "") + (f.ship ? " · " + f.ship : "") + (f.embarked_at ? " · embarked " + f.embarked_at : ""));
  if (c.signed_off) L.push("Last ship: signed off " + (c.signed_off.ship || "—") + (c.signed_off.on ? " on " + c.signed_off.on : ""));
  L.push("", "Seafarer: " + (c.name || "—") + (c.sc ? " (" + c.sc + ")" : ""));
  if (c.ship_crew_id) L.push("Ship's Crew ID: " + c.ship_crew_id);
  if (c.rank) L.push("Rank: " + c.rank);
  if (c.pp_no) L.push("Passport no.: " + c.pp_no);
  if (c.dob) L.push("Date of birth: " + c.dob);
  const contact = [c.email, c.phone].filter(Boolean).join(" · ");
  if (contact) L.push("Contact: " + contact);
  return L.join("\n");
}
