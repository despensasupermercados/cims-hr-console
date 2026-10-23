// ============================================================================
// CIMS - Sign-off INSTRUCTIONS (Email 1)  ·  self-contained module
// ============================================================================
// Front of the hand-over workflow: the seafarer gets their pre-departure
// instructions 14 days out; the email's one button, Open HON, records the
// acknowledgement (date/time), notifies onboardsupport, then forwards to HON.
//
// USAGE (src/worker.js): import { installInstr } from "./signoff_instructions.js";
//   inside fetch(request, env), AFTER  const session = await getSession(request, env);  add:
//   { const _i = await installInstr({ json, htmlResponse, signToken, verifyToken, sha256hex,
//       logActivity, applyOverride, VESSEL_REF, instrContext, sendViaMailer, boardLegs })(url.pathname, request, env, url, session);
//     if (_i) return _i; }
// Env INSTR_NOTIFY (default onboardsupport@dg3.com).
// v2 (16 Oct 2026): the email is hr.signoff.instructions.v2 (src/emails/), filled from the Keyman board through
// deps.instrContext (ship, brand, sign-off, port, reliever); CC onboardsupport@dg3.com, reply-to Rita; its one button
// (Open HON) is the acknowledgment link, and /instr records the receipt then forwards to HON.
// ============================================================================
import { memoDdl } from "./ensure_memo.js";
import { instructionsEmail, TEMPLATE_ID as INSTR_TEMPLATE, firstWord } from "./emails/hr.signoff.instructions.v2.js";
import { relieverEmail, TEMPLATE_ID as RELIEVER_TEMPLATE } from "./emails/hr.signoff.reliever.v1.js";

// Hoisted to module scope 2026-09-10 so the DEPLOY GATE can reach it — same reason as
// ACK_HTML in signoff_ack.js. /instr is a PUBLIC seafarer page and its inline <script> was
// never syntax-checked. Static template literal with no ${} interpolation: a pure relocation.
export const INSTR_HTML = `<!DOCTYPE html>
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
   <div id="loading" class="spin">Recording your receipt&hellip;</div>
   <div id="done" style="display:none">
     <div class="ok"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#3E8E2A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
     <h1>Opening your Digital Handover Notes&hellip;</h1>
     <p>Thank you, <b id="who">&mdash;</b>. Your receipt of the sign-off instructions is recorded. Your notes open now: select your ship and start.</p>
     <p style="margin-top:14px"><a id="hon" href="https://hon.cims.work" style="color:var(--navy);font-weight:700">Open my Digital Handover Notes</a></p>
     <div class="stamp" id="stamp"></div>
   </div>
   <div id="bad" style="display:none">
     <h1 style="color:var(--navy)">Link invalid or expired</h1>
     <p>Please ask CIMS Crew Operations for a new link. Your Digital Handover Notes are still open at <a href="https://hon.cims.work" style="color:var(--navy);font-weight:700">hon.cims.work</a></p>
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
     // The email's one button opens the notes (16 Oct 2026; named "Open my Digital Handover Notes" since 19 Oct): record the receipt, then go to HON.
     if (r && r.ok){ recorded(r.crew_name, r.ack_at || new Date().toISOString()); setTimeout(function(){ location.replace('https://hon.cims.work'); }, 900); }
     else { show('bad'); }
   } catch (e){ document.getElementById('loading').textContent = 'Could not record \\u2014 please refresh.'; }
 }
 run();
</script>
</body></html>`;

