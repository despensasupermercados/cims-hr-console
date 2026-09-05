import { ladderValue, computeBonus, mapFeedbackToScore } from "./bonus.js";
import { signToken, verifyToken } from "./auth.js";
import { magicLinkEmail } from "./emails/hr.magiclink.v2.js";
import { crewComplianceReport } from "./compliance.js";
import { buildRotationBoard } from "./rotation.js";import { resolveCity, groupPortDays } from "./city_resolver.js";
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
import { SHIP_HISTORY } from "./ship_history.js"; import { boardSource, boardLegsFromDb } from "./ship_leg_source.js"; import { handleRelief } from "./relief_api.js";
import { handleCrewImport } from "./crew_import_routes.js";
import { buildShipKeys, canonShipWith, validShipKeys, AZAMARA_SHORT } from "./shipname.js";
import { applyOverride, OVR_FIELDS } from "./override.js";
import { contractLedgerRow, psRank, psSalary, tierContracts } from "./ledger.js";
import { contractCounts, fullContracts, deriveStatus } from "./contracts.js";
import { parseContractCounter, buildKeymanRows } from "./keymanimport.js";
import { classifyWindow } from "./scorequeue.js";
import { buildRoster, matchCrew } from "./crewmatch.js";
import { pickEngine, intelSystemPrompt, intelUserPrompt, parseIntelResponse, INTEL_MODEL_CLAUDE, INTEL_MODEL_WORKERSAI } from "./intelai.js";
import { buildSeafarerMovementEmail, shapeMovements, monthsLabel } from "./seafarer_movements.js";
import { projectFutureLegs, fetchArrivals } from "./leg_projection.js";
import { annotateReliefCoverage } from "./relief_coverage.js";
import { maybeSendDocRadar, docRadarPreviewResponse, docRadarSendResponse } from "./doc_radar.js";
import { runMaria, mariaQuickTitle, rankCrewMatches, assertReadOnlySql, isHiddenTable, SQL_MAX_ROWS } from "./maria.js";
import { runEvals } from "./maria_eval.js";
import { installAck } from "./signoff_ack.js";
import { installInstr } from "./signoff_instructions.js";
import { installAutoSend } from "./auto_send.js";
import { installSbm } from "./sbm.js";
import { installSeval } from "./seval.js";
import { apiRosterExport } from './roster_export.js';
const _autoInstr = installInstr({ json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF, sendViaMailer });
const _autoAck = installAck({ json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF, sendViaMailer });
const _runAutoSend = installAutoSend({ sendInstructionsFor: _autoInstr.sendInstructionsFor, sendSignoffLinkFor: _autoAck.sendSignoffLinkFor, sendViaMailer, BOARD_LEGS: autoSendBoardLegs, ORIGIN: "https://cims.work", DIGEST_TO: ["Miguel.Sanmartin@dg3.com"], DIGEST_CC: ["Rita.Berenyi@dg3.com"] });
// Shipboard Management Review (Phase A): survey page, submit, T-7/T-4 sweep,
// crew cards. Same install pattern as auto-send. NO money code here -- the
// Score Card / sEval integration is a separate human-approved Phase B PR.
const _seval = installSeval({});
const _sbm = installSbm({ sendViaMailer, logActivity, SECTIONS: rotationSections, VESSEL_REF, ORIGIN: "https://cims.work", onReviewStored: _seval.sevalAutoApply });
// Live legs for auto-timing: the SAME resolved dates the Keyman board displays
// and billing uses (rotationSections), NOT the historical keyman_contract3.
async function autoSendBoardLegs(env) {
  const { sections } = await rotationSections(env);
  const out = [];
  for (const s of (sections || [])) for (const c of (s.crew || [])) {
    if (!c || !c.agency_id || !c.signOff) continue;
    out.push({ sc: c.agency_id, name: c.name || null, ship: c.ship || null, off: String(c.signOff).slice(0, 10), port: c.disembark || null });
  }
  return out;
}
// Called when the toggle flips OFF->ON: mark everything already inside the T-14/T-7
// windows as handled (note 'seeded') so enabling never emails historical crossings.
// Only legs that cross into a window AFTER enabling will fire.
async function autoSendSeed(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS auto_send_log (sc TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, sent_at TEXT NOT NULL, note TEXT, PRIMARY KEY (sc, seq, kind))").run();
  const legs = await autoSendBoardLegs(env);
  const today = new Date().toISOString().slice(0, 10);
  const plus = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  const t14 = plus(14), t7 = plus(7);
  const now = new Date().toISOString();
  let n = 0;
  for (const l of legs) {
    if (!l.off || l.off < today || l.off > t14) continue;
    const seq = parseInt(String(l.off).replace(/-/g, ""), 10) || 0;
    const r1 = await env.DB.prepare("INSERT OR IGNORE INTO auto_send_log (sc,seq,kind,sent_at,note) VALUES (?,?,'instructions',?,'seeded')").bind(l.sc, seq, now).run();
    if (r1.meta && r1.meta.changes) n += r1.meta.changes;
    if (l.off <= t7) {
      const r2 = await env.DB.prepare("INSERT OR IGNORE INTO auto_send_log (sc,seq,kind,sent_at,note) VALUES (?,?,'signoff',?,'seeded')").bind(l.sc, seq, now).run();
      if (r2.meta && r2.meta.changes) n += r2.meta.changes;
    }
  }
  return n;
}


async function apiAutoSend(request, env, session) {
  if (!session) return json({ error: "unauthorized" }, 401);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_setting (k TEXT PRIMARY KEY, v TEXT)").run();
  if (request.method === "POST") {
    if (!session) return json({ error: "unauthorized" }, 401);
    const b = await request.json().catch(function () { return {}; });
    const v = b.enabled === true ? "true" : "false";
    const prev = await env.DB.prepare("SELECT v FROM app_setting WHERE k='auto_send_enabled'").first();
    const wasOn = !!(prev && prev.v === "true");
    await env.DB.prepare("INSERT INTO app_setting (k,v) VALUES ('auto_send_enabled',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(v).run();
    let seeded = 0;
    if (v === "true" && !wasOn) {
      try { seeded = await autoSendSeed(env); }
      catch (e) {
        // FAIL CLOSED: if history cannot be seeded, do not arm the sender - an
        // unseeded first run would email the entire in-window backlog.
        await env.DB.prepare("INSERT INTO app_setting (k,v) VALUES ('auto_send_enabled','false') ON CONFLICT(k) DO UPDATE SET v=excluded.v").run();
        return json({ ok: false, enabled: false, error: "seeding failed - auto-timing left OFF, try again" }, 500);
      }
    }
    return json({ ok: true, enabled: v === "true", seeded: seeded });
  }
  const r = await env.DB.prepare("SELECT v FROM app_setting WHERE k='auto_send_enabled'").first();
  return json({ enabled: !!(r && r.v === "true") });
}

async function apiSbmToggle(request, env, session) {
  // SBM (shipboard reviews) master switch — mirrors apiAutoSend exactly:
  // same storage (app_setting). Reading is any-session; FLIPPING is MONEY_USERS
  // only (Miguel 2026-07-04) — arming customer-facing sends is a money-adjacent control.
  // src/sbm.js sbmDailySweep reads 'sbm_enabled' and no-ops while it is OFF.
  if (!session) return json({ error: "unauthorized" }, 401);
  if (request.method === "POST" && !isMoneyUser(session && session.email)) return json({ error: "money_users_only" }, 403);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_setting (k TEXT PRIMARY KEY, v TEXT)").run();
  if (request.method === "POST") {
    const b = await request.json().catch(function () { return {}; });
    const v = b.enabled === true ? "true" : "false";
    await env.DB.prepare("INSERT INTO app_setting (k,v) VALUES ('sbm_enabled',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(v).run();
    return json({ ok: true, enabled: v === "true" });
  }
  const r = await env.DB.prepare("SELECT v FROM app_setting WHERE k='sbm_enabled'").first();
  return json({ enabled: !!(r && r.v === "true") });
}

/* ============================================================
   DG3 CIMS — HR Operational Console · Cloudflare Worker (v1)
   Single-file ES module. Paste into the dashboard Worker editor.
   Bindings required:
     - D1 database bound as  DB   (the cims-hr-console database)
   Secrets (set in dashboard → Settings → Variables and Secrets):
     - SESSION_SECRET  (required) long random string; signs login + session tokens
     - BOOTSTRAP_KEY   (required for first login w/o email) long random string
     - MAILER service binding (cims-mailer) delivers ALL email; RESEND_API_KEY is no longer read
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
    const t0 = Date.now(); // PERF: request start, for the Server-Timing header on /api responses
    try {
      // Await the whole dispatch so an async handler's rejection is caught here and returned as a
      // clean JSON 500 — routes do `return apiX(...)` without await, and an unawaited rejection would
      // otherwise escape this try and surface as Cloudflare's raw error page (this bit /api/daysworked).
      // (Captured into `res` instead of returned directly so we can stamp Server-Timing below —
      // the await stays INSIDE this try, so the §11 error-boundary invariant is unchanged.)
      const res = await (async () => {
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

      // ---- public shipboard management review (token-authenticated, no login) ----
      if (p === "/sbm")                  return _sbm.sbmFormPage(request, env, url);
      if (p === "/api/sbm/submit" && request.method === "POST") return _sbm.sbmSubmit(request, env);

      // ---- everything below requires a session ----
      const session = await getSession(request, env);
      { const _a = await installAck({ json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF, sendViaMailer })(p, request, env, url, session); if (_a) return _a; }
      { const _i = await installInstr({ json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF, sendViaMailer })(p, request, env, url, session); if (_i) return _i; }
      if (p === '/api/roster/export') return apiRosterExport(request, env);
      if (p.startsWith("/api/")) {
        if (!session) return json({ error: "unauthorized" }, 401);
        if (p === "/api/me")        return json({ email: session.email });
        if (p === "/api/dashboard") return apiDashboard(env);
        if (p === "/api/crew")      return apiCrew(env, url);
        if (p === "/api/crew/get")  return apiCrewOne(env, url);
        if (p === "/api/crew/save" && request.method === "POST") return apiCrewSave(request, env, session);
        if (p === "/api/crew/add"  && request.method === "POST") return apiCrewAdd(request, env, session);
        if (p === "/api/crew/hide" && request.method === "POST") return apiCrewHide(request, env, session);
        if (p === "/api/crew/notes") return apiCrewNotes(request, env, session, url);
        if (p === "/api/crew/statement.pdf") return apiStatementPdf(env, url);
        if (p === "/api/crew/statement/email" && request.method === "POST") return apiStatementEmail(request, env, session);
        if (p === "/api/compliance") return apiCompliance(env, url);
        if (p === "/api/rotation")   return apiRotation(env);
        if (session) { const rr = await handleRelief(request, url, env); if (rr) return rr; }
        if (session) { const ci = await handleCrewImport(request, url, env); if (ci) return ci; }
        if (p === "/api/rotation/assign" && request.method === "POST") return apiRotationAssign(request, env, session);
        if (p === "/api/rotation/ready" && request.method === "POST") return apiReady(request, env, session);
        if (p === "/api/rotation/crew") return apiRotationCrew(env, url);
        if (p === "/api/rotation/note" && request.method === "POST") return apiNote(request, env, session);
        if (p === "/api/rotation/contract" && request.method === "POST") return apiContractEdit(request, env, session);
        if (p === "/api/fleet")      return apiFleet();
        if (p === "/api/datastatus") return apiDataStatus(env);
        if (p === "/api/autosend") return apiAutoSend(request, env, session);
        if (p === "/api/sbmtoggle") return apiSbmToggle(request, env, session);
        if (p === "/api/crew/import" && request.method === "POST") return json({ error: "retired_use_reviewed_importer", detail: "The direct crew import was retired. Use the reviewed importer: GET /api/crew/import, POST /api/crew/import/stage, POST /api/crew/import/apply." });
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
        if (p === "/api/sbm/crew")       return json(await _sbm.sbmCrewCards(env, url.searchParams.get("id")));
        if (p === "/api/sbm/invite" && request.method === "POST") return _sbm.sbmInviteRequest(request, env, session);
        if (p === "/api/score/queue")    return apiScoreQueue(env, url);
        if (p === "/api/score/seval")    return _seval.apiSevalGet(env, url);
        if (p === "/api/score/seval/override" && request.method === "POST") return _seval.apiSevalOverride(request, env, session, isMoneyUser);
        if (p === "/api/intel/inbox")    return apiIntelInbox(env);
        if (p === "/api/intel/ingest" && request.method === "POST") return apiIntelIngest(request, env, session);
        if (p === "/api/intel/file" && request.method === "POST") return apiIntelFile(request, env, session);
        if (p === "/api/intel/crew")     return apiIntelCrew(env, url);
        if (p === "/api/intel/review")   return apiIntelReview(env);
        if (p === "/api/intel/resolve" && request.method === "POST") return apiIntelResolve(request, env, session);
        if (p === "/api/intel/edit" && request.method === "POST") return apiIntelEdit(request, env, session);
        if (p === "/api/intel/run" && request.method === "POST") { const n = await processIntelInbox(env, 25); return json({ ok: true, processed: n, engine: pickEngine(env) }); }
        if (p === "/api/movements/preview") return apiMovementsPreview(env, url);
        if (p === "/api/movements/send" && request.method === "POST") return apiMovementsSend(request, env, session);
if (p === "/api/health/preview") return docRadarPreviewResponse(env, url);
if (p === "/api/health/send" && request.method === "POST") return docRadarSendResponse(request, env, session);
        if (p === "/api/rotation/upcoming") return apiRotationUpcoming(env, url);
        if (p === "/api/ask" && request.method === "POST") return apiAsk(request, env, session);
        if (p === "/api/maria/feedback" && request.method === "POST") return apiMariaFeedback(request, env, session);
        if (p === "/api/maria/eval" && request.method === "POST") return apiMariaEval(request, env, session);
        if (p === "/api/maria/knowledge" && request.method === "POST") return apiMariaKnowledge(request, env, session);
        return json({ error: "not found" }, 404);
      }
      // app shell (any non-api path) — gate on session
      if (!session) return Response.redirect(url.origin + "/login", 302);
      if (p === "/preview/hr.magiclink.v2") {
        const { html } = magicLinkEmail({ link: "https://cims.work/auth/verify?token=SAMPLE.PREVIEW" });
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (p === "/relief") { const rr = await handleRelief(request, url, env); if (rr) return rr; }

      // Recruitment monthly report — external form. The full URL (including its access
      // key) lives ONLY in the RECRUITMENT_FORM_URL Worker secret, never in this repo.
      if (p === "/go/recruitment") {
        if (env.RECRUITMENT_FORM_URL) return Response.redirect(env.RECRUITMENT_FORM_URL, 302);
        return new Response("Recruitment link not configured (set the RECRUITMENT_FORM_URL secret).", { status: 503 });
      }

      return htmlResponse(APP_HTML);
      })();
      // PERF instrumentation: stamp total server time on every API response so per-request cost
      // is visible in browser devtools (Network -> Timing -> Server Timing). Read-only; on any
      // copy failure we return the original response untouched.
      if (p.startsWith("/api/") && res instanceof Response) {
        try {
          const out = new Response(res.body, res);
          out.headers.set("Server-Timing", "app;dur=" + (Date.now() - t0));
          return out;
        } catch { return res; }
      }
      return res;
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
    if (ctx && ctx.waitUntil) ctx.waitUntil(maybeSendMovements(env, event)); if (ctx && ctx.waitUntil) ctx.waitUntil(maybeExportBackup(env, event));
if (ctx && ctx.waitUntil) ctx.waitUntil(maybeSendDocRadar(env, event));
    if (ctx && ctx.waitUntil) ctx.waitUntil(_runAutoSend(env, event));
    // SBM review sweep (T-7 invite / T-4 reminder). Guarded so a sweep failure can never break the existing cron.
    if (ctx && ctx.waitUntil) ctx.waitUntil(_sbm.sbmDailySweep(env).catch(function (e) { console.error("sbm_sweep", (e && e.stack) || e); }));
    if (ctx && ctx.waitUntil) ctx.waitUntil(projectFutureLegs(env, { today: nyDateStr() }).catch(function (e) { console.error("leg_projection", (e && e.stack) || e); }));
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
// Memoized once per isolate (§12) — 7 INSERT OR IGNORE round trips on every login otherwise.
const ensureUsers = memoEnsure(ensureUsersImpl);
async function ensureUsersImpl(env) {
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
  if (env.MAILER) {
    await sendMagicLink(env, email, link).catch(() => {});
    await logActivity(env, email, "login_request", "emailed");
    return json({ ok: true, sent: true });
  }
  // No email provider configured yet: instruct to use bootstrap.
  await logActivity(env, email, "login_request", "no_mailer");
  return json({ ok: true, sent: false, note: "Email sending is not configured yet. Use the bootstrap link." });
}

// ---- Central transport (cims-mailer service binding) -----------------------
// This app builds content; cims-mailer owns the Resend key, retries/outbox,
// and mail_log. Injected into signoff modules via deps.
// Envelope contract: cims-mailer/docs/EMAIL-CONVENTION.md
async function sendViaMailer(env, envelope) {
  if (!env.MAILER) return { ok: false, error: "MAILER binding missing" };
  try {
    const res = await env.MAILER.fetch("https://mailer/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: "cims-hr-console", from: env.MAIL_FROM || "CIMS <cims@cims.work>", ...envelope })
    });
    const out = await res.json().catch(() => ({}));
    return out && typeof out === "object" ? out : { ok: false, error: "bad mailer response" };
  } catch (e) {
    return { ok: false, error: "mailer call threw: " + String(e && e.message || e).slice(0, 300) };
  }
}

async function sendMagicLink(env, email, link) {
  // NOT critical: a magic link delivered an hour late is useless — fail fast.
  const { subject, html, text } = magicLinkEmail({ link });
  await sendViaMailer(env, {
    templateId: "hr.magiclink.v2",
    to: [email],
    subject, html, text,
    critical: false
  });
}

/* -------------------- Seafarer Movements weekly email -------------------- */
async function movementsData(env, runDate, days = 7) {
  const { sections, pool } = await rotationSections(env);
  const crew = [];
  for (const s of (sections || [])) for (const c of (s.crew || [])) crew.push(c);
  const md = shapeMovements(crew, runDate, days);

   // ---- ARRIVING (fixed 2026-07-27) ----------------------------------------
   // rotationSections reads ship_leg WHERE is_current=1 — by definition only
   // legs already under way — so it can NEVER yield a future sign-on and this
   // section rendered 0 every single week since launch. Forward legs are
   // projected from assignment (the table the relief board actually writes)
   // into ship_leg as is_current=0 rows by src/leg_projection.js. This is the
   // ONLY reader of that forward set; every other query keeps its is_current=1
   // filter, so the board, dashboard and billing export are untouched.
   const startS = String(runDate).slice(0, 10);
   const _e = new Date(startS + "T00:00:00Z"); _e.setUTCDate(_e.getUTCDate() + days);
   const endS = _e.toISOString().slice(0, 10);
   try {
     const contractsBy = {};
     for (const c of crew) contractsBy[c.agency_id] = c.contracts;
     for (const c of (pool || [])) contractsBy[c.agency_id] = c.contracts;
     const seen = new Set(md.signOns.map(p => p.name + "|" + p.date));
     for (const a of await fetchArrivals(env, startS, endS)) {
       const nm = a.name || a.agency_id;
       const key = nm + "|" + a.signOn;
       if (seen.has(key)) continue; // don't double-count once a leg is promoted
       seen.add(key);
       md.signOns.push({
         name: nm,
         vessel: a.ship,
         port: a.embark || "TBA",
         date: a.signOn,
         contract: monthsLabel(a.signOn, a.signOff),
         // Badge a new hire ONLY on a positively-known zero. Absent from the
         // roster map means unknown, not new — a wrong badge is worse than none.
         newHire: contractsBy[a.agency_id] === 0,
       });
     }
     md.signOns.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
   } catch (e) {
     // Arrivals are additive. A failure here must never cost us the departures
     // email, which is the part Crew Ops already depends on.
     console.error("movements_arrivals", (e && e.stack) || e);
   }

   await annotateReliefCoverage(env, md.signOffs);
   return md;
}
function nyDateStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
async function renderMovements(env, runDate) {
  const { signOns, signOffs } = await movementsData(env, runDate);
  return { html: buildSeafarerMovementEmail({ runDate, signOns, signOffs }), on: signOns.length, off: signOffs.length };
}
async function sendMovementsEmail(env, to, runDate) {
  const { html, on, off } = await renderMovements(env, runDate);
  if (!env.MAILER) return { ok: false, sent: false, note: "no_mailer", on, off };
  // CRITICAL: the Monday movements email queues + retries centrally if the
  // provider is down (late > lost). Cron dedup stays in data_meta as before.
  const out = await sendViaMailer(env, {
    templateId: "hr.movements.v1",
    to: [to],
    subject: `Seafarer Movements · week of ${runDate} (${on} on / ${off} off)`,
    html,
    critical: true
  });
  return { ok: !!out.ok, sent: !!out.ok, status: out.status || (out.ok ? "sent" : "failed"), to, on, off };
}
async function apiMovementsPreview(env, url) {
  const date = url.searchParams.get("date") || nyDateStr();
  const { html } = await renderMovements(env, date);
  return htmlResponse(html);
}
// GET /api/rotation/upcoming?days=N -> upcoming sign-ons/offs from the LIVE schedule (rotationSections).
async function apiRotationUpcoming(env, url) {
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 10, 1), 60);
  const runDate = nyDateStr();
  const { signOns, signOffs } = await movementsData(env, runDate, days);
  return json({ from: runDate, days, arriving: signOns, departing: signOffs });
}
async function apiMovementsSend(request, env, session) {
  if (!isMoneyUser(session.email)) return json({ error: "forbidden" }, 403);
  const b = await request.json().catch(() => ({}));
  const to = b.to || env.MOVEMENTS_TO || "Miguel.Sanmartin@dg3.com";
  const date = b.date || nyDateStr();
  const res = await sendMovementsEmail(env, to, date);
  await logActivity(env, session.email, "movements_send", `${to} ${date} ${res.on}/${res.off}`);
  return json(res);
}
async function maybeExportBackup(env, event) {
  try {
    if (!env.EXPORTS) return;
    const now = event && event.scheduledTime ? new Date(event.scheduledTime) : new Date();
    const day = nyDateStr(now);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS data_meta (k TEXT PRIMARY KEY, v TEXT)").run();
    const prev = await env.DB.prepare("SELECT v FROM data_meta WHERE k='export_last_date'").first();
    if (prev && prev.v === day) return;
    const rows = (await env.DB.prepare("SELECT l.ship_short AS ship, l.brand, l.sc, l.embark, l.on_date, l.off_date, l.disembark, TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew FROM ship_leg l LEFT JOIN crew c ON c.id = l.crew_id WHERE l.is_current = 1 AND l.ours = 1 ORDER BY l.brand, l.ship_short").all()).results;
    const esc = (x) => { x = String(x == null ? "" : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const head = ["Ship","Brand","Keyman","Agency ID","Embark port","Sign-on","Sign-off","Debark port","Reliever","Reliever embark","Reliever sign-off","Reliever debark"];
    const lines = [head.join(",")];
    for (const r of rows) lines.push([r.ship, r.brand, r.crew, r.sc, r.embark, r.on_date || "TBA", r.off_date || "TBA", r.disembark, "", "", "", ""].map(esc).join(","));
    await env.EXPORTS.put("keyman/keyman_board_" + day + ".csv", lines.join("\n"), { httpMetadata: { contentType: "text/csv" } });
    await env.DB.prepare("INSERT INTO data_meta (k,v) VALUES ('export_last_date',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(day).run();
  } catch (e) { console.error("export_backup", (e && e.stack) || e); }
}

async function maybeSendMovements(env, event) {
  try {
    const to = env.MOVEMENTS_TO; if (!to) return;
    const now = event && event.scheduledTime ? new Date(event.scheduledTime) : new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(now);
    const get = t => (parts.find(x => x.type === t) || {}).value;
    if (get('weekday') !== 'Mon' || get('hour') !== '07') return;
    const runDate = nyDateStr(now);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS data_meta (k TEXT PRIMARY KEY, v TEXT)").run();
    const prev = await env.DB.prepare("SELECT v FROM data_meta WHERE k='movements_last_sent'").first();
    if (prev && prev.v === runDate) return;
    const res = await sendMovementsEmail(env, to, runDate);
    if (res.sent) await env.DB.prepare("INSERT INTO data_meta (k,v) VALUES ('movements_last_sent',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(runDate).run();
  } catch (e) { console.error("movements_cron", (e && e.stack) || e); }
}

/* -------------------- Ask Maria: read-only AI Q&A over CIMS data -------------------- */
// Maps Maria's tool calls to the SAME read-only data functions the UI uses. No writes, ever.
async function mariaExecTool(env, name, input) {
  const base = "https://cims.work";
  const J = async (resp) => { try { return await resp.json(); } catch (e) { return { error: "parse_failed" }; } };
  const fullName = (c) => [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ").trim();
  if (name === "workforce_summary") return await J(await apiDashboard(env));
  if (name === "upcoming_movements") {
    const days = Math.min(Math.max(Number(input.days) || 10, 1), 60);
    const md = await movementsData(env, nyDateStr(), days);
    return { window_from: nyDateStr(), window_days: days, arriving: md.signOns, departing: md.signOffs };
  }
  if (name === "fleet_status") return await J(await apiFleet());
  if (name === "billing_month") return await J(await apiBillingMonth(env));
  if (name === "contract_ledger") return await J(await apiContracts(env));
  if (name === "travel_summary") return await J(await apiTravel(env, new URL(base + "/api/travel")));
  if (name === "compliance_expiring") { const d = Number(input.days) || 90; return await J(await apiCompliance(env, new URL(base + "/api/compliance?days=" + d))); }
  if (name === "find_crew") {
    const all = await J(await apiCrew(env, new URL(base + "/api/crew")));
    const wantRetired = input.include_retired === true;
    const isRetired = (c) => !!c.retired || String(c.status || "").toLowerCase() === "retired";
    const rows = (all.crew || []).filter(c => wantRetired || !isRetired(c)).map(c => ({ c, name: fullName(c) }));
    const ranked = rankCrewMatches(rows, String(input.name || ""), 6);
    const exact = ranked.length > 0 && ranked[0].exact;
    const picks = ranked.filter(r => r.exact || r.score >= 0.5);
    const fields = (c) => ({ agency_id: c.agency_id, name: fullName(c), status: c.status, rank: c.rank, vessel: c.vessel_observed, client: c.client, contract_count: c.contract_count, baseline_set: c.baseline_count != null, dob: c.dob, passport_no: c.pp_no, province: c.province, phone: c.phone, email: c.email, last_contract_sign_on_historical: c.active_on, last_contract_sign_off_historical: c.active_off, medical_exp: c.med_exp, seamans_book_exp: c.sirb_exp, passport_exp: c.pp_exp, us_visa_exp: c.usv_exp, schengen_exp: c.sch_exp });
    return { query: input.name, scope: (input.include_retired === true) ? "all crew incl. retired" : "active crew only (retired excluded)", exact_match: !!exact, matches: (picks.length ? picks : ranked.slice(0, 3)).map(r => Object.assign(fields(r.item.c), { match_confidence: Math.round(r.score * 100) / 100 })) };
  }
  if (name === "list_crew") {
    const all = await J(await apiCrew(env, new URL(base + "/api/crew")));
    const wantRetired = input.include_retired === true || String(input.status || "").toLowerCase() === "retired";
    const isRetired = (c) => !!c.retired || String(c.status || "").toLowerCase() === "retired";
    let rows = (all.crew || []).filter(c => wantRetired || !isRetired(c));
    if (input.status) rows = rows.filter(c => String(c.status || "").toLowerCase() === String(input.status).toLowerCase());
    if (input.ship) rows = rows.filter(c => String(c.vessel_observed || "").toLowerCase().includes(String(input.ship).toLowerCase()));
    return { scope: (input.include_retired === true || String(input.status || "").toLowerCase() === "retired") ? "all crew" : "active crew only", count: rows.length, crew: rows.slice(0, 60).map(c => ({ name: fullName(c), status: c.status, rank: c.rank, vessel: c.vessel_observed, client: c.client })) };
  }
  const resolveCrewId = async (inp) => {
    if (inp.agency_id) return String(inp.agency_id);
    if (inp.name) { const all = await J(await apiCrew(env, new URL(base + "/api/crew"))); const rows = (all.crew || []).map(c => ({ c, name: fullName(c) })); const r = rankCrewMatches(rows, String(inp.name), 1)[0]; return r ? r.item.c.agency_id : null; }
    return null;
  };
  if (name === "crew_intel") {
    const id = await resolveCrewId(input);
    if (!id) return { error: "no crew matched; provide a name or agency_id" };
    const intel = await J(await apiIntelCrew(env, new URL(base + "/api/intel/crew?id=" + encodeURIComponent(id))));
    const notes = await J(await apiCrewNotes({ method: "GET" }, env, null, new URL(base + "/api/crew/notes?id=" + encodeURIComponent(id))));
    return { agency_id: id, field_intel: intel.intel || [], manual_notes: notes.notes || [] };
  }
  if (name === "crew_contract_history") {
    const id = await resolveCrewId(input);
    if (!id) return { error: "no crew matched; provide a name or agency_id" };
    return await J(await apiRotationCrew(env, new URL(base + "/api/rotation/crew?id=" + encodeURIComponent(id))));
  }
  if (name === "scoring_board") {
    const board = await J(await apiFeedbackBoard(env));
    const queue = await J(await apiScoreQueue(env, new URL(base + "/api/score/queue")));
    return { feedback_board: board, score_queue: queue };
  }
  if (name === "billing_range") {
    const u = new URL(base + "/api/daysworked");
    if (input.from) u.searchParams.set("from", String(input.from));
    if (input.to) u.searchParams.set("to", String(input.to));
    return await J(await apiDaysWorked(env, u));
  }
  if (name === "search_knowledge") {
    await ensureMariaKB(env);
    const q = String((input && input.query) || "").trim();
    if (!q) return { error: "query required" };
    const lim = Math.min(Math.max(parseInt((input && input.limit) || 5, 10) || 5, 1), 10);
    try {
      const r = await env.DB.prepare(
        "SELECT k.id, k.title, k.doc_date, k.source, k.tags, k.added_by, k.ts, snippet(maria_knowledge_fts, 1, '[', ']', ' … ', 12) AS hit " +
        "FROM maria_knowledge_fts JOIN maria_knowledge k ON k.id = maria_knowledge_fts.rowid " +
        "WHERE maria_knowledge_fts MATCH ? AND k.status = 'active' ORDER BY rank LIMIT ?"
      ).bind(q, lim).all();
      if (!r.results.length) return { query: q, matches: [], note: "No knowledge documents match. The knowledge base may simply not contain this yet." };
      return { query: q, matches: r.results.map(m => ({ id: m.id, title: m.title, doc_date: m.doc_date, source: m.source, tags: m.tags, added: (m.ts || "").slice(0, 10), snippet: m.hit })) };
    } catch (e) { return { error: "knowledge_search_failed: " + String((e && e.message) || e).slice(0, 160) }; }
  }
  // ---- Hybrid reach (2026-07): whole-database read access, gated in maria.js ----
  if (name === "describe_schema") {
    if (input && input.table) {
      const t = String(input.table);
      if (isHiddenTable(t)) return { error: "that table is hidden (backup/stale/config)" };
      const exists = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?").bind(t).all();
      if (!exists.results.length) return { error: "no such table: " + t };
      const safeName = t.replace(/[^a-zA-Z0-9_]/g, "");
      const cols = await env.DB.prepare("PRAGMA table_info(" + safeName + ")").all();
      return { table: t, columns: cols.results.map(c => ({ name: c.name, type: c.type })) };
    }
    const rows = await env.DB.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name").all();
    return { tables: rows.results.filter(r => !isHiddenTable(r.name)) };
  }
  if (name === "run_sql") {
    let safe;
    try { safe = assertReadOnlySql((input && input.sql) || "", { maxRows: SQL_MAX_ROWS }); }
    catch (e) { return { error: "query_rejected: " + String((e && e.message) || e) }; }
    try {
      const rs = await env.DB.prepare(safe).all();
      return { sql: safe, rows: rs.results, row_count: rs.results.length };
    } catch (e) { return { error: "query_failed: " + String((e && e.message) || e).slice(0, 200) }; }
  }
  return { error: "unknown tool: " + name };
}
// POST /api/ask {question, history?} -> { answer, sources } (session-gated, read-only)
async function apiAsk(request, env, session) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Ask Maria is not configured yet (no AI key set)." }, 503);
  const b = await request.json().catch(() => ({}));
  const question = String(b.question || "").slice(0, 1000).trim();
  if (!question) return json({ error: "Please type a question." }, 400);
  const history = Array.isArray(b.history) ? b.history.slice(-6) : [];
  const t0 = Date.now();
  // session is passed through to the tool layer so a future role-based filter is a
  // policy change in maria.js, not a rewire (mariaExecTool may ignore it today).
  const res = await runMaria({ apiKey: env.ANTHROPIC_API_KEY, question, history, today: TODAY(), execTool: (n, i) => mariaExecTool(env, n, i, session) });
  const ms = Date.now() - t0;
  // Full Q&A trace — the raw material for the golden-question eval set and the
  // correction loop. Never blocks the answer; failures are logged and swallowed.
  let logId = null;
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS maria_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), user_email TEXT, question TEXT, answer TEXT, error TEXT, sources TEXT, sql_run TEXT, steps INTEGER, in_tokens INTEGER, out_tokens INTEGER, ms INTEGER, verdict TEXT, note TEXT)").run();
    const sqlRun = (res.toolCalls || []).filter(c => c.name === "run_sql").map(c => String((c.input && c.input.sql) || "")).join("\n---\n");
    const ins = await env.DB.prepare("INSERT INTO maria_log (user_email, question, answer, error, sources, sql_run, steps, in_tokens, out_tokens, ms) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(session.email || "", question, String(res.answer || "").slice(0, 8000), res.error || null, JSON.stringify(res.sources || []), sqlRun || null, res.steps || 0, (res.usage && res.usage.input_tokens) || 0, (res.usage && res.usage.output_tokens) || 0, ms).run();
    logId = (ins && ins.meta && ins.meta.last_row_id) || null;
  } catch (e) { console.error("maria_log", (e && e.message) || e); }
  await logActivity(env, session.email, "maria_ask", question.slice(0, 120));
  return json({ answer: res.answer, sources: res.sources, error: res.error, detail: res.detail, log_id: logId });
}

// POST /api/maria/feedback {id, verdict:1|0, note?} — the correction loop's write path.
// Users may only grade THEIR OWN questions (WHERE user_email = session.email).
async function apiMariaFeedback(request, env, session) {
  const b = await request.json().catch(() => ({}));
  const id = parseInt(b.id, 10);
  if (!id) return json({ error: "id required" }, 400);
  const verdict = b.verdict === 1 || b.verdict === "1" || b.verdict === "up" ? "up" : "down";
  const note = String(b.note || "").slice(0, 500) || null;
  const r = await env.DB.prepare("UPDATE maria_log SET verdict=?, note=? WHERE id=? AND user_email=?")
    .bind(verdict, note, id, session.email || "").run();
  return json({ ok: true, changed: (r && r.meta && r.meta.changes) || 0 });
}

// POST /api/maria/eval — run the golden-question suite LIVE against prod data and
// store the scorecard. Money users only: it spends real model tokens (~8 questions).
// A pass-rate drop after a prompt/glossary/model change is a regression — treat as red.
// maria_knowledge: curated document knowledge + FTS5 index. Schema is the contract shared
// with the nightly Drive sweep — change BOTH together. Documents are context, never money.
// Memoized once per isolate (§12) — 5 DDL round trips on every Maria request otherwise.
const ensureMariaKB = memoEnsure(ensureMariaKBImpl);
async function ensureMariaKBImpl(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS maria_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), title TEXT NOT NULL, body TEXT NOT NULL, doc_date TEXT, source TEXT DEFAULT 'console', tags TEXT, ship TEXT, added_by TEXT, status TEXT DEFAULT 'active')").run();
  await env.DB.prepare("CREATE VIRTUAL TABLE IF NOT EXISTS maria_knowledge_fts USING fts5(title, body, content='maria_knowledge', content_rowid='id')").run();
  await env.DB.prepare("CREATE TRIGGER IF NOT EXISTS maria_kb_ai AFTER INSERT ON maria_knowledge BEGIN INSERT INTO maria_knowledge_fts(rowid, title, body) VALUES (new.id, new.title, new.body); END").run();
  await env.DB.prepare("CREATE TRIGGER IF NOT EXISTS maria_kb_ad AFTER DELETE ON maria_knowledge BEGIN INSERT INTO maria_knowledge_fts(maria_knowledge_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body); END").run();
  await env.DB.prepare("CREATE TRIGGER IF NOT EXISTS maria_kb_au AFTER UPDATE ON maria_knowledge BEGIN INSERT INTO maria_knowledge_fts(maria_knowledge_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body); INSERT INTO maria_knowledge_fts(rowid, title, body) VALUES (new.id, new.title, new.body); END").run();
}

