// PRINTSHOP AUDIT — PR C: the request, the seafarer's upload page, the reads, the blind count, the gate, the sweep.
// (14 Oct 2026; docs/AUDIT_BUILD_PLAN.md §3, the approved mock-up A3–A8.)
//
// Miguel's rules this file keeps:
//   - "without that completion, I don't want him to start the audit": the gate (audit.js gateState) opens only when
//     every press has Pattern 43 and the MACHINE Management List read by HON (or is down with a reason) and every OBP
//     line is counted. There is no override.
//   - "display the ship email only .. his personal email gets a copy": addressFor.
//   - "dont show him what is on hand .. allow him to count blind": the crew's state carries blindLines only; the on-hand
//     stays on the server (lines_json) for the diff the team reads.
//   - "remember the reading of the files is important": every upload is read by HON's own readers (AuditReader) the
//     moment it lands, on the crew's page, so a wrong document is caught while he is still at the press.
//
// TEST MODE until Miguel signs off the rendered emails (CIMS email standard §5): with AUDIT_LIVE unset every email goes
// to the auditor alone and says [TEST]; nothing reaches a ship. AUDIT_LIVE = "true" in wrangler.toml switches it on.
// Nothing here is money (§1); no table of another app is written.
import { aboardNow, addressFor, blindLines, parseCount, countCompleteness, countDiff, checkUpload, gateState, plusHours, REQUEST_HOURS, REMIND_HOURS, normShip, safeName, contractLabel, auditScore, gradeProblems } from "./audit.js";
import { p43ReadState, mmlReadState, coverFor } from "./audit_read.js";
import { auditRequestEmail, TEMPLATE_ID as REQ_ID, REMINDER_ID } from "./emails/hr.audit.request.v1.js";
import { docsInEmail, TEMPLATE_ID as DOCS_ID } from "./emails/hr.audit.docsin.v1.js";
import { overdueEmail, TEMPLATE_ID as OVERDUE_ID } from "./emails/hr.audit.overdue.v1.js";
import { auditUploadHtml, auditClosedHtml } from "./audit_upload_ui.js";

