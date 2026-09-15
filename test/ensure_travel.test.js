// ensureTravelImpl against REAL SQLite (node:sqlite), on the production table shape.
//
// WHY (15 Sep 2026). This guard runs on every cold isolate that serves /api/dashboard, and it was the one
// guard PR #117 left on the old shape — which is exactly why the dashboard did not get faster (perf_log:
// 1494ms before, 1636ms after, while /api/rotation fell from 2043ms to 760ms). Collapsing it means the
// CREATE and the count now RACE, so both orderings are tested here: the point of the change is that the
// steady state costs one round trip, and the point of this test is that a fresh or legacy table still
// ends up seeded either way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__travel_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { ensureTravelImpl, TRAVEL_2025 };\n", "utf-8");
let ensureTravelImpl, TRAVEL_2025;
try { ({ ensureTravelImpl, TRAVEL_2025 } = await import(TMP.href)); } finally { unlinkSync(TMP); }

// A D1 shim over real SQLite. `defer` delays the statement kinds named in it by a macrotask, so the test
// can force the CREATE to land AFTER the count — the ordering Promise.all does not guarantee.
function envFor(d, { defer = null, log = [] } = {}) {
  const kind = (sql) => (/^\s*CREATE/i.test(sql) ? "create" : /^\s*ALTER/i.test(sql) ? "alter" : /^\s*SELECT/i.test(sql) ? "select" : /^\s*DELETE/i.test(sql) ? "delete" : "other");
  const wait = (sql) => (defer && defer === kind(sql) ? new Promise((r) => setTimeout(r, 5)) : Promise.resolve());
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => { await wait(sql); log.push(kind(sql)); return { results: d.prepare(sql).all(...args) }; },
    first: async () => { await wait(sql); log.push(kind(sql)); return d.prepare(sql).get(...args) ?? null; },
    run: async () => { await wait(sql); log.push(kind(sql)); d.prepare(sql).run(...args); return { success: true }; },
  });
  return { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
}
const LIVE = `CREATE TABLE travel_expense (id TEXT PRIMARY KEY, year INTEGER, month INTEGER, leg TEXT, kind TEXT DEFAULT 'crew',
  crew_name TEXT, air REAL, hotel REAL, medical REAL, visa REAL, food REAL, transport REAL, other REAL DEFAULT 0, total REAL);`;
const count = (d) => d.prepare("SELECT COUNT(*) n FROM travel_expense").get().n;

test("node:sqlite is available, so everything below actually runs", () => {
  assert.ok(DatabaseSync, "node:sqlite missing — this suite would silently pass");
});

test("a populated table is left alone: no DELETE, no reseed, and the count rides with the CREATE", async () => {
  const d = new DatabaseSync(":memory:");
  d.exec(LIVE);
  d.exec("INSERT INTO travel_expense (id,year,month,kind,total) VALUES ('t1',2025,1,'crew',10),('t2',2025,2,'shoreside',20);");
  const log = [];
  await ensureTravelImpl(envFor(d, { log }));
  assert.equal(count(d), 2, "steady state writes nothing");
  assert.ok(!log.includes("delete"), "a live table must never be re-seeded: " + log.join(","));
  assert.deepEqual(log, ["create", "select"], "one CREATE (a no-op) and one count — nothing sequential after them");
});

test("a fresh database ends up created and seeded, whichever of the two statements lands first", async () => {
  for (const defer of [null, "create"]) {
    const d = new DatabaseSync(":memory:");
    const log = [];
    await ensureTravelImpl(envFor(d, { defer, log }));
    const cols = d.prepare("PRAGMA table_info(travel_expense)").all().map((c) => c.name);
    assert.ok(cols.includes("kind") && cols.includes("other"), "table created with the current shape (defer=" + defer + ")");
    assert.equal(count(d), TRAVEL_2025.length, "the 2025 history is seeded exactly once (defer=" + defer + ")");
  }
});

test("a legacy table with no `kind` column is migrated and seeded, not left half-built", async () => {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE travel_expense (id TEXT PRIMARY KEY, year INTEGER, month INTEGER, leg TEXT, crew_name TEXT, air REAL, hotel REAL, medical REAL, visa REAL, food REAL, transport REAL, total REAL);");
  d.exec("INSERT INTO travel_expense (id,year,month,total) VALUES ('old1',2025,1,5);");
  await ensureTravelImpl(envFor(d));
  const cols = d.prepare("PRAGMA table_info(travel_expense)").all().map((c) => c.name);
  assert.ok(cols.includes("kind"), "the missing column is added");
  assert.ok(cols.includes("other"), "and the second one");
  assert.equal(count(d), TRAVEL_2025.length, "2025 is replaced by the seeded history, as before the change");
});
