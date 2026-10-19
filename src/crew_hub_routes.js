// THE CREW HUB'S ROUTES (Miguel, 19 Oct 2026, "deploy"). Public: GET /hub/<token> (the seafarer's page, no login, the
// link is the key) and GET /hub/expense.xlsx (the Expense Report v3). Signed in: POST /api/hub/link (get or make the
// crew's link) and POST /api/hub/revoke (stop it; the next request makes a new one). The reads are injected by the
// Worker (deps.boardLegs = the ONE schedule; deps.bonusCount = the consecutive count, READ only — §1), so this module
// never imports the Worker. Nothing here writes anything but crew_hub_link and the activity log. Pinned by
// test/crew_hub.test.js on real SQLite.
import { hubPage, hubGonePage } from "./crew_hub.js";
import { nextPayday } from "./payroll.js";
import { shipCode } from "./ship_codes.js";
import { EXPENSE_XLSX_B64 } from "./hub_assets.js";
import { currentLeg, welcomeContext } from "./welcome_context.js";
import { welcomeEmail } from "./emails/hr.welcome.v1.js";
import { shipMailbox } from "./audit.js";
export { currentLeg };

export const HUB_DDL = [
  "CREATE TABLE IF NOT EXISTS crew_hub_link (token TEXT PRIMARY KEY, agency_id TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT, revoked_at TEXT, revoked_by TEXT, last_seen_at TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_crew_hub_link_sc ON crew_hub_link (agency_id)",
];
export const TOKEN_RX = /^[A-Za-z0-9_-]{32,64}$/;

// 24 random bytes, URL-safe: 192 bits, never derived from the crew id.
export function newHubToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";

// The page's model: who, the running contract and how its sign-off was set, the contract number (count + 1) or null.
export function hubModel({ crew, leg, count, today }) {
  const m = { first: firstWord(crew && crew.first_name), today, contractNo: Number.isInteger(count) && count >= 0 ? count + 1 : null };
  if (leg && iso(leg.on) && iso(leg.off)) {
    Object.assign(m, { ship: leg.ship || null, code: shipCode(leg.ship) || null, brand: leg.brand || null, on: iso(leg.on), off: iso(leg.off),
      offSource: leg.offSource || "projected", offProjected: !leg.offSource || leg.offSource === "projected" });
  }
  return m;
}

