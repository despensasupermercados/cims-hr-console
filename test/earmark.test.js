// THE EARMARK LOOP (Miguel, 7 Oct 2026): "all the projections, people who are not on board but they're coming on
// board, we're going to call them earmarks ... If there is any discrepancy in that upload related to the earmark,
// you need to tell Rita ... keep what she has already in the HR console or accept the changes ... If Rita rejects
// that import, you need to send an email back to Joy and copy Rita". His answers: a different hull → move the card
// (her dates kept); Inactive → remove; one email per seafarer, Joy's Deploy address, Rita in copy, same letterhead;
// a deployed earmark the file lacks is reported only; the rest of the file still applies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { earmarkDiscrepancies, tdgEarmarksWithoutCard, earmarkSummary, buildEarmarkNotice, earmarkSubject, renderEarmarkEmail, renderEarmarkText, TEMPLATE_ID, loadEarmarkRecord } from "../src/earmark.js";
import { deployRecipient, deployCc } from "../src/keyman_deploy.js";
import { apiCrewImportStage, apiCrewImportApply, applySummary } from "../src/crew_import_routes.js";

const TODAY = "2026-10-07";
const AT = "2026-10-07T08:00:00.000Z";
const card = (o = {}) => ({ id: "as_1", sc: "SC-1", crew_name: "Edward Guazon", ship: "Allure", sign_on: "2026-11-29", planned_sign_off: "2027-06-29", ...o });
const row = (o = {}) => ({ agency_id: "SC-1", status: "Earmarked", status_raw: "Earmarked", vessel_observed: "MV ALLURE OF THE SEAS", embarked_at: null, run_at: AT, ...o });
const shipOf = (s) => { const m = String(s || "").toUpperCase().match(/ALLURE|LIBERTY|ICON|WONDER/); return m ? m[0][0] + m[0].slice(1).toLowerCase() : null; };

// 7 Oct 2026 (the Deploy CTA retired): a FUTURE earmark TDG does not earmark is a not_in_tdg row — Tell Joy / Not
// yet / Drop — never silently nothing. TDG earmarking the same hull closes it; an aboard card is the seat, not this.
test("TDG earmarks the same hull: nothing to decide. A future earmark TDG has not got (on vacation, aboard elsewhere, no row) is a not_in_tdg row; an aboard card the file predates is nothing", () => {
  const ok = earmarkDiscrepancies({ projections: [card()], registry: [row()], today: TODAY, shipOf });
  assert.deepEqual(ok, { items: [], missing: [] });
  const vac = earmarkDiscrepancies({ projections: [card()], registry: [row({ status: "On Vacation", status_raw: "On Vacation", vessel_observed: "MV WONDER OF THE SEAS" })], today: TODAY, shipOf }).items;
  assert.deepEqual(vac.map((i) => [i.kind, i.told_at, i.text]), [["not_in_tdg", null, "TDG file 2026-10-07: On Vacation, Wonder · no earmark for Allure yet"]]);
  assert.deepEqual(earmarkDiscrepancies({ projections: [card()], registry: [row({ status: "On board", status_raw: "On board", vessel_observed: "MV LIBERTY OF THE SEAS" })], today: TODAY, shipOf }).items.map((i) => i.kind), ["not_in_tdg"], "aboard Liberty today with a plan for Allure: normal, and TDG has no earmark yet");
  const none = earmarkDiscrepancies({ projections: [card()], registry: [], today: TODAY, shipOf }).items;
  assert.deepEqual(none.map((i) => [i.kind, i.file.absent, i.text]), [["not_in_tdg", true, "TDG file 2026-10-07: not in the file · no earmark for Allure yet"]]);
  // an aboard card the file (dated BEFORE the sign-on) does not have aboard: pending, not contradicted, not a plan
  assert.deepEqual(earmarkDiscrepancies({ projections: [card({ sign_on: "2026-10-06" })], registry: [row({ status: "On Vacation", status_raw: "On Vacation", vessel_observed: null, run_at: "2026-10-05T00:00:00Z" })], today: TODAY, shipOf }).items, []);
});

