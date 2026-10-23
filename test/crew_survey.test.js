// THE CREW SURVEY (Miguel, 22–23 Oct 2026): one end-of-contract survey for all four cruise lines, asked the morning after
// the sign-off (CC Rita and Miguel), one reminder after 5 days, his copy on answering (CC Onboard Support), the report under
// Reports › Crew survey. Feedback only (§1). The routes run on real SQLite (node:sqlite); the page's own script runs in vm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { QUESTIONS, KEYS, FORMS_KEYS, SECTIONS, surveySkip, quickAnswer, QUICK_SECS, SUPERVISOR, statementFor, surveyDue, remindDue, checkAnswers, isNothing, surveyReport, periodFrom,
  readFormsSurvey, formsSurveyColumns, formsDay, SURVEY_DDL, SURVEY_ALTERS, SURVEY_CC, SURVEY_ANSWERS_CC, SURVEY_REPLY_TO,
  fixGroups, fixClause, allSame, surveyHeadline, FIX_THEMES } from "../src/crew_survey.js";
import { composeSurveyReport } from "../src/crew_survey_pdf.js";
import { installSurvey, maskEmail, endedLegs } from "../src/crew_survey_send.js";
import { surveyInviteEmail } from "../src/emails/hr.survey.invite.v1.js";
import { surveyAnswersEmail } from "../src/emails/hr.survey.answers.v1.js";
import { surveyPage, SURVEY_CLIENT_JS } from "../src/crew_survey_page.js";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const TODAY = "2026-10-23";
const ALL5 = Object.fromEntries(KEYS.map((k) => [k, 5]));
const LEGS = [
  { sc: "SC-1", name: "Raymond Quiming", ship: "Infinity", brand: "Celebrity", on: "2026-03-01", off: "2026-10-19", is_current: false, ours: true, offSource: "tdg", disembark: "Fort Lauderdale" },
  { sc: "SC-2", name: "Projected Only", ship: "Allure of the Seas", brand: "Royal", on: "2026-03-01", off: "2026-10-01", is_current: true, ours: true, offSource: "projected" },
  { sc: "SC-3", name: "Trainer Visit", ship: "Pursuit", brand: "Azamara", on: "2026-10-16", off: "2026-10-22", is_current: false, ours: true, offSource: "rita", visit: true },
  { sc: "SC-4", name: "Long Ago", ship: "Quest", brand: "Azamara", on: "2026-02-01", off: "2026-09-01", is_current: false, ours: true, offSource: "tdg" },
  { sc: "SC-5", name: "No Mail", ship: "Getaway", brand: "NCL", on: "2026-04-01", off: "2026-10-18", is_current: false, ours: true, offSource: "card" },
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
  const s = installSurvey({ ensure: async (e) => { for (const q of SURVEY_DDL) await e.DB.prepare(q).run(); for (const q of SURVEY_ALTERS) await e.DB.prepare(q).run().catch((x) => { if (!/duplicate column/.test(x.message)) throw x; }); }, boardLegs: async () => legs,
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

test("the questions: Rita's 19 in her order + travel & joining (q20), every one on one of the five screens once", () => {
  assert.equal(QUESTIONS.length, 20);
  assert.deepEqual(KEYS, Array.from({ length: 20 }, (_, i) => "q" + String(i + 1).padStart(2, "0")));
  assert.deepEqual(FORMS_KEYS, KEYS.slice(0, 19), "the Forms survey asked Rita's 19, never q20");
  assert.equal(QUESTIONS[19].text, "My travel, hotel and joining arrangements were well organized.");
  assert.deepEqual(SECTIONS[0].keys, ["q01", "q02", "q03", "q04", "q20"], "travel sits with the job and the first weeks");
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
  assert.deepEqual(due("2026-10-19"), ["SC-1"], "a contract that ended before the switch went on is never asked");
  const at = (off) => surveyDue([{ ...LEGS[0], off }], TODAY, null).length;
  assert.deepEqual([at("2026-10-22"), at("2026-10-21"), at("2026-10-20")], [0, 0, 1], "asked 3 days after the sign-off, never the morning after");
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
  assert.ok(ans.html.includes("18 of 20 at 5"));
  assert.ok(inv.html.includes("20 taps."));
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
  assert.equal(Object.keys(posted[0][1].answers).length, 20);
  assert.ok(Number.isInteger(posted[0][1].secs) && posted[0][1].secs >= 0, "the page sends how long it took, Start to Send");
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
  assert.equal((await s.run(env, GATE)).invited.length, 0, "SC-1 ended 4 days ago, before the switch went on");
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

test("the report: the watchlist at 3+ lows, the loop, the lines; no call is logged here; signed in only", async () => {
  const { env, s, mail } = setup();
  await s.invite(env, LEGS[0]);
  await call(s, env, "POST", "/hub/survey/" + tokenOf(mail[0]), { answers: { ...ALL5, q06: 1, q10: 2, q14: 2, q19: 4 }, fix: "Inventory never on time" }, null);
  assert.equal((await call(s, env, "GET", "/api/survey/report", null, null)).status, 401);
  const r = await (await call(s, env, "GET", "/api/survey/report")).json();
  assert.equal(r.n, 1);
  assert.equal(r.byLineCount.Celebrity, 1);
  assert.equal(r.watch.length, 1);
  assert.deepEqual(r.watch[0].low.map((x) => x.key), ["q06", "q10", "q14"]);
  assert.equal(r.statements[0].key, "q06", "where it hurts: lowest first");
  assert.deepEqual(r.wouldReturn, { yes: 1, of: 1 });
  assert.deepEqual(r.rate, { answered: 1, of: 1 });
  assert.equal(r.loop.signedOff, 4);
  assert.deepEqual(r.loop.noEmail.map((x) => x.sc), ["SC-5"]);
  assert.equal(r.fixes[0].text, "Inventory never on time");
  assert.equal(r.enabled, false);
  const c = await call(s, env, "POST", "/api/survey/call", { id: r.watch[0].id, note: "Spoke Friday" });
  assert.notEqual(c.status, 200, "a call is a note on the profile, never logged on the report (Miguel, 23 Oct 2026)");
  const r2 = await (await call(s, env, "GET", "/api/survey/report?line=Royal")).json();
  assert.equal(r2.n, 0, "a line filter");
  const r3 = await (await call(s, env, "GET", "/api/survey/report")).json();
  assert.equal(r3.watch.length, 1, "the watchlist is the period's answers, nothing ticks it off");
  assert.equal(r3.called, undefined);
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
  // Rita's export carries her 19 statements, never q20
  const header = ["ID", "Start time", "Completion time", "Email", "Name", "Write your name", "Select your current or last ship", ...QUESTIONS.filter((q) => q.key !== "q20").map((q) => q.text.replace("{M}", "")), "What is the one thing we should fix first to improve the seafarer experience?"];
  const c = formsSurveyColumns(header);
  assert.equal(Object.keys(c.keys).length, 19);
  const row = (id, v) => [id, "", "10/6/26 09:00:00", "", "", "Ryan Marto", "Quantum", ...FORMS_KEYS.map(() => v), "Nothing"];
  const out = readFormsSurvey([header, row(57, 4), [58, "", "10/7/26 09:00:00", "", "", "X", "Y", 5], row(59, 2)], { place: (n) => (n === "Ryan Marto" ? { sc: "SC-0029999", why: "full name" } : null), brandOf: () => "Royal" });
  assert.deepEqual(out.rows.map((r) => r.form_no), [57, 59]);
  assert.deepEqual(out.skipped, [{ form: 58, why: "not every statement answered" }]);
  assert.equal(out.rows[0].agency_id, "SC-0029999");
  assert.equal(out.rows[0].submitted, "2026-10-06");
  assert.equal(readFormsSurvey([["ID", "Other"]]).error, "not_the_exit_survey");
});

test("never money, never the cruise line: the survey modules import nothing from the bonus path", () => {
  for (const f of ["crew_survey.js", "crew_survey_send.js", "crew_survey_page.js", "crew_survey_pdf.js", "emails/hr.survey.invite.v1.js", "emails/hr.survey.answers.v1.js"]) {
    const src = readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
    assert.ok(!/from\s+["'][^"']*(bonus|score_auto|seval)[^"']*["']/.test(src), f + " imports from the bonus path");
    assert.ok(!/bonus_outcome/.test(src.replace(/\/\/.*$/gm, "")), f + " names bonus_outcome");
  }
  assert.equal(maskEmail("raymond.quiming@gmail.com"), "ray•••@gmail.com");
  const mig = readFileSync(new URL("../migrations/0040_crew_survey.sql", import.meta.url), "utf8");
  for (const q of SURVEY_DDL) assert.ok(mig.includes(q), "the migration mirrors SURVEY_DDL");
  const mig41 = readFileSync(new URL("../migrations/0041_crew_survey_secs.sql", import.meta.url), "utf8");
  for (const q of SURVEY_ALTERS) assert.ok(mig41.includes(q), "0041 mirrors SURVEY_ALTERS");
});

// ---- 23 Oct 2026, Miguel: "2. yes to all. 3. yes do it. 4. ok." --------------------------------------------------------

test("who is not asked: Not for Rehire (TDG's word or Rita's), Performance, Medical, Compassionate; anyone else is", () => {
  assert.equal(surveySkip({ rawStatus: "Not for Rehire" }), "not_for_rehire");
  assert.equal(surveySkip({ rawStatus: "On Vacation", status: "Not for rehire" }), "not_for_rehire", "Rita's manual status counts too");
  assert.equal(surveySkip({ endReason: "Performance" }), "performance");
  assert.equal(surveySkip({ endReason: "Medical" }), "medical");
  assert.equal(surveySkip({ endReason: "Compassionate" }), "compassionate");
  for (const r of ["Completed", "Resigned", "Early relief", "Emergency", "Other", null]) assert.equal(surveySkip({ rawStatus: "On Vacation", endReason: r }), null, String(r));
});

test("the run skips them, the report lists them with the reason, Send anyway asks him by hand", async () => {
  const { d, env, s, mail } = setup();
  d.exec("CREATE TABLE registry_snapshot (agency_id TEXT, status TEXT, raw_status TEXT)");
  d.exec("CREATE TABLE contract_end (sc TEXT, on_key TEXT, reason TEXT)");
  d.exec("INSERT INTO registry_snapshot VALUES ('SC-1','Inactive','Not for Rehire')");
  await call(s, env, "POST", "/api/survey/auto", { enabled: true });
  d.prepare("UPDATE app_setting SET v='2026-10-15' WHERE k='crew_survey_auto_since'").run();
  const rep = await s.run(env, GATE);
  assert.deepEqual(rep.invited, [], "Not for Rehire is never asked");
  assert.deepEqual(rep.skipped.map((x) => [x.sc, x.why]), [["SC-1", "not_for_rehire"]]);
  assert.equal(mail.length, 0);
  const r = await (await call(s, env, "GET", "/api/survey/report")).json();
  assert.deepEqual(r.loop.skipped.map((x) => [x.sc, x.on, x.label]), [["SC-1", "2026-03-01", "Not for Rehire"]]);
  const sent = await call(s, env, "POST", "/api/survey/send", { sc: "SC-1", on: "2026-03-01" });
  assert.equal(sent.status, 200);
  assert.deepEqual(mail[0].to, ["raymond.quiming@gmail.com"]);
  const r2 = await (await call(s, env, "GET", "/api/survey/report")).json();
  assert.equal(r2.loop.skipped.length, 0, "once asked by hand he leaves the not-asked list");
  assert.equal((await call(s, env, "POST", "/api/survey/send", { sc: "SC-1", on: "2026-03-01" })).status, 409, "never twice");
  assert.equal((await call(s, env, "POST", "/api/survey/send", { sc: "SC-2", on: "2026-03-01" })).status, 404, "a projection is no ended contract");
  assert.equal((await call(s, env, "POST", "/api/survey/send", { sc: "SC-1", on: "2026-03-01" }, null)).status, 401);
  // the end reason Rita recorded for that contract
  const t = setup();
  t.d.exec("CREATE TABLE contract_end (sc TEXT, on_key TEXT, reason TEXT)");
  t.d.exec("INSERT INTO contract_end VALUES ('SC-1','2026-03-01','Medical')");
  await call(t.s, t.env, "POST", "/api/survey/auto", { enabled: true });
  t.d.prepare("UPDATE app_setting SET v='2026-10-15' WHERE k='crew_survey_auto_since'").run();
  assert.deepEqual((await t.s.run(t.env, GATE)).skipped.map((x) => x.why), ["medical"]);
});

test("quick answers: the time is kept, the same answer to everything in under a minute is listed but left out of the averages", async () => {
  const { d, env, s, mail } = setup();
  await s.invite(env, LEGS[0]);
  await call(s, env, "POST", "/hub/survey/" + tokenOf(mail[0]), { answers: ALL5, fix: "", secs: 22 }, null);
  assert.equal(d.prepare("SELECT answer_secs FROM crew_survey").get().answer_secs, 22);
  d.exec("INSERT INTO crew_survey (id, source, agency_id, crew_name, ship, brand, submitted_at, answers_json, form_no, created_at) VALUES ('srv_forms_1','forms','SC-4','Long Ago','Quest','Azamara','2026-10-01T12:00:00Z','" + JSON.stringify({ ...ALL5, q18: 3 }) + "',1,'x')");
  const r = await (await call(s, env, "GET", "/api/survey/report")).json();
  assert.equal(r.n, 2);
  assert.equal(r.quick, 1);
  assert.equal(r.overall, 3, "the quick all-5 answer does not lift the average");
  assert.equal(r.list.find((x) => x.source === "console").quick, true);
  assert.equal(quickAnswer({ source: "console", answer_secs: QUICK_SECS, answers: ALL5 }), false, "a full minute is not quick");
  assert.equal(quickAnswer({ source: "console", answer_secs: 10, answers: { ...ALL5, q03: 4 } }), false, "different answers are not a tap-through");
  assert.equal(quickAnswer({ source: "forms", answers: ALL5 }), false, "Forms answers have no timing");
  assert.equal(checkAnswers({ answers: ALL5, secs: -3 }).secs, null);
  assert.equal(checkAnswers({ answers: ALL5, secs: "40" }).secs, null);
});

test("his own answers on his profile and in the internal crew file, never on his statement", async () => {
  const { buildCrewProfile, feedbackFile } = await import("../src/crew_profile.js");
  const ans = { ...ALL5, q06: 1, q10: 2, q14: 2, q18: 4 };
  const P = buildCrewProfile({
    today: "2026-10-23", crew: { agency_id: "SC-1", status: "On Vacation", first_name: "Raymond", last_name: "Quiming" }, override: null,
    snap: { agency_id: "SC-1", status: "On Vacation", raw_status: "On Vacation", vessel: "Celebrity Infinity", run_at: "2026-10-23T09:00:00Z", embarked_at: "2026-03-01", debarked_at: "2026-10-22" },
    count: null, countAdded: 0, grade: null,
    legs: [{ ship: "Infinity", sc: "SC-1", ours: true, on: "2026-03-01", off: "2026-10-22", is_current: false, source: "registry", offSource: "tdg", brand: "Celebrity" }],
    counter: [], edits: [], notes: [], ready: null, intel: [], fbReqs: [], fbResp: [], sbmRequests: [], sbm: [], cards: [], deploys: [], dismissals: [],
    statusRows: [], travel: [], activity: [], instr: [], links: [], fleetLegs: [], openCards: [], tdgEarmarks: [], ends: [], audits: [], auditOpen: [], auditFollowups: [], names: {},
    surveys: [{ id: "srv_1", source: "console", ship: "Celebrity Infinity", submitted_at: "2026-10-23T14:02:00Z", answers_json: JSON.stringify(ans), fix_text: "Hotel before embarking", answer_secs: 140 }],
  });
  const f = P.people.feed.find((x) => x.kind === "survey");
  assert.ok(f, "the survey is in What people said");
  assert.equal(f.overall, 4);
  assert.deepEqual(f.low.map((x) => x.key), ["q06", "q10", "q14"]);
  assert.equal(f.fix, "Hotel before embarking");
  assert.equal(f.quick, false);
  const file = feedbackFile(P, "2026-10-23");
  const item = file.groups.flatMap((g) => g.items).find((i) => i.kind === "survey");
  assert.ok(item && item.label === "Crew survey (his own answers)");
  assert.ok(item.lines.some((l) => l.label === "Fix first" && l.text === "Hotel before embarking"));
  const stmt = readFileSync(new URL("../src/statement.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/crew_survey|kind === "survey"/.test(stmt), "the crew's statement never prints his survey");
});

// ---- 23 Oct 2026, the HR view (Miguel: "1. no. 2. yes. 3. not .. 4. pdf") -------------------------------------------------
// The seven Forms answers on file that day, as they are (Marto's deleted): four all 5s, one 3 on onboarding, Jeremy's two
// fixes in one sentence, Andrea's 3 on SOPs and seven 4s.
const F = (name, ship, brand, at, diff, fix) => ({ id: "f_" + name.split(" ")[0], source: "forms", crew_name: name, ship, brand, submitted_at: at + "T12:00:00Z",
  answers: Object.fromEntries(KEYS.filter((k) => k !== "q20").map((k) => [k, diff[k] || 5])), fix_text: fix });
const REAL7 = [
  F("Allen Cedilla", "Brilliance of the Seas", "Royal", "2026-08-13", { q02: 3 }, "Nothing on my side, my contract went so smooth this time. Thank you for everything"),
  F("Darryl Ramos", "Celebrity Constellation", "Celebrity", "2026-09-19", {}, "Nothing"),
  F("Raymond Quiming", "Celebrity Infinity", "Celebrity", "2026-09-19", {}, "hotel accommodations before embarking."),
  F("Manuel Reyes", "Odyssey of the Seas", "Royal", "2026-09-19", {}, "For me its nothing to improve."),
  F("Edward Francis Guazon", "Liberty of the Seas", "Royal", "2026-09-19", {}, null),
  F("Jeremy Padilla", "Celebrity Ascent", "Celebrity", "2026-09-19", { q11: 4 }, "DG3 Has Been Good To Me Since My First Contract, Probably Some Suggestion I Could State Is The Return Of The Internet Allowance, And A More In Depth Training Regarding  Production Machine Troubleshooting. To Better Understand How The Print Machine Works."),
  F("Andrea Joyce M. Calayag", "Navigator of the Seas", "Royal", "2026-10-02", { q01: 4, q04: 4, q05: 3, q15: 4, q16: 4, q17: 4, q18: 4, q19: 4 }, null),
];

test("the HR view on the real answers: the headline says how little we know, an empty watchlist, themes by line with n", () => {
  const r = surveyReport({ rows: REAL7, ended: [], today: TODAY, p: "YTD" });
  assert.equal(r.n, 7);
  assert.equal(r.allSame, 4, "Darryl, Raymond, Manuel, Edward: the same number to every statement");
  assert.deepEqual(r.headline, { lead: "Crew say they are happy.", rest: "We are hearing from too few to be sure.",
    sub: "7 answers this year, 4 of them the same number to every statement. Read the scores as a floor check, not a measure, until there are 20 answers. The words say more." });
  assert.equal(r.watch.length, 0);
  const job = r.themes.find((t) => t.title === "The job");
  assert.deepEqual(job.cells.Royal, { n: 4, avg: 4.75 });
  assert.deepEqual(job.cells.Celebrity, { n: 3, avg: 5 });
  assert.deepEqual(job.cells.Azamara, { n: 0, avg: null });
  assert.deepEqual(job.all, { n: 7, avg: 4.86 });
  assert.deepEqual(r.themes.map((t) => t.title), ["The job", "The print shop", "Support", "You", "Would return"]);
  const royalOnly = surveyReport({ rows: REAL7, ended: [], today: TODAY, p: "YTD", line: "Royal" });
  assert.equal(royalOnly.n, 4);
  assert.deepEqual(royalOnly.themes[0].cells.Celebrity, { n: 3, avg: 5 }, "the theme table is every line, whatever the chip");
  assert.deepEqual(r.quarters.map((q) => [q.q, q.n, q.shown]), [["2026-Q3", 6, false], ["2026-Q4", 1, false]], "a quarter shows with 10 answers");
});

test("the fixes, grouped by keyword with their owners (Miguel: '2. yes'); one sentence with two fixes counts under both", () => {
  assert.deepEqual(FIX_THEMES.map((t) => [t.label, t.owner]), [["Travel & joining", "Rita / TDG"], ["Pay & benefits", "Miguel"], ["Training", "Ray / Rolando"]]);
  const r = surveyReport({ rows: REAL7, ended: [], today: TODAY, p: "YTD" });
  const by = Object.fromEntries(r.fixGroups.map((g) => [g.key, g]));
  assert.deepEqual(Object.keys(by).sort(), ["pay", "training", "travel"], "'Nothing on my side' and 'For me its nothing to improve' are not fixes");
  assert.equal(by.travel.items[0].name, "Raymond Quiming");
  assert.equal(by.travel.items[0].clause, "hotel accommodations before embarking.");
  assert.equal(by.pay.items[0].clause, "\u2026Probably Some Suggestion I Could State Is The Return Of The Internet Allowance\u2026");
  assert.match(by.training.items[0].clause, /^\u2026A More In Depth Training Regarding {2}Production Machine Troubleshooting\u2026$/);
  assert.equal(by.pay.hot, false);
  const three = fixGroups([1, 2, 3].map((i) => ({ text: "The hotel was far " + i, name: "x" + i })));
  assert.equal(three[0].hot, true, "a theme named by 3 leads, in red");
  assert.deepEqual(fixGroups([{ text: "More printer toner", name: "y" }]).map((g) => [g.key, g.owner]), [["other", null]], "no keyword: Other, no owner set");
  assert.equal(fixClause("short text", /x/), "short text");
  assert.equal(allSame({ q01: 4, q02: 4 }), true);
  assert.equal(allSame({ q01: 4, q02: 5 }), false);
});

test("the watchlist: 3 statements at 1-2, or would not return; no 'left after 3 contracts' rule (Miguel: '3. not')", () => {
  const ret2 = { ...REAL7[1], id: "r2", answers: { ...REAL7[1].answers, q19: 2 } };
  const r = surveyReport({ rows: [ret2], ended: [], today: TODAY, p: "All" });
  assert.equal(r.watch.length, 1);
  assert.deepEqual(r.watch[0].why, ["return"]);
  assert.equal(r.watch[0].ret, 2);
  assert.equal(r.headline.lead, "1 seafarer is on the watchlist.");
  const ret3 = { ...ret2, answers: { ...ret2.answers, q19: 3 } };
  assert.equal(surveyReport({ rows: [ret3], ended: [], today: TODAY, p: "All" }).watch.length, 0, "a 3 is not on the watchlist");
  assert.equal(surveyHeadline({ n: 0, p: "QTD", enabled: true }).lead, "No answers this quarter.");
  const src = readFileSync(new URL("../src/crew_survey.js", import.meta.url), "utf8");
  assert.ok(!/came back|completed contracts|contract_count/i.test(src.replace(/\/\/.*$/gm, "")), "no retention block (Miguel: '1. no')");
});

test("the leadership PDF (Miguel: '4. pdf'): one page, the same headline, internal, a download only", async () => {
  const r = { ...surveyReport({ rows: REAL7, ended: [], today: TODAY, p: "YTD" }), sources: { forms: 7, console: 0 } };
  const bytes = composeSurveyReport(r, { today: TODAY });
  const txt = Buffer.from(bytes).toString("latin1");
  assert.ok(txt.startsWith("%PDF-"));
  assert.equal((txt.match(/\/Type\s*\/Page\b/g) || []).length, 1, "one page");
  for (const w of ["Crew say they are happy.", "Crew survey  -  internal", "Watchlist", "Clear: no answer in this period", "Where it hurts, by cruise line", "Travel & joining", "owner Rita / TDG", "Pay & benefits", "never sent to a cruise line"])
    assert.ok(txt.includes(w), "the PDF says: " + w);
  const { env, s } = setup();
  const res = await call(s, env, "GET", "/api/survey/report.pdf?p=YTD");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/pdf");
  assert.match(res.headers.get("Content-Disposition"), /^attachment; filename="CIMS crew survey 2026-10-23\.pdf"$/);
  assert.equal((await call(s, env, "GET", "/api/survey/report.pdf", null, null)).status, 401, "signed in only");
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.ok(W.includes("/api/survey/report.pdf?p="), "the page offers the download");
  assert.ok(!/report\.pdf[^\n]*sendMail|sendMail[^\n]*report\.pdf/.test(readFileSync(new URL("../src/crew_survey_send.js", import.meta.url), "utf8")), "never emailed");
});

// Miguel, 23 Oct 2026, on the HR view: "is messy the report now .. u have to think about unit .. logging a call is somewhere else
// in the app. so is a no go". The page is drawn with the Shipboard Feedback report's own parts, and logs no call.
test("the report page is the Shipboard Feedback report's parts, no call logging, the latest 10 answers", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const cut = (a, b) => { const i = W.indexOf(a); const j = W.indexOf(b, i); assert.ok(i > 0 && j > i, a); return W.slice(i, j); };
  const code = cut("function escHtml(s){", "\n") + "\n" + cut("var SRV_P=", "async function rptCrewSurvey(") + cut("function srvDraw(){", "async function srvSendAnyway(");
  const body = { innerHTML: "", querySelectorAll: () => [] };
  const ctx = { document: { getElementById: () => body }, $: () => body, openCrew() {}, rptCrewSurvey() {} };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const rows = Array.from({ length: 12 }, (_, i) => ({ ...REAL7[i % 7], id: "z" + i }));
  rows[0] = { ...rows[0], answers: { ...rows[0].answers, q06: 1, q10: 2, q14: 2 } };
  ctx.SRV_D = { ...surveyReport({ rows, ended: [], today: TODAY, p: "All" }), enabled: true, since: "2026-10-23", sources: { forms: 12, console: 0 } };
  vm.runInContext("srvDraw()", ctx);
  const h = body.innerHTML;
  for (const cls of ["rpthead", "liveband", "kgrid", "ktile", "rgrid2", "rblk"]) assert.ok(h.includes("class=" + cls) || h.includes('class="' + cls) || h.includes(" " + cls + '"'), "uses ." + cls);
  assert.match(h, /Watchlist &middot; 1/);
  assert.ok(!/Log the call|data-svcall|People to call|svcall/.test(h), "no call is logged on the report");
  assert.ok(!/svhm|svband|svg3/.test(h), "the HR view's own heat map, band and three-column grid are gone");
  assert.match(h, /Latest answers/);
  assert.equal((h.match(/data-svrow=/g) || []).length, 10, "the latest 10");
  assert.match(h, /Show all 12/);
  vm.runInContext("SRV_ALL=true;srvDraw()", ctx);
  assert.equal((body.innerHTML.match(/data-svrow=/g) || []).length, 12);
  assert.ok(!/srvLogCall/.test(W), "the call-logging function is gone");
});
