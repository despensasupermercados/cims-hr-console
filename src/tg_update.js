// src/tg_update.js
// -----------------------------------------------------------------------------
// "Update TG" — routes + IO. Pure logic lives in tg_collect.js.
//
// Rita finishes her Keyman updates, clicks one button, and Joy at TG gets a
// per-ship digest of everything that changed since the last send. AdvancedQuery
// stays the single source of truth; CIMS never writes to it.
//
// USAGE (src/worker.js): import { installTgUpdate } from "./tg_update.js";
//   inside the AUTHENTICATED /api/ block, after the session gate:
//   { const _t = await installTgUpdate({ json, htmlResponse, logActivity,
//       sendViaMailer, shipOf, brandFor })(url.pathname, request, env, url, session);
//     if (_t) return _t; }
//
// Env: TG_NOTIFY (recipient, no default — refuses to send unset, see below)
//      TG_NOTIFY_NAME (greeting name, default "Joy")
//      TG_FIRST_WINDOW_DAYS (first-ever send look-back, default 90)
//
// THREE THINGS THIS MODULE WILL NOT DO
//   1. Send when nothing changed. Miguel's rule: no updates, no email.
//   2. Send to a default address. A digest of crew movements going to a guessed
//      recipient is worse than not sending. TG_NOTIFY unset = hard error.
//   3. Write to crew, crew_override, contract_edit or assignment. It reads them.
//      The only table it writes is its own watermark.
// -----------------------------------------------------------------------------

import { collectChanges, renderTgEmail } from "./tg_collect.js";