test("the four discrepancies: a different hull (earmarked, or aboard elsewhere once seen), Inactive / Not for Rehire, not aboard per a later file, an embark more than 7 days from the sign-on", () => {
  const reg = [
    row(),                                                                                       // SC-1 fine
    row({ agency_id: "SC-2", vessel_observed: "MV LIBERTY OF THE SEAS" }),                        // earmarked elsewhere
    row({ agency_id: "SC-3", status: "Inactive", status_raw: "Not for Rehire", vessel_observed: null }),
    row({ agency_id: "SC-4", status: "On Vacation", status_raw: "On Vacation", vessel_observed: "MV WONDER OF THE SEAS" }), // card aboard since 1 Oct, file 7 Oct: not aboard
    row({ agency_id: "SC-5", status: "On board", status_raw: "On board", vessel_observed: "MV ALLURE OF THE SEAS", embarked_at: "2026-09-23" }), // card 23 Aug: 31 days
    row({ agency_id: "SC-6", status: "On board", status_raw: "On board", vessel_observed: "MV ICON OF THE SEAS" }),          // card aboard Allure since 1 Oct, file: aboard Icon
    row({ agency_id: "SC-7", status: "On board", status_raw: "On board", vessel_observed: "MV ALLURE OF THE SEAS", embarked_at: "2026-10-02" }), // card 25 Sep: 7 days, fine
  ];
  const cards = [card(), card({ id: "as_2", sc: "SC-2" }), card({ id: "as_3", sc: "SC-3" }), card({ id: "as_4", sc: "SC-4", sign_on: "2026-10-01" }), card({ id: "as_5", sc: "SC-5", sign_on: "2026-08-23" }), card({ id: "as_6", sc: "SC-6", sign_on: "2026-10-01" }), card({ id: "as_7", sc: "SC-7", sign_on: "2026-09-25" })];
  const { items, missing } = earmarkDiscrepancies({ projections: cards, registry: reg, today: TODAY, shipOf });
  assert.deepEqual(items.map((i) => [i.id, i.kind]), [["as_2", "hull"], ["as_6", "hull"], ["as_3", "inactive"], ["as_4", "not_aboard"], ["as_5", "embark_date"]]);
  assert.deepEqual(items.find((i) => i.id === "as_2").file, { status: "Earmarked", ship: "Liberty", embarked_at: null, at: "2026-10-07" });
  assert.match(items.find((i) => i.id === "as_3").text, /Not for Rehire/, "the file's own word");
  assert.match(items.find((i) => i.id === "as_5").text, /embarked Allure on 2026-09-23 · your earmark says 2026-08-23/);
  assert.deepEqual(missing, []);
});

test("a told earmark TDG still lacks is a not_in_tdg row that says so (told_at); once TDG earmarks them the row is gone", () => {
  const sent = card({ deployed_at: "2026-10-01T10:00:00Z" });
  const later = earmarkDiscrepancies({ projections: [sent], registry: [row({ status: "On Vacation", status_raw: "On Vacation", vessel_observed: null })], today: TODAY, shipOf });
  assert.deepEqual(later.items.map((m) => [m.id, m.kind, m.told_at, m.text]), [["as_1", "not_in_tdg", "2026-10-01", "Told Joy 2026-10-01 · TDG file 2026-10-07: On Vacation · no earmark for Allure yet"]]);
  assert.deepEqual(earmarkDiscrepancies({ projections: [sent], registry: [row()], today: TODAY, shipOf }).items, [], "TDG has the earmark: the loop closed");
  assert.deepEqual(earmarkDiscrepancies({ projections: [sent], registry: [], today: TODAY, shipOf }).items.map((m) => m.told_at), ["2026-10-01"]);
});

