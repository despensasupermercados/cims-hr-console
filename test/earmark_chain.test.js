// THE NEXT EARMARK FOLLOWS THE LAST ONE; THE KEYMAN FILTERS (Miguel, 8 Oct 2026, on Beyond and Allure: "if I pick
// somebody ... automatically I need you to give me a third card, which would be a second earmark ... I want to have the
// flexibility to pick another, a second earmark"; "I looked at picking a year and month .. and I think there is an issue
// there"; "instead of having a find ship .. I wanna just call it search .. by ship, by city .. by name").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createProjection, defaultProjectionDates, SHIP_EARMARKS_SQL } from "../src/projection.js";
import { saveReliefAssignment, addMonthsISO } from "../src/relief_api.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const TODAY = "2026-10-08";
// Allure on 8 Oct 2026: Gorre aboard to Nov 29; Villacortes earmarked Nov 29 → Jun 26, 2027.
const LEGS = [{ ship: "Allure", sc: "SC-G", ours: true, on: "2026-04-29", off: "2026-11-29", is_current: true }];
const V = { on: "2026-11-29", off: "2027-06-26", name: "Raymond Villacortes" };

test("dates: with an earmark still to come, the next one starts on ITS sign-off and says whom it follows", () => {
  const d = defaultProjectionDates({ ship: "Allure", legs: LEGS, today: TODAY, brand: "Royal Caribbean", addMonths: addMonthsISO, chain: [V] });
  assert.deepEqual([d.signOn, d.signOff, d.follows, d.after], ["2027-06-26", "2028-01-26", true, "Raymond Villacortes"]);
  // two earmarks: the LAST one's sign-off, whatever the order they come in
  const two = defaultProjectionDates({ ship: "Allure", legs: LEGS, today: TODAY, brand: "Royal Caribbean", addMonths: addMonthsISO,
    chain: [{ on: "2027-06-26", off: "2028-01-26", name: "Second" }, V] });
  assert.deepEqual([two.signOn, two.after], ["2028-01-26", "Second"]);
  // an earmark saved without a sign-off holds the seat for a contract: its sign-on + 7 months
  const noOff = defaultProjectionDates({ ship: "Allure", legs: LEGS, today: TODAY, brand: "Royal Caribbean", addMonths: addMonthsISO, chain: [{ on: "2026-11-29", off: null, name: "Guazon" }] });
  assert.deepEqual([noOff.signOn, noOff.after], ["2027-06-29", "Guazon"]);
  // no earmark, an aboard one (sign-on passed), one without dates, one ending before the printer: the printer's sign-off, as before
  for (const chain of [[], [{ on: "2026-10-01", off: "2027-05-01", name: "Aboard" }], [{ on: null, off: null, name: "TDG, no dates" }], [{ on: "2026-10-20", off: "2026-11-01", name: "Short" }]]) {
    const p = defaultProjectionDates({ ship: "Allure", legs: LEGS, today: TODAY, brand: "Royal Caribbean", addMonths: addMonthsISO, chain });
    assert.deepEqual([p.signOn, p.after], ["2026-11-29", undefined], JSON.stringify(chain));
  }
  // Azamara: five months after the last earmark
  const az = defaultProjectionDates({ ship: "Quest", legs: [], today: TODAY, brand: "Azamara", addMonths: addMonthsISO, chain: [{ on: "2026-12-01", off: "2027-05-01", name: "Q" }] });
  assert.deepEqual([az.signOn, az.signOff], ["2027-05-01", "2027-10-01"]);
});

