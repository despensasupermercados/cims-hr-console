// src/keyman_deploy.js
// -----------------------------------------------------------------------------
// DEPLOY — the CTA on a yellow card.
//
// Miguel, 14 Sep 2026: "rita create projections .. and when she is sure .. cta is trigger to joy
// for action and the loop closes when u see it back in the keyman tab from the upload."
//
// So Deploy does exactly three things, in this order:
//   1. sends Joy at TDG one email carrying everything she needs to act: who, what day, what ship,
//      every document with its expiry, and what is still pending;
//   2. removes the projection from the board — it is TDG's now, not a plan;
//   3. writes a deploy_log row so the ship keeps one line saying it was sent, and so the card can
//      be put back with one click if it was sent by mistake.
// The loop closes on its own: when the next Contract Counter carries that seafarer they come back
// as a green card and the line disappears. Nothing here ever writes to crew or keyman_contract3.
//
// Expired documents are ALWAYS a warning and NEVER a block (Miguel: "expired required documents for
// that specific seafarer are always a warning"). They are shown on the preview and again in the
// email, because Joy is the one who can fix them.
//
// Recipient: DEPLOY_TO, else TG_NOTIFY (the same Joy the Update-TG loop writes to). Unset = refuse.
// Guessing a recipient for a crew-movement instruction is worse than not sending it.
// -----------------------------------------------------------------------------
import { mastRows, M } from "./cims-mast.js";
import { REQUIRED_DOCS, OPTIONAL_DOCS, docStatus } from "./compliance.js";

export const TEMPLATE_ID = "hr.keyman.deploy.v1";
const T = { ink: "#16293D", body: "#2F3F52", mut: "#6B7C93", border: "#D9E0E9", cloud: "#EEF2F7",
            red: "#B0342F", redbg: "#FBE7E6", amber: "#9A6410", amberbg: "#FBF0DA", green: "#1F7A3D", greenbg: "#EAF6E6" };
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";

export function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const dash = (s) => (s == null || s === "" ? "—" : esc(s));

/* ------------------------------------------------------------------ *
 * PURE: the card TDG is being asked to act on
 * ------------------------------------------------------------------ */
// Every document the console holds for this seafarer, with its expiry and where it stands.
// Required documents are listed even when missing — a blank passport expiry is the thing Joy
// most needs to see. Optional ones (Schengen) appear only when they exist.
export function documentLines(crew, today, warnDays = 60) {
  const out = [];
  for (const [label, field] of REQUIRED_DOCS) {
    const r = docStatus((crew || {})[field], today, warnDays);
    out.push({ doc: label, field, exp: (crew || {})[field] || null, status: r.status, days: r.days, required: true });
  }
  for (const [label, field] of OPTIONAL_DOCS) {
    const v = (crew || {})[field];
    if (!v) continue;
    const r = docStatus(v, today, warnDays);
    out.push({ doc: label, field, exp: v, status: r.status, days: r.days, required: false });
  }
  return out;
}

// The warnings that ride on the card and in the email. Expired first, then expiring, then missing.
// A warning never blocks the send.
export function deployWarnings(docs) {
  const rank = { expired: 0, missing: 1, expiring: 2 };
  return (docs || [])
    .filter((d) => d.status !== "ok")
    .map((d) => ({
      doc: d.doc, status: d.status, exp: d.exp, days: d.days, required: !!d.required,
      text: d.status === "expired" ? (d.doc + " expired" + (d.exp ? " on " + d.exp : "") + (d.days != null ? " (" + (-d.days) + " days ago)" : ""))
          : d.status === "missing" ? (d.doc + " has no expiry on record")
          : (d.doc + " expires " + (d.exp || "") + (d.days != null ? " (in " + d.days + " days)" : "")),
    }))
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (a.required === b.required ? 0 : a.required ? -1 : 1));
}

