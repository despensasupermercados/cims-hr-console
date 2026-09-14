// counter_legs.js — the ONE definition of a current leg, now the Contract Counter (2026-09-14).
//
// Runs the real SQL on real SQLite (node:sqlite) against the production table shapes, the same way
// roster_export_assignment.test.js proves ROSTER_SQL. The cutover claim is "byte-identical": for a
// crew whose Counter row equals their snapshot row, the new source must return the same row as the
// old ship_leg reader did — including the snapshot's ports, nulls and all (verified 0/0 on prod).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTER_LEG_SQL, COUNTER_LEG_SELECT, KC3_LEGS_SQL, fetchCurrentCounterLegs } from "../src/counter_legs.js";
import { legsFromCounter } from "../src/ship_leg_source.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SCHEMA = `
CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT, first_name TEXT, last_name TEXT, redacted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE vessel (id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL);
CREATE TABLE ship_leg (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT, ship_short TEXT, sc TEXT, crew_id TEXT,
  ours INTEGER NOT NULL DEFAULT 1, on_date TEXT, off_date TEXT, embark TEXT, disembark TEXT,
  is_current INTEGER NOT NULL DEFAULT 0, source TEXT);
CREATE TABLE keyman_contract3 (sc TEXT NOT NULL, km TEXT, ship TEXT, st TEXT, seq INTEGER, sign_on TEXT, proj_off TEXT, act_off TEXT, PRIMARY KEY (sc, seq));
CREATE TABLE contract_edit (sc TEXT, seq INTEGER, embark TEXT, disembark TEXT, sign_on TEXT, sign_off TEXT, ship TEXT, PRIMARY KEY (sc, seq));
INSERT INTO vessel (id,name,brand) VALUES ('v_icon','Icon','Royal Caribbean'), ('v_quest','Quest','Azamara'), ('v_edge','Edge','Celebrity');
`;
// The reader every consumer used until 2026-09-14 (ship_leg_source.legsFromShipLeg, verbatim).
const OLD_SQL = `SELECT l.brand, l.ship_short, l.sc, l.on_date, l.off_date, l.embark, l.disembark, l.ours, l.is_current, l.crew_id,
  TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name
  FROM ship_leg l LEFT JOIN crew c ON c.id = l.crew_id
  WHERE l.ours = 1 AND NOT (l.source LIKE 'assignment:%' AND l.is_current = 0)
  ORDER BY l.brand, l.ship_short, l.on_date`;

function db() { const d = new DatabaseSync(":memory:"); d.exec(SCHEMA); return d; }
const crew = (d, id, sc, first, last) => d.prepare("INSERT INTO crew (id,agency_id,first_name,last_name) VALUES (?,?,?,?)").run(id, sc, first, last);
const snap = (d, sc, crewId, ship, brand, on, off, emb, dis) =>
  d.prepare("INSERT INTO ship_leg (brand,ship_short,sc,crew_id,ours,on_date,off_date,embark,disembark,is_current,source) VALUES (?,?,?,?,1,?,?,?,?,1,'keyman_roster')")
    .run(brand, ship, sc, crewId, on, off, emb, dis);
const kc3 = (d, sc, ship, seq, on, proj, act = null) =>
  d.prepare("INSERT INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off,act_off) VALUES (?,?,?,?,?,?,?,?)").run(sc, "km" + sc, ship, "Onboard", seq, on, proj, act);
const strip = (rows) => rows.map((r) => { const { source, ...rest } = r; return rest; });
const canon = (r) => JSON.stringify(Object.fromEntries(Object.keys(r).sort().map((k) => [k, r[k]])));
const byKey = (rows) => rows.map(canon).sort();
const envFor = (d) => ({ DB: { prepare: (sql) => ({ all: async () => ({ results: d.prepare(sql).all() }) }) } });

test("node:sqlite is available, so everything below actually runs", () => {
  assert.ok(DatabaseSync, "node:sqlite unavailable — the Counter leg SQL went unverified.");
});

test("the SQL is valid against the production table shapes, and orders like the old reader", () => {
  const d = db();
  assert.doesNotThrow(() => d.prepare(COUNTER_LEG_SQL).all());
  assert.doesNotThrow(() => d.prepare(KC3_LEGS_SQL).all());
  assert.match(COUNTER_LEG_SQL, /ORDER BY brand, ship_short, on_date\s*$/);
});

test("BYTE-IDENTICAL: a Counter row equal to its snapshot row yields exactly the old reader's row (ports and nulls included)", () => {
  const d = db();
  crew(d, "c1", "SC-1", "Ana", "Alpha"); crew(d, "c2", "SC-2", "Ben", "Bravo"); crew(d, "c3", "SC-3", "Cy", "Charlie");
  snap(d, "SC-1", "c1", "Icon", "Royal Caribbean", "2026-03-08", "2026-09-14", "Miami", "Miami, Florida");
  snap(d, "SC-2", "c2", "Quest", "Azamara", "2026-01-06", "2026-07-29", "Port Louis", null);
  snap(d, "SC-3", "c3", "Edge", "Celebrity", "2026-05-18", null, "Juneau, Alaska", null);   // no projected sign-off
  kc3(d, "SC-1", "Icon", 1, "2026-03-08", "2026-09-14");
  kc3(d, "SC-2", "Quest", 1, "2026-01-06", "2026-07-29");
  kc3(d, "SC-3", "Edge", 1, "2026-05-18", null);
  // Rita's edit carries a disembark the snapshot never had: the memory wins (as-is), so the row is unchanged.
  d.prepare("INSERT INTO contract_edit (sc,seq,embark,disembark) VALUES ('SC-3',1,'Seward','Vancouver')").run();
  const oldRows = d.prepare(OLD_SQL).all();
  const newRows = d.prepare(COUNTER_LEG_SQL).all();
  assert.equal(newRows.length, 3);
  assert.ok(newRows.every((r) => r.source === "counter"));
  assert.deepEqual(byKey(strip(newRows)), byKey(oldRows));
});

test("a leg past its projected sign-off is still current — overdue, not gone (Miguel: what is in the TDG import stays)", () => {
  const d = db();
  crew(d, "c1", "SC-1", "Ana", "Alpha");
  kc3(d, "SC-1", "Icon", 1, "2026-01-06", "2026-07-29");
  const r = d.prepare(COUNTER_LEG_SQL).all()[0];
  assert.equal(r.is_current, 1);
  assert.equal(r.off_date, "2026-07-29");
});

test("several Counter contracts: only the LATEST is current; earlier ones come through as history", () => {
  const d = db();
  crew(d, "c1", "SC-1", "Ana", "Alpha");
  kc3(d, "SC-1", "Quest", 1, "2024-01-01", "2024-06-01");
  kc3(d, "SC-1", "Quest", 2, "2025-01-01", "2025-06-01");
  kc3(d, "SC-1", "Icon", 3, "2026-03-01", "2026-09-30");
  const rows = d.prepare(COUNTER_LEG_SQL).all();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.on_date + ":" + r.is_current + ":" + r.brand).sort(),
    ["2024-01-01:0:Azamara", "2025-01-01:0:Azamara", "2026-03-01:1:Royal Caribbean"]);
  // KC3_LEGS_SQL hands the contract grouping every leg, seq-ordered, raw column names.
  assert.deepEqual(d.prepare(KC3_LEGS_SQL).all().map((r) => r.seq), [1, 2, 3]);
});

test("a leg the snapshot never had takes Rita's ports from contract_edit; brand still from the vessel table", () => {
  const d = db();
  crew(d, "c1", "SC-1", "Ana", "Alpha");
  kc3(d, "SC-1", "Edge", 1, "2026-10-01", "2027-04-01");
  d.prepare("INSERT INTO contract_edit (sc,seq,embark,disembark) VALUES ('SC-1',1,'Fort Lauderdale','Rome')").run();
  const r = d.prepare(COUNTER_LEG_SQL).all()[0];
  assert.equal(r.embark, "Fort Lauderdale");
  assert.equal(r.disembark, "Rome");
  assert.equal(r.brand, "Celebrity");
});

test("ORPHAN ARM: a snapshot leg whose crew has no Counter row is still served, tagged; a projected mirror never is", () => {
  const d = db();
  crew(d, "c9", "SC-9", "Tee", "Bee-Ay");
  d.prepare("INSERT INTO ship_leg (brand,ship_short,sc,crew_id,ours,on_date,off_date,embark,disembark,is_current,source) VALUES ('Azamara','Quest','SC-9','c9',1,NULL,'2026-07-25','Port Louis','Berlin',1,'keyman_roster;on=TBA(Rita)')").run();
  d.prepare("INSERT INTO ship_leg (brand,ship_short,sc,crew_id,ours,on_date,off_date,is_current,source) VALUES ('Azamara','Quest','SC-9','c9',1,'2026-11-01','2027-04-01',0,'assignment:as_1')").run();
  const rows = d.prepare(COUNTER_LEG_SQL).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "ship_leg:orphan");
  assert.equal(rows[0].on_date, null);
  assert.equal(rows[0].embark, "Port Louis");
  // Once the Counter carries the crew, the orphan arm goes quiet for them.
  kc3(d, "SC-9", "Quest", 1, "2026-08-01", "2027-01-15");
  const after = d.prepare(COUNTER_LEG_SQL).all();
  assert.equal(after.length, 1);
  assert.equal(after[0].source, "counter");
});

test("legsFromCounter maps to the SHIP_HISTORY shape (brand shortened, ports only when present, source kept)", async () => {
  const d = db();
  crew(d, "c1", "SC-1", "Ana", "Alpha");
  kc3(d, "SC-1", "Icon", 1, "2026-03-08", "2026-09-14");
  const legs = await legsFromCounter(envFor(d));
  assert.deepEqual(legs, [{ ship: "Icon", name: "Ana Alpha", sc: "SC-1", ours: true, on: "2026-03-08", off: "2026-09-14", brand: "Royal", is_current: true, crew_id: "c1", source: "counter" }]);
  assert.equal("embark" in legs[0], false, "honest nulls: no port key when there is no port");
});

test("fetchCurrentCounterLegs returns the current set only", async () => {
  const d = db();
  crew(d, "c1", "SC-1", "Ana", "Alpha");
  kc3(d, "SC-1", "Quest", 1, "2024-01-01", "2024-06-01");
  kc3(d, "SC-1", "Icon", 2, "2026-03-01", "2026-09-30");
  const cur = await fetchCurrentCounterLegs(envFor(d));
  assert.equal(cur.length, 1);
  assert.equal(cur[0].ship_short, "Icon");
});

// Static pins: every reader that used to SELECT current legs from ship_leg now goes through here.
test("relief printers, the backup CSV, the roster export and the board all read the Counter source — no reader takes current legs from ship_leg", () => {
  const relief = readFileSync(new URL("../src/relief_api.js", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const roster = readFileSync(new URL("../src/roster_export.js", import.meta.url), "utf8");
  const legsrc = readFileSync(new URL("../src/ship_leg_source.js", import.meta.url), "utf8");
  assert.match(relief, /const legs = await fetchCurrentCounterLegs\(env\);/, "relief printers");
  assert.doesNotMatch(relief, /FROM ship_leg l LEFT JOIN crew c ON c\.id = l\.crew_id\s+WHERE l\.is_current = 1 AND l\.ours = 1/, "relief printers still read the snapshot");
  assert.match(worker, /await fetchCurrentCounterLegs\(env\)/, "backup CSV");
  assert.doesNotMatch(worker, /FROM ship_leg l LEFT JOIN crew c/, "backup CSV still reads the snapshot");
  assert.doesNotMatch(worker, /FROM ship_leg WHERE ours=1 AND is_current=1/, "rank map / crew list / rotation still read the snapshot");
  assert.match(roster, /LEFT JOIN \(\$\{COUNTER_LEG_SELECT\}\) l/, "roster export");
  assert.match(legsrc, /legsFromCounter\(env\), fetchCurrentAssignments\(env, today\)/, "board");
  assert.equal(COUNTER_LEG_SQL.startsWith(COUNTER_LEG_SELECT), true);
});
