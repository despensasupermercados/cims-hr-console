// THE EARMARK FOR A CREW ABOARD ANOTHER SHIP (Miguel, 8 Oct 2026): "the sea ferry who is going to come, Guazon, is
// currently on board the Liberty. The TDG ... software doesn't really allow them to have one person on board the ship
// assigned to multiple ships ... we are going to add Guazon manually as projected or earmarked for the Allure. ... when
// that crew signs off, you will email Joy and CC Rita ... tell Joy everything about this crew member ... Put the not
// valid items first, the valid items second, and the bottom part following that. ... If there is any discrepancy ...
// Rita will decide what to do: either accept it, change it, or ..." — his choice: Accept, Keep mine, or Edit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { earmarkDiscrepancies, buildEarmarkNotice, earmarkSubject, renderEarmarkEmail, renderEarmarkText, earmarkSummary, SIGNED_OFF_DAYS } from "../src/earmark.js";
import { deployRecipient, deployCc } from "../src/keyman_deploy.js";
import { apiCrewImportStage, apiCrewImportApply, editOf } from "../src/crew_import_routes.js";

const TODAY = "2026-10-08";
const AT = "2026-10-08T08:00:00.000Z";
const card = (o = {}) => ({ id: "as_1", sc: "SC-1", crew_name: "Edward Guazon", ship: "Allure", sign_on: "2027-01-10", planned_sign_off: "2027-08-10", ...o });
const row = (o = {}) => ({ agency_id: "SC-1", status: "On board", status_raw: "On board", vessel_observed: "MV LIBERTY OF THE SEAS", embarked_at: "2026-05-01", debarked_at: null, run_at: AT, ...o });
const shipOf = (s) => { const m = String(s || "").toUpperCase().match(/ALLURE|LIBERTY|ICON|WONDER/); return m ? m[0][0] + m[0].slice(1).toLowerCase() : null; };
const one = (o) => earmarkDiscrepancies({ projections: [card()], today: TODAY, shipOf, ...o }).items;

test("aboard another ship: the earmark waits (TDG cannot earmark them); the file showing the sign-off makes it ready for TDG", () => {
  const w = one({ registry: [row()] });
  assert.deepEqual(w.map((i) => [i.kind, i.waiting, i.signed_off]), [["not_in_tdg", { ship: "Liberty" }, undefined]]);
  assert.match(w[0].text, /On board Liberty · TDG cannot earmark them for Allure until they sign off/);
  // the previous file had them On board Liberty; this one has them On Vacation: signed off
  const prev = [{ agency_id: "SC-1", status: "On board", raw_status: "On board", vessel: "MV LIBERTY OF THE SEAS", debarked_at: null }];
  const off = one({ registry: [row({ status: "On Vacation", status_raw: "On Vacation", debarked_at: "2026-10-05" })], previous: prev });
  assert.deepEqual(off.map((i) => [i.kind, i.signed_off, i.waiting]), [["not_in_tdg", { ship: "Liberty", on: "2026-10-05" }, undefined]]);
  assert.equal(off[0].text, "Signed off Liberty on 2026-10-05 per the TDG file 2026-10-08 · your earmark for Allure from 2027-01-10 is ready for TDG");
  // the file alone says it (no previous kept): ashore, debarked another ship within SIGNED_OFF_DAYS
  assert.equal(SIGNED_OFF_DAYS, 30);
  assert.deepEqual(one({ registry: [row({ status: "On Vacation", status_raw: "On Vacation", debarked_at: "2026-09-20" })] }).map((i) => i.signed_off), [{ ship: "Liberty", on: "2026-09-20" }]);
  assert.deepEqual(one({ registry: [row({ status: "Reserved", status_raw: "Reserved Crew", debarked_at: "2026-09-20" })] }).map((i) => !!i.signed_off), [true], "Reserved reads as ashore");
  // an old sign-off with no previous file is an ordinary not_in_tdg row (Rita's plan, Not yet by default)
  assert.deepEqual(one({ registry: [row({ status: "On Vacation", status_raw: "On Vacation", debarked_at: "2026-06-01" })] }).map((i) => [i.kind, !!i.signed_off, !!i.waiting]), [["not_in_tdg", false, false]]);
  // still aboard the same ship in both files: waiting, never signed off
  assert.deepEqual(one({ registry: [row()], previous: prev }).map((i) => [!!i.waiting, !!i.signed_off]), [[true, false]]);
  // TDG earmarks them for the card's ship: nothing to tell
  assert.deepEqual(one({ registry: [row({ status: "Earmarked", status_raw: "Earmarked", vessel_observed: "MV ALLURE OF THE SEAS" })], previous: prev }), []);
  // the previous file had them aboard the CARD's own ship: not "signed off another ship"
  assert.deepEqual(one({ registry: [row({ status: "On Vacation", status_raw: "On Vacation", vessel_observed: "MV ALLURE OF THE SEAS", debarked_at: "2026-06-01" })], previous: [{ ...prev[0], vessel: "MV ALLURE OF THE SEAS" }] }).map((i) => !!i.signed_off), [false]);
});