// What is ready and what is still open, in the words the board uses.
export function readinessLines(a) {
  a = a || {};
  return [
    { label: "ECCR", done: !!a.eccr },
    { label: "Air ticket", done: !!a.air },
    { label: "Hotel", done: !!a.hotel },
    { label: "Sign-on date confirmed", done: !!a.on_date_conf },
    { label: "Sign-off date confirmed", done: !!a.off_date_conf },
    { label: "Joining instructions sent", done: !!a.instructions_sent_at },
  ];
}

// assignment + crew + resolved ports -> the whole card, ready to render or store.
export function buildDeployCard({ assignment, crew, onCity, offCity, note, today, warnDays } = {}) {
  const a = assignment || {}, c = crew || {};
  const docs = documentLines(c, today, warnDays);
  return {
    assignment_id: a.id || null,
    sc: c.agency_id || a.sc || null,
    ship_crew_id: c.ship_crew_id || null,
    name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || a.crew_name || null,
    rank: c.rank_override || c.rank_observed || a.rank || null,
    ship: a.ship || a.vessel_name || null,
    brand: a.brand || null,
    role: a.role || "reliever",
    sign_on: a.sign_on || null,
    sign_off: a.planned_sign_off || null,
    on_city: onCity || a.on_port_seed || null,
    off_city: offCity || a.off_port_seed || null,
    email: c.email || null,
    phone: c.phone || null,
    dob: c.dob || null,
    province: c.province || null,
    documents: docs,
    warnings: deployWarnings(docs),
    readiness: readinessLines(a),
    note: note || null,
    today: today || null,
  };
}

/* ------------------------------------------------------------------ *
 * PURE: the email
 * ------------------------------------------------------------------ */
export function deploySubject(card) {
  const c = card || {};
  return "Crew deployment — " + (c.name || c.sc || "seafarer") + " → " + (c.ship || "ship") + (c.sign_on ? " (" + c.sign_on + ")" : "");
}

const CHIP = {
  expired: [T.red, T.redbg, "EXPIRED"],
  expiring: [T.amber, T.amberbg, "EXPIRES SOON"],
  missing: [T.amber, T.amberbg, "NOT ON RECORD"],
  ok: [T.green, T.greenbg, "VALID"],
};
const chip = (status) => {
  const [fg, bg, label] = CHIP[status] || CHIP.ok;
  return '<span style="font-family:' + FH + ';font-size:9px;font-weight:700;letter-spacing:.06em;color:' + fg + ';background:' + bg + ';padding:2px 7px;border-radius:5px;">' + label + "</span>";
};
const row = (label, value) =>
  '<tr><td style="padding:5px 0;font-family:' + FB + ';font-size:12px;color:' + T.mut + ';width:38%;">' + esc(label) +
  '</td><td style="padding:5px 0;font-family:' + FB + ';font-size:13px;color:' + T.ink + ';font-weight:600;">' + dash(value) + "</td></tr>";