test("tdgEarmarksWithoutCard: a file row Earmarked for a known hull with no open card for that crew on it", () => {
  const out = tdgEarmarksWithoutCard({ projections: [card()], registry: [row({ vessel_observed: "MV LIBERTY OF THE SEAS" }), row({ agency_id: "SC-9", name: "Cyrus Talucod", vessel_observed: "MV ALLURE OF THE SEAS" }), row({ agency_id: "SC-8", vessel_observed: "MV NOWHERE" }), row({ agency_id: "SC-7", status: "On board", status_raw: "On board" })], shipOf });
  assert.deepEqual(out, [{ sc: "SC-9", ship: "Allure", name: "Cyrus Talucod", at: "2026-10-07" }], "SC-1 has a card (a discrepancy row moves it); an unknown hull and an On board row give nothing");
});

test("the notice to Joy: the record, the earmark against the file's word, every document; Outlook-safe; the subject names the seafarer and the ship", () => {
  const record = { id: "as_1", sc: "SC-1", ship_crew_id: "526444", first_name: "Edward", last_name: "Guazon", rank: "Printer Specialist", email: "e@x.com", phone: "+63 900", dob: "1990-01-01", province: "Cavite", pp_no: "P1234567A",
    ship: "Allure", brand: "Royal Caribbean", sign_on: "2026-11-29", planned_sign_off: "2027-06-29", on_port_seed: "Miami", off_port_seed: null, deployed_at: "2026-10-01T10:00:00Z", med_exp: "2026-12-01", sirb_exp: "2026-08-01", pp_exp: null, usv_exp: "2027-10-05", sch_exp: null };
  const item = { id: "as_1", sc: "SC-1", kind: "hull", ship: "Allure", sign_on: "2026-11-29", file: { status: "Earmarked", ship: "Liberty", embarked_at: null, at: "2026-10-07" }, text: "x" };
  const n = buildEarmarkNotice({ record, item, today: TODAY });
  assert.equal(n.kind_word, "TDG names a different ship");
  assert.equal(earmarkSubject(n), "Earmark discrepancy — Edward Guazon · Allure (2026-11-29)");
  const html = renderEarmarkEmail(n, { toName: "Joy", sender: "Rita" });
  for (const s of ["Edward Guazon", "SC-1", "526444", "Printer Specialist", "P1234567A", "Cavite", "e@x.com", "Allure", "Liberty", "2026-11-29", "Miami", "2027-06-29", "Seaman&#39;s Book", "Passport", "EXPIRED", "MISSING", "2026-10-01", "Rita has kept the CIMS earmark", "CRUISE INDUSTRY MANAGED SERVICES"]) assert.ok(html.includes(s) || html.includes(s.replace("&#39;", "'")), "the email must carry " + s);
  assert.doesNotMatch(html, /rgba\(|gradient\(/, "Outlook rules (cims-email-standard §2)");
  assert.match(html, /bgcolor="#F3F4F6" style="background:#F3F4F6/, "bgcolor paired with the style");
  assert.match(html, /name="viewport"/);
  const text = renderEarmarkText(n, { toName: "Joy" });
  assert.match(text, /CIMS earmark: Allure · sign on 2026-11-29 \(Miami\)/);
  assert.match(text, /TDG file 2026-10-07: Earmarked · Liberty/);
  assert.equal(TEMPLATE_ID, "hr.keyman.earmark_discrepancy.v1");
  assert.equal(deployRecipient({ DEPLOY_TO: "joy@x" }), "joy@x"); assert.equal(deployRecipient({ TG_NOTIFY: "tg@x" }), "tg@x"); assert.equal(deployRecipient({}), null, "never a guessed recipient");
  assert.deepEqual(deployCc({}), ["Rita.Berenyi@dg3.com"]); assert.deepEqual(deployCc({ DEPLOY_CC: "a@x; b@x" }), ["a@x", "b@x"]);
  assert.equal(earmarkSummary({ accepted: 2, kept: 1, emails: 1, cards: 1, told: 1, held: 2 }), "2 earmarks corrected to the TDG file · 1 earmark kept as yours (1 discrepancy email to Joy, Rita in copy) · 1 earmark sent to Joy to enter in TDG · 2 earmarks not in TDG yet, held · 1 TDG earmark given a card");
  // the three modes of the notice
  const add = buildEarmarkNotice({ record, item: { ...item, kind: "not_in_tdg", file: { status: "On Vacation", ship: null, at: "2026-10-07" } }, today: TODAY, mode: "add" });
  assert.equal(earmarkSubject(add), "Earmark for TDG — Edward Guazon · Allure (2026-11-29)");
  assert.match(renderEarmarkEmail(add), /Please enter this earmark in TDG/);
  const rej = buildEarmarkNotice({ record, item: { sc: "SC-1", ship: "Allure", kind: "rejected", file: { status: "Earmarked", ship: "Allure", at: "2026-10-07" } }, today: TODAY, mode: "reject" });
  assert.equal(earmarkSubject(rej), "Earmark not planned by CIMS — Edward Guazon · Allure (2026-11-29)");
  assert.match(renderEarmarkEmail(rej), /CIMS does not plan this seafarer for this ship/); assert.match(renderEarmarkEmail(rej), /Please remove this earmark in TDG/);
  assert.match(renderEarmarkText(rej), /CIMS: not planned for Allure/);
});

// --- the apply path -----------------------------------------------------------------------------
function fakeDB({ existing = [] } = {}) {
  const batched = [];
  const mk = (sql, args = []) => ({
    sql, args, bind(...a) { return mk(sql, a); },
    async first() { return /FROM assignment a/.test(sql) ? { id: args[0], sc: "SC-1", first_name: "Edward", last_name: "Guazon", ship: "Allure", sign_on: "2026-11-29", planned_sign_off: "2027-06-29", rank: "PS" } : null; },
    async all() { return /FROM crew\b/i.test(sql) && !/crew_override/i.test(sql) ? { results: existing } : { results: [] }; },
  });
  return { _batched: batched, prepare(sql) { return mk(sql); }, async batch(stmts) { batched.push(...stmts); return stmts.map(() => ({ success: true })); } };
}
const req = (body) => ({ json: async () => body });
const EXISTING = [{ agency_id: "SC-1", first_name: "Edward", last_name: "Guazon", status: "On Vacation", vessel_observed: "" }, { agency_id: "SC-9", first_name: "Cyrus", last_name: "Talucod", status: "On Vacation", vessel_observed: "" }];
const FILE = [
  { "CREW ID": "SC-1", "FIRST NAME": "Edward", "LAST NAME": "Guazon", "CREW STATUS": "Earmarked", "VESSEL NAME": "MV LIBERTY OF THE SEAS", "EMBARKEDDATE": "-", "DEBARKEDDATE": "-" },
  { "CREW ID": "SC-9", "FIRST NAME": "Cyrus", "LAST NAME": "Talucod", "CREW STATUS": "Earmarked", "VESSEL NAME": "MV ALLURE OF THE SEAS", "EMBARKEDDATE": "-", "DEBARKEDDATE": "-" },
];
async function run(decisions, deps) {
  const env = { DB: fakeDB({ existing: EXISTING }), DEPLOY_TO: "joy@tdg.example", TG_NOTIFY_NAME: "Joy" };
  const d = { openProjections: async () => [card({ ship: "Allure" })], ...deps };
  const stage = await (await apiCrewImportStage(req({ rows: FILE, file_hash: "h-em" }), env, d)).json();
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions, file_hash: "h-em", run_by: "Rita" }), env, d)).json();
  return { stage, body, env };
}

