import { ladderValue, computeBonus, mapFeedbackToScore } from "./bonus.js";
import { signToken, verifyToken } from "./auth.js";
import { crewComplianceReport } from "./compliance.js";
import { buildRotationBoard } from "./rotation.js";
import { KEYMAN_CONTRACTS } from "./keyman_data.js";
import { billingReport, periodDays } from "./daysworked.js";
import { VESSEL_REF, DRY_DOCK } from "./vessel_ref.js";
import { fleetDryDock, inDockNow, upcomingDocks } from "./fleet.js";
import { mapRows, diffCrew } from "./crewimport.js";
import { ICO_B64, PNG180_B64, PNG512_B64 } from "./icons.js";
import { composeStatement } from "./statement.js";
import { crewDeployment } from "./deploy.js";
import { parseTravelSheets, summarize as travelSummarize } from "./travel.js";
import { TRAVEL_2025 } from "./travel_data.js";
import { resolveBaseline, isMoneyUser, feedbackSubmittable } from "./policy.js";
import { SHIP_HISTORY } from "./ship_history.js";
import { buildShipKeys, canonShipWith, validShipKeys, AZAMARA_SHORT } from "./shipname.js";
import { applyOverride, OVR_FIELDS } from "./override.js";
import { contractLedgerRow, psRank } from "./ledger.js";
import { contractCounts, fullContracts, deriveStatus } from "./contracts.js";
import { parseContractCounter, buildKeymanRows } from "./keymanimport.js";
import { classifyWindow } from "./scorequeue.js";
import { buildRoster, matchCrew } from "./crewmatch.js";
import { pickEngine, intelSystemPrompt, intelUserPrompt, parseIntelResponse, INTEL_MODEL_CLAUDE, INTEL_MODEL_WORKERSAI } from "./intelai.js";

