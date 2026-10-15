// PRINTSHOP AUDIT — the routes (14 Oct 2026). Same install pattern as installSbm: worker.js hands in what it owns
// (json, the memoized table guard, the board, the crew profile) and calls the returned handler INSIDE the fetch
// handler's error boundary (§11). Every read route fires its queries as ONE wave (§12).
//
// PR A + B (this file today): the shell, the health proof, the ships list and the briefing. READ-ONLY: nothing here
// sends an email or writes a crew-facing record. The request, the seafarer's upload page, the blind count and the
// gate arrive in the next PR (C), the reading of the files through HON in PR G.
import { AUDIT_HOST, isAuditHost, auditShellPath, contractLabel, normShip, iso } from "./audit.js";
import { AUDIT_HTML, AUDIT_MANIFEST, AUDIT_SW } from "./audit_ui.js";
import { installAuditRequest, isLive } from "./audit_request.js";
import { feedbackPlain, intelFallback, plainKey, rewritePlain } from "./audit_plain.js";
import { pickEngine, INTEL_MODEL_CLAUDE, INTEL_MODEL_WORKERSAI } from "./intelai.js";

export const AUDIT_VERSION = "2026-10-15.c8";

export const auditOpen = (env, host) => String((env && env.AUDIT_OPEN) || "").toLowerCase() === "true" && isAuditHost(host);

