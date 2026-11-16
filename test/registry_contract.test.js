// EVERY CONTRACT THE FILE HAS SHOWN, KEPT (registry_contract, bug hunt 16 Nov 2026). registry_snapshot holds one row per
// crew, so a contract left the console the day TDG moved that row on: Padilla, Quiming, Racho and Guazon lost the +1 on
// their completed count on the 10–15 Nov files, Paqueo's Reflection contract left the schedule when TDG embarked him on
// Radiance. This pins the RECORD only (nothing reads it yet — how a kept contract is drawn and counted is Miguel's call).
// Real SQLite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keepContracts, REGISTRY_CONTRACT_DDL, REGISTRY_CONTRACT_SEED_SQL } from "../src/crew_import_routes.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { const r = d.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { DB: { prepare: (s) => stmt(s), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
}
const rows = (d) => d.prepare("SELECT sc, embarked_at, vessel, debarked_at, substr(first_run_at,1,10) f, substr(last_run_at,1,10) l, substr(closed_run_at,1,10) c FROM registry_contract ORDER BY sc, embarked_at").all().map((r) => ({ ...r }));
const R = (agency_id, vessel_observed, embarked_at, debarked_at = null, status = "On board") => ({ agency_id, name: agency_id, status, vessel_observed, embarked_at, debarked_at });

test("node:sqlite is available", () => { assert.ok(DatabaseSync); });

test("a contract stays on record when TDG moves the crew's row on: earmarked with no dates, then embarked on the next ship", { skip: !DatabaseSync }, async () => {
  const d = new DatabaseSync(":memory:"); d.exec(REGISTRY_CONTRACT_DDL);
  const env = envFor(d);
  // file 1: Paqueo On board Reflection since 17 Jul; Padilla home, debarked 20 Oct
  assert.deepEqual(await keepContracts(env, [R("SC-PAQ", "MV CELEBRITY REFLECTION", "2026-07-17"), R("SC-PAD", "MV LIBERTY OF THE SEAS", "2026-03-01", "2026-10-20", "On Vacation")], "2026-11-07T12:00:00.000Z"), { kept: 2, closed: 0 });
  // file 2: Padilla Earmarked for Icon, no dates — her row carries no contract any more; Paqueo unchanged
  assert.deepEqual(await keepContracts(env, [R("SC-PAQ", "MV CELEBRITY REFLECTION", "2026-07-17"), R("SC-PAD", "MV ICON OF THE SEAS", null, null, "Earmarked")], "2026-11-10T12:00:00.000Z"), { kept: 1, closed: 1 });
  // file 3: Paqueo embarked Radiance 14 Nov — the Reflection contract is no longer in the file
  assert.deepEqual(await keepContracts(env, [R("SC-PAQ", "MV RADIANCE OF THE SEAS", "2026-11-14"), R("SC-PAD", "MV ICON OF THE SEAS", null, null, "Earmarked")], "2026-11-15T16:00:00.000Z"), { kept: 1, closed: 1 });
  assert.deepEqual(rows(d), [
    { sc: "SC-PAD", embarked_at: "2026-03-01", vessel: "MV LIBERTY OF THE SEAS", debarked_at: "2026-10-20", f: "2026-11-07", l: "2026-11-07", c: "2026-11-10" },
    { sc: "SC-PAQ", embarked_at: "2026-07-17", vessel: "MV CELEBRITY REFLECTION", debarked_at: null, f: "2026-11-07", l: "2026-11-10", c: "2026-11-15" },
    { sc: "SC-PAQ", embarked_at: "2026-11-14", vessel: "MV RADIANCE OF THE SEAS", debarked_at: null, f: "2026-11-15", l: "2026-11-15", c: null },
  ]);
});

