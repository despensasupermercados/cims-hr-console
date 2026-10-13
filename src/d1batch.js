// d1batch.js — ONE trip for a wave of reads (13 Oct 2026, Miguel: "going from tab to tab takes a lot").
//
// perf_log, his own clicks at 22:04: Crew 1.28s, Contracts 1.29s, Dashboard 1.31s, Keyman 1.36s — and the Dashboard on a
// WARM isolate (no guard work) 866ms for 22 statements. Fired together with Promise.all they still cost ~40ms EACH:
// D1 serialises them and every one is its own network trip. That is the floor no amount of trimming reaches.
//
// This layer sits under env.DB. Reads a wave issues in the same turn (a Promise.all, and the memoized awaits that
// resolve before the event loop turns) are collected and sent as ONE env.DB.batch(): one trip, the statements executed
// back to back inside D1. Each caller's promise settles with exactly what its own .all() / .first() would have
// returned. Writes are never grouped (a batch is a transaction; an independent write stays independent). If the batch
// fails for ANY reason, every statement in it is re-run on its own, so a caller's .catch sees the same error it
// always did — the fallback IS today's code path. The wrapper is one per database binding, so memoEnsure and
// shareInflight (keyed by env.DB) keep working.
const _wrapped = new WeakMap();
const isRead = (sql) => /^\s*(SELECT|WITH)\b/i.test(String(sql || ""));
export function batchingDb(db) {
  if (!db || typeof db.batch !== "function" || typeof db.prepare !== "function") return db;
  const hit = _wrapped.get(db);
  if (hit) return hit;
  let queue = null;
  const one = (it) => (it.kind === "first" ? it.stmt.first() : it.stmt.all()).then(it.resolve, it.reject);
  const flush = async () => {
    const q = queue; queue = null;
    if (!q || !q.length) return;
    if (q.length === 1) return one(q[0]); // nothing to gain from a batch of one
    let res;
    try { res = await db.batch(q.map((it) => it.stmt)); }
    catch { for (const it of q) one(it); return; } // the batch failed as a whole: each on its own, as before
    // Anything short of a full, well-formed answer — one result per statement, each with its rows — is not trusted:
    // every statement runs on its own instead (a test double's batch that returns only meta lands here, by design).
    if (!Array.isArray(res) || res.length !== q.length || !res.every((r) => r && r.success !== false && Array.isArray(r.results))) { for (const it of q) one(it); return; }
    q.forEach((it, i) => { const r = res[i]; it.resolve(it.kind === "first" ? ((r && r.results && r.results[0]) ?? null) : r); });
  };
  const enqueue = (stmt, kind) => new Promise((resolve, reject) => {
    if (!queue) { queue = []; setTimeout(flush, 0); } // after the microtasks of this turn, so a memoized await's reads join
    queue.push({ stmt, kind, resolve, reject });
  });
  const wrapStmt = (stmt, sql) => ({
    __raw: stmt,
    bind: (...a) => wrapStmt(stmt.bind(...a), sql),
    all: () => (isRead(sql) ? enqueue(stmt, "all") : stmt.all()),
    first: (...a) => (isRead(sql) && !a.length ? enqueue(stmt, "first") : stmt.first(...a)),
    run: (...a) => stmt.run(...a),
    raw: (...a) => stmt.raw(...a),
  });
  const unwrap = (s) => (s && s.__raw) || s;
  const w = {
    prepare: (sql) => wrapStmt(db.prepare(sql), sql),
    batch: (stmts) => db.batch((stmts || []).map(unwrap)),
    exec: (...a) => db.exec(...a),
    dump: (...a) => db.dump(...a),
    withSession: (...a) => db.withSession(...a),
  };
  _wrapped.set(db, w);
  return w;
}
