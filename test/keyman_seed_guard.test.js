// P3.13 audit H6 — the reseed landmine (verified read-only on prod 2026-09-04).
//
// keyman_contract3 on prod: 47 hand-cleaned rows, all seq=1, sign_on 2025-10..2026-06.
// The bundled KEYMAN_CONTRACTS: 209 rows, seq 1..9, 2022-era. The old ensureKeyman rule
// ("reseed on version mismatch" + prune rows not in the constant) would have replaced the
// 47 clean rows with 2022 legs on the next KEYMAN_VERSION bump — silently breaking sbm's
// manual invite (a 2022 sign-off), the crew card, the statement PDF and the days-worked
// export. The rule is now: the bundled constant seeds an EMPTY table only; a populated
// table refuses the reseed, re-pins the version and logs the refusal. Refresh goes through
// the Keyman import (CLAUDE.md §11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { KEYMAN_CONTRACTS } from "../src/keyman_data.js";

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__kc3guard_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { ensureKeymanImpl, KEYMAN_VERSION };\n", "utf-8");
let ensureKeymanImpl, KEYMAN_VERSION;
try {
  ({ ensureKeymanImpl, KEYMAN_VERSION } = await import(TMP.href));
} finally {
  unlinkSync(TMP);
}

// Recording D1 fake. `state.n` = rows in keyman_contract3, `state.version` = pinned version.
function fakeEnv(state) {
  const writes = [];   // every run()/batch() SQL, in order
  const batches = [];
  const DB = {
    prepare(sql) {
      const S = String(sql).replace(/\s+/g, " ").trim();
      const s = { sql: S, args: [] };
      s.bind = (...a) => ({ ...s, args: a }); // fresh statement per bind, like real D1
      s.run = async function () { writes.push(this); return { meta: { changes: (/INSERT INTO data_meta/.test(S) && state.pinChanges != null) ? state.pinChanges : 1 } }; };
      s.first = async () => {
        if (S.startsWith("SELECT COUNT(*) n FROM keyman_contract3")) return { n: state.n };
        if (S.startsWith("SELECT v FROM data_meta WHERE k='keyman_version'")) return state.version ? { v: state.version } : null;
        throw new Error("fake first: unhandled SQL: " + S);
      };
      s.all = async () => {
        if (S.startsWith("SELECT sc, seq FROM keyman_contract3")) { writes.push({ sql: "(read) " + S, args: [] }); return { results: state.rows || [] }; }
        throw new Error("fake all: unhandled SQL: " + S);
      };
      return s;
    },
    async batch(stmts) { batches.push(stmts); for (const st of stmts) writes.push(st); return stmts.map(() => ({ success: true })); },
  };
  return { env: { DB }, writes, batches };
}

const kc3Writes = (writes) => writes.filter((w) => /^(INSERT|DELETE|UPDATE)[^(]*keyman_contract3/i.test(w.sql));
const pin = (writes) => writes.find((w) => /INSERT INTO data_meta \(k,v\) VALUES \('keyman_version'/.test(w.sql));
const log = (writes) => writes.find((w) => /^INSERT INTO data_log/.test(w.sql));

test("populated table + stale version: REFUSES the bundled reseed, re-pins, logs the refusal", async () => {
  const { env, writes, batches } = fakeEnv({ n: 47, version: "some-older-version" });
  await ensureKeymanImpl(env);
  assert.equal(batches.length, 0, "no batch may touch keyman_contract3");
  assert.equal(kc3Writes(writes).length, 0, "no INSERT/DELETE/UPDATE on keyman_contract3");
  assert.ok(!writes.some((w) => /DELETE FROM keyman_contract3/.test(w.sql)), "the prune must be gone");
  const p = pin(writes);
  assert.ok(p, "version must be re-pinned so the check stops firing");
  assert.deepEqual(p.args, [KEYMAN_VERSION]);
  const l = log(writes);
  assert.ok(l, "the refusal must be visible in data_log");
  assert.equal(l.args[3], "reseed_refused_table_populated");
  assert.equal(l.args[2], 47, "logs the live row count, not the constant's");
});

test("populated table + matching version: no data writes at all (DDL guards only)", async () => {
  const { env, writes, batches } = fakeEnv({ n: 47, version: KEYMAN_VERSION });
  await ensureKeymanImpl(env);
  assert.equal(batches.length, 0);
  assert.equal(kc3Writes(writes).length, 0);
  assert.equal(pin(writes), undefined);
  assert.equal(log(writes), undefined);
  for (const w of writes) assert.match(w.sql, /^CREATE TABLE IF NOT EXISTS/, "unexpected write: " + w.sql);
});

test("empty table: seeds every bundled row and pins the version", async () => {
  const { env, writes, batches } = fakeEnv({ n: 0, version: null });
  await ensureKeymanImpl(env);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, KEYMAN_CONTRACTS.length);
  for (const st of batches[0]) {
    assert.match(st.sql, /^INSERT OR REPLACE INTO keyman_contract3/);
    assert.equal(st.args.length, 8, "8 columns, 8 binds");
  }
  assert.equal(batches[0][0].args[0], KEYMAN_CONTRACTS[0].sc, "each batch entry captures its OWN row");
  assert.equal(batches[0][batches[0].length - 1].args[0], KEYMAN_CONTRACTS[KEYMAN_CONTRACTS.length - 1].sc);
  assert.deepEqual(pin(writes).args, [KEYMAN_VERSION]);
  assert.equal(log(writes).args[3], "seeded");
});

test("stale version, but another isolate already re-pinned (pin changed 0 rows): no duplicate refusal row", async () => {
  const { env, writes } = fakeEnv({ n: 47, version: "some-older-version", pinChanges: 0 });
  await ensureKeymanImpl(env);
  assert.ok(pin(writes), "the conditional pin is still attempted");
  assert.match(pin(writes).sql, /WHERE data_meta\.v IS NOT excluded\.v/, "pin only when the stored version differs");
  assert.equal(log(writes), undefined, "no refusal row when this isolate's pin did not land");
});

test("empty table + empty bundled constant: nothing is seeded and NO refusal is logged", async () => {
  // The refusal branch is for a POPULATED table only; an empty one must not log 'table populated'.
  const src = readFileSync(SRC, "utf-8");
  const i = src.indexOf("async function ensureKeymanImpl(");
  const body = src.slice(i, src.indexOf("\nasync function ", i + 10));
  assert.match(body, /else if \(n > 0 && stale\)/, "refusal branch must require a populated table");
});

test("static: the reseed is gated on an EMPTY table, and the prune is gone", () => {
  const src = readFileSync(SRC, "utf-8");
  const i = src.indexOf("async function ensureKeymanImpl(");
  const body = src.slice(i, src.indexOf("\nasync function ", i + 10));
  assert.match(body, /if \(n === 0 && KEYMAN_CONTRACTS\.length\)/, "seed only when the table is empty");
  assert.doesNotMatch(body, /DELETE FROM keyman_contract3/, "a version bump must never prune live rows");
  assert.match(body, /reseed_refused_table_populated/);
});