const PAGE_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export function installHub(deps) {
  const { ensure, boardLegs, bonusCount, json, today } = deps;
  const page = (html, status = 200) => new Response(html, { status, headers: PAGE_HEADERS });

  // ONE model for the crew's page, the console's preview and the audit (19 Oct 2026: "I wanna make sure I know what the crew
  // is seeing"): the preview and the audit read exactly what the link serves, never a copy.
  async function modelFor(env, sc) {
    const [crew, legs, count] = await Promise.all([
      env.DB.prepare("SELECT agency_id, first_name, last_name FROM crew WHERE agency_id=?").bind(sc).first(),
      boardLegs(env).catch(() => []),
      bonusCount(env, sc).catch(() => null),
    ]);
    if (!crew) return null;
    const leg = currentLeg(legs, sc);
    return { crew, legs, leg, count, model: hubModel({ crew, leg, count, today: today() }) };
  }

  async function hubFor(env, token) {
    await ensure(env);
    const row = await env.DB.prepare("SELECT token, agency_id FROM crew_hub_link WHERE token=? AND revoked_at IS NULL").bind(token).first();
    if (!row) return page(hubGonePage(), 404);
    const m = await modelFor(env, row.agency_id);
    if (!m) return page(hubGonePage(), 404);
    try { await env.DB.prepare("UPDATE crew_hub_link SET last_seen_at=? WHERE token=?").bind(new Date().toISOString(), token).run(); } catch {}
    return page(hubPage(m.model));
  }
  const notice = (msg, status = 404) => new Response(`<!DOCTYPE html><meta charset="utf-8"><body style="margin:0;font:15px/1.5 Helvetica,Arial,sans-serif;color:#374151;background:#F3F4F6;padding:28px">${msg}</body>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

  async function linkFor(env, sc, who) {
    await ensure(env);
    const live = await env.DB.prepare("SELECT token FROM crew_hub_link WHERE agency_id=? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(sc).first();
    if (live) return { token: live.token, created: false };
    const token = newHubToken(), now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO crew_hub_link (token, agency_id, created_at, created_by) VALUES (?,?,?,?)").bind(token, sc, now, who),
      env.DB.prepare("INSERT INTO activity_log (id,user_id,action,detail,at) VALUES (?,?,?,?,?)").bind("act_" + crypto.randomUUID(), who, "crew_hub_link", sc + " link made", now),
    ]);
    return { token, created: true };
  }

  const handleHub = async function handleHub(p, request, env, url, session) {
    if (p === "/hub/expense.xlsx" && request.method === "GET") {
      const bin = atob(EXPENSE_XLSX_B64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Expense Report Template.xlsx"', "Cache-Control": "public, max-age=3600" } });
    }
    if (p.startsWith("/hub/") && request.method === "GET") {
      const token = p.slice(5);
      return TOKEN_RX.test(token) ? hubFor(env, token) : page(hubGonePage(), 404);
    }
    // The welcome email, filled with this crew's real data, for a signed-in preview (19 Oct 2026). It SENDS nothing: the send
    // waits for the six attachments and the training / scheduling / SOP / booking links (Miguel's to give).
    if (p === "/api/hub/welcome" && request.method === "GET") {
      if (!session) return json({ error: "unauthorized" }, 401);
      const sc = String(url.searchParams.get("id") || "").trim();
      const [crew, legs] = await Promise.all([
        sc ? env.DB.prepare("SELECT agency_id, first_name, last_name, rank_observed FROM crew WHERE agency_id=?").bind(sc).first() : null,
        boardLegs(env).catch(() => []),
      ]);
      if (!crew) return notice("No such crew.");
      const origin = String(env.HUB_ORIGIN || url.origin).replace(/\/+$/, "");
      const ctx0 = welcomeContext({ crew, legs, today: today(), links: {} });
      if (!ctx0) return notice("No running contract on the board for this crew: there is no welcome email to show.");
      // A preview makes no link (nothing may reach the crew from a look): its hub button opens the console's preview.
      const mail = welcomeEmail({ ...ctx0, links: { hub: url.origin + "/api/hub/preview?id=" + encodeURIComponent(sc), expense: origin + "/hub/expense.xlsx" } });
      return new Response(mail.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    }
    // THE CREW VIEW (Miguel, 19 Oct 2026: "impersonating a crew .. rita can chose the person .. and then it can see audit the
    // information"). Signed in only. The preview is the crew's own page from the same model, with no link made and nothing
    // recorded; the audit lists every value on it with its source; the examples pick one crew per case the page can be in.
    if (p === "/api/hub/preview" && request.method === "GET") {
      if (!session) return json({ error: "unauthorized" }, 401);
      const m = await modelFor(env, String(url.searchParams.get("id") || "").trim());
      return m ? page(hubPage(m.model)) : notice("No such crew.");
    }
    if (p === "/api/hub/audit" && request.method === "GET") {
      if (!session) return json({ error: "unauthorized" }, 401);
      await ensure(env);
      const sc = String(url.searchParams.get("id") || "").trim();
      const m = await modelFor(env, sc);
      if (!m) return json({ error: "not_found" }, 404);
      const [links, sent, detail, cts, mail] = await Promise.all([
        env.DB.prepare("SELECT created_at, created_by, revoked_at, last_seen_at FROM crew_hub_link WHERE agency_id=? ORDER BY created_at DESC").bind(sc).all().then((r) => r.results || []).catch(() => []),
        env.DB.prepare("SELECT sent_at, sent_by, to_json FROM welcome_send WHERE sc=? ORDER BY sent_at DESC").bind(sc).all().then((r) => r.results || []).catch(() => []),
        deps.countDetail ? deps.countDetail(env, sc).catch(() => null) : null,
        deps.contacts ? deps.contacts(env).catch(() => []) : [],
        env.DB.prepare("SELECT COALESCE(NULLIF(o.email,''), c.email) AS email FROM crew c LEFT JOIN crew_override o ON o.agency_id=c.agency_id WHERE c.agency_id=?").bind(sc).first().catch(() => null),
      ]);
      const L = m.leg, live = links.find((x) => !x.revoked_at) || null;
      return json({ ok: true, sc, name: [m.crew.first_name, m.crew.last_name].filter(Boolean).join(" "), today: today(),
        shown: m.model,
        contract: L ? { ship: L.ship, brand: L.brand || null, on: L.on, off: L.off, offSource: L.offSource || "projected", source: L.source || null, fileAt: L.fileAt || null, embark: L.embark || null } : null,
        count: detail || { count: m.count, source: m.count == null ? null : "recorded" },
        payday: nextPayday(today()),
        link: { live: !!live, created_at: live ? live.created_at : null, created_by: live ? live.created_by : null, last_seen_at: live ? live.last_seen_at : null, revoked: links.filter((x) => x.revoked_at).length },
        welcome: { sent: sent.map((x) => ({ at: x.sent_at, by: x.sent_by, to: (() => { try { return JSON.parse(x.to_json || "{}"); } catch { return {}; } })() })),
          shipMailbox: L ? (shipMailbox(cts, L.ship) || null) : null, personal: (mail && mail.email) || null } });
    }
    if (p === "/api/hub/examples" && request.method === "GET") {
      if (!session) return json({ error: "unauthorized" }, 401);
      const [rows, legs, known] = await Promise.all([
        env.DB.prepare("SELECT agency_id, first_name, last_name FROM crew WHERE COALESCE(redacted,0)=0 ORDER BY last_name, first_name").all().then((r) => r.results || []).catch(() => env.DB.prepare("SELECT agency_id, first_name, last_name FROM crew ORDER BY last_name, first_name").all().then((r) => r.results || [])),
        boardLegs(env).catch(() => []),
        deps.countKnown ? deps.countKnown(env).catch(() => new Set()) : new Set(),
      ]);
      return json({ ok: true, ...hubExamples(rows, legs, known, today()) });
    }
    if (p === "/api/hub/link" || p === "/api/hub/revoke") {
      if (!session) return json({ error: "unauthorized" }, 401);
      if (request.method !== "POST") return json({ error: "method" }, 405);
      const b = await request.json().catch(() => ({}));
      const sc = String(b.agency_id || "").trim();
      if (!sc) return json({ error: "bad_request" }, 400);
      if (!(await env.DB.prepare("SELECT 1 FROM crew WHERE agency_id=?").bind(sc).first())) return json({ error: "not_found" }, 404);
      const who = session.email || null;
      if (p === "/api/hub/link") {
        const r = await linkFor(env, sc, who);
        const origin = String(env.HUB_ORIGIN || url.origin).replace(/\/+$/, "");
        return json({ ok: true, url: origin + "/hub/" + r.token, created: r.created });
      }
      await ensure(env);
      const now = new Date().toISOString();
      const res = await env.DB.batch([
        env.DB.prepare("UPDATE crew_hub_link SET revoked_at=?, revoked_by=? WHERE agency_id=? AND revoked_at IS NULL").bind(now, who, sc),
        env.DB.prepare("INSERT INTO activity_log (id,user_id,action,detail,at) VALUES (?,?,?,?,?)").bind("act_" + crypto.randomUUID(), who, "crew_hub_revoke", sc + " link revoked", now),
      ]);
      return json({ ok: true, revoked: (res[0] && res[0].meta && res[0].meta.changes) || 0 });
    }
    return null;
  };
  handleHub.linkFor = linkFor; // the welcome send reuses the ONE link per crew
  return handleHub;
}

// One crew per case the page can be in, so a look covers every branch: aboard with a recorded count, aboard with none (the
// ladder only), just signed on (the welcome email's moment), Azamara (its own ordering steps), between contracts. Pure.
export function hubExamples(rows, legs, known, today) {
  const name = (r) => [r.first_name, r.last_name].filter(Boolean).join(" ");
  const crew = rows.map((r) => { const l = currentLeg(legs, r.agency_id); return { sc: r.agency_id, name: name(r), ship: l ? l.ship : null }; });
  const aboard = crew.filter((c) => c.ship);
  const legOf = (sc) => currentLeg(legs, sc);
  const days = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
  const pick = (label, why, f) => { const c = crew.find(f); return c ? { label, why, sc: c.sc, name: c.name, ship: c.ship } : null; };
  const has = (sc) => (known && typeof known.has === "function" ? known.has(sc) : false);
  const examples = [
    pick("Aboard · contract number", "Bonus count on record: the page names the contract and its step.", (c) => c.ship && has(c.sc)),
    pick("Aboard · no count on record", "No baseline and no committed outcome: the ladder only.", (c) => c.ship && !has(c.sc)),
    pick("Just signed on", "Signed on in the last 14 days: the welcome email's moment.", (c) => { const l = legOf(c.sc); return l && l.on <= today && days(l.on, today) <= 14; }),
    pick("Azamara", "Azamara's own ordering steps open first.", (c) => { const l = legOf(c.sc); return l && String(l.brand || "").toLowerCase() === "azamara"; }),
    pick("Between contracts", "No running contract: the page says so.", (c) => !c.ship),
  ].filter(Boolean);
  return { crew, examples, aboard: aboard.length };
}
