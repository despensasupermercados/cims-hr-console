// THE 8 OCT 2026 BUG HUNT (Miguel: "look at the entire code.. find bugs and fix them"). Five independent reviews,
// every finding traced to a real input before it was fixed. One test per defect, so none can quietly come back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { storableStatus } from "../src/crewimport.js";
import { addMonthsISO } from "../src/relief_api.js";
import { docStatus } from "../src/doc_radar.js";
import { boardSource } from "../src/ship_leg_source.js";
import { earmarkDiscrepancies } from "../src/earmark.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const src = (f) => readFileSync(new URL("../src/" + f, import.meta.url), "utf8");

test("the AdvancedQuery Apply survives TDG's Reserved Crew / Not for Rehire: crew.status only ever gets a word production's CHECK accepts", () => {
  assert.ok(DatabaseSync, "node:sqlite unavailable");
  const d = new DatabaseSync(":memory:");
  // production's column, read from D1 on 8 Oct 2026
  d.exec("CREATE TABLE crew (agency_id TEXT, status TEXT NOT NULL CHECK (status IN ('On board','On Vacation','Earmarked','Inactive')))");
  assert.throws(() => d.prepare("INSERT INTO crew VALUES ('SC-X','Reserved')").run(), /CHECK constraint failed/, "the word itself is refused: one row failed the whole batch");
  for (const [word, stored] of [["Reserved", "On Vacation"], ["Not for Rehire", "Inactive"], ["Reserved Crew", "On Vacation"], ["On board", "On board"], ["Earmarked", "Earmarked"], ["Retired", "Inactive"]]) {
    assert.equal(storableStatus(word), stored, word);
    d.prepare("INSERT INTO crew VALUES (?,?)").run("SC-" + word, storableStatus(word));
  }
  assert.equal(storableStatus(null), null); assert.equal(storableStatus("gibberish"), null);
  const R = src("crew_import_routes.js");
  assert.match(R, /const v = u\.field === "status" \? storableStatus\(u\.value\) : u\.value;/);
  assert.match(R, /c === "status" \? \(storableStatus\(n\.status\) \|\| "On Vacation"\)/, "a new crew is inserted with a storable word");
  assert.match(W, /m\.last_name, storableStatus\(m\.status\),/, "the legacy import");
  assert.match(W, /storableStatus\(b\.status\) \|\| "Earmarked"/, "Add crew");
});

test("server: the active span carries the fields its callers read; the sent line knows its card; a failed config read never serves the July constant", async () => {
  assert.match(W, /h\.is_current && h\.on\) return \{ active_on: h\.on, active_off: h\.off \|\| null \};/, "every file-dated crew read 'No active contract on file'");
  assert.match(W, /sent_by, recipient, assignment_id FROM deploy_log WHERE restored_at IS NULL/, "assignment_id was never selected: a sent card was drawn twice");
  assert.equal(await boardSource({ DB: { prepare: () => ({ first: async () => { throw new Error("D1 down"); } }) } }), null);
  assert.equal(await boardSource({ DB: { prepare: () => ({ first: async () => null }) } }), "ship_history", "a missing row is still the legacy source");
  assert.match(W, /if \(src == null\) throw new Error\("board_source_unreadable"\);/);
});

