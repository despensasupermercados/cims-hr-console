// THE 13 OCT 2026 REVIEW (Miguel: "review the code .. it appears that is getting slower .. find bugs and fix them right
// away of the entire app"). Three reviews (server, page, pure modules) plus production's own perf_log and D1 timings.
// Each pin below names the input that showed the defect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legsFromRegistry, foldCounterHistory } from "../src/ship_leg_source.js";
import { statementContracts, buildCrewProfile, feedbackFile } from "../src/crew_profile.js";
import { composeStatement } from "../src/statement.js";
import { span, docLines } from "../src/emails/hr.statement.v2.js";
import { earmarkDiscrepancies } from "../src/earmark.js";

const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const RUI = readFileSync(new URL("../src/relief_ui.js", import.meta.url), "utf8");
const RAPI = readFileSync(new URL("../src/relief_api.js", import.meta.url), "utf8");
const today = "2026-10-13";

test("HELD by TDG's On board: the statement never prints the passed sign-off as a sign-off, and sea days run to today", () => {
  const rows = [{ sc: "SC-1", status: "On board", raw_status: "On board", vessel: "MV ALLURE OF THE SEAS", embarked_at: "2026-03-01", debarked_at: null, run_at: "2026-10-07T00:00:00Z" }];
  const edits = [{ sc: "SC-1", seq: 1, on_key: "2026-03-01", sign_off: "2026-10-02", off_conf: 1, updated_at: "2026-10-01T10:00:00Z" }];
  const legs = legsFromRegistry({ rows, edits, counter: [], open: [], vessels: [], today });
  assert.equal(legs[0].heldByFile, true);
  const sc = statementContracts(legs, "SC-1", today);
  assert.deepEqual([sc.contracts[0].act, sc.contracts[0].proj], [null, "2026-10-02"], "projected, never 'Signed off'");
  assert.equal(sc.seaDays, 226, "Mar 1 -> today, not -> Oct 2 (215)");
  const prof = buildCrewProfile({ today, crew: { agency_id: "SC-1" }, legs });
  assert.equal(prof.contracts[0].days, 226);
  const pdf = Buffer.from(composeStatement({ crew: { agency_id: "SC-1", first_name: "A" }, contracts: sc.contracts, generatedAt: today })).toString("latin1");
  assert.ok(!pdf.includes("(Signed off  Oct 2, 2026)") && !pdf.includes("(Completed)"), "no 'Signed off' / 'Completed' for a crew TDG has aboard");
});

test("a running contract keeps the notes logged in it, past its projected sign-off (crew file)", () => {
  const f = feedbackFile({ contracts: [{ n: 1, ship: "Allure", on: "2026-03-01", off: "2026-10-01", current: true }], people: { feed: [{ kind: "note", at: "2026-10-10T10:00:00Z", text: "Still aboard" }] } }, today);
  assert.equal(f.groups[0].items.length, 1);
  assert.ok(!f.groups.some((g) => g.key === "between"));
});

