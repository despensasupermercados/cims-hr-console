// THE CREW SURVEY'S SENDS AND ROUTES (Miguel, 22–23 Oct 2026; rules in src/crew_survey.js). Public: GET/POST
// /hub/survey/<token> — the seafarer's page, no login, the link is the key (served on hub.cims.work like the Crew Hub).
// Signed in: GET /api/survey/report (Reports › Crew survey), POST /api/survey/call (Rita logs the call to a seafarer who
// needs one), GET/POST /api/survey/auto (the Automation switch), GET /api/survey/preview (the page or an email filled with a
// crew's real data; it makes no link and sends nothing). The daily run invites the morning after the sign-off (07:00 Miami,
// like the welcome email) and reminds once after 5 days. The reads are injected by the Worker, so this module never imports
// it. FEEDBACK ONLY (§1). Pinned by test/crew_survey.test.js on real SQLite.
import { SURVEY_DDL, SURVEY_CC, SURVEY_REPLY_TO, SURVEY_ANSWERS_CC, SURVEY_LINK_DAYS, SURVEY_TZ, SURVEY_HOUR, KEYS,
  surveyDue, remindDue, checkAnswers, surveyReport, emailOk, firstWord, addDays } from "./crew_survey.js";
import { surveyInviteEmail } from "./emails/hr.survey.invite.v1.js";
import { surveyAnswersEmail } from "./emails/hr.survey.answers.v1.js";
import { surveyPage, surveyThanksPage, surveyGonePage } from "./crew_survey_page.js";
import { shipCode, shipWord } from "./ship_codes.js";
import { mdShort, mdParts } from "./span_md.js";
import { newHubToken, TOKEN_RX } from "./crew_hub_routes.js";

