import { ladderValue, computeBonus, mapFeedbackToScore } from "./bonus.js";
import { signToken, verifyToken } from "./auth.js";
import { crewComplianceReport } from "./compliance.js";
import { buildRotationBoard } from "./rotation.js";
import { KEYMAN_CONTRACTS } from "./keyman_data.js";
import { billingReport } from "./daysworked.js";
import { VESSEL_REF, DRY_DOCK } from "./vessel_ref.js";
import { fleetDryDock, inDockNow, upcomingDocks } from "./fleet.js";
import { mapRows, diffCrew } from "./crewimport.js";

/* ============================================================
   DG3 CIMS — HR Operational Console · Cloudflare Worker (v1)
   Single-file ES module. Paste into the dashboard Worker editor.
   Bindings required:
     - D1 database bound as  DB   (the cims-hr-console database)
   Secrets (set in dashboard → Settings → Variables and Secrets):
     - SESSION_SECRET  (required) long random string; signs login + session tokens
     - BOOTSTRAP_KEY   (required for first login w/o email) long random string
     - RESEND_API_KEY  (optional) enables emailing the magic link via Resend
     - MAIL_FROM       (optional) e.g. "CIMS <noreply@dg3.com>" for Resend
   Auth model: two full users (allowlist = rows in `users`). Magic-link via
   stateless signed token (15 min). Session = signed cookie (12h). Crew never log in.
   ============================================================ */

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days (internal 2-user tool; reduces re-login friction)
const LOGIN_TTL   = 60 * 15;           // 15m
const COOKIE = "cims_sid";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      // ---- auth endpoints ----
      if (p === "/login")                return htmlResponse(LOGIN_HTML);
      if (p === "/api/auth/request" && request.method === "POST") return authRequest(request, env, url);
      if (p === "/auth/verify")          return authVerify(request, env, url);
      if (p === "/auth/dev")             return authDev(request, env, url);
      if (p === "/api/auth/logout")      return logout();

      // ---- public contributor feedback (token-authenticated, no login) ----
      if (p === "/fb")                   return htmlResponse(FB_HTML);
      if (p === "/api/feedback/form")    return apiFeedbackForm(env, url);
      if (p === "/api/feedback/submit" && request.method === "POST") return apiFeedbackSubmit(request, env);

      // ---- everything below requires a session ----
      const session = await getSession(request, env);
      if (p.startsWith("/api/")) {
        if (!session) return json({ error: "unauthorized" }, 401);
        if (p === "/api/me")        return json({ email: session.email });
        if (p === "/api/dashboard") return apiDashboard(env);
        if (p === "/api/crew")      return apiCrew(env, url);
        if (p === "/api/crew/get")  return apiCrewOne(env, url);
        if (p === "/api/compliance") return apiCompliance(env, url);
        if (p === "/api/rotation")   return apiRotation(env);
        if (p === "/api/fleet")      return apiFleet();
        if (p === "/api/datastatus") return apiDataStatus(env);
        if (p === "/api/crew/import" && request.method === "POST") return apiCrewImport(request, env, session);
        if (p === "/api/daysworked") return apiDaysWorked(env, url);
        if (p === "/api/bonus/crew")   return apiBonusCrew(env, url);
        if (p === "/api/bonus/commit" && request.method === "POST") return apiBonusCommit(request, env, session);
        if (p === "/api/feedback/request" && request.method === "POST") return apiFeedbackRequest(request, env, session, url);
        if (p === "/api/feedback/crew")  return apiFeedbackCrew(env, url);
        return json({ error: "not found" }, 404);
      }
      // app shell (any non-api path) — gate on session
      if (!session) return Response.redirect(url.origin + "/login", 302);
      return htmlResponse(APP_HTML);
    } catch (err) {
      return json({ error: "server_error", detail: String(err && err.message || err) }, 500);
    }
  }
};

/* ----------------------- auth helpers ----------------------- */
function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
async function getSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const t = getCookie(request, COOKIE);
  if (!t) return null;
  const p = await verifyToken(t, env.SESSION_SECRET);
  return (p && p.p === "session") ? p : null;
}
async function isAllowed(env, email) {
  if (!email) return false;
  const row = await env.DB.prepare("SELECT email FROM users WHERE lower(email)=lower(?)").bind(email).first();
  return !!row;
}
function sessionCookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`;
}
async function logActivity(env, email, action, detail) {
  try {
    await env.DB.prepare("INSERT INTO activity_log (id,user_id,action,detail,at) VALUES (?,?,?,?,?)")
      .bind("log_" + crypto.randomUUID(), email || null, action, detail || null, new Date().toISOString()).run();
  } catch {}
}

// POST /api/auth/request {email} -> email a magic link (or report bootstrap path)
async function authRequest(request, env, url) {
  const { email } = await request.json().catch(() => ({}));
  if (!await isAllowed(env, email)) {
    // Do not reveal allowlist membership.
    return json({ ok: true, sent: true });
  }
  const token = await signToken({ email, p: "login", exp: Math.floor(Date.now() / 1000) + LOGIN_TTL }, env.SESSION_SECRET);
  const link = `${url.origin}/auth/verify?token=${token}`;
  if (env.RESEND_API_KEY) {
    await sendMagicLink(env, email, link).catch(() => {});
    await logActivity(env, email, "login_request", "emailed");
    return json({ ok: true, sent: true });
  }
  // No email provider configured yet: instruct to use bootstrap.
  await logActivity(env, email, "login_request", "no_mailer");
  return json({ ok: true, sent: false, note: "Email sending is not configured yet. Use the bootstrap link." });
}

async function sendMagicLink(env, email, link) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "CIMS <onboarding@resend.dev>",
      to: [email],
      subject: "Your CIMS Console sign-in link",
      html: `<p>Click to sign in to the DG3 CIMS HR Console:</p><p><a href="${link}">${link}</a></p><p>This link expires in 15 minutes.</p>`
    })
  });
}

// GET /auth/verify?token=...  -> set session cookie
async function authVerify(request, env, url) {
  const token = url.searchParams.get("token");
  const p = await verifyToken(token, env.SESSION_SECRET);
  if (!p || p.p !== "login" || !await isAllowed(env, p.email)) {
    return htmlResponse(noticeHTML("Link invalid or expired", "Please request a new sign-in link."), 401);
  }
  const sess = await signToken({ email: p.email, p: "session", exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, env.SESSION_SECRET);
  await logActivity(env, p.email, "login", "verify");
  return new Response(null, { status: 302, headers: { "Location": url.origin + "/", "Set-Cookie": sessionCookie(sess) } });
}

// GET /auth/dev?key=BOOTSTRAP_KEY&email=...  -> bootstrap session (until email is wired)
async function authDev(request, env, url) {
  let key, email;
  if (request.method === "POST") { const b = await request.json().catch(() => ({})); key = b.key; email = b.email; }
  else { key = url.searchParams.get("key"); email = url.searchParams.get("email"); }
  if (!env.BOOTSTRAP_KEY || key !== env.BOOTSTRAP_KEY) return new Response("forbidden", { status: 403 });
  if (!await isAllowed(env, email)) return new Response("not an allowlisted user", { status: 403 });
  const sess = await signToken({ email, p: "session", exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, env.SESSION_SECRET);
  await logActivity(env, email, "login", "bootstrap");
  const cookie = sessionCookie(sess);
  if (request.method === "POST") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Set-Cookie": cookie, "Content-Type": "application/json" } });
  return new Response(null, { status: 302, headers: { "Location": url.origin + "/", "Set-Cookie": cookie } });
}
function logout() {
  return new Response(null, { status: 302, headers: { "Location": "/login", "Set-Cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` } });
}

