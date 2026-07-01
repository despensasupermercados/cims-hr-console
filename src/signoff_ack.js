// ============================================================================
// CIMS - Crew Sign-off Acknowledgement (/ack)  ·  self-contained module
// ============================================================================
// Emails + landing are the APPROVED designs (ack-1/2/3), demo values tokenized,
// landing demo-script swapped for real /api/ack/form + /api/ack/submit calls.
//
// USAGE (src/worker.js): import { installAck } from "./signoff_ack.js";
//   inside fetch(request, env), AFTER  const session = await getSession(request, env);  add:
//   { const _a = await installAck({ json, htmlResponse, signToken, verifyToken, sha256hex,
//       logActivity, applyOverride, VESSEL_REF })(url.pathname, request, env, url, session);
//     if (_a) return _a; }
// Env ACK_NOTIFY (default onboardsupport@dg3.com).
// ============================================================================

export function installAck(deps) {
  const { json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF } = deps;

  var ACK_TTL = 60 * 60 * 24 * 30; // 30 days (mirrors FB_TTL)

  async function ensureAck(env) {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS ack_request (" +
      " id TEXT PRIMARY KEY, sc TEXT NOT NULL, seq INTEGER NOT NULL, crew_id TEXT," +
      " token_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'," +
      " crew_name TEXT, vessel TEXT, port TEXT, sign_off_date TEXT," +
      " requested_by TEXT, requested_at TEXT NOT NULL," +
      " ack_at TEXT, ack_ip TEXT, ack_ua TEXT, UNIQUE (sc, seq) )"
    ).run();
  }

  function ackEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // Fill {{field}} placeholders with HTML-escaped values. ack_link is handled raw first.
  function ackFill(tpl, map) {
    var out = tpl;
    if (map.ack_link != null) out = out.split("{{ack_link}}").join(map.ack_link); // URL: raw
    return out.replace(/\{\{(\w+)\}\}/g, function (_, k) {
      return map[k] != null ? ackEsc(map[k]) : "";
    });
  }

  // ---- Resolve a sign-off (one contract leg) from live data (spec §5) ----------
  function ackNormShip(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function ackHomeport(ship) {
    var n = ackNormShip(ship);
    if (!n) return null;
    for (var i = 0; i < VESSEL_REF.length; i++) if (ackNormShip(VESSEL_REF[i].name) === n) return VESSEL_REF[i].homeport || null;
    for (var j = 0; j < VESSEL_REF.length; j++) { var rn = ackNormShip(VESSEL_REF[j].name); if (rn && n.indexOf(rn) >= 0) return VESSEL_REF[j].homeport || null; }
    return null;
  }
  async function resolveSignoff(env, sc, seq) {
    var leg = await env.DB.prepare("SELECT sc, seq, ship, proj_off, act_off FROM keyman_contract3 WHERE sc=? AND seq=?").bind(sc, seq).first();
    if (!leg) return null;
    var ed = (await env.DB.prepare("SELECT ship, sign_off, disembark FROM contract_edit WHERE sc=? AND seq=?").bind(sc, seq).first()) || {};
    var base = await env.DB.prepare("SELECT * FROM crew WHERE agency_id=?").bind(sc).first();
    var ov = await env.DB.prepare("SELECT * FROM crew_override WHERE agency_id=?").bind(sc).first();
    var c = base ? applyOverride(base, ov) : {};
    var vessel = ed.ship || leg.ship || null;
    var sign_off = ed.sign_off || leg.act_off || leg.proj_off || null;
    var port = ed.disembark || ackHomeport(vessel);
    var name = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ").trim();
    return { sc: sc, seq: seq, crew_id: base ? base.id : null, crew_name: name, first_name: c.first_name || "", email: c.email || null, agency_id: sc, vessel: vessel, port: port, sign_off_date: sign_off };
  }

  // ---- Endpoints ---------------------------------------------------------------
  // POST /api/ack/request   (session-gated; any allowlisted user)
  async function apiAckRequest(request, env, session) {
    await ensureAck(env);
    var b = await request.json().catch(function () { return {}; });
    if (!b.sc || b.seq == null) return json({ error: "missing_sc_seq" }, 400);
    var r = await resolveSignoff(env, String(b.sc), parseInt(b.seq));
    if (!r) return json({ error: "signoff_not_found" }, 404);
    var token = await signToken({ p: "ack", sc: r.sc, seq: r.seq, exp: Math.floor(Date.now() / 1000) + ACK_TTL }, env.SESSION_SECRET);
    var th = await sha256hex(token);
    var now = new Date().toISOString();
    await env.DB.prepare("DELETE FROM ack_request WHERE sc=? AND seq=?").bind(r.sc, r.seq).run();
    await env.DB.prepare("INSERT INTO ack_request (id,sc,seq,crew_id,token_hash,status,crew_name,vessel,port,sign_off_date,requested_by,requested_at) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?)")
      .bind("ack_" + crypto.randomUUID(), r.sc, r.seq, r.crew_id, th, r.crew_name, r.vessel, r.port, r.sign_off_date, (session && session.email) || null, now).run();
    var link = new URL(request.url).origin + "/ack?t=" + token;
    var emailed = false;
    if (b.send && r.email) {
      try { await sendAckRequest(env, { to: r.email, crew_first_name: r.first_name || r.crew_name, vessel: r.vessel, sign_off_date: r.sign_off_date, link: link }); emailed = true; }
      catch (e) { await logActivity(env, session && session.email, "ack_request_send_failed", r.sc + " #" + r.seq); }
    }
    await logActivity(env, session && session.email, "ack_request", r.sc + " #" + r.seq);
    return json({ ok: true, link: link, crew_name: r.crew_name, emailed: emailed, hasEmail: !!r.email });
  }

  // GET /api/ack/form?t=   (PUBLIC, token-authenticated) — mirrors apiFeedbackForm
  async function apiAckForm(env, url) {
    await ensureAck(env);
    var t = url.searchParams.get("t");
    var p = await verifyToken(t, env.SESSION_SECRET);
    if (!p || p.p !== "ack") return json({ error: "invalid_or_expired" }, 401);
    var th = await sha256hex(t);
    var row = await env.DB.prepare("SELECT status, crew_name, vessel, port, sign_off_date, ack_at FROM ack_request WHERE token_hash=?").bind(th).first();
    if (!row) return json({ error: "revoked" }, 401);
    return json({ ok: true, crew_name: row.crew_name, vessel: row.vessel, port: row.port, sign_off_date: row.sign_off_date, status: row.status, locked: row.status !== "pending", ack_at: row.ack_at || null });
  }

  // POST /api/ack/submit   (PUBLIC, token-authenticated) — mirrors apiFeedbackSubmit
  async function apiAckSubmit(request, env) {
    await ensureAck(env);
    var b = await request.json().catch(function () { return {}; });
    var p = await verifyToken(b.t, env.SESSION_SECRET);
    if (!p || p.p !== "ack") return json({ error: "invalid_or_expired" }, 401);
    var th = await sha256hex(b.t);
    var row = await env.DB.prepare("SELECT * FROM ack_request WHERE token_hash=?").bind(th).first();
    if (!row) return json({ error: "revoked" }, 401);
    if (row.status === "acknowledged") return json({ ok: true, already: true }, 200); // idempotent — no re-send
    var now = new Date().toISOString();
    await env.DB.prepare("UPDATE ack_request SET status='acknowledged', ack_at=?, ack_ip=?, ack_ua=? WHERE token_hash=?")
      .bind(now, request.headers.get("cf-connecting-ip") || null, request.headers.get("user-agent") || null, th).run();
    try {
      await sendAckConfirmation(env, { crew_name: row.crew_name, agency_id: row.sc, vessel: row.vessel, sign_off_port: row.port, sign_off_date: row.sign_off_date, acknowledged_at: now });
    } catch (e) {
      await logActivity(env, null, "ack_confirm_send_failed", row.sc + " #" + row.seq); // record ack anyway, don't swallow silently
    }
    await logActivity(env, null, "ack_submit", row.sc + " #" + row.seq);
    return json({ ok: true });
  }

  // ---- Email senders (direct Resend; verified MAIL_FROM required — spec §8) -----
  async function sendAckRequest(env, o) {
    if (!env.RESEND_API_KEY) throw new Error("no_mailer");
    var html = ackFill(ACK_REQUEST_EMAIL, { crew_first_name: o.crew_first_name, vessel: o.vessel, sign_off_date: o.sign_off_date, ack_link: o.link });
    var r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "CIMS <onboarding@resend.dev>", to: [o.to], subject: "Confirm your sign-off — " + (o.vessel || ""), html: html })
    });
    if (!r.ok) throw new Error("resend_" + r.status);
  }
  async function sendAckConfirmation(env, o) {
    if (!env.RESEND_API_KEY) throw new Error("no_mailer");
    var to = env.ACK_NOTIFY || "onboardsupport@dg3.com";
    var html = ackFill(ACK_CONFIRM_EMAIL, { crew_name: o.crew_name, agency_id: o.agency_id, vessel: o.vessel, sign_off_port: o.sign_off_port, sign_off_date: o.sign_off_date, acknowledged_at: o.acknowledged_at });
    var r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "CIMS <onboarding@resend.dev>", to: [to], subject: "Sign-off acknowledged — " + (o.crew_name || "") + " (" + (o.vessel || "") + ")", html: html })
    });
    if (!r.ok) throw new Error("resend_" + r.status);
  }

  const ACK_REQUEST_EMAIL = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<title>Confirm your sign-off</title>\n</head>\n<body style=\"margin:0;padding:0;background:#EEF1F4;\">\n<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;\">Please confirm you have read and agree to your end-of-contract sign-off summary.</div>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"#EEF1F4\" style=\"background:#EEF1F4;\">\n <tr><td align=\"center\" style=\"padding:24px 12px;\">\n  <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;\">\n\n   <!-- brand bar -->\n   <tr><td bgcolor=\"#16314F\" style=\"background:#16314F;padding:18px 24px;border-radius:8px 8px 0 0;\">\n     <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>\n       <td style=\"font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#FFFFFF;letter-spacing:1px;\">CIMS</td>\n       <td align=\"right\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#AEC1D6;letter-spacing:.5px;\">CREW SIGN-OFF</td>\n     </tr></table>\n   </td></tr>\n\n   <!-- title -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:26px 28px 6px 28px;\">\n     <div style=\"font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#1B3A5C;line-height:1.25;\">Confirm your sign-off</div>\n   </td></tr>\n\n   <!-- body -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:8px 28px 4px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1A2430;\">\n     <p style=\"margin:0 0 14px 0;\">Hi {{crew_first_name}},</p>\n     <p style=\"margin:0 0 14px 0;\">Your contract aboard <strong>{{vessel}}</strong> is closing, with a recorded sign-off date of <strong>{{sign_off_date}}</strong>.</p>\n     <p style=\"margin:0 0 8px 0;\">Before we finalise it, please review your sign-off summary and confirm that you have read and agree to it. It only takes a moment.</p>\n   </td></tr>\n\n   <!-- CTA -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:18px 28px 10px 28px;\" align=\"left\">\n     <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>\n       <td bgcolor=\"#5FB946\" style=\"background:#5FB946;border-radius:10px;\">\n         <a href=\"{{ack_link}}\" target=\"_blank\"\n            style=\"display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;\">\n            Review &amp; acknowledge &rarr;</a>\n       </td>\n     </tr></table>\n   </td></tr>\n\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:6px 28px 22px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.6;color:#6B7280;\">\n     <p style=\"margin:0 0 6px 0;\">This is a secure, single-use link for you only. If the button does not work, copy and paste this address into your browser:</p>\n     <p style=\"margin:0;word-break:break-all;color:#1E6FD0;\">{{ack_link}}</p>\n   </td></tr>\n\n   <!-- footer -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:16px 28px 26px 28px;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;\">\n     <div style=\"font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6B7280;line-height:1.6;\">\n       DG3 Cruise Industry Managed Services &middot; Crew Operations.<br>\n       You are receiving this because a sign-off has been recorded for you in CIMS. Questions? Reply to this email.\n     </div>\n   </td></tr>\n\n  </table>\n </td></tr>\n</table>\n</body></html>\n";
  const ACK_CONFIRM_EMAIL = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<title>Sign-off acknowledged</title>\n</head>\n<body style=\"margin:0;padding:0;background:#EEF1F4;\">\n<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;\">{{crew_name}} acknowledged the {{vessel}} sign-off on {{acknowledged_at}}.</div>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"#EEF1F4\" style=\"background:#EEF1F4;\">\n <tr><td align=\"center\" style=\"padding:24px 12px;\">\n  <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;\">\n\n   <!-- brand bar -->\n   <tr><td bgcolor=\"#16314F\" style=\"background:#16314F;padding:18px 24px;border-radius:8px 8px 0 0;\">\n     <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>\n       <td style=\"font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#FFFFFF;letter-spacing:1px;\">CIMS</td>\n       <td align=\"right\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#AEC1D6;letter-spacing:.5px;\">SIGN-OFF ACKNOWLEDGED</td>\n     </tr></table>\n   </td></tr>\n\n   <!-- title + check -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:26px 28px 4px 28px;\">\n     <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>\n       <td valign=\"middle\" style=\"padding-right:12px;\">\n         <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"center\" valign=\"middle\" width=\"40\" height=\"40\" bgcolor=\"#E8F6ED\" style=\"background:#E8F6ED;border-radius:50%;font-family:Arial,Helvetica,sans-serif;font-size:22px;color:#3E8E2A;font-weight:bold;line-height:40px;\">&#10003;</td></tr></table>\n       </td>\n       <td valign=\"middle\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:bold;color:#1B3A5C;\">Sign-off acknowledged</td>\n     </tr></table>\n   </td></tr>\n\n   <!-- body -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:12px 28px 6px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1A2430;\">\n     <p style=\"margin:0;\"><strong>{{crew_name}}</strong> has acknowledged the end-of-contract sign-off message for <strong>{{vessel}}</strong>.</p>\n   </td></tr>\n\n   <!-- details -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:14px 28px 6px 28px;\">\n     <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border:1px solid #E5E7EB;border-radius:10px;\">\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;width:42%;\">Crew member</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;font-weight:bold;\">{{crew_name}}</td></tr>\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Agency ID</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;\">{{agency_id}}</td></tr>\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Vessel</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;\">{{vessel}}</td></tr>\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Sign-off port</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;\">{{sign_off_port}}</td></tr>\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Sign-off date</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;\">{{sign_off_date}}</td></tr>\n       <tr><td style=\"padding:11px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Acknowledged at</td><td style=\"padding:11px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;font-weight:bold;\">{{acknowledged_at}}</td></tr>\n     </table>\n   </td></tr>\n\n   <!-- footer -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:18px 28px 26px 28px;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;margin-top:10px;\">\n     <div style=\"font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6B7280;line-height:1.6;\">\n       Automated confirmation &middot; generated when the crew member clicked Acknowledge.<br>\n       DG3 Cruise Industry Managed Services &middot; CIMS Crew Operations.\n     </div>\n   </td></tr>\n\n  </table>\n </td></tr>\n</table>\n</body></html>\n";
  const ACK_HTML = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>Sign-off acknowledgement &middot; CIMS</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap\" rel=\"stylesheet\">\n<style>\n  :root{--navy:#1B3A5C;--deep:#142D48;--green:#5FB946;--green-d:#3E8E2A;--mut:#6B7C93;--line:#E4E9F0;--line2:#D5DDE9;--bg:#E9EDF3;--ink:#16293D}\n  *{box-sizing:border-box;margin:0;padding:0}\n  body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}\n  h1,h2{font-family:'Outfit',system-ui,sans-serif;letter-spacing:-.012em}\n  .wrap{max-width:640px;margin:0 auto;padding:26px 18px}\n  .topbar{display:flex;align-items:center;gap:12px;margin-bottom:14px}\n  .brandmark{width:34px;height:34px;border-radius:9px;background:var(--green);display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Outfit';font-weight:800;font-size:18px}\n  .topbar .t{font-family:'Outfit';font-weight:700;color:var(--navy);font-size:15px}\n  .topbar .t small{display:block;font-size:9px;font-weight:600;color:var(--mut);letter-spacing:.12em;text-transform:uppercase}\n  .card{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 10px 30px -16px rgba(16,38,64,.35);overflow:hidden}\n  .card .head{background:linear-gradient(180deg,#1F4268,#16314F);color:#fff;padding:22px 26px}\n  .card .head h1{font-size:21px;font-weight:800}\n  .card .head .sub{color:#AEC1D6;font-size:12.5px;margin-top:4px;letter-spacing:.02em}\n  .chips{display:flex;flex-wrap:wrap;gap:8px;padding:18px 26px 4px}\n  .chip{background:#F2F5FA;border:1px solid var(--line);border-radius:10px;padding:7px 12px;font-size:12.5px;color:var(--ink)}\n  .chip b{color:var(--navy);font-family:'Outfit';font-weight:700}\n  .body{padding:14px 26px 8px}\n  .statement{background:#FAFBFD;border:1px solid var(--line);border-left:3px solid var(--navy);border-radius:0 12px 12px 0;padding:16px 18px;margin:8px 0 4px}\n  .statement h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--navy);margin-bottom:10px}\n  .statement ul{margin:0;padding-left:18px}\n  .statement li{font-size:14px;line-height:1.6;margin-bottom:8px}\n  .statement p{font-size:14px;line-height:1.6;color:var(--ink)}\n  .ackrow{display:flex;align-items:flex-start;gap:12px;padding:18px 26px 6px;cursor:pointer}\n  .ackrow input{appearance:none;-webkit-appearance:none;width:24px;height:24px;border-radius:7px;border:2px solid var(--line2);background:#fff;cursor:pointer;flex:none;position:relative;transition:.15s}\n  .ackrow input:checked{background:var(--green);border-color:var(--green)}\n  .ackrow input:checked::after{content:'';position:absolute;left:7px;top:3px;width:6px;height:11px;border:solid #fff;border-width:0 2.5px 2.5px 0;transform:rotate(45deg)}\n  .ackrow label{font-size:14px;line-height:1.5;color:var(--ink);cursor:pointer}\n  .actions{padding:16px 26px 26px}\n  .btn{width:100%;padding:15px;border:0;border-radius:12px;background:var(--green);color:#fff;font-family:'Outfit';font-weight:700;font-size:16px;cursor:pointer;transition:.15s;box-shadow:0 6px 16px -6px rgba(62,142,42,.6)}\n  .btn:disabled{background:#c4cdd9;box-shadow:none;cursor:not-allowed}\n  .btn:not(:disabled):hover{transform:translateY(-1px)}\n  .fineprint{font-size:11.5px;color:var(--mut);text-align:center;margin-top:12px;line-height:1.5}\n  /* confirmation state */\n  .done{display:none;padding:40px 26px;text-align:center}\n  .done .ok{width:64px;height:64px;border-radius:50%;background:#E8F6ED;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}\n  .done .ok svg{width:32px;height:32px}\n  .done h1{font-family:'Outfit';font-weight:800;color:var(--green-d);font-size:22px;margin-bottom:8px}\n  .done p{font-size:14.5px;line-height:1.6;color:var(--ink);max-width:420px;margin:0 auto}\n  .done .stamp{margin-top:14px;font-size:12.5px;color:var(--mut)}\n  .is-done .live{display:none}.is-done .done{display:block}\n</style></head>\n<body><div class=\"wrap\">\n  <div class=\"topbar\"><div class=\"brandmark\">D</div><div class=\"t\">DG3 CIMS<small>Crew sign-off</small></div></div>\n\n  <div class=\"card\" id=\"card\">\n    <!-- LIVE (pre-acknowledgement) -->\n    <div class=\"live\">\n      <div class=\"head\">\n        <h1>End-of-contract sign-off</h1>\n        <div class=\"sub\">Please review and confirm the summary below.</div>\n      </div>\n      <div class=\"chips\">\n        <div class=\"chip\">Crew &middot; <b id=\"cName\">&mdash;</b></div>\n        <div class=\"chip\">Vessel &middot; <b id=\"cVessel\">&mdash;</b></div>\n        <div class=\"chip\">Port &middot; <b id=\"cPort\">&mdash;</b></div>\n        <div class=\"chip\">Sign-off &middot; <b id=\"cDate\">&mdash;</b></div>\n      </div>\n      <div class=\"body\">\n        <div class=\"statement\">\n          <h2>Sign-off summary</h2>\n          <!-- EDITABLE: replace with the exact statement crew must acknowledge -->\n          <p style=\"margin-bottom:10px\">By acknowledging below, I confirm that:</p>\n          <ul>\n            <li>The recorded sign-off date above is correct.</li>\n            <li>I have completed the handover of all printers, MFDs and CIMS equipment in working condition.</li>\n            <li>Consumable inventory and par levels have been left as required and reported accurately.</li>\n            <li>Any outstanding technical issues have been documented for the relieving crew.</li>\n            <li>I have read and understood my end-of-contract sign-off summary.</li>\n          </ul>\n        </div>\n      </div>\n      <div class=\"ackrow\" onclick=\"var c=document.getElementById('agree');c.checked=!c.checked;sync();\">\n        <input type=\"checkbox\" id=\"agree\" onclick=\"event.stopPropagation();sync();\">\n        <label>I have read and understood the above, and I acknowledge my sign-off.</label>\n      </div>\n      <div class=\"actions\">\n        <button class=\"btn\" id=\"ackBtn\" disabled onclick=\"acknowledge()\">Acknowledge sign-off</button>\n        <div class=\"fineprint\">A confirmation will be recorded and sent to CIMS Crew Operations.<br>Secure single-use link &middot; DG3 Cruise Industry Managed Services.</div>\n      </div>\n    </div>\n\n    <!-- DONE (post-acknowledgement) -->\n    <div class=\"done\">\n      <div class=\"ok\"><svg viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M5 13l4 4L19 7\" stroke=\"#3E8E2A\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg></div>\n      <h1>Acknowledgement recorded</h1>\n      <p>Thank you, <b id=\"dName\">&mdash;</b>. Your sign-off for <b id=\"dVessel\">&mdash;</b> has been acknowledged and a confirmation has been sent to CIMS Crew Operations. You can close this page.</p>\n      <div class=\"stamp\" id=\"stamp\"></div>\n    </div>\n  </div>\n</div>\n\n<script>\n  var T = new URLSearchParams(location.search).get('t');\n  var card = document.getElementById('card');\n  var DASH = '\\u2014';\n  function setText(id, v){ var e = document.getElementById(id); if (e) e.textContent = (v == null || v === '') ? DASH : v; }\n  function setDone(txt){ if (txt){ var s = document.getElementById('stamp'); if (s) s.textContent = txt; } if (card) card.classList.add('is-done'); window.scrollTo(0,0); }\n  function sync(){ var a = document.getElementById('agree'), b = document.getElementById('ackBtn'); if (b) b.disabled = !(a && a.checked); }\n  function invalid(msg){\n    var h = document.querySelector('.head h1'); if (h) h.textContent = 'Link invalid or expired';\n    var s = document.querySelector('.head .sub'); if (s) s.textContent = msg || 'Please ask CIMS Crew Operations for a new link.';\n    ['.chips','.body','.ackrow','.actions'].forEach(function(sel){ var el = document.querySelector(sel); if (el) el.style.display = 'none'; });\n  }\n  async function load(){\n    if (!T){ invalid('This link is missing its token.'); return; }\n    try {\n      var res = await fetch('/api/ack/form?t=' + encodeURIComponent(T), { cache: 'no-store' });\n      var d = await res.json();\n      if (!d || !d.ok){ invalid(); return; }\n      setText('cName', d.crew_name); setText('dName', d.crew_name);\n      setText('cVessel', d.vessel); setText('dVessel', d.vessel);\n      setText('cPort', d.port); setText('cDate', d.sign_off_date);\n      if (d.locked){ setDone(d.ack_at ? ('Acknowledged ' + new Date(d.ack_at).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' })) : ''); }\n    } catch (e){ var s = document.querySelector('.head .sub'); if (s) s.textContent = 'Could not load \\u2014 please refresh.'; }\n  }\n  async function acknowledge(){\n    var b = document.getElementById('ackBtn'); if (b){ b.disabled = true; b.textContent = 'Recording\\u2026'; }\n    try {\n      var res = await fetch('/api/ack/submit', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ t: T }) });\n      var r = await res.json();\n      if (r && r.ok){ setDone('Acknowledged ' + new Date().toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' })); }\n      else { if (b){ b.disabled = false; b.textContent = 'Acknowledge sign-off'; } alert('Could not record \\u2014 please try again.'); }\n    } catch (e){ if (b){ b.disabled = false; b.textContent = 'Acknowledge sign-off'; } alert('Network error \\u2014 please try again.'); }\n  }\n  load();\n</script>\n</body></html>\n";

  async function ackHandle(p, request, env, url, session) {
    if (p === "/ack") return htmlResponse(ACK_HTML);
    if (p === "/api/ack/form") return apiAckForm(env, url);
    if (p === "/api/ack/submit" && request.method === "POST") return apiAckSubmit(request, env);
    if (p === "/api/ack/request" && request.method === "POST") {
      if (!session) return json({ error: "unauthorized" }, 401);
      return apiAckRequest(request, env, session);
    }
    return null;
  }
  return ackHandle;
}