const SCHEMA = `
CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL UNIQUE, first_name TEXT, last_name TEXT, redacted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE vessel (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, brand TEXT NOT NULL);
CREATE TABLE contract (id TEXT PRIMARY KEY, crew_id TEXT NOT NULL, contract_group_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE assignment (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, vessel_id TEXT, vessel_name TEXT NOT NULL, is_transfer INTEGER NOT NULL DEFAULT 0,
  sign_on TEXT NOT NULL, planned_sign_off TEXT, actual_sign_off TEXT, role TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  on_port_seed TEXT, off_port_seed TEXT, override_on_city TEXT, override_off_city TEXT, succeeds_assignment_id TEXT,
  eccr INTEGER NOT NULL DEFAULT 0, air INTEGER NOT NULL DEFAULT 0, hotel INTEGER NOT NULL DEFAULT 0, on_date_conf INTEGER NOT NULL DEFAULT 0, off_date_conf INTEGER NOT NULL DEFAULT 0,
  instructions_sent_at TEXT, signoff_link_sent_at TEXT, review_invite_sent_at TEXT, end_reason TEXT, readiness TEXT);
INSERT INTO vessel (id,name,brand) VALUES ('ves_allure','Allure','Royal Caribbean');
INSERT INTO crew (id,agency_id,first_name,last_name) VALUES ('c1','SC-V','Raymond','Villacortes'), ('c2','SC-N','Next','Person'), ('c3','SC-T','Third','Person');
`;
function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { d.prepare(sql).run(...args); return { success: true }; },
  });
  const batch = async (stmts) => { const out = []; d.exec("BEGIN"); try { for (const s of stmts) out.push(await s.run()); d.exec("COMMIT"); } catch (e) { d.exec("ROLLBACK"); throw e; } return out; };
  return { DB: { prepare: (sql) => stmt(sql), batch } };
}

test("createProjection with deps.chain: the second earmark follows the first, the third follows the second; without it, the printer as before", async () => {
  assert.ok(DatabaseSync, "node:sqlite unavailable");
  const d = new DatabaseSync(":memory:"); d.exec(SCHEMA);
  const env = envFor(d);
  const deps = (chain) => ({ boardLegs: async () => LEGS, save: saveReliefAssignment, addMonths: addMonthsISO, ...(chain ? { chain: true } : {}) });
  const first = await createProjection(env, { agencyId: "SC-V", ship: "Allure", today: TODAY }, deps(true));
  assert.deepEqual([first.ok, first.sign_on, first.planned_sign_off, first.after], [true, "2026-11-29", "2027-06-29", null], "nobody earmarked yet: the printer's sign-off");
  const second = await createProjection(env, { agencyId: "SC-N", ship: "Allure", today: TODAY }, deps(true));
  assert.deepEqual([second.ok, second.sign_on, second.planned_sign_off, second.after], [true, "2027-06-29", "2028-01-29", "Raymond Villacortes"]);
  const third = await createProjection(env, { agencyId: "SC-T", ship: "Allure", today: TODAY }, deps(false));
  assert.equal(third.sign_on, "2026-11-29", "the TDG-earmark card at Apply does not chain");
  assert.match(SHIP_EARMARKS_SQL, /a\.actual_sign_off IS NULL AND COALESCE\(v\.name, a\.vessel_name\) = \?1 AND a\.sign_on > \?2/);
});

// The page's own filter, run as the browser runs it (extracted from the served page, the template's escapes undone).
const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const fnSrc = (name) => { const i = W.indexOf("function " + name + "("); assert.ok(i >= 0, name); let j = W.indexOf("\n}", i); return W.slice(i, j + 2).replace(/\\\\/g, "\\"); };
const filterWith = (year, months) => new Function("ROT_YEAR", "ROT_MONTHS", fnSrc("legInFilter") + "; return legInFilter;")(year, months);

