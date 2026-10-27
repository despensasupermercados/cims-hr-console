// CIMS — Supervisor Evaluation (sEval) state — Score Card integration (spec §6).
// MONEY-ADJACENT but NOT the payout math: src/bonus.js (computeBonus, ladder,
// weights, FLOOR, gates) is UNCHANGED and untouched by this module. §6 only
// governs how the sEval VALUE (1..5) that the Score Card feeds to computeBonus is
// SOURCED and OVERRIDDEN — the committed value is still whatever is in the field
// at commit time, and bonus_outcome (the immutable ledger) is never rewritten.
//
//   auto   -> set from the shipboard review rating(s) for the contract (average)
//   manual -> a money user (Miguel/Rita) overrode it, with a reason
//   none   -> no review, nothing entered (Rita types it in, exactly as today)
//
// Precedence (§6.2): auto PREFILLS, never commits; MANUAL ALWAYS WINS; auto never
// overwrites manual; multiple reviews average (rounded half-up); a review after a
// commit is filed + flagged but has NO bonus effect (ledger is append-only).
import { memoDdl } from "./ensure_memo.js";

// A review or a state row is this contract's when its sign-off key is the card's, else the nearest within this many days.
export const SEVAL_NEAR_DAYS = 21;
const dayN = (s) => Date.parse(String(s || "").slice(0, 10) + "T00:00:00Z");
export function nearestOff(keys, off) {
  const want = dayN(off);
  if (isNaN(want)) return null;
  let best = null, bestD = Infinity;
  for (const k of keys || []) {
    if (k === off) return k;
    const d = Math.abs(dayN(k) - want) / 864e5;
    if (!isNaN(d) && d <= SEVAL_NEAR_DAYS && d < bestD) { best = k; bestD = d; }
  }
  return best;
}

export function sevalValidValue(v) {
  const n = parseInt(v, 10);
  return (n >= 1 && n <= 5) ? n : null;
}
export function sevalValidReason(s) {
  return typeof s === "string" && s.trim().length >= 10;
}
// Average of overall ratings, rounded half-up (§6.2.4). Empty -> null.
export function sevalAverage(ratings) {
  const xs = (ratings || []).map(r => parseInt(r, 10)).filter(n => n >= 1 && n <= 5);
  if (!xs.length) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length); // half-up for positives
}

