import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRelief } from "../src/relief_api.js";

// Minimal env.DB stub: config row + empty port-days + empty assignments.
const envStub = {
  DB: {
    prepare(sql) {
      return {
        first: async () => (/relief_window_config/.test(sql) ? { critical_days: 14, due_days: 30 } : null),
        all: async () => ({ results: [] }),
        bind: () => ({ run: async () => {}, first: async () => null, all: async () => ({ results: [] }) }),
      };
    },
  },
};

test("non-relief path -> null (not our route)", async () => {
  const r = await handleRelief({ method: "GET" }, new URL("https://x/api/other"), envStub);
  assert.equal(r, null);
});

test("GET /api/relief/board -> 200 with empty board", async () => {
  const r = await handleRelief({ method: "GET" }, new URL("https://x/api/relief/board"), envStub);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(Array.isArray(body.board));
  assert.equal(body.count, 0);
  assert.deepEqual(body.config, { critical_days: 14, due_days: 30 });
});

test("POST /api/relief/save with bad JSON -> 400", async () => {
  const req = { method: "POST", json: async () => { throw new Error("bad"); } };
  const r = await handleRelief(req, new URL("https://x/api/relief/save"), envStub);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "bad_json");
});

test("POST save rejects a derived-city write -> 400 (§6 guard end-to-end)", async () => {
  const req = { method: "POST", json: async () => ({ on_city: "HACK", role: "printer" }) };
  const r = await handleRelief(req, new URL("https://x/api/relief/save"), envStub);
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.ok, false);
  assert.ok(body.rejected.includes("on_city"));
});

// ---- vpd-load: values are BOUND, never concatenated into the SQL -------------------
// 2026-09-10. This endpoint used to assemble one giant INSERT as text, quoting each value with a
// hand-rolled esc() that doubled single quotes. That escaping was correct for SQLite (there is no
// backslash escape, so '' is the only way out of a literal) and it was probed with injection
// attempts before being replaced — it was NOT a live hole. It was replaced because it was
// unbounded and fragile: nothing capped rows server-side, and one edit that forgot esc() would
// have turned it into injection with no test to catch it. These pin the replacement.

function recordingEnv() {
  const calls = [];        // every prepare(sql) -> bind(...args)
  const batches = [];      // every env.DB.batch([...])
  const mk = (sql) => ({
    sql,
    first: async () => (/relief_window_config/.test(sql) ? { critical_days: 14, due_days: 30 } : null),
    all: async () => ({ results: [] }),
    bind: (...args) => { const s = { sql, args, run: async () => {}, first: async () => null, all: async () => ({ results: [] }) }; calls.push(s); return s; },
    run: async () => {},
  });
  return { calls, batches, DB: { prepare: mk, batch: async (stmts) => { batches.push(stmts); } } };
}

const vpdReq = (body) => ({ method: "POST", json: async () => body });
const ROW = (port) => ["Celebrity", "Reflection", "2026-10-01", 1, port, "0", "1"];

test("vpd-load binds every value — the port name never appears in the SQL text", async () => {
  const env = recordingEnv();
  const nasty = "Miami'); DROP TABLE crew; --";
  const r = await handleRelief(vpdReq({ rows: [ROW(nasty)], asof: "2026-10-01" }), new URL("https://x/api/relief/vpd-load"), env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).inserted, 1);

  assert.equal(env.batches.length, 1, "one batch = one D1 round trip (§12)");
  const stmt = env.batches[0][0];
  assert.ok(!stmt.sql.includes("Miami"), "the port name must NOT be in the SQL string; it is a bind");
  assert.ok(!stmt.sql.includes("DROP"), "no attacker text may reach the SQL string at all");
  assert.match(stmt.sql, /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?\)/, "row must be all placeholders");
  assert.ok(stmt.args.includes(nasty), "the value travels as a bound parameter, byte-for-byte");
});

test("vpd-load refuses an oversized payload instead of building a giant statement", async () => {
  const env = recordingEnv();
  const rows = new Array(2001).fill(ROW("Miami"));
  const r = await handleRelief(vpdReq({ rows }), new URL("https://x/api/relief/vpd-load"), env);
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error, "too_many_rows");
  assert.equal(env.batches.length, 0, "nothing may be written when the payload is refused");
});

test("vpd-load rejects a non-array rows payload rather than throwing", async () => {
  const env = recordingEnv();
  const r = await handleRelief(vpdReq({ rows: { evil: true } }), new URL("https://x/api/relief/vpd-load"), env);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "rows_must_be_array");
});

test("vpd-load still drops rows failing the brand/date whitelists", async () => {
  const env = recordingEnv();
  const r = await handleRelief(vpdReq({ rows: [
    ["NotABrand", "Reflection", "2026-10-01", 1, "Miami", "0", "1"],  // brand not whitelisted
    ["Celebrity", "Reflection", "01/10/2026", 1, "Miami", "0", "1"],  // date not ISO
    ROW("Miami"),                                                      // good
  ] }), new URL("https://x/api/relief/vpd-load"), env);
  const body = await r.json();
  assert.equal(body.inserted, 1);
  assert.equal(body.skipped, 2);
});
