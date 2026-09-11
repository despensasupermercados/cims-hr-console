// src/tg_collect.js
// -----------------------------------------------------------------------------
// "Update TG" — PURE change collector + email renderer. No IO, fully testable.
//
// THE LOOP THIS SERVES (ratified 2026-08-17 by Miguel)
//   AdvancedQuery (owned by Joy at TG) --import--> crew tab = THE TRUTH
//   Rita adjusts the Keyman board (dates, ports, reassignments, relief slots)
//   -> those adjustments are NOT truth. They are a PENDING REQUEST.
//   -> Rita clicks "Update TG": every change since the last send is collected,
//      grouped BY SHIP, and emailed to Joy.
//   -> Joy updates AdvancedQuery. The next import brings it back. Loop closed.
//
// CIMS never writes to AdvancedQuery. A human does. That is the whole design.
//
// WHY BY SHIP: Joy works ship by ship. A flat crew list makes her cross-reference
// every row against a vessel; a per-ship block is the order she actually works in.
//
// WHAT THIS CANNOT DO (decided 2026-08-17): show "was X, now Y" for dates. Nothing
// records the previous value of a sign-on/sign-off. Vessel and status DO show both
// sides, because AdvancedQuery holds those fields so the base crew row IS the before.
// True before/after on dates needs a change-log table written at each save site.
// -----------------------------------------------------------------------------

import { mastRows } from "./cims-mast.js";

// ---- brand tokens (cims-email-standard section 3) ---------------------------
const T = {
  navy: "#1B3A5C", deep: "#142D48", green: "#5FB946", greenInk: "#3E7F2E",
  slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB", body: "#374151",
  amber: "#B7791F", grey: "#9CA3AF", sub: "#95A0AD",
};
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";
const FM = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
// 'YYYY-MM-DD' -> '17 Jul 2026'. Anything unparseable passes through untouched:
// a half-typed date must reach Joy verbatim, not silently become a wrong one.
export function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (!m) return s == null ? "" : String(s);
  const mi = +m[2] - 1;
  if (mi < 0 || mi > 11) return String(s);
  return `${m[3]} ${MO[mi]} ${m[1]}`;
}

// ---- ordering ---------------------------------------------------------------
// Within a ship: LEAVING before JOINING, so a handover pair reads in the order it
// happens. Everything else after, alphabetical, so the email is stable run to run
// (a diffable email is a reviewable email).
const KIND_RANK = { off: 0, on: 1, move: 2, flags: 3, add: 4, retire: 5 };
export const KIND_LABEL = { off: "LEAVING", on: "JOINING", move: "REASSIGNED", flags: "TRAVEL FLAGS", add: "NEW IN CIMS", retire: "RETIRED IN CIMS" };

