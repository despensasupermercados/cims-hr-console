// d1batch.js (13 Oct 2026, "going from tab to tab takes a lot"): a wave of reads is ONE batch; each caller gets exactly
// its own .all() / .first() answer; writes are never grouped; a failed or malformed batch falls back to the statements
// one by one (today's path); env.DB.batch() still takes the wrapped statements; the wrapper keeps its identity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { batchingDb } from "../src/d1batch.js";

function fakeDb(opts = {}) {
  const calls = [];
  const mk = (sql, args = []) => ({ sql, args,
    bind: (...a) => mk(sql, a),
    all: async () => { calls.push("all " + sql); if (opts.failOn && sql.includes(opts.failOn)) throw new Error("no such table"); return { results: [{ sql, one: true }] }; },
    first: async () => { calls.push("first " + sql); return { sql, one: true }; },
    run: async () => { calls.push("run " + sql); return { meta: { changes: 1 } }; },
  });
  const db = { prepare: (sql) => mk(sql), batch: async (sts) => {
    calls.push("batch " + sts.map((s) => s.sql).join(" | "));
    if (opts.batchThrows) throw new Error("batch boom");
    if (opts.batchMeta) return sts.map(() => ({ meta: {} }));
    for (const s of sts) if (opts.failOn && s.sql.includes(opts.failOn)) throw new Error("no such table");
    return sts.map((s) => ({ success: true, results: [{ sql: s.sql, batched: true }] }));
  } };
  return { db, calls };
}

test("reads issued together go as one batch; .first() gets the row, .all() the result; a write stays its own call", async () => {
  const { db, calls } = fakeDb(); const w = batchingDb(db);
  const [a, b, c, d] = await Promise.all([w.prepare("SELECT a").all(), w.prepare("SELECT b").bind(1).first(), w.prepare("INSERT INTO t").bind(2).run(), w.prepare("  with x as (select 1) select * from x").all()]);
  assert.deepEqual(calls, ["run INSERT INTO t", "batch SELECT a | SELECT b | with x as (select 1) select * from x".replace("with x", "  with x")]);
  assert.deepEqual(a, { success: true, results: [{ sql: "SELECT a", batched: true }] });
  assert.deepEqual(b, { sql: "SELECT b", batched: true });
  assert.deepEqual(c, { meta: { changes: 1 } });
  assert.equal(d.results[0].batched, true);
  assert.equal(batchingDb(db), w, "one wrapper per binding (memoEnsure / shareInflight key by it)");
});

test("a single read is sent on its own; a read issued after the batch left is a new batch", async () => {
  const { db, calls } = fakeDb(); const w = batchingDb(db);
  await w.prepare("SELECT only").first();
  assert.deepEqual(calls, ["first SELECT only"]);
  await Promise.all([w.prepare("SELECT 1").all(), w.prepare("SELECT 2").all()]);
  await Promise.all([w.prepare("SELECT 3").all(), w.prepare("SELECT 4").all()]);
  assert.deepEqual(calls.slice(1), ["batch SELECT 1 | SELECT 2", "batch SELECT 3 | SELECT 4"]);
});

test("a batch that throws, or answers without rows, falls back to each statement on its own — a caller's .catch sees its own error", async () => {
  for (const opts of [{ batchThrows: true }, { batchMeta: true }, { failOn: "bad" }]) {
    const { db, calls } = fakeDb(opts); const w = batchingDb(db);
    const [a, b] = await Promise.all([w.prepare("SELECT good").all(), w.prepare("SELECT bad").all().catch((e) => "caught " + e.message)]);
    assert.equal(calls[0].startsWith("batch "), true, JSON.stringify(opts));
    assert.deepEqual(calls.slice(1).sort(), ["all SELECT bad", "all SELECT good"], JSON.stringify(opts));
    assert.deepEqual(a, { results: [{ sql: "SELECT good", one: true }] });
    assert.equal(b, opts.failOn ? "caught no such table" : b);
  }
});

test("env.DB.batch() still takes the wrapped statements (they are unwrapped), and the fetch handler installs the layer", async () => {
  const { db, calls } = fakeDb(); const w = batchingDb(db);
  const st = w.prepare("INSERT INTO k VALUES (?)");
  await w.batch([st.bind(1), st.bind(2)]);
  assert.deepEqual(calls, ["batch INSERT INTO k VALUES (?) | INSERT INTO k VALUES (?)"]);
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /async fetch\(request, env, ctx\) \{\n[\s\S]{0,400}env = Object\.assign\(\{\}, env, \{ DB: batchingDb\(env\.DB\)(, MAILER: guardMailer\(env\.MAILER, env\.MAIL_ONLY_TO\))? \}\);/);
  const plain = { prepare() {} };
  assert.equal(batchingDb(plain), plain, "a binding without batch is handed back as it is");
});
