// ============================================================================
// CIMS - Sign-off INSTRUCTIONS (Email 1)  ·  self-contained module
// ============================================================================
// Front of the hand-over workflow: the seafarer gets their pre-departure
// instructions ~14 days out; the "I have read and understood" button records
// the acknowledgement (date/time) and notifies onboardsupport.
//
// USAGE (src/worker.js): import { installInstr } from "./signoff_instructions.js";
//   inside fetch(request, env), AFTER  const session = await getSession(request, env);  add:
//   { const _i = await installInstr({ json, htmlResponse, signToken, verifyToken, sha256hex,
//       logActivity, applyOverride, VESSEL_REF })(url.pathname, request, env, url, session);
//     if (_i) return _i; }
// Env INSTR_NOTIFY (default onboardsupport@dg3.com).
// ============================================================================

export function installInstr(deps) {
  const { json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF } = deps;

  var INSTR_TTL = 60 * 60 * 24 * 45; // 45 days (email goes ~14d before sign-off)

  async function ensureInstr(env) {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS instr_ack (" +
      " id TEXT PRIMARY KEY, sc TEXT NOT NULL, seq INTEGER NOT NULL, crew_id TEXT," +
      " token_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'," +
      " crew_name TEXT, vessel TEXT, port TEXT, sign_off_date TEXT," +
      " requested_by TEXT, requested_at TEXT NOT NULL," +
      " ack_at TEXT, ack_ip TEXT, ack_ua TEXT, UNIQUE (sc, seq) )"
    ).run();
  }

  function instrEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // Fill {{field}} placeholders (HTML-escaped); acknowledgment_url is a URL -> inserted raw.
  function instrFill(tpl, map) {
    var out = tpl;
    if (map.acknowledgment_url != null) out = out.split("{{acknowledgment_url}}").join(map.acknowledgment_url);
    return out.replace(/\{\{(\w+)\}\}/g, function (_, k) {
      return map[k] != null ? instrEsc(map[k]) : "";
    });
  }

  function instrNormShip(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function instrHomeport(ship) {
    var n = instrNormShip(ship);
    if (!n) return null;
    for (var i = 0; i < VESSEL_REF.length; i++) if (instrNormShip(VESSEL_REF[i].name) === n) return VESSEL_REF[i].homeport || null;
    for (var j = 0; j < VESSEL_REF.length; j++) { var rn = instrNormShip(VESSEL_REF[j].name); if (rn && n.indexOf(rn) >= 0) return VESSEL_REF[j].homeport || null; }
    return null;
  }

  // Same resolution the sign-off ack uses: crew name/email, vessel, sign-off date, port.
  async function resolveInstr(env, sc, seq) {
    var leg = await env.DB.prepare("SELECT sc, seq, ship, proj_off, act_off FROM keyman_contract3 WHERE sc=? AND seq=?").bind(sc, seq).first();
    if (!leg) return null;
    var ed = (await env.DB.prepare("SELECT ship, sign_off, disembark FROM contract_edit WHERE sc=? AND seq=?").bind(sc, seq).first()) || {};
    var base = await env.DB.prepare("SELECT * FROM crew WHERE agency_id=?").bind(sc).first();
    var ov = await env.DB.prepare("SELECT * FROM crew_override WHERE agency_id=?").bind(sc).first();
    var c = base ? applyOverride(base, ov) : {};
    var vessel = ed.ship || leg.ship || null;
    var sign_off = ed.sign_off || leg.act_off || leg.proj_off || null;
    var port = ed.disembark || instrHomeport(vessel);
    var name = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ").trim();
    return { sc: sc, seq: seq, crew_id: base ? base.id : null, crew_name: name, email: c.email || null, vessel: vessel, port: port, sign_off_date: sign_off };
  }

  // POST /api/instructions/request  (session-gated) — issue the instructions email
  async function apiInstrRequest(request, env, session) {
    await ensureInstr(env);
    var b = await request.json().catch(function () { return {}; });
    if (!b.sc || b.seq == null) return json({ error: "missing_sc_seq" }, 400);
    var r = await resolveInstr(env, String(b.sc), parseInt(b.seq));
    if (!r) return json({ error: "signoff_not_found" }, 404);
    var token = await signToken({ p: "instr", sc: r.sc, seq: r.seq, exp: Math.floor(Date.now() / 1000) + INSTR_TTL }, env.SESSION_SECRET);
    var th = await sha256hex(token);
    var now = new Date().toISOString();
    await env.DB.prepare("DELETE FROM instr_ack WHERE sc=? AND seq=?").bind(r.sc, r.seq).run();
    await env.DB.prepare("INSERT INTO instr_ack (id,sc,seq,crew_id,token_hash,status,crew_name,vessel,port,sign_off_date,requested_by,requested_at) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?)")
      .bind("ins_" + crypto.randomUUID(), r.sc, r.seq, r.crew_id, th, r.crew_name, r.vessel, r.port, r.sign_off_date, (session && session.email) || null, now).run();
    var link = new URL(request.url).origin + "/instr?t=" + token;
    var emailed = false;
    if (b.send && r.email) {
      try { await sendInstructions(env, { to: r.email, specialist_name: r.crew_name, sign_off_date: r.sign_off_date, port: r.port, link: link }); emailed = true; }
      catch (e) { await logActivity(env, session && session.email, "instr_send_failed", r.sc + " #" + r.seq); }
    }
    await logActivity(env, session && session.email, "instr_request", r.sc + " #" + r.seq);
    return json({ ok: true, link: link, crew_name: r.crew_name, emailed: emailed, hasEmail: !!r.email });
  }

  // GET /api/instr/form?t=  (PUBLIC, token) — snapshot for the landing page
  async function apiInstrForm(env, url) {
    await ensureInstr(env);
    var t = url.searchParams.get("t");
    var p = await verifyToken(t, env.SESSION_SECRET);
    if (!p || p.p !== "instr") return json({ error: "invalid_or_expired" }, 401);
    var th = await sha256hex(t);
    var row = await env.DB.prepare("SELECT status, crew_name, vessel, sign_off_date, ack_at FROM instr_ack WHERE token_hash=?").bind(th).first();
    if (!row) return json({ error: "revoked" }, 401);
    return json({ ok: true, crew_name: row.crew_name, vessel: row.vessel, sign_off_date: row.sign_off_date, status: row.status, locked: row.status !== "pending", ack_at: row.ack_at || null });
  }

  // POST /api/instr/submit  (PUBLIC, token) — record the acknowledgement
  async function apiInstrSubmit(request, env) {
    await ensureInstr(env);
    var b = await request.json().catch(function () { return {}; });
    var p = await verifyToken(b.t, env.SESSION_SECRET);
    if (!p || p.p !== "instr") return json({ error: "invalid_or_expired" }, 401);
    var th = await sha256hex(b.t);
    var row = await env.DB.prepare("SELECT * FROM instr_ack WHERE token_hash=?").bind(th).first();
    if (!row) return json({ error: "revoked" }, 401);
    if (row.status === "acknowledged") return json({ ok: true, already: true, crew_name: row.crew_name, ack_at: row.ack_at }, 200);
    var now = new Date().toISOString();
    await env.DB.prepare("UPDATE instr_ack SET status='acknowledged', ack_at=?, ack_ip=?, ack_ua=? WHERE token_hash=?")
      .bind(now, request.headers.get("cf-connecting-ip") || null, request.headers.get("user-agent") || null, th).run();
    try {
      await sendInstrConfirmation(env, { crew_name: row.crew_name, agency_id: row.sc, vessel: row.vessel, sign_off_date: row.sign_off_date, port: row.port, acknowledged_at: now });
    } catch (e) {
      await logActivity(env, null, "instr_confirm_send_failed", row.sc + " #" + row.seq);
    }
    await logActivity(env, null, "instr_ack", row.sc + " #" + row.seq);
    return json({ ok: true, crew_name: row.crew_name, ack_at: now });
  }

  async function sendInstructions(env, o) {
    if (!env.RESEND_API_KEY) throw new Error("no_mailer");
    var html = instrFill(INSTR_EMAIL, { specialist_name: o.specialist_name, sign_off_date: o.sign_off_date, port: o.port, acknowledgment_url: o.link });
    var r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "CIMS <onboarding@resend.dev>", to: [o.to], subject: "Sign-Off Instructions — " + (o.port || "") + " " + (o.sign_off_date || ""), html: html })
    });
    if (!r.ok) throw new Error("resend_" + r.status);
  }

  async function sendInstrConfirmation(env, o) {
    if (!env.RESEND_API_KEY) throw new Error("no_mailer");
    var to = env.INSTR_NOTIFY || "onboardsupport@dg3.com";
    var html = "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#16293D\">" +
      "<p><strong>" + instrEsc(o.crew_name) + "</strong> (" + instrEsc(o.agency_id) + ") has acknowledged the <strong>sign-off instructions</strong> for <strong>" + instrEsc(o.vessel || "") + "</strong>.</p>" +
      "<p style=\"color:#6B7280\">Sign-off date: " + instrEsc(o.sign_off_date || "") + " &middot; Port: " + instrEsc(o.port || "") + "<br>Acknowledged at: " + instrEsc(o.acknowledged_at || "") + "</p>" +
      "<p style=\"font-size:11px;color:#6B7280\">Automated &middot; DG3 CIMS Crew Operations.</p></div>";
    var r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "CIMS <onboarding@resend.dev>", to: [to], subject: "Instructions acknowledged — " + (o.crew_name || "") + " (" + (o.vessel || "") + ")", html: html })
    });
    if (!r.ok) throw new Error("resend_" + r.status);
  }

  const INSTR_EMAIL = "<!DOCTYPE html>\n<html lang=\"en\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">\n<title>Sign-Off Instructions</title>\n<style>\n  /* Progressive enhancement only. Baseline styles are inline below. */\n  body { margin:0; padding:0; width:100% !important; }\n  table { border-collapse:collapse; }\n  img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }\n  a { color:#1B3A5C; }\n  @media only screen and (max-width:600px) {\n    .container { width:100% !important; }\n    .px { padding-left:20px !important; padding-right:20px !important; }\n    .stack { display:block !important; width:100% !important; }\n    .num-cell { padding-bottom:6px !important; }\n    h1 { font-size:22px !important; line-height:28px !important; }\n  }\n  @media (prefers-color-scheme: dark) {\n    /* Kept minimal: most clients override anyway. Body bg stays light for contrast control. */\n  }\n</style>\n</head>\n<body style=\"margin:0; padding:0; background-color:#eef0f3; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;\">\n<!-- Preheader (hidden preview text) -->\n<div style=\"display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#eef0f3;\">\n  Your sign-off is on {{sign_off_date}} in {{port}}. Here is everything to prepare before you leave the ship.\n</div>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#eef0f3;\">\n  <tr>\n    <td align=\"center\" style=\"padding:24px 12px;\">\n      <!-- ===== Container ===== -->\n      <table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"width:600px; max-width:600px; background-color:#ffffff; border-radius:10px; overflow:hidden;\">\n        <!-- ===== Header band ===== -->\n        <tr>\n          <td style=\"background-color:#1B3A5C; padding:28px 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td style=\"font-family:Arial,Helvetica,sans-serif; color:#9fb4c9; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; padding-bottom:6px;\">\n                  DG3 &middot; Cruise Industry Managed Services\n                </td>\n              </tr>\n              <tr>\n                <td class=\"h1\" style=\"font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:26px; line-height:32px; font-weight:bold;\">\n                  Sign-Off Instructions\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <!-- ===== Key facts strip ===== -->\n        <tr>\n          <td style=\"background-color:#5FB946; padding:0;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td class=\"stack\" width=\"50%\" style=\"padding:14px 32px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; vertical-align:top;\">\n                  <div style=\"font-size:11px; letter-spacing:1px; text-transform:uppercase; opacity:0.85;\">Sign-off date</div>\n                  <div style=\"font-size:18px; font-weight:bold; padding-top:2px;\">{{sign_off_date}}</div>\n                </td>\n                <td class=\"stack\" width=\"50%\" style=\"padding:14px 32px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; vertical-align:top;\">\n                  <div style=\"font-size:11px; letter-spacing:1px; text-transform:uppercase; opacity:0.85;\">Port</div>\n                  <div style=\"font-size:18px; font-weight:bold; padding-top:2px;\">{{port}}</div>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <!-- ===== Intro ===== -->\n        <tr>\n          <td class=\"px\" style=\"padding:28px 32px 8px 32px; font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n            <p style=\"margin:0 0 14px 0; font-size:16px; line-height:24px;\">Dear {{specialist_name}},</p>\n            <p style=\"margin:0 0 14px 0; font-size:15px; line-height:23px;\">\n              This email is your formal notice to begin preparing your handover before sign-off. You will do a physical handover with the incoming specialist, so your documentation must be complete enough for someone to step straight into the role.\n            </p>\n            <p style=\"margin:0 0 4px 0; font-size:15px; line-height:23px;\">\n              The steps below apply to every transition. Completing them is your responsibility, and submitting your final inventory formally closes your accountability for company property in your custody.\n            </p>\n          </td>\n        </tr>\n        <!-- ===== \"How this works\" helper ===== -->\n        <tr>\n          <td class=\"px\" style=\"padding:12px 32px 4px 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f3f6f9; border-radius:8px;\">\n              <tr>\n                <td style=\"padding:14px 18px; font-family:Arial,Helvetica,sans-serif; color:#41566b; font-size:13px; line-height:20px;\">\n                  <strong style=\"color:#1B3A5C;\">In short:</strong> a member of the technical or inventory team will contact you to run a full audit 7&ndash;14 days before you leave. You prepare your notes, tickets, and stock now &mdash; and on your last day you submit a final inventory count to Ray.\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <!-- ================= SECTION 1 ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:24px 32px 0 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td class=\"num-cell\" width=\"44\" valign=\"top\" style=\"vertical-align:top;\">\n                  <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td width=\"32\" height=\"32\" align=\"center\" valign=\"middle\" style=\"background-color:#1B3A5C; border-radius:16px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:15px; font-weight:bold;\">1</td></tr></table>\n                </td>\n                <td valign=\"top\" style=\"font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n                  <div style=\"font-size:17px; font-weight:bold; color:#1B3A5C; padding-bottom:6px;\">Handover Notes</div>\n                  <div style=\"font-size:14px; line-height:22px;\">\n                    Finalize before disembarkation. Make <strong>two copies</strong>:\n                    <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"padding-top:8px;\">\n                      <tr><td valign=\"top\" style=\"font-size:14px; line-height:22px; padding-right:8px; color:#5FB946;\">&bull;</td><td style=\"font-size:14px; line-height:22px;\">One retained onboard for the GSM</td></tr>\n                      <tr><td valign=\"top\" style=\"font-size:14px; line-height:22px; padding-right:8px; color:#5FB946;\">&bull;</td><td style=\"font-size:14px; line-height:22px;\">One for the incoming specialist</td></tr>\n                    </table>\n                    <div style=\"padding-top:8px;\">Cover machine status, recurring issues, operational risks, and active projects. Write it for someone who has never seen the room.</div>\n                  </div>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <!-- divider -->\n        <tr><td class=\"px\" style=\"padding:20px 32px 0 32px;\"><div style=\"border-top:1px solid #e8ebee; font-size:0; line-height:0;\">&nbsp;</div></td></tr>\n        <!-- ================= SECTION 2 ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:20px 32px 0 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td class=\"num-cell\" width=\"44\" valign=\"top\" style=\"vertical-align:top;\">\n                  <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td width=\"32\" height=\"32\" align=\"center\" valign=\"middle\" style=\"background-color:#1B3A5C; border-radius:16px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:15px; font-weight:bold;\">2</td></tr></table>\n                </td>\n                <td valign=\"top\" style=\"font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n                  <div style=\"font-size:17px; font-weight:bold; color:#1B3A5C; padding-bottom:6px;\">Tickets &amp; Open Projects</div>\n                  <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\">\n                    <tr><td valign=\"top\" style=\"font-size:14px; line-height:22px; padding-right:8px; color:#5FB946;\">&bull;</td><td style=\"font-size:14px; line-height:22px;\"><strong>Tickets / service log</strong> &mdash; all Zendesk and service tickets updated, then closed or documented with status and next action.</td></tr>\n                    <tr><td valign=\"top\" style=\"font-size:14px; line-height:22px; padding-right:8px; color:#5FB946;\">&bull;</td><td style=\"font-size:14px; line-height:22px;\"><strong>Brand requests / projects</strong> &mdash; list open Compass, template, or marketing work with stakeholders, deadlines, status, and next step.</td></tr>\n                  </table>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <tr><td class=\"px\" style=\"padding:20px 32px 0 32px;\"><div style=\"border-top:1px solid #e8ebee; font-size:0; line-height:0;\">&nbsp;</div></td></tr>\n        <!-- ================= SECTION 3 (AUDIT) ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:20px 32px 0 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td class=\"num-cell\" width=\"44\" valign=\"top\" style=\"vertical-align:top;\">\n                  <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td width=\"32\" height=\"32\" align=\"center\" valign=\"middle\" style=\"background-color:#1B3A5C; border-radius:16px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:15px; font-weight:bold;\">3</td></tr></table>\n                </td>\n                <td valign=\"top\" style=\"font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n                  <div style=\"font-size:17px; font-weight:bold; color:#1B3A5C; padding-bottom:2px;\">Pre-Sign-Off Audit</div>\n                  <div style=\"font-size:12px; font-weight:bold; color:#5FB946; text-transform:uppercase; letter-spacing:0.5px; padding-bottom:8px;\">7&ndash;14 days before sign-off</div>\n                  <div style=\"font-size:14px; line-height:22px;\">A member of the technical or inventory team will contact you to schedule and run a full audit on the points below. This is the official transition baseline.</div>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <!-- audit sub-list card -->\n        <tr>\n          <td class=\"px\" style=\"padding:12px 32px 0 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f7f9fb; border-left:3px solid #1B3A5C; border-radius:0 8px 8px 0;\">\n              <tr><td style=\"padding:6px 18px 6px 18px;\">\n                <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n                  <tr><td valign=\"top\" width=\"26\" style=\"font-size:13px; font-weight:bold; color:#1B3A5C; padding:8px 0;\">1.</td><td style=\"font-size:13px; line-height:20px; padding:8px 0;\"><strong>Inventory Verification</strong> &mdash; full count with visual validation by the assigned team member.</td></tr>\n                  <tr><td valign=\"top\" width=\"26\" style=\"font-size:13px; font-weight:bold; color:#1B3A5C; padding:8px 0; border-top:1px solid #e8ebee;\">2.</td><td style=\"font-size:13px; line-height:20px; padding:8px 0; border-top:1px solid #e8ebee;\"><strong>Order Planning Adjustment</strong> &mdash; revise pending and future orders against recent consumption to improve forecast accuracy.</td></tr>\n                  <tr><td valign=\"top\" width=\"26\" style=\"font-size:13px; font-weight:bold; color:#1B3A5C; padding:8px 0; border-top:1px solid #e8ebee;\">3.</td><td style=\"font-size:13px; line-height:20px; padding:8px 0; border-top:1px solid #e8ebee;\"><strong>Stock Availability</strong> &mdash; confirm enough stock is on hand, or replacement orders are placed, to cover required over-yield parts &mdash; including any supply risk in the next 30 days.</td></tr>\n                  <tr><td valign=\"top\" width=\"26\" style=\"font-size:13px; font-weight:bold; color:#1B3A5C; padding:8px 0; border-top:1px solid #e8ebee;\">4.</td><td style=\"font-size:13px; line-height:20px; padding:8px 0; border-top:1px solid #e8ebee;\"><strong>Tools Inventory Check</strong> &mdash; full tools audit with visual validation by the assigned team member.</td></tr>\n                  <tr><td valign=\"top\" width=\"26\" style=\"font-size:13px; font-weight:bold; color:#1B3A5C; padding:8px 0; border-top:1px solid #e8ebee;\">5.</td><td style=\"font-size:13px; line-height:20px; padding:8px 0; border-top:1px solid #e8ebee;\"><strong>Discrepancy Review</strong> &mdash; reconcile any differences between machine total counts and account/system counts.</td></tr>\n                  <tr><td valign=\"top\" width=\"26\" style=\"font-size:13px; font-weight:bold; color:#1B3A5C; padding:8px 0; border-top:1px solid #e8ebee;\">6.</td><td style=\"font-size:13px; line-height:20px; padding:8px 0; border-top:1px solid #e8ebee;\"><strong>Cleanliness Inspection</strong> &mdash; visual inspection of machines and the print shop against housekeeping standards.</td></tr>\n                </table>\n              </td></tr>\n            </table>\n          </td>\n        </tr>\n        <tr><td class=\"px\" style=\"padding:20px 32px 0 32px;\"><div style=\"border-top:1px solid #e8ebee; font-size:0; line-height:0;\">&nbsp;</div></td></tr>\n        <!-- ================= SECTION 4 (FINAL DAY) ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:20px 32px 0 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td class=\"num-cell\" width=\"44\" valign=\"top\" style=\"vertical-align:top;\">\n                  <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td width=\"32\" height=\"32\" align=\"center\" valign=\"middle\" style=\"background-color:#1B3A5C; border-radius:16px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:15px; font-weight:bold;\">4</td></tr></table>\n                </td>\n                <td valign=\"top\" style=\"font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n                  <div style=\"font-size:17px; font-weight:bold; color:#1B3A5C; padding-bottom:6px;\">Final-Day Inventory</div>\n                  <div style=\"font-size:14px; line-height:22px;\">On your <strong>last contractual day</strong>, a finalized physical count must be submitted &mdash; even if your day runs late into the evening.</div>\n                  <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:10px; background-color:#fff7ec; border-radius:8px;\">\n                    <tr><td style=\"padding:10px 14px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; color:#7a5a1e;\"><strong>Send to:</strong> Ray (Supply Chain)</td></tr>\n                  </table>\n                  <div style=\"font-size:14px; line-height:22px; padding-top:10px;\">The incoming specialist performs their own full count on Day 1. Submitting your final report confirms the count and the condition of all company property under your responsibility.</div>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <tr><td class=\"px\" style=\"padding:20px 32px 0 32px;\"><div style=\"border-top:1px solid #e8ebee; font-size:0; line-height:0;\">&nbsp;</div></td></tr>\n        <!-- ================= SECTION 5 ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:20px 32px 0 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td class=\"num-cell\" width=\"44\" valign=\"top\" style=\"vertical-align:top;\">\n                  <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td width=\"32\" height=\"32\" align=\"center\" valign=\"middle\" style=\"background-color:#1B3A5C; border-radius:16px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:15px; font-weight:bold;\">5</td></tr></table>\n                </td>\n                <td valign=\"top\" style=\"font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n                  <div style=\"font-size:17px; font-weight:bold; color:#1B3A5C; padding-bottom:6px;\">Machine Part Usage Reports</div>\n                  <div style=\"font-size:14px; line-height:22px;\">Generate your part usage reports from the system. If you need help pulling them, coordinate with Joemar.</div>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <tr><td class=\"px\" style=\"padding:20px 32px 0 32px;\"><div style=\"border-top:1px solid #e8ebee; font-size:0; line-height:0;\">&nbsp;</div></td></tr>\n        <!-- ================= SECTION 6 (FYI) ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:20px 32px 0 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td class=\"num-cell\" width=\"44\" valign=\"top\" style=\"vertical-align:top;\">\n                  <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td width=\"32\" height=\"32\" align=\"center\" valign=\"middle\" style=\"background-color:#9aa7b4; border-radius:16px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:15px; font-weight:bold;\">6</td></tr></table>\n                </td>\n                <td valign=\"top\" style=\"font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n                  <div style=\"padding-bottom:6px;\">\n                    <span style=\"font-size:17px; font-weight:bold; color:#1B3A5C;\">Shipboard Appraisal</span>\n                    <span style=\"display:inline-block; background-color:#eef0f3; color:#6b7785; font-size:11px; font-weight:bold; letter-spacing:0.5px; padding:2px 8px; border-radius:10px; margin-left:6px; vertical-align:middle;\">FYI &middot; NO ACTION</span>\n                  </div>\n                  <div style=\"font-size:14px; line-height:22px;\">Your GSM will complete a shipboard appraisal as part of your exit. The link goes to them directly &mdash; nothing is required from you beyond being available if they have questions.</div>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <!-- ================= RESPONSIBILITY CALLOUT ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:26px 32px 0 32px;\">\n            <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f3f6f9; border:1px solid #d9e0e7; border-radius:8px;\">\n              <tr>\n                <td style=\"padding:18px 20px; font-family:Arial,Helvetica,sans-serif;\">\n                  <div style=\"font-size:12px; font-weight:bold; color:#1B3A5C; letter-spacing:1px; text-transform:uppercase; padding-bottom:8px;\">Your Responsibility</div>\n                  <div style=\"font-size:13px; line-height:21px; color:#41566b;\">\n                    This email is formal sign-off instructions. From receipt, responsibility for completing each step above rests with you &mdash; including the accuracy of all counts and the condition of company property in your custody. Any damage or loss must be reported before sign-off; an unreported discrepancy becomes your accountability at closing.\n                  </div>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <!-- ================= ACKNOWLEDGMENT BUTTON (optional) ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:22px 32px 4px 32px;\" align=\"center\">\n            <!-- Bulletproof button -->\n            <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\">\n              <tr>\n                <td align=\"center\" style=\"border-radius:6px; background-color:#5FB946;\">\n                  <a href=\"{{acknowledgment_url}}\" target=\"_blank\" style=\"display:inline-block; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:6px;\">\n                    I have read and understood these instructions\n                  </a>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <tr>\n          <td class=\"px\" style=\"padding:0 32px 8px 32px;\" align=\"center\">\n            <div style=\"font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#8a96a3;\">Clicking records your acknowledgment with the date and time.</div>\n          </td>\n        </tr>\n        <!-- ================= SIGN-OFF ================= -->\n        <tr>\n          <td class=\"px\" style=\"padding:18px 32px 28px 32px; font-family:Arial,Helvetica,sans-serif; color:#2b2f33;\">\n            <p style=\"margin:0 0 12px 0; font-size:14px; line-height:22px;\">Best regards,</p>\n            <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-left:3px solid #5FB946;\">\n              <tr>\n                <td style=\"padding:2px 0 2px 14px; font-family:Arial,Helvetica,sans-serif;\">\n                  <div style=\"font-size:15px; font-weight:bold; color:#1B3A5C; line-height:20px;\">Miguel San Martin</div>\n                  <div style=\"font-size:13px; color:#2b2f33; line-height:20px;\">General Manager</div>\n                  <div style=\"font-size:13px; color:#2b2f33; line-height:20px;\">Cruise Industry Managed Services</div>\n                  <div style=\"font-size:13px; color:#41566b; line-height:22px; padding-top:6px;\">\n                    M: <a href=\"tel:+12062086468\" style=\"color:#1B3A5C; text-decoration:none;\">206.208.6468</a><br>\n                    E: <a href=\"mailto:miguel.sanmartin@dg3.com\" style=\"color:#1B3A5C; text-decoration:none;\">miguel.sanmartin@dg3.com</a>\n                  </div>\n                  <div style=\"font-size:13px; color:#6b7785; line-height:20px; padding-top:6px;\">DG3 Diversified Global Graphics Group</div>\n                </td>\n              </tr>\n            </table>\n          </td>\n        </tr>\n        <!-- ================= FOOTER ================= -->\n        <tr>\n          <td style=\"background-color:#1B3A5C; padding:18px 32px; font-family:Arial,Helvetica,sans-serif;\">\n            <div style=\"font-size:11px; line-height:17px; color:#8ea3b8;\">\n              This message and any attachments are intended only for the named recipient and may contain privileged and confidential information. If you are not the intended recipient, delete all copies and do not disclose, distribute, or copy this email.\n            </div>\n          </td>\n        </tr>\n      </table>\n      <!-- ===== /Container ===== -->\n      <div style=\"font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#9aa7b4; padding-top:14px;\">DG3 &middot; Cruise Industry Managed Services</div>\n    </td>\n  </tr>\n</table>\n</body>\n</html>\n";

  const INSTR_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign-off instructions &middot; CIMS</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
 :root{--navy:#1B3A5C;--green:#5FB946;--green-d:#3E8E2A;--mut:#6B7C93;--line:#E4E9F0;--bg:#E9EDF3;--ink:#16293D}
 *{box-sizing:border-box;margin:0;padding:0}
 body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
 .wrap{max-width:560px;margin:0 auto;padding:40px 18px}
 .topbar{display:flex;align-items:center;gap:12px;margin-bottom:16px}
 .brandmark{width:34px;height:34px;border-radius:9px;background:var(--green);display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Outfit';font-weight:800;font-size:18px}
 .t{font-family:'Outfit';font-weight:700;color:var(--navy);font-size:15px}
 .t small{display:block;font-size:9px;font-weight:600;color:var(--mut);letter-spacing:.12em;text-transform:uppercase}
 .card{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 10px 30px -16px rgba(16,38,64,.35);padding:40px 30px;text-align:center}
 .ok{width:64px;height:64px;border-radius:50%;background:#E8F6ED;display:flex;align-items:center;justify-content:center;margin:0 auto 18px}
 .ok svg{width:32px;height:32px}
 h1{font-family:'Outfit';font-weight:800;color:var(--green-d);font-size:22px;margin-bottom:10px}
 p{font-size:15px;line-height:1.6;color:var(--ink);max-width:400px;margin:0 auto}
 .stamp{margin-top:16px;font-size:12.5px;color:var(--mut)}
 .spin{color:var(--mut);font-size:15px}
</style></head>
<body><div class="wrap">
 <div class="topbar"><div class="brandmark">D</div><div class="t">DG3 CIMS<small>Sign-off instructions</small></div></div>
 <div class="card" id="card">
   <div id="loading" class="spin">Recording your acknowledgment&hellip;</div>
   <div id="done" style="display:none">
     <div class="ok"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#3E8E2A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
     <h1>Acknowledgment recorded</h1>
     <p>Thank you, <b id="who">&mdash;</b>. Your acknowledgment of the sign-off instructions has been recorded and CIMS Crew Operations has been notified. You can close this page.</p>
     <div class="stamp" id="stamp"></div>
   </div>
   <div id="bad" style="display:none">
     <h1 style="color:var(--navy)">Link invalid or expired</h1>
     <p>Please ask CIMS Crew Operations for a new link.</p>
   </div>
 </div>
</div>
<script>
 var T = new URLSearchParams(location.search).get('t');
 function show(id){ ['loading','done','bad'].forEach(function(x){ var e=document.getElementById(x); if(e) e.style.display = (x===id?'block':'none'); }); }
 function recorded(name, at){ var w=document.getElementById('who'); if(w) w.textContent = name || '\\u2014'; if(at){ var s=document.getElementById('stamp'); if(s) s.textContent='Recorded '+new Date(at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}); } show('done'); }
 async function run(){
   if(!T){ show('bad'); return; }
   try {
     var res = await fetch('/api/instr/submit', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ t: T }) });
     var r = await res.json();
     if (r && r.ok){ recorded(r.crew_name, r.ack_at || new Date().toISOString()); }
     else { show('bad'); }
   } catch (e){ document.getElementById('loading').textContent = 'Could not record \\u2014 please refresh.'; }
 }
 run();
</script>
</body></html>`;

  async function instrHandle(p, request, env, url, session) {
    if (p === "/instr") return htmlResponse(INSTR_HTML);
    if (p === "/api/instr/form") return apiInstrForm(env, url);
    if (p === "/api/instr/submit" && request.method === "POST") return apiInstrSubmit(request, env);
    if (p === "/api/instructions/request" && request.method === "POST") {
      if (!session) return json({ error: "unauthorized" }, 401);
      return apiInstrRequest(request, env, session);
    }
    return null;
  }
  return instrHandle;
}
