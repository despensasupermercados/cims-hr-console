// THE AUDITS BEFORE THE APP — the Forms survey (Sep 2024 to Sep 2026) read into History (src/audit_forms.js). Miguel,
// 20 Oct 2026, asked "Import the Forms survey into History?": "yes to all on the 5th point". The survey's own export is
// crew data and is not in the repo: these rows carry its real headers and the shapes its rows really have.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { readForms, formsShip, formsDate, placeCrew, deskMissing, formsInsertParams, formsFromRow, formsHistoryRow, FORMS_INSERT_SQL, FORMS_TESTS } from "../src/audit_forms.js";
import { ensureAuditTables } from "../src/audit_store.js";
import { installAuditRequest } from "../src/audit_request.js";
import { normShip } from "../src/audit.js";

const H = ["ID", "Start time", "Completion time", "Email", "Name", "Last modified time", "Date", "Ship", "Crew's name: ", "Number of contracts at DG3: ", "DG3 Folder ( Desktop )\r\n", "One Note (Desktop)\r\n",
  "Internet Browser [DG3 Bookmark links] \r\n", "Was all hardware labeled correctly\r\n", "OBP with Actual/Accurate Count\r\n", "Repair Items not in OBP\r\n", "Inventory Management (1)", "Inventory Management (2)",
  "Technical Services (1)", "Technical Services (2)", "Customer collaterals incidentes (1)", "Customer collaterals incidents (2)", "HR TDG: Dispatch / Arrival (1)\r\n", "HR TDG: Dispatch / Arrival (2)",
  "Tools NOT on Inventory\r\n", "Machine Status\r\n", "Ship Overall Operation's Rating", "Reviewer Feedback\r\n", "Upload file"];
const FOLDER = "[Prod] Service Manuals;[Prod] Parts Manual (Machine, PFU, Finisher);[Prod] Maintenance Manual;[MFD] Service Manual;[MFD]     Parts Manual ;    [MFD] Maintenance Manual ;[MFD] Consumables List;";
const ONE = "Containing machine and controller IP’s;DG3 Shoreside contacts;", WEB = "Onboard Print;Zendesk;Crunchtime;Fleet Visitor Request;ECCR Request;Master Loading \\ Order Schedule;";
const row = (o) => { const r = new Array(H.length).fill(null); for (const [k, v] of Object.entries(o)) r[Number(k)] = v; return r; };
const SHEET = [H,
  row({ 0: "1", 6: "9/12/2024", 7: "Test", 16: "4", 18: "4", 20: "4", 22: "4" }),
  row({ 0: "21", 6: "11/11/2024", 7: "Jewel of the Seas", 8: "Manuel Reyes", 9: "1", 10: FOLDER, 11: ONE, 12: WEB, 13: "Yes", 16: "4", 18: "3", 20: "5", 22: "5", 24: "Print Driver Thump Drive;", 25: "Test Pattern;Scan to Email;", 27: "Manuel knows the C4070 well." }),
  row({ 0: "37", 6: "5/11/2025", 7: "Onward - Azarama", 8: "Rommel Madrinico", 10: FOLDER + "SOPs [Ordering, Requesting & Transferring Parts];", 11: ONE, 12: "Onboard Print;Zendesk;Master Loading \\ Order Schedule;", 16: "2", 18: "4", 20: "3", 22: "5" }),
  row({ 0: "39", 6: "5/26/2025", 7: "QS - Azamara", 8: "Kevin", 10: FOLDER + "SOPs [Ordering, Requesting & Transferring Parts];", 11: ONE, 12: WEB, 16: "3", 18: "3", 20: "3", 22: "5" }),
  row({ 0: "14", 6: "10/13/2024", 7: "RCG - Vision of the Seas", 8: "Sharene \\ Karl", 10: FOLDER, 11: ONE, 12: WEB, 16: "3", 18: "4", 20: "5", 22: "3" }),
  row({ 0: "61", 6: "9/30/2026", 7: "AN", 8: "Haziel", 9: "2", 10: FOLDER + "SOPs [Ordering, Requesting & Transferring Parts];", 11: ONE, 12: WEB, 13: "Yes", 14: "See attachment", 15: "(1) Fusing Roller Lower", 16: "4", 18: "2", 20: "2", 22: "5", 23: "NA", 24: "2-Fiery Back-up HDD;", 26: "3",
    28: "https://dg3365-my.sharepoint.com/personal/x/Documents/Apps/Microsoft%20Forms/Printshop%20Audit/Question/S011021340_anonymous.pdf" }),
];
const CREW = [
  { agency_id: "SC-0038701", first_name: "Manuel", last_name: "Reyes" }, { agency_id: "SC-0038368", first_name: "Rommel", last_name: "Madrinico" },
  { agency_id: "SC-0045584", first_name: "Haziel", last_name: "Caag" }, { agency_id: "SC-0039935", first_name: "Kevin Leif", last_name: "Jugao" },
  { agency_id: "SC-0038390", first_name: "Kevin Louie", last_name: "Tibay" }, { agency_id: "SC-0038320", first_name: "Sharene", last_name: "Estandian" },
];
const LEGS = [{ sc: "SC-0045584", ship: "Anthem", on: "2026-09-07", off: null }];
const out = readForms(SHEET, { crew: CREW, legs: LEGS });
const by = (n) => out.rows.find((r) => r.form === n);

