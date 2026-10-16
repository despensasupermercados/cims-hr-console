// ONE schema guard per database per isolate (16 Oct 2026). worker.js memoizes its own ensure* guards (memoEnsure, which
// also remembers them in data_meta); the modules it installs — sbm.js, seval.js, signoff_ack.js, signoff_instructions.js —
// ran their CREATE TABLEs on every request that reached them (§12: never raw DDL per request). This is the plain
// per-isolate memo those closures can use: keyed by env.DB, a failed guard is forgotten so the next request tries again.
export function memoDdl(fn) {
  const memo = new WeakMap();
  return (env) => {
    const key = env && env.DB;
    if (!key || typeof key !== "object") return fn(env);
    let pr = memo.get(key);
    if (!pr) {
      pr = Promise.resolve().then(() => fn(env)).catch((e) => { memo.delete(key); throw e; });
      memo.set(key, pr);
    }
    return pr;
  };
}