/* ----------------------- data API ----------------------- */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
const TODAY = () => new Date().toISOString().slice(0, 10);
function plus(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

// Self-creating + self-seeding Keyman contract history (no console/migration needed).
// Informational only — decoupled from bonus tables; never affects payouts.
async function logData(env, source, rows, status) {
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS data_log (id TEXT PRIMARY KEY, source TEXT, rows INTEGER, status TEXT, at TEXT)").run();
    await env.DB.prepare("INSERT INTO data_log (id,source,rows,status,at) VALUES (?,?,?,?,?)").bind("dl_" + crypto.randomUUID(), source, rows, status, new Date().toISOString()).run();
  } catch {}
}
async function ensureKeyman(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS keyman_contract2 (id INTEGER PRIMARY KEY AUTOINCREMENT, sc TEXT NOT NULL, km TEXT, ship TEXT, st TEXT, seq INTEGER, sign_on TEXT, proj_off TEXT, act_off TEXT)").run();
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM keyman_contract2").first()).n;
  if (n === 0 && KEYMAN_CONTRACTS.length) {
    const stmt = env.DB.prepare("INSERT INTO keyman_contract2 (sc,km,ship,st,seq,sign_on,proj_off,act_off) VALUES (?,?,?,?,?,?,?,?)");
    await env.DB.batch(KEYMAN_CONTRACTS.map(r => stmt.bind(r.sc, r.km, r.ship, r.st, r.seq, r.on, r.proj, r.act)));
    await logData(env, "keyman_contract (CIMS Keyman)", KEYMAN_CONTRACTS.length, "seeded");
  }
}
// Crew refresh from an uploaded AdvancedQuery export. Browser parses the file (SheetJS) and
// POSTs raw rows here. dryRun -> return a preview diff; apply -> upsert. NEVER touches
// baseline_count (money). Status NOT NULL + CHECK, so new rows without a valid status are skipped.
async function apiCrewImport(request, env, session) {
  const b = await request.json().catch(() => ({}));
  const dryRun = !!b.dryRun;
  const { mapped, invalidCount } = mapRows(b.rows || []);
  const ex = (await env.DB.prepare("SELECT agency_id, first_name, middle_name, last_name, status, rank_observed, vessel_observed, dob, province, phone, email, med_exp, sirb_exp, pp_exp, sch_exp, usv_exp FROM crew").all()).results;
  const existing = {}; for (const r of ex) existing[r.agency_id] = r;
  const d = diffCrew(mapped, existing);
  if (dryRun) {
    return json({ dryRun: true, total: d.total, add: d.add.length, change: d.change.length, unchanged: d.unchanged, needsStatus: d.needsStatus.length, invalid: invalidCount, sampleAdd: d.add.slice(0, 10), sampleChange: d.change.slice(0, 10) });
  }
  const applyIds = new Set([...d.add, ...d.change.map(c => c.agency_id)]);
  const now = new Date().toISOString();
  const stmt = env.DB.prepare(
    "INSERT INTO crew (id,agency_id,agency_code,first_name,middle_name,last_name,status,rank_observed,vessel_observed,dob,province,phone,email,med_exp,sirb_exp,pp_exp,sch_exp,usv_exp,redacted,created_at,updated_at) " +
    "VALUES (?,?,'TDG',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?) " +
    "ON CONFLICT(agency_id) DO UPDATE SET " +
    "first_name=COALESCE(excluded.first_name,crew.first_name), middle_name=COALESCE(excluded.middle_name,crew.middle_name), " +
    "last_name=COALESCE(excluded.last_name,crew.last_name), status=COALESCE(excluded.status,crew.status), " +
    "rank_observed=COALESCE(excluded.rank_observed,crew.rank_observed), vessel_observed=COALESCE(excluded.vessel_observed,crew.vessel_observed), " +
    "dob=COALESCE(excluded.dob,crew.dob), province=COALESCE(excluded.province,crew.province), phone=COALESCE(excluded.phone,crew.phone), " +
    "email=COALESCE(excluded.email,crew.email), med_exp=COALESCE(excluded.med_exp,crew.med_exp), sirb_exp=COALESCE(excluded.sirb_exp,crew.sirb_exp), " +
    "pp_exp=COALESCE(excluded.pp_exp,crew.pp_exp), sch_exp=COALESCE(excluded.sch_exp,crew.sch_exp), usv_exp=COALESCE(excluded.usv_exp,crew.usv_exp), updated_at=excluded.updated_at"
  );
  const batch = [];
  for (const m of mapped) {
    if (!applyIds.has(m.agency_id)) continue;
    batch.push(stmt.bind("crew_" + m.agency_id, m.agency_id, m.first_name, m.middle_name, m.last_name, m.status,
      m.rank_observed, m.vessel_observed, m.dob, m.province, m.phone, m.email, m.med_exp, m.sirb_exp, m.pp_exp, m.sch_exp, m.usv_exp, now, now));
  }
  if (batch.length) await env.DB.batch(batch);
  await logData(env, "crew (AdvancedQuery, by " + ((session && session.email) || "?") + ")", batch.length, "refreshed: +" + d.add.length + " ~" + d.change.length);
  return json({ ok: true, applied: batch.length, added: d.add.length, changed: d.change.length, skippedNoStatus: d.needsStatus.length, invalid: invalidCount });
}

async function apiDataStatus(env) {
  await ensureKeyman(env); try { await ensureFb(env); } catch {}
  const q = async (s) => (await env.DB.prepare(s).first());
  const cnt = async (s) => { try { return (await q(s)).n; } catch { return 0; } };
  const datasets = [
    { name: "Crew registry", source: "AdvancedQuery (TDG, Rita)", count: await cnt("SELECT COUNT(*) n FROM crew") },
    { name: "Contract history", source: "CIMS Keyman workbook", count: await cnt("SELECT COUNT(*) n FROM keyman_contract2") },
    { name: "Fleet / vessels", source: "Vessel Deployment reference", count: VESSEL_REF.length },
    { name: "Feedback responses", source: "In-app (contributors)", count: await cnt("SELECT COUNT(*) n FROM feedback_response2") },
    { name: "Bonus outcomes", source: "In-app (committed)", count: await cnt("SELECT COUNT(*) n FROM bonus_outcome") },
  ];
  let log = [];
  try { log = (await env.DB.prepare("SELECT source,rows,status,at FROM data_log ORDER BY at DESC LIMIT 12").all()).results; } catch {}
  return json({ today: TODAY(), datasets, log });
}
// Read all contract rows in the shape billingReport expects.
async function keymanRows(env) {
  const r = await env.DB.prepare("SELECT sc, ship, sign_on on, proj_off proj, act_off act FROM keyman_contract2").all();
  return r.results;
}
async function apiDaysWorked(env, url) {
  await ensureKeyman(env);
  const asOf = TODAY();
  const from = url.searchParams.get("from") || null;
  const to = url.searchParams.get("to") || asOf;
  const rows = await keymanRows(env);
  const rep = billingReport(rows, { from, to, asOf });
  // attach crew names (sc -> name) for the per-crew view
  const names = {};
  const cr = await env.DB.prepare("SELECT agency_id, first_name, last_name, vessel_observed FROM crew").all();
  for (const c of cr.results) names[c.agency_id] = { name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(), vessel: c.vessel_observed };
  rep.perCrew = rep.perCrew.map(x => ({ ...x, name: (names[x.sc] && names[x.sc].name) || x.sc }));
  return json(rep);
}

async function apiDashboard(env) {
  const today = TODAY(), in90 = plus(90);
  const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first());
  await ensureKeyman(env);
  const hist = await q("SELECT COUNT(*) contracts, COUNT(DISTINCT sc) crew, CAST(ROUND(SUM(julianday(COALESCE(act_off,proj_off))-julianday(sign_on))) AS INTEGER) days FROM keyman_contract2 WHERE sign_on IS NOT NULL AND COALESCE(act_off,proj_off) IS NOT NULL AND COALESCE(act_off,proj_off)>sign_on");
  const total = (await q("SELECT COUNT(*) n FROM crew")).n;
  const byStatus = await env.DB.prepare("SELECT status, COUNT(*) n FROM crew GROUP BY status").all();
  const statusMap = {}; for (const r of byStatus.results) statusMap[r.status] = r.n;
  const medExp = (await q("SELECT COUNT(*) n FROM crew WHERE med_exp IS NOT NULL AND med_exp < ?", in90)).n;
  const ppExp = (await q("SELECT COUNT(*) n FROM crew WHERE pp_exp IS NOT NULL AND pp_exp < ?", in90)).n;
  const usvExp = (await q("SELECT COUNT(*) n FROM crew WHERE usv_exp IS NOT NULL AND usv_exp < ?", in90)).n;
  const vessels = (await q("SELECT COUNT(DISTINCT vessel_observed) n FROM crew")).n;
  return json({
    today,
    workforce: {
      total,
      on_board: statusMap["On board"] || 0,
      on_vacation: statusMap["On Vacation"] || 0,
      earmarked: statusMap["Earmarked"] || 0,
      inactive: statusMap["Inactive"] || 0,
      vessels
    },
    compliance: { med_exp_90: medExp, pp_exp_90: ppExp, usv_exp_90: usvExp },
    history: { crew: (hist && hist.crew) || 0, contracts: (hist && hist.contracts) || 0, days: (hist && hist.days) || 0 }
  });
}