// -----------------------------------------------------------------------------
// collectChanges — merge every source into one per-ship, per-crew structure.
//
// Sources (all already filtered to > watermark by the caller):
//   overrides       [{ agency_id, vessel_observed, status, rank_override, retired, updated_at }]
//   contractEdits   [{ sc, seq, ship, sign_on, sign_off, embark, disembark, eccr, air, hotel, updated_at }]
//   assignments     [{ agency_id, vessel_name, sign_on, planned_sign_off, updated_at }]
//   ready           [{ agency_id, eccr, air, hotel, note, updated_at }]
//   events          [{ agency_id, kind:'add'|'retire'|'move', ship?, at }]   (from activity_log)
//   crewById        { SC-x: { name, rank, status, vessel_observed } }   <- AdvancedQuery side
//   shipOf(v)       canonicaliser (vessel string -> short ship name)
//
// One crew member touched five ways appears ONCE with five detail rows. Repeating
// a name per-field is how a digest becomes unreadable.
// -----------------------------------------------------------------------------
export function collectChanges(input = {}) {
  const {
    overrides = [], contractEdits = [], assignments = [], ready = [], events = [],
    crewById = {}, shipOf = (v => v), brandOf = (() => ""), windowFrom = null,
  } = input;

  const byKey = new Map(); // "ship|sc" -> entry

  const nameOf = sc => (crewById[sc] && crewById[sc].name) || sc;
  const rankOf = sc => (crewById[sc] && crewById[sc].rank) || "";
  const aqOf = sc => {
    const c = crewById[sc];
    if (!c) return "not in AdvancedQuery";
    const st = c.status || "no status";
    const v = c.vessel_observed ? String(c.vessel_observed) : "no vessel";
    return `${st} · ${v}`;
  };

  function touch(rawShip, sc, kind) {
    const ship = (rawShip && shipOf(rawShip)) || (crewById[sc] && shipOf(crewById[sc].vessel_observed)) || "Unassigned";
    const key = ship + "|" + sc;
    let e = byKey.get(key);
    if (!e) {
      e = { ship, brand: brandOf(ship) || "", sc, nm: nameOf(sc), rank: rankOf(sc), kind, rows: [], aq: aqOf(sc), to: "", notes: [] };
      byKey.set(key, e);
    }
    // Strongest kind wins the badge: a sign-off is more informative than a flag edit.
    if (KIND_RANK[kind] < KIND_RANK[e.kind]) e.kind = kind;
    return e;
  }
  const addRow = (e, k, v) => { if (v != null && v !== "") e.rows.push([k, v]); };

  // --- relief board assignments: the reliever's leg -------------------------
  for (const a of assignments) {
    const e = touch(a.vessel_name, a.agency_id, "on");
    addRow(e, "Signs on", fmtDate(a.sign_on));
    addRow(e, "Contract to", fmtDate(a.planned_sign_off));
    e.to = `On board · ${e.ship}`;
    e.notes.push("Recorded on the relief board.");
  }

  // --- Keyman contract edits: dates + ports --------------------------------
  for (const ce of contractEdits) {
    const isOff = !!ce.sign_off;
    const e = touch(ce.ship, ce.sc, isOff ? "off" : "on");
    addRow(e, "Signs on", fmtDate(ce.sign_on));
    addRow(e, "Signs off", fmtDate(ce.sign_off));
    addRow(e, "Embark port", ce.embark);
    addRow(e, "Disembark port", ce.disembark);
    const flags = ["eccr", "air", "hotel"].filter(f => ce[f]).map(f => f.toUpperCase());
    if (flags.length) addRow(e, "Travel", flags.join(" · "));
    if (!e.to) e.to = isOff ? "On Vacation" : `On board · ${e.ship}`;
  }

  // --- manual overrides: reassignment / status / rank / retire --------------
  for (const o of overrides) {
    const kind = o.retired ? "retire" : (o.vessel_observed ? "move" : "flags");
    const e = touch(o.vessel_observed, o.agency_id, kind);
    if (o.vessel_observed) { addRow(e, "Reassigned to", shipOf(o.vessel_observed)); e.to = `On board · ${shipOf(o.vessel_observed)}`; }
    if (o.status) { addRow(e, "Status set to", o.status); e.to = e.to || o.status; }
    if (o.rank_override) addRow(e, "Rank set to", o.rank_override);
    if (o.retired) { addRow(e, "Marked", "Retired in CIMS"); e.to = "Retired"; }
  }

  // --- readiness flags -----------------------------------------------------
  for (const r of ready) {
    const e = touch(null, r.agency_id, "flags");
    const on = ["eccr", "air", "hotel"].filter(f => r[f]).map(f => f.toUpperCase());
    addRow(e, "Travel flags", on.length ? on.join(" · ") : "none set");
    if (r.note) e.notes.push(String(r.note));
    if (!e.to) e.to = "No AdvancedQuery change — FYI only";
  }

  // --- structural events (crew added / retired / dragged) -------------------
  for (const ev of events) {
    const e = touch(ev.ship, ev.agency_id, ev.kind);
    if (ev.kind === "add") { addRow(e, "Created in CIMS", fmtDate(ev.at)); e.to = "Add this crew member to AdvancedQuery"; }
    else if (ev.kind === "retire") { addRow(e, "Retired in CIMS", fmtDate(ev.at)); e.to = "Mark inactive in AdvancedQuery"; }
    else if (ev.kind === "move" && ev.ship) { addRow(e, "Moved on the board", fmtDate(ev.at)); e.to = e.to || `On board · ${shipOf(ev.ship)}`; }
  }

  // --- de-duplicate detail rows, keeping first occurrence ------------------
  for (const e of byKey.values()) {
    const seen = new Set();
    e.rows = e.rows.filter(([k, v]) => { const s = k + " " + v; if (seen.has(s)) return false; seen.add(s); return true; });
    e.note = e.notes.length ? Array.from(new Set(e.notes)).join(" ") : null;
    delete e.notes;
    if (!e.to) e.to = "Confirm against AdvancedQuery";
  }

  // --- group into ships ----------------------------------------------------
  const shipMap = new Map();
  for (const e of byKey.values()) {
    if (!shipMap.has(e.ship)) shipMap.set(e.ship, { ship: e.ship, brand: e.brand, crew: [] });
    shipMap.get(e.ship).crew.push(e);
  }
  const ships = Array.from(shipMap.values()).sort((a, b) => (a.ship < b.ship ? -1 : a.ship > b.ship ? 1 : 0));
  for (const s of ships) {
    s.crew.sort((a, b) => (KIND_RANK[a.kind] - KIND_RANK[b.kind]) || (a.nm < b.nm ? -1 : a.nm > b.nm ? 1 : 0));
  }

  const items = ships.reduce((n, s) => n + s.crew.reduce((m, c) => m + c.rows.length, 0), 0);
  return {
    windowFrom, ships,
    counts: { ships: ships.length, crew: byKey.size, items },
  };
}

