// The Contract Counter APPLY path (apiKeymanImport), pinned after the 14 Sep 2026 review:
//
//   1. A crew's DELETE and INSERTs travel in the SAME D1 batch (one transaction). The previous shape
//      — one batch of every DELETE, then INSERTs in chunks of 80 — could leave matched crew with NO
//      contract rows if a later chunk failed. Money-adjacent (rank, Score Card, days-worked export).
//   2. The dry-run FLAGS crew whose row count would drop (the 6 Jul 2026 upload replaced 48 crew's
//      multi-contract history with one row each, unannounced — data_log 2026-07-06 16:45).
//   3. Unmatched crew never produce a write; matched crew are refreshed from the file only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__kc3apply_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { apiKeymanImport, KEYMAN_VERSION };\n", "utf-8");
let apiKeymanImport, KEYMAN_VERSION;
try { ({ apiKeymanImport, KEYMAN_VERSION } = await import(TMP.href)); } finally { unlinkSync(TMP); }

// Recording D1 fake. state.counts = { sc: rows today }, state.roster = crew rows.
function fakeEnv(state) {
  const writes = [], batches = [];
  const DB = {
    prepare(sql) {
      const S = String(sql).replace(/\s+/g, " ").trim();
      const s = { sql: S, args: [] };
      s.bind = (...a) => ({ ...s, args: a });
      s.run = async function () { writes.push(this); return { meta: { changes: 1 } }; };
      s.first = async () => {
        if (S.startsWith("SELECT COUNT(*) n FROM keyman_contract3")) return { n: Object.values(state.counts).reduce((a, b) => a + b, 0) };
        if (S.startsWith("SELECT v FROM data_meta")) return { v: KEYMAN_VERSION }; // populated + current: the seed guard stays silent
        throw new Error("fake first: unhandled SQL: " + S);
      };
      s.all = async () => {
        if (S.startsWith("SELECT agency_id, first_name, last_name, ship_crew_id FROM crew")) return { results: state.roster };
        if (S.startsWith("SELECT sc, COUNT(*) n FROM keyman_contract3 GROUP BY sc")) return { results: Object.entries(state.counts).map(([sc, n]) => ({ sc, n })) };
        throw new Error("fake all: unhandled SQL: " + S);
      };
      return s;
    },
    async batch(stmts) {
      batches.push(stmts);
      for (const st of stmts) writes.push(st);
      if (state.failBatch != null && batches.length === state.failBatch) throw new Error("simulated D1 failure");
      return stmts.map(() => ({ success: true }));
    },
  };
  return { env: { DB }, writes, batches };
}
const req = (body) => ({ json: async () => body });
const session = { email: "miguel.sanmartin@dg3.com" };

// Three crew on the roster; the sheet carries A (3 contracts), B (1 contract), and a stranger.
const ROSTER = [
  { agency_id: "SC-A", last_name: "Alpha", first_name: "Ana", ship_crew_id: "100001" },
  { agency_id: "SC-B", last_name: "Bravo", first_name: "Ben", ship_crew_id: "100002" },
  { agency_id: "SC-C", last_name: "Charlie", first_name: "Cy", ship_crew_id: "100003" },
];
const SHEET = [
  ["Company", "Ship", "Status", "Ships's Crew ID", "Last Name", "Name", "Sign on", "Projected sign off", "Ttl months", "Sign on", "Projected sign off", "Ttl months", "Sign on", "Projected sign off", "Ttl months"],
  ["RCCL", "Icon", "Onboard", "100001", "Alpha", "Ana", "2024-01-01", "2024-07-01", "6", "2025-01-01", "2025-07-01", "6", "2026-01-01", "2026-07-01", "6"],
  ["RCCL", "Oasis", "Onboard", "100002", "Bravo", "Ben", "2026-03-01", "2026-09-01", "6", "", "", "", "", "", ""],
  ["RCCL", "Wonder", "Vacation", "999999", "Stranger", "Sam", "2026-02-01", "2026-08-01", "6", "", "", "", "", "", ""],
];

