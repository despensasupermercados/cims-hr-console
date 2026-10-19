// THE WELCOME ABOARD SEND (Miguel + Rita, 19 Oct 2026: "rita sends that email when the crew signs to the ship .. we will
// send it to the ship and to his personal email upon the same date"; then "we change the way we do it .. no more files with
// the exception of the excel file for expenses" — the Crew Hub carries what the PDFs did, so the email attaches NOTHING and
// the Expense Report is a download link). To: the ship's mailbox (cims-timecard ship_contact, the audit's own rule) AND the
// personal address; CC + reply-to Rita (it is her email today). Once per contract (welcome_send, keyed on the sign-on). The
// daily run (08:00 Budapest, the auto-send's gate) sends on the sign-on day, catching up WELCOME_CATCHUP_DAYS if a run was
// missed; it is OFF until switched on, and switching on never emails a contract that started before that day. A training
// visit is never welcomed. Nothing here is money (§1). Pinned by test/welcome_send.test.js.
import { welcomeContext, currentLeg } from "./welcome_context.js";
import { welcomeEmail } from "./emails/hr.welcome.v1.js";
import { shipMailbox } from "./audit.js";

export const WELCOME_TEMPLATE = "hr.welcome.v1";
export const WELCOME_CATCHUP_DAYS = 2;
export const WELCOME_CC = "Rita.Berenyi@dg3.com";
export const WELCOME_DDL = [
  "CREATE TABLE IF NOT EXISTS welcome_send (sc TEXT NOT NULL, on_key TEXT NOT NULL, sent_at TEXT NOT NULL, sent_by TEXT, to_json TEXT, PRIMARY KEY (sc, on_key))",
];
const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const emailOk = (e) => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(String(e || "").trim());
export const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Who gets it: the ship's mailbox and the personal address, both To, never the same address twice; Rita in copy.
export function welcomeRecipients({ contacts, ship, personal }) {
  const box = shipMailbox(contacts, ship);
  const mine = emailOk(personal) ? String(personal).trim() : null;
  const to = [];
  for (const a of [box, mine]) if (a && !to.some((x) => x.toLowerCase() === a.toLowerCase())) to.push(a);
  return { to, ship: box, personal: mine, cc: [WELCOME_CC].filter((c) => !to.some((x) => x.toLowerCase() === c.toLowerCase())) };
}

// The contracts the daily run welcomes: running, not a visit, signed on between (today - catch-up) and today, and never
// before the day the switch went on.
export function welcomeDue(legs, today, since) {
  const lo = [addDays(today, -WELCOME_CATCHUP_DAYS), iso(since) || "0000-00-00"].sort().pop();
  const seen = new Set(), out = [];
  for (const l of Array.isArray(legs) ? legs : []) {
    if (!l || !l.sc || seen.has(l.sc)) continue;
    const cur = currentLeg(legs, l.sc);
    seen.add(l.sc);
    if (cur && cur.on >= lo && cur.on <= today) out.push(cur);
  }
  return out;
}

