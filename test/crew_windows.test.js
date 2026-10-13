// THE CREW WINDOWS, THE STATEMENT AND ITS EMAIL (Miguel, 12 Oct 2026: "review pixel by pixel .. the edit crew pop window
// is not really well design .. the notes .. the same .. the pdf .. the email statement CC rita"; answers: "1. archive.
// 2. yes .. 3. yes .. go"). Pins: notes are archived never deleted, Edit crew shows TDG's value and Reset clears the
// manual entry, the statement email goes to the crew CC Rita once per 10 minutes, the PDF is crew-facing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { statementEmail, docLines, span, fmtDate, TEMPLATE_ID } from "../src/emails/hr.statement.v2.js";
import { composeStatement } from "../src/statement.js";
import { buildCrewProfile, feedbackFile } from "../src/crew_profile.js";

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

// ROUND 2 (Miguel, 13 Oct 2026: "the PDF still comes out pretty bad. The window for notes and documents is not the same
// size ... so much lack of detail ... the current contract ... too crowded ... See what the people need to know").
test("the contract card: header + state, the relay, four facts with sources, ONE crew-change checklist; sources and travel fold away", () => {
  const b = body("function pfContract(");
  assert.match(b, /h\+=pfRelay\(x,isCur,todayS,K,feed\);/);
  assert.match(b, /fact\('Signed on',fmtDateS\(on\)/);
  assert.match(b, /fact\(isCur\?'Sign-off':'Signed off'/);
  assert.match(b, /isCur\?fact\('To go'/);
  assert.match(b, /fact\(isCur\?'Signs off at':'Signed off at'/);
  assert.match(b, /if\(isCur\)h\+=cc\.html;/, "the checklist shows while the contract runs");
  assert.match(b, /if\(!isCur\)more\.push\('<details class=pf3more><summary><span>Crew-change record<\/span>/, "an ended contract folds its record away");
  assert.match(b, /<summary><span>How these dates were set<\/span>/);
  assert.match(b, /<summary><span>Travel<\/span>/);
  const cc = body("function pfCrewChange(");
  for (const s of ["'Reliever'", "'Dates'", "'Travel'", "'Sign-off'", "'Planned'", "'In TDG'", "'Sign-on confirmed'", "'Sign-off confirmed'", "'ECCR'", "'Flight'", "'Hotel'", "'Instructions'", "'Sign-off link'", "'Ship review'"]) assert.ok(cc.includes(s), s);
  // a console earmark told to Joy is not yet in TDG; one TDG's file also earmarks for the hull is (13 Oct 2026, a.tdg)
  assert.match(cc, /var inTdg=!!a&&\(a\.src==='tdg'\|\|a\.src==='tdg_earmark'\|\|!!a\.tdg\);/, "a console earmark told to Joy is not yet in TDG");
  assert.match(W, /<span>No reliever yet<\/span><small>Earmark one on the Keyman board<\/small>/);
  assert.doesNotMatch(W, /class="pf3p next none warn"/, "the page's global .warn box class is never reused");
});

test("Edit crew, Notes and Documents open in ONE side panel of one size", () => {
  assert.match(W, /function openSheet\(kind\)\{/);
  assert.match(body("async function editCrewModal("), /var w=openSheet\('ec2'\);/);
  assert.match(body("async function notesModal("), /openSheet\('nt2'\);/);
  assert.match(body("async function docsModal("), /var w=openSheet\('dc2'\);/);
  assert.match(W, /\.modwrap\.sheetwrap>\.modcard\.sheet\{width:640px;max-width:100%;height:100vh;height:100dvh;/);
  assert.match(W, /'<div class="modcard sheet ec2"><div class=echd>/);
  assert.match(W, /'<div class="modcard sheet nt2">'\+sheetHead\(S\.crew,/);
  assert.match(W, /'<div class="modcard sheet dc2">'\+sheetHead\(c,'Documents · '/);
  assert.match(W, /e\.key==='Escape'&&document\.querySelector\('#crewmodal\.sheetwrap'\)/, "Esc closes the panel");
});

test("Documents: number, issued, expires (with time left), issuer per document, read against the contract, the line zoomed on it", () => {
  const b = body("async function docsModal(");
  assert.match(b, /fetch\('\/api\/crew\/get\?id='/, "the full crew record, not the list's row");
  assert.match(b, /if\(!exp\)k=opt\?'na':'miss';else if\(exp<son\)k='exp';else if\(exp<soff\)k='lapse';else k='ok';/);
  assert.match(b, /if\(!opt&&cnt\[k\]!=null\)cnt\[k\]\+\+;/, "the count is the four required documents");
  const r = body("function dcRow(");
  assert.match(r, /kv\('Number',x\[2\]\)\+kv\('Issued',/);
  assert.match(r, /kv\('Issued by',x\[4\]\)/);
  assert.match(r, /t0=dayNum\(son<todayS\?son:todayS\)-45,t1=dayNum\(soff\)\+120/, "zoomed on the contract");
  assert.match(r, /valid to '\+fmtDateS\(exp\)\+' →/);
  assert.match(W, /function dcSpan\(a,b\)\{/);
});

test("the status history is one span per word: the same word from upload after upload is merged", () => {
  const rows = [["On board", "On Vacation", "2026-07-23"], ["On board", "On Vacation", "2026-07-26"], ["On board", "On Vacation", "2026-07-28"], ["On Vacation", "Earmarked", "2026-09-06"], ["On Vacation", "Earmarked", "2026-09-07"], ["Earmarked", "On board", "2026-09-26"]]
    .map(([o, n, d], i) => ({ id: "s" + i, field: "status", old_value: o, new_value: n, created_at: d + "T10:00:00Z", resolved: 1 }));
  const p = buildCrewProfile({ today: "2026-10-13", crew: { agency_id: "X" }, statusRows: rows });
  assert.deepEqual(p.status.history.map((h) => [h.word, h.from, h.to]), [["On board", "2026-09-26", null], ["Earmarked", "2026-09-06", "2026-09-26"], ["On Vacation", "2026-07-23", "2026-09-06"], ["On board", null, "2026-07-23"]]);
});

test("the statement PDF, rebuilt: details for the crew to check, four tiles, the contract feature, striped tables with pills, one page", () => {
  const S = readFileSync(new URL("../src/statement.js", import.meta.url), "utf8");
  for (const s of ['"YOUR DETAILS ON FILE  \\u00b7  PLEASE CHECK"', '"CURRENT CONTRACT" : "LAST CONTRACT"', '"Completed contracts"', '"Time at sea"', '"Documents valid"', '"Bonus count"', '"Please check this statement."', '"Bonus paid"'])
    assert.ok(S.includes(s) || S.includes(s.replace("\\u00b7", "·")), s);
  const bytes = composeStatement({ crew: { ...JAMES, rank_observed: "Junior Printer Specialist", pp_no: "P6005315C", pp_place: "DFA - San Pablo" },
    contracts: [{ seq: 1, ship: "Silhouette", on: "2026-05-02", act: "2026-09-05", proj: null, from: "FORT LAUDERDALE, FLORIDA", to: "FORT LAUDERDALE, FLORIDA" }], daysWorked: 126,
    bonus: { contracts: 1, count: 0, baseline_set: true, outcomes: [] }, generatedAt: "2026-10-12T19:00:00Z", fileAt: "2026-10-10" });
  const s = Buffer.from(bytes).toString("latin1");
  assert.equal((s.match(/\/Type \/Page /g) || []).length, 1, "a one-contract career is one page");
  for (const t of ["(Fort Lauderdale  to  Fort Lauderdale)", "(Completed)", "(Signed off)", "(Valid)", "(Not held \\(optional\\))", "(Please check this statement.)"]) assert.ok(s.includes(t), t);
  assert.ok(!s.includes("(Bonus paid)"), "nothing paid = no payout table");
});

// WHY A CONTRACT ENDED (Miguel, 13 Oct 2026: "Add 'Resigned' as an end reason?"): its own record, HR only.
test("why it ended: contract_end per crew + contract, Rita's pick from one list, never the bonus, never the crew's statement", () => {
  const b = body("async function apiContractEnd(");
  assert.match(W, /const CONTRACT_END_REASONS = \["Completed", "Resigned", "Medical", "Compassionate", "Emergency", "Performance", "Early relief", "Other"\];/);
  assert.match(b, /if \(reason && !CONTRACT_END_REASONS\.includes\(reason\)\) return json\(\{ error: "unknown_reason"/);
  assert.match(b, /ON CONFLICT\(sc,on_key\) DO UPDATE SET reason=excluded\.reason/);
  assert.match(b, /: env\.DB\.prepare\("DELETE FROM contract_end WHERE sc=\? AND on_key=\?"\)/, "an empty reason clears it");
  assert.match(b, /"contract_end", sc \+ " " \+ onKey/, "audited");
  assert.doesNotMatch(b, /assignment|bonus_outcome/, "the bonus's end_reason is untouched (§1)");
  assert.match(W, /CREATE TABLE IF NOT EXISTS contract_end \(sc TEXT NOT NULL, on_key TEXT NOT NULL, reason TEXT NOT NULL/);
  assert.match(readFileSync(new URL("../migrations/0021_contract_end.sql", import.meta.url), "utf8"), /PRIMARY KEY \(sc, on_key\)/);
  assert.match(W, /SELECT on_key, reason, note, set_by, set_at FROM contract_end WHERE sc=\?/);
  // 13 Oct 2026: the INTERNAL crew file prints a contract's end reason on its Contract feedback pages; the crew's statement
  // (no data.feedback) never does — checked on the output, below in the crew-file test.
  assert.doesNotMatch(readFileSync(new URL("../src/statement.js", import.meta.url), "utf8"), /contract_end/, "the statement never reads the table");
  assert.doesNotMatch(readFileSync(new URL("../src/emails/hr.statement.v2.js", import.meta.url), "utf8"), /contract_end|Resigned/);
  assert.doesNotMatch(readFileSync(new URL("../src/bonus.js", import.meta.url), "utf8"), /contract_end/);
  assert.match(body("function pfContract("), /if\(!isCur&&off&&off<=todayS\)h\+=pfWhy\(x\);/);
  assert.match(W, /var PF_END_REASONS=\['Completed','Resigned','Medical','Compassionate','Emergency','Performance','Early relief','Other'\];/, "the page's list is the server's");
});

test("the profile attaches the reason to its contract and the To-check row clears", () => {
  const legs = [{ sc: "X", ship: "Silhouette", on: "2026-05-02", off: "2026-09-05", source: "registry", offSource: "tdg" }];
  const counter = [{ seq: 1, ship: "Silhouette", sign_on: "2026-05-02", proj_off: "2026-11-21", act_off: null }];
  const base = { today: "2026-10-13", crew: { agency_id: "X" }, legs, counter };
  const before = buildCrewProfile(base);
  assert.ok(before.checks.some((c) => c.key === "end_reason"), "ended 77 days early, nothing recorded: a row to check");
  const after = buildCrewProfile({ ...base, ends: [{ on_key: "2026-05-02", reason: "Resigned", note: "Family reasons", set_by: "rita.berenyi@dg3.com", set_at: "2026-10-13T08:00:00Z" }] });
  assert.deepEqual(after.contracts[0].end, { reason: "Resigned", note: "Family reasons", by: "Rita", at: "2026-10-13", onKey: "2026-05-02" });
  assert.ok(!after.checks.some((c) => c.key === "end_reason"));
});

// THE EMERGENCY CONTACT (Miguel, 13 Oct 2026: "u can add it"): from TDG's file once it carries the column.
test("emergency contact: read from whatever header TDG uses, never mistaken for the crew's own phone or email; an empty cell clears it", async () => {
  const { mapRow, pickEmergency } = await import("../src/crewimport.js");
  const base = { "CREW ID": "SC-1", "FIRST NAME": "Ian", "LAST NAME": "Alega", "CREW STATUS": "On board" };
  // TDG adds the columns AFTER the crew's own: the crew's mobile stays the crew's
  const r = mapRow({ ...base, "MOBILE NO.": "+63 900 000 0001", "EMAIL ADDRESS": "ian@x.com", "EMERGENCY CONTACT": "Maria Alega", "RELATIONSHIP": "Wife", "EMERGENCY CONTACT NO.": "+63 900 000 0002" });
  assert.deepEqual([r.phone, r.email, r.emergency_name, r.emergency_relation, r.emergency_phone], ["+63 900 000 0001", "ian@x.com", "Maria Alega", "Wife", "+63 900 000 0002"]);
  // a file WITHOUT a mobile column: "contact no" must not take the emergency number as the crew's phone
  const n = mapRow({ ...base, "NEXT OF KIN": "Jose Alega", "NOK CONTACT NUMBER": "0917 1234567" });
  assert.equal(n.phone, null);
  assert.deepEqual([n.emergency_name, n.emergency_phone], ["Jose Alega", "0917 1234567"]);
  // split name
  assert.equal(pickEmergency({ "EMERGENCY FIRST NAME": "Ana", "EMERGENCY LAST NAME": "Cruz" }).emergency_name, "Ana Cruz");
  // the column is there and the cell is empty: TDG removed it, the card clears it
  const blank = (await import("../src/crewimport.js")).mapRowFull({ ...base, "EMERGENCY CONTACT": "", "EMERGENCY CONTACT NO.": "-" });
  assert.deepEqual([...blank.row._blank].sort(), ["emergency_name", "emergency_phone"]);
  // today's file (no such column) says nothing
  assert.equal(mapRow({ ...base, "MOBILE NO.": "1" }).emergency_name, null);
  assert.equal(((await import("../src/crewimport.js")).mapRowFull({ ...base, "MOBILE NO.": "1" }).row._blank || []).length, 0);
});

test("emergency contact: written by the import, typed in Edit crew with Reset to TDG, shown on the profile and the crew's statement", async () => {
  const { CREW_WRITABLE } = await import("../src/crew_import_routes.js");
  const { OVR_FIELDS } = await import("../src/override.js");
  for (const f of ["emergency_name", "emergency_relation", "emergency_phone"]) { assert.ok(CREW_WRITABLE.has(f), f); assert.ok(OVR_FIELDS.includes(f), f); }
  assert.match(W, /"ALTER TABLE crew ADD COLUMN emergency_name TEXT"/);
  assert.match(W, /"ALTER TABLE crew_override ADD COLUMN emergency_phone TEXT"/);
  assert.match(readFileSync(new URL("../migrations/0022_emergency_contact.sql", import.meta.url), "utf8"), /ALTER TABLE crew_override ADD COLUMN emergency_relation TEXT;/);
  assert.match(W, /txt\('emergency_name','eEmName','Name'\)\+txt\('emergency_relation','eEmRel','Relationship'\)\+txt\('emergency_phone','eEmPh','Phone'\)/);
  assert.match(W, /emergency_name:v\('eEmName'\),emergency_relation:v\('eEmRel'\),emergency_phone:v\('eEmPh'\)/);
  assert.match(W, /<span class=pf3l style="margin-right:6px">Emergency<\/span>/);
  const s = Buffer.from(composeStatement({ crew: { ...JAMES, emergency_name: "Maria Agbada", emergency_relation: "Mother", emergency_phone: "+63 900 1" }, contracts: [], daysWorked: 0, bonus: null, generatedAt: "2026-10-13T10:00:00Z" })).toString("latin1");
  assert.ok(s.includes("(Maria Agbada \\(Mother\\) +63 900 1)"));
});

// THE INTERNAL CREW FILE (Miguel, 13 Oct 2026: "the PDF should include this also in a clean page .. regardless if there is
// space on a previous one .. as Contract feedback .. should display the entire historical data .. not just the contract that
// just ended"; "this is not needed in the PDF" — the requests strip). A separate PDF, never emailed: the crew's statement and
// its email stay crew-facing.
test("crew file: Contract feedback groups everything said by the contract it falls in, newest first; the rest is 'between'", () => {
  const profile = {
    contracts: [
      { n: 2, ship: "Silhouette", on: "2026-05-02", off: "2026-09-05", end: { reason: "Resigned" }, earlyDays: 77 },
      { n: 1, ship: "Apex", on: "2025-06-01", off: "2025-12-20" },
    ],
    people: { feed: [
      { kind: "note", at: "2026-06-10T10:00:00Z", text: "Asked for a transfer" },
      { kind: "feedback", at: "2025-12-18T10:00:00Z", who: "Ray", answers: { ontime: "Yes", par: "No", note: "Good handover" } },
      { kind: "intel", at: "2026-08-01T10:00:00Z", parts: [{ label: "Summary", text: "Late on PM" }], via: "crew-reports", confidence: "high" },
      { kind: "note", at: "2026-02-01T10:00:00Z", text: "Called, on vacation" },
      { kind: "feedback", at: "2025-11-01T10:00:00Z", who: "Ray", answers: { ontime: "No" }, superseded: true },
    ] },
  };
  const f = feedbackFile(profile, "2026-10-13");
  assert.deepEqual(f.groups.map((g) => g.key), ["2026-05-02", "2025-06-01", "between"], "every contract with something said, the oldest too");
  assert.deepEqual(f.groups[0].items.map((i) => i.at), ["2026-08-01", "2026-06-10"], "newest first inside a contract");
  assert.equal(f.groups[0].contract.end.reason, "Resigned");
  assert.deepEqual(f.groups[1].items[0].tags, [["Orders on time", "Yes"], ["Par at handover", "No"]], "answers read in words");
  assert.deepEqual(f.groups[1].items[0].lines, [{ label: null, text: "Good handover" }]);
  assert.equal(f.groups[1].items[1].superseded, true, "a superseded answer is kept and marked, never dropped");
  assert.equal(f.groups[2].items[0].at, "2026-02-01");
  assert.equal(f.total, 5);
});

test("crew file PDF: Contract feedback on a page of its own, internal on every page of it; the statement stays crew-facing", () => {
  const base = { crew: { ...JAMES, rank_observed: "Junior Printer Specialist" },
    contracts: [{ seq: 1, ship: "Silhouette", on: "2026-05-02", act: "2026-09-05", proj: null }], daysWorked: 126,
    bonus: { contracts: 1, count: 0, baseline_set: true, outcomes: [] }, generatedAt: "2026-10-13T10:00:00Z", fileAt: "2026-10-10" };
  const feedback = { groups: [{ key: "2026-05-02", contract: { n: 1, ship: "Silhouette", on: "2026-05-02", off: "2026-09-05", end: { reason: "Resigned" }, earlyDays: 77 },
    items: [{ at: "2026-06-10", kind: "note", label: "Note", who: "Rita", lines: [{ label: null, text: "Asked for a transfer" }], tags: [] }] }], slots: [], total: 1 };
  const file = Buffer.from(composeStatement({ ...base, feedback })).toString("latin1");
  for (const t of ["(Crew file  -  internal)", "(Contract feedback)", "(Asked for a transfer)", "Not for the crew", "Resigned"])
    assert.ok(file.includes(t), "the crew file carries " + t);
  const stmt = Buffer.from(composeStatement(base)).toString("latin1");
  for (const t of ["Contract feedback", "Asked for a transfer", "Not for the crew", "Resigned", "internal"])
    assert.ok(!stmt.includes(t), "the crew's statement never carries " + t);
  // the internal file speaks to HR on every page: no "please check", no "your", the red internal line on page 1 too
  for (const t of ["Please check this statement", "PLEASE CHECK", "your current contract", "Questions: Rita"])
    assert.ok(!file.includes(t), "the crew file never asks the crew: " + t);
  assert.ok(stmt.includes("Please check this statement") && stmt.includes("Questions: Rita"), "the statement still does");
  const S = readFileSync(new URL("../src/statement.js", import.meta.url), "utf8");
  assert.match(S, /pdf\._newPage\(\); fbStart = pdf\.pages\.length - 1;/, "a clean page, whatever space is left");
  assert.doesNotMatch(S, /Last contract's requests/, "the requests strip is gone from the PDF");
  const b = body("async function apiCrewFilePdf(");
  assert.match(b, /feedbackFile\(prof && prof\.profile, TODAY\(\)\)/);
  assert.match(W, /if \(p === "\/api\/crew\/file\.pdf"\) return apiCrewFilePdf\(env, url, session\);/);
  assert.doesNotMatch(body("async function apiStatementEmail("), /feedback/, "the email sends the crew's statement, never the file");
});

test("statement documents read against the running contract: Lapses = expires before the sign-off", () => {
  const bytes = composeStatement({ crew: { ...JAMES, usv_exp: "2026-12-01" },
    contracts: [{ seq: 1, ship: "Symphony", on: "2026-08-01", act: null, proj: "2027-03-01" }], daysWorked: 70,
    bonus: { contracts: 1, count: 0, baseline_set: true, outcomes: [] }, generatedAt: "2026-10-13T10:00:00Z", fileAt: "2026-10-10", today: "2026-10-13" });
  const s = Buffer.from(bytes).toString("latin1");
  assert.ok(s.includes("Lapses"), "the US visa ending Dec 1 lapses inside a contract to Mar 1");
  assert.ok(s.includes("for this contract, to Mar 1, 2027"));
});
