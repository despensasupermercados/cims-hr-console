// THE CONTRACTS THE FILE HAS SHOWN AND FORGOTTEN ARE SHOWN AND COUNTED (Miguel, 16 Nov 2026: "Show and count them").
// registry_contract keeps every contract an AdvancedQuery carried; a row the latest file no longer carries becomes a history
// leg of the ONE schedule, and a debark TDG gave after the count's as-of date adds one to the completed count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { keptLegs, legsFromRegistry, foldCounterHistory } from "../src/ship_leg_source.js";
import { completedSince } from "../src/contract_count.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const VESSELS = [{ name: "Reflection", brand: "Celebrity" }, { name: "Radiance", brand: "Royal Caribbean" }, { name: "Liberty", brand: "Royal Caribbean" }];
const K = (o) => ({ sc: "SC-0038115", name: "Bernard Winzon Paqueo", vessel: "MV CELEBRITY REFLECTION", embarked_at: "2026-07-17", debarked_at: null, closed_run_at: "2026-11-15T16:02:59.427Z", ...o });

test("Paqueo: TDG embarked him on Radiance; his Reflection contract comes back as history, ended on Rita's typed date", () => {
  const rows = [{ sc: "SC-0038115", status: "On board", raw_status: "On board", vessel: "MV RADIANCE OF THE SEAS", embarked_at: "2026-11-14", debarked_at: null, run_at: "2026-11-15T16:02:59.427Z", crew_name: "Bernard Winzon Paqueo" }];
  const edits = [{ sc: "SC-0038115", seq: 1, on_key: "2026-07-17", sign_off: "2026-11-13", updated_at: "2026-11-01T10:00:00Z" }];
  const registry = legsFromRegistry({ rows, edits, counter: [], open: [], vessels: VESSELS, today: "2026-11-16", turnarounds: {}, visits: [], trainers: [] });
  const legs = keptLegs({ kept: [K()], registry, edits, vessels: VESSELS, visits: [], trainers: [] });
  assert.equal(legs.length, 1);
  assert.deepEqual({ ship: legs[0].ship, on: legs[0].on, off: legs[0].off, src: legs[0].offSource, cur: legs[0].is_current, kept: legs[0].kept }, { ship: "Reflection", on: "2026-07-17", off: "2026-11-13", src: "rita", cur: false, kept: true });
  assert.equal(legs[0].fileAt, undefined, "a kept leg never claims to be the latest file's word");
});

test("the sign-off: TDG's debark first, else Rita's typed date, else the day the file dropped it ('ended per TDG file')", () => {
  const one = (k, edits = []) => keptLegs({ kept: [K(k)], registry: [], edits, vessels: VESSELS })[0];
  assert.deepEqual([one({ debarked_at: "2026-11-12" }).off, one({ debarked_at: "2026-11-12" }).offSource], ["2026-11-12", "tdg"]);
  const f = one({});
  assert.deepEqual([f.off, f.offSource, f.byFile], ["2026-11-15", "file", true]);
  assert.equal(one({}, [{ sc: "SC-0038115", on_key: "2026-06-20", sign_off: "2026-11-13" }]).offSource, "file", "an edit 27 days off is another contract's");
});

test("a contract the current file still has, a visit, and the Counter's copy of the same contract are never drawn twice", () => {
  const registry = [{ sc: "SC-0038115", ship: "Reflection", on: "2026-07-19", is_current: true }];
  assert.deepEqual(keptLegs({ kept: [K()], registry, edits: [], vessels: VESSELS }), [], "TDG moved the embark by two days: the same contract");
  const v = keptLegs({ kept: [K({ debarked_at: "2026-07-25" })], registry: [], edits: [], vessels: VESSELS, visits: [], trainers: [{ sc: "SC-0038115" }] });
  assert.equal(v[0].visit, true, "a trainer's trip is a visit");
  const kept = keptLegs({ kept: [K({ debarked_at: "2026-11-13" })], registry: [], edits: [], vessels: VESSELS });
  const counter = [{ sc: "SC-0038115", ship: "Reflection", on: "2026-07-18", off: "2027-02-18", is_current: true, source: "counter" }];
  assert.deepEqual(foldCounterHistory(counter, kept), [], "the Counter's copy is folded");
});

