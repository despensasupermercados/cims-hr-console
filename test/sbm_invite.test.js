// Shipboard Management Review - manual per-crew invite (POST /api/sbm/invite).
// Pins: happy path issues one invite (reusing the sweep's email/token/recipient
// machinery), the recipient fallback, and the guard rails - missing ids, no
// recipient configured, sign-off already passed, and a review already submitted
// (never re-sent). Deliberately independent of the master switch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VESSEL_REF } from "../src/vessel_ref.js";
import { installSbm, sha256hex } from "../src/sbm.js";

const SECRET = "sbm-invite-test-secret";

// Minimal in-memory D1 fake: dispatch by SQL text. Anything unexpected throws
// so a drifted query fails loudly instead of silently returning nothing.
function fakeDB(state) {
  state.config = state.config || {};
  state.requests = state.requests || [];
  state.crew = state.crew || [];
  state.keyman = state.keyman || [];
  state.edits = state.edits || [];
  const mk = (sql) => {
    const S = String(sql); const st = { args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => {
      if (S.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
      if (S.startsWith("INSERT INTO sbm_review_request")) {
        const [id, crew_id, agency_id, contract_signon, contract_signoff, ship, brand, recipient_email, token_hash, sent_at, reminder_at, status, created_at] = st.args;
        if (state.requests.some(r => r.agency_id === agency_id && r.contract_signoff === contract_signoff))
          throw new Error("UNIQUE constraint failed: sbm_review_request");
        state.requests.push({ id, crew_id, agency_id, contract_signon, contract_signoff, ship, brand, recipient_email, token_hash, sent_at, reminder_at, status, created_at });
        return { meta: { changes: 1 } };
      }
      if (S.startsWith("UPDATE sbm_review_request SET recipient_email=")) {
        const [recipient_email, token_hash, sent_at, id] = st.args;
        const r = state.requests.find(x => x.id === id);
        if (r) { r.recipient_email = recipient_email; r.token_hash = token_hash; r.sent_at = sent_at; r.reminder_at = null; r.status = "sent"; }
        return { meta: { changes: r ? 1 : 0 } };
      }
      throw new Error("unexpected run(): " + S);
    };
    st.first = async () => {
      if (S.startsWith("SELECT ship, proj_off, act_off FROM keyman_contract3")) {
        const [sc, seq] = st.args; return state.keyman.find(k => k.sc === sc && k.seq === seq) || null;
      }
      if (S.startsWith("SELECT ship, sign_off FROM contract_edit")) {
        const [sc, seq] = st.args; return state.edits.find(e => e.sc === sc && e.seq === seq) || null;
      }
      if (S.startsWith("SELECT id, first_name, middle_name, last_name FROM crew")) {
        const [sc] = st.args; return state.crew.find(c => c.agency_id === sc) || null;
      }
      if (S.startsWith("SELECT value FROM sbm_config WHERE key=?")) {
        const [k] = st.args; return k in state.config ? { value: state.config[k] } : null;
      }
      if (S.startsWith("SELECT id, status FROM sbm_review_request WHERE agency_id=?")) {
        const [sc, off] = st.args; return state.requests.find(r => r.agency_id === sc && r.contract_signoff === off) || null;
      }
      throw new Error("unexpected first(): " + S);
    };
    st.all = async () => {
      if (S.startsWith("SELECT key, value FROM sbm_config WHERE key LIKE ?")) {
        const [like] = st.args; const pre = like.replace(/%$/, "");
        return { results: Object.keys(state.config).filter(k => k.startsWith(pre)).map(k => ({ key: k, value: state.config[k] })) };
      }
      throw new Error("unexpected all(): " + S);
    };
    return st;
  };
  return { prepare: mk };
}

function setup(state, over = {}) {
  const sent = [];
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(state) };
  const sbm = installSbm({
    sendViaMailer: async (_e, envelope) => { sent.push(envelope); return { ok: true }; },
    VESSEL_REF, ORIGIN: "https://cims.work", today: () => "2026-07-05", isEnabled: async () => true, ...over,
  });
  return { env, sbm, sent };
}
const req = (body) => ({ json: async () => body, headers: { get: () => null } });

test("happy path: manual invite sends once, files a 'sent' row, returns recipient + link", async () => {
  const state = {
    config: { "recipient:Adventure of the Seas": "gsm.adventure@rccl.test" },
    crew: [{ agency_id: "SC-0012345", id: 7, first_name: "Maria", middle_name: null, last_name: "Cruz" }],
    keyman: [{ sc: "SC-0012345", seq: 2, ship: "Adventure of the Seas", proj_off: "2026-08-01", act_off: null }],
  };
  const { env, sbm, sent } = setup(state);
  const r = await sbm.sbmInviteRequest(req({ sc: "SC-0012345", seq: 2 }), env, { email: "miguel@dg3.com" });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.emailed, true);
  assert.equal(body.recipient, "gsm.adventure@rccl.test");
  assert.match(body.link, /^https:\/\/cims\.work\/sbm\?t=/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0], "gsm.adventure@rccl.test");
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].status, "sent");
  assert.equal(state.requests[0].contract_signoff, "2026-08-01");
  assert.doesNotMatch(JSON.stringify(sent[0]).toLowerCase(), /bonus|seval|gate|payout/);
});

