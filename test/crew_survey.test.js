// THE CREW SURVEY (Miguel, 22–23 Oct 2026): one end-of-contract survey for all four cruise lines, asked the morning after
// the sign-off (CC Rita and Miguel), one reminder after 5 days, his copy on answering (CC Onboard Support), the report under
// Reports › Crew survey. Feedback only (§1). The routes run on real SQLite (node:sqlite); the page's own script runs in vm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { QUESTIONS, KEYS, SECTIONS, SUPERVISOR, statementFor, surveyDue, remindDue, checkAnswers, isNothing, surveyReport, periodFrom,
  readFormsSurvey, formsSurveyColumns, formsDay, SURVEY_DDL, SURVEY_CC, SURVEY_ANSWERS_CC, SURVEY_REPLY_TO } from "../src/crew_survey.js";
import { installSurvey, maskEmail, endedLegs } from "../src/crew_survey_send.js";
import { surveyInviteEmail } from "../src/emails/hr.survey.invite.v1.js";
import { surveyAnswersEmail } from "../src/emails/hr.survey.answers.v1.js";
import { surveyPage, SURVEY_CLIENT_JS } from "../src/crew_survey_page.js";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const TODAY = "2026-10-23";
const ALL5 = Object.fromEntries(KEYS.map((k) => [k, 5]));
const LEGS = [
  { sc: "SC-1", name: "Raymond Quiming", ship: "Infinity", brand: "Celebrity", on: "2026-03-01", off: "2026-10-22", is_current: false, ours: true, offSource: "tdg", disembark: "Fort Lauderdale" },
  { sc: "SC-2", name: "Projected Only", ship: "Allure of the Seas", brand: "Royal", on: "2026-03-01", off: "2026-10-01", is_current: true, ours: true, offSource: "projected" },
  { sc: "SC-3", name: "Trainer Visit", ship: "Pursuit", brand: "Azamara", on: "2026-10-16", off: "2026-10-22", is_current: false, ours: true, offSource: "rita", visit: true },
  { sc: "SC-4", name: "Long Ago", ship: "Quest", brand: "Azamara", on: "2026-02-01", off: "2026-09-01", is_current: false, ours: true, offSource: "tdg" },
  { sc: "SC-5", name: "No Mail", ship: "Getaway", brand: "NCL", on: "2026-04-01", off: "2026-10-20", is_current: false, ours: true, offSource: "card" },
  { sc: "SC-6", name: "Signs Off Today", ship: "Wonder of the Seas", brand: "Royal", on: "2026-03-23", off: TODAY, is_current: false, ours: true, offSource: "tdg" },
];