// -----------------------------------------------------------------------------
// renderTgEmail — table-only, inline-styled, Outlook-safe (standard section 2):
// no linear-gradient, no rgba, every bgcolor paired with style:background.
// -----------------------------------------------------------------------------
const DOT = { on: T.green, off: T.amber, move: T.navy, flags: T.grey, add: T.greenInk, retire: T.amber };
const PILLBG = { on: "#EDF7E9", off: "#FBF3E3", move: "#EDF1F6", flags: T.cloud, add: "#EDF7E9", retire: "#FBF3E3" };
const PILLINK = { on: T.greenInk, off: T.amber, move: T.navy, flags: T.slate, add: T.greenInk, retire: T.amber };

function crewBlock(c, last) {
  const rows = c.rows.map(([k, v]) => `
      <tr>
        <td style="padding:2px 0;font-family:${FB};font-size:12px;color:${T.slate};width:136px;">${esc(k)}</td>
        <td style="padding:2px 0;font-family:${FB};font-size:12px;color:${T.body};font-weight:700;">${esc(v)}</td>
      </tr>`).join("");
  const note = c.note ? `
    <tr><td style="padding:8px 0 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.cloud}" style="background:${T.cloud};">
        <tr><td style="padding:8px 10px;font-family:${FB};font-size:11.5px;line-height:1.5;color:${T.slate};">${esc(c.note)}</td></tr>
      </table>
    </td></tr>` : "";
  return `
  <tr><td style="padding:14px 18px;${last ? "" : `border-bottom:1px solid ${T.border};`}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding-bottom:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="8" style="width:8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="8" height="8" bgcolor="${DOT[c.kind]}" style="width:8px;height:8px;background:${DOT[c.kind]};font-size:0;line-height:0;">&nbsp;</td></tr></table></td>
          <td style="padding-left:9px;font-family:${FB};font-size:15px;font-weight:700;color:${T.navy};">${esc(c.nm)}</td>
          <td style="padding-left:10px;font-family:${FM};font-size:11.5px;color:${T.slate};">${esc(c.sc)}</td>
          <td align="right"><span style="font-family:${FB};font-size:9px;font-weight:700;letter-spacing:1px;color:${PILLINK[c.kind]};background:${PILLBG[c.kind]};padding:3px 8px;">${KIND_LABEL[c.kind]}</span></td>
        </tr></table>
        ${c.rank ? `<div style="font-family:${FB};font-size:11.5px;color:${T.grey};padding:3px 0 0 17px;">${esc(c.rank)}</div>` : ""}
      </td></tr>
      <tr><td style="padding-left:17px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </td></tr>
      <tr><td style="padding:10px 0 0 17px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${T.border};"><tr>
          <td width="50%" bgcolor="#FFFFFF" style="width:50%;background:#FFFFFF;padding:9px 11px;border-right:1px solid ${T.border};">
            <div style="font-family:${FB};font-size:9px;font-weight:700;letter-spacing:.8px;color:${T.grey};padding-bottom:3px;">ADVANCEDQUERY NOW</div>
            <div style="font-family:${FB};font-size:12px;color:${T.slate};">${esc(c.aq)}</div>
          </td>
          <td width="50%" bgcolor="#FFFFFF" style="width:50%;background:#FFFFFF;padding:9px 11px;">
            <div style="font-family:${FB};font-size:9px;font-weight:700;letter-spacing:.8px;color:${T.greenInk};padding-bottom:3px;">PLEASE UPDATE TO</div>
            <div style="font-family:${FB};font-size:12px;color:${T.navy};font-weight:700;">${esc(c.to)}</div>
          </td>
        </tr></table>
      </td></tr>
      ${note}
    </table>
  </td></tr>`;
}

