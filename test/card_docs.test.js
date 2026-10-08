// THE EARMARK CARD SAYS WHERE THEY ARE AND WHAT WILL NOT CARRY THE CONTRACT; THE CARD'S INSIDE TAGS EVERY DOCUMENT
// (Miguel, 8 Oct 2026, Villacortes' Allure earmark: "I need you to tell me there that he's on board on Wonder ... put
// it right below the name ... I should also see whether or not there is any document already expired. If I click in
// the card ... right before the comments, all the tags in a tag format: all the documents ... who are expired. Below,
// all the documents who are expired within the next 30 days, and then everything else ... in green").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contractDocBadge, documentLines } from "../src/keyman_deploy.js";

const DOCS = { med_exp: "2027-02-06", sirb_exp: "2032-08-09", pp_exp: "2028-03-15", usv_exp: "2033-01-03", sch_exp: null };

test("contractDocBadge reads the documents against the PLAN's dates: lapsing before the sign-off is amber by name, expired by the sign-on red, a required one with no date one count", () => {
  // Villacortes, Allure Nov 29, 2026 → Jun 26, 2027: the medical (Feb 6) lapses mid-contract — today's 90-day rule saw nothing
  const b = contractDocBadge(DOCS, "2026-11-29", "2027-06-26");
  assert.deepEqual(b.items, []);
  assert.deepEqual(b.expiringItems, [{ doc: "Medical", exp: "2027-02-06", days: null, required: true }]);
  assert.equal(b.rest, null); assert.equal(b.worst, "expiring"); assert.equal(b.contract, true);
  // a sign-on after the medical: expired FOR THE PLAN
  const late = contractDocBadge(DOCS, "2027-03-01", "2027-10-01");
  assert.deepEqual(late.items, [{ doc: "Medical", exp: "2027-02-06", required: true }]); assert.equal(late.worst, "expired");
  // nothing lapses inside the contract, one required date missing
  const miss = contractDocBadge({ ...DOCS, med_exp: "2030-01-01", pp_exp: null }, "2026-11-29", "2027-06-26");
  assert.deepEqual([miss.items, miss.expiringItems, miss.rest && miss.rest.label], [[], [], "1 MISSING"]);
  assert.equal(contractDocBadge({ ...DOCS, med_exp: "2030-01-01" }, "2026-11-29", "2027-06-26"), null, "clean for the plan: no chip");
});

test("documentLines with a 30-day window is what the modal tags: expired, within 30 days, the rest", () => {
  const d = documentLines({ med_exp: "2026-10-20", sirb_exp: "2026-09-01", pp_exp: "2030-01-01", usv_exp: null, sch_exp: null }, "2026-10-08", 30);
  assert.deepEqual(d.map((x) => [x.doc, x.status]), [["Medical", "expiring"], ["Seaman's Book", "expired"], ["Passport", "ok"], ["US C1/D Visa", "missing"]]);
});

test("static: the card's status line names the hull the file has them on, the bottom restatement is gone, the earmark's chips read its own dates; the modal and the panel draw the Documents block before Comment", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /function whereLine\(x,plan,reg\)\{[^\n]*return 'On board <b>'\+escHtml\(reg\.ship\)\+'<\/b>'/);
  assert.match(W, /"><\/i>'\+whereLine\(x,plan,reg\)\+\(dur\?/, "the status line goes through whereLine");
  assert.match(W, /return ''; \/\/ the file's word now sits under the name/, "regNote's default restatement is gone");
  assert.match(W, /docs: \(a\.sign_on && docsRaw\[a\.sc\]\) \? contractDocBadge\(docsRaw\[a\.sc\], a\.sign_on, a\.planned_sign_off \|\| null\) : \(docsBy\[a\.sc\] \|\| null\)/, "an earmark's chips are read against its own contract");
  assert.match(W, /const docs = documentLines\(dmerged, TODAY\(\), 30\);/, "apiRotationCrew: the 30-day window");
  assert.match(W, /return json\(\{ crew: c, legs, resolved, file, docs, ready:/);
  assert.match(W, /\+docTags\(d\.docs\)\s*\n\s*\+'<div class=zlabel>Comment<\/div>/, "the modal: Documents right before Comment");
  assert.match(W, /function docTags\(docs\)\{[\s\S]*row\('Expired',bad,'bad'\)\+row\('Within 30 days',soon,'due'\)\+row\('Valid',ok,'on'\)/);
  const A = readFileSync(new URL("../src/relief_api.js", import.meta.url), "utf8");
  assert.match(A, /cr\.agency_id AS sc,\s*COALESCE\(NULLIF\(o\.med_exp,''\), cr\.med_exp\) AS med_exp/, "reliever rows carry the documents, manual entry first");
  assert.match(A, /LEFT JOIN crew_override o ON o\.agency_id = cr\.agency_id\s*LEFT JOIN vessel v ON v\.id = a\.vessel_id\s*WHERE a\.actual_sign_off IS NULL/);
  const B = readFileSync(new URL("../src/relief_board.js", import.meta.url), "utf8");
  assert.match(B, /sc: a\.sc \|\| null, docs: a\.docs \|\| null,/);
  const U = readFileSync(new URL("../src/relief_ui.js", import.meta.url), "utf8");
  assert.match(U, /<div id="mdocs"><\/div><div class="lbl">Comment<\/div>/, "the panel: Documents right before Comment");
  assert.match(U, /docBlock\(node&&node\.docs\?node\.docs:null\);/);
  assert.match(U, /row\("Expired",bad\)\+row\("Within 30 days",due\)\+row\("Valid",ok\)/);
  assert.match(U, /docBlock\(c\?\{med_exp:c\.med_exp/, "picking a seafarer draws their documents");
});