export function installSeval(deps) {
  deps = deps || {};
  const nowIso = deps.now || (() => new Date().toISOString());
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

  // Once per database per isolate (16 Oct 2026): this CREATE ran on every request that reached the module (§12).
  const ensureSeval = memoDdl(ensureSevalDdl);
  async function ensureSevalDdl(env) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS seval_state (agency_id TEXT NOT NULL, crew_id TEXT, contract_signoff TEXT NOT NULL, value INTEGER, source TEXT NOT NULL DEFAULT 'none' CHECK (source IN ('auto','manual','none')), set_by TEXT, set_at TEXT, reason TEXT, PRIMARY KEY (agency_id, contract_signoff))").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS seval_audit (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, contract_signoff TEXT NOT NULL, actor TEXT, old_value INTEGER, new_value INTEGER, old_source TEXT, new_source TEXT, reason TEXT, note TEXT, at TEXT NOT NULL)").run();
  }
  // THE REVIEW OF THIS CONTRACT (27 Oct 2026 review). The GSM review is requested at T-7 and keyed on the board's sign-off
  // that day — often the PROJECTED one; TDG's debark then dates the Score Card a few days away, and an exact key found no
  // review: the manager's 2/5 was invisible and the eval defaulted to 3 (full 15 points, no forfeit). The row keyed on the
  // exact sign-off wins; else the nearest within SEVAL_NEAR_DAYS, the same window the sign-off passes use for one seat.
  async function stateRow(env, sc, off) {
    const rows = (await env.DB.prepare("SELECT agency_id, crew_id, contract_signoff, value, source, set_by, set_at, reason FROM seval_state WHERE agency_id=?").bind(sc).all()).results || [];
    const key = nearestOff(rows.map((r) => r.contract_signoff), off);
    return key == null ? null : rows.find((r) => r.contract_signoff === key) || null;
  }
  async function ratingsFor(env, sc, off) {
    const rows = (await env.DB.prepare("SELECT r.rating AS rating, q.contract_signoff AS off FROM sbm_review_response r JOIN sbm_review_request q ON q.id=r.request_id WHERE q.agency_id=?").bind(sc).all()).results || [];
    const key = nearestOff(rows.map((r) => r.off), off);
    return key == null ? [] : rows.filter((r) => r.off === key).map((x) => x.rating);
  }
  async function audit(env, sc, off, actor, oldRow, newVal, newSrc, reason, note) {
    await env.DB.prepare("INSERT INTO seval_audit (id,agency_id,contract_signoff,actor,old_value,new_value,old_source,new_source,reason,note,at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind("sev_" + crypto.randomUUID(), sc, off, actor, oldRow ? oldRow.value : null, newVal, oldRow ? oldRow.source : "none", newSrc, reason || null, note || null, nowIso()).run();
  }
  // A committed outcome for this contract span makes any later change bonus-irrelevant
  // (bonus_outcome is append-only). We match on crew_id + span_end (= the sign-off date).
  async function isCommitted(env, crew_id, off) {
    if (!crew_id) return false;
    return !!(await env.DB.prepare("SELECT 1 FROM bonus_outcome WHERE crew_id=? AND span_end=? LIMIT 1").bind(crew_id, off).first());
  }

  // Score Card prefill + badge + evidence.
  async function sevalGet(env, sc, off) {
    await ensureSeval(env);
    const row = await stateRow(env, sc, off);
    const ratings = await ratingsFor(env, sc, off);
    return {
      value: row ? row.value : null,
      source: row ? row.source : "none",
      set_by: row ? row.set_by : null,
      set_at: row ? row.set_at : null,
      reason: row ? row.reason : null,
      reviewCount: ratings.length,
      reviewAvg: sevalAverage(ratings),
    };
  }

  // Auto-apply from a submitted review. Manual always wins; auto never overwrites it.
  async function sevalAutoApply(env, sc, off, crew_id) {
    await ensureSeval(env);
    const row = await stateRow(env, sc, off);
    const ratings = await ratingsFor(env, sc, off);
    const avg = sevalAverage(ratings);
    const postCommit = await isCommitted(env, crew_id, off);
    if (row && row.source === "manual") {                       // §6.2.3 manual wins
      await audit(env, sc, off, "system", row, row.value, "manual", null, "review received after manual entry — not applied" + (postCommit ? "; post-commit" : ""));
      return { applied: false, source: "manual", value: row.value, reviewAvg: avg };
    }
    if (avg == null) return { applied: false, source: (row && row.source) || "none", value: row ? row.value : null, reviewAvg: null };
    await env.DB.prepare("INSERT INTO seval_state (agency_id,crew_id,contract_signoff,value,source,set_by,set_at,reason) VALUES (?,?,?,?,'auto','system',?,NULL) ON CONFLICT(agency_id,contract_signoff) DO UPDATE SET value=excluded.value, source='auto', set_by='system', set_at=excluded.set_at, crew_id=COALESCE(excluded.crew_id, seval_state.crew_id)")
      .bind(sc, crew_id || null, off, avg, nowIso()).run();
    await audit(env, sc, off, "system", row, avg, "auto", null, postCommit ? "post-commit — no bonus effect (ledger immutable)" : null);
    return { applied: true, source: "auto", value: avg, reviewAvg: avg, postCommit };
  }

  // Money-user manual override. Caller MUST enforce isMoneyUser; reason required (§6.2.2).
  async function sevalOverride(env, sc, off, value, reason, user, crew_id) {
    await ensureSeval(env);
    const v = sevalValidValue(value);
    if (v == null) return { ok: false, error: "value_1_5" };
    if (!sevalValidReason(reason)) return { ok: false, error: "reason_required" };
    const row = await stateRow(env, sc, off);
    await env.DB.prepare("INSERT INTO seval_state (agency_id,crew_id,contract_signoff,value,source,set_by,set_at,reason) VALUES (?,?,?,?,'manual',?,?,?) ON CONFLICT(agency_id,contract_signoff) DO UPDATE SET value=excluded.value, source='manual', set_by=excluded.set_by, set_at=excluded.set_at, reason=excluded.reason, crew_id=COALESCE(excluded.crew_id, seval_state.crew_id)")
      .bind(sc, crew_id || null, off, v, user || null, nowIso(), reason.trim()).run();
    await audit(env, sc, off, user || "unknown", row, v, "manual", reason.trim(), null);
    return { ok: true, value: v, source: "manual" };
  }

  // HTTP wrappers — session + money gating are enforced by the worker.js caller.
  async function apiSevalGet(env, url) {
    const sc = String(url.searchParams.get("agency_id") || "").trim();
    const off = String(url.searchParams.get("signoff") || "").trim();
    if (!sc || !off) return json({ error: "missing_params" }, 400);
    return json(await sevalGet(env, sc, off));
  }
  async function apiSevalOverride(request, env, session, isMoneyUser) {
    if (!isMoneyUser(session && session.email)) return json({ error: "not_authorised" }, 403);
    const b = await request.json().catch(() => ({}));
    const r = await sevalOverride(env, String(b.agency_id || "").trim(), String(b.signoff || "").trim(), b.value, b.reason, (session && session.email), b.crew_id || null);
    return json(r, r.ok ? 200 : 400);
  }

  return { ensureSeval, sevalGet, sevalAutoApply, sevalOverride, apiSevalGet, apiSevalOverride };
}
