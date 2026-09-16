// The schema gate, against a recording fake: does an already-applied guard really cost nothing?
//
// WHY (16 Sep 2026). perf_log from production, Miguel's own session:
//   /api/rotation      dur 1619ms  guards=3   colo EZE
//   /api/dashboard     dur 1531ms  guards=3   colo EZE
//   /api/relief/board  dur  710ms  guards=3   colo EZE
// guards=3 on every request means every request was a cold isolate, and the guard work was the bulk of
// the time. The guards create tables and add columns that have existed in production since June, so the
// console was paying for migrations on every visit, forever.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { etagFor } from "../src/etag.js";

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__gate_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { memoEnsure };\n", "utf-8");
let memoEnsure;
try { ({ memoEnsure } = await import(TMP.href)); } finally { unlinkSync(TMP); }

// `markers` is what data_meta already holds; `sql` records every statement the gate issues.
function fakeEnv(markers = [], { readFails = false } = {}) {
  const sql = [];
  const DB = {
    prepare(q) {
      const S = String(q).replace(/\s+/g, " ").trim();
      const st = {
        bind: (...a) => ({ ...st, args: a }),
        all: async () => {
          sql.push(S);
          if (readFails) throw new Error("no such table: data_meta");
          return { results: markers.map((k) => ({ k })) };
        },
        first: async () => { sql.push(S); return null; },
        run: async () => { sql.push(S); return { success: true }; },
      };
      return st;
    },
    async batch(sts) { for (const s of sts) await s.run(); return sts.map(() => ({ success: true })); },
  };
  return { env: { DB }, sql };
}
const impl = async (env) => { await env.DB.prepare("CREATE TABLE IF NOT EXISTS widget (id TEXT)").run(); };
const KEY = "guard:" + etagFor(impl.toString());

test("a fresh database runs the guard and records it", async () => {
  const { env, sql } = fakeEnv([]);
  await memoEnsure(impl)(env);
  assert.ok(sql.some((q) => q.startsWith("CREATE TABLE IF NOT EXISTS widget")), "the DDL ran");
  assert.ok(sql.some((q) => q.startsWith("INSERT OR IGNORE INTO data_meta")), "and the guard recorded itself");
});

test("a database that already carries the marker issues NO DDL and NO write — one read, nothing else", async () => {
  const { env, sql } = fakeEnv([KEY]);
  await memoEnsure(impl)(env);
  assert.deepEqual(sql, ["SELECT k FROM data_meta WHERE k LIKE 'guard:%'"],
    "this is the whole cost of a cold start for this guard now: " + JSON.stringify(sql));
});

test("every guard on one isolate shares that single read", async () => {
  const a = async (env) => { await env.DB.prepare("CREATE TABLE IF NOT EXISTS a (id TEXT)").run(); };
  const b = async (env) => { await env.DB.prepare("CREATE TABLE IF NOT EXISTS b (id TEXT)").run(); };
  const { env, sql } = fakeEnv(["guard:" + etagFor(a.toString()), "guard:" + etagFor(b.toString())]);
  await Promise.all([memoEnsure(a)(env), memoEnsure(b)(env)]);
  assert.equal(sql.filter((q) => q.includes("LIKE 'guard:%'")).length, 1, "one read for the whole isolate");
  assert.equal(sql.length, 1, "and nothing else at all");
});

test("CHANGING a guard's code makes it run again — the marker is its fingerprint, not a version anyone maintains", async () => {
  const changed = async (env) => { await env.DB.prepare("CREATE TABLE IF NOT EXISTS widget (id TEXT, extra TEXT)").run(); };
  assert.notEqual("guard:" + etagFor(changed.toString()), KEY, "different source, different marker");
  const { env, sql } = fakeEnv([KEY]); // the OLD guard is recorded; this one is not
  await memoEnsure(changed)(env);
  assert.ok(sql.some((q) => q.includes("extra TEXT")), "the changed guard runs against a database holding the old marker");
});

test("a database with no data_meta at all still runs every guard, exactly as before the gate existed", async () => {
  const { env, sql } = fakeEnv([], { readFails: true });
  await memoEnsure(impl)(env);
  assert.ok(sql.some((q) => q.startsWith("CREATE TABLE IF NOT EXISTS widget")), "never skip on a failed read");
});
