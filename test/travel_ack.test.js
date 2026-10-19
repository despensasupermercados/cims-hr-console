// NEEDS A DECISION · ACKNOWLEDGE (Miguel, 19 Oct 2026, on the Travel tab: "once acknowledge ?? the comments u made .. they
// should disappear"). The server half, on real SQLite: an acknowledgement is one shared row keyed by the fact AND its figure,
// Undo deletes it, both are audited, and /api/travel hands the list to every viewer. The page half is in
// test/travel_filters.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }
const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
const TMP = new URL(`../src/__tvack_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, SRC + "\nexport { apiTravelAck };\n", "utf-8");
let W;
try { W = await import(TMP.href); } finally { unlinkSync(TMP); }

function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
}
const req = (b) => ({ json: async () => b });

test("Acknowledge writes one shared row, Undo removes it, both are in the activity log", async () => {
  assert.ok(DatabaseSync, "node:sqlite");
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE activity_log (id TEXT PRIMARY KEY, at TEXT, user_id TEXT, action TEXT, detail TEXT);");
  const env = envFor(d), rita = { email: "rita@dg3.com" };
  let r = await (await W.apiTravelAck(req({ key: "over:2026-8:15655", label: "Aug ran $655 over the $15,000 budget" }), env, rita)).json();
  assert.equal(r.ok, true);
  assert.deepEqual(r.acks.map((a) => [a.key, a.ack_by]), [["over:2026-8:15655", "rita@dg3.com"]]);
  // the same key twice stays one row
  await W.apiTravelAck(req({ key: "over:2026-8:15655", label: "again" }), env, { email: "sanmartin@sudespensa.cl" });
  assert.equal(d.prepare("SELECT COUNT(*) n FROM travel_ack").get().n, 1);
  r = await (await W.apiTravelAck(req({ key: "over:2026-8:15655", undo: true }), env, rita)).json();
  assert.equal(r.acks.length, 0, "Undo brings the row back to Needs a decision");
  const log = d.prepare("SELECT action FROM activity_log ORDER BY rowid").all().map((x) => x.action);
  assert.deepEqual(log, ["travel_ack", "travel_ack", "travel_ack_undo"]);
  // no key, nothing written
  const bad = await W.apiTravelAck(req({ label: "x" }), env, rita);
  assert.equal(bad.status, 400);
});

test("/api/travel carries the acknowledgements in its one wave, and the route sits inside the error boundary", () => {
  const i = SRC.indexOf("async function apiTravel(env, url)"), body = SRC.slice(i, SRC.indexOf("\n}\n", i));
  assert.match(body, /SELECT key, label, ack_by, ack_at FROM travel_ack ORDER BY ack_at DESC"\)\.all\(\)\.catch/, "read in the same Promise.all (§12)");
  assert.match(body, /acks: ackRes\.results \|\| \[\]/);
  const wrap = SRC.indexOf("const res = await (async () => {"), route = SRC.indexOf('p === "/api/travel/ack"');
  assert.ok(wrap > 0 && route > wrap, "the ack route is inside the wrapper (§11)");
});
