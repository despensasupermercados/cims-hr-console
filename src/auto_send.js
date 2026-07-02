// ============================================================================
// CIMS — Auto-timing (T-14 instructions, T-7 sign-off link) + daily digest
// ============================================================================
// Plugs into the existing hourly scheduled() handler. Gates itself to run ONCE
// per day at 08:00 Europe/Budapest (timezone-aware, so DST is automatic).
//
// WINDOW model (self-heals a missed run): a leg qualifies for instructions when
// its effective sign-off date (COALESCE(act_off, proj_off)) is between today and
// today+14; for the sign-off link, between today and today+7. Each (sc, seq,
// kind) fires at most once — tracked in auto_send_log, and ONLY successful sends
// are logged, so a transient failure retries the next day.
//
// HISTORY: seed auto_send_log at go-live (mark everything already inside the
// window as done) so nobody prior to go-live is emailed. Only fresh crossings
// fire afterward.
//
// NO EMAIL ON FILE: never silently skipped. Reported as a red "needs attention"
// alert in the digest (to you + Rita) and NOT logged, so it re-surfaces daily
// until an address is added.
//
// DRY RUN (env.AUTO_SEND_DRY_RUN === "true"): computes + reports what WOULD send,
// sends the digest only, sends nothing to seafarers, logs nothing.
//
// USAGE (src/worker.js), after the instr + ack senders are exposed:
//   const runAutoSend = installAutoSend({
//     sendInstructionsFor, sendSignoffLinkFor, sendViaMailer,
//     ORIGIN: "https://cims.work",
//     DIGEST_TO: ["Miguel.Sanmartin@dg3.com"], DIGEST_CC: ["Rita.Berenyi@dg3.com"]
//   });
//   // inside scheduled(event, env, ctx):
//   if (ctx && ctx.waitUntil) ctx.waitUntil(runAutoSend(env, event));
// ============================================================================

