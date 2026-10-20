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
import { aboardNow, addressFor, blindLines, parseCount, countCompleteness, countDiff, checkUpload, gateState, plusHours, REQUEST_HOURS, REMIND_HOURS, normShip, safeName, contractLabel, auditScore, gradeProblems, OPEN_REQ_SQL, SHIP_OPEN_SQL } from "./audit.js";
import { p43ReadState, mmlReadState, coverFor } from "./audit_read.js";
import { auditRequestEmail, TEMPLATE_ID as REQ_ID, REMINDER_ID } from "./emails/hr.audit.request.v1.js";
import { docsInEmail, TEMPLATE_ID as DOCS_ID } from "./emails/hr.audit.docsin.v1.js";
import { overdueEmail, TEMPLATE_ID as OVERDUE_ID } from "./emails/hr.audit.overdue.v1.js";
import { auditUploadHtml, auditClosedHtml } from "./audit_upload_ui.js";
import { normalizeVisit, visitProblems, evalOf, repeatCounts, beforeVisit, PHOTO_STEPS, VISIT_VERSION } from "./audit_steps.js";
import { formsFromRow, formsHistoryRow, FORMS_SOURCE } from "./audit_forms.js";

export const LINK_DAYS = 14;
export const RESEND_MIN = 15;             // a request is not re-sent sooner than this              // the upload page stays open this long after the request
const READ_SWEEP_MAX = 3;
export const READ_TRIES = 3;              // a read that fails this many times is "send it again", never "Reading…" for ever
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024; // the page shrinks a photo to ~300 KB; this only refuses the absurd
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
  // What the reads found per machine — ONE definition for the documents-in email and the audit's Machines step.
  function machinesRead(s, lines, intransit) {
    const downBy = {}; for (const d of s.down) downBy[d.serial] = d.reason;
    return s.machines.map((m) => {
      const read = (kind) => { const u = s.uploads.filter((x) => x.serial === m.serial && x.kind === kind && !x.superseded_at).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]; return u && u.read ? u.read.summary : null; };
      const p43 = read("p43"), mml = read("mgmt");
      if (mml && mml.lifeOver) mml.lifeOver = mml.lifeOver.map((x) => Object.assign({}, x, { cover: coverFor(x.partNo, lines, intransit) }));
      return { serial: m.serial, label: m.label || m.serial, model: m.model || null, down: downBy[m.serial] || null, p43, mml };
    });
  }
  // The OBP the crew's count was compared with when the documents came in (kept by sendDocsIn), so the audit's Inventory
  // step shows the same lines the team read in that email; before that row existed, the request's own snapshot.
  async function obpAtCount(env, req) {
    const row = await env.DB.prepare("SELECT as_of, lines_json, intransit_json FROM audit_obp_at_count WHERE request_id=?").bind(req.id).first().catch(() => null);
    if (row) return { asOf: row.as_of, lines: J(row.lines_json, []), intransit: J(row.intransit_json, []) };
    const snap = J(req.lines_json, { lines: [], intransit: [] });
    return { asOf: snap.asOf || null, lines: snap.lines || [], intransit: snap.intransit || [] };
  }

  /* ---------------------------------- Dexter (session) ---------------------------------- */
  async function preview(env, url, session) {
    const ship = String(url.searchParams.get("ship") || ""), sc = String(url.searchParams.get("sc") || "");
    if (!ship || !sc) return json({ error: "ship_and_sc_required" }, 400);
    await ensureAudit(env);
    if (session.open && !(await aboardHere(env, ship, sc))) return json({ ok: false, error: "not_aboard", detail: "The board does not have this seafarer aboard " + ship + "." }, 422);
    const [crew, cts, H, open, onShip] = await Promise.all([
      crewOf(env, sc), contacts(env), hon(env, "ship", ship),
      env.DB.prepare("SELECT r.id, r.status, r.sent_at, r.due_at FROM audit_request r LEFT JOIN audit_eval e ON e.request_id = r.id WHERE r.agency_id=? AND " + OPEN_REQ_SQL + " ORDER BY r.created_at DESC LIMIT 1").bind(sc).first(),
      env.DB.prepare(SHIP_OPEN_SQL).bind(normShip(ship)).first().catch(() => null),
    ]);
    if (!crew) return json({ error: "crew_not_found" }, 404);
    const addr = addressFor({ contacts: cts, ship, personal: crew.email });
    const live = isLive(env);
    return json({
      ship, crew: { sc, name: crew.name }, live, auditor: session.email,
      to: live ? addr.to : [session.email], cc: live && !session.open ? addr.cc : [], shown: addr.shown, noPersonal: !!addr.noPersonal, blocked: addr.ok ? null : addr.reason,
      machines: H && H.ok ? H.presses : null, lines: H && H.ok && H.obp ? blindLines(H.obp.lines).length : null, obpAsOf: H && H.obp ? H.obp.asOf : null,
      hon: !!(H && H.ok), honError: H && !H.ok ? H.error : (H ? null : "HON did not answer"),
      dueAt: plusHours(now(), REQUEST_HOURS), remindAt: REMIND_HOURS, open: open || null,
      // who is copied and who replies, by name (the addresses stay off the open site): the first of AUDIT_REQUEST_CC
      // takes the replies when live, the auditor in test mode (sendRequest)
      copyNames: live ? csv(env.AUDIT_REQUEST_CC).map(nameOf) : [], replyTo: nameOf(live ? (csv(env.AUDIT_REQUEST_CC)[0] || session.email) : session.email),
      // one person at a time per ship: another seafarer's request still open on this ship (Miguel, 20 Oct 2026)
      shipOpen: onShip && onShip.agency_id !== sc ? { id: onShip.id, crew: onShip.crew_name, sc: onShip.agency_id } : null,
    });
  }

  // The request already open on the ship: this seafarer's (the page opens it) or another's (one person at a time per ship).
  const shipTaken = (o, sc, ship) => o.agency_id === sc
    ? json({ ok: false, error: "already_open", id: o.id }, 409)
    : json({ ok: false, error: "ship_busy", id: o.id, crew: o.crew_name || null, detail: "One audit at a time on " + ship + ": " + (o.crew_name || "another seafarer") + "'s request is open. File it, then ask the next." }, 409);

  async function create(request, env, url, session) {
    const b = await request.json().catch(() => ({}));
    const ship = String(b.ship || "").trim(), sc = String(b.sc || "").trim();
    if (!ship || !sc) return json({ error: "ship_and_sc_required" }, 400);
    await ensureAudit(env);
    // ONE PERSON AT A TIME PER SHIP (Miguel, 20 Oct 2026): any request still open on this ship, for anyone, stops a new one
    const onShip = await env.DB.prepare(SHIP_OPEN_SQL).bind(normShip(ship)).first().catch(() => null);
    if (onShip) return shipTaken(onShip, sc, ship);
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
        const o = await env.DB.prepare(SHIP_OPEN_SQL).bind(normShip(ship)).first().catch(() => null);
        return shipTaken(o || { id: null, agency_id: sc }, sc, ship);
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
    if (b.visit) return fileVisit(env, req, b.visit, session);
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

  /* ---------------------------------- the audit on the ship (B1–B7) ---------------------------------- */
  // Everything the seven steps read, in one wave: the reads of the documents per machine, the crew's blind count against
  // the OBP of that day, the follow-ups still open on this ship, the last filed visit on it (for "2nd time"), the photos.
  async function visitCtx(env, req) {
    const ns = req.normalized_ship || normShip(req.ship);
    const [s, obp, fus, prev, files] = await Promise.all([
      stateOf(env, req), obpAtCount(env, req),
      env.DB.prepare("SELECT id, request_id, ship, crew_name, owner, due, text, carried, created_at FROM audit_followup WHERE normalized_ship=? AND status='open' AND request_id != ? ORDER BY created_at").bind(ns, req.id).all().catch(() => ({ results: [] })),
      env.DB.prepare("SELECT d.data_json, d.filed_at, d.request_id, v.agency_id, r.crew_name FROM audit_visit_data d JOIN audit_visit v ON v.id = d.visit_id LEFT JOIN audit_request r ON r.id = d.request_id WHERE d.normalized_ship=? AND d.request_id != ? ORDER BY d.filed_at DESC LIMIT 1").bind(ns, req.id).first().catch(() => null),
      env.DB.prepare("SELECT id, step, content_type, bytes, uploaded_at FROM audit_file WHERE request_id=? ORDER BY uploaded_at").bind(req.id).all().catch(() => ({ results: [] })),
    ]);
    const read = machinesRead(s, obp.lines, obp.intransit);
    const machines = read.map((m) => ({ serial: m.serial, label: m.label, model: m.model, down: m.down,
      p43: m.p43 ? { state: m.p43.state, items: ((m.p43.legend && m.p43.legend.items) || []).map((i) => ({ head: i.head, detail: i.detail || null, where: i.where || null, part: i.part || null, check: i.check && i.check.say ? i.check.say : null })) } : null,
      life: ((m.mml && m.mml.lifeOver) || []).map((x) => ({ name: x.name, partNo: x.partNo || null, pct: x.pct, cover: x.cover || null })) }));
    const diff = countDiff(obp.lines, s.counted, String(req.complete_at || now()).slice(0, 10));
    const extras = s.extras.map((x) => ({ id: x.id, text: x.text, counted: x.counted }));
    const parts = blindLines(obp.lines).map((l) => { const o = obp.lines.find((x) => String(x.part_number || x.part_no || "").trim() === l.part_no); return { part_no: l.part_no, description: l.description, obp: o && Number.isFinite(Number(o.on_hand)) ? Number(o.on_hand) : null, counted: s.counted[l.part_no] == null ? null : s.counted[l.part_no] }; });
    const pd = prev ? J(prev.data_json, null) : null;
    return { s, machines, diff, extras, parts, asOf: obp.asOf, followups: fus.results || [], photos: files.results || [],
      previous: pd ? { at: prev.filed_at, crew: prev.crew_name, sameCrew: prev.agency_id === req.agency_id, missing: [...((pd.ws || {}).missing || []), ...(((pd.hw || {}).tools || {}).missing || [])], ppeMissing: prev.agency_id === req.agency_id ? (((pd.crew || {}).ppe || {}).missing || []) : [], repeat: pd.repeat || {} } : null, prevData: pd };
  }

  async function visitView(env, url, session) {
    const id = String(url.searchParams.get("id") || "");
    await ensureAudit(env);
    const req = await env.DB.prepare("SELECT * FROM audit_request WHERE id=?").bind(id).first();
    if (!req) return json({ error: "not_found" }, 404);
    const [c, ev, data, mine] = await Promise.all([
      visitCtx(env, req),
      env.DB.prepare("SELECT * FROM audit_eval WHERE request_id=?").bind(req.id).first().catch(() => null),
      env.DB.prepare("SELECT data_json, filed_at FROM audit_visit_data WHERE request_id=?").bind(req.id).first().catch(() => null),
      env.DB.prepare("SELECT id, owner, due, text, status, closed_at FROM audit_followup WHERE request_id=? ORDER BY created_at").bind(req.id).all().catch(() => ({ results: [] })),
    ]);
    const filedData = data ? J(data.data_json, null) : null;
    return json({
      id: req.id, ship: req.ship, sc: req.agency_id, crew: req.crew_name, status: req.status, test: !!req.test_mode, auditor: nameOf(req.auditor),
      completeAt: req.complete_at, today: now().slice(0, 10),
      machines: c.machines, count: { total: c.s.lines.length, asOf: c.asOf, diff: c.diff, extras: c.extras }, parts: c.parts,
      before: beforeVisit({ machines: c.machines, diff: c.diff, extras: c.extras }),
      followups: c.followups.map((f) => ({ id: f.id, owner: f.owner, due: f.due, text: f.text, carried: f.carried || 0, at: f.created_at, crew: f.crew_name })),
      previous: c.previous, photos: c.photos.map((f) => ({ id: f.id, step: f.step, at: f.uploaded_at })),
      filed: ev ? { grade: { inventory: ev.r_inventory, technical: ev.r_technical, collaterals: ev.r_collaterals, overall: ev.r_overall, score: ev.score, from: ev.score_from, note: ev.note, by: ev.filed_by, at: ev.filed_at },
        data: filedData, followups: mine.results || [] } : null,
    });
  }

  // Filing: the visit, Dexter's grade (the SAME audit_eval row and rule the Score Card reads — §1, unchanged), the seven
  // steps' answers, the follow-up and what happened to the ones left open last time, in ONE batch, once. Everything is
  // re-checked here with the page's own rules (audit_steps.js): the page is open on audit.cims.work.
  async function fileVisit(env, req, raw, session) {
    const c = await visitCtx(env, req);
    const ctx = { machines: c.machines, diff: c.diff, extras: c.extras, parts: c.parts.map((p) => p.part_no), followups: c.followups };
    const d = normalizeVisit(raw, ctx);
    const today = now().slice(0, 10);
    const problems = visitProblems(d, ctx, today);
    const e = evalOf(d);
    if (problems.length || e.problems.length) return json({ ok: false, error: "invalid", problems, fields: e.problems }, 400);
    d.repeat = repeatCounts(c.prevData, d);
    // what the documents said, kept with the visit: the filed record never depends on a later read
    d.ctx = { asOf: c.asOf, diff: c.diff, extras: c.extras, machines: c.machines.map((m) => ({ serial: m.serial, label: m.label, model: m.model, down: m.down, p43: m.p43, life: m.life })) };
    const at = now(), vid = "av_" + crypto.randomUUID();
    const opened = d.openedAt && d.openedAt >= String(req.complete_at || "") && d.openedAt <= at ? d.openedAt : at;
    const by = session.open ? session.email + " (open site, no sign-in)" : session.email;
    const ns = req.normalized_ship || normShip(req.ship);
    const stmts = [
      env.DB.prepare("INSERT INTO audit_visit (id, request_id, ship, agency_id, auditor, status, opened_at, filed_at) VALUES (?,?,?,?,?,'filed',?,?)").bind(vid, req.id, req.ship, req.agency_id, by, opened, at),
      env.DB.prepare("INSERT INTO audit_eval (visit_id, request_id, agency_id, ship, r_inventory, r_technical, r_collaterals, r_overall, score, score_from, note, filed_by, filed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(vid, req.id, req.agency_id, req.ship, e.r.inventory, e.r.technical, e.r.collaterals, e.r.overall == null ? null : e.r.overall, e.score.score, e.score.from, e.r.note || null, by, at),
      env.DB.prepare("INSERT INTO audit_visit_data (visit_id, request_id, ship, normalized_ship, agency_id, data_json, version, filed_at) VALUES (?,?,?,?,?,?,?,?)").bind(vid, req.id, req.ship, ns, req.agency_id, JSON.stringify(d), VISIT_VERSION, at),
    ];
    const f = d.ov.followup;
    if (f) stmts.push(env.DB.prepare("INSERT INTO audit_followup (id, visit_id, request_id, ship, normalized_ship, agency_id, crew_name, owner, due, text, status, carried, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'open',0,?,?)")
      .bind("af_" + crypto.randomUUID(), vid, req.id, req.ship, ns, req.agency_id, req.crew_name, f.owner, f.due, f.text, by, at));
    for (const o of c.followups) {
      if ((d.close[o.id] || "open") === "fixed") stmts.push(env.DB.prepare("UPDATE audit_followup SET status='fixed', closed_at=?, closed_visit_id=?, closed_by=? WHERE id=? AND status='open'").bind(at, vid, by, o.id));
      else stmts.push(env.DB.prepare("UPDATE audit_followup SET carried = carried + 1 WHERE id=? AND status='open'").bind(o.id));
    }
    try { await env.DB.batch(stmts); } catch (err) {
      if (/UNIQUE/i.test(String((err && err.message) || err))) return json({ ok: false, error: "already_filed" }, 409);
      throw err;
    }
    await logActivity(env, session.email, "audit_file", req.id + " " + e.score.score + (session.open ? " (open site)" : ""));
    return json({ ok: true, score: e.score.score, from: e.score.from, visit: vid });
  }

  // Evidence photos (B1, B2, B3, B5). Shrunk on the phone; keyed by the phone's own key so a retry after a dropped
  // signal never stores the same photo twice. A photo may arrive after the audit is filed (it waited for signal).
  async function savePhoto(request, env, url, session) {
    const id = String(url.searchParams.get("id") || ""), step = String(url.searchParams.get("step") || ""), k = String(url.searchParams.get("k") || "");
    if (!PHOTO_STEPS.includes(step)) return json({ ok: false, error: "unknown_step" }, 400);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(k)) return json({ ok: false, error: "bad_key" }, 400);
    await ensureAudit(env);
    const req = await env.DB.prepare("SELECT id, status FROM audit_request WHERE id=?").bind(id).first();
    if (!req) return json({ ok: false, error: "not_found" }, 404);
    if (req.status !== "complete") return json({ ok: false, error: "not_complete" }, 409);
    const have = await env.DB.prepare("SELECT id FROM audit_file WHERE request_id=? AND client_key=?").bind(req.id, k).first();
    if (have) return json({ ok: true, id: have.id, dup: true });
    const type = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(type)) return json({ ok: false, error: "type", say: "A photo, please." }, 400);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ ok: false, error: "empty" }, 400);
    if (buf.byteLength > PHOTO_MAX_BYTES) return json({ ok: false, error: "too_big" }, 413);
    if (!env.AUDIT_FILES) return json({ ok: false, error: "no_bucket" }, 503);
    const key = "visit/" + req.id + "/" + step + "/" + (await sha256hex(buf));
    await env.AUDIT_FILES.put(key, buf, { httpMetadata: { contentType: type }, customMetadata: { request: req.id, step } });
    const head = await env.AUDIT_FILES.head(key).catch(() => null);
    if (!head || !head.size) return json({ ok: false, error: "not_stored" }, 502);
    const taken = request.headers.get("x-taken-at");
    await env.DB.prepare("INSERT OR IGNORE INTO audit_file (id, request_id, step, client_key, r2_key, content_type, bytes, taken_at, uploaded_at, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind("af_" + crypto.randomUUID(), req.id, step, k, key, type, buf.byteLength, taken && !isNaN(Date.parse(taken)) ? new Date(Date.parse(taken)).toISOString() : null, now(), session.email).run();
    const row = await env.DB.prepare("SELECT id FROM audit_file WHERE request_id=? AND client_key=?").bind(req.id, k).first();
    return json({ ok: true, id: row && row.id });
  }
  async function servePhoto(env, url) {
    await ensureAudit(env);
    const f = await env.DB.prepare("SELECT r2_key, content_type FROM audit_file WHERE id=?").bind(String(url.searchParams.get("f") || "")).first();
    if (!f || !env.AUDIT_FILES) return json({ error: "not_found" }, 404);
    const obj = await env.AUDIT_FILES.get(f.r2_key);
    if (!obj) return json({ error: "not_found" }, 404);
    return new Response(obj.body || (await obj.arrayBuffer()), { headers: { "Content-Type": f.content_type || "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
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
    const asOf = (H && H.ok && H.obp && H.obp.asOf) || snap.asOf || null;
    // the OBP this email compares the count with is kept, once: the audit's Inventory step reads the same lines (a retry
    // of a failed email keeps the first)
    await env.DB.prepare("INSERT OR IGNORE INTO audit_obp_at_count (request_id, as_of, lines_json, intransit_json, at) VALUES (?,?,?,?,?)")
      .bind(req.id, asOf, JSON.stringify(lines), JSON.stringify(intransit), now()).run().catch((e) => console.error("audit_obp_at_count", (e && e.message) || e));
    const machines = machinesRead(s, lines, intransit);
    const diff = countDiff(lines, s.counted, String(req.complete_at || now()).slice(0, 10));
    const mail = docsInEmail({ ship: req.ship, crew: req.crew_name, auditor: nameOf(req.auditor), completeAt: req.complete_at, machines, count: { total: s.lines.length, diff, extras: s.extras }, obpAsOf: asOf, test: !!req.test_mode });
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
  // History (19 Oct 2026; docs/AUDIT_DESIGN.md "History" and W1's rail: History · Open follow-ups): every filed audit by
  // ship, crew and date, and every follow-up with its state. It reads only what a filing wrote (the grade, the visit, its
  // steps, its photos) and decides nothing; a TEST request is a rehearsal and is never listed. One wave (§12).
  // One filed visit in numbers: the presses' checks, the shelf against OBP, the crew's needs. A line's shelf is Dexter's
  // number where he typed one, else the crew's count (the page's own rule, obpMatches).
  function foundOf(d) {
    const ms = Object.values((d.hw && d.hw.machines) || {});
    const n = (f) => ms.filter(f).length;
    const lines = (d.inv && d.inv.lines) || {}, diff = ((d.ctx && d.ctx.diff) || []).filter((x) => x.kind === "gap");
    let above = 0, below = 0;
    for (const x of diff) { const L = lines[x.part_no], shelf = L && L.shelf != null ? L.shelf : x.counted; if (shelf > x.obp) above++; else if (shelf < x.obp) below++; }
    const crew = d.crew || {}, ov = d.ov || {};
    return {
      machines: { presses: ms.length, test: n((m) => (m.checks || {}).test === "finding"), scan: n((m) => (m.checks || {}).scan === "finding"), collab: n((m) => (m.checks || {}).collab === "finding"), p43: n((m) => m.p43 === "seen"), down: n((m) => m.down === "still") },
      inv: { accurate: d.inv && typeof d.inv.accurate === "boolean" ? d.inv.accurate : null, above, below, added: ((d.inv && d.inv.added) || []).length, notInObp: ((d.ctx && d.ctx.extras) || []).length, notFound: Object.values((d.inv && d.inv.repairs) || {}).filter((v) => v === "not_found").length },
      crew: { training: (crew.training || []).slice(), trainingOther: crew.trainingOther || "", ppe: ((crew.ppe && crew.ppe.missing) || []).length, hon: crew.hon || null, block: !!ov.recommendBlock },
      why: { inventory: ((d.rt || {}).why || {}).inventory || "", technical: ((d.rt || {}).why || {}).technical || "", collaterals: ((d.rt || {}).why || {}).collaterals || "", overall: ov.why || "" },
    };
  }
  async function history(env) {
    await ensureAudit(env);
    const NOT_TEST = "COALESCE(r.test_mode, 0) = 0";
    const [ev, fu, ph, fm] = await Promise.all([
      env.DB.prepare("SELECT e.request_id, e.ship, e.agency_id, e.r_inventory, e.r_technical, e.r_collaterals, e.r_overall, e.score, e.score_from, e.filed_by, e.filed_at, r.crew_name, v.opened_at, d.data_json FROM audit_eval e JOIN audit_request r ON r.id = e.request_id LEFT JOIN audit_visit v ON v.id = e.visit_id LEFT JOIN audit_visit_data d ON d.request_id = e.request_id WHERE " + NOT_TEST + " ORDER BY e.filed_at DESC LIMIT 500").all(),
      env.DB.prepare("SELECT f.id, f.request_id, f.ship, f.agency_id, f.crew_name, f.owner, f.due, f.text, f.status, f.carried, f.created_by, f.created_at, f.closed_at, f.closed_by, f.closed_visit_id FROM audit_followup f JOIN audit_request r ON r.id = f.request_id WHERE " + NOT_TEST + " ORDER BY f.created_at DESC LIMIT 500").all(),
      env.DB.prepare("SELECT request_id, COUNT(*) AS n FROM audit_file GROUP BY request_id").all().catch(() => ({ results: [] })),
      // the audits before the app (the Forms survey, src/audit_forms.js): read beside the filed ones, never scored
      env.DB.prepare("SELECT * FROM audit_forms ORDER BY audit_date DESC").all().catch(() => ({ results: [] })),
    ]);
    const photos = new Map((ph.results || []).map((x) => [x.request_id, Number(x.n) || 0]));
    const fuOf = {};
    for (const f of fu.results || []) (fuOf[f.request_id] = fuOf[f.request_id] || []).push(f.status);
    const audits = (ev.results || []).map((e) => {
      const d = J(e.data_json, null), st = fuOf[e.request_id] || [];
      const hw = (d && d.hw) || {}, crew = (d && d.crew) || {};
      return {
        id: e.request_id, ship: e.ship, sc: e.agency_id, crew: e.crew_name || null, filedAt: e.filed_at, openedAt: e.opened_at || null, filedBy: e.filed_by || null,
        ratings: { inventory: e.r_inventory, technical: e.r_technical, collaterals: e.r_collaterals, overall: e.r_overall, dispatch: crew.dispatch != null ? crew.dispatch : null },
        score: e.score, from: e.score_from,
        // a grade filed on the 15 Oct screen has no steps: nothing to say about the desk or the tools, never "none missing"
        steps: !!d,
        missing: d ? { ws: (d.ws && d.ws.missing) || [], tools: (hw.tools && hw.tools.missing) || [], ppe: (crew.ppe && crew.ppe.missing) || [] } : null,
        repeat: (d && d.repeat) || {},
        // what the visit found, for the History page to add up (every number read from the filed steps, nothing guessed)
        found: d ? foundOf(d) : null,
        photos: photos.get(e.request_id) || 0,
        followups: { open: st.filter((x) => x === "open").length, fixed: st.filter((x) => x === "fixed").length },
      };
    });
    const followups = (fu.results || []).map((f) => ({ id: f.id, request: f.request_id, ship: f.ship, sc: f.agency_id, crew: f.crew_name || null, owner: f.owner, due: f.due || null, text: f.text,
      status: f.status, carried: Number(f.carried) || 0, createdAt: f.created_at, createdBy: f.created_by || null, closedAt: f.closed_at || null, closedBy: f.closed_by || null, closedOnVisit: !!f.closed_visit_id }));
    const forms = (fm.results || []).map((r) => formsHistoryRow(formsFromRow(r)));
    const all = audits.concat(forms).sort((a, b) => String(b.filedAt || "").localeCompare(String(a.filedAt || "")));
    return json(Object.assign({ today: now().slice(0, 10), audits: all, followups }, forms.length ? { forms: { n: forms.length, source: FORMS_SOURCE } } : {}));
  }

  // One audit from the Forms survey, as typed (History's row opens it). Read only; never scored.
  async function formsOne(env, url) {
    const id = String(url.searchParams.get("id") || "").slice(0, 40);
    if (!/^forms-\d{1,4}$/.test(id)) return json({ ok: false, error: "id_required" }, 400);
    await ensureAudit(env);
    const r = await env.DB.prepare("SELECT * FROM audit_forms WHERE id=?").bind(id).first().catch(() => null);
    if (!r) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, today: now().slice(0, 10), source: FORMS_SOURCE, audit: formsFromRow(r) });
  }

  // A follow-up closed from the list: the person it was asked of did it before the next visit. The next visit's own
  // Fixed / Still open is unchanged; either way a follow-up closes ONCE and says who closed it and when.
  async function closeFollowup(request, env, session) {
    let b = {};
    try { b = await request.json(); } catch (e) { b = {}; }
    const id = typeof (b && b.id) === "string" ? b.id.slice(0, 80) : "";
    if (!id) return json({ ok: false, error: "id_required" }, 400);
    await ensureAudit(env);
    const f = await env.DB.prepare("SELECT f.id, f.status, f.ship, r.test_mode FROM audit_followup f LEFT JOIN audit_request r ON r.id = f.request_id WHERE f.id=?").bind(id).first();
    if (!f || f.test_mode) return json({ ok: false, error: "not_found" }, 404);
    if (f.status !== "open") return json({ ok: false, error: "already_closed" }, 409);
    const by = session.open ? session.email + " (open site, no sign-in)" : session.email, at = now();
    const r = await env.DB.prepare("UPDATE audit_followup SET status='fixed', closed_at=?, closed_by=? WHERE id=? AND status='open'").bind(at, by, id).run();
    if (!(r && r.meta && r.meta.changes)) return json({ ok: false, error: "already_closed" }, 409);
    await logActivity(env, session.email, "audit_followup_close", id + " " + f.ship + (session.open ? " (open site)" : ""));
    return json({ ok: true, id, closedAt: at, closedBy: by });
  }

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
    if (p.startsWith("/api/audit/visit")) {
      if (!session) return json({ error: "unauthorized" }, 401);
      if (p === "/api/audit/visit" && request.method === "GET") return visitView(env, url, session);
      if (p === "/api/audit/visit/photo" && request.method === "POST") return savePhoto(request, env, url, session);
      if (p === "/api/audit/visit/photo" && request.method === "GET") return servePhoto(env, url);
      return json({ error: "not found" }, 404);
    }
    if (p === "/api/audit/history" || p === "/api/audit/followup/close" || p === "/api/audit/forms") {
      if (!session) return json({ error: "unauthorized" }, 401);
      if (p === "/api/audit/history" && request.method === "GET") return history(env);
      if (p === "/api/audit/forms" && request.method === "GET") return formsOne(env, url);
      if (p === "/api/audit/followup/close" && request.method === "POST") return closeFollowup(request, env, session);
      return json({ error: "not found" }, 404);
    }
    return null;
  }

  return { handle, sweep, _internal: { crewState, stateOf, maybeComplete, readUpload, sendDocsIn, byToken, closedWhy, visitCtx } };
}