test("stage lists the earmark discrepancy and the TDG earmark without a card; Accept (default) moves the card to TDG's hull with Rita's dates and gives the TDG earmark a card", async () => {
  const moved = [], created = [], mails = [];
  const deps = { moveCard: async (env, p) => { moved.push(p); return { ok: true, id: p.id, mode: "update" }; }, createCard: async (env, p) => { created.push(p); return { ok: true, id: "as_new", sign_on: "2026-11-29" }; }, sendMail: async (env, m) => { mails.push(m); return { ok: true, id: "em_1" }; }, recipient: deployRecipient, cc: deployCc };
  const { stage, body } = await run({}, deps);
  assert.deepEqual(stage.review.earmarks.map((e) => [e.id, e.kind, e.file.ship]), [["as_1", "hull", "Liberty"]]);
  assert.deepEqual(stage.review.tdg_earmarks, [{ sc: "SC-9", ship: "Allure", name: "Cyrus Talucod", at: stage.review.tdg_earmarks[0].at }]);
  assert.deepEqual(moved, [{ id: "as_1", vessel_name: "Liberty" }], "Accept: the card moves to the file's hull, dates untouched");
  assert.deepEqual(created.map((c) => [c.agencyId, c.ship]), [["SC-9", "Allure"]]);
  assert.deepEqual(mails, [], "nothing goes to Joy when TDG wins");
  assert.deepEqual(body.earmarks.accepted.map((x) => [x.id, x.action, x.ok]), [["as_1", "moved to Liberty", true]]);
  assert.deepEqual(body.earmarks.cards.map((x) => [x.sc, x.ok, x.id]), [["SC-9", true, "as_new"]]);
  assert.match(body.summary, /1 earmark corrected to the TDG file · 1 TDG earmark given a card/);
  assert.ok(body.ok && body.applied >= 0, "the rest of the file still applies");
});

