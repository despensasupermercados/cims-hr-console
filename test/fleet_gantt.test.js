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
