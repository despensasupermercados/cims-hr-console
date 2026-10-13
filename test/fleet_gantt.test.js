// THE FLEET GANTT (Miguel, 9 Oct 2026: "right above the expand all ... this icon or similar Carta gantt icon", then
// "Open fleet Gantt"): every ship on one shared timeline, least covered first, opened from the Keyman action column.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const fnSrc = (name) => { const i = W.indexOf("function " + name + "("); assert.ok(i >= 0, name); return W.slice(i, W.indexOf("\n}", i) + 2); };

test("the Gantt button sits right above Expand all, with the Gantt icon", () => {
  assert.match(W, /<aside class="cract rotact">'[\s\S]{0,400}?onclick="fleetGantt\(\)"[^>]*>'\+GANTT_ICON\+'<span>Fleet Gantt<\/span><\/button>'\s*\+'<button class="btn ghost" onclick="rotExpand\(true\)">Expand all<\/button>'/);
  assert.match(W, /var GANTT_ICON='<svg /);
});

test("ganttRows: the header line's rules — seats and earmarks, Inactive seats out, a future gap between contracts, coverage end", () => {
  const ROT = { sections: [
    { ship: "Allure", brand: "Royal", crew: [
      { name: "John Gorre", signOn: "2036-04-29", signOff: "2036-11-29", offSource: "card", state: "green" },
      { name: "Gone Person", status: "Inactive", signOn: "2026-01-01", signOff: "2026-07-01" },
    ], projections: [
      { name: "Raymond Villacortes", signOn: "2036-12-10", signOff: "2037-06-26", registry: { verdict: "pending" } },
      { name: "Tdg Only", tdgEarmark: true },
    ] },
    { ship: "Jewel", brand: "Royal", crew: [], projections: [] },
  ] };
  const rows = new Function("ROT", fnSrc("ganttRows") + "; return ganttRows();")(ROT);
  const a = rows.find((r) => r.ship === "Allure"), j = rows.find((r) => r.ship === "Jewel");
  assert.deepEqual(a.segs.map((s) => [s.name, s.k]), [["John Gorre", "seat"], ["Raymond Villacortes", "earmark"]], "the Inactive seat is not drawn");
  assert.equal(a.until, "2037-06-26");
  assert.equal(a.und.length, 1, "TDG's undated earmark is counted");
  assert.deepEqual(a.gaps.map((g) => g.b), ["2036-12-10"], "Nov 29 → Dec 10 is the ship uncovered");
  assert.equal(j.until, null, "nobody: no coverage");
});

test("the second cut (Miguel, 9 Oct 2026: 'more colorful .. 1 month before and 6 months after .. entire width .. keep the headers on top')", () => {
  const G = fnSrc("fleetGantt");
  // the horizon is fixed: the 1st of last month → the end of the month six months out; a bar running past it is clipped and chevroned
  assert.match(G, /start\.setUTCDate\(1\);start\.setUTCMonth\(start\.getUTCMonth\(\)-1\)/);
  assert.match(G, /end\.setUTCDate\(1\);end\.setUTCMonth\(end\.getUTCMonth\(\)\+7\)/);
  assert.match(G, /over=P\(x\.end\)>E/);
  assert.match(W, /\.gntr \.gs\.over:after\{content:'›'/);
  // full width, header + legend + month axis sticky while the rows scroll, Escape closes
  assert.match(W, /#ganttwrap\{position:fixed;inset:0;z-index:200;background:#fff;display:flex;flex-direction:column\}/);
  assert.match(W, /\.gntop\{position:sticky;top:0;z-index:5;background:#fff/);
  // 13 Oct 2026: one close for every way out, so the Esc listener never outlives the view
  assert.match(G, /var esc=function\(e\)\{if\(e\.key==='Escape'\)ganttClose\(\);\};/);
  assert.match(W, /function ganttClose\(\)\{var g=document\.getElementById\('ganttwrap'\);if\(g\)g\.remove\(\);if\(window\._ganttEsc\)\{document\.removeEventListener\('keydown',window\._ganttEsc\)/);
  // five states, five hues (green / teal / amber / orange / red)
  for (const c of ["#2E9E5B", "#1E9CB2", "#F2B01E", "#E8702A", "#E5484D"]) assert.match(W, new RegExp("\\.gntr \\.(gs|gs\\.await|gs\\.earmark|gs\\.tdg|gap)\\{[^}]*" + c));
  // 11 Oct 2026 (Miguel): solid bars, no fade, no stripes; a projected coverage end reads "~" in the right column
  assert.doesNotMatch(W, /\.gntr \.gs\.proj\{/);
  assert.match(G, /'<b>'\+\(r\.untilProj\?'~':''\)\+fmtDateS\(r\.until\)\+'<\/b>'/);
  // tiers divide the list so the eye lands on the ships that need a decision
  assert.match(G, /TIER=\{none:'Nobody aboard, nobody earmarked',crit:'Covered under 2 months',due:'Covered under 4 months',ok:'Covered 4 months or more'\}/);
  assert.match(G, /r\.tier=!r\.until\?'none':\(r\.days<60\?'crit':\(r\.days<120\?'due':'ok'\)\)/);
});

test("ganttRows says when the coverage end is only projected (the right column prints '~')", () => {
  const ROT = { sections: [
    { ship: "Allure", brand: "Royal", crew: [{ name: "A Seat", signOn: "2036-04-29", signOff: "2036-11-29", offSource: "projected", state: "green" }], projections: [] },
    { ship: "Apex", brand: "Celebrity", crew: [{ name: "B Seat", signOn: "2036-04-29", signOff: "2036-11-29", offSource: "tdg", state: "green" }], projections: [] },
  ] };
  const rows = new Function("ROT", fnSrc("ganttRows") + "; return ganttRows();")(ROT);
  assert.equal(rows.find((r) => r.ship === "Allure").untilProj, true);
  assert.equal(rows.find((r) => r.ship === "Apex").untilProj, false, "TDG's own sign-off is a fact, no ~");
});
