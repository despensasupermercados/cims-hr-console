// THE CREW WINDOWS, THE STATEMENT AND ITS EMAIL (Miguel, 12 Oct 2026: "review pixel by pixel .. the edit crew pop window
// is not really well design .. the notes .. the same .. the pdf .. the email statement CC rita"; answers: "1. archive.
// 2. yes .. 3. yes .. go"). Pins: notes are archived never deleted, Edit crew shows TDG's value and Reset clears the
// manual entry, the statement email goes to the crew CC Rita once per 10 minutes, the PDF is crew-facing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { statementEmail, docLines, span, fmtDate, TEMPLATE_ID } from "../src/emails/hr.statement.v2.js";
import { composeStatement } from "../src/statement.js";
import { buildCrewProfile } from "../src/crew_profile.js";

const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const body = (name) => { const i = W.indexOf(name); assert.notEqual(i, -1, name); const r = W.slice(i + name.length); const j = r.search(/\n(?:async )?function \w+\(/); return r.slice(0, j); };
const JAMES = { agency_id: "SC-0045960", first_name: "James", middle_name: "Cordero", last_name: "Agbada", med_exp: "2028-03-19", sirb_exp: "2035-10-21", pp_exp: "2033-11-21", usv_exp: "2036-02-26" };

test("notes are ARCHIVED, never deleted: the route updates the row, Restore clears it, the author is kept; every reader skips archived notes", () => {
  const b = body("async function apiCrewNotes(");
  assert.doesNotMatch(b, /DELETE FROM crew_note_log/, "no note is ever deleted");
  assert.match(b, /UPDATE crew_note_log SET archived_at=\?, archived_by=\? WHERE id=\? AND archived_at IS NULL/);
  assert.match(b, /UPDATE crew_note_log SET archived_at=NULL, archived_by=NULL WHERE id=\?/);
  assert.match(b, /INSERT INTO crew_note_log \(agency_id,ts,text,created_by\) VALUES/);
  assert.match(b, /const arch = b\.archive != null \? b\.archive : b\.delete;/, "the old page's delete archives too");
  assert.match(W, /INSERT INTO crew_note_log \(agency_id,ts,text,created_by\) VALUES \(\?,\?,\?,\?\)"\)\.bind\(b\.agency_id, now, note\.trim\(\)/, "the Comment's copy keeps its author");
  assert.match(W, /COUNT\(\*\) n FROM crew_note_log WHERE archived_at IS NULL GROUP BY agency_id/, "the crew list's dot");
  assert.match(W, /MAX\(ts\) AS last_ts FROM crew_note_log WHERE archived_at IS NULL GROUP BY agency_id/, "the board card's dot");
  assert.match(W, /FROM crew_note_log WHERE agency_id=\? AND archived_at IS NULL ORDER BY ts DESC/, "the contract modal's notes");
  assert.match(W, /"ALTER TABLE crew_note_log ADD COLUMN created_by TEXT",\s*\n?\s*"ALTER TABLE crew_note_log ADD COLUMN archived_at TEXT", "ALTER TABLE crew_note_log ADD COLUMN archived_by TEXT"/);
  assert.match(readFileSync(new URL("../migrations/0020_note_archive.sql", import.meta.url), "utf8"), /ADD COLUMN archived_at TEXT/);
});

test("the profile's feed leaves an archived note out and names a note's author from created_by", () => {
  const p = buildCrewProfile({ today: "2026-10-12", crew: { agency_id: "X" }, notes: [
    { id: 1, ts: "2026-08-22T10:00:00Z", text: "Kept", created_by: "rita.berenyi@dg3.com" },
    { id: 2, ts: "2026-06-28T10:00:00Z", text: "Gone", archived_at: "2026-10-12T10:00:00Z", archived_by: "miguel.sanmartin@dg3.com" }] });
  assert.deepEqual(p.people.feed.map((f) => [f.text, f.who]), [["Kept", "Rita"]]);
});

test("the Notes window: one stream grouped by contract, Archive / Restore, filter chips; nothing deleted from the page", () => {
  assert.match(W, /async function notesModal\(id\)\{/);
  assert.match(W, /function ntArchive\(nid,restore\)\{/);
  assert.match(W, /JSON\.stringify\(restore\?\{restore:nid\}:\{archive:nid\}\)/);
  assert.doesNotMatch(W, /function deleteCrewNote\(/, "the hard delete is gone from the page");
  assert.match(W, /chip\('all','All'\)\+chip\('note','Notes'\)\+chip\('intel','Field intel'\)\+chip\('feedback','Feedback'\)/);
  assert.match(W, /Nothing is ever deleted\./);
});

test("Edit crew: TDG's value under every field a person changed, Reset to TDG CLEARS the manual entry, Save counts changes, baseline money-only", () => {
  assert.match(W, /async function editCrewModal\(id\)\{/);
  assert.match(W, /'<div class=echint>TDG: '\+escHtml\(tdgTxt\(k,T\[k\]\)\)\+' · <a href="#" onclick="ecReset\(/);
  assert.match(W, /if\(String\(all\[k\]\)===String\(CREW_RESET\[k\]\)\)\{if\(!\(k in body\)\)n\+\+;body\[k\]='';\}/, "a reset sends '' (stored NULL), never TDG's value as a pin");
  assert.match(W, /b\.textContent=r\.n\?\('Save '\+r\.n\+' change'/);
  assert.match(W, /\(d\.canMoney\?'':' disabled'\)/);
  assert.match(W, /return json\(\{ crew, contracts: ct, daysWorked: profile\.numbers\.seaDays, deployment: crewDeployment\(crew, VESSEL_REF, DRY_DOCK, today\), profile, tdg, override: ov \|\| null, canMoney: isMoneyUser\(session && session\.email\) \}\);/);
  assert.match(W, /<option value="">TDG: '\+escHtml\(F\.status\|\|c\.status\|\|'—'\)\+'<\/option>/, "no manual status = TDG's word");
});

test("the statement email: to the crew, CC Rita, reply-to Rita, the v2 body, and ONE send per 10 minutes", () => {
  const b = body("async function apiStatementEmail(");
  assert.match(b, /const cc = deployCc\(env\)\.filter\(/);
  assert.match(b, /to: \[to\], cc: cc\.length \? cc : undefined, replyTo: cc\[0\] \|\| undefined,/);
  assert.match(b, /templateId: STATEMENT_TEMPLATE_ID,/);
  assert.match(b, /if \(recent && !b\.resend\) return json\(\{ ok: false, error: "already_sent"/);
  assert.match(b, /idempotencyKey: "hr\.statement:" \+ id/);
  assert.match(W, /const STATEMENT_RESEND_MIN = 10;/);
  assert.match(W, /if\(!resend&&!confirm\('Email the crew statement to '\+nm/, "the page says who it goes to first");
  assert.match(W, /if\(btn\)btn\.disabled=true;/, "the button is off while it sends");
  assert.equal(TEMPLATE_ID, "hr.statement.v2");
});

test("hr.statement.v2 renders to the CIMS standard: canonical letterhead, no rgba / gradient, the outcome in the subject and the preheader", () => {
  const m = statementEmail({ crew: JAMES, contracts: [{ seq: 1, ship: "Silhouette", on: "2026-05-02", act: "2026-09-05", proj: null }], daysWorked: 126, bonus: { contracts: 1, count: 0 }, today: "2026-10-12", fileAt: "2026-10-10" });
  assert.equal(m.subject, "Your CIMS crew statement · Oct 12, 2026");
  assert.match(m.html, /CRUISE INDUSTRY MANAGED SERVICES/);
  assert.match(m.html, /bgcolor="#142D48"/);
  assert.doesNotMatch(m.html.replace(/<!--[\s\S]*?-->/g, ""), /rgba\(|gradient/);
  assert.match(m.html, /Hi James, your statement is attached\./);
  assert.match(m.html, />4 of 4</);
  assert.match(m.html, /Signed off <b style="color:#3E7F2E;">Sep 5, 2026<\/b>/);
  assert.match(m.html, /Contract dates are from TDG's crew file of Oct 10, 2026\./);
  assert.match(m.text, /Days at sea: 126/);
  assert.doesNotMatch(m.html, /intel|Resigned|corrective|feedback/i, "crew-facing: nothing kept for HR only");
  assert.deepEqual(docLines({ med_exp: "2026-10-01", sirb_exp: "2026-12-01", pp_exp: null, usv_exp: "2030-01-01" }, "2026-10-12").map((d) => d.state), ["expired", "soon", "missing", "ok"]);
  assert.equal(span("2026-05-02", "2026-09-05"), "4 months 3 days");
  assert.equal(fmtDate("2026-09-05"), "Sep 5, 2026");
});

test("the statement PDF: the letterhead, TDG's dates, every document with its number, Rita as the contact — and nothing kept for HR", () => {
  const bytes = composeStatement({ crew: { ...JAMES, rank_observed: "Junior Printer Specialist", pp_no: "P6005315C", pp_place: "DFA - San Pablo", status: "Inactive" },
    contracts: [{ seq: 1, ship: "Silhouette", on: "2026-05-02", act: "2026-09-05", proj: null }], daysWorked: 126,
    bonus: { rank: "Printer Specialist", contracts: 1, count: 0, baseline_set: true, nextRungIfClean: 0, outcomes: [] }, generatedAt: "2026-10-12T19:00:00Z", fileAt: "2026-10-10" });
  const s = Buffer.from(bytes).toString("latin1");
  for (const t of ["(CIMS)", "(Crew statement)", "(James Cordero Agbada)", "(Sep 5, 2026)", "(4 mo 3 d)", "(P6005315C)", "(DFA - San Pablo)", "(Dates from TDG's crew file of Oct 10, 2026.)", "Questions: Rita Berenyi"])
    assert.ok(s.includes(t), "the PDF carries " + t);
  assert.ok(!s.includes("Inactive"), "the crew's status word is the console's, not the statement's");
  assert.ok(!s.includes("(Printer Specialist)") && !s.includes("Rank:"), "the console's grade is not printed beside TDG's position");
});

test("profile pixel pass: the numbers sit in the header's right half; the feedback buttons are short; the career card has its gap", () => {
  assert.match(W, /var NUMS='<div class="pf2nums inhd">'/);
  assert.match(W, /h\+=NUMS\+'<\/div><div class=pf2srcs>/);
  assert.match(W, /\.pf2hd\+\.pfsec,\.pf2band\+\.pfsec/);
  assert.match(W, /\+label\+\(s\.state==='answered'\?' ✓'/);
});
