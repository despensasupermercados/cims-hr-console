// ============================================================================
// CIMS - Crew Sign-off Acknowledgement (/ack)  ·  self-contained module
// ============================================================================
// Emails + landing are the APPROVED designs (ack-1/2/3), demo values tokenized,
// landing demo-script swapped for real /api/ack/form + /api/ack/submit calls.
//
// USAGE (src/worker.js): import { installAck } from "./signoff_ack.js";
//   inside fetch(request, env), AFTER  const session = await getSession(request, env);  add:
//   { const _a = await installAck({ json, htmlResponse, signToken, verifyToken, sha256hex,
//       logActivity, applyOverride, VESSEL_REF, sendViaMailer })(url.pathname, request, env, url, session);
//     if (_a) return _a; }
// Env ACK_NOTIFY (default onboardsupport@dg3.com).
// ============================================================================
import { memoDdl } from "./ensure_memo.js";
import { linkEmail, CONFIRMS, TEMPLATE_ID as LINK_TEMPLATE } from "./emails/hr.signoff.link.v2.js";
import { shipFullName, portName, firstWord } from "./emails/hr.signoff.instructions.v2.js";
import { shipCode } from "./ship_codes.js";
import { mdShort } from "./span_md.js";
import { contractKey } from "./signoff_context.js";

