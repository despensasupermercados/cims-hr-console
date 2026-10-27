import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { currentLeg } from "../src/welcome_context.js";
import { surveyDue, surveyReport } from "../src/crew_survey.js";

// THE 27 OCT 2026 REVIEW: THE CREW HUB, THE WELCOME AND THE CREW SURVEY. Each case was reproduced on the code before the fix.

// Villacortes-shaped: TDG has him On Vacation, debarked Wonder 9 Oct; Rita's card puts him on Star from 29 Nov. A TDG file
// dated 2 Dec still has him On Vacation: he did not join, the board draws the card off (§10d), and the Hub told him he was
// aboard Star with a contract number.
const WONDER = { sc: "SC-1", ship: "Wonder", on: "2026-03-22", off: "2026-10-09", is_current: false, ours: true, source: "registry", offSource: "tdg", fileAt: "2026-12-02" };
const STAR_CARD = { sc: "SC-1", ship: "Star", on: "2026-11-29", off: "2027-06-27", is_current: true, ours: true, source: "assignment" };

test("the Hub's contract is never a card a later TDG file has the crew ASHORE for", () => {
  assert.equal(currentLeg([WONDER, STAR_CARD], "SC-1"), null, "a relief that did not happen is no contract");
});

test("...a file dated on or before the card's sign-on says nothing yet, and a file seating him on that hull confirms it", () => {
  assert.equal(currentLeg([{ ...WONDER, fileAt: "2026-11-29" }, STAR_CARD], "SC-1").ship, "Star", "the export runs in the morning, he embarks that day");
  assert.equal(currentLeg([{ ...WONDER, fileAt: "2026-11-20" }, STAR_CARD], "SC-1").ship, "Star", "a file older than the sign-on could not see it");
  const aboard = { sc: "SC-1", ship: "Star", on: "2026-11-29", off: "2027-06-29", is_current: true, ours: true, source: "registry", offSource: "projected", fileAt: "2026-12-02" };
  assert.equal(currentLeg([aboard, STAR_CARD], "SC-1").ship, "Star");
  const elsewhere = { ...aboard, ship: "Wonder", on: "2026-12-01" };
  assert.equal(currentLeg([elsewhere, STAR_CARD], "SC-1").ship, "Wonder", "on board another hull: that is his contract (23 Oct 2026)");
});

test("the survey asks a contract TDG confirmed three weeks late (the 22-25 Oct 2026 files: 5, 16 and 22 days)", () => {
  const today = "2026-11-24";
  const leg = (off) => ({ sc: "SC-9", ship: "Radiance", brand: "Royal", on: "2026-04-01", off, is_current: false, ours: true, offSource: "tdg" });
  assert.equal(surveyDue([leg("2026-11-02")], today, "2026-10-23").length, 1, "22 days after the sign-off, first seen ended today");
  assert.equal(surveyDue([leg("2026-11-08")], today, "2026-10-23").length, 1, "16 days");
  assert.equal(surveyDue([leg("2026-10-20")], today, "2026-10-23").length, 0, "never a contract that ended before the switch went on");
  assert.equal(surveyDue([leg("2026-10-20")], "2026-12-20", null).length, 0, "two months on: past the catch-up");
});

test("the survey report draws who was not asked even in a period with no answer", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const cut = (a, b) => { const i = W.indexOf(a); const j = W.indexOf(b, i); assert.ok(i > 0 && j > i, a); return W.slice(i, j); };
  const code = cut("function escHtml(s){", "\n") + "\n" + cut("var SRV_P=", "async function rptCrewSurvey(") + cut("function srvDraw(){", "async function srvSendAnyway(");
  const body = { innerHTML: "", querySelectorAll: () => [] };
  const ctx = { document: { getElementById: () => body }, $: () => body, openCrew() {}, rptCrewSurvey() {} };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const d = surveyReport({ rows: [], ended: [], today: "2026-10-27", p: "30D" });
  d.loop.noEmail = [{ sc: "SC-7", name: "No Mail", ship: "Getaway" }];
  d.loop.skipped = [{ sc: "SC-8", name: "Not Asked", ship: "Quest", off: "2026-10-22", on: "2026-04-01", label: "Medical" }];
  ctx.SRV_D = { ...d, enabled: true, since: "2026-10-23", sources: { forms: 0, console: 0 } };
  vm.runInContext("srvDraw()", ctx);
  const h = body.innerHTML;
  assert.equal(d.n, 0);
  assert.match(h, /No answers in this period/);
  assert.match(h, /Are we hearing from everyone\?/, "the loop is the only place that names who has no email or was not asked");
  assert.match(h, /No email on file, never asked/);
  assert.match(h, /data-svsend="SC-8"/, "Send anyway is reachable before the first answer comes in");
});

// Miguel, 17 Oct 2026 (§10j, merged in #287): "Portal miss only" — Ray's "Crew ordering failure" answer is evidence on the
// card, never a reset. Both of Ray's forms still told him his answer arms the rush gate (27 Oct 2026 review).
test("Ray's forms never say his answer arms the rush gate", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.doesNotMatch(W, /arms the rush gate/);
  assert.equal((W.match(/The rush gate is set only by a vessel-side miss in the Parts Portal\./g) || []).length, 2, "the public link and the in-app form");
});