function setup({ mailOk = true, legs = LEGS } = {}) {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE crew (id TEXT, agency_id TEXT, first_name TEXT, last_name TEXT, email TEXT)");
  d.exec("CREATE TABLE crew_override (agency_id TEXT, email TEXT)");
  d.exec("CREATE TABLE activity_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, detail TEXT, at TEXT)");
  d.exec("CREATE TABLE app_setting (k TEXT PRIMARY KEY, v TEXT)");
  d.exec("INSERT INTO crew VALUES ('c1','SC-1','Raymond','Quiming','raymond.quiming@gmail.com'), ('c4','SC-4','Long','Ago','long@gmail.com'), ('c5','SC-5','No','Mail','-'), ('c6','SC-6','Signs','Today','today@gmail.com')");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null, run: async () => ({ meta: { changes: d.prepare(sql).run(...args).changes } }) });
  const env = { DB: { prepare: (s) => stmt(s), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
  const mail = [];
  const s = installSurvey({ ensure: async (e) => { for (const q of SURVEY_DDL) await e.DB.prepare(q).run(); }, boardLegs: async () => legs,
    sendMail: async (e, m) => { mail.push(m); return mailOk ? { ok: true } : { ok: false, error: "down" }; }, json, today: () => TODAY, origin: () => "https://hub.cims.work" });
  return { d, env, s, mail };
}
const GATE = { scheduledTime: Date.UTC(2026, 9, 23, 11, 0) }; // 07:00 Miami time (EDT)
const OFF_GATE = { scheduledTime: Date.UTC(2026, 9, 23, 13, 0) };
const SESSION = { email: "rita.berenyi@dg3.com" };
const call = (s, env, method, path, body, session = SESSION) => {
  const url = new URL("https://cims.work" + path);
  const req = new Request(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return s.handle(url.pathname, req, env, url, session);
};
const tokenOf = (m) => /\/hub\/survey\/([A-Za-z0-9_-]+)/.exec(m.html)[1];

test("node:sqlite is available, so the tests below actually run", () => assert.ok(DatabaseSync));

test("the questions: Rita's 19, in her order, every one on one of the five screens once", () => {
  assert.equal(QUESTIONS.length, 19);
  assert.deepEqual(KEYS, Array.from({ length: 19 }, (_, i) => "q" + String(i + 1).padStart(2, "0")));
  const onScreens = SECTIONS.flatMap((s) => s.keys).sort();
  assert.deepEqual(onScreens, KEYS.slice().sort());
  assert.equal(SECTIONS.filter((s) => s.open).length, 1, "one open question, on the last screen");
});

test("the supervisor statement names the line's own title (NCL: shipboard manager)", () => {
  const q = QUESTIONS.find((x) => x.key === "q07");
  assert.deepEqual(SUPERVISOR, { Royal: "GSM", Celebrity: "DCM", Azamara: "BOM", NCL: "shipboard manager" });
  assert.equal(statementFor(q, "Royal"), "My direct supervisor (GSM) provided clear direction and expectations.");
  assert.equal(statementFor(q, "NCL"), "My direct supervisor (shipboard manager) provided clear direction and expectations.");
  assert.equal(statementFor(q, null), "My direct supervisor provided clear direction and expectations.");
});

test("due: ended by TDG, Rita or a card, before today, inside the catch-up, never a projection or a visit, never before the switch", () => {
  const due = (since) => surveyDue(LEGS, TODAY, since).map((l) => l.sc).sort();
  assert.deepEqual(due(null), ["SC-1", "SC-5"], "SC-2 projected (held, still aboard), SC-3 a visit, SC-4 older than 14 days, SC-6 signs off today");
  assert.deepEqual(due("2026-10-21"), ["SC-1"], "a contract that ended before the switch went on is never asked");
  assert.equal(surveyDue([...LEGS, { ...LEGS[0] }], TODAY, null).length, 2, "one per contract");
  assert.equal(endedLegs(LEGS).length, 4, "the loop counts ended contracts (not the projection, not the visit)");
});

test("remind: once, 5 days after the invitation, while open and unanswered", () => {
  const base = { source: "console", invited_at: "2026-10-17T11:00:00Z", expires_at: "2026-11-30T23:59:59Z" };
  const now = "2026-10-23T11:00:00Z";
  assert.equal(remindDue([base], now).length, 1);
  assert.equal(remindDue([{ ...base, invited_at: "2026-10-19T11:00:00Z" }], now).length, 0, "4 days: not yet");
  assert.equal(remindDue([{ ...base, reminded_at: "x" }], now).length, 0);
  assert.equal(remindDue([{ ...base, submitted_at: "x" }], now).length, 0);
  assert.equal(remindDue([{ ...base, expires_at: "2026-10-22T00:00:00Z" }], now).length, 0);
  assert.equal(remindDue([{ ...base, source: "forms" }], now).length, 0);
});

test("answers: every statement a whole 1–5, the line optional text; anything else refused, never guessed", () => {
  assert.equal(checkAnswers(null).error, "no_answers");
  const r = checkAnswers({ answers: { ...ALL5, q03: 6, q04: 4.5, q05: true }, fix: "" });
  assert.equal(r.error, "incomplete");
  assert.deepEqual(r.missing, ["q03", "q04", "q05"]);
  assert.equal(checkAnswers({ answers: ALL5, fix: 12 }).error, "bad_fix");
  const ok = checkAnswers({ answers: { ...ALL5, q01: "3" }, fix: "  The hotel\r\n before embarking.  " });
  assert.equal(ok.ok, true);
  assert.equal(ok.answers.q01, 3);
  assert.equal(ok.fix, "The hotel\n before embarking.");
  assert.equal(checkAnswers({ answers: ALL5 }).fix, null);
  assert.ok(isNothing("Nothing") && isNothing("none.") && isNothing("N/A") && isNothing("Nothing to improve.") && isNothing("No comment") && isNothing("Nothing on my side, my contract went so smooth this time.") && isNothing("For me its nothing to improve.") && !isNothing("Nothing arrived on time") && !isNothing("No hotel before embarking"));
});

test("the emails: canonical letterhead, no rgba or gradient, bgcolor paired, the name escaped", () => {
  const inv = surveyInviteEmail({ first: "Ray<b>", ship: "Celebrity Infinity", shipShort: "Infinity", code: "IN", on: "1 Mar 2026", off: "22 Oct 2026", aboard: "7 mo 21 d", link: "https://hub.cims.work/hub/survey/abc", expires: "22 Nov", today: "23 Oct 2026" });
  const rem = surveyInviteEmail({ first: "Ray", ship: "Celebrity Infinity", link: "x", expires: "22 Nov", today: "28 Oct 2026", reminder: true });
  const ans = surveyAnswersEmail({ first: "Ray", ship: "Celebrity Infinity", brand: "Celebrity", when: "23 Oct 2026", answers: { ...ALL5, q06: 2, q10: 3 }, fix: "Inventory on time" });
  const mast = readFileSync(new URL("../src/cims-mast.js", import.meta.url), "utf8");
  for (const m of [inv, rem, ans]) {
    assert.ok(!/rgba\(|gradient/i.test(m.html), "Outlook drops rgba and gradients");
    assert.ok(m.html.includes("CRUISE INDUSTRY MANAGED SERVICES"), "the canonical letterhead");
    assert.ok(m.text && m.subject);
    for (const tag of m.html.match(/<t[dr][^>]*bgcolor="[^"]+"[^>]*>/g) || []) assert.match(tag, /background:/, "bgcolor paired with style");
  }
  assert.ok(mast.length > 0);
  assert.ok(inv.html.includes("Ray&lt;b&gt;") && !inv.html.includes("Ray<b>"));
  assert.match(inv.subject, /^Welcome home/);
  assert.match(rem.subject, /^Still a minute/);
  assert.ok(rem.html.includes("A REMINDER"));
  assert.ok(ans.html.includes("17 of 19 at 5"));
  assert.ok(ans.html.includes("(DCM)"), "the brand's own supervisor title");
  // Nothing promised, nothing left pending (Miguel, 23 Oct 2026: "make them generic all of them .. I don't want anything
  // standing or pending"): no reply, no deadline, in any email or on the page the seafarer reads.
  assert.ok(ans.html.includes("The whole CIMS team sees it."));
  const page = surveyPage({ first: "Ray", ship: "X", brand: "Royal" }) + SURVEY_CLIENT_JS;
  for (const [name, txt] of [["invite", inv.html + inv.text], ["reminder", rem.html + rem.text], ["answers", ans.html + ans.text], ["page", page]]) {
    assert.ok(!/writes back|within a week|will reply|answers this one|gets back to you/i.test(txt), name + " promises a reply");
  }
  assert.ok(ans.html.includes("never part of your bonus"));
});

test("the page: its script runs, walks the five screens, posts the 19 answers and the line, and shows the thank-you", async () => {
  const html = surveyPage({ first: "Raymond", ship: "Celebrity Infinity", shipShort: "Infinity", brand: "Celebrity", on: "1 Mar 2026", off: "22 Oct 2026", aboard: "7 mo 21 d", email: "ray•••@gmail.com" });
  const model = /<script id="m" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.ok(!/<\/script/i.test(model.replace(/<\/script>$/, "")));
  const app = { innerHTML: "" };
  const fix = { value: "" };
  const posted = [];
  const ctx = {
    document: { getElementById: (id) => (id === "m" ? { textContent: model } : id === "fix" && app.innerHTML.includes('id="fix"') ? fix : null), querySelector: () => app, body: { getAttribute: () => null } },
    window: { scrollTo() {} }, location: { pathname: "/hub/survey/tok" }, JSON, Math, Object, String,
    fetch: (u, o) => { posted.push([u, JSON.parse(o.body)]); return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }); },
  };
  vm.createContext(ctx);
  vm.runInContext(SURVEY_CLIENT_JS, ctx);
  assert.match(app.innerHTML, /How was Infinity, Raymond\?/);
  vm.runInContext("go(1)", ctx);
  assert.match(app.innerHTML, /disabled/, "Next waits until the screen is answered");
  vm.runInContext("M.sections.forEach(function(S){ S.qs.forEach(function(q){ pick(q.key, 4); }); }); go(M.sections.length)", ctx);
  assert.match(app.innerHTML, /\(DCM\)|Send my answers/);
  fix.value = "Parts arrive late";
  vm.runInContext("send()", ctx);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(posted.length, 1);
  assert.equal(posted[0][0], "/hub/survey/tok");
  assert.equal(Object.keys(posted[0][1].answers).length, 19);
  assert.equal(posted[0][1].fix, "Parts arrive late");
  assert.match(app.innerHTML, /Thank you, Raymond\./);
  assert.match(app.innerHTML, /ray•••@gmail\.com/);
});

test("invite: the seafarer To, Rita and Miguel CC, reply-to Rita, once per contract; a failed mail leaves no row", async () => {
  const { d, env, s, mail } = setup();
  const r = await s.invite(env, LEGS[0]);
  assert.equal(r.sent, true);
  assert.deepEqual(mail[0].to, ["raymond.quiming@gmail.com"]);
  assert.deepEqual(mail[0].cc, SURVEY_CC);
  assert.equal(mail[0].replyTo, SURVEY_REPLY_TO);
  assert.match(mail[0].html, /https:\/\/hub\.cims\.work\/hub\/survey\/[A-Za-z0-9_-]{20,}/);
  assert.match(mail[0].html, /via Fort Lauderdale/);
  assert.equal((await s.invite(env, LEGS[0])).error, "already_invited");
  assert.equal(mail.length, 1);
  assert.equal((await s.invite(env, LEGS[4])).error, "no_email", "TDG's '-' is no address");
  const row = d.prepare("SELECT * FROM crew_survey").get();
  assert.equal(row.on_key, "2026-03-01");
  assert.equal(row.brand, "Celebrity");
  assert.ok(row.invited_at && row.expires_at.startsWith("2026-11-22"));
  const f = setup({ mailOk: false });
  assert.equal((await f.s.invite(f.env, LEGS[0])).error, "mail_failed");
  assert.equal(f.d.prepare("SELECT COUNT(*) n FROM crew_survey").get().n, 0, "the next morning tries again");
});

test("the daily run: 07:00 Miami, only when switched on, never a contract ended before the switch; one reminder after 5 days", async () => {
  const { d, env, s, mail } = setup();
  assert.equal((await s.run(env, GATE)).skipped, "disabled");
  const on = await call(s, env, "POST", "/api/survey/auto", { enabled: true });
  assert.deepEqual(await on.json(), { ok: true, enabled: true, since: TODAY });
  assert.equal((await s.run(env, OFF_GATE)).skipped, "not_gate_hour");
  assert.equal((await s.run(env, GATE)).invited.length, 0, "SC-1 ended yesterday, before the switch went on");
  d.prepare("UPDATE app_setting SET v='2026-10-15' WHERE k='crew_survey_auto_since'").run();
  const rep = await s.run(env, GATE);
  assert.deepEqual(rep.invited.map((x) => x.sc), ["SC-1"]);
  assert.deepEqual(rep.failed.map((x) => [x.sc, x.error]), [["SC-5", "no_email"]]);
  assert.equal((await s.run(env, GATE)).invited.length, 0, "never twice");
  d.prepare("UPDATE crew_survey SET invited_at='2026-10-17T11:00:00Z'").run();
  const again = await s.run(env, GATE);
  assert.deepEqual(again.reminded, ["SC-1"]);
  assert.match(mail[mail.length - 1].subject, /^Still a minute, Raymond\?/);
  assert.deepEqual(mail[mail.length - 1].cc, SURVEY_CC);
  assert.equal((await s.run(env, GATE)).reminded.length, 0, "one reminder");
});

test("the seafarer's page: opens with no login, records the open, takes the answers ONCE, his copy CC Onboard Support", async () => {
  const { d, env, s, mail } = setup();
  await s.invite(env, LEGS[0]);
  const tok = tokenOf(mail[0]);
  const page = await call(s, env, "GET", "/hub/survey/" + tok, null, null);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("Cache-Control"), "no-store");
  const html = await page.text();
  assert.match(html, /ray•••@gmail\.com/);
  assert.ok(!html.includes("raymond.quiming@gmail.com"), "the address is never printed whole");
  assert.ok(d.prepare("SELECT opened_at FROM crew_survey").get().opened_at);
  const bad = await call(s, env, "POST", "/hub/survey/" + tok, { answers: { q01: 5 } }, null);
  assert.equal(bad.status, 400);
  const ok = await call(s, env, "POST", "/hub/survey/" + tok, { answers: { ...ALL5, q06: 1, q10: 2, q14: 2 }, fix: "Inventory never on time" }, null);
  assert.deepEqual(await ok.json(), { ok: true, copy: true });
  const copy = mail[mail.length - 1];
  assert.deepEqual(copy.to, ["raymond.quiming@gmail.com"]);
  assert.deepEqual(copy.cc, [SURVEY_ANSWERS_CC]);
  assert.match(copy.html, /Inventory never on time/);
  const twice = await call(s, env, "POST", "/hub/survey/" + tok, { answers: ALL5 }, null);
  assert.equal(twice.status, 409);
  assert.match(await (await call(s, env, "GET", "/hub/survey/" + tok, null, null)).text(), /Thank you, Raymond/);
  assert.equal((await call(s, env, "GET", "/hub/survey/notarealtokenatall12345", null, null)).status, 404);
  d.prepare("UPDATE crew_survey SET submitted_at=NULL, expires_at='2026-01-01T00:00:00Z'").run();
  assert.equal((await call(s, env, "GET", "/hub/survey/" + tok, null, null)).status, 410, "a closed link");
});

test("the report: needs a call at 3+ lows, Log the call, the loop, the lines; signed in only", async () => {
  const { env, s, mail } = setup();
  await s.invite(env, LEGS[0]);
  await call(s, env, "POST", "/hub/survey/" + tokenOf(mail[0]), { answers: { ...ALL5, q06: 1, q10: 2, q14: 2, q19: 4 }, fix: "Inventory never on time" }, null);
  assert.equal((await call(s, env, "GET", "/api/survey/report", null, null)).status, 401);
  const r = await (await call(s, env, "GET", "/api/survey/report")).json();
  assert.equal(r.n, 1);
  assert.equal(r.byLineCount.Celebrity, 1);
  assert.equal(r.needsCall.length, 1);
  assert.deepEqual(r.needsCall[0].low.map((x) => x.key), ["q06", "q10", "q14"]);
  assert.equal(r.statements[0].key, "q06", "where it hurts: lowest first");
  assert.deepEqual(r.wouldReturn, { yes: 1, of: 1 });
  assert.deepEqual(r.rate, { answered: 1, of: 1 });
  assert.equal(r.loop.signedOff, 4);
  assert.deepEqual(r.loop.noEmail.map((x) => x.sc), ["SC-5"]);
  assert.equal(r.fixes[0].text, "Inventory never on time");
  assert.equal(r.enabled, false);
  const c = await (await call(s, env, "POST", "/api/survey/call", { id: r.needsCall[0].id, note: "Spoke Friday" })).json();
  assert.equal(c.ok, true);
  const r2 = await (await call(s, env, "GET", "/api/survey/report?line=Royal")).json();
  assert.equal(r2.n, 0, "a line filter");
  const r3 = await (await call(s, env, "GET", "/api/survey/report")).json();
  assert.equal(r3.needsCall.length, 0);
  assert.equal(r3.called[0].call_note, "Spoke Friday");
  assert.equal(r3.called[0].called_by, SESSION.email);
});

test("preview: a crew's real data, no link made, nothing sent", async () => {
  const { d, env, s, mail } = setup();
  for (const what of ["page", "invite", "reminder", "answers"]) {
    const r = await call(s, env, "GET", "/api/survey/preview?id=SC-1&what=" + what);
    assert.equal(r.status, 200, what);
    assert.match(await r.text(), /Raymond/);
  }
  assert.equal(mail.length, 0);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='crew_survey'").get().n, 0, "not even the table");
});

test("periods and the Forms history reader", () => {
  assert.equal(periodFrom("YTD", TODAY), "2026-01-01");
  assert.equal(periodFrom("QTD", TODAY), "2026-10-01");
  assert.equal(periodFrom("30D", TODAY), "2026-09-23");
  assert.equal(formsDay("8/13/26 11:41:42"), "2026-08-13");
  assert.equal(formsDay(46248), "2026-08-14");
  const header = ["ID", "Start time", "Completion time", "Email", "Name", "Write your name", "Select your current or last ship", ...QUESTIONS.map((q) => q.text.replace("{M}", "")), "What is the one thing we should fix first to improve the seafarer experience?"];
  const c = formsSurveyColumns(header);
  assert.equal(Object.keys(c.keys).length, 19);
  const row = (id, v) => [id, "", "10/6/26 09:00:00", "", "", "Ryan Marto", "Quantum", ...KEYS.map(() => v), "Nothing"];
  const out = readFormsSurvey([header, row(57, 4), [58, "", "10/7/26 09:00:00", "", "", "X", "Y", 5], row(59, 2)], { place: (n) => (n === "Ryan Marto" ? { sc: "SC-0029999", why: "full name" } : null), brandOf: () => "Royal" });
  assert.deepEqual(out.rows.map((r) => r.form_no), [57, 59]);
  assert.deepEqual(out.skipped, [{ form: 58, why: "not every statement answered" }]);
  assert.equal(out.rows[0].agency_id, "SC-0029999");
  assert.equal(out.rows[0].submitted, "2026-10-06");
  assert.equal(readFormsSurvey([["ID", "Other"]]).error, "not_the_exit_survey");
});

test("never money, never the cruise line: the survey modules import nothing from the bonus path", () => {
  for (const f of ["crew_survey.js", "crew_survey_send.js", "crew_survey_page.js", "emails/hr.survey.invite.v1.js", "emails/hr.survey.answers.v1.js"]) {
    const src = readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
    assert.ok(!/from\s+["'][^"']*(bonus|score_auto|seval)[^"']*["']/.test(src), f + " imports from the bonus path");
    assert.ok(!/bonus_outcome/.test(src.replace(/\/\/.*$/gm, "")), f + " names bonus_outcome");
  }
  assert.equal(maskEmail("raymond.quiming@gmail.com"), "ray•••@gmail.com");
  const mig = readFileSync(new URL("../migrations/0040_crew_survey.sql", import.meta.url), "utf8");
  for (const q of SURVEY_DDL) assert.ok(mig.includes(q), "the migration mirrors SURVEY_DDL");
});