test("Keep mine: the card stays and Joy gets ONE email, Rita in copy, critical, under the earmark template; a TDG earmark can be skipped; no recipient is refused, never guessed; a mailer failure is reported, not the import", async () => {
  const moved = [], mails = [];
  const deps = { moveCard: async (env, p) => { moved.push(p); return { ok: true }; }, createCard: async () => ({ ok: true, id: "x" }), sendMail: async (env, m) => { mails.push(m); return { ok: true, id: "em_1" }; }, recipient: deployRecipient, cc: deployCc };
  const { body } = await run({ "earmark:as_1": "keep", "tdgmark:SC-9": "skip" }, deps);
  assert.deepEqual(moved, []);
  assert.equal(mails.length, 1);
  assert.deepEqual({ to: mails[0].to, cc: mails[0].cc, tpl: mails[0].templateId, critical: mails[0].critical }, { to: ["joy@tdg.example"], cc: ["Rita.Berenyi@dg3.com"], tpl: TEMPLATE_ID, critical: true });
  assert.match(mails[0].subject, /^Earmark discrepancy — Edward Guazon · Allure \(2026-11-29\)$/);
  assert.match(mails[0].html, /TDG names a different ship/); assert.match(mails[0].html, /Liberty/);
  assert.deepEqual(body.earmarks.kept.map((x) => [x.id, x.emailed, x.error]), [["as_1", true, null]]);
  assert.deepEqual(body.earmarks.cards, [], "skipped");
  assert.match(body.summary, /1 earmark kept as yours \(1 discrepancy email to Joy, Rita in copy\)/);
  // no recipient configured
  const envNo = { DB: fakeDB({ existing: EXISTING }) };
  const d2 = { ...deps, openProjections: async () => [card()] };
  const st2 = await (await apiCrewImportStage(req({ rows: FILE, file_hash: "h-em2" }), envNo, d2)).json();
  const b2 = await (await apiCrewImportApply(req({ review: st2.review, decisions: { "earmark:as_1": "keep" }, file_hash: "h-em2", run_by: "Rita" }), envNo, d2)).json();
  assert.deepEqual(b2.earmarks.kept.map((x) => [x.emailed, x.error]), [[false, "no_recipient"]]);
  assert.equal(mails.length, 1, "nothing sent to a guessed address");
  // mailer refuses
  const b3 = await run({ "earmark:as_1": "keep" }, { ...deps, sendMail: async () => ({ ok: false, error: "mailer down" }) });
  assert.equal(b3.body.ok, true);
  assert.deepEqual(b3.body.earmarks.kept.map((x) => [x.emailed, x.error]), [[false, "mailer down"]]);
  assert.doesNotMatch(applySummary(b3.body), /discrepancy email/);
});