test("the survey's test rows are listed with their reason and not imported", () => {
  assert.deepEqual(out.skipped, [{ form: 1, why: FORMS_TESTS[1] }]);
  assert.deepEqual(Object.keys(FORMS_TESTS).map(Number), [1, 2, 3, 4, 7, 8, 9, 10, 11]);
  assert.deepEqual(out.problems, []);
  assert.equal(out.rows.length, 5);
});

test("a ship as typed on the survey: codes, brand words, the two misspellings", () => {
  assert.equal(formsShip("QS - Azamara"), "Quest");
  assert.equal(formsShip("Onward - Azarama"), "Onward");
  assert.equal(formsShip("Celebrity - Eclispe"), "Eclipse");
  assert.equal(formsShip("CEL - Consellation"), "Constellation");
  assert.equal(formsShip("RCG - Vision of the Seas"), "Vision");
  assert.equal(formsShip("OY"), "Odyssey");
  assert.equal(formsShip("CEL-SUMMIT"), "Summit");
  assert.equal(formsShip("ABC Test"), null);
  assert.equal(formsDate("9/30/2026"), "2026-09-30");
  assert.equal(formsDate("9/30/26"), "2026-09-30");
  assert.equal(formsDate("Sep 30"), null);
});

test("who the audit was on: a full name on the roster, a first name with the schedule, never a guess", () => {
  assert.deepEqual([by(21).sc, by(21).placed], ["SC-0038701", "name"]);
  assert.deepEqual([by(61).sc, by(61).placed, by(61).crew], ["SC-0045584", "schedule", "Haziel Caag"]);
  // two Kevins on the roster and no schedule for Quest that day: kept as typed
  assert.deepEqual([by(39).sc, by(39).crew, by(39).placedWhy], [null, "Kevin", "a first name only, and no schedule for that day"]);
  assert.deepEqual([by(14).sc, by(14).placedWhy], [null, "two names in one box"]);
  // a first name alone is never placed on the roster, even when only one crew carries it today
  assert.equal(placeCrew("Haziel", "Explorer", "2026-03-02", { crew: CREW, legs: LEGS }).sc, null);
  // two crew aboard whose names both fit: nobody
  const two = [{ sc: "SC-0039935", ship: "Quest", on: "2025-01-01", off: null }, { sc: "SC-0038390", ship: "Quest", on: "2025-01-01", off: null }];
  assert.equal(placeCrew("Kevin", "Quest", "2025-05-26", { crew: CREW, legs: two }).sc, null);
  assert.equal(placeCrew("Kevin", "Quest", "2025-05-26", { crew: CREW, legs: two.slice(0, 1) }).sc, "SC-0039935");
});

test("the desk: missing only what the form offered that day; the score is the filed audit's rule", () => {
  // SOPs first appears on row 37 here (row 36 in the survey): row 21 never had the box
  assert.deepEqual(by(21).deskMissing, []);
  assert.deepEqual(by(37).deskMissing, ["bm_crunchtime", "bm_fleet", "bm_eccr"]);
  assert.deepEqual(by(61).deskMissing, []);
  assert.equal(deskMissing(null, "", ""), null); // not answered: nothing to say
  assert.deepEqual(by(21).tools, ["thumb_drive"]);
  assert.deepEqual(by(61).tools, ["fiery_hdd"]);
  assert.equal(by(37).tools, null); // the box left empty: "none listed", never "every tool present"
  assert.deepEqual([by(21).score, by(21).scoreFrom], [4, "average"]); // (4 + 3 + 5) / 3 = 4
  assert.deepEqual([by(61).score, by(61).scoreFrom], [3, "overall"]);
  assert.equal(by(61).ratings.dispatch, 5);
  assert.equal(by(61).notes.dispatch, null); // "NA" is nothing said
  assert.equal(by(61).notes.repair, "(1) Fusing Roller Lower");
  assert.equal(by(61).files.length, 1);
});

