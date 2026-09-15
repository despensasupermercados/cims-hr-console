// The Contract Counter APPLY path (apiKeymanImport), pinned after the 14 Sep 2026 review:
//
//   1. A crew's DELETE and INSERTs travel in the SAME D1 batch (one transaction). The previous shape
//      — one batch of every DELETE, then INSERTs in chunks of 80 — could leave matched crew with NO
//      contract rows if a later chunk failed. Money-adjacent (rank, Score Card, days-worked export).
//   2. The dry-run FLAGS crew whose row count would drop (the 6 Jul 2026 upload replaced 48 crew's
//      multi-contract history with one row each, unannounced — data_log 2026-07-06 16:45).
//   3. Unmatched crew never produce a write; matched crew are refreshed from the file only.
//   4. The dry-run says what the file would do to the board Rita has been working on, and Apply
//      retires only the projections the file AGREES with (Miguel, 14 Sep 2026: "the loop closes when
//      u see it back in the keyman tab from the upload"). A contradiction is never applied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__kc3apply_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { apiKeymanImport, KEYMAN_VERSION };\n", "utf-8");
let apiKeymanImport, KEYMAN_VERSION;
try { ({ apiKeymanImport, KEYMAN_VERSION } = await import(TMP.href)); } finally { unlinkSync(TMP); }