export function installAudit(deps) {
  const { json, htmlResponse, ensureAudit, rotationSections, crewProfile, TODAY } = deps;
  // PR C: the request, the seafarer's page, the reads, the count, the gate, the sweep (src/audit_request.js)
  const R = installAuditRequest(deps);

  async function health(env) {
    let tables = false, r2 = null, timecard = null;
    try { await ensureAudit(env); tables = true; } catch (e) { tables = String((e && e.message) || e).slice(0, 120); }
    const [r2r, tcr] = await Promise.all([
      env.AUDIT_FILES ? env.AUDIT_FILES.head("health/probe").then(() => "ok", (e) => "error: " + String((e && e.message) || e).slice(0, 80)) : Promise.resolve(null),
      env.TIMECARD_DB ? env.TIMECARD_DB.prepare("SELECT COUNT(*) AS n FROM ship_contact").first().then((r) => (r ? Number(r.n) : 0), () => "error") : Promise.resolve(null),
    ]);
    r2 = r2r; timecard = tcr;
    return json({
      ok: tables === true, version: AUDIT_VERSION, host: AUDIT_HOST,
      bindings: { AUDIT_FILES: !!env.AUDIT_FILES, TIMECARD_DB: !!env.TIMECARD_DB, MAILER: !!env.MAILER, HON: !!env.HON },
      live: isLive(env),
      tables, r2, shipContacts: timecard,
      recipients: String(env.AUDIT_TO || "").split(",").map((s) => s.trim()).filter(Boolean).length,
    });
  }

  // A1 · Ships: who is aboard every hull (the board's ONE schedule, §10d), and when each was last asked for an audit.
  async function ships(env, session) {
    await ensureAudit(env);
    const [board, reqs] = await Promise.all([
      rotationSections(env),
      env.DB.prepare("SELECT id, ship, agency_id, crew_name, status, created_at, sent_at, due_at, overdue_at, complete_at, test_mode FROM audit_request WHERE status != 'cancelled' ORDER BY created_at DESC").all().catch(() => ({ results: [] })),
    ]);
    const lastBy = {};
    for (const r of reqs.results || []) { const k = normShip(r.ship); if (!lastBy[k]) lastBy[k] = r; }
    const out = [];
    for (const s of (board && board.sections) || []) {
      const aboard = (s.crew || []).filter((c) => c && c.current && c.aboard && c.agency_id)
        .map((c) => ({ sc: c.agency_id, name: c.name, rank: c.rank || null, signOn: iso(c.signOn), signOff: iso(c.signOff), contract: contractLabel(c.contracts, true), heldByFile: !!c.heldByFile }));
      const seen = new Set();
      const uniq = aboard.filter((c) => (seen.has(c.sc) ? false : (seen.add(c.sc), true)));
      const last = lastBy[normShip(s.ship)] || null;
      out.push({ ship: s.ship, brand: s.brand || null, aboard: uniq, last: last ? { id: last.id, at: iso(last.created_at), status: last.status, crew: last.crew_name, sc: last.agency_id, due: last.due_at || null, overdue: !!last.overdue_at, test: !!last.test_mode } : null });
    }
    out.sort((a, b) => (b.aboard.length > 0) - (a.aboard.length > 0) || String(a.last ? a.last.at : "").localeCompare(String(b.last ? b.last.at : "")) || a.ship.localeCompare(b.ship));
    return json({ today: TODAY(), auditor: session.email, ships: out });
  }

  // A2 · The briefing: the crew profile the console already builds (ONE wave inside apiCrewOne) folded to what an
  // auditor reads before asking for documents, plus this crew's earlier audit requests. Nothing here is money: the
  // Score Card, the bonus count and the supervisor evaluation are not read.
  async function brief(env, url, session) {
    const sc = String(url.searchParams.get("sc") || "").trim();
    const ship = String(url.searchParams.get("ship") || "").trim();
    if (!sc) return json({ error: "sc_required" }, 400);
    await ensureAudit(env);
    const [prof, reqs] = await Promise.all([
      crewProfile(env, sc, session),
      env.DB.prepare("SELECT id, ship, status, created_at, sent_at, complete_at, due_at, auditor, test_mode FROM audit_request WHERE agency_id=? ORDER BY created_at DESC LIMIT 10").bind(sc).all().catch(() => ({ results: [] })),
    ]);
    if (!prof || prof.error) return json({ error: (prof && prof.error) || "not_found" }, 404);
    const P = prof.profile || {}, crew = prof.crew || {};
    const contracts = Array.isArray(P.contracts) ? P.contracts : [];
    const cur = contracts.find((c) => c.current) || null;
    const count = P.count || null;
    const completed = count && count.n != null ? count.n : null;
    const feed = ((P.people && P.people.feed) || []).filter((f) => f && !f.superseded).slice(0, 12).map((f) => ({
      at: iso(f.at), kind: f.kind, who: f.who || null, role: f.role || null, rating: f.rating != null ? f.rating : null,
      text: f.kind === "feedback" ? feedbackPlain(f.answers) : String(f.text || "").slice(0, 2000),
      full: f.kind === "intel" ? String(f.text || "") : null,
    }));
    await plainIntel(env, feed);
    return json({
      today: TODAY(), auditor: session.email,
      crew: { sc, name: [crew.first_name, crew.last_name].filter(Boolean).join(" ") || sc, position: (count && count.position) || crew.rank || null, email: crew.email || null },
      ship: ship || (cur && cur.ship) || null,
      contract: {
        label: contractLabel(completed, !!cur), source: count && count.asOf ? "TDG count as of " + count.asOf + (count.added ? " + " + count.added + " finished since" : "") : null,
        current: cur ? { ship: cur.ship, on: cur.on, off: cur.off, offSource: cur.offSource || null, day: cur.days, of: cur.plannedDays, held: !!cur.held } : null,
      },
      slots: (P.people && P.people.slots) || [],
      feed, checks: (P.checks || []).map((c) => c.text),
      audits: (reqs.results || []).map((r) => ({ id: r.id, ship: r.ship, status: r.status, at: iso(r.created_at), complete: iso(r.complete_at), due: r.due_at, by: r.auditor, test: !!r.test_mode })),
      open: ((reqs.results || []).find((r) => r.status === "sent" || r.status === "complete" || r.status === "draft") || {}).id || null,
    });
  }

  // Field intel in plain words (src/audit_plain.js): read the kept rewrites in one query, write the missing ones (at
  // most 4 per open, in parallel, each bounded), and fall back to the summary's own first sentence. The full report
  // stays on the item (`full`) for the "Full report" fold.
  async function plainIntel(env, feed) {
    const intel = feed.filter((f) => f.kind === "intel" && f.full);
    if (!intel.length) return;
    for (const f of intel) { f.h = await plainKey(f.full); f.text = intelFallback(f.full); f.plain = false; }
    const hs = [...new Set(intel.map((f) => f.h))];
    const got = await env.DB.prepare("SELECT h, text FROM audit_plain WHERE h IN (" + hs.map(() => "?").join(",") + ")").bind(...hs).all().then((r) => r.results || [], () => []);
    const kept = new Map(got.map((r) => [r.h, r.text]));
    const engine = pickEngine(env);
    const miss = hs.filter((h) => !kept.has(h)).slice(0, 4);
    await Promise.all(miss.map(async (h) => {
      const src = intel.find((f) => f.h === h).full;
      const t = await rewritePlain(env, src, { engine, claudeModel: INTEL_MODEL_CLAUDE, workersModel: INTEL_MODEL_WORKERSAI });
      if (!t) return;
      kept.set(h, t);
      await env.DB.prepare("INSERT OR IGNORE INTO audit_plain (h, text, engine, at) VALUES (?,?,?,?)").bind(h, t, engine, new Date().toISOString()).run().catch(() => {});
    }));
    for (const f of intel) { if (kept.has(f.h)) { f.text = kept.get(f.h); f.plain = true; } delete f.h; }
  }

  // Returns a Response, or null when the path is not the audit's.
  // OPEN MODE (Miguel, 15 Oct 2026: "remove the magic link for right now", then, offered the choice, "No login on the
  // audit site"). With AUDIT_OPEN = "true" the audit's own pages and routes on audit.cims.work answer without a sign-in,
  // as AUDIT_OPEN_AS (Dexter): every request and action is recorded under that address. Only this host: cims.work/audit
  // and the whole HR console keep their login. Remove the [vars] line to close it again.
  const handleAudit = async function handleAudit(p, request, env, url, session) {
    const host = url.hostname;
    if (!session && auditOpen(env, host)) {
      session = { email: String(env.AUDIT_OPEN_AS || "Dexter.Lawrence@dg3.com").trim(), open: true };
      if (p === "/api/me") return json({ email: session.email, open: true });
    }
    { const r = await R.handle(p, request, env, url, session); if (r) return r; }
    if (p === "/audit/manifest.webmanifest") {
      return new Response(AUDIT_MANIFEST(isAuditHost(host)), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
    }
    if (p === "/audit/sw.js") {
      return new Response(AUDIT_SW, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" } });
    }
    if (p.startsWith("/api/audit/")) {
      if (!session) return json({ error: "unauthorized" }, 401);
      if (p === "/api/audit/health") return health(env);
      if (p === "/api/audit/ships") return ships(env, session);
      if (p === "/api/audit/brief") return brief(env, url, session);
      return json({ error: "not found" }, 404);
    }
    if (request.method === "GET" && auditShellPath(host, p)) {
      if (!session) return Response.redirect(url.origin + "/login", 302);
      const page = htmlResponse(AUDIT_HTML);
      if (session.open) page.headers.set("X-Robots-Tag", "noindex, nofollow");
      return page;
    }
    return null;
  };
  handleAudit.sweep = (env) => R.sweep(env);
  return handleAudit;
}
