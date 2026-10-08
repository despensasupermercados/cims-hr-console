// THE NEXT ASSIGNMENT + THE EXPIRED DOCUMENTS BY NAME (Miguel, 8 Oct 2026, on Harmony's card): "If he has a projected
// assignment, or if the same crew member is earmarked for a future vessel, I want you to display it there ... how many
// months and days of vacation or space between the contracts" — and "instead of putting 1 expired ... tag in red all
// the items that are expired for that particular seafarer".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachNextAssignments } from "../src/next_assignment.js";
import { docBadge } from "../src/keyman_deploy.js";

const TODAY = "2026-10-08";
const seat = (o = {}) => ({ agency_id: "SC-1", name: "Mario Vicente Lazo", state: "green", current: true, ship: "Harmony", signOn: "2026-08-18", signOff: "2027-03-18", ...o });
const mark = (o = {}) => ({ agency_id: "SC-1", state: "yellow", ship: "Allure", signOn: "2027-05-02", signOff: "2027-12-02", ...o });

test("a seafarer aboard gets the same crew's earliest earmark still to come, on any ship, with the days between the contracts", () => {
  const secs = [{ ship: "Harmony", crew: [seat()], projections: [] }, { ship: "Allure", crew: [], projections: [mark(), mark({ ship: "Wonder", signOn: "2027-09-01" })] }];
  attachNextAssignments(secs, TODAY);
  assert.deepEqual(secs[0].crew[0].next, { ship: "Allure", signOn: "2027-05-02", signOff: "2027-12-02", tdg: false, gapDays: 45 });
  assert.equal(secs[1].projections[0].next, undefined, "an earmark still to come is not a seat: no next line on it");
});

test("overlap is negative, TDG's earmark has no dates (no gap), the card never points at itself, other crew never count", () => {
  const over = [{ ship: "Harmony", crew: [seat()], projections: [] }, { ship: "Allure", crew: [], projections: [mark({ signOn: "2027-03-10" })] }];
  attachNextAssignments(over, TODAY);
  assert.equal(over[0].crew[0].next.gapDays, -8);
  const tdg = [{ ship: "Harmony", crew: [seat()], projections: [] }, { ship: "Icon", crew: [], projections: [mark({ ship: "Icon", signOn: null, signOff: null, tdgEarmark: true })] }];
  attachNextAssignments(tdg, TODAY);
  assert.deepEqual(tdg[0].crew[0].next, { ship: "Icon", signOn: null, signOff: null, tdg: true, gapDays: null });
  const other = [{ ship: "Harmony", crew: [seat()], projections: [mark({ agency_id: "SC-2" })] }];
  attachNextAssignments(other, TODAY);
  assert.equal(other[0].crew[0].next, null);
  // an earmark whose sign-on has arrived is aboard (awaiting the file): it is a seat and gets its own next
  const aw = [{ ship: "Adventure", crew: [], projections: [mark({ ship: "Adventure", signOn: "2026-10-01", signOff: "2027-05-01", awaiting: true }), mark({ ship: "Icon", signOn: "2027-06-01", signOff: "2028-01-01" })] }];
  attachNextAssignments(aw, TODAY);
  assert.equal(aw[0].projections[0].next.ship, "Icon"); assert.equal(aw[0].projections[0].next.gapDays, 31);
});

test("docBadge names every expired document; missing / expiring stay one summary", () => {
  const b = docBadge({ med_exp: "2026-01-01", sirb_exp: "2030-01-01", pp_exp: "2030-01-01", usv_exp: null, sch_exp: "2026-05-01" }, TODAY);
  assert.deepEqual(b.items, [{ doc: "Medical", exp: "2026-01-01", required: true }, { doc: "Schengen", exp: "2026-05-01", required: false }]);
  assert.deepEqual(b.rest && b.rest.label, "1 MISSING");
  assert.equal(b.label, "2 EXPIRED", "the old summary stays for every other reader");
  assert.equal(docBadge({ med_exp: "2030-01-01", sirb_exp: "2030-01-01", pp_exp: "2030-01-01", usv_exp: "2030-01-01" }, TODAY), null);
});

test("static: the card draws the Next line under the status and one red tag per expired document; the server attaches next", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /\+x\.status\+\(dur\?\(' &middot; '\+dur\):''\)\+'<\/div>'\+nextLine\(x\)\+'<\/div>'\+chip/);
  assert.match(W, /function nextLine\(x\)\{var n=x&&x\.next;/);
  assert.match(W, /' ashore<\/span>'/); assert.match(W, /overlaps '\+spanCompact\(n\.signOn,x\.signOff\)/);
  assert.match(W, /_di\.forEach\(function\(d\)\{tg\+='<span class="rtag bad"/);
  assert.match(W, /attachNextAssignments\(sections, today\);\s*\/\/[^\n]*\n\s*return \{ sections, pool/);
  assert.doesNotMatch(W, /x\.nextShip/, "the old NEXT tag (never filled by the server) is gone");
});
