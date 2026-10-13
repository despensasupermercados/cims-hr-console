// inflight.js (13 Oct 2026): a read in flight is shared with a concurrent caller and forgotten the moment it settles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shareInflight } from "../src/inflight.js";

test("two concurrent callers run the read once; a caller after it settled runs it again; a failure is not kept", async () => {
  const db = {}; let runs = 0; let release;
  const fn = () => new Promise((r) => { runs++; release = () => r({ n: runs }); });
  const a = shareInflight(db, "k", fn), b = shareInflight(db, "k", fn);
  assert.equal(runs, 1, "the second caller joined the first read");
  release(); assert.deepEqual(await a, { n: 1 }); assert.deepEqual(await b, { n: 1 });
  const c = shareInflight(db, "k", fn); assert.equal(runs, 2, "after it settled, a new caller reads again"); release(); await c;
  let fails = 0; const bad = () => { fails++; return Promise.reject(new Error("boom")); };
  await assert.rejects(shareInflight(db, "x", bad)); await assert.rejects(shareInflight(db, "x", bad));
  assert.equal(fails, 2, "a failed read is never handed to a later caller");
  assert.notEqual(shareInflight({}, "k", fn), shareInflight({}, "k", fn), "keyed by the database binding, never across bindings");
});

test("the board schedule and the port days are shared in flight, and every caller gets its own copies", () => {
  const S = readFileSync(new URL("../src/ship_leg_source.js", import.meta.url), "utf8");
  assert.match(S, /const shared = await shareInflight\(env\.DB, "boardLegs\|" \+ today, \(\) => boardLegsFromDbUncached\(env, today\)\);\n  const out = shared\.map\(\(l\) => \(\{ \.\.\.l \}\)\);/);
  assert.match(S, /shareInflight\(env\.DB, "board_source"/);
  const P = readFileSync(new URL("../src/port_days.js", import.meta.url), "utf8");
  assert.match(P, /const rows = await shareInflight\(env\.DB, "board_port_days", \(\) => fetchBoardPortDaysUncached\(env\)\);\n  return rows\.map\(\(r\) => \(\{ \.\.\.r \}\)\);/);
});