// POST /api/maria/knowledge — add / list / retire knowledge documents. Money users only:
// knowledge shapes what Maria tells all 7 users, so curation stays with Miguel + Rita.
async function apiMariaKnowledge(request, env, session) {
  if (!isMoneyUser(session && session.email)) return json({ error: "money_users_only" }, 403);
  await ensureMariaKB(env);
  const b = await request.json().catch(() => ({}));
  const action = String(b.action || "add");
  if (action === "list") {
    const r = await env.DB.prepare("SELECT id, ts, title, doc_date, source, tags, status, length(body) AS bytes FROM maria_knowledge ORDER BY id DESC LIMIT 200").all();
    return json({ docs: r.results });
  }
  if (action === "retire" || action === "restore") {
    const id = parseInt(b.id, 10);
    if (!id) return json({ error: "id required" }, 400);
    const st = action === "retire" ? "retired" : "active";
    const r = await env.DB.prepare("UPDATE maria_knowledge SET status=? WHERE id=?").bind(st, id).run();
    await logActivity(env, session.email, "maria_kb_" + action, "doc " + id);
    return json({ ok: true, changed: (r && r.meta && r.meta.changes) || 0 });
  }
  let title = String(b.title || "").slice(0, 200).trim();
  const body = String(b.body || "").slice(0, 200000).trim();
  if (!body) return json({ error: "Please paste some text or drop a file first." }, 400);
  if (body.length < 20) return json({ error: "That's too short to be useful — add a bit more text." }, 400);
  // Title is optional: if the user didn't name it, Maria names it from the content. If the
  // AI naming call is unavailable (e.g. geo-blocked from where the Worker ran), fall back to
  // the document's first line so a save is never blocked by the model being unreachable.
  let named = false;
  if (!title) {
    title = (await mariaQuickTitle({ apiKey: env.ANTHROPIC_API_KEY, text: body })) || firstLineTitle(body);
    named = true;
  }
  // Date is auto-stamped to today unless the user supplied the document's own date.
  const docDate = String(b.doc_date || "").slice(0, 10) || TODAY();
  const ins = await env.DB.prepare("INSERT INTO maria_knowledge (title, body, doc_date, source, tags, ship, added_by) VALUES (?,?,?,?,?,?,?)")
    .bind(title, body, docDate, String(b.source || "console").slice(0, 40), String(b.tags || "").slice(0, 200) || null, String(b.ship || "").slice(0, 60) || null, session.email || "").run();
  await logActivity(env, session.email, "maria_kb_add", title.slice(0, 100));
  return json({ ok: true, id: (ins && ins.meta && ins.meta.last_row_id) || null, title, doc_date: docDate, named });
}
// Fallback titler when the AI naming call is unavailable: first non-empty line, cleaned of
// leading markdown heading marks and clipped to a sensible length.
function firstLineTitle(body) {
  const line = String(body || "").split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0) || "Untitled note";
  return line.replace(/^#+\s*/, "").slice(0, 80);
}

async function apiMariaEval(request, env, session) {
  if (!isMoneyUser(session && session.email)) return json({ error: "money_users_only" }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "no AI key set" }, 503);
  const t0 = Date.now();
  const out = await runEvals({ apiKey: env.ANTHROPIC_API_KEY, today: TODAY(), execTool: (n, i) => mariaExecTool(env, n, i, session) });
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS maria_eval (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), model TEXT, pass INTEGER, fail INTEGER, results_json TEXT, ms INTEGER, run_by TEXT)").run();
    await env.DB.prepare("INSERT INTO maria_eval (model, pass, fail, results_json, ms, run_by) VALUES (?,?,?,?,?,?)")
      .bind(out.model, out.pass, out.fail, JSON.stringify(out.results).slice(0, 60000), Date.now() - t0, session.email || "").run();
  } catch (e) { console.error("maria_eval", (e && e.message) || e); }
  await logActivity(env, session.email, "maria_eval", out.pass + "/" + out.total + " passed");
  return json(out);
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