/* ============================================================
   DG3 CIMS — HR Operational Console · Cloudflare Worker (v1)
   Single-file ES module. Paste into the dashboard Worker editor.
   Bindings required:
     - D1 database bound as  DB   (the cims-hr-console database)
   Secrets (set in dashboard → Settings → Variables and Secrets):
     - SESSION_SECRET  (required) long random string; signs login + session tokens
     - BOOTSTRAP_KEY   (required for first login w/o email) long random string
     - RESEND_API_KEY  (optional) enables emailing the magic link via Resend
     - MAIL_FROM       (optional) "CIMS <noreply@cims.work>" (cims.work is the verified Resend domain)
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
      // ---- public brand icons (no auth) ----
      if (p === "/favicon.ico")          return assetResponse(ICO_B64, "image/x-icon");
      if (p === "/apple-touch-icon.png" || p === "/apple-touch-icon-precomposed.png")
                                         return assetResponse(PNG180_B64, "image/png");
      if (p === "/icon-512.png")         return assetResponse(PNG512_B64, "image/png");

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
        if (p === "/api/crew/save" && request.method === "POST") return apiCrewSave(request, env, session);
        if (p === "/api/crew/add"  && request.method === "POST") return apiCrewAdd(request, env, session);
        if (p === "/api/crew/notes") return apiCrewNotes(request, env, session, url);
        if (p === "/api/crew/statement.pdf") return apiStatementPdf(env, url);
        if (p === "/api/crew/statement/email" && request.method === "POST") return apiStatementEmail(request, env, session);
        if (p === "/api/compliance") return apiCompliance(env, url);
        if (p === "/api/rotation")   return apiRotation(env);
        if (p === "/api/rotation/assign" && request.method === "POST") return apiRotationAssign(request, env, session);
        if (p === "/api/rotation/ready" && request.method === "POST") return apiReady(request, env, session);
        if (p === "/api/rotation/crew") return apiRotationCrew(env, url);
        if (p === "/api/rotation/note" && request.method === "POST") return apiNote(request, env, session);
        if (p === "/api/rotation/contract" && request.method === "POST") return apiContractEdit(request, env, session);
        if (p === "/api/fleet")      return apiFleet();
        if (p === "/api/datastatus") return apiDataStatus(env);
        if (p === "/api/crew/import" && request.method === "POST") return apiCrewImport(request, env, session);
        if (p === "/api/keyman/import" && request.method === "POST") return apiKeymanImport(request, env, session);
        if (p === "/api/daysworked") return apiDaysWorked(env, url);
        if (p === "/api/billing/month") return apiBillingMonth(env);
        if (p === "/api/travel")     return apiTravel(env, url);
        if (p === "/api/travel/import" && request.method === "POST") return apiTravelImport(request, env, session);
        if (p === "/api/bonus/crew")   return apiBonusCrew(env, url);
        if (p === "/api/bonus/commit" && request.method === "POST") return apiBonusCommit(request, env, session);
        if (p === "/api/contracts")    return apiContracts(env);
        if (p === "/api/feedback/request" && request.method === "POST") return apiFeedbackRequest(request, env, session, url);
        if (p === "/api/feedback/crew")  return apiFeedbackCrew(env, url);
        if (p === "/api/feedback/board") return apiFeedbackBoard(env);
        if (p === "/api/feedback/score" && request.method === "POST") return apiFeedbackScore(request, env, session);
        if (p === "/api/score/queue")    return apiScoreQueue(env, url);
        if (p === "/api/intel/inbox")    return apiIntelInbox(env);
        if (p === "/api/intel/ingest" && request.method === "POST") return apiIntelIngest(request, env, session);
        if (p === "/api/intel/file" && request.method === "POST") return apiIntelFile(request, env, session);
        if (p === "/api/intel/crew")     return apiIntelCrew(env, url);
        if (p === "/api/intel/review")   return apiIntelReview(env);
        if (p === "/api/intel/resolve" && request.method === "POST") return apiIntelResolve(request, env, session);
        if (p === "/api/intel/edit" && request.method === "POST") return apiIntelEdit(request, env, session);
        if (p === "/api/intel/run" && request.method === "POST") { const n = await processIntelInbox(env, 25); return json({ ok: true, processed: n, engine: pickEngine(env) }); }
        return json({ error: "not found" }, 404);
      }
      // app shell (any non-api path) — gate on session
      if (!session) return Response.redirect(url.origin + "/login", 302);
      return htmlResponse(APP_HTML);
    } catch (err) {
      // Log server-side (Cloudflare tail/logs) but never leak internals to the client.
      console.error("worker_error", (err && err.stack) || err);
      return json({ error: "server_error" }, 500);
    }
  },
  // Cloudflare Email Routing delivers crew-report mail here. Store the raw message, then kick off
  // AI processing immediately (on arrival) so a card appears within seconds. ctx.waitUntil keeps the
  // SMTP accept fast and lets the summarise+file run in the background. Defensive: never throw (that bounces).
  async email(message, env, ctx) {
    try {
      await ensureIntel(env);
      let raw = "";
      try { raw = await new Response(message.raw).text(); } catch (e) {}
      const subject = (message.headers && message.headers.get && message.headers.get("subject")) || null;
      await env.DB.prepare("INSERT INTO email_inbox (id,from_addr,to_addr,subject,raw,received_at,status) VALUES (?,?,?,?,?,?,'new')")
        .bind("em_" + crypto.randomUUID(), message.from || null, message.to || null, subject, String(raw).slice(0, 60000), new Date().toISOString()).run();
      if (ctx && ctx.waitUntil) ctx.waitUntil(processIntelInbox(env, 5));
    } catch (e) { console.error("email_ingest_error", (e && e.stack) || e); }
  },
  // Hourly safety-net sweep: catches any email that arrived while the AI engine was briefly
  // unavailable (left in 'new'). Configured by [triggers] crons in wrangler.toml.
  async scheduled(event, env, ctx) {
    if (ctx && ctx.waitUntil) ctx.waitUntil(processIntelInbox(env, 25));
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
// Login allowlist — SINGLE SOURCE OF TRUTH. All rows are role 'full' (only role today).
// WARNING: 'full' = sees bonus $, billing margins, and crew PII. Granting full access was
// Miguel's explicit decision 2026-06-12. To scope a user, a non-'full' role must be built first.
const ALLOWLIST_SEED = [
  ["Miguel.Sanmartin@dg3.com", "Miguel San Martin"],
  ["Rita.Berenyi@dg3.com",     "Rita Berenyi"],
  ["Ray.Guerra@dg3.com",       "Ray Guerra"],
  ["Rolando.Abellan@dg3.com",  "Rolando Abellan"],
  ["Dexter.Lawrence@dg3.com",  "Dexter Lawrence"],
  ["joemar.deleon@dg3.com",    "Joemar De Leon"],
  ["Ohji.Miranda@dg3.com",     "Ohji Miranda"],
];
// Idempotent: seeds the allowlist (INSERT OR IGNORE on UNIQUE email). Safe to run every login.
async function ensureUsers(env) {
  for (const [email, name] of ALLOWLIST_SEED) {
    const id = "u_" + email.toLowerCase().replace(/[^a-z0-9]/g, "");
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?,?,?,'full')")
      .bind(id, email, name).run();
  }
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
  await ensureUsers(env).catch(() => {});
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
  await ensureUsers(env).catch(() => {});
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
// Bump when KEYMAN_CONTRACTS is regenerated from a new workbook so the deploy actually RELOADS
// D1 (seed-only-when-empty would otherwise ignore the new data). Reseed is keyman_contract3 only;
// per-contract manual edits live in the separate contract_edit table and are preserved.
const KEYMAN_VERSION = "2026-06-13-cc-v3";
async function ensureKeyman(env) {
  // PRIMARY KEY (sc,seq) + INSERT OR REPLACE = race-proof idempotent seeding. Earlier DELETE+INSERT
  // reseeds raced under concurrent requests and STACKED rows (3x duplication); this can't.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS keyman_contract3 (sc TEXT NOT NULL, km TEXT, ship TEXT, st TEXT, seq INTEGER, sign_on TEXT, proj_off TEXT, act_off TEXT, PRIMARY KEY (sc, seq))").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS data_meta (k TEXT PRIMARY KEY, v TEXT)").run();
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM keyman_contract3").first()).n;
  const ver = await env.DB.prepare("SELECT v FROM data_meta WHERE k='keyman_version'").first();
  const stale = !ver || ver.v !== KEYMAN_VERSION;
  if ((n === 0 || stale) && KEYMAN_CONTRACTS.length) {
    const stmt = env.DB.prepare("INSERT OR REPLACE INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off,act_off) VALUES (?,?,?,?,?,?,?,?)");
    await env.DB.batch(KEYMAN_CONTRACTS.map(r => stmt.bind(r.sc, r.km, r.ship, r.st, r.seq, r.on, r.proj, r.act)));
    // Prune any (sc,seq) no longer in the dataset (e.g. a crew's contract count shrank on refresh).
    const keep = new Set(KEYMAN_CONTRACTS.map(r => r.sc + "|" + r.seq));
    const have = (await env.DB.prepare("SELECT sc, seq FROM keyman_contract3").all()).results;
    const extra = have.filter(r => !keep.has(r.sc + "|" + r.seq));
    if (extra.length) await env.DB.batch(extra.map(r => env.DB.prepare("DELETE FROM keyman_contract3 WHERE sc=? AND seq=?").bind(r.sc, r.seq)));
    await env.DB.prepare("INSERT INTO data_meta (k,v) VALUES ('keyman_version',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(KEYMAN_VERSION).run();
    await logData(env, "keyman_contract (Contract Counter " + KEYMAN_VERSION + ")", KEYMAN_CONTRACTS.length, n > 0 ? "refreshed" : "seeded");
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

// Keyman "Contract Counter" import. Client sends the sheet as array-of-arrays. We parse the contract
// blocks, bridge crew to SC by name, and (on apply) refresh keyman_contract3 for the MATCHED crew only
// (untouched crew keep their rows). This feeds the full-contract count + rank; never a payout input.
async function apiKeymanImport(request, env, session) {
  await ensureKeyman(env);
  const b = await request.json().catch(() => ({}));
  const parsed = parseContractCounter(b.rows || []);
  if (!parsed.length) return json({ error: "no_rows" }, 400);
  const roster = (await env.DB.prepare("SELECT agency_id, first_name, last_name FROM crew WHERE redacted=0").all()).results;
  const { rows, matched, unmatched } = buildKeymanRows(parsed, roster);
  const currentRows = (((await env.DB.prepare("SELECT COUNT(*) n FROM keyman_contract3").first()) || {}).n) || 0;
  if (b.dryRun) {
    return json({
      dryRun: true, crewInFile: parsed.length, matched: matched.length, unmatched: unmatched.length,
      contracts: rows.length, currentRows,
      sampleUnmatched: unmatched.slice(0, 15).map(u => (u.last + ", " + u.first).trim())
    });
  }
  // Apply: replace contracts for matched crew only.
  if (matched.length) await env.DB.batch(matched.map(sc => env.DB.prepare("DELETE FROM keyman_contract3 WHERE sc=?").bind(sc)));
  const ins = env.DB.prepare("INSERT OR REPLACE INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off,act_off) VALUES (?,?,?,?,?,?,?,?)");
  for (let i = 0; i < rows.length; i += 80) {
    await env.DB.batch(rows.slice(i, i + 80).map(r => ins.bind(r.sc, r.km, r.ship, r.st, r.seq, r.sign_on, r.proj_off, r.act_off)));
  }
  // Pin the version so the bundled-snapshot self-seed (ensureKeyman) doesn't overwrite this import.
  await env.DB.prepare("INSERT INTO data_meta (k,v) VALUES ('keyman_version',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(KEYMAN_VERSION).run();
  await logData(env, "keyman_contract (Contract Counter import, by " + ((session && session.email) || "?") + ")", rows.length, "refreshed " + matched.length + " crew");
  return json({ ok: true, applied: rows.length, crew: matched.length, unmatched: unmatched.length });
}

async function apiDataStatus(env) {
  await ensureKeyman(env); try { await ensureFb(env); } catch {} try { await ensureTravel(env); } catch {}
  const q = async (s) => (await env.DB.prepare(s).first());
  const cnt = async (s) => { try { return (await q(s)).n; } catch { return 0; } };
  const datasets = [
    { name: "Crew registry", source: "AdvancedQuery (TDG, Rita)", count: await cnt("SELECT COUNT(*) n FROM crew") },
    { name: "Contract history", source: "CIMS Keyman workbook", count: await cnt("SELECT COUNT(*) n FROM keyman_contract3") },
    { name: "Fleet / vessels", source: "Vessel Deployment reference", count: VESSEL_REF.length },
    { name: "Feedback responses", source: "In-app (contributors)", count: await cnt("SELECT COUNT(*) n FROM feedback_response2") },
    { name: "Bonus outcomes", source: "In-app (committed)", count: await cnt("SELECT COUNT(*) n FROM bonus_outcome") },
    { name: "Travel expenses", source: "Travel workbook (2025 history + Rita uploads)", count: await cnt("SELECT COUNT(*) n FROM travel_expense") },
  ];
  let log = [];
  try { log = (await env.DB.prepare("SELECT source,rows,status,at FROM data_log ORDER BY at DESC LIMIT 12").all()).results; } catch {}
  return json({ today: TODAY(), datasets, log });
}
// Read all contract rows in the shape billingReport expects.
// {on,end,ship} shape that contracts.js (full-contract grouping) expects, from a keyman_contract3 row.
function legShape(r) { return { on: r.sign_on, end: r.act_off || r.proj_off, ship: r.ship }; }
// sc -> number of FULL contracts (legs grouped by the <=3-week transfer rule, each reaching the line
// duration minimum). This — not the raw leg count — drives the rank tier and the "Contracts" number.
async function fullContractMap(env) {
  const rows = (await env.DB.prepare("SELECT sc, ship, sign_on, proj_off, act_off FROM keyman_contract3 WHERE sign_on IS NOT NULL").all()).results;
  const byCrew = {};
  for (const r of rows) (byCrew[r.sc] = byCrew[r.sc] || []).push(legShape(r));
  const map = {};
  for (const sc in byCrew) map[sc] = contractCounts(byCrew[sc]).full;
  return map;
}
async function keymanRows(env) {
  // NOTE: 'on' is a reserved SQL keyword, so aliasing sign_on AS on makes D1 reject the query
  // (this silently broke days-worked from the keyman_contract3 rename onward). Select raw columns
  // and map to the {on,proj,act} shape billingReport expects in JS instead.
  const r = await env.DB.prepare("SELECT sc, ship, sign_on, proj_off, act_off FROM keyman_contract3").all();
  return (r.results || []).map(x => ({ sc: x.sc, ship: x.ship, on: x.sign_on, proj: x.proj_off, act: x.act_off }));
}
async function apiDaysWorked(env, url) {
  try {
    await ensureKeyman(env);
    const asOf = TODAY();
    const from = url.searchParams.get("from") || null;
    const to = url.searchParams.get("to") || asOf;
    const rows = await keymanRows(env);
    const rep = billingReport(rows, { from, to, asOf });
    // attach crew name + current vessel + customer (cruise line) + status for the per-crew view,
    // so the monthly billing export can attribute each crew's days to the right customer.
    const names = {};
    const cr = await env.DB.prepare("SELECT agency_id, first_name, last_name, vessel_observed, status FROM crew").all();
    for (const c of cr.results) names[c.agency_id] = { name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(), vessel: c.vessel_observed, status: c.status };
    rep.perCrew = rep.perCrew.map(x => {
      const nm = names[x.sc] || {};
      return { ...x, name: nm.name || x.sc, vessel: nm.vessel || null, client: clientOf(nm.vessel), status: nm.status || null };
    });
    return json(rep);
  } catch (e) {
    console.error("daysworked_error", (e && e.stack) || e);
    return json({ error: "daysworked_failed", detail: String(e && e.message || e) }, 500);
  }
}

// Travel expenses — 2025 seeded as history; 2026+ uploaded in-app by Rita (replace-by-year).
// kind = 'crew' (monthly sheets) | 'shoreside' (CIMS staff sheet) so the dashboard can show
// totals with and without shoreside management.
async function insertTravel(env, recs, year) {
  const stmt = env.DB.prepare("INSERT INTO travel_expense (id,year,month,leg,kind,crew_name,air,hotel,medical,visa,food,transport,other,total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 0; i < recs.length; i += 100) {
    await env.DB.batch(recs.slice(i, i + 100).map((r, j) => {
      const y = year || r.year;
      return stmt.bind("tx_" + y + "_" + r.month + "_" + (r.kind || "crew") + "_" + (i + j), y, r.month, r.leg, r.kind || "crew", r.crew_name, r.air, r.hotel, r.medical, r.visa, r.food, r.transport, r.other || 0, r.total);
    }));
  }
}
async function ensureTravel(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS travel_expense (id TEXT PRIMARY KEY, year INTEGER, month INTEGER, leg TEXT, kind TEXT DEFAULT 'crew', crew_name TEXT, air REAL, hotel REAL, medical REAL, visa REAL, food REAL, transport REAL, other REAL DEFAULT 0, total REAL)").run();
  // Steady state = one combined count. If 'kind' is missing (legacy table) the query throws -> migrate once.
  let st = null;
  try { st = await env.DB.prepare("SELECT COUNT(*) total, SUM(CASE WHEN kind='shoreside' THEN 1 ELSE 0 END) shore FROM travel_expense").first(); } catch (e) { st = null; }
  if (!st) {
    try { await env.DB.prepare("ALTER TABLE travel_expense ADD COLUMN kind TEXT DEFAULT 'crew'").run(); } catch {}
    try { await env.DB.prepare("ALTER TABLE travel_expense ADD COLUMN other REAL DEFAULT 0").run(); } catch {}
  }
  const total = st ? st.total : (await env.DB.prepare("SELECT COUNT(*) n FROM travel_expense").first()).n;
  const shore = st ? (st.shore || 0) : 0;
  if ((total === 0 || shore === 0) && TRAVEL_2025.length) {
    await env.DB.prepare("DELETE FROM travel_expense WHERE year=2025").run();
    await insertTravel(env, TRAVEL_2025, 2025);
    await logData(env, "travel_expense (2025 history incl. shoreside)", TRAVEL_2025.length, "seeded");
  }
}
async function apiTravel(env, url) {
  await ensureTravel(env);
  const year = url.searchParams.get("year"), kind = url.searchParams.get("kind");
  let sql = "SELECT year,month,leg,kind,crew_name,air,hotel,medical,visa,food,transport,other,total FROM travel_expense";
  const where = [], bind = [];
  if (year) { where.push("year=?"); bind.push(+year); }
  if (kind) { where.push("kind=?"); bind.push(kind); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY year DESC, month, crew_name";
  const rows = (await env.DB.prepare(sql).bind(...bind).all()).results;
  const years = (await env.DB.prepare("SELECT DISTINCT year FROM travel_expense ORDER BY year DESC").all()).results.map(r => r.year);
  return json({ years, summary: travelSummarize(rows), records: rows });
}
async function apiTravelImport(request, env, session) {
  await ensureTravel(env);
  const b = await request.json().catch(() => ({}));
  const year = +b.year;
  if (!year) return json({ error: "year_required" }, 400);
  const recs = parseTravelSheets(b.sheets || {}, year);
  if (b.dryRun) { const s = travelSummarize(recs); return json({ dryRun: true, year, records: recs.length, total: s.total, crew: s.crew, byLeg: s.byLeg, byKind: s.byKind }); }
  await env.DB.prepare("DELETE FROM travel_expense WHERE year=?").bind(year).run();
  if (recs.length) await insertTravel(env, recs, year);
  await logData(env, "travel_expense (" + year + ", by " + ((session && session.email) || "?") + ")", recs.length, "replaced year " + year);
  return json({ ok: true, year, applied: recs.length });
}

async function apiDashboard(env) {
  const today = TODAY(), in90 = plus(90);
  const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first());
  await ensureKeyman(env);
  const hist = await q("SELECT COUNT(*) contracts, COUNT(DISTINCT sc) crew, CAST(ROUND(SUM(julianday(COALESCE(act_off,proj_off))-julianday(sign_on))) AS INTEGER) days FROM keyman_contract3 WHERE sign_on IS NOT NULL AND COALESCE(act_off,proj_off) IS NOT NULL AND COALESCE(act_off,proj_off)>sign_on");
  const total = (await q("SELECT COUNT(*) n FROM crew")).n;
  // Count by EFFECTIVE status (auto-derived from the schedule; retired/manual win) so the dashboard
  // matches the crew cards and rotation board rather than the raw stored value.
  await ensureCrewExtras(env);
  const cs = (await env.DB.prepare("SELECT agency_id, status FROM crew WHERE redacted=0").all()).results;
  const csOv = {}; for (const o of (await env.DB.prepare("SELECT agency_id, status, retired FROM crew_override").all()).results) csOv[o.agency_id] = o;
  const csSched = scheduleBySc();
  const statusMap = {};
  for (const c of cs) { const s = crewStatus(c, csOv[c.agency_id], csSched[c.agency_id], today); statusMap[s] = (statusMap[s] || 0) + 1; }
  const medExp = (await q("SELECT COUNT(*) n FROM crew WHERE med_exp IS NOT NULL AND med_exp < ?", in90)).n;
  const sirbExp = (await q("SELECT COUNT(*) n FROM crew WHERE sirb_exp IS NOT NULL AND sirb_exp < ?", in90)).n;
  const ppExp = (await q("SELECT COUNT(*) n FROM crew WHERE pp_exp IS NOT NULL AND pp_exp < ?", in90)).n;
  const usvExp = (await q("SELECT COUNT(*) n FROM crew WHERE usv_exp IS NOT NULL AND usv_exp < ?", in90)).n;
  const schExp = (await q("SELECT COUNT(*) n FROM crew WHERE sch_exp IS NOT NULL AND sch_exp < ?", in90)).n;
  const vessels = (await q("SELECT COUNT(DISTINCT vessel_observed) n FROM crew")).n;
  // Workforce split by client/brand (active crew only) for the donut.
  const vrows = (await env.DB.prepare("SELECT vessel_observed, COUNT(*) n FROM crew WHERE status!='Inactive' GROUP BY vessel_observed").all()).results;
  const byClient = { "Royal Caribbean": 0, "Celebrity": 0, "Azamara": 0, "NCL": 0 };
  for (const r of vrows) byClient[clientOf(r.vessel_observed)] += r.n;
  // Bonus committed to date (money path — read only).
  let bonus = { committed: 0, pay: 0 };
  try { const bo = await q("SELECT COUNT(*) n, COALESCE(SUM(pay_usd),0) p FROM bonus_outcome"); bonus = { committed: bo.n || 0, pay: bo.p || 0 }; } catch {}
  // Birthdays today (match MM-DD of dob).
  const md = today.slice(5);
  const bd = (await env.DB.prepare("SELECT first_name, last_name, vessel_observed FROM crew WHERE dob IS NOT NULL AND substr(dob,6,5)=? AND status='On board' ORDER BY last_name").bind(md).all()).results;
  const birthdays = bd.map(b => ({ name: [b.first_name, b.last_name].filter(Boolean).join(" "), vessel: b.vessel_observed || "" }));
  // Travel budget (latest year on file), split crew vs shoreside management.
  await ensureTravel(env);
  const ty = (await q("SELECT MAX(year) y FROM travel_expense")).y;
  const travel = { year: ty || null, all: 0, shoreside: 0, crew: 0, months: [], air: 0 };
  if (ty) {
    const tr = (await env.DB.prepare("SELECT kind, SUM(total) t FROM travel_expense WHERE year=? GROUP BY kind").bind(ty).all()).results;
    for (const r of tr) { travel.all += r.t || 0; if (r.kind === "shoreside") travel.shoreside += r.t || 0; }
    travel.crew = Math.round((travel.all - travel.shoreside) * 100) / 100;
    travel.all = Math.round(travel.all * 100) / 100;
    travel.shoreside = Math.round(travel.shoreside * 100) / 100;
    const ms = (await env.DB.prepare("SELECT month, SUM(total) t, SUM(air) a FROM travel_expense WHERE year=? GROUP BY month ORDER BY month").bind(ty).all()).results;
    travel.months = ms.map(r => ({ m: r.month, t: Math.round((r.t || 0) * 100) / 100 }));
    travel.air = Math.round(ms.reduce((s, r) => s + (r.a || 0), 0) * 100) / 100;
  }
  return json({
    today, travel, birthdays,
    workforce: {
      total,
      on_board: statusMap["On board"] || 0,
      on_vacation: statusMap["On Vacation"] || 0,
      earmarked: statusMap["Earmarked"] || 0,
      inactive: statusMap["Inactive"] || 0,
      vessels, byClient
    },
    compliance: { med_exp_90: medExp, sirb_exp_90: sirbExp, pp_exp_90: ppExp, usv_exp_90: usvExp, sch_exp_90: schExp },
    bonus,
    history: { crew: (hist && hist.crew) || 0, contracts: (hist && hist.contracts) || 0, days: (hist && hist.days) || 0 },
    dryDockNow: inDockNow(DRY_DOCK, today).length
  });
}

// Client/brand label from vessel name.
function clientOf(vessel) {
  const v = String(vessel || "").toUpperCase();
  if (v.includes("CELEBRITY")) return "Celebrity";
  if (v.includes("AZAMARA")) return "Azamara";
  if (v.includes("NCL") || v.includes("NORWEGIAN")) return "NCL";
  return "Royal Caribbean";
}
// Manual edits live in crew_override and ALWAYS win over the imported base row.
// applyOverride + OVR_FIELDS now live in ./override.js (pure + unit-tested).
async function ensureCrewExtras(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crew_override (agency_id TEXT PRIMARY KEY, first_name TEXT, middle_name TEXT, last_name TEXT, status TEXT, rank_override TEXT, vessel_observed TEXT, dob TEXT, province TEXT, phone TEXT, email TEXT, pp_no TEXT, med_exp TEXT, sirb_exp TEXT, pp_exp TEXT, usv_exp TEXT, sch_exp TEXT, baseline_count INTEGER, notes TEXT, updated_at TEXT)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crew_note_log (id INTEGER PRIMARY KEY AUTOINCREMENT, agency_id TEXT, ts TEXT, text TEXT)").run();
  try { await env.DB.prepare("ALTER TABLE crew_override ADD COLUMN retired INTEGER DEFAULT 0").run(); } catch {} // manual 'Retired' tag (Rita)
}
// Schedule assignments per crew (from SHIP_HISTORY), for the auto status derivation.
function scheduleBySc() {
  const m = {};
  for (const h of SHIP_HISTORY) { if (!h.ours || !h.sc) continue; (m[h.sc] = m[h.sc] || []).push({ on: h.on, off: h.off }); }
  return m;
}
// Effective status: manual 'Retired' tag wins; else a manual status edit wins; else auto-derive from
// the live schedule (on a ship now -> On board; signed off -> On Vacation; only future / none -> registry).
function crewStatus(base, ov, schedLegs, today) {
  ov = ov || {};
  if (ov.retired) return "Retired";
  if (ov.status != null && ov.status !== "") return ov.status;
  return deriveStatus(schedLegs || [], today, { imported: base && base.status });
}
// Returns the FULL enriched crew list (overrides merged, contract count, active span, client,
// docs). Filtering/sorting is done client-side (≈100 crew) so the UI stays snappy and consistent.
async function apiCrew(env, url) {
  await ensureKeyman(env); await ensureCrewExtras(env);
  const today = TODAY();
  const base = (await env.DB.prepare("SELECT agency_id, first_name, middle_name, last_name, status, rank_observed, rank_override, vessel_observed, dob, province, phone, email, pp_no, med_exp, sirb_exp, pp_exp, usv_exp, sch_exp, baseline_count FROM crew WHERE redacted=0").all()).results;
  const ovs = (await env.DB.prepare("SELECT * FROM crew_override").all()).results;
  const ovm = {}; for (const o of ovs) ovm[o.agency_id] = o;
  const legs = (await env.DB.prepare("SELECT sc, ship, sign_on, proj_off, act_off, seq FROM keyman_contract3 WHERE sign_on IS NOT NULL").all()).results;
  const byCrew = {}; for (const l of legs) (byCrew[l.sc] = byCrew[l.sc] || []).push(l);
  const nl = (await env.DB.prepare("SELECT agency_id, COUNT(*) n FROM crew_note_log GROUP BY agency_id").all()).results;
  const noteMap = {}; for (const r of nl) noteMap[r.agency_id] = r.n;
  const sched = scheduleBySc();
  const crew = base.map(b => {
    const c = applyOverride(b, ovm[b.agency_id]);
    const ls = (byCrew[b.agency_id] || []).slice().sort((a, x) => (a.seq || 0) - (x.seq || 0));
    let act = ls.find(l => { const off = l.act_off || l.proj_off || "9999"; return l.sign_on <= today && off >= today; }) || ls[ls.length - 1] || null;
    return {
      agency_id: c.agency_id, first_name: c.first_name, middle_name: c.middle_name, last_name: c.last_name,
      status: crewStatus(b, ovm[b.agency_id], sched[b.agency_id], today), retired: !!(ovm[b.agency_id] || {}).retired,
      rank: c.rank_override || c.rank_observed || null, vessel_observed: c.vessel_observed,
      client: clientOf(c.vessel_observed), dob: c.dob, province: c.province, phone: c.phone, email: c.email, pp_no: c.pp_no,
      med_exp: c.med_exp, sirb_exp: c.sirb_exp, pp_exp: c.pp_exp, usv_exp: c.usv_exp, sch_exp: c.sch_exp,
      baseline_count: c.baseline_count, contract_count: fullContracts(ls.map(legShape)),
      active_on: act ? act.sign_on : null, active_off: act ? (act.act_off || act.proj_off) : null,
      hasNote: !!noteMap[c.agency_id] || !!(c.notes && String(c.notes).trim())
    };
  });
  crew.sort((a, b) => (a.last_name || "").localeCompare(b.last_name || "") || (a.first_name || "").localeCompare(b.first_name || ""));
  return json({ count: crew.length, crew });
}

async function apiCrewOne(env, url) {
  const id = url.searchParams.get("id");
  const row = await env.DB.prepare("SELECT * FROM crew WHERE agency_id = ?").bind(id).first();
  if (!row) return json({ error: "not found" }, 404);
  await ensureKeyman(env); await ensureCrewExtras(env);
  const ov = await env.DB.prepare("SELECT * FROM crew_override WHERE agency_id=?").bind(id).first();
  const crew = applyOverride(row, ov);
  const ct = (await env.DB.prepare("SELECT seq, ship, sign_on as 'on', proj_off as proj, act_off as act FROM keyman_contract3 WHERE sc=? ORDER BY seq").bind(id).all()).results;
  const dw = await env.DB.prepare("SELECT CAST(ROUND(SUM(julianday(COALESCE(act_off,proj_off))-julianday(sign_on))) AS INTEGER) days FROM keyman_contract3 WHERE sc=? AND sign_on IS NOT NULL AND COALESCE(act_off,proj_off)>sign_on").bind(id).first();
  return json({ crew, contracts: ct, daysWorked: (dw && dw.days) || 0, deployment: crewDeployment(crew, VESSEL_REF, DRY_DOCK, TODAY()) });
}
// Manual edit (manual-wins): upsert only the provided fields into crew_override.
async function apiCrewSave(request, env, session) {
  const b = await request.json().catch(() => ({}));
  if (!b.agency_id) return json({ error: "no_id" }, 400);
  // baseline_count is money: only money users may change it. Strip it for everyone else so
  // an unrelated profile edit can't silently move a bonus baseline.
  if (!isMoneyUser(session && session.email)) delete b.baseline_count;
  await ensureCrewExtras(env);
  const cols = ["agency_id"], vals = [b.agency_id], up = [];
  for (const f of OVR_FIELDS) { if (b[f] !== undefined) { cols.push(f); vals.push(b[f] === "" ? null : b[f]); up.push(f + "=excluded." + f); } }
  if (b.retired !== undefined) { cols.push("retired"); vals.push(b.retired ? 1 : 0); up.push("retired=excluded.retired"); } // manual Retired tag
  cols.push("updated_at"); vals.push(new Date().toISOString()); up.push("updated_at=excluded.updated_at");
  await env.DB.prepare("INSERT INTO crew_override (" + cols.join(",") + ") VALUES (" + cols.map(() => "?").join(",") + ") ON CONFLICT(agency_id) DO UPDATE SET " + up.join(",")).bind(...vals).run();
  await logActivity(env, session && session.email, "crew_edit", b.agency_id);
  return json({ ok: true });
}
// + Add crew (manual): write a base row AND an override so a later AdvancedQuery import can't clobber it.
async function apiCrewAdd(request, env, session) {
  const b = await request.json().catch(() => ({}));
  const id = String(b.agency_id || "").trim();
  if (!id || !b.first_name || !b.last_name) return json({ error: "missing" }, 400);
  const ex = await env.DB.prepare("SELECT agency_id FROM crew WHERE agency_id=?").bind(id).first();
  if (ex) return json({ error: "exists" }, 409);
  await ensureCrewExtras(env);
  const now = new Date().toISOString();
  // A starting bonus baseline is money: only money users may seed it on add.
  const baselineVal = (isMoneyUser(session && session.email) && b.baseline_count != null) ? +b.baseline_count : null;
  await env.DB.prepare("INSERT INTO crew (id,agency_id,agency_code,first_name,middle_name,last_name,status,rank_observed,vessel_observed,dob,pp_no,baseline_count,redacted,created_at,updated_at) VALUES (?,?,'MAN',?,?,?,?,?,?,?,?,?,0,?,?)")
    .bind("crew_" + id, id, b.first_name, b.middle_name || null, b.last_name, b.status || "Earmarked", b.rank_observed || null, b.vessel_observed || null, b.dob || null, b.pp_no || null, baselineVal, now, now).run();
  await env.DB.prepare("INSERT INTO crew_override (agency_id,first_name,middle_name,last_name,status,rank_override,vessel_observed,dob,pp_no,baseline_count,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(agency_id) DO UPDATE SET updated_at=excluded.updated_at")
    .bind(id, b.first_name, b.middle_name || null, b.last_name, b.status || "Earmarked", b.rank_observed || null, b.vessel_observed || null, b.dob || null, b.pp_no || null, baselineVal, now).run();
  await logActivity(env, session && session.email, "crew_add", id);
  return json({ ok: true, agency_id: id });
}
// Timestamped notes log, kept with the crew across every contract. GET ?id= lists; POST adds.
async function apiCrewNotes(request, env, session, url) {
  await ensureCrewExtras(env);
  if (request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (b.delete != null) {
      await env.DB.prepare("DELETE FROM crew_note_log WHERE id=?").bind(+b.delete).run();
      await logActivity(env, session && session.email, "crew_note_delete", String(b.delete));
      return json({ ok: true });
    }
    if (!b.agency_id || !String(b.text || "").trim()) return json({ error: "empty" }, 400);
    await env.DB.prepare("INSERT INTO crew_note_log (agency_id,ts,text) VALUES (?,?,?)").bind(b.agency_id, new Date().toISOString(), String(b.text).slice(0, 2000)).run();
    await logActivity(env, session && session.email, "crew_note_log", b.agency_id);
    return json({ ok: true });
  }
  const id = url.searchParams.get("id");
  const rows = (await env.DB.prepare("SELECT id, ts, text FROM crew_note_log WHERE agency_id=? ORDER BY ts DESC").bind(id).all()).results;
  return json({ notes: rows });
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
// Keyman board grouped by SHIP across the FULL contract history: every crew who has served
// a ship appears under it, current-onboard first, then back through history. Each card carries
// the leg dates, embark/disembark ports, next ship, readiness flags, and a note indicator.
async function apiRotation(env) { return json(await rotationSections(env)); }
// Resolve the live Keyman board: ships with their current-onboard roster + resolved sign-on/off
// dates (registry status + vessel, enriched by contract_edit, Keyman legs, then schedule tabs).
// Shared so the monthly billing export computes days from the SAME dates the board displays.
async function rotationSections(env) {
  await ensureKeyman(env); await ensureReady(env);
  const today = TODAY();
  const normShip = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const AZ = ["journey", "onward", "quest", "pursuit"];
  const shipHome = {}, shipBrand = {};
  for (const v of VESSEL_REF) { const k = normShip(v.name); shipHome[k] = v.homeport || null; shipBrand[k] = (v.brand === "CEL" ? "Celebrity" : "Royal"); }
  const brandFor = (ship) => { const k = normShip(ship); if (shipBrand[k]) return shipBrand[k]; if (AZ.indexOf(k) >= 0) return "Azamara"; if (k.indexOf("ncl") >= 0 || k.indexOf("norwegian") >= 0) return "NCL"; return "Royal"; };
  const crewRows = (await env.DB.prepare("SELECT agency_id, first_name, last_name, status, rank_observed, rank_override, vessel_observed FROM crew WHERE redacted=0").all()).results;
  const ovRows = (await env.DB.prepare("SELECT agency_id, vessel_observed, status, retired FROM crew_override").all()).results;
  const ovVessel = {}, ovMap = {}; for (const o of ovRows) { ovMap[o.agency_id] = o; if (o.vessel_observed != null && o.vessel_observed !== "") ovVessel[o.agency_id] = o.vessel_observed; }
  for (const c of crewRows) if (ovVessel[c.agency_id]) c.vessel_observed = ovVessel[c.agency_id]; // manual edits win
  const schedMap = scheduleBySc();
  for (const c of crewRows) c.status = crewStatus(c, ovMap[c.agency_id], schedMap[c.agency_id], today); // auto status (On board / On Vacation), retired/manual win
  const cmap = {};
  for (const c of crewRows) cmap[c.agency_id] = { agency_id: c.agency_id, name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.agency_id, status: c.status || "Unknown", rank: c.rank_override || c.rank_observed || null };
  const rd = (await env.DB.prepare("SELECT agency_id, eccr, air, hotel, note FROM crew_ready").all()).results;
  const rmap = {}; for (const r of rd) rmap[r.agency_id] = r;
  await ensureContractEdit(env);
  const eds = (await env.DB.prepare("SELECT sc, seq, embark, disembark, sign_on, sign_off, ship, eccr, air, hotel, on_conf, off_conf FROM contract_edit").all()).results;
  const emap = {}; for (const e of eds) emap[e.sc + "|" + e.seq] = e;
  const legs = (await env.DB.prepare("SELECT sc, ship, sign_on, proj_off, act_off, seq FROM keyman_contract3 WHERE sign_on IS NOT NULL").all()).results;
  const byCrew = {};
  for (const r of legs) (byCrew[r.sc] = byCrew[r.sc] || []).push(r);
  for (const sc in byCrew) byCrew[sc].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  // Effective leg = base Keyman leg with any saved per-contract edit applied.
  const eff = (leg) => { const o = emap[leg.sc + "|" + leg.seq] || {}; return {
    seq: leg.seq, ship: o.ship || leg.ship,
    signOn: o.sign_on || leg.sign_on, signOff: o.sign_off || leg.act_off || leg.proj_off || null,
    offConfirmed: o.off_conf != null ? !!o.off_conf : !!leg.act_off, onConfirmed: !!o.on_conf,
    embark: o.embark || null, disembark: o.disembark || null, eccr: !!o.eccr, air: !!o.air, hotel: !!o.hotel }; };
  // Latest effective Keyman leg per (ship, crew) — used to ENRICH registry cards (dates) + as history.
  const byShip = {};
  for (const sc in byCrew) {
    const c = cmap[sc]; if (!c) continue;
    const ls = byCrew[sc];
    const lastForShip = {};
    ls.forEach((leg, idx) => { const e = eff(leg); if (!e.ship) return; if (lastForShip[e.ship] == null || (ls[lastForShip[e.ship]].seq || 0) < (leg.seq || 0)) lastForShip[e.ship] = idx; });
    for (const ship in lastForShip) {
      const idx = lastForShip[ship], leg = ls[idx], e = eff(leg), rm = rmap[sc] || {};
      (byShip[ship] = byShip[ship] || []).push({ agency_id: sc, seq: leg.seq, ship, name: c.name, status: c.status, rank: c.rank, signOn: e.signOn, signOff: e.signOff, offConfirmed: e.offConfirmed, onConfirmed: e.onConfirmed, embark: e.embark || shipHome[normShip(ship)] || null, disembark: e.disembark || null, eccr: e.eccr, air: e.air, hotel: e.hotel, hasNote: !!(rm.note && String(rm.note).trim()) });
    }
  }
  const legBSC = {}; for (const ship in byShip) { const k = normShip(ship); legBSC[k] = legBSC[k] || {}; for (const card of byShip[ship]) legBSC[k][card.agency_id] = card; }
  const contracts = {}; for (const sc in byCrew) contracts[sc] = fullContracts(byCrew[sc].map(legShape)); // FULL contracts, not raw legs
  // Registry/keyman/schedule vessel string -> ONE canonical short ship name. Single source of truth
  // in src/shipname.js (longest VESSEL_REF match -> Azamara short name -> prettified). Applied to ALL
  // three data sources below so their sections key-align instead of fragmenting (Celebrity-prefixed
  // and Azamara schedule rows used to miss the registry/keyman sections and vanish).
  const vesselKeys = buildShipKeys(VESSEL_REF);
  const shipOf = (vessel) => canonShipWith(vessel, vesselKeys);
  // Shoreside DG3 team (not seafarers): tagged + kept OFF the ship rotation.
  const SHORE_IDS = new Set(["SC-0038392", "SC-0038378"]);
  const SHORE_NM = new Set(["deleonjoemar", "mirandaohji", "guerraray", "abellanrolando", "lawrencedexter", "sanmartinmiguel", "berenyirita"]);
  const isShore = (c) => SHORE_IDS.has(c.agency_id) || SHORE_NM.has(normShip((c.last_name || "") + (c.first_name || "")));
  // Schedule-tab dates per (ship, crew) — fallback enrichment when Keyman has no leg (latest run wins).
  const schEnr = {};
  for (const h of SHIP_HISTORY) { if (!h.ours || !h.sc) continue; const cs = shipOf(h.ship); if (!cs) continue; const k = normShip(cs); (schEnr[k] = schEnr[k] || {}); const cur = schEnr[k][h.sc]; if (!cur || (h.off || "") > (cur.off || "")) schEnr[k][h.sc] = { on: h.on, off: h.off }; }
  // PROMINENT roster per ship = live REGISTRY (status + vessel) — the source of truth for who's onboard
  // NOW (incl. 2-up crew-change overlaps). Dates enriched from Keyman, then the schedule tabs.
  const promByShip = {}, shoreside = [], pool = [];
  for (const c of crewRows) {
    const base = { agency_id: c.agency_id, name: cmap[c.agency_id].name, status: c.status || "Unknown", rank: cmap[c.agency_id].rank, contracts: contracts[c.agency_id] || 0 };
    const rm = rmap[c.agency_id] || {}; base.eccr = !!rm.eccr; base.air = !!rm.air; base.hotel = !!rm.hotel; base.hasNote = !!(rm.note && String(rm.note).trim());
    if (isShore(c)) { shoreside.push(base); continue; }
    if (c.status === "Inactive") continue; // inactive -> greyed history only
    const ship = shipOf(c.vessel_observed);
    if (!ship) { pool.push(base); continue; }
    const k = normShip(ship);
    const enr = (legBSC[k] || {})[c.agency_id] || {};
    const sEnr = (schEnr[k] || {})[c.agency_id] || {};
    (promByShip[ship] = promByShip[ship] || []).push(Object.assign({}, base, { ship, seq: enr.seq || 1, signOn: enr.signOn || sEnr.on || null, signOff: enr.signOff || sEnr.off || null, offConfirmed: !!enr.offConfirmed, onConfirmed: !!enr.onConfirmed, embark: enr.embark || shipHome[k] || null, disembark: enr.disembark || shipHome[k] || null, current: c.status === "On board" }));
  }
  const histByShip = {}, histDisp = {};
  for (const h of SHIP_HISTORY) { if (!h.ours) continue; const cs = shipOf(h.ship); if (!cs) continue; const k = normShip(cs); histDisp[k] = cs; (histByShip[k] = histByShip[k] || []).push(h); }
  const validShip = validShipKeys(VESSEL_REF);
  // Union of ships: registry-prominent + keyman-history + valid (canonical) schedule ships.
  const shipNames = {};
  for (const s of Object.keys(promByShip)) shipNames[normShip(s)] = s;
  for (const s of Object.keys(byShip)) if (!shipNames[normShip(s)]) shipNames[normShip(s)] = s;
  for (const k of Object.keys(histByShip)) if (!shipNames[k] && validShip.has(k)) shipNames[k] = histDisp[k];
  const sections = Object.values(shipNames).map(ship => {
    const k = normShip(ship);
    const crew = (promByShip[ship] || []).slice().sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const cur = new Set(crew.map(c => c.agency_id));
    const kh = (byShip[ship] || []).filter(x => !cur.has(x.agency_id)).map(x => ({ name: x.name, sc: x.agency_id, ours: true, on: x.signOn, off: x.signOff }));
    const sched = histEntries(histByShip[k] || [], cur);
    const byk = {};
    for (const e of [...kh, ...sched]) { const kk = e.sc || ("F:" + e.name); if (!byk[kk]) byk[kk] = e; else { if (e.on && (!byk[kk].on || e.on < byk[kk].on)) byk[kk].on = e.on; if (e.off && (!byk[kk].off || e.off > byk[kk].off)) byk[kk].off = e.off; } }
    const history = Object.values(byk).sort((a, b) => (a.off || "") < (b.off || "") ? 1 : -1);
    return { ship, brand: brandFor(ship), onboard: crew.filter(x => x.current).length, crew, history };
  });
  sections.sort((a, b) => a.ship < b.ship ? -1 : a.ship > b.ship ? 1 : 0);
  const counts = {};
  ["On board", "On Vacation", "Earmarked", "Inactive"].forEach(s => counts[s] = crewRows.filter(c => c.status === s && !isShore(c)).length);
  counts.shoreside = shoreside.length; counts.vessels = sections.length;
  return { sections, pool, shoreside, counts, inDock: inDockNow(DRY_DOCK, today) };
}
// Days worked THIS MONTH per crew currently active in Keyman, for customer billing. Uses the live
// board roster (rotationSections) so dates match what's shown on the Keyman page — NOT the historical
// Contract Counter (keyman_contract3), which holds only closed past contracts. Onboard crew bill from
// their sign-on through today; crew who signed off this month bill through their sign-off. Days are
// clipped to [1st-of-month, today]; only crew with >0 days this month appear.
function clientLabel(brand) {
  if (brand === "Celebrity") return "Celebrity";
  if (brand === "Azamara") return "Azamara";
  if (brand === "NCL") return "NCL";
  return "Royal Caribbean";
}
async function apiBillingMonth(env) {
  try {
    const today = TODAY();
    const monthStart = today.slice(0, 7) + "-01";
    const { sections } = await rotationSections(env);
    const crewRows = [];
    const vesselMap = {};
    for (const sec of sections) {
      const client = clientLabel(sec.brand);
      for (const c of sec.crew || []) {
        if (!c.signOn) continue;
        // Onboard -> still working, bill through today; otherwise bill through their sign-off.
        const off = c.current ? today : c.signOff;
        if (!off) continue;
        const days = periodDays(c.signOn, off, monthStart, today);
        if (days <= 0) continue;
        crewRows.push({ name: c.name, sc: c.agency_id, ship: sec.ship, client, status: c.status, signOn: c.signOn, days, current: !!c.current });
        if (!vesselMap[sec.ship]) vesselMap[sec.ship] = { ship: sec.ship, client, crew: 0, days: 0 };
        vesselMap[sec.ship].crew++; vesselMap[sec.ship].days += days;
      }
    }
    crewRows.sort((a, b) => b.days - a.days);
    const perVessel = Object.values(vesselMap).sort((a, b) => b.days - a.days);
    const totalDays = crewRows.reduce((s, x) => s + x.days, 0);
    return json({ month: today.slice(0, 7), from: monthStart, to: today, totals: { days: totalDays, crew: crewRows.length, vessels: perVessel.length }, perCrew: crewRows, perVessel });
  } catch (e) {
    console.error("billingmonth_error", (e && e.stack) || e);
    return json({ error: "billingmonth_failed", detail: String(e && e.message || e) }, 500);
  }
}
// Collapse SHIP_HISTORY rows for one ship into one card per person (min..max span), excluding
// our crew already shown as a current card on this ship. Ours first, then former/other.
function histEntries(hs, excludeSc) {
  const byp = {};
  for (const h of hs) {
    if (h.ours && excludeSc.has(h.sc)) continue;
    const key = h.sc || ("F:" + h.name);
    const e = byp[key] || (byp[key] = { name: h.name, sc: h.sc, ours: !!h.ours, on: h.on, off: h.off });
    if (h.on && (!e.on || h.on < e.on)) e.on = h.on;
    if (h.off && (!e.off || h.off > e.off)) e.off = h.off;
  }
  return Object.values(byp).sort((a, b) => (a.ours === b.ours) ? ((a.off || "") < (b.off || "") ? 1 : -1) : (a.ours ? -1 : 1));
}
// Full detail for one crew (modal): all contract legs + readiness + note.
async function apiRotationCrew(env, url) {
  await ensureKeyman(env); await ensureReady(env);
  const id = url.searchParams.get("id");
  const c = await env.DB.prepare("SELECT agency_id, first_name, middle_name, last_name, status, rank_observed, rank_override, vessel_observed, province, dob, med_exp, pp_exp, usv_exp FROM crew WHERE agency_id=?").bind(id).first();
  if (!c) return json({ error: "not_found" }, 404);
  const legs = (await env.DB.prepare("SELECT seq, ship, sign_on, proj_off, act_off FROM keyman_contract3 WHERE sc=? ORDER BY seq").bind(id).all()).results;
  const r = await env.DB.prepare("SELECT eccr, air, hotel, note FROM crew_ready WHERE agency_id=?").bind(id).first();
  return json({ crew: c, legs, ready: r || { eccr: 0, air: 0, hotel: 0, note: "" } });
}
async function apiNote(request, env, session) {
  const b = await request.json().catch(() => ({}));
  if (!b.agency_id) return json({ error: "no_id" }, 400);
  await ensureReady(env);
  await env.DB.prepare("INSERT INTO crew_ready (agency_id,note,updated_at) VALUES (?,?,?) ON CONFLICT(agency_id) DO UPDATE SET note=excluded.note, updated_at=excluded.updated_at")
    .bind(b.agency_id, String(b.note || "").slice(0, 2000), new Date().toISOString()).run();
  await logActivity(env, session && session.email, "crew_note", b.agency_id);
  return json({ ok: true });
}
async function ensureReady(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crew_ready (agency_id TEXT PRIMARY KEY, eccr INTEGER DEFAULT 0, air INTEGER DEFAULT 0, hotel INTEGER DEFAULT 0, note TEXT, updated_at TEXT)").run();
  try { await env.DB.prepare("ALTER TABLE crew_ready ADD COLUMN note TEXT").run(); } catch {}
}
async function ensureContractEdit(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS contract_edit (sc TEXT, seq INTEGER, embark TEXT, disembark TEXT, sign_on TEXT, sign_off TEXT, ship TEXT, eccr INTEGER DEFAULT 0, air INTEGER DEFAULT 0, hotel INTEGER DEFAULT 0, on_conf INTEGER DEFAULT 0, off_conf INTEGER, updated_at TEXT, PRIMARY KEY (sc, seq))").run();
}
// Per-contract edit (manual-wins): embark/disembark city, sign-on/off, ship, + confirmed flags.
async function apiContractEdit(request, env, session) {
  const b = await request.json().catch(() => ({}));
  if (!b.sc || b.seq == null) return json({ error: "no_key" }, 400);
  await ensureContractEdit(env);
  const bi = (v) => (v ? 1 : 0);
  await env.DB.prepare("INSERT INTO contract_edit (sc,seq,embark,disembark,sign_on,sign_off,ship,eccr,air,hotel,on_conf,off_conf,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sc,seq) DO UPDATE SET embark=excluded.embark,disembark=excluded.disembark,sign_on=excluded.sign_on,sign_off=excluded.sign_off,ship=excluded.ship,eccr=excluded.eccr,air=excluded.air,hotel=excluded.hotel,on_conf=excluded.on_conf,off_conf=excluded.off_conf,updated_at=excluded.updated_at")
    .bind(b.sc, +b.seq, b.embark || null, b.disembark || null, b.sign_on || null, b.sign_off || null, b.ship || null, bi(b.eccr), bi(b.air), bi(b.hotel), bi(b.on_conf), b.off_conf == null ? null : bi(b.off_conf), new Date().toISOString()).run();
  await logActivity(env, session && session.email, "contract_edit", b.sc + " #" + b.seq);
  return json({ ok: true });
}
// POST {agency_id, field in [eccr,air,hotel], value} — Rita ticks crew-change readiness.
async function apiReady(request, env, session) {
  const b = await request.json().catch(() => ({}));
  const f = b.field;
  if (["eccr", "air", "hotel"].indexOf(f) < 0) return json({ error: "bad_field" }, 400);
  if (!b.agency_id) return json({ error: "no_id" }, 400);
  await ensureReady(env);
  const v = b.value ? 1 : 0;
  await env.DB.prepare("INSERT INTO crew_ready (agency_id," + f + ",updated_at) VALUES (?,?,?) ON CONFLICT(agency_id) DO UPDATE SET " + f + "=excluded." + f + ", updated_at=excluded.updated_at")
    .bind(b.agency_id, v, new Date().toISOString()).run();
  await logActivity(env, session && session.email, "crew_ready", b.agency_id + " " + f + "=" + v);
  return json({ ok: true });
}
async function apiRotationAssign(request, env, session) {
  const b = await request.json().catch(() => ({}));
  const id = b.agency_id, ship = b.ship;
  if (!id) return json({ error: "no_id" }, 400);
  const cr = await env.DB.prepare("SELECT id FROM crew WHERE agency_id=?").bind(id).first();
  if (!cr) return json({ error: "not_found" }, 404);
  const v = (ship === "__POOL__" || !ship) ? null : ship;
  await env.DB.prepare("UPDATE crew SET vessel_observed=?, updated_at=? WHERE agency_id=?").bind(v, new Date().toISOString(), id).run();
  await logActivity(env, session && session.email, "rotation_assign", id + " -> " + (v || "pool"));
  return json({ ok: true });
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
// SINGLE baseline read path (fixes the override/base split): a manual baseline saved into
// crew_override ALWAYS wins, so the Score Card / commit / PDF use the same number the crew
// card and ledger show. Without this, a baseline set via the Edit modal showed on screen but
// the payout silently computed from 0.
async function effectiveBaseline(env, agency_id, baseBaseline) {
  const ov = await env.DB.prepare("SELECT baseline_count FROM crew_override WHERE agency_id=?").bind(agency_id).first();
  return resolveBaseline(baseBaseline, ov ? ov.baseline_count : null);
}
async function apiBonusCrew(env, url) {
  const id = url.searchParams.get("id");
  const cr = await env.DB.prepare("SELECT id, agency_id, first_name, middle_name, last_name, status, rank_observed, vessel_observed, baseline_count FROM crew WHERE agency_id=?").bind(id).first();
  if (!cr) return json({ error: "not found" }, 404);
  await ensureKeyman(env);
  const baseline = await effectiveBaseline(env, cr.agency_id, cr.baseline_count);
  const count = await crewCount(env, cr.id, baseline);
  const outs = await env.DB.prepare("SELECT id, contract_group_id, score_pct, gate, pay_usd, count_before, count_after, span_start, span_end, ships_json, committed_at FROM bonus_outcome WHERE crew_id=? ORDER BY committed_at DESC").bind(cr.id).all();
  // Default sign-on/off for the Score Card (manually editable there). Prefer the SCHEDULE deployment
  // (the Keyman schedule grids — the contract just ended, or the current one), since the Contract
  // Counter only holds completed-contract dates. Fall back to the latest Contract Counter leg.
  const td = TODAY();
  let current = null, bestPast = null, bestFut = null;
  for (const h of SHIP_HISTORY) {
    if (!h.ours || h.sc !== cr.agency_id || !h.off) continue;
    if (h.on && h.on <= td && h.off >= td) { if (!current || h.off > current.off) current = h; } // contract spanning today
    else if (h.off < td) { if (!bestPast || h.off > bestPast.off) bestPast = h; }                  // last completed
    else { if (!bestFut || h.off < bestFut.off) bestFut = h; }                                       // next one
  }
  const sched = current || bestPast || bestFut;  // the contract being scored: current first, else most-recent
  let lastLeg = sched ? { on: sched.on || null, off: sched.off || null, ship: sched.ship || null } : null;
  if (!lastLeg) {
    const leg = await env.DB.prepare("SELECT sign_on, proj_off, act_off, ship FROM keyman_contract3 WHERE sc=? AND sign_on IS NOT NULL ORDER BY seq DESC LIMIT 1").bind(cr.agency_id).first();
    lastLeg = leg ? { on: leg.sign_on || null, off: leg.act_off || leg.proj_off || null, ship: leg.ship || null } : null;
  }
  const legRows = (await env.DB.prepare("SELECT ship, sign_on, proj_off, act_off FROM keyman_contract3 WHERE sc=? AND sign_on IS NOT NULL").bind(cr.agency_id).all()).results;
  const legN = fullContracts(legRows.map(legShape));
  return json({ crew: cr, count, contracts: legN, rank: psRank(legN, true), baseline_set: baseline != null, nextRungIfClean: ladderValue(count + 1), outcomes: outs.results, lastLeg });
}
// Fleet-wide bonus ledger: one row per crew with contract count, consecutive count, next rung,
// last committed outcome, and total paid. Read-only money view (one bulk pass, no per-crew fan-out).
async function apiContracts(env) {
  await ensureKeyman(env); await ensureCrewExtras(env);
  const base = (await env.DB.prepare("SELECT id, agency_id, first_name, last_name, status, vessel_observed, baseline_count FROM crew WHERE redacted=0").all()).results;
  const ovs = (await env.DB.prepare("SELECT agency_id, vessel_observed, baseline_count FROM crew_override").all()).results;
  const ovm = {}; for (const o of ovs) ovm[o.agency_id] = o;
  const legCounts = await fullContractMap(env); // sc -> FULL-contract count (drives rank + the number shown)
  const lastOut = {}, totPay = {};
  for (const o of (await env.DB.prepare("SELECT crew_id, score_pct, gate, pay_usd, count_after, committed_at FROM bonus_outcome ORDER BY committed_at ASC").all()).results) {
    lastOut[o.crew_id] = o; totPay[o.crew_id] = (totPay[o.crew_id] || 0) + (o.pay_usd || 0);
  }
  const rows = base.map(b => {
    const ov = ovm[b.agency_id] || {};
    const vessel = ov.vessel_observed != null ? ov.vessel_observed : b.vessel_observed;
    const lo = lastOut[b.id];
    // Baseline + count + rank + next rung via the shared ledger helper (override-wins through the
    // SAME resolveBaseline as the commit/PDF path — no inline copy that could silently drift).
    const L = contractLedgerRow(b.baseline_count, ov.baseline_count, lo);
    return {
      agency_id: b.agency_id, name: [b.first_name, b.last_name].filter(Boolean).join(" "), status: b.status,
      vessel: vessel || null, client: clientOf(vessel), contracts: legCounts[b.agency_id] || 0,
      count: L.count, baseline_set: L.baseline_set, rank: psRank(legCounts[b.agency_id] || 0), nextRung: L.nextRung,
      lastDate: lo ? (lo.committed_at || "").slice(0, 10) : null, lastScore: lo ? lo.score_pct : null,
      lastGate: lo ? lo.gate : null, lastPay: lo ? lo.pay_usd : null, totalPay: totPay[b.id] || 0
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const totals = { crew: rows.length, paid: rows.reduce((s, r) => s + r.totalPay, 0), baselineSet: rows.filter(r => r.baseline_set).length };
  return json({ count: rows.length, rows, totals });
}
// Assemble everything the PDF statement needs for one crew (crew + contracts + sea-days + bonus).
async function gatherStatement(env, id) {
  const crew = await env.DB.prepare("SELECT * FROM crew WHERE agency_id=?").bind(id).first();
  if (!crew) return null;
  await ensureKeyman(env);
  const contracts = (await env.DB.prepare("SELECT seq, ship, sign_on as 'on', proj_off as proj, act_off as act FROM keyman_contract3 WHERE sc=? ORDER BY seq").bind(id).all()).results;
  const dw = await env.DB.prepare("SELECT CAST(ROUND(SUM(julianday(COALESCE(act_off,proj_off))-julianday(sign_on))) AS INTEGER) days FROM keyman_contract3 WHERE sc=? AND sign_on IS NOT NULL AND COALESCE(act_off,proj_off)>sign_on").bind(id).first();
  const baseline = await effectiveBaseline(env, id, crew.baseline_count);
  const count = await crewCount(env, crew.id, baseline);
  const outs = await env.DB.prepare("SELECT score_pct, gate, pay_usd, ships_json, committed_at FROM bonus_outcome WHERE crew_id=? ORDER BY committed_at DESC").bind(crew.id).all();
  const fc = fullContracts(contracts.map(c => ({ on: c.on, end: c.act || c.proj, ship: c.ship })));
  const bonus = { rank: psRank(fc, true), contracts: fc, count, baseline_set: baseline != null, nextRungIfClean: ladderValue(count + 1), outcomes: outs.results };
  return { crew, contracts, daysWorked: (dw && dw.days) || 0, bonus, generatedAt: new Date().toISOString() };
}
// GET /api/crew/statement.pdf?id= -> server-generated PDF (download). Works today, no R2/email needed.
async function apiStatementPdf(env, url) {
  const id = url.searchParams.get("id");
  const data = await gatherStatement(env, id);
  if (!data) return json({ error: "not_found" }, 404);
  const bytes = composeStatement(data);
  return new Response(bytes, { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="CIMS_Statement_${id}.pdf"`,
  }});
}
// POST /api/crew/statement/email {id, to?} -> store in R2 (if bound) + email PDF via Resend (if configured).
async function apiStatementEmail(request, env, session) {
  const b = await request.json().catch(() => ({}));
  const id = b.id;
  const data = await gatherStatement(env, id);
  if (!data) return json({ error: "not_found" }, 404);
  const to = b.to || data.crew.email;
  if (!to) return json({ ok: false, error: "no_recipient", note: "This crew has no email on file. Pass an address or add one to the registry." });
  const bytes = composeStatement(data);
  const b64 = (() => { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); })();
  const key = `statements/${id}/${data.generatedAt.slice(0, 10)}.pdf`;
  let stored = false;
  if (env.STATEMENTS) { try { await env.STATEMENTS.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } }); stored = true; } catch (e) {} }
  if (!env.RESEND_API_KEY) {
    await logActivity(env, session && session.email, "statement_email", id + " no_mailer");
    return json({ ok: false, stored, sent: false, note: "Email is not configured yet (RESEND_API_KEY). PDF " + (stored ? "was stored in R2." : "generated but not stored — no R2 bucket bound yet.") });
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "CIMS <onboarding@resend.dev>",
      to: [to],
      subject: "Your DG3 CIMS crew statement",
      html: `<p>Please find your CIMS crew statement attached.</p><p>DG3 Cruise Industry Managed Services</p>`,
      attachments: [{ filename: `CIMS_Statement_${id}.pdf`, content: b64 }],
    }),
  }).catch(() => null);
  const ok = !!(r && r.ok);
  await logActivity(env, session && session.email, "statement_email", id + " -> " + to + (ok ? " sent" : " send_failed") + (stored ? " stored" : ""));
  return json({ ok, stored, sent: ok, to });
}
async function apiBonusCommit(request, env, session) {
  // Money authority gate: committing a payout is restricted to the money users (GM/HR),
  // even though all console users are role 'full' today.
  if (!isMoneyUser(session && session.email)) return json({ error: "not_authorised" }, 403);
  const b = await request.json().catch(() => ({}));
  const cr = await env.DB.prepare("SELECT id, agency_id, vessel_observed, baseline_count FROM crew WHERE agency_id=?").bind(b.agency_id).first();
  if (!cr) return json({ error: "crew_not_found" }, 404);
  const baseline = await effectiveBaseline(env, cr.agency_id, cr.baseline_count);
  const count = await crewCount(env, cr.id, baseline);
  const r = computeBonus({ count, sliders: b.sliders, evalScore: b.evalScore, gates: b.gates });
  if ((r.gate === "rush" || r.gate === "audit") && !(b.gateNote && b.gateNote.trim())) return json({ error: "gate_note_required" }, 400);
  if (!b.spanStart || !b.spanEnd) return json({ error: "span_required" }, 400);
  if (b.spanEnd < b.spanStart) return json({ error: "span_invalid" }, 400);
  // Idempotency / double-submit guard: an outcome already exists for this crew + exact span.
  // A retried or double-clicked commit must NOT append a second outcome (double pay + double
  // count). Return the existing outcome so the UI shows success without re-recording.
  const dup = await env.DB.prepare("SELECT contract_group_id, score_pct, gate, pay_usd, count_before, count_after, ships_json FROM bonus_outcome WHERE crew_id=? AND span_start=? AND span_end=?").bind(cr.id, b.spanStart, b.spanEnd).first();
  if (dup) {
    return json({ ok: true, duplicate: true, group: dup.contract_group_id, ships: JSON.parse(dup.ships_json || "[]"),
      result: { score: dup.score_pct, gate: dup.gate, pay: dup.pay_usd, count: dup.count_before, nextCount: dup.count_after, rung: ladderValue(dup.count_after) } });
  }
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
  if (!cr) return json({ error: "crew_not_found" }, 404);
  // Single-use: once the window is answered/N/A, lock it and do NOT echo prior answers back.
  const locked = !feedbackSubmittable(req.status);
  return json({ ok: true, role: p.role, roleLabel: FB_ROLES[p.role], crew: [cr.first_name, cr.middle_name, cr.last_name].filter(Boolean).join(" "), vessel: cr.vessel_observed, status: req.status, locked, answers: null });
}
// Contributor submits answers (no session; token authenticates).
async function apiFeedbackSubmit(request, env) {
  await ensureFb(env);
  const b = await request.json().catch(() => ({}));
  const p = await verifyToken(b.t, env.SESSION_SECRET);
  if (!p || p.p !== "fb" || !FB_ROLES[p.role]) return json({ error: "invalid_or_expired" }, 401);
  const th = await sha256hex(b.t);
  const req = await env.DB.prepare("SELECT id, crew_id, role, status FROM feedback_request2 WHERE token_hash=?").bind(th).first();
  if (!req) return json({ error: "revoked" }, 401);
  // Single-use: reject a second submission instead of overwriting the evidence a bonus was scored on.
  if (!feedbackSubmittable(req.status)) return json({ ok: false, already: true, error: "already_submitted" }, 409);
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
// In-app contributor scoring (authenticated, NO token). Ray/Rolando/Dexter pick a crew + their
// name in the Scoring window and submit; this writes the same feedback_response2 the token form
// does, so it pre-fills that crew's Score Card. Returns the accumulated sub-scores across all
// roles answered so far. (Unlike the external token link, the in-app path may be re-submitted —
// it is the authenticated scoring workflow; committed bonus outcomes are immutable regardless.)
async function apiFeedbackScore(request, env, session) {
  await ensureFb(env);
  const b = await request.json().catch(() => ({}));
  const role = b.role;
  if (!FB_ROLES[role]) return json({ error: "bad_role" }, 400);
  const cr = await env.DB.prepare("SELECT id, agency_id FROM crew WHERE agency_id=?").bind(b.agency_id).first();
  if (!cr) return json({ error: "crew_not_found" }, 404);
  const now = new Date().toISOString();
  let req = await env.DB.prepare("SELECT id FROM feedback_request2 WHERE crew_id=? AND role=?").bind(cr.id, role).first();
  const rid = req ? req.id : ("fr_" + crypto.randomUUID());
  if (!req) {
    await env.DB.prepare("INSERT INTO feedback_request2 (id,crew_id,role,token_hash,status,due_date,requested_by,requested_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(rid, cr.id, role, "inapp", "pending", null, (session && session.email) || null, now).run();
  }
  const naDexter = role === "dexter" && b.answers && b.answers.assessed === "No (N/A)" && !(b.answers && b.answers.mono);
  await env.DB.prepare("DELETE FROM feedback_response2 WHERE request_id=?").bind(rid).run();
  await env.DB.prepare("INSERT INTO feedback_response2 (id,request_id,crew_id,role,answers_json,submitted_at) VALUES (?,?,?,?,?,?)")
    .bind("fp_" + crypto.randomUUID(), rid, cr.id, role, JSON.stringify(b.answers || {}), now).run();
  await env.DB.prepare("UPDATE feedback_request2 SET status=? WHERE id=?").bind(naDexter ? "na" : "answered", rid).run();
  await logActivity(env, session && session.email, "feedback_score", cr.agency_id + " " + role);
  const resp = (await env.DB.prepare("SELECT role, answers_json FROM feedback_response2 WHERE crew_id=?").bind(cr.id).all()).results;
  const answers = {}; for (const r of resp) answers[r.role] = JSON.parse(r.answers_json);
  const reqs = (await env.DB.prepare("SELECT role, status FROM feedback_request2 WHERE crew_id=?").bind(cr.id).all()).results;
  const st = { ray: "none", rolando: "none", dexter: "none" }; for (const r of reqs) st[r.role] = r.status;
  return json({ ok: true, prefill: mapFeedbackToScore(answers), status: st });
}
// Scoring queue: crew whose contract just ended (signed off in the last 14 days) or is about to
// end (next 14 days) — the contracts that need contributor scoring. Effective sign-off = the
// latest Keyman leg's actual-off, else projected-off. Each carries the per-role feedback status.
async function apiScoreQueue(env, url) {
  await ensureFb(env);
  const today = TODAY();
  const days = Math.max(1, Math.min(120, parseInt(url.searchParams.get("days")) || 14));
  const crewRows = (await env.DB.prepare("SELECT id, agency_id, first_name, last_name, vessel_observed, status FROM crew WHERE redacted=0").all()).results;
  const byId = {}; for (const c of crewRows) byId[c.agency_id] = c;
  const reqs = (await env.DB.prepare("SELECT crew_id, role, status FROM feedback_request2").all()).results;
  const resp = (await env.DB.prepare("SELECT crew_id, role FROM feedback_response2").all()).results;
  const fb = {}; for (const r of reqs) { (fb[r.crew_id] = fb[r.crew_id] || {})[r.role] = r.status; }
  for (const r of resp) { (fb[r.crew_id] = fb[r.crew_id] || {})[r.role] = "answered"; }
  const keys = buildShipKeys(VESSEL_REF);
  // SOURCE = the SCHEDULE deployment grids (ship_history), which carry forward-looking sign-off
  // dates + ship. The Contract Counter is completed-contracts only (no future dates), so it can
  // never populate "signing off next 14 days" — the schedule is the right Keyman tab for timing.
  const recBy = {}, upBy = {};
  for (const h of SHIP_HISTORY) {
    if (!h.ours || !h.sc || !h.off || !byId[h.sc]) continue;
    const w = classifyWindow(h.off, today, days);
    if (!w) continue;
    if (w === "recent") { const cur = recBy[h.sc]; if (!cur || h.off > cur.off) recBy[h.sc] = { on: h.on || null, off: h.off, ship: h.ship }; }
    else { const cur = upBy[h.sc]; if (!cur || h.off < cur.off) upBy[h.sc] = { on: h.on || null, off: h.off, ship: h.ship }; }
  }
  const mk = (sc, dep) => { const c = byId[sc]; const f = (c && fb[c.id]) || {}; return { agency_id: sc, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || sc, vessel: c.vessel_observed || null, ship: canonShipWith(dep.ship, keys) || dep.ship, signOn: dep.on, signOff: dep.off, status: c.status, feedback: { ray: f.ray || "none", rolando: f.rolando || "none", dexter: f.dexter || "none" } }; };
  const recent = Object.keys(recBy).map(sc => mk(sc, recBy[sc])).sort((a, b) => (a.signOff < b.signOff ? 1 : -1));    // most recently off first
  const upcoming = Object.keys(upBy).map(sc => mk(sc, upBy[sc])).sort((a, b) => (a.signOff < b.signOff ? -1 : 1));    // soonest off first
  return json({ today, days, recent, upcoming });
}
/* ----------------------- crew intel (email -> AI -> notes) — SEPARATE from the scored bonus ----------------------- */
async function ensureIntel(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS email_inbox (id TEXT PRIMARY KEY, from_addr TEXT, to_addr TEXT, subject TEXT, raw TEXT, received_at TEXT, status TEXT DEFAULT 'new', processed_at TEXT)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crew_intel (id TEXT PRIMARY KEY, agency_id TEXT, reporter TEXT, summary TEXT, source TEXT DEFAULT 'email', source_email_id TEXT, confidence TEXT, status TEXT DEFAULT 'filed', candidates TEXT, ts TEXT, created_by TEXT)").run();
  try { await env.DB.prepare("ALTER TABLE crew_intel ADD COLUMN contract_no INTEGER").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE crew_intel ADD COLUMN edited_at TEXT").run(); } catch (e) {}
}
// The crew's contract number at the moment a note is filed (total Keyman legs) — lets the timeline
// show "Contract 3" per entry so issues can be read per-contract over time.
async function intelContractNo(env, agencyId) {
  if (!agencyId) return null;
  try { return (((await env.DB.prepare("SELECT COUNT(*) n FROM keyman_contract3 WHERE sc=? AND sign_on IS NOT NULL").bind(agencyId).first()) || {}).n) || null; } catch (e) { return null; }
}
async function intelRoster(env) {
  const rows = (await env.DB.prepare("SELECT agency_id, first_name, last_name, status FROM crew WHERE redacted=0").all()).results;
  return buildRoster(rows);
}
// Manual/test injector: drop an email into the inbox as if it had arrived via Email Routing.
async function apiIntelIngest(request, env, session) {
  await ensureIntel(env);
  const b = await request.json().catch(() => ({}));
  const raw = String(b.raw || b.body || "").slice(0, 60000);
  if (!raw.trim()) return json({ error: "empty" }, 400);
  const id = "em_" + crypto.randomUUID();
  await env.DB.prepare("INSERT INTO email_inbox (id,from_addr,to_addr,subject,raw,received_at,status) VALUES (?,?,?,?,?,?,'new')")
    .bind(id, b.from || (session && session.email) || null, b.to || "crew-reports@cims.work", b.subject || null, raw, new Date().toISOString()).run();
  await logActivity(env, session && session.email, "intel_ingest", id);
  return json({ ok: true, id });
}
// Decode a raw MIME email down to readable body text: pick the text/plain part, decode
// quoted-printable / base64, strip HTML tags + URLs. Forwarded crew reports are always encoded,
// so without this the name matcher (and the AI) only see gibberish.
function decodeEmailBody(raw) {
  raw = String(raw || "").replace(/\r/g, "");
  const low = raw.toLowerCase();
  let start = 0, cte = "", body = raw;
  const tp = low.indexOf("content-type: text/plain");
  if (tp >= 0) {
    const nl = raw.indexOf("\n\n", tp);
    start = nl >= 0 ? nl + 2 : tp;
    const hdr = raw.slice(tp, start).toLowerCase();
    if (hdr.indexOf("base64") >= 0) cte = "b64"; else if (hdr.indexOf("quoted-printable") >= 0) cte = "qp";
    let end = raw.indexOf("\n--", start);
    body = raw.slice(start, end >= 0 ? end : undefined);
  } else {
    const nl = raw.indexOf("\n\n");
    start = nl >= 0 ? nl + 2 : 0;
    body = raw.slice(start);
    if (low.indexOf("content-transfer-encoding: base64") >= 0) cte = "b64";
    else if (low.indexOf("content-transfer-encoding: quoted-printable") >= 0) cte = "qp";
  }
  if (cte === "b64") { try { body = decodeURIComponent(escape(atob(body.replace(/\s+/g, "")))); } catch (e) { try { body = atob(body.replace(/\s+/g, "")); } catch (e2) {} } }
  else { body = body.replace(/=\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))); }
  return body.replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+/gi, " ").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}