export function renderDeployEmail(card, opts = {}) {
  const c = card || {};
  const toName = opts.toName || "Joy";
  const sender = opts.sender || null;
  const when = opts.sentAt || c.today || "";
  const warn = (c.warnings || []).filter((w) => w.status === "expired");
  const soon = (c.warnings || []).filter((w) => w.status !== "expired");

  const docRows = (c.documents || []).map((d) =>
    '<tr><td style="padding:7px 10px;border-top:1px solid ' + T.border + ';font-family:' + FB + ';font-size:13px;color:' + T.ink + ';">' + esc(d.doc) +
    (d.required ? "" : ' <span style="color:' + T.mut + ';font-size:11px;">(optional)</span>') +
    '</td><td style="padding:7px 10px;border-top:1px solid ' + T.border + ';font-family:' + FB + ';font-size:13px;color:' + T.body + ';">' + dash(d.exp) +
    '</td><td style="padding:7px 10px;border-top:1px solid ' + T.border + ';text-align:right;">' + chip(d.status) + "</td></tr>").join("");

  const readyRows = (c.readiness || []).map((r) =>
    '<tr><td style="padding:4px 0;font-family:' + FB + ';font-size:13px;color:' + T.ink + ';">' + esc(r.label) +
    '</td><td style="padding:4px 0;text-align:right;font-family:' + FH + ';font-size:10px;font-weight:700;letter-spacing:.05em;color:' +
    (r.done ? T.green : T.amber) + ';">' + (r.done ? "DONE" : "PENDING") + "</td></tr>").join("");

  const warnBlock = warn.length
    ? '<tr><td style="padding:0 24px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + T.redbg + '" style="background:' + T.redbg + ';border-left:3px solid ' + T.red + ';"><tr><td style="padding:12px 14px;font-family:' + FB + ';font-size:13px;color:' + T.ink + ';"><b style="color:' + T.red + ';">Expired document' + (warn.length === 1 ? "" : "s") + ' — please action before joining</b><br>' +
      warn.map((w) => esc(w.text)).join("<br>") + "</td></tr></table></td></tr>"
    : "";
  const soonBlock = soon.length
    ? '<tr><td style="padding:0 24px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + T.amberbg + '" style="background:' + T.amberbg + ';border-left:3px solid ' + T.amber + ';"><tr><td style="padding:12px 14px;font-family:' + FB + ';font-size:13px;color:' + T.ink + ';"><b style="color:' + T.amber + ';">Also worth checking</b><br>' +
      soon.map((w) => esc(w.text)).join("<br>") + "</td></tr></table></td></tr>"
    : "";
  const noteBlock = c.note
    ? '<tr><td style="padding:0 24px 18px;"><div style="font-family:' + FB + ';font-size:12px;color:' + T.mut + ';margin-bottom:4px;">Note from CIMS</div><div style="font-family:' + FB + ';font-size:13px;color:' + T.ink + ';">' + esc(c.note) + "</div></td></tr>"
    : "";

  return '<!doctype html><html><body style="margin:0;padding:0;background:' + T.cloud + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + T.cloud + '" style="background:' + T.cloud + ';"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:640px;max-width:640px;background:#FFFFFF;">' +
    mastRows() +
    '<tr><td style="padding:22px 24px 6px;"><div style="font-family:' + FH + ';font-size:20px;font-weight:700;color:' + M.navy + ';line-height:1.25;">Crew deployment</div>' +
    '<div style="font-family:' + FB + ';font-size:14px;color:' + T.body + ';margin-top:8px;">Hi ' + esc(toName) + ',</div>' +
    '<div style="font-family:' + FB + ';font-size:14px;color:' + T.body + ';margin-top:8px;">Please action the deployment below. Everything CIMS holds for this seafarer is listed; anything marked pending is still open at our end.</div></td></tr>' +
    '<tr><td style="padding:16px 24px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    row("Seafarer", c.name) + row("Agency ID", c.sc) + row("Ship's Crew ID", c.ship_crew_id) + row("Rank", c.rank) +
    row("Ship", (c.ship || "") + (c.brand ? " (" + c.brand + ")" : "")) +
    row("Sign on", (c.sign_on || "") + (c.on_city ? " · " + c.on_city : "")) +
    row("Projected sign off", (c.sign_off || "") + (c.off_city ? " · " + c.off_city : "")) +
    row("Contact", [c.email, c.phone].filter(Boolean).join(" · ")) +
    "</table></td></tr>" +
    warnBlock + soonBlock +
    '<tr><td style="padding:10px 24px 4px;"><div style="font-family:' + FH + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + T.mut + ';">Documents</div></td></tr>' +
    '<tr><td style="padding:0 24px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ' + T.border + ';">' + docRows + "</table></td></tr>" +
    '<tr><td style="padding:0 24px 4px;"><div style="font-family:' + FH + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + T.mut + ';">Status at CIMS</div></td></tr>' +
    '<tr><td style="padding:0 24px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + readyRows + "</table></td></tr>" +
    noteBlock +
    '<tr><td style="padding:14px 24px 24px;border-top:1px solid ' + T.border + ';"><div style="font-family:' + FB + ';font-size:12px;color:' + T.mut + ';">Sent from the CIMS HR console' +
    (sender ? " by " + esc(sender) : "") + (when ? " on " + esc(when) : "") +
    ". This deployment has been removed from our planning board and will reappear once it comes back in the Contract Counter.</div></td></tr>" +
    "</table></td></tr></table></body></html>";
}