export const INVITE_TEMPLATE = "hr.survey.invite.v1", ANSWERS_TEMPLATE = "hr.survey.answers.v1";
export { SURVEY_DDL };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
export const dmy = (s) => (iso(s) ? `${+s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : "");
const dm = (s) => (iso(s) ? `${+s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]}` : "");
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : "");
const shortOf = (ship) => cap(shipWord(ship)) || ship || "";
const aboardOf = (on, off) => { const p = mdParts(on, off); return p ? (p.d ? mdShort(on, off) : `${p.m} months`) : ""; };
// "raymond.quiming@gmail.com" → "ray•••@gmail.com": the page names where the copy goes without printing the address whole.
export const maskEmail = (e) => { const m = /^([^@]+)@(.+)$/.exec(String(e || "").trim()); return m ? m[1].slice(0, 3) + "•••@" + m[2] : null; };
const PAGE_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const page = (html, status = 200) => new Response(html, { status, headers: PAGE_HEADERS });
const parseRow = (r) => (r ? Object.assign({}, r, { answers: r.answers_json ? JSON.parse(r.answers_json) : null }) : r);

// The ended contracts the loop counts: ended on the board by TDG, Rita's date or a reliever's card; never a visit.
export const endedLegs = (legs) => (Array.isArray(legs) ? legs : []).filter((l) => l && l.sc && !l.is_current && l.ours !== false && !l.visit && iso(l.on) && iso(l.off) && ["tdg", "rita", "card"].includes(l.offSource));

export function installSurvey(deps) {
  const { ensure, boardLegs, sendMail, json, today, origin } = deps;
  const log = (env, who, action, detail) => env.DB.prepare("INSERT INTO activity_log (id,user_id,action,detail,at) VALUES (?,?,?,?,?)").bind("act_" + crypto.randomUUID(), who, action, String(detail).slice(0, 900), new Date().toISOString());
  const crewOf = (env, sc) => env.DB.prepare("SELECT c.agency_id, c.first_name, c.last_name, COALESCE(NULLIF(o.email,''), c.email) AS email FROM crew c LEFT JOIN crew_override o ON o.agency_id = c.agency_id WHERE c.agency_id=?").bind(sc).first();
  const mailData = (row, link, todayS, reminder) => ({ first: firstWord(row.first || row.crew_name), ship: row.ship, shipShort: shortOf(row.ship), code: shipCode(row.ship), port: row.port || null,
    on: dmy(row.on_key), off: dmy(row.sign_off), aboard: aboardOf(row.on_key, row.sign_off), link, expires: dm(row.expires_at), today: dmy(todayS), reminder });

  // One invitation: the row first (the unique contract index refuses a second), then the email, then the stamp. A mail that
  // did not go removes its row, so the next morning tries again inside the catch-up window.
  async function invite(env, leg, { by = "auto", base } = {}) {
    await ensure(env);
    const crew = await crewOf(env, leg.sc);
    if (!crew) return { ok: false, error: "not_found" };
    if (!emailOk(crew.email)) return { ok: false, error: "no_email" };
    const id = "srv_" + crypto.randomUUID(), token = newHubToken(), now = new Date().toISOString(), t = today();
    const expires = addDays(t, SURVEY_LINK_DAYS) + "T23:59:59Z";
    const name = [crew.first_name, crew.last_name].filter(Boolean).join(" ").trim();
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO crew_survey (id, source, agency_id, crew_name, ship, brand, on_key, sign_off, token, email, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, "console", leg.sc, name, leg.ship, leg.brand || null, iso(leg.on), iso(leg.off), token, String(crew.email).trim(), expires, now).run();
    if (!ins || !ins.meta || !ins.meta.changes) return { ok: false, error: "already_invited" };
    const o = String(base || origin(env)).replace(/\/+$/, "");
    const mail = surveyInviteEmail(mailData({ ...leg, first: crew.first_name, crew_name: name, on_key: iso(leg.on), sign_off: iso(leg.off), expires_at: expires, port: leg.disembark || null }, o + "/hub/survey/" + token, t, false));
    const cc = SURVEY_CC.filter((c) => c.toLowerCase() !== String(crew.email).trim().toLowerCase());
    const res = await sendMail(env, { to: [String(crew.email).trim()], cc, replyTo: SURVEY_REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text,
      templateId: INVITE_TEMPLATE, idempotencyKey: INVITE_TEMPLATE + ":" + leg.sc + ":" + iso(leg.on), critical: true });
    if (!res || res.ok === false) {
      await env.DB.prepare("DELETE FROM crew_survey WHERE id=? AND invited_at IS NULL").bind(id).run();
      return { ok: false, error: "mail_failed", detail: res && res.error ? String(res.error).slice(0, 200) : null };
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE crew_survey SET invited_at=?, invited_by=?, invite_to_json=? WHERE id=?").bind(now, by, JSON.stringify({ to: [String(crew.email).trim()], cc }), id),
      log(env, by, "crew_survey_invite", leg.sc + " " + leg.ship + " off " + iso(leg.off) + " to " + String(crew.email).trim()),
    ]);
    return { ok: true, sent: true, id, sc: leg.sc };
  }

  async function remind(env, row) {
    const o = String(origin(env)).replace(/\/+$/, "");
    const crew = await crewOf(env, row.agency_id).catch(() => null);
    const mail = surveyInviteEmail(mailData({ ...row, first: crew ? crew.first_name : row.crew_name }, o + "/hub/survey/" + row.token, today(), true));
    const cc = SURVEY_CC.filter((c) => c.toLowerCase() !== String(row.email).toLowerCase());
    const res = await sendMail(env, { to: [row.email], cc, replyTo: SURVEY_REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text,
      templateId: INVITE_TEMPLATE + ".reminder", idempotencyKey: INVITE_TEMPLATE + ".reminder:" + row.id, critical: true });
    if (!res || res.ok === false) return { ok: false, error: "mail_failed" };
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE crew_survey SET reminded_at=? WHERE id=? AND reminded_at IS NULL").bind(now, row.id),
      log(env, "auto", "crew_survey_remind", row.agency_id + " " + row.ship),
    ]);
    return { ok: true };
  }

  const setting = async (env, k) => { try { const r = await env.DB.prepare("SELECT v FROM app_setting WHERE k=?").bind(k).first(); return r ? r.v : null; } catch { return null; } };
  const hourIn = (now) => new Intl.DateTimeFormat("en-US", { timeZone: SURVEY_TZ, hour: "2-digit", hour12: false }).formatToParts(now).find((p) => p.type === "hour").value;

  // The daily run: 07:00 Miami time, the switch, the contracts that ended, one invitation each; then the reminders.
  async function run(env, event) {
    const now = event && event.scheduledTime ? new Date(event.scheduledTime) : new Date();
    if (hourIn(now) !== SURVEY_HOUR) return { skipped: "not_gate_hour" };
    if ((await setting(env, "crew_survey_auto_enabled")) !== "true") return { skipped: "disabled" };
    await ensure(env);
    const since = await setting(env, "crew_survey_auto_since");
    const report = { invited: [], failed: [], reminded: [] };
    for (const leg of surveyDue(await boardLegs(env), today(), since)) {
      if (await env.DB.prepare("SELECT 1 FROM crew_survey WHERE source='console' AND agency_id=? AND on_key=?").bind(leg.sc, iso(leg.on)).first()) continue;
      const r = await invite(env, leg).catch((e) => ({ ok: false, error: String(e && e.message || e).slice(0, 160) }));
      (r.sent ? report.invited : report.failed).push({ sc: leg.sc, ship: leg.ship, off: iso(leg.off), error: r.error || null });
    }
    const open = (await env.DB.prepare("SELECT * FROM crew_survey WHERE source='console' AND invited_at IS NOT NULL AND submitted_at IS NULL AND reminded_at IS NULL").all()).results || [];
    for (const row of remindDue(open, now.toISOString())) { const r = await remind(env, row).catch(() => ({ ok: false })); if (r.ok) report.reminded.push(row.agency_id); }
    if (report.failed.length) { try { await log(env, "auto", "crew_survey_failed", JSON.stringify(report.failed)).run(); } catch {} }
    return report;
  }

  // ---- the seafarer's page ----
  async function rowByToken(env, token) {
    await ensure(env);
    return env.DB.prepare("SELECT * FROM crew_survey WHERE token=? AND invited_at IS NOT NULL").bind(token).first();
  }
  const closed = (row) => !row || (row.expires_at && row.expires_at < new Date().toISOString());
  async function seafarerPage(env, token) {
    const row = await rowByToken(env, token);
    if (!row) return page(surveyGonePage(), 404);
    const first = firstWord(row.crew_name);
    if (row.submitted_at) return page(surveyThanksPage({ first, brand: row.brand, when: dmy(row.submitted_at) }));
    if (closed(row)) return page(surveyGonePage(), 410);
    if (!row.opened_at) { try { await env.DB.prepare("UPDATE crew_survey SET opened_at=? WHERE id=? AND opened_at IS NULL").bind(new Date().toISOString(), row.id).run(); } catch {} }
    return page(surveyPage({ first, ship: row.ship, shipShort: shortOf(row.ship), brand: row.brand, on: dmy(row.on_key), off: dmy(row.sign_off), aboard: aboardOf(row.on_key, row.sign_off), email: maskEmail(row.email) }));
  }
  async function seafarerSubmit(env, token, request) {
    const row = await rowByToken(env, token);
    if (!row) return json({ ok: false, error: "closed" }, 404);
    if (row.submitted_at) return json({ ok: false, error: "already_sent" }, 409);
    if (closed(row)) return json({ ok: false, error: "closed" }, 410);
    const b = await request.json().catch(() => null);
    const c = checkAnswers(b);
    if (!c.ok) return json({ ok: false, error: c.error, missing: c.missing || null }, 400);
    const now = new Date().toISOString();
    const up = await env.DB.prepare("UPDATE crew_survey SET submitted_at=?, answers_json=?, fix_text=? WHERE id=? AND submitted_at IS NULL").bind(now, JSON.stringify(c.answers), c.fix, row.id).run();
    if (!up || !up.meta || !up.meta.changes) return json({ ok: false, error: "already_sent" }, 409);
    await log(env, row.agency_id || "seafarer", "crew_survey_answer", (row.agency_id || row.crew_name) + " " + row.ship + " · " + KEYS.filter((k) => c.answers[k] <= 2).length + " low").run().catch(() => {});
    // His copy: his own address, Onboard Support in copy (never the same address twice). The answers are kept whatever the mail does.
    const mail = surveyAnswersEmail({ first: firstWord(row.crew_name), ship: row.ship, brand: row.brand, when: dmy(now.slice(0, 10)) + ", " + now.slice(11, 16) + " UTC", answers: c.answers, fix: c.fix });
    const cc = [SURVEY_ANSWERS_CC].filter((x) => x.toLowerCase() !== String(row.email).toLowerCase());
    const res = await sendMail(env, { to: [row.email], cc, replyTo: SURVEY_REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text,
      templateId: ANSWERS_TEMPLATE, idempotencyKey: ANSWERS_TEMPLATE + ":" + row.id, critical: true }).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
    if (res && res.ok !== false) await env.DB.prepare("UPDATE crew_survey SET copy_sent_at=? WHERE id=?").bind(new Date().toISOString(), row.id).run().catch(() => {});
    else await log(env, "system", "crew_survey_copy_failed", row.id + " " + String(res && res.error || "").slice(0, 200)).run().catch(() => {});
    return json({ ok: true, copy: !!(res && res.ok !== false) });
  }

  // ---- the report ----
  async function reportData(env, url) {
    await ensure(env);
    const [rowsR, legs, crewR] = await Promise.all([
      env.DB.prepare("SELECT * FROM crew_survey").all(),
      boardLegs(env).catch(() => []),
      env.DB.prepare("SELECT c.agency_id, c.first_name, c.last_name, COALESCE(NULLIF(o.email,''), c.email) AS email FROM crew c LEFT JOIN crew_override o ON o.agency_id = c.agency_id").all(),
    ]);
    const crew = Object.fromEntries(((crewR && crewR.results) || []).map((c) => [c.agency_id, c]));
    const rows = ((rowsR && rowsR.results) || []).map(parseRow).map((r) => (r.agency_id && crew[r.agency_id] && r.source === "console" ? r : r));
    const ended = endedLegs(legs).map((l) => ({ ...l, name: l.name || (crew[l.sc] ? [crew[l.sc].first_name, crew[l.sc].last_name].filter(Boolean).join(" ") : null), noEmail: !(crew[l.sc] && emailOk(crew[l.sc].email)) }));
    const p = ["30D", "QTD", "YTD", "All"].includes(url.searchParams.get("p")) ? url.searchParams.get("p") : "All";
    const line = ["Royal", "Celebrity", "Azamara", "NCL"].includes(url.searchParams.get("line")) ? url.searchParams.get("line") : "all";
    const rep = surveyReport({ rows, ended, today: today(), p, line });
    return { ...rep, enabled: (await setting(env, "crew_survey_auto_enabled")) === "true", since: await setting(env, "crew_survey_auto_since"),
      sources: { console: rows.filter((r) => r.source === "console").length, forms: rows.filter((r) => r.source === "forms").length } };
  }

  // ---- previews: a crew's real data, no link made, nothing sent ----
  async function preview(env, url) {
    const sc = String(url.searchParams.get("id") || "").trim(), what = url.searchParams.get("what") || "page";
    const [crew, legs] = await Promise.all([sc ? crewOf(env, sc) : null, boardLegs(env).catch(() => [])]);
    if (!crew) return page(surveyGonePage(), 404);
    const mine = (legs || []).filter((l) => l && l.sc === sc && !l.visit && iso(l.on) && iso(l.off)).sort((a, b) => (a.on < b.on ? 1 : -1));
    const leg = endedLegs(mine)[0] || mine[0];
    if (!leg) return new Response("No contract on the board for this crew.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const name = [crew.first_name, crew.last_name].filter(Boolean).join(" ");
    const row = { crew_name: name, first: crew.first_name, ship: leg.ship, brand: leg.brand || null, on_key: iso(leg.on), sign_off: iso(leg.off), expires_at: addDays(today(), SURVEY_LINK_DAYS), port: leg.disembark || null };
    if (what === "invite" || what === "reminder") return page(surveyInviteEmail(mailData(row, url.origin + "/api/survey/preview?what=page&id=" + encodeURIComponent(sc), today(), what === "reminder")).html);
    if (what === "answers") {
      const answers = Object.fromEntries(KEYS.map((k, i) => [k, [5, 4, 5, 4, 5, 2, 5, 4, 5, 3, 5, 5, 5, 5, 5, 3, 4, 5, 5][i]]));
      return page(surveyAnswersEmail({ first: firstWord(crew.first_name), ship: leg.ship, brand: leg.brand, when: dmy(today()), answers, fix: "A sample line: what he would ask us to fix first." }).html);
    }
    return page(surveyPage({ first: firstWord(crew.first_name), ship: leg.ship, shipShort: shortOf(leg.ship), brand: leg.brand, on: dmy(leg.on), off: dmy(leg.off), aboard: aboardOf(leg.on, leg.off), email: maskEmail(crew.email) })
      .replace("<body ", "<body data-preview=\"1\" "));
  }

  async function handle(p, request, env, url, session) {
    if (p.startsWith("/hub/survey/")) {
      const token = p.slice(12);
      if (!TOKEN_RX.test(token)) return page(surveyGonePage(), 404);
      if (request.method === "GET") return seafarerPage(env, token);
      if (request.method === "POST") return seafarerSubmit(env, token, request);
      return json({ error: "method" }, 405);
    }
    if (!p.startsWith("/api/survey/")) return null;
    if (!session) return json({ error: "unauthorized" }, 401);
    const who = session.email || null;
    if (p === "/api/survey/report" && request.method === "GET") return json(await reportData(env, url));
    if (p === "/api/survey/preview" && request.method === "GET") return preview(env, url);
    if (p === "/api/survey/call" && request.method === "POST") {
      await ensure(env);
      const b = await request.json().catch(() => ({}));
      const id = String(b.id || ""), note = typeof b.note === "string" ? b.note.trim().slice(0, 1000) : "";
      if (!id) return json({ error: "bad_request" }, 400);
      const now = new Date().toISOString();
      const r = await env.DB.prepare("UPDATE crew_survey SET called_at=?, called_by=?, call_note=? WHERE id=? AND submitted_at IS NOT NULL").bind(now, who, note || null, id).run();
      if (!r || !r.meta || !r.meta.changes) return json({ error: "not_found" }, 404);
      await log(env, who, "crew_survey_call", id + (note ? " · " + note : "")).run();
      return json({ ok: true, called_at: now, called_by: who });
    }
    if (p === "/api/survey/auto") {
      await ensure(env);
      const setS = (k, v) => env.DB.prepare("INSERT INTO app_setting (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run();
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const was = (await setting(env, "crew_survey_auto_enabled")) === "true", on = b.enabled === true;
        await setS("crew_survey_auto_enabled", on ? "true" : "false");
        if (on && !was) await setS("crew_survey_auto_since", today());
        await log(env, who, "autosend_crew_survey", on ? "on" : "off").run();
      }
      return json({ ok: true, enabled: (await setting(env, "crew_survey_auto_enabled")) === "true", since: await setting(env, "crew_survey_auto_since") });
    }
    return json({ error: "not_found" }, 404);
  }

  return { invite, remind, run, handle, reportData };
}