test("contract_edit override wins for ship + sign-off date", async () => {
  const state = {
    config: { "recipient:Wonder of the Seas": "gsm.wonder@rccl.test" },
    crew: [{ agency_id: "SC-9", id: 9, first_name: "Al", last_name: "Diaz" }],
    keyman: [{ sc: "SC-9", seq: 1, ship: "Adventure of the Seas", proj_off: "2026-07-20", act_off: null }],
    edits: [{ sc: "SC-9", seq: 1, ship: "Wonder of the Seas", sign_off: "2026-08-15" }],
  };
  const { env, sbm, sent } = setup(state);
  const r = await sbm.sbmInviteRequest(req({ sc: "SC-9", seq: 1 }), env, {});
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(sent[0].to[0], "gsm.wonder@rccl.test");
  assert.equal(state.requests[0].contract_signoff, "2026-08-15");
  assert.equal(state.requests[0].ship, "Wonder of the Seas");
});

test("no recipient configured -> 409, nothing sent, no row", async () => {
  const state = {
    crew: [{ agency_id: "SC-1", id: 1, first_name: "No", last_name: "Recip" }],
    keyman: [{ sc: "SC-1", seq: 1, ship: "Unlisted Ship", proj_off: "2026-09-01", act_off: null }],
  };
  const { env, sbm, sent } = setup(state);
  const r = await sbm.sbmInviteRequest(req({ sc: "SC-1", seq: 1 }), env, {});
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "no_recipient_configured");
  assert.equal(sent.length, 0);
  assert.equal(state.requests.length, 0);
});

test("sign-off already passed -> 409 signoff_passed, nothing sent", async () => {
  const state = {
    config: { "recipient:Adventure of the Seas": "x@y.test" },
    crew: [{ agency_id: "SC-2", id: 2, first_name: "Past", last_name: "Due" }],
    keyman: [{ sc: "SC-2", seq: 1, ship: "Adventure of the Seas", proj_off: "2026-07-01", act_off: null }],
  };
  const { env, sbm, sent } = setup(state);
  const r = await sbm.sbmInviteRequest(req({ sc: "SC-2", seq: 1 }), env, {});
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "signoff_passed");
  assert.equal(sent.length, 0);
});

test("already submitted -> 409 already_submitted, never re-sent", async () => {
  const state = {
    config: { "recipient:Adventure of the Seas": "x@y.test" },
    crew: [{ agency_id: "SC-3", id: 3, first_name: "Done", last_name: "Already" }],
    keyman: [{ sc: "SC-3", seq: 1, ship: "Adventure of the Seas", proj_off: "2026-08-01", act_off: null }],
    requests: [{ id: "sbmr_x", agency_id: "SC-3", contract_signoff: "2026-08-01", status: "submitted" }],
  };
  const { env, sbm, sent } = setup(state);
  const r = await sbm.sbmInviteRequest(req({ sc: "SC-3", seq: 1 }), env, {});
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "already_submitted");
  assert.equal(sent.length, 0);
});

test("re-invite of an open row keeps its id + single-use token (idempotent)", async () => {
  const state = {
    config: { "recipient:Adventure of the Seas": "x@y.test" },
    crew: [{ agency_id: "SC-4", id: 4, first_name: "Re", last_name: "Send" }],
    keyman: [{ sc: "SC-4", seq: 1, ship: "Adventure of the Seas", proj_off: "2026-08-01", act_off: null }],
    requests: [{ id: "sbmr_keep", agency_id: "SC-4", contract_signoff: "2026-08-01", status: "expired" }],
  };
  const { env, sbm, sent } = setup(state);
  const r = await sbm.sbmInviteRequest(req({ sc: "SC-4", seq: 1 }), env, {});
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].id, "sbmr_keep");
  assert.equal(state.requests[0].status, "sent");
  assert.equal(state.requests[0].token_hash, await sha256hex(body.link.split("t=")[1]));
});

test("missing sc/seq -> 400", async () => {
  const { env, sbm } = setup({});
  const r = await sbm.sbmInviteRequest(req({ sc: "SC-1" }), env, {});
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "missing_sc_seq");
});

test("master switch OFF -> 409 sbm_disabled, nothing sent", async () => {
  const state = { config:{ "recipient:Adventure":"x@y.test" }, crew:[{agency_id:"SC-5",id:5,first_name:"Off",last_name:"Gate"}], keyman:[{sc:"SC-5",seq:1,ship:"Adventure",proj_off:"2026-08-01",act_off:null}] };
  const { env, sbm, sent } = setup(state, { isEnabled: async () => false });
  const r = await sbm.sbmInviteRequest(req({ sc:"SC-5", seq:1 }), env, {});
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "sbm_disabled");
  assert.equal(sent.length, 0);
});
