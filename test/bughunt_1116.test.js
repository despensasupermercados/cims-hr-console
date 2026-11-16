// THE 16 NOV 2026 BUG HUNT (Miguel: "find bugs and fix them .. read the brain and also code .. also the logic of the app and
// repair gaps or bugs we have not noticed"). Six readers; every case below was reproduced on the old code first (the proof
// scripts are in the session's scratchpad), then fixed. One person / one ship has its own file (one_person_one_ship.test.js);
// the audit's two (the visit read before the count is sent, an empty OBP list) are in audit_visit / audit_request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { buildCrewIndex, matchTravelName } from "../src/travel_match.js";
import { intakeMail, isSgaName, pickAttachments } from "../src/mail_intake.js";
import { sgaPeriodFromName } from "../src/sga.js";
import { parseMonthSheet, parseCimsSheet } from "../src/travel.js";
import { assignRelievers } from "../src/reliever.js";
import { welcomeContext } from "../src/welcome_context.js";
import { hubModel } from "../src/crew_hub_routes.js";
import { hubPage } from "../src/crew_hub.js";
import { signToken } from "../src/auth.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
const TMP = new URL(`../src/__bh1116_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, SRC + "\nexport { decodeEmailBody, COOKIE };\n", "utf-8");
let W;
try { W = await import(TMP.href); } finally { unlinkSync(TMP); }

// ---- 1. a signed-in POST from a sibling *.cims.work host -------------------------------------------------------------------
// The session cookie is Domain=cims.work, so it rides on a POST from audit.cims.work or hub.cims.work. The cross-site check
// guarded the /api block only; the survey, hub, welcome and sign-off routes are dispatched before it.
test("a signed-in POST whose Origin is another host is refused before ANY handler; the same host still works", { skip: !DatabaseSync }, async () => {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT)");
  d.exec("INSERT INTO users VALUES ('u1','Rita.Berenyi@dg3.com','Rita','full')");
  d.exec("CREATE TABLE data_meta (k TEXT PRIMARY KEY, v TEXT)");
  d.exec("CREATE TABLE app_setting (k TEXT PRIMARY KEY, v TEXT)");
  d.exec("CREATE TABLE activity_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, detail TEXT, at TEXT)");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ success: true, results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  const env = { SESSION_SECRET: "test-secret", DB: { prepare: (s) => stmt(s), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
  const sess = await signToken({ email: "Rita.Berenyi@dg3.com", p: "session", exp: Math.floor(Date.now() / 1000) + 3600 }, env.SESSION_SECRET);
  const post = async (path, body, origin) => {
    const req = new Request("https://cims.work" + path, { method: "POST", headers: { Cookie: W.COOKIE + "=" + encodeURIComponent(sess), Origin: origin, "Content-Type": "text/plain" }, body: JSON.stringify(body) });
    const res = await W.default.fetch(req, env, { waitUntil() {} });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  for (const path of ["/api/survey/auto", "/api/hub/welcome/auto", "/api/hub/revoke", "/api/hub/welcome/send", "/api/instructions/request", "/api/ack/request", "/api/autosend"]) {
    const r = await post(path, { enabled: true, agency_id: "SC-1", sc: "SC-1", seq: 1, kind: "house" }, "https://audit.cims.work");
    assert.equal(r.status, 403, path); assert.equal(r.body.error, "cross_site", path);
  }
  assert.deepEqual(d.prepare("SELECT k FROM app_setting").all(), [], "no switch was flipped");
  assert.deepEqual(d.prepare("SELECT action FROM activity_log").all(), []);
  const own = await post("/api/survey/auto", { enabled: true }, "https://cims.work");
  assert.equal(own.status, 200, JSON.stringify(own.body)); assert.equal(own.body.enabled, true);
});

// ---- 2. the travel name bridge: swapped halves need the two halves to AGREE with one crew --------------------------------
// "Tatel, Joseph" (an NCL-prep trainee, not on the roster) was filed on Emil Rondy JOSEPH: the swap read "Joseph" as a
// surname and accepted it alone. Production, 16 Nov 2026: four names, all on the wrong profile.
test("a swapped name is taken only when surname AND first name agree with one crew", () => {
  const CREW = [["358775", "JOSEPH", "EMIL RONDY"], ["SC-0038378", "Miranda", "Ohji"], ["SC-0038447", "Marto", "Ryan Paolo"], ["SC-0045013", "Esteban", "Vincent"]]
    .map(([agency_id, last_name, first_name]) => ({ agency_id, last_name, first_name }));
  const ix = buildCrewIndex(CREW);
  for (const n of ["Tatel, Joseph", "FINEZ, JOHN JOSEPH", "Villaran, Miranda", "Aguas, Marto"]) assert.equal(matchTravelName(n, ix).agency_id || null, null, n);
  const sw = matchTravelName("Vincent, Esteban", ix);
  assert.equal(sw.agency_id, "SC-0045013"); assert.equal(sw.how, "swapped");
  assert.equal(matchTravelName("JOSEPH", ix).agency_id, "358775", "a lone word that is one crew's surname is still that crew");
});

// ---- 3. the mail intake ----------------------------------------------------------------------------------------------------
test("an empty envelope sender vouches for nobody: the workbook is held", async () => {
  const att = { filename: "DG3 SGA EXCEL OCTOBER 2026.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: new Uint8Array([1, 2, 3]).buffer };
  const deps = { parse: async () => ({ from: { address: "finance@dg3.com" }, subject: "SGA", attachments: [att] }), XLSX: {}, sheetsOf: () => ({ "SUMMARY MANNING": [["x"]] }), wantSga: () => true, wantTravel: () => true, now: Date.UTC(2026, 10, 16) };
  for (const envelope of ["", "<>", undefined, "attacker@evil.net"]) {
    const r = await intakeMail({}, new ArrayBuffer(0), { from: envelope, subject: "SGA" }, deps);
    assert.equal(r.allowed, false, "envelope " + JSON.stringify(envelope)); assert.equal(r.files[0].status, "held");
  }
  const ok = await intakeMail({}, new ArrayBuffer(0), { from: "finance@dg3.com", subject: "SGA" }, deps);
  assert.equal(ok.allowed, true);
});

test("a bill whose file name lost its spaces is still the bill, and still says its month", () => {
  for (const [n, year, month] of [["DG3 SGA EXCEL NOVEMBER 2026.xlsx", 2026, 11], ["DG3_SGA_EXCEL_NOVEMBER_2026.xlsx", 2026, 11], ["DG3 SGA EXCEL NOVEMBER 2026_REVISED.xlsx", 2026, 11],
    ["DG3_SGA_EXCEL_DEC'26_REVISED.xlsx", 2026, 12], ["DG3 SGA EXCEL JANUARY 2027.xlsx", 2027, 1]]) {
    assert.equal(isSgaName(n), true, n);
    assert.equal(pickAttachments([{ filename: n, mimeType: "application/vnd.ms-excel", content: new ArrayBuffer(1) }]).take.length, 1, n);
    const p = sgaPeriodFromName(n);
    assert.ok(p, n); assert.equal(p.year, year, n); assert.equal(p.month, month, n);
  }
  assert.equal(isSgaName("TRAINING RELATED COSTS NOVEMBER 2026.pdf"), false);
});

// ---- 4. a refund is a movement ---------------------------------------------------------------------------------------------
test("a refund-only row of Rita's workbook is kept; a row with nothing is still skipped", () => {
  const rows = [["", "Sign on"], ["", "Crew", "Air", "Hotel", "Medical", "Visa", "Food", "Transport"],
    ["Anthem", "Caag, Haziel", -655, 0, 0, 0, 0, 0], ["Anthem", "Ramos, Darryl", 0, 0, 0, 0, 0, 0], ["Apex", "Belhida, Dan", 410, 0, 0, 0, 0, 0]];
  const out = parseMonthSheet("OCT", rows, 2026);
  assert.deepEqual(out.map((r) => [r.crew_name, r.total]), [["Caag, Haziel", -655], ["Belhida, Dan", 410]]);
  const cims = parseCimsSheet([["", "", "JAN"], ["Name", "Total", "Flight", "Hotel", "Transportation", "Meals", "Other"], ["Ray Guerra", -120, -120, 0, 0, 0, 0], ["Rolando Abellan", 0, 0, 0, 0, 0, 0]], 2026);
  assert.deepEqual(cims.map((r) => [r.crew_name, r.total]), [["Ray Guerra", -120]]);
  // the page's category filter keeps a negative amount too
  assert.doesNotMatch(SRC, /r\[TF\.cat\]>0|r\[cat\]>0/);
});

// ---- 5. a field report whose encoding header is written ABOVE its Content-Type --------------------------------------------
test("the intel body is decoded when Content-Transfer-Encoding precedes Content-Type", () => {
  const b64 = Buffer.from("Kevin Tañgonan missed the par order twice.", "utf-8").toString("base64");
  const mime = ["From: Ray Guerra <ray@dg3.com>", 'Content-Type: multipart/alternative; boundary="b1"', "",
    "--b1", "Content-Transfer-Encoding: base64", "Content-Type: text/plain; charset=UTF-8", "", b64, "--b1--", ""].join("\r\n");
  assert.equal(W.decodeEmailBody(mime), "Kevin Tañgonan missed the par order twice.");
  const qp = ["From: x@dg3.com", 'Content-Type: multipart/alternative; boundary="b2"', "", "--b2", "Content-Transfer-Encoding: quoted-printable", "Content-Type: text/plain; charset=UTF-8", "",
    "Cost =3D $450, Ta=C3=B1gonan.", "--b2--", ""].join("\r\n");
  assert.equal(W.decodeEmailBody(qp), "Cost = $450, Tañgonan.");
  // an encoding declared by ANOTHER part is not this part's: 7bit text stays as written
  const other = ["From: x@dg3.com", 'Content-Type: multipart/mixed; boundary="b3"', "", "--b3", "Content-Type: text/plain; charset=UTF-8", "", "Toner TN=1A used.", "--b3",
    "Content-Type: application/pdf", "Content-Transfer-Encoding: base64", "", "AAAA", "--b3--", ""].join("\r\n");
  assert.equal(W.decodeEmailBody(other), "Toner TN=1A used.");
});

// ---- 6. the dashboard ---------------------------------------------------------------------------------------------------------
test("the dashboard: no closed month puts the pace tick at 0, and Norwegian crew are counted on the crew card", () => {
  assert.match(SRC, /yearPct=Math\.round\(\(tv\.elapsedMo==null\?12:tv\.elapsedMo\)\/12\*100\)/, "January (0 closed months) drew the tick at 100%");
  assert.match(SRC, /\.concat\(bc\.NCL>0\?\[\['NCL','Norwegian'\]\]:\[\]\)/);
});

// ---- 7. one undated earmark relieves one seat -------------------------------------------------------------------------------
test("two seats on a hull are not both given the same undated TDG earmark: the one leaving first takes him", () => {
  const earmark = { sc: "SC-E", on: null };
  const out = assignRelievers([{ sc: "SC-A", on: "2026-06-01", off: "2027-01-01", cands: [earmark] }, { sc: "SC-B", on: "2026-05-01", off: "2026-12-01", cands: [earmark] }]);
  assert.equal(out[1], earmark); assert.equal(out[0], null);
  // a dated reliever for one seat leaves the undated earmark to the other
  const dated = { sc: "SC-D", on: "2026-12-01" };
  const two = assignRelievers([{ sc: "SC-A", on: "2026-06-01", off: "2027-01-01", cands: [dated, earmark] }, { sc: "SC-B", on: "2026-05-01", off: "2026-12-01", cands: [dated, earmark] }]);
  assert.equal(two[1], dated); assert.equal(two[0], earmark);
});

// ---- 8. "1 month", never "1 months" -----------------------------------------------------------------------------------------
test("a contract of exactly one month reads '1 month' on the welcome pass", () => {
  const crew = { agency_id: "SC-1", first_name: "Joe Art", last_name: "Eresmas" };
  const leg = (off) => [{ sc: "SC-1", ship: "Celebrity Solstice", brand: "Celebrity", on: "2026-11-09", off, is_current: true, source: "assignment" }];
  assert.equal(welcomeContext({ crew, legs: leg("2026-12-09"), today: "2026-11-09", links: {} }).months, "1 month");
  assert.equal(welcomeContext({ crew, legs: leg("2027-06-09"), today: "2026-11-09", links: {} }).months, "7 months");
  assert.match(readFileSync(new URL("../src/crew_survey_send.js", import.meta.url), "utf-8"), /p\.d \? mdShort\(on, off\) : mdWords\(on, off\)/);
});

// ---- 9. the Crew Hub and the welcome: a card saved without a sign-off still runs ------------------------------------------
test("a running contract with no sign-off on file is projected (7 months, Azamara 5), never 'Between contracts' and never unwelcomed", () => {
  const crew = { agency_id: "SC-1", first_name: "Archiegale", last_name: "Corpin" };
  const strip = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/\s+/g, " ");
  const leg = { sc: "SC-1", ship: "Grandeur", brand: "Royal Caribbean", on: "2026-11-10", off: null, is_current: true, source: "assignment" };
  const m = hubModel({ crew, leg, count: null, today: "2026-11-16" });
  assert.deepEqual([m.ship, m.on, m.off, m.offProjected], ["Grandeur", "2026-11-10", "2027-06-10", true]);
  const page = strip(hubPage(m));
  assert.doesNotMatch(page, /Between contracts/); assert.match(page, /Sign-off projected/);
  const w = welcomeContext({ crew, legs: [leg], today: "2026-11-10", links: {} });
  assert.ok(w, "the welcome is not refused"); assert.equal(w.off, "10 Jun 2027"); assert.equal(w.offSource, "projected");
  assert.equal(hubModel({ crew, leg: { ...leg, ship: "Azamara Quest", brand: "Azamara" }, count: null, today: "2026-11-16" }).off, "2027-04-10");
  assert.equal(hubModel({ crew, leg: { ...leg, off: "2027-05-01", offSource: "rita" }, count: null, today: "2026-11-16" }).off, "2027-05-01", "a date on file is never replaced");
});

test("the Crew Hub counts the sign-on as day 1 and the sign-off as the last day, in the header and on the card", () => {
  const crew = { agency_id: "SC-1", first_name: "Kevin Leif", last_name: "Jugao" };
  const strip = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/\s+/g, " ");
  const at = (today) => strip(hubPage(hubModel({ crew, leg: { sc: "SC-1", ship: "Azamara Pursuit", brand: "Azamara", on: "2026-06-16", off: "2026-11-16", is_current: true, offSource: "rita" }, count: 2, today })));
  assert.match(at("2026-06-16"), /Day 1 of 154 · 153 days to go/);
  assert.match(at("2026-11-15"), /day 153 of your contract/); assert.match(at("2026-11-15"), /Day 153 of 154 · 1 day to go/);
  assert.match(at("2026-11-16"), /day 154 of your contract/); assert.match(at("2026-11-16"), /Day 154 of 154 · sign-off today/);
});

// ---- 10. the crew's audit page keeps what is on it when one refresh fails ----------------------------------------------------
test("the crew's audit page: a lost connection on a page already open shows a toast, never replaces the page", () => {
  const ui = readFileSync(new URL("../src/audit_upload_ui.js", import.meta.url), "utf-8");
  assert.match(ui, /else if \(S && S\.machines && !\(j && j\.status\)\) \{[^}]*toast\(/);
});