export const LINK_DAYS = 14;
export const RESEND_MIN = 15;             // a request is not re-sent sooner than this              // the upload page stays open this long after the request
const READ_SWEEP_MAX = 3;
export const READ_TRIES = 3;              // a read that fails this many times is "send it again", never "Reading…" for ever
export const AUTO_SUBMIT_HOURS = 6;       // everything in, nobody tapped Send: the sweep sends it after this long idle
const DOCSIN_RETRY_DAYS = 3;              // a documents-in email that did not go is retried this long                 // reads retried per hourly run (each is a HON call; a Management List is a vision read)
const csv = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const now = () => new Date().toISOString();
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
async function sha256hex(s) { const b = await crypto.subtle.digest("SHA-256", typeof s === "string" ? new TextEncoder().encode(s) : s); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
function newToken() { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export const isLive = (env) => String(env.AUDIT_LIVE || "").toLowerCase() === "true";

export function installAuditRequest(deps) {
  const { json, htmlResponse, ensureAudit, sendViaMailer, logActivity, applyOverride, rotationSections } = deps;

  async function hon(env, method, ...args) {
    if (!env.HON || typeof env.HON[method] !== "function") return null;
    try { return await env.HON[method](...args); } catch (e) { console.error("audit_hon_" + method, (e && e.message) || e); return null; }
  }
  async function crewOf(env, sc) {
    const [c, o] = await Promise.all([
      env.DB.prepare("SELECT agency_id, first_name, last_name, email FROM crew WHERE agency_id=?").bind(sc).first().catch(() => null),
      env.DB.prepare("SELECT * FROM crew_override WHERE agency_id=?").bind(sc).first().catch(() => null),
    ]);
    if (!c) return null;
    const m = applyOverride(c, o);
    return { sc, first: m.first_name || "", name: [m.first_name, m.last_name].filter(Boolean).join(" ") || sc, email: m.email || null };
  }
  async function contacts(env) {
    if (!env.TIMECARD_DB) return [];
    const r = await env.TIMECARD_DB.prepare("SELECT client, ship, code, email, role FROM ship_contact").all().catch(() => ({ results: [] }));
    return r.results || [];
  }
  const origin = (url) => url.origin;
  const linkFor = (url, token) => origin(url) + "/audit/u/" + token;

  async function uploadsOf(env, rid) {
    const r = await env.DB.prepare("SELECT id, serial, kind, filename, bytes, at, read_state, read_json, read_at, superseded_at FROM audit_upload WHERE request_id=? ORDER BY at").bind(rid).all();
    return (r.results || []).map((u) => Object.assign({}, u, { read: J(u.read_json, null) }));
  }
  async function stateOf(env, req) {
    const [ups, cnt, extra, down] = await Promise.all([
      uploadsOf(env, req.id),
      env.DB.prepare("SELECT part_no, counted, at FROM audit_count WHERE request_id=?").bind(req.id).all(),
      env.DB.prepare("SELECT id, text, counted, at FROM audit_count_extra WHERE request_id=? ORDER BY at").bind(req.id).all(),
      env.DB.prepare("SELECT serial, reason, at FROM audit_down WHERE request_id=?").bind(req.id).all(),
    ]);
    const machines = J(req.machines_json, []), obpLines = J(req.lines_json, { lines: [] }).lines || [];
    const lines = blindLines(obpLines);
    const counted = {}; for (const c of cnt.results || []) counted[c.part_no] = c.counted;
    const gate = gateState({ request: req, machines, uploads: ups, down: down.results || [], lines, counted });
    const lastAt = [...(cnt.results || []), ...(extra.results || []), ...(down.results || []), ...ups].map((x) => String((x && (x.read_at || x.at)) || "")).sort().pop() || null;
    return { machines, lines, obpLines, counted, extras: extra.results || [], down: down.results || [], uploads: ups, gate, lastAt };
  }
  // The newest live file per machine and kind, with what the crew is told about it.
  function slot(ups, serial, kind) {
    const u = ups.filter((x) => x.serial === serial && x.kind === kind && !x.superseded_at).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    return u ? { id: u.id, filename: u.filename, at: u.at, read_state: u.read_state, say: (u.read && u.read.say) || (u.read_state === "pending" ? "Reading…" : "") } : null;
  }

  /* ---------------------------------- Dexter (session) ---------------------------------- */
  async function preview(env, url, session) {
    const ship = String(url.searchParams.get("ship") || ""), sc = String(url.searchParams.get("sc") || "");
    if (!ship || !sc) return json({ error: "ship_and_sc_required" }, 400);
    await ensureAudit(env);
    if (session.open && !(await aboardHere(env, ship, sc))) return json({ ok: false, error: "not_aboard", detail: "The board does not have this seafarer aboard " + ship + "." }, 422);
    const [crew, cts, H, open] = await Promise.all([
      crewOf(env, sc), contacts(env), hon(env, "ship", ship),
      env.DB.prepare("SELECT r.id, r.status, r.sent_at, r.due_at FROM audit_request r LEFT JOIN audit_eval e ON e.request_id = r.id WHERE r.agency_id=? AND (r.status IN ('draft','sent') OR (r.status = 'complete' AND e.request_id IS NULL AND r.test_mode = 0)) ORDER BY r.created_at DESC LIMIT 1").bind(sc).first(),
    ]);
    if (!crew) return json({ error: "crew_not_found" }, 404);
    const addr = addressFor({ contacts: cts, ship, personal: crew.email });
    const live = isLive(env);
    return json({
      ship, crew: { sc, name: crew.name }, live, auditor: session.email,
      to: live ? addr.to : [session.email], cc: live && !session.open ? addr.cc : [], shown: addr.shown, noPersonal: !!addr.noPersonal, blocked: addr.ok ? null : addr.reason,
      machines: H && H.ok ? H.presses : null, lines: H && H.ok && H.obp ? blindLines(H.obp.lines).length : null, obpAsOf: H && H.obp ? H.obp.asOf : null,
      hon: !!(H && H.ok), honError: H && !H.ok ? H.error : (H ? null : "HON did not answer"),
      dueAt: plusHours(now(), REQUEST_HOURS), open: open || null,
    });
  }

  async function create(request, env, url, session) {
    const b = await request.json().catch(() => ({}));
    const ship = String(b.ship || "").trim(), sc = String(b.sc || "").trim();
    if (!ship || !sc) return json({ error: "ship_and_sc_required" }, 400);
    await ensureAudit(env);
    const open = await env.DB.prepare("SELECT id FROM audit_request WHERE agency_id=? AND normalized_ship=? AND status IN ('draft','sent') LIMIT 1").bind(sc, normShip(ship)).first().catch(() => null);
    if (open) return json({ ok: false, error: "already_open", id: open.id }, 409);
    // OPEN MODE asks only a seafarer the board has aboard THAT ship: no request for any id to any ship's mailbox
    if (session.open && !(await aboardHere(env, ship, sc))) return json({ ok: false, error: "not_aboard", detail: "The board does not have this seafarer aboard " + ship + "." }, 422);
    const [crew, cts, H] = await Promise.all([crewOf(env, sc), contacts(env), hon(env, "ship", ship)]);
    if (!crew) return json({ error: "crew_not_found" }, 404);
    if (!H || !H.ok) return json({ ok: false, error: "hon_unavailable", detail: (H && H.error) || "HON did not answer: the presses and the OBP list come from it" }, 503);
    if (!H.presses || !H.presses.length) return json({ ok: false, error: "no_presses", detail: "HON's register has no press for " + ship }, 422);
    const addr = addressFor({ contacts: cts, ship, personal: crew.email });
    const live = isLive(env);
    if (live && !addr.ok) return json({ ok: false, error: addr.reason, detail: "No printshop mailbox for " + ship + " in the timecard's ship contacts." }, 422);
    const lines = (H.obp && H.obp.lines) || [];
    // no OBP list = no blind count: the gate would open on the files alone and the email would say the count agrees
    if (!blindLines(lines).length) return json({ ok: false, error: "no_obp_list", detail: "HON has no OBP stock list for " + ship + (H.obp && H.obp.asOf ? " (as of " + H.obp.asOf + ")" : "") + ", so there is nothing to count." }, 422);
    const id = "ar_" + crypto.randomUUID(), token = newToken(), at = now(), due = plusHours(at, REQUEST_HOURS);
    try {
      await env.DB.prepare("INSERT INTO audit_request (id, ship, normalized_ship, agency_id, crew_name, contract_label, auditor, to_ship, cc_personal, token_hash, status, test_mode, machines_json, lines_json, created_at, due_at) VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)")
      .bind(id, H.ship || ship, normShip(ship), sc, crew.name, b.contract || null, session.email, addr.shown || null, (addr.cc || [])[0] || null, await sha256hex(token), live ? 0 : 1,
        JSON.stringify(H.presses), JSON.stringify({ asOf: H.obp ? H.obp.asOf : null, lines, intransit: (H.obp && H.obp.intransit) || [] }), at, due).run();
    } catch (e) {
      // the unique open-request index: a second tap, or a second visitor, while the first request is being made
      if (/UNIQUE/i.test(String((e && e.message) || e))) {
        const o = await env.DB.prepare("SELECT id FROM audit_request WHERE agency_id=? AND normalized_ship=? AND status IN ('draft','sent') LIMIT 1").bind(sc, normShip(ship)).first().catch(() => null);
        return json({ ok: false, error: "already_open", id: o ? o.id : null }, 409);
      }
      throw e;
    }
    const sent = await sendRequest(env, { id, ship: H.ship || ship, crew, auditor: session.email, dueAt: due, link: linkFor(url, token), machines: H.presses, lines: blindLines(lines).length, addr, live, reminder: false });
    if (!sent.ok) {
      // the email did not go: the draft is closed, so "try again" makes a new request (it used to block this crew and
      // ship for good — create said already_open, resend and cancel said not_open)
      await env.DB.prepare("UPDATE audit_request SET status='cancelled', cancelled_at=?, cancelled_by=? WHERE id=? AND status='draft'").bind(now(), "system: the request email did not go", id).run();
      return json({ ok: false, error: "not_sent", detail: sent.error, id }, 502);
    }
    await env.DB.prepare("UPDATE audit_request SET status='sent', sent_at=? WHERE id=? AND status='draft'").bind(now(), id).run();
    await logActivity(env, session.email, "audit_request", id + " " + sc + " " + ship + (live ? "" : " (test)"));
    return json({ ok: true, id, live, to: sent.to });
  }

  async function sendRequest(env, { id, ship, crew, auditor, dueAt, link, machines, lines, addr, live, reminder }) {
    const mail = auditRequestEmail({ first: crew.first || String(crew.name || "").split(" ")[0], ship, auditor: nameOf(auditor), dueAt, link, machines, lines, reminder, test: !live });
    const to = live ? addr.to : [auditor];
    const cc = live ? [...(addr.cc || []), ...csv(env.AUDIT_REQUEST_CC)] : [];
    const r = await sendViaMailer(env, { templateId: reminder ? REMINDER_ID : REQ_ID, to, cc, replyTo: live ? (csv(env.AUDIT_REQUEST_CC)[0] || auditor) : auditor, subject: mail.subject, html: mail.html, text: mail.text, critical: true });
    const ok = !!(r && r.ok !== false);
    await env.DB.prepare("INSERT OR REPLACE INTO audit_send_log (request_id, kind, sent_at, to_json, ok, note) VALUES (?,?,?,?,?,?)")
      .bind(id, reminder ? (ok ? "remind" : "remind_failed:" + now()) : "request:" + now(), now(), JSON.stringify({ to, cc }), ok ? 1 : 0, ok ? null : String((r && r.error) || "send failed").slice(0, 200)).run().catch(() => null);
    return { ok, to, error: r && r.error };
  }

  async function detail(env, url, session) {
    const id = String(url.searchParams.get("id") || "");
    await ensureAudit(env);
    const req = await env.DB.prepare("SELECT * FROM audit_request WHERE id=?").bind(id).first();
    if (!req) return json({ error: "not_found" }, 404);
    const s = await stateOf(env, req);
    const downBy = {}; for (const d of s.down) downBy[d.serial] = d.reason;
    const done = countCompleteness(s.lines, s.counted);
    const ev = await env.DB.prepare("SELECT * FROM audit_eval WHERE request_id=?").bind(req.id).first().catch(() => null);
    return json({
      grade: ev ? { inventory: ev.r_inventory, technical: ev.r_technical, collaterals: ev.r_collaterals, overall: ev.r_overall, score: ev.score, from: ev.score_from, note: ev.note, by: ev.filed_by, at: ev.filed_at } : null,
      id: req.id, ship: req.ship, sc: req.agency_id, crew: req.crew_name, status: req.status, test: !!req.test_mode, auditor: req.auditor,
      to: req.to_ship, cc: session && session.open ? null : req.cc_personal, sentAt: req.sent_at, dueAt: req.due_at, completeAt: req.complete_at, overdueAt: req.overdue_at,
      machines: s.machines.map((m) => ({ serial: m.serial, label: m.label || m.serial, model: m.model || null, down: downBy[m.serial] || null, p43: slot(s.uploads, m.serial, "p43"), mgmt: slot(s.uploads, m.serial, "mgmt") })),
      count: { total: done.total, done: done.done }, extras: s.extras.length, gate: s.gate,
    });
  }

  // Dexter's grade (Miguel, 15 Oct 2026). Only on a request whose documents are in (the gate: "without that completion,
  // I don't want him to start the audit"); filed ONCE — the visit and its grade go in one batch and are never rewritten.
  async function grade(request, env, session) {
    const b = await request.json().catch(() => ({}));
    await ensureAudit(env);
    const req = await env.DB.prepare("SELECT * FROM audit_request WHERE id=?").bind(String(b.id || "")).first();
    if (!req) return json({ error: "not_found" }, 404);
    if (req.status !== "complete") return json({ ok: false, error: "not_complete" }, 409);
    // a TEST request (emails to the auditor alone) is a rehearsal: its grade would reach a real seafarer's Score Card
    if (req.test_mode) return json({ ok: false, error: "test_request", detail: "A test request is a rehearsal and cannot be graded." }, 409);
    const r = { inventory: b.inventory, technical: b.technical, collaterals: b.collaterals, overall: b.overall === "" ? null : b.overall, note: b.note };
    const bad = gradeProblems(r);
    if (bad.length) return json({ ok: false, error: "invalid", fields: bad }, 400);
    const sc = auditScore(r), at = now(), vid = "av_" + crypto.randomUUID();
    // filed on the open site (no sign-in, 15 Oct 2026) says so on the record the Score Card reads
    const by = session.open ? session.email + " (open site, no sign-in)" : session.email;
    const note = String(r.note || "").trim().slice(0, 2000) || null;
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO audit_visit (id, request_id, ship, agency_id, auditor, status, opened_at, filed_at) VALUES (?,?,?,?,?,'filed',?,?)").bind(vid, req.id, req.ship, req.agency_id, by, at, at),
        env.DB.prepare("INSERT INTO audit_eval (visit_id, request_id, agency_id, ship, r_inventory, r_technical, r_collaterals, r_overall, score, score_from, note, filed_by, filed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(vid, req.id, req.agency_id, req.ship, Number(r.inventory), Number(r.technical), Number(r.collaterals), r.overall == null ? null : Number(r.overall), sc.score, sc.from, note, by, at),
      ]);
    } catch (e) {
      if (/UNIQUE/i.test(String((e && e.message) || e))) return json({ ok: false, error: "already_filed" }, 409);
      throw e;
    }
    await logActivity(env, session.email, "audit_grade", req.id + " " + sc.score + (session.open ? " (open site)" : ""));
    return json({ ok: true, score: sc.score, from: sc.from });
  }

  async function act(request, env, url, session, what) {
    const b = await request.json().catch(() => ({}));
    await ensureAudit(env);
    const req = await env.DB.prepare("SELECT * FROM audit_request WHERE id=?").bind(String(b.id || "")).first();
    if (!req) return json({ error: "not_found" }, 404);
    if (req.status !== "sent") return json({ error: "not_open", status: req.status }, 409);
    if (what === "cancel") {
      await env.DB.prepare("UPDATE audit_request SET status='cancelled', cancelled_at=?, cancelled_by=? WHERE id=? AND status='sent'").bind(now(), session.email, req.id).run();
      await logActivity(env, session.email, "audit_request_cancel", req.id);
      return json({ ok: true });
    }
    if (what === "extend") {
      const due = plusHours(req.due_at > now() ? req.due_at : now(), REQUEST_HOURS);
      await env.DB.prepare("UPDATE audit_request SET due_at=?, overdue_at=NULL WHERE id=?").bind(due, req.id).run();
      await logActivity(env, session.email, "audit_request_extend", req.id + " " + due);
      return json({ ok: true, dueAt: due });
    }
    // resend: a fresh link (the one the crew holds keeps working), the same deadline. Not twice in RESEND_MIN: each one breaks the
    // link the crew already holds and emails the ship, Rolando and Ray again (a double tap, or anyone on the open site).
    const last = await env.DB.prepare("SELECT MAX(sent_at) AS at FROM audit_send_log WHERE request_id=? AND kind LIKE 'request%'").bind(req.id).first().catch(() => null);
    if (last && last.at && Date.now() - Date.parse(last.at) < RESEND_MIN * 60000) return json({ ok: false, error: "too_soon", detail: "The request went less than " + RESEND_MIN + " minutes ago." }, 429);
    const [crew, cts] = await Promise.all([crewOf(env, req.agency_id), contacts(env)]);
    const token = newToken();
    const lines = J(req.lines_json, { lines: [] }).lines || [];
    const sent = await sendRequest(env, { id: req.id, ship: req.ship, crew: crew || { name: req.crew_name }, auditor: req.auditor, dueAt: req.due_at, link: linkFor(url, token), machines: J(req.machines_json, []), lines: blindLines(lines).length, addr: addressFor({ contacts: cts, ship: req.ship, personal: crew && crew.email }), live: !req.test_mode, reminder: false });
    if (sent.ok) await addLink(env, req, token);
    await logActivity(env, session.email, "audit_request_resend", req.id + (sent.ok ? "" : " (not sent)"));
    return json({ ok: sent.ok, to: sent.to, error: sent.ok ? null : sent.error });
  }

  /* ---------------------------------- the seafarer (token) ---------------------------------- */
  async function byToken(env, token) {
    if (!token || token.length < 16 || token.length > 64) return null;
    await ensureAudit(env);
    const h = await sha256hex(token);
    // the request's newest link, or any earlier one it was sent with (audit_token); link_at = the newest link's date
    return env.DB.prepare("SELECT r.*, (SELECT MAX(t.at) FROM audit_token t WHERE t.request_id = r.id) AS link_at FROM audit_request r WHERE r.token_hash=? OR r.id = (SELECT request_id FROM audit_token WHERE token_hash=?)").bind(h, h).first();
  }
  // A link closes LINK_DAYS after the newest of: the first send, the latest resend / reminder, the deadline (an extend
  // moves it). It used to count from the first send only, so a resend after day 14 emailed a link that opened "expired".
  const linkBase = (req) => Math.max(...[req.sent_at, req.link_at, req.due_at].map((v) => (v ? Date.parse(v) : NaN)).filter((n) => !isNaN(n)), 0);
  const closedWhy = (req) => !req ? "unknown" : req.status === "cancelled" ? "cancelled" : (linkBase(req) && Date.now() - linkBase(req) > LINK_DAYS * 864e5) ? "expired" : null;
  // a new link is added only AFTER its email went: the one the crew holds is kept (audit_token), so a reminder at hour 12
  // never cuts off a page that is open mid-upload, and a failed send changes nothing
  async function addLink(env, req, token) {
    const at = now();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO audit_token (token_hash, request_id, at) VALUES (?,?,?)").bind(req.token_hash, req.id, req.sent_at || req.created_at || at),
      env.DB.prepare("INSERT OR IGNORE INTO audit_token (token_hash, request_id, at) VALUES (?,?,?)").bind(await sha256hex(token), req.id, at),
      env.DB.prepare("UPDATE audit_request SET token_hash=? WHERE id=?").bind(await sha256hex(token), req.id),
    ]);
  }
  // OPEN MODE: only a seafarer the board has aboard THAT ship (the briefing's rule) — for asking AND for looking up
  async function aboardHere(env, ship, sc) {
    if (!rotationSections) return true;
    const board = await rotationSections(env).catch(() => null);
    const sec = ((board && board.sections) || []).find((x) => normShip(x.ship) === normShip(ship));
    return !!(sec && (sec.crew || []).some((c) => aboardNow(c) && c.agency_id === sc));
  }

  async function crewState(env, req) {
    const s = await stateOf(env, req);
    const downBy = {}; for (const d of s.down) downBy[d.serial] = d.reason;
    // THE BLIND SHEET: part number, description, category, his own number. Never OBP's on-hand (pinned by test).
    return {
      ship: req.ship, crew: req.crew_name, auditor: nameOf(req.auditor), dueAt: req.due_at, status: req.status, test: !!req.test_mode,
      machines: s.machines.map((m) => ({ serial: m.serial, label: m.label || m.serial, model: m.model || null, down: downBy[m.serial] || null, p43: slot(s.uploads, m.serial, "p43"), mgmt: slot(s.uploads, m.serial, "mgmt") })),
      lines: s.lines, counted: s.counted, extras: s.extras.map((x) => ({ id: x.id, text: x.text, counted: x.counted })), gate: { open: s.gate.open, missing: s.gate.missing.map((m) => m.say) },
    };
  }

  async function upload(request, env, url, req) {
    const serial = String(url.searchParams.get("serial") || ""), kind = String(url.searchParams.get("kind") || "");
    const machines = J(req.machines_json, []);
    if (!machines.some((m) => m.serial === serial)) return json({ ok: false, error: "unknown_machine" }, 400);
    if (kind !== "p43" && kind !== "mgmt") return json({ ok: false, error: "unknown_kind" }, 400);
    // the page sends the name URI-encoded: a header carries Latin-1 only, and "Dexter’s scan.pdf" threw in the browser
    const rawName = request.headers.get("x-file-name") || "";
    let name = rawName; try { name = decodeURIComponent(rawName); } catch (e) { name = rawName; }
    const type = request.headers.get("content-type") || "";
    const size = Number(request.headers.get("content-length") || 0);
    const pre = checkUpload({ kind, type, size: size || 1, name });
    if (!pre.ok) return json({ ok: false, error: pre.reason, say: pre.say }, 400);
    const buf = await request.arrayBuffer();
    const chk = checkUpload({ kind, type, size: buf.byteLength, name });
    if (!chk.ok) return json({ ok: false, error: chk.reason, say: chk.say }, 400);
    if (!env.AUDIT_FILES) return json({ ok: false, error: "no_bucket", say: "The file store is not available. Try again later." }, 503);
    const hash = await sha256hex(buf);
    const key = "req/" + req.id + "/" + serial + "/" + kind + "/" + hash;
    await env.AUDIT_FILES.put(key, buf, { httpMetadata: { contentType: chk.type }, customMetadata: { filename: safeName(name), request: req.id } });
    const head = await env.AUDIT_FILES.head(key).catch(() => null); // the PUT is not the proof (HON's rule)
    if (!head || !head.size) return json({ ok: false, error: "not_stored", say: "The file did not store. Send it again." }, 502);
    const id = "au_" + crypto.randomUUID(), at = now();
    await env.DB.batch([
      env.DB.prepare("UPDATE audit_upload SET superseded_at=? WHERE request_id=? AND serial=? AND kind=? AND superseded_at IS NULL").bind(at, req.id, serial, kind),
      env.DB.prepare("INSERT INTO audit_upload (id, request_id, serial, kind, r2_key, filename, content_type, bytes, at, read_state) VALUES (?,?,?,?,?,?,?,?,?,'pending')").bind(id, req.id, serial, kind, key, safeName(name), chk.type, buf.byteLength, at),
    ]);
    return json({ ok: true, id });
  }

  // Read one upload through HON and store what it said. Called by the crew's page right after the upload, and by the
  // hourly sweep for a read that did not finish.
  async function readUpload(env, req, uploadId) {
    const u = await env.DB.prepare("SELECT * FROM audit_upload WHERE id=? AND request_id=?").bind(uploadId, req.id).first();
    if (!u) return { ok: false, error: "not_found" };
    if (u.read_state === "ok" || u.read_state === "wrong_doc" || u.read_state === "unreadable") return { ok: true, read_state: u.read_state, say: (J(u.read_json, {}) || {}).say };
    const obj = env.AUDIT_FILES ? await env.AUDIT_FILES.get(u.r2_key) : null;
    let res = null, st;
    if (!obj) st = { read_state: "failed", say: "The file was not found in the store. It will try again within the hour." };
    else {
      const bytes = new Uint8Array(await obj.arrayBuffer());
      res = u.kind === "p43" ? await hon(env, "pattern43", bytes) : await hon(env, "managementList", bytes, u.content_type || "application/pdf");
      st = u.kind === "p43" ? p43ReadState(res) : mmlReadState(res);
    }
    // a read that keeps failing (a file HON always times out on) becomes "send it again" after READ_TRIES, so the
    // machine is never frozen at "Reading…" and the sweep's few reads an hour are not spent on the same three files
    const tries = st.read_state === "failed" ? Number((J(u.read_json, {}) || {}).tries || 0) + 1 : 0;
    if (st.read_state === "failed" && tries >= READ_TRIES) st = { read_state: "unreadable", say: "The reader could not read this file after " + tries + " tries. Send it again; if it keeps failing, tell Onboard Support." };
    await env.DB.prepare("UPDATE audit_upload SET read_state=?, read_json=?, read_at=?, read_version=? WHERE id=?")
      .bind(st.read_state, JSON.stringify({ say: st.say, summary: st.summary || null, tries: tries || undefined }), now(), (res && res.version) || null, u.id).run();
    return { ok: true, read_state: st.read_state, say: st.say };
  }

  // The gate. Complete (once — the UPDATE is the lock), then the documents-in email. Called when the crew taps Send
  // (submit) or by the sweep — never on the last keystroke: a "12" typed with a pause after the "1" filed 1 and the page
  // then refused the correction (16 Oct 2026 review).
  async function maybeComplete(env, rid) {
    const req = await env.DB.prepare("SELECT * FROM audit_request WHERE id=?").bind(rid).first();
    if (!req || req.status !== "sent") return false;
    const s = await stateOf(env, req);
    if (!s.gate.open) return false;
    const at = now();
    const r = await env.DB.prepare("UPDATE audit_request SET status='complete', complete_at=? WHERE id=? AND status='sent'").bind(at, rid).run();
    if (!r || !r.meta || !r.meta.changes) return false;
    await logActivity(env, null, "audit_request_complete", rid);
    await sendDocsIn(env, Object.assign({}, req, { status: "complete", complete_at: at }), s);
    return true;
  }

  async function sendDocsIn(env, req, s) {
    const snap = J(req.lines_json, { lines: [], intransit: [] });
    const H = await hon(env, "ship", req.ship); // OBP the day the count is in; the request's snapshot if HON is away
    const lines = (H && H.ok && H.obp && H.obp.lines) || snap.lines || [];
    const intransit = (H && H.ok && H.obp && H.obp.intransit) || snap.intransit || [];
    const downBy = {}; for (const d of s.down) downBy[d.serial] = d.reason;
    const machines = s.machines.map((m) => {
      const read = (kind) => { const u = s.uploads.filter((x) => x.serial === m.serial && x.kind === kind && !x.superseded_at).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]; return u && u.read ? u.read.summary : null; };
      const p43 = read("p43"), mml = read("mgmt");
      if (mml && mml.lifeOver) mml.lifeOver = mml.lifeOver.map((x) => Object.assign({}, x, { cover: coverFor(x.partNo, lines, intransit) }));
      return { serial: m.serial, label: m.label || m.serial, model: m.model || null, down: downBy[m.serial] || null, p43, mml };
    });
    const diff = countDiff(lines, s.counted, String(req.complete_at || now()).slice(0, 10));
    const mail = docsInEmail({ ship: req.ship, crew: req.crew_name, auditor: nameOf(req.auditor), completeAt: req.complete_at, machines, count: { total: s.lines.length, diff, extras: s.extras }, obpAsOf: (H && H.obp && H.obp.asOf) || snap.asOf, test: !!req.test_mode });
    const to = req.test_mode ? [req.auditor] : csv(env.AUDIT_TO);
    if (!to.length) { await logActivity(env, null, "audit_docsin_no_recipient", req.id); return { ok: false, error: "no_recipient" }; }
    const r = await sendViaMailer(env, { templateId: DOCS_ID, to, cc: req.test_mode ? [] : [req.auditor], subject: mail.subject, html: mail.html, text: mail.text, critical: true });
    // a failed send is recorded and REPLACED by the retry's row; a sent one is never overwritten
    await env.DB.prepare("INSERT INTO audit_send_log (request_id, kind, sent_at, to_json, ok, note) VALUES (?,?,?,?,?,?) ON CONFLICT(request_id, kind) DO UPDATE SET sent_at=excluded.sent_at, to_json=excluded.to_json, ok=excluded.ok, note=excluded.note WHERE audit_send_log.ok = 0")
      .bind(req.id, "docsin", now(), JSON.stringify({ to }), r && r.ok !== false ? 1 : 0, r && r.ok === false ? String(r.error || "").slice(0, 200) : null).run().catch(() => null);
    return r;
  }

  async function saveCount(request, env, req) {
    const b = await request.json().catch(() => ({}));
    const lines = blindLines(J(req.lines_json, { lines: [] }).lines || []);
    const known = new Set(lines.map((l) => l.part_no));
    const at = now(), stmts = [];
    for (const [part, v] of Object.entries(b.counts || {})) {
      if (!known.has(part)) continue;
      const n = parseCount(v);
      if (n == null) stmts.push(env.DB.prepare("DELETE FROM audit_count WHERE request_id=? AND part_no=?").bind(req.id, part));
      else stmts.push(env.DB.prepare("INSERT INTO audit_count (request_id, part_no, counted, at) VALUES (?,?,?,?) ON CONFLICT(request_id, part_no) DO UPDATE SET counted=excluded.counted, at=excluded.at").bind(req.id, part, n, at));
    }
    for (const x of (Array.isArray(b.extras) ? b.extras : []).slice(0, 40)) {
      const text = String((x && x.text) || "").trim().slice(0, 120);
      if (x && x.remove && x.id) { stmts.push(env.DB.prepare("DELETE FROM audit_count_extra WHERE id=? AND request_id=?").bind(String(x.id), req.id)); continue; }
      if (!text) continue;
      stmts.push(env.DB.prepare("INSERT INTO audit_count_extra (id, request_id, text, counted, at) VALUES (?,?,?,?,?)").bind("ax_" + crypto.randomUUID(), req.id, text, parseCount(x.counted), at));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, saved: stmts.length });
  }

  async function saveDown(request, env, req) {
    const b = await request.json().catch(() => ({}));
    const serial = String(b.serial || "");
    if (!J(req.machines_json, []).some((m) => m.serial === serial)) return json({ ok: false, error: "unknown_machine" }, 400);
    if (b.down === false) { await env.DB.prepare("DELETE FROM audit_down WHERE request_id=? AND serial=?").bind(req.id, serial).run(); return json({ ok: true }); }
    const reason = String(b.reason || "").trim().slice(0, 400);
    if (!reason) return json({ ok: false, error: "reason_required", say: "Write why the machine is down." }, 400); // Miguel, HON 30 Sep: force a reason
    await env.DB.prepare("INSERT INTO audit_down (request_id, serial, reason, at) VALUES (?,?,?,?) ON CONFLICT(request_id, serial) DO UPDATE SET reason=excluded.reason, at=excluded.at").bind(req.id, serial, reason, now()).run();
    return json({ ok: true });
  }

  // The crew taps "Send to <auditor>" once everything is in: the request completes and the team is told.
  async function submit(env, req) {
    const s = await stateOf(env, req);
    if (!s.gate.open) return json({ ok: false, error: "not_ready", say: s.gate.missing.map((m) => m.say).join(" · ") }, 409);
    await maybeComplete(env, req.id);
    return json({ ok: true });
  }

  /* ---------------------------------- the hourly sweep ---------------------------------- */
  async function sweep(env, origin = "https://audit.cims.work") {
    await ensureAudit(env);
    const out = { reminded: 0, overdue: 0, read: 0, completed: 0 };
    const t0 = Date.now();
    const open = (await env.DB.prepare("SELECT * FROM audit_request WHERE status='sent'").all()).results || [];
    for (const req of open) {
      try {
        const age = (Date.now() - Date.parse(req.sent_at)) / 36e5;
        const logs = new Set(((await env.DB.prepare("SELECT kind FROM audit_send_log WHERE request_id=?").bind(req.id).all()).results || []).map((x) => x.kind));
        if (age >= REMIND_HOURS && Date.now() < Date.parse(req.due_at) && !logs.has("remind")) {
          const s = await stateOf(env, req);
          if (!s.gate.open) {
            const [crew, cts] = await Promise.all([crewOf(env, req.agency_id), contacts(env)]);
            // the reminder carries a FRESH link (the token is stored only as its hash, so the old one cannot be re-sent);
            // it is added only once the email went, and the old link keeps working (addLink)
            const token = newToken();
            const r = await sendRequest(env, { id: req.id, ship: req.ship, crew: crew || { name: req.crew_name }, auditor: req.auditor, dueAt: req.due_at, link: origin + "/audit/u/" + token, machines: s.machines, lines: s.lines.length, addr: addressFor({ contacts: cts, ship: req.ship, personal: crew && crew.email }), live: !req.test_mode, reminder: true });
            if (r.ok) { await addLink(env, req, token); out.reminded++; }
          }
        }
        const okey = "overdue:" + req.due_at;
        if (Date.now() >= Date.parse(req.due_at) && !logs.has(okey)) {
          const s = await stateOf(env, req);
          if (!s.gate.open) {
            const mail = overdueEmail({ ship: req.ship, crew: req.crew_name, dueAt: req.due_at, missing: s.gate.missing, test: !!req.test_mode });
            const r = await sendViaMailer(env, { templateId: OVERDUE_ID, to: [req.auditor], subject: mail.subject, html: mail.html, text: mail.text, critical: false });
            // only a note that went is logged: a failed one is tried again next hour (it used to be logged and dropped)
            if (r && r.ok !== false) {
              await env.DB.batch([
                env.DB.prepare("INSERT OR IGNORE INTO audit_send_log (request_id, kind, sent_at, to_json, ok) VALUES (?,?,?,?,?)").bind(req.id, okey, now(), JSON.stringify({ to: [req.auditor] }), 1),
                env.DB.prepare("UPDATE audit_request SET overdue_at=? WHERE id=?").bind(now(), req.id),
              ]);
              out.overdue++;
            }
          }
        }
      } catch (e) { console.error("audit_sweep", req.id, (e && e.message) || e); }
    }
    // reads that did not finish (page closed, HON away): oldest first, a few per run, bounded in time
    const pend = (await env.DB.prepare("SELECT u.id, u.request_id FROM audit_upload u JOIN audit_request r ON r.id=u.request_id WHERE r.status='sent' AND u.superseded_at IS NULL AND u.read_state IN ('pending','failed') AND u.at < ? ORDER BY COALESCE(u.read_at, u.at) LIMIT ?").bind(new Date(Date.now() - 10 * 60000).toISOString(), READ_SWEEP_MAX).all()).results || [];
    for (const p of pend) {
      if (Date.now() - t0 > 240000) break;
      try { const req = await env.DB.prepare("SELECT * FROM audit_request WHERE id=?").bind(p.request_id).first(); const r = await readUpload(env, req, p.id); if (r.ok) out.read++; } catch (e) { console.error("audit_sweep_read", p.id, (e && e.message) || e); }
    }
    // everything in and nobody tapped Send: sent after AUTO_SUBMIT_HOURS idle, or once the deadline has passed
    for (const req of open) {
      try {
        const s = await stateOf(env, req);
        if (!s.gate.open) continue;
        const idle = s.lastAt ? (Date.now() - Date.parse(s.lastAt)) / 36e5 : Infinity;
        if ((idle >= AUTO_SUBMIT_HOURS || Date.now() >= Date.parse(req.due_at)) && await maybeComplete(env, req.id)) out.completed++;
      } catch (e) { console.error("audit_sweep_complete", req.id, (e && e.message) || e); }
    }
    // a documents-in email that did not go (mailer down, AUDIT_TO unset then set) is sent again, for a few days
    out.docsin = 0;
    const lost = (await env.DB.prepare("SELECT r.* FROM audit_request r LEFT JOIN audit_send_log l ON l.request_id = r.id AND l.kind = 'docsin' WHERE r.status = 'complete' AND r.complete_at > ? AND r.complete_at < ? AND (l.ok IS NULL OR l.ok = 0)").bind(new Date(Date.now() - DOCSIN_RETRY_DAYS * 864e5).toISOString(), new Date(Date.now() - 15 * 60000).toISOString()).all().catch(() => ({ results: [] }))).results || [];
    for (const req of lost) {
      if (!req.test_mode && !csv(env.AUDIT_TO).length) break;
      try { const r = await sendDocsIn(env, req, await stateOf(env, req)); if (r && r.ok !== false) out.docsin++; } catch (e) { console.error("audit_sweep_docsin", req.id, (e && e.message) || e); }
    }
    return out;
  }

  const nameOf = (email) => String(email || "").split("@")[0].split(".").map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "")).join(" ");

  /* ---------------------------------- dispatch ---------------------------------- */
  async function handle(p, request, env, url, session) {
    // the seafarer's page and its API: token only, never a session
    const pm = p.match(/^\/audit\/u\/([A-Za-z0-9_-]{16,64})$/);
    if (pm && request.method === "GET") {
      const req = await byToken(env, pm[1]);
      const why = closedWhy(req);
      if (why) return htmlResponse(auditClosedHtml(why), why === "unknown" ? 404 : 410);
      return htmlResponse(auditUploadHtml({ token: pm[1], ship: req.ship, crew: req.crew_name }));
    }
    if (p.startsWith("/api/audit/u/")) {
      const req = await byToken(env, url.searchParams.get("t") || "");
      const why = closedWhy(req);
      if (why) return json({ ok: false, error: why }, why === "unknown" ? 404 : 410);
      if (p === "/api/audit/u/state") return json(await crewState(env, req));
      if (req.status !== "sent") return json({ ok: false, error: "closed", say: "Everything is in. Thank you." }, 409);
      if (p === "/api/audit/u/upload" && request.method === "POST") return upload(request, env, url, req);
      if (p === "/api/audit/u/read" && request.method === "POST") return json(await readUpload(env, req, url.searchParams.get("id") || ""));
      if (p === "/api/audit/u/count" && request.method === "POST") return saveCount(request, env, req);
      if (p === "/api/audit/u/down" && request.method === "POST") return saveDown(request, env, req);
      if (p === "/api/audit/u/submit" && request.method === "POST") return submit(env, req);
      return json({ error: "not found" }, 404);
    }
    if (p.startsWith("/api/audit/request")) {
      if (!session) return json({ error: "unauthorized" }, 401);
      if (p === "/api/audit/request/preview") return preview(env, url, session);
      if (p === "/api/audit/request" && request.method === "POST") return create(request, env, url, session);
      if (p === "/api/audit/request" && request.method === "GET") return detail(env, url, session);
      if (p === "/api/audit/request/resend" && request.method === "POST") return act(request, env, url, session, "resend");
      if (p === "/api/audit/request/extend" && request.method === "POST") return act(request, env, url, session, "extend");
      if (p === "/api/audit/request/cancel" && request.method === "POST") return act(request, env, url, session, "cancel");
      if (p === "/api/audit/request/grade" && request.method === "POST") return grade(request, env, session);
      return json({ error: "not found" }, 404);
    }
    return null;
  }

  return { handle, sweep, _internal: { crewState, stateOf, maybeComplete, readUpload, sendDocsIn, byToken, closedWhy } };
}