test("Inactive accepted removes the card; a row the stage never listed is ignored; a card gone since the review is skipped", async () => {
  const removed = [], mails = [];
  const deps = { absorbCard: async (env, id) => { removed.push(id); return { ok: true }; }, sendMail: async (env, m) => { mails.push(m); return { ok: true }; }, recipient: deployRecipient, cc: deployCc };
  const env = { DB: fakeDB({ existing: EXISTING }), DEPLOY_TO: "joy@x" };
  const d = { openProjections: async () => [card()], ...deps };
  const file = [{ "CREW ID": "SC-1", "FIRST NAME": "Edward", "LAST NAME": "Guazon", "CREW STATUS": "Not for Rehire", "VESSEL NAME": "", "EMBARKEDDATE": "-", "DEBARKEDDATE": "-" }];
  const stage = await (await apiCrewImportStage(req({ rows: file, file_hash: "h-in" }), env, d)).json();
  assert.deepEqual(stage.review.earmarks.map((e) => e.kind), ["inactive"]);
  const forged = { ...stage.review, earmarks: stage.review.earmarks.concat([{ id: "as_forged", sc: "SC-1", kind: "inactive", ship: "Allure" }]) };
  const body = await (await apiCrewImportApply(req({ review: forged, decisions: { "earmark:as_forged": "keep" }, file_hash: "h-in", run_by: "Rita" }), env, d)).json();
  assert.deepEqual(removed, ["as_1"]);
  assert.deepEqual(body.earmarks.accepted.map((x) => [x.id, x.action]), [["as_1", "removed"]]);
  assert.deepEqual(mails, [], "a forged row names no live card: nothing sent");
});

test("loadEarmarkRecord reads one assignment with its crew and manual overrides (one statement)", async () => {
  let sql = null; const env = { DB: { prepare: (s) => ({ bind: () => ({ first: async () => { sql = s; return { id: "as_1" }; } }) }) } };
  const r = await loadEarmarkRecord(env, "as_1");
  assert.equal(r.id, "as_1");
  assert.match(sql, /FROM assignment a\s+JOIN contract k ON k\.id = a\.contract_id\s+JOIN crew\s+c ON c\.id = k\.crew_id\s+LEFT JOIN vessel v ON v\.id = a\.vessel_id\s+LEFT JOIN crew_override o ON o\.agency_id = c\.agency_id/);
  assert.match(sql, /COALESCE\(NULLIF\(o\.email,''\), c\.email\) AS email/, "Rita's manual corrections win over the base row (§11)");
});

test("static: the Keyman page says EARMARK, the awaiting card is a GREEN card, the importer receives move/create/mail/recipient deps", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.match(W, /\.rcard\.awaiting\{[^}]*background:#E8F5EA/, "Miguel: 'just like you have it in the yellow card. It would become green'");
  assert.doesNotMatch(W.slice(W.indexOf("function rotCard(x){"), W.indexOf("function rotIssuesBlock(")), /PLACEHOLDER/, "one word: earmark");
  assert.match(W, /createCard: createEarmarkCard, sendMail: sendViaMailer, recipient: deployRecipient, cc: deployCc/);
  const UI = readFileSync(new URL("../src/crew_import_ui.js", import.meta.url), "utf-8");
  assert.match(UI, /seg\("earmark:"\+it\.id,"accept",\["accept","keep"\],\["Accept TDG","Keep mine \(email Joy\)"\]\)/, "the per-row decision, TDG by default");
  assert.match(UI, /Emails to Joy/, "the emails are listed BEFORE Apply");
});