test("dry-run flags the crew whose contract rows would DROP, and writes nothing", async () => {
  const { env, writes, batches } = fakeEnv({ counts: { "SC-A": 1, "SC-B": 4, "SC-C": 2 }, roster: ROSTER });
  const r = await (await apiKeymanImport(req({ rows: SHEET, dryRun: true }), env, session)).json();
  assert.equal(r.dryRun, true);
  assert.equal(r.matched, 2);
  assert.equal(r.unmatched, 1);
  assert.equal(r.contracts, 4);
  assert.equal(r.currentRows, 7);
  assert.deepEqual(r.shrink, [{ sc: "SC-B", before: 4, after: 1, name: "Bravo, Ben" }], "B goes 4 -> 1; A grows 1 -> 3; C is not in the file");
  assert.equal(batches.length, 0);
  assert.ok(!writes.some((w) => /^(INSERT|DELETE|UPDATE)/.test(w.sql)), "dry-run must not write");
});

test("apply: every crew's DELETE and INSERTs are in ONE batch, DELETE first; unmatched crew never written; log says who shrank", async () => {
  const { env, writes, batches } = fakeEnv({ counts: { "SC-A": 1, "SC-B": 4, "SC-C": 2 }, roster: ROSTER });
  const r = await (await apiKeymanImport(req({ rows: SHEET }), env, session)).json();
  assert.equal(r.ok, true);
  assert.equal(r.applied, 4);
  assert.equal(r.crew, 2);
  assert.equal(r.shrank, 1);
  const kc3 = batches.filter((b) => b.some((st) => /keyman_contract3/.test(st.sql)));
  assert.ok(kc3.length >= 1);
  for (const b of kc3) {
    const bySc = {};
    for (const st of b) {
      const sc = /^DELETE/.test(st.sql) ? st.args[0] : st.args[0];
      (bySc[sc] = bySc[sc] || []).push(/^DELETE/.test(st.sql) ? "D" : "I");
    }
    for (const sc in bySc) {
      assert.equal(bySc[sc][0], "D", sc + ": the DELETE must be in the same batch as the INSERTs, and first");
      assert.ok(bySc[sc].slice(1).every((x) => x === "I"), sc + ": exactly one DELETE, then INSERTs");
    }
  }
  // The old shape — a batch made only of DELETEs — must be gone.
  assert.ok(!kc3.some((b) => b.every((st) => /^DELETE/.test(st.sql))), "no DELETE-only batch");
  const dels = writes.filter((w) => /^DELETE FROM keyman_contract3/.test(w.sql)).map((w) => w.args[0]).sort();
  assert.deepEqual(dels, ["SC-A", "SC-B"], "matched crew only — SC-C (not in file) and the stranger are untouched");
  const ins = writes.filter((w) => /^INSERT OR REPLACE INTO keyman_contract3/.test(w.sql));
  assert.equal(ins.length, 4);
  assert.ok(ins.every((w) => w.args[0] !== "SC-C"));
  assert.deepEqual(ins.filter((w) => w.args[0] === "SC-A").map((w) => w.args[4]), [1, 2, 3], "A's three contracts, seq 1..3");
  const log = writes.find((w) => /^INSERT INTO data_log/.test(w.sql));
  assert.ok(log);
  assert.equal(log.args[2], 4);
  assert.match(log.args[3], /refreshed 2 crew, 1 with fewer contracts than before/);
  assert.ok(writes.some((w) => /INSERT INTO data_meta \(k,v\) VALUES \('keyman_version'/.test(w.sql)), "re-pins the version");
});

test("apply: a D1 failure on the first batch leaves NO crew emptied (no DELETE was ever committed without its INSERTs)", async () => {
  // Cap is 80 statements; A(4)+B(2) fit in one batch, so the failing batch is the only kc3 batch.
  const { env, writes, batches } = fakeEnv({ counts: { "SC-A": 1, "SC-B": 4 }, roster: ROSTER, failBatch: 1 });
  await assert.rejects(() => apiKeymanImport(req({ rows: SHEET }), env, session), /simulated D1 failure/);
  const failed = batches[0];
  const dels = failed.filter((st) => /^DELETE/.test(st.sql)).map((st) => st.args[0]);
  const insSc = new Set(failed.filter((st) => /^INSERT OR REPLACE INTO keyman_contract3/.test(st.sql)).map((st) => st.args[0]));
  for (const sc of dels) assert.ok(insSc.has(sc), sc + ": its INSERTs were in the same (rolled-back) batch");
  assert.ok(!writes.some((w) => /^INSERT INTO data_log/.test(w.sql)), "nothing logged as refreshed");
});