// Unprocessed inbox + a server-suggested crew match per email (the scheduled AI task confirms it).
async function apiIntelInbox(env) {
  await ensureIntel(env);
  const roster = await intelRoster(env);
  const rows = (await env.DB.prepare("SELECT id, from_addr, subject, raw, received_at FROM email_inbox WHERE status='new' ORDER BY received_at ASC LIMIT 25").all()).results;
  const emails = rows.map(r => { const body = decodeEmailBody(r.raw); return { id: r.id, from: r.from_addr, subject: r.subject, received_at: r.received_at, body: body.slice(0, 6000), suggested: matchCrew((r.subject || "") + " \n " + body, roster) }; });
  return json({ count: emails.length, emails });
}
// File a processed note: {email_id, agency_id|null, reporter, summary, confidence, candidates}.
// agency_id + high/med confidence -> filed on the crew; otherwise -> pending (human review queue).
async function apiIntelFile(request, env, session) {
  await ensureIntel(env);
  const b = await request.json().catch(() => ({}));
  if (!b.summary || !String(b.summary).trim()) return json({ error: "no_summary" }, 400);
  const conf = b.confidence || "low";
  const filed = !!(b.agency_id && (conf === "high" || conf === "med"));
  const id = "ci_" + crypto.randomUUID();
  const contractNo = await intelContractNo(env, b.agency_id);
  await env.DB.prepare("INSERT INTO crew_intel (id,agency_id,reporter,summary,source,source_email_id,confidence,status,candidates,ts,created_by,contract_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, b.agency_id || null, b.reporter || null, String(b.summary).slice(0, 4000), b.source || "email", b.email_id || null, conf, filed ? "filed" : "pending", JSON.stringify(b.candidates || []), b.ts || new Date().toISOString(), (session && session.email) || "ai", contractNo).run();
  if (b.email_id) await env.DB.prepare("UPDATE email_inbox SET status='processed', processed_at=? WHERE id=?").bind(new Date().toISOString(), b.email_id).run();
  await logActivity(env, session && session.email, "intel_file", (b.agency_id || "pending") + " " + conf);
  return json({ ok: true, id, status: filed ? "filed" : "pending" });
}
// Filed intel timeline for one crew (newest first) — the crew card's "story over time".
async function apiIntelCrew(env, url) {
  await ensureIntel(env);
  const agencyId = url.searchParams.get("id");
  const rows = (await env.DB.prepare("SELECT id, reporter, summary, confidence, source, ts, contract_no, edited_at FROM crew_intel WHERE agency_id=? AND status='filed' ORDER BY ts DESC").bind(agencyId).all()).results;
  // Lazy backfill: notes filed before contract_no existed have NULL. Stamp them with the crew's
  // current contract count and persist (existing notes are recent, so now == time-of-logging).
  if (rows.some(r => r.contract_no == null)) {
    const cNo = await intelContractNo(env, agencyId);
    if (cNo != null) {
      for (const r of rows) if (r.contract_no == null) { r.contract_no = cNo; try { await env.DB.prepare("UPDATE crew_intel SET contract_no=? WHERE id=?").bind(cNo, r.id).run(); } catch (e) {} }
    }
  }
  return json({ count: rows.length, intel: rows });
}
// Pending (low-confidence / unmatched) notes awaiting human triage, with candidate crew names.
async function apiIntelReview(env) {
  await ensureIntel(env);
  const rows = (await env.DB.prepare("SELECT id, reporter, summary, confidence, candidates, ts FROM crew_intel WHERE status='pending' ORDER BY ts DESC LIMIT 100").all()).results;
  const crew = (await env.DB.prepare("SELECT agency_id, first_name, last_name FROM crew WHERE redacted=0").all()).results;
  const nm = {}; for (const c of crew) nm[c.agency_id] = [c.first_name, c.last_name].filter(Boolean).join(" ");
  const pending = rows.map(r => { let cand = []; try { cand = JSON.parse(r.candidates || "[]"); } catch (e) {} return { id: r.id, reporter: r.reporter, summary: r.summary, confidence: r.confidence, ts: r.ts, candidates: cand.map(a => ({ agency_id: a, name: nm[a] || a })) }; });
  return json({ count: pending.length, pending });
}
// Human assigns a pending note to a crew (or discards it).
async function apiIntelResolve(request, env, session) {
  await ensureIntel(env);
  const b = await request.json().catch(() => ({}));
  if (!b.id) return json({ error: "no_id" }, 400);
  if (b.discard) { await env.DB.prepare("UPDATE crew_intel SET status='discarded' WHERE id=?").bind(b.id).run(); await logActivity(env, session && session.email, "intel_discard", b.id); return json({ ok: true, discarded: true }); }
  if (!b.agency_id) return json({ error: "no_crew" }, 400);
  const cNo = await intelContractNo(env, b.agency_id);
  await env.DB.prepare("UPDATE crew_intel SET agency_id=?, status='filed', confidence='confirmed', contract_no=? WHERE id=?").bind(b.agency_id, cNo, b.id).run();
  await logActivity(env, session && session.email, "intel_resolve", b.id + " -> " + b.agency_id);
  return json({ ok: true });
}
// Edit a filed note's summary (manual correction of the AI summary).
async function apiIntelEdit(request, env, session) {
  await ensureIntel(env);
  const b = await request.json().catch(() => ({}));
  if (!b.id || !b.summary || !String(b.summary).trim()) return json({ error: "bad_input" }, 400);
  await env.DB.prepare("UPDATE crew_intel SET summary=?, edited_at=? WHERE id=?").bind(String(b.summary).slice(0, 4000), new Date().toISOString(), b.id).run();
  await logActivity(env, session && session.email, "intel_edit", b.id);
  return json({ ok: true });
}

/* ---- AI auto-processing: turn a crew-report email into a filed field-intel card ----
   Runs on email arrival (email handler) and hourly (scheduled handler). The crew is identified
   by the deterministic matcher; the LLM only writes the decision-grade summary. No engine -> the
   email is left 'new' (nothing lost) and retried on the next sweep or processed manually. */

// Call the available LLM to summarise one email body. Returns clean summary text, or null on
// failure / no engine. Never throws.
async function aiSummarize(env, body, crewName, reporter) {
  const engine = pickEngine(env);
  if (engine === "none") return null;
  const sys = intelSystemPrompt();
  const usr = intelUserPrompt(crewName, reporter, body);
  try {
    if (engine === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: INTEL_MODEL_CLAUDE, max_tokens: 600, system: sys, messages: [{ role: "user", content: usr }] })
      });
      if (!r.ok) { console.error("claude_http", r.status, (await r.text().catch(() => "")).slice(0, 300)); return null; }
      const j = await r.json();
      const txt = (j && j.content && j.content[0] && j.content[0].text) || "";
      return parseIntelResponse(txt) || null;
    }
    if (engine === "workersai") {
      const j = await env.AI.run(INTEL_MODEL_WORKERSAI, { messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: 600 });
      const txt = (j && (j.response || j.result || (typeof j === "string" ? j : ""))) || "";
      return parseIntelResponse(txt) || null;
    }
  } catch (e) { console.error("ai_summarize_error", (e && e.stack) || e); }
  return null;
}

// Pull a display name out of a raw "From:" header — 'Ray Guerra <ray@x>' -> 'Ray Guerra'.
function fromDisplayName(raw, fallback) {
  try {
    const m = String(raw || "").match(/^From:\s*(.+)$/mi);
    if (m) {
      let v = m[1].trim();
      const lt = v.indexOf("<");
      if (lt > 0) v = v.slice(0, lt).trim();
      else v = v.replace(/<[^>]*>/g, "").trim();
      v = v.replace(/^"|"$/g, "").trim();
      if (v) return v.slice(0, 80);
    }
  } catch (e) {}
  return fallback || null;
}

