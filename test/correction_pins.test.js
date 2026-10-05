// Static pins for the 5 Oct 2026 correction pass (reviewed code, no new features). Each guards one
// rule a reviewer found broken; the behavioural tests live beside the modules they belong to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
const fn = (name, end) => SRC.slice(SRC.indexOf(name), end ? SRC.indexOf(end, SRC.indexOf(name)) : undefined);

test("dashboard: birthdays use the DERIVED status and visible crew only; the compliance counts exclude hidden crew (§11)", () => {
  const b = fn("async function apiDashboard(", "async function apiCrew(");
  assert.doesNotMatch(b, /substr\(dob,6,5\)=\? AND status='On board'/, "the raw status column decided who is aboard");
  assert.match(b, /substr\(dob,6,5\)=\? AND redacted=0 ORDER BY last_name/);
  assert.match(b, /bdRes\.results\.filter\(b => statusBy\[b\.agency_id\] === "On board"\)/);
  assert.match(b, /COUNT\(DISTINCT vessel_observed\) vessels[^;]*FROM crew WHERE redacted=0"\)\.bind\(/, "hidden crew counted in the tiles");
});

test("the Data page's AdvancedQuery reader hands dates over as text, never as a local-midnight Date (one day early for Rita)", () => {
  const i = SRC.indexOf("var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});\n        var ws=wb.Sheets[wb.SheetNames[0]];");
  assert.ok(i > 0, "the AdvancedQuery reader");
  const seg = SRC.slice(i, i + 900);
  assert.match(seg, /sheet_to_json\(ws,\{header:1,raw:false,dateNF:'yyyy-mm-dd',defval:''\}\)/);
  assert.doesNotMatch(seg, /raw:true/);
});

test("the PDF statement gathers its per-crew reads in one wave (§12), guards together", () => {
  const b = fn("async function gatherStatement(", "\n}\n");
  assert.match(b, /await Promise\.all\(\[ensureKeyman\(env\), ensureContractCount\(env\)\]\);/);
  assert.match(b, /const \[ctRes, dw, baseline, tdgRow, outs\] = await Promise\.all\(\[/);
  assert.equal((b.match(/await /g) || []).length, 4, "crew row, guards, the wave, then crewCount (needs the baseline)");
});

test("the count import: no as-of is refused, an older file is refused unless forced, rows the file dropped are removed by THIS apply's stamp", () => {
  const b = fn("async function apiContractCountImport(", "\n}\n");
  assert.match(b, /return json\(\{ error: "need_as_of"/);
  assert.doesNotMatch(b, /: TODAY\(\)/, "the import day is never stamped as the file's date");
  assert.match(b, /if \(olderThanLoaded && !b\.force\) return json\(\{ error: "older_than_loaded"/);
  assert.match(b, /DELETE FROM contract_count WHERE imported_at IS NOT \?"\)\.bind\(at\)/);
  // the screen asks before forcing, and says which rows go
  assert.match(SRC, /if\(COUNTDRY&&COUNTDRY\.olderThanLoaded\)\{if\(!confirm\(/);
  assert.match(SRC, /r\.notInFile&&r\.notInFile\.length/);
});