export function installInstr(deps) {
  const { json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, sendViaMailer } = deps;
  // The CC on every instructions email (Miguel, 16 Oct 2026: "CC onboard support"), and who the crew reply to (Rita signs it).
  var INSTR_CC = "onboardsupport@dg3.com", INSTR_REPLY_TO = "Rita.Berenyi@dg3.com";

  var INSTR_TTL = 60 * 60 * 24 * 45; // 45 days (email goes ~14d before sign-off)

  // Once per database per isolate (16 Oct 2026): this CREATE ran on every request that reached the module (§12).
  const ensureInstr = memoDdl(ensureInstrDdl);
  async function ensureInstrDdl(env) {
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

  // Same resolution the sign-off ack uses: crew name/email, vessel, sign-off date, port.
  // THE SEAT, NOT THE COUNTER POSITION (8 Oct 2026). Since 7 Oct the Contract Counter is history (§10d): a seat dated
  // from the TDG file has no keyman_contract3 row at that seq, so the button failed (signoff_not_found), or the crew was
  // emailed their PREVIOUS ship and sign-off. The crew's current contract on the board schedule — already carrying Rita's
  // recorded sign-off and TDG's word (the ladder) — is used when there is one; the Counter row only otherwise.
  async function seatLeg(env, sc, seq) {
    if (!deps.boardLegs) return null;
    var legs = (await deps.boardLegs(env).catch(function () { return null; })) || [];
    var cur = legs.filter(function (l) { return l && l.ours && l.sc === sc && l.is_current && l.off; }).sort(function (a, b) { return a.on < b.on ? 1 : -1; })[0];
    return cur ? { sc: sc, seq: seq, ship: cur.ship, on: cur.on || null, proj_off: cur.off, act_off: null, port: cur.disembark || null, fromBoard: true } : null;
  }
  async function resolveInstr(env, sc, seq, ovr) {
    var leg = ovr || await env.DB.prepare("SELECT sc, seq, ship, proj_off, act_off FROM keyman_contract3 WHERE sc=? AND seq=?").bind(sc, seq).first();
    if (!leg) return null;
    var ed = (ovr && ovr.fromBoard) ? {} : ((await env.DB.prepare("SELECT ship, sign_off, disembark FROM contract_edit WHERE sc=? AND seq=?").bind(sc, seq).first()) || {});
    var base = await env.DB.prepare("SELECT * FROM crew WHERE agency_id=?").bind(sc).first();
    var ov = await env.DB.prepare("SELECT * FROM crew_override WHERE agency_id=?").bind(sc).first();
    var c = base ? applyOverride(base, ov) : {};
    var vessel = ed.ship || leg.ship || null;
    var sign_off = ed.sign_off || leg.act_off || leg.proj_off || null;
    // A typed port, else the board's (Rita's, the Counter's or the turnaround's), else none: the email reads "To be
    // confirmed". NEVER the ship's home-port seed (§11e, 16 Oct 2026) — it fell back to it here, so a seat with no typed
    // or itinerary port read "You sign off … in Miami" while seatContexts had refused that seed.
    var port = ed.disembark || (ovr && ovr.port) || null;
    var name = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ").trim();
    // The pass prints the name as the crew would say it (first word of the first name + the last name) and TDG's position.
    var passName = [firstWord(c.first_name), c.last_name].filter(Boolean).join(" ").trim();
    return { sc: sc, seq: seq, crew_id: base ? base.id : null, crew_name: name, pass_name: passName || name, position: c.rank_override || c.rank_observed || null, first_name: firstWord(c.first_name) || null, email: c.email || null, phone: c.phone || null, vessel: vessel, port: port, sign_on_date: (ovr && ovr.on) || null, sign_off_date: sign_off };
  }

  // POST /api/instructions/request  (session-gated) — issue the instructions email
  async function apiInstrRequest(request, env, session) {
    await ensureInstr(env);
    var b = await request.json().catch(function () { return {}; });
    if (!b.sc || b.seq == null) return json({ error: "missing_sc_seq" }, 400);
    var r = await resolveInstr(env, String(b.sc), parseInt(b.seq), (await seatLeg(env, String(b.sc), parseInt(b.seq))) || undefined);
    if (!r) return json({ error: "signoff_not_found" }, 404);
    var ctx = await contextFor(env, r.sc);
    if (ctx && ctx.instruct === false) return json({ ok: false, error: "not_instructed" }, 409);   // a training visit (visits.js)
    var past = passedSignOff(ctx, r);
    if (b.send && past) return json({ ok: false, error: "signoff_passed", sign_off: past }, 409);
    // Never wipe an acknowledgement the seafarer already gave (8 Oct 2026): a second press used to DELETE the
    // acknowledged row (ack_at, ip, user agent) and revoke the link they had answered. Resend only with force.
    var prev = await env.DB.prepare("SELECT status FROM instr_ack WHERE sc=? AND seq=?").bind(r.sc, r.seq).first();
    if (prev && prev.status === "acknowledged" && !b.force) return json({ ok: false, error: "already_acknowledged" }, 409);
    var token = await signToken({ p: "instr", sc: r.sc, seq: r.seq, exp: Math.floor(Date.now() / 1000) + INSTR_TTL }, env.SESSION_SECRET);
    var th = await sha256hex(token);
    var now = new Date().toISOString();
    await env.DB.prepare("DELETE FROM instr_ack WHERE sc=? AND seq=?").bind(r.sc, r.seq).run();
    var insId = "ins_" + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO instr_ack (id,sc,seq,crew_id,token_hash,status,crew_name,vessel,port,sign_off_date,requested_by,requested_at) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?)")
      .bind(insId, r.sc, r.seq, r.crew_id, th, r.crew_name, r.vessel, r.port, r.sign_off_date, (session && session.email) || null, now).run();
    var link = new URL(request.url).origin + "/instr?t=" + token;
    var emailed = false, rp = null;
    if (b.send && r.email) {
      try { await sendInstructions(env, { to: r.email, r: r, ctx: ctx, link: link, instr_id: insId }); emailed = true; }
      catch (e) { await logActivity(env, session && session.email, "instr_send_failed", r.sc + " #" + r.seq); }
      if (emailed) rp = await sendRelieverPass(env, r, ctx);
    }
    await logActivity(env, session && session.email, "instr_request", r.sc + " #" + r.seq);
    return json({ ok: true, link: link, crew_name: r.crew_name, emailed: emailed, hasEmail: !!r.email, reliever: rp });
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
      await sendInstrConfirmation(env, { crew_name: row.crew_name, agency_id: row.sc, vessel: row.vessel, sign_off_date: row.sign_off_date, port: row.port, acknowledged_at: now, instr_id: row.id });
    } catch (e) {
      await logActivity(env, null, "instr_confirm_send_failed", row.sc + " #" + row.seq);
    }
    await logActivity(env, null, "instr_ack", row.sc + " #" + row.seq);
    return json({ ok: true, crew_name: row.crew_name, ack_at: now });
  }

  // The seat as the Keyman board shows it (deps.instrContext): brand, sign-off, port, reliever. Missing -> the email still
  // goes from what the request resolved (ship, sign-off, port), with the reliever "not named yet".
  async function contextFor(env, sc) {
    if (!deps.instrContext) return null;
    try { return (await deps.instrContext(env, sc)) || null; } catch (e) { return null; }
  }
  // Never instruct a sign-off that has already passed (17 Oct 2026, Kevin Jugao, Pursuit: the board dates his sign-off
  // at his reliever's embark — the file's cross-over, 16 Oct — while Rita typed 31 Oct and TDG still has him On board,
  // so a send from his page would have told him "You sign off 16 Oct"). Returns the passed date, else null.
  function passedSignOff(ctx, r) {
    var off = String((ctx && ctx.off) || (r && r.sign_off_date) || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(off) && off < new Date().toISOString().slice(0, 10) ? off : null;
  }
  // The reliever as the crew would say it: first word of the first name + the last name (the board joins every given name).
  // Their mobile and email ride along ONLY when TDG has them (rel.tdg, signoff_context.relieverInTdg): the pass prints them
  // so the two can be in touch (Miguel, 19 Oct 2026), and a plan only the console holds must reach nobody (§10d).
  async function relieverName(env, rel) {
    if (!rel || !rel.sc) return rel || null;
    try {
      var row = await env.DB.prepare("SELECT COALESCE(NULLIF(o.first_name,''), c.first_name) AS fn, COALESCE(NULLIF(o.last_name,''), c.last_name) AS ln, COALESCE(NULLIF(o.phone,''), c.phone) AS phone, COALESCE(NULLIF(o.email,''), c.email) AS email FROM crew c LEFT JOIN crew_override o ON o.agency_id = c.agency_id WHERE c.agency_id=?").bind(rel.sc).first();
      if (row && (row.fn || row.ln)) {
        var f = firstWord(row.fn);
        var out = Object.assign({}, rel, { name: [f, row.ln].filter(Boolean).join(" "), first: f || rel.first });
        if (rel.tdg) { out.phone = row.phone || null; out.email = row.email || null; }
        return out;
      }
    } catch (e) {}
    return rel;
  }

  async function sendInstructions(env, o) {
    if (!env.MAILER) throw new Error("no_mailer");
    var r = o.r || {}, ctx = o.ctx || {};
    var mail = instructionsEmail({
      firstName: r.first_name || firstWord(r.crew_name), crewName: r.pass_name || r.crew_name, position: r.position || null,
      ship: ctx.ship || r.vessel, brand: ctx.brand || null,
      signOn: ctx.on || r.sign_on_date || null, signOff: ctx.off || r.sign_off_date, port: ctx.port || r.port,
      reliever: await relieverName(env, ctx.reliever || null),
      link: o.link, today: new Date().toISOString().slice(0, 10),
    });
    var out = await sendViaMailer(env, {
      to: [o.to], cc: [env.INSTR_CC || INSTR_CC], replyTo: INSTR_REPLY_TO,
      subject: mail.subject, html: mail.html, text: mail.text,
      templateId: INSTR_TEMPLATE, critical: true,
      idempotencyKey: INSTR_TEMPLATE + ":" + o.instr_id
    });
    if (!out.ok) throw new Error("mailer_" + (out.error || out.status || "failed"));
  }

  // THE RELIEVER'S HANDOVER PASS (hr.signoff.reliever.v1; Miguel, 19 Oct 2026: "add .. the name .. phone and email of the
  // incoming crew .. so they can be in contact"; render approved 23 Oct 2026, "all approved"). It goes with the instructions
  // email, the same day, to the INCOMING printer: the outgoing one's name, mobile and email. Only when TDG has the reliever
  // (rel.tdg, signoff_context.relieverInTdg) and the reliever has an email — a plan only the console holds must reach nobody
  // (§10d). Once per seat and reliever (activity_log reliever_pass_sent, keyed sc · sign-off · reliever), whatever the
  // instructions do on a resend. CC onboardsupport, reply-to Rita, like the instructions. Never blocks the instructions email:
  // a failure is logged (reliever_pass_failed) and said in the result.
  async function sendRelieverPass(env, r, ctx) {
    try {
      var rel0 = ctx && ctx.reliever;
      if (!rel0 || !rel0.sc || !rel0.tdg) return { sent: false, why: !rel0 ? "no_reliever" : "not_in_tdg" };
      var rel = await relieverName(env, rel0);
      if (!rel || !rel.email) return { sent: false, why: "no_reliever_email" };
      var off = (ctx && ctx.off) || r.sign_off_date || null;
      var key = r.sc + "|" + String(off || "").slice(0, 10) + "|" + rel.sc;
      var seen = await env.DB.prepare("SELECT 1 x FROM activity_log WHERE action='reliever_pass_sent' AND detail=? LIMIT 1").bind(key).first().catch(function () { return null; });
      if (seen) return { sent: false, why: "already_sent" };
      var mail = relieverEmail({
        firstName: rel.first, ship: (ctx && ctx.ship) || r.vessel, brand: (ctx && ctx.brand) || null, port: (ctx && ctx.port) || r.port,
        outgoing: { name: r.pass_name || r.crew_name, first: r.first_name || firstWord(r.crew_name), position: r.position || null, signOff: off, phone: r.phone, email: r.email },
        relieverOn: rel.on, today: new Date().toISOString().slice(0, 10),
      });
      var out = await sendViaMailer(env, {
        to: [rel.email], cc: [env.INSTR_CC || INSTR_CC], replyTo: INSTR_REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text,
        templateId: RELIEVER_TEMPLATE, critical: true, idempotencyKey: RELIEVER_TEMPLATE + ":" + key,
      });
      if (!out || !out.ok) { await logActivity(env, null, "reliever_pass_failed", key); return { sent: false, why: "not_sent" }; }
      await logActivity(env, null, "reliever_pass_sent", key);
      return { sent: true, to: rel.email };
    } catch (e) { await logActivity(env, null, "reliever_pass_failed", (r && r.sc) || ""); return { sent: false, why: "error" }; }
  }

  async function sendInstrConfirmation(env, o) {
    if (!env.MAILER) throw new Error("no_mailer");
    var to = env.INSTR_NOTIFY || "onboardsupport@dg3.com";
    var html = "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#16293D\">" +
      "<p><strong>" + instrEsc(o.crew_name) + "</strong> (" + instrEsc(o.agency_id) + ") has acknowledged the <strong>sign-off instructions</strong> for <strong>" + instrEsc(o.vessel || "") + "</strong>.</p>" +
      "<p style=\"color:#6B7280\">Sign-off date: " + instrEsc(o.sign_off_date || "") + " &middot; Port: " + instrEsc(o.port || "") + "<br>Acknowledged at: " + instrEsc(o.acknowledged_at || "") + "</p>" +
      "<p style=\"font-size:11px;color:#6B7280\">Automated &middot; DG3 CIMS Crew Operations.</p></div>";
    var _ackFmt = "";
    try { if (o.acknowledged_at) _ackFmt = new Date(o.acknowledged_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + " (Miami)"; }
    catch (e) { _ackFmt = o.acknowledged_at || ""; }
    var _nm = instrEsc(o.crew_name || ""), _ai = instrEsc(o.agency_id || ""), _ve = instrEsc(o.vessel || ""), _dt = instrEsc(o.sign_off_date || ""), _pt = instrEsc(o.port || ""), _ak = instrEsc(_ackFmt);
    var _rw = function (k, v, last) { var b = last ? "" : "border-bottom:1px solid #EEF1F5;"; return '<tr><td style="padding:10px 14px;' + b + 'font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7C93;width:42%;">' + k + '</td><td style="padding:10px 14px;' + b + 'font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;font-weight:bold;">' + v + '</td></tr>'; };
    html = '<div style="margin:0;padding:0;background:#E9EDF3;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E9EDF3;"><tr><td align="center" style="padding:28px 12px;">' +
      '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">' +
      '<tr><td style="padding:0 4px 14px 4px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td align="center" valign="middle" width="34" height="34" style="width:34px;height:34px;background:#5FB946;border-radius:9px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:18px;color:#ffffff;line-height:34px;">D</td>' +
      '<td style="padding-left:10px;font-family:Arial,Helvetica,sans-serif;"><div style="font-weight:bold;font-size:15px;color:#1B3A5C;line-height:1.2;">DG3 CIMS</div>' +
      '<div style="font-size:9px;font-weight:bold;letter-spacing:1.2px;color:#6B7C93;text-transform:uppercase;">Sign-off instructions</div></td>' +
      '</tr></table></td></tr>' +
      '<tr><td style="background:#ffffff;border:1px solid #E4E9F0;border-radius:16px;padding:32px 30px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td align="center" valign="middle" width="44" height="44" style="width:44px;height:44px;background:#E8F6ED;border-radius:50%;font-family:Arial,Helvetica,sans-serif;font-size:22px;color:#3E8E2A;font-weight:bold;line-height:44px;">&#10003;</td>' +
      '<td valign="middle" style="padding-left:14px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#3E8E2A;">Instructions acknowledged</td>' +
      '</tr></table>' +
      '<p style="margin:18px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#16293D;"><strong>' + _nm + '</strong> (' + _ai + ') has acknowledged the <strong>sign-off instructions</strong> for <strong>' + _ve + '</strong>.</p>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border:1px solid #E4E9F0;border-radius:10px;">' +
      _rw("Crew member", _nm) + _rw("Agency ID", _ai) + _rw("Vessel", _ve) + _rw("Sign-off date", _dt) + _rw("Port", _pt) + _rw("Acknowledged", _ak, true) +
      '</table>' +
      '<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6B7C93;">Automated &middot; DG3 CIMS Crew Operations.</p>' +
      '</td></tr></table></td></tr></table></div>';
    var out = await sendViaMailer(env, {
      to: [to], subject: "Instructions acknowledged — " + (o.crew_name || "") + " (" + (o.vessel || "") + ")", html: html,
      templateId: "hr.signoff.instructions-confirm.v1", critical: true,
      idempotencyKey: "hr.signoff.instructions-confirm.v1:" + o.instr_id
    });
    if (!out.ok) throw new Error("mailer_" + (out.error || out.status || "failed"));
  }



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
  async function sendInstructionsFor(env, sc, seq, origin, ovr) {
    await ensureInstr(env);
    var r = await resolveInstr(env, String(sc), parseInt(seq), ovr || null);
    if (!r) return { emailed: false, error: "signoff_not_found" };
    if (!r.email) return { emailed: false, hasEmail: false, crew_name: r.crew_name };
    var ctx = (ovr && ovr.ctx) || await contextFor(env, r.sc);
    if (ctx && ctx.instruct === false) return { emailed: false, error: "not_instructed", crew_name: r.crew_name, to: r.email };   // a training visit
    if (passedSignOff(ctx, r)) return { emailed: false, error: "signoff_passed", crew_name: r.crew_name, to: r.email };
    var token = await signToken({ p: "instr", sc: r.sc, seq: r.seq, exp: Math.floor(Date.now() / 1000) + INSTR_TTL }, env.SESSION_SECRET);
    var th = await sha256hex(token);
    var now = new Date().toISOString();
    await env.DB.prepare("DELETE FROM instr_ack WHERE sc=? AND seq=?").bind(r.sc, r.seq).run();
    var insId = "ins_" + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO instr_ack (id,sc,seq,crew_id,token_hash,status,crew_name,vessel,port,sign_off_date,requested_by,requested_at) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?)").bind(insId, r.sc, r.seq, r.crew_id, th, r.crew_name, r.vessel, r.port, r.sign_off_date, "auto-timing", now).run();
    var link = origin + "/instr?t=" + token;
    try { await sendInstructions(env, { to: r.email, r: r, ctx: ctx, link: link, instr_id: insId }); } catch (e) { return { emailed: false, error: String(e).slice(0, 120), crew_name: r.crew_name, to: r.email }; }
    try { var rp = await sendRelieverPass(env, r, ctx); return { emailed: true, crew_name: r.crew_name, to: r.email, reliever: rp }; }
    catch (e) { return { emailed: false, error: String(e).slice(0, 120), crew_name: r.crew_name, to: r.email }; }
  }
  instrHandle.sendInstructionsFor = sendInstructionsFor;

  return instrHandle;
}
