// Supervisor Evaluation (sEval) state — Score Card integration (spec §6).
// Pins the precedence rules that protect real payouts: auto prefills from the
// review average, MANUAL ALWAYS WINS, auto never overwrites manual, multiple
// reviews average (rounded half-up), override requires a >=10-char reason, and a
// review after commit is flagged (no bonus effect). bonus.js is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installSeval, sevalAverage, sevalValidValue, sevalValidReason } from "../src/seval.js";

test("sevalAverage rounds half-up; empty -> null", () => {
  assert.equal(sevalAverage([4, 5]), 5);   // 4.5 -> 5
  assert.equal(sevalAverage([3, 4]), 4);   // 3.5 -> 4
  assert.equal(sevalAverage([1, 2]), 2);   // 1.5 -> 2
  assert.equal(sevalAverage([2, 2, 3]), 2);// 2.33 -> 2
  assert.equal(sevalAverage([3]), 3);
  assert.equal(sevalAverage([]), null);
  assert.equal(sevalAverage([9, "x"]), null); // out-of-range/garbage dropped
});
test("value + reason validators", () => {
  assert.equal(sevalValidValue(3), 3);
  assert.equal(sevalValidValue(0), null);
  assert.equal(sevalValidValue(6), null);
  assert.equal(sevalValidReason("too short"), false);      // 9 chars
  assert.equal(sevalValidReason("long enough reason"), true);
});