export function installWelcome(deps) {
  const { ensure, boardLegs, linkFor, contacts, sendMail, json, today, origin } = deps;

  async function sendFor(env, sc, { by = "system", resend = false, dry = false, base } = {}) {
    await ensure(env);
    const [crew, legs, cts] = await Promise.all([
      env.DB.prepare("SELECT c.agency_id, c.first_name, c.last_name, c.rank_observed, COALESCE(NULLIF(o.email,''), c.email) AS email FROM crew c LEFT JOIN crew_override o ON o.agency_id = c.agency_id WHERE c.agency_id=?").bind(sc).first(),
      boardLegs(env),
      contacts(env).catch(() => []),
    ]);
    if (!crew) return { ok: false, error: "not_found" };
    const ctx0 = welcomeContext({ crew, legs, today: today(), links: {} });
    if (!ctx0) return { ok: false, error: "no_running_contract" };
    const leg = currentLeg(legs, sc);
    const onKey = leg.on;
    const rc = welcomeRecipients({ contacts: cts, ship: leg.ship, personal: crew.email });
    const prior = await env.DB.prepare("SELECT sent_at, to_json FROM welcome_send WHERE sc=? AND on_key=?").bind(sc, onKey).first();
    const out = { ok: true, sc, ship: leg.ship, on: onKey, to: rc.to, cc: rc.cc, noShipMailbox: !rc.ship, noPersonal: !rc.personal, sent_before: prior ? prior.sent_at : null };
    if (!rc.to.length) return { ...out, ok: false, error: "no_recipient" };
    if (dry) return out;
    if (prior && !resend) return { ...out, ok: false, error: "already_sent" };
    const o = String(base || origin(env)).replace(/\/+$/, "");
    const link = await linkFor(env, sc, by);
    const mail = welcomeEmail({ ...ctx0, links: { hub: o + "/hub/" + link.token, expense: o + "/hub/expense.xlsx" } });
    const res = await sendMail(env, { to: rc.to, cc: rc.cc.length ? rc.cc : undefined, replyTo: WELCOME_CC, subject: mail.subject, html: mail.html, text: mail.text,
      templateId: WELCOME_TEMPLATE, idempotencyKey: WELCOME_TEMPLATE + ":" + sc + ":" + onKey + (resend ? ":" + Date.now() : ""), critical: true });
    if (!res || res.ok === false) return { ...out, ok: false, error: "mail_failed", detail: res && res.error ? String(res.error).slice(0, 200) : null };
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO welcome_send (sc, on_key, sent_at, sent_by, to_json) VALUES (?,?,?,?,?) ON CONFLICT(sc, on_key) DO UPDATE SET sent_at=excluded.sent_at, sent_by=excluded.sent_by, to_json=excluded.to_json")
        .bind(sc, onKey, now, by, JSON.stringify({ to: rc.to, cc: rc.cc })),
      env.DB.prepare("INSERT INTO activity_log (id,user_id,action,detail,at) VALUES (?,?,?,?,?)").bind("act_" + crypto.randomUUID(), by, "welcome_send", sc + " " + leg.ship + " " + onKey + " to " + rc.to.join(", "), now),
    ]);
    return { ...out, sent: true, sent_at: now };
  }

  const setting = async (env, k) => { try { const r = await env.DB.prepare("SELECT v FROM app_setting WHERE k=?").bind(k).first(); return r ? r.v : null; } catch { return null; } };
  const hourIn = (now) => new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false }).formatToParts(now).find((p) => p.type === "hour").value;

  // The daily run: the auto-send's gate hour, the switch, the due contracts, one send each. A failed send is not logged and
  // is tried again the next morning while the contract is inside the catch-up window.
  async function run(env, event) {
    const now = event && event.scheduledTime ? new Date(event.scheduledTime) : new Date();
    if (hourIn(now) !== "08") return { skipped: "not_gate_hour" };
    if ((await setting(env, "welcome_auto_enabled")) !== "true") return { skipped: "disabled" };
    await ensure(env);
    const t = today(), since = await setting(env, "welcome_auto_since");
    const due = welcomeDue(await boardLegs(env), t, since);
    const report = { sent: [], failed: [] };
    for (const leg of due) {
      if (await env.DB.prepare("SELECT 1 FROM welcome_send WHERE sc=? AND on_key=?").bind(leg.sc, leg.on).first()) continue;
      const r = await sendFor(env, leg.sc, { by: "auto" }).catch((e) => ({ ok: false, error: String(e && e.message || e).slice(0, 160) }));
      (r.sent ? report.sent : report.failed).push({ sc: leg.sc, ship: leg.ship, on: leg.on, error: r.error || null });
    }
    if (report.failed.length) {
      try { await env.DB.prepare("INSERT INTO activity_log (id,user_id,action,detail,at) VALUES (?,?,?,?,?)").bind("act_" + crypto.randomUUID(), "auto", "welcome_send_failed", JSON.stringify(report.failed).slice(0, 900), new Date().toISOString()).run(); } catch {}
    }
    return report;
  }

  async function handle(p, request, env, url, session) {
    if (p !== "/api/hub/welcome/send" && p !== "/api/hub/welcome/auto") return null;
    if (!session) return json({ error: "unauthorized" }, 401);
    const who = session.email || null;
    if (p === "/api/hub/welcome/send") {
      if (request.method !== "POST") return json({ error: "method" }, 405);
      const b = await request.json().catch(() => ({}));
      const sc = String(b.agency_id || "").trim();
      if (!sc) return json({ error: "bad_request" }, 400);
      const r = await sendFor(env, sc, { by: who, resend: b.resend === true, dry: b.dry === true, base: env.HUB_ORIGIN || url.origin });
      return json(r, r.ok ? 200 : r.error === "not_found" || r.error === "no_running_contract" ? 404 : r.error === "already_sent" ? 409 : r.error === "no_recipient" ? 422 : 502);
    }
    await ensure(env);
    const setS = (k, v) => env.DB.prepare("INSERT INTO app_setting (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run();
    if (request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      const was = (await setting(env, "welcome_auto_enabled")) === "true", on = b.enabled === true;
      await setS("welcome_auto_enabled", on ? "true" : "false");
      if (on && !was) await setS("welcome_auto_since", today());
      await env.DB.prepare("INSERT INTO activity_log (id,user_id,action,detail,at) VALUES (?,?,?,?,?)").bind("act_" + crypto.randomUUID(), who, "autosend_welcome", on ? "on" : "off", new Date().toISOString()).run();
    }
    return json({ ok: true, enabled: (await setting(env, "welcome_auto_enabled")) === "true", since: await setting(env, "welcome_auto_since") });
  }

  return { sendFor, run, handle };
}