// Recording D1 fake. state.counts = { sc: rows today }, state.roster = crew rows,
// state.current = the crew's Counter legs today, state.yellows = open assignments, state.edits.
function fakeEnv(state) {
  const writes = [], batches = [];
  const DB = {
    prepare(sql) {
      const S = String(sql).replace(/\s+/g, " ").trim();
      const s = { sql: S, args: [] };
      s.bind = (...a) => ({ ...s, args: a });
      s.run = async function () {
        // D1 accepts ADD COLUMN once; after that it throws. Modelling that is what keeps the
        // one-shot on_key backfill from looking like a per-request write.
        if (/^ALTER TABLE/.test(S)) {
          if (state._altered && state._altered[S]) throw new Error("duplicate column name");
          (state._altered = state._altered || {})[S] = true;
        }
        writes.push(this);
        return { meta: { changes: 1 } };
      };
      s.first = async () => {
        if (S.startsWith("SELECT COUNT(*) n FROM keyman_contract3")) return { n: Object.values(state.counts).reduce((a, b) => a + b, 0) };
        if (S.startsWith("SELECT v FROM data_meta")) return { v: KEYMAN_VERSION }; // populated + current: the seed guard stays silent
        throw new Error("fake first: unhandled SQL: " + S);
      };
      s.all = async () => {
        if (S.startsWith("SELECT agency_id, first_name, last_name, ship_crew_id FROM crew")) return { results: state.roster };
        if (S.startsWith("SELECT sc, COUNT(*) n FROM keyman_contract3 GROUP BY sc")) return { results: Object.entries(state.counts).map(([sc, n]) => ({ sc, n })) };
        if (S.startsWith("SELECT sc, ship, sign_on, proj_off, act_off, seq FROM keyman_contract3")) return { results: state.current || [] };
        if (/FROM assignment a/.test(S)) return { results: state.yellows || [] };
        if (S.startsWith("SELECT sc, seq, sign_on, sign_off, ship, updated_at, on_key FROM contract_edit")) return { results: state.edits || [] };
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
// A DATA write: a statement whose TARGET is one of the tables the import owns. The one-shot
// on_key schema backfill names keyman_contract3 in a subquery but writes contract_edit, so it is
// matched on the target, not on any mention.
const dataWrites = (writes) => writes.filter((w) =>
  /^(INSERT (OR REPLACE )?INTO|DELETE FROM|UPDATE)\s+(keyman_contract3|assignment|data_log|data_meta)\b/.test(w.sql));
// removeReliefAssignment runs against the same fake; it reads the assignment then batches DELETEs.
const withRemoval = (env, state) => {
  const inner = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    const S = String(sql).replace(/\s+/g, " ").trim();
    const st = inner(sql);
    if (S.startsWith("SELECT id, contract_id FROM assignment WHERE id=?")) {
      st.bind = (...a) => ({ ...st, args: a, first: async () => ((state.yellows || []).some((y) => y.id === a[0]) ? { id: a[0], contract_id: "k_" + a[0] } : null) });
    } else if (S.startsWith("SELECT 1 x FROM bonus_outcome")) {
      st.bind = (...a) => ({ ...st, args: a, first: async () => null });
    } else if (/SELECT \(SELECT COUNT\(\*\) FROM assignment WHERE contract_id/.test(S)) {
      st.bind = (...a) => ({ ...st, args: a, first: async () => ({ n: 0 }) });
    }
    return st;
  };
  return env;
};
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
  assert.deepEqual(dataWrites(writes), [], "dry-run must not touch the Counter, the projections or the log");
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


/* ---- the loop: what a Counter upload does to the board Rita has been working on ---- */

// Both crew MOVE in this file: Ana from a 2023 Icon contract to a 2024 one, Ben from a 2025 Oasis
// contract to a 2026 one. (A Counter that has not moved for a crew says nothing about their next
// projection — review, 14 Sep 2026 — so a fixture with an unchanged row would test nothing.)
const CUR = [
  { sc: "SC-A", ship: "Icon", sign_on: "2023-01-01", proj_off: "2023-07-01", act_off: null, seq: 1 },
  { sc: "SC-B", ship: "Oasis", sign_on: "2025-09-01", proj_off: "2026-02-28", act_off: null, seq: 1 },
];

test("dry-run: the file's effect on the board is spelled out — appears, moved, absorbs, conflicts, overrides", async () => {
  const state = {
    counts: { "SC-A": 1, "SC-B": 1 }, roster: ROSTER, current: CUR,
    yellows: [
      // Ana's projection: Icon, three days off what the file says -> ABSORBED, the loop closes.
      { id: "as_absorb", sc: "SC-A", crew_name: "Ana Alpha", ship: "Icon", sign_on: "2026-01-04", planned_sign_off: "2026-07-04" },
      // Ben's projection: the file puts him on Oasis, Rita has him on Jewel -> CONFLICT, Rita decides.
      { id: "as_conflict", sc: "SC-B", crew_name: "Ben Bravo", ship: "Jewel", sign_on: "2026-03-01", planned_sign_off: "2026-09-01" },
    ],
    edits: [{ sc: "SC-A", seq: 1, on_key: "2026-01-01", sign_off: "2026-08-15", updated_at: "2026-09-12T08:00:00Z" }],
  };
  const { env, writes } = fakeEnv(state);
  const r = await (await apiKeymanImport(req({ rows: SHEET, dryRun: true }), env, session)).json();
  assert.deepEqual(r.absorbs.map((x) => x.id), ["as_absorb"]);
  assert.equal(r.absorbs[0].gap_days, -3);
  assert.deepEqual(r.conflicts.map((x) => [x.id, x.why]), [["as_conflict", "ship"]]);
  assert.deepEqual(r.moved.map((x) => x.sc), ["SC-A", "SC-B"], "both crew get a new contract in this file");
  assert.equal(r.overrides.length, 1, "Rita's 15 Aug sign-off would be replaced by the file's 1 Jul");
  assert.equal(r.overrides[0].rita.sign_off, "2026-08-15");
  assert.equal(r.overrides[0].counter.sign_off, "2026-07-01");
  assert.ok(r.absorbs[0].name, "every row carries a name Rita can read");
  assert.deepEqual(dataWrites(writes), [], "dry-run must not touch the Counter, the projections or the log");
});

test("apply: the absorbed projection is retired, the contradicted one is left standing", async () => {
  const state = {
    counts: { "SC-A": 1, "SC-B": 1 }, roster: ROSTER, current: CUR,
    yellows: [
      { id: "as_absorb", sc: "SC-A", crew_name: "Ana Alpha", ship: "Icon", sign_on: "2026-01-04", planned_sign_off: "2026-07-04" },
      { id: "as_conflict", sc: "SC-B", crew_name: "Ben Bravo", ship: "Jewel", sign_on: "2026-03-01", planned_sign_off: "2026-09-01" },
    ],
    edits: [],
  };
  const { env, writes } = fakeEnv(state);
  const r = await (await apiKeymanImport(req({ rows: SHEET }), withRemoval(env, state), session)).json();
  assert.deepEqual(r.absorbed.map((x) => [x.id, x.ok]), [["as_absorb", true]]);
  assert.deepEqual(r.conflicts.map((x) => x.id), ["as_conflict"]);
  const deleted = writes.filter((w) => /^DELETE FROM assignment WHERE id=\?/.test(w.sql)).map((w) => w.args[0]);
  assert.deepEqual(deleted, ["as_absorb"], "only the projection the file AGREES with is retired");
  const log = writes.find((w) => /^INSERT INTO data_log/.test(w.sql));
  assert.match(log.args[3], /1 projection absorbed/);
  assert.match(log.args[3], /1 conflicting projection left for review/);
});

test("apply: absorb:false retires nothing — the caller can always keep every card", async () => {
  const state = {
    counts: { "SC-A": 1 }, roster: ROSTER, current: CUR,
    yellows: [{ id: "as_absorb", sc: "SC-A", crew_name: "Ana Alpha", ship: "Icon", sign_on: "2026-01-04", planned_sign_off: "2026-07-04" }],
    edits: [],
  };
  const { env, writes } = fakeEnv(state);
  const r = await (await apiKeymanImport(req({ rows: SHEET, absorb: false }), withRemoval(env, state), session)).json();
  assert.deepEqual(r.absorbed, []);
  assert.ok(!writes.some((w) => /^DELETE FROM assignment/.test(w.sql)));
});

test("apply stamps imported_at on every row — the clock behind 'the newer write wins'", async () => {
  // A POPULATED table, so the bundled 8-column seed never runs and every INSERT below is the import's.
  const { env, writes } = fakeEnv({ counts: { "SC-A": 1 }, roster: ROSTER, current: [], yellows: [], edits: [] });
  await apiKeymanImport(req({ rows: SHEET }), env, session);
  const ins = writes.filter((w) => /^INSERT OR REPLACE INTO keyman_contract3/.test(w.sql));
  assert.ok(ins.length > 0);
  for (const w of ins) {
    assert.equal(w.args.length, 9, "8 columns + imported_at");
    assert.match(String(w.args[8]), /^\d{4}-\d{2}-\d{2}T/, "imported_at must be a timestamp");
  }
  assert.equal(new Set(ins.map((w) => w.args[8])).size, 1, "one stamp for the whole upload");
});

// 15 Sep 2026: contradicted projections are settled PER ROW. Only ids the dry-run itself reported as
// conflicts are honoured; anything else in dropConflicts is ignored, never removed.
test("apply: dropConflicts retires the ticked contradicted projection; an id that is not a conflict is ignored", async () => {
  const state = {
    counts: { "SC-A": 1, "SC-B": 1 }, roster: ROSTER, current: CUR,
    yellows: [
      { id: "as_absorb", sc: "SC-A", crew_name: "Ana Alpha", ship: "Icon", sign_on: "2026-01-04", planned_sign_off: "2026-07-04" },
      { id: "as_conflict", sc: "SC-B", crew_name: "Ben Bravo", ship: "Jewel", sign_on: "2026-03-01", planned_sign_off: "2026-09-01" },
    ],
    edits: [],
  };
  const { env, writes } = fakeEnv(state);
  const r = await (await apiKeymanImport(req({ rows: SHEET, absorb: false, dropConflicts: ["as_conflict", "as_absorb", "as_somebody_else"] }), withRemoval(env, state), session)).json();
  assert.deepEqual(r.dropped.map((x) => [x.id, x.ok]), [["as_conflict", true]], "only the conflict row is honoured");
  assert.deepEqual(r.conflicts, [], "a settled conflict is no longer reported as left");
  const deleted = writes.filter((w) => /^DELETE FROM assignment WHERE id=\?/.test(w.sql)).map((w) => w.args[0]);
  assert.deepEqual(deleted, ["as_conflict"], "absorb:false kept the absorbable card; the stranger id never reached the DB");
  const log = writes.find((w) => /^INSERT INTO data_log/.test(w.sql));
  assert.match(log.args[3], /1 contradicted projection replaced by the file/);
  assert.doesNotMatch(log.args[3], /left for review/);
});

test("apply without dropConflicts: the contradicted projection stays and is still reported (the 14 Sep default)", async () => {
  const state = {
    counts: { "SC-B": 1 }, roster: ROSTER, current: CUR,
    yellows: [{ id: "as_conflict", sc: "SC-B", crew_name: "Ben Bravo", ship: "Jewel", sign_on: "2026-03-01", planned_sign_off: "2026-09-01" }],
    edits: [],
  };
  const { env, writes } = fakeEnv(state);
  const r = await (await apiKeymanImport(req({ rows: SHEET }), withRemoval(env, state), session)).json();
  assert.deepEqual(r.dropped, []);
  assert.deepEqual(r.conflicts.map((x) => x.id), ["as_conflict"]);
  assert.ok(!writes.some((w) => /^DELETE FROM assignment/.test(w.sql)));
});