// Miguel's own example: Rita earmarks one seafarer, Joy earmarks another for the same ship.
test("other_person: the file earmarks somebody else for the hull of Rita's FUTURE earmark (and not hers); Accept replaces her card with theirs, Keep emails Joy; the TDG earmark is not also listed as card-less", async () => {
  const reg = [row({ status: "On board", status_raw: "On board", vessel_observed: "MV LIBERTY OF THE SEAS" }), row({ agency_id: "SC-9", name: "Cyrus Talucod" })];
  const { items } = earmarkDiscrepancies({ projections: [card()], registry: reg, today: TODAY, shipOf });
  assert.deepEqual(items.map((i) => [i.id, i.kind, i.file.other]), [["as_1", "other_person", { sc: "SC-9", name: "Cyrus Talucod" }]]);
  assert.match(items[0].text, /earmarks Cyrus Talucod for Allure · your earmark there is Edward Guazon from 2026-11-29/);
  assert.deepEqual(tdgEarmarksWithoutCard({ projections: [card()], registry: reg, shipOf, exclude: ["SC-9|allure"] }), [], "decided by the other_person row");
  assert.deepEqual(earmarkDiscrepancies({ projections: [card(), card({ id: "as_9", sc: "SC-9" })], registry: reg, today: TODAY, shipOf }).items.map((i) => [i.id, i.kind]), [["as_1", "not_in_tdg"]], "both carded: no conflict of persons; Guazon's earmark is simply not in TDG yet");
  assert.deepEqual(earmarkDiscrepancies({ projections: [card()], registry: [row(), row({ agency_id: "SC-9", name: "Cyrus Talucod" })], today: TODAY, shipOf }).items, [], "TDG earmarks Rita's crew too: two earmarks, no conflict");
  assert.deepEqual(earmarkDiscrepancies({ projections: [card({ sign_on: "2026-10-01" })], registry: [row({ status: "On board", status_raw: "On board" }), row({ agency_id: "SC-9" })], today: TODAY, shipOf }).items, [], "an aboard card is the seat, not a plan");
  // apply: Accept replaces, Keep emails
  const removed = [], created = [], mails = [];
  const deps = { absorbCard: async (env, id) => { removed.push(id); return { ok: true }; }, createCard: async (env, p) => { created.push(p); return { ok: true, id: "as_t", sign_on: "2026-11-29" }; }, sendMail: async (env, m) => { mails.push(m); return { ok: true }; }, recipient: deployRecipient, cc: deployCc };
  const file = [
    { "CREW ID": "SC-1", "FIRST NAME": "Edward", "LAST NAME": "Guazon", "CREW STATUS": "On board", "VESSEL NAME": "MV LIBERTY OF THE SEAS", "EMBARKEDDATE": "01 May 2026", "DEBARKEDDATE": "-" },
    { "CREW ID": "SC-9", "FIRST NAME": "Cyrus", "LAST NAME": "Talucod", "CREW STATUS": "Earmarked", "VESSEL NAME": "MV ALLURE OF THE SEAS", "EMBARKEDDATE": "-", "DEBARKEDDATE": "-" },
  ];
  const go = async (decisions) => { const env = { DB: fakeDB({ existing: EXISTING }), DEPLOY_TO: "joy@x" }; const d = { openProjections: async () => [card()], ...deps }; const st = await (await apiCrewImportStage(req({ rows: file, file_hash: "h-op" }), env, d)).json(); return { st, body: await (await apiCrewImportApply(req({ review: st.review, decisions, file_hash: "h-op", run_by: "Rita" }), env, d)).json() }; };
  const a = await go({});
  assert.deepEqual(a.st.review.earmarks.map((e) => e.kind), ["other_person"]);
  assert.deepEqual(a.st.review.tdg_earmarks, [], "Talucod is decided by the discrepancy row, not listed twice");
  assert.deepEqual(removed, ["as_1"]); assert.deepEqual(created.map((c) => [c.agencyId, c.ship]), [["SC-9", "Allure"]]);
  assert.deepEqual(a.body.earmarks.accepted.map((x) => x.action), ["replaced by Cyrus Talucod"]);
  assert.deepEqual(a.body.earmarks.cards.map((x) => [x.sc, x.ok]), [["SC-9", true]]);
  const k = await go({ "earmark:as_1": "keep" });
  assert.deepEqual(removed, ["as_1"], "nothing more removed"); assert.equal(created.length, 1, "no card for Talucod when Rita keeps Guazon");
  assert.equal(mails.length, 1); assert.match(mails[0].html, /TDG earmarks a different seafarer for this ship/); assert.match(mails[0].html, /Cyrus Talucod/);
  assert.deepEqual(k.body.earmarks.kept.map((x) => x.emailed), [true]);
});