// POST /auth/dev {key, email} -> bootstrap session (until email is wired).
// POST-ONLY by design: a long-lived shared secret must never travel in a URL query string
// (it would leak into CF request logs, browser history, and referrer headers). The login form POSTs.
async function authDev(request, env, url) {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const b = await request.json().catch(() => ({}));
  const key = b.key, email = b.email;
  if (!env.BOOTSTRAP_KEY || key !== env.BOOTSTRAP_KEY) return new Response("forbidden", { status: 403 });
  await ensureUsers(env).catch(() => {});
  if (!await isAllowed(env, email)) return new Response("not an allowlisted user", { status: 403 });
  const sess = await signToken({ email, p: "session", exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, env.SESSION_SECRET);
  await logActivity(env, email, "login", "bootstrap");
  const cookie = sessionCookie(sess);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Set-Cookie": cookie, "Content-Type": "application/json" } });
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
// The bundled KEYMAN_CONTRACTS seeds an EMPTY keyman_contract3 only (fresh DB / staging). Once the
// table is populated, the Keyman import (apiKeymanImport) is the ONLY refresh path — it refreshes
// matched crew and re-pins this version (CLAUDE.md §11). A bare version bump must never overwrite
// live rows.
//
// Why (P3.13 audit H6 — verified read-only on prod 2026-09-04): prod holds 47 hand-cleaned rows,
// all seq=1, sign_on 2025-10..2026-06. The bundled constant is 209 rows, seq 1..9, 2022-era. The
// previous rule ("reseed on version mismatch" + prune rows not in the constant) would have replaced
// the 47 clean rows with 2022 legs on the next bump: sbm's manual invite would resolve a 2022
// sign-off, and statements, crew cards and the days-worked export would read history that no longer
// exists. Money-adjacent and silent — so a populated table now refuses the bundled reseed.
const KEYMAN_VERSION = "2026-06-13-cc-v3";
// PERF: once-per-isolate memo for the ensure* schema guards. Before this, every hot request re-ran
// CREATE TABLE / ALTER TABLE / seed-version checks — each one a full Worker->D1 round trip on the
// write path. The DDL is idempotent, so running it once per (isolate, DB binding) is sufficient:
// new deploys create fresh isolates and re-check automatically. Keyed by env.DB (WeakMap) so tests
// with independent fake DBs keep their own state; a rejected ensure clears its slot and retries on
// the next request instead of caching the failure.
const _ensureMemo = new WeakMap();
function memoEnsure(fn) {
  return (env) => {
    let m = _ensureMemo.get(env.DB);
    if (!m) { m = new Map(); _ensureMemo.set(env.DB, m); }
    let pr = m.get(fn);
    if (!pr) {
      pr = Promise.resolve().then(() => fn(env)).catch((e) => { m.delete(fn); throw e; });
      m.set(fn, pr);
    }
    return pr;
  };
}
const ensureKeyman = memoEnsure(ensureKeymanImpl);
async function ensureKeymanImpl(env) {
  // PRIMARY KEY (sc,seq) + INSERT OR REPLACE = race-proof idempotent seeding. Earlier DELETE+INSERT
  // reseeds raced under concurrent requests and STACKED rows (3x duplication); this can't.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS keyman_contract3 (sc TEXT NOT NULL, km TEXT, ship TEXT, st TEXT, seq INTEGER, sign_on TEXT, proj_off TEXT, act_off TEXT, PRIMARY KEY (sc, seq))").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS data_meta (k TEXT PRIMARY KEY, v TEXT)").run();
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM keyman_contract3").first()).n;
  const ver = await env.DB.prepare("SELECT v FROM data_meta WHERE k='keyman_version'").first();
  const stale = !ver || ver.v !== KEYMAN_VERSION;
  if (n === 0 && KEYMAN_CONTRACTS.length) {
    // Empty table: seed from the bundled constant and pin the version.
    const stmt = env.DB.prepare("INSERT OR REPLACE INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off,act_off) VALUES (?,?,?,?,?,?,?,?)");
    await env.DB.batch(KEYMAN_CONTRACTS.map(r => stmt.bind(r.sc, r.km, r.ship, r.st, r.seq, r.on, r.proj, r.act)));
    await env.DB.prepare("INSERT INTO data_meta (k,v) VALUES ('keyman_version',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(KEYMAN_VERSION).run();
    await logData(env, "keyman_contract (Contract Counter " + KEYMAN_VERSION + ")", KEYMAN_CONTRACTS.length, "seeded");
  } else if (n > 0 && stale) {
    // Populated table + version drift: REFUSE the bundled reseed (see KEYMAN_VERSION). Re-pin so this
    // check stops firing on every new isolate, and leave the refusal in data_log so it is visible.
    // Refresh the data through the Keyman import, never the constant.
    // The pin is conditional (only when the stored version differs) and the refusal is logged only
    // when THIS isolate's pin landed: under a deploy several cold isolates race here and would
    // otherwise each add an identical refusal row, pushing real import history off the Data panel.
    const pin = await env.DB.prepare("INSERT INTO data_meta (k,v) VALUES ('keyman_version',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v WHERE data_meta.v IS NOT excluded.v").bind(KEYMAN_VERSION).run();
    if (!pin || !pin.meta || pin.meta.changes > 0) await logData(env, "keyman_contract (Contract Counter " + KEYMAN_VERSION + ")", n, "reseed_refused_table_populated");
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
  const roster = (await env.DB.prepare("SELECT agency_id, first_name, last_name, ship_crew_id FROM crew WHERE redacted=0").all()).results;
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
  // Re-pin the version. Since the reseed guard (ensureKeymanImpl) a populated table is never
  // overwritten by the bundled constant regardless of this pin; it only keeps the guard from logging
  // a spurious "reseed refused" row after this import.
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
  const rows = (await env.DB.prepare("SELECT sc, ship_short AS ship, on_date AS sign_on, off_date AS proj_off, NULL AS act_off FROM ship_leg WHERE ours=1 AND is_current=1 AND on_date IS NOT NULL").all()).results;
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
const ensureTravel = memoEnsure(ensureTravelImpl);
async function ensureTravelImpl(env) {
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
  // PERF (2026-07): this route used to issue ~15 D1 queries ONE AFTER ANOTHER — each a full
  // Worker->D1 round trip, so wall time was RTT x 15 even though every query runs in <1ms.
  // Now: the five compliance counts + total + vessels collapse into ONE pass over crew, and all
  // remaining queries are independent, so they run in a single concurrent wave (Promise.all).
  // The travel queries keyed off "latest year" inline via (SELECT MAX(year)...) instead of
  // waiting for a separate MAX(year) result. Outputs are byte-identical to the sequential version.
  await Promise.all([ensureKeyman(env), ensureCrewExtras(env), ensureTravel(env)]);
  const md = today.slice(5);
  const curY = +today.slice(0, 4), curM = +today.slice(5, 7);
  const TY = "(SELECT MAX(year) FROM travel_expense)"; // inline latest-year subquery (no extra round trip)
  const [hist, cc, csRes, ovRes, bo, bdRes, tyRow, trKind, trMs, trCat, trCy, HIST] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) contracts, COUNT(DISTINCT sc) crew, CAST(ROUND(SUM(julianday(off_date)-julianday(on_date))) AS INTEGER) days FROM ship_leg WHERE ours=1 AND is_current=1 AND on_date IS NOT NULL AND off_date IS NOT NULL AND off_date>on_date").first(),
    env.DB.prepare("SELECT COUNT(*) total, COUNT(DISTINCT vessel_observed) vessels, SUM(CASE WHEN med_exp IS NOT NULL AND med_exp < ?1 THEN 1 ELSE 0 END) med, SUM(CASE WHEN sirb_exp IS NOT NULL AND sirb_exp < ?1 THEN 1 ELSE 0 END) sirb, SUM(CASE WHEN pp_exp IS NOT NULL AND pp_exp < ?1 THEN 1 ELSE 0 END) pp, SUM(CASE WHEN usv_exp IS NOT NULL AND usv_exp < ?1 THEN 1 ELSE 0 END) usv, SUM(CASE WHEN sch_exp IS NOT NULL AND sch_exp < ?1 THEN 1 ELSE 0 END) sch FROM crew").bind(in90).first(),
    env.DB.prepare("SELECT agency_id, status, vessel_observed FROM crew WHERE redacted=0").all(),
    env.DB.prepare("SELECT agency_id, status, retired, vessel_observed FROM crew_override").all(),
    // Bonus committed to date (money path — read only). Resilient like the old try/catch.
    env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(pay_usd),0) p FROM bonus_outcome").first().catch(() => null),
    // Birthdays today (match MM-DD of dob).
    env.DB.prepare("SELECT first_name, last_name, vessel_observed FROM crew WHERE dob IS NOT NULL AND substr(dob,6,5)=? AND status='On board' ORDER BY last_name").bind(md).all(),
    env.DB.prepare("SELECT MAX(year) y FROM travel_expense").first(),
    env.DB.prepare("SELECT kind, SUM(total) t FROM travel_expense WHERE year=" + TY + " GROUP BY kind").all(),
    env.DB.prepare("SELECT month, SUM(total) t, SUM(air) a FROM travel_expense WHERE year=" + TY + " GROUP BY month ORDER BY month").all(),
    env.DB.prepare("SELECT COALESCE(SUM(air),0) air, COALESCE(SUM(hotel),0) hotel, COALESCE(SUM(medical),0) medical, COALESCE(SUM(visa),0) visa, COALESCE(SUM(food),0) food, COALESCE(SUM(transport),0) transport, COALESCE(SUM(other),0) other FROM travel_expense WHERE year=" + TY + " AND kind!='shoreside'").first(),
    // YTD crew spend: elapsed months = current month if latest year is the current year, else 12.
    env.DB.prepare("SELECT COALESCE(SUM(total),0) t FROM travel_expense WHERE year=" + TY + " AND kind!='shoreside' AND month <= CASE WHEN " + TY + "=? THEN ? ELSE 12 END").bind(curY, curM).first(),
    boardLegs(env), // the live schedule — same source as the crew list and rotation board (§11)
  ]);
  const total = cc.total || 0, vessels = cc.vessels || 0;
  const medExp = cc.med || 0, sirbExp = cc.sirb || 0, ppExp = cc.pp || 0, usvExp = cc.usv || 0, schExp = cc.sch || 0;
  // Count by EFFECTIVE status (auto-derived from the schedule; retired/manual win) so the dashboard
  // matches the crew cards and rotation board rather than the raw stored value.
  const cs = csRes.results;
  const csOv = {}; for (const o of ovRes.results) csOv[o.agency_id] = o;
  const csSched = scheduleBySc(HIST);
  const statusMap = {}, byClient = { "Royal Caribbean": 0, "Celebrity": 0, "Azamara": 0, "NCL": 0 };
  for (const c of cs) {
    const ov = csOv[c.agency_id], s = crewStatus(c, ov, csSched[c.agency_id], today);
    statusMap[s] = (statusMap[s] || 0) + 1;
    // Donut counts the same ACTIVE set as the tiles (exclude Retired/Inactive), by client/brand.
    if (s !== "Retired" && s !== "Inactive") byClient[clientOf((ov && ov.vessel_observed) || c.vessel_observed)] += 1;
  }
  // (byClient is computed above from the same derived-status active set as the workforce tiles.)
  const bonus = { committed: (bo && bo.n) || 0, pay: (bo && bo.p) || 0 };
  const birthdays = bdRes.results.map(b => ({ name: [b.first_name, b.last_name].filter(Boolean).join(" "), vessel: b.vessel_observed || "" }));
  // Travel budget (latest year on file), split crew vs shoreside management.
  const ty = tyRow.y;
  const travel = { year: ty || null, all: 0, shoreside: 0, crew: 0, months: [], air: 0 };
  if (ty) {
    for (const r of trKind.results) { travel.all += r.t || 0; if (r.kind === "shoreside") travel.shoreside += r.t || 0; }
    travel.crew = Math.round((travel.all - travel.shoreside) * 100) / 100;
    travel.all = Math.round(travel.all * 100) / 100;
    travel.shoreside = Math.round(travel.shoreside * 100) / 100;
    const ms = trMs.results;
    travel.months = ms.map(r => ({ m: r.month, t: Math.round((r.t || 0) * 100) / 100 }));
    travel.air = Math.round(ms.reduce((s, r) => s + (r.a || 0), 0) * 100) / 100;
    const rnd = (x) => Math.round((x || 0) * 100) / 100;
    travel.cats = { air: rnd(trCat.air), hotel: rnd(trCat.hotel), medical: rnd(trCat.medical), visa: rnd(trCat.visa), food: rnd(trCat.food), transport: rnd(trCat.transport), other: rnd(trCat.other) };
    travel.elapsedMo = (ty === curY) ? curM : 12;          // YTD = elapsed calendar months
    travel.budgetMo = 15000;                               // crew travel budget (source: travel sheet SUMMARY!C55)
    travel.ytdBudget = travel.budgetMo * travel.elapsedMo;
    travel.crewYTD = rnd(trCy.t);
    travel.pctUsedYTD = travel.ytdBudget ? Math.round(travel.crewYTD / travel.ytdBudget * 100) : 0;
  }
  return json({
    today, travel, birthdays,
    workforce: {
      total,
      on_board: statusMap["On board"] || 0,
      on_vacation: statusMap["On Vacation"] || 0,
      earmarked: statusMap["Earmarked"] || 0,
      inactive: statusMap["Inactive"] || 0,
      retired: statusMap["Retired"] || 0,
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
const ensureCrewExtras = memoEnsure(ensureCrewExtrasImpl);
async function ensureCrewExtrasImpl(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crew_override (agency_id TEXT PRIMARY KEY, first_name TEXT, middle_name TEXT, last_name TEXT, status TEXT, rank_override TEXT, vessel_observed TEXT, dob TEXT, province TEXT, phone TEXT, email TEXT, pp_no TEXT, med_exp TEXT, sirb_exp TEXT, pp_exp TEXT, usv_exp TEXT, sch_exp TEXT, baseline_count INTEGER, notes TEXT, updated_at TEXT)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crew_note_log (id INTEGER PRIMARY KEY AUTOINCREMENT, agency_id TEXT, ts TEXT, text TEXT)").run();
  try { await env.DB.prepare("ALTER TABLE crew_override ADD COLUMN retired INTEGER DEFAULT 0").run(); } catch {} // manual 'Retired' tag (Rita)
}
// Board legs = the live schedule: current ship_leg rows + crew aboard per the relief board
// (ship_leg_source.boardLegsFromDb). The source flip is a DATA change (app_config.board_source);
// both reads fire together so the flip costs no extra round trip. This is the ONE schedule that
// apiCrew, apiDashboard AND rotationSections derive status from (CLAUDE.md §11) — before 2026-09-04
// only the rotation board read it; the crew list and dashboard silently fell back to the frozen
// SHIP_HISTORY code constant via a bare scheduleBySc().
async function boardLegs(env) {
  const [src, db] = await Promise.all([
    boardSource(env),
    boardLegsFromDb(env, TODAY()).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })),
  ]);
  if (src !== "ship_leg") return SHIP_HISTORY;
  if (!db.ok) throw db.e; // fail loud: never quietly serve the frozen constant for a live source
  return db.v;
}
// Schedule legs per crew, for the auto status derivation. No legs = no schedule (status falls
// back to the registry value) — never the frozen constant.
function scheduleBySc(legs) {
  const m = {};
  for (const h of (legs || [])) { if (!h.ours || !h.sc) continue; (m[h.sc] = m[h.sc] || []).push({ on: h.on, off: h.off }); }
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
  // PERF (2026-07): ensures + the four reads are independent — run them concurrently instead of
  // paying 6 sequential Worker->D1 round trips. Same statements, same outputs.
  await Promise.all([ensureKeyman(env), ensureCrewExtras(env)]);
  const today = TODAY();
  // ?hidden=1 returns the HIDDEN cards (redacted=1) for the "Hidden cards" restore list; default is
  // the live roster (redacted=0). Fixed 0/1 literal — no user string reaches the SQL.
  const onlyHidden = !!(url && url.searchParams.get("hidden") === "1");
  const redFlag = onlyHidden ? "1" : "0";
  const [baseRes, ovsRes, legsRes, nlRes, HIST] = await Promise.all([
    env.DB.prepare("SELECT agency_id, first_name, middle_name, last_name, status, rank_observed, rank_override, vessel_observed, dob, province, phone, email, pp_no, med_exp, sirb_exp, pp_exp, usv_exp, sch_exp, baseline_count FROM crew WHERE redacted=" + redFlag).all(),
    env.DB.prepare("SELECT * FROM crew_override").all(),
    env.DB.prepare("SELECT sc, ship_short AS ship, on_date AS sign_on, off_date AS proj_off, NULL AS act_off, 1 AS seq FROM ship_leg WHERE ours=1 AND is_current=1 AND on_date IS NOT NULL").all(),
    env.DB.prepare("SELECT agency_id, COUNT(*) n FROM crew_note_log GROUP BY agency_id").all(),
    boardLegs(env), // the live schedule — same source as the rotation board and dashboard (§11)
  ]);
  const base = baseRes.results;
  const ovs = ovsRes.results;
  const ovm = {}; for (const o of ovs) ovm[o.agency_id] = o;
  const legs = legsRes.results;
  const byCrew = {}; for (const l of legs) (byCrew[l.sc] = byCrew[l.sc] || []).push(l);
  const nl = nlRes.results;
  const noteMap = {}; for (const r of nl) noteMap[r.agency_id] = r.n;
  const sched = scheduleBySc(HIST);
  // Crew aboard per the relief board only (no ship_leg row yet): their contract span comes from the
  // board leg. Dates only — the Contracts count still comes from ship_leg via fullContracts().
  const histAct = {};
  for (const h of HIST) { if (!h || !h.ours || !h.sc || !h.is_current || !h.on) continue; const cur = histAct[h.sc]; if (!cur || (h.off || "9999") > (cur.off || "9999")) histAct[h.sc] = { on: h.on, off: h.off || null }; }
  const crew = base.map(b => {
    const c = applyOverride(b, ovm[b.agency_id]);
    const ls = (byCrew[b.agency_id] || []).slice().sort((a, x) => (a.seq || 0) - (x.seq || 0));
    let act = ls.find(l => { const off = l.act_off || l.proj_off || "9999"; return l.sign_on <= today && off >= today; }) || ls[ls.length - 1]
      || (histAct[b.agency_id] ? { sign_on: histAct[b.agency_id].on, proj_off: histAct[b.agency_id].off, act_off: null } : null);
    return {
      agency_id: c.agency_id, first_name: c.first_name, middle_name: c.middle_name, last_name: c.last_name,
      status: crewStatus(b, ovm[b.agency_id], sched[b.agency_id], today), retired: !!(ovm[b.agency_id] || {}).retired,
      rank: c.rank_override || c.rank_observed || null, vessel_observed: c.vessel_observed,
      client: clientOf(c.vessel_observed), dob: c.dob, province: c.province, phone: c.phone, email: c.email, pp_no: c.pp_no,
      med_exp: c.med_exp, sirb_exp: c.sirb_exp, pp_exp: c.pp_exp, usv_exp: c.usv_exp, sch_exp: c.sch_exp,
      // contract_count = CUMULATIVE completed contracts (seeded baseline + full legs since); drives the
      // HR grade below. tier/base_salary_usd are display/HR only, never a payout input. baseline NULL =
      // 'baseline pending' -> tier still computes from legs alone (0 -> Junior) until Rita confirms.
      baseline_count: c.baseline_count,
      contract_count: tierContracts(c.baseline_count, fullContracts(ls.map(legShape))),
      tier: psRank(tierContracts(c.baseline_count, fullContracts(ls.map(legShape))), true),
      base_salary_usd: psSalary(tierContracts(c.baseline_count, fullContracts(ls.map(legShape)))),
      active_on: act ? act.sign_on : null, active_off: act ? (act.act_off || act.proj_off) : null,
      hasNote: !!noteMap[c.agency_id] || !!(c.notes && String(c.notes).trim())
    };
  });
  crew.sort((a, b) => (a.last_name || "").localeCompare(b.last_name || "") || (a.first_name || "").localeCompare(b.first_name || ""));
  return json({ count: crew.length, crew });
}

async function apiCrewOne(env, url) {
  const id = url.searchParams.get("id");
  // PERF (2026-09): opening a crew card was 4 sequential Worker->D1 round trips. Every read is keyed
  // by the same agency_id, so they fire as ONE wave after the (memoized) ensures. Same statements,
  // same output, same 404.
  await Promise.all([ensureKeyman(env), ensureCrewExtras(env)]);
  const [row, ov, ctRes, dw] = await Promise.all([
    env.DB.prepare("SELECT * FROM crew WHERE agency_id = ?").bind(id).first(),
    env.DB.prepare("SELECT * FROM crew_override WHERE agency_id=?").bind(id).first(),
    env.DB.prepare("SELECT seq, ship, sign_on as 'on', proj_off as proj, act_off as act FROM keyman_contract3 WHERE sc=? ORDER BY seq").bind(id).all(),
    env.DB.prepare("SELECT CAST(ROUND(SUM(julianday(COALESCE(act_off,proj_off))-julianday(sign_on))) AS INTEGER) days FROM keyman_contract3 WHERE sc=? AND sign_on IS NOT NULL AND COALESCE(act_off,proj_off)>sign_on").bind(id).first(),
  ]);
  if (!row) return json({ error: "not found" }, 404);
  const crew = applyOverride(row, ov);
  const ct = ctRes.results;
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
// Hide / restore a crew card (reversible). Flips the existing crew.redacted flag that EVERY roster
// query already filters on (WHERE redacted=0), so a hidden card disappears from all views but keeps
// its row + history intact. Money-users only (Miguel + Rita) — a data-integrity action. Refuses to
// hide a crew that already has committed bonus history: that card must stay visible for the audit
// trail. Reversible from the "Hidden cards" list (POST hidden:0).
async function apiCrewHide(request, env, session) {
  if (!isMoneyUser(session && session.email)) return json({ error: "money_users_only" }, 403);
  const b = await request.json().catch(() => ({}));
  const id = String(b.agency_id || "").trim();
  if (!id) return json({ error: "no_id" }, 400);
  const cr = await env.DB.prepare("SELECT id FROM crew WHERE agency_id=?").bind(id).first();
  if (!cr) return json({ error: "not_found" }, 404);
  const hide = b.hidden ? 1 : 0;
  if (hide) {
    const bh = await env.DB.prepare("SELECT 1 x FROM bonus_outcome WHERE crew_id=? LIMIT 1").bind(cr.id).first().catch(() => null);
    if (bh) return json({ error: "has_bonus_history" }, 409); // never hide a crew with real payout history
  }
  await env.DB.prepare("UPDATE crew SET redacted=?, updated_at=? WHERE agency_id=?").bind(hide, new Date().toISOString(), id).run();
  await logActivity(env, session && session.email, hide ? "crew_hide" : "crew_restore", id);
  return json({ ok: true, hidden: hide });
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
  await ensureCrewExtras(env);
  // One concurrent wave (§12) — and the live board schedule (§11): this used to be three sequential
  // round trips ending in a bare scheduleBySc(), i.e. status from the frozen SHIP_HISTORY constant.
  const [rowsRes, ovRes, HIST] = await Promise.all([
    env.DB.prepare("SELECT agency_id, first_name, last_name, status, vessel_observed, med_exp, sirb_exp, pp_exp, usv_exp, sch_exp FROM crew WHERE redacted=0").all(),
    env.DB.prepare("SELECT * FROM crew_override").all(),
    boardLegs(env),
  ]);
  const rows = rowsRes.results;
  const ovm = {}; for (const o of ovRes.results) ovm[o.agency_id] = o;
  const sched = scheduleBySc(HIST);
  // ACTIVE crew only (on board + on vacation ≤6mo). Retired/Inactive are off the fleet, so their expired
  // docs are not action items. Uses the SAME derived status + override merge as the Crew tab so all
  // compliance views agree (manual document edits in crew_override win over the imported row).
  const active = [];
  for (const c of rows) {
    const ov = ovm[c.agency_id];
    const st = crewStatus(c, ov, sched[c.agency_id], today);
    if (st === "Retired" || st === "Inactive") continue;
    const merged = applyOverride(c, ov); merged.status = st;
    active.push(merged);
  }
  return json({ today, warnDays: warn, report: crewComplianceReport(active, today, warn) });
}
// Keyman board grouped by SHIP across the FULL contract history: every crew who has served
// a ship appears under it, current-onboard first, then back through history. Each card carries
// the leg dates, embark/disembark ports, next ship, readiness flags, and a note indicator.
async function apiRotation(env) { return json(await rotationSections(env)); }
// Resolve the live Keyman board: ships with their current-onboard roster + resolved sign-on/off
// dates (registry status + vessel, enriched by contract_edit, Keyman legs, then schedule tabs).
// Shared so the monthly billing export computes days from the SAME dates the board displays.
async function rotationSections(env) {
  // PERF (2026-07): ensures first (concurrently), then ALL independent reads in one concurrent
  // wave instead of 7 sequential Worker->D1 round trips. Same statements, same downstream logic.
  await Promise.all([ensureKeyman(env), ensureReady(env), ensureContractEdit(env)]);
  const today = TODAY();
  const normShip = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const AZ = ["journey", "onward", "quest", "pursuit"];
  const [HIST, crewRowsRes, ovRowsRes, rdRes, edsRes, vpdRes, legsRes] = await Promise.all([
    boardLegs(env),
    env.DB.prepare("SELECT agency_id, first_name, last_name, status, rank_observed, rank_override, vessel_observed FROM crew WHERE redacted=0").all(),
    env.DB.prepare("SELECT agency_id, vessel_observed, status, retired FROM crew_override").all(),
    env.DB.prepare("SELECT agency_id, eccr, air, hotel, note FROM crew_ready").all(),
    env.DB.prepare("SELECT sc, seq, embark, disembark, sign_on, sign_off, ship, eccr, air, hotel, on_conf, off_conf FROM contract_edit").all(),
    env.DB.prepare("SELECT brand, ship_short, berth_date, port_name, is_sea, is_turnaround FROM vessel_port_day").all(),
    env.DB.prepare("SELECT sc, ship_short AS ship, on_date AS sign_on, off_date AS proj_off, NULL AS act_off, 1 AS seq FROM ship_leg WHERE ours=1 AND is_current=1 AND on_date IS NOT NULL").all(),
  ]);
  const shipHome = {}, shipBrand = {};
  for (const v of VESSEL_REF) { const k = normShip(v.name); shipHome[k] = v.homeport || null; shipBrand[k] = (v.brand === "CEL" ? "Celebrity" : "Royal"); }
  const brandFor = (ship) => { const k = normShip(ship); if (shipBrand[k]) return shipBrand[k]; if (AZ.indexOf(k) >= 0) return "Azamara"; if (k.indexOf("ncl") >= 0 || k.indexOf("norwegian") >= 0) return "NCL"; return "Royal"; };
  const crewRows = crewRowsRes.results;
  const ovRows = ovRowsRes.results;
  const ovVessel = {}, ovMap = {}; for (const o of ovRows) { ovMap[o.agency_id] = o; if (o.vessel_observed != null && o.vessel_observed !== "") ovVessel[o.agency_id] = o.vessel_observed; }
  for (const c of crewRows) if (ovVessel[c.agency_id]) c.vessel_observed = ovVessel[c.agency_id]; // manual edits win
  const schedMap = scheduleBySc(HIST);
  for (const c of crewRows) c.status = crewStatus(c, ovMap[c.agency_id], schedMap[c.agency_id], today); // auto status (On board / On Vacation), retired/manual win
  const cmap = {};
  for (const c of crewRows) cmap[c.agency_id] = { agency_id: c.agency_id, name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.agency_id, status: c.status || "Unknown", rank: c.rank_override || c.rank_observed || null };
  const rd = rdRes.results;
  const rmap = {}; for (const r of rd) rmap[r.agency_id] = r;
  const eds = edsRes.results;const _vpd=vpdRes.results;const _pdBy=groupPortDays(_vpd);
  const emap = {}; for (const e of eds) emap[e.sc + "|" + e.seq] = e;
  const legs = legsRes.results;
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
  for (const h of HIST) { if (!h.ours || !h.sc) continue; const cs = shipOf(h.ship); if (!cs) continue; const k = normShip(cs); (schEnr[k] = schEnr[k] || {}); const cur = schEnr[k][h.sc]; if (!cur || (h.off || "9999") > (cur.off || "9999")) schEnr[k][h.sc] = { on: h.on, off: h.off, embark: h.embark || null, disembark: h.disembark || null }; }
  // PROMINENT roster per ship = live REGISTRY (status + vessel) — the source of truth for who's onboard
  // NOW (incl. 2-up crew-change overlaps). Dates enriched from Keyman, then the schedule tabs.
  // SELF-HEAL placement: where the SCHEDULE actually puts each crew (current leg spanning today, else
  // their last completed leg). Used to override a STALE registry vessel that points to a ship the crew
  // has no contract on (which otherwise renders an empty/wrong card). Future-only legs are ignored.
  const schedEff = {};
  // Live board legs first (ship_leg + crew aboard per the relief board). The frozen SHIP_HISTORY
  // constant only backfills crew the live source knows nothing about — a stale July leg must never
  // out-vote a current assignment for the same crew.
  const histScs = new Set(); for (const h of HIST) if (h && h.ours && h.sc && h.is_current) histScs.add(h.sc);
  const schedRows = HIST.concat(SHIP_HISTORY.filter((h) => !(h.ours && h.sc && histScs.has(h.sc))));
  for (const h of schedRows) {
    if (!h.ours || !h.sc || !h.on) continue;
    const off = h.off || "9999"; // TBA sign-off = still aboard (same rule as apiCrew / deriveStatus)
    const isCur = h.on <= today && today <= off, isPast = off < today, e = schedEff[h.sc];
    if (isCur) { if (!e || !e.cur || off > e.off) schedEff[h.sc] = { ship: h.ship, on: h.on, off, cur: true }; }
    else if (isPast) { if (!e) schedEff[h.sc] = { ship: h.ship, on: h.on, off, cur: false }; else if (!e.cur && off > e.off) schedEff[h.sc] = { ship: h.ship, on: h.on, off, cur: false }; }
  }
  const promByShip = {}, shoreside = [], pool = [];
  for (const c of crewRows) {
    const base = { agency_id: c.agency_id, name: cmap[c.agency_id].name, status: c.status || "Unknown", rank: cmap[c.agency_id].rank, contracts: contracts[c.agency_id] || 0 };
    const rm = rmap[c.agency_id] || {}; base.eccr = !!rm.eccr; base.air = !!rm.air; base.hotel = !!rm.hotel; base.hasNote = !!(rm.note && String(rm.note).trim());
    if (isShore(c)) { shoreside.push(base); continue; }
    if (c.status === "Inactive") continue; // inactive -> greyed history only
    let ship = shipOf(c.vessel_observed);
    let k = ship ? normShip(ship) : null;
    let enr = k ? ((legBSC[k] || {})[c.agency_id] || {}) : {};
    let sEnr = k ? ((schEnr[k] || {})[c.agency_id] || {}) : {};
    // If the registry vessel has NO contract leg for this crew but the schedule places them somewhere, use that.
    if ((!ship || (!enr.signOn && !sEnr.on)) && schedEff[c.agency_id]) {
      const effShip = shipOf(schedEff[c.agency_id].ship) || schedEff[c.agency_id].ship;
      if (effShip && (!ship || normShip(effShip) !== k)) {
        ship = effShip; k = normShip(ship); base.shipCorrected = true;
        enr = (legBSC[k] || {})[c.agency_id] || {};
        sEnr = (schEnr[k] || {})[c.agency_id] || {};
      }
    }
    if (!ship) { pool.push(base); continue; }
    const _pdList=(_pdBy[(brandFor(ship)==='Royal'?'Royal Caribbean':brandFor(ship))+'|'+ship]||[]);const _onC=resolveCity({date:enr.signOn||sEnr.on,seed:enr.embark||sEnr.embark||shipHome[k],override:null,portDays:_pdList});const _offC=resolveCity({date:enr.signOff||sEnr.off,seed:enr.disembark||sEnr.disembark||shipHome[k],override:null,portDays:_pdList});(promByShip[ship] = promByShip[ship] || []).push(Object.assign({}, base, { ship, seq: enr.seq || 1, signOn: enr.signOn || sEnr.on || null, signOff: enr.signOff || sEnr.off || null, offConfirmed: !!enr.offConfirmed, onConfirmed: !!enr.onConfirmed, eccr: (emap[c.agency_id+"|"+(enr.seq||1)]?!!emap[c.agency_id+"|"+(enr.seq||1)].eccr:base.eccr), air: (emap[c.agency_id+"|"+(enr.seq||1)]?!!emap[c.agency_id+"|"+(enr.seq||1)].air:base.air), hotel: (emap[c.agency_id+"|"+(enr.seq||1)]?!!emap[c.agency_id+"|"+(enr.seq||1)].hotel:base.hotel), embark: enr.embark || sEnr.embark || shipHome[k] || null, disembark: enr.disembark || sEnr.disembark || shipHome[k] || null, current: c.status === "On board", on_city: _onC.city, on_conf: _onC.conf, off_city: _offC.city, off_conf: _offC.conf }));
  }
  const histByShip = {}, histDisp = {};
  for (const h of HIST) { if (!h.ours) continue; const cs = shipOf(h.ship); if (!cs) continue; const k = normShip(cs); histDisp[k] = cs; (histByShip[k] = histByShip[k] || []).push(h); }
  const validShip = validShipKeys(VESSEL_REF);
  // Union of ships: registry-prominent + keyman-history + valid (canonical) schedule ships.
  const shipNames = {};
  for (const s of Object.keys(promByShip)) shipNames[normShip(s)] = s;
  for (const s of Object.keys(byShip)) { const ks = normShip(s); if (!shipNames[ks] && validShip.has(ks)) shipNames[ks] = s; } // only REAL vessels anchor a section (a cruise-line name like 'Azamara' from a mis-recorded leg must not create a phantom ship)
  for (const k of Object.keys(histByShip)) if (!shipNames[k] && validShip.has(k)) shipNames[k] = histDisp[k];
  const sections = Object.values(shipNames).map(ship => {
    const k = normShip(ship);
    const crew = (promByShip[ship] || []).slice().sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const cur = new Set(crew.map(c => c.agency_id));
    // Also-served = ACTUAL per-contract legs from the SCHEDULE (ship_history): one entry per contract
    // with its real sign-on/off. No min-on/max-off collapse and no merge with the Contract Counter,
    // which previously fused several contracts into one bogus 20-30 month span. Zero-day parse artifacts
    // (on===off) are dropped from the display but still suppress the keyman fallback for that crew.
    const scheduleLegs = (histByShip[k] || []).filter(h => !(h.ours && cur.has(h.sc)));
    const schedScs = new Set(scheduleLegs.filter(h => h.ours && h.sc).map(h => h.sc));
    const history = scheduleLegs
      .filter(h => h.on && h.off && h.off !== h.on)
      .map(h => ({ name: h.name, sc: h.sc, ours: !!h.ours, on: h.on, off: h.off }));
    for (const x of (byShip[ship] || [])) { if (cur.has(x.agency_id) || schedScs.has(x.agency_id) || !x.signOn || !x.signOff || x.signOn === x.signOff) continue; history.push({ name: x.name, sc: x.agency_id, ours: true, on: x.signOn, off: x.signOff }); }
    history.sort((a, b) => (a.off || "") < (b.off || "") ? 1 : -1);
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
  // PERF (2026-09): the rotation card was 3 sequential round trips after 2 sequential ensures.
  // Ensures together, then all three reads as one wave. Same statements, same output, same 404.
  await Promise.all([ensureKeyman(env), ensureReady(env)]);
  const id = url.searchParams.get("id");
  const [c, legsRes, r] = await Promise.all([
    env.DB.prepare("SELECT agency_id, first_name, middle_name, last_name, status, rank_observed, rank_override, vessel_observed, province, dob, med_exp, pp_exp, usv_exp FROM crew WHERE agency_id=?").bind(id).first(),
    env.DB.prepare("SELECT seq, ship, sign_on, proj_off, act_off FROM keyman_contract3 WHERE sc=? ORDER BY seq").bind(id).all(),
    env.DB.prepare("SELECT eccr, air, hotel, note FROM crew_ready WHERE agency_id=?").bind(id).first(),
  ]);
  if (!c) return json({ error: "not_found" }, 404);
  const legs = legsRes.results;
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
const ensureReady = memoEnsure(ensureReadyImpl);
async function ensureReadyImpl(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crew_ready (agency_id TEXT PRIMARY KEY, eccr INTEGER DEFAULT 0, air INTEGER DEFAULT 0, hotel INTEGER DEFAULT 0, note TEXT, updated_at TEXT)").run();
  try { await env.DB.prepare("ALTER TABLE crew_ready ADD COLUMN note TEXT").run(); } catch {}
}
const ensureContractEdit = memoEnsure(ensureContractEditImpl);
async function ensureContractEditImpl(env) {
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
  const now = new Date().toISOString();
  await ensureCrewExtras(env);
  // Persist the reassignment in crew_override (which always wins and is untouched by AdvancedQuery
  // imports) instead of the base crew row — otherwise the next import's COALESCE(excluded.vessel,...)
  // would silently revert a manual drag. Pool = clear both the override and the base vessel.
  if (v === null) {
    await env.DB.prepare("UPDATE crew_override SET vessel_observed=NULL, updated_at=? WHERE agency_id=?").bind(now, id).run();
    await env.DB.prepare("UPDATE crew SET vessel_observed=NULL, updated_at=? WHERE agency_id=?").bind(now, id).run();
  } else {
    await env.DB.prepare("INSERT INTO crew_override (agency_id,vessel_observed,updated_at) VALUES (?,?,?) ON CONFLICT(agency_id) DO UPDATE SET vessel_observed=excluded.vessel_observed, updated_at=excluded.updated_at").bind(id, v, now).run();
  }
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
  // Crew row + the LIVE board schedule in one wave (ensureKeyman alongside; memoized). Until
  // 2026-09-04 the Score Card's default sign-on/off came from the frozen SHIP_HISTORY code constant
  // (a July snapshot) — a crew who moved since then was scored against stale dates. §11: one schedule.
  const [cr, HIST] = await Promise.all([
    env.DB.prepare("SELECT id, agency_id, first_name, middle_name, last_name, status, rank_observed, vessel_observed, baseline_count FROM crew WHERE agency_id=?").bind(id).first(),
    boardLegs(env),
    ensureKeyman(env),
  ]);
  if (!cr) return json({ error: "not found" }, 404);
  // The reads keyed by the crew row fire as a second wave (was 5 sequential round trips). The bonus
  // math is untouched: same helpers (effectiveBaseline, crewCount), same statements, same output.
  const [baseline, outs, legRowsRes] = await Promise.all([
    effectiveBaseline(env, cr.agency_id, cr.baseline_count),
    env.DB.prepare("SELECT id, contract_group_id, score_pct, gate, pay_usd, count_before, count_after, span_start, span_end, ships_json, committed_at FROM bonus_outcome WHERE crew_id=? ORDER BY committed_at DESC").bind(cr.id).all(),
    env.DB.prepare("SELECT ship, sign_on, proj_off, act_off FROM keyman_contract3 WHERE sc=? AND sign_on IS NOT NULL").bind(cr.agency_id).all(),
  ]);
  const count = await crewCount(env, cr.id, baseline);
  // Default sign-on/off for the Score Card (manually editable there). Prefer the live SCHEDULE
  // (current leg or crew aboard per the relief board — the contract just ended, or the current one),
  // since the Contract Counter only holds completed-contract dates. Fall back to the latest Counter leg.
  const td = TODAY();
  let current = null, bestPast = null, bestFut = null;
  for (const h of HIST) {
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
  const legRows = legRowsRes.results;
  const legN = fullContracts(legRows.map(legShape));
  const effN = tierContracts(baseline, legN); // cumulative completed -> grade/pay (never resets)
  return json({ crew: cr, count, contracts: effN, rank: psRank(effN, true), base_salary_usd: psSalary(effN), baseline_set: baseline != null, nextRungIfClean: ladderValue(count + 1), outcomes: outs.results, lastLeg });
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
    // Grade/pay ride the CUMULATIVE count (seeded baseline + full legs), not the consecutive `count`,
    // so a bonus reset never demotes anyone. Display only — payout still uses L.count + the ladder.
    const eff = tierContracts(L.baseline, legCounts[b.agency_id] || 0);
    return {
      agency_id: b.agency_id, name: [b.first_name, b.last_name].filter(Boolean).join(" "), status: b.status,
      vessel: vessel || null, client: clientOf(vessel), contracts: eff,
      count: L.count, baseline_set: L.baseline_set, rank: psRank(eff), base_salary_usd: psSalary(eff), nextRung: L.nextRung,
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
  const effFc = tierContracts(baseline, fc); // cumulative completed -> grade/pay on the statement
  const bonus = { rank: psRank(effFc, true), base_salary_usd: psSalary(effFc), contracts: effFc, count, baseline_set: baseline != null, nextRungIfClean: ladderValue(count + 1), outcomes: outs.results };
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
  if (!env.MAILER) {
    await logActivity(env, session && session.email, "statement_email", id + " no_mailer");
    return json({ ok: false, stored, sent: false, note: "Email is not configured yet (MAILER binding). PDF " + (stored ? "was stored in R2." : "generated but not stored — no R2 bucket bound yet.") });
  }
  const out = await sendViaMailer(env, {
    templateId: "hr.statement.v1",
    to: [to],
    subject: "Your DG3 CIMS crew statement",
    html: `<p>Please find your CIMS crew statement attached.</p><p>DG3 Cruise Industry Managed Services</p>`,
    attachments: [{ filename: `CIMS_Statement_${id}.pdf`, content: b64 }],
    critical: false
  });
  const ok = !!(out && out.ok);
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
  // Money safety (#17): never finalize a payout against an UNCONFIRMED starting count. If the crew has
  // no prior committed outcome to event-source from AND no reconciled baseline, the count is unknown —
  // committing would anchor the immutable ledger to a wrong base (a veteran silently reset toward 0).
  // 0 is a valid *confirmed* baseline and is unaffected; only NULL (never reconciled) is blocked.
  const hasHistory = !!(await env.DB.prepare("SELECT 1 FROM bonus_outcome WHERE crew_id=? LIMIT 1").bind(cr.id).first());
  if (!hasHistory && baseline == null) return json({ error: "baseline_pending" }, 400);
  // Supervisor evaluation is required and must be 1..5. The server is the authority, not the form,
  // so a missing/garbage eval is rejected rather than scored as 0 (which the engine would now gate anyway).
  const evNum = parseInt(b.evalScore);
  if (!(evNum >= 1 && evNum <= 5)) return json({ error: "eval_required" }, 400);
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
  try {
    await env.DB.prepare("INSERT INTO bonus_outcome (id,contract_id,contract_group_id,crew_id,policy_version,scorecard_json,score_pct,gate,gate_note,count_before,count_after,pay_usd,span_start,span_end,ships_json,committed_by,committed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(oid, cid, groupId, cr.id, 1, JSON.stringify(r.breakdown), r.score, r.gate, (b.gateNote || "").trim() || null, r.count, r.nextCount, r.pay, b.spanStart, b.spanEnd, JSON.stringify(ships), (session && session.email) || "system", now).run();
  } catch (e) {
    // Structural backstop to the read-then-write pre-check above: a racing double-commit that beat the
    // SELECT trips UNIQUE(crew_id,span_start,span_end) (migration 0004, primary outcomes only). Return the
    // already-recorded outcome as a duplicate instead of double-paying / double-counting.
    const ex = await env.DB.prepare("SELECT contract_group_id, score_pct, gate, pay_usd, count_before, count_after, ships_json FROM bonus_outcome WHERE crew_id=? AND span_start=? AND span_end=?").bind(cr.id, b.spanStart, b.spanEnd).first();
    if (ex) return json({ ok: true, duplicate: true, group: ex.contract_group_id, ships: JSON.parse(ex.ships_json || "[]"),
      result: { score: ex.score_pct, gate: ex.gate, pay: ex.pay_usd, count: ex.count_before, nextCount: ex.count_after, rung: ladderValue(ex.count_after) } });
    throw e;
  }
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
// Memoized once per isolate (§12) — was 2 DDL round trips on each of 7 feedback routes per request.
const ensureFb = memoEnsure(ensureFbImpl);
async function ensureFbImpl(env) {
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
  // The writes above must stay in order; the two read-backs below are independent -> one wave.
  const [respRes, reqsRes] = await Promise.all([
    env.DB.prepare("SELECT role, answers_json FROM feedback_response2 WHERE crew_id=?").bind(cr.id).all(),
    env.DB.prepare("SELECT role, status FROM feedback_request2 WHERE crew_id=?").bind(cr.id).all(),
  ]);
  const resp = respRes.results;
  const answers = {}; for (const r of resp) answers[r.role] = JSON.parse(r.answers_json);
  const reqs = reqsRes.results;
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
  // PERF (2026-09): three independent reads -> one wave.
  const [crewRes, reqsRes, respRes] = await Promise.all([
    env.DB.prepare("SELECT id, agency_id, first_name, last_name, vessel_observed, status FROM crew WHERE redacted=0").all(),
    env.DB.prepare("SELECT crew_id, role, status FROM feedback_request2").all(),
    env.DB.prepare("SELECT crew_id, role FROM feedback_response2").all(),
  ]);
  const crewRows = crewRes.results;
  const byId = {}; for (const c of crewRows) byId[c.agency_id] = c;
  const reqs = reqsRes.results;
  const resp = respRes.results;
  const fb = {}; for (const r of reqs) { (fb[r.crew_id] = fb[r.crew_id] || {})[r.role] = r.status; }
  for (const r of resp) { (fb[r.crew_id] = fb[r.crew_id] || {})[r.role] = "answered"; }
  const keys = buildShipKeys(VESSEL_REF);
  // SOURCE = the LIVE board schedule (boardLegs: current ship_leg rows + crew aboard per the relief
  // board), which carries forward-looking sign-off dates + ship. The Contract Counter is completed-
  // contracts only (no future dates), so it can never populate "signing off next 14 days". Until
  // 2026-09-04 this loop read the frozen SHIP_HISTORY constant — a July snapshot (§11: one schedule).
  const HIST = await boardLegs(env);
  const recBy = {}, upBy = {};
  for (const h of HIST) {
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
// Memoized once per isolate (§12) — was 2 DDL + 2 ALTER (throw+catch) round trips on each of 9
// intel routes per request.
const ensureIntel = memoEnsure(ensureIntelImpl);
async function ensureIntelImpl(env) {
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
  const roster = crew.map(c => ({ agency_id: c.agency_id, name: nm[c.agency_id] })).filter(c => c.name);
  return json({ count: pending.length, pending, roster });
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
  // PERF (2026-09): 4 sequential reads after 2 sequential ensures -> one wave each.
  await Promise.all([ensureKeyman(env), ensureFb(env)]);
  const today = TODAY();
  const [legsRes, crewRes, reqsRes, respRes] = await Promise.all([
    env.DB.prepare("SELECT sc, ship_short AS ship, on_date AS sign_on, off_date AS proj_off, NULL AS act_off, 1 AS seq FROM ship_leg WHERE ours=1 AND is_current=1 AND on_date IS NOT NULL").all(),
    env.DB.prepare("SELECT id, agency_id, first_name, last_name, vessel_observed, status FROM crew WHERE redacted=0").all(),
    env.DB.prepare("SELECT crew_id, role, status FROM feedback_request2").all(),
    env.DB.prepare("SELECT crew_id, role FROM feedback_response2").all(),
  ]);
  const legs = legsRes.results;
  const byCrew = {}; for (const l of legs) (byCrew[l.sc] = byCrew[l.sc] || []).push(l);
  const crewRows = crewRes.results;
  const reqs = reqsRes.results;
  const resp = respRes.results;
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
.shipbody{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;padding:6px 14px 14px}
.shipbody.closed{display:none}
.rcard{background:#fcfdff;border:1px solid var(--line);border-radius:11px;padding:10px 12px;cursor:grab}
.rcard:active{cursor:grabbing}.rcard:hover{border-color:var(--navy)}
.rcard .rnm{font-family:'Outfit';font-weight:700;color:var(--navy);font-size:13.5px;margin-bottom:4px}
.rcard .rleg{font-size:11.5px;color:var(--mut);display:flex;align-items:center;gap:6px}
.rcard .rleg i{width:8px;height:8px;border-radius:50%;display:inline-block}
.rcard .rleg2{font-size:11.5px;color:#3a4a5e;display:flex;align-items:center;gap:6px;margin-top:2px}
.rcard .rleg2 i{width:7px;height:7px;border-radius:50%;display:inline-block}
.rcard .rleg2 i.ondot{background:var(--green)}.rcard .rleg2 i.offdot{background:var(--amber)}.rcard{padding:12px 14px}.rhead{display:flex;align-items:center;gap:10px}.ravatar{width:36px;height:36px;border-radius:50%;background:#eef2f7;color:var(--mut);display:flex;align-items:center;justify-content:center;font-family:'Outfit';font-weight:700;font-size:12.5px;flex:0 0 auto}.ravatar.cur{background:#e3f5e8;color:var(--green)}.rhcol{min-width:0}.rrank{color:var(--navy);font-weight:800;font-size:9px;letter-spacing:.04em;border:.5px solid var(--line-2);border-radius:4px;padding:1px 5px;vertical-align:1px}.notedot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--amber);vertical-align:middle;margin-left:2px}.rrot{margin-top:10px;padding-top:9px;border-top:.5px solid var(--line);display:flex;flex-direction:column;gap:6px}.rrow{display:flex;align-items:baseline;gap:8px;font-size:12.5px;line-height:1.3}.rlbl{flex:0 0 auto;width:22px;color:var(--mut);text-transform:uppercase;font-size:10px;letter-spacing:.04em;font-weight:700}.rcity{min-width:0;color:#3a4a5e}.rdate{margin-left:auto;white-space:nowrap;color:var(--mut);font-size:11.5px}.rtags{margin-top:10px;display:flex;flex-wrap:wrap;gap:5px}
.rcard .rdur{display:inline-block;margin-top:6px;background:#eef2f7;color:var(--mut);font-size:10.5px;padding:2px 8px;border-radius:20px}.rcard{position:relative}.rcard .offchip{position:absolute;top:9px;right:9px;font-size:10px;font-weight:800;letter-spacing:.02em;padding:2px 8px;border-radius:20px;background:#eef2f7;color:var(--mut)}.rcard .offchip.crit{background:#fbe7e6;color:var(--danger)}.rcard .offchip.due{background:#fbeed6;color:#9a6410}.rcard.cur .rnm{padding-right:62px}
.rtags{margin-top:7px;display:flex;flex-wrap:wrap;gap:4px}
.rtag{font-size:9px;font-weight:800;letter-spacing:.03em;padding:2px 6px;border-radius:6px;border:1px solid var(--line-2);color:var(--mut);background:#fff}
.rtag.on{background:#EAF6E6;border-color:#bfe0b0;color:var(--green-d)}
.rtag.rtoggle{cursor:pointer;user-select:none}
.poolwrap{background:#fff;border:1px dashed var(--line-2);border-radius:13px;padding:12px 14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:8px;min-height:48px}
.rcard.cur{box-shadow:0 0 0 2px var(--green) inset}.rcard.rlvr{box-shadow:0 0 0 2px var(--navy) inset}.ghostslot{border-style:dashed!important;display:flex;flex-direction:column;justify-content:center;color:var(--mut);cursor:pointer}.ghostslot.crit{border-color:var(--danger)!important;background:#fbe7e6;color:var(--danger)}.ghostslot.due{border-color:var(--amber)!important;background:#fbeed6;color:#9a6410}
.rcard .notedot{color:var(--amber);font-size:9px;vertical-align:middle}.rcard.rlvr{box-shadow:0 0 0 2px var(--navy) inset;background:#fff}.rcard .rlab{color:var(--navy);font-weight:800;font-size:9px;letter-spacing:.05em;background:#eef3fb;padding:1px 6px;border-radius:5px;vertical-align:middle}.rcard .reldot{background:var(--navy)!important}.ghostslot{border:1.5px dashed var(--line-2)!important;background:#fafbfc;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:5px;cursor:pointer;transition:border-color .15s,background .15s;min-height:104px}.ghostslot:hover{border-color:var(--navy)!important;background:#f2f7fd}.ghostslot .gp{width:30px;height:30px;border-radius:50%;background:#eef2f7;color:var(--navy);font-size:19px;display:flex;align-items:center;justify-content:center;line-height:1}.ghostslot:hover .gp{background:var(--navy);color:#fff}.ghostslot .gt{font-family:'Outfit';font-weight:700;font-size:13px;color:var(--navy)}.ghostslot .gc{font-size:10px;font-weight:800;letter-spacing:.03em;padding:2px 9px;border-radius:20px;background:#eef2f7;color:var(--mut)}.ghostslot.crit{border-color:var(--danger)!important;background:#fdf3f2}.ghostslot.crit .gp{background:#fbe7e6;color:var(--danger)}.ghostslot.crit .gc{background:#fbe7e6;color:var(--danger)}.ghostslot.due{border-color:#d9a441!important;background:#fdf9f0}.ghostslot.due .gp{background:#fbeed6;color:#9a6410}.ghostslot.due .gc{background:#fbeed6;color:#9a6410}.rbanner{display:inline-flex;align-items:center;gap:7px;margin:2px 14px 12px;padding:5px 13px;border-radius:20px;font-size:12px;font-weight:600}.rbanner .bdot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
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
/* ---- Ask Maria V2: command-bar overlay (Cmd/Ctrl+K) ---- */
.mkbtn{flex:none;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:10px;padding:7px 12px;font-size:12.5px;cursor:pointer;display:flex;gap:7px;align-items:center;font-family:'Outfit';font-weight:600}
.mkbtn:hover{background:rgba(255,255,255,.18)}
.mkbtn .mkk{font-size:10px;background:rgba(255,255,255,.15);border-radius:5px;padding:2px 6px;letter-spacing:.05em}
#mkovl{position:fixed;inset:0;background:rgba(14,23,38,.45);backdrop-filter:blur(3px);display:none;justify-content:center;align-items:flex-start;padding:8vh 14px 0;z-index:80}
#mkovl.open{display:flex}
.mkbar{width:680px;max-width:100%;background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(14,23,38,.35);overflow:hidden;display:flex;flex-direction:column;max-height:82vh}
.mkrow{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)}
.mkav{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--green),var(--green-d));display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Outfit';font-weight:700;font-size:13px;flex:none}
.mkq{flex:1;border:0;font-size:16.5px;font-family:'DM Sans',system-ui,sans-serif;color:var(--ink);min-width:0;background:transparent}
.mkq:focus{outline:none}
.mkesc{font-size:10px;color:var(--mut);border:1px solid var(--line-2);border-radius:5px;padding:2px 6px;cursor:pointer;background:#fff}
.mkbody{overflow-y:auto}
.mkprev{padding:6px 18px 0}
.mkpq{font-size:12px;color:var(--mut);padding:6px 0;border-bottom:1px dashed var(--line);cursor:pointer}
.mkpq:hover{color:var(--navy)}
.mkans{padding:16px 18px}
.mkuq{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:7px}
.mkbig{font-size:15.5px;line-height:1.6;color:var(--ink);white-space:pre-wrap}
.mksrc{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;align-items:center}
.mksrclab{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--mut);text-transform:uppercase;margin-right:2px}
.mkchip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--navy);background:#F7F9FC;border:1px solid var(--line-2);border-radius:20px;padding:3px 9px}
.mkchip .mkdot{width:7px;height:7px;border-radius:50%;background:var(--green)}
.mkchip.doc .mkdot{background:var(--royal)}
.mkfb{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--mut);margin-top:12px}
.mkfbb{border:1px solid var(--line-2);background:#fff;border-radius:8px;padding:3px 10px;cursor:pointer;font-size:12px}
.mkfbb:hover{border-color:var(--green)}
.mksec{padding:8px 18px 14px;border-top:1px solid var(--line)}
.mksec.first{border-top:0;padding-top:14px}
.mkslab{font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--mut);text-transform:uppercase;padding:6px 0}
.mkitem{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;cursor:pointer;font-size:13.5px;color:var(--ink)}
.mkitem:hover{background:#F2F6FB}
.mkic{width:26px;height:26px;border-radius:8px;background:#EAF1FA;display:flex;align-items:center;justify-content:center;font-size:13px;flex:none}
.mkhint{margin-left:auto;font-size:11px;color:var(--mut)}
.mkfoot{padding:8px 18px;border-top:1px solid var(--line);display:flex;gap:14px;font-size:11px;color:var(--mut);background:#FAFBFD;flex-wrap:wrap}
@media(max-width:700px){#mkovl{padding:0;align-items:flex-end}.mkbar{border-radius:18px 18px 0 0;max-height:92vh}.mkbtn .mkk{display:none}}
/* ---- Maria knowledge: "Focus Drop" ---- */
.kbwrap{max-width:600px}
.kbhead{font-family:'Outfit';font-weight:700;font-size:22px;letter-spacing:-.02em;color:var(--navy)}
.kbsub{color:var(--mut);font-size:13.5px;margin:6px 0 22px;line-height:1.5}
.kbhero{position:relative;background:#fff;border:1px solid var(--line-2);border-radius:22px;padding:42px 24px;text-align:center;cursor:pointer;transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s,border-color .18s;box-shadow:0 1px 2px rgba(20,41,61,.04)}
.kbhero:hover{transform:translateY(-2px);box-shadow:0 14px 40px rgba(20,41,61,.09);border-color:#CFE7C4}
.kbhero.drag{transform:translateY(-2px);border-color:var(--green);box-shadow:0 0 0 4px rgba(95,185,70,.14),0 14px 40px rgba(20,41,61,.10)}
.kbglyph{width:54px;height:54px;margin:0 auto 15px;border-radius:17px;background:linear-gradient(160deg,#EAF6E4,#F3FAF0);display:flex;align-items:center;justify-content:center;font-size:23px;color:var(--green-d);box-shadow:inset 0 0 0 1px #DDEED4}
.kbhero h3{font-family:'Outfit';font-weight:600;font-size:17px;color:var(--navy);letter-spacing:-.01em}
.kbhero .kbp{color:var(--mut);font-size:13px;margin-top:5px}
.kbhero .kbor{margin-top:15px;font-size:12.5px;color:var(--mut)}
.kbhero .kbor b{color:var(--green-d);font-weight:600}
.kbpaste{margin-top:12px}
.kbpaste textarea{width:100%;border:1px solid var(--line-2);border-radius:14px;padding:13px 15px;font:inherit;font-size:14px;resize:vertical;min-height:96px}
.kbpaste textarea:focus{outline:none;border-color:var(--green)}
.kbpaste .prow{display:flex;gap:8px;align-items:center;margin-top:8px}
.kbjust{margin-top:14px;background:#fff;border:1px solid var(--line-2);border-radius:18px;padding:15px 17px;display:flex;align-items:center;gap:13px;box-shadow:0 10px 30px rgba(20,41,61,.07);animation:kbrise .4s cubic-bezier(.2,.8,.2,1)}
@keyframes kbrise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.kbtick{width:33px;height:33px;border-radius:11px;background:var(--green);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;flex:none}
.kbtick.wait{background:#EAF1FA;color:var(--royal);animation:kbpulse 1.3s ease-in-out infinite}
@keyframes kbpulse{0%,100%{opacity:1}50%{opacity:.5}}
.kbjust .jb{flex:1;min-width:0}
.kbjust .jn{font-family:'Outfit';font-weight:600;font-size:15px;color:var(--navy);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.kbspark{font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--green-d);background:#EAF6E4;border-radius:20px;padding:2px 8px}
.kbjust .jm{color:var(--mut);font-size:12.5px;margin-top:3px}
.kblbl{font-family:'Outfit';font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:28px 2px 10px}
.kbrow{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 15px;display:flex;align-items:center;gap:12px;margin-bottom:8px;transition:border-color .15s}
.kbrow:hover{border-color:var(--line-2)}
.kbrow .kd{width:8px;height:8px;border-radius:50%;background:var(--green);flex:none}
.kbrow.off .kd{background:#CFD6E0}
.kbrow .kt{flex:1;min-width:0}
.kbrow .kt .kh{font-family:'Outfit';font-weight:600;font-size:14.5px;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kbrow.off .kt .kh{color:#9AA6B4}
.kbrow .kt .km{color:var(--mut);font-size:12px;margin-top:2px}
.kbrow .ka{font-size:12px;color:var(--mut);cursor:pointer;flex:none;opacity:.7}
.kbrow .ka:hover{opacity:1;color:var(--navy)}
.kbfoot{margin-top:22px;color:var(--mut);font-size:11.5px;text-align:center}
/* ---- Reports tab (v1: Management Reviews module, sample data; live API lands in v2) ---- */
.rpthead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 6px}
.rpthead h2{font-size:19px;color:var(--navy);margin-right:auto}
.pchip{font-size:12px;font-weight:700;padding:6px 13px;border-radius:20px;border:1px solid var(--line-2);background:#fff;color:var(--mut);cursor:pointer}
.pchip.on{background:var(--navy);border-color:var(--navy);color:#fff}
.mockband{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.05em;color:#9A6614;background:#FBF2E0;border:1px solid #EAD9AE;border-radius:20px;padding:4px 12px;margin-bottom:12px}
.liveband{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.05em;color:#3E8E2A;background:#EAF6E4;border:1px solid #CDE8C1;border-radius:20px;padding:4px 12px;margin-bottom:12px}
.kgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:11px}
.ktile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px 11px;box-shadow:0 1px 2px rgba(20,45,72,.05)}
.ktile .kl{font-size:10.5px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.ktile .kv{font-family:'Outfit';font-size:26px;font-weight:800;color:var(--navy);line-height:1.15;margin-top:6px}
.ktile .kv small{font-size:13px;color:var(--mut);font-weight:600}
.kdelta{font-size:11.5px;font-weight:700;margin-left:7px;vertical-align:2px}
.kdelta.up{color:var(--green-d)}.kdelta.dn{color:var(--red)}.kdelta.flat{color:var(--mut)}
.ktile svg{display:block;margin-top:8px}
.rblk{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;box-shadow:0 1px 2px rgba(20,45,72,.05)}
.rgrid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px}
.rblk h3{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--mut);margin-bottom:12px;font-family:'Outfit'}
.frow{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px}
.frow .fl{width:88px;color:var(--mut);flex:none}
.frow .fbar{flex:1;height:18px;background:#F1F4F8;border-radius:5px;overflow:hidden}
.frow .fbar i{display:block;height:100%;border-radius:5px}
.frow .fn{width:44px;text-align:right;font-weight:700;font-family:'Outfit';flex:none}
.hwrap2{display:flex;align-items:flex-end;gap:10px;height:120px;padding:4px 2px 0}
.hcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;justify-content:flex-end;height:100%}
.hcol i{width:100%;max-width:52px;background:var(--royal);border-radius:5px 5px 0 0;display:block}
.hcol.rlow i{background:var(--red)}
.hcol b{font-family:'Outfit';font-size:12.5px}
.hcol span{font-size:10.5px;color:var(--mut)}
.ratebar{height:8px;background:#F1F4F8;border-radius:4px;overflow:hidden;min-width:70px;display:inline-block;vertical-align:middle}
.ratebar i{display:block;height:100%;background:var(--green);border-radius:4px}
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
    f+='<div class=fg><label>PROD Service Performance</label><div class=hint>Machine clean &amp; serviceable at handover? · Technical ability, error-code resolution.</div>'+sel('clean',['Excellent','Acceptable','Poor'],a.clean||'Excellent')+'</div>'
     +'<div class=fg><label>MFD Service Performance</label><div class=hint>Preventive maintenance done correctly? · Independent service, SOP adherence &amp; quality.</div>'+sel('pm',['Excellent','Acceptable','Poor'],a.pm||'Excellent')+'</div>'
     +'<div class=fg><label>Information / Database Knowledge</label><div class=hint>Unresolved technical issues left for the reliever? · Correct part numbers, use of technical data.</div>'+sel('unres',['Excellent','Acceptable','Poor'],a.unres||'Excellent')+'</div>'
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
    <button id=nav-billing onclick="show('billing')">Billing</button>
    <button id=nav-travel onclick="show('travel')">Travel</button>
    <button id=nav-fleet onclick="show('fleet')">Fleet</button>
    <button id=nav-reports onclick="show('reports')">Reports</button>
    <button id=nav-data onclick="show('data')">Data</button>
    <button id=nav-ask onclick="show('ask')">Ask Maria</button>
    <a class=out href="/api/auth/logout">Sign out</a>
  </nav>
  <button class=mkbtn onclick="mkOpen()" title="Ask Maria (Cmd/Ctrl+K)">Ask Maria <span class=mkk>⌘K</span></button>
</header>
<div class=wrap id=view></div>
<div id=mkovl onclick="if(event.target===this)mkClose()">
  <div class=mkbar>
    <div class=mkrow><div class=mkav>M</div><input class=mkq id=mkq placeholder="Ask Maria anything about CIMS…" autocomplete=off><span class=mkesc onclick="mkClose()">ESC</span></div>
    <div class=mkbody id=mkbody></div>
    <div class=mkfoot><span>Answers come only from CIMS data — sources always shown</span></div>
  </div>
</div>
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
  if(tab==='reports')return renderReports();
  if(tab==='data'||tab==='settings')return renderData();
  if(tab==='ask')return renderAsk();
}
// "Data" is now the single home for data status AND uploads/session/about (the old Settings tab was
// merged in). Left menu: Overview (data sources + load history), Upload data, Session, About.
function renderAsk(){
  $('#view').innerHTML='<div class=bar><h2>Ask Maria</h2></div>'
   +'<div class=csub style="margin:-6px 0 14px">Maria answers questions about CIMS data — crew, contracts, compliance, billing, fleet, travel. Read-only: she reports, she never changes anything.</div>'
   +'<div id=mchat style="max-width:820px;border:1px solid var(--line-2);border-radius:12px;padding:14px;min-height:200px;max-height:55vh;overflow:auto;background:#fff"></div>'
   +'<div style="max-width:820px;display:flex;gap:8px;margin-top:10px"><input id=mq placeholder="Ask about crew, contracts, compliance, billing, fleet, travel..." style="flex:1;padding:11px 12px;border:1px solid var(--line-2);border-radius:10px"><button class=btn id=masend>Ask</button></div>'
   +'<div style="max-width:820px;margin-top:8px" id=mchips></div>';
  var chips=['How many crew are on board right now?','Whose documents expire in the next 60 days?','Who are the Sr PS crew?','Which ships are in dry dock?'];
  var mc=$('#mchips'); mc.innerHTML='';
  chips.forEach(function(c){var btn=document.createElement('button');btn.className='btn ghost';btn.style.cssText='margin:3px 6px 3px 0;font-size:12px';btn.textContent=c;btn.onclick=function(){$('#mq').value=c;mariaSend();};mc.appendChild(btn);});
  $('#masend').onclick=mariaSend;
  $('#mq').onkeydown=function(e){if(e.key==='Enter')mariaSend();};
  window.MARIA_HIST=window.MARIA_HIST||[];
  mariaRender();
}
function mariaEsc(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
// Plain-English labels for Maria's data sources — the team should read "Fleet + dry dock",
// never internal tool names like fleet_status. Unknown tools fall back to their raw name.
var MARIA_SRC_LABELS={crew_intel:'Crew notes + intel',crew_contract_history:'Contract history',scoring_board:'Scoring board',billing_range:'Billing',billing_month:'Billing',upcoming_movements:'Live rotation schedule',workforce_summary:'Workforce overview',find_crew:'Crew registry',list_crew:'Crew registry',contract_ledger:'Contract + bonus ledger',compliance_expiring:'Document compliance',fleet_status:'Fleet + dry dock',travel_summary:'Travel spend',describe_schema:'Database lookup',run_sql:'Database lookup',glossary:'CIMS dictionary',search_knowledge:'Knowledge library'};
function mariaSrcLabel(list){var out=[];(list||[]).forEach(function(s){var L=MARIA_SRC_LABELS[s]||s;if(out.indexOf(L)<0)out.push(L);});return out.join(' · ');}
function mariaRender(){
  var box=$('#mchat'); if(!box)return;
  var h=(window.MARIA_HIST||[]).map(function(m){
    var who=m.role==='user'?'You':'Maria';
    var col=m.role==='user'?'var(--navy)':'var(--green)';
    var src=(m.sources&&m.sources.length)?'<div class=csub style="margin-top:4px;opacity:.65">Checked: '+mariaSrcLabel(m.sources)+'</div>':'';
    var fb='';
    if(m.role==='assistant'&&m.logId){
      fb=m.voted?'<div class=csub style="margin-top:4px;opacity:.6">Thanks — your feedback was saved '+(m.voted===1?'&#128077;':'&#128078;')+'</div>'
        :'<div class=csub style="margin-top:6px">Was this answer helpful? <button class="btn ghost" style="font-size:11px;padding:2px 8px;margin-left:4px" onclick="mariaVote('+m.logId+',1)">&#128077; Yes</button><button class="btn ghost" style="font-size:11px;padding:2px 8px;margin-left:6px" onclick="mariaVote('+m.logId+',0)">&#128078; No</button></div>';
    }
    return '<div style="margin:0 0 12px"><div style="font-weight:700;color:'+col+';font-size:12px">'+who+'</div><div style="white-space:pre-wrap;line-height:1.5">'+(m.html||'')+'</div>'+src+fb+'</div>';
  }).join('');
  box.innerHTML=h||'<div class=csub style="opacity:.6">Ask a question to get started.</div>';
  box.scrollTop=box.scrollHeight;
}
async function mariaVote(id,v){
  try{await fetch('/api/maria/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,verdict:v})});}catch(e){}
  var h=window.MARIA_HIST||[];
  for(var k=0;k<h.length;k++){if(h[k].logId===id)h[k].voted=(v===1?1:2);}
  mariaRender();
}
// Single ask pipeline shared by the Ask Maria tab AND the V2 command bar (Cmd/Ctrl+K).
// Both surfaces read/write the same MARIA_HIST, so context carries across them.
async function mariaAskCore(q){
  window.MARIA_HIST=window.MARIA_HIST||[];
  var hist=window.MARIA_HIST.filter(function(m){return m.text;}).slice(-6).map(function(m){return {role:m.role,content:m.text};});
  window.MARIA_HIST.push({role:'user',html:mariaEsc(q),text:q});
  window.MARIA_HIST.push({role:'assistant',html:'<span class=csub style="opacity:.6">Maria is thinking…</span>'});
  mariaRender();mkRender();
  try{
    var r=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,history:hist})});
    var j=await r.json();
    window.MARIA_HIST.pop();
    if(j&&j.answer){window.MARIA_HIST.push({role:'assistant',html:mariaEsc(j.answer),text:j.answer,sources:j.sources||[],logId:j.log_id||null});}
    else{window.MARIA_HIST.push({role:'assistant',html:'<span style="color:#b4232a">'+mariaEsc((j&&(j.error||j.detail))||'No answer returned.')+'</span>'});}
  }catch(e){window.MARIA_HIST.pop();window.MARIA_HIST.push({role:'assistant',html:'<span style="color:#b4232a">Network error — try again.</span>'});}
  mariaRender();mkRender();
}
async function mariaSend(){
  var i=$('#mq'); if(!i)return; var q=(i.value||'').trim(); if(!q)return;
  i.value='';
  await mariaAskCore(q);
}
/* ---- Ask Maria V2 command bar: additive overlay, existing tab untouched as fallback ---- */
var MK_SUGG=[['&#128674;','Who signs off in the next 14 days?','rotation'],['&#128196;','Whose documents expire in the next 60 days?','compliance'],['&#128202;','Billing this month per ship','billing'],['&#128736;','Which ships are in dry dock?','fleet']];
function mkSuggHtml(){var out='<div class=mkslab>Suggested</div>';for(var i=0;i<MK_SUGG.length;i++){out+='<div class=mkitem onclick="mkAsk('+i+')"><div class=mkic>'+MK_SUGG[i][0]+'</div>'+MK_SUGG[i][1]+'<span class=mkhint>'+MK_SUGG[i][2]+'</span></div>';}return out;}
function mkIsOpen(){var o=$('#mkovl');return !!(o&&o.classList.contains('open'));}
function mkOpen(){var o=$('#mkovl');if(!o)return;o.classList.add('open');mkRender();var q=$('#mkq');if(q){q.value='';setTimeout(function(){q.focus();},60);}}
function mkClose(){var o=$('#mkovl');if(o)o.classList.remove('open');}
function mkAsk(i){var s=MK_SUGG[i];if(!s)return;var q=$('#mkq');if(q)q.value='';mariaAskCore(s[1]);}
function mkReask(el){mariaAskCore(el.textContent||'');}
async function mkSend(){var i=$('#mkq');if(!i)return;var q=(i.value||'').trim();if(!q)return;i.value='';await mariaAskCore(q);}
async function mkVote(id,v){await mariaVote(id,v);mkRender();}
function mkSrcChips(list){
  var out='',seen=[];
  (list||[]).forEach(function(s){
    var L=MARIA_SRC_LABELS[s]||s;if(seen.indexOf(L)>=0)return;seen.push(L);
    var doc=(s==='search_knowledge')?' doc':'';
    out+='<span class="mkchip'+doc+'"><span class=mkdot></span>'+mariaEsc(L)+'</span>';
  });
  return out;
}
function mkRender(){
  var box=$('#mkbody'); if(!box)return;
  var H=window.MARIA_HIST||[];
  var la=-1;for(var k=H.length-1;k>=0;k--){if(H[k].role==='assistant'){la=k;break;}}
  if(la<0){box.innerHTML='<div class="mksec first">'+mkSuggHtml()+'</div>';return;}
  var uqi=-1;for(var u=la-1;u>=0;u--){if(H[u].role==='user'){uqi=u;break;}}
  var html='';
  var earlier=[];
  for(var p=0;p<(uqi<0?0:uqi);p++){if(H[p].role==='user'&&H[p].text)earlier.push(H[p].text);}
  if(earlier.length){html+='<div class=mkprev>'+earlier.slice(-3).map(function(t){return '<div class=mkpq onclick="mkReask(this)" title="Ask again">'+mariaEsc(t)+'</div>';}).join('')+'</div>';}
  html+='<div class=mkans>';
  if(uqi>=0)html+='<div class=mkuq>'+(H[uqi].html||'')+'</div>';
  var m=H[la];
  html+='<div class=mkbig>'+(m.html||'')+'</div>';
  if(m.sources&&m.sources.length)html+='<div class=mksrc><span class=mksrclab>Checked</span>'+mkSrcChips(m.sources)+'</div>';
  if(m.logId){
    html+=m.voted?'<div class=mkfb>Thanks — your feedback was saved '+(m.voted===1?'&#128077;':'&#128078;')+'</div>'
      :'<div class=mkfb>Helpful?<button class=mkfbb onclick="mkVote('+m.logId+',1)">&#128077; Yes</button><button class=mkfbb onclick="mkVote('+m.logId+',0)">&#128078; No</button></div>';
  }
  html+='</div><div class=mksec>'+mkSuggHtml()+'</div>';
  box.innerHTML=html;
  box.scrollTop=0;
}
document.addEventListener('keydown',function(e){
  if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();if(mkIsOpen())mkClose();else mkOpen();return;}
  if(e.key==='Escape'&&mkIsOpen()){mkClose();return;}
  if(e.key==='Enter'&&mkIsOpen()&&e.target&&e.target.id==='mkq'){mkSend();}
});
function renderSettings(){ return renderData(); }
function renderData(){
  $('#view').innerHTML='<style>'
   +'.dswrap{display:grid;grid-template-columns:238px 1fr;gap:0;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(20,45,72,.06)}'
   +'.dsside{background:var(--navy);padding:22px 14px;display:flex;flex-direction:column;min-height:540px}'
   +'.dsbrandrow{display:flex;align-items:center;gap:9px;padding:0 6px}'
   +'.dswm{font-family:Outfit;font-size:24px;font-weight:800;color:#fff;letter-spacing:4px}'
   +'.dsline{height:2px;background:var(--green);width:112px;border-radius:1px;margin:8px 6px 7px}'
   +'.dssub{font-size:8px;font-weight:600;color:rgba(255,255,255,.5);letter-spacing:2px;text-transform:uppercase;line-height:1.6;padding:0 6px 18px}'
   +'.dsnav{display:block;width:100%;text-align:left;border:0;background:transparent;color:rgba(255,255,255,.72);font:600 14px DM Sans;padding:9px 11px;border-radius:8px;cursor:pointer;margin:1px 0}'
   +'.dsside .dsnav:hover{background:rgba(255,255,255,.07);color:#fff}'
   +'.dsside .dsnav.on{background:rgba(255,255,255,.13);color:#fff}'
   +'.dsdg3{margin-top:auto;padding:12px 8px 0;border-top:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.45);font-size:8px;letter-spacing:1px;text-transform:uppercase;display:flex;align-items:center;gap:8px}'
   +'.dsdg3 b{color:var(--green);font-family:Outfit;font-size:13px;letter-spacing:2px}'
   +'.dsmain{padding:22px 24px;min-width:0}'
   +'.dsmain .zlabel:first-child{margin-top:0}'
   +'</style>'
   +'<div class=dswrap>'
   +'<aside class=dsside>'
     +'<div class=dsbrandrow><svg width=27 height=27 viewBox="0 0 34 34" fill="none"><rect x=4 y=2 width=20 height=26 rx=2 stroke="#5FB946" stroke-width=1.8 fill="none"/><rect x=10 y=8 width=20 height=26 rx=2 stroke="#5FB946" stroke-width=1.2 fill="none" opacity=0.3/><line x1=8 y1=10 x2=20 y2=10 stroke="#5FB946" stroke-width=1.2 opacity=0.6/><line x1=8 y1=14 x2=18 y2=14 stroke="#5FB946" stroke-width=1.2 opacity=0.4/><line x1=8 y1=18 x2=16 y2=18 stroke="#5FB946" stroke-width=1.2 opacity=0.25/></svg><span class=dswm>CIMS</span></div>'
     +'<div class=dsline></div>'
     +'<div class=dssub>Cruise Industry<br>Managed Services</div>'
     +'<button class="dsnav setmenu" data-set="overview">Overview</button>'
     +'<button class="dsnav setmenu" data-set="uploads">Upload data</button>'
     +'<button class="dsnav setmenu" data-set="knowledge">Maria knowledge</button>'
     +'<button class="dsnav setmenu" data-set="session">Session</button>'
     +'<button class="dsnav setmenu" data-set="about">About</button>'
     +'<div class=dsdg3>A division of <b>DG3</b></div>'
   +'</aside>'
   +'<div class=dsmain><div id=setbody></div></div>'
   +'</div>';
  document.querySelectorAll('.setmenu').forEach(function(b){b.onclick=function(){document.querySelectorAll('.setmenu').forEach(function(x){x.classList.remove('on');});b.classList.add('on');setShow(b.getAttribute('data-set'));};});
  document.querySelector('.setmenu').classList.add('on');
  setShow('overview');
}
function setShow(s){ if(s==='overview')return dataOverview(); if(s==='uploads')return setUploads(); if(s==='knowledge')return setKnowledge(); if(s==='session')return setSession(); return setAbout(); }
function setKnowledge(){
  $('#setbody').innerHTML='<div class=kbwrap>'
   +'<div class=kbhead>Give Maria a document</div>'
   +'<div class=kbsub>Drop a file and she reads it, names it, and dates it. Nothing to fill in.</div>'
   +'<div id=kbhero class=kbhero><div class=kbglyph>&#8595;</div><h3>Drop a document here</h3><div class=kbp>Maria reads, names &amp; dates it automatically</div><div class=kbor>or <b id=kbchoose>choose a file</b> &middot; <b id=kbpastebtn>paste text</b></div></div>'
   +'<input type=file id=kbfile accept=".txt,.csv,.md,.text" style="display:none">'
   +'<div id=kbpaste class=kbpaste style="display:none"><textarea id=kbbody placeholder="Paste the document text here — Maria will name it"></textarea><div class=prow><button class=btn id=kbadd>Add</button></div></div>'
   +'<div id=kbmsg class=csub style="margin-top:8px;min-height:16px;color:var(--red)"></div>'
   +'<div id=kbresult></div>'
   +'<div class=kblbl>In Maria&rsquo;s library</div><div id=kblist class=csub>Loading&hellip;</div>'
   +'<div class=kbfoot>Text is context only — the database always wins on numbers. You can also drop files in Drive &rsaquo; 5. IT &rsaquo; Ask Maria (picked up nightly).</div>'
   +'</div>';
  var hero=$('#kbhero'), fi=$('#kbfile');
  hero.onclick=function(){ fi.click(); };
  $('#kbpastebtn').onclick=function(e){ e.stopPropagation(); var p=$('#kbpaste'); var show=(p.style.display==='none'); p.style.display=show?'block':'none'; if(show){$('#kbbody').focus();} };
  hero.ondragover=function(e){e.preventDefault();hero.classList.add('drag');};
  hero.ondragleave=function(){hero.classList.remove('drag');};
  hero.ondrop=function(e){e.preventDefault();hero.classList.remove('drag'); readKbFile(e.dataTransfer.files&&e.dataTransfer.files[0]);};
  fi.onchange=function(){readKbFile(fi.files&&fi.files[0]);};
  function readKbFile(f){ if(!f)return; if(f.size>500000){kbMsg('That file is over 500 KB of text — trim it or split it.');return;} var rd=new FileReader(); rd.onload=function(){ kbIngest(String(rd.result||''), f.name, Math.round((f.size||0)/1024*10)/10); }; rd.readAsText(f); }
  $('#kbadd').onclick=function(){ var bd=$('#kbbody').value.trim(); if(bd.length<20){kbMsg('Add at least a paragraph of text.');return;} kbIngest(bd, null, Math.round(bd.length/1024*10)/10); };
  kbList();
}
function kbMsg(m){ var e=$('#kbmsg'); if(e)e.textContent=m||''; }
async function kbIngest(text, filename, kb){
  if(!text||text.trim().length<20){kbMsg('Too short to be useful — add a bit more text.');return;}
  kbMsg('');
  var slot=$('#kbresult'); if(!slot)return;
  slot.innerHTML='<div class=kbjust><div class="kbtick wait">&hellip;</div><div class=jb><div class=jn>Maria is reading and naming it&hellip;</div><div class=jm>'+(filename?mariaEsc(filename)+' &middot; ':'')+kb+' KB</div></div></div>';
  try{
    var r=await fetch('/api/maria/knowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:text,source:'console'})});
    var j=await r.json();
    if(j&&j.ok){
      slot.innerHTML='<div class=kbjust><div class=kbtick>&#10003;</div><div class=jb><div class=jn>'+mariaEsc(j.title||'')+' <span class=kbspark>Maria named it</span></div><div class=jm>'+(j.doc_date||'')+' &middot; '+kb+' KB &middot; added just now</div></div></div>';
      $('#kbbody').value=''; var p=$('#kbpaste'); if(p)p.style.display='none';
      kbList();
    } else { slot.innerHTML=''; kbMsg((j&&j.error)||'Could not save.'); }
  }catch(e){ slot.innerHTML=''; kbMsg('Network error — try again.'); }
}
async function kbList(){
  var el=$('#kblist'); if(!el)return;
  try{ var r=await fetch('/api/maria/knowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list'})});
    var j=await r.json();
    if(!j||!j.docs){el.textContent=(j&&j.error)||'Not available.';return;}
    if(!j.docs.length){el.innerHTML='<div class=csub style="opacity:.7">Nothing yet — drop your first document above.</div>';return;}
    el.innerHTML=j.docs.map(function(d){
      var dim=d.status!=='active';
      var kb=Math.round((d.bytes||0)/1024*10)/10;
      var src=(d.source&&d.source!=='console')?' &middot; '+mariaEsc(d.source):'';
      return '<div class="kbrow'+(dim?' off':'')+'"><span class=kd></span><div class=kt><div class=kh>'+mariaEsc(d.title)+'</div><div class=km>'+(d.doc_date||String(d.ts||'').slice(0,10))+' &middot; '+kb+' KB'+src+(dim?' &middot; retired':'')+'</div></div><span class=ka onclick="kbFlip('+d.id+','+(dim?0:1)+')">'+(dim?'Restore':'Retire')+'</span></div>';
    }).join('');
  }catch(e){el.textContent='Could not load list.';}
}
async function kbFlip(id,retire){
  try{ await fetch('/api/maria/knowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:(retire===1?'retire':'restore'),id:id})}); }catch(e){}
  kbList();
}
function setUploads(){
  $('#setbody').innerHTML='<style>'
   +'#dz2{border:2px dashed var(--line-2);border-radius:12px;background:#fff;padding:36px 18px;text-align:center;color:var(--mut);cursor:pointer;transition:border-color .15s,background .15s}'
   +'#dz2.over,#dz2:hover{border-color:var(--green);background:#F2F8EF}'
   +'#dz2 b{display:block;font-family:Outfit;font-weight:700;font-size:15px;color:var(--navy);margin-bottom:3px}'
   +'.upband{display:flex;align-items:center;gap:12px;margin-top:12px;border-radius:12px;padding:12px 15px}'
   +'.upband.ok{background:#EAF5E4;border:1px solid #CDE8C1}'
   +'.upband.warn{background:#FBF2E0;border:1px solid #EAD9AE}'
   +'.upband .tk{width:26px;height:26px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:14px;flex:none}'
   +'.upband.ok .tk{background:var(--green-d)}.upband.warn .tk{background:var(--amber)}'
   +'.upband .t{font-family:Outfit;font-weight:700}'
   +'.upband.ok .t{color:var(--green-d)}.upband.warn .t{color:var(--amber)}'
   +'.upband .m{font-size:12px;opacity:.92}'
   +'.upband.ok .m{color:var(--green-d)}.upband.warn .m{color:var(--amber)}'
   +'.upband .fn{font-size:11.5px;color:var(--mut)}'
   +'.upband .act{margin-left:auto;white-space:nowrap;display:flex;gap:6px;align-items:center}'
   +'</style>'
   +'<div class=csub style="font-size:12px;margin-bottom:2px">Data &middot; Uploads</div>'
   +'<h2 style="font-family:Outfit;font-size:22px;font-weight:600;color:var(--navy);margin:0 0 4px">Upload data</h2>'
   +'<div class=csub style="margin:0 0 16px;font-size:13px">Drop a file &mdash; we recognize it, then show you exactly what changes before anything is saved.</div>'
   +'<div id=dz2><b>Drag &amp; drop a file, or click to choose</b>Excel from TDG &middot; read in your browser</div>'
   +'<input type=file id=crewfile accept=".xls,.xlsx" style="display:none" onchange="handleDrop(this.files)">'
   +'<div id=band></div>'
   +'<div id=vesselframe style="display:none;margin-top:12px"></div>'
   +'<div id=imp style="margin-top:12px"></div>'
   +'<p class=csub style="margin-top:14px">Accepted: Crew registry (AdvancedQuery) &middot; Keyman contracts &middot; Travel expenses &middot; <a href="#" onclick="upVessel();return false" style="color:var(--navy)">Vessel deployment</a>. Nothing is saved without review, and bonus baselines are never affected.</p>';
  var dz=$('#dz2'), fi=$('#crewfile');
  dz.onclick=function(){fi.click();};
  dz.ondragover=function(e){e.preventDefault();dz.classList.add('over');};
  dz.ondragleave=function(e){e.preventDefault();dz.classList.remove('over');};
  dz.ondrop=function(e){e.preventDefault();dz.classList.remove('over');handleDrop(e.dataTransfer.files);};
}
function upVessel(){
  var vf=$('#vesselframe');$('#band').innerHTML='';$('#imp').innerHTML='';
  if(vf){vf.innerHTML='<iframe src="/api/relief/deploy" title="Vessel deployment loader" style="width:100%;height:680px;border:0;border-radius:12px;background:#fff"></iframe>';vf.style.display='';}
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
        sha256buf(e.target.result).then(function(hh){IMPHASH=hh;IMPNAME=f.name;cimsStage();});
      }catch(err){$('#imp').textContent='Could not parse that file: '+err.message;}
    };
    rd.readAsArrayBuffer(f);
  });
}
var PENDF=null;
function upNorm(s){return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');}
function upBand(label,score,total,f){
  $('#band').innerHTML='<div class="upband ok"><span class=tk>&#10003;</span><div><div class=t>Recognized: '+label+'</div><div class=m style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">'+(total?(score+' / '+total+' signature columns matched &middot; auto-selected'):'auto-selected')+'</div><div class=fn style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">'+f.name+'</div></div><span class=act><a href="#" onclick="upChoose();return false" style="color:var(--green-d);font-size:12.5px">Not this? Change type</a></span></div>';
}
function upChoose(){
  var f=PENDF;if(!f)return setUploads();
  $('#imp').innerHTML='';
  $('#band').innerHTML='<div class="upband warn"><span class=tk>?</span><div><div class=t>Choose the file type</div><div class=m>We will treat '+f.name+' as the type you pick.</div></div><span class=act>'
   +'<button class="btn" onclick="upForce(1)">Crew registry</button>'
   +'<button class="btn ghost" onclick="upForce(2)">Keyman</button>'
   +'<button class="btn ghost" onclick="upForce(3)">Travel</button>'
   +'<a href="#" onclick="setUploads();return false" style="color:var(--mut);font-size:12.5px;margin-left:4px">Start over</a></span></div>';
}
function upForce(k){
  var f=PENDF;if(!f)return;
  if(k===1){upBand('Crew registry &mdash; AdvancedQuery',0,0,f);parseCrewFile(f);}
  else if(k===2){upBand('Keyman contracts',0,0,f);parseKeymanFile(f);}
  else{upBand('Travel expenses',0,0,f);parseTravelFile(f);}
}
function handleDrop(files){
  var f=files&&files[0]; if(!f)return;
  var nm=String(f.name).toLowerCase();
  if(!(nm.slice(-4)==='.xls'||nm.slice(-5)==='.xlsx')){$('#imp').textContent='Please upload a .xls or .xlsx file.';return;}
  PENDF=f;$('#imp').innerHTML='';
  $('#band').innerHTML='<div class=csub style="margin-top:10px">Reading '+f.name+' &hellip;</div>';
  var vf=$('#vesselframe');if(vf){vf.style.display='none';vf.innerHTML='';}
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      var heads=[];
      try{
        var wb=XLSX.read(e.target.result,{type:'array'});
        var ws=wb.Sheets[wb.SheetNames[0]];
        var aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
        for(var i=0;i<Math.min(aoa.length,15);i++){
          var row=(aoa[i]||[]).map(function(c){return upNorm(c);}).filter(function(x){return x;});
          if(row.length>heads.length)heads=row;
          if(row.join('|').indexOf('crewid')>=0){heads=row;break;}
        }
      }catch(err){$('#band').innerHTML='';$('#imp').textContent='Could not read that file: '+err.message;return;}
      var joined=heads.join('|');
      var SIGC=['crewid','firstname','lastname','status','rank','vessel','medicalexpiration','sirb','passport','usvisa','mobile','province'];
      var score=0;SIGC.forEach(function(x){if(joined.indexOf(x)>=0)score++;});
      if(joined.indexOf('crewid')>=0&&score>=8){upBand('Crew registry &mdash; AdvancedQuery',score,SIGC.length,f);parseCrewFile(f);return;}
      if(joined.indexOf('ttlmonths')>=0||(joined.indexOf('signon')>=0&&joined.indexOf('projectedsignoff')>=0)){upBand('Keyman contracts',0,0,f);parseKeymanFile(f);return;}
      if(joined.indexOf('hotel')>=0&&joined.indexOf('air')>=0){upBand('Travel expenses',0,0,f);parseTravelFile(f);return;}
      $('#band').innerHTML='<div class="upband warn"><span class=tk>?</span><div><div class=t>Not sure what this file is</div><div class=m>Choose the type and we will treat it that way.</div><div class=fn>'+f.name+'</div></div><span class=act>'
       +'<button class="btn" onclick="upForce(1)">Crew registry</button>'
       +'<button class="btn ghost" onclick="upForce(2)">Keyman</button>'
       +'<button class="btn ghost" onclick="upForce(3)">Travel</button></span></div>';
    };
    rd.readAsArrayBuffer(f);
  });
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
// ===== Inline branded crew importer for the console Data tab (served form) =====
// Replaces the old previewImport()/applyImport() (which hit the retired direct-write endpoint).
// Talks ONLY to the safe /api/crew/import/stage + /apply. Renders the tiered review + a live
// cart inline into #imp, using the console's existing brand (navy/green, Outfit/DM Sans).
// No backticks and no dollar-brace interpolation and no quote nesting, so source == served JS.
var STAGE=null,DEC={},IMPHASH=null,IMPNAME=null,NMAP={};
async function sha256buf(buf){var h=await crypto.subtle.digest("SHA-256",buf);return Array.from(new Uint8Array(h)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
function impEsc(s){return String(s==null?"":s).replace(/[&<>]/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":"&gt;";});}
function impWho(id){var n=NMAP[id];return n&&n!==id?impEsc(n)+' <span class=iid>'+impEsc(id)+'</span>':impEsc(id);}
async function cimsStage(){
  NMAP={};
  (IMPROWS||[]).forEach(function(row){var id="",fn="",ln="";for(var k in row){var nk=k.toLowerCase();if(nk.indexOf("crew id")>=0||nk.indexOf("crewid")>=0)id=String(row[k]).trim();else if(nk.indexOf("first")>=0)fn=String(row[k]).trim();else if(nk.indexOf("last")>=0||nk.indexOf("surname")>=0)ln=String(row[k]).trim();}if(id)NMAP[id]=(fn+" "+ln).trim()||id;});
  $("#imp").innerHTML='<div class=csub>Reading '+impEsc(IMPNAME)+' &hellip;</div>';
  var res;try{res=await (await fetch("/api/crew/import/stage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:IMPROWS,file_hash:IMPHASH,filename:IMPNAME})})).json();}catch(e){res={ok:false,error:"network"};}
  if(!res.ok){$("#imp").innerHTML='<div style="'+BADBOX+'">'+(res.error==="already_processed"?"This exact file was already imported &mdash; nothing to do.":"Stage failed: "+impEsc(res.error))+'</div>';return;}
  STAGE=res;DEC={};cimsRender();
}
function impSeg(key,def,a,b,la,lb,soft){var cur=DEC[key]||def;return '<span class="iseg'+(soft?" soft":"")+'"><button class="impb'+(cur===a?" on":"")+'" data-k="'+key+'" data-v="'+a+'">'+la+'</button><button class="impb'+(cur===b?" on":"")+'" data-k="'+key+'" data-v="'+b+'">'+lb+'</button></span>';}
function impTag(txt,kind){return ' <span class="itag t-'+kind+'">'+txt+'</span>';}
function impDiff(lab,o,n,tag){return '<div class=irow><span class=ik>'+impEsc(lab)+'</span><span class=idf><span class=iold>'+impEsc(o)+'</span> <span class=iarw>&#8594;</span> <span class=inew>'+impEsc(n)+'</span>'+(tag||"")+'</span></div>';}
function impCard(inner){return '<div class=icard>'+inner+'</div>';}
function impFld(f){return (typeof IMP_FLAB!=="undefined"&&IMP_FLAB[f])?IMP_FLAB[f]:f;}
function cimsRender(){
  var g=STAGE.review.groups,c=STAGE.review.counts,L="";
  L+='<style>'
   +'.chips2{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 4px}'
   +'.chip2{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid var(--line-2);border-radius:999px;padding:6px 13px;font-weight:600;font-size:13px;box-shadow:0 1px 2px rgba(20,45,72,.05)}'
   +'.chip2 .n{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}'
   +'.chip2.amber{color:var(--amber)}.chip2.red{color:var(--red)}.chip2.green{color:var(--green-d)}.chip2.navy{color:var(--navy)}.chip2.gray{color:var(--mut)}'
   +'.isec{margin-top:20px}'
   +'.isec h3{font-family:Outfit;font-size:15px;font-weight:600;color:var(--navy);margin:0 0 2px;display:flex;align-items:center;gap:8px}'
   +'.isec .d{color:var(--mut);font-size:12.5px;margin-bottom:10px}'
   +'.icard{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 15px;margin-bottom:9px;box-shadow:0 1px 2px rgba(20,45,72,.05)}'
   +'.iwho{font-weight:600;color:var(--navy);display:flex;align-items:baseline;gap:9px;font-size:14px}'
   +'.iid{color:var(--mut);font-weight:500;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}'
   +'.irow{margin-top:8px;display:grid;grid-template-columns:110px 1fr;gap:10px;align-items:center;font-size:13.5px}'
   +'.ik{color:var(--mut);font-size:11.5px;text-transform:uppercase;letter-spacing:.4px}'
   +'.idf{display:flex;align-items:center;gap:9px;flex-wrap:wrap}'
   +'.iold{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--mut);text-decoration:line-through;font-size:12.5px}'
   +'.iarw{color:var(--mut)}'
   +'.inew{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;font-size:12.5px;color:var(--navy)}'
   +'.itag{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px}'
   +'.itag.t-amber{background:#FBF2E0;color:var(--amber)}.itag.t-red{background:#FBE9E7;color:var(--red)}.itag.t-green{background:#EAF5E4;color:var(--green-d)}'
   +'.iseg{display:inline-flex;border:1px solid var(--line-2);border-radius:8px;overflow:hidden;margin-top:10px}'
   +'.impb{border:0;background:#fff;padding:6px 14px;font:700 12.5px DM Sans;color:var(--mut);cursor:pointer}'
   +'.impb+.impb{border-left:1px solid var(--line-2)}'
   +'.impb.on{background:var(--navy);color:#fff}'
   +'.iseg.soft .impb.on{background:var(--bg);color:var(--navy)}'
   +'details.iminor{background:#fff;border:1px solid var(--line);border-radius:12px;padding:4px 15px;margin-top:20px;box-shadow:0 1px 2px rgba(20,45,72,.05)}'
   +'details.iminor summary{cursor:pointer;font-weight:600;color:var(--mut);padding:9px 0;font-size:13.5px}'
   +'details.iminor summary .c{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--mut);background:var(--bg);border-radius:20px;padding:1px 8px;margin-right:4px}'
   +'.cart2{position:sticky;top:12px;background:#fff;border:1px solid var(--line-2);border-radius:16px;box-shadow:0 6px 22px rgba(20,45,72,.09);overflow:hidden}'
   +'.cart2 .ch{padding:16px 18px 13px;background:var(--navy);color:#fff}'
   +'.cart2 .ch .h{font-family:Outfit;font-weight:600;font-size:15px}'
   +'.cart2 .ch .sub{color:rgba(255,255,255,.6);font-size:12px;margin-top:2px}'
   +'.cart2 .items{padding:8px 18px}'
   +'.cli{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--line)}'
   +'.cli:last-child{border-bottom:0}'
   +'.cic{width:23px;height:23px;border-radius:6px;display:grid;place-items:center;font-size:12px;flex:none}'
   +'.ci-green{background:#EAF5E4;color:var(--green-d)}.ci-navy{background:#E7EDF4;color:var(--navy)}.ci-gray{background:var(--bg);color:var(--mut)}.ci-amber{background:#FBF2E0;color:var(--amber)}.ci-red{background:#FBE9E7;color:var(--red)}'
   +'.cli .nm{font-size:13.5px;flex:1;color:var(--navy);font-weight:600}'
   +'.cli .nm small{display:block;color:var(--mut);font-size:11px;font-weight:400}'
   +'.cli .q{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;font-size:12.5px}'
   +'.cli .q.save{color:var(--green-d)}.cli .q.held{color:var(--amber)}'
   +'.cart2 .totals{padding:13px 18px;background:#F7F9FC;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}'
   +'.ctl{display:flex;align-items:center;justify-content:space-between;font-size:13.5px;padding:2px 0;color:var(--navy)}'
   +'.ctl .v{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700}'
   +'.ctl .v.save{color:var(--green-d)}.ctl .v.keep{color:var(--amber)}'
   +'.cart2 .foot{padding:15px 18px}'
   +'.applyb2{width:100%;border:0;border-radius:11px;background:var(--green-d);color:#fff;padding:13px;font-family:Outfit;font-weight:700;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 2px 9px rgba(62,142,42,.32)}'
   +'.applyb2[disabled]{opacity:.6;cursor:default}'
   +'.applyb2 .k{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:rgba(255,255,255,.22);border-radius:6px;padding:1px 7px;font-size:13px}'
   +'.discard2{width:100%;border:0;background:transparent;color:var(--mut);padding:10px;margin-top:4px;font-weight:600;font-size:13px;cursor:pointer;font-family:DM Sans}'
   +'.lock2{display:flex;align-items:center;gap:7px;justify-content:center;color:var(--green-d);background:#EAF5E4;border:1px solid #CDE8C1;border-radius:9px;padding:8px;margin-top:10px;font-size:11px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}'
   +'</style>';
  L+='<div style="display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start;margin-top:10px">';
  L+='<div>';
  L+='<div class=chips2>'
    +'<span class="chip2 amber">&#9875; <span class=n>'+c.ship_flag+'</span> ship</span>'
    +'<span class="chip2 red">&#9679; <span class=n>'+(c.critical+c.override_conflict)+'</span> needs you</span>'
    +'<span class="chip2 green">&#9677; <span class=n>'+c.cert+'</span> certificates</span>'
    +'<span class="chip2 navy">&#65291; <span class=n>'+c.new+'</span> new</span>'
    +'<span class="chip2 gray">&#128682; <span class=n>'+c.departed+'</span> departed</span></div>';
  if(g.ship_flag.length){L+='<div class=isec><h3>&#9875; Ship allocation &mdash; the file disagrees with your board</h3><div class=d>Your allocation stays. Flagged for the board unless you dismiss. The file never changes a ship.</div>';
    g.ship_flag.forEach(function(it){L+=impCard('<div class=iwho>'+impWho(it.agency_id)+'</div>'+impDiff("Current ship",it.old,it.new,impTag("agency reports","amber"))+impSeg("ship:"+it.agency_id,"flag","flag","dismiss","Keep board","Dismiss"));});L+='</div>';}
  if(g.override_conflict.length||g.critical.length){L+='<div class=isec><h3>&#9679; Needs your decision</h3><div class=d>A field you set by hand, and status changes. Defaults to keeping yours.</div>';
    g.override_conflict.forEach(function(it){L+=impCard('<div class=iwho>'+impWho(it.agency_id)+'</div>'+impDiff(impFld(it.field),it.old,it.new,impTag("&#9995; your manual entry","red"))+impSeg(it.agency_id+":"+it.field,"keep","accept","keep","Accept file","Keep mine"));});
    g.critical.forEach(function(it){L+=impCard('<div class=iwho>'+impWho(it.agency_id)+'</div>'+impDiff(impFld(it.field),it.old,it.new,"")+impSeg(it.agency_id+":"+it.field,"keep","accept","keep","Accept","Keep"));});L+='</div>';}
  if(g.cert.length){L+='<div class=isec><h3>&#9677; Certificate updates from TDG</h3><div class=d>Accepted by default &mdash; TDG maintains these. An expiry moving earlier is flagged.</div>';
    g.cert.forEach(function(it){L+=impCard('<div class=iwho>'+impWho(it.agency_id)+'</div>'+impDiff(impFld(it.field),it.old,it.new,it.earlier?impTag("&#9888; moved earlier","amber"):impTag("renewed","green"))+impSeg(it.agency_id+":"+it.field,"accept","accept","keep","Accept","Hold",true));});L+='</div>';}
  if(g.new.length){L+='<div class=isec><h3>&#65291; New crew</h3>';
    g.new.forEach(function(it){var f=it.fields||{};L+=impCard('<div class=iwho>'+impEsc(((f.first_name||"")+" "+(f.last_name||"")).trim()||it.agency_id)+' <span class=iid>'+impEsc(it.agency_id)+'</span></div><div class=irow><span class=ik>Joining</span><span class=idf><span class=inew>'+impEsc(f.vessel_observed||"&mdash;")+'</span> <span class=csub>'+impEsc(f.rank_observed||"")+'</span>'+(f.status?impTag(impEsc(f.status),"green"):"")+'</span></div>'+impSeg("new:"+it.agency_id,"add","add","skip","Add","Skip"));});L+='</div>';}
  if(g.departed.length){L+='<div class=isec><h3>&#128682; Absent from this file</h3><div class=d>Never auto-removed. Decide the status yourself.</div>';
    g.departed.forEach(function(it){L+=impCard('<div class=iwho>'+impWho(it.agency_id)+'</div>'+impSeg("departed:"+it.agency_id,"flag","flag","dismiss","Flag","Dismiss",true));});L+='</div>';}
  if(g.minor.length){L+='<details class=iminor><summary><span class=c>'+g.minor.length+'</span> minor tidy-ups auto-applied (spelling, spacing)</summary>'+g.minor.map(function(it){return '<div style="font-size:12px;color:var(--mut);padding:3px 0">'+impWho(it.agency_id)+' &middot; '+impEsc(impFld(it.field))+' &#8594; '+impEsc(it.new)+'</div>';}).join("")+'</details>';}
  L+='</div>';
  L+='<div id=impcart></div>';
  L+='</div>';
  $("#imp").innerHTML=L;
  $("#imp").onclick=function(e){var b=e.target.closest?e.target.closest(".impb"):null;if(!b)return;DEC[b.getAttribute("data-k")]=b.getAttribute("data-v");var sib=b.parentNode.querySelectorAll(".impb");for(var i=0;i<sib.length;i++)sib[i].classList.toggle("on",sib[i].getAttribute("data-v")===b.getAttribute("data-v"));cimsCart();};
  cimsCart();
}
function cimsCart(){
  var g=STAGE.review.groups;function d(k,def){return DEC[k]||def;}
  var certAcc=0;g.cert.forEach(function(it){if(d(it.agency_id+":"+it.field,"accept")==="accept")certAcc++;});
  var ovAcc=0,ovKeep=0;g.override_conflict.forEach(function(it){if(d(it.agency_id+":"+it.field,"keep")==="accept")ovAcc++;else ovKeep++;});
  var crAcc=0,crKeep=0;g.critical.forEach(function(it){if(d(it.agency_id+":"+it.field,"keep")==="accept")crAcc++;else crKeep++;});
  var newAdd=0;g.new.forEach(function(it){if(d("new:"+it.agency_id,"add")==="add")newAdd++;});
  var minor=g.minor.length;
  var shipFlag=0;g.ship_flag.forEach(function(it){if(d("ship:"+it.agency_id,"flag")==="flag")shipFlag++;});
  var depFlag=0;g.departed.forEach(function(it){if(d("departed:"+it.agency_id,"flag")==="flag")depFlag++;});
  var fieldSave=ovAcc+crAcc,willSave=certAcc+newAdd+minor+fieldSave,kept=shipFlag+ovKeep+crKeep,flags=shipFlag+depFlag;
  var rows="";
  function cli(icls,ic,name,sub,q,qcls){return '<div class=cli><span class="cic '+icls+'">'+ic+'</span><span class=nm>'+name+(sub?'<small>'+sub+'</small>':'')+'</span><span class="q '+qcls+'">'+q+'</span></div>';}
  var newSub="added to roster";
  if(g.new.length===1){var nf=g.new[0].fields||{};var nn=((nf.first_name||"")+" "+(nf.last_name||"")).trim();if(nn)newSub=impEsc(nn);}
  if(g.cert.length)rows+=cli("ci-green","&#9677;","Certificates","medical, visas, SIRB",certAcc+" save","save");
  if((g.override_conflict.length+g.critical.length)&&fieldSave)rows+=cli("ci-green","&#9998;","Field updates","status, contact",fieldSave+" save","save");
  if(g.new.length)rows+=cli("ci-navy","&#65291;","New crew",newSub,newAdd+" save","save");
  if(g.minor.length)rows+=cli("ci-gray","&#9881;","Minor tidy-ups","spelling, spacing",minor+" save","save");
  if(g.ship_flag.length)rows+=cli("ci-amber","&#9875;","Ship flag","kept on your board",shipFlag+" held","held");
  if((g.override_conflict.length+g.critical.length)&&(ovKeep+crKeep))rows+=cli("ci-red","&#9995;","Manual edit","kept as yours",(ovKeep+crKeep)+" held","held");
  if(!rows)rows='<div class=csub style="padding:8px 0">Nothing to apply &mdash; all rows match.</div>';
  var H='<div class=cart2>';
  H+='<div class=ch><div class=h>Ready to apply</div><div class=sub>'+STAGE.rows_seen+' crew read &middot; from AdvancedQuery</div></div>';
  H+='<div class=items>'+rows+'</div>';
  H+='<div class=totals><div class=ctl><span>Will save to roster</span><span class="v save">'+willSave+'</span></div><div class=ctl><span>Kept as yours</span><span class="v keep">'+kept+'</span></div></div>';
  H+='<div class=foot><button class=applyb2 onclick="cimsApply()"'+((willSave+flags)?"":" disabled")+'>Apply <span class=k>'+willSave+'</span> updates <span>&#8594;</span></button>'
   +'<button class=discard2 onclick="setUploads()">Discard all</button>'
   +'<div class=lock2>&#128274; NOTHING SAVED UNTIL YOU APPLY</div></div>';
  H+='</div>';
  $("#impcart").innerHTML=H;
}
async function cimsApply(){
  var btn=$("#impcart")?$("#impcart").querySelector(".applyb2"):null;if(btn){btn.disabled=true;btn.textContent="Applying&hellip;";}
  var body={review:STAGE.review,decisions:DEC,file_hash:IMPHASH,filename:IMPNAME,rows_seen:STAGE.rows_seen,run_by:"Rita"};
  var res;try{res=await (await fetch("/api/crew/import/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();}catch(e){res={ok:false,error:"network"};}
  if(!res.ok){$("#imp").innerHTML='<div style="'+BADBOX+'">'+(res.error==="already_processed"?"Already processed.":"Apply failed: "+impEsc(res.error))+'</div>';return;}
  $("#imp").innerHTML='<div style="'+NOCHG+'">&#10003; Applied '+res.applied+' changes &middot; added '+res.added+' crew &middot; '+res.open_conflicts+' flags for the board &middot; logged to import history. Nothing else was touched.</div>';
  STAGE=null;DEC={};IMPROWS=null;
}
// [removed 2026-07-22] previewImport()/applyImport() deleted — dead code that POSTed to the
// RETIRED /api/crew/import (direct-write). The live upload path is parseCrewFile -> cimsStage
// -> /api/crew/import/stage + /apply (reviewed importer). Kept the retired-route guard as a
// safety net so any stale client still gets a clean error instead of a silent write.
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
var TBUD=15000; // monthly travel budget — source: travel workbook SUMMARY!C55 ($15k/mo, $180k/yr). Edit here if the budget changes.
var TSEL=null;  // drilled-down crew name (null = overview)
var TLB=[];     // current leaderboard names (drill-click target by index)
var TMN=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function renderTravel(){
  $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2><span class=muted style="padding:0">Loading…</span></div>';
  try{ TRV=await (await fetch('/api/travel')).json(); if(TRV&&TRV.error)throw new Error(TRV.error); }
  catch(e){ $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2></div><div class="card" style="max-width:none"><b>Could not load travel data.</b><button class="btn" style="margin-top:10px" onclick="renderTravel()">Retry</button></div>'; return; }
  TRVALL=TRV.records||[];
  TSEL=null;
  TF={q:'',year:'',month:'',cat:'',kind:'crew'};
  var years=(TRV.years||[]).slice();
  $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2>'
    +'<input id=tq placeholder="search a person…" oninput="TF.q=this.value;paintTravel()" style="margin-left:auto;width:180px">'
    +'<select id=tyear onchange="TF.year=this.value;paintTravel()"><option value="">All years</option>'+years.map(function(y){return '<option>'+y+'</option>';}).join('')+'</select>'
    +'<select id=tmonth onchange="TF.month=this.value;paintTravel()"><option value="">All months</option>'+TMN.slice(1).map(function(m,i){return '<option value="'+(i+1)+'">'+m+'</option>';}).join('')+'</select>'
    +'<select id=tcat onchange="TF.cat=this.value;paintTravel()"><option value="">All categories</option>'+TCATS.map(function(c){return '<option value="'+c+'">'+TCATLAB[c]+'</option>';}).join('')+'</select>'
    +'<select id=tkind onchange="TF.kind=this.value;paintTravel()"><option value="crew" selected>Crew only</option><option value="">Crew + shoreside</option><option value="shoreside">Shoreside only</option></select>'
    +'</div><div id=trbody></div>';
  paintTravel();
}

function tScope(){return TRVALL.filter(function(r){if(TF.kind&&(r.kind||'crew')!==TF.kind)return false;if(TF.q&&(r.crew_name||'').toLowerCase().indexOf(TF.q.toLowerCase())<0)return false;return true;});}
function tSum(rows,yr,months,cat){var t=0;for(var i=0;i<rows.length;i++){var r=rows[i];if(yr&&r.year!==yr)continue;if(months&&months.indexOf(r.month)<0)continue;t+=cat?(r[cat]||0):r.total;}return t;}
function pv(v,l,col){return '<div><div style="font-family:Outfit;font-size:24px;font-weight:800;color:'+(col||'var(--navy)')+'">'+v+'</div><div class=hint style="margin-top:0">'+l+'</div></div>';}
function travelDrill(i){TSEL=TLB[i];paintTravel();window.scrollTo(0,0);}
function travelBack(){TSEL=null;paintTravel();}

function paintTravel(){
  if(TSEL)return paintTravelCrew();
  if((TF.q||'').trim())return paintTravelSearch();
  var sc=tScope();
  var ys=Array.from(new Set(sc.map(function(r){return r.year;}))).sort(function(a,b){return b-a;});
  var LY=TF.year?+TF.year:ys[0], PY=TF.year?(+TF.year-1):ys[1];
  if(!LY){document.getElementById('trbody').innerHTML='<div class=muted>No travel data for this filter.</div>';return;}
  var now=new Date(),curY=now.getFullYear(),curM=now.getMonth()+1;
  var lastMo=(LY===curY)?curM:12;                 // YTD = ELAPSED calendar months (not months that merely have a row)
  var monthsLY=[];for(var mm=1;mm<=lastMo;mm++)monthsLY.push(mm);
  var dataMo={};sc.filter(function(r){return r.year===LY;}).forEach(function(r){dataMo[r.month]=1;}); // months with any record (for the table)
  var ytdA=tSum(sc,LY,monthsLY,null), ytdB=TBUD*lastMo, ytdP=PY?tSum(sc,PY,monthsLY,null):null;
  var air=tSum(sc,LY,monthsLY,'air');
  var byp={};sc.filter(function(r){return r.year===LY;}).forEach(function(r){byp[r.crew_name]=(byp[r.crew_name]||0)+r.total;});
  var pctUsed=Math.round(ytdA/(TBUD*12)*100);
  var fullProj=lastMo?(ytdA/lastMo*12):0;
  var h='';
  h+='<div class=tiles style="grid-template-columns:repeat(5,1fr);margin-bottom:6px">'
    +tile(usd0(ytdA),'YTD actual '+LY+' · '+lastMo+' mo')
    +tile('<span style="color:'+(ytdA<=ytdB?'var(--green-d)':'var(--red)')+'">'+usd0(Math.abs(ytdB-ytdA))+'</span>',(ytdA<=ytdB?'under':'over')+' budget YTD · '+usd0(ytdB))
    +tile((ytdP==null?'—':deltaCell(ytdA,ytdP)),'vs '+(PY||'PY')+' same period'+(ytdP!=null?(' · '+usd0(ytdP)):''))
    +tile(usd0(air)+' · '+(ytdA?Math.round(air/ytdA*100):0)+'%','Air share','amber')
    +tile('<span style="color:'+(pctUsed<=100?'var(--green-d)':'var(--red)')+'">'+pctUsed+'%</span>','of '+usd0(TBUD*12)+' annual budget used')+'</div>';
  h+='<div class=zlabel>Plan vs actual — budget pacing '+LY+'</div>';
  h+='<div class="card" style="max-width:none">';
  h+='<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:baseline;margin-bottom:10px">'
    +pv(usd0(ytdA),'YTD actual','var(--navy)')
    +pv(usd0(ytdB),'YTD budget','var(--muted)')
    +pv((ytdA<=ytdB?'+':'')+usd0(ytdB-ytdA),'variance ('+(ytdA<=ytdB?'under':'over')+')',ytdA<=ytdB?'var(--green-d)':'var(--red)')
    +pv(usd0(fullProj),'projected FY vs '+usd0(TBUD*12),fullProj<=TBUD*12?'var(--green-d)':'var(--red)')
    +'</div>';
  var maxv=TBUD;for(var m=1;m<=12;m++){var a=tSum(sc,LY,[m],null);if(a>maxv)maxv=a;}
  var budTop=(1-TBUD/maxv)*100;
  h+='<div style="display:flex;align-items:flex-end;gap:8px;height:150px;padding:14px 0 0;border-bottom:1px solid var(--line-2);position:relative">';
  h+='<div style="position:absolute;left:0;right:0;top:'+budTop.toFixed(1)+'%;border-top:2px dashed var(--amber)"></div>';
  for(var m=1;m<=12;m++){var a=tSum(sc,LY,[m],null);var hp=(a/maxv*100).toFixed(1);var over=a>TBUD;
    h+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;z-index:1">'
      +'<div style="font-size:9px;color:var(--navy);font-weight:700">'+(a?usd0(a):'')+'</div>'
      +'<div style="width:62%;border-radius:4px 4px 0 0;min-height:2px;height:'+hp+'%;background:'+(over?'var(--red)':'var(--navy)')+'"></div>'
      +'<div style="font-size:10px;color:var(--muted);margin-top:4px">'+TMN[m]+'</div></div>';}
  h+='</div>';
  h+='<div class=hint style="margin-top:6px">Dashed line = '+usd0(TBUD)+'/mo budget (source: travel sheet). Red bars = over budget. Projection = YTD run-rate × 12.</div>';
  h+='<table class=tbl style="margin-top:12px"><thead><tr><th>Month</th><th style="text-align:right">Actual</th><th style="text-align:right">Budget</th><th style="text-align:right">Variance</th><th style="text-align:right">'+(PY||'PY')+'</th></tr></thead><tbody>';
  for(var m=1;m<=12;m++){var a=tSum(sc,LY,[m],null);var p=PY?tSum(sc,PY,[m],null):null;var has=(!!dataMo[m]||m<=lastMo);var v=TBUD-a;
    if(!has&&!p)continue;
    h+='<tr><td>'+TMN[m]+'</td><td style="text-align:right">'+(has?usd0(a):'<span class=muted style="padding:0">pending</span>')+'</td><td style="text-align:right">'+usd0(TBUD)+'</td><td style="text-align:right">'+(has?('<span style="color:'+(v>=0?'var(--green-d)':'var(--red)')+';font-weight:700">'+(v>=0?'+':'')+usd0(v)+'</span>'):'—')+'</td><td style="text-align:right">'+(p?usd0(p):'—')+'</td></tr>';}
  h+='<tr style="border-top:2px solid var(--line-2)"><td><b>YTD</b></td><td style="text-align:right"><b>'+usd0(ytdA)+'</b></td><td style="text-align:right"><b>'+usd0(ytdB)+'</b></td><td style="text-align:right"><b><span style="color:'+(ytdB-ytdA>=0?'var(--green-d)':'var(--red)')+'">'+(ytdB-ytdA>=0?'+':'')+usd0(ytdB-ytdA)+'</span></b></td><td style="text-align:right"><b>'+(ytdP==null?'—':usd0(ytdP))+'</b></td></tr>';
  h+='</tbody></table></div>';
  h+='<div class=zlabel style="margin-top:18px">STLY — same time last year · '+TMN[1]+'–'+TMN[lastMo]+' ('+LY+' vs '+(PY||'PY')+') · top spenders</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
  var yc='<div><table class=tbl><thead><tr><th>Category</th><th style="text-align:right">STLY '+(PY||'')+'</th><th style="text-align:right">'+LY+'</th><th style="text-align:right">Δ</th></tr></thead><tbody>';
  TCATS.forEach(function(c){var l=tSum(sc,LY,monthsLY,c),p=PY?tSum(sc,PY,monthsLY,c):null;if(!l&&!p)return;yc+='<tr><td>'+TCATLAB[c]+'</td><td style="text-align:right">'+(p==null?'—':usd0(p))+'</td><td style="text-align:right">'+usd0(l)+'</td><td style="text-align:right">'+(p==null?'—':deltaCell(l,p))+'</td></tr>';});
  yc+='<tr style="border-top:2px solid var(--line-2)"><td><b>Total</b></td><td style="text-align:right"><b>'+(ytdP==null?'—':usd0(ytdP))+'</b></td><td style="text-align:right"><b>'+usd0(ytdA)+'</b></td><td style="text-align:right">'+(ytdP==null?'—':deltaCell(ytdA,ytdP))+'</td></tr></tbody></table></div>';
  TLB=Object.keys(byp).sort(function(a,b){return byp[b]-byp[a];}).slice(0,12);
  var lh='<div><table class=tbl><thead><tr><th>#</th><th>Person</th><th style="text-align:right">Trips</th><th style="text-align:right">Total</th></tr></thead><tbody>';
  TLB.forEach(function(n,i){var c=sc.filter(function(r){return r.year===LY&&r.crew_name===n;}).length;var k=(sc.find(function(r){return r.crew_name===n;})||{}).kind;lh+='<tr style="cursor:pointer" onclick="travelDrill('+i+')"><td>'+(i+1)+'</td><td>'+n+(k==='shoreside'?' <span class="cchip amber">shore</span>':'')+'</td><td style="text-align:right">'+c+'</td><td style="text-align:right"><b>'+usd0(byp[n])+'</b></td></tr>';});
  lh+='</tbody></table><div class=hint style="margin-top:6px">Click a name for their full history.</div></div>';
  h+=yc+lh+'</div>';
  var yrRows=sc.filter(function(r){return r.year===LY&&r.total>0;});
  var tt=yrRows.map(function(r){return r.total;}).sort(function(a,b){return a-b;});
  var med=tt.length?tt[Math.floor(tt.length/2)]:0;
  var outs=yrRows.filter(function(r){return r.total>med*2.5;}).sort(function(a,b){return b.total-a.total;}).slice(0,8);
  if(outs.length){
    h+='<div class=zlabel style="margin-top:18px">Anomalies — single movements &gt; 2.5× median ('+usd0(med)+')</div>';
    h+='<table class=tbl><thead><tr><th>Mo</th><th>Person</th><th>Leg</th><th style="text-align:right">Air</th><th style="text-align:right">Total</th></tr></thead><tbody>';
    outs.forEach(function(r){h+='<tr><td>'+TMN[r.month]+'</td><td>'+r.crew_name+'</td><td>'+(r.leg==='shoreside'?'—':r.leg)+'</td><td style="text-align:right">'+usd0(r.air)+'</td><td style="text-align:right"><b>'+usd0(r.total)+'</b></td></tr>';});
    h+='</tbody></table>';
  }
  var q=(TF.q||'').toLowerCase();
  var rows=TRVALL.filter(function(r){if(TF.kind&&(r.kind||'crew')!==TF.kind)return false;if(TF.year&&r.year!==+TF.year)return false;if(TF.month&&r.month!==+TF.month)return false;if(TF.cat&&!(r[TF.cat]>0))return false;if(q&&(r.crew_name||'').toLowerCase().indexOf(q)<0)return false;return true;});
  h+='<div class=zlabel style="margin-top:18px">Line items'+(rows.length?(' · '+rows.length):'')+'</div>';
  h+='<table class=tbl><thead><tr><th>Yr</th><th>Mo</th><th>Kind</th><th>Leg</th><th>Name</th><th style="text-align:right">Air</th><th style="text-align:right">Hotel</th><th style="text-align:right">Med</th><th style="text-align:right">Visa</th><th style="text-align:right">Food</th><th style="text-align:right">Trans</th><th style="text-align:right">Other</th><th style="text-align:right">Total</th></tr></thead><tbody>'
    +rows.map(function(r){return '<tr><td>'+r.year+'</td><td>'+TMN[r.month]+'</td><td>'+(r.kind==='shoreside'?'<span class="cchip amber">shore</span>':'crew')+'</td><td>'+(r.leg==='shoreside'?'—':r.leg)+'</td><td>'+r.crew_name+'</td><td style="text-align:right">'+usd(r.air)+'</td><td style="text-align:right">'+usd(r.hotel)+'</td><td style="text-align:right">'+usd(r.medical)+'</td><td style="text-align:right">'+usd(r.visa)+'</td><td style="text-align:right">'+usd(r.food)+'</td><td style="text-align:right">'+usd(r.transport)+'</td><td style="text-align:right">'+usd(r.other)+'</td><td style="text-align:right"><b>'+usd(r.total)+'</b></td></tr>';}).join('')||'<tr><td colspan=13 class=muted>No line items match these filters.</td></tr>';
  h+='</tbody></table>';
  document.getElementById('trbody').innerHTML=h;
}

function profileHTML(name){
  var rows=TRVALL.filter(function(r){return r.crew_name===name;});
  var ys=Array.from(new Set(rows.map(function(r){return r.year;}))).sort(function(a,b){return b-a;});
  var h='<div class=zlabel>'+name+'</div>';
  h+='<div class=tiles style="grid-template-columns:repeat('+Math.min(ys.length+1,5)+',1fr);margin-bottom:6px">';
  ys.forEach(function(y){var t=rows.filter(function(r){return r.year===y;}).reduce(function(a,b){return a+b.total;},0);var c=rows.filter(function(r){return r.year===y;}).length;h+=tile(usd0(t),y+' · '+c+' trips');});
  h+=tile(usd0(rows.reduce(function(a,b){return a+b.total;},0)),'All-time');
  h+='</div>';
  h+='<div class=zlabel style="margin-top:8px">Monthly spend by year</div><table class=tbl><thead><tr><th>Year</th>'+TMN.slice(1).map(function(m){return '<th style="text-align:right">'+m+'</th>';}).join('')+'<th style="text-align:right">Total</th></tr></thead><tbody>';
  ys.forEach(function(y){h+='<tr><td><b>'+y+'</b></td>';var tt=0;for(var m=1;m<=12;m++){var v=rows.filter(function(r){return r.year===y&&r.month===m;}).reduce(function(a,b){return a+b.total;},0);tt+=v;h+='<td style="text-align:right">'+(v?usd0(v):'·')+'</td>';}h+='<td style="text-align:right"><b>'+usd0(tt)+'</b></td></tr>';});
  h+='</tbody></table>';
  h+='<div class=zlabel style="margin-top:14px">By category (all-time)</div><table class=tbl><thead><tr>'+TCATS.map(function(c){return '<th style="text-align:right">'+TCATLAB[c]+'</th>';}).join('')+'<th style="text-align:right">Total</th></tr></thead><tbody><tr>';
  var gt=0;TCATS.forEach(function(c){var v=rows.reduce(function(a,b){return a+(b[c]||0);},0);gt+=v;h+='<td style="text-align:right">'+(v?usd0(v):'·')+'</td>';});h+='<td style="text-align:right"><b>'+usd0(gt)+'</b></td></tr></tbody></table>';
  h+='<div class=zlabel style="margin-top:14px">All movements</div><table class=tbl><thead><tr><th>Yr</th><th>Mo</th><th>Leg</th><th style="text-align:right">Air</th><th style="text-align:right">Hotel</th><th style="text-align:right">Other</th><th style="text-align:right">Total</th></tr></thead><tbody>';
  rows.sort(function(a,b){return b.year-a.year||b.month-a.month;}).forEach(function(r){var oc=r.medical+r.visa+r.food+r.transport+r.other;h+='<tr><td>'+r.year+'</td><td>'+TMN[r.month]+'</td><td>'+(r.leg==='shoreside'?'shore':r.leg)+'</td><td style="text-align:right">'+usd(r.air)+'</td><td style="text-align:right">'+usd(r.hotel)+'</td><td style="text-align:right">'+usd(oc)+'</td><td style="text-align:right"><b>'+usd(r.total)+'</b></td></tr>';});
  h+='</tbody></table>';
  return h;
}
function paintTravelCrew(){document.getElementById('trbody').innerHTML='<div style="cursor:pointer;color:var(--navy);font-weight:700;margin-bottom:6px" onclick="travelBack()">← Back</div>'+profileHTML(TSEL);}
function paintTravelSearch(){
  var q=(TF.q||'').trim().toLowerCase();var sc=tScope();
  var seen={},names=[],tot={};
  sc.forEach(function(r){if((r.crew_name||'').toLowerCase().indexOf(q)>=0){if(!seen[r.crew_name]){seen[r.crew_name]=1;names.push(r.crew_name);}tot[r.crew_name]=(tot[r.crew_name]||0)+r.total;}});
  names.sort(function(a,b){return (tot[b]||0)-(tot[a]||0);});
  var t=document.getElementById('trbody');if(!t)return;
  if(names.length===0){t.innerHTML='<div class=muted style="padding:20px 2px">No one matches "'+TF.q+'". Try another name, or change the Crew / shoreside filter.</div>';return;}
  if(names.length===1){t.innerHTML='<div class=hint style="margin-bottom:8px">Showing every expense for this person · clear the search box to return to the overview.</div>'+profileHTML(names[0]);return;}
  var h='<div class=zlabel>'+names.length+' people match "'+TF.q+'" — click one for their full history</div>';
  h+='<table class=tbl><thead><tr><th>#</th><th>Person</th><th style="text-align:right">Trips</th><th style="text-align:right">Total</th></tr></thead><tbody>';
  TLB=names.slice(0,60);
  TLB.forEach(function(n,i){var c=sc.filter(function(r){return r.crew_name===n;}).length;var k=(sc.find(function(r){return r.crew_name===n;})||{}).kind;h+='<tr style="cursor:pointer" onclick="travelDrill('+i+')"><td>'+(i+1)+'</td><td>'+n+(k==='shoreside'?' <span class="cchip amber">shore</span>':'')+'</td><td style="text-align:right">'+c+'</td><td style="text-align:right"><b>'+usd0(tot[n])+'</b></td></tr>';});
  h+='</tbody></table>';
  t.innerHTML=h;
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
function rankAbbr(r){var s=String(r||'').toLowerCase();if(!s)return'';if(s.indexOf('senior')>=0||s==='sr ps')return 'Sr PS';if(s.indexOf('junior')>=0||s.indexOf('jr')>=0)return 'Jr PS';if(s.indexOf('printer')>=0||s.indexOf('special')>=0||s==='ps')return 'PS';return String(r);}
function rtag(label,on,crew,field){var c=on?'rtag on':'rtag';if(field)return '<span class="'+c+' rtoggle" data-crew="'+crew+'" data-f="'+field+'" data-v="'+(on?1:0)+'" title="click to toggle">'+label+'</span>';return '<span class="'+c+'">'+label+'</span>';}
function rotCard(x){
  var tba='<span style="color:var(--amber);font-weight:700" title="port not set yet">TBA</span>';var _chip='';if(x.current&&x.signOff){var _dd=Math.round((new Date(x.signOff+'T00:00:00Z').getTime()-Date.now())/86400000);var _cc=_dd<=14?' crit':_dd<=30?' due':'';_chip='<span class="offchip'+_cc+'">OFF in '+_dd+'d</span>';}
  var _cf2=function(c){return c==='derived'?'#1f7a3d':c==='provisional'?'#a8791a':c==='seed'?'#b0342f':c==='override'?'#1f5fa8':'#888780';};var _oc2=function(ct,cf){return '<b style="color:'+_cf2(cf)+'">'+ct+'</b>';};var on=x.signOn?((x.on_city?_oc2(x.on_city,x.on_conf):(x.embark?x.embark:tba))+'<span style="white-space:nowrap"> · ON '+x.signOn+'</span>'):'';
  var off=x.signOff?((x.off_city?_oc2(x.off_city,x.off_conf):(x.disembark?x.disembark:tba))+'<span style="white-space:nowrap"> · OFF '+x.signOff+'</span>'):'';
  var dur=monthsDays(x.signOn,x.signOff)||durLabel(x.signOn,x.signOff);
  var tg='';
  if(x.eccr)tg+='<span class="rtag on">ECCR</span>';
  if(x.air)tg+='<span class="rtag on">AIR</span>';
  if(x.hotel)tg+='<span class="rtag on">HOTEL</span>';
  if(x.onConfirmed)tg+='<span class="rtag on">ON ✓</span>';
  if(x.offConfirmed)tg+='<span class="rtag on">OFF ✓</span>';
  if(x.nextShip)tg+='<span class="rtag">NEXT: '+x.nextShip+'</span>';
  return '<div class="rcard'+(x.current?' cur':'')+'" draggable="true" data-crew="'+x.agency_id+'" data-seq="'+x.seq+'" title="click to edit · drag to reassign" onmousedown="dragMoved=false" ondragstart="dragStart(this,\\''+x.agency_id+'\\')" ondragend="dragEnd(this)" onclick="cardClick(\\''+x.agency_id+'\\','+x.seq+')">'
    +_chip+'<div class=rnm>'+x.name+(x.rank?(' <span style="color:var(--mut);font-weight:600;font-size:11px">'+rankAbbr(x.rank)+'</span>'):'')+(x.hasNote?' <span class=notedot title="has comment">●</span>':'')+'</div>'
    +'<div class=rleg><i style="background:'+dot(x.status)+'"></i>'+x.status+(dur?(' · '+dur):'')+'</div>'
    +(on?'<div class=rleg2><i class=ondot></i>'+on+'</div>':'')
    +(off?'<div class=rleg2><i class=offdot></i>'+off+'</div>':'')
    +(tg?'<div class=rtags>'+tg+'</div>':'')
    +'</div>';
}
function openRelief(){location.href='/relief';}function reliefSlot(rb){if(!rb||!rb.printer)return '';var d=rb.days_to_off;var cls=(rb.urgency==='critical')?' crit':(rb.urgency==='due')?' due':'';var cf=function(c){return c==='derived'?'#1f7a3d':c==='provisional'?'#a8791a':c==='seed'?'#b0342f':c==='override'?'#1f5fa8':'#888780';};var dn='<i style="width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--navy)"></i> ';if(rb.reliever){var r=rb.reliever;return '<div class="rcard rlvr" onclick="openRelief()" title="reliever"><div class=rnm>'+r.crew_name+' <span style="color:var(--navy);font-weight:700;font-size:10px;letter-spacing:.04em">RELIEVER</span></div><div class=rleg>'+dn+'Signs on'+(r.auto_on?' follows printer':'')+'</div><div class=rleg2>'+dn+'<b style="color:'+cf(r.on_conf)+'">'+(r.on_city||'TBA')+'</b> ON '+(r.on_date||'TBA')+'</div></div>';}return '<div class="rcard ghostslot'+cls+'" onclick="openRelief()" title="add reliever"><div style="font-weight:700">+ Add reliever</div><div style="font-size:11px;opacity:.85;margin-top:2px">empty slot'+(d!=null?' off in '+d+'d':'')+'</div></div>';}function reliefBanner(rb){if(!rb||!rb.printer)return '';var h=rb.handover||{},d=rb.days_to_off,t,bg,fg;if(rb.reliever&&h.kind==='clean'){t='Clean handover'+(rb.reliever.on_city?' - '+rb.reliever.on_city:'')+(rb.reliever.on_date?' - '+rb.reliever.on_date:'');bg='#e3f5e8';fg='#1f7a3d';}else if(rb.reliever&&h.kind==='gap'){t=(h.days!=null?h.days+'-day gap':'gap')+' between OFF and reliever ON';bg='#fbeed6';fg='#9a6410';}else if(rb.reliever&&h.kind==='port_mismatch'){t='Same day, port differs';bg='#fbeed6';fg='#9a6410';}else if(d!=null&&rb.urgency==='critical'){t='Reliever needed - printer signs off in '+d+' days';bg='#fbe7e6';fg='#b0342f';}else if(d!=null&&rb.urgency==='due'){t='Reliever due - printer signs off in '+d+' days';bg='#fbeed6';fg='#9a6410';}else{t='Slot open'+(d!=null?' - printer signs off in '+d+' days':'');bg='var(--surface-1)';fg='var(--mut)';}return '<div style="margin:0 14px 12px;padding:7px 12px;border-radius:8px;font-size:12.5px;background:'+bg+';color:'+fg+'">'+t+'</div>';}function reliefSlot(rb){if(!rb||!rb.printer)return '';var d=rb.days_to_off;var cls=(rb.urgency==='critical')?' crit':(rb.urgency==='due')?' due':'';var chip=(d!=null)?('OFF IN '+d+'D'):'NO OFF DATE';var cf=function(c){return c==='derived'?'#1f7a3d':c==='provisional'?'#a8791a':c==='seed'?'#b0342f':c==='override'?'#1f5fa8':'#888780';};if(rb.reliever){var r=rb.reliever;return '<div class="rcard rlvr" onclick="openRelief()" title="reliever"><div class=rnm>'+r.crew_name+' <span class=rlab>RELIEVER</span></div><div class=rleg><i class=reldot></i>Signs on'+(r.auto_on?' (follows printer)':'')+'</div><div class=rleg2><i class=ondot></i><b style="color:'+cf(r.on_conf)+'">'+(r.on_city||'TBA')+'</b> ON '+(r.on_date||'TBA')+'</div></div>';}return '<div class="rcard ghostslot'+cls+'" onclick="openRelief()" title="Add a reliever for this printer"><div class=gp>+</div><div class=gt>Add reliever</div><div class=gc>'+chip+'</div></div>';}function reliefBanner(rb){if(!rb||!rb.printer)return '';var h=rb.handover||{},d=rb.days_to_off,t,dot,bg,fg;if(rb.reliever&&h.kind==='clean'){t='Clean handover'+(rb.reliever.on_city?' · '+rb.reliever.on_city:'')+(rb.reliever.on_date?' · '+rb.reliever.on_date:'');fg='#1f7a3d';dot='#1f7a3d';bg='#e3f5e8';}else if(rb.reliever&&h.kind==='gap'){t=(h.days!=null?h.days+'-day gap':'gap')+' before reliever signs on';fg='#9a6410';dot='#c98a1e';bg='#fbeed6';}else if(rb.reliever&&h.kind==='port_mismatch'){t='Handover port differs';fg='#9a6410';dot='#c98a1e';bg='#fbeed6';}else if(d!=null&&rb.urgency==='critical'){t='Reliever needed · signs off in '+d+' days';fg='#b0342f';dot='#b0342f';bg='#fbe7e6';}else if(d!=null&&rb.urgency==='due'){t='Reliever due · signs off in '+d+' days';fg='#9a6410';dot='#c98a1e';bg='#fbeed6';}else{t='Slot open · signs off in '+(d!=null?d+' days':'TBA');fg='#5a6472';dot='#9aa3b0';bg='#eef2f7';}return '<div class=rbanner style="background:'+bg+';color:'+fg+'"><span class=bdot style="background:'+dot+'"></span>'+t+'</div>';}function openRelief(el){var vk=(el&&el.getAttribute)?el.getAttribute('data-vk'):el;if(!vk)return;var o=document.createElement('div');o.id='reliefovl';o.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(10,14,24,.44)';o.innerHTML='<iframe src="/relief?open='+encodeURIComponent(vk)+'" style="width:100%;height:100%;border:0;background:transparent;opacity:0;transition:opacity .12s" allowtransparency="true"></iframe>';document.body.appendChild(o);}function reliefSlot(rb){if(!rb||!rb.printer)return '';var d=rb.days_to_off;var cls=(rb.urgency==='critical')?' crit':(rb.urgency==='due')?' due':'';var chip=(d!=null)?('OFF IN '+d+'D'):'NO OFF DATE';var cf=function(c){return c==='derived'?'#1f7a3d':c==='provisional'?'#a8791a':c==='seed'?'#b0342f':c==='override'?'#1f5fa8':'#888780';};if(rb.reliever){var r=rb.reliever;return '<div class="rcard rlvr" data-vk="'+rb.vessel_key+'" onclick="openRelief(this)" title="reliever"><div class=rnm>'+r.crew_name+' <span class=rlab>RELIEVER</span></div><div class=rleg><i class=reldot></i>Signs on'+(r.auto_on?' (follows printer)':'')+'</div><div class=rleg2><i class=ondot></i><b style="color:'+cf(r.on_conf)+'">'+(r.on_city||'TBA')+'</b> ON '+(r.on_date||'TBA')+'</div></div>';}return '<div class="rcard ghostslot'+cls+'" data-vk="'+rb.vessel_key+'" onclick="openRelief(this)" title="Add a reliever for this printer"><div class=gp>+</div><div class=gt>Add reliever</div><div class=gc>'+chip+'</div></div>';}window.addEventListener('message',function(e){if(e&&e.data&&e.data.t==='reliefReady'){var rf=document.getElementById('reliefovl');if(rf){var _if=rf.querySelector('iframe');if(_if)_if.style.opacity='1';}return;}if(e&&e.data&&e.data.t==='reliefClose'){var o=document.getElementById('reliefovl');if(o&&o.parentNode)o.parentNode.removeChild(o);if(e.data.changed){try{renderRotation();}catch(_){}}}});function rcClick(el){cardClick(el.getAttribute('data-crew'),parseInt(el.getAttribute('data-seq'),10));}function rcDrag(e,el){dragStart(el,el.getAttribute('data-crew'));}function rotCard(x){var tba='<span style="color:var(--amber);font-weight:700" title="port not set yet">TBA</span>';var cf=function(c){return c==='derived'?'#1f7a3d':c==='provisional'?'#a8791a':c==='seed'?'#b0342f':c==='override'?'#1f5fa8':'#888780';};var oc=function(ct,cfl){return '<b style="color:'+cf(cfl)+'">'+ct+'</b>';};var nm=(x.name||'').split(' ').filter(Boolean);var ini=((nm[0]||'').charAt(0)+(nm[1]||'').charAt(0)).toUpperCase()||'?';var dur=monthsDays(x.signOn,x.signOff)||durLabel(x.signOn,x.signOff);var chip='';if(x.current&&x.signOff){var dd=Math.round((new Date(x.signOff+'T00:00:00Z').getTime()-Date.now())/86400000);var cc=dd<=14?' crit':dd<=30?' due':'';chip='<span class="offchip'+cc+'">OFF in '+dd+'d</span>';}var rw=function(lbl,city,date){return '<div class=rrow><span class=rlbl>'+lbl+'</span><span class=rcity>'+city+'</span><span class=rdate>'+date+'</span></div>';};var rows='';if(x.signOn)rows+=rw('on',x.on_city?oc(x.on_city,x.on_conf):(x.embark?x.embark:tba),x.signOn);if(x.signOff)rows+=rw('off',x.off_city?oc(x.off_city,x.off_conf):(x.disembark?x.disembark:tba),x.signOff);var tg='';if(x.eccr)tg+='<span class="rtag on">ECCR</span>';if(x.air)tg+='<span class="rtag on">AIR</span>';if(x.hotel)tg+='<span class="rtag on">HOTEL</span>';if(x.onConfirmed)tg+='<span class="rtag on">ON DATE</span>';if(x.offConfirmed)tg+='<span class="rtag on">OFF DATE</span>';if(x.nextShip)tg+='<span class="rtag">NEXT: '+x.nextShip+'</span>';return '<div class="rcard'+(x.current?' cur':'')+'" draggable="true" data-crew="'+x.agency_id+'" data-seq="'+x.seq+'" title="click to edit" onmousedown="dragMoved=false" ondragstart="rcDrag(event,this)" ondragend="dragEnd(this)" onclick="rcClick(this)">'+chip+'<div class=rhead><div class="ravatar'+(x.current?' cur':'')+'">'+ini+'</div><div class=rhcol><div class=rnm>'+x.name+(x.rank?(' <span class=rrank>'+rankAbbr(x.rank)+'</span>'):'')+(x.hasNote?' <span class=notedot title="has comment"></span>':'')+'</div><div class=rleg><i style="background:'+dot(x.status)+'"></i>'+x.status+(dur?(' · '+dur):'')+'</div></div></div>'+(rows?'<div class=rrot>'+rows+'</div>':'')+(tg?'<div class=rtags>'+tg+'</div>':'')+'</div>';}function rotShip(sec){
  var col=BRANDCOL[sec.brand]||'#1E6FD0',closed=!!ROT_CLOSED[sec.ship];
  var hist=sec.history||[];
  var body=sec.crew.length?sec.crew.map(rotCard).join(''):'<div class=hint style="opacity:.55;padding:6px">drag crew here</div>';
  var histBlock=hist.length?('<div class="histsec'+(closed?' closed':'')+'"><div class=histhd>Also served this ship · '+hist.length+'</div><div class=histgrid>'+hist.map(histCard).join('')+'</div></div>'):'';
  var meta=sec.brand+' · '+sec.onboard+' onboard · '+sec.crew.length+' current'+(hist.length?(' · '+hist.length+' history'):'');var _rb=window.RELIEF?window.RELIEF[window.reliefKey(sec.brand,sec.ship)]:null;var _rbc=(_rb&&_rb.urgency==='critical')?'var(--danger)':(_rb&&_rb.urgency==='due')?'var(--amber)':'var(--line-2)';var _cf=function(c){return c==='derived'?'#1f7a3d':c==='provisional'?'#a8791a':c==='seed'?'#b0342f':c==='override'?'#1f5fa8':'#888780';};var _oc=function(ct,cf){return '<b style="color:'+_cf(cf)+'">'+(ct||'TBA')+'</b>';};var _hv=_rb&&_rb.handover;var _hvt=(_hv&&_hv.kind==='clean')?'<span style="color:#1f7a3d">clean</span>':(_hv&&_hv.kind==='port_mismatch')?'<span style="color:#b0342f">port mismatch</span>':(_hv&&_hv.kind==='gap')?('<span style="color:#a8791a">'+(_hv.days!=null?_hv.days+'-day gap':'gap')+'</span>'):'';var _rban=(_rb&&_rb.printer)?('<div style="font-size:12px;padding:5px 10px;background:var(--surface-1);border-left:3px solid '+_rbc+';border-radius:0 6px 6px 0;margin:0 0 4px"><b>Relief</b> · off '+_oc(_rb.printer.off_city,_rb.printer.off_conf)+' · '+(_rb.printer.off_date||'TBA')+' · '+(_rb.reliever?('reliever '+_rb.reliever.crew_name+' → on '+_oc(_rb.reliever.on_city,_rb.reliever.on_conf)+' '+(_rb.reliever.on_date||'TBA')+(_hvt?(' · '+_hvt):'')):'reliever unassigned')+((_rb.urgency&&_rb.urgency!=='open')?(' · '+_rb.urgency):'')+'</div>'):'';var _rslot=reliefSlot(_rb);var _rbanner=reliefBanner(_rb);
  return '<div class=shipsec><div class=shiphdr data-toggle="'+sec.ship+'" style="border-left-color:'+col+'"><span class=nm>'+sec.ship+'</span><span class=meta>'+meta+' <span class="arw'+(closed?' closed':'')+'">▾</span></span></div>'
    +'<div class="shipbody shipdrop'+(closed?' closed':'')+'" data-ship="'+sec.ship+'">'+body+_rslot+'</div>'+_rbanner+histBlock+'</div>';
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
  if(h.ours&&h.sc)return '<div class="hcard ours" data-crew="'+h.sc+'" onclick="openCrew(\\''+h.sc+'\\')"><div class=hnm><span>'+h.name+'</span></div><div class=hspan>'+span+'</div>'+durHtml+'</div>';
  return '<div class="hcard former"><div class=hnm><span>'+h.name+'</span><span class="htag former">former</span></div><div class=hspan>'+span+'</div>'+durHtml+'</div>';
}
function rotExpand(open){if(!ROT)return;(ROT.sections||[]).forEach(function(s){ROT_CLOSED[s.ship]=!open;});drawRotation();}
function cardClick(id,seq){if(dragMoved)return;editContractModal(id,seq);}
function portOptions(ports,date,current){var ta=(ports||[]).filter(function(p){return Number(p.is_turnaround)===1&&Number(p.is_sea)!==1&&p.port_name;}).sort(function(a,b){return a.berth_date<b.berth_date?-1:a.berth_date>b.berth_date?1:0;});var start=0,f=false;if(date){for(var i=0;i<ta.length;i++){if(ta[i].berth_date>=date){start=i;f=true;break;}}}if(!f)start=Math.max(0,ta.length-6);var win=ta.slice(start,start+6);var opts='',matched=false;for(var j=0;j<win.length;j++){var p=win[j],v=String(p.port_name).replace(/"/g,'');var isSel=date&&p.berth_date===date;if(isSel)matched=true;opts+='<option value="'+v+'" data-d="'+p.berth_date+'"'+(isSel?' selected':'')+'>'+p.port_name+' · '+p.berth_date+'</option>';}if(current&&!matched){opts='<option value="'+String(current).replace(/"/g,'')+'" selected>'+current+'</option>'+opts;}return opts||'<option value="">— no ports —</option>';}function pickPort(sel){var m={eEmb:'eOn',eDis:'eOff'};var o=sel.options[sel.selectedIndex];var dd=o?o.getAttribute('data-d'):null;var el=document.getElementById(m[sel.id]);if(dd&&el)el.value=dd;}async function editContractModal(id,seq){
  var e=null;(ROT.sections||[]).forEach(function(s){s.crew.forEach(function(x){if(x.agency_id===id&&x.seq===seq)e=x;});});
  if(!e)return;
  var d={};try{d=await (await fetch('/api/rotation/crew?id='+encodeURIComponent(id))).json();}catch(_){}var P=[];try{P=(((await (await fetch('/api/relief/ports?ship='+encodeURIComponent(e.ship||''))).json())||{}).ports)||[];}catch(_){}
  var note=String((d.ready&&d.ready.note)||'').replace(/</g,'&lt;');
  var ships={};(ROT.sections||[]).forEach(function(s){ships[s.ship]=1;});if(e.ship)ships[e.ship]=1;
  var shipOpts=Object.keys(ships).sort().map(function(s){return '<option'+(s===e.ship?' selected':'')+'>'+s+'</option>';}).join('');
  // The wrapper handles the tap (tgFlip) and the checkbox is pointer-events:none, so a tap can only
  // produce ONE flip — fixes the iPad double-toggle where the box landed back where it started.
  // UI pass 2026-07-23 (visual only, same ids + handlers): confirm toggles become bordered chips that
  // tint green when on; consistent field labels + heights; comment gets real room; history scrolls;
  // footer separated with the danger action de-emphasized as a quiet red text button.
  var ck=function(i,lab,on){return '<span class=ckchip onclick="tgFlip(\\''+i+'\\')"><input type=checkbox id="'+i+'"'+(on?' checked':'')+' style="pointer-events:none"><span>'+lab+'</span></span>';};
  var legs=(d.legs||[]).map(function(l){var off=l.act_off||l.proj_off||'—';return '<tr><td>'+l.seq+'</td><td>'+(l.ship||'—')+'</td><td>'+(l.sign_on||'—')+'</td><td>'+off+'</td></tr>';}).join('');
  var fld=function(lab,inp){return '<div><label>'+lab+'</label>'+inp+'</div>';};
  var h='<div class=modcard><style>'
   +'#rotmodal .modcard{max-width:720px;padding:24px 26px 22px}'
   +'#rotmodal .ecgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;margin-top:16px}'
   +'#rotmodal .ecgrid label{display:block;font:600 11.5px "DM Sans";letter-spacing:.03em;color:var(--mut);margin:0 0 6px}'
   +'#rotmodal .ecgrid select,#rotmodal .ecgrid input{width:100%;height:42px;padding:0 12px;font-size:13.5px;color:var(--navy);box-sizing:border-box}'
   +'#rotmodal .ckrow{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 2px}'
   +'#rotmodal .ckchip{display:inline-flex;align-items:center;gap:9px;border:1px solid var(--line-2);border-radius:999px;padding:7px 14px 7px 8px;cursor:pointer;font:700 11.5px "DM Sans";letter-spacing:.05em;color:var(--mut);background:#fff;transition:border-color .15s,background .15s,color .15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}'
   +'#rotmodal .ckchip:hover{border-color:var(--navy);color:var(--navy)}'
   +'#rotmodal .ckchip:has(input:checked){border-color:var(--green);background:#F2FAEE;color:var(--green-d)}'
   +'#rotmodal .ckchip input[type=checkbox]{width:32px;height:19px}'
   +'#rotmodal .ckchip input[type=checkbox]::after{width:15px;height:15px}'
   +'#rotmodal .ckchip input[type=checkbox]:checked::after{transform:translateX(13px)}'
   +'#rotmodal textarea{width:100%;min-height:74px;padding:10px 12px;font:400 13.5px "DM Sans";color:var(--navy);box-sizing:border-box;resize:vertical;line-height:1.5}'
   +'#rotmodal .echist{max-height:190px;overflow:auto;border-radius:10px}'
   +'#rotmodal .ecwf{display:flex;gap:8px;flex-wrap:wrap}'
   +'#rotmodal .ecwf .btn{font-size:12.5px;height:36px}'
   +'#rotmodal .ecfoot{margin-top:22px;padding-top:16px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px}'
   +'#rotmodal .echide{border:0;background:transparent;color:var(--red);font:700 13px "DM Sans";padding:9px 12px;margin-left:-12px;border-radius:9px;cursor:pointer;transition:background .15s}'
   +'#rotmodal .echide:hover{background:#FBE9E7}'
   +'#rotmodal .ecpill{display:inline-block;background:var(--bg);border-radius:999px;padding:2px 10px;font:600 11px "DM Sans";color:var(--mut);margin-left:7px;vertical-align:1px}'
   +'#rotmodal .zcount{letter-spacing:0;text-transform:none;font:600 11px "DM Sans";color:var(--mut)}'
   +'</style>'
   +'<div class=modhd><div><div class=cname>Edit contract — '+e.name+'</div><div class=csub>'+id+'<span class=ecpill>contract #'+seq+'</span></div></div><button class="btn ghost" onclick="closeRotModal()">Close ✕</button></div>'
   +'<div class=ecgrid>'
   +fld('Embark city · from itinerary','<select id=eEmb onchange="pickPort(this)">'+portOptions(P,e.signOn,e.on_city||e.embark)+'</select>')
   +fld('Disembark city · from itinerary','<select id=eDis onchange="pickPort(this)">'+portOptions(P,e.signOff,e.off_city||e.disembark)+'</select>')
   +fld('Sign-on','<input id=eOn type=date value="'+(e.signOn||'')+'">')
   +fld('Sign-off','<input id=eOff type=date value="'+(e.signOff||'')+'">')
   +'<div style="grid-column:1/3">'+fld('Ship','<select id=eShip>'+shipOpts+'</select>')+'</div>'
   +'</div>'
   +'<div class=zlabel>Confirmed <span class=zcount>shows as green tags on the card</span></div>'
   +'<div class=ckrow>'+ck('cEccr','ECCR',e.eccr)+ck('cAir','AIR',e.air)+ck('cHotel','HOTEL',e.hotel)+ck('cOn','ON DATE',e.onConfirmed)+ck('cOff','OFF DATE',e.offConfirmed)+'</div>'
   +'<div class=zlabel>Comment</div><textarea id=cmt placeholder="Note for this crew…">'+note+'</textarea>'
   +(legs?'<div class=zlabel>Contract history <span class=zcount>'+(d.legs||[]).length+' contract'+((d.legs||[]).length===1?'':'s')+'</span></div><div class=echist><table class=tbl><thead><tr><th>#</th><th>Ship</th><th>On</th><th>Off</th></tr></thead><tbody>'+legs+'</tbody></table></div>':'')
   +'<div class=zlabel>Sign-off workflow</div><div class=ecwf><button class="btn ghost" onclick="sendSignoffInstructions(\\''+id+'\\','+seq+')">Send instructions</button><button class="btn ghost" onclick="sendSignoffLink(\\''+id+'\\','+seq+')">Send sign-off link</button><button class="btn ghost" onclick="sendReviewInvite(\\''+id+'\\','+seq+')">Send review invite</button></div>'
   +'<div class=ecfoot><button class=echide onclick="hideCrewFromBoard(\\''+id+'\\')" title="Remove this crew card from all rosters (reversible)">Hide crew card</button><span style="display:flex;align-items:center;gap:8px"><span id=cmtmsg class=csub></span><button class="btn ghost" onclick="closeRotModal()">Cancel</button><button class="btn green" onclick="saveContract(\\''+id+'\\','+seq+')">Save</button></span></div></div>';
  var w=document.createElement('div');w.id='rotmodal';w.className='modwrap';w.innerHTML=h;
  w.onclick=function(ev){if(ev.target===w)closeRotModal();};
  window.rotEscHandler=function(ev){if(ev.key==='Escape')closeRotModal();};document.addEventListener('keydown',window.rotEscHandler);
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
async function sendSignoffInstructions(id,seq){try{var r=await (await fetch('/api/instructions/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sc:id,seq:seq,send:true})})).json();alert(r.error?('Error: '+r.error):(r.emailed?'Instructions emailed to the crew member.':('Not emailed (no crew email on file). Copy this link to send: '+r.link)));}catch(e){alert('Could not send instructions.');}}
async function sendSignoffLink(id,seq){try{var r=await (await fetch('/api/ack/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sc:id,seq:seq,send:true})})).json();alert(r.error?('Error: '+r.error):(r.emailed?'Sign-off request emailed to the crew member.':('Not emailed (no crew email on file). Copy this link to send: '+r.link)));}catch(e){alert('Could not send.');}}
async function sendReviewInvite(id,seq){if(!confirm('Send a shipboard-management review invite for this contract now?'))return;try{var r=await (await fetch('/api/sbm/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sc:id,seq:seq})})).json();if(r&&r.error){var m={sbm_disabled:'GSM review is OFF. Turn the GSM review switch ON first, then send the invite.',no_recipient_configured:'No shipboard-manager email is configured for this ship yet.',signoff_passed:'That sign-off date has already passed - the review link would be expired.',already_submitted:'A review for this contract was already submitted.',no_signoff_date:'No sign-off date on file for this contract.',send_failed:'The email could not be sent. Please try again.'}[r.error]||('Could not send: '+r.error);alert(m);return;}alert('Review invite emailed to '+(r.recipient||'the shipboard manager')+'.');}catch(e){alert('Could not send the review invite.');}}
function closeRotModal(){var m=document.getElementById('rotmodal');if(m)m.remove();if(window.rotEscHandler){document.removeEventListener('keydown',window.rotEscHandler);window.rotEscHandler=null;}}
function rmTag(label,field,on,id){return '<span class="rtag rtoggle'+(on?' on':'')+'" data-crew="'+id+'" data-f="'+field+'" data-v="'+(on?1:0)+'" onclick="rmToggle(this)">'+label+'</span>';}
function rmToggle(el){var nv=el.getAttribute('data-v')==='1'?0:1;el.setAttribute('data-v',nv);el.classList.toggle('on',!!nv);fetch('/api/rotation/ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:el.getAttribute('data-crew'),field:el.getAttribute('data-f'),value:nv})});}
async function saveNote(id){
  var t=document.getElementById('cmt').value;document.getElementById('cmtmsg').textContent='Saving…';
  try{var r=await (await fetch('/api/rotation/note',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,note:t})})).json();document.getElementById('cmtmsg').textContent=r.ok?'Saved ✓':'Failed';}catch(e){document.getElementById('cmtmsg').textContent='Failed';}
}
async function loadAutoToggle(){try{var r=await (await fetch('/api/autosend')).json();var c=document.getElementById('autoToggleCb');if(c)c.checked=!!r.enabled;}catch(e){}}
async function autoToggleClick(){var c=document.getElementById('autoToggleCb');var on=!!(c&&c.checked);if(!on&&!confirm('Turn Crew auto-timing ON? This arms automated T-14/T-7 emails to crew.'))return;try{var r=await (await fetch('/api/autosend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!on})})).json();if(r&&r.error){alert('Could not change the setting: '+r.error);loadAutoToggle();return;}if(c)c.checked=!!r.enabled;alert('Auto-timing is now '+(r.enabled?'ON':'OFF')+(r.seeded>0?(' — '+r.seeded+' in-window items were seeded and will NOT be auto-emailed.'):''));}catch(e){alert('Could not change the setting.');}}
function ensureSbmToggle(){var a=document.getElementById('autoToggle');if(!a)return null;var b=document.getElementById('sbmToggle');if(!b){b=document.createElement('span');b.id='sbmToggle';b.style.cssText='display:inline-flex;align-items:center;gap:7px;margin-left:12px;font-size:13px;font-weight:600;cursor:pointer';b.setAttribute('onclick','sbmToggleClick()');b.innerHTML='GSM review <input type=checkbox id=sbmToggleCb style="pointer-events:none">';a.insertAdjacentElement('afterend',b);}return b;}
async function loadSbmToggle(){try{var r=await (await fetch('/api/sbmtoggle')).json();ensureSbmToggle();var c=document.getElementById('sbmToggleCb');if(c)c.checked=!!r.enabled;}catch(e){}}
async function sbmToggleClick(){var c=document.getElementById('sbmToggleCb');var on=!!(c&&c.checked);if(!on&&!confirm('Turn GSM review automation ON? This arms automated T-7 review invitations (and T-4 reminders) to shipboard managers.'))return;try{var r=await (await fetch('/api/sbmtoggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!on})})).json();if(r&&r.error){if(r.error==='money_users_only')alert('Only Miguel or Rita can change this.');else alert('Could not change the setting: '+r.error);loadSbmToggle();return;}if(c)c.checked=!!r.enabled;alert('Shipboard reviews are now '+(r.enabled?'ON':'OFF'));}catch(e){alert('Could not change the setting.');}}
async function renderRotation(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  ROT=await (await fetch('/api/rotation')).json();window.RELIEF={};window.reliefKey=function(b,s){return (b==='Royal'?'Royal Caribbean':b)+'|'+s;};try{var _rel=await (await fetch('/api/relief/board')).json();(_rel.board||[]).forEach(function(e){window.RELIEF[e.vessel_key]=e;});}catch(_){}
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
    +'<button class="btn ghost" onclick="hiddenCardsModal()" title="Hidden (voided) crew cards — restore here">Hidden cards</button>'
    +'<button class="btn" style="margin-left:auto" onclick="exportDaysExcel()" title="Days worked this month, per crew, for customer billing">Bill this month (Excel)</button><span id="autoToggle" onclick="autoToggleClick()" style="display:inline-flex;align-items:center;gap:7px;margin-left:8px;font-size:13px;font-weight:600;cursor:pointer">Crew <input type=checkbox id="autoToggleCb" style="pointer-events:none"></span></div>'
    +'<div id=rotchips style="margin-bottom:10px"></div><div id=rotbody></div>';
  drawRotation(); loadAutoToggle();
  loadSbmToggle();
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
  // Retired crew auto-clean (Miguel 2026-07-23): retired cards leave the ACTIVE roster/pool display —
  // retire once on the Crew tab, the board reflects it. DISPLAY-ONLY: ROT (rotationSections) is
  // untouched, so the monthly billing export still counts every day a crew actually worked. Their
  // past contracts are re-added to the ship's history list below so nothing disappears from view.
  var sfilt=function(arr){return (arr||[]).filter(function(x){return x.status!=='Retired'&&(!ROT_F||x.status===ROT_F)&&legInFilter(x);});};
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
  secs=secs.map(function(s){
    // Move retired crew's leg into the ship's history (same shape the server uses for past crew),
    // so retiring hides the card but keeps the service record visible under the ship.
    var hist=(s.history||[]).slice();
    (s.crew||[]).forEach(function(x){if(x.status==='Retired'&&x.signOn&&x.signOff&&x.signOn!==x.signOff)hist.push({name:x.name,sc:x.agency_id,ours:true,on:x.signOn,off:x.signOff});});
    hist.sort(function(a,b){return (a.off||'')<(b.off||'')?1:-1;});
    return {ship:s.ship,brand:s.brand,onboard:s.onboard,crew:sfilt(s.crew),history:hist};
  });
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
// Hide (void) a crew card from the Keyman board — lives INSIDE the card's Edit modal (bottom-left),
// mirroring the Crew tab's edit screen. Same money-gated, reversible /api/crew/hide underneath.
// Restore lives behind the toolbar's "Hidden cards" button (shared hiddenCardsModal).
async function hideCrewFromBoard(id){
  if(!confirm('Hide this crew card?\\n\\nIt will be removed from all rosters (Keyman, Crew, Dashboard, Billing). You can bring it back any time from "Hidden cards". Nothing is deleted.'))return;
  var em=document.getElementById('cmtmsg');if(em)em.textContent='Hiding…';
  try{
    var r=await (await fetch('/api/crew/hide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,hidden:1})})).json();
    if(r.ok){closeRotModal();renderRotation();return;}
    if(em)em.textContent=r.error==='money_users_only'?'Only Miguel or Rita can hide cards.':(r.error==='has_bonus_history'?'This crew has committed bonus history — it cannot be hidden.':'Could not hide the card.');
  }catch(e){if(em)em.textContent='Could not hide the card.';}
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
var RPT_P='All';
// REAL DATA: 37 GSM reviews imported from the legacy MS Forms survey
// "Crew Feedback Survey - Royal Caribbean Printer Specialist" (Jun 2025 - Jul 2026).
// One explicit test response excluded. Names normalized ("Last, First" -> "First Last",
// trailing crew-id suffixes stripped); spelling variants intentionally NOT merged.
// Invite/funnel/response-rate metrics have no source until the CIMS-native pipeline
// (sbm_enabled) goes live - the report shows only what this data can prove.
var RPT_ROWS=[{d:'2025-06-02',s:'Navigator',n:'Maria Katrina Rica Murillo',r:4},{d:'2025-06-05',s:'Radiance',n:'John Sarmiento',r:4},{d:'2025-06-18',s:'Liberty',n:'Mario Lazo',r:4},{d:'2025-06-30',s:'Liberty',n:'Mario Lazo',r:5},{d:'2025-08-14',s:'Spectrum',n:'Ohji Miranda',r:4},{d:'2025-09-02',s:'Grandeur',n:'Norman Osorio',r:4},{d:'2025-09-16',s:'Anthem',n:'Anthony Rey Batadlan',r:4},{d:'2025-09-17',s:'Allure',n:'Raymond',r:3},{d:'2025-10-18',s:'Harmony',n:'King Manzano',r:4},{d:'2025-10-21',s:'Enchantment',n:'Jim Olid',r:4},{d:'2025-10-24',s:'Rhapsody',n:'Jonathan Alonzo',r:4},{d:'2025-10-31',s:'Enchantment',n:'Jim Olid',r:4},{d:'2025-11-14',s:'Odyssey',n:'Ryan Marto',r:4},{d:'2025-11-30',s:'Mariner',n:'Edward Guazon',r:4},{d:'2025-12-01',s:'Spectrum',n:'Mark Joseph Dela Rosa',r:4},{d:'2025-12-02',s:'Icon',n:'Rommel Mandrinico',r:4},{d:'2025-12-04',s:'Radiance',n:'Azariah Asim',r:4},{d:'2025-12-04',s:'Serenade',n:'Estandian Sharene',r:5},{d:'2026-01-16',s:'Quantum',n:'Jeremy Padilla',r:3},{d:'2026-01-31',s:'Liberty',n:'Christjhelen Racho',r:5},{d:'2026-02-05',s:'Grandeur',n:'Jerome Valdesco',r:3},{d:'2026-02-06',s:'Navigator',n:'Andrew Lorono',r:4},{d:'2026-02-15',s:'Utopia',n:'Baris',r:4},{d:'2026-02-28',s:'Oasis',n:'Jim Olid',r:3},{d:'2026-03-01',s:'Radiance',n:'Raymond Villacortes',r:3},{d:'2026-03-04',s:'Star',n:'Sherry Gibas',r:5},{d:'2026-03-05',s:'Symphony',n:'King Manzano',r:5},{d:'2026-03-15',s:'Anthem',n:'John Sarmiento',r:4},{d:'2026-04-08',s:'Voyager',n:'Cherry Gayda',r:4},{d:'2026-04-18',s:'Allure',n:'Mario Lazo',r:4},{d:'2026-04-18',s:'Harmony',n:'Jomar Mangulabnan',r:4},{d:'2026-06-01',s:'Mariner',n:'Jeadrig Tuazon',r:4},{d:'2026-06-01',s:'Explorer',n:'Haziel Caag',r:4},{d:'2026-06-04',s:'Icon',n:'Zandro Espenilla',r:4},{d:'2026-06-05',s:'Enchantment',n:'Ryan Lumanglas',r:5},{d:'2026-06-06',s:'Utopia',n:'Rommel Madrinico',r:4},{d:'2026-07-15',s:'Independence',n:'Janet Magana',r:5}];
function rptCut(p,ref){
  var d=new Date(ref.getTime());
  if(p==='7D'){d.setDate(d.getDate()-7);return d;}
  if(p==='30D'){d.setDate(d.getDate()-30);return d;}
  if(p==='QTD'){d.setMonth(Math.floor(d.getMonth()/3)*3,1);d.setHours(0,0,0,0);return d;}
  if(p==='YTD'){d.setMonth(0,1);d.setHours(0,0,0,0);return d;}
  return null;
}
function rptFilter(p){
  var now=new Date(),cut=rptCut(p,now);
  if(!cut)return RPT_ROWS.slice();
  return RPT_ROWS.filter(function(x){return new Date(x.d)>=cut;});
}
function rptPrev(p){
  var now=new Date(),cut=rptCut(p,now);
  if(!cut)return [];
  var span=now.getTime()-cut.getTime(),from=new Date(cut.getTime()-span);
  return RPT_ROWS.filter(function(x){var t=new Date(x.d);return t>=from&&t<cut;});
}
function rptAvg(rows){var s=0;rows.forEach(function(x){s+=x.r;});return rows.length?s/rows.length:0;}
function rptMonths(rows){
  var m={},keys=[];
  rows.forEach(function(x){var k=x.d.slice(0,7);if(!m[k]){m[k]=[];keys.push(k);}m[k].push(x.r);});
  keys.sort();
  return keys.map(function(k){var v=m[k],s=v.reduce(function(a,b){return a+b;},0);var mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(k.slice(5,7),10)-1];
    return {k:k,x:mo+' '+k.slice(2,4),n:v.length,avg:s/v.length,five:v.filter(function(r){return r===5;}).length,low:v.filter(function(r){return r<3;}).length};});
}
function rspark(arr,color){
  var w=120,h=30,mn=Math.min.apply(null,arr),mx=Math.max.apply(null,arr),sp=(mx-mn)||1;
  var pts=arr.map(function(v,i){return (i*(w/(arr.length-1))).toFixed(1)+','+(h-3-((v-mn)/sp)*(h-8)).toFixed(1);}).join(' ');
  return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round"></polyline></svg>';
}
function rpset(p){RPT_P=p;rptSbm();}
// Reports shell: navy left sub-menu (same pattern as the Data tab), content on the
// right. Each report is a menu entry; future modules (Bonus & Money, Manpower,
// Travel Spend) slot in as new entries + one render function each.
function renderReports(){
  $('#view').innerHTML='<style>'
   +'.dswrap{display:grid;grid-template-columns:238px 1fr;gap:0;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(20,45,72,.06)}'
   +'.dsside{background:var(--navy);padding:22px 14px;display:flex;flex-direction:column;min-height:540px}'
   +'.dsbrandrow{display:flex;align-items:center;gap:9px;padding:0 6px}'
   +'.dswm{font-family:Outfit;font-size:24px;font-weight:800;color:#fff;letter-spacing:4px}'
   +'.dsline{height:2px;background:var(--green);width:112px;border-radius:1px;margin:8px 6px 7px}'
   +'.dssub{font-size:8px;font-weight:600;color:rgba(255,255,255,.5);letter-spacing:2px;text-transform:uppercase;line-height:1.6;padding:0 6px 18px}'
   +'.dsnav{display:block;width:100%;text-align:left;border:0;background:transparent;color:rgba(255,255,255,.72);font:600 14px DM Sans;padding:9px 11px;border-radius:8px;cursor:pointer;margin:1px 0}'
   +'.dsside .dsnav:hover{background:rgba(255,255,255,.07);color:#fff}'
   +'.dsside .dsnav.on{background:rgba(255,255,255,.13);color:#fff}'
   +'.dsnav.soon{color:rgba(255,255,255,.32);cursor:default}'
   +'.dsnav.soon:hover{background:transparent;color:rgba(255,255,255,.32)}'
   +'.dsnav.soon small{font-size:9px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;margin-left:6px}'
   +'.dsdg3{margin-top:auto;padding:12px 8px 0;border-top:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.45);font-size:8px;letter-spacing:1px;text-transform:uppercase;display:flex;align-items:center;gap:8px}'
   +'.dsdg3 b{color:var(--green);font-family:Outfit;font-size:13px;letter-spacing:2px}'
   +'.dsmain{padding:22px 24px;min-width:0}'
   +'</style>'
   +'<div class=dswrap>'
   +'<aside class=dsside>'
     +'<div class=dsbrandrow><svg width=27 height=27 viewBox="0 0 34 34" fill="none"><rect x=4 y=2 width=20 height=26 rx=2 stroke="#5FB946" stroke-width=1.8 fill="none"/><rect x=10 y=8 width=20 height=26 rx=2 stroke="#5FB946" stroke-width=1.2 fill="none" opacity=0.3/><line x1=8 y1=10 x2=20 y2=10 stroke="#5FB946" stroke-width=1.2 opacity=0.6/><line x1=8 y1=14 x2=18 y2=14 stroke="#5FB946" stroke-width=1.2 opacity=0.4/><line x1=8 y1=18 x2=16 y2=18 stroke="#5FB946" stroke-width=1.2 opacity=0.25/></svg><span class=dswm>CIMS</span></div>'
     +'<div class=dsline></div>'
     +'<div class=dssub>Reports<br>Operational Intelligence</div>'
     +'<button class="dsnav rptmenu on" data-rpt="sbm">Shipboard Feedback</button>'
     +'<a class=dsnav href="/go/recruitment" target=_blank rel=noopener style="text-decoration:none">Recruitment &#8599;</a>'
     +'<button class="dsnav soon" tabindex=-1>Bonus &amp; Money<small>soon</small></button>'
     +'<button class="dsnav soon" tabindex=-1>Manpower<small>soon</small></button>'
     +'<button class="dsnav soon" tabindex=-1>Travel Spend<small>soon</small></button>'
     +'<div class=dsdg3>A division of <b>DG3</b></div>'
   +'</aside>'
   +'<div class=dsmain><div id=rptbody></div></div>'
   +'</div>';
  document.querySelectorAll('.rptmenu').forEach(function(b){b.onclick=function(){document.querySelectorAll('.rptmenu').forEach(function(x){x.classList.remove('on');});b.classList.add('on');rptShow(b.getAttribute('data-rpt'));};});
  rptShow('sbm');
}
function rptShow(r){ if(r==='sbm')return rptSbm(); }
function rtrend(pts,ymin,ymax){
  var w=320,h=130,pad=26,n=pts.length,dx=(w-pad*2)/Math.max(1,n-1),sp=(ymax-ymin)||1;
  var co=pts.map(function(p,i){return [pad+i*dx,h-pad-((p.y-ymin)/sp)*(h-pad*2)];});
  var path=co.map(function(c,i){return (i?'L':'M')+c[0].toFixed(1)+' '+c[1].toFixed(1);}).join(' ');
  var area=path+' L'+co[n-1][0].toFixed(1)+' '+(h-pad)+' L'+co[0][0].toFixed(1)+' '+(h-pad)+' Z';
  var dots=co.map(function(c,i){return '<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="2.6" fill="#1E6FD0"></circle><text x="'+c[0].toFixed(1)+'" y="'+(c[1]-8).toFixed(1)+'" text-anchor="middle" font-size="9" font-weight="700" fill="#1B3A5C">'+pts[i].y.toFixed(1)+'</text>';}).join('');
  var labs=pts.map(function(p,i){return '<text x="'+co[i][0].toFixed(1)+'" y="'+(h-7)+'" text-anchor="middle" font-size="8" fill="#6B7C93">'+p.x+'</text>';}).join('');
  var gate=h-pad-((3-ymin)/sp)*(h-pad*2);
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'"><line x1="'+pad+'" y1="'+gate.toFixed(1)+'" x2="'+(w-pad)+'" y2="'+gate.toFixed(1)+'" stroke="#BC3B2C" stroke-width="1" stroke-dasharray="4 4" opacity=".55"></line><text x="'+(w-pad)+'" y="'+(gate-4).toFixed(1)+'" text-anchor="end" font-size="8" fill="#BC3B2C">freeze gate (3.0)</text><path d="'+area+'" fill="rgba(30,111,208,.12)"></path><path d="'+path+'" fill="none" stroke="#1E6FD0" stroke-width="2"></path>'+dots+labs+'</svg>';
}
function rptSbm(){
  var rows=rptFilter(RPT_P),prev=rptPrev(RPT_P),mo=rptMonths(rows);
  var n=rows.length,avg=rptAvg(rows),five=rows.filter(function(x){return x.r===5;}).length,
      low=rows.filter(function(x){return x.r<3;}).length,
      ships={},specs={};
  rows.forEach(function(x){ships[x.s]=ships[x.s]||[];ships[x.s].push(x);specs[x.n]=specs[x.n]||[];specs[x.n].push(x);});
  var shipN=Object.keys(ships).length,specN=Object.keys(specs).length;
  function delta(cur,pv,dec,bad){
    if(!prev.length)return '<span class="kdelta flat">&mdash;</span>';
    var df=cur-pv;if(Math.abs(df)<(dec?0.05:0.5))return '<span class="kdelta flat">&#9644; 0</span>';
    var up=df>0,good=bad?!up:up;
    return '<span class="kdelta '+(good?'up':'dn')+'">'+(up?'&#9650;':'&#9660;')+' '+(dec?Math.abs(df).toFixed(1):Math.round(Math.abs(df)))+'</span>';
  }
  var pAvg=rptAvg(prev),pFive=prev.filter(function(x){return x.r===5;}).length,pLow=prev.filter(function(x){return x.r<3;}).length;
  var pShips={};prev.forEach(function(x){pShips[x.s]=1;});
  var pSpecs={};prev.forEach(function(x){pSpecs[x.n]=1;});
  var h='<div class=rpthead><h2>Shipboard Feedback</h2>'
   +['7D','30D','QTD','YTD','All'].map(function(p){return '<button class="pchip'+(p===RPT_P?' on':'')+'" onclick="rpset(\\''+p+'\\')">'+p+'</button>';}).join('')
   +'</div>'
   +'<div class=liveband>&#9679; LIVE DATA &mdash; '+RPT_ROWS.length+' GSM reviews imported from the legacy MS Forms survey (Jun 2025 &ndash; Jul 2026, Royal Caribbean). 1 test response excluded. Invite &amp; response-rate metrics arrive when the CIMS-native pipeline goes live.</div>';
  if(!n){
    h+='<div class=rblk><div class=csub style="padding:14px 4px">No reviews in this period. Widen the range &mdash; the imported history starts June 2025.</div></div>';
    $('#rptbody').innerHTML=h;return;
  }
  // ---- KPI strip (only metrics this data can prove)
  var sparkN=mo.map(function(x){return x.n;}),sparkA=mo.map(function(x){return x.avg;}),sparkF=mo.map(function(x){return x.five;});
  if(sparkN.length<2){sparkN=[0].concat(sparkN);sparkA=[sparkA[0]||0].concat(sparkA);sparkF=[0].concat(sparkF);}
  h+='<div class=kgrid>'
   +'<div class=ktile><div class=kl>Reviews</div><div class=kv>'+n+delta(n,prev.length)+'</div>'+rspark(sparkN,'#1E6FD0')+'</div>'
   +'<div class=ktile><div class=kl>Avg rating</div><div class=kv>'+avg.toFixed(2)+'<small>/5</small>'+delta(avg,pAvg,true)+'</div>'+rspark(sparkA,'#1E6FD0')+'</div>'
   +'<div class=ktile><div class=kl>5-star reviews</div><div class=kv>'+five+delta(five,pFive)+'</div>'+rspark(sparkF,'#3E8E2A')+'</div>'
   +'<div class=ktile><div class=kl>Below-3 ratings</div><div class=kv>'+low+delta(low,pLow,false,true)+'</div>'+rspark(mo.map(function(x){return x.low;}).length>1?mo.map(function(x){return x.low;}):[0,low],'#BC3B2C')+'</div>'
   +'<div class=ktile><div class=kl>Ships covered</div><div class=kv>'+shipN+delta(shipN,Object.keys(pShips).length)+'</div><div class=csub style="margin-top:8px">of 26 Royal Caribbean</div></div>'
   +'<div class=ktile><div class=kl>Specialists reviewed</div><div class=kv>'+specN+delta(specN,Object.keys(pSpecs).length)+'</div><div class=csub style="margin-top:8px">distinct names on file</div></div>'
   +'</div>';
  // ---- Monthly volume + distribution
  h+='<div class=rgrid2>';
  var vmax=1;mo.forEach(function(x){if(x.n>vmax)vmax=x.n;});
  h+='<div class=rblk><h3>Reviews per month</h3>'+mo.map(function(x){
    return '<div class=frow><span class=fl>'+x.x+'</span><span class=fbar><i style="width:'+Math.round(x.n/vmax*100)+'%;background:#1E6FD0"></i></span><span class=fn>'+x.n+'</span></div>';
  }).join('')+'<div class=csub style="margin-top:8px">Volume follows sign-off dates &mdash; the invite funnel appears here once the CIMS pipeline is live.</div></div>';
  var dist=[1,2,3,4,5].map(function(rr){return {r:rr,n:rows.filter(function(x){return x.r===rr;}).length};});
  var dmax=1;dist.forEach(function(x){if(x.n>dmax)dmax=x.n;});
  h+='<div class=rblk><h3>Rating distribution</h3><div class=hwrap2>'+dist.map(function(x){
    return '<div class="hcol'+(x.r<3?' rlow':'')+'"><b>'+x.n+'</b><i style="height:'+Math.max(4,Math.round(x.n/dmax*82))+'%"></i><span>'+x.r+'</span></div>';
  }).join('')+'</div><div class=csub style="margin-top:10px">Royal Caribbean <b>'+avg.toFixed(2)+'</b> ('+n+') &middot; Celebrity &amp; Azamara start with the CIMS-native pipeline</div></div>';
  h+='</div>';
  // ---- Trend + specialist board
  h+='<div class=rgrid2>';
  if(mo.length>=2)h+='<div class=rblk><h3>Average rating trend</h3>'+rtrend(mo.map(function(x){return {x:x.x,y:Math.round(x.avg*10)/10};}),2.8,5)+'</div>';
  else h+='<div class=rblk><h3>Average rating trend</h3><div class=csub style="padding:12px 2px">Needs at least two months of data in the selected period.</div></div>';
  var board=Object.keys(specs).map(function(k){var v=specs[k];return {name:k,n:v.length,avg:rptAvg(v),ship:v[v.length-1].s};})
    .filter(function(b){return b.n>=2;}).sort(function(a,b){return b.avg-a.avg||b.n-a.n;});
  h+='<div class=rblk><h3>Specialist board &middot; min 2 reviews</h3>';
  if(board.length)h+='<table class=tbl><thead><tr><th>Specialist</th><th>Latest ship</th><th>Reviews</th><th>Avg</th></tr></thead><tbody>'
   +board.map(function(b){var col=b.avg>=4.5?'var(--green-d)':(b.avg<4?'var(--amber)':'var(--navy)');
     return '<tr><td>'+b.name+'</td><td>'+b.ship+'</td><td>'+b.n+'</td><td style="font-weight:800;color:'+col+'">'+b.avg.toFixed(1)+'</td></tr>';}).join('')
   +'</tbody></table><div class=csub style="margin-top:8px">Everyone else has one review so far &mdash; the board fills in as second contracts complete.</div>';
  else h+='<div class=csub style="padding:12px 2px">No specialist has two reviews in this period yet.</div>';
  h+='</div></div>';
  // ---- Watchlist
  var watch=rows.filter(function(x){return x.r<3;}).sort(function(a,b){return a.d<b.d?1:-1;});
  if(watch.length){
    h+='<div class=rblk style="margin-top:12px;border-left:3px solid var(--red)"><h3 style="color:var(--red)">Watchlist &middot; ratings below 3</h3>'
     +watch.map(function(x){return '<div class=frow><span style="font-weight:700;min-width:130px">'+x.n+'</span><span class=csub>'+x.s+' &middot; '+x.d+' &middot; rated <b style="color:var(--red)">'+x.r+'/5</b> &middot; freeze gate &mdash; sEval 0/15 until reviewed</span></div>';}).join('')
     +'</div>';
  }else{
    h+='<div class=rblk style="margin-top:12px;border-left:3px solid var(--green)"><h3 style="color:var(--green-d)">Watchlist &middot; ratings below 3</h3><div class=csub style="padding:4px 2px">Clear &mdash; no review in this period has triggered the freeze gate. Lowest rating on file is 3/5.</div></div>';
  }
  // ---- Ships + latest
  h+='<div class=rgrid2>';
  var shipList=Object.keys(ships).map(function(k){var v=ships[k];return {ship:k,n:v.length,avg:rptAvg(v),last:v[v.length-1].d};})
    .sort(function(a,b){return b.n-a.n||(a.ship<b.ship?-1:1);});
  h+='<div class=rblk><h3>Reviews by ship</h3><table class=tbl><thead><tr><th>Ship</th><th>Reviews</th><th>Avg</th><th>Last review</th></tr></thead><tbody>'
   +shipList.map(function(s){var col=s.avg>=4.5?'var(--green-d)':(s.avg<4?'var(--amber)':'var(--navy)');
     return '<tr><td>'+s.ship+'</td><td>'+s.n+'</td><td style="font-weight:800;color:'+col+'">'+s.avg.toFixed(1)+'</td><td>'+s.last+'</td></tr>';}).join('')
   +'</tbody></table><div class=csub style="margin-top:8px">Ships with no row have never returned a survey &mdash; that gap becomes visible (and chaseable) once invites are tracked.</div></div>';
  var latest=rows.slice().sort(function(a,b){return a.d<b.d?1:-1;}).slice(0,8);
  h+='<div class=rblk><h3>Latest reviews</h3><table class=tbl><thead><tr><th>Date</th><th>Specialist</th><th>Ship</th><th>Rating</th></tr></thead><tbody>'
   +latest.map(function(r){var col=r.r<3?'var(--red)':'var(--navy)';
     return '<tr><td>'+r.d+'</td><td>'+r.n+'</td><td>'+r.s+'</td><td style="font-weight:800;color:'+col+'">'+r.r+'/5</td></tr>';}).join('')
   +'</tbody></table></div>';
  h+='</div>';
  h+='<div class=csub style="margin-top:14px;opacity:.75">Shipboard Feedback &middot; live import of the legacy survey. Next: switch the source to the CIMS-native pipeline (adds invites, response rate, reminders, and per-brand coverage).</div>';
  $('#rptbody').innerHTML=h;
}
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
     +tile(w.retired||0,'Retired','gray','crew')+tile((d.dryDockNow||0),'In dry dock',(d.dryDockNow?'red':'green'),'fleet')
   +'</div></div></div>';
  // ZONE 2 — COMPLIANCE
  h+='<div class=zlabel>Compliance — documents expiring within 90 days</div><div class=dzone>'
   +'<div class="panel" style="grid-column:span 2"><h3>Expiring documents by type</h3>'+(compTot?barSVG(compBars):'<div class=muted style="padding:16px">All documents valid beyond 90 days.</div>')+'</div>'
   +'<div class=panel><h3>Action needed</h3><div class=tiles style="grid-template-columns:1fr 1fr">'
     +tile(compTot,'Total flagged',(compTot?'amber':'green'),'compliance')+tile(c.med_exp_90,'Medical','red','compliance')
   +'</div><p class=hint style="margin-top:10px">Open the Compliance tab for the crew list and CSV export.</p></div></div>';
  // ZONE 3 — COST & BONUS
  h+='<div class=zlabel>Cost &amp; bonus</div><div class=dzone>'
   +'<div class=panel style="grid-column:span 2"><h3>Travel spend by month'+(d.travel&&d.travel.year?(' · '+d.travel.year):'')+'</h3><div id=trvline></div><div id=trvmom class=csub style="margin-top:4px"></div></div>'
   +'<div class=panel><h3>Travel budget</h3><div id=trv class=tiles style="grid-template-columns:1fr 1fr"></div><div id=trvcat style="margin-top:12px"></div></div></div>'
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
  var trv=document.getElementById('trv');
  if(trv){
    var annualBud=(tv.budgetMo||15000)*12;                  // actual budget $180k/yr
    var crew=tv.crew||0;                                    // crew travel = what the budget governs (shoreside is separate, unbudgeted)
    var pct=annualBud?Math.round(crew/annualBud*100):0;
    trv.innerHTML=
      tile('<span style="font-size:22px;color:'+(pct<=100?'var(--green-d)':'var(--red)')+'">'+pct+'%</span>','of $'+Number(annualBud).toLocaleString()+' annual budget used','','travel')
      +tile('<span style="font-size:22px">$'+Math.round(crew).toLocaleString()+'</span>','crew travel '+(tv.year||''),'','travel');
    trv.querySelectorAll('.tile[data-go]').forEach(function(x){x.onclick=function(){show(x.getAttribute('data-go'));};});
  }
  var catEl=document.getElementById('trvcat');
  if(catEl&&tv.cats){
    var order=['air','hotel','transport','medical','visa','food','other'];
    var labs={air:'Air',hotel:'Hotel',transport:'Transport',medical:'Medical',visa:'Visa',food:'Food',other:'Other'};
    var mx=0;order.forEach(function(k){if((tv.cats[k]||0)>mx)mx=tv.cats[k];});
    var rh=order.filter(function(k){return (tv.cats[k]||0)>0;}).map(function(k){var v=tv.cats[k]||0,w=mx?Math.round(v/mx*100):0;return '<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><div style="width:62px;font-size:11px;color:var(--mut)">'+labs[k]+'</div><div style="flex:1;background:#eef1f5;border-radius:4px;height:13px"><div style="width:'+w+'%;height:13px;background:var(--navy);border-radius:4px"></div></div><div style="width:64px;text-align:right;font-size:11px;font-weight:700">$'+Math.round(v).toLocaleString()+'</div></div>';}).join('');
    catEl.innerHTML='<div class=csub style="margin-bottom:4px">Crew spend by category'+(tv.year?(' · '+tv.year):'')+'</div>'+rh+'<div class=csub style="margin-top:8px;color:var(--mut)">+ $'+Math.round(tv.shoreside||0).toLocaleString()+' shoreside travel · tracked separately (no budget)</div>';
  }
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
  if(c.status==='Inactive'||c.status==='Retired')return false;
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
   +'<button class="btn ghost" onclick="exportDocsCSV()">Docs CSV</button>'
   +'<button class="btn ghost" onclick="hiddenCardsModal()">Hidden cards</button>'
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
  var ps=r.pending||[];window.INTELROSTER=r.roster||[];
  if(!ps.length){box.innerHTML='<div class=muted style="padding:14px">Nothing to review — all clear.</div>';return;}
  box.innerHTML=ps.map(function(p){
    var cands=(p.candidates||[]).map(function(c){return '<button class="btn green" style="padding:6px 10px;font-size:12px" data-pid="'+p.id+'" data-aid="'+c.agency_id+'">&#8594; '+String(c.name).replace(/</g,'&lt;')+'</button>';}).join('');
    return '<div class=noteitem><div class=notemeta>'+(p.reporter?(String(p.reporter).replace(/</g,'&lt;')+' &middot; '):'')+'<span class=cchip>'+p.confidence+' match</span></div><div class=notetext>'+String(p.summary||'').replace(/</g,'&lt;').replace(/\\n/g,'<br>')+'</div><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;align-items:center">'+cands+'<input class=intelsq data-pid="'+p.id+'" placeholder="&#128269; Search crew&hellip;" style="width:180px;padding:6px 10px;border:1px solid var(--line-2);border-radius:8px;font-size:12px;height:30px;box-sizing:border-box"><span class=intelsr style="display:inline-flex;flex-wrap:wrap;gap:5px;align-items:center"></span><span style="flex:1"></span><button class="btn ghost intelrm" style="padding:6px 10px;font-size:12px" data-pid="'+p.id+'">Discard</button></div></div>';
  }).join('');
  box.onclick=function(e){var b=e.target.closest?e.target.closest('button[data-aid]'):null;if(b)return intelAssign(b.getAttribute('data-pid'),b.getAttribute('data-aid'));var d=e.target.closest?e.target.closest('.intelrm'):null;if(d)return intelDiscard(d.getAttribute('data-pid'));};
  box.querySelectorAll('.intelsq').forEach(function(inp){inp.oninput=function(){
    var q=inp.value.toLowerCase().trim();var out=inp.parentNode.querySelector('.intelsr');
    if(!q||q.length<2){out.innerHTML='';return;}
    var toks=q.split(/\\s+/);
    var hits=(window.INTELROSTER||[]).filter(function(c){var hay=(String(c.name)+' '+String(c.agency_id)).toLowerCase();return toks.every(function(t){return hay.indexOf(t)>=0;});}).slice(0,4);
    out.innerHTML=hits.map(function(c){return '<button class="btn green" style="padding:6px 10px;font-size:12px" data-pid="'+inp.getAttribute('data-pid')+'" data-aid="'+c.agency_id+'">&#8594; '+String(c.name).replace(/</g,'&lt;')+'</button>';}).join('')||'<span class=hint>No crew found.</span>';
  };});
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
function docsModal(id){
  var c=null,i;for(i=0;i<CREW.length;i++){if(CREW[i].agency_id===id){c=CREW[i];break;}}
  if(!c)return;
  var name=[c.first_name,c.middle_name,c.last_name].filter(Boolean).join(' ');
  var docs=[['Medical','med_exp'],['Seaman Bk','sirb_exp'],['Passport','pp_exp'],['US C1/D Visa','usv_exp'],['Schengen','sch_exp']];
  var map={expired:['Expired','red'],'90d':['Expiring','amber'],ok:['Valid','ok'],missing:['Missing','amber']};
  var body='<div class=hint style="margin-bottom:8px">'+c.agency_id+' · '+(c.vessel_observed||'—')+' · '+(c.status||'')+'</div>'
   +'<table class=tbl><thead><tr><th>Document</th><th>Expiry</th><th>Status</th><th style="text-align:right">Remaining</th></tr></thead><tbody>'
   +docs.map(function(d){var exp=c[d[1]];var g=docFlag(exp);var st=map[g]||map.missing;var days=exp?Math.round((new Date(exp)-new Date())/86400000):null;var dtxt=(days==null)?'—':(days<0?(Math.abs(days)+'d ago'):(days+'d left'));return '<tr><td>'+d[0]+'</td><td>'+(exp||'—')+'</td><td><span class="cchip '+st[1]+'">'+st[0]+'</span></td><td style="text-align:right">'+dtxt+'</td></tr>';}).join('')
   +'</tbody></table><div class=hint style="margin-top:8px">Fleet-wide list &amp; export: Crew tab → Docs CSV, or click the Docs tiles to filter.</div>';
  $('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class=modal><div class=mh>Document compliance — '+name+'<button onclick="mClose()">×</button></div><div class=mb>'+body+'</div></div></div>';MODAL_T=Date.now();
}
async function exportDocsCSV(){
  var d=await (await fetch('/api/compliance?days=90')).json();
  var rows=[['Crew','ID','Vessel','Status','Document','Doc status','Expiry','Days']];
  (d.report||[]).forEach(function(r){r.flags.forEach(function(f){rows.push([r.name,r.agency_id,r.vessel||'',r.status||'',f.doc,f.status,f.exp||'',f.days==null?'':f.days]);});});
  var csv=rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?('"'+x.replace(/"/g,'""')+'"'):x;}).join(',');}).join('\\n');
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='compliance_'+(d.today||'')+'.csv';a.click();
}
function crewTiles(){
  var on=CREW.filter(function(c){return c.status==='On board';}).length;
  var vac=CREW.filter(function(c){return c.status==='On Vacation';}).length;
  var ear=CREW.filter(function(c){return c.status==='Earmarked';}).length;
  var ina=CREW.filter(function(c){return c.status==='Inactive';}).length;
  var ret=CREW.filter(function(c){return c.status==='Retired';}).length;
  var act=CREW.filter(function(c){return c.status!=='Inactive'&&c.status!=='Retired';}); // active = excludes retired & inactive; doc compliance only matters for sailing crew
  var exp=act.filter(function(c){return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){var g=docFlag(c[k]);return g==='expired'||g==='missing';});}).length;
  var soon=act.filter(function(c){return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){return docFlag(c[k])==='90d';});}).length;
  var sch=act.filter(function(c){return c.sch_exp&&['expired','90d'].indexOf(docFlag(c.sch_exp))>=0;}).length;
  function t(n,l,cls,kind,key){var onx=(kind==='st'?CF.status:CF.comp)===key&&key!=='';return '<div class="tile '+(cls||'')+(onx?' on':'')+'" data-kind="'+kind+'" data-key="'+key+'" style="cursor:pointer"><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';}
  return t(CREW.length,'All crew','','st','')+t(on,'On board','green','st','On board')+t(vac,'On vacation','amber','st','On Vacation')+t(ret,'Retired','gray','st','Retired')+t(ear,'Earmarked','royal','st','Earmarked')+t(ina,'Inactive','gray','st','Inactive')
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
    +'<button class="btn ghost" onclick="sendSignoffInstructions(\\''+c.agency_id+'\\','+((d.contracts&&d.contracts.length)?d.contracts[d.contracts.length-1].seq:0)+')">Send instructions</button>'
    +'<button class="btn ghost" onclick="sendSignoffLink(\\''+c.agency_id+'\\','+((d.contracts&&d.contracts.length)?d.contracts[d.contracts.length-1].seq:0)+')">Send sign-off link</button>'
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
  h+='<div class=zlabel style="margin-top:16px">Manager Feedback</div><div id=sbmcards><p class=muted style="text-align:left;padding:8px 2px">Loading…</p></div>';
  h+='</div>';
  $('#view').innerHTML=h;
  document.querySelectorAll('#view .rf').forEach(function(b){b.onclick=function(){reqFeedback(b.getAttribute('data-role'));};});
  loadSbmCards(c.agency_id);
}
// Shipboard Management Review responses -> permanent "Manager Feedback" cards (below Contract history).
async function loadSbmCards(id){
  var el=document.getElementById('sbmcards'); if(!el)return;
  function ev(v){return String(v==null?'':v).replace(/[&<>"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];});}
  try{
    var r=await (await fetch('/api/sbm/crew?id='+encodeURIComponent(id))).json();
    var cards=(r&&r.cards)||[];
    if(!cards.length){el.innerHTML='<p class=muted style="text-align:left;padding:8px 2px">No shipboard management reviews yet.</p>';return;}
    el.innerHTML=cards.map(function(x){
      var qs=[['Smart with work',x.q_business],['Guests come first',x.q_guests],['Helps us grow',x.q_grow],['Acts with care',x.q_integrity],['Team player',x.q_teams],['High energy',x.q_energy],['Final thoughts',x.q_final]]
        .filter(function(pr){return pr[1];}).map(function(pr){return '<div style="margin-top:6px;font-size:13px"><span class=csub>'+pr[0]+':</span> “'+ev(pr[1])+'”</div>';}).join('');
      return '<div class="card" style="max-width:none;margin-bottom:10px;border-left:3px solid var(--navy)">'
        +'<div class=csub>'+ev(x.ship||'—')+' · '+ev(x.brand||'—')+' · '+ev((x.contract_signon||'?')+' → '+(x.contract_signoff||'?'))+' · submitted '+ev(String(x.submitted_at||'').slice(0,10))+'</div>'
        +'<div style="font-weight:700;margin-top:4px">Overall '+ev(x.rating)+'/5</div>'+qs+'</div>';
    }).join('');
  }catch(e){el.innerHTML='<p class=muted style="text-align:left;padding:8px 2px">Could not load shipboard reviews.</p>';}
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
   +'<div class=tools><button title="Documents" style="color:var(--red);font-weight:800" onclick="docsModal(\\''+c.agency_id+'\\')">✚</button><button title="Notes" onclick="notesModal(\\''+c.agency_id+'\\')">🗒</button><button title="Edit" onclick="editCrewModal(\\''+c.agency_id+'\\')">✎</button></div>'
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
   +'<div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center"><button class="btn ghost" style="color:var(--red)" onclick="hideCrew(\\''+id+'\\')" title="Remove this card from all rosters (reversible)">Hide card</button><span><span id=eMsg class=csub style="margin-right:8px"></span><button class="btn ghost" onclick="closeCrewModal()">Cancel</button> <button class="btn green" onclick="saveEditCrew(\\''+id+'\\')">Save</button></span></div></div>';
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
// Hide (void) a crew card — reversible. Removes it from every roster via the server's redacted flag.
async function hideCrew(id){
  if(!confirm('Hide this crew card?\\n\\nIt will be removed from all rosters (Crew, Dashboard, Rotation, Billing). You can bring it back any time from "Hidden cards". Nothing is deleted.'))return;
  var em=document.getElementById('eMsg');if(em)em.textContent='Hiding…';
  try{
    var r=await (await fetch('/api/crew/hide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,hidden:1})})).json();
    if(r.ok){closeCrewModal();renderCrew();return;}
    if(em)em.textContent=r.error==='money_users_only'?'Only Miguel or Rita can hide cards.':(r.error==='has_bonus_history'?'This crew has committed bonus history — it cannot be hidden.':'Could not hide the card.');
  }catch(e){if(em)em.textContent='Could not hide the card.';}
}
// Hidden cards list + one-click restore.
async function hiddenCardsModal(){
  var list=[];try{var r=await (await fetch('/api/crew?hidden=1')).json();list=r.crew||[];}catch(e){}
  var h='<div class=modcard><div class=modhd><div><div class=cname>Hidden cards</div><div class=csub>'+list.length+' hidden &middot; restore to bring back onto the rosters</div></div><button class="btn ghost" onclick="closeCrewModal()">Close ✕</button></div>';
  if(!list.length)h+='<div class=csub style="padding:16px 2px">No hidden cards. Use &ldquo;Hide card&rdquo; on a crew&rsquo;s Edit screen to remove a duplicate or mistaken entry from the rosters.</div>';
  else h+='<div style="margin-top:10px">'+list.map(function(c){var nm=[c.first_name,c.last_name].filter(Boolean).join(' ')||c.agency_id;return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)"><span>'+nm+' <span class=csub>'+c.agency_id+(c.vessel_observed?(' &middot; '+c.vessel_observed):'')+'</span></span><button class="btn ghost" onclick="restoreCrew(\\''+c.agency_id+'\\')">Restore</button></div>';}).join('')+'</div>';
  h+='</div>';
  var w=document.createElement('div');w.id='crewmodal';w.className='modwrap';w.innerHTML=h;w.onclick=function(e){if(e.target===w)closeCrewModal();};document.body.appendChild(w);
}
async function restoreCrew(id){
  try{var r=await (await fetch('/api/crew/hide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,hidden:0})})).json();
    // Re-render whichever view we're on (the Hidden cards list opens from Crew AND Keyman).
    if(r.ok){closeCrewModal();if(document.getElementById('rotbody'))renderRotation();else renderCrew();}
  }catch(e){}
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
    var sal=(r.base_salary_usd!=null?'<b>$'+Number(r.base_salary_usd).toLocaleString()+'</b>':'<span class=muted style="padding:0">—</span>');
    return '<tr><td><b>'+r.name+'</b><div class=csub>'+r.agency_id+'</div></td><td>'+(r.vessel||'—')+'<div class=csub>'+(r.client||'')+'</div></td><td style="text-align:center">'+r.contracts+'</td><td style="text-align:center"><span class="pill rank">'+r.rank+'</span> '+r.count+'</td><td style="text-align:center">'+sal+'</td><td>'+nb+'</td><td>'+last+'</td><td style="text-align:right">$'+Number(r.totalPay||0).toLocaleString()+'</td><td style="white-space:nowrap"><button class="btn ghost" onclick="window.open(\\'/api/crew/statement.pdf?id='+encodeURIComponent(r.agency_id)+'\\',\\'_blank\\')">PDF</button> <button class="btn ghost" onclick="openFill(\\''+r.agency_id+'\\')" title="Ray / Rolando / Dexter fill in their inputs">Inputs →</button> <button class="btn green" onclick="ledgerScore(\\''+r.agency_id+'\\')">Score</button></td></tr>';
  }).join('')||'<tr><td colspan=9 class=muted>No matches.</td></tr>';
  $('#cttable').innerHTML='<table class=tbl><thead><tr><th>Crew</th><th>Ship · client</th><th>Contracts</th><th>Consec.</th><th>Salary</th><th>Next bonus</th><th>Last outcome</th><th style="text-align:right">Paid</th><th></th></tr></thead><tbody>'+body+'</tbody></table>';
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
    f='<div class=fg><label>PROD Service Performance</label><div class=hint>Machine clean &amp; serviceable at handover? · Technical ability, error-code resolution.</div>'+swSel('clean',['Excellent','Acceptable','Poor'],a.clean||'Excellent')+'</div>'
     +'<div class=fg><label>MFD Service Performance</label><div class=hint>Preventive maintenance done correctly? · Independent service, SOP adherence &amp; quality.</div>'+swSel('pm',['Excellent','Acceptable','Poor'],a.pm||'Excellent')+'</div>'
     +'<div class=fg><label>Information / Database Knowledge</label><div class=hint>Unresolved technical issues left for the reliever? · Correct part numbers, use of technical data.</div>'+swSel('unres',['Excellent','Acceptable','Poor'],a.unres||'Excellent')+'</div>'
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
  var _hasHist=!!(d.outcomes&&d.outcomes.length);
  var _blockCommit=(!d.baseline_set&&!_hasHist);
  var warn=d.baseline_set?'':'<div class=warn>⚠ Starting count not yet confirmed for this crew'+(_blockCommit?' — committing is blocked until the baseline is reconciled against the Contract Counter.':' (event-sourced from prior outcomes).')+'</div>';
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
   +'<div class=f2><div class=fg><label class=req>Sign-on</label><input type=date id=spanStart onchange="recalcScore()"></div><div class=fg><label class=req>Sign-off</label><input type=date id=spanEnd onchange="recalcScore();applySeval(_SEVAL.sc)"></div></div>'
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
   +'<div class=fg style="margin-top:10px"><label>Supervisor evaluation (1–5) — 15%</label><select id=sEval onchange="recalcScore();sevalDirty()"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select><div id=sevalBadge class=hint style="margin-top:5px"></div><div id=sevalReview></div><div class=fg id=sevalReasonWrap style="display:none;margin-top:6px"><label class=req>Reason for overriding the review (10+ chars)</label><textarea id=sevalReason rows=2 placeholder="e.g. guest complaint substantiated on final cruise"></textarea></div><div class=hint>1–2 → bonus forfeited, count held. 3/4/5 → full 15 points.</div></div>'
   +'</div>'
   +'<div class=resultbar id=resultBar><div id=scoreOut></div><div class=rbtns><button class="btn ghost" onclick="mClose()">Cancel</button><button class="btn green" id=commitBtn onclick="commitBonus()"'+(_blockCommit?' disabled title="Baseline pending — reconcile the starting count first"':'')+'>Commit</button></div></div>';
  $('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class="modal '+scCls+'"><div class=mh>Score Card — '+name+'<button onclick="mClose()">×</button></div><div class=mb>'+body+'</div></div></div>';MODAL_T=Date.now();
  if(d.lastLeg){if(d.lastLeg.on)$('#spanStart').value=d.lastLeg.on;if(d.lastLeg.off)$('#spanEnd').value=d.lastLeg.off;}
  recalcScore();
  applyFeedback(cr.agency_id);
  applySeval(cr.agency_id);
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
var _SEVAL={sc:null,value:null,source:'none'};
async function applySeval(sc){
  _SEVAL.sc=sc;_SEVAL.value=null;_SEVAL.source='none';
  var badge=$('#sevalBadge');if(badge)badge.innerHTML='';
  var rev=$('#sevalReview');if(rev)rev.innerHTML='';
  var rw=$('#sevalReasonWrap');if(rw)rw.style.display='none';
  var off=$('#spanEnd')?$('#spanEnd').value:'';
  if(!sc||!off)return;
  var d;try{d=await (await fetch('/api/score/seval?agency_id='+encodeURIComponent(sc)+'&signoff='+encodeURIComponent(off))).json();}catch(e){return;}
  if(!d||d.error)return;
  _SEVAL.value=d.value;_SEVAL.source=d.source;
  if(d.value){var s=$('#sEval');if(s)s.value=String(d.value);recalcScore();}
  if(!badge)return;
  var link=d.reviewCount?(' · <a href="#" onclick="viewSeval();return false" style="color:var(--navy,#1B3A5C)">view review</a>'):'';
  if(d.source==='auto'){badge.innerHTML='<span style="color:var(--green,#5FB946);font-weight:700">● from shipboard review</span>'+(d.reviewCount>1?(' · avg of '+d.reviewCount+' reviews'):'')+link;}
  else if(d.source==='manual'){badge.innerHTML='<span style="color:#b0740a;font-weight:700">● manual — '+(d.set_by||'?')+(d.set_at?(', '+String(d.set_at).slice(0,10)):'')+'</span>'+link;}
}
function sevalDirty(){var s=$('#sEval');if(!s)return;var rw=$('#sevalReasonWrap');if(!rw)return;rw.style.display=(_SEVAL.value!=null&&parseInt(s.value)!==parseInt(_SEVAL.value))?'block':'none';}
async function viewSeval(){
  var off=$('#spanEnd')?$('#spanEnd').value:'';var sc=_SEVAL.sc;if(!sc)return;
  var box=$('#sevalReview');if(!box)return;box.innerHTML='<div class=hint>Loading review…</div>';
  var d;try{d=await (await fetch('/api/sbm/crew?id='+encodeURIComponent(sc))).json();}catch(e){box.innerHTML='<div class=hint>Could not load the review.</div>';return;}
  var cards=(d&&d.cards)||[];var c=null;for(var i=0;i<cards.length;i++){if(String(cards[i].contract_signoff)===String(off)){c=cards[i];break;}}
  if(!c){box.innerHTML='<div class=hint>No shipboard review on file for this contract.</div>';return;}
  var qs=[['Business sense',c.q_business],['Guests first',c.q_guests],['Helps us grow',c.q_grow],['Integrity',c.q_integrity],['Teamwork',c.q_teams],['Energy',c.q_energy],['Final thoughts',c.q_final]];
  var h='<div class=hint style="border-left:3px solid var(--green,#5FB946);padding-left:8px;margin-top:4px"><b>Shipboard review</b> — '+(c.ship||'')+' · rating '+c.rating+'/5';
  for(var j=0;j<qs.length;j++){if(qs[j][1])h+='<br><b>'+qs[j][0]+':</b> '+String(qs[j][1]).replace(/</g,'&lt;');}
  h+='</div>';box.innerHTML=h;
}
async function commitBonus(){
  var ss=$('#spanStart'),se=$('#spanEnd');
  ss.classList.toggle('bad',!ss.value);se.classList.toggle('bad',!se.value);
  if(!ss.value||!se.value){(!ss.value?ss:se).focus();return;}
  var _sev=$('#sEval'),_sevVal=parseInt(_sev.value);
  if(_SEVAL.value!=null&&_sevVal!==parseInt(_SEVAL.value)){
    var _rsn=$('#sevalReason')?$('#sevalReason').value.trim():'';
    if(_rsn.length<10){alert('Changing the supervisor evaluation away from the shipboard review needs a reason (10+ characters).');if($('#sevalReason'))$('#sevalReason').focus();return;}
    try{var _ov=await (await fetch('/api/score/seval/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:_SC.crew.agency_id,signoff:se.value,value:_sevVal,reason:_rsn})})).json();if(_ov&&_ov.error){alert(_ov.error==='not_authorised'?'Only Miguel or Rita can override the supervisor evaluation.':('Could not record the override: '+_ov.error));return;}_SEVAL.value=_sevVal;_SEVAL.source='manual';}catch(e){alert('Could not record the override.');return;}
  }
  var btn=$('#commitBtn');btn.disabled=true;btn.textContent='Committing…';
  var sliders={};for(var k in FW)sliders[k]=parseInt($('#'+k).value);
  var payload={agency_id:_SC.crew.agency_id,spanStart:$('#spanStart').value,spanEnd:$('#spanEnd').value,
    ships:$('#ships').value.split(',').map(function(s){return s.trim();}).filter(Boolean),
    sliders:sliders,evalScore:parseInt($('#sEval').value),
    gates:{complete:$('#gComplete').checked,compassion:$('#gCompassion').checked,rush:$('#gRush').checked,audit:$('#gAudit').checked},
    gateNote:$('#gateNote')?$('#gateNote').value:''};
  var res=await (await fetch('/api/bonus/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).json();
  if(res.error){btn.disabled=false;btn.textContent='Commit';var msgs={gate_note_required:'A reset gate needs a written reason & evidence.',span_required:'Enter sign-on and sign-off dates.',span_invalid:'Sign-off must be after sign-on.',not_authorised:'Only the GM or Head of HR can commit a bonus payout.',baseline_pending:'Starting count not confirmed for this crew. Reconcile the baseline against the Contract Counter before committing a payout.',eval_required:'Set the supervisor evaluation (1–5) before committing.'};alert(msgs[res.error]||('Error: '+res.error));return;}
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