// Hoisted to module scope 2026-09-10 so the DEPLOY GATE can reach it. This page's inline
// <script> was NOT covered by scripts/verify_client_scripts.mjs while it lived inside the
// installAck() closure — and /ack is a PUBLIC seafarer page, so a syntax error here would
// white-screen a crew member's sign-off link with nobody internal ever seeing it. Static
// string, no deps referenced: the move is a pure relocation.
// THE CONFIRMATION PAGE IN THE PASS STYLE (Miguel, 23 Oct 2026, the render approved: "all approved"). The 7-day email's one
// button opens it; nothing is recorded until the crew taps Confirm here (a mail scanner opens every link in an email, so the
// click in the email confirms nothing). The same pass as the emails, the four lines the crew confirms (CONFIRMS, served by
// /api/ack/form), ONE button — no tick box. A row filed before the pass was kept reads from its old fields.
export const ACK_HTML = String.raw`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Confirm your sign-off &middot; CIMS</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{--navy:#1B3A5C;--deep:#142D48;--green:#5FB946;--gink:#3E7F2E;--gt:#EAF4E6;--mut:#6B7280;--line:#E5E7EB;--cloud:#F3F4F6;--body:#374151}
*{box-sizing:border-box;margin:0}body{font-family:'DM Sans',Helvetica,Arial,sans-serif;background:var(--cloud);color:var(--body);-webkit-font-smoothing:antialiased}
.mast{background:var(--deep);border-top:4px solid var(--green);padding:18px 20px}.mast b{font-family:Outfit,Helvetica,Arial,sans-serif;color:#fff;letter-spacing:5px;font-size:18px}.mast small{display:block;color:#95A0AD;font-size:7px;letter-spacing:2px;font-weight:700;margin-top:6px}
.wrap{max-width:560px;margin:0 auto;padding:24px 16px 40px}h1{font-family:Outfit,Helvetica,Arial,sans-serif;color:var(--navy);font-size:30px;line-height:1.12;letter-spacing:-.4px}h1 span{color:#9CA3AF}
.lead{font-size:15px;line-height:1.55;margin-top:10px}.card{background:#fff;border-radius:16px;box-shadow:0 1px 0 var(--line),0 10px 30px -18px rgba(20,45,72,.35);overflow:hidden;margin-top:20px}
.band{background:var(--deep);display:flex;justify-content:space-between;padding:13px 20px;font-size:11px;font-weight:700;letter-spacing:2px;color:#95A0AD}.band i{font-style:normal;color:var(--green);letter-spacing:1px}
.sec{padding:16px 20px}.lab{font-size:10px;font-weight:700;letter-spacing:1.6px;color:var(--mut);text-transform:uppercase}
.route{display:grid;grid-template-columns:1fr 70px 1fr;align-items:end}.code{font-family:Outfit,Helvetica,Arial,sans-serif;font-size:32px;font-weight:700;color:var(--navy);letter-spacing:1px}.sub{font-size:13px;color:var(--mut)}
.line{border-top:2px dashed #9CA3AF;margin:0 6px 26px}.r{text-align:right}.val{font-family:Outfit,Helvetica,Arial,sans-serif;font-weight:600;font-size:18px;color:var(--navy);margin-top:4px}
.two{display:grid;grid-template-columns:1fr 1fr;margin-top:14px}.chipl{background:var(--cloud);border-radius:10px;padding:9px 12px;font-size:13px;color:var(--mut);margin-top:12px}.chipl b{color:var(--navy)}
.tear{border-top:2px dashed var(--line);margin:0 12px}.tk{display:flex;gap:10px;font-size:14.5px;line-height:1.45;margin-top:12px}.tk span{flex:none;width:20px;height:20px;border-radius:10px;background:var(--gt);color:var(--gink);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.btn{display:block;width:100%;border:0;border-radius:12px;background:var(--green);color:#fff;font:700 16px 'DM Sans',Helvetica,Arial,sans-serif;padding:16px;cursor:pointer}.btn:disabled{background:#C4CDD9;cursor:default}
.fine{font-size:12.5px;color:var(--mut);text-align:center;margin-top:10px;line-height:1.5}
.ok{display:flex;gap:12px;align-items:center;background:var(--gt);border-radius:12px;padding:14px 16px;color:var(--gink);font-weight:700}.ok span{flex:none;width:28px;height:28px;border-radius:14px;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center}
[hidden]{display:none!important}@media(min-width:700px){.wrap{padding-top:40px}}
</style></head><body>
<div class="mast"><b>CIMS</b><small>CRUISE INDUSTRY MANAGED SERVICES</small></div>
<div class="wrap">
 <h1 id="h1">Confirm your sign-off.<br><span id="h2">One tap and you are done.</span></h1>
 <p class="lead" id="lead">Check the dates first. If one is wrong, don't confirm: reply to Rita's email.</p>
 <div class="card" id="card" hidden>
  <div class="band">SIGN-OFF PASS<i id="tag">CONFIRM</i></div>
  <div class="sec"><div class="route"><div><div class="lab">From</div><div class="code" id="code">&nbsp;</div><div class="sub" id="ship"></div></div><div class="line"></div><div class="r"><div class="lab">To</div><div class="code">HOME</div><div class="sub" id="port"></div></div></div></div>
  <div class="sec" style="padding-top:0"><div class="lab">Seafarer</div><div class="val" id="who"></div><div class="sub" id="pos"></div>
   <div class="two"><div><div class="lab">Signed on</div><div class="val" id="on">&ndash;</div></div><div class="r"><div class="lab">Sign-off</div><div class="val" id="off">&ndash;</div></div></div>
   <div class="chipl" id="aboard" hidden></div></div>
  <div class="tear"></div>
  <div class="sec"><div class="lab" id="says">When you confirm, you say</div><div id="items"></div></div>
  <div class="tear"></div>
  <div class="sec" id="act"><button class="btn" id="go" type="button">Confirm my sign-off</button><p class="fine">Recorded with the time, and sent to Rita and onboardsupport@dg3.com.</p></div>
  <div class="sec" id="done" hidden><div class="ok"><span>&#10003;</span><div id="stamp">Confirmed</div></div><p class="fine">You can close this page. The link now shows this confirmation only.</p></div>
 </div>
</div>
<script>
(function(){
  var T = new URLSearchParams(location.search).get('t');
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function $(id){ return document.getElementById(id); }
  function day(d){ d = String(d || '').slice(0, 10); return /^\d{4}-\d\d-\d\d$/.test(d) ? (+d.slice(8, 10)) + ' ' + MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) : ''; }
  function stampOf(at){ var d = new Date(at); if (isNaN(d)) return 'Confirmed'; return 'Confirmed ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function text(id, v){ var e = $(id); if (e) e.textContent = v == null ? '' : v; }
  function bad(msg){ text('h1', ''); $('h1').innerHTML = 'This link does not open.'; text('lead', msg || 'Reply to the email it came in, and Rita sends you a new one.'); $('card').hidden = true; }
  var first = '';
  function done(at){
    $('h1').innerHTML = ''; $('h1').appendChild(document.createTextNode('Thank you' + (first ? ', ' + first : '') + '.'));
    $('h1').appendChild(document.createElement('br')); var s = document.createElement('span'); s.textContent = 'Your sign-off is confirmed.'; $('h1').appendChild(s);
    text('lead', 'Rita has it. Safe travels home.'); text('tag', 'CONFIRMED'); text('says', 'You confirmed');
    $('act').hidden = true; $('done').hidden = false; text('stamp', stampOf(at || new Date().toISOString())); window.scrollTo(0, 0);
  }
  function load(){
    if (!T) { bad('This link is missing its key.'); return; }
    fetch('/api/ack/form?t=' + encodeURIComponent(T), { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.ok) { bad(); return; }
      var p = d.pass || {};
      first = p.first || '';
      text('code', p.code || ''); text('ship', p.ship || d.vessel || ''); text('port', p.port ? 'via ' + p.port : 'Port to be confirmed');
      text('who', p.name || d.crew_name || ''); text('pos', p.position || '');
      text('on', day(p.on) || '–'); text('off', day(p.off || d.sign_off_date) || 'To confirm');
      if (p.aboard) { $('aboard').hidden = false; $('aboard').innerHTML = ''; var b = document.createElement('b'); b.textContent = p.aboard; $('aboard').appendChild(b); $('aboard').appendChild(document.createTextNode(' aboard ' + (p.ship || ''))); }
      var box = $('items'); box.innerHTML = '';
      (d.confirms || []).forEach(function(t){ var row = document.createElement('div'); row.className = 'tk'; var i = document.createElement('span'); i.textContent = '✓'; var x = document.createElement('div'); x.textContent = t; row.appendChild(i); row.appendChild(x); box.appendChild(row); });
      $('card').hidden = false;
      if (d.locked) done(d.ack_at);
    }).catch(function(){ text('lead', 'Could not load. Check your signal and open the link again.'); });
  }
  $('go').onclick = function(){
    var b = $('go'); if (b.disabled) return; b.disabled = true; b.textContent = 'Recording…';
    fetch('/api/ack/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: T }) }).then(function(r){ return r.json(); }).then(function(r){
      if (r && r.ok) { done(r.ack_at); return; }
      b.disabled = false; b.textContent = 'Confirm my sign-off'; alert('Not recorded. Please try again.');
    }).catch(function(){ b.disabled = false; b.textContent = 'Confirm my sign-off'; alert('No connection. Please try again.'); });
  };
  load();
})();
</script>
</body></html>`;