function shipBlock(s) {
  return `
<tr><td style="padding:0 24px 14px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${T.border};">
    <tr><td bgcolor="${T.navy}" style="background:${T.navy};padding:10px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${FH};font-size:14px;font-weight:700;letter-spacing:.3px;color:#FFFFFF;">${esc(s.ship)}</td>
        <td align="right" style="font-family:${FB};font-size:10px;font-weight:600;letter-spacing:.8px;color:${T.sub};">${s.brand ? esc(String(s.brand).toUpperCase()) + " &middot; " : ""}${s.crew.length} CREW</td>
      </tr></table>
    </td></tr>
    ${s.crew.map((c, i) => crewBlock(c, i === s.crew.length - 1)).join("")}
  </table>
</td></tr>`;
}

function stat(v, label, color) {
  return `<td width="33%" style="width:33%;padding:12px 14px;">
    <div style="font-family:${FH};font-size:20px;font-weight:700;color:${color};line-height:1;">${esc(v)}</div>
    <div style="font-family:${FB};font-size:10px;font-weight:600;letter-spacing:.8px;color:${T.slate};padding-top:3px;">${esc(label)}</div>
  </td>`;
}

export function renderTgEmail(payload, opts = {}) {
  const { ships = [], counts = { ships: 0, crew: 0, items: 0 }, windowFrom = null } = payload || {};
  const sentBy = opts.sentBy || "CIMS Crew Operations";
  const to = opts.toName || "Joy";
  const today = opts.today || "";
  const fromLabel = windowFrom ? fmtDate(windowFrom) : "the first recorded change";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>AdvancedQuery update request</title>
</head>
<body style="margin:0;padding:0;background:${T.cloud};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${counts.crew} crew across ${counts.ships} ships changed in CIMS since ${esc(fromLabel)}. Please update AdvancedQuery.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.cloud}" style="background:${T.cloud};">
 <tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:640px;max-width:640px;background:#FFFFFF;">
   ${mastRows()}
   <tr><td style="padding:24px 24px 4px 24px;">
     <div style="font-family:${FH};font-size:21px;font-weight:700;color:${T.navy};line-height:1.25;">AdvancedQuery update request</div>
     <div style="font-family:${FB};font-size:12.5px;color:${T.slate};padding-top:5px;">Crew changes recorded in CIMS &middot; ${esc(fromLabel)} &ndash; ${esc(fmtDate(today))}</div>
   </td></tr>
   <tr><td style="padding:16px 24px 4px 24px;font-family:${FB};font-size:14px;line-height:1.6;color:${T.body};">
     <p style="margin:0 0 12px 0;">Hi ${esc(to)},</p>
     <p style="margin:0 0 12px 0;">These are the crew movements recorded in CIMS since the last update. AdvancedQuery is our source of truth, so please apply these so the two systems agree.</p>
     <p style="margin:0;">Each ship is a separate block. For every crew member the left column is what AdvancedQuery holds today; the right column is what it should say.</p>
   </td></tr>
   <tr><td style="padding:16px 24px 4px 24px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.cloud}" style="background:${T.cloud};"><tr>
       ${stat(counts.ships, "SHIPS", T.navy)}${stat(counts.crew, "CREW", T.navy)}${stat(counts.items, "CHANGES", T.amber)}
     </tr></table>
   </td></tr>
   <tr><td style="padding:18px 24px 8px 24px;">
     <div style="font-family:${FB};font-size:10px;font-weight:700;letter-spacing:1.2px;color:${T.grey};">CHANGES BY SHIP</div>
   </td></tr>
   ${ships.map(shipBlock).join("")}
   <tr><td style="padding:6px 24px 24px 24px;border-top:1px solid ${T.border};">
     <div style="font-family:${FB};font-size:11px;line-height:1.65;color:${T.grey};padding-top:14px;">
       Generated from the CIMS Keyman board by <strong style="color:${T.slate};">${esc(sentBy)}</strong>${today ? " on " + esc(fmtDate(today)) : ""}.<br>
       Covers every change made since the previous update request. Reply to this email with any query.<br>
       DG3 Cruise Industry Managed Services &middot; Crew Operations.
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;
}
