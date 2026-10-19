// THE CREW HUB'S ROUTES (Miguel, 19 Oct 2026, "deploy"). Public: GET /hub/<token> (the seafarer's page, no login, the
// link is the key) and GET /hub/expense.xlsx (the Expense Report v3). Signed in: POST /api/hub/link (get or make the
// crew's link) and POST /api/hub/revoke (stop it; the next request makes a new one). The reads are injected by the
// Worker (deps.boardLegs = the ONE schedule; deps.bonusCount = the consecutive count, READ only — §1), so this module
// never imports the Worker. Nothing here writes anything but crew_hub_link and the activity log. Pinned by
// test/crew_hub.test.js on real SQLite.
import { hubPage, hubGonePage } from "./crew_hub.js";
import { shipCode } from "./ship_codes.js";
import { EXPENSE_XLSX_B64 } from "./hub_assets.js";
import { currentLeg, welcomeContext } from "./welcome_context.js";
import { welcomeEmail } from "./emails/hr.welcome.v1.js";
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

  async function hubFor(env, token) {
    await ensure(env);
    const row = await env.DB.prepare("SELECT token, agency_id FROM crew_hub_link WHERE token=? AND revoked_at IS NULL").bind(token).first();
    if (!row) return page(hubGonePage(), 404);
    const sc = row.agency_id;
    const [crew, legs, count] = await Promise.all([
      env.DB.prepare("SELECT agency_id, first_name, last_name FROM crew WHERE agency_id=?").bind(sc).first(),
      boardLegs(env).catch(() => []),
      bonusCount(env, sc).catch(() => null),
    ]);
    if (!crew) return page(hubGonePage(), 404);
    try { await env.DB.prepare("UPDATE crew_hub_link SET last_seen_at=? WHERE token=?").bind(new Date().toISOString(), token).run(); } catch {}
    return page(hubPage(hubModel({ crew, leg: currentLeg(legs, sc), count, today: today() })));
  }

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
      if (!crew) return json({ error: "not_found" }, 404);
      const origin = String(env.HUB_ORIGIN || url.origin).replace(/\/+$/, "");
      const ctx0 = welcomeContext({ crew, legs, today: today(), links: {} });
      if (!ctx0) return json({ error: "no_running_contract" }, 404);
      const r = await linkFor(env, sc, session.email || null);
      const mail = welcomeEmail({ ...ctx0, links: { hub: origin + "/hub/" + r.token, expense: origin + "/hub/expense.xlsx" } });
      return new Response(mail.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
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