// Plain-text alternative: the same facts, for a client that will not render HTML.
export function renderDeployText(card, opts = {}) {
  const c = card || {};
  const L = [];
  L.push("Hi " + (opts.toName || "Joy") + ",", "", "Please action the deployment below.", "");
  L.push("Seafarer: " + (c.name || "—") + (c.sc ? " (" + c.sc + ")" : ""));
  if (c.ship_crew_id) L.push("Ship's Crew ID: " + c.ship_crew_id);
  if (c.rank) L.push("Rank: " + c.rank);
  L.push("Ship: " + (c.ship || "—") + (c.brand ? " (" + c.brand + ")" : ""));
  L.push("Sign on: " + (c.sign_on || "—") + (c.on_city ? " · " + c.on_city : ""));
  L.push("Projected sign off: " + (c.sign_off || "—") + (c.off_city ? " · " + c.off_city : ""));
  L.push("", "Documents:");
  for (const d of (c.documents || [])) L.push("  - " + d.doc + ": " + (d.exp || "not on record") + " [" + d.status + "]");
  L.push("", "Status at CIMS:");
  for (const r of (c.readiness || [])) L.push("  - " + r.label + ": " + (r.done ? "done" : "PENDING"));
  if ((c.warnings || []).length) { L.push("", "Warnings:"); for (const w of c.warnings) L.push("  ! " + w.text); }
  if (c.note) L.push("", "Note from CIMS: " + c.note);
  return L.join("\n");
}

/* ------------------------------------------------------------------ *
 * Routes + IO
 * ------------------------------------------------------------------ */
