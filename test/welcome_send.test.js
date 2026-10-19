// THE WELCOME SEND (19 Oct 2026): nothing attached, the ship + the personal address, once per contract, the sign-on morning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installWelcome, welcomeRecipients, welcomeDue, WELCOME_DDL, WELCOME_CC, WELCOME_TZ, WELCOME_HOUR } from "../src/welcome_send.js";
import { installHub, HUB_DDL } from "../src/crew_hub_routes.js";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const TODAY = "2026-10-19";
const LEGS = [
  { sc: "SC-1", name: "Archie Corpin", ship: "Grandeur of the Seas", on: "2026-10-19", off: "2027-05-19", is_current: true, ours: true, offSource: "projected", embark: "Baltimore" },
  { sc: "SC-2", name: "Mark Joseph Dela Rosa", ship: "Grandeur of the Seas", on: "2026-02-28", off: "2026-10-20", is_current: true, ours: true },
  { sc: "SC-3", name: "Two Days", ship: "Vision of the Seas", on: "2026-10-17", off: "2027-05-17", is_current: true, ours: true },
  { sc: "SC-4", name: "Three Days", ship: "Vision of the Seas", on: "2026-10-16", off: "2027-05-16", is_current: true, ours: true },
  { sc: "SC-5", name: "Trainer", ship: "Vision of the Seas", on: "2026-10-19", off: "2026-10-24", is_current: true, ours: true, visit: true },
  { sc: "SC-6", name: "Tomorrow", ship: "Vision of the Seas", on: "2026-10-20", off: "2027-05-20", is_current: true, ours: true },
];
const CONTACTS = [{ ship: "Grandeur of the Seas", email: "printer.gr@rccl.com", role: "printer_specialist" }];