export function installAutoSend(deps) {
  const { sendInstructionsFor, sendSignoffLinkFor, sendViaMailer, BOARD_LEGS, ORIGIN, DIGEST_TO, DIGEST_CC } = deps;

  const GATE_TZ = "Europe/Budapest";
  const GATE_HOUR = "08";

  function todayStr() { return new Date().toISOString().slice(0, 10); }             // date at 08:00 Budapest == correct calendar day
  function plus(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  function hourIn(tz, now) {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).formatToParts(now)
      .reduce(function (a, p) { if (p.type === "hour") a = p.value; return a; }, "");
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  async function ensureLog(env) {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS auto_send_log (sc TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL," +
      " sent_at TEXT NOT NULL, note TEXT, PRIMARY KEY (sc, seq, kind))"
    ).run();
  }

  // Legs due within [today, upper] - sourced from the LIVE Keyman board
  // (rotationSections via BOARD_LEGS): the same resolved sign-off dates the
  // board displays and billing uses. NOT keyman_contract3 (historical only).
  // seq is the numeric sign-off date (YYYYMMDD) - stable per leg for the
  // auto_send_log / instr_ack (sc,seq) keys, never colliding with Keyman seqs.
  async function dueWithin(env, today, upper) {
    var legs = BOARD_LEGS ? await BOARD_LEGS(env) : [];
    var em = {}, red = {};
    for (var r of (await env.DB.prepare("SELECT agency_id, email, redacted FROM crew").all()).results || []) { em[r.agency_id] = r.email || null; red[r.agency_id] = !!r.redacted; }
    var out = [];
    for (var l of legs) {
      if (!l.off || l.off < today || l.off > upper || red[l.sc]) continue;
      out.push({ sc: l.sc, seq: parseInt(String(l.off).replace(/-/g, ""), 10) || 0, off: l.off, ship: l.ship || null, port: l.port || null, name: l.name || null, email: em[l.sc] || null });
    }
    out.sort(function (a, b) { return a.off < b.off ? -1 : a.off > b.off ? 1 : 0; });
    return out;
  }

  async function already(env, sc, seq, kind) {
    return !!(await env.DB.prepare("SELECT 1 FROM auto_send_log WHERE sc=? AND seq=? AND kind=?").bind(sc, seq, kind).first());
  }
  async function markSent(env, sc, seq, kind, note) {
    await env.DB.prepare("INSERT OR REPLACE INTO auto_send_log (sc,seq,kind,sent_at,note) VALUES (?,?,?,?,?)")
      .bind(sc, seq, kind, new Date().toISOString(), note || null).run();
  }

  // A manual send (crew-page button) already created a request row for this leg.
  // Never re-send on top of it: re-sending would DELETE + re-insert the row,
  // invalidating the emailed link and wiping any acknowledgement.
  async function manualExists(env, sc, off, kind) {
    var tbl = kind === "instructions" ? "instr_ack" : "ack_request";
    try { return !!(await env.DB.prepare("SELECT 1 FROM " + tbl + " WHERE sc=? AND sign_off_date IS NOT NULL AND abs(julianday(sign_off_date) - julianday(?)) <= 21").bind(sc, off).first()); } catch (e) { return false; }
  }

  async function processKind(env, today, upper, kind, sender, DRY, sent, alerts) {
    for (const leg of await dueWithin(env, today, upper)) {
      if (await already(env, leg.sc, leg.seq, kind)) continue;                 // already handled
      if (await manualExists(env, leg.sc, leg.off, kind)) {                 // manual send on file - skip, do not wipe its ack
        if (!DRY) await markSent(env, leg.sc, leg.seq, kind, "manual-preexisting");
        continue;
      }
      var rec = { kind: kind, sc: leg.sc, seq: leg.seq, off: leg.off, ship: leg.ship, name: leg.name || null, to: leg.email || null, emailed: false, error: null };

      if (!leg.email) {                                                        // NO EMAIL — flag, do not send, do not log (re-surfaces daily)
        rec.error = "no_email";
        alerts.push(rec);
        continue;
      }
      if (DRY) { sent.push(rec); continue; }                                   // report only

      try {
        var res = await sender(env, leg.sc, leg.seq, ORIGIN, { ship: leg.ship, proj_off: leg.off, act_off: null, port: leg.port || null });
        rec.emailed = !!(res && res.emailed);
        rec.name = (res && res.crew_name) || null;
        rec.to = (res && res.to) || leg.email;
        if (!rec.emailed) rec.error = (res && res.error) || "not_sent";
      } catch (e) { rec.error = String(e).slice(0, 160); }

      if (rec.emailed) await markSent(env, leg.sc, leg.seq, kind, null);             // log ONLY on success -> failures retry next day
      (rec.emailed ? sent : alerts).push(rec);
    }
  }

  function rowHtml(r, kind_label, DRY) {
    var status = r.error === "no_email" ? "NO EMAIL — add address" : (DRY ? "would send" : (r.emailed ? "sent" : ("not sent — " + esc(r.error || "error"))));
    var color = r.error === "no_email" ? "#B4232A" : (DRY ? "#6B7C93" : (r.emailed ? "#3E8E2A" : "#B4232A"));
    var cell = 'padding:9px 12px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;';
    return '<tr>' +
      '<td style="' + cell + 'color:#16293D;">' + kind_label[r.kind] + '</td>' +
      '<td style="' + cell + 'color:#16293D;">' + esc(r.name || r.sc) + '</td>' +
      '<td style="' + cell + 'color:#16293D;">' + esc(r.ship || "") + '</td>' +
      '<td style="' + cell + 'color:#16293D;">' + esc(r.off || "") + '</td>' +
      '<td style="' + cell + 'color:#16293D;">' + esc(r.to || "—") + '</td>' +
      '<td style="' + cell + 'font-weight:bold;color:' + color + ';">' + status + '</td>' +
      '</tr>';
  }

  function digestHtml(sent, alerts, meta) {
    var L = { instructions: "Instructions (T-14)", signoff: "Sign-off link (T-7)" };
    var head = '<tr>' + ["Type", "Crew", "Vessel", "Sign-off", "Recipient", "Status"].map(function (h) {
      return '<td style="padding:9px 12px;border-bottom:1px solid #EEF1F5;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#6B7C93;">' + h + '</td>';
    }).join("") + '</tr>';
    var tbl = function (rows) { return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E4E9F0;border-radius:10px;border-collapse:separate;">' + head + rows.map(function (r) { return rowHtml(r, L, meta.dry); }).join("") + '</table>'; };
    var alertBanner = alerts.length
      ? '<div style="background:#FCEBEC;border:1px solid #F1B9BE;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8A1C24;"><strong>&#9888; ' + alerts.length + ' crew need an email on file</strong> — they qualified but have no address, so nothing was sent. They will keep appearing here until fixed.</div>'
      : "";
    var body = (sent.length ? tbl(sent) : '<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#16293D;">Nothing qualified today (no crew reached T-14 or T-7).</p>') +
      (alerts.length ? '<div style="height:14px"></div>' + tbl(alerts) : "");
    return '<div style="margin:0;padding:0;background:#E9EDF3;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E9EDF3;"><tr><td align="center" style="padding:26px 12px;">' +
      '<table role="presentation" width="660" cellpadding="0" cellspacing="0" border="0" style="width:660px;max-width:660px;">' +
      '<tr><td style="padding:0 4px 14px 4px;font-family:Arial,Helvetica,sans-serif;">' +
      '<span style="display:inline-block;width:30px;height:30px;background:#5FB946;border-radius:8px;color:#fff;font-weight:bold;text-align:center;line-height:30px;">D</span>' +
      '<span style="font-weight:bold;font-size:15px;color:#1B3A5C;padding-left:8px;vertical-align:middle;">DG3 CIMS &middot; Auto-timing digest</span></td></tr>' +
      '<tr><td style="background:#fff;border:1px solid #E4E9F0;border-radius:16px;padding:24px 26px;">' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7C93;margin-bottom:14px;">' +
      (meta.dry ? '<strong style="color:#B4232A;">DRY RUN</strong> &middot; nothing was sent to seafarers. ' : '') +
      'Run ' + esc(meta.date) + ' &middot; instructions window &le; ' + esc(meta.t14) + ' &middot; sign-off window &le; ' + esc(meta.t7) + '</div>' +
      alertBanner + body +
      '<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6B7C93;">Automated &middot; DG3 CIMS Crew Operations.</p>' +
      '</td></tr></table></td></tr></table></div>';
  }

  async function sendDigest(env, sent, alerts, meta) {
    var n = sent.length, a = alerts.length;
    var subj = "CIMS auto-timing " + (meta.dry ? "(dry run) " : "") + meta.date + " — " + n + " sent" + (a ? ", " + a + " need email" : "");
    var envelope = { to: DIGEST_TO, subject: subj, html: digestHtml(sent, alerts, meta), templateId: "hr.autosend.digest.v1", critical: false };
    if (DIGEST_CC && DIGEST_CC.length) envelope.cc = DIGEST_CC;
    try { await sendViaMailer(env, envelope); } catch (e) { /* digest best-effort */ }
  }

  async function runAutoSend(env, event) {
    var now = event && event.scheduledTime ? new Date(event.scheduledTime) : new Date();
    if (hourIn(GATE_TZ, now) !== GATE_HOUR) return { skipped: "not_gate_hour" };
    await ensureLog(env);
    var DRY = String(env.AUTO_SEND_DRY_RUN || "").toLowerCase() === "true";
    { let _en = false; try { const _r = await env.DB.prepare("SELECT v FROM app_setting WHERE k='auto_send_enabled'").first(); _en = !!(_r && _r.v === "true"); } catch (e) {} if (!_en) return { skipped: "disabled" }; }
    var today = todayStr(), t14 = plus(14), t7 = plus(7);
    var sent = [], alerts = [];
    await processKind(env, today, t14, "instructions", sendInstructionsFor, DRY, sent, alerts);
    await processKind(env, today, t7, "signoff", sendSignoffLinkFor, DRY, sent, alerts);
    await sendDigest(env, sent, alerts, { dry: DRY, date: today, t14: t14, t7: t7 });
    return { ran: true, dry: DRY, sent: sent.length, alerts: alerts.length };
  }

  return runAutoSend;
}