// ---- fake D1 for the store functions ----
function fakeDB(state) {
  state.stateRows = state.stateRows || [];   // seval_state
  state.audits = state.audits || [];         // seval_audit
  state.responses = state.responses || [];   // {agency_id, contract_signoff, rating}
  state.outcomes = state.outcomes || [];     // {crew_id, span_end}
  const find = (sc, off) => state.stateRows.find(r => r.agency_id === sc && r.contract_signoff === off);
  const mk = (sql) => {
    const S = String(sql); const st = { args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => {
      if (S.startsWith("CREATE TABLE")) return {};
      if (S.startsWith("INSERT INTO seval_state")) {
        const [agency_id, crew_id, off, value, set_by, set_at, reason] = st.args;
        const src = S.includes("'auto'") && !S.includes("'manual'") ? "auto" : "manual";
        // NOTE: the two INSERTs differ only in bound param order for set_by/reason.
        let row = find(agency_id, off);
        if (src === "auto") {
          // params: (agency_id, crew_id, off, value, set_at)
          const [a, c, o, v, sa] = st.args;
          if (row) { row.value = v; row.source = "auto"; row.set_by = "system"; row.set_at = sa; row.crew_id = c || row.crew_id; }
          else state.stateRows.push({ agency_id: a, crew_id: c, contract_signoff: o, value: v, source: "auto", set_by: "system", set_at: sa, reason: null });
        } else {
          // params: (agency_id, crew_id, off, value, set_by, set_at, reason)
          const [a, c, o, v, sb, sa, rs] = st.args;
          if (row) { row.value = v; row.source = "manual"; row.set_by = sb; row.set_at = sa; row.reason = rs; row.crew_id = c || row.crew_id; }
          else state.stateRows.push({ agency_id: a, crew_id: c, contract_signoff: o, value: v, source: "manual", set_by: sb, set_at: sa, reason: rs });
        }
        return {};
      }
      if (S.startsWith("INSERT INTO seval_audit")) {
        const [id, agency_id, off, actor, ov, nv, os, ns, reason, note, at] = st.args;
        state.audits.push({ id, agency_id, contract_signoff: off, actor, old_value: ov, new_value: nv, old_source: os, new_source: ns, reason, note, at });
        return {};
      }
      throw new Error("unexpected run(): " + S);
    };
    st.first = async () => {
      if (S.startsWith("SELECT agency_id, crew_id, contract_signoff, value, source")) { const [sc, off] = st.args; return find(sc, off) || null; }
      if (S.startsWith("SELECT 1 FROM bonus_outcome")) { const [cid, off] = st.args; return state.outcomes.find(o => o.crew_id === cid && o.span_end === off) ? { 1: 1 } : null; }
      throw new Error("unexpected first(): " + S);
    };
    st.all = async () => {
      if (S.includes("FROM sbm_review_response")) { const [sc, off] = st.args; return { results: state.responses.filter(r => r.agency_id === sc && r.contract_signoff === off).map(r => ({ rating: r.rating })) }; }
      throw new Error("unexpected all(): " + S);
    };
    return st;
  };
  return { prepare: mk };
}
const setup = (state) => ({ env: { DB: fakeDB(state) }, seval: installSeval({ now: () => "2026-07-05T00:00:00.000Z" }) });

test("auto-apply sets 'auto' from review average and audits", async () => {
  const state = { responses: [{ agency_id: "SC-1", contract_signoff: "2026-08-01", rating: 4 }, { agency_id: "SC-1", contract_signoff: "2026-08-01", rating: 5 }] };
  const { env, seval } = setup(state);
  const r = await seval.sevalAutoApply(env, "SC-1", "2026-08-01", "crew-1");
  assert.deepEqual([r.applied, r.source, r.value], [true, "auto", 5]);
  assert.equal(state.stateRows[0].source, "auto");
  assert.equal(state.stateRows[0].value, 5);
  assert.equal(state.audits.at(-1).new_source, "auto");
});

test("MANUAL ALWAYS WINS: auto does not overwrite a manual value", async () => {
  const state = { stateRows: [{ agency_id: "SC-2", contract_signoff: "2026-08-01", value: 2, source: "manual", set_by: "rita@dg3.com" }], responses: [{ agency_id: "SC-2", contract_signoff: "2026-08-01", rating: 5 }] };
  const { env, seval } = setup(state);
  const r = await seval.sevalAutoApply(env, "SC-2", "2026-08-01", "crew-2");
  assert.equal(r.applied, false);
  assert.equal(r.source, "manual");
  assert.equal(state.stateRows[0].value, 2);            // unchanged
  assert.match(state.audits.at(-1).note, /not applied/);
});

test("override sets 'manual' with reason; rejects short reason / bad value", async () => {
  const state = { stateRows: [{ agency_id: "SC-3", contract_signoff: "2026-08-01", value: 5, source: "auto", set_by: "system" }] };
  const { env, seval } = setup(state);
  assert.equal((await seval.sevalOverride(env, "SC-3", "2026-08-01", 2, "bad", "rita@dg3.com")).error, "reason_required");
  assert.equal((await seval.sevalOverride(env, "SC-3", "2026-08-01", 9, "a valid long reason", "rita@dg3.com")).error, "value_1_5");
  const ok = await seval.sevalOverride(env, "SC-3", "2026-08-01", 2, "guest complaint substantiated", "rita@dg3.com");
  assert.deepEqual([ok.ok, ok.value, ok.source], [true, 2, "manual"]);
  assert.equal(state.stateRows[0].source, "manual");
  assert.equal(state.stateRows[0].value, 2);
});

test("post-commit review is flagged (no bonus effect) but still recorded", async () => {
  const state = { responses: [{ agency_id: "SC-4", contract_signoff: "2026-08-01", rating: 4 }], outcomes: [{ crew_id: "crew-4", span_end: "2026-08-01" }] };
  const { env, seval } = setup(state);
  const r = await seval.sevalAutoApply(env, "SC-4", "2026-08-01", "crew-4");
  assert.equal(r.applied, true);
  assert.equal(r.postCommit, true);
  assert.match(state.audits.at(-1).note, /post-commit/);
});

test("sevalGet reports state + review evidence", async () => {
  const state = { stateRows: [{ agency_id: "SC-5", contract_signoff: "2026-08-01", value: 4, source: "auto", set_by: "system", set_at: "x" }], responses: [{ agency_id: "SC-5", contract_signoff: "2026-08-01", rating: 4 }] };
  const { env, seval } = setup(state);
  const g = await seval.sevalGet(env, "SC-5", "2026-08-01");
  assert.deepEqual([g.value, g.source, g.reviewCount, g.reviewAvg], [4, "auto", 1, 4]);
});
