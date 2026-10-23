// NORWEGIAN GETAWAY ON THE CONSOLE (Miguel, 20 Oct 2026: "yes get away i the console"). NCL's pilot hull: in service
// 16 Nov 2026 (Brain rec2lUszqqzau4xns), first printer Joe Art Eresmas from 9 Nov (recbpoXVhLjn9Ordl). Before this every
// path that decides a ship's cruise line read a bare "Getaway" as Royal Caribbean: the sign-off instructions would have
// told him to select "Getaway of the Seas" and print a copy for his "GSM (Guest Services Manager)"; the GSM review would
// have gone to Royal Caribbean's recipient; the audit landing put the ship under Royal Caribbean.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VESSEL_REF } from "../src/vessel_ref.js";
import { canonShip, clientOf, validShipKeys, normShip } from "../src/shipname.js";
import { travelClientOf } from "../src/travel_match.js";
import { sbmBrandForShip } from "../src/sbm.js";
import { instructionsEmail, shipFullName, managerOf } from "../src/emails/hr.signoff.instructions.v2.js";
import { boardIssues } from "../src/board_truth.js";
import { normShip as auditShip } from "../src/audit.js";

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

test("Getaway is a hull of the fleet: brand NCL, in service from 16 Nov 2026", () => {
  const g = VESSEL_REF.find((v) => v.name === "Getaway");
  assert.deepEqual([g.brand, g.homeport, g.from], ["NCL", "Miami", "2026-11-16"]);
  assert.ok(validShipKeys(VESSEL_REF).has("getaway"));
  for (const raw of ["MV NORWEGIAN GETAWAY", "Norwegian Getaway", "NCL Getaway", "Getaway"]) assert.equal(canonShip(raw, VESSEL_REF), "Getaway", raw);
});

test("a bare 'Getaway' is Norwegian, never Royal Caribbean; the Royal hulls are unchanged", () => {
  for (const raw of ["Getaway", "MV GETAWAY", "Norwegian Getaway", "NCL Getaway"]) assert.equal(clientOf(raw), "NCL", raw);
  assert.equal(clientOf("Wonder"), "Royal Caribbean");
  assert.equal(clientOf("MV CELEBRITY APEX"), "Celebrity");
  assert.equal(clientOf(""), "Unassigned");
  assert.equal(travelClientOf("Getaway"), "ncl");
  assert.equal(travelClientOf("Wonder"), "royal");
  assert.equal(sbmBrandForShip("Getaway", VESSEL_REF), "NCL"); // no recipient:NCL is configured: skipped and logged, never sent to Royal's
  assert.equal(sbmBrandForShip("Wonder of the Seas", VESSEL_REF), "Royal Caribbean");
  assert.equal(auditShip("Norwegian Getaway"), auditShip("Getaway"));
});

test("the board's one brand decision maps NCL; the page reads 'Norwegian' and keeps the field on its clone", () => {
  assert.match(SRC, /shipBrand\[k\] = \(v\.brand === "CEL" \? "Celebrity" : v\.brand === "NCL" \? "NCL" : "Royal"\)/);
  assert.match(SRC, /var ROT_LINE=\{Royal:'Royal Caribbean',Celebrity:'Celebrity',Azamara:'Azamara',NCL:'Norwegian'\};/);
  assert.match(SRC, /from:s\.from\|\|null,visits:s\.visits/);
  assert.match(SRC, /"Azamara Quest","Norwegian Getaway"\];/); // Edit crew's ship list writes "MV NORWEGIAN GETAWAY"
  // a hull entering service has its section before anyone is on it, and says how to place the first printer
  assert.match(SRC, /for \(const v of VESSEL_REF\) if \(v\.from\) \{ const kk = normShip\(v\.name\); if \(!shipNames\[kk\]\) shipNames\[kk\] = v\.name; \}/);
  assert.match(SRC, /if\(!_n&&sec&&sec\.from\)return .*First printer.*DRAG A SEAFARER HERE/);
});

test("the vessel row the projection and relief paths look up is on record", () => {
  const m = readFileSync(new URL("../migrations/0038_norwegian_getaway.sql", import.meta.url), "utf8");
  assert.match(m, /INSERT OR IGNORE INTO vessel \(id, name, brand\) VALUES\s*\('ves_getaway','Getaway','NCL'\);/);
});

test("no 'empty hull' row for a ship that is not in service yet; an empty ship in service still has one", () => {
  const rows = boardIssues({ crew: [], file: {}, cards: [], completed: {}, sections: [
    { ship: "Getaway", key: "getaway", seated: false, fileAboard: false, aboardCards: [], notYet: true },
    { ship: "Vision", key: "vision", seated: false, fileAboard: false, aboardCards: [] },
  ] });
  assert.deepEqual(rows.filter((r) => r.kind === "empty_hull").map((r) => r.ship), ["Vision"]);
});

const D = { firstName: "Joe Art", crewName: "Joe Art Eresmas", position: "Printer Specialist", ship: "Getaway", signOn: "2026-11-09", signOff: "2026-12-24", port: "MIAMI, FLORIDA", today: "2026-12-10", link: "https://cims.work/instr?t=x" };
test("the sign-off instructions on an NCL hull: 'Norwegian Getaway', 'your shipboard manager', never Royal's words", () => {
  assert.equal(shipFullName("Getaway", "NCL"), "Norwegian Getaway");
  assert.equal(managerOf("NCL"), null);
  const m = instructionsEmail({ ...D, brand: "NCL" });
  const all = m.subject + m.html + m.text;
  assert.match(all, /Norwegian Getaway/);
  assert.doesNotMatch(all, /of the Seas|GSM|Guest Services Manager|DCM|BOM/);
  assert.match(m.html, /your shipboard manager/);
});

test("Royal, Celebrity and Azamara read exactly as before", () => {
  const r = instructionsEmail({ ...D, ship: "Wonder", brand: "Royal" });
  assert.match(r.html, /Wonder of the Seas/);
  assert.match(r.html, /your GSM \(Guest Services Manager\)/);
  assert.match(instructionsEmail({ ...D, ship: "Apex", brand: "Celebrity" }).html, /your DCM \(Digital Communication Manager\)/);
  assert.match(instructionsEmail({ ...D, ship: "Pursuit", brand: "Azamara" }).html, /your BOM \(Business Operations Manager\)/);
  assert.match(instructionsEmail({ ...D, ship: "Wonder" }).html, /your GSM \(Guest Services Manager\)/); // no brand: Royal, as before
});

// The page's own reliefSlot, lifted out of the console as it ships: an empty hull entering service draws the hint.
test("the empty Getaway section says when it enters service and how to place its first printer", () => {
  const grab = (name) => { const i = SRC.indexOf("function " + name + "("); assert.ok(i > 0, name); let d = 0, j = SRC.indexOf("{", i); for (; j < SRC.length; j++) { if (SRC[j] === "{") d++; else if (SRC[j] === "}" && --d === 0) break; } return SRC.slice(i, j + 1); };
  const vm = new Function(grab("escHtml") + grab("fmtDateS") + grab("reliefSlot") + "return reliefSlot;");
  const slot = vm();
  const h = slot(undefined, [], { from: "2026-11-16", crew: [] });
  assert.match(h, /First printer/);
  assert.match(h, /IN SERVICE NOV 16, 2026 · DRAG A SEAFARER HERE/);
  assert.equal(slot(undefined, [], { crew: [] }), ""); // an empty hull in service: as before, no slot
});