test("server: dashboard tiles = Compliance tab; a removed user loses access; same-day files bring a rejected TDG earmark back; overdue is not 'signed off recently'", () => {
  assert.match(W, /const d = \(f\) => \{ const v = \(ov && ov\[f\] != null && ov\[f\] !== ""\) \? ov\[f\] : c\[f\]; return v && String\(v\)\.slice\(0, 10\) < in90; \};/);
  assert.match(W, /if \(!isOffFleet\(s\)\) \{\s*const d = /, "active crew only");
  assert.match(W, /return \(await stillAllowed\(env, p\.email\)\) \? p : null;/);
  assert.match(W, /const ALLOW_CACHE_MS = 5 \* 60 \* 1000;/, "remembered per isolate: no extra round trip per request");
  assert.match(W, /if \(w === "recent" && h\.is_current\) continue;/);
});

test("server: statement and sea-days, the intel inbox, the feedback form", () => {
  const S = src("statement.js");
  assert.match(S, /Completed contracts: " \+ \(bonus\.contracts != null \? bonus\.contracts : "-"\)/, "the CUMULATIVE count beside the rank");
  assert.match(S, /"Consecutive bonus count: " \+ \(bonus\.count != null \? bonus\.count : 0\)/);
  assert.equal((W.match(/julianday\(MIN\(COALESCE\(act_off,proj_off\),date\('now'\)\)\)/g) || []).length, 2, "sea-days stop at today on the card and the statement");
  assert.match(W, /const crew = Object\.assign\(applyOverride\(base, ov\), \{ id: base\.id, baseline_count: base\.baseline_count \}\);/, "the statement reads Rita's corrections; the money keeps the base baseline");
  assert.match(W, /SELECT id FROM crew_intel WHERE source_email_id=\? LIMIT 1/, "idempotent: a retry never files the same email twice");
  assert.match(W, /bind\(inserted \? "processed" : "new", row\.id\)/, "a failure never leaves the row 'processing'");
  assert.match(W, /UPDATE email_inbox SET status='new' WHERE status='processing' AND \(processed_at IS NULL OR processed_at < \?\)/);
  assert.match(W, /if\(!r\|\|r\.error\|\|r\.ok===false\)\{document\.getElementById\('sb'\)\.disabled=false;/, "no thank-you for an answer that was not saved");
});

test("XSS: contributor answers and names are text, never markup", () => {
  assert.match(W, /d\.prefill\.evidence\.map\(escHtml\)\.join\('<br>'\)/);
  assert.match(W, /function swTa\(id,val\)\{return '<textarea id='\+id\+' rows=2>'\+escHtml\(val\|\|''\)\+'<\/textarea>';\}/);
  assert.match(W, /function ta\(id,v\)\{return '<textarea id='\+id\+' rows=2>'\+fbEsc\(v\|\|''\)\+'<\/textarea>';\}/);
  assert.equal((W.match(/value="'\+(escHtml|fbEsc)\(a\.(rushcost|mono)\|\|''\)\+'"/g) || []).length, 4);
  assert.match(W, /class=rnm>'\+escHtml\(x\.name\)\+/);
  assert.match(W, /<div class=cname>Edit contract — '\+escHtml\(e\.name\)\+'/);
  assert.match(src("relief_ui.js"), /function rEsc\(v\)/);
});

test("page: the board's own error, projected sign-offs stay projected, Edit crew saves only what changed, refreshes and filters stay put", () => {
  assert.doesNotMatch(W, /_rr\.status/, "an undefined variable turned the board's error into a blank 'Loading…'");
  assert.match(W, /function offToSave\(el\)\{if\(!el\)return null;var v=el\.value\|\|'';if\(el\.getAttribute\('data-proj'\)==='1'&&v===\(el\.getAttribute\('data-init'\)\|\|''\)\)return null;return v;\}/);
  assert.match(W, /sign_off:offToSave\(g\('eOff'\)\)/);
  assert.match(W, /if\(!r1\.ok\|\|j1\.error\)\{g\('cmtmsg'\)\.textContent='Not saved: '/);
  assert.match(W, /CREW_EDIT_INIT=crewEditBody\(id\);/);
  assert.match(W, /if\(String\(all\[k\]\)!==String\(init\[k\]\)\)\(body\[k\]=all\[k\],n\+\+\);/);
  assert.match(W, /if\(tabFromHash\(\)!==_tab0\|\|VIEW_GEN!==_gen0\)return;rerender0\(\);/);
  assert.match(W, /if\(ROT_FRESH\)\{ROT_FRESH=0;ROT_F='';/);
  assert.match(W, /if\(tab==='rotation'\)\{ROT_FRESH=1;return renderRotation\(\);\}/);
  assert.match(W, /function docFlag\(exp\)\{if\(!exp\)return'missing';var days=dUntil\(exp\);/, "a document is valid through its expiry day, as on the server");
  assert.match(W, /'-01T00:00:00Z'\)\.toLocaleDateString/, "the billing CSV month east of UTC");
  assert.match(src("relief_ui.js"), /return \/azamara\/i\.test\(b\)\?5:7;\}/, "the relief panel's contract is seven months like the board's");
});

test("dates: calendar months clamp to the month's end; an impossible document date is suspect, not valid", () => {
  assert.deepEqual([addMonthsISO("2026-08-31", 6), addMonthsISO("2026-09-30", 5), addMonthsISO("2026-07-31", 7), addMonthsISO("2026-04-29", 7)], ["2027-02-28", "2027-02-28", "2027-02-28", "2026-11-29"]);
  assert.equal(docStatus("2027-13-01", "2026-10-08"), "suspect");
  assert.equal(docStatus("2027-02-06", "2026-10-08"), "valid");
  assert.match(src("ship_leg_source.js"), /function plusMonths\(d, n\) \{\s*const m = /);
  assert.match(src("relief_api.js"), /\} else if \(!l\.off_date\) \{/, "the relief board keeps the board's sign-off on Azamara");
});

test("earmarks: one TDG earmark answers ONE card (the earliest); 'signed off' needs an ashore word", () => {
  const projections = [
    { id: "a1", sc: "SC-X1", crew_name: "X One", ship: "Allure", sign_on: "2026-11-29", planned_sign_off: "2027-06-26" },
    { id: "a2", sc: "SC-X2", crew_name: "X Two", ship: "Allure", sign_on: "2027-06-26", planned_sign_off: "2028-01-26" },
  ];
  const registry = [
    { agency_id: "SC-Y", name: "Y Tdg", status: "Earmarked", vessel_observed: "Allure", run_at: "2026-10-08T17:00:00Z" },
    { agency_id: "SC-X1", status: "On Vacation", vessel_observed: "Wonder", run_at: "2026-10-08T17:00:00Z" },
    { agency_id: "SC-X2", status: "On Vacation", vessel_observed: "Apex", run_at: "2026-10-08T17:00:00Z" },
  ];
  const { items } = earmarkDiscrepancies({ projections, registry, today: "2026-10-08" });
  assert.equal(items.filter((i) => i.kind === "other_person").length, 1, "only the earliest card is answered by TDG's earmark");
  assert.ok(items.some((i) => i.kind === "not_in_tdg"), "the later card is a plan TDG does not have yet");
  assert.match(src("earmark.js"), /prevShip && norm\(prevShip\) !== norm\(cardShip\) && \(status === "On Vacation" \|\| status === "Reserved"\)\) \{/);
});

test("emails: the sign-off link / instructions use the seat, never wipe an acknowledgement; auto-send sees Rita's address; relief confirmed only on THIS ship", () => {
  for (const f of ["signoff_ack.js", "signoff_instructions.js"]) {
    const S = src(f);
    assert.match(S, /async function seatLeg\(env, sc, seq\) \{/, f);
    assert.match(S, /if \(prev && prev\.status === "acknowledged" && !b\.force\) return json\(\{ ok: false, error: "already_acknowledged" \}, 409\);/, f);
    assert.match(S, /var ed = \(ovr && ovr\.fromBoard\) \? \{\} :/, f);
  }
  assert.equal((W.match(/sendViaMailer, boardLegs \}\)/g) || []).length, 4, "both installers, both call sites, get the board schedule");
  assert.match(src("auto_send.js"), /COALESCE\(NULLIF\(o\.email,''\), c\.email\) AS email/);
  assert.match(src("relief_coverage.js"), /LEFT JOIN registry_snapshot rs ON rs\.agency_id = rc\.agency_id\s*WHERE a\.sign_on BETWEEN \? AND \? AND a\.actual_sign_off IS NULL/);
});