const RECORD = { id: "as_1", sc: "SC-1", ship_crew_id: "526444", first_name: "Edward", last_name: "Guazon", rank: "Printer Specialist", pp_no: "P1234567A",
  ship: "Allure", sign_on: "2027-01-10", planned_sign_off: "2027-08-10", on_port_seed: "Miami",
  med_exp: "2027-03-01", sirb_exp: "2026-08-01", pp_exp: "2031-01-01", usv_exp: "2030-01-01", sch_exp: null };
const ITEM = { id: "as_1", sc: "SC-1", kind: "not_in_tdg", ship: "Allure", sign_on: "2027-01-10", sign_off: "2027-08-10", signed_off: { ship: "Liberty", on: "2026-10-05" },
  file: { status: "On Vacation", ship: "Liberty", embarked_at: "2026-05-01", at: "2026-10-08" }, text: "x" };

test("the sign-off email: what to enter in TDG, documents NOT VALID first (expired, missing, or expiring before the planned sign-off), valid second, then the earmark and the seafarer", () => {
  const n = buildEarmarkNotice({ record: RECORD, item: ITEM, today: TODAY, mode: "signed_off" });
  assert.equal(n.title, "Earmark for TDG — signed off Liberty");
  assert.equal(n.ask, "Edward Guazon signed off Liberty on 2026-10-05. Please earmark Edward Guazon in TDG for Allure, sign-on 2027-01-10 (Miami), projected sign-off 2027-08-10 — as planned by CIMS. Rita is in copy and will re-import.");
  assert.equal(earmarkSubject(n), "Earmark for TDG — signed off Liberty — Edward Guazon · Allure (2027-01-10)");
  const bad = n.documents.filter((d) => !d.valid).map((d) => [d.doc, d.note]);
  assert.ok(bad.some(([doc, note]) => /Seaman/.test(doc) && note === "expired"), "the expired SIRB is not valid");
  assert.ok(bad.some(([doc, note]) => /Medical/.test(doc) && /before the planned sign-off 2027-08-10/.test(note)), "a medical that lapses mid-contract is not valid");
  assert.ok(n.documents.filter((d) => d.valid).some((d) => d.doc === "Passport"), "the passport is valid");
  const firstValid = n.documents.findIndex((d) => d.valid);
  assert.ok(n.documents.slice(firstValid).every((d) => d.valid), "not valid first, valid second");
  const html = renderEarmarkEmail(n, { toName: "Joy", sender: "Rita" });
  const at = (s) => { const i = html.indexOf(s); assert.ok(i >= 0, "the email carries " + s); return i; };
  assert.ok(at("signed off Liberty on 2026-10-05") < at("Not valid — needs action") && at("Not valid — needs action") < at("Valid (") && at("Valid (") < at(">Earmark<") && at(">Earmark<") < at(">Seafarer<"), "order: the ask, not valid, valid, the earmark, the seafarer");
  assert.doesNotMatch(html, /does not match/, "a sign-off is not a discrepancy");
  assert.match(html, /Signed off Liberty · 2026-10-05/);
  assert.doesNotMatch(html, /rgba\(|gradient\(/, "Outlook rules");
  const text = renderEarmarkText(n, { toName: "Joy" });
  assert.ok(text.indexOf("NOT VALID") < text.indexOf("VALID (") && text.indexOf("VALID (") < text.indexOf("CIMS earmark:") && text.indexOf("CIMS earmark:") < text.indexOf("Seafarer:"));
  // a KEPT discrepancy still says the export does not match
  assert.match(renderEarmarkEmail(buildEarmarkNotice({ record: RECORD, item: { ...ITEM, kind: "hull", signed_off: undefined }, today: TODAY, mode: "kept" })), /does not match what CIMS holds/);
  // the edited mode
  const e = buildEarmarkNotice({ record: RECORD, item: { ...ITEM, kind: "hull", signed_off: undefined }, today: TODAY, mode: "edited" });
  assert.equal(e.title, "Earmark corrected by CIMS"); assert.match(renderEarmarkEmail(e), /Rita has corrected the CIMS earmark below/);
  assert.equal(earmarkSummary({ edited: 1 }), "1 earmark edited by Rita (Joy emailed the correction)");
});

test("editOf: Rita's edit is ISO dates, the sign-off on or after the sign-on; blanks keep the card's values", () => {
  const it = { ship: "Allure", sign_on: "2027-01-10", sign_off: "2027-08-10" };
  assert.deepEqual(editOf({ ship: "Wonder", sign_on: "2027-02-01", sign_off: "2027-09-01" }, it), { ok: true, ship: "Wonder", sign_on: "2027-02-01", sign_off: "2027-09-01" });
  assert.deepEqual(editOf({ ship: "", sign_on: "", sign_off: "" }, it), { ok: true, ship: "Allure", sign_on: "2027-01-10", sign_off: "2027-08-10" });
  assert.equal(editOf({ sign_on: "10/01/2027" }, it).error, "bad_sign_on");
  assert.equal(editOf({ sign_off: "2026-12-01" }, it).error, "sign_off_before_sign_on");
  assert.equal(editOf(null, it).error, "no_edit");
});

// --- the apply path, through the real routes ------------------------------------------------------
function fakeDB({ existing = [], previous = [] } = {}) {
  const mk = (sql, args = []) => ({
    sql, args, bind(...a) { return mk(sql, a); },
    async first() { return /FROM assignment a/.test(sql) ? { ...RECORD, id: args[0] } : null; },
    async all() {
      if (/FROM registry_snapshot/.test(sql) && /debarked_at/.test(sql) && !/JOIN/.test(sql)) return { results: previous };
      if (/SELECT name FROM vessel/.test(sql)) return { results: [{ name: "Allure" }, { name: "Liberty" }, { name: "Wonder" }] };
      return /FROM crew\b/i.test(sql) && !/crew_override/i.test(sql) ? { results: existing } : { results: [] };
    },
  });
  return { prepare(sql) { return mk(sql); }, async batch(stmts) { return stmts.map(() => ({ success: true })); } };
}
const req = (body) => ({ json: async () => body });
const EXISTING = [{ agency_id: "SC-1", first_name: "Edward", last_name: "Guazon", status: "On board", vessel_observed: "Liberty" }];
const PREV = [{ agency_id: "SC-1", status: "On board", raw_status: "On board", vessel: "MV LIBERTY OF THE SEAS", debarked_at: null }];
const rowFile = (status, debark) => [{ "CREW ID": "SC-1", "FIRST NAME": "Edward", "LAST NAME": "Guazon", "CREW STATUS": status, "VESSEL NAME": "MV LIBERTY OF THE SEAS", "EMBARKEDDATE": "01 May 2026", "DEBARKEDDATE": debark }];
async function run({ file, decisions = {}, edits, previous = PREV, deps = {}, proj = card() }) {
  const env = { DB: fakeDB({ existing: EXISTING, previous }), DEPLOY_TO: "joy@tdg.example" };
  const d = { openProjections: async () => [proj], recipient: deployRecipient, cc: deployCc, ...deps };
  const stage = await (await apiCrewImportStage(req({ rows: file, file_hash: "h-so" }), env, d)).json();
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions, edits, file_hash: "h-so", run_by: "Rita" }), env, d)).json();
  return { stage, body };
}