async function apiCrew(env, url) {
  const search = (url.searchParams.get("q") || "").trim().toLowerCase();
  const status = url.searchParams.get("status") || "";
  let sql = "SELECT agency_id, first_name, middle_name, last_name, status, rank_observed, vessel_observed, med_exp, pp_exp, usv_exp, baseline_count FROM crew";
  const where = [], bind = [];
  if (status) { where.push("status = ?"); bind.push(status); }
  if (search) {
    where.push("(lower(first_name) LIKE ? OR lower(last_name) LIKE ? OR lower(agency_id) LIKE ? OR lower(vessel_observed) LIKE ?)");
    const s = "%" + search + "%"; bind.push(s, s, s, s);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY last_name, first_name";
  const rs = await env.DB.prepare(sql).bind(...bind).all();
  return json({ count: rs.results.length, crew: rs.results });
}

async function apiCrewOne(env, url) {
  const id = url.searchParams.get("id");
  const row = await env.DB.prepare("SELECT * FROM crew WHERE agency_id = ?").bind(id).first();
  if (!row) return json({ error: "not found" }, 404);
  await ensureKeyman(env);
  const ct = (await env.DB.prepare("SELECT seq, ship, sign_on as 'on', proj_off as proj, act_off as act FROM keyman_contract2 WHERE sc=? ORDER BY seq").bind(id).all()).results;
  const dw = await env.DB.prepare("SELECT CAST(ROUND(SUM(julianday(COALESCE(act_off,proj_off))-julianday(sign_on))) AS INTEGER) days FROM keyman_contract2 WHERE sc=? AND sign_on IS NOT NULL AND COALESCE(act_off,proj_off)>sign_on").bind(id).first();
  return json({ crew: row, contracts: ct, daysWorked: (dw && dw.days) || 0 });
}

/* ----------------------- compliance + rotation (read views) ----------------------- */
async function apiCompliance(env, url) {
  const today = new Date().toISOString().slice(0, 10);
  const warn = parseInt(url.searchParams.get("days")) || 60;
  const rows = (await env.DB.prepare(
    "SELECT agency_id, first_name, last_name, status, vessel_observed, med_exp, sirb_exp, pp_exp, usv_exp, sch_exp FROM crew WHERE redacted=0"
  ).all()).results;
  return json({ today, warnDays: warn, report: crewComplianceReport(rows, today, warn) });
}
async function apiRotation(env) {
  const rows = (await env.DB.prepare(
    "SELECT agency_id, first_name, last_name, status, vessel_observed, rank_observed, rank_override FROM crew WHERE redacted=0"
  ).all()).results;
  const board = buildRotationBoard(rows);
  board.inDock = inDockNow(DRY_DOCK, TODAY());
  return json(board);
}
function apiFleet() {
  const today = TODAY();
  return json({ today, vessels: VESSEL_REF, dryDock: fleetDryDock(DRY_DOCK, today), inDock: inDockNow(DRY_DOCK, today), upcoming: upcomingDocks(DRY_DOCK, today, 120) });
}

/* ----------------------- bonus engine (locked SOP) ----------------------- */
async function crewCount(env, crewRowId, baseline) {
  const last = await env.DB.prepare("SELECT count_after FROM bonus_outcome WHERE crew_id=? ORDER BY committed_at DESC LIMIT 1").bind(crewRowId).first();
  return last ? last.count_after : (baseline == null ? 0 : baseline);
}
async function apiBonusCrew(env, url) {
  const id = url.searchParams.get("id");
  const cr = await env.DB.prepare("SELECT id, agency_id, first_name, middle_name, last_name, status, rank_observed, vessel_observed, baseline_count FROM crew WHERE agency_id=?").bind(id).first();
  if (!cr) return json({ error: "not found" }, 404);
  const count = await crewCount(env, cr.id, cr.baseline_count);
  const outs = await env.DB.prepare("SELECT id, contract_group_id, score_pct, gate, pay_usd, count_before, count_after, span_start, span_end, ships_json, committed_at FROM bonus_outcome WHERE crew_id=? ORDER BY committed_at DESC").bind(cr.id).all();
  return json({ crew: cr, count, rank: count >= 1 ? "Printer Specialist" : "Junior Printer Specialist", baseline_set: cr.baseline_count != null, nextRungIfClean: ladderValue(count + 1), outcomes: outs.results });
}
async function apiBonusCommit(request, env, session) {
  const b = await request.json().catch(() => ({}));
  const cr = await env.DB.prepare("SELECT id, agency_id, vessel_observed, baseline_count FROM crew WHERE agency_id=?").bind(b.agency_id).first();
  if (!cr) return json({ error: "crew_not_found" }, 404);
  const count = await crewCount(env, cr.id, cr.baseline_count);
  const r = computeBonus({ count, sliders: b.sliders, evalScore: b.evalScore, gates: b.gates });
  if ((r.gate === "rush" || r.gate === "audit") && !(b.gateNote && b.gateNote.trim())) return json({ error: "gate_note_required" }, 400);
  if (!b.spanStart || !b.spanEnd) return json({ error: "span_required" }, 400);
  if (b.spanEnd < b.spanStart) return json({ error: "span_invalid" }, 400);
  const ships = (Array.isArray(b.ships) && b.ships.filter(Boolean).length) ? b.ships.filter(Boolean) : [cr.vessel_observed || "—"];
  const g = b.gates || {};
  const endReason = (!g.complete && g.compassion) ? "compassionate" : (g.complete ? "completed" : (b.endReason || "early_relief"));
  const grpN = ((await env.DB.prepare("SELECT COUNT(*) n FROM contract WHERE crew_id=?").bind(cr.id).first()).n) + 1;
  const groupId = cr.agency_id + "-C" + grpN;
  const cid = "ct_" + crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO contract (id,crew_id,contract_group_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(cid, cr.id, groupId, "Closed", now, now).run();
  for (let i = 0; i < ships.length; i++) {
    await env.DB.prepare("INSERT INTO assignment (id,contract_id,vessel_name,is_transfer,sign_on,actual_sign_off,end_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("as_" + crypto.randomUUID(), cid, ships[i], i > 0 ? 1 : 0, b.spanStart, b.spanEnd, endReason, now, now).run();
  }
  const oid = "bo_" + crypto.randomUUID();
  await env.DB.prepare("INSERT INTO bonus_outcome (id,contract_id,contract_group_id,crew_id,policy_version,scorecard_json,score_pct,gate,gate_note,count_before,count_after,pay_usd,span_start,span_end,ships_json,committed_by,committed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(oid, cid, groupId, cr.id, 1, JSON.stringify(r.breakdown), r.score, r.gate, (b.gateNote || "").trim() || null, r.count, r.nextCount, r.pay, b.spanStart, b.spanEnd, JSON.stringify(ships), (session && session.email) || "system", now).run();
  await logActivity(env, (session && session.email), "commit_outcome", groupId + " pay=" + r.pay + " gate=" + (r.gate || "none"));
  return json({ ok: true, group: groupId, ships, result: r });
}

/* ----------------------- feedback windows ----------------------- */
const FB_TTL = 60 * 60 * 24 * 30; // 30 days
const FB_ROLES = { ray: "Ray — Inventory & Orders", rolando: "Rolando — Technical", dexter: "Dexter — Field review" };
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// Self-creating tables (avoids any manual console SQL).
async function ensureFb(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS feedback_request2 (id TEXT PRIMARY KEY, crew_id TEXT NOT NULL, role TEXT NOT NULL, token_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', due_date TEXT, requested_by TEXT, requested_at TEXT NOT NULL, UNIQUE (crew_id, role))").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS feedback_response2 (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, crew_id TEXT NOT NULL, role TEXT NOT NULL, answers_json TEXT NOT NULL, submitted_at TEXT NOT NULL)").run();
}
// Rita fires a scoped request for a crew+role -> returns a single-use signed link.
async function apiFeedbackRequest(request, env, session, url) {
  await ensureFb(env);
  const b = await request.json().catch(() => ({}));
  const role = b.role;
  if (!FB_ROLES[role]) return json({ error: "bad_role" }, 400);
  const cr = await env.DB.prepare("SELECT id, agency_id, first_name, last_name FROM crew WHERE agency_id=?").bind(b.agency_id).first();
  if (!cr) return json({ error: "crew_not_found" }, 404);
  const token = await signToken({ p: "fb", crewId: cr.id, agency_id: cr.agency_id, role, exp: Math.floor(Date.now() / 1000) + FB_TTL }, env.SESSION_SECRET);
  const th = await sha256hex(token);
  const rid = "fr_" + crypto.randomUUID();
  const now = new Date().toISOString();
  // one open request per crew+role: replace any existing
  await env.DB.prepare("DELETE FROM feedback_request2 WHERE crew_id=? AND role=?").bind(cr.id, role).run();
  await env.DB.prepare("INSERT INTO feedback_request2 (id,crew_id,role,token_hash,status,due_date,requested_by,requested_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(rid, cr.id, role, th, "pending", b.due_date || null, (session && session.email) || null, now).run();
  await logActivity(env, session && session.email, "feedback_request2", cr.agency_id + " " + role);
  return json({ ok: true, link: url.origin + "/fb?t=" + token, role, crew: cr.first_name + " " + cr.last_name });
}
// Contributor opens the link: validate token, return scoped context.
async function apiFeedbackForm(env, url) {
  await ensureFb(env);
  const t = url.searchParams.get("t");
  const p = await verifyToken(t, env.SESSION_SECRET);
  if (!p || p.p !== "fb" || !FB_ROLES[p.role]) return json({ error: "invalid_or_expired" }, 401);
  const th = await sha256hex(t);
  const req = await env.DB.prepare("SELECT id, status FROM feedback_request2 WHERE token_hash=?").bind(th).first();
  if (!req) return json({ error: "revoked" }, 401);
  const cr = await env.DB.prepare("SELECT first_name, middle_name, last_name, vessel_observed FROM crew WHERE id=?").bind(p.crewId).first();
  const existing = await env.DB.prepare("SELECT answers_json FROM feedback_response2 WHERE request_id=?").bind(req.id).first();
  return json({ ok: true, role: p.role, roleLabel: FB_ROLES[p.role], crew: [cr.first_name, cr.middle_name, cr.last_name].filter(Boolean).join(" "), vessel: cr.vessel_observed, status: req.status, answers: existing ? JSON.parse(existing.answers_json) : null });
}
// Contributor submits answers (no session; token authenticates).
async function apiFeedbackSubmit(request, env) {
  await ensureFb(env);
  const b = await request.json().catch(() => ({}));
  const p = await verifyToken(b.t, env.SESSION_SECRET);
  if (!p || p.p !== "fb" || !FB_ROLES[p.role]) return json({ error: "invalid_or_expired" }, 401);
  const th = await sha256hex(b.t);
  const req = await env.DB.prepare("SELECT id, crew_id, role FROM feedback_request2 WHERE token_hash=?").bind(th).first();
  if (!req) return json({ error: "revoked" }, 401);
  const now = new Date().toISOString();
  const naDexter = req.role === "dexter" && (b.answers && b.answers.assessed === "No (N/A)") && !(b.answers && b.answers.mono);
  await env.DB.prepare("DELETE FROM feedback_response2 WHERE request_id=?").bind(req.id).run();
  await env.DB.prepare("INSERT INTO feedback_response2 (id,request_id,crew_id,role,answers_json,submitted_at) VALUES (?,?,?,?,?,?)")
    .bind("fp_" + crypto.randomUUID(), req.id, req.crew_id, req.role, JSON.stringify(b.answers || {}), now).run();
  await env.DB.prepare("UPDATE feedback_request2 SET status=? WHERE id=?").bind(naDexter ? "na" : "answered", req.id).run();
  await logActivity(env, null, "feedback_submit", req.role);
  // notify (queue; emailed server-side once Resend wired)
  try { await env.DB.prepare("INSERT INTO outbox (id,kind,to_addr,payload,status,created_at) VALUES (?,?,?,?,?,?)").bind("ob_" + crypto.randomUUID(), "feedback_notify", "onboardsupport@dg3.com", req.role + " feedback in", "queued", now).run(); } catch {}
  return json({ ok: true });
}
// Rita: feedback status + responses for a crew (also used to pre-fill the Score Card).
async function apiFeedbackCrew(env, url) {
  await ensureFb(env);
  const cr = await env.DB.prepare("SELECT id FROM crew WHERE agency_id=?").bind(url.searchParams.get("id")).first();
  if (!cr) return json({ error: "not_found" }, 404);
  const reqs = await env.DB.prepare("SELECT role, status, requested_at FROM feedback_request2 WHERE crew_id=?").bind(cr.id).all();
  const resp = await env.DB.prepare("SELECT role, answers_json FROM feedback_response2 WHERE crew_id=?").bind(cr.id).all();
  const answers = {}; for (const r of resp.results) answers[r.role] = JSON.parse(r.answers_json);
  return json({ ok: true, requests: reqs.results, answers, prefill: mapFeedbackToScore(answers) });
}

/* ----------------------- HTML ----------------------- */
function htmlResponse(body, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
function noticeHTML(title, msg) {
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
  <body style="font-family:system-ui;background:#0f2238;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
  <div style="text-align:center"><h2>${title}</h2><p style="color:#9fb4cc">${msg}</p><a href="/login" style="color:#5FB946">Back to sign in</a></div>`;
}

const STYLE = `
:root{--navy:#1B3A5C;--deep:#142D48;--ink:#16293D;--green:#5FB946;--green-d:#3E8E2A;--amber:#B0741A;--red:#BC3B2C;--royal:#1E6FD0;--line:#E4E9F0;--line-2:#D5DDE9;--mut:#6B7C93;--bg:#E9EDF3;--surface:#fff}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
h1,h2,h3,.fh{font-family:'Outfit',system-ui,sans-serif;letter-spacing:-.012em}
.brandmark{width:30px;height:30px;border-radius:8px;background:var(--green);display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Outfit';font-weight:800;font-size:16px}
header{background:linear-gradient(180deg,#1F4268,#16314F);color:#fff;padding:0 22px;display:flex;align-items:center;gap:16px;height:58px;position:sticky;top:0;z-index:20}
header .brand{font-family:'Outfit';font-weight:700;font-size:15px}
header .brand small{display:block;font-size:9px;font-weight:500;color:#9fb4cc;letter-spacing:.1em;text-transform:uppercase}
nav{margin-left:auto;display:flex;gap:4px}
nav button{background:transparent;border:0;color:#b9cce0;padding:8px 14px;border-radius:8px;font-family:'Outfit';font-weight:600;font-size:13.5px;cursor:pointer}
nav button.on,nav button:hover{background:rgba(255,255,255,.12);color:#fff}
nav a.out{color:#9fb4cc;font-size:12.5px;text-decoration:none;padding:8px 10px}
.wrap{max-width:1180px;margin:0 auto;padding:22px}
.zlabel{font-family:'Outfit';font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin:20px 0 10px;display:flex;align-items:center;gap:12px}
.zlabel::after{content:'';height:1px;background:var(--line-2);flex:1}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(20,45,72,.05);text-align:center}
.tile .n{font-family:'Outfit';font-size:30px;font-weight:800;color:var(--navy);line-height:1}
.tile .l{font-size:10.5px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:8px}
.tile.green .n{color:var(--green-d)}.tile.amber .n{color:var(--amber)}.tile.royal .n{color:var(--royal)}.tile.gray .n{color:#6B7C93}.tile.red .n{color:var(--red)}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 14px}
.bar h2{font-size:19px;color:var(--navy);margin-right:auto}
input,select{font-family:inherit;font-size:13.5px;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--deep)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 15px;box-shadow:0 1px 2px rgba(20,45,72,.05);border-left:3px solid var(--navy)}
.card.b-Royal{border-left-color:#1E6FD0}.card.b-Celebrity{border-left-color:#0C8C8C}.card.b-Azamara{border-left-color:#7A5AA8}.card.b-NCL{border-left-color:#E0962B}
.cname{font-family:'Outfit';font-weight:700;font-size:15px;color:var(--navy)}
.csub{font-size:12px;color:var(--mut);margin-top:2px}
.statdot{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;margin-top:9px}
.statdot i{width:9px;height:9px;border-radius:50%;display:inline-block}
.vessel{font-size:13px;font-weight:600;color:var(--deep);margin-top:9px}
.cchips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.cchip{font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px}
.cchip.red{background:#fbe9e7;color:var(--red)}.cchip.amber{background:#fff5e6;color:var(--amber)}.cchip.ok{background:#eaf6e6;color:var(--green-d)}
.muted{color:var(--mut);font-size:13px;padding:30px;text-align:center}
.ov{position:fixed;inset:0;background:rgba(20,45,72,.5);display:flex;align-items:center;justify-content:center;z-index:60;padding:20px}
.modal{background:#fff;border-radius:15px;width:560px;max-width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 70px rgba(20,45,72,.28)}
.mh{background:linear-gradient(180deg,#1F4268,#16314F);color:#fff;padding:15px 20px;font-family:'Outfit';font-weight:700;font-size:16px;display:flex;align-items:center;border-bottom:2px solid var(--green)}
.mh button{margin-left:auto;background:transparent;border:0;color:#cdd9e8;font-size:22px;cursor:pointer;line-height:1}
.mb{padding:20px}
.fg{margin-bottom:13px}.fg label{display:block;font-size:12px;font-weight:600;color:var(--mut);margin-bottom:5px;text-transform:uppercase;letter-spacing:.03em}
.fg input,.fg select,.fg textarea{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px}
.f2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.rng{display:flex;align-items:center;gap:10px}.rng input[type=range]{flex:1}.rng .v{font-family:'Outfit';font-weight:700;color:var(--navy);width:30px;text-align:center}
.ck{display:flex;align-items:center;gap:9px;padding:7px 0;font-size:13.5px}.ck input{width:17px;height:17px}
.scorebox{background:var(--bg);border-radius:11px;padding:14px;margin:8px 0}
.scorerow{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}.scorerow b{font-family:'Outfit'}
.bigpay{font-family:'Outfit';font-weight:800;font-size:30px;color:var(--green-d);text-align:center;margin:6px 0}.bigpay.zero{color:var(--red)}
.gateflag{background:#fbe9e7;color:var(--red);border-radius:8px;padding:8px 11px;font-size:12.5px;font-weight:600;margin-top:6px}
.mf{display:flex;gap:9px;justify-content:flex-end;margin-top:10px}
.btn{padding:9px 15px;border:0;border-radius:9px;background:var(--navy);color:#fff;font-weight:600;cursor:pointer;font-family:'DM Sans';font-size:13.5px}
.btn.green{background:var(--green)}.btn.ghost{background:#fff;border:1px solid var(--line);color:var(--navy)}
.warn{background:#fdf7ec;border:1px solid #ecdfc2;color:var(--amber);border-radius:9px;padding:9px 11px;font-size:12.5px;margin-bottom:12px}
.brow{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;margin-bottom:7px;cursor:pointer}
.brow:hover{border-color:var(--navy)}
.tbl{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13.5px}
.tbl th{text-align:left;background:#F2F5FA;color:var(--navy);font-family:'Outfit';font-weight:700;padding:9px 12px;border-bottom:1px solid var(--line-2)}
.tbl td{padding:8px 12px;border-bottom:1px solid var(--line);color:var(--ink)}
.tbl tr:last-child td{border-bottom:0}
.tbl td:nth-child(n+2),.tbl th:nth-child(n+2){text-align:right}
.tbl td:first-child,.tbl th:first-child{text-align:left}
.hint{font-size:11.5px;color:var(--mut);margin-top:3px}
`;

const LOGIN_HTML = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>DG3 CIMS · Sign in</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}
#g{min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,var(--deep),var(--navy));padding:24px}
.box{background:#fff;border-radius:16px;padding:34px 30px;width:360px;max-width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
.box h1{color:var(--navy);font-size:20px;margin:14px 0 4px}.box p{color:var(--mut);font-size:13px;margin-bottom:20px}
.box input{width:100%;text-align:center}.box button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:10px;background:var(--green);color:#fff;font-weight:700;font-family:'Outfit';font-size:15px;cursor:pointer}
.msg{font-size:12.5px;margin-top:12px;min-height:16px;color:var(--mut)}
</style></head><body><div id=g><div class=box>
<div class=brandmark style="margin:0 auto">D</div>
<h1>HR Operational Console</h1><p>DG3 Cruise Industry Managed Services</p>
<input id=email type=email placeholder="you@dg3.com" autocomplete=email>
<button onclick="req()">Send sign-in link</button>
<div class=msg id=msg></div>
<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
<a href="#" id=keytoggle style="color:var(--royal);font-size:12.5px;text-decoration:none">Sign in with access key</a>
<div id=keybox style="display:none;margin-top:10px">
<input id=akey type=password placeholder="Access key" autocomplete=off>
<button onclick="keyLogin()" style="background:var(--navy)">Sign in</button>
</div></div>
</div></div>
<script>
async function req(){
  const email=document.getElementById('email').value.trim();
  const msg=document.getElementById('msg');
  if(!email){msg.textContent='Enter your email.';return;}
  msg.textContent='Working…';
  const r=await fetch('/api/auth/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  const d=await r.json();
  if(d.sent){msg.textContent='If that address is authorized, a sign-in link is on its way.';}
  else{msg.innerHTML='Email isn\\'t set up yet. Use your access key below to sign in.';}
}
document.getElementById('keytoggle').addEventListener('click',function(e){e.preventDefault();var b=document.getElementById('keybox');b.style.display=(b.style.display==='none')?'block':'none';if(b.style.display==='block')document.getElementById('akey').focus();});
async function keyLogin(){
  var email=document.getElementById('email').value.trim();
  var key=document.getElementById('akey').value.trim();
  var msg=document.getElementById('msg');
  if(!email){msg.textContent='Enter your email first.';return;}
  if(!key){msg.textContent='Enter your access key.';return;}
  msg.textContent='Signing in…';
  var r=await fetch('/auth/dev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,key:key})});
  if(r.ok){location.href='/';}else{msg.textContent='Invalid email or access key.';}
}
document.getElementById('email').addEventListener('keydown',e=>{if(e.key==='Enter')req();});
</script></body></html>`;

const FB_HTML = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>CIMS Crew Feedback</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}#fbwrap{max-width:620px;margin:0 auto;padding:26px 18px}.fhd{display:flex;align-items:center;gap:12px;margin-bottom:6px}.card2{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 2px 10px rgba(20,45,72,.07);padding:20px 22px;margin-top:14px}</style>
</head><body><div id=fbwrap>
<div class=fhd><div class=brandmark>D</div><div><div style="font-family:'Outfit';font-weight:700;color:var(--navy)">DG3 CIMS — Crew Feedback</div><div class=hint id=fbsub>Loading…</div></div></div>
<div id=fbbody></div></div>
<script>
var T=new URLSearchParams(location.search).get('t');
var ROLE=null;
function sel(id,opts,val){return '<select id='+id+'>'+opts.map(function(o){return '<option'+(o===val?' selected':'')+'>'+o+'</option>';}).join('')+'</select>';}
function ta(id,v){return '<textarea id='+id+' rows=2>'+(v||'')+'</textarea>';}
async function start(){
  if(!T){document.getElementById('fbsub').textContent='Missing link token.';return;}
  var d=await (await fetch('/api/feedback/form?t='+encodeURIComponent(T))).json();
  if(d.error){document.getElementById('fbbody').innerHTML='<div class=card2><b>This link is invalid or has expired.</b><div class=hint style="margin-top:6px">Please ask Rita for a new feedback link.</div></div>';document.getElementById('fbsub').textContent='';return;}
  ROLE=d.role;var a=d.answers||{};
  document.getElementById('fbsub').textContent=d.roleLabel+' · '+d.crew+(d.vessel?(' · '+d.vessel):'');
  var f='';
  if(d.role==='ray'){
    f+='<div class=fg><label>Did any order fail / need a rush or emergency shipment?</label>'+sel('order',['No','Yes'],a.order||'No')+'</div>'
     +'<div class=fg><label>If yes — cause</label>'+sel('rushcause',['N/A','Crew ordering failure','Legitimate (machine / added sailing / port)'],a.rushcause||'N/A')+'<div class=hint>Only "Crew ordering failure" arms the rush gate.</div></div>'
     +'<div class=fg><label>Rush cost (USD)</label><input id=rushcost type=number min=0 value="'+(a.rushcost||'')+'" placeholder="e.g. 3000"></div>'
     +'<div class=fg><label>Orders placed on time (par respected)?</label>'+sel('ontime',['Always','Mostly','Often late'],a.ontime||'Always')+'</div>'
     +'<div class=fg><label>Order accuracy</label>'+sel('acc',['Accurate','Minor errors','Frequent errors'],a.acc||'Accurate')+'</div>'
     +'<div class=fg><label>Par maintained at handover</label>'+sel('par',['Maintained','Some gaps','Not maintained'],a.par||'Maintained')+'</div>'
     +'<div class=fg><label>Failed end-of-contract inventory audit?</label>'+sel('audit',['No','Yes'],a.audit||'No')+'</div>'
     +'<div class=fg><label>Note / evidence (optional)</label>'+ta('note',a.note)+'</div>';
  } else if(d.role==='rolando'){
    f+='<div class=fg><label>Machine clean &amp; serviceable at handover?</label>'+sel('clean',['Yes','Minor issues','No'],a.clean||'Yes')+'</div>'
     +'<div class=fg><label>Preventive maintenance done correctly?</label>'+sel('pm',['Yes','Partial','No'],a.pm||'Yes')+'</div>'
     +'<div class=fg><label>Unresolved technical issues left for the reliever?</label>'+sel('unres',['None','Minor','Major'],a.unres||'None')+'</div>'
     +'<div class=fg><label>Note / evidence (optional)</label>'+ta('note',a.note)+'</div>';
  } else {
    f+='<div class=fg><label>Did you assess this crew this contract?</label>'+sel('assessed',['No (N/A)','Yes'],a.assessed||'No (N/A)')+'</div>'
     +'<div class=fg><label>Mono click % this contract (&lt;20% target)</label><input id=mono type=number min=0 max=100 step=0.1 value="'+(a.mono||'')+'" placeholder="e.g. 14"><div class=hint>Feeds the Mono discipline sub-score.</div></div>'
     +'<div class=fg><label>Inventory observations</label>'+ta('inv',a.inv)+'</div>'
     +'<div class=fg><label>Technical observations</label>'+ta('tech',a.tech)+'</div>'
     +'<div class=fg><label>Overall impression</label>'+ta('overall',a.overall)+'</div>';
  }
  document.getElementById('fbbody').innerHTML='<div class=card2>'+f+'<div class=mf><button class="btn green" id=sb onclick="submitFb()">Submit feedback</button></div><div class=hint id=fbmsg style="text-align:right"></div></div>';
}
function val(id){var e=document.getElementById(id);return e?e.value:undefined;}
async function submitFb(){
  var ans={};
  if(ROLE==='ray')ans={order:val('order'),rushcause:val('rushcause'),rushcost:val('rushcost'),ontime:val('ontime'),acc:val('acc'),par:val('par'),audit:val('audit'),note:val('note')};
  else if(ROLE==='rolando')ans={clean:val('clean'),pm:val('pm'),unres:val('unres'),note:val('note')};
  else ans={assessed:val('assessed'),mono:val('mono'),inv:val('inv'),tech:val('tech'),overall:val('overall')};
  document.getElementById('sb').disabled=true;document.getElementById('fbmsg').textContent='Saving…';
  var r=await (await fetch('/api/feedback/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:T,answers:ans})})).json();
  document.getElementById('fbbody').innerHTML='<div class=card2 style="text-align:center"><div style="font-family:Outfit;font-weight:800;color:var(--green-d);font-size:20px">✓ Thank you</div><div class=hint style="margin-top:6px">Your feedback was recorded for Rita. You can close this page.</div></div>';
}
start();
</script></body></html>`;

const APP_HTML = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>DG3 CIMS · HR Console</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body>
<header>
  <div class=brandmark>D</div>
  <div class=brand>DG3 CIMS<small>HR Operational Console</small></div>
  <nav>
    <button id=nav-dashboard class=on onclick="show('dashboard')">Dashboard</button>
    <button id=nav-crew onclick="show('crew')">Crew</button>
    <button id=nav-bonus onclick="show('bonus')">Bonus</button>
    <button id=nav-rotation onclick="show('rotation')">Rotation</button>
    <button id=nav-compliance onclick="show('compliance')">Compliance</button>
    <button id=nav-billing onclick="show('billing')">Billing</button>
    <button id=nav-fleet onclick="show('fleet')">Fleet</button>
    <button id=nav-data onclick="show('data')">Data</button>
    <a class=out href="/api/auth/logout">Sign out</a>
  </nav>
</header>
<div class=wrap id=view></div>
<script>
const $=s=>document.querySelector(s);
let CREW=[];
let ROT=null,ROTF='';
function dot(st){return {'On board':'#5FB946','On Vacation':'#B0741A','Earmarked':'#1E6FD0','Inactive':'#9aa7b6'}[st]||'#9aa7b6';}
function brandOf(v){v=(v||'').toUpperCase();if(v.includes('CELEBRITY'))return'Celebrity';if(v.includes('AZAMARA'))return'Azamara';if(v.includes('NCL')||v.includes('NORWEGIAN'))return'NCL';return'Royal';}
function docChip(label,d){if(!d)return'';const days=(new Date(d)-new Date())/86400000;const cls=days<0?'red':days<90?'amber':'ok';return '<span class="cchip '+cls+'">'+label+' '+d+'</span>';}
async function show(tab){
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('on'));
  $('#nav-'+tab).classList.add('on');
  if(tab==='dashboard')return renderDashboard();
  if(tab==='crew')return renderCrew();
  if(tab==='bonus')return renderBonus();
  if(tab==='rotation')return renderRotation();
  if(tab==='compliance')return renderCompliance();
  if(tab==='billing')return renderBilling();
  if(tab==='fleet')return renderFleet();
  if(tab==='data')return renderData();
}
let IMPROWS=null;
function loadSheetJS(cb){
  if(window.XLSX)return cb();
  var s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload=cb; s.onerror=function(){$('#imp').textContent='Could not load the spreadsheet parser.';};
  document.head.appendChild(s);
}
function crewFileChange(input){
  var f=input.files&&input.files[0]; if(!f)return;
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
        var ws=wb.Sheets[wb.SheetNames[0]];
        IMPROWS=XLSX.utils.sheet_to_json(ws,{raw:true,defval:''});
        previewImport();
      }catch(err){$('#imp').textContent='Could not parse that file: '+err.message;}
    };
    rd.readAsArrayBuffer(f);
  });
}
async function previewImport(){
  if(!IMPROWS||!IMPROWS.length){$('#imp').textContent='No rows found in the file.';return;}
  $('#imp').textContent='Analyzing '+IMPROWS.length+' rows…';
  var r=await (await fetch('/api/crew/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:IMPROWS,dryRun:true})})).json();
  var h='<div style="margin-top:6px"><b style="color:var(--navy)">Preview</b> — '+r.total+' rows read · '
    +'<span class="cchip ok">'+r.add+' new</span> <span class="cchip amber">'+r.change+' changed</span> '+r.unchanged+' unchanged'
    +(r.needsStatus?(' · <span class="cchip red">'+r.needsStatus+' new without status (skipped)</span>'):'')
    +(r.invalid?(' · '+r.invalid+' unreadable'):'')+'</div>';
  if((r.add+r.change)>0) h+='<button class="btn" style="margin-top:10px" onclick="applyImport()">Apply '+(r.add+r.change)+' changes</button>';
  else h+='<div class=csub style="margin-top:8px">Nothing to update — data already matches.</div>';
  $('#imp').innerHTML=h;
}
async function applyImport(){
  $('#imp').textContent='Applying…';
  var r=await (await fetch('/api/crew/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:IMPROWS})})).json();
  if(r.ok){$('#imp').innerHTML='<span class="cchip ok">Done</span> applied '+r.applied+' ('+r.added+' new, '+r.changed+' changed'+(r.skippedNoStatus?(', '+r.skippedNoStatus+' skipped'):'')+'). <a href="#" onclick="renderData();return false">Reload</a>';IMPROWS=null;}
  else $('#imp').textContent='Import failed.';
}
async function renderData(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  const d=await (await fetch('/api/datastatus')).json();
  let h='<div class="card" style="border-left:3px solid var(--navy);max-width:none;margin-bottom:14px">'
    +'<div class=cname>Refresh crew registry (AdvancedQuery)</div>'
    +'<div class=csub>Upload Rita\\'s AdvancedQuery export (.xls / .xlsx). You\\'ll see a preview before anything changes. Bonus baselines are never touched.</div>'
    +'<input type=file id=crewfile accept=".xls,.xlsx" style="margin-top:10px" onchange="crewFileChange(this)">'
    +'<div id=imp class=csub style="margin-top:8px"></div></div>';
  h+='<div class=zlabel>Data sources</div><table class=tbl><thead><tr><th>Dataset</th><th>Source</th><th>Records</th></tr></thead><tbody>'
    +d.datasets.map(function(x){return '<tr><td>'+x.name+'</td><td>'+x.source+'</td><td>'+x.count.toLocaleString()+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<div class=zlabel style="margin-top:18px">Recent loads</div>';
  if(!d.log.length)h+='<p class=muted style="text-align:left;padding:8px 2px">No load events recorded yet.</p>';
  else h+='<table class=tbl><thead><tr><th>Source</th><th>Records</th><th>Status</th><th>When</th></tr></thead><tbody>'
    +d.log.map(function(l){return '<tr><td>'+l.source+'</td><td>'+(l.rows||'')+'</td><td><span class="cchip ok">'+l.status+'</span></td><td>'+(l.at||'').slice(0,16).replace('T',' ')+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<p class=muted style="text-align:left;padding:10px 2px">Autonomous refresh from the Drive folder activates once the read-only service account is connected. Until then, data loads on deploy. Bonus baselines stay gated for Rita.</p>';
  $('#view').innerHTML=h;
}
async function renderFleet(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  const f=await (await fetch('/api/fleet')).json();
  const ddBadge=function(s){const c=s==='in_dock'?'red':s==='upcoming'?'amber':'ok';const t=s==='in_dock'?'in dock':s;return '<span class="cchip '+c+'">'+t+'</span>';};
  const byBrand={};f.vessels.forEach(function(v){byBrand[v.brand]=(byBrand[v.brand]||0)+1;});
  let h='<div class=zlabel>Fleet</div><div class=tiles>'
    +tile(f.vessels.length,'Vessels')+tile(byBrand.RCI||0,'Royal','royal')+tile(byBrand.CEL||0,'Celebrity')
    +tile(f.inDock.length,'In dry dock now',f.inDock.length?'red':'green')+tile(f.upcoming.length,'Docks ≤120d','amber')+'</div>';
  h+='<div class=zlabel>Dry-dock schedule</div><table class=tbl><thead><tr><th>Ship</th><th>Start</th><th>End</th><th>Location</th><th>Days</th><th>Status</th></tr></thead><tbody>'
    +f.dryDock.map(function(d){return '<tr><td>'+d.ship+'</td><td>'+d.start+'</td><td>'+(d.end||'open')+'</td><td>'+d.loc+'</td><td>'+(d.days||'—')+'</td><td>'+ddBadge(d.status)+(d.note?(' <span class=csub>'+d.note+'</span>'):'')+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<div class=zlabel style="margin-top:18px">Vessels</div><table class=tbl><thead><tr><th>Ship</th><th>Brand</th><th>Class</th><th>Homeport</th><th>Region</th><th>Lead time</th></tr></thead><tbody>'
    +f.vessels.map(function(v){return '<tr><td>'+v.name+'</td><td>'+v.brand+'</td><td>'+v.cls+'</td><td>'+(v.homeport||'—')+'</td><td>'+(v.region||'—')+'</td><td>'+(v.lead?(v.lead+'d'):'—')+'</td></tr>';}).join('')+'</tbody></table>'
    +'<p class=muted style="text-align:left;padding:10px 2px">Lead time = Miami PO to delivery at ship location. Reference snapshot; refresh when deployment source updates.</p>';
  $('#view').innerHTML=h;
}
let BILL=null;
function ymd(d){return d.toISOString().slice(0,10);}
async function renderBilling(){
  if(!$('#billfrom')){
    const to=new Date();const from=new Date();from.setMonth(from.getMonth()-3);
    $('#view').innerHTML='<div class=bar><h2>Days-worked billing</h2>'
      +'<label class=csub style="margin-left:auto">From <input type=date id=billfrom value="'+ymd(from)+'"></label>'
      +'<label class=csub>To <input type=date id=billto value="'+ymd(to)+'"></label>'
      +'<button class="btn" onclick="loadBilling()">Run</button>'
      +'<button class="btn ghost" onclick="exportBilling()">Download CSV</button></div>'
      +'<div id=billsub class=csub style="margin:-6px 0 12px"></div><div id=billbody></div>';
  }
  loadBilling();
}
async function loadBilling(){
  const f=$('#billfrom').value,t=$('#billto').value;
  $('#billbody').innerHTML='<div class=muted>Calculating…</div>';
  BILL=await (await fetch('/api/daysworked?from='+f+'&to='+t)).json();
  const T=BILL.totals;
  $('#billsub').textContent=T.days.toLocaleString()+' sea-days · '+T.crew+' crew · '+T.vessels+' vessels · '+T.contracts+' contracts in window';
  const bdg=function(b){const c=b==='actual'?'ok':b==='mixed'?'amber':'royal';return '<span class="cchip '+c+'">'+b+'</span>';};
  let h='<div class=zlabel>By vessel</div><table class=tbl><thead><tr><th>Vessel</th><th>Crew</th><th>Days</th><th>Basis</th></tr></thead><tbody>'
    +BILL.perVessel.map(function(v){return '<tr><td>'+v.ship+'</td><td>'+v.crew+'</td><td>'+v.days.toLocaleString()+'</td><td>'+bdg(v.basis)+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<div class=zlabel style="margin-top:18px">By crew</div><table class=tbl><thead><tr><th>Crew</th><th>Days</th><th>Contracts</th><th>Basis</th></tr></thead><tbody>'
    +BILL.perCrew.map(function(c){return '<tr><td>'+c.name+'</td><td>'+c.days.toLocaleString()+'</td><td>'+c.contracts+'</td><td>'+bdg(c.basis)+'</td></tr>';}).join('')+'</tbody></table>'
    +'<p class=muted style="text-align:left;padding:10px 2px">Basis: actual = real sign-off · projected = planned · mixed = both. Per-vessel reflects current vessel assignment.</p>';
  $('#billbody').innerHTML=h;
}
function exportBilling(){
  if(!BILL)return;
  const rows=[['VESSEL DAYS','','','']];
  rows.push(['Vessel','Crew','Days','Basis']);
  BILL.perVessel.forEach(function(v){rows.push([v.ship,v.crew,v.days,v.basis]);});
  rows.push([]);rows.push(['CREW DAYS','','','']);rows.push(['Crew','Days','Contracts','Basis']);
  BILL.perCrew.forEach(function(c){rows.push([c.name,c.days,c.contracts,c.basis]);});
  const csv=rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?('"'+x.replace(/"/g,'""')+'"'):x;}).join(',');}).join('\\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='days-worked_'+$('#billfrom').value+'_'+$('#billto').value+'.csv';a.click();
}
async function renderRotation(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  ROT=await (await fetch('/api/rotation')).json();ROTF='';
  drawRotation();
}
function rotFilter(s){ROTF=(ROTF===s)?'':s;drawRotation();}
function rtile(n,l,cls,st){
  const act=(st!==''&&ROTF===st);
  return '<div class="tile '+(cls||'')+'" data-rot="'+st+'" style="cursor:pointer'+(act?';outline:3px solid var(--navy);outline-offset:-2px':'')+'"><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';
}
function drawRotation(){
  const b=ROT,c=b.counts;
  let h='<div class=zlabel>Rotation — by status'+(ROTF?(' · showing '+ROTF+' (click the tile again to clear)'):' · click a tile to filter')+'</div><div class=tiles>'
    +rtile(c['On board'],'On board','green','On board')+rtile(c['On Vacation'],'On vacation','amber','On Vacation')
    +rtile(c['Earmarked'],'Earmarked','royal','Earmarked')+rtile(c['Inactive'],'Inactive','gray','Inactive')
    +rtile(c.vessels,'Vessels','','')+'</div>';
  const vessels=Object.keys(b.byVessel).filter(function(v){return v!=='—';}).sort();
  const dock=b.inDock||[];
  const isDocked=function(v){var u=(v||'').toUpperCase();return dock.some(function(s){return u.indexOf(s.toUpperCase())>=0;});};
  h+='<div class=zlabel>By vessel</div><div class=grid>'+vessels.map(function(v){
    let crew=b.byVessel[v];
    if(ROTF)crew=crew.filter(function(x){return x.status===ROTF;});
    if(!crew.length)return '';
    const dd=isDocked(v)?' <span class="cchip red">dry dock</span>':'';
    const names=crew.map(function(x){return '<div class=statdot><i style="background:'+dot(x.status)+'"></i>'+x.name+' <span class=csub>('+x.status+')</span></div>';}).join('');
    return '<div class="card b-'+brandOf(v)+'"><div class=cname>'+v+dd+'</div><div class=csub>'+crew.length+' crew</div>'+names+'</div>';
  }).filter(Boolean).join('')+'</div>';
  $('#view').innerHTML=h;
  document.querySelectorAll('#view .tile[data-rot]').forEach(function(el){el.onclick=function(){rotFilter(el.getAttribute('data-rot'));};});
}
let COMP=null;
async function renderCompliance(){
  if(!$('#compdays')){
    $('#view').innerHTML='<div class=bar><h2>Document compliance</h2>'
      +'<label class=csub style="margin-left:auto">Window '
      +'<select id=compdays onchange="loadCompliance()"><option value=30>30 days</option><option value=60 selected>60 days</option><option value=90>90 days</option></select></label>'
      +'<button class="btn ghost" onclick="exportCompliance()">Download CSV</button></div>'
      +'<div id=compsub class=csub style="margin:-6px 0 12px"></div><div id=compbody></div>';
  }
  loadCompliance();
}
async function loadCompliance(){
  const days=$('#compdays')?$('#compdays').value:60;
  $('#compbody').innerHTML='<div class=muted>Loading…</div>';
  COMP=await (await fetch('/api/compliance?days='+days)).json();
  const rows=COMP.report||[];
  const exp=rows.filter(function(r){return r.severity===3;}).length;
  $('#compsub').textContent=rows.length+' flagged ('+exp+' expired) · within '+COMP.warnDays+' days · as of '+COMP.today;
  if(!rows.length){$('#compbody').innerHTML='<p class=muted style="text-align:left;padding:14px 2px">All clear — no documents expired or expiring within '+COMP.warnDays+' days.</p>';return;}
  $('#compbody').innerHTML='<div class=grid>'+rows.map(function(r){
    const flags=r.flags.map(function(f){
      const cls=f.status==='expired'?'red':f.status==='expiring'?'amber':'royal';
      const txt=f.status==='missing'?(f.doc+' missing'):(f.doc+' '+(f.exp||'')+(f.days!=null?(' ('+(f.days<0?(Math.abs(f.days)+'d ago'):(f.days+'d'))+')'):''));
      return '<span class="cchip '+cls+'">'+txt+'</span>';
    }).join('');
    return '<div class="card b-'+brandOf(r.vessel)+'" data-crew="'+r.agency_id+'" style="cursor:pointer"><div class=cname>'+r.name+'</div><div class=csub>'+r.agency_id+' · '+(r.vessel||'—')+'</div><div class=statdot><i style="background:'+dot(r.status)+'"></i>'+(r.status||'')+'</div><div class=cchips>'+flags+'</div></div>';
  }).join('')+'</div>';
  document.querySelectorAll('#compbody .card[data-crew]').forEach(function(el){el.onclick=function(){openCrew(el.getAttribute('data-crew'));};});
}
function exportCompliance(){
  if(!COMP)return;
  const rows=[['Crew','ID','Vessel','Status','Document','Doc status','Expiry','Days']];
  (COMP.report||[]).forEach(function(r){r.flags.forEach(function(f){rows.push([r.name,r.agency_id,r.vessel||'',r.status||'',f.doc,f.status,f.exp||'',f.days==null?'':f.days]);});});
  const csv=rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?('"'+x.replace(/"/g,'""')+'"'):x;}).join(',');}).join('\\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='compliance_'+COMP.today+'_'+COMP.warnDays+'d.csv';a.click();
}
async function renderDashboard(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  const d=await (await fetch('/api/dashboard')).json();
  const w=d.workforce,c=d.compliance;
  $('#view').innerHTML=
   '<div class=zlabel>Workforce</div><div class=tiles>'
   +tile(w.total,'Total crew')+tile(w.on_board,'On board','green')+tile(w.on_vacation,'On vacation','amber')
   +tile(w.earmarked,'Earmarked','royal')+tile(w.inactive,'Inactive','gray')+tile(w.vessels,'Vessels')
   +'</div>'
   +'<div class=zlabel>Compliance — expiring within 90 days</div><div class=tiles>'
   +tile(c.med_exp_90,'Medical','red')+tile(c.pp_exp_90,'Passport','amber')+tile(c.usv_exp_90,'US visa','amber')
   +'</div>'
   +'<div class=zlabel>Contract history (Keyman)</div><div class=tiles>'
   +tile(d.history.crew,'Crew w/ history')+tile(d.history.contracts,'Contracts on file')+tile(d.history.days.toLocaleString(),'Total sea-days')
   +'</div>'
   +'<p class=muted style="text-align:left;padding:14px 2px">Live from Cloudflare D1 · '+w.total+' crew · as of '+d.today+'</p>';
}
function tile(n,l,cls){return '<div class="tile '+(cls||'')+'"><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';}
async function renderCrew(){
  $('#view').innerHTML=
   '<div class=bar><h2>Crew</h2>'
   +'<input id=q placeholder="Search name, ID, ship…" oninput="filterCrew()" style="width:240px">'
   +'<select id=st onchange="filterCrew()"><option value="">All statuses</option>'
   +'<option>On board</option><option>On Vacation</option><option>Earmarked</option><option>Inactive</option></select>'
   +'</div><div id=crewcount class=csub style="margin:-6px 0 12px"></div><div id=crewgrid class=grid></div>';
  await loadCrew();
}
async function loadCrew(){
  const q=$('#q')?$('#q').value:'';const st=$('#st')?$('#st').value:'';
  const r=await (await fetch('/api/crew?q='+encodeURIComponent(q)+'&status='+encodeURIComponent(st))).json();
  CREW=r.crew;
  $('#crewcount').textContent=r.count+' crew';
  $('#crewgrid').innerHTML=CREW.map(card).join('')||'<div class=muted>No matches.</div>';
  document.querySelectorAll('#crewgrid .card[data-crew]').forEach(function(el){el.onclick=function(){openCrew(el.getAttribute('data-crew'));};});
}
let _t;function filterCrew(){clearTimeout(_t);_t=setTimeout(loadCrew,180);}
async function openCrew(id){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  const d=await (await fetch('/api/crew/get?id='+encodeURIComponent(id))).json();
  if(d.error){$('#view').innerHTML='<div class=muted>Not found.</div>';return;}
  const c=d.crew;const name=[c.first_name,c.middle_name,c.last_name].filter(Boolean).join(' ');
  const doc=function(label,dt){if(!dt)return '<span class="cchip">'+label+': —</span>';const days=(new Date(dt)-new Date())/86400000;const cls=days<0?'red':days<90?'amber':'ok';return '<span class="cchip '+cls+'">'+label+' '+dt+'</span>';};
  let h='<div class=bar><h2>'+name+'</h2><button class="btn ghost" style="margin-left:auto" onclick="renderCrew()">← Back to crew</button></div>';
  h+='<div class="card" style="border-left:3px solid var(--navy);max-width:none">'
    +'<div class=csub>'+c.agency_id+' · '+(c.rank_override||c.rank_observed||'')+'</div>'
    +'<div class=statdot><i style="background:'+dot(c.status)+'"></i>'+c.status+'</div>'
    +'<div class=vessel>'+(c.vessel_observed||'—')+'</div>'
    +'<div class=csub style="margin-top:6px">'+[c.email,c.phone,c.province,(c.dob?('DOB '+c.dob):'')].filter(Boolean).join(' · ')+'</div>'
    +'<div class=cchips style="margin-top:8px">'+doc('Medical',c.med_exp)+doc("Seaman bk",c.sirb_exp)+doc('Passport',c.pp_exp)+doc('US visa',c.usv_exp)+doc('Schengen',c.sch_exp)+'</div>'
    +'</div>';
  const ct=d.contracts||[];
  h+='<div class=zlabel style="margin-top:16px">Contract history'+(d.daysWorked?(' · '+d.daysWorked.toLocaleString()+' sea-days'):'')+'</div>';
  if(!ct.length)h+='<p class=muted style="text-align:left;padding:8px 2px">No Keyman contract history on file.</p>';
  else h+='<table class=tbl><thead><tr><th>#</th><th>Ship</th><th>Sign on</th><th>Sign off</th><th>Basis</th></tr></thead><tbody>'
    +ct.map(function(x){var off=x.act||x.proj||'—';var basis=x.act?'<span class="cchip ok">actual</span>':(x.proj?'<span class="cchip royal">projected</span>':'<span class="cchip amber">open</span>');return '<tr><td>'+x.seq+'</td><td>'+(x.ship||'—')+'</td><td>'+x.on+'</td><td>'+off+'</td><td>'+basis+'</td></tr>';}).join('')+'</tbody></table>';
  $('#view').innerHTML=h;
}
function card(c){
  const name=[c.first_name,c.last_name].filter(Boolean).join(' ');
  const b=brandOf(c.vessel_observed);
  return '<div class="card b-'+b+'" data-crew="'+c.agency_id+'" style="cursor:pointer">'
   +'<div class=cname>'+name+'</div>'
   +'<div class=csub>'+c.agency_id+' · '+(c.rank_observed||'')+'</div>'
   +'<div class=statdot><i style="background:'+dot(c.status)+'"></i>'+c.status+'</div>'
   +'<div class=vessel>'+(c.vessel_observed||'—')+'</div>'
   +'<div class=cchips>'+docChip('Med',c.med_exp)+docChip('PP',c.pp_exp)+docChip('USV',c.usv_exp)+'</div>'
   +'</div>';
}
/* ---- bonus engine (client mirror of server logic) ---- */
var FW={sOrder:20,sAcc:25,sPar:15,sHand:10,sComm:10,sMono:5};
var LADDER=[0,0,250,500,750,1000,1250,1500,1750,2000];
function ladderValue(n){return n<=1?0:n>=9?2000:LADDER[n];}
var _SC=null;
function gateLabel(g){return {not_completed:'Contract not completed',rush:'Rush shipment from ordering failure',audit:'Failed inventory audit',eval_below_3:'Supervisor evaluation below 3'}[g]||g;}
function computeBonusC(){
  var g={complete:$('#gComplete').checked,compassion:$('#gCompassion').checked,rush:$('#gRush').checked,audit:$('#gAudit').checked};
  var op=0;for(var k in FW){var e=$('#'+k);var v=e?parseInt(e.value):0;op+=v;}
  var ev=parseInt($('#sEval').value);var ep=ev>=3?15:0;var score=op+ep;
  var gate=null,resets=false,advances=true;
  if(!g.complete&&!g.compassion){gate='not_completed';resets=true;advances=false;}
  else if(g.rush){gate='rush';resets=true;advances=false;}
  else if(g.audit){gate='audit';resets=true;advances=false;}
  else if(ev<3){gate='eval_below_3';advances=false;}
  var count=_SC.count;var nextCount=resets?0:(advances?count+1:count);
  var pay=(!gate&&score>=80)?Math.round(ladderValue(nextCount)*score/100):0;
  return {score:score,gate:gate,count:count,nextCount:nextCount,pay:pay,rung:ladderValue(nextCount)};
}
function rng(id,label,max){return '<div class=fg><label>'+label+' — '+max+'%</label><div class=rng><input type=range id='+id+' min=0 max='+max+' value=0 oninput="recalcScore()"><span class=v id='+id+'v>0</span></div></div>';}
async function renderBonus(){
  $('#view').innerHTML='<div class=bar><h2>Bonus — Score a contract</h2>'
   +'<input id=bq placeholder="Search crew to score…" oninput="filterBonus()" style="width:260px"></div>'
   +'<div class=hint style="margin:-6px 0 12px">Pick a crew member to open their contract-completion Score Card. Scoring writes a permanent outcome and updates their consecutive-contract count.</div>'
   +'<div id=blist></div>';
  loadBonus();
}
let _bt;function filterBonus(){clearTimeout(_bt);_bt=setTimeout(loadBonus,180);}
async function loadBonus(){
  var q=$('#bq')?$('#bq').value:'';
  var r=await (await fetch('/api/crew?q='+encodeURIComponent(q))).json();
  $('#blist').innerHTML=r.crew.slice(0,40).map(function(c){
    var name=[c.first_name,c.last_name].filter(Boolean).join(' ');
    return '<div class=brow onclick="openScore(\\''+c.agency_id+'\\')"><div><div class=cname style="font-size:14px">'+name+'</div><div class=csub>'+c.agency_id+' · '+(c.vessel_observed||'—')+'</div></div><div style="margin-left:auto"><span class="btn green" style="pointer-events:none">Score →</span></div></div>';
  }).join('')||'<div class=muted>No matches.</div>';
}
async function openScore(id){
  var d=await (await fetch('/api/bonus/crew?id='+encodeURIComponent(id))).json();
  _SC=d; var cr=d.crew; var name=[cr.first_name,cr.middle_name,cr.last_name].filter(Boolean).join(' ');
  var warn=d.baseline_set?'':'<div class=warn>⚠ Starting count not yet confirmed for this crew — treated as 0. Confirm via the reconciliation sheet before any payout is finalised.</div>';
  var hist=d.outcomes.length?('<div class=hint style="margin-top:6px">Prior outcomes: '+d.outcomes.length+' · latest count '+d.outcomes[0].count_after+'</div>'):'';
  var body=''
   +'<div class=hint>'+cr.agency_id+' · '+d.rank+' · Contract count <b>'+d.count+'</b> → completing makes it '+(d.count+1)+'. Ladder if clean &amp; ≥80%: <b>$'+d.nextRungIfClean.toLocaleString()+'</b>.</div>'
   +warn+hist+'<div id=fbPanel></div>'
   +'<div class=f2 style="margin-top:12px"><div class=fg><label>Sign-on</label><input type=date id=spanStart></div><div class=fg><label>Sign-off</label><input type=date id=spanEnd></div></div>'
   +'<div class=fg><label>Ship(s) — comma-separate for transfers</label><input type=text id=ships value="'+(cr.vessel_observed||'').replace(/"/g,'')+'"></div>'
   +'<label class=ck><input type=checkbox id=gComplete checked onchange="recalcScore()"> Contract completed in full</label>'
   +'<label class=ck><input type=checkbox id=gCompassion onchange="recalcScore()"> Not completed — approved compassionate leave (treat as completed)</label>'
   +'<label class=ck><input type=checkbox id=gRush onchange="recalcScore()"> Emergency/rush order from ordering failure (resets count)</label>'
   +'<label class=ck><input type=checkbox id=gAudit onchange="recalcScore()"> Failed end-of-contract inventory audit (resets count)</label>'
   +'<div class=fg id=gateNoteWrap style="display:none"><label>Reason &amp; evidence (required for a reset gate)</label><textarea id=gateNote rows=2 placeholder="e.g. Rush airfreight magenta toner 12 Mar — par hit 0, prior order skipped. Zendesk #5843."></textarea></div>'
   +'<div style="margin:14px 0 6px;font-weight:700;font-family:\\'Outfit\\';color:var(--navy)">Scorecard</div>'
   +'<div class=hint style="margin:-2px 0 8px">Award each factor from evidence (sliders start at 0).</div>'
   +rng('sOrder','On-time ordering',20)+rng('sAcc','Order accuracy',25)+rng('sPar','Par maintenance',15)
   +rng('sHand','Ship-condition handover',10)+rng('sComm','Communication (manual — Rita)',10)+rng('sMono','Mono click discipline (<20%)',5)
   +'<div class=fg style="margin-top:10px"><label>Supervisor evaluation (1–5) — 15%</label><select id=sEval onchange="recalcScore()"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select><div class=hint>1–2 → bonus forfeited, count held. 3/4/5 → full 15 points.</div></div>'
   +'<div id=scoreOut></div>'
   +'<div class=mf><button class="btn ghost" onclick="mClose()">Cancel</button><button class="btn green" id=commitBtn onclick="commitBonus()">Close &amp; commit</button></div>';
  $('#modalRoot').innerHTML='<div class=ov onclick="if(event.target===this)mClose()"><div class=modal><div class=mh>Score Card — '+name+'<button onclick="mClose()">×</button></div><div class=mb>'+body+'</div></div></div>';
  recalcScore();
  applyFeedback(cr.agency_id);
}
async function applyFeedback(id){
  var d=await (await fetch('/api/feedback/crew?id='+encodeURIComponent(id))).json();
  if(!d||!d.ok||!document.getElementById('fbPanel'))return;
  var byRole={};(d.requests||[]).forEach(function(r){byRole[r.role]=r.status;});
  var roles=[['ray','Ray'],['rolando','Rolando'],['dexter','Dexter']];
  var btns=roles.map(function(x){var st=byRole[x[0]]||'none';var lbl=st==='answered'?'✓ '+x[1]:st==='na'?x[1]+': N/A':st==='pending'?x[1]+': pending':x[1]+': get link';var cls=st==='answered'?'green':'ghost';return '<button class="btn '+cls+'" style="padding:6px 10px;font-size:12px" onclick="genLink(\\''+id+'\\',\\''+x[0]+'\\')">'+lbl+'</button>';}).join(' ');
  var ev=(d.prefill&&d.prefill.evidence&&d.prefill.evidence.length)?('<div class=hint style="margin-top:8px"><b style="color:var(--navy)">Evidence from windows</b><br>'+d.prefill.evidence.join('<br>')+'</div>'):'';
  document.getElementById('fbPanel').innerHTML='<div class=fg style="margin-top:8px"><label>Contributor feedback windows</label><div style="display:flex;gap:6px;flex-wrap:wrap">'+btns+'</div><div id=fbLink></div>'+ev+'</div>';
  var pf=d.prefill||{};
  if(pf.gates){if(pf.gates.rush)$('#gRush').checked=true;if(pf.gates.audit)$('#gAudit').checked=true;}
  if(pf.sliders)for(var k in pf.sliders){var e=$('#'+k);if(e)e.value=pf.sliders[k];}
  if(pf.gateNote&&pf.gateNote.length){var gn=$('#gateNote');if(gn&&!gn.value)gn.value=pf.gateNote.join(' · ');}
  recalcScore();
}
async function genLink(id,role){
  var r=await (await fetch('/api/feedback/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,role:role})})).json();
  if(r.error){alert('Error: '+r.error);return;}
  document.getElementById('fbLink').innerHTML='<div class=hint style="margin-top:6px">Single-use '+role+' link — send to the contributor:<br><input readonly value="'+r.link+'" onclick="this.select()" style="width:100%;margin-top:4px;font-size:11px"></div>';
}
function recalcScore(){
  for(var k in FW){var e=$('#'+k);if(e)$('#'+k+'v').textContent=e.value;}
  $('#gateNoteWrap').style.display=($('#gRush').checked||$('#gAudit').checked)?'block':'none';
  var r=computeBonusC();
  var note=r.gate?(r.gate==='eval_below_3'?'Forfeited — count holds at '+r.count:'Bonus $0 — count resets to 0'):(r.score<80?'Below 80% floor — $0, count advances to '+r.nextCount:'Ladder $'+r.rung.toLocaleString()+' × '+r.score+'% (proportional)');
  $('#scoreOut').innerHTML='<div class=scorebox><div class=scorerow><span>Scorecard total</span><b>'+r.score+'%</b></div><div class=scorerow><span>Floor</span><b>80%</b></div><div class=scorerow><span>Count after</span><b>'+r.count+' → '+r.nextCount+'</b></div>'+(r.gate?'<div class=gateflag>GATE: '+gateLabel(r.gate)+'</div>':'')+'<div class="bigpay '+(r.pay===0?'zero':'')+'">$'+r.pay.toLocaleString()+'</div><div class=hint style="text-align:center">'+note+'</div></div>';
}
async function commitBonus(){
  var btn=$('#commitBtn');btn.disabled=true;btn.textContent='Committing…';
  var sliders={};for(var k in FW)sliders[k]=parseInt($('#'+k).value);
  var payload={agency_id:_SC.crew.agency_id,spanStart:$('#spanStart').value,spanEnd:$('#spanEnd').value,
    ships:$('#ships').value.split(',').map(function(s){return s.trim();}).filter(Boolean),
    sliders:sliders,evalScore:parseInt($('#sEval').value),
    gates:{complete:$('#gComplete').checked,compassion:$('#gCompassion').checked,rush:$('#gRush').checked,audit:$('#gAudit').checked},
    gateNote:$('#gateNote')?$('#gateNote').value:''};
  var res=await (await fetch('/api/bonus/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).json();
  if(res.error){btn.disabled=false;btn.textContent='Close & commit';var msgs={gate_note_required:'A reset gate needs a written reason & evidence.',span_required:'Enter sign-on and sign-off dates.',span_invalid:'Sign-off must be after sign-on.'};alert(msgs[res.error]||('Error: '+res.error));return;}
  var r=res.result;
  $('#modalRoot').innerHTML='<div class=ov onclick="if(event.target===this)mClose()"><div class=modal><div class=mh>Bonus committed<button onclick="mClose()">×</button></div><div class=mb><div class=hint>Contract '+res.group+' · '+res.ships.join(' → ')+'</div><div class="bigpay '+(r.pay===0?'zero':'')+'">$'+r.pay.toLocaleString()+'</div><div class=scorebox><div class=scorerow><span>Scorecard</span><b>'+r.score+'%</b></div><div class=scorerow><span>Count</span><b>'+r.count+' → '+r.nextCount+'</b></div>'+(r.gate?'<div class=gateflag>GATE: '+gateLabel(r.gate)+'</div>':'')+'</div><div class=hint>Recorded as an immutable outcome under policy v1. The crew\\'s count is now '+r.nextCount+'.</div><div class=mf><button class="btn green" onclick="mClose();show(\\'bonus\\')">Done</button></div></div></div></div>';
}
function mClose(){$('#modalRoot').innerHTML='';}
show('dashboard');
</script>
<div id=modalRoot></div></body></html>`;
