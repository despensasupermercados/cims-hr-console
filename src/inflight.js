// inflight.js — share a read that is ALREADY IN FLIGHT with a concurrent caller (13 Oct 2026, "will it help the speed?").
//
// The Keyman page fires /api/rotation and /api/relief/board together, and each computed the whole board schedule and
// the itinerary rows for itself: 13 of a load's ~50 database statements were the same statements twice, serialised by
// D1 behind each other. A read in flight is handed to the second caller; the moment it settles it is forgotten, so
// nothing is ever served from memory — a request that starts after the read finished runs its own (no staleness
// beyond what two simultaneous requests already share). Keyed by the database binding, like memoEnsure (§12).
const _in = new WeakMap();
export function shareInflight(db, key, fn) {
  let m = _in.get(db);
  if (!m) { m = new Map(); _in.set(db, m); }
  const cur = m.get(key);
  if (cur) return cur;
  let p0; try { p0 = Promise.resolve(fn()); } catch (e) { p0 = Promise.reject(e); } // the read starts now, not a tick later
  const p = p0.finally(() => { if (m.get(key) === p) m.delete(key); });
  m.set(key, p);
  return p;
}