test("a span is never negative: Jul 31 -> Mar 1 is 7 months 1 day (statement email, PDF, page)", () => {
  assert.equal(span("2026-07-31", "2027-03-01"), "7 months 1 day");
  assert.equal(span("2026-01-31", "2026-03-01"), "1 month 1 day");
  assert.equal(span("2026-03-01", "2026-10-01"), "7 months");
  const pdf = Buffer.from(composeStatement({ crew: { agency_id: "X" }, contracts: [{ seq: 1, ship: "Apex", on: "2026-01-31", act: "2026-03-01", proj: null }], generatedAt: today })).toString("latin1");
  assert.ok(!/-\d+ d\)/.test(pdf), "no '-2 d' anywhere");
  assert.match(W, /function monthsDaysParts\(a,b\)\{[\s\S]{0,500}if\(d<0\)\{m--;var ay=d1\.getUTCFullYear\(\)/, "the page counts the same way");
});

test("the statement email reads the documents against the running contract, as the PDF it carries does", () => {
  const d = docLines({ med_exp: "2027-01-15", sirb_exp: "2030-01-01", pp_exp: "2030-01-01", usv_exp: "2030-01-01" }, today, "2027-04-01");
  assert.equal(d[0].state, "lapses");
  assert.equal(d.filter((x) => x.state === "ok").length, 3);
});

test("Rita's NEXT contract on the hull the crew is aboard is not an embark-date discrepancy (Accept would have deleted it)", () => {
  const shipOf = (s) => (s && /allure/i.test(s) ? "Allure" : null);
  const registry = [{ agency_id: "SC-1", status: "On board", status_raw: "On board", vessel_observed: "MV ALLURE OF THE SEAS", embarked_at: "2026-04-01", run_at: "2026-10-07T00:00:00Z" }];
  const next = [{ id: "as_1", sc: "SC-1", ship: "Allure", sign_on: "2027-02-01", planned_sign_off: "2027-09-01" }];
  assert.deepEqual(earmarkDiscrepancies({ projections: next, registry, today, shipOf }).items.filter((i) => i.kind === "embark_date"), []);
  const misdated = [{ id: "as_2", sc: "SC-1", ship: "Allure", sign_on: "2026-05-01", planned_sign_off: "2026-12-01" }];
  assert.equal(earmarkDiscrepancies({ projections: misdated, registry, today, shipOf }).items[0].kind, "embark_date", "an aboard card off the embark is still one");
});

test("the Counter is NOT folded on overlap — only within ABSORB_DAYS (Miguel's rule); a wider overlap is shown, counted and FLAGGED", () => {
  // 13 Oct 2026, the triple check: an overlap rule dropped Quiming's Infinity Apr-Oct Counter contract (255 -> 67 sea days)
  // because TDG's file says embarked Aug 7 — the console reconciling TDG's two files, which §6 / §10b forbid.
  const reg = [{ sc: "SC-1", ship: "Infinity", on: "2026-08-07", off: "2027-03-07", source: "registry", is_current: true }];
  const out = foldCounterHistory([{ sc: "SC-1", ship: "Infinity", on: "2026-04-08", off: "2026-10-27", is_current: true }], reg);
  assert.deepEqual(out.map((h) => [h.ship, h.on, h.off, h.is_current]), [["Infinity", "2026-04-08", "2026-10-27", false]], "kept as history, dates untouched");
  const prof = buildCrewProfile({ today, crew: { agency_id: "SC-1" }, legs: reg.concat(out.map((h) => ({ ...h, sc: "SC-1", source: "counter" }))) });
  assert.equal(prof.contracts.length, 2);
  const flag = prof.checks.find((c) => c.key === "counter_overlap");
  assert.ok(flag && /Infinity contract from Apr 8, 2026 that overlaps the file’s \(embarked Aug 7, 2026\)/.test(flag.text), flag && flag.text);
  // a Counter contract on another hull that the file does not name keeps its own dates too (history, never re-dated)
  const reg2 = [{ sc: "SC-1", ship: "Wonder", on: "2026-08-01", off: "2027-03-01", source: "registry", is_current: true }];
  const [h] = foldCounterHistory([{ sc: "SC-1", ship: "Allure", on: "2026-03-01", off: "2026-10-30", is_current: true }], reg2);
  assert.deepEqual([h.off, h.is_current], ["2026-10-30", false]);
});

test("the PDF: a word wider than the column is cut, WinAnsi letters print as themselves, a long name never runs under the details box", () => {
  const pdf = Buffer.from(composeStatement({ crew: { agency_id: "SC-1", first_name: "Šimun", last_name: "Concepcion Dela Cruz-Villanueva Maria" }, contracts: [], generatedAt: today })).toString("latin1");
  assert.ok(pdf.includes("(\u008Aimun"), "Š is WinAnsi 0x8A, not '?'");
  assert.ok(pdf.includes("Villanuev.)"), "the name is fitted to its column");
  const S = readFileSync(new URL("../src/statement.js", import.meta.url), "utf8");
  assert.match(S, /const pieces = \(word\) =>/);
});

test("the page: the board draws once per render, folds a ship in place, waits for a pause in Search, lays out only what is on screen", () => {
  assert.match(W, /#rotbody>\.shipsec\{content-visibility:auto;contain-intrinsic-size:auto 220px\}/);
  assert.match(W, /oninput="ROT_FIND=this\.value;clearTimeout\(window\._rfT\);window\._rfT=setTimeout\(drawRotation,160\)"/);
  assert.match(W, /var willClose=!arw\.classList\.contains\('closed'\);ROT_CLOSED\[s\]=willClose;/);
  assert.match(W, /if\(_relIn\)_relFill\(_relV\);\n  else _relP\.then/, "the relief data already here goes into the first paint");
  assert.match(W, /else applyChromeToggles\(\);/, "the automation switches keep their state across renders");
});

test("the page: no stale profile, one note per click, the draft survives, one modal, one overlay, no leaked listeners, cache kept for read-only POSTs", () => {
  assert.match(W, /var _gen=\+\+VIEW_GEN;[\s\S]{0,900}const d=await dq; const bz=await bq;\n  if\(_gen!==VIEW_GEN\)return;/);
  assert.match(W, /if\(!t\|\|!t\.value\.trim\(\)\|\|window\._noteBusy\)return;/);
  assert.match(W, /var _dr=document\.getElementById\('newNote'\);if\(_dr\)S\.draft=_dr\.value;/);
  assert.match(W, /if\(!e\|\|document\.getElementById\('rotmodal'\)\|\|window\._rotOpening\)return;/);
  assert.match(W, /function openRelief\(el\)\{if\(document\.getElementById\('reliefovl'\)\)return;/);
  assert.match(W, /if\(e\.data\.changed\)\{try\{apiDirty\(\);renderRotation\(\);\}catch\(_\)\{\}\}/, "a panel save (an iframe, outside the shim) empties the cache first");
  assert.match(W, /function crewRefresh\(\)\{/);
  assert.match(RUI, /if\(save\._busy\)return;save\._busy=1;/);
  assert.match(RAPI, /SELECT a\.id FROM assignment a JOIN contract k ON k\.id = a\.contract_id WHERE k\.crew_id = \? AND a\.vessel_id = \? AND a\.actual_sign_off IS NULL LIMIT 1/, "the same crew twice on one ship is refused on insert too");
});

test("imported names are text everywhere the review found them raw (§11c)", () => {
  for (const re of [/<div class=cname>'\+escHtml\(r\.name\)\+'<\/div>/, /'<\/td><td>'\+escHtml\(r\.crew_name\)\+'<\/td>/, /return '<tr><td>'\+escHtml\(b\.name\)\+'<\/td><td>'\+escHtml\(b\.ship\)/, /scoring '\+escHtml\(_SW\.crew\.name\)/])
    assert.match(W, re);
  assert.doesNotMatch(W, /<input readonly value="'\+r\.link\+'"/);
  assert.match(RUI, /<b>'\+rEsc\(r\.name\|\|r\.sc\)\+'<\/b>/);
});