// deps: { json, logActivity, sendViaMailer, removeReliefAssignment, saveReliefAssignment,
//         resolveCity, groupPortDays, TODAY }
export function installKeymanDeploy(deps) {
  const { json, logActivity, sendViaMailer, removeReliefAssignment, saveReliefAssignment, resolveCity, groupPortDays, TODAY } = deps;

  async function ensureDeployLog(env) {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS deploy_log (" +
      " id TEXT PRIMARY KEY, assignment_id TEXT, sc TEXT, crew_name TEXT, ship TEXT, brand TEXT," +
      " sign_on TEXT, sign_off TEXT, sent_at TEXT NOT NULL, sent_by TEXT, recipient TEXT, cc TEXT," +
      " email_id TEXT, payload TEXT, restored_at TEXT, restored_as TEXT )"
    ).run();
  }

  // Who the deployment goes to. DEPLOY_TO, else the Update-TG recipient (the same Joy). Never a
  // default: a crew-movement instruction sent to a guessed address is worse than not sending it.
  const recipientOf = (env) => env.DEPLOY_TO || env.TG_NOTIFY || null;
  const ccOf = (env) => {
    const raw = env.DEPLOY_CC != null ? env.DEPLOY_CC : "Rita.Berenyi@dg3.com";  // Miguel: "You can CC Rita."
    return String(raw).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  };

  // One wave: the projection, the seafarer behind it, that ship's itinerary and Rita's comment.
  async function loadCard(env, id) {
    const a = await env.DB.prepare(
      `SELECT a.id, a.role, a.sign_on, a.planned_sign_off, a.on_port_seed, a.off_port_seed,
              a.override_on_city, a.override_off_city, a.eccr, a.air, a.hotel,
              a.on_date_conf, a.off_date_conf, a.instructions_sent_at, a.signoff_link_sent_at,
              COALESCE(v.name, a.vessel_name) AS ship, v.brand AS brand,
              c.id AS crew_id, c.agency_id AS sc
         FROM assignment a
         JOIN contract k ON k.id = a.contract_id
         JOIN crew     c ON c.id = k.crew_id
         LEFT JOIN vessel v ON v.id = a.vessel_id
        WHERE a.id = ? AND a.actual_sign_off IS NULL`).bind(id).first();
    if (!a) return null;
    const [crew, ovr, pd, note] = await Promise.all([
      env.DB.prepare("SELECT agency_id, ship_crew_id, first_name, last_name, rank_observed, rank_override, email, phone, dob, province, med_exp, sirb_exp, pp_exp, usv_exp, sch_exp FROM crew WHERE id=?").bind(a.crew_id).first(),
      env.DB.prepare("SELECT first_name, last_name, rank_override, email, phone, dob, province, med_exp, sirb_exp, pp_exp, usv_exp, sch_exp FROM crew_override WHERE agency_id=?").bind(a.sc).first().catch(() => null),
      env.DB.prepare("SELECT brand, ship_short, berth_date, port_name, is_sea, is_turnaround FROM vessel_port_day WHERE ship_short=?").bind(a.ship || "").all().catch(() => ({ results: [] })),
      env.DB.prepare("SELECT note FROM crew_ready WHERE agency_id=?").bind(a.sc).first().catch(() => null),
    ]);
    // Rita's manual corrections WIN over the base crew row (imports COALESCE onto base, §11).
    const merged = { ...(crew || {}) };
    for (const k of Object.keys(ovr || {})) if (ovr[k] != null && ovr[k] !== "") merged[k] = ovr[k];
    const byShip = groupPortDays((pd && pd.results) || []);
    const list = byShip[(a.brand || "") + "|" + (a.ship || "")] || byShip[Object.keys(byShip).find((k) => k.endsWith("|" + a.ship)) || ""] || [];
    const on = resolveCity({ date: a.sign_on, seed: a.on_port_seed, override: a.override_on_city, portDays: list });
    const off = resolveCity({ date: a.planned_sign_off, seed: a.off_port_seed, override: a.override_off_city, portDays: list });
    const card = buildDeployCard({ assignment: a, crew: merged, onCity: on.city, offCity: off.city, note: note && note.note, today: TODAY() });
    return { a, card };
  }

  return async function handleDeploy(p, request, env, url, session) {
    if (!p.startsWith("/api/keyman/deploy")) return null;

    if (p === "/api/keyman/deploy/log" && request.method === "GET") {
      await ensureDeployLog(env);
      const { results } = await env.DB.prepare(
        "SELECT id, assignment_id, sc, crew_name, ship, brand, sign_on, sign_off, sent_at, sent_by, recipient FROM deploy_log WHERE restored_at IS NULL ORDER BY sent_at DESC LIMIT 200"
      ).all();
      return json({ sent: results || [] });
    }

    if (p === "/api/keyman/deploy/preview" && request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      if (!b.id) return json({ error: "id_required" }, 400);
      const loaded = await loadCard(env, String(b.id));
      if (!loaded) return json({ error: "not_found" }, 404);
      const to = recipientOf(env);
      return json({
        card: loaded.card, recipient: to, cc: ccOf(env), toName: env.TG_NOTIFY_NAME || "Joy",
        subject: deploySubject(loaded.card),
        html: renderDeployEmail(loaded.card, { toName: env.TG_NOTIFY_NAME || "Joy", sender: (session && session.email) || null, sentAt: TODAY() }),
      });
    }

    if (p === "/api/keyman/deploy/send" && request.method === "POST") {
      await ensureDeployLog(env);
      const b = await request.json().catch(() => ({}));
      if (!b.id) return json({ error: "id_required" }, 400);
      const to = recipientOf(env);
      if (!to) return json({ error: "no_recipient", detail: "Set DEPLOY_TO (or TG_NOTIFY) on the Worker. The console will not guess who to send a crew deployment to." }, 500);
      const loaded = await loadCard(env, String(b.id));
      if (!loaded) return json({ error: "not_found" }, 404);
      const card = loaded.card;
      if (b.note) card.note = String(b.note).slice(0, 2000);
      const cc = ccOf(env);
      const toName = env.TG_NOTIFY_NAME || "Joy";
      const sentBy = (session && session.email) || null;
      const res = await sendViaMailer(env, {
        templateId: TEMPLATE_ID, to: [to], cc,
        subject: deploySubject(card),
        html: renderDeployEmail(card, { toName, sender: sentBy, sentAt: TODAY() }),
        text: renderDeployText(card, { toName }),
        critical: true,   // a crew movement instruction: a silent failure is a seafarer nobody books
      });
      if (!res || res.ok === false) return json({ error: "send_failed", detail: (res && res.error) || "mailer refused" }, 502);
      // The email is out. Now, and only now, take the card off the board and record it.
      const logId = "dep_" + crypto.randomUUID();
      const stored = {
        card,
        assignment: {   // everything Restore needs to put the card back exactly as it was
          crew_id: loaded.a.crew_id, role: loaded.a.role || "reliever", vessel_name: loaded.a.ship,
          sign_on: loaded.a.sign_on, planned_sign_off: loaded.a.planned_sign_off,
          on_port_seed: loaded.a.on_port_seed, off_port_seed: loaded.a.off_port_seed,
          override_on_city: loaded.a.override_on_city, override_off_city: loaded.a.override_off_city,
          eccr: loaded.a.eccr, air: loaded.a.air, hotel: loaded.a.hotel,
          on_date_conf: loaded.a.on_date_conf, off_date_conf: loaded.a.off_date_conf,
        },
      };
      await env.DB.prepare(
        "INSERT INTO deploy_log (id,assignment_id,sc,crew_name,ship,brand,sign_on,sign_off,sent_at,sent_by,recipient,cc,email_id,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(logId, loaded.a.id, card.sc, card.name, card.ship, card.brand, card.sign_on, card.sign_off,
             new Date().toISOString(), sentBy, to, cc.join(", "), (res && (res.id || res.messageId)) || null, JSON.stringify(stored)).run();
      const removed = await removeReliefAssignment(env, loaded.a.id);
      await logActivity(env, sentBy, "keyman_deploy", (card.name || card.sc) + " -> " + (card.ship || "?") + " (" + to + ")");
      return json({ ok: true, logId, recipient: to, cc, removed: !!(removed && removed.ok), removeError: removed && removed.ok ? null : (removed && removed.error) || null });
    }

    if (p === "/api/keyman/deploy/restore" && request.method === "POST") {
      await ensureDeployLog(env);
      const b = await request.json().catch(() => ({}));
      if (!b.logId) return json({ error: "logId_required" }, 400);
      const r = await env.DB.prepare("SELECT id, payload, restored_at, crew_name, ship FROM deploy_log WHERE id=?").bind(String(b.logId)).first();
      if (!r) return json({ error: "not_found" }, 404);
      if (r.restored_at) return json({ error: "already_restored" }, 409);
      let stored = null;
      try { stored = JSON.parse(r.payload || "null"); } catch { stored = null; }
      if (!stored || !stored.assignment) return json({ error: "no_payload" }, 422);
      const saved = await saveReliefAssignment(env, stored.assignment);
      if (!saved || !saved.ok) return json({ error: "restore_failed", detail: (saved && saved.error) || "insert refused" }, 500);
      await env.DB.prepare("UPDATE deploy_log SET restored_at=?, restored_as=? WHERE id=?")
        .bind(new Date().toISOString(), saved.id, r.id).run();
      await logActivity(env, session && session.email, "keyman_deploy_restore", (r.crew_name || "?") + " -> " + (r.ship || "?"));
      return json({ ok: true, id: saved.id });
    }
    return null;
  };
}
