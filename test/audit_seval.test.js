// Printshop-audit → sEval integration (spec I5/I8). Pins the money-safety rules for
// how an audit's settled supervisor_eval sources the Score Card value, WITHOUT touching
// bonus.js: audit applies as `auto`; MANUAL ALWAYS WINS; audit is authoritative among
// autos (a later shipboard review does not overwrite it); 1/2 only reach here after
// Miguel confirms (the caller enforces that — an unsettled 1/2 is never applied).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installSeval } from "../src/seval.js";

function fakeDB(state) {
  state.stateRows = state.stateRows || [];
  state.audits = state.audits || [];
  state.responses = state.responses || [];
  state.outcomes = state.outcomes || [];
  const find = (sc, off) => state.stateRows.find(r => r.agency_id === sc && r.contract_signoff === off);
  const upsert = (a, o, patch) => {
    let row = find(a, o);
    if (row) Object.assign(row, patch);
    else state.stateRows.push(Object.assign({ agency_id: a, contract_signoff: o, reason: null }, patch));
  };
  const mk = (sql) => {
    const S = String(sql); const st = { args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => {
      if (S.startsWith("CREATE TABLE")) return {};
      if (S.startsWith("INSERT INTO seval_state")) {
        if (S.includes("'manual'")) {
          const [a, c, o, v, sb, sa, rs] = st.args;
          upsert(a, o, { crew_id: c, value: v, source: "manual", set_by: sb, set_at: sa, reason: rs });
        } else if (st.args.length === 7) {
          const [a, c, o, v, sb, sa, rs] = st.args;
          upsert(a, o, { crew_id: c, value: v, source: "auto", set_by: sb, set_at: sa, reason: rs });
        } else {
          const [a, c, o, v, sa] = st.args;
          upsert(a, o, { crew_id: c, value: v, source: "auto", set_by: "system", set_at: sa, reason: null });
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
const setup = (state) => ({ env: { DB: fakeDB(state) }, seval: installSeval({ now: () => "2026-07-08T00:00:00.000Z" }) });

test("audit applies a settled eval as auto, tagged set_by audit:<id>", async () => {
  const state = {};
  const { env, seval } = setup(state);
  const r = await seval.sevalApplyAudit(env, "SC-1", "2026-08-01", 3, "crew-1", "aud-9");
  assert.deepEqual([r.applied, r.source, r.value], [true, "auto", 3]);
  assert.equal(state.stateRows[0].set_by, "audit:aud-9");
  assert.equal(state.audits.at(-1).new_source, "auto");
});

test("MANUAL ALWAYS WINS: an audit does not overwrite a money-user manual value", async () => {
  const state = { stateRows: [{ agency_id: "SC-2", contract_signoff: "2026-08-01", value: 2, source: "manual", set_by: "rita@dg3.com" }] };
  const { env, seval } = setup(state);
  const r = await seval.sevalApplyAudit(env, "SC-2", "2026-08-01", 5, "crew-2", "aud-2");
  assert.equal(r.applied, false);
  assert.equal(r.source, "manual");
  assert.equal(state.stateRows[0].value, 2);
  assert.match(state.audits.at(-1).note, /not applied/);
});

test("bad audit value is rejected", async () => {
  const state = {};
  const { env, seval } = setup(state);
  assert.equal((await seval.sevalApplyAudit(env, "SC-3", "2026-08-01", 9, "crew-3", "aud-3")).error, "value_1_5");
  assert.equal(state.stateRows.length, 0);
});

test("AUDIT AUTHORITATIVE among autos: a later review does not overwrite an audit value", async () => {
  const state = { responses: [{ agency_id: "SC-4", contract_signoff: "2026-08-01", rating: 5 }, { agency_id: "SC-4", contract_signoff: "2026-08-01", rating: 5 }] };
  const { env, seval } = setup(state);
  await seval.sevalApplyAudit(env, "SC-4", "2026-08-01", 3, "crew-4", "aud-4");
  const r = await seval.sevalAutoApply(env, "SC-4", "2026-08-01", "crew-4");
  assert.equal(r.applied, false);
  assert.equal(r.auditHeld, true);
  assert.equal(state.stateRows[0].value, 3);
});

test("post-commit audit is flagged (no bonus effect) but still recorded", async () => {
  const state = { outcomes: [{ crew_id: "crew-5", span_end: "2026-08-01" }] };
  const { env, seval } = setup(state);
  const r = await seval.sevalApplyAudit(env, "SC-5", "2026-08-01", 4, "crew-5", "aud-5");
  assert.equal(r.applied, true);
  assert.equal(r.postCommit, true);
  assert.match(state.audits.at(-1).note, /post-commit/);
});