test("TDG's debark is kept once a file gives it, a file that carries the contract again reopens it, a file with no embark dates closes nothing", { skip: !DatabaseSync }, async () => {
  const d = new DatabaseSync(":memory:"); d.exec(REGISTRY_CONTRACT_DDL);
  const env = envFor(d);
  await keepContracts(env, [R("SC-1", "MV ANTHEM OF THE SEAS", "2026-04-01")], "2026-10-01T00:00:00.000Z");
  await keepContracts(env, [R("SC-1", "MV ANTHEM OF THE SEAS", "2026-04-01", "2026-10-28", "On Vacation")], "2026-11-01T00:00:00.000Z");
  assert.equal(rows(d)[0].debarked_at, "2026-10-28");
  // a later file repeats the row without the debark cell: the date TDG gave is not lost
  await keepContracts(env, [R("SC-1", "MV ANTHEM OF THE SEAS", "2026-04-01", "-", "On Vacation")], "2026-11-05T00:00:00.000Z");
  assert.equal(rows(d)[0].debarked_at, "2026-10-28");
  // an older-style file with no embark column at all says nothing about contracts
  assert.deepEqual(await keepContracts(env, [R("SC-1", "MV ANTHEM OF THE SEAS", null), R("SC-2", "MV APEX", "-")], "2026-11-08T00:00:00.000Z"), { kept: 0, closed: 0 });
  assert.equal(rows(d)[0].c, null);
  // dropped by one file (closed), carried again by the next (an older file applied by mistake, then the right one): reopened
  await keepContracts(env, [R("SC-2", "MV CELEBRITY APEX", "2026-10-07")], "2026-11-09T00:00:00.000Z");
  assert.equal(rows(d).find((r) => r.sc === "SC-1").c, "2026-11-09");
  await keepContracts(env, [R("SC-1", "MV ANTHEM OF THE SEAS", "2026-04-01", "2026-10-28", "On Vacation"), R("SC-2", "MV CELEBRITY APEX", "2026-10-07")], "2026-11-10T00:00:00.000Z");
  const one = rows(d).find((r) => r.sc === "SC-1");
  assert.deepEqual([one.c, one.f, one.l], [null, "2026-10-01", "2026-11-10"]);
});

test("an empty record starts from the latest file's rows, once; a record with rows is never re-seeded", { skip: !DatabaseSync }, async () => {
  const d = new DatabaseSync(":memory:"); d.exec(REGISTRY_CONTRACT_DDL);
  d.exec("CREATE TABLE registry_snapshot (agency_id TEXT PRIMARY KEY, status TEXT, vessel TEXT, run_at TEXT, import_run_id TEXT, name TEXT, raw_status TEXT, embarked_at TEXT, debarked_at TEXT)");
  d.exec("INSERT INTO registry_snapshot VALUES ('SC-1','On board','MV CELEBRITY SOLSTICE','2026-11-15T16:02:59.427Z','run1','Joe Art Eresmas','On board','2026-07-23',NULL), ('SC-2','On Vacation','MV ANTHEM OF THE SEAS','2026-11-15T16:02:59.427Z','run1','X','On Vacation','2026-04-01','2026-10-28'), ('SC-3','Earmarked','MV ICON OF THE SEAS','2026-11-15T16:02:59.427Z','run1','Y','Earmarked',NULL,NULL), ('SC-4','On board','MV APEX','2026-11-15T16:02:59.427Z','run1','Z','On board','-','-')");
  d.exec(REGISTRY_CONTRACT_SEED_SQL);
  assert.deepEqual(rows(d).map((r) => [r.sc, r.embarked_at, r.debarked_at, r.f, r.c]), [["SC-1", "2026-07-23", null, "2026-11-15", null], ["SC-2", "2026-04-01", "2026-10-28", "2026-11-15", null]]);
  d.exec("UPDATE registry_snapshot SET embarked_at='2026-11-14' WHERE agency_id='SC-1'");
  d.exec(REGISTRY_CONTRACT_SEED_SQL);
  assert.equal(rows(d).length, 2, "not seeded twice");
});

test("the record is written after the import's own batch and can never fail an Apply; the guard and the migration make the same table", () => {
  const src = readFileSync(new URL("../src/crew_import_routes.js", import.meta.url), "utf-8");
  const i = src.indexOf("const results = await env.DB.batch(stmts);"), j = src.indexOf("contracts_kept = await keepContracts(env, registry, run_at)");
  assert.ok(i > 0 && j > i, "after the batch");
  assert.match(src.slice(i, j + 200), /try \{ contracts_kept = await keepContracts\(env, registry, run_at\); \} catch/);
  const w = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.match(w, /env\.DB\.prepare\(REGISTRY_CONTRACT_DDL\)\.run\(\)\.catch\(\(\) => null\)/);
  assert.match(w, /await env\.DB\.prepare\(REGISTRY_CONTRACT_SEED_SQL\)\.run\(\)\.catch\(\(\) => null\)/);
  const mig = readFileSync(new URL("../migrations/0043_registry_contract.sql", import.meta.url), "utf-8").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().replace(/;$/, "");
  assert.equal(mig.replace(/\( /g, "(").replace(/ \)/g, ")"), REGISTRY_CONTRACT_DDL);
});