function setup(mailOk = true) {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE crew (id TEXT, agency_id TEXT, first_name TEXT, last_name TEXT, rank_observed TEXT, email TEXT, baseline_count INTEGER)");
  d.exec("CREATE TABLE crew_override (agency_id TEXT, email TEXT)");
  d.exec("CREATE TABLE activity_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, detail TEXT, at TEXT)");
  d.exec("CREATE TABLE app_setting (k TEXT PRIMARY KEY, v TEXT)");
  d.exec("INSERT INTO crew VALUES ('c1','SC-1','Archie','Corpin',NULL,'archie@gmail.com',NULL), ('c3','SC-3','Two','Days',NULL,'two@gmail.com',NULL), ('c4','SC-4','Three','Days',NULL,'three@gmail.com',NULL), ('c7','SC-7','No','Mail',NULL,NULL,NULL)");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null, run: async () => ({ meta: { changes: d.prepare(sql).run(...args).changes } }) });
  const env = { DB: { prepare: (s) => stmt(s), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  const mail = [];
  const hub = installHub({ ensure: async (e) => { for (const q of HUB_DDL) await e.DB.prepare(q).run(); }, boardLegs: async () => LEGS, bonusCount: async () => null, json, today: () => TODAY });
  const legs = [...LEGS, { sc: "SC-7", ship: "Vision of the Seas", on: TODAY, off: "2027-05-19", is_current: true, ours: true }];
  const w = installWelcome({ ensure: async (e) => { for (const q of [...HUB_DDL, ...WELCOME_DDL]) await e.DB.prepare(q).run(); }, boardLegs: async () => legs,
    linkFor: (e, sc, who) => hub.linkFor(e, sc, who), contacts: async () => CONTACTS,
    sendMail: async (e, env2) => { mail.push(env2); return mailOk ? { ok: true } : { ok: false, error: "down" }; }, json, today: () => TODAY, origin: () => "https://cims.work" });
  return { d, env, w, mail };
}
const GATE = { scheduledTime: Date.UTC(2026, 9, 19, 11, 0) }; // 07:00 Miami time (EDT) — Miguel, 19 Oct 2026
const OFF_GATE = { scheduledTime: Date.UTC(2026, 9, 19, 9, 0) };

test("node:sqlite is available, so the tests below actually run", () => assert.ok(DatabaseSync));

test("recipients: the ship's mailbox and the personal address both To, never twice, Rita in copy", () => {
  assert.deepEqual(welcomeRecipients({ contacts: CONTACTS, ship: "Grandeur of the Seas", personal: "archie@gmail.com" }),
    { to: ["printer.gr@rccl.com", "archie@gmail.com"], ship: "printer.gr@rccl.com", personal: "archie@gmail.com", cc: [WELCOME_CC] });
  assert.deepEqual(welcomeRecipients({ contacts: CONTACTS, ship: "Vision of the Seas", personal: "x@y.com" }).to, ["x@y.com"], "no ship mailbox: the personal address alone");
  assert.deepEqual(welcomeRecipients({ contacts: CONTACTS, ship: "Grandeur of the Seas", personal: "PRINTER.GR@rccl.com" }).to, ["printer.gr@rccl.com"]);
  assert.deepEqual(welcomeRecipients({ contacts: [], ship: "X", personal: "-" }).to, []);
});

test("due: signed on today or within the catch-up, never a visit, never the future, never before the switch", () => {
  const due = (since) => welcomeDue(LEGS, TODAY, since).map((l) => l.sc).sort();
  assert.deepEqual(due(null), ["SC-1", "SC-3"]);
  assert.deepEqual(due("2026-10-18"), ["SC-1"], "a contract that started before the switch went on is never welcomed");
});

test("send: nothing attached, the hub link and the expense download inside, once per contract", async () => {
  const { d, env, w, mail } = setup();
  const dry = await w.sendFor(env, "SC-1", { dry: true });
  assert.equal(mail.length, 0, "a dry run sends nothing");
  assert.deepEqual(dry.to, ["printer.gr@rccl.com", "archie@gmail.com"]);
  const r = await w.sendFor(env, "SC-1", { by: "rita@x" });
  assert.ok(r.sent);
  assert.equal(mail.length, 1);
  const m = mail[0];
  assert.deepEqual(m.to, ["printer.gr@rccl.com", "archie@gmail.com"]);
  assert.deepEqual(m.cc, [WELCOME_CC]);
  assert.equal(m.replyTo, WELCOME_CC);
  assert.equal(m.attachments, undefined, "no files: the Crew Hub carries what the PDFs did");
  assert.match(m.html, /https:\/\/cims\.work\/hub\/[A-Za-z0-9_-]{32}/);
  assert.match(m.html, /https:\/\/cims\.work\/hub\/expense\.xlsx/);
  assert.doesNotMatch(m.html, /Also attached|attachment/i);
  assert.equal((await w.sendFor(env, "SC-1", {})).error, "already_sent");
  assert.ok((await w.sendFor(env, "SC-1", { resend: true })).sent, "a resend is a deliberate second send");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM welcome_send").get().n, 1);
  assert.equal((await w.sendFor(env, "SC-9", {})).error, "not_found");
});

test("send: a mail that did not go is not recorded, so the next morning tries again", async () => {
  const { d, env, w } = setup(false);
  const r = await w.sendFor(env, "SC-1", {});
  assert.equal(r.error, "mail_failed");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM welcome_send").get().n, 0);
});

test("the daily run: only at 08:00 Budapest, only when switched on, each contract once", async () => {
  const { d, env, w, mail } = setup();
  assert.equal((await w.run(env, GATE)).skipped, "disabled", "OFF until somebody switches it on");
  const sess = { email: "rita@x" };
  const toggle = await (await w.handle("/api/hub/welcome/auto", new Request("https://cims.work/api/hub/welcome/auto", { method: "POST", body: JSON.stringify({ enabled: true }) }), env, new URL("https://cims.work/api/hub/welcome/auto"), sess)).json();
  assert.deepEqual(toggle, { ok: true, enabled: true, since: TODAY });
  assert.equal((await w.run(env, OFF_GATE)).skipped, "not_gate_hour");
  assert.equal((await w.run(env, { scheduledTime: Date.UTC(2026, 9, 19, 6, 0) })).skipped, "not_gate_hour", "08:00 Budapest is no longer the hour");
  assert.equal(WELCOME_TZ, "America/New_York");
  assert.equal(WELCOME_HOUR, "07");
  const r1 = await w.run(env, GATE);
  assert.deepEqual(r1.sent.map((x) => x.sc), ["SC-1"], "switched on today: only today's sign-on");
  assert.deepEqual(r1.failed.map((x) => [x.sc, x.error]), [["SC-7", "no_recipient"]]);
  assert.equal(mail.length, 1);
  await w.run(env, GATE);
  assert.equal(mail.length, 1, "never twice");
  const winter = await w.run(env, { scheduledTime: Date.UTC(2026, 11, 1, 12, 0) }); // 07:00 EST: the hour follows Miami's clock
  assert.notEqual(winter.skipped, "not_gate_hour");
  assert.ok(d.prepare("SELECT 1 FROM activity_log WHERE action='welcome_send_failed'").get());
  assert.equal((await w.handle("/api/hub/welcome/send", new Request("https://cims.work/x", { method: "POST", body: "{}" }), env, new URL("https://cims.work/api/hub/welcome/send"), null)).status, 401);
});

test("wiring: the morning run is in scheduled(), the send route before the hub's, and nothing is attached anywhere", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /ctx\.waitUntil\(_welcome\.run\(env, event\)\.catch\(/);
  // The Automation rail names what each switch sends, in the order they go out (Miguel, 19 Oct 2026: "instruction of what ??").
  const rail = W.slice(W.indexOf("<div class=rauto>"), W.indexOf("<div class=rauto>") + 2000);
  const at = (t) => rail.indexOf(t);
  assert.ok(at(">Welcome email <input") > 0 && at(">Sign-off instructions <input") > at(">Welcome email <input") && at(">Sign-off link <input") > at(">Sign-off instructions <input"));
  assert.doesNotMatch(rail, />Instructions <input|>Welcome <input/);
  assert.match(W, /const _w = await _welcome\.handle\(p, request, env, url, session\); if \(_w\) return _w; const _h = await _hub/);
  const S = readFileSync(new URL("../src/welcome_send.js", import.meta.url), "utf8");
  assert.doesNotMatch(S, /attachments\s*:/);
  const T = readFileSync(new URL("../src/emails/hr.welcome.v1.js", import.meta.url), "utf8");
  assert.doesNotMatch(T, /Also attached/);
});
