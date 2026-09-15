// port_days.js — the board fetches the itinerary rows it needs, not the whole table (2026-09-15).
// Real SQLite (node:sqlite) on the production table shapes, like counter_legs.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PORT_DAYS_CONTRACTS_SQL, PORT_DAYS_ASSIGNMENTS_SQL, PORT_DAYS_FLAGS_SQL, AZAMARA_TURNAROUNDS_SQL, fetchBoardPortDays, fetchAzamaraTurnarounds } from "../src/port_days.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SCHEMA = `
CREATE TABLE vessel_port_day (brand TEXT NOT NULL, ship_short TEXT NOT NULL, berth_date TEXT NOT NULL, stop_seq INTEGER NOT NULL DEFAULT 1,
  port_name TEXT, country TEXT, arrive TEXT, depart TEXT, tender TEXT, is_sea INTEGER NOT NULL DEFAULT 0, overnight INTEGER NOT NULL DEFAULT 0,
  source TEXT, source_asof TEXT, is_turnaround INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (brand, ship_short, berth_date, stop_seq));
CREATE TABLE keyman_contract3 (sc TEXT NOT NULL, km TEXT, ship TEXT, st TEXT, seq INTEGER, sign_on TEXT, proj_off TEXT, act_off TEXT, imported_at TEXT, PRIMARY KEY (sc, seq));
CREATE TABLE contract_edit (sc TEXT, seq INTEGER, embark TEXT, disembark TEXT, sign_on TEXT, sign_off TEXT, ship TEXT, on_key TEXT, updated_at TEXT, PRIMARY KEY (sc, seq));
CREATE TABLE vessel (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, brand TEXT NOT NULL);
CREATE TABLE assignment (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, vessel_id TEXT, vessel_name TEXT NOT NULL, sign_on TEXT NOT NULL, planned_sign_off TEXT, actual_sign_off TEXT);
CREATE TABLE ship_leg (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, ship_short TEXT NOT NULL, sc TEXT, crew_id TEXT, ours INTEGER NOT NULL DEFAULT 1, on_date TEXT, off_date TEXT, is_current INTEGER NOT NULL DEFAULT 0, source TEXT);
CREATE TABLE leg_flags (vessel_key TEXT PRIMARY KEY, crew_name TEXT, override_off_date TEXT);
INSERT INTO vessel (id,name,brand) VALUES ('ves_anthem','Anthem','Royal Caribbean'), ('ves_quest','Quest','Azamara'), ('ves_edge','Edge','Celebrity');
`;
function db() {
  const d = new DatabaseSync(":memory:");
  d.exec(SCHEMA);
  // A dense itinerary: three ships, every day of 2026, a turnaround every 7th day.
  const ins = d.prepare("INSERT INTO vessel_port_day (brand,ship_short,berth_date,port_name,is_sea,is_turnaround) VALUES (?,?,?,?,?,?)");
  const d0 = Date.UTC(2026, 0, 1);
  for (const [b, s] of [["Royal Caribbean", "Anthem"], ["Azamara", "Quest"], ["Celebrity", "Edge"]]) {
    for (let i = 0; i < 365; i++) {
      const date = new Date(d0 + i * 86400000).toISOString().slice(0, 10);
      const sea = i % 3 === 1;
      ins.run(b, s, date, sea ? "AT SEA" : "Port " + (i % 5), sea ? 1 : 0, i % 7 === 0 ? 1 : 0);
    }
  }
  return d;
}
function envFor(d) {
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), all: async () => ({ results: d.prepare(sql).all(...args) }) });
  return { DB: { prepare: (sql) => stmt(sql) } };
}
const dates = (rows) => rows.map((r) => r.ship_short + "|" + r.berth_date).sort();

test("node:sqlite is available, so everything below actually runs", () => {
  assert.ok(DatabaseSync, "node:sqlite unavailable — the itinerary SQL went unverified.");
});

test("all four queries execute against the production table shapes", () => {
  const d = db();
  for (const sql of [PORT_DAYS_CONTRACTS_SQL, PORT_DAYS_ASSIGNMENTS_SQL, PORT_DAYS_FLAGS_SQL]) assert.doesNotThrow(() => d.prepare(sql).all(), sql.slice(0, 60));
  assert.doesNotThrow(() => d.prepare(AZAMARA_TURNAROUNDS_SQL).all("2026-09-15"));
});

test("with no cards, no itinerary rows are read at all — the 40k-row scan is gone", async () => {
  const rows = await fetchBoardPortDays(envFor(db()));
  assert.deepEqual(rows, []);
});

test("a Counter contract pulls exactly its ship's rows on sign-on ±1 and projected sign-off ±1", async () => {
  const d = db();
  d.prepare("INSERT INTO keyman_contract3 (sc,ship,seq,sign_on,proj_off) VALUES ('SC-1','Anthem',1,'2026-03-08','2026-09-14')").run();
  const rows = await fetchBoardPortDays(envFor(d));
  assert.deepEqual(dates(rows), [
    "Anthem|2026-03-07", "Anthem|2026-03-08", "Anthem|2026-03-09",
    "Anthem|2026-09-13", "Anthem|2026-09-14", "Anthem|2026-09-15",
  ], "±1 day is what resolveCity's provisional match needs; nothing from Quest or Edge");
  assert.ok(rows.every((r) => "port_name" in r && "is_sea" in r && "brand" in r), "the resolver's shape");
});

test("Rita's edit, an assignment (with or without vessel_id), the snapshot and a relief override each add their own dates; duplicates collapse", async () => {
  const d = db();
  d.prepare("INSERT INTO keyman_contract3 (sc,ship,seq,sign_on,proj_off) VALUES ('SC-1','Anthem',1,'2026-03-08','2026-09-14')").run();
  d.prepare("INSERT INTO contract_edit (sc,seq,ship,sign_off) VALUES ('SC-1',1,'Anthem','2026-09-14')").run(); // same date as the Counter: no duplicate rows
  d.prepare("INSERT INTO assignment (id,contract_id,vessel_id,vessel_name,sign_on,planned_sign_off) VALUES ('a1','k1','ves_quest','Quest','2026-11-29','2027-04-29')").run();
  d.prepare("INSERT INTO assignment (id,contract_id,vessel_id,vessel_name,sign_on,planned_sign_off,actual_sign_off) VALUES ('a2','k2',NULL,'Edge','2026-01-10','2026-07-10','2026-06-30')").run();
  d.prepare("INSERT INTO ship_leg (brand,ship_short,sc,on_date,off_date,is_current,source) VALUES ('Azamara','Quest','SC-9','2026-02-01',NULL,1,'keyman_roster')").run();
  d.prepare("INSERT INTO leg_flags (vessel_key,crew_name,override_off_date) VALUES ('Celebrity|Edge','X','2026-05-05')").run();
  const rows = await fetchBoardPortDays(envFor(d));
  const got = dates(rows);
  const keys = new Set(got);
  assert.equal(got.length, keys.size, "no duplicate (ship, date) rows");
  for (const k of ["Anthem|2026-09-14", "Quest|2026-11-29", "Edge|2026-01-10", "Edge|2026-07-10", "Edge|2026-06-30", "Quest|2026-02-01", "Edge|2026-05-05"]) assert.ok(keys.has(k), "missing " + k);
  assert.ok(!keys.has("Quest|2027-04-29"), "2027 is outside the seeded itinerary — no row, no error");
  assert.ok(got.length < 40, "a handful of rows, not the table (got " + got.length + ")");
});

test("Azamara turnarounds: only Azamara, only real ports, only from yesterday forward, ascending", async () => {
  const rows = await fetchAzamaraTurnarounds(envFor(db()), "2026-09-15");
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.brand === "Azamara" && r.ship_short === "Quest"));
  assert.ok(rows.every((r) => r.berth_date >= "2026-09-14"), "the projection never lands before today; one day of slack for the date basis");
  assert.ok(rows.every((r) => r.port_name && r.port_name !== "AT SEA"));
  assert.deepEqual(rows.map((r) => r.berth_date), rows.map((r) => r.berth_date).slice().sort());
});

test("STATIC GUARD: no reader takes the whole itinerary table any more", () => {
  for (const f of ["../src/worker.js", "../src/relief_api.js", "../src/port_days.js"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /FROM vessel_port_day\s*["`]/, f + " reads vessel_port_day with no WHERE/JOIN — that is the 40k-row scan behind 'takes forever to save'");
  }
});
