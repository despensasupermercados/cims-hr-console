// THE RELIEF PRINTER IS WHO THE KEYMAN BOARD SEATS (Miguel, 8 Oct 2026, a screenshot of Anthem: "few ships like this
// ... dont have the option to create earmark .. fix that also"). Caag embarked Anthem on 7 Sep per the TDG file; the
// Contract Counter (history since 7 Oct, §10d) does not carry him, and the relief board read its printers from the
// Counter alone — so Anthem had no printer there, and reliefSlot drew no "Add earmark" slot under his card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { printerLegsFromBoard } from "../src/relief_api.js";
import { buildReliefBoard } from "../src/relief_board.js";

const TODAY = "2026-10-08";
const VESSELS = [{ name: "Anthem", brand: "Royal Caribbean" }, { name: "Apex", brand: "Celebrity" }];
const LEGS = [
  // the file's seat: Caag, embarked 7 Sep, projected 7 months
  { ship: "Anthem", name: "Haziel Caag", sc: "SC-C", ours: true, on: "2026-09-07", off: "2027-04-07", brand: "Royal", is_current: true, source: "registry", offSource: "projected" },
  // the Counter's contract for the man he relieved: history now
  { ship: "Anthem", name: "Andrew Lorono", sc: "SC-L", ours: true, on: "2026-03-08", off: "2026-09-14", brand: "Royal", is_current: false, source: "counter" },
  // a crew aboard per Rita's relief card: a reliever, never a printer
  { ship: "Apex", name: "Rita Card", sc: "SC-R", ours: true, on: "2026-10-02", off: "2027-05-02", brand: "Celebrity", is_current: true, source: "assignment", assignment_id: "as_9" },
  // HELD: TDG still lists the outgoing crew On board Apex past the sign-off; the reliever is aboard too
  { ship: "Apex", name: "Old Hand", sc: "SC-O", ours: true, on: "2026-03-01", off: "2026-10-02", brand: "Celebrity", is_current: true, source: "registry", heldByFile: true },
  { ship: "Apex", name: "New Hand", sc: "SC-N", ours: true, on: "2026-10-02", off: "2027-05-02", brand: "Celebrity", is_current: true, source: "registry", offSource: "projected" },
  { ship: "Apex", name: "Not ours", sc: null, ours: false, on: "2026-01-01", off: "2027-01-01", brand: "Celebrity", is_current: true, source: "registry" },
];

test("printerLegsFromBoard: the board's current seats in the Counter's row shape — the file's crew included, history, relief cards and other agencies out, newest sign-on first, the relief board's full brand key", () => {
  const out = printerLegsFromBoard(LEGS, VESSELS);
  assert.deepEqual(out.map((l) => [l.brand + "|" + l.ship_short, l.crew_name, l.on_date, l.off_date]), [
    ["Celebrity|Apex", "New Hand", "2026-10-02", "2027-05-02"],
    ["Royal Caribbean|Anthem", "Haziel Caag", "2026-09-07", "2027-04-07"],
    ["Celebrity|Apex", "Old Hand", "2026-03-01", "2026-10-02"],
  ]);
  assert.deepEqual(printerLegsFromBoard(LEGS.slice(0, 1), []).map((l) => l.brand), ["Royal Caribbean"], "a hull the vessel table lacks: the short brand widened");
  assert.deepEqual(printerLegsFromBoard(null, VESSELS), []);
});

test("Anthem gets its printer back, so the board draws the Add earmark slot with the seat's sign-off; on a held hull the slot follows the NEWER crew", () => {
  const printers = printerLegsFromBoard(LEGS, VESSELS).map((l) => ({ id: "leg:" + l.brand + "|" + l.ship_short, role: "printer", crew_name: l.crew_name, vessel_key: l.brand + "|" + l.ship_short, on_date: l.on_date, off_date: l.off_date }));
  const board = buildReliefBoard({ assignments: printers, portDaysByShip: {}, config: { critical_days: 14, due_days: 30 }, today: TODAY });
  const by = Object.fromEntries(board.map((r) => [r.vessel_key, r]));
  assert.equal(by["Royal Caribbean|Anthem"].printer.crew_name, "Haziel Caag");
  assert.equal(by["Royal Caribbean|Anthem"].printer.off_date, "2027-04-07");
  assert.equal(by["Celebrity|Apex"].printer.crew_name, "New Hand");
});

test("static: the slot stays when the ship's last earmark has joined (a NEW earmark after them), and the relief panel opens it as new, relieving the one aboard", async () => {
  const { readFileSync } = await import("node:fs");
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /if\(rb\.reliever&&rb\.reliever\.aboard\)\{var _eb=benchBox\(rb,sec\);if\(_eb\)return _eb;var ra=offSpan\(rb\.reliever\.off_date\);/);
  assert.match(W, /data-aid="new" onclick="openRelief\(this\)"/);
  const U = readFileSync(new URL("../src/relief_ui.js", import.meta.url), "utf8");
  assert.match(U, /const fresh=aid==="new";\s*const node=fresh\?null:/);
  // 8 Oct 2026 (the chain): a NEW earmark relieves the last in the chain — the latest earmark, else the one aboard, else the printer.
  assert.match(U, /const printer=fresh&&row\?lastInChain\(row\):\(row\?row\.printer:null\);/);
  assert.match(U, /function lastInChain\(row\)\{[\s\S]*?return \(row\.reliever&&row\.reliever\.aboard\)\?row\.reliever:p;\}/);
});