// Process one inbox row end-to-end. Claims the row first (so the arrival call and the cron can't
// both file it), then decodes -> matches crew -> AI summarises -> files (high/med) or pending.
async function processIntelEmail(env, row, roster) {
  // Claim: only proceed if this row is still 'new' (atomic guard against double-processing).
  const claim = await env.DB.prepare("UPDATE email_inbox SET status='processing' WHERE id=? AND status='new'").bind(row.id).run();
  if (!claim.meta || claim.meta.changes === 0) return false;
  const body = decodeEmailBody(row.raw);
  const match = matchCrew((row.subject || "") + " \n " + body, roster);
  const reporter = fromDisplayName(row.raw, row.from_addr);
  const summary = await aiSummarize(env, body, match.matchedName, reporter);
  if (!summary) { // AI unavailable/failed -> release the row back to 'new' for the next sweep
    await env.DB.prepare("UPDATE email_inbox SET status='new' WHERE id=?").bind(row.id).run();
    return false;
  }
  const filed = !!(match.agency_id && (match.confidence === "high" || match.confidence === "med"));
  const contractNo = filed ? await intelContractNo(env, match.agency_id) : null;
  const id = "ci_" + crypto.randomUUID();
  await env.DB.prepare("INSERT INTO crew_intel (id,agency_id,reporter,summary,source,source_email_id,confidence,status,candidates,ts,created_by,contract_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, match.agency_id || null, reporter, summary, "email", row.id, match.confidence, filed ? "filed" : "pending", JSON.stringify(match.candidates || []), new Date().toISOString(), "ai", contractNo).run();
  await env.DB.prepare("UPDATE email_inbox SET status='processed', processed_at=? WHERE id=?").bind(new Date().toISOString(), row.id).run();
  await logActivity(env, "ai", "intel_auto", (match.agency_id || "pending") + " " + match.confidence);
  return true;
}

// Sweep up to `limit` unprocessed inbox rows. Used on arrival and by the hourly cron. Never throws.
async function processIntelInbox(env, limit) {
  try {
    await ensureIntel(env);
    if (pickEngine(env) === "none") return 0;
    const roster = await intelRoster(env);
    const rows = (await env.DB.prepare("SELECT id, from_addr, subject, raw, received_at FROM email_inbox WHERE status='new' ORDER BY received_at ASC LIMIT ?").bind(limit || 10).all()).results;
    let n = 0;
    for (const row of rows) { try { if (await processIntelEmail(env, row, roster)) n++; } catch (e) { console.error("intel_email_error", (e && e.stack) || e); } }
    return n;
  } catch (e) { console.error("intel_inbox_error", (e && e.stack) || e); return 0; }
}
// Feedback Windows board — REGISTRY-DRIVEN (re-based 2026-06-13).
// Keyman projected-off dates are an unreliable trigger (often stale), which left the board empty.
// We now key off live crew status: "On Vacation" = a contract just completed -> feedback due NOW;
// "On board" = currently serving -> feedback due at sign-off (pre-stage). Keyman dates, when present,
// are used only for display/sort, never to include/exclude. Inactive/Earmarked are not shown.
async function apiFeedbackBoard(env) {
  await ensureKeyman(env); await ensureFb(env);
  const today = TODAY();
  const legs = (await env.DB.prepare("SELECT sc, ship, sign_on, proj_off, act_off, seq FROM keyman_contract3 WHERE sign_on IS NOT NULL").all()).results;
  const byCrew = {}; for (const l of legs) (byCrew[l.sc] = byCrew[l.sc] || []).push(l);
  const crewRows = (await env.DB.prepare("SELECT id, agency_id, first_name, last_name, vessel_observed, status FROM crew WHERE redacted=0").all()).results;
  const reqs = (await env.DB.prepare("SELECT crew_id, role, status FROM feedback_request2").all()).results;
  const resp = (await env.DB.prepare("SELECT crew_id, role FROM feedback_response2").all()).results;
  const reqByCrew = {}, respByCrew = {};
  for (const r of reqs) (reqByCrew[r.crew_id] = reqByCrew[r.crew_id] || {})[r.role] = r.status;
  for (const r of resp) (respByCrew[r.crew_id] = respByCrew[r.crew_id] || {})[r.role] = true;
  const DUE = { "On Vacation": 0, "On board": 1 }; // On Vacation first (feedback due now)
  const rows = [];
  for (const c of crewRows) {
    if (!(c.status in DUE)) continue;
    const ls = (byCrew[c.agency_id] || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const leg = ls.length ? (ls.find(l => { const off = l.act_off || l.proj_off || "9999"; return l.sign_on <= today && off >= today; }) || ls[ls.length - 1]) : null;
    const off = leg ? (leg.act_off || leg.proj_off || null) : null;
    const days = off ? Math.round((new Date(off) - new Date(today)) / 86400000) : null;
    const roles = ["ray", "rolando", "dexter"].map(role => ({ role, answered: !!(respByCrew[c.id] && respByCrew[c.id][role]), status: (reqByCrew[c.id] && reqByCrew[c.id][role]) || "none" }));
    rows.push({ agency_id: c.agency_id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), vessel: (leg && leg.ship) || c.vessel_observed, signOff: off, days, status: c.status, due: DUE[c.status], roles, answeredCount: roles.filter(r => r.answered).length });
  }
  // Feedback-due (On Vacation) first; then by soonest/most-recent off date; unknown dates last.
  rows.sort((a, b) => a.due - b.due || ((a.days == null) - (b.days == null)) || ((a.days || 0) - (b.days || 0)));
  return json({ today, count: rows.length, rows });
}

/* ----------------------- HTML ----------------------- */
function htmlResponse(body, status = 200) {
  // no-store: the app shell is dynamic + ships often; never let the browser serve a stale UI.
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, must-revalidate" } });
}
// Serve a base64-embedded binary asset (icons). Long cache; immutable per deploy.
function assetResponse(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
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
.burger{display:none;background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;margin-left:auto;padding:6px 8px}
@media(max-width:900px){
  .burger{display:block}
  header nav{display:none;position:absolute;top:56px;right:8px;margin-left:0;flex-direction:column;align-items:stretch;gap:2px;background:#16314F;padding:8px;border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.35);min-width:200px;z-index:60}
  header nav.open{display:flex}
  nav button{text-align:left;width:100%;font-size:15px;padding:11px 14px}
  nav a.out{padding:11px 14px}
}
.wrap{max-width:1180px;margin:0 auto;padding:22px}
.shipsec{background:#fff;border:1px solid var(--line);border-radius:13px;box-shadow:0 2px 10px rgba(20,45,72,.06);overflow:hidden;margin-bottom:10px}
.shiphdr{display:flex;align-items:center;padding:12px 14px;cursor:pointer;border-left:3px solid var(--royal)}
.shiphdr .nm{font-family:'Outfit';font-weight:700;color:var(--navy);font-size:15px}
.shiphdr .meta{margin-left:auto;color:var(--mut);font-size:12.5px;display:flex;align-items:center;gap:8px}
.shiphdr .arw{display:inline-block;transition:transform .15s}.shiphdr .arw.closed{transform:rotate(-90deg)}
.shipbody{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;padding:6px 14px 14px}
.shipbody.closed{display:none}
.rcard{background:#fcfdff;border:1px solid var(--line);border-radius:11px;padding:10px 12px;cursor:grab}
.rcard:active{cursor:grabbing}.rcard:hover{border-color:var(--navy)}
.rcard .rnm{font-family:'Outfit';font-weight:700;color:var(--navy);font-size:13.5px;margin-bottom:4px}
.rcard .rleg{font-size:11.5px;color:var(--mut);display:flex;align-items:center;gap:6px}
.rcard .rleg i{width:8px;height:8px;border-radius:50%;display:inline-block}
.rcard .rleg2{font-size:11.5px;color:#3a4a5e;display:flex;align-items:center;gap:6px;margin-top:2px}
.rcard .rleg2 i{width:7px;height:7px;border-radius:50%;display:inline-block}
.rcard .rleg2 i.ondot{background:var(--green)}.rcard .rleg2 i.offdot{background:var(--amber)}
.rcard .rdur{display:inline-block;margin-top:6px;background:#eef2f7;color:var(--mut);font-size:10.5px;padding:2px 8px;border-radius:20px}
.rtags{margin-top:7px;display:flex;flex-wrap:wrap;gap:4px}
.rtag{font-size:9px;font-weight:800;letter-spacing:.03em;padding:2px 6px;border-radius:6px;border:1px solid var(--line-2);color:var(--mut);background:#fff}
.rtag.on{background:#EAF6E6;border-color:#bfe0b0;color:var(--green-d)}
.rtag.rtoggle{cursor:pointer;user-select:none}
.poolwrap{background:#fff;border:1px dashed var(--line-2);border-radius:13px;padding:12px 14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:8px;min-height:48px}
.rcard.cur{box-shadow:0 0 0 2px var(--green) inset}
.rcard .notedot{color:var(--amber);font-size:9px;vertical-align:middle}
.modwrap{position:fixed;inset:0;background:rgba(16,30,48,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:200;overflow:auto}
.modcard{background:#fff;border-radius:16px;max-width:680px;width:100%;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.modhd{display:flex;align-items:flex-start;gap:12px}.modhd>div:first-child{flex:1}
.chip{display:inline-block;font-size:12px;font-weight:600;padding:5px 12px;border-radius:20px;border:1px solid var(--line-2);color:var(--mut);background:#fff;cursor:pointer;margin:0 2px 4px 0}
.chip.on{background:var(--navy);border-color:var(--navy);color:#fff}
.zlabel{font-family:'Outfit';font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin:20px 0 10px;display:flex;align-items:center;gap:12px}
.zlabel::after{content:'';height:1px;background:var(--line-2);flex:1}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(20,45,72,.05);text-align:center}
.tile .n{font-family:'Outfit';font-size:30px;font-weight:800;color:var(--navy);line-height:1}
.tile .l{font-size:10.5px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:8px}
.tile.green .n{color:var(--green-d)}.tile.amber .n{color:var(--amber)}.tile.royal .n{color:var(--royal)}.tile.gray .n{color:#6B7C93}.tile.red .n{color:var(--red)}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 14px}
.bar h2{font-size:19px;color:var(--navy);margin-right:auto}
.bar input,.bar select,.bar button,.bar .btn{height:38px;box-sizing:border-box;font-size:13.5px;border-radius:9px;line-height:1}
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
.crew-card{position:relative;cursor:pointer}
.crew-card .tools{position:absolute;top:10px;right:10px;display:flex;gap:4px}
.crew-card .tools button{background:#f1f4f9;border:1px solid var(--line);border-radius:7px;width:26px;height:26px;cursor:pointer;font-size:13px;line-height:1;color:var(--navy);padding:0}
.crew-card .tools button:hover{background:#e4ebf5}
.crow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
.cdates{font-size:12px;color:var(--deep);margin-top:7px}
.pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;display:inline-block}
.pill.rank{background:#eef3f9;color:var(--navy)}
.pill.cnt{background:var(--navy);color:#fff}
.pill.next{background:#eaf6e6;color:var(--green-d)}
.pill.next.zero{background:#f1f4f9;color:var(--mut)}
.vchip{font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:#fff5e6;color:var(--amber);margin-left:5px}
.notedot{position:absolute;bottom:11px;right:12px;width:9px;height:9px;border-radius:50%;background:#f5b301;box-shadow:0 0 0 2px #fff;cursor:pointer}
.notelog{margin-top:12px;display:flex;flex-direction:column;gap:8px;max-height:300px;overflow:auto}
.noteitem{border-left:3px solid var(--royal);background:#f7f9fc;border-radius:0 8px 8px 0;padding:8px 11px}
.notemeta{font-size:11px;color:var(--mut);font-weight:600;display:flex;align-items:center}
.notedel{margin-left:auto;color:var(--mut);cursor:pointer;font-weight:700;padding:0 4px;border-radius:5px}
.notedel:hover{background:#fbe9e7;color:var(--red)}
.notetext{font-size:13px;color:var(--deep);margin-top:3px;white-space:pre-wrap}
.fbp{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:#f1f4f9;color:var(--mut);cursor:pointer;display:inline-block;margin:1px}
.fbp.on{background:#eaf6e6;color:var(--green-d)}
.fbp.pend{background:#fff5e6;color:var(--amber)}
.dzone{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px;margin-bottom:6px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(20,45,72,.05)}
.panel h3{font-family:'Outfit';font-size:12.5px;color:var(--navy);margin:0 0 10px;font-weight:700}
.panel.center{display:flex;flex-direction:column;align-items:center}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:12px;color:var(--deep)}
.legend i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:middle}
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
.sec{display:flex;align-items:center;font-family:'Outfit';font-weight:700;color:var(--navy);font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.sec .n{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--navy);color:#fff;font-size:11px;margin-right:8px;flex:none}
label.req::after{content:' *';color:var(--red);font-weight:700}
.fg input.bad{border-color:var(--red);background:#fdecea}
.ckgate{border-left:3px solid var(--amber);padding-left:10px;border-radius:0 8px 8px 0;margin:4px 0;transition:background .15s}
.ckgate.on{border-left-color:var(--red);background:#fbe9e7}
.scsec{position:relative;transition:opacity .15s,filter .15s}
.scsec.gated{opacity:.4;filter:grayscale(.4);pointer-events:none}
.gateban{display:none;background:#fbe9e7;color:var(--red);border:1px solid #f3c0b8;border-radius:9px;padding:9px 11px;font-size:12.5px;font-weight:600;margin-bottom:10px}
.scsec.gated .gateban{display:block;pointer-events:auto}
.resultbar{position:sticky;bottom:0;margin:18px -20px 0;padding:13px 20px;background:#fff;border-top:1px solid var(--line);box-shadow:0 -9px 24px -14px rgba(16,38,64,.32);display:flex;align-items:center;gap:12px;flex-wrap:wrap;z-index:5}
.resultbar #scoreOut{flex:1;display:flex;align-items:center;gap:12px;min-width:140px}
.rnums{display:flex;gap:13px;font-size:12px;color:var(--mut);flex-wrap:wrap;align-items:center}
.rnums b{font-family:'Outfit';color:var(--navy)}
.rpay{font-family:'Outfit';font-weight:800;font-size:25px;color:var(--green-d);margin-left:auto;white-space:nowrap}
.rpay.zero{color:var(--red)}
.gchip{background:#fbe9e7;color:var(--red);border-radius:7px;padding:2px 8px;font-weight:700;font-size:11px}
.rbtns{display:flex;gap:8px;flex:none}
.fbdot{display:inline-block;width:9px;height:9px;border-radius:50%;border:1px solid rgba(0,0,0,.08)}
.intcount{color:var(--mut);font-weight:600;text-transform:none;letter-spacing:0}
.intelcard{background:#fff;border:1px solid var(--line);border-left:3px solid var(--navy);border-radius:11px;padding:11px 13px;margin-bottom:9px;box-shadow:0 1px 4px rgba(20,45,72,.06)}
.intelhd{display:flex;align-items:flex-start;gap:8px;margin-bottom:7px}
.intelmeta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;flex:1;font-size:11.5px;color:var(--mut)}
.intelmeta .intdate{font-weight:600}
.intelmeta .intrep{font-weight:700;color:var(--navy)}
.intelmeta .intedited{font-style:italic;opacity:.7}
.intchip{background:var(--bg);border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:700;color:var(--mut);white-space:nowrap}
.intchip.src{background:#eef4ff;color:#1E6FD0;text-transform:capitalize}
.intchip.ctr{background:#eaf7ee;color:var(--green-d)}
.intelact{display:flex;gap:4px;flex:none}
.intelact button{background:transparent;border:1px solid var(--line);border-radius:7px;cursor:pointer;font-size:11px;font-weight:600;color:var(--mut);padding:3px 9px}
.intelact button:hover{background:var(--bg);color:var(--navy)}
.intelact button.del:hover{background:#fdecea;color:var(--red);border-color:#f3c0b8}
.inteltext{font-size:13px;color:var(--ink);line-height:1.55}
.inteledit{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;line-height:1.5}
.sbadge{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12px;padding:5px 12px;border-radius:20px;margin-bottom:10px}
.sbadge.on{background:#e8f6ed;color:var(--green-d)}
.sbadge.off{background:#fff1de;color:var(--amber)}
.sbadge.idle{background:#eef1f5;color:var(--mut)}
.modal.sc-off .mh{border-bottom-color:var(--amber)}
.modal.sc-on .mh{border-bottom-color:var(--green)}
.btn{padding:9px 15px;border:0;border-radius:9px;background:var(--navy);color:#fff;font-weight:600;cursor:pointer;font-family:'DM Sans';font-size:13.5px}
.btn.green{background:var(--green)}.btn.ghost{background:#fff;border:1px solid var(--line);color:var(--navy)}
.warn{background:#fdf7ec;border:1px solid #ecdfc2;color:var(--amber);border-radius:9px;padding:9px 11px;font-size:12.5px;margin-bottom:12px}
.brow{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;margin-bottom:7px;cursor:pointer}
.brow:hover{border-color:var(--navy)}
.tbl{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13.5px}
.tbl th{text-align:left;background:#F2F5FA;color:var(--navy);font-family:'Outfit';font-weight:700;padding:9px 12px;border-bottom:1px solid var(--line-2);cursor:pointer;user-select:none}
.tbl th[data-sort=asc]::after{content:' ▲';font-size:9px}.tbl th[data-sort=desc]::after{content:' ▼';font-size:9px}
.tbl td{padding:8px 12px;border-bottom:1px solid var(--line);color:var(--ink)}
.tbl tr:last-child td{border-bottom:0}
.setmenu.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.printhead{display:none;font-family:'Outfit';font-weight:800;color:var(--navy);font-size:17px;margin-bottom:12px}
@media print{header,.noprint{display:none!important}.wrap{padding:0}.printhead{display:block!important}body{background:#fff}.tile,.card,table{break-inside:avoid}}
.rchip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:5px 9px;margin:3px 4px 3px 0;font-size:12.5px;cursor:grab}
.rchip i{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.shipbody{min-height:34px;margin-top:6px}
.shipdrop{transition:outline .08s}
.tbl td:nth-child(n+2),.tbl th:nth-child(n+2){text-align:right}
.tbl td:first-child,.tbl th:first-child{text-align:left}
.hint{font-size:11.5px;color:var(--mut);margin-top:3px}

/* ===== 2026 refresh — toggle controls + modern surfaces (overrides) ===== */
/* Checkbox -> iOS-style toggle switch (the "toggle look for the clicks") */
input[type=checkbox]{appearance:none;-webkit-appearance:none;width:40px;height:23px;border-radius:23px;background:#cfd8e3;position:relative;cursor:pointer;transition:background .2s cubic-bezier(.4,0,.2,1);vertical-align:middle;flex:none;border:0;box-shadow:inset 0 1px 2px rgba(20,45,72,.12)}
input[type=checkbox]::after{content:'';position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(16,38,64,.3);transition:transform .2s cubic-bezier(.4,0,.2,1)}
input[type=checkbox]:checked{background:var(--green)}
input[type=checkbox]:checked::after{transform:translateX(17px)}
input[type=checkbox]:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.ck input,.bar input[type=checkbox]{width:40px;height:23px}
.ck{gap:11px;font-size:13.5px;color:var(--ink)}
/* Inputs / selects — softer, rounded, clear focus ring */
input,select,textarea{border:1px solid var(--line-2);border-radius:11px;transition:border-color .15s,box-shadow .15s;background:#fff}
input:not([type=checkbox]):focus,select:focus,textarea:focus{outline:0;border-color:var(--green);box-shadow:0 0 0 3px rgba(95,185,70,.18)}
select{appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--mut) 50%),linear-gradient(135deg,var(--mut) 50%,transparent 50%);background-position:calc(100% - 16px) 52%,calc(100% - 11px) 52%;background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:32px}
/* Buttons — pill, subtle depth + hover lift */
.btn{border-radius:11px;font-weight:700;letter-spacing:.005em;transition:transform .12s ease,box-shadow .15s ease,filter .15s ease;box-shadow:0 1px 2px rgba(16,38,64,.14)}
.btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px -4px rgba(16,38,64,.32)}
.btn:active{transform:translateY(0)}
.btn.green{box-shadow:0 1px 2px rgba(62,142,42,.3)}.btn.green:hover{box-shadow:0 8px 18px -5px rgba(62,142,42,.5)}
.btn.ghost{box-shadow:none}.btn.ghost:hover{background:#f6f9fc;box-shadow:0 4px 12px -4px rgba(16,38,64,.18)}
/* Modals — bigger radius, blurred backdrop, refined shadow + entrance */
.modwrap,.ov{background:rgba(16,30,48,.42);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
.modcard,.modal{border-radius:22px;box-shadow:0 30px 70px -15px rgba(16,38,64,.45);border:1px solid rgba(255,255,255,.7);animation:modin .22s cubic-bezier(.2,.7,.3,1)}
@keyframes modin{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
/* Cards / tiles / ship sections — softer shadow + hover lift */
.tile{border-radius:16px;border-color:var(--line);box-shadow:0 1px 3px rgba(20,45,72,.05);transition:transform .14s ease,box-shadow .14s ease}
.tile[data-rf],.tile[data-kind],.tile[data-go],.tile[data-fm]{cursor:pointer}
.tile[data-rf]:hover,.tile[data-kind]:hover,.tile[data-go]:hover,.tile[data-fm]:hover{transform:translateY(-2px);box-shadow:0 10px 24px -8px rgba(20,45,72,.22)}
.card{border-radius:15px;box-shadow:0 1px 3px rgba(20,45,72,.06);transition:transform .14s ease,box-shadow .14s ease}
.card[data-crew]:hover{transform:translateY(-2px);box-shadow:0 10px 24px -8px rgba(20,45,72,.2)}
.shipsec{border-radius:16px}
.pill{padding:3px 10px;font-weight:700}
.pill.rank{background:linear-gradient(180deg,#f0f5fb,#e7eef7);box-shadow:inset 0 0 0 1px rgba(27,58,92,.08)}
.rtag.rtoggle{transition:background .15s,border-color .15s,color .15s}
summary::-webkit-details-marker{color:var(--mut)}
details.ddwrap>summary{padding:6px 0}
/* Per-ship deployment history (schedule tabs): ours = light card, former/other = greyed dashed */
.histsec{padding:2px 14px 13px}.histsec.closed{display:none}
.histhd{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:0 0 8px;border-top:1px dashed var(--line-2);padding-top:9px}
.histgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:7px}
.hcard{border-radius:10px;padding:7px 10px;border:1px solid var(--line);background:#f7f9fc;transition:background .12s,transform .12s}
.hcard.ours{cursor:pointer}.hcard.ours:hover{background:#eef4fb;transform:translateY(-1px)}
.hcard.former{background:repeating-linear-gradient(135deg,#f3f4f7,#f3f4f7 8px,#eef0f4 8px,#eef0f4 16px);border-style:dashed;border-color:#d7dce5}
.hcard .hnm{font-size:11.5px;font-weight:700;color:var(--navy);display:flex;align-items:center;gap:6px;justify-content:space-between}
.hcard.former .hnm{color:#7c879a}
.hcard .hspan{color:var(--mut);font-size:10px;margin-top:2px}
.hcard .hdur{color:var(--navy);font-size:10.5px;font-weight:700;margin-top:3px}
.htag{font-size:8px;font-weight:800;letter-spacing:.05em;padding:1px 6px;border-radius:6px;text-transform:uppercase;flex:none}
.htag.ours{background:#eaf6e6;color:var(--green-d)}.htag.former{background:#e6e9ef;color:#8a93a3}
`;

const LOGIN_HTML = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>DG3 CIMS · Sign in</title>
<link rel=icon href="/favicon.ico" sizes=any><link rel=apple-touch-icon href="/apple-touch-icon.png">
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
<link rel=icon href="/favicon.ico" sizes=any><link rel=apple-touch-icon href="/apple-touch-icon.png">
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
  if(d.locked){document.getElementById('fbsub').textContent=d.roleLabel+' · '+d.crew;document.getElementById('fbbody').innerHTML='<div class=card2 style="text-align:center"><div style="font-family:Outfit;font-weight:800;color:var(--green-d);font-size:20px">✓ Already submitted</div><div class=hint style="margin-top:6px">This feedback window has been completed and is now closed. Thank you.</div></div>';return;}
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
<link rel=icon href="/favicon.ico" sizes=any><link rel=apple-touch-icon href="/apple-touch-icon.png">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body>
<header>
  <div class=brandmark>D</div>
  <div class=brand>DG3 CIMS<small>HR Operational Console</small></div>
  <button class=burger aria-label="Menu" onclick="document.querySelector('header nav').classList.toggle('open')">☰</button>
  <nav>
    <button id=nav-dashboard class=on onclick="show('dashboard')">Dashboard</button>
    <button id=nav-crew onclick="show('crew')">Crew</button>
    <button id=nav-contracts onclick="show('contracts')">Contracts &amp; Bonus</button>
    <button id=nav-rotation onclick="show('rotation')">Keyman</button>
    <button id=nav-feedback onclick="show('feedback')">Feedback</button>
    <button id=nav-compliance onclick="show('compliance')">Compliance</button>
    <button id=nav-billing onclick="show('billing')">Billing</button>
    <button id=nav-travel onclick="show('travel')">Travel</button>
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
let CURRENT_CREW=null,CURD=null;
// Click any .tbl header to sort that table (numeric / ISO-date / text aware).
document.addEventListener('click',function(e){
  var th=e.target&&e.target.closest?e.target.closest('.tbl thead th'):null; if(!th)return;
  var table=th.closest('table'); var tb=table.tBodies[0]; if(!tb)return;
  var idx=Array.prototype.indexOf.call(th.parentNode.children,th);
  var dir=th.getAttribute('data-sort')==='asc'?-1:1;
  th.parentNode.querySelectorAll('th').forEach(function(x){x.removeAttribute('data-sort');});
  th.setAttribute('data-sort',dir===1?'asc':'desc');
  var iso=/^\\d{4}-\\d{2}-\\d{2}/;
  var rows=Array.prototype.slice.call(tb.rows);
  rows.sort(function(a,b){
    var x=(a.cells[idx]?a.cells[idx].textContent:'').trim(), y=(b.cells[idx]?b.cells[idx].textContent:'').trim();
    if(iso.test(x)&&iso.test(y)) return (x<y?-1:x>y?1:0)*dir;
    var xn=x.replace(/[^0-9.-]/g,''), yn=y.replace(/[^0-9.-]/g,''), nx=parseFloat(xn), ny=parseFloat(yn);
    if(xn!==''&&yn!==''&&!isNaN(nx)&&!isNaN(ny)) return (nx-ny)*dir;
    return x.localeCompare(y)*dir;
  });
  rows.forEach(function(r){tb.appendChild(r);});
});
function dot(st){return {'On board':'#5FB946','On Vacation':'#B0741A','Earmarked':'#1E6FD0','Inactive':'#9aa7b6'}[st]||'#9aa7b6';}
function brandOf(v){v=(v||'').toUpperCase();if(v.includes('CELEBRITY'))return'Celebrity';if(v.includes('AZAMARA'))return'Azamara';if(v.includes('NCL')||v.includes('NORWEGIAN'))return'NCL';return'Royal';}
function docChip(label,d){if(!d)return'';const days=(new Date(d)-new Date())/86400000;const cls=days<0?'red':days<90?'amber':'ok';return '<span class="cchip '+cls+'">'+label+' '+d+'</span>';}
async function show(tab){
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('on'));
  var _nv=document.querySelector('header nav');if(_nv)_nv.classList.remove('open');
  var _b=$('#nav-'+(tab==='settings'?'data':tab));if(_b)_b.classList.add('on');
  if(tab==='dashboard')return renderDashboard();
  if(tab==='crew')return renderCrew();
  if(tab==='contracts')return renderContracts();
  if(tab==='rotation')return renderRotation();
  if(tab==='feedback')return renderFeedback();
  if(tab==='compliance')return renderCompliance();
  if(tab==='billing')return renderBilling();
  if(tab==='travel')return renderTravel();
  if(tab==='fleet')return renderFleet();
  if(tab==='data'||tab==='settings')return renderData();
}
// "Data" is now the single home for data status AND uploads/session/about (the old Settings tab was
// merged in). Left menu: Overview (data sources + load history), Upload data, Session, About.
function renderSettings(){ return renderData(); }
function renderData(){
  $('#view').innerHTML='<div class=bar><h2>Data</h2></div>'
   +'<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">'
   +'<div style="min-width:170px"><div class=zlabel>Menu</div>'
     +'<button class="btn ghost setmenu" data-set="overview" style="display:block;width:100%;text-align:left;margin-bottom:6px">Overview</button>'
     +'<button class="btn ghost setmenu" data-set="uploads" style="display:block;width:100%;text-align:left;margin-bottom:6px">Upload data</button>'
     +'<button class="btn ghost setmenu" data-set="session" style="display:block;width:100%;text-align:left;margin-bottom:6px">Session</button>'
     +'<button class="btn ghost setmenu" data-set="about" style="display:block;width:100%;text-align:left">About</button>'
   +'</div><div id=setbody style="flex:1;min-width:320px"></div></div>';
  document.querySelectorAll('.setmenu').forEach(function(b){b.onclick=function(){document.querySelectorAll('.setmenu').forEach(function(x){x.classList.remove('on');});b.classList.add('on');setShow(b.getAttribute('data-set'));};});
  document.querySelector('.setmenu').classList.add('on');
  setShow('overview');
}
function setShow(s){ if(s==='overview')return dataOverview(); if(s==='uploads')return setUploads(); if(s==='session')return setSession(); return setAbout(); }
function setUploads(){
  $('#setbody').innerHTML='<div class=zlabel>Data uploads</div>'
   +'<div class="card" style="max-width:none;border-left:3px solid var(--navy)">'
   +'<label class=csub>Data type</label><br>'
   +'<select id=dstype style="margin:6px 0 14px"><option value="crew">Crew registry — AdvancedQuery (.xls / .xlsx)</option><option value="keyman">Keyman contracts — CIMS Keyman workbook (.xlsx)</option><option value="travel">Travel expenses — monthly workbook (.xls / .xlsx)</option><option value="vessel">Vessel deployment — preview structure (.xls / .xlsx)</option></select>'
   +'<div id=dropzone style="border:2px dashed var(--line-2);border-radius:12px;padding:30px 18px;text-align:center;cursor:pointer">'
     +'<div style="font-family:\\'Outfit\\';font-weight:700;color:var(--navy)">Drag &amp; drop the file here</div>'
     +'<div class=csub style="margin-top:4px">or click to choose · .xls or .xlsx only</div></div>'
   +'<input type=file id=crewfile accept=".xls,.xlsx" style="display:none" onchange="handleDrop(this.files)">'
   +'<div id=imp class=csub style="margin-top:12px"></div>'
   +'<p class=muted style="text-align:left;margin-top:10px">Only the data types listed above are accepted — nothing else is read. You\\'ll see a preview before anything is saved, and bonus baselines are never affected.</p>'
   +'</div>';
  var dz=$('#dropzone'), fi=$('#crewfile');
  dz.onclick=function(){fi.click();};
  dz.ondragover=function(e){e.preventDefault();dz.style.borderColor='var(--green)';dz.style.background='#F2F8EF';};
  dz.ondragleave=function(e){e.preventDefault();dz.style.borderColor='var(--line-2)';dz.style.background='';};
  dz.ondrop=function(e){e.preventDefault();dz.style.borderColor='var(--line-2)';dz.style.background='';handleDrop(e.dataTransfer.files);};
}
async function setSession(){
  var me={}; try{me=await (await fetch('/api/me')).json();}catch(e){}
  $('#setbody').innerHTML='<div class=zlabel>Session</div><div class="card" style="max-width:none">'
   +'<div class=csub>Signed in as <b style="color:var(--navy)">'+(me.email||'—')+'</b></div>'
   +'<div class=csub style="margin-top:6px">Sessions last 30 days. <a href="/api/auth/logout">Sign out</a></div></div>';
}
function setAbout(){
  $('#setbody').innerHTML='<div class=zlabel>About</div><div class="card" style="max-width:none">'
   +'<div class=csub>DG3 CIMS — HR Operational Console. Crew, rotation, document compliance, days-worked billing, and fleet. Auto-deployed from GitHub with a test gate and nightly self-maintenance.</div></div>';
}
let IMPROWS=null;
function loadSheetJS(cb){
  if(window.XLSX)return cb();
  var s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload=cb; s.onerror=function(){$('#imp').textContent='Could not load the spreadsheet parser.';};
  document.head.appendChild(s);
}
function parseCrewFile(f){
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
        var ws=wb.Sheets[wb.SheetNames[0]];
        // AdvancedQuery exports can have a blank/title row before the real headers, so don't assume
        // row 1 is the header. Read as a grid, find the row that has the CREW ID label, and build
        // objects from there. Without this the parser reads blank keys and the preview shows nothing.
        var aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
        var hi=-1;
        for(var i=0;i<Math.min(aoa.length,15);i++){ if((aoa[i]||[]).some(function(c){return /crew\\s*id/i.test(String(c));})){hi=i;break;} }
        if(hi<0)hi=0;
        var headers=(aoa[hi]||[]).map(function(c){return String(c).trim();});
        IMPROWS=[];
        for(var rr=hi+1;rr<aoa.length;rr++){
          var row=aoa[rr]; if(!row)continue; var o={}, any=false;
          headers.forEach(function(h,ci){ if(!h)return; var v=row[ci]==null?'':row[ci]; o[h]=v; if(String(v).trim())any=true; });
          if(any)IMPROWS.push(o);
        }
        previewImport();
      }catch(err){$('#imp').textContent='Could not parse that file: '+err.message;}
    };
    rd.readAsArrayBuffer(f);
  });
}
function handleDrop(files){
  var f=files&&files[0]; if(!f)return;
  var t=$('#dstype')?$('#dstype').value:'crew';
  if(t!=='crew'&&t!=='vessel'&&t!=='travel'&&t!=='keyman'){$('#imp').textContent='That data type is not enabled yet.';return;}
  if(!/\\.(xls|xlsx)$/i.test(f.name)){$('#imp').textContent='Please upload a .xls or .xlsx file.';return;}
  if(t==='vessel')return parseVesselFile(f);
  if(t==='travel')return parseTravelFile(f);
  if(t==='keyman')return parseKeymanFile(f);
  parseCrewFile(f);
}
var KEYMANUP=null;
function parseKeymanFile(f){
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
        var sn=wb.SheetNames.find(function(n){return n.toLowerCase().indexOf('contract counter')>=0;});
        if(!sn){$('#imp').innerHTML='<div style="'+BADBOX+'">No "Contract Counter" sheet found in this workbook. Upload the CIMS Keyman file.</div>';return;}
        KEYMANUP=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,dateNF:'yyyy-mm-dd',defval:''});
        previewKeyman();
      }catch(err){$('#imp').innerHTML='<div style="'+BADBOX+'">Could not parse that file: '+err.message+'</div>';}
    };
    rd.readAsArrayBuffer(f);
  });
}
async function previewKeyman(){
  if(!KEYMANUP||!KEYMANUP.length){$('#imp').innerHTML='<div style="'+BADBOX+'">No rows found in the Contract Counter sheet.</div>';return;}
  $('#imp').textContent='Analysing the Contract Counter…';
  var r=await (await fetch('/api/keyman/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:KEYMANUP,dryRun:true})})).json();
  if(r.error){$('#imp').innerHTML='<div style="'+BADBOX+'">Could not analyse: '+r.error+'</div>';return;}
  var h='<div style="margin-top:6px"><b style="color:var(--navy)">'+r.crewInFile+' crew in file</b> · <span class="cchip ok">'+r.matched+' matched to roster</span> <span class="cchip amber">'+r.unmatched+' not on roster</span> · '+r.contracts+' contracts'
    +'<div class=csub style="margin-top:4px">Current contract rows: '+r.currentRows+' → will refresh the matched crew. Unmatched are candidates/former crew (left as-is).</div></div>';
  if(r.sampleUnmatched&&r.sampleUnmatched.length)h+='<div class=hint style="margin-top:8px"><b style="color:var(--navy)">Not on roster (skipped)</b><br>'+r.sampleUnmatched.join('<br>')+(r.unmatched>r.sampleUnmatched.length?('<br>+'+(r.unmatched-r.sampleUnmatched.length)+' more'):'')+'</div>';
  h+='<button class="btn" style="margin-top:10px" onclick="applyKeyman()">Refresh contract history for '+r.matched+' crew</button>';
  $('#imp').innerHTML=h;
}
async function applyKeyman(){
  $('#imp').textContent='Refreshing contract history…';
  var r=await (await fetch('/api/keyman/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:KEYMANUP})})).json();
  if(r.ok){$('#imp').innerHTML='<div style="'+NOCHG+'">✓ Refreshed — '+r.applied+' contracts across '+r.crew+' crew. Rank &amp; contract counts now reflect this file. <a href="#" onclick="setShow(\\'overview\\');return false">View data overview</a></div>';KEYMANUP=null;}
  else $('#imp').innerHTML='<div style="'+BADBOX+'">Import failed'+(r.error?(': '+r.error):'')+'.</div>';
}
var TRAVELUP=null;
function parseTravelFile(f){
  var ym=(f.name.match(/20\\d\\d/)||[])[0];
  if(!ym){$('#imp').textContent='Could not detect the year from the filename (expected e.g. 2026 in the name).';return;}
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',raw:true});
        var want=['JAN','FEB','MAR','APRIL','MAY','JUNE','JULY','AUG','SEPT','OCT','NOV','DEC','CIMS'];
        var sheets={};
        wb.SheetNames.forEach(function(sn){ if(want.indexOf(sn.toUpperCase())>=0){ sheets[sn]=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:''}); }});
        TRAVELUP={sheets:sheets,year:+ym};
        previewTravel();
      }catch(err){$('#imp').textContent='Could not parse that file: '+err.message;}
    };
    rd.readAsArrayBuffer(f);
  });
}
async function previewTravel(){
  $('#imp').textContent='Analyzing…';
  var r=await (await fetch('/api/travel/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheets:TRAVELUP.sheets,year:TRAVELUP.year,dryRun:true})})).json();
  if(r.error){$('#imp').textContent='Error: '+r.error;return;}
  var h='<div style="margin-top:6px"><b style="color:var(--navy)">Preview '+r.year+'</b> — '+r.records+' line items · '+r.crew+' crew · $'+Number(r.total).toLocaleString()
    +'<div class=csub style="margin-top:4px">Sign-on $'+Number(r.byLeg.on||0).toLocaleString()+' · Sign-off $'+Number(r.byLeg.off||0).toLocaleString()+' · Transfer $'+Number(r.byLeg.transfer||0).toLocaleString()+'</div></div>';
  h+='<div class=csub style="margin-top:6px;color:var(--amber)">Applying replaces all '+r.year+' travel records (2025 history is untouched).</div>';
  if(r.records>0)h+='<button class="btn" style="margin-top:10px" onclick="applyTravel()">Apply '+r.year+' ('+r.records+' items)</button>';
  else h+='<div class=csub style="margin-top:8px">No travel line items found in that workbook.</div>';
  $('#imp').innerHTML=h;
}
async function applyTravel(){
  $('#imp').textContent='Applying…';
  var r=await (await fetch('/api/travel/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheets:TRAVELUP.sheets,year:TRAVELUP.year})})).json();
  if(r.ok)$('#imp').innerHTML='<span class="cchip ok">Done</span> loaded '+r.applied+' travel items for '+r.year+'. <a href="#" onclick="show(\\'travel\\');return false">Open Travel</a>';
  else $('#imp').textContent='Import failed.';
}
function parseVesselFile(f){
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
        var h='<div style="margin-top:6px"><b style="color:var(--navy)">File profile</b> — '+wb.SheetNames.length+' sheet(s) in '+f.name+'</div>';
        wb.SheetNames.forEach(function(sn){
          var ws=wb.Sheets[sn];
          var rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
          var headers=(rows[0]||[]).map(function(x){return String(x);});
          var n=rows.length>0?rows.length-1:0;
          h+='<div class="card" style="max-width:none;margin-top:10px;border-left:3px solid var(--green)">'
            +'<div class=cname style="font-size:15px">'+sn+'</div>'
            +'<div class=csub>'+n+' data rows · '+headers.length+' columns</div>'
            +'<div class=csub style="margin-top:6px"><b>Columns:</b> '+headers.join('  |  ')+'</div>';
          var sample=rows.slice(1,4);
          if(sample.length){
            h+='<div style="overflow:auto"><table class=tbl style="margin-top:6px"><thead><tr>'+headers.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>'
              +sample.map(function(r){return '<tr>'+headers.map(function(_,i){return '<td>'+String(r[i]==null?'':r[i])+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
          }
          h+='</div>';
        });
        h+='<p class=muted style="text-align:left;margin-top:10px">Read-only structure preview — nothing saved. Screenshot this so the vessel deployment load can be built to match.</p>';
        $('#imp').innerHTML=h;
      }catch(err){$('#imp').textContent='Could not parse that file: '+err.message;}
    };
    rd.readAsArrayBuffer(f);
  });
}
var NOCHG='margin-top:8px;padding:10px 12px;border-radius:8px;background:#F2F8EF;border-left:3px solid var(--green);color:var(--navy);font-weight:600';
var BADBOX='margin-top:8px;padding:10px 12px;border-radius:8px;background:#FDF3F1;border-left:3px solid var(--red);color:var(--navy)';
var IMP_FLAB={first_name:'first name',middle_name:'middle name',last_name:'last name',status:'status',rank_observed:'rank',vessel_observed:'vessel',dob:'date of birth',province:'province',phone:'phone',email:'email',med_exp:'medical expiry',sirb_exp:'seaman-book expiry',pp_exp:'passport expiry',sch_exp:'Schengen expiry',usv_exp:'US-visa expiry'};
async function previewImport(){
  if(!IMPROWS||!IMPROWS.length){$('#imp').innerHTML='<div style="'+BADBOX+'">Couldn\\'t read any crew rows from this file. Make sure it\\'s the AdvancedQuery export (.xls/.xlsx).</div>';return;}
  $('#imp').textContent='Analyzing '+IMPROWS.length+' rows…';
  var r=await (await fetch('/api/crew/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:IMPROWS,dryRun:true})})).json();
  if(r.error){$('#imp').innerHTML='<div style="'+BADBOX+'">Could not analyse the file: '+r.error+'</div>';return;}
  // name lookup from the file rows, to show WHO changed (not just IDs)
  var nm={};IMPROWS.forEach(function(row){var id='',fn='',ln='';for(var k in row){var nk=k.toLowerCase();if(nk.indexOf('crew id')>=0||nk.indexOf('crewid')>=0)id=String(row[k]).trim();else if(nk.indexOf('first')>=0)fn=String(row[k]).trim();else if(nk.indexOf('last')>=0||nk.indexOf('surname')>=0)ln=String(row[k]).trim();}if(id)nm[id]=(fn+' '+ln).trim()||id;});
  if((r.add+r.change)===0){$('#imp').innerHTML='<div style="'+NOCHG+'">✓ No changes — this file is identical to the crew data already on file ('+r.total+' rows checked). Nothing to import.</div>';return;}
  var h='<div style="margin-top:6px"><b style="color:var(--navy)">'+r.total+' rows checked</b> · <span class="cchip ok">'+r.add+' new</span> <span class="cchip amber">'+r.change+' changed</span> '+r.unchanged+' unchanged'
    +(r.needsStatus?(' · <span class="cchip red">'+r.needsStatus+' new w/o status (skipped)</span>'):'')+(r.invalid?(' · '+r.invalid+' unreadable'):'')+'</div>';
  if(r.add&&r.sampleAdd&&r.sampleAdd.length)h+='<div class=hint style="margin-top:8px"><b style="color:var(--navy)">New crew ('+r.add+')</b><br>'+r.sampleAdd.map(function(id){return (nm[id]||id)+' <span class=csub>('+id+')</span>';}).join('<br>')+(r.add>r.sampleAdd.length?('<br>+'+(r.add-r.sampleAdd.length)+' more'):'')+'</div>';
  if(r.change&&r.sampleChange&&r.sampleChange.length)h+='<div class=hint style="margin-top:8px"><b style="color:var(--navy)">Changed ('+r.change+')</b><br>'+r.sampleChange.map(function(c){return (nm[c.agency_id]||c.agency_id)+' — '+c.changed.map(function(f){return IMP_FLAB[f]||f;}).join(', ');}).join('<br>')+(r.change>r.sampleChange.length?('<br>+'+(r.change-r.sampleChange.length)+' more'):'')+'</div>';
  h+='<button class="btn" style="margin-top:10px" onclick="applyImport()">Apply '+(r.add+r.change)+' changes</button>';
  $('#imp').innerHTML=h;
}
async function applyImport(){
  $('#imp').textContent='Applying…';
  var r=await (await fetch('/api/crew/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:IMPROWS})})).json();
  if(r.ok){$('#imp').innerHTML='<span class="cchip ok">Done</span> applied '+r.applied+' ('+r.added+' new, '+r.changed+' changed'+(r.skippedNoStatus?(', '+r.skippedNoStatus+' skipped'):'')+'). <a href="#" onclick="renderData();return false">Reload</a>';IMPROWS=null;}
  else $('#imp').textContent='Import failed.';
}
async function dataOverview(){
  $('#setbody').innerHTML='<div class=muted>Loading…</div>';
  const d=await (await fetch('/api/datastatus')).json();
  let h='<div class=zlabel>Data sources</div><table class=tbl><thead><tr><th>Dataset</th><th>Source</th><th>Records</th></tr></thead><tbody>'
    +d.datasets.map(function(x){return '<tr><td>'+x.name+'</td><td>'+x.source+'</td><td>'+x.count.toLocaleString()+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<div class=zlabel style="margin-top:18px">Recent loads</div>';
  if(!d.log.length)h+='<p class=muted style="text-align:left;padding:8px 2px">No load events recorded yet.</p>';
  else h+='<table class=tbl><thead><tr><th>Source</th><th>Records</th><th>Status</th><th>When</th></tr></thead><tbody>'
    +d.log.map(function(l){return '<tr><td>'+l.source+'</td><td>'+(l.rows||'')+'</td><td><span class="cchip ok">'+l.status+'</span></td><td>'+(l.at||'').slice(0,16).replace('T',' ')+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<p class=muted style="text-align:left;padding:10px 2px">To import a new crew registry, travel workbook, or vessel file, use <b>Upload data</b> in the menu. Bonus baselines stay gated for Rita.</p>';
  $('#setbody').innerHTML=h;
}
let TRV=null,TRV_KIND='',TRVALL=[],TF={q:'',year:'',month:'',cat:'',kind:''};
var TCATS=['air','hotel','medical','visa','food','transport','other'];
var TCATLAB={air:'Air',hotel:'Hotel',medical:'Medical',visa:'Visa',food:'Food',transport:'Transport',other:'Other'};
function usd(n){return n?('$'+Number(n).toLocaleString(undefined,{maximumFractionDigits:0})):'—';}
function usd0(n){return '$'+Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0});}
function pct(a,b){if(b==null||b===0)return null;return (a-b)/b*100;}
function deltaCell(a,b){var d=pct(a,b);if(d==null)return '<span class=muted style="padding:0">—</span>';var up=d>=0;return '<span style="color:'+(up?'var(--red)':'var(--green-d)')+';font-weight:700">'+(up?'▲':'▼')+' '+Math.abs(d).toFixed(0)+'%</span>';}
async function renderTravel(){
  $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2><span class=muted style="padding:0">Loading…</span></div>';
  try{ TRV=await (await fetch('/api/travel')).json(); if(TRV&&TRV.error)throw new Error(TRV.error); }
  catch(e){ $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2></div><div class="card" style="max-width:none"><b>Could not load travel data.</b><button class="btn" style="margin-top:10px" onclick="renderTravel()">Retry</button></div>'; return; }
  TRVALL=TRV.records||[];
  TF={q:'',year:'',month:'',cat:'',kind:''};
  var years=(TRV.years||[]).slice();
  var mn=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2>'
    +'<input id=tq placeholder="filter by name…" oninput="TF.q=this.value;paintTravel()" style="margin-left:auto;width:170px">'
    +'<select id=tyear onchange="TF.year=this.value;paintTravel()"><option value="">All years</option>'+years.map(function(y){return '<option>'+y+'</option>';}).join('')+'</select>'
    +'<select id=tmonth onchange="TF.month=this.value;paintTravel()"><option value="">All months</option>'+mn.slice(1).map(function(m,i){return '<option value="'+(i+1)+'">'+m+'</option>';}).join('')+'</select>'
    +'<select id=tcat onchange="TF.cat=this.value;paintTravel()"><option value="">All categories</option>'+TCATS.map(function(c){return '<option value="'+c+'">'+TCATLAB[c]+'</option>';}).join('')+'</select>'
    +'<select id=tkind onchange="TF.kind=this.value;paintTravel()"><option value="">Crew + shoreside</option><option value="crew">Crew only</option><option value="shoreside">Shoreside only</option></select>'
    +'</div><div id=trbody></div>';
  paintTravel();
}
// Sum a category (or 'total') over rows matching year + month-set, within an already kind/name-scoped list.
function tSum(rows,yr,months,cat){var t=0;for(var i=0;i<rows.length;i++){var r=rows[i];if(r.year!==yr)continue;if(months&&months.indexOf(r.month)<0)continue;t+=cat==='total'?r.total:(r[cat]||0);}return t;}
function paintTravel(){
  var mn=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var q=(TF.q||'').trim().toLowerCase();
  // Analytics scope = kind + name only (cross-year comparison is the whole point).
  var scope=TRVALL.filter(function(r){
    if(TF.kind&&(r.kind||'crew')!==TF.kind)return false;
    if(q&&(r.crew_name||'').toLowerCase().indexOf(q)<0)return false;
    return true;
  });
  var years=Array.from(new Set(scope.map(function(r){return r.year;}))).sort(function(a,b){return b-a;});
  var LY=years[0],PY=years[1];
  var h='';
  // ---- YTD same-period comparison ----
  if(LY){
    var monthsLY=Array.from(new Set(scope.filter(function(r){return r.year===LY;}).map(function(r){return r.month;}))).sort(function(a,b){return a-b;});
    var rangeLab=monthsLY.length?(mn[monthsLY[0]]+'–'+mn[monthsLY[monthsLY.length-1]]):'';
    var ytdLY=tSum(scope,LY,monthsLY,'total'),ytdPY=PY?tSum(scope,PY,monthsLY,'total'):null;
    var d=pct(ytdLY,ytdPY);
    h+='<div class=zlabel>Year-to-date — same period</div>';
    h+='<div class="card" style="max-width:none;border-left:3px solid var(--navy)">'
      +'<div class=csub>YTD '+rangeLab+' · <b style="color:var(--navy)">'+LY+'</b>'+(PY?(' vs '+PY+' (same months)'):' (no prior year on file)')+'</div>'
      +'<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-top:6px">'
      +'<div style="font-family:Outfit;font-size:30px;font-weight:800;color:var(--navy)">'+usd0(ytdLY)+'</div>'
      +(PY?('<div class=csub>'+LY+' vs '+usd0(ytdPY)+' in '+PY+' &nbsp; '+deltaCell(ytdLY,ytdPY)+' &nbsp; ('+(ytdLY-ytdPY>=0?'+':'')+usd0(ytdLY-ytdPY)+')</div>'):'')
      +'</div>';
    // per-category YTD table
    h+='<table class=tbl style="margin-top:12px"><thead><tr><th>Category</th><th style="text-align:right">'+(PY||'prior')+'</th><th style="text-align:right">'+LY+'</th><th style="text-align:right">Δ</th></tr></thead><tbody>';
    TCATS.forEach(function(c){var l=tSum(scope,LY,monthsLY,c),p=PY?tSum(scope,PY,monthsLY,c):null;if(!l&&!p)return;h+='<tr><td>'+TCATLAB[c]+'</td><td style="text-align:right">'+(p==null?'—':usd0(p))+'</td><td style="text-align:right">'+usd0(l)+'</td><td style="text-align:right">'+deltaCell(l,p)+'</td></tr>';});
    h+='<tr style="border-top:2px solid var(--line-2)"><td><b>Total</b></td><td style="text-align:right"><b>'+(ytdPY==null?'—':usd0(ytdPY))+'</b></td><td style="text-align:right"><b>'+usd0(ytdLY)+'</b></td><td style="text-align:right">'+deltaCell(ytdLY,ytdPY)+'</td></tr>';
    h+='</tbody></table></div>';
  }
  // ---- Month-by-month: this year vs last year ----
  if(LY&&PY){
    var monthsAll=Array.from(new Set(scope.filter(function(r){return r.year===LY||r.year===PY;}).map(function(r){return r.month;}))).sort(function(a,b){return a-b;});
    var monthsLYset=Array.from(new Set(scope.filter(function(r){return r.year===LY;}).map(function(r){return r.month;})));
    h+='<div class=zlabel style="margin-top:18px">Month by month — '+LY+' vs '+PY+'</div>';
    h+='<table class=tbl><thead><tr><th>Month</th><th style="text-align:right">'+PY+'</th><th style="text-align:right">'+LY+'</th><th style="text-align:right">Δ</th></tr></thead><tbody>';
    var sumPfull=0,sumLfull=0,sumPsame=0,sumLsame=0;
    monthsAll.forEach(function(m){var p=tSum(scope,PY,[m],'total'),l=tSum(scope,LY,[m],'total');var hasLY=monthsLYset.indexOf(m)>=0;sumPfull+=p;sumLfull+=l;if(hasLY){sumPsame+=p;sumLsame+=l;}
      h+='<tr><td>'+mn[m]+'</td><td style="text-align:right">'+(p?usd0(p):'—')+'</td><td style="text-align:right">'+(hasLY?usd0(l):'<span class=muted style="padding:0">pending</span>')+'</td><td style="text-align:right">'+(hasLY?deltaCell(l,p):'<span class=muted style="padding:0">—</span>')+'</td></tr>';});
    h+='<tr style="border-top:2px solid var(--line-2)"><td><b>Total — same period</b></td><td style="text-align:right"><b>'+usd0(sumPsame)+'</b></td><td style="text-align:right"><b>'+usd0(sumLsame)+'</b></td><td style="text-align:right">'+deltaCell(sumLsame,sumPsame)+'</td></tr>';
    h+='</tbody></table>';
    h+='<p class=hint style="margin-top:6px">'+PY+' full year was '+usd0(sumPfull)+'. The Δ total compares only the months '+LY+' has on file, so it stays apples-to-apples — months '+LY+' hasn\\'t reached (or that aren\\'t uploaded yet) show as "pending", not a 100% drop.</p>';
  }
  // ---- Line-item explorer (respects ALL filters) ----
  var rows=TRVALL.filter(function(r){
    if(TF.kind&&(r.kind||'crew')!==TF.kind)return false;
    if(TF.year&&r.year!==+TF.year)return false;
    if(TF.month&&r.month!==+TF.month)return false;
    if(TF.cat&&!(r[TF.cat]>0))return false;
    if(q&&(r.crew_name||'').toLowerCase().indexOf(q)<0)return false;
    return true;
  });
  var ftot=0,fcat={};TCATS.forEach(function(c){fcat[c]=0;});
  rows.forEach(function(r){ftot+=r.total;TCATS.forEach(function(c){fcat[c]+=r[c]||0;});});
  var topName='—',topVal=0,byp={};rows.forEach(function(r){byp[r.crew_name]=(byp[r.crew_name]||0)+r.total;});
  Object.keys(byp).forEach(function(n){if(byp[n]>topVal){topVal=byp[n];topName=n;}});
  var filtLab=[];if(TF.year)filtLab.push(TF.year);if(TF.month)filtLab.push(mn[+TF.month]);if(TF.cat)filtLab.push(TCATLAB[TF.cat]);if(TF.kind)filtLab.push(TF.kind);if(TF.q)filtLab.push('"'+TF.q+'"');
  h+='<div class=zlabel style="margin-top:18px">Line items'+(filtLab.length?(' · '+filtLab.join(' · ')):'')+'</div>';
  // header totals strip (live)
  h+='<div class=tiles style="grid-template-columns:repeat(4,1fr);margin-bottom:8px">'
    +tile(usd0(ftot),rows.length+' items · total')
    +tile(usd0(fcat.air),'Air ('+(ftot?Math.round(fcat.air/ftot*100):0)+'%)','amber')
    +tile(usd0(fcat.hotel),'Hotel')
    +tile(topName+' · '+usd0(topVal),'Top spender (filtered)')+'</div>';
  h+='<div class=tiles style="grid-template-columns:repeat(5,1fr);margin-bottom:10px">'
    +['medical','visa','food','transport','other'].map(function(c){return tile(usd0(fcat[c]),TCATLAB[c]);}).join('')+'</div>';
  h+='<table class=tbl><thead><tr><th>Yr</th><th>Mo</th><th>Kind</th><th>Leg</th><th>Name</th><th style="text-align:right">Air</th><th style="text-align:right">Hotel</th><th style="text-align:right">Med</th><th style="text-align:right">Visa</th><th style="text-align:right">Food</th><th style="text-align:right">Trans</th><th style="text-align:right">Other</th><th style="text-align:right">Total</th></tr></thead><tbody>'
    +rows.map(function(r){return '<tr><td>'+r.year+'</td><td>'+mn[r.month]+'</td><td>'+(r.kind==='shoreside'?'<span class="cchip amber">shore</span>':'crew')+'</td><td>'+(r.leg==='shoreside'?'—':r.leg)+'</td><td>'+r.crew_name+'</td><td style="text-align:right">'+usd(r.air)+'</td><td style="text-align:right">'+usd(r.hotel)+'</td><td style="text-align:right">'+usd(r.medical)+'</td><td style="text-align:right">'+usd(r.visa)+'</td><td style="text-align:right">'+usd(r.food)+'</td><td style="text-align:right">'+usd(r.transport)+'</td><td style="text-align:right">'+usd(r.other)+'</td><td style="text-align:right"><b>'+usd(r.total)+'</b></td></tr>';}).join('')||'<tr><td colspan=13 class=muted>No line items match these filters.</td></tr>';
  h+='</tbody></table>'
    +'<p class=muted style="text-align:left;padding:10px 2px">YTD compares the same calendar months in each year (apples-to-apples). 2025 is loaded as history; upload newer years in Settings → Data uploads → Travel.</p>';
  document.getElementById('trbody').innerHTML=h;
}
async function loadTravel(){return renderTravel();}
let FLEET=null,FLT={mode:'all',q:''};
async function renderFleet(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  FLEET=await (await fetch('/api/fleet')).json();
  FLT={mode:'all',q:''};
  $('#view').innerHTML='<div class=bar><h2>Fleet</h2><input id=fq placeholder="Search ship, port, region, class, brand…" oninput="FLT.q=this.value;paintFleet()" style="margin-left:auto;width:300px"></div><div id=fleettiles class=tiles></div><div id=fleetbody></div>';
  paintFleet();
}
function paintFleet(){
  var f=FLEET;if(!f)return;
  var inDock=f.inDock||[];
  var isInDock=function(v){var u=(v.name||'').toUpperCase();return inDock.some(function(s){return u.indexOf(String(s).toUpperCase())>=0;});};
  var byBrand={};f.vessels.forEach(function(v){byBrand[v.brand]=(byBrand[v.brand]||0)+1;});
  var ft=function(n,l,cls,mode){return '<div class="tile '+(cls||'')+'" data-fm="'+mode+'" style="cursor:pointer;'+(FLT.mode===mode?'outline:2px solid var(--navy);outline-offset:-2px;':'')+'"><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';};
  document.getElementById('fleettiles').innerHTML=
     ft(f.vessels.length,'All vessels','','all')+ft(byBrand.RCI||0,'Royal','royal','rci')+ft(byBrand.CEL||0,'Celebrity','','cel')
    +ft(inDock.length,'In dry dock now',inDock.length?'red':'green','dock')+ft((f.upcoming||[]).length,'Docks ≤120d','amber','upcoming');
  document.querySelectorAll('#fleettiles .tile[data-fm]').forEach(function(el){el.onclick=function(){var m=el.getAttribute('data-fm');FLT.mode=(FLT.mode===m&&m!=='all')?'all':m;paintFleet();};});
  var q=(FLT.q||'').toLowerCase();
  var vmatch=function(v){
    if(FLT.mode==='rci'&&v.brand!=='RCI')return false;
    if(FLT.mode==='cel'&&v.brand!=='CEL')return false;
    if(FLT.mode==='dock'&&!isInDock(v))return false;
    if(FLT.mode==='upcoming'&&!(f.upcoming||[]).some(function(u){return u.ship===v.name;}))return false;
    if(q){var s=(v.name+' '+v.brand+' '+v.cls+' '+(v.homeport||'')+' '+(v.region||'')).toLowerCase();if(s.indexOf(q)<0)return false;}
    return true;
  };
  var vs=f.vessels.filter(vmatch);
  var ddBadge=function(s){var c=s==='in_dock'?'red':s==='upcoming'?'amber':'ok';var t=s==='in_dock'?'in dock':s;return '<span class="cchip '+c+'">'+t+'</span>';};
  var dd=(f.dryDock||[]).filter(function(d){if(!q)return true;var s=((d.ship||'')+' '+(d.loc||'')).toLowerCase();return s.indexOf(q)>=0;});
  var h='<details open class=ddwrap><summary class="zlabel ddsum" style="cursor:pointer;user-select:none">Dry-dock schedule'+(q?(' · matching "'+FLT.q+'"'):'')+' <span class=csub style="font-weight:600">('+dd.length+')</span></summary>'
    +'<table class=tbl style="margin-top:8px"><thead><tr><th>Ship</th><th>Start</th><th>End</th><th>Location</th><th>Days</th><th>Status</th></tr></thead><tbody>'
    +(dd.length?dd.map(function(d){return '<tr><td>'+d.ship+'</td><td>'+d.start+'</td><td>'+(d.end||'open')+'</td><td>'+d.loc+'</td><td>'+(d.days||'—')+'</td><td>'+ddBadge(d.status)+(d.note?(' <span class=csub>'+d.note+'</span>'):'')+'</td></tr>';}).join(''):'<tr><td colspan=6 class=muted style="padding:10px">No matches.</td></tr>')+'</tbody></table></details>';
  h+='<div class=zlabel style="margin-top:18px">Vessels ('+vs.length+')</div><table class=tbl><thead><tr><th>Ship</th><th>Brand</th><th>Class</th><th>Homeport</th><th>Region</th><th>Lead time</th></tr></thead><tbody>'
    +(vs.length?vs.map(function(v){return '<tr><td>'+v.name+'</td><td>'+v.brand+'</td><td>'+v.cls+'</td><td>'+(v.homeport||'—')+'</td><td>'+(v.region||'—')+'</td><td>'+(v.lead?(v.lead+'d'):'—')+'</td></tr>';}).join(''):'<tr><td colspan=6 class=muted style="padding:10px">No matches.</td></tr>')+'</tbody></table>'
    +'<p class=muted style="text-align:left;padding:10px 2px">Tap a tile to filter the vessel list; search matches ship, port, region, class, brand. Lead time = Miami PO to delivery at ship location.</p>';
  document.getElementById('fleetbody').innerHTML=h;
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
let DRAGID=null,DRAGEL=null,ROT_F='',ROT_BRAND='',ROT_FIND='',ROT_CLOSED={},dragMoved=false,ROT_YEAR='',ROT_MONTHS=[];
function dragStart(el,id){dragMoved=true;DRAGID=id;DRAGEL=el;setTimeout(function(){el.classList.add('dragging');},0);}
function dragEnd(el){el.classList.remove('dragging');document.querySelectorAll('.shipdrop.dragover').forEach(function(z){z.classList.remove('dragover');});}
const BRANDCOL={Royal:'#1E6FD0',Celebrity:'#0C8C8C',Azamara:'#7A5AA8',NCL:'#E0962B'};
function rfTile(n,l,cls,st){return '<div class="tile '+(cls||'')+'" data-rf="'+st+'" style="cursor:pointer;'+((st&&ROT_F===st)?'outline:2px solid var(--navy);outline-offset:-2px;':'')+'"><div class=n>'+(n!=null?n:0)+'</div><div class=l>'+l+'</div></div>';}
function durLabel(a,b){if(!a||!b)return'';var d=Math.round((new Date(b)-new Date(a))/86400000);if(!(d>0))return'';var m=Math.round(d/30);return d+'d'+(m?(' · ~'+m+'mo'):'');}
function rtag(label,on,crew,field){var c=on?'rtag on':'rtag';if(field)return '<span class="'+c+' rtoggle" data-crew="'+crew+'" data-f="'+field+'" data-v="'+(on?1:0)+'" title="click to toggle">'+label+'</span>';return '<span class="'+c+'">'+label+'</span>';}
function rotCard(x){
  var tba='<span style="color:var(--amber);font-weight:700" title="port not set yet">TBA</span>';
  var on=x.signOn?((x.embark?x.embark:tba)+' · ON '+x.signOn):'';
  var off=x.signOff?((x.disembark?x.disembark:tba)+' · OFF '+x.signOff):'';
  var dur=monthsDays(x.signOn,x.signOff)||durLabel(x.signOn,x.signOff);
  var tg='';
  if(x.eccr)tg+='<span class="rtag on">ECCR</span>';
  if(x.air)tg+='<span class="rtag on">AIR</span>';
  if(x.hotel)tg+='<span class="rtag on">HOTEL</span>';
  if(x.onConfirmed)tg+='<span class="rtag on">ON ✓</span>';
  if(x.offConfirmed)tg+='<span class="rtag on">OFF ✓</span>';
  if(x.nextShip)tg+='<span class="rtag">NEXT: '+x.nextShip+'</span>';
  return '<div class="rcard'+(x.current?' cur':'')+'" draggable="true" data-crew="'+x.agency_id+'" data-seq="'+x.seq+'" title="click to edit · drag to reassign" onmousedown="dragMoved=false" ondragstart="dragStart(this,\\''+x.agency_id+'\\')" ondragend="dragEnd(this)" onclick="cardClick(\\''+x.agency_id+'\\','+x.seq+')">'
    +'<div class=rnm>'+x.name+(x.hasNote?' <span class=notedot title="has comment">●</span>':'')+'</div>'
    +'<div class=rleg><i style="background:'+dot(x.status)+'"></i>'+x.status+(x.rank?(' · '+x.rank):'')+(x.contracts?(' · C'+x.contracts):'')+(x.current?' · ONBOARD':'')+'</div>'
    +(on?'<div class=rleg2><i class=ondot></i>'+on+'</div>':'')
    +(off?'<div class=rleg2><i class=offdot></i>'+off+'</div>':'')
    +(dur?'<span class=rdur>'+dur+'</span>':'')
    +(tg?'<div class=rtags>'+tg+'</div>':'')
    +'</div>';
}
function rotShip(sec){
  var col=BRANDCOL[sec.brand]||'#1E6FD0',closed=!!ROT_CLOSED[sec.ship];
  var hist=sec.history||[];
  var body=sec.crew.length?sec.crew.map(rotCard).join(''):'<div class=hint style="opacity:.55;padding:6px">drag crew here</div>';
  var histBlock=hist.length?('<div class="histsec'+(closed?' closed':'')+'"><div class=histhd>Also served this ship · '+hist.length+'</div><div class=histgrid>'+hist.map(histCard).join('')+'</div></div>'):'';
  var meta=sec.brand+' · '+sec.onboard+' onboard · '+sec.crew.length+' current'+(hist.length?(' · '+hist.length+' history'):'');
  return '<div class=shipsec><div class=shiphdr data-toggle="'+sec.ship+'" style="border-left-color:'+col+'"><span class=nm>'+sec.ship+'</span><span class=meta>'+meta+' <span class="arw'+(closed?' closed':'')+'">▾</span></span></div>'
    +'<div class="shipbody shipdrop'+(closed?' closed':'')+'" data-ship="'+sec.ship+'">'+body+'</div>'+histBlock+'</div>';
}
function monthsDays(a,b){
  if(!a||!b)return '';
  var d1=new Date(a),d2=new Date(b);
  if(isNaN(d1)||isNaN(d2)||d2<d1)return '';
  var m=(d2.getFullYear()-d1.getFullYear())*12+(d2.getMonth()-d1.getMonth());
  var d=d2.getDate()-d1.getDate();
  if(d<0){m--;d+=new Date(d2.getFullYear(),d2.getMonth(),0).getDate();}
  if(m<0)return '';
  var parts=[];if(m)parts.push(m+' mo'+(m===1?'':'s'));if(d)parts.push(d+' day'+(d===1?'':'s'));
  return parts.join(' ')||'0 days';
}
function histCard(h){
  var span=(h.on||'')+(h.off&&h.off!==h.on?(' → '+h.off):'');
  var dur=monthsDays(h.on,h.off);
  var durHtml=dur?('<div class=hdur>'+dur+'</div>'):'';
  if(h.ours&&h.sc)return '<div class="hcard ours" data-crew="'+h.sc+'" onclick="openCrew(\\''+h.sc+'\\')"><div class=hnm><span>'+h.name+'</span><span class="htag ours">served</span></div><div class=hspan>'+span+'</div>'+durHtml+'</div>';
  return '<div class="hcard former"><div class=hnm><span>'+h.name+'</span><span class="htag former">former</span></div><div class=hspan>'+span+'</div>'+durHtml+'</div>';
}
function rotExpand(open){if(!ROT)return;(ROT.sections||[]).forEach(function(s){ROT_CLOSED[s.ship]=!open;});drawRotation();}
function cardClick(id,seq){if(dragMoved)return;editContractModal(id,seq);}
async function editContractModal(id,seq){
  var e=null;(ROT.sections||[]).forEach(function(s){s.crew.forEach(function(x){if(x.agency_id===id&&x.seq===seq)e=x;});});
  if(!e)return;
  var d={};try{d=await (await fetch('/api/rotation/crew?id='+encodeURIComponent(id))).json();}catch(_){}
  var note=String((d.ready&&d.ready.note)||'').replace(/</g,'&lt;');
  var ships={};(ROT.sections||[]).forEach(function(s){ships[s.ship]=1;});if(e.ship)ships[e.ship]=1;
  var shipOpts=Object.keys(ships).sort().map(function(s){return '<option'+(s===e.ship?' selected':'')+'>'+s+'</option>';}).join('');
  // The wrapper handles the tap (tgFlip) and the checkbox is pointer-events:none, so a tap can only
  // produce ONE flip — fixes the iPad double-toggle where the box landed back where it started.
  var ck=function(i,lab,on){return '<span style="display:inline-flex;align-items:center;gap:5px;margin:0 14px 6px 0;font-size:13px;cursor:pointer" onclick="tgFlip(\\''+i+'\\')"><input type=checkbox id="'+i+'"'+(on?' checked':'')+' style="pointer-events:none"> '+lab+'</span>';};
  var legs=(d.legs||[]).map(function(l){var off=l.act_off||l.proj_off||'—';return '<tr><td>'+l.seq+'</td><td>'+(l.ship||'—')+'</td><td>'+(l.sign_on||'—')+'</td><td>'+off+'</td></tr>';}).join('');
  var fld=function(lab,inp){return '<div><label class=csub>'+lab+'</label>'+inp+'</div>';};
  var h='<div class=modcard><div class=modhd><div><div class=cname>Edit contract — '+e.name+'</div><div class=csub>'+id+' · contract #'+seq+'</div></div><button class="btn ghost" onclick="closeRotModal()">Close ✕</button></div>'
   +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">'
   +fld('Embark city','<input id=eEmb value="'+(e.embark||'')+'" style="width:100%">')
   +fld('Disembark city','<input id=eDis value="'+(e.disembark||'')+'" style="width:100%">')
   +fld('Sign-on','<input id=eOn type=date value="'+(e.signOn||'')+'" style="width:100%">')
   +fld('Sign-off','<input id=eOff type=date value="'+(e.signOff||'')+'" style="width:100%">')
   +'<div style="grid-column:1/3">'+fld('Ship','<select id=eShip style="width:100%">'+shipOpts+'</select>')+'</div>'
   +'</div>'
   +'<div class=zlabel style="margin-top:12px">Confirmed — shows as green tags on the card</div>'
   +'<div style="margin:6px 0 8px">'+ck('cEccr','ECCR',e.eccr)+ck('cAir','AIR',e.air)+ck('cHotel','HOTEL',e.hotel)+ck('cOn','ON DATE',e.onConfirmed)+ck('cOff','OFF DATE',e.offConfirmed)+'</div>'
   +'<div class=zlabel>Comment</div><textarea id=cmt rows=2 style="width:100%" placeholder="Note for this crew…">'+note+'</textarea>'
   +(legs?'<div class=zlabel style="margin-top:12px">Contract history</div><table class=tbl><thead><tr><th>#</th><th>Ship</th><th>On</th><th>Off</th></tr></thead><tbody>'+legs+'</tbody></table>':'')
   +'<div style="margin-top:12px;text-align:right"><span id=cmtmsg class=csub style="margin-right:8px"></span><button class="btn ghost" onclick="closeRotModal()">Cancel</button> <button class="btn green" onclick="saveContract(\\''+id+'\\','+seq+')">Save</button></div></div>';
  var w=document.createElement('div');w.id='rotmodal';w.className='modwrap';w.innerHTML=h;
  w.onclick=function(ev){if(ev.target===w)closeRotModal();};
  document.body.appendChild(w);
}
async function saveContract(id,seq){
  var g=function(x){return document.getElementById(x);};
  if(g('eOn').value&&g('eOff').value&&g('eOff').value<g('eOn').value){g('cmtmsg').textContent='Sign-off is before sign-on.';return;}
  g('cmtmsg').textContent='Saving…';
  var body={sc:id,seq:seq,embark:g('eEmb').value,disembark:g('eDis').value,sign_on:g('eOn').value,sign_off:g('eOff').value,ship:g('eShip').value,eccr:g('cEccr').checked,air:g('cAir').checked,hotel:g('cHotel').checked,on_conf:g('cOn').checked,off_conf:g('cOff').checked};
  try{
    await fetch('/api/rotation/contract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    await fetch('/api/rotation/note',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,note:g('cmt').value})});
    closeRotModal();renderRotation();
  }catch(e){g('cmtmsg').textContent='Failed to save.';}
}
function closeRotModal(){var m=document.getElementById('rotmodal');if(m)m.remove();}
function rmTag(label,field,on,id){return '<span class="rtag rtoggle'+(on?' on':'')+'" data-crew="'+id+'" data-f="'+field+'" data-v="'+(on?1:0)+'" onclick="rmToggle(this)">'+label+'</span>';}
function rmToggle(el){var nv=el.getAttribute('data-v')==='1'?0:1;el.setAttribute('data-v',nv);el.classList.toggle('on',!!nv);fetch('/api/rotation/ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:el.getAttribute('data-crew'),field:el.getAttribute('data-f'),value:nv})});}
async function saveNote(id){
  var t=document.getElementById('cmt').value;document.getElementById('cmtmsg').textContent='Saving…';
  try{var r=await (await fetch('/api/rotation/note',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,note:t})})).json();document.getElementById('cmtmsg').textContent=r.ok?'Saved ✓':'Failed';}catch(e){document.getElementById('cmtmsg').textContent='Failed';}
}
async function renderRotation(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  ROT=await (await fetch('/api/rotation')).json();
  ROT_F='';ROT_BRAND='';ROT_FIND='';ROT_CLOSED={__POOL__:true};ROT_MONTHS=[];
  var yrs={};(ROT.sections||[]).forEach(function(s){s.crew.forEach(function(x){if(x.signOn)yrs[x.signOn.slice(0,4)]=1;if(x.signOff)yrs[x.signOff.slice(0,4)]=1;});});
  var yopts='<option value="">All years</option>'+Object.keys(yrs).sort().reverse().map(function(y){return '<option'+(ROT_YEAR===y?' selected':'')+'>'+y+'</option>';}).join('');
  $('#view').innerHTML='<style>'
    +'.rcard{transition:transform .16s ease,box-shadow .16s ease,opacity .18s ease}'
    +'.rcard:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(20,45,72,.12)}'
    +'.rcard.dragging{opacity:.45;transform:scale(.97)}'
    +'.rcard.landing{animation:rland .26s ease}'
    +'@keyframes rland{0%{transform:scale(.92);opacity:.4}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}'
    +'.shipdrop{transition:background .15s ease,box-shadow .15s ease}'
    +'.shipdrop.dragover{background:rgba(95,185,70,.08);box-shadow:inset 0 0 0 2px var(--green);border-radius:10px}'
    +'.shipbody{transition:max-height .2s ease}'
    +'</style>'
    +'<div class=zlabel>Keyman — each ship shows its full crew history (onboard first). Click a card for detail + comment; drag to reassign.</div>'
    +'<div class=bar style="margin-bottom:8px;flex-wrap:wrap"><input id=rfind placeholder="find ship…" oninput="ROT_FIND=this.value;drawRotation()" style="width:170px">'
    +'<select id=ryear onchange="ROT_YEAR=this.value;drawRotation()">'+yopts+'</select>'
    +'<select id=rbrand onchange="ROT_BRAND=this.value;drawRotation()"><option value="">All cruise lines</option><option value="Royal">Royal Caribbean</option><option value="Celebrity">Celebrity</option><option value="Azamara">Azamara</option></select>'
    +'<button class="btn ghost" onclick="rotExpand(true)">Expand all</button><button class="btn ghost" onclick="rotExpand(false)">Collapse all</button>'
    +'<button class="btn" style="margin-left:auto" onclick="exportDaysExcel()" title="Days worked this month, per crew, for customer billing">Bill this month (Excel)</button></div>'
    +'<div id=rotchips style="margin-bottom:10px"></div><div id=rotbody></div>';
  drawRotation();
}
function rmonthChips(){
  var mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var h='<span class="chip'+(ROT_MONTHS.length?'':' on')+'" data-m="all">All months</span> ';
  for(var i=1;i<=12;i++)h+='<span class="chip'+(ROT_MONTHS.indexOf(i)>=0?' on':'')+'" data-m="'+i+'">'+mn[i-1]+'</span> ';
  document.getElementById('rotchips').innerHTML=h;
  document.querySelectorAll('#rotchips .chip').forEach(function(el){el.onclick=function(){var m=el.getAttribute('data-m');if(m==='all'){ROT_MONTHS=[];}else{m=+m;var k=ROT_MONTHS.indexOf(m);if(k>=0)ROT_MONTHS.splice(k,1);else ROT_MONTHS.push(m);}rmonthChips();drawRotation();};});
}
// True if a leg [signOn..signOff] overlaps the selected year and any selected month.
function legInFilter(x){
  if(!ROT_YEAR&&!ROT_MONTHS.length)return true;
  var on=x.signOn?new Date(x.signOn):null, off=x.signOff?new Date(x.signOff):on;
  if(!on)return false;
  if(ROT_YEAR){var y=+ROT_YEAR;if(!(on.getFullYear()<=y&&(off||on).getFullYear()>=y))return false;}
  if(ROT_MONTHS.length){
    var yr=ROT_YEAR?+ROT_YEAR:on.getFullYear();
    var hit=ROT_MONTHS.some(function(m){var a=new Date(yr,m-1,1),b=new Date(yr,m,0);return on<=b&&(off||on)>=a;});
    if(!hit)return false;
  }
  return true;
}
function drawRotation(){
  var b=ROT,c=b.counts;
  if(document.getElementById('rotchips'))rmonthChips();
  var sfilt=function(arr){return (arr||[]).filter(function(x){return (!ROT_F||x.status===ROT_F)&&legInFilter(x);});};
  var h='<div class=tiles>'+rfTile(c['On board'],'On board','green','On board')+rfTile(c['On Vacation'],'On vacation','amber','On Vacation')
    +rfTile(c['Earmarked'],'Earmarked','royal','Earmarked')+rfTile(c['Inactive'],'Inactive','gray','Inactive')+rfTile(c.vessels,'Vessels — show all','','')+'</div>';
  var shore=(b.shoreside||[]);
  if(shore.length){var hclosed=ROT_CLOSED['__SHORE__']!==false;
    h+='<div class=shipsec style="margin-top:4px"><div class=shiphdr data-toggle="__SHORE__" style="border-left-color:#7c879a"><span class=nm>Shoreside team</span><span class=meta>DG3 staff · not seafarers · '+shore.length+' <span class="arw'+(hclosed?' closed':'')+'">▾</span></span></div>'
     +'<div class="shipbody'+(hclosed?' closed':'')+'">'+shore.map(rotCard).join('')+'</div></div>';}
  var pool=sfilt(b.pool||[]);
  if(pool.length){var pclosed=!!ROT_CLOSED['__POOL__'];
    h+='<div class=shipsec style="margin-top:4px"><div class=shiphdr data-toggle="__POOL__" style="border-left-color:#9aa7b6"><span class=nm>Unassigned pool</span><span class=meta>active · no ship assigned · '+pool.length+' crew <span class="arw'+(pclosed?' closed':'')+'">▾</span></span></div>'
     +'<div class="shipbody shipdrop'+(pclosed?' closed':'')+'" data-ship="__POOL__">'+pool.map(rotCard).join('')+'</div></div>';}
  var secs=(b.sections||[]).slice();
  if(ROT_BRAND)secs=secs.filter(function(s){return s.brand===ROT_BRAND;});
  if(ROT_FIND){var q=ROT_FIND.toLowerCase();secs=secs.filter(function(s){return s.ship.toLowerCase().indexOf(q)>=0;});}
  secs=secs.map(function(s){return {ship:s.ship,brand:s.brand,onboard:s.onboard,crew:sfilt(s.crew),history:s.history};});
  if(ROT_F)secs=secs.filter(function(s){return s.crew.length>0;});
  h+='<div class=zlabel style="margin-top:14px">Ships ('+secs.length+')</div>'+(secs.length?secs.map(rotShip).join(''):'<div class=muted style="padding:10px">No ships match.</div>');
  document.getElementById('rotbody').innerHTML=h;
  document.querySelectorAll('#rotbody .tile[data-rf]').forEach(function(el){el.onclick=function(){var s=el.getAttribute('data-rf');ROT_F=(s===''||ROT_F===s)?'':s;drawRotation();};});
  document.querySelectorAll('#rotbody [data-toggle]').forEach(function(el){el.onclick=function(){var s=el.getAttribute('data-toggle');ROT_CLOSED[s]=!ROT_CLOSED[s];drawRotation();};});
  document.querySelectorAll('#rotbody .rtoggle').forEach(function(el){el.onclick=function(e){e.stopPropagation();var nv=el.getAttribute('data-v')==='1'?0:1;el.setAttribute('data-v',nv);el.classList.toggle('on',!!nv);fetch('/api/rotation/ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:el.getAttribute('data-crew'),field:el.getAttribute('data-f'),value:nv})});};});
  document.querySelectorAll('#rotbody .shipdrop').forEach(function(z){
    z.ondragover=function(e){e.preventDefault();z.classList.add('dragover');};
    z.ondragleave=function(){z.classList.remove('dragover');};
    z.ondrop=function(e){e.preventDefault();z.classList.remove('dragover');
      var ship=z.getAttribute('data-ship');
      // Optimistic, animated move: drop the card into the target ship immediately (no full-board flash).
      if(DRAGEL&&DRAGEL.parentNode!==z){var el=DRAGEL;el.classList.add('landing');z.appendChild(el);setTimeout(function(){el.classList.remove('landing');},260);}
      assignCrew(DRAGID,ship);
    };
  });
}
async function exportDaysExcel(){
  try{
    // Days actually WORKED this month by crew active in Keyman now (from the live board roster),
    // so accounting can bill the customer. The server scopes to [1st-of-month -> today].
    var d=await (await fetch('/api/billing/month')).json();
    var T=d.totals||{};var from=d.from||'';var to=d.to||'';
    var monthLabel=new Date((d.month||'')+'-01T00:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
    var rows=[
      ['DAYS WORKED FOR BILLING — '+monthLabel],
      ['Period (month-to-date):',from+' to '+to],
      ['Crew active this month:',(T.crew||0),'Total sea-days:',(T.days||0)],
      [],
      ['BY CREW — for customer billing'],
      ['Crew','Agency ID','Vessel','Customer','Status','Sign-on','Days worked']
    ];
    (d.perCrew||[]).forEach(function(c){rows.push([c.name,c.sc,c.ship||'',c.client||'',c.status||'',c.signOn||'',c.days]);});
    rows.push([]);rows.push(['BY VESSEL / CUSTOMER']);rows.push(['Vessel','Customer','Crew','Days']);
    (d.perVessel||[]).forEach(function(v){rows.push([v.ship,v.client||'',v.crew,v.days]);});
    var csv=rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?('"'+x.replace(/"/g,'""')+'"'):x;}).join(',');}).join('\\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='days-worked_'+from.slice(0,7)+'.csv';a.click();
  }catch(e){alert('Could not export days worked.');}
}
async function assignCrew(id,ship){
  if(!id)return; DRAGID=null; DRAGEL=null;
  try{
    var r=await (await fetch('/api/rotation/assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,ship:ship})})).json();
    // Success: keep the optimistic card placement (no jarring full re-render). Reconciles on next load.
    if(!r||!r.ok)renderRotation();
  }catch(e){renderRotation();}
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
/* ---- hand-rolled inline-SVG charts (no CDN dependency) ---- */
function donutSVG(segs){
  var cx=90,cy=90,r=72,ir=46,total=segs.reduce(function(a,b){return a+(b.value||0);},0)||1,ang=-Math.PI/2,out='';
  segs.forEach(function(s){var v=s.value||0;if(v<=0)return;var a2=ang+v/total*Math.PI*2;
    var x1=cx+r*Math.cos(ang),y1=cy+r*Math.sin(ang),x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2);
    var xi2=cx+ir*Math.cos(a2),yi2=cy+ir*Math.sin(a2),xi1=cx+ir*Math.cos(ang),yi1=cy+ir*Math.sin(ang);
    var lg=(a2-ang)>Math.PI?1:0;
    out+='<path d="M'+x1.toFixed(1)+' '+y1.toFixed(1)+' A'+r+' '+r+' 0 '+lg+' 1 '+x2.toFixed(1)+' '+y2.toFixed(1)+' L'+xi2.toFixed(1)+' '+yi2.toFixed(1)+' A'+ir+' '+ir+' 0 '+lg+' 0 '+xi1.toFixed(1)+' '+yi1.toFixed(1)+' Z" fill="'+s.color+'"></path>';
    ang=a2;});
  return '<svg viewBox="0 0 180 180" width="158" height="158">'+out+'<text x="90" y="86" text-anchor="middle" font-size="28" font-weight="800" fill="#1B3A5C" font-family="Outfit">'+total+'</text><text x="90" y="104" text-anchor="middle" font-size="10" fill="#6B7C93">crew</text></svg>';
}
function barSVG(items){
  var max=items.reduce(function(a,b){return Math.max(a,b.value||0);},0)||1,w=260,bh=24,gap=11,h=items.length*(bh+gap),out='';
  items.forEach(function(it,i){var y=i*(bh+gap),bw=Math.max(2,(it.value||0)/max*(w-130));
    out+='<text x="0" y="'+(y+16)+'" font-size="11" fill="#42526a" font-family="DM Sans">'+it.label+'</text>';
    out+='<rect x="92" y="'+y+'" width="'+bw.toFixed(1)+'" height="'+bh+'" rx="5" fill="'+(it.color||'#1E6FD0')+'"></rect>';
    out+='<text x="'+(96+bw).toFixed(1)+'" y="'+(y+16)+'" font-size="11" font-weight="700" fill="#1B3A5C">'+(it.value||0)+'</text>';});
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'">'+out+'</svg>';
}
function lineSVG(pts){
  if(!pts.length)return '<div class=muted style="padding:16px">No data on file.</div>';
  var w=320,h=130,pad=26,max=pts.reduce(function(a,b){return Math.max(a,b.y||0);},0)||1,n=pts.length,dx=(w-pad*2)/Math.max(1,n-1);
  var co=pts.map(function(p,i){return [pad+i*dx,h-pad-(p.y/max)*(h-pad*2)];});
  var path=co.map(function(c,i){return (i?'L':'M')+c[0].toFixed(1)+' '+c[1].toFixed(1);}).join(' ');
  var area=path+' L'+co[n-1][0].toFixed(1)+' '+(h-pad)+' L'+co[0][0].toFixed(1)+' '+(h-pad)+' Z';
  var dots=co.map(function(c){return '<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="2.6" fill="#1E6FD0"></circle>';}).join('');
  var labs=pts.map(function(p,i){return '<text x="'+co[i][0].toFixed(1)+'" y="'+(h-7)+'" text-anchor="middle" font-size="8" fill="#6B7C93">'+p.x+'</text>';}).join('');
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'"><path d="'+area+'" fill="rgba(30,111,208,.12)"></path><path d="'+path+'" fill="none" stroke="#1E6FD0" stroke-width="2"></path>'+dots+labs+'</svg>';
}
function legendH(segs){return '<div class=legend>'+segs.filter(function(s){return (s.value||0)>0;}).map(function(s){return '<span><i style="background:'+s.color+'"></i>'+s.label+' '+s.value+'</span>';}).join('')+'</div>';}
var DASH=null,DASH_SH=false;
async function renderDashboard(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  var d;try{d=await (await fetch('/api/dashboard')).json();}catch(e){$('#view').innerHTML='<div class=muted>Could not load. <button class="btn ghost" onclick="renderDashboard()">Retry</button></div>';return;}
  DASH=d;var w=d.workforce,c=d.compliance,bd=d.birthdays||[],bz=d.bonus||{},mn=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var statusSegs=[{label:'On board',value:w.on_board,color:'#5FB946'},{label:'On vacation',value:w.on_vacation,color:'#B0741A'},{label:'Earmarked',value:w.earmarked,color:'#1E6FD0'}];
  var bc=w.byClient||{},clientSegs=[{label:'Royal Caribbean',value:bc['Royal Caribbean']||0,color:'#1E6FD0'},{label:'Celebrity',value:bc['Celebrity']||0,color:'#0C8C8C'},{label:'Azamara',value:bc['Azamara']||0,color:'#7A5AA8'},{label:'NCL',value:bc['NCL']||0,color:'#E0962B'}];
  var compBars=[{label:'Medical',value:c.med_exp_90,color:'#BC3B2C'},{label:'Seaman bk',value:c.sirb_exp_90,color:'#B0741A'},{label:'Passport',value:c.pp_exp_90,color:'#B0741A'},{label:'US visa',value:c.usv_exp_90,color:'#B0741A'},{label:'Schengen',value:c.sch_exp_90,color:'#7A5AA8'}];
  var compTot=compBars.reduce(function(a,b){return a+(b.value||0);},0);
  var h='<div class=bar><h2>Operational dashboard</h2><span class=csub style="margin-left:auto">as of '+d.today+' · '+w.total+' crew</span></div>';
  if(bd.length)h+='<div class="card" style="max-width:none;border-left:3px solid var(--green);margin:0 0 14px"><b style="color:var(--green-d)">🎂 Birthday today:</b> '+bd.map(function(b){return b.name+(b.vessel?(' · '+b.vessel):'');}).join(' &nbsp;•&nbsp; ')+'</div>';
  // ZONE 1 — WORKFORCE
  h+='<div class=zlabel>Workforce</div><div class=dzone>'
   +'<div class="panel center"><h3>Status mix</h3>'+donutSVG(statusSegs)+legendH(statusSegs)+'</div>'
   +'<div class="panel center"><h3>By client</h3>'+donutSVG(clientSegs)+legendH(clientSegs)+'</div>'
   +'<div class=panel><h3>At a glance</h3><div class=tiles style="grid-template-columns:1fr 1fr">'
     +tile(w.total,'Total crew','','crew')+tile(w.vessels,'Vessels','','fleet')
     +tile(w.inactive,'Inactive','gray','crew')+tile((d.dryDockNow||0),'In dry dock',(d.dryDockNow?'red':'green'),'fleet')
   +'</div></div></div>';
  // ZONE 2 — COMPLIANCE
  h+='<div class=zlabel>Compliance — documents expiring within 90 days</div><div class=dzone>'
   +'<div class="panel" style="grid-column:span 2"><h3>Expiring documents by type</h3>'+(compTot?barSVG(compBars):'<div class=muted style="padding:16px">All documents valid beyond 90 days.</div>')+'</div>'
   +'<div class=panel><h3>Action needed</h3><div class=tiles style="grid-template-columns:1fr 1fr">'
     +tile(compTot,'Total flagged',(compTot?'amber':'green'),'compliance')+tile(c.med_exp_90,'Medical','red','compliance')
   +'</div><p class=hint style="margin-top:10px">Open the Compliance tab for the crew list and CSV export.</p></div></div>';
  // ZONE 3 — COST & BONUS
  h+='<div class=zlabel>Cost &amp; bonus</div><div class=dzone>'
   +'<div class=panel style="grid-column:span 2"><h3>Travel spend by month'+(d.travel&&d.travel.year?(' · '+d.travel.year):'')+' <button class="btn ghost" id=shtog style="float:right;padding:2px 10px;font-size:11px">'+(DASH_SH?'Show shoreside':'Hide shoreside')+'</button></h3><div id=trvline></div><div id=trvmom class=csub style="margin-top:4px"></div></div>'
   +'<div class=panel><h3>Budget &amp; bonus</h3><div id=trv class=tiles style="grid-template-columns:1fr 1fr"></div>'
     +'<div class=tiles style="grid-template-columns:1fr 1fr;margin-top:10px">'+tile(d.history.contracts,'Contracts on file','','billing')+tile(d.history.days.toLocaleString(),'Sea-days','','billing')+'</div>'
     +'<div class=tiles style="grid-template-columns:1fr;margin-top:10px">'+tile('$'+Number(bz.pay||0).toLocaleString(),(bz.committed||0)+' bonus(es) committed','green','bonus')+'</div>'
   +'</div></div>'
   +'<p class=muted style="text-align:left;padding:10px 2px">Live from Cloudflare D1 · tip: tiles are clickable</p>';
  $('#view').innerHTML=h;
  document.querySelectorAll('#view .tile[data-go]').forEach(function(el){el.onclick=function(){show(el.getAttribute('data-go'));};});
  var bt=document.getElementById('shtog');if(bt)bt.onclick=function(){DASH_SH=!DASH_SH;paintDashCost();};
  paintDashCost();
}
function paintDashCost(){
  var d=DASH;if(!d)return;var tv=d.travel||{},mn=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var bt=document.getElementById('shtog');if(bt)bt.textContent=DASH_SH?'Show shoreside':'Hide shoreside';
  // line: total spend by month (shoreside is annual-only in source, so the toggle adjusts headline tiles)
  var ms=tv.months||[],lineEl=document.getElementById('trvline');
  if(lineEl)lineEl.innerHTML=lineSVG(ms.map(function(x){return {x:mn[x.m],y:x.t};}));
  var momEl=document.getElementById('trvmom');
  if(momEl&&ms.length){var last=ms[ms.length-1],prev=ms.length>1?ms[ms.length-2]:null;var mom=(prev&&prev.t)?((last.t-prev.t)/prev.t*100):null;var arrow=mom==null?'':(mom>=0?'▲':'▼');var col=mom==null?'var(--mut)':(mom>=0?'var(--red)':'var(--green-d)');var air=tv.air||0,share=tv.all?Math.round(air/tv.all*100):0;
    momEl.innerHTML='Latest: <b style="color:var(--navy)">'+mn[last.m]+'</b> $'+Math.round(last.t).toLocaleString()+(mom!=null?(' · <span style="color:'+col+'">'+arrow+' '+Math.abs(mom).toFixed(0)+'% vs '+mn[prev.m]+'</span>'):'')+' · air '+share+'% of spend';}
  var trv=document.getElementById('trv');if(trv){var head=DASH_SH?tv.crew:tv.all,lab=DASH_SH?'Crew only':'Total (incl. shore)';
    trv.innerHTML=tile('$'+Number(head||0).toLocaleString(),lab,'','travel')+tile('$'+Number(tv.shoreside||0).toLocaleString(),'Shoreside','amber','travel');
    trv.querySelectorAll('.tile[data-go]').forEach(function(x){x.onclick=function(){show(x.getAttribute('data-go'));};});}
}
function tile(n,l,cls,go){return '<div class="tile '+(cls||'')+'"'+(go?(' data-go="'+go+'" style="cursor:pointer"'):'')+'><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';}
function crewTile(n,l,cls,st){return '<div class="tile '+(cls||'')+'" data-st="'+st+'" style="cursor:pointer"><div class=n>'+(n!=null?n:'—')+'</div><div class=l>'+l+'</div></div>';}
var CF={q:'',status:'',comp:'',client:'',ship:'',sort:'az'};
var CLIENT_COL={'Royal Caribbean':'#1E6FD0','Celebrity':'#0C8C8C','Azamara':'#7A5AA8','NCL':'#E0962B'};
function ageOf(dob){if(!dob)return'';var d=new Date(dob);if(isNaN(d))return'';var t=new Date(),a=t.getFullYear()-d.getFullYear();if(t.getMonth()<d.getMonth()||(t.getMonth()===d.getMonth()&&t.getDate()<d.getDate()))a--;return a>0&&a<100?a:'';}
function fmtPhone(p){if(!p)return{txt:'',bad:false};var raw=String(p).replace(/[^0-9+]/g,'');var ok=/^\\+?63\\d{10}$/.test(raw)||/^09\\d{9}$/.test(raw);return{txt:String(p).trim(),bad:!ok};}
function rankShort(c){return (c!=null&&c>=1)?'PS':'Jr PS';}
// Rank tag from the REGISTRY rank string (AdvancedQuery: 'Printer Specialist' / 'Junior Printer
// Specialist'), falling back to count only if no registry rank. Fixes everyone showing 'Jr PS'.
function rankTag(r,c){var s=String(r||'').toLowerCase();if(s.indexOf('junior')>=0||s.indexOf('jr')>=0)return 'Jr PS';if(s.indexOf('printer')>=0||s.indexOf('special')>=0||s===' ps'||s==='ps')return 'PS';return rankShort(c);}
function docFlag(exp){if(!exp)return'missing';var days=(new Date(exp)-new Date())/86400000;if(days<0)return'expired';if(days<=90)return'90d';return'ok';}
function crewMatchesComp(c){
  if(c.status==='Inactive')return false;
  var f=CF.comp;
  if(f==='expired')return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){var g=docFlag(c[k]);return g==='expired'||g==='missing';});
  if(f==='soon')return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){return docFlag(c[k])==='90d';});
  if(f==='schengen'){if(!c.sch_exp)return false;var g=docFlag(c.sch_exp);return g==='expired'||g==='90d';}
  return true;
}
async function renderCrew(){
  CREW=[];CF.q='';CF.status='';CF.comp='';CF.client='';CF.ship='';CF.sort='az';
  $('#view').innerHTML='<div class=muted>Loading crew…</div>';
  try{var r=await (await fetch('/api/crew')).json();CREW=r.crew||[];}catch(e){$('#view').innerHTML='<div class=muted>Could not load crew. <button class="btn ghost" onclick="renderCrew()">Retry</button></div>';return;}
  var clients=Array.from(new Set(CREW.map(function(c){return c.client;}).filter(Boolean))).sort();
  $('#view').innerHTML=
   '<div class=bar><h2>Crew</h2>'
   +'<div class=search style="margin-left:auto"><input id=q placeholder="name, crew ID, or passport" oninput="CF.q=this.value;paintCrew()" style="width:230px"></div>'
   +'<select id=cClient onchange="CF.client=this.value;CF.ship=\\'\\';crewShipOpts();paintCrew()"><option value="">All clients</option>'+clients.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select>'
   +'<select id=cShip onchange="CF.ship=this.value;paintCrew()"><option value="">All ships</option></select>'
   +'<select id=cSort onchange="CF.sort=this.value;paintCrew()"><option value="az">Sort: name A–Z</option><option value="soon">Sort: sign-off soonest</option><option value="tenure">Sort: contracts (high→low)</option><option value="ship">Sort: ship</option></select>'
   +'<button class="btn ghost" onclick="clearCrewFilters()">Clear</button>'
   +'<button class="btn ghost" id=intelReviewBtn onclick="openIntelReview()">Review intel</button>'
   +'<button class="btn green" onclick="addCrewModal()">+ Add crew</button>'
   +'</div><div class=tiles id=crewtiles></div>'
   +'<div id=crewcount class=csub style="margin:8px 0 12px"></div><div id=crewgrid class=grid></div>';
  crewShipOpts();paintCrew();intelReviewCount();
}
async function intelReviewCount(){
  try{var r=await (await fetch('/api/intel/review')).json();var b=document.getElementById('intelReviewBtn');if(b)b.innerHTML='Review intel'+(r.count?(' <span class=vchip>'+r.count+'</span>'):'');}catch(e){}
}
async function openIntelReview(){
  var w=document.createElement('div');w.id='intelmodal';w.className='modwrap';
  w.innerHTML='<div class=modcard><div class=modhd><div><div class=cname>Field intel — needs review</div><div class=csub>Emails the matcher could not confidently attribute. Assign to a crew, or discard.</div></div><button class="btn ghost" onclick="closeIntelReview()">Close ✕</button></div><div id=intelrev style="margin-top:12px"><div class=muted style="padding:14px">Loading…</div></div></div>';
  w.onclick=function(e){if(e.target===w)closeIntelReview();};document.body.appendChild(w);loadIntelReview();
}
function closeIntelReview(){var w=document.getElementById('intelmodal');if(w)w.remove();}
async function loadIntelReview(){
  var box=document.getElementById('intelrev');if(!box)return;
  var r;try{r=await (await fetch('/api/intel/review')).json();}catch(e){box.innerHTML='<div class=muted style="padding:14px">Could not load.</div>';return;}
  var ps=r.pending||[];
  if(!ps.length){box.innerHTML='<div class=muted style="padding:14px">Nothing to review — all clear.</div>';return;}
  box.innerHTML=ps.map(function(p){
    var cands=(p.candidates||[]).map(function(c){return '<button class="btn green" style="padding:6px 10px;font-size:12px;margin:2px" onclick="intelAssign(\\''+p.id+'\\',\\''+c.agency_id+'\\')">→ '+String(c.name).replace(/</g,'&lt;')+'</button>';}).join('');
    return '<div class=noteitem><div class=notemeta>'+(p.reporter?(String(p.reporter).replace(/</g,'&lt;')+' · '):'')+'<span class=cchip>'+p.confidence+' match</span></div><div class=notetext>'+String(p.summary||'').replace(/</g,'&lt;').replace(/\\n/g,'<br>')+'</div><div style="margin-top:6px">'+(cands||'<span class=hint>No candidate names found. </span>')+' <button class="btn ghost" style="padding:6px 10px;font-size:12px;margin:2px" onclick="intelDiscard(\\''+p.id+'\\')">Discard</button></div></div>';
  }).join('');
}
async function intelAssign(id,aid){
  try{await fetch('/api/intel/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,agency_id:aid})});}catch(e){}
  loadIntelReview();intelReviewCount();
}
async function intelDiscard(id){
  if(!confirm('Discard this note?'))return;
  try{await fetch('/api/intel/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,discard:true})});}catch(e){}
  loadIntelReview();intelReviewCount();
}
function crewShipOpts(){
  var sel=document.getElementById('cShip');if(!sel)return;
  var ships=Array.from(new Set(CREW.filter(function(c){return !CF.client||c.client===CF.client;}).map(function(c){return c.vessel_observed;}).filter(Boolean))).sort();
  sel.innerHTML='<option value="">All ships</option>'+ships.map(function(s){return '<option'+(s===CF.ship?' selected':'')+'>'+s+'</option>';}).join('');
}
function clearCrewFilters(){CF.q='';CF.status='';CF.comp='';CF.client='';CF.ship='';CF.sort='az';renderCrew();}
function crewTiles(){
  var on=CREW.filter(function(c){return c.status==='On board';}).length;
  var vac=CREW.filter(function(c){return c.status==='On Vacation';}).length;
  var ear=CREW.filter(function(c){return c.status==='Earmarked';}).length;
  var ina=CREW.filter(function(c){return c.status==='Inactive';}).length;
  var act=CREW.filter(function(c){return c.status!=='Inactive';});
  var exp=act.filter(function(c){return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){var g=docFlag(c[k]);return g==='expired'||g==='missing';});}).length;
  var soon=act.filter(function(c){return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){return docFlag(c[k])==='90d';});}).length;
  var sch=act.filter(function(c){return c.sch_exp&&['expired','90d'].indexOf(docFlag(c.sch_exp))>=0;}).length;
  function t(n,l,cls,kind,key){var onx=(kind==='st'?CF.status:CF.comp)===key&&key!=='';return '<div class="tile '+(cls||'')+(onx?' on':'')+'" data-kind="'+kind+'" data-key="'+key+'" style="cursor:pointer"><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';}
  return t(CREW.length,'All crew','','st','')+t(on,'On board','green','st','On board')+t(vac,'On vacation','amber','st','On Vacation')+t(ear,'Earmarked','royal','st','Earmarked')+t(ina,'Inactive','gray','st','Inactive')
   +t(exp,'Docs expired/missing','red','comp','expired')+t(soon,'Docs ≤90 days','amber','comp','soon')+t(sch,'Schengen expiring','amber','comp','schengen');
}
function paintCrew(){
  document.getElementById('crewtiles').innerHTML=crewTiles();
  document.querySelectorAll('#crewtiles .tile[data-kind]').forEach(function(el){el.onclick=function(){
    var k=el.getAttribute('data-kind'),key=el.getAttribute('data-key');
    if(k==='st'){CF.status=(CF.status===key)?'':key;CF.comp='';}else{CF.comp=(CF.comp===key)?'':key;CF.status='';}
    paintCrew();
  };});
  var q=CF.q.trim().toLowerCase();
  var list=CREW.filter(function(c){
    if(CF.status&&c.status!==CF.status)return false;
    if(CF.comp&&!crewMatchesComp(c))return false;
    if(CF.client&&c.client!==CF.client)return false;
    if(CF.ship&&c.vessel_observed!==CF.ship)return false;
    if(q){var hay=((c.first_name||'')+' '+(c.last_name||'')+' '+(c.agency_id||'')+' '+(c.pp_no||'')).toLowerCase();if(hay.indexOf(q)<0)return false;}
    return true;
  });
  list.sort(function(a,b){
    if(CF.sort==='tenure')return (b.contract_count||0)-(a.contract_count||0);
    if(CF.sort==='ship')return (a.vessel_observed||'~').localeCompare(b.vessel_observed||'~');
    if(CF.sort==='soon'){var ax=a.active_off||'9999',bx=b.active_off||'9999';return ax<bx?-1:ax>bx?1:0;}
    return (a.last_name||'').localeCompare(b.last_name||'')||(a.first_name||'').localeCompare(b.first_name||'');
  });
  var filt=[];if(CF.status)filt.push(CF.status);if(CF.comp)filt.push({expired:'docs expired/missing',soon:'docs ≤90d',schengen:'Schengen expiring'}[CF.comp]);if(CF.client)filt.push(CF.client);if(CF.ship)filt.push(CF.ship);
  $('#crewcount').textContent=list.length+' of '+CREW.length+' crew'+(filt.length?' · '+filt.join(' · '):'');
  $('#crewgrid').innerHTML=list.map(card).join('')||'<div class=muted>No matches.</div>';
  document.querySelectorAll('#crewgrid .crew-card').forEach(function(el){
    el.onclick=function(ev){if(ev.target.closest('.tools')||ev.target.closest('.notedot'))return;openCrew(el.getAttribute('data-crew'));};
  });
}
async function loadCrew(){return renderCrew();}
function filterCrew(){paintCrew();}
async function openCrew(id){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  var dq=fetch('/api/crew/get?id='+encodeURIComponent(id)).then(function(r){return r.json();});
  var bq=fetch('/api/bonus/crew?id='+encodeURIComponent(id)).then(function(r){return r.json();}).catch(function(){return {};});
  const d=await dq; const bz=await bq;
  if(d.error){$('#view').innerHTML='<div class=muted>Not found.</div>';return;}
  const c=d.crew;const name=[c.first_name,c.middle_name,c.last_name].filter(Boolean).join(' ');
  const doc=function(label,dt){if(!dt)return '<span class="cchip">'+label+': —</span>';const days=(new Date(dt)-new Date())/86400000;const cls=days<0?'red':days<90?'amber':'ok';return '<span class="cchip '+cls+'">'+label+' '+dt+'</span>';};
  CURRENT_CREW=c.agency_id; CURD={crew:c,contracts:(d.contracts||[]),bonus:bz};
  let h='<div class="bar noprint"><h2>'+name+'</h2>'
    +'<button class="btn ghost" style="margin-left:auto" onclick="renderCrew()">← Back</button>'
    +'<button class="btn ghost" onclick="exportCrewCSV()">Export CSV</button>'
    +'<button class="btn ghost" onclick="emailStatement()">Email statement</button>'
    +'<button class="btn" onclick="downloadStatement()">Download PDF</button></div>'
    +'<div id=stmtout class="csub noprint" style="margin:-6px 0 10px"></div>';
  h+='<div class="card noprint" style="max-width:none;margin-bottom:14px"><div class=csub style="margin-bottom:6px">Request a feedback window (creates a single-use link to send the contributor):</div>'
    +'<button class="btn ghost rf" data-role="ray">Ray — Orders</button> '
    +'<button class="btn ghost rf" data-role="rolando">Rolando — Technical</button> '
    +'<button class="btn ghost rf" data-role="dexter">Dexter — Field</button>'
    +'<div id=fbout class=csub style="margin-top:8px"></div></div>';
  h+='<div class=stmt>';
  h+='<div class=printhead>DG3 CIMS — Crew Statement · '+name+' · '+new Date().toISOString().slice(0,10)+'</div>';
  h+='<div class="card" style="border-left:3px solid var(--navy);max-width:none">'
    +'<div class=cname>'+name+'</div>'
    +'<div class=csub>'+c.agency_id+' · '+(c.rank_override||c.rank_observed||'')+'</div>'
    +'<div class=statdot><i style="background:'+dot(c.status)+'"></i>'+c.status+'</div>'
    +'<div class=vessel>'+(c.vessel_observed||'—')+'</div>'
    +'<div class=csub style="margin-top:6px">'+[c.email,c.phone,c.province,(c.dob?('DOB '+c.dob):'')].filter(Boolean).join(' · ')+'</div>'
    +'<div class=cchips style="margin-top:8px">'+doc('Medical',c.med_exp)+doc("Seaman bk",c.sirb_exp)+doc('Passport',c.pp_exp)+doc('US visa',c.usv_exp)+doc('Schengen',c.sch_exp)+'</div>'
    +'</div>';
  var dp=d.deployment||{};
  if(dp.matched){
    var vlabel=dp.visa?(dp.visa.required+': '+(dp.visa.exp||'missing')):'Region entry visa varies by nationality';
    var vsuffix='',vcls='';
    if(dp.visa){var vs2=dp.visa.status;vcls=vs2==='ok'?'ok':(vs2==='expiring'?'amber':'red');if(vs2==='expired')vsuffix=' (EXPIRED)';else if(vs2==='expiring')vsuffix=' (<90d)';else if(vs2==='missing')vsuffix=' (MISSING)';}
    var dd=dp.nextDryDock;
    var ddTxt=dd?(dd.start+(dd.end?(' → '+dd.end):'')+' · '+(dd.loc||'')+(dd.note?(' · '+dd.note):'')):'none scheduled';
    h+='<div class="card" style="max-width:none;margin-top:12px;border-left:3px solid var(--royal)">'
      +'<div class=zlabel style="margin-bottom:6px">Deployment &amp; document fit</div>'
      +'<div class=csub>'+dp.vessel+' · '+(dp.brand||'')+' '+(dp.cls||'')+' class · Homeport '+(dp.homeport||'—')+' · '+(dp.region||'—')+'</div>'
      +'<div class=cchips style="margin-top:8px"><span class="cchip '+vcls+'">'+vlabel+vsuffix+'</span></div>'
      +'<div class=csub style="margin-top:8px"><b>Next dry dock (crew change):</b> '+ddTxt+'</div>'
      +'</div>';
  }
  if(bz&&!bz.error){
    h+='<div class=zlabel style="margin-top:16px">Bonus standing</div>';
    h+='<div class=csub style="margin-bottom:8px">Rank: <b style="color:var(--navy)">'+(bz.rank||'—')+'</b> · '+(bz.count!=null?bz.count:0)+' completed contract(s)'+(bz.baseline_set?'':' · baseline not yet set')+'</div>';
    h+='<div class=tiles>'+tile((bz.count!=null?bz.count:0),'Completed')+tile('$'+(bz.nextRungIfClean!=null?Number(bz.nextRungIfClean).toLocaleString():'—'),'Next rung if clean')+'</div>';
    var outs=bz.outcomes||[];
    if(outs.length) h+='<table class=tbl><thead><tr><th>Date</th><th>Ships</th><th>Score</th><th>Gate</th><th>Pay</th></tr></thead><tbody>'
      +outs.map(function(o){var ships='';try{ships=JSON.parse(o.ships_json||'[]').join(', ');}catch(e){}return '<tr><td>'+(o.committed_at||'').slice(0,10)+'</td><td>'+ships+'</td><td>'+o.score_pct+'%</td><td>'+(o.gate||'—')+'</td><td>$'+(o.pay_usd||0).toLocaleString()+'</td></tr>';}).join('')+'</tbody></table>';
    else h+='<p class=muted style="text-align:left;padding:6px 2px">No bonus outcomes committed yet.</p>';
  }
  const ct=d.contracts||[];
  h+='<div class=zlabel style="margin-top:16px">Contract history'+(d.daysWorked?(' · '+d.daysWorked.toLocaleString()+' sea-days'):'')+'</div>';
  if(!ct.length)h+='<p class=muted style="text-align:left;padding:8px 2px">No Keyman contract history on file.</p>';
  else h+='<table class=tbl><thead><tr><th>#</th><th>Ship</th><th>Sign on</th><th>Sign off</th><th>Basis</th></tr></thead><tbody>'
    +ct.map(function(x){var off=x.act||x.proj||'—';var basis=x.act?'<span class="cchip ok">actual</span>':(x.proj?'<span class="cchip royal">projected</span>':'<span class="cchip amber">open</span>');return '<tr><td>'+x.seq+'</td><td>'+(x.ship||'—')+'</td><td>'+x.on+'</td><td>'+off+'</td><td>'+basis+'</td></tr>';}).join('')+'</tbody></table>';
  h+='</div>';
  $('#view').innerHTML=h;
  document.querySelectorAll('#view .rf').forEach(function(b){b.onclick=function(){reqFeedback(b.getAttribute('data-role'));};});
}
async function reqFeedback(role){
  $('#fbout').textContent='Creating link…';
  try{
    var r=await (await fetch('/api/feedback/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:CURRENT_CREW,role:role})})).json();
    if(r.ok)$('#fbout').innerHTML='<div style="margin-top:4px"><b style="color:var(--navy)">'+r.role+'</b> link for '+r.crew+' (send to the contributor):<br><input readonly value="'+r.link+'" style="width:100%;margin-top:4px" onclick="this.select()"></div>';
    else $('#fbout').textContent='Could not create the link.';
  }catch(e){$('#fbout').textContent='Could not create the link.';}
}
function exportCrewCSV(){
  if(!CURD)return;
  var c=CURD.crew, rows=[];
  rows.push(['Field','Value']);
  [['Crew ID','agency_id'],['First name','first_name'],['Middle','middle_name'],['Last name','last_name'],['Status','status'],['Rank','rank_observed'],['Vessel','vessel_observed'],['DOB','dob'],['Province','province'],['Phone','phone'],['Email','email'],['Medical exp','med_exp'],['Seaman bk exp','sirb_exp'],['Passport exp','pp_exp'],['Schengen exp','sch_exp'],['US visa exp','usv_exp']].forEach(function(p){rows.push([p[0],c[p[1]]==null?'':c[p[1]]]);});
  rows.push([]);rows.push(['Contract #','Ship','Sign on','Sign off','Basis']);
  (CURD.contracts||[]).forEach(function(x){rows.push([x.seq,x.ship||'',x.on||'',x.act||x.proj||'',x.act?'actual':(x.proj?'projected':'open')]);});
  var csv=rows.map(function(r){return r.map(function(v){v=String(v==null?'':v);return /[",\\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v;}).join(',');}).join('\\n');
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='crew_'+c.agency_id+'.csv';a.click();
}
function downloadStatement(){ if(CURRENT_CREW) window.open('/api/crew/statement.pdf?id='+encodeURIComponent(CURRENT_CREW),'_blank'); }
async function emailStatement(){
  if(!CURRENT_CREW)return;
  var out=document.getElementById('stmtout'); if(out){out.style.color='';out.textContent='Sending…';}
  try{
    var r=await (await fetch('/api/crew/statement/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:CURRENT_CREW})})).json();
    if(out){
      if(r.sent) out.innerHTML='<span style="color:var(--green-d)">Statement emailed to '+r.to+(r.stored?' (stored)':'')+'.</span>';
      else out.innerHTML='<span style="color:var(--amber)">'+(r.note||'Could not send.')+'</span>';
    }
  }catch(e){ if(out){out.style.color='var(--red)';out.textContent='Could not send the statement.';} }
}
function card(c){
  var name=[c.first_name,c.last_name].filter(Boolean).join(' ');
  var b=brandOf(c.vessel_observed);
  var age=ageOf(c.dob);
  var sub=c.agency_id+(c.pp_no?(' · '+c.pp_no):'')+(age!==''?(' · '+age+' yrs'):'');
  var ph=fmtPhone(c.phone);
  var contact=[c.province,ph.txt?(ph.txt+(ph.bad?' <span class=vchip>⚠ verify</span>':'')):''].filter(Boolean).join(' · ');
  var span=c.active_on?('ON '+c.active_on+' → OFF '+(c.active_off||'open')+(c.active_off?(' · '+durLabel(c.active_on,c.active_off)):'')):'No active contract on file';
  // doc chips: only flag problems; else "Docs valid"
  var parts=[];
  function mk(exp,lbl){var f=docFlag(exp);if(f==='expired')parts.push('<span class="cchip red">'+lbl+' expired</span>');else if(f==='missing')parts.push('<span class="cchip red">'+lbl+' missing</span>');else if(f==='90d')parts.push('<span class="cchip amber">'+lbl+' ≤90d</span>');}
  mk(c.med_exp,'Medical');mk(c.sirb_exp,'SIRB');mk(c.pp_exp,'Passport');mk(c.usv_exp,'US visa');
  if(c.sch_exp){var sf=docFlag(c.sch_exp);if(sf==='expired')parts.push('<span class="cchip amber">Schengen expired</span>');else if(sf==='90d')parts.push('<span class="cchip amber">Schengen ≤90d</span>');}
  var comp=parts.length?'<div class=cchips>'+parts.join('')+'</div>':'<div class=cchips><span class="cchip ok">Docs valid</span></div>';
  // bonus pill: only show a $ figure when a baseline is set (otherwise it would be a guess)
  var bonusPill;
  if(c.baseline_count!=null){var nv=ladderValue((c.baseline_count||0)+1);bonusPill='<span class="pill next'+(nv===0?' zero':'')+'">Next bonus: '+(nv===0?'$0 (builds to PS)':'$'+nv.toLocaleString())+'</span>';}
  else bonusPill='<span class="pill next zero">Bonus: baseline pending</span>';
  return '<div class="crew-card card b-'+b+'" data-crew="'+c.agency_id+'">'
   +'<div class=tools><button title="Notes" onclick="notesModal(\\''+c.agency_id+'\\')">🗒</button><button title="Edit" onclick="editCrewModal(\\''+c.agency_id+'\\')">✎</button></div>'
   +'<div class=cname>'+name+'</div>'
   +'<div class=csub>'+sub+'</div>'
   +'<div class=crow><span class=statdot><i style="background:'+dot(c.status)+'"></i>'+c.status+'</span><span class="pill rank">'+rankTag(c.rank,c.baseline_count)+'</span></div>'
   +'<div class=vessel>'+(c.vessel_observed||'—')+' <small style="color:var(--mut);font-weight:500">· '+(c.client||'')+'</small></div>'
   +(contact?'<div class=cdates>'+contact+'</div>':'')
   +'<div class=cdates>'+span+'</div>'
   +'<div class=crow><span class="pill cnt">Contracts '+(c.contract_count||0)+'</span>'+bonusPill+'</div>'
   +comp
   +(c.hasNote?'<span class=notedot title="View notes" onclick="notesModal(\\''+c.agency_id+'\\')"></span>':'')
   +'</div>';
}
var SHIP_LIST=["Adventure","Allure","Anthem","Apex","Ascent","Beyond","Brilliance","Constellation","Eclipse","Edge","Enchantment","Equinox","Explorer","Freedom","Grandeur","Harmony","Icon","Independence","Infinity","Jewel","Legend","Liberty","Mariner","Millennium","Navigator","Oasis","Odyssey","Ovation","Quantum","Radiance","Reflection","Rhapsody","Serenade","Silhouette","Spectrum","Star","Summit","Symphony","Utopia","Vision","Voyager","Wonder","Xcel","Azamara Journey","Azamara Onward","Azamara Pursuit","Azamara Quest"];
function shipOptions(sel){return '<option value="">—</option>'+SHIP_LIST.map(function(s){var full='MV '+s.toUpperCase();var m=(sel&&(sel===full||sel===s||sel.toUpperCase().indexOf(s.toUpperCase())>=0));return '<option value="'+full+'"'+(m?' selected':'')+'>'+s+'</option>';}).join('');}
// "" = Auto (let the app derive status from the schedule). A named pick becomes a manual override that
// wins (e.g. Rita pulling an auto-retired crew back to Earmarked).
function statusOptions(sel){var auto='<option value=""'+(!sel?' selected':'')+'>Auto (from schedule)</option>';return auto+['On board','On Vacation','Earmarked','Inactive'].map(function(s){return '<option'+(s===sel?' selected':'')+'>'+s+'</option>';}).join('');}
function crewById(id){return CREW.filter(function(c){return c.agency_id===id;})[0];}
function closeCrewModal(){var m=document.getElementById('crewmodal');if(m)m.remove();}
function addCrewModal(){
  var fg=function(lab,inp){return '<div class=fg><label>'+lab+'</label>'+inp+'</div>';};
  var h='<div class=modcard><div class=modhd><div><div class=cname>Add crew</div><div class=csub>Manual entry — protected from AdvancedQuery overwrites.</div></div><button class="btn ghost" onclick="closeCrewModal()">Close ✕</button></div>'
   +'<div class=f2 style="margin-top:12px">'
   +fg('First name','<input id=aFirst>')+fg('Last name','<input id=aLast>')
   +fg('Crew ID','<input id=aId placeholder="e.g. SC-0046000">')+fg('Passport no.','<input id=aPass>')
   +fg('Status','<select id=aStatus>'+statusOptions('Earmarked')+'</select>')+fg('Current vessel','<select id=aShip>'+shipOptions('')+'</select>')
   +fg('Date of birth','<input id=aDob type=date>')+fg('Starting rank','<select id=aRank><option value="">Junior Printer Specialist</option><option value="Printer Specialist">Printer Specialist</option></select>')
   +'</div>'
   +'<div style="margin-top:10px;text-align:right"><span id=aMsg class=csub style="margin-right:8px"></span><button class="btn ghost" onclick="closeCrewModal()">Cancel</button> <button class="btn green" onclick="saveNewCrew()">Add crew</button></div></div>';
  var w=document.createElement('div');w.id='crewmodal';w.className='modwrap';w.innerHTML=h;w.onclick=function(e){if(e.target===w)closeCrewModal();};document.body.appendChild(w);
}
async function saveNewCrew(){
  var g=function(x){return document.getElementById(x).value.trim();};
  if(!g('aId')||!g('aFirst')||!g('aLast')){document.getElementById('aMsg').textContent='ID, first and last name are required.';return;}
  document.getElementById('aMsg').textContent='Saving…';
  var body={agency_id:g('aId'),first_name:g('aFirst'),last_name:g('aLast'),pp_no:g('aPass')||null,status:g('aStatus'),vessel_observed:document.getElementById('aShip').value||null,dob:g('aDob')||null,rank_observed:document.getElementById('aRank').value||'Junior Printer Specialist'};
  try{var r=await (await fetch('/api/crew/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    if(r.ok){closeCrewModal();renderCrew();}else document.getElementById('aMsg').textContent=r.error==='exists'?'That crew ID already exists.':'Could not add.';
  }catch(e){document.getElementById('aMsg').textContent='Could not add.';}
}
async function editCrewModal(id){
  var c=crewById(id);if(!c)return;
  var fg=function(lab,inp){return '<div class=fg><label>'+lab+'</label>'+inp+'</div>';};
  var iv=function(v){return v==null?'':String(v).replace(/"/g,'&quot;');};
  var h='<div class=modcard><div class=modhd><div><div class=cname>Edit crew — '+[c.first_name,c.last_name].filter(Boolean).join(' ')+'</div><div class=csub>'+id+' · manual edits win over imports</div></div><button class="btn ghost" onclick="closeCrewModal()">Close ✕</button></div>'
   +'<div class=f2 style="margin-top:12px">'
   +fg('First name','<input id=eFirst value="'+iv(c.first_name)+'">')+fg('Last name','<input id=eLast value="'+iv(c.last_name)+'">')
   +fg('Middle name','<input id=eMid value="'+iv(c.middle_name)+'">')+fg('Province','<input id=eProv value="'+iv(c.province)+'">')
   +fg('Mobile','<input id=ePhone value="'+iv(c.phone)+'">')+fg('Email','<input id=eEmail value="'+iv(c.email)+'">')
   +fg('Crew ID (locked)','<input value="'+iv(c.agency_id)+'" disabled>')+fg('Passport no.','<input id=ePass value="'+iv(c.pp_no)+'">')
   +fg('Status','<select id=eStatus>'+statusOptions(c.status)+'</select>')+fg('Current vessel','<select id=eShip>'+shipOptions(c.vessel_observed)+'</select>')
   +fg('Date of birth','<input id=eDob type=date value="'+iv(c.dob)+'">')+fg('Consecutive contract count (bonus baseline)','<input id=eCount type=number min=0 value="'+(c.baseline_count!=null?c.baseline_count:'')+'">')
   +'</div>'
   +'<div class=zlabel>Document expiry (compliance)</div><div class=f2>'
   +fg('Medical','<input id=eMed type=date value="'+iv(c.med_exp)+'">')+fg('Seaman&rsquo;s book','<input id=eSirb type=date value="'+iv(c.sirb_exp)+'">')
   +fg('Passport','<input id=ePp type=date value="'+iv(c.pp_exp)+'">')+fg('US visa','<input id=eUsv type=date value="'+iv(c.usv_exp)+'">')
   +fg('Schengen (Europe only)','<input id=eSch type=date value="'+iv(c.sch_exp)+'">')
   +'</div>'
   +'<span class=ck style="margin-top:8px;font-weight:600;cursor:pointer;display:flex" onclick="tgFlip(\\'eRetired\\')"><input type=checkbox id=eRetired'+(c.retired?' checked':'')+' style="pointer-events:none"> Retired (manual — keeps this crew off the auto On board / On Vacation tagging)</span>'
   +'<div style="margin-top:12px;text-align:right"><span id=eMsg class=csub style="margin-right:8px"></span><button class="btn ghost" onclick="closeCrewModal()">Cancel</button> <button class="btn green" onclick="saveEditCrew(\\''+id+'\\')">Save</button></div></div>';
  var w=document.createElement('div');w.id='crewmodal';w.className='modwrap';w.innerHTML=h;w.onclick=function(e){if(e.target===w)closeCrewModal();};document.body.appendChild(w);
}
async function saveEditCrew(id){
  var v=function(x){var e=document.getElementById(x);return e?e.value:undefined;};
  document.getElementById('eMsg').textContent='Saving…';
  var cnt=v('eCount');
  var er=document.getElementById('eRetired');
  var body={agency_id:id,first_name:v('eFirst'),middle_name:v('eMid'),last_name:v('eLast'),province:v('eProv'),phone:v('ePhone'),email:v('eEmail'),pp_no:v('ePass'),status:v('eStatus'),vessel_observed:document.getElementById('eShip').value,dob:v('eDob'),med_exp:v('eMed'),sirb_exp:v('eSirb'),pp_exp:v('ePp'),usv_exp:v('eUsv'),sch_exp:v('eSch'),baseline_count:cnt===''?null:Number(cnt),retired:er&&er.checked?1:0};
  try{await fetch('/api/crew/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});closeCrewModal();renderCrew();}
  catch(e){document.getElementById('eMsg').textContent='Could not save.';}
}
async function notesModal(id){
  var c=crewById(id);var name=c?[c.first_name,c.last_name].filter(Boolean).join(' '):id;
  var h='<div class=modcard><div class=modhd><div><div class=cname>Notes & field intel — '+name+'</div><div class=csub>The crew\\'s story over time — newest first.</div></div><button class="btn ghost" onclick="closeCrewModal()">Close ✕</button></div>'
   +'<div class=sec style="margin-top:12px">Field intel<span id=intelcount class=intcount></span> — from contributor emails</div>'
   +'<div id=intellog class=notelog><div class=muted style="padding:14px">Loading…</div></div>'
   +'<div class=sec style="margin-top:16px">Manual notes</div>'
   +'<div style="margin-top:8px;display:flex;gap:8px;align-items:stretch"><textarea id=newNote rows=2 style="flex:1;padding:9px 12px;line-height:1.45;font-family:inherit;font-size:14px;resize:vertical" placeholder="Add a note…"></textarea><button class="btn green" onclick="addCrewNote(\\''+id+'\\')">Add note</button></div>'
   +'<div id=notelog class=notelog><div class=muted style="padding:14px">Loading…</div></div></div>';
  var w=document.createElement('div');w.id='crewmodal';w.className='modwrap';w.innerHTML=h;w.onclick=function(e){if(e.target===w)closeCrewModal();};document.body.appendChild(w);
  loadNoteLog(id); loadIntelLog(id);
}
async function loadIntelLog(id){
  var box=document.getElementById('intellog');if(!box)return;
  try{var r=await (await fetch('/api/intel/crew?id='+encodeURIComponent(id))).json();var ns=r.intel||[];
    var hdr=document.getElementById('intelcount');if(hdr)hdr.textContent=ns.length?(' · '+ns.length+(ns.length===1?' entry':' entries')):'';
    box.innerHTML=ns.length?ns.map(function(n){return intelCard(id,n);}).join(''):'<div class=muted style="padding:12px">No field intel yet. Forward crew emails to <b>crew-reports@cims.work</b> and they\\'ll be summarised here.</div>';
  }catch(e){box.innerHTML='<div class=muted style="padding:12px">Could not load intel.</div>';}
}
function intelCard(id,n){
  var d=new Date(n.ts);
  var dt=isNaN(d)?'':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  var rep=n.reporter?('<span class=intrep>'+String(n.reporter).replace(/</g,'&lt;')+'</span>'):'';
  var ctr=(n.contract_no!=null)?('<span class="intchip ctr">Contract '+n.contract_no+'</span>'):'';
  var edited=n.edited_at?'<span class=intedited>· edited</span>':'';
  return '<div class=intelcard><div class=intelhd>'
    +'<div class=intelmeta><span class=intdate>'+dt+'</span>'+rep+'<span class="intchip src">'+(n.source||'email')+'</span>'+ctr+edited+'</div>'
    +'<div class=intelact><button onclick="intelEdit(\\''+id+'\\',\\''+n.id+'\\')">Edit</button><button class=del onclick="intelDelete(\\''+id+'\\',\\''+n.id+'\\')">Delete</button></div></div>'
    +'<div class=inteltext id=ictext_'+n.id+'>'+String(n.summary||'').replace(/</g,'&lt;').replace(/\\n/g,'<br>')+'</div></div>';
}
function intelEdit(id,nid){
  var box=document.getElementById('ictext_'+nid);if(!box)return;
  var cur=box.innerHTML.replace(/<br>/g,'\\n').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  box.innerHTML='<textarea id=icedit_'+nid+' class=inteledit rows=6>'+cur.replace(/</g,'&lt;')+'</textarea>'
    +'<div style="margin-top:6px;display:flex;gap:6px"><button class="btn green" style="padding:5px 11px;font-size:12px" onclick="intelSave(\\''+id+'\\',\\''+nid+'\\')">Save</button><button class="btn ghost" style="padding:5px 11px;font-size:12px" onclick="loadIntelLog(\\''+id+'\\')">Cancel</button></div>';
}
async function intelSave(id,nid){
  var t=document.getElementById('icedit_'+nid);if(!t||!t.value.trim())return;
  try{await fetch('/api/intel/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:nid,summary:t.value})});}catch(e){}
  loadIntelLog(id);
}
async function intelDelete(id,nid){
  if(!confirm('Delete this field-intel entry? This cannot be undone.'))return;
  try{await fetch('/api/intel/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:nid,discard:true})});}catch(e){}
  loadIntelLog(id);
}
async function loadNoteLog(id){
  var box=document.getElementById('notelog');if(!box)return;
  try{var r=await (await fetch('/api/crew/notes?id='+encodeURIComponent(id))).json();var ns=r.notes||[];
    box.innerHTML=ns.length?ns.map(function(n){var d=new Date(n.ts);var meta=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});return '<div class=noteitem><div class=notemeta>'+meta+'<span class=notedel title="Delete note" onclick="deleteCrewNote(\\''+id+'\\','+n.id+')">✕</span></div><div class=notetext>'+String(n.text||'').replace(/</g,'&lt;')+'</div></div>';}).join(''):'<div class=muted style="padding:14px">No notes yet — the first one starts the log.</div>';
  }catch(e){box.innerHTML='<div class=muted style="padding:14px">Could not load notes.</div>';}
}
async function deleteCrewNote(id,noteId){
  if(!confirm('Delete this note? This cannot be undone.'))return;
  try{await fetch('/api/crew/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delete:noteId})});
    await loadNoteLog(id);
    // refresh the gold note dot if no notes remain
    var rr=await (await fetch('/api/crew/notes?id='+encodeURIComponent(id))).json();var c=crewById(id);if(c){c.hasNote=!!(rr.notes&&rr.notes.length);paintCrew();}
  }catch(e){}
}
async function addCrewNote(id){
  var t=document.getElementById('newNote');if(!t||!t.value.trim())return;
  var txt=t.value.trim();t.value='';
  try{await fetch('/api/crew/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,text:txt})});
    loadNoteLog(id);var c=crewById(id);if(c){c.hasNote=true;paintCrew();}
  }catch(e){t.value=txt;}
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
/* ---- Contracts & Bonus: fleet-wide ledger ---- */
var CTL=null,CTLF={q:'',client:'',sort:'az'};
async function renderContracts(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  var d;try{d=await (await fetch('/api/contracts')).json();}catch(e){$('#view').innerHTML='<div class=muted>Could not load. <button class="btn ghost" onclick="renderContracts()">Retry</button></div>';return;}
  CTL=d;CTLF={q:'',client:'',sort:'az'};
  var clients=Array.from(new Set((d.rows||[]).map(function(r){return r.client;}).filter(Boolean))).sort();
  $('#view').innerHTML='<div class=bar><h2>Contracts &amp; Bonus</h2>'
   +'<div class=search style="margin-left:auto"><input id=ctq placeholder="name or crew ID" oninput="CTLF.q=this.value;paintContracts()" style="width:210px"></div>'
   +'<select id=ctc onchange="CTLF.client=this.value;paintContracts()"><option value="">All clients</option>'+clients.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select>'
   +'<select id=cts onchange="CTLF.sort=this.value;paintContracts()"><option value="az">Sort: name</option><option value="tenure">Sort: contracts</option><option value="next">Sort: next bonus</option><option value="paid">Sort: total paid</option></select>'
   +'<button class="btn ghost" onclick="openScoreWindow()">Contributor scoring →</button> <button class="btn green" onclick="addCrewModal()">+ New signer</button></div>'
   +'<div class=tiles style="grid-template-columns:repeat(3,1fr);margin-bottom:12px">'+tile(d.totals.crew,'Crew')+tile(d.totals.baselineSet+' / '+d.totals.crew,'Baselines set',(d.totals.baselineSet<d.totals.crew?'amber':'green'))+tile('$'+Number(d.totals.paid||0).toLocaleString(),'Bonus paid to date','green')+'</div>'
   +'<div class=hint style="margin:-4px 0 10px">Consecutive count drives the bonus ladder. Where a baseline is not yet confirmed, the next-bonus figure is withheld (shown as "baseline pending").</div>'
   +'<div id=ctcount class=csub style="margin-bottom:8px"></div><div id=cttable></div>';
  paintContracts();
}
function paintContracts(){
  if(!CTL)return;var q=CTLF.q.trim().toLowerCase();
  var rows=(CTL.rows||[]).filter(function(r){if(CTLF.client&&r.client!==CTLF.client)return false;if(q&&((r.name||'')+' '+(r.agency_id||'')).toLowerCase().indexOf(q)<0)return false;return true;});
  rows.sort(function(a,b){if(CTLF.sort==='tenure')return b.contracts-a.contracts;if(CTLF.sort==='next')return b.nextRung-a.nextRung;if(CTLF.sort==='paid')return b.totalPay-a.totalPay;return a.name.localeCompare(b.name);});
  $('#ctcount').textContent=rows.length+' of '+CTL.rows.length+' crew';
  var body=rows.map(function(r){
    var last=r.lastDate?(r.lastDate+' · '+(r.lastScore!=null?r.lastScore+'%':'—')+(r.lastGate?(' · '+r.lastGate):'')+' · $'+Number(r.lastPay||0).toLocaleString()):'<span class=muted style="padding:0">none yet</span>';
    var nb=r.baseline_set?('$'+Number(r.nextRung||0).toLocaleString()):'<span class=vchip>baseline pending</span>';
    return '<tr><td><b>'+r.name+'</b><div class=csub>'+r.agency_id+'</div></td><td>'+(r.vessel||'—')+'<div class=csub>'+(r.client||'')+'</div></td><td style="text-align:center">'+r.contracts+'</td><td style="text-align:center"><span class="pill rank">'+r.rank+'</span> '+r.count+'</td><td>'+nb+'</td><td>'+last+'</td><td style="text-align:right">$'+Number(r.totalPay||0).toLocaleString()+'</td><td style="white-space:nowrap"><button class="btn ghost" onclick="window.open(\\'/api/crew/statement.pdf?id='+encodeURIComponent(r.agency_id)+'\\',\\'_blank\\')">PDF</button> <button class="btn ghost" onclick="openFill(\\''+r.agency_id+'\\')" title="Ray / Rolando / Dexter fill in their inputs">Inputs →</button> <button class="btn green" onclick="ledgerScore(\\''+r.agency_id+'\\')">Score</button></td></tr>';
  }).join('')||'<tr><td colspan=8 class=muted>No matches.</td></tr>';
  $('#cttable').innerHTML='<table class=tbl><thead><tr><th>Crew</th><th>Ship · client</th><th>Contracts</th><th>Consec.</th><th>Next bonus</th><th>Last outcome</th><th style="text-align:right">Paid</th><th></th></tr></thead><tbody>'+body+'</tbody></table>';
}
function ledgerScore(id){openScore(id);}
/* ---- Feedback windows board ---- */
async function renderFeedback(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  var d;try{d=await (await fetch('/api/feedback/board')).json();}catch(e){$('#view').innerHTML='<div class=muted>Could not load. <button class="btn ghost" onclick="renderFeedback()">Retry</button></div>';return;}
  var rows=d.rows||[],pn={ray:'Ray',rolando:'Rolando',dexter:'Dexter'};
  function dlabel(n){return n<0?(Math.abs(n)+'d ago'):(n===0?'today':('in '+n+'d'));}
  function pill(id,r){var cls=r.answered?'on':(r.status==='pending'?'pend':'');var mark=r.answered?'✓':(r.status==='pending'?'…':'+');var tt=r.answered?'response in':(r.status==='pending'?'requested — awaiting':'click to request a window');return '<span class="fbp '+cls+'" title="'+tt+'" onclick="fbRequest(\\''+id+'\\',\\''+r.role+'\\')">'+pn[r.role]+' '+mark+'</span>';}
  var body=rows.map(function(x){var due=x.days<=7?'red':(x.days<=21?'amber':'ok');
    return '<tr><td><b>'+x.name+'</b><div class=csub>'+x.agency_id+'</div></td><td>'+(x.vessel||'—')+'</td><td><span class="cchip '+due+'">'+x.signOff+' · '+dlabel(x.days)+'</span></td><td>'+x.roles.map(function(r){return pill(x.agency_id,r);}).join(' ')+'</td><td style="text-align:center">'+x.answeredCount+'/3</td><td><button class="btn green" onclick="ledgerScore(\\''+x.agency_id+'\\')">Score</button></td></tr>';
  }).join('')||'<tr><td colspan=6 class=muted>No crew in the feedback window right now.</td></tr>';
  $('#view').innerHTML='<div class=bar><h2>Feedback windows</h2><span class=csub style="margin-left:auto">'+rows.length+' crew · ending ≤45d or ended ≤30d</span></div>'
   +'<div class=hint style="margin:-4px 0 12px">Collect contributor feedback before a contract is scored. Click a role pill to generate a single-use window link — green = response in, amber = requested, grey = not yet. Score pulls the evidence into the Score Card.</div>'
   +'<div id=fbreqout class=csub style="margin-bottom:10px"></div>'
   +'<table class=tbl><thead><tr><th>Crew</th><th>Ship</th><th>Sign-off</th><th>Windows (Ray · Rolando · Dexter)</th><th style="text-align:center">In</th><th></th></tr></thead><tbody>'+body+'</tbody></table>';
}
async function fbRequest(id,role){
  var out=document.getElementById('fbreqout');if(out)out.textContent='Creating link…';
  try{var r=await (await fetch('/api/feedback/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,role:role})})).json();
    if(r.ok&&out)out.innerHTML='<b style="color:var(--navy)">'+r.role+'</b> link for '+r.crew+' — send to the contributor: <input readonly value="'+r.link+'" style="width:55%;margin:0 6px" onclick="this.select()"><button class="btn ghost" onclick="renderFeedback()">Refresh board</button>';
    else if(out)out.textContent='Could not create the link.';
  }catch(e){if(out)out.textContent='Could not create the link.';}
}
/* The old "Score" tab (renderBonus) was removed — scoring now lives in the Contracts & Bonus
   ledger (Score button per row) + the Contributor scoring window opened from that tab. */
/* ---- Contributor Scoring window (Ray / Rolando / Dexter submit their inputs in one place) ---- */
var _SW={};
var FBLABEL={ray:'Ray — Inventory & Orders',rolando:'Rolando — Technical',dexter:'Dexter — Field review'};
function swRender(title,inner){$('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class=modal><div class=mh>'+title+'<button onclick="mClose()">×</button></div><div class=mb id=swBody>'+inner+'</div></div></div>';MODAL_T=Date.now();}
function swSel(id,opts,val){return '<select id='+id+'>'+opts.map(function(o){return '<option'+(o===val?' selected':'')+'>'+o+'</option>';}).join('')+'</select>';}
function swTa(id,val){return '<textarea id='+id+' rows=2>'+(val||'')+'</textarea>';}
function sv(id){var e=$('#'+id);return e?e.value:undefined;}
function swIndex(arr){(arr||[]).forEach(function(c){_SW.byId[c.agency_id]=c;});}
async function openScoreWindow(){
  _SW={crew:null,role:null,byId:{}};
  swRender('Contributor scoring','<div class=muted>Loading crew…</div>');
  var d;try{d=await (await fetch('/api/score/queue')).json();}catch(e){$('#swBody').innerHTML='<div class=muted>Could not load. <button class="btn ghost" onclick="openScoreWindow()">Retry</button></div>';return;}
  _SW.queue=d;swIndex(d.recent);swIndex(d.upcoming);
  swCrewStep();
}
// Open the contributor-fill page straight to ONE crew (skips the picker) — used by the ledger's
// "Inputs" button so Ray/Rolando/Dexter go right to their question set for that crew.
async function openFill(id){
  var c=((CTL&&CTL.rows)||[]).find(function(r){return r.agency_id===id;})||{agency_id:id,name:id};
  _SW={crew:{agency_id:id,name:c.name||id,vessel:c.vessel||null,feedback:{}},role:null,byId:{}};
  _SW.byId[id]=_SW.crew;
  await swRoleStep();
  try{var d=await (await fetch('/api/score/queue')).json();_SW.queue=d;swIndex(d.recent);swIndex(d.upcoming);}catch(e){}
}
function swCrewStep(){
  var d=_SW.queue||{recent:[],upcoming:[]};
  var html='<div class=hint style="margin-bottom:8px">Pick the crew member whose contract you are scoring (just signed off, or about to).</div>'
   +'<div class=fg><input id=swq placeholder="Search any crew by name…" oninput="swSearch()"></div>'
   +'<div id=swSearchOut></div>'
   +swList('Just signed off — last 14 days',d.recent)
   +swList('Signing off soon — next 14 days',d.upcoming);
  swRender('Contributor scoring · pick crew',html);
}
function swList(title,arr){
  if(!arr||!arr.length)return '<div class=sec>'+title+'</div><div class=hint style="margin-bottom:6px">None in this window.</div>';
  return '<div class=sec>'+title+'</div>'+arr.map(swRow).join('');
}
function swRow(c){
  var fb=c.feedback||{};
  var dots=['ray','rolando','dexter'].map(function(r){var ok=(fb[r]==='answered'||fb[r]==='na');return '<span class=fbdot title="'+r+'" style="background:'+(ok?'var(--green)':'#dfe5ec')+'"></span>';}).join('');
  return '<div class=brow onclick="swPickCrew(\\''+c.agency_id+'\\')"><div><div class=cname style="font-size:14px">'+(c.name||c.agency_id)+'</div><div class=csub>'+c.agency_id+' · '+(c.ship||c.vessel||'—')+' · '+(c.signOn||'?')+' → '+(c.signOff||'?')+'</div></div><div style="margin-left:auto;display:flex;gap:5px;align-items:center" title="Ray / Rolando / Dexter">'+dots+'</div></div>';
}
var _swt;function swSearch(){clearTimeout(_swt);_swt=setTimeout(swSearchGo,90);}
async function swSearchGo(){
  var q=$('#swq')?$('#swq').value.trim().toLowerCase():'';
  if(!q){if($('#swSearchOut'))$('#swSearchOut').innerHTML='';return;}
  // Load the active roster ONCE (status != Inactive ≈ active in service), then filter locally as you type.
  if(!_SW.allCrew){ try{var r=await (await fetch('/api/crew')).json();_SW.allCrew=(r.crew||[]).filter(function(c){return String(c.status||'').toLowerCase().indexOf('inactive')<0;});}catch(e){_SW.allCrew=[];} }
  var arr=_SW.allCrew.filter(function(c){var nm=[c.first_name,c.last_name].filter(Boolean).join(' ').toLowerCase();return nm.indexOf(q)>=0||String(c.agency_id||'').toLowerCase().indexOf(q)>=0;})
    .slice(0,15).map(function(c){return {agency_id:c.agency_id,name:[c.first_name,c.last_name].filter(Boolean).join(' '),vessel:c.vessel_observed,ship:null,signOn:c.active_on,signOff:c.active_off,feedback:{}};});
  swIndex(arr);
  if($('#swSearchOut'))$('#swSearchOut').innerHTML='<div class=sec>Matches ('+arr.length+')</div>'+(arr.length?arr.map(swRow).join(''):'<div class=hint>No active crew match "'+q+'".</div>');
}
async function swPickCrew(id){
  _SW.crew=_SW.byId[id]||{agency_id:id,name:id,feedback:{}};
  await swRoleStep();
}
async function swRoleStep(){
  swRender('Contributor scoring · '+_SW.crew.name,'<div class=muted>Loading…</div>');
  var d={};try{d=await (await fetch('/api/feedback/crew?id='+encodeURIComponent(_SW.crew.agency_id))).json();}catch(e){}
  var st={ray:'none',rolando:'none',dexter:'none'};(d.requests||[]).forEach(function(r){st[r.role]=r.status;});
  _SW.status=st;_SW.prefill=d.prefill||{sliders:{},gates:{}};_SW.rawAnswers=d.answers||{};
  var roles=[['ray','Ray — Inventory & Orders'],['rolando','Rolando — Technical'],['dexter','Dexter — Field review']];
  var btns=roles.map(function(x){var s=st[x[0]];var done=(s==='answered'||s==='na');return '<button class="btn '+(done?'green':'ghost')+'" style="display:block;width:100%;text-align:left;margin-bottom:8px" onclick="swPickRole(\\''+x[0]+'\\')">'+(done?'✓ ':'')+x[1]+(done?' — submitted (tap to edit)':'')+'</button>';}).join('');
  swRender('Contributor scoring · '+_SW.crew.name,
   '<button class="btn ghost" onclick="swCrewStep()" style="margin-bottom:10px">← change crew</button>'
   +'<div class=hint style="margin-bottom:10px">'+_SW.crew.agency_id+' · '+(_SW.crew.ship||_SW.crew.vessel||'—')+' · '+(_SW.crew.signOn||'?')+' → '+(_SW.crew.signOff||'?')+'</div>'
   +'<div class=sec>Who are you?</div>'+btns+swResultBox(_SW.prefill,_SW.status));
}
function swPickRole(role){_SW.role=role;swQuestions();}
function swQuestions(){
  var role=_SW.role;var a=(_SW.rawAnswers&&_SW.rawAnswers[role])||{};var f='';
  if(role==='ray'){
    f='<div class=fg><label>Did any order fail / need a rush or emergency shipment?</label>'+swSel('order',['No','Yes'],a.order)+'</div>'
     +'<div class=fg><label>If yes — cause</label>'+swSel('rushcause',['N/A','Crew ordering failure','Legitimate (machine / added sailing / port)'],a.rushcause)+'<div class=hint>Only "Crew ordering failure" arms the rush gate.</div></div>'
     +'<div class=fg><label>Rush cost (USD)</label><input id=rushcost type=number min=0 value="'+(a.rushcost||'')+'" placeholder="e.g. 3000"></div>'
     +'<div class=fg><label>Orders placed on time (par respected)?</label>'+swSel('ontime',['Always','Mostly','Often late'],a.ontime)+'</div>'
     +'<div class=fg><label>Order accuracy</label>'+swSel('acc',['Accurate','Minor errors','Frequent errors'],a.acc)+'</div>'
     +'<div class=fg><label>Par maintained at handover</label>'+swSel('par',['Maintained','Some gaps','Not maintained'],a.par)+'</div>'
     +'<div class=fg><label>Failed end-of-contract inventory audit?</label>'+swSel('audit',['No','Yes'],a.audit)+'</div>'
     +'<div class=fg><label>Note / evidence (optional)</label>'+swTa('note',a.note)+'</div>';
  } else if(role==='rolando'){
    f='<div class=fg><label>Machine clean &amp; serviceable at handover?</label>'+swSel('clean',['Yes','Minor issues','No'],a.clean)+'</div>'
     +'<div class=fg><label>Preventive maintenance done correctly?</label>'+swSel('pm',['Yes','Partial','No'],a.pm)+'</div>'
     +'<div class=fg><label>Unresolved technical issues left for the reliever?</label>'+swSel('unres',['None','Minor','Major'],a.unres)+'</div>'
     +'<div class=fg><label>Note / evidence (optional)</label>'+swTa('note',a.note)+'</div>';
  } else {
    f='<div class=fg><label>Did you assess this crew this contract?</label>'+swSel('assessed',['No (N/A)','Yes'],a.assessed)+'</div>'
     +'<div class=fg><label>Mono click % this contract (&lt;20% target)</label><input id=mono type=number min=0 max=100 step=0.1 value="'+(a.mono||'')+'" placeholder="e.g. 14"><div class=hint>Feeds the Mono discipline sub-score.</div></div>'
     +'<div class=fg><label>Inventory observations</label>'+swTa('inv',a.inv)+'</div>'
     +'<div class=fg><label>Technical observations</label>'+swTa('tech',a.tech)+'</div>'
     +'<div class=fg><label>Overall impression</label>'+swTa('overall',a.overall)+'</div>';
  }
  swRender('Contributor scoring · '+_SW.crew.name,
   '<button class="btn ghost" onclick="swRoleStep()" style="margin-bottom:10px">← back</button>'
   +'<div class=hint style="margin-bottom:8px"><b>'+FBLABEL[role]+'</b> · scoring '+_SW.crew.name+'</div>'
   +f+'<div class=mf><button class="btn ghost" onclick="swRoleStep()">Cancel</button><button class="btn green" id=swSub onclick="swSubmit()">Submit</button></div><div class=hint id=swMsg style="text-align:right"></div>');
}
async function swSubmit(){
  var role=_SW.role;var ans={};
  if(role==='ray')ans={order:sv('order'),rushcause:sv('rushcause'),rushcost:sv('rushcost'),ontime:sv('ontime'),acc:sv('acc'),par:sv('par'),audit:sv('audit'),note:sv('note')};
  else if(role==='rolando')ans={clean:sv('clean'),pm:sv('pm'),unres:sv('unres'),note:sv('note')};
  else ans={assessed:sv('assessed'),mono:sv('mono'),inv:sv('inv'),tech:sv('tech'),overall:sv('overall')};
  $('#swSub').disabled=true;$('#swMsg').textContent='Saving…';
  var res;try{res=await (await fetch('/api/feedback/score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:_SW.crew.agency_id,role:role,answers:ans})})).json();}catch(e){res={error:'network'};}
  if(res.error){$('#swSub').disabled=false;$('#swMsg').textContent='Error: '+res.error;return;}
  _SW.prefill=res.prefill;_SW.status=res.status;_SW.rawAnswers=_SW.rawAnswers||{};_SW.rawAnswers[role]=ans;
  swRender('Contributor scoring · '+_SW.crew.name,
   '<div style="text-align:center;font-family:Outfit;font-weight:800;color:var(--green-d);font-size:18px;margin-bottom:4px">✓ '+FBLABEL[role].split(' — ')[0]+' submitted</div>'
   +'<div class=hint style="text-align:center;margin-bottom:6px">Recorded for '+_SW.crew.name+' — it will pre-fill the Score Card.</div>'
   +swResultBox(_SW.prefill,_SW.status)
   +'<div class=mf style="margin-top:12px"><button class="btn ghost" onclick="swRoleStep()">Score another contributor</button><button class="btn green" onclick="mClose()">Done</button></div>');
}
function swResultBox(pf,st){
  pf=pf||{sliders:{},gates:{}};st=st||{ray:'none',rolando:'none',dexter:'none'};
  var sl=pf.sliders||{};var gates=pf.gates||{};
  var rows=[['sOrder','On-time ordering',20],['sAcc','Order accuracy',25],['sPar','Par maintenance',15],['sHand','Ship handover',10],['sMono','Mono discipline',5]];
  var pts=0;var body=rows.map(function(r){var v=(sl[r[0]]!=null)?sl[r[0]]:null;if(v!=null)pts+=v;return '<div class=scorerow><span>'+r[1]+'</span><b>'+(v!=null?v:'—')+' / '+r[2]+'</b></div>';}).join('');
  var gt=[];if(gates.rush)gt.push('RUSH');if(gates.audit)gt.push('AUDIT');
  var pending=['ray','rolando','dexter'].filter(function(r){return !(st[r]==='answered'||st[r]==='na');});
  return '<div class=scorebox style="margin-top:14px"><div class=scorerow style="font-weight:700;color:var(--navy)"><span>Accumulated contributor score</span><b>'+pts+' / 75</b></div>'+body
   +(gt.length?'<div class=gateflag>Gate armed: '+gt.join(', ')+' — would reset the bonus</div>':'')
   +(pending.length?'<div class=hint style="margin-top:6px">Still pending: '+pending.join(', ')+'. Communication (Rita) + supervisor eval (15) are added on the Score Card to reach 100%.</div>':'<div class=hint style="margin-top:6px">All three contributors in. Communication + supervisor eval are finalised on the Score Card.</div>')+'</div>';
}
async function openScore(id){
  var d=await (await fetch('/api/bonus/crew?id='+encodeURIComponent(id))).json();
  _SC=d; var cr=d.crew; var name=[cr.first_name,cr.middle_name,cr.last_name].filter(Boolean).join(' ');
  var warn=d.baseline_set?'':'<div class=warn>⚠ Starting count not yet confirmed for this crew — treated as 0. Confirm via the reconciliation sheet before any payout is finalised.</div>';
  var hist=d.outcomes.length?('<div class=hint style="margin-top:6px">Prior outcomes: '+d.outcomes.length+' · latest count '+d.outcomes[0].count_after+'</div>'):'';
  var _st=(cr.status||'').toLowerCase();
  var _onship=_st.indexOf('board')>=0;
  var scCls=_onship?'sc-on':'sc-off';
  var _today=new Date().toISOString().slice(0,10);
  var _aboard=(_onship&&d.lastLeg&&d.lastLeg.on)?monthsDays(d.lastLeg.on,_today):'';
  var sb=_onship?('<div class="sbadge on">● On board'+(_aboard?(' — '+_aboard+' aboard'):' — still serving')+'</div>')
       :(_st.indexOf('vac')>=0?'<div class="sbadge off">⚓ Off the ship — on vacation</div>'
       :'<div class="sbadge idle">● '+(cr.status||'status unknown')+'</div>');
  var body=''
   +sb
   +'<div class=hint>'+cr.agency_id+' · '+d.rank+' · Contract count <b>'+d.count+'</b> → completing makes it <b>'+(d.count+1)+'</b>. Ladder if clean &amp; ≥80%: <b>$'+d.nextRungIfClean.toLocaleString()+'</b>.</div>'
   +warn+hist+'<div id=fbPanel></div>'
   +'<div class=sec><span class=n>1</span>Contract</div>'
   +'<div class=f2><div class=fg><label class=req>Sign-on</label><input type=date id=spanStart onchange="recalcScore()"></div><div class=fg><label class=req>Sign-off</label><input type=date id=spanEnd onchange="recalcScore()"></div></div>'
   +'<div class=hint id=dateEcho style="margin:-6px 0 10px"></div>'
   +'<div class=fg><label>Ship(s) — comma-separate for transfers</label><input type=text id=ships value="'+(cr.vessel_observed||'').replace(/"/g,'')+'"></div>'
   +'<div class=sec><span class=n>2</span>Outcome &amp; gates</div>'
   +'<span class=ck style="cursor:pointer" onclick="tgFlip(\\'gComplete\\')"><input type=checkbox id=gComplete checked onchange="recalcScore()" style="pointer-events:none"> Contract completed in full</span>'
   +'<span class=ck style="cursor:pointer" onclick="tgFlip(\\'gCompassion\\')"><input type=checkbox id=gCompassion onchange="recalcScore()" style="pointer-events:none"> Not completed — approved compassionate leave (treat as completed)</span>'
   +'<span class="ck ckgate" id=rowRush style="cursor:pointer" onclick="tgFlip(\\'gRush\\')"><input type=checkbox id=gRush onchange="recalcScore()" style="pointer-events:none"> Emergency/rush order from ordering failure <b>— resets count to 0</b></span>'
   +'<span class="ck ckgate" id=rowAudit style="cursor:pointer" onclick="tgFlip(\\'gAudit\\')"><input type=checkbox id=gAudit onchange="recalcScore()" style="pointer-events:none"> Failed end-of-contract inventory audit <b>— resets count to 0</b></span>'
   +'<div class=fg id=gateNoteWrap style="display:none"><label class=req>Reason &amp; evidence (required for a reset gate)</label><textarea id=gateNote rows=2 placeholder="e.g. Rush airfreight magenta toner 12 Mar — par hit 0, prior order skipped. Zendesk #5843."></textarea></div>'
   +'<div class=sec><span class=n>3</span>Scorecard</div>'
   +'<div class=scsec id=scoreSection><div class=gateban id=gateBan></div>'
   +'<div class=hint style="margin:-2px 0 8px">Award each factor from evidence (sliders start at 0).</div>'
   +rng('sOrder','On-time ordering',20)+rng('sAcc','Order accuracy',25)+rng('sPar','Par maintenance',15)
   +rng('sHand','Ship-condition handover',10)+rng('sComm','Communication (manual — Rita)',10)+rng('sMono','Mono click discipline (<20%)',5)
   +'<div class=fg style="margin-top:10px"><label>Supervisor evaluation (1–5) — 15%</label><select id=sEval onchange="recalcScore()"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select><div class=hint>1–2 → bonus forfeited, count held. 3/4/5 → full 15 points.</div></div>'
   +'</div>'
   +'<div class=resultbar id=resultBar><div id=scoreOut></div><div class=rbtns><button class="btn ghost" onclick="mClose()">Cancel</button><button class="btn green" id=commitBtn onclick="commitBonus()">Commit</button></div></div>';
  $('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class="modal '+scCls+'"><div class=mh>Score Card — '+name+'<button onclick="mClose()">×</button></div><div class=mb>'+body+'</div></div></div>';MODAL_T=Date.now();
  if(d.lastLeg){if(d.lastLeg.on)$('#spanStart').value=d.lastLeg.on;if(d.lastLeg.off)$('#spanEnd').value=d.lastLeg.off;}
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
function fmtDate(iso){if(!iso)return'—';var m=['January','February','March','April','May','June','July','August','September','October','November','December'];var p=String(iso).split('-');if(p.length!==3)return iso;var mo=m[parseInt(p[1],10)-1];if(!mo)return iso;return mo+' '+parseInt(p[2],10)+', '+p[0];}
function recalcScore(){
  for(var k in FW){var e=$('#'+k);if(e)$('#'+k+'v').textContent=e.value;}
  var de=$('#dateEcho');if(de){var on=$('#spanStart').value,off=$('#spanEnd').value;de.innerHTML=(on||off)?('Reads as <b>'+fmtDate(on)+'</b> → <b>'+fmtDate(off)+'</b>'+((on&&off&&off<on)?' <span style="color:var(--red);font-weight:700">— sign-off is before sign-on!</span>':'')):'';}
  var rush=$('#gRush').checked,audit=$('#gAudit').checked;
  $('#gateNoteWrap').style.display=(rush||audit)?'block':'none';
  $('#rowRush').className='ck ckgate'+(rush?' on':'');
  $('#rowAudit').className='ck ckgate'+(audit?' on':'');
  var r=computeBonusC();
  var isReset=(r.gate==='rush'||r.gate==='audit'||r.gate==='not_completed');
  $('#scoreSection').className='scsec'+(isReset?' gated':'');
  $('#gateBan').innerHTML=isReset?('GATE: '+gateLabel(r.gate)+' → payout $0 and count resets to 0. The scores below are still recorded for the file, but they don\\'t change this outcome.'):'';
  var msg=r.gate?(r.gate==='eval_below_3'?'Forfeited — count holds at '+r.count:'Resets count to 0'):(r.score<80?'Below 80% floor — count advances to '+r.nextCount:'Ladder $'+r.rung.toLocaleString()+' × '+r.score+'%');
  var nums='<div class=rnums><span>Score <b>'+r.score+'%</b> / floor 80</span><span>Count <b>'+r.count+' → '+r.nextCount+'</b></span>'+(r.gate?'<span class=gchip>'+gateLabel(r.gate)+'</span>':'<span class=hint style="margin:0">'+msg+'</span>')+'</div>';
  $('#scoreOut').innerHTML=nums+'<div class="rpay '+(r.pay===0?'zero':'')+'">$'+r.pay.toLocaleString()+'</div>';
}
async function commitBonus(){
  var ss=$('#spanStart'),se=$('#spanEnd');
  ss.classList.toggle('bad',!ss.value);se.classList.toggle('bad',!se.value);
  if(!ss.value||!se.value){(!ss.value?ss:se).focus();return;}
  var btn=$('#commitBtn');btn.disabled=true;btn.textContent='Committing…';
  var sliders={};for(var k in FW)sliders[k]=parseInt($('#'+k).value);
  var payload={agency_id:_SC.crew.agency_id,spanStart:$('#spanStart').value,spanEnd:$('#spanEnd').value,
    ships:$('#ships').value.split(',').map(function(s){return s.trim();}).filter(Boolean),
    sliders:sliders,evalScore:parseInt($('#sEval').value),
    gates:{complete:$('#gComplete').checked,compassion:$('#gCompassion').checked,rush:$('#gRush').checked,audit:$('#gAudit').checked},
    gateNote:$('#gateNote')?$('#gateNote').value:''};
  var res=await (await fetch('/api/bonus/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).json();
  if(res.error){btn.disabled=false;btn.textContent='Commit';var msgs={gate_note_required:'A reset gate needs a written reason & evidence.',span_required:'Enter sign-on and sign-off dates.',span_invalid:'Sign-off must be after sign-on.',not_authorised:'Only the GM or Head of HR can commit a bonus payout.'};alert(msgs[res.error]||('Error: '+res.error));return;}
  var r=res.result;MODAL_T=Date.now();
  $('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class=modal><div class=mh>Bonus committed<button onclick="mClose()">×</button></div><div class=mb><div class=hint>Contract '+res.group+' · '+res.ships.join(' → ')+'</div><div class="bigpay '+(r.pay===0?'zero':'')+'">$'+r.pay.toLocaleString()+'</div><div class=scorebox><div class=scorerow><span>Scorecard</span><b>'+r.score+'%</b></div><div class=scorerow><span>Count</span><b>'+r.count+' → '+r.nextCount+'</b></div>'+(r.gate?'<div class=gateflag>GATE: '+gateLabel(r.gate)+'</div>':'')+'</div><div class=hint>Recorded as an immutable outcome under policy v1. The crew\\'s count is now '+r.nextCount+'.</div><div class=mf><button class="btn green" onclick="mClose();show(\\'contracts\\')">Done</button></div></div></div></div>';
}
// Backdrop close, guarded against the "ghost click" on touch devices: tapping a Score/row button
// fires a delayed synthetic click (~300ms) that lands on the freshly-mounted overlay and used to
// close the modal instantly. Ignore overlay clicks for the first 450ms after a modal opens.
var MODAL_T=0;
function ovc(e){ if(e.target===e.currentTarget && (Date.now()-MODAL_T)>450) mClose(); }
function mClose(){$('#modalRoot').innerHTML='';}
// Toggle a checkbox explicitly from its wrapper's click (the input itself is pointer-events:none, so
// it never receives a native tap). One tap = exactly one flip + one change event, on every device —
// avoids the iPad double-toggle where a label-associated checkbox fires twice and lands back where it
// started. Used by the rotation/contract toggles, bonus gates, and the Retired tag.
function tgFlip(id){var c=document.getElementById(id);if(!c)return;c.checked=!c.checked;c.dispatchEvent(new Event('change',{bubbles:true}));}
show('dashboard');
</script>
<div id=modalRoot></div></body></html>`;