// 7 Oct 2026, the screenshot: "this and few other earmarked ppl .. don't allow me to delete". TDG's earmark card has no
// assignment behind it; Remove now records the rejection, removes a console card if any, and offers to tell Joy.
test("static: rejecting a TDG earmark — the route, the table, the board skip while the file stands, the lapse on a later file, the importer's exclude", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.match(W, /if \(p === "\/api\/rotation\/earmark\/dismiss" && request\.method === "POST"\) return apiEarmarkDismiss\(request, env, session\);/, "inside the error boundary with the other rotation routes");
  assert.match(W, /CREATE TABLE IF NOT EXISTS earmark_dismiss \(sc TEXT NOT NULL, ship_key TEXT NOT NULL, dismissed_at TEXT NOT NULL/, "created by the board's memoized guard (§12)");
  const route = W.slice(W.indexOf("async function apiEarmarkDismiss("), W.indexOf("async function dismissedEarmarks("));
  assert.match(route, /if \(b\.aid\) removed = await removeReliefAssignment\(env, String\(b\.aid\)\)/, "a console card TDG also earmarks goes with the rejection");
  assert.match(route, /ON CONFLICT\(sc, ship_key\) DO UPDATE SET dismissed_at=excluded\.dismissed_at/, "rejecting again re-dates the rejection");
  assert.match(route, /const to = deployRecipient\(env\);\s*if \(!to\) notice = \{ ok: false, error: "no_recipient" \};/, "never a guessed recipient");
  assert.match(route, /mode: "reject"/);
  assert.match(route, /critical: true/);
  const rs = W.slice(W.indexOf("async function rotationSections("), W.indexOf("const sections = Object.values(shipNames)"));
  assert.match(rs, /FROM earmark_dismiss/, "read in the board's wave");
  assert.match(rs, /const earmarkDismissed = \(sc, key, at\) => \{ const d = dismissedAt\[sc \+ "\|" \+ key\]; return !!d && \(!at \|\| String\(at\)\.slice\(0, 10\) <= d\); \};/, "off the board only while the file that showed it is not newer than the rejection");
  assert.match(rs, /if \(earmarkDismissed\(sc, w\.key, w\.at\)\) continue;/);
  const lapse = W.slice(W.indexOf("async function dismissedEarmarks("), W.indexOf("// A TDG earmark the console has no card for becomes"));
  assert.match(lapse, /\(!last \|\| last <= String\(x\.dismissed_at \|\| ""\)\.slice\(0, 10\)\)/, "a rejection older than the latest file has lapsed for the importer too");
  assert.match(W, /dismissed: dismissedEarmarks, markTold:/, "handed to the importer");
  // the page: Remove on every earmark card, no Deploy anywhere, the sources line names the file first
  const page = W.slice(W.indexOf("function rotCard(x){"), W.indexOf("function rotIssuesBlock("));
  assert.doesNotMatch(page, /planDeploy|>Deploy</);
  assert.match(page, /onclick="earmarkDismiss\(event,this\)">Remove</);
  assert.match(W, /async function earmarkDismiss\(e,el\)\{/);
  assert.match(W, /fetch\('\/api\/rotation\/earmark\/dismiss'/);
  assert.match(W, /<div class=gt>Add earmark<\/div>/, "the ghost slot speaks the one word too");
  assert.doesNotMatch(W, /no upload since 14 Sep 2026|function rotSourcesLine/, "the Counter is history: no warning about its age — and since 7 Oct 2026 no sources line on the page at all");
});