test("the count: a debark TDG gave after the as-of adds one; a transfer is one contract; a dropped row without a debark adds nothing", () => {
  const asOf = "2026-10-08", today = "2026-11-16";
  // Padilla-like: Liberty contract ended 20 Oct, now Earmarked for Icon with no dates (the snapshot row has no embark)
  assert.equal(completedSince(asOf, { debarked_at: null, embarked_at: null, kept: [{ on: "2026-03-01", off: "2026-10-20" }] }, today), 1);
  // the snapshot's own debark and a kept one are two contracts
  assert.equal(completedSince(asOf, { debarked_at: "2026-11-14", embarked_at: "2026-11-05", kept: [{ on: "2026-03-01", off: "2026-10-12" }] }, today), 2);
  // a transfer: off Liberty 12 Oct, on Radiance 25 Oct (13 days) — counted when the last leg ends, not twice
  assert.equal(completedSince(asOf, { debarked_at: null, embarked_at: "2026-10-25", kept: [{ on: "2026-03-01", off: "2026-10-12" }] }, today), 0);
  assert.equal(completedSince(asOf, { debarked_at: null, embarked_at: null, kept: [{ on: "2026-07-17", off: null }] }, today), 0, "no debark: nothing");
  assert.equal(completedSince(asOf, { kept: [{ on: "2026-03-01", off: "2026-10-01" }] }, today), 0, "inside TDG's count already");
  assert.equal(completedSince(asOf, { kept: [{ on: "2026-10-10", off: "2026-10-15", visit: true }] }, today), 0, "a visit");
  assert.equal(completedSince(asOf, { kept: [{ on: "2026-10-10", off: "2026-12-15" }] }, today), 0, "not in the future");
});

test("the count's SQL reads the kept record on real SQLite, and still answers without the table", { skip: !DatabaseSync }, async () => {
  const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  const TMP = new URL(`../src/__kept_${process.pid}__.mjs`, import.meta.url);
  writeFileSync(TMP, SRC + "\nexport { contractCountMap };\n", "utf-8");
  let W; try { W = await import(TMP.href); } finally { unlinkSync(TMP); }
  const mk = (withKept) => {
    const d = new DatabaseSync(":memory:");
    d.exec(`CREATE TABLE contract_count (sc TEXT PRIMARY KEY, completed INTEGER NOT NULL, as_of TEXT);
      CREATE TABLE registry_snapshot (agency_id TEXT PRIMARY KEY, embarked_at TEXT, debarked_at TEXT);
      CREATE TABLE contract_visit (sc TEXT NOT NULL, on_key TEXT NOT NULL, set_at TEXT, kind TEXT DEFAULT 'visit', PRIMARY KEY (sc, on_key));
      CREATE TABLE crew_trainer (sc TEXT PRIMARY KEY, set_at TEXT);
      CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT);
      INSERT INTO contract_count VALUES ('SC-A', 3, '2026-10-08'), ('SC-B', 5, '2026-10-08');
      INSERT INTO registry_snapshot VALUES ('SC-A', NULL, NULL), ('SC-B', '2026-04-01', '2026-10-30');
      INSERT INTO crew VALUES ('SC-A', 'Karen', 'Padilla'), ('SC-B', 'Ray', 'Quiming');`);
    if (withKept) d.exec(`CREATE TABLE registry_contract (sc TEXT NOT NULL, embarked_at TEXT NOT NULL, vessel TEXT, debarked_at TEXT, name TEXT, first_run_at TEXT NOT NULL, last_run_at TEXT NOT NULL, closed_run_at TEXT, PRIMARY KEY (sc, embarked_at));
      INSERT INTO registry_contract VALUES ('SC-A', '2026-03-01', 'MV LIBERTY OF THE SEAS', '2026-10-20', 'K', '2026-10-16', '2026-10-25', '2026-11-10'),
        ('SC-A', '2025-06-01', 'MV LIBERTY OF THE SEAS', '2025-12-20', 'K', '2026-10-16', '2026-10-16', '2026-10-25'),
        ('SC-B', '2026-04-01', 'MV INFINITY', '2026-10-30', 'R', '2026-10-16', '2026-11-15', NULL);`);
    return { DB: { prepare: (sql) => { const st = (a = []) => ({ bind: (...x) => st(x), all: async () => ({ results: d.prepare(sql).all(...a) }), first: async () => d.prepare(sql).get(...a) ?? null }); return st(); } } };
  };
  const m = await W.contractCountMap(mk(true));
  assert.equal(m["SC-A"].added, 1, "Padilla: the Liberty debark of 20 Oct, kept after the file re-listed her");
  assert.equal(m["SC-B"].added, 1, "Quiming: his snapshot row's debark; the open kept row is the same contract, not counted twice");
  const m0 = await W.contractCountMap(mk(false));
  assert.deepEqual([m0["SC-A"].added, m0["SC-B"].added], [0, 1], "no table yet: the snapshot's +1 still counts");
});
