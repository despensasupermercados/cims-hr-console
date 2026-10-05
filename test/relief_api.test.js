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

// 5 Oct 2026 review: a MOVE (vessel_name changes on an existing projection) had none of the create
// path's checks, and a blank sign-on threw a 500 against the NOT NULL column.
import { saveReliefAssignment } from "../src/relief_api.js";
function moveEnv({ vesselId = "ves_icon", dup = null } = {}) {
  const writes = [];
  const mk = (sql, args = []) => ({
    sql, args, bind: (...a) => mk(sql, a),
    first: async () => (/FROM vessel WHERE name=/.test(sql) ? (vesselId ? { id: vesselId } : null) : /a2\.actual_sign_off IS NULL AND a2\.vessel_id/.test(sql) ? dup : null),
    all: async () => ({ results: [] }),
    run: async () => { writes.push({ sql, args }); return { success: true }; },
  });
  return { env: { DB: { prepare: (sql) => mk(sql), batch: async (sts) => { for (const s of sts) await s.run(); return sts.map(() => ({ success: true })); } } }, writes };
}
test("move: an unknown target hull is refused, a second open projection on the same hull is refused, a real move writes vessel_id too", async () => {
  const u = moveEnv({ vesselId: null });
  assert.deepEqual(await saveReliefAssignment(u.env, { id: "as_1", vessel_name: "Nowhere" }), { ok: false, error: "unknown_ship", ship: "Nowhere" });
  assert.equal(u.writes.length, 0);
  const d = moveEnv({ dup: { id: "as_other" } });
  assert.deepEqual(await saveReliefAssignment(d.env, { id: "as_1", vessel_name: "Icon" }), { ok: false, error: "already_projected", id: "as_other" });
  assert.equal(d.writes.length, 0);
  const ok = moveEnv({});
  const r = await saveReliefAssignment(ok.env, { id: "as_1", vessel_name: "Icon" });
  assert.equal(r.ok, true);
  assert.match(ok.writes[0].sql, /UPDATE assignment SET vessel_name=\?, vessel_id=\?, updated_at=\? WHERE id=\?/);
});
test("sign_on: blank on insert defaults to today (no 500); clearing it on update is refused with a reason", async () => {
  const ins = moveEnv({});
  const r = await saveReliefAssignment(ins.env, { crew_id: "c1", role: "reliever", vessel_name: "Icon", sign_on: null });
  assert.equal(r.ok, true);
  const w = ins.writes.find((x) => /INSERT INTO assignment/.test(x.sql));
  const cols = w.sql.match(/INSERT INTO assignment \(([^)]*)\)/)[1].split(",");
  assert.match(w.args[cols.indexOf("sign_on")], /^\d{4}-\d{2}-\d{2}$/);
  const upd = moveEnv({});
  assert.deepEqual(await saveReliefAssignment(upd.env, { id: "as_1", sign_on: "" }), { ok: false, error: "sign_on_required" });
});