test("apply: a signed-off earmark tells Joy BY DEFAULT (mode signed_off, the card stamped SENT TO TDG); Not yet holds it; a waiting earmark emails nobody", async () => {
  const mails = [], told = [];
  const deps = { sendMail: async (env, m) => { mails.push(m); return { ok: true }; }, markTold: async (env, id) => { told.push(id); return { ok: true }; } };
  const a = await run({ file: rowFile("On Vacation", "05 Oct 2026"), deps });
  assert.deepEqual(a.stage.review.earmarks.map((e) => [e.kind, e.signed_off && e.signed_off.ship]), [["not_in_tdg", "Liberty"]]);
  assert.deepEqual(a.stage.review.ships, ["Allure", "Liberty", "Wonder"], "the Edit choice's ship list");
  assert.equal(mails.length, 1, "no decision sent: the default is Tell Joy");
  assert.match(mails[0].subject, /^Earmark for TDG — signed off Liberty — Edward Guazon · Allure/);
  assert.deepEqual({ to: mails[0].to, cc: mails[0].cc }, { to: ["joy@tdg.example"], cc: ["Rita.Berenyi@dg3.com"] });
  assert.match(mails[0].html, /Please earmark Edward Guazon in TDG for Allure/);
  assert.deepEqual(told, ["as_1"]);
  assert.match(a.body.summary, /1 earmark sent to Joy to enter in TDG/);
  const h = await run({ file: rowFile("On Vacation", "05 Oct 2026"), decisions: { "earmark:as_1": "hold" }, deps });
  assert.equal(mails.length, 1, "Not yet: nobody told"); assert.equal(h.body.earmarks.held, 1);
  const w = await run({ file: rowFile("On board", "-"), deps });
  assert.deepEqual(w.stage.review.earmarks.map((e) => !!e.waiting), [true]);
  assert.equal(mails.length, 1, "aboard Liberty still: nothing to Joy"); assert.equal(w.body.earmarks.held, 1);
  // already told: the row comes back, but the default is Not yet (one email per earmark)
  await run({ file: rowFile("On Vacation", "05 Oct 2026"), deps, proj: card({ deployed_at: "2026-10-06T10:00:00Z" }) });
  assert.equal(mails.length, 1);
});