/* stored once, read by History and the one-audit route, on real SQLite */
function d1() {
  const db = new DatabaseSync(":memory:");
  const mk = (sql) => { const st = { args: [] }; st.bind = (...a) => { st.args = a.map((x) => (x === undefined ? null : x)); return st; };
    st.all = async () => ({ results: db.prepare(sql).all(...st.args) }); st.first = async () => db.prepare(sql).get(...st.args) || null;
    st.run = async () => { const r = db.prepare(sql).run(...st.args); return { meta: { changes: Number(r.changes) } }; }; return st; };
  return { db, DB: { prepare: mk, batch: async (s) => Promise.all(s.map((x) => x.run())) } };
}
test("History reads the survey's audits beside the filed ones; one opens as typed; a second load writes nothing twice", async () => {
  const { db, DB } = d1();
  const env = { DB };
  await ensureAuditTables(env);
  for (const f of out.rows) db.prepare(FORMS_INSERT_SQL).run(...formsInsertParams(f, normShip, "2026-10-20T18:00:00Z", "agent:session"));
  for (const f of out.rows) db.prepare(FORMS_INSERT_SQL).run(...formsInsertParams(f, normShip, "2026-10-20T18:05:00Z", "agent:session"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_forms").get().n, 5);
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  const R = installAuditRequest({ json, htmlResponse: (b) => new Response(b), ensureAudit: ensureAuditTables, applyOverride: (a) => a, logActivity: async () => {}, rotationSections: async () => ({ sections: [] }), sendViaMailer: async () => ({ ok: true }) });
  const get = async (p) => { const u = new URL("https://audit.cims.work" + p); return R.handle(u.pathname, new Request(u), env, u, { email: "dexter.lawrence@dg3.com" }); };
  const h = await (await get("/api/audit/history")).json();
  assert.deepEqual(h.forms, { n: 5, source: "Forms survey · Printshop Audit (Sep 2024 – Sep 2026)" });
  assert.deepEqual(h.audits.map((a) => a.id), ["forms-61", "forms-39", "forms-37", "forms-21", "forms-14"]); // newest first
  const a61 = h.audits[0];
  assert.deepEqual([a61.source, a61.ship, a61.sc, a61.crew, a61.score, a61.steps], ["forms", "Anthem", "SC-0045584", "Haziel Caag", 3, false]);
  assert.deepEqual(a61.missing, { ws: [], tools: ["fiery_hdd"], ppe: [] });
  const one = await (await get("/api/audit/forms?id=forms-39")).json();
  assert.deepEqual([one.audit.crew, one.audit.sc, one.audit.ship], ["Kevin", null, "Quest"]);
  assert.equal((await get("/api/audit/forms?id=../etc")).status, 400);
  assert.equal((await get("/api/audit/forms?id=forms-2")).status, 404);
  const u = new URL("https://audit.cims.work/api/audit/forms?id=forms-61");
  assert.equal((await R.handle(u.pathname, new Request(u), env, u, null)).status, 401);
  // the open audit site (no sign-in) never serves Dexter's words on a Forms audit; a signed-in user does (23 Oct 2026)
  const open = await R.handle(u.pathname, new Request(u), env, u, { email: "Dexter.Lawrence@dg3.com", open: true });
  assert.equal(open.status, 403);
  assert.deepEqual(await open.json(), { ok: false, error: "sign_in_needed" });
  const signed = await (await get("/api/audit/forms?id=forms-61")).json();
  assert.equal(signed.ok, true); assert.ok(signed.audit.notes);
});

test("the Score Card never reads the survey (section 1): only the audit app does", () => {
  for (const f of ["bonus.js", "score_auto.js", "worker.js"]) assert.doesNotMatch(readFileSync(new URL("../src/" + f, import.meta.url), "utf8"), /audit_forms/, f);
  const sa = readFileSync(new URL("../src/score_auto.js", import.meta.url), "utf8");
  assert.match(sa, /audit_eval/); // the Score Card's audit read is the filed grade, unchanged
  assert.deepEqual(formsHistoryRow(formsFromRow({ id: "forms-9", form_no: 9, audit_date: "2025-01-01", ship: "Oasis", agency_id: null, r_overall: null, labels: null })).followups, { open: 0, fixed: 0 });
});