export function installAck(deps) {
  const { json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, sendViaMailer } = deps;

  var ACK_TTL = 60 * 60 * 24 * 30; // 30 days (mirrors FB_TTL)

  // Once per database per isolate (16 Oct 2026): this CREATE ran on every request that reached the module (§12).
  const ensureAck = memoDdl(ensureAckDdl);
  async function ensureAckDdl(env) {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS ack_request (" +
      " id TEXT PRIMARY KEY, sc TEXT NOT NULL, seq INTEGER NOT NULL, crew_id TEXT," +
      " token_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'," +
      " crew_name TEXT, vessel TEXT, port TEXT, sign_off_date TEXT," +
      " requested_by TEXT, requested_at TEXT NOT NULL," +
      " ack_at TEXT, ack_ip TEXT, ack_ua TEXT, UNIQUE (sc, seq) )"
    ).run();
    // The pass the email and the page show (23 Oct 2026), kept on the row at request time. One ALTER, swallowed only when the
    // column is already there (the addColumn rule, §11e); any other error fails the guard so it is tried again.
    try { await env.DB.prepare("ALTER TABLE ack_request ADD COLUMN pass_json TEXT").run(); }
    catch (e) { if (!/duplicate column/i.test(String((e && e.message) || e))) throw e; }
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
  // THE SEAT, NOT THE COUNTER POSITION (8 Oct 2026). Since 7 Oct the Contract Counter is history (§10d): a seat dated
  // from the TDG file has no keyman_contract3 row at that seq, so the button failed (signoff_not_found), or the crew was
  // emailed their PREVIOUS ship and sign-off. The crew's current contract on the board schedule — already carrying Rita's
  // recorded sign-off and TDG's word (the ladder) — is used when there is one; the Counter row only otherwise.
  async function seatLeg(env, sc, seq) {
    if (!deps.boardLegs) return null;
    var legs = (await deps.boardLegs(env).catch(function () { return null; })) || [];
    var cur = legs.filter(function (l) { return l && l.ours && l.sc === sc && l.is_current && l.off; }).sort(function (a, b) { return a.on < b.on ? 1 : -1; })[0];
    return cur ? { sc: sc, seq: seq, ship: cur.ship, on: cur.on || null, proj_off: cur.off, act_off: null, port: cur.disembark || null, fromBoard: true, visit: !!cur.visit } : null;
  }
  async function resolveSignoff(env, sc, seq, ovr) {
    var leg = ovr || await env.DB.prepare("SELECT sc, seq, ship, proj_off, act_off FROM keyman_contract3 WHERE sc=? AND seq=?").bind(sc, seq).first();
    if (!leg) return null;
    var ed = (ovr && ovr.fromBoard) ? {} : ((await env.DB.prepare("SELECT ship, sign_off, disembark FROM contract_edit WHERE sc=? AND seq=?").bind(sc, seq).first()) || {});
    var base = await env.DB.prepare("SELECT * FROM crew WHERE agency_id=?").bind(sc).first();
    var ov = await env.DB.prepare("SELECT * FROM crew_override WHERE agency_id=?").bind(sc).first();
    var c = base ? applyOverride(base, ov) : {};
    var vessel = ed.ship || leg.ship || null;
    var sign_off = ed.sign_off || leg.act_off || leg.proj_off || null;
    var port = ed.disembark || (ovr && ovr.port) || null; // never the home-port seed (§11e), like the instructions
    var name = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ").trim();
    return { sc: sc, seq: seq, crew_id: base ? base.id : null, crew_name: name, first_name: c.first_name || "", last_name: c.last_name || "", position: c.rank_override || c.rank_observed || null,
      email: c.email || null, agency_id: sc, vessel: vessel, port: port, sign_on_date: (ovr && ovr.on) || null, sign_off_date: sign_off };
  }
  // The board's seat (deps.ackContext = the instructions' instrSeatContext): brand, sign-on, sign-off, port. Missing -> what
  // the request resolved.
  async function contextFor(env, sc) {
    if (!deps.ackContext) return null;
    try { return (await deps.ackContext(env, sc)) || null; } catch (e) { return null; }
  }
  // The pass, ONE shape for the email and the page (kept on the row, so the page shows what the email showed).
  function passOf(r, ctx) {
    ctx = ctx || {};
    var brand = ctx.brand || null, ship = shipFullName(ctx.ship || r.vessel, brand || "Royal"), port = portName(ctx.port || r.port);
    var on = ctx.on || r.sign_on_date || null, off = ctx.off || r.sign_off_date || null;
    return { first: firstWord(r.first_name) || null, name: [firstWord(r.first_name), r.last_name].filter(Boolean).join(" ") || r.crew_name, position: r.position || null,
      ship: ship || null, brand: brand, code: shipCode(ship) || null, port: port || null, on: on, off: off };
  }

  // Months and days have ONE definition (span_md, §11e).
  function aboardOf(a, b) { return mdShort(a, b) || null; }
  // Never ask to confirm a sign-off that has already passed (the instructions' rule, 17 Oct 2026: a held seat's board
  // sign-off is the reliever's embark, so the pass would read "One week to go" for a date already behind him).
  function passedOff(pass, r) {
    var off = String((pass && pass.off) || (r && r.sign_off_date) || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(off) && off < new Date().toISOString().slice(0, 10) ? off : null;
  }

  // ---- Endpoints ---------------------------------------------------------------
  // POST /api/ack/request   (session-gated; any allowlisted user)
  async function apiAckRequest(request, env, session) {
    await ensureAck(env);
    var b = await request.json().catch(function () { return {}; });
    if (!b.sc || b.seq == null) return json({ error: "missing_sc_seq" }, 400);
    var seat = await seatLeg(env, String(b.sc), parseInt(b.seq));
    // A training visit gets no sign-off link (Miguel, 17 Oct 2026; visits.js): the trainer is not signing off a contract.
    if (seat && seat.visit) return json({ ok: false, error: "training_visit" }, 409);
    var r = await resolveSignoff(env, String(b.sc), parseInt(b.seq), seat || undefined);
    if (!r) return json({ error: "signoff_not_found" }, 404);
    // Never wipe an acknowledgement the seafarer already gave (8 Oct 2026): a second press used to DELETE the
    // acknowledged row (ack_at, ip, user agent) and revoke the link they had answered. Resend only with force.
    // One row per contract, keyed by the sign-off date as the daily run keys it (signoff_context.contractKey, 27 Oct 2026).
    r.seq = contractKey(r);
    var prev = await env.DB.prepare("SELECT status FROM ack_request WHERE sc=? AND seq=?").bind(r.sc, r.seq).first();
    if (prev && prev.status === "acknowledged" && !b.force) return json({ ok: false, error: "already_acknowledged" }, 409);
    var token = await signToken({ p: "ack", sc: r.sc, seq: r.seq, exp: Math.floor(Date.now() / 1000) + ACK_TTL }, env.SESSION_SECRET);
    var pass = passOf(r, await contextFor(env, r.sc));
    var past = passedOff(pass, r);
    if (b.send && past) return json({ ok: false, error: "signoff_passed", sign_off: past }, 409);
    var th = await sha256hex(token);
    var now = new Date().toISOString();
    await env.DB.prepare("DELETE FROM ack_request WHERE sc=? AND seq=?").bind(r.sc, r.seq).run();
    var ackId = "ack_" + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO ack_request (id,sc,seq,crew_id,token_hash,status,crew_name,vessel,port,sign_off_date,requested_by,requested_at,pass_json) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?,?)")
      .bind(ackId, r.sc, r.seq, r.crew_id, th, r.crew_name, r.vessel, pass.port || r.port, r.sign_off_date, (session && session.email) || null, now, JSON.stringify(pass)).run();
    var link = new URL(request.url).origin + "/ack?t=" + token;
    var emailed = false;
    if (b.send && r.email) {
      try { await sendAckRequest(env, { to: r.email, pass: pass, link: link, ack_id: ackId }); emailed = true; }
      catch (e) {
        // A mail that did not go leaves no row (27 Oct 2026 review): the daily run skipped a pending row as "manual send
        // on file" for ever, and the page said the crew had no email on file.
        await env.DB.prepare("DELETE FROM ack_request WHERE id=?").bind(ackId).run().catch(function () {});
        await logActivity(env, session && session.email, "ack_request_send_failed", r.sc + " #" + r.seq);
        return json({ ok: false, error: "not_sent", detail: String((e && e.message) || e).slice(0, 120), crew_name: r.crew_name }, 502);
      }
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
    var row = await env.DB.prepare("SELECT status, crew_name, vessel, port, sign_off_date, ack_at, pass_json FROM ack_request WHERE token_hash=?").bind(th).first();
    if (!row) return json({ error: "revoked" }, 401);
    var pass = null; try { pass = row.pass_json ? JSON.parse(row.pass_json) : null; } catch (e) { pass = null; }
    if (!pass) pass = { name: row.crew_name, ship: row.vessel, port: portName(row.port), off: row.sign_off_date };
    if (pass.on && pass.off) pass.aboard = aboardOf(pass.on, pass.off);
    return json({ ok: true, crew_name: row.crew_name, vessel: row.vessel, port: row.port, sign_off_date: row.sign_off_date, status: row.status, locked: row.status !== "pending", ack_at: row.ack_at || null,
      pass: pass, confirms: CONFIRMS(pass.ship, pass.port) });
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
    if (row.status === "acknowledged") return json({ ok: true, already: true, ack_at: row.ack_at || null }, 200); // idempotent — no re-send
    var now = new Date().toISOString();
    await env.DB.prepare("UPDATE ack_request SET status='acknowledged', ack_at=?, ack_ip=?, ack_ua=? WHERE token_hash=?")
      .bind(now, request.headers.get("cf-connecting-ip") || null, request.headers.get("user-agent") || null, th).run();
    try {
      await sendAckConfirmation(env, { crew_name: row.crew_name, agency_id: row.sc, vessel: row.vessel, sign_off_port: row.port, sign_off_date: row.sign_off_date, acknowledged_at: now, ack_id: row.id });
    } catch (e) {
      await logActivity(env, null, "ack_confirm_send_failed", row.sc + " #" + row.seq); // record ack anyway, don't swallow silently
    }
    await logActivity(env, null, "ack_submit", row.sc + " #" + row.seq);
    return json({ ok: true, ack_at: now });
  }

  // ---- Email senders (central cims-mailer service binding; this module only builds content — spec §8) -----
  // The 7-day email in the pass style (hr.signoff.link.v2, approved 23 Oct 2026). Reply-to Rita, who signs it.
  async function sendAckRequest(env, o) {
    if (!env.MAILER) throw new Error("no_mailer");
    var p = o.pass || {};
    var mail = linkEmail({ firstName: p.first, crewName: p.name, position: p.position, ship: p.ship, brand: p.brand, signOn: p.on, signOff: p.off,
      port: p.port, link: o.link, today: new Date().toISOString().slice(0, 10) });
    var out = await sendViaMailer(env, {
      to: [o.to], replyTo: "Rita.Berenyi@dg3.com", subject: mail.subject, html: mail.html, text: mail.text,
      templateId: LINK_TEMPLATE, critical: true,
      idempotencyKey: LINK_TEMPLATE + ":" + o.ack_id
    });
    if (!out.ok) throw new Error("mailer_" + (out.error || out.status || "failed"));
  }
  async function sendAckConfirmation(env, o) {
    if (!env.MAILER) throw new Error("no_mailer");
    var to = env.ACK_NOTIFY || "onboardsupport@dg3.com";
    var html = ackFill(ACK_CONFIRM_EMAIL, { crew_name: o.crew_name, agency_id: o.agency_id, vessel: o.vessel, sign_off_port: o.sign_off_port, sign_off_date: o.sign_off_date, acknowledged_at: o.acknowledged_at });
    var out = await sendViaMailer(env, {
      to: [to], subject: "Sign-off acknowledged — " + (o.crew_name || "") + " (" + (o.vessel || "") + ")", html: html,
      templateId: "hr.signoff.ack-confirm.v1", critical: true,
      idempotencyKey: "hr.signoff.ack-confirm.v1:" + o.ack_id
    });
    if (!out.ok) throw new Error("mailer_" + (out.error || out.status || "failed"));
  }

  // hr.signoff.ack-request.v1 (July: the retired navy bar, Arial only, an ISO date) is retired: the 7-day email is
  // hr.signoff.link.v2 since 23 Oct 2026.
  const ACK_CONFIRM_EMAIL = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<title>Sign-off acknowledged</title>\n<meta name=\"format-detection\" content=\"telephone=no,date=no,address=no,email=no\">\n<style>\n  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important;pointer-events:none !important}\n  @media only screen and (max-width:620px){\n    .wrap{width:100% !important;max-width:100% !important}\n    .pagepad{padding:14px 10px !important}\n    .px{padding-left:16px !important;padding-right:16px !important}\n    .h1{font-size:21px !important}\n    .bd{font-size:15px !important;line-height:1.6 !important}\n  }\n</style>\n</head>\n<body style=\"margin:0;padding:0;background:#EEF1F4;\">\n<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;\">{{crew_name}} acknowledged the {{vessel}} sign-off on {{acknowledged_at}}.</div>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"#EEF1F4\" style=\"background:#EEF1F4;\">\n <tr><td align=\"center\" class=\"pagepad\" style=\"padding:24px 12px;\">\n  <table role=\"presentation\" class=\"wrap\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:600px;\">\n\n   <!-- brand bar -->\n   <tr><td bgcolor=\"#16314F\" class=\"px\" style=\"background:#16314F;padding:18px 24px;border-radius:8px 8px 0 0;\">\n     <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>\n       <td style=\"font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#FFFFFF;letter-spacing:1px;\">CIMS</td>\n       <td align=\"right\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#AEC1D6;letter-spacing:.5px;\">SIGN-OFF ACKNOWLEDGED</td>\n     </tr></table>\n   </td></tr>\n\n   <!-- title + check -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:26px 28px 4px 28px;\">\n     <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>\n       <td valign=\"middle\" style=\"padding-right:12px;\">\n         <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"center\" valign=\"middle\" width=\"40\" height=\"40\" bgcolor=\"#E8F6ED\" style=\"background:#E8F6ED;border-radius:50%;font-family:Arial,Helvetica,sans-serif;font-size:22px;color:#3E8E2A;font-weight:bold;line-height:40px;\">&#10003;</td></tr></table>\n       </td>\n       <td valign=\"middle\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:bold;color:#1B3A5C;\">Sign-off acknowledged</td>\n     </tr></table>\n   </td></tr>\n\n   <!-- body -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:12px 28px 6px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1A2430;\">\n     <p style=\"margin:0;\"><strong>{{crew_name}}</strong> has acknowledged the end-of-contract sign-off message for <strong>{{vessel}}</strong>.</p>\n   </td></tr>\n\n   <!-- details -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:14px 28px 6px 28px;\">\n     <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border:1px solid #E5E7EB;border-radius:10px;\">\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;width:42%;\">Crew member</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;font-weight:bold;\">{{crew_name}}</td></tr>\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Agency ID</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;\">{{agency_id}}</td></tr>\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Vessel</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;\">{{vessel}}</td></tr>\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Sign-off port</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;\">{{sign_off_port}}</td></tr>\n       <tr><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Sign-off date</td><td style=\"padding:11px 14px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;\">{{sign_off_date}}</td></tr>\n       <tr><td style=\"padding:11px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;\">Acknowledged at</td><td style=\"padding:11px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16293D;font-weight:bold;\">{{acknowledged_at}}</td></tr>\n     </table>\n   </td></tr>\n\n   <!-- footer -->\n   <tr><td bgcolor=\"#FFFFFF\" style=\"background:#FFFFFF;padding:18px 28px 26px 28px;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;margin-top:10px;\">\n     <div style=\"font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;line-height:1.6;\">\n       Automated confirmation &middot; generated when the crew member clicked Acknowledge.<br>\n       DG3 Cruise Industry Managed Services &middot; CIMS Crew Operations.\n     </div>\n   </td></tr>\n\n  </table>\n </td></tr>\n</table>\n</body></html>\n";

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
  async function sendSignoffLinkFor(env, sc, seq, origin, ovr) {
    await ensureAck(env);
    if (ovr && ((ovr.ctx && ovr.ctx.visit) || ovr.visit)) return { emailed: false, error: "training_visit" }; // visits.js
    var r = await resolveSignoff(env, String(sc), parseInt(seq), ovr || null);
    if (!r) return { emailed: false, error: "signoff_not_found" };
    if (!r.email) return { emailed: false, hasEmail: false, crew_name: r.crew_name };
    var pass = passOf(r, (ovr && ovr.ctx) || await contextFor(env, r.sc));
    if (passedOff(pass, r)) return { emailed: false, error: "signoff_passed", crew_name: r.crew_name, to: r.email };
    var token = await signToken({ p: "ack", sc: r.sc, seq: r.seq, exp: Math.floor(Date.now() / 1000) + ACK_TTL }, env.SESSION_SECRET);
    var th = await sha256hex(token);
    var now = new Date().toISOString();
    await env.DB.prepare("DELETE FROM ack_request WHERE sc=? AND seq=?").bind(r.sc, r.seq).run();
    var ackId = "ack_" + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO ack_request (id,sc,seq,crew_id,token_hash,status,crew_name,vessel,port,sign_off_date,requested_by,requested_at,pass_json) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?,?)").bind(ackId, r.sc, r.seq, r.crew_id, th, r.crew_name, r.vessel, pass.port || r.port, r.sign_off_date, "auto-timing", now, JSON.stringify(pass)).run();
    var link = origin + "/ack?t=" + token;
    try { await sendAckRequest(env, { to: r.email, pass: pass, link: link, ack_id: ackId }); return { emailed: true, crew_name: r.crew_name, to: r.email }; }
    catch (e) {
      await env.DB.prepare("DELETE FROM ack_request WHERE id=?").bind(ackId).run().catch(function () {});   // retried next morning
      return { emailed: false, error: String(e).slice(0, 120), crew_name: r.crew_name, to: r.email };
    }
  }
  ackHandle.sendSignoffLinkFor = sendSignoffLinkFor;

  return ackHandle;
}