test("the year / month filter: a month is matched in every year the contract spans, by calendar date, never shifted by the time zone", () => {
  const leg = { signOn: "2026-11-29", signOff: "2027-06-26" };
  assert.equal(filterWith("", [3])(leg), true, "March without a year: March 2027 is inside (it used to check March 2026 only)");
  assert.equal(filterWith("2027", [12])(leg), false, "Dec 2027: after the sign-off");
  assert.equal(filterWith("2027", [6])(leg), true);
  assert.equal(filterWith("2026", [10])(leg), false, "Oct 2026: before the sign-on");
  assert.equal(filterWith("2026", [11])(leg), true, "Nov 2026: the sign-on day");
  assert.equal(filterWith("2026", [])(leg), true); assert.equal(filterWith("2028", [])(leg), false);
  assert.equal(filterWith("", [12])({ signOn: "2026-04-29", signOff: "2026-12-01" }), true, "a contract ending Dec 1 is in December (local-time parsing dropped it west of UTC)");
  assert.equal(filterWith("2027", [])({ signOn: "2027-01-01", signOff: "2027-03-01" }), true, "a Jan 1 sign-on is in its own year");
  assert.equal(filterWith("2026", [])({ signOn: "2027-01-01", signOff: "2027-03-01" }), false);
  assert.equal(filterWith("", [])({ signOn: null }), true, "no filter: everything");
  assert.equal(filterWith("2026", [])({ signOn: null }), false, "a card without dates cannot be in a window");
});

test("the search: ship, seafarer or earmark, and their ports; accents and case do not matter", () => {
  const fold = new Function(fnSrc("rotFold") + "; return rotFold;")();
  const hit = new Function("rotFold", fnSrc("rotSearchHit") + "; return rotSearchHit;")(fold);
  const sec = { ship: "Allure", crew: [{ name: "John Jeffrey Gorre", embark: "Fort Lauderdale, Florida", disembark: "Miami, Florida" }],
    projections: [{ name: "Mara Tañgonan", on_city: "MIAMI, FLORIDA", off_city: "WILLEMSTAD, CURAÇAO" }] };
  for (const q of ["allure", "gorre", "tangonan", "TAÑGONAN", "lauderdale", "curacao", "miami"]) assert.equal(hit(sec, fold(q)), true, q);
  assert.equal(hit(sec, fold("southampton")), false);
});

test("static: a drawn earmark leaves the slot for the next one (bench dated after it), four cards at most; the panel relieves the last in the chain; Search; empty ships leave on a year / month", () => {
  assert.match(W, /\}\)\)return nextSlot\(rb,sec,_n\);/, "the earmark already drawn no longer swallows the slot");
  assert.match(W, /function reliefSlot\(rb,projs,sec\)\{var _n=\(\(sec&&sec\.crew\)\|\|\[\]\)\.length\+\(projs\|\|\[\]\)\.length;if\(_n>=4\)return '';/, "four side by side at most");
  assert.match(W, /if\(rb&&!rb\.printer&&sec&&sec\.crew&&sec\.crew\.length\)return nextSlot\(rb,sec,_n\);/, "a seat held by a card (no TDG printer) still gets the next slot");
  assert.match(W, /function nextSlot\(rb,sec,n\)\{var b=sec&&sec\.bench;if\(!\(n>=3\)\)\{var _eb=benchBox\(rb,sec\);if\(_eb\)return _eb;\}/, "the list while it fits as the third item; the plain slot as the fourth");
  assert.match(W, /const chain = \(sec\.projections \|\| \[\]\)\.filter\(\(p\) => !p\.aboard && p\.signOn\)/, "the board's list is measured after the last earmark");
  assert.match(W, /\(b\.after\?\('<span class=ebsub> &middot; after '\+escHtml\(b\.after\)/);
  assert.equal((W.match(/turnarounds: fetchShipTurnarounds, chain: true \}/g) || []).length, 2, "the drag / one-tap route and Add crew chain; the TDG-earmark card does not");
  assert.match(W, /<label class=crlbl for=rfind style="display:block;margin-bottom:6px">Search<\/label><input id=rfind type=search placeholder="Ship, city or name"/);
  assert.match(W, /if\(ROT_FIND&&ROT_FIND\.trim\(\)\)\{var q=rotFold\(ROT_FIND\.trim\(\)\);secs=secs\.filter\(function\(s\)\{return rotSearchHit\(s,q\);\}\);\}/);
  assert.match(W, /if\(ROT_F\|\|ROT_YEAR\|\|ROT_MONTHS\.length\)secs=secs\.filter/);
  assert.match(W, /replace\(\/\[\\\\u0300-\\\\u036f\]\/g,''\)/, "the accent fold survives the page template");
});
