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