export function installTgUpdate(deps) {
  const { json, htmlResponse, logActivity, sendViaMailer, shipOf, brandFor } = deps;

  const TEMPLATE_ID = "hr.tg.update-request.v1";

  async function ensureTg(env) {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS tg_update_run (" +
      " id TEXT PRIMARY KEY, sent_at TEXT NOT NULL, sent_by TEXT, recipient TEXT," +
      " window_from TEXT, ships INTEGER, crew INTEGER, items INTEGER, payload TEXT )"
    ).run();
  }

  function ymd(d) { return new Date(d).toISOString().slice(0, 10); }
  function daysAgoIso(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString(); }

  // Watermark: the last send. First ever run looks back TG_FIRST_WINDOW_DAYS so the
  // opening email carries the existing backlog rather than starting empty.
  async function watermark(env) {
    const r = await env.DB.prepare("SELECT MAX(sent_at) w FROM tg_update_run").first().catch(() => null);
    if (r && r.w) return { since: r.w, first: false };
    const n = Number(env.TG_FIRST_WINDOW_DAYS) || 90;
    return { since: daysAgoIso(n), first: true };
  }

  // One concurrent wave, not a sequential chain (perf invariant §12).
  async function gather(env, since) {
    const [ovRes, ceRes, asgRes, rdRes, logRes, crewRes] = await Promise.all([
      env.DB.prepare("SELECT agency_id, vessel_observed, status, rank_override, retired, updated_at FROM crew_override WHERE updated_at > ?").bind(since).all(),
      env.DB.prepare("SELECT sc, seq, ship, sign_on, sign_off, embark, disembark, eccr, air, hotel, updated_at FROM contract_edit WHERE updated_at > ?").bind(since).all(),
      env.DB.prepare(
        "SELECT c.agency_id AS agency_id, a.vessel_name, a.sign_on, a.planned_sign_off, a.updated_at" +
        "  FROM assignment a JOIN contract ct ON ct.id = a.contract_id JOIN crew c ON c.id = ct.crew_id" +
        " WHERE a.updated_at > ? AND a.actual_sign_off IS NULL").bind(since).all(),
      env.DB.prepare("SELECT agency_id, eccr, air, hotel, note, updated_at FROM crew_ready WHERE updated_at > ?").bind(since).all(),
      env.DB.prepare("SELECT action, detail, at FROM activity_log WHERE at > ? AND action IN ('crew_add','crew_hide','crew_restore','rotation_assign') ORDER BY at").bind(since).all(),
      env.DB.prepare("SELECT agency_id, first_name, last_name, status, vessel_observed, rank_observed, rank_override FROM crew WHERE redacted = 0").all(),
    ]);

    const crewById = {};
    for (const c of (crewRes.results || [])) {
      crewById[c.agency_id] = {
        name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.agency_id,
        rank: c.rank_override || c.rank_observed || "",
        status: c.status || null,
        vessel_observed: c.vessel_observed || null,
      };
    }

    // activity_log details: "SC-x -> Ship" for a drag, bare "SC-x" otherwise.
    const events = [];
    for (const l of (logRes.results || [])) {
      const d = String(l.detail || "");
      const sc = (d.match(/^(SC-\d+)/) || [])[1];
      if (!sc) continue;
      if (l.action === "rotation_assign") {
        const ship = (d.split("->")[1] || "").trim();
        if (ship && ship.toLowerCase() !== "pool") events.push({ agency_id: sc, kind: "move", ship, at: l.at });
      } else if (l.action === "crew_add") events.push({ agency_id: sc, kind: "add", at: l.at });
      else if (l.action === "crew_hide") events.push({ agency_id: sc, kind: "retire", at: l.at });
      // crew_restore is deliberately NOT reported: it undoes a hide. If both happened in
      // one window the net change is nothing, and telling Joy to un-retire someone she was
      // never told to retire is noise.
    }
    const restored = new Set((logRes.results || []).filter(l => l.action === "crew_restore")
      .map(l => (String(l.detail || "").match(/^(SC-\d+)/) || [])[1]).filter(Boolean));

    return {
      overrides: ovRes.results || [],
      contractEdits: ceRes.results || [],
      assignments: asgRes.results || [],
      ready: rdRes.results || [],
      events: events.filter(e => !(e.kind === "retire" && restored.has(e.agency_id))),
      crewById,
    };
  }

  async function build(env) {
    await ensureTg(env);
    const { since, first } = await watermark(env);
    const g = await gather(env, since);
    const payload = collectChanges({
      ...g,
      shipOf: v => (shipOf ? (shipOf(v) || v) : v),
      brandOf: s => (brandFor ? brandFor(s) : ""),
      windowFrom: since,
    });
    return { payload, since, first };
  }

  // GET /api/tg/pending — drives the button badge. Cheap, read-only.
  async function apiTgPending(env) {
    const { payload, since, first } = await build(env);
    return json({
      ok: true, since, first,
      counts: payload.counts,
      ships: payload.ships.map(s => ({ ship: s.ship, crew: s.crew.length })),
      recipient: env.TG_NOTIFY || null,
    });
  }

  // GET /api/tg/preview — the exact HTML that would be sent. Sign-off is on the
  // rendered email, never on a spec (cims-email-standard §5).
  async function apiTgPreview(env, session) {
    const { payload, since } = await build(env);
    return htmlResponse(renderTgEmail(payload, {
      sentBy: (session && session.email) || "CIMS Crew Operations",
      toName: env.TG_NOTIFY_NAME || "Joy",
      today: ymd(new Date()),
      windowFrom: since,
    }));
  }

  // POST /api/tg/send — collect, send, stamp the watermark.
  async function apiTgSend(request, env, session) {
    const { payload, since } = await build(env);

    // Rule: nothing changed, nothing sent.
    if (!payload.counts.items) return json({ ok: false, empty: true, since }, 200);

    const to = env.TG_NOTIFY;
    if (!to) return json({ error: "TG_NOTIFY not configured" }, 500);

    const id = "tg_" + crypto.randomUUID();
    const today = ymd(new Date());
    const html = renderTgEmail(payload, {
      sentBy: (session && session.email) || "CIMS Crew Operations",
      toName: env.TG_NOTIFY_NAME || "Joy",
      today, windowFrom: since,
    });
    const c = payload.counts;
    const out = await sendViaMailer(env, {
      templateId: TEMPLATE_ID,
      idempotencyKey: TEMPLATE_ID + ":" + id,
      to: [to],
      replyTo: (session && session.email) || undefined,
      subject: `AdvancedQuery update — ${c.ships} ship${c.ships === 1 ? "" : "s"}, ${c.crew} crew · ${today}`,
      html,
      critical: true, // a human is waiting on it (standard §4)
    });

    // Only stamp the watermark on a CONFIRMED send. Stamping on failure would silently
    // swallow every change in this window — they would never appear in a later email.
    if (!out || !out.ok) {
      await logActivity(env, session && session.email, "tg_update_failed", (out && (out.error || out.status)) || "unknown");
      return json({ ok: false, sent: false, error: (out && (out.error || out.status)) || "mailer_failed" }, 502);
    }

    await env.DB.prepare(
      "INSERT INTO tg_update_run (id, sent_at, sent_by, recipient, window_from, ships, crew, items, payload) VALUES (?,?,?,?,?,?,?,?,?)"
    ).bind(id, new Date().toISOString(), (session && session.email) || null, to, since,
      c.ships, c.crew, c.items, JSON.stringify(payload)).run();

    await logActivity(env, session && session.email, "tg_update_sent",
      c.ships + " ships / " + c.crew + " crew / " + c.items + " changes");

    return json({ ok: true, sent: true, id, to, counts: c });
  }

  // Router — returns a Response or null, mirroring relief_api.handleRelief.
  return async function (p, request, env, url, session) {
    if (p === "/api/tg/pending") return apiTgPending(env);
    if (p === "/api/tg/preview") return apiTgPreview(env, session);
    if (p === "/api/tg/send" && request.method === "POST") return apiTgSend(request, env, session);
    return null;
  };
}