test("apply: Edit saves the card through the move path with Rita's ship and dates, then Joy gets the corrected earmark; a bad edit saves nothing and the summary says so", async () => {
  const moved = [], mails = [];
  const deps = { moveCard: async (env, p) => { moved.push(p); return { ok: true }; }, sendMail: async (env, m) => { mails.push(m); return { ok: true }; } };
  // TDG earmarks them for Wonder: a hull discrepancy
  const file = [{ "CREW ID": "SC-1", "FIRST NAME": "Edward", "LAST NAME": "Guazon", "CREW STATUS": "Earmarked", "VESSEL NAME": "MV WONDER OF THE SEAS", "EMBARKEDDATE": "-", "DEBARKEDDATE": "-" }];
  const ok = await run({ file, previous: [], decisions: { "earmark:as_1": "edit" }, edits: { "earmark:as_1": { ship: "Wonder", sign_on: "2027-02-01", sign_off: "2027-09-01" } }, deps });
  assert.deepEqual(ok.stage.review.earmarks.map((e) => e.kind), ["hull"]);
  assert.deepEqual(moved, [{ id: "as_1", vessel_name: "Wonder", sign_on: "2027-02-01", planned_sign_off: "2027-09-01" }]);
  assert.equal(mails.length, 1); assert.match(mails[0].subject, /^Earmark corrected by CIMS/);
  assert.deepEqual(ok.body.earmarks.edited.map((x) => [x.ok, x.emailed, x.ship]), [[true, true, "Wonder"]]);
  assert.match(ok.body.summary, /1 earmark edited by Rita/);
  const bad = await run({ file, previous: [], decisions: { "earmark:as_1": "edit" }, edits: { "earmark:as_1": { ship: "Wonder", sign_on: "2027-02-01", sign_off: "2026-01-01" } }, deps });
  assert.equal(moved.length, 1, "nothing saved"); assert.equal(mails.length, 1, "nothing sent");
  assert.match(bad.body.summary, /not saved: Edward Guazon \(sign_off_before_sign_on\)/);
  const refused = await run({ file, previous: [], decisions: { "earmark:as_1": "edit" }, edits: { "earmark:as_1": { ship: "Atlantis" } }, deps: { ...deps, moveCard: async () => ({ ok: false, error: "unknown_ship" }) } });
  assert.match(refused.body.summary, /not saved: Edward Guazon \(unknown_ship\)/); assert.equal(mails.length, 1);
});

test("static: the Uploads screen (worker.js) shows every earmark row with its choice, sends the edits, and the secondary page keeps parity", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  for (const s of ["Earmarks the TDG file disagrees with", "Signed off &mdash; earmark ready for TDG", "Your earmarks TDG does not have yet", "Aboard another ship &mdash; TDG cannot earmark them yet", "TDG earmarks without a card"]) assert.ok(W.includes(s), "the section: " + s);
  assert.match(W, /impSegN\("earmark:"\+it\.id,"accept",\["accept","keep","edit"\]/);
  assert.match(W, /edits:ed,file_hash:IMPHASH/);
  assert.match(W, /function impEmDef\(it\)\{return it\.kind!=="not_in_tdg"\?"accept":\(it\.signed_off&&!it\.told_at\?"tell":"hold"\);\}/, "the page's default = the server's");
  const U = readFileSync(new URL("../src/crew_import_ui.js", import.meta.url), "utf8");
  assert.match(U, /\["accept","keep","edit"\]/); assert.match(U, /edits:ed,file_hash:META\.file_hash/); assert.match(U, /function emDef\(it\)/);
});
