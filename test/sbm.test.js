// Shipboard Management Review (SBM) — Phase A tests.
// Pins: token single-use/expiry/tamper (same HMAC mechanism as /fb), the
// suppression matrix, sweep idempotence (running twice sends once), the
// reminder-fires-once rule, rating validation (the only required input),
// recipient config fallback ship -> brand -> skip, and the hard guarantee
// that NOTHING shipboard-manager-facing ever mentions bonus mechanics.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken } from "../src/auth.js";
import { VESSEL_REF } from "../src/vessel_ref.js";
import {
  installSbm, sbmToken, sbmVerify, sbmExpiryFor, sbmBrandForShip, sbmPickRecipient, sbmNormShip,
  sbmSuppressReason, sbmValidRating, sbmLegsFromSections, sbmPlusDays, sbmDateLong,
  sbmInviteEmail, sbmReminderEmail, sbmInternalEmail, sbmCrewEmail, sbmSurveyHtml,
} from "../src/sbm.js";

const SECRET = "sbm-test-secret";

/* ----------------------- minimal in-memory D1 fake ----------------------- */
// Handles exactly the statements src/sbm.js issues (dispatch by SQL text);
// anything else throws loudly so a drifted query fails the suite instead of
// silently returning nothing. UNIQUE constraints are simulated like D1's.
function fakeDB(state) {
  state.settings = state.settings || {};
  state.requests = state.requests || [];
  state.responses = state.responses || [];
  state.config = state.config || {};
  state.crew = state.crew || [];
  state.overrides = state.overrides || [];
  return {
    prepare(sql) {
      const s = { args: [] };
      s.bind = (...a) => { s.args = a; return s; };
      const S = String(sql);
      s.run = async () => {
        if (S.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
        if (S.startsWith("INSERT INTO sbm_review_request")) {
          const [id, crew_id, agency_id, contract_signon, contract_signoff, ship, brand, recipient_email, token_hash, sent_at, reminder_at, status, created_at] = s.args;
          if (state.requests.some(r => r.agency_id === agency_id && r.contract_signoff === contract_signoff))
            throw new Error("UNIQUE constraint failed: sbm_review_request.agency_id, sbm_review_request.contract_signoff");
          if (state.requests.some(r => r.token_hash === token_hash))
            throw new Error("UNIQUE constraint failed: sbm_review_request.token_hash");
          state.requests.push({ id, crew_id, agency_id, contract_signon, contract_signoff, ship, brand, recipient_email, token_hash, sent_at, reminder_at, status, created_at });
          return { meta: { changes: 1 } };
        }
        if (S.startsWith("INSERT INTO sbm_review_response")) {
          const [id, request_id, rating, q_business, q_guests, q_grow, q_integrity, q_teams, q_energy, q_final, submitted_at, ip, ua] = s.args;
          state.responses.push({ id, request_id, rating, q_business, q_guests, q_grow, q_integrity, q_teams, q_energy, q_final, submitted_at, ip, ua });
          return { meta: { changes: 1 } };
        }
        if (S.includes("UPDATE sbm_review_request SET status='expired'")) {
          let n = 0;
          for (const r of state.requests) if ((r.status === "sent" || r.status === "reminded") && r.contract_signoff < s.args[0]) { r.status = "expired"; n++; }
          return { meta: { changes: n } };
        }
        if (S.includes("UPDATE sbm_review_request SET status='reminded'")) {
          const r = state.requests.find(x => x.id === s.args[1]);
          if (r) { r.status = "reminded"; r.reminder_at = s.args[0]; }
          return { meta: { changes: r ? 1 : 0 } };
        }
        if (S.includes("UPDATE sbm_review_request SET status=?")) {
          const r = state.requests.find(x => x.id === s.args[1]);
          if (r) r.status = s.args[0];
          return { meta: { changes: r ? 1 : 0 } };
        }
        throw new Error("fakeDB run: unhandled SQL: " + S);
      };
      s.first = async () => {
        if (S.includes("FROM app_setting WHERE k='sbm_enabled'")) {
          const v = state.settings.sbm_enabled;
          return v == null ? null : { v: v };
        }
        if (S.includes("FROM sbm_config")) { const v = state.config[s.args[0]]; return v == null ? null : { value: v }; }
        if (S.includes("FROM crew WHERE agency_id=?")) {
          const c = state.crew.find(x => x.agency_id === s.args[0]);
          return c ? { id: c.id || null, first_name: c.first_name || null, middle_name: c.middle_name || null, last_name: c.last_name || null } : null;
        }
        if (S.includes("FROM sbm_review_request WHERE token_hash=?")) return state.requests.find(r => r.token_hash === s.args[0]) || null;
        if (S.includes("FROM sbm_review_request WHERE agency_id=? AND contract_signoff=?"))
          return state.requests.find(r => r.agency_id === s.args[0] && r.contract_signoff === s.args[1]) || null;
        throw new Error("fakeDB first: unhandled SQL: " + S);
      };
      s.all = async () => {
        if (S.includes("FROM sbm_config WHERE key LIKE")) {
          const pre = String(s.args[0]).replace(/%$/, "");
          return { results: Object.keys(state.config).filter(k => k.startsWith(pre)).map(k => ({ key: k, value: state.config[k] })) };
        }
        if (S.includes("FROM crew_override")) return { results: state.overrides.slice() };
        if (S.includes("redacted FROM crew")) return { results: state.crew.slice() };
        if (S.includes("FROM sbm_review_request WHERE status='sent'")) return { results: state.requests.filter(r => r.status === "sent").map(r => ({ ...r })) };
        if (S.includes("FROM sbm_review_response r JOIN sbm_review_request q")) {
          const out = [];
          for (const r of state.responses) {
            const q = state.requests.find(x => x.id === r.request_id);
            if (!q || (q.agency_id !== s.args[0] && q.crew_id !== s.args[1])) continue;
            out.push({ ship: q.ship, brand: q.brand, contract_signon: q.contract_signon, contract_signoff: q.contract_signoff,
              rating: r.rating, q_business: r.q_business, q_guests: r.q_guests, q_grow: r.q_grow, q_integrity: r.q_integrity,
              q_teams: r.q_teams, q_energy: r.q_energy, q_final: r.q_final, submitted_at: r.submitted_at });
          }
          out.sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1));
          return { results: out };
        }
        throw new Error("fakeDB all: unhandled SQL: " + S);
      };
      return s;
    },
  };
}

/* ------------------------------ harness ---------------------------------- */
// Dynamic timeline anchored to the REAL clock: sbmVerify checks token expiry against
// Date.now, so fixture sign-offs must stay in the future or every live-token test dies
// the night the hardcoded date passes (that exact time bomb fired on 2026-07-11).
const dayN = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const TODAY = dayN(0);                       // sweep "today"
const T7_OFF = dayN(7), T4_OFF = dayN(4);    // sign-offs at T-7 / T-4 from TODAY

function rig(opts = {}) {
  const state = {
    today: opts.today || TODAY,
    crew: opts.crew || [{ agency_id: "SC-0038865", id: "u-maria", first_name: "Maria", middle_name: "Katrina Rica", last_name: "Murillo", status: "On board", redacted: 0 }],
    overrides: opts.overrides || [],
    config: opts.config || { "recipient:Navigator of the Seas": "gsm.navigator@rccl.example" },
    // Master switch ON for the suite (mirrors prod once Rita flips the toggle);
    // the ON/OFF tests below pass their own `settings` to exercise default-OFF.
    settings: "settings" in opts ? opts.settings : { sbm_enabled: "true" },
    board: opts.board || [{ agency_id: "SC-0038865", name: "Maria Murillo", ship: "Navigator of the Seas", signOn: "2026-01-14", signOff: T7_OFF }],
    requests: [], responses: [],
  };
  const outbox = [];
  const activity = [];
  const flags = { mailFail: !!opts.mailFail };
  const env = { SESSION_SECRET: SECRET, DB: fakeDB(state) };
  const deps = {
    sendViaMailer: async (_env, envelope) => { outbox.push(envelope); return flags.mailFail ? { ok: false, error: "down" } : { ok: true }; },
    logActivity: async (_env, _email, action, detail) => { activity.push({ action, detail }); },
    SECTIONS: async () => ({ sections: [{ ship: "board", crew: state.board }] }),
    VESSEL_REF,
    ORIGIN: "https://cims.test",
    today: () => state.today,
    GATE_HOUR: "GATE_HOUR" in opts ? opts.GATE_HOUR : null, // un-gated in tests unless a test opts in (S4)
  };
  const sbm = installSbm(deps);
  return { state, env, deps, sbm, outbox, activity, flags };
}
function linkToken(html) {
  const m = /\/sbm\?t=([A-Za-z0-9_\-.]+)/.exec(html);
  return m ? m[1] : null;
}
function postSubmit(body) {
  return new Request("https://cims.test/api/sbm/submit", {
    method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "test-ua", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

/* ------------------------------- tokens ---------------------------------- */

test("sbm token round-trips and carries the request id", async () => {
  const env = { SESSION_SECRET: SECRET };
  const t = await sbmToken(env, "sbmr_abc", sbmExpiryFor("2099-01-01"));
  const p = await sbmVerify(env, t);
  assert.equal(p.rid, "sbmr_abc");
  assert.equal(p.p, "sbm");
});

test("expired sbm token is rejected", async () => {
  const env = { SESSION_SECRET: SECRET };
  const t = await sbmToken(env, "sbmr_old", Math.floor(Date.now() / 1000) - 5);
  assert.equal(await sbmVerify(env, t), null);
});

test("tampered sbm token is rejected", async () => {
  const env = { SESSION_SECRET: SECRET };
  const t = await sbmToken(env, "sbmr_x", sbmExpiryFor("2099-01-01"));
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ p: "sbm", rid: "sbmr_FORGED", exp: sbmExpiryFor("2099-01-01") }))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(await sbmVerify(env, forged + "." + sig), null);
  assert.equal(await sbmVerify(env, "garbage"), null);
});

test("a token minted for another purpose (/fb) never opens an sbm review", async () => {
  const env = { SESSION_SECRET: SECRET };
  const fb = await signToken({ p: "fb", crewId: "x", role: "ray", exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  assert.equal(await sbmVerify(env, fb), null);
});

test("token expiry lands on the sign-off date (deterministic for the reminder re-derive)", async () => {
  const env = { SESSION_SECRET: SECRET };
  const a = await sbmToken(env, "sbmr_same", sbmExpiryFor(T7_OFF));
  const b = await sbmToken(env, "sbmr_same", sbmExpiryFor(T7_OFF));
  assert.equal(a, b); // same payload -> same HMAC -> invite and reminder share ONE single-use link
});

/* ---------------------------- brand + config ----------------------------- */

test("ship -> brand: RCI, Celebrity, Azamara, unknown", () => {
  assert.equal(sbmBrandForShip("Navigator of the Seas", VESSEL_REF), "Royal Caribbean");
  assert.equal(sbmBrandForShip("Celebrity Beyond", VESSEL_REF), "Celebrity");
  assert.equal(sbmBrandForShip("Azamara Journey", VESSEL_REF), "Azamara");
  assert.equal(sbmBrandForShip("Journey", VESSEL_REF), "Azamara");
  assert.equal(sbmBrandForShip("MS Nonexistent", VESSEL_REF), null);
});

test("recipient fallback: ship key wins, then brand, then null", () => {
  const cfg = { "recipient:Navigator of the Seas": "ship@x.example", "recipient:Royal Caribbean": "brand@x.example" };
  const get = (k) => cfg[k] || null;
  assert.equal(sbmPickRecipient(get, "Navigator of the Seas", "Royal Caribbean"), "ship@x.example");
  assert.equal(sbmPickRecipient(get, "Wonder of the Seas", "Royal Caribbean"), "brand@x.example");
  assert.equal(sbmPickRecipient(get, "Celebrity Apex", "Celebrity"), null);
});

/* -------------------------- suppression matrix --------------------------- */

test("suppression matrix: every spec case", () => {
  const req = { contract_signoff: T4_OFF };
  const leg = { off: T4_OFF };
  const crew = { status: "On board", retired: false };
  assert.equal(sbmSuppressReason(req, leg, crew, TODAY), null);                          // healthy -> not suppressed
  assert.equal(sbmSuppressReason(req, null, crew, TODAY), "cancelled");                  // contract gone from schedule
  assert.equal(sbmSuppressReason(req, { off: dayN(60) }, crew, TODAY), "date_moved"); // sign-off moved
  assert.equal(sbmSuppressReason(req, leg, { status: "On board", retired: true }, TODAY), "retired");
  assert.equal(sbmSuppressReason(req, leg, { status: "Inactive", retired: false }, TODAY), "retired");
  assert.equal(sbmSuppressReason(req, leg, null, TODAY), "retired");                     // unknown crew: never email
  assert.equal(sbmSuppressReason({ contract_signoff: dayN(-2) }, { off: dayN(-2) }, crew, TODAY), "signed_off");
});

/* ------------------------------ validation ------------------------------- */

test("rating validation: 1-5 integers only, strings normalized", () => {
  assert.equal(sbmValidRating(1), 1);
  assert.equal(sbmValidRating(5), 5);
  assert.equal(sbmValidRating("4"), 4);
  assert.equal(sbmValidRating(0), null);
  assert.equal(sbmValidRating(6), null);
  assert.equal(sbmValidRating(3.5), null);
  assert.equal(sbmValidRating("abc"), null);
  assert.equal(sbmValidRating(""), null);
  assert.equal(sbmValidRating(null), null);
  assert.equal(sbmValidRating(undefined), null);
});

/* ------------------------------- sweep ----------------------------------- */

test("sweep at T-7 creates the request and sends ONE invite; running twice sends once", async () => {
  const { sbm, state, env, outbox } = rig();
  const r1 = await sbm.sbmDailySweep(env);
  assert.equal(r1.invited, 1);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].status, "sent");
  assert.equal(state.requests[0].recipient_email, "gsm.navigator@rccl.example");
  assert.equal(state.requests[0].brand, "Royal Caribbean");
  assert.equal(state.requests[0].contract_signoff, T7_OFF);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to[0], "gsm.navigator@rccl.example");
  assert.match(outbox[0].html, /\/sbm\?t=/);
  // idempotence: same day, second run — nothing new
  const r2 = await sbm.sbmDailySweep(env);
  assert.equal(r2.invited, 0);
  assert.equal(state.requests.length, 1);
  assert.equal(outbox.length, 1);
});

test("config fallback in the sweep: ship key, else brand key, else skip+log (no request row)", async () => {
  // 1) no config at all -> skipped, nothing sent, nothing stored
  let r = rig({ config: {} });
  let res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.invited, 0);
  assert.equal(r.outbox.length, 0);
  assert.equal(r.state.requests.length, 0);
  assert.equal(res.skipped[0].reason, "no_recipient_configured");
  // 2) brand-level fallback used when ship key missing
  r = rig({ config: { "recipient:Royal Caribbean": "rci.brand@rccl.example" } });
  res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.invited, 1);
  assert.equal(r.state.requests[0].recipient_email, "rci.brand@rccl.example");
});

test("sweep never invites for retired/Inactive crew", async () => {
  const r = rig({ overrides: [{ agency_id: "SC-0038865", status: null, retired: 1 }] });
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.invited, 0);
  assert.equal(r.outbox.length, 0);
  assert.equal(res.skipped[0].reason, "retired_or_inactive");
});

test("mailer failure -> no request row logged, so tomorrow can retry cleanly", async () => {
  const r = rig({ mailFail: true });
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.invited, 0);
  assert.equal(r.state.requests.length, 0); // row only on successful send (auto_send rule)
  assert.equal(res.skipped[0].reason, "send_failed");
});

test("reminder fires at T-4, exactly once, and reuses the SAME single-use link", async () => {
  const r = rig();
  await r.sbm.sbmDailySweep(r.env);                    // T-7 invite
  const inviteToken = linkToken(r.outbox[0].html);
  r.state.today = dayN(3);                             // T-4 for T7_OFF
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.reminded, 1);
  assert.equal(r.outbox.length, 2);
  assert.equal(linkToken(r.outbox[1].html), inviteToken); // identical HMAC re-derive
  assert.equal(r.state.requests[0].status, "reminded");
  assert.ok(r.state.requests[0].reminder_at);
  // once, ever: same day re-run and later days send nothing more
  const res2 = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res2.reminded, 0);
  r.state.today = dayN(4);
  const res3 = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res3.reminded, 0);
  assert.equal(r.outbox.length, 2);
});

test("reminder suppression: moved sign-off cancels, and a cancelled reminder never un-cancels", async () => {
  const r = rig();
  await r.sbm.sbmDailySweep(r.env);                    // invite
  r.state.board[0].signOff = dayN(48);                 // date moves out of window
  r.state.today = dayN(3);                             // reminder day for the OLD date
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.suppressed, 1);
  assert.equal(res.reminded, 0);
  assert.equal(r.state.requests[0].status, "suppressed");
  assert.equal(r.outbox.length, 1);                    // invite only
  // even if the date moves BACK, the suppressed request stays terminal
  r.state.board[0].signOff = T7_OFF;
  const res2 = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res2.reminded, 0);
  assert.equal(r.state.requests[0].status, "suppressed");
});

test("sweep expires open requests whose sign-off date has passed", async () => {
  const r = rig();
  await r.sbm.sbmDailySweep(r.env);
  r.state.today = dayN(8); // day after sign-off
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.expired, 1);
  assert.equal(r.state.requests[0].status, "expired");
});

/* ------------------------------- submit ---------------------------------- */

async function invitedRig() {
  const r = rig();
  await r.sbm.sbmDailySweep(r.env);
  r.token = linkToken(r.outbox[0].html);
  return r;
}

test("submit: stores the append-only response, marks submitted, notifies internally", async () => {
  const r = await invitedRig();
  r.state.config["team_list"] = "team.one@dg3.com, team.two@dg3.com";
  const res = await r.sbm.sbmSubmit(postSubmit({ t: r.token, rating: 4, q_guests: "Always helpful and she knows what is right and wrong", q_final: "Great work ethics" }), r.env);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(r.state.requests[0].status, "submitted");
  assert.equal(r.state.responses.length, 1);
  assert.equal(r.state.responses[0].rating, 4);
  assert.equal(r.state.responses[0].q_guests, "Always helpful and she knows what is right and wrong");
  assert.equal(r.state.responses[0].ip, "203.0.113.9");
  // internal notification: To Rita, cc Miguel + team list; green pill for >=3; pull-quotes; console link
  const note = r.outbox.find(e => e.templateId === "hr.sbm.notify.v1");
  assert.deepEqual(note.to, ["rita.berenyi@dg3.com"]);
  assert.deepEqual(note.cc, ["miguel.sanmartin@dg3.com", "team.one@dg3.com", "team.two@dg3.com"]);
  assert.match(note.subject, /Murillo/);
  assert.match(note.subject, /4\/5/);
  assert.match(note.html, /EVAL &ge; 3/);
  assert.match(note.html, /Always helpful and she knows what is right and wrong/);
  assert.match(note.html, /cims\.test/);
});

test("submit: rating is required and must be 1-5", async () => {
  for (const bad of [undefined, 0, 6, "abc", 3.5]) {
    const r = await invitedRig();
    const body = { t: r.token, q_final: "nice" };
    if (bad !== undefined) body.rating = bad;
    const res = await r.sbm.sbmSubmit(postSubmit(body), r.env);
    assert.equal(res.status, 400, "rating " + String(bad) + " must be rejected");
    assert.equal((await res.json()).error, "rating_required");
    assert.equal(r.state.responses.length, 0);
    assert.equal(r.state.requests[0].status, "sent"); // untouched
  }
});

test("submit: the token is single-use — a second submission is refused, evidence untouched", async () => {
  const r = await invitedRig();
  await r.sbm.sbmSubmit(postSubmit({ t: r.token, rating: 5 }), r.env);
  const res2 = await r.sbm.sbmSubmit(postSubmit({ t: r.token, rating: 1, q_final: "overwrite attempt" }), r.env);
  assert.equal(res2.status, 409);
  assert.equal((await res2.json()).already, true);
  assert.equal(r.state.responses.length, 1);
  assert.equal(r.state.responses[0].rating, 5);
});

test("submit: a 1-2 rating flags red in the internal note; crew-facing ship copy stays mechanics-free", async () => {
  const r = await invitedRig();
  r.state.config["shipmail:Navigator of the Seas"] = "printer.navigator@ship.example";
  await r.sbm.sbmSubmit(postSubmit({ t: r.token, rating: 2, q_final: "struggled with the pace" }), r.env);
  const note = r.outbox.find(e => e.templateId === "hr.sbm.notify.v1");
  assert.match(note.html, /EVAL 1&ndash;2/);
  assert.doesNotMatch(note.html, /EVAL &ge; 3/);
  const crewCopy = r.outbox.find(e => e.templateId === "hr.sbm.crewcopy.v1");
  assert.deepEqual(crewCopy.to, ["printer.navigator@ship.example"]);
  assert.match(crewCopy.html, /struggled with the pace/);
  assert.doesNotMatch(crewCopy.html, /sEval|Score Card|gate|bonus/i); // spec §8: no score mechanics to the seafarer
});

test("submit: garbage or foreign tokens are 401", async () => {
  const r = await invitedRig();
  const res = await r.sbm.sbmSubmit(postSubmit({ t: "not-a-token", rating: 4 }), r.env);
  assert.equal(res.status, 401);
  const fb = await signToken({ p: "fb", crewId: "x", role: "ray", exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  const res2 = await r.sbm.sbmSubmit(postSubmit({ t: fb, rating: 4 }), r.env);
  assert.equal(res2.status, 401);
  assert.equal(r.state.responses.length, 0);
});

/* ------------------------------ form page -------------------------------- */

test("GET /sbm renders the prefilled survey for a live token", async () => {
  const r = await invitedRig();
  const res = await r.sbm.sbmFormPage(null, r.env, new URL("https://cims.test/sbm?t=" + r.token));
  const page = await res.text();
  assert.match(page, /Maria Katrina Rica Murillo/);
  assert.match(page, /Navigator of the Seas/);
  assert.match(page, /ROYAL CARIBBEAN INTERNATIONAL/);
  assert.ok(page.includes(sbmDateLong(T7_OFF)), "rendered sign-off must show the leg's long date");
  assert.match(page, /On board since Jan 2026/);
  assert.match(page, /rita\.berenyi@dg3\.com/);           // corrections mailto
  assert.doesNotMatch(page, /Brand variant|mocktool/);     // no mockup brand-switcher toolbar
});

test("GET /sbm: invalid, used and expired tokens get the friendly closed page", async () => {
  const r = await invitedRig();
  const bad = await (await r.sbm.sbmFormPage(null, r.env, new URL("https://cims.test/sbm?t=junk"))).text();
  assert.match(bad, /link has expired/);
  await r.sbm.sbmSubmit(postSubmit({ t: r.token, rating: 5 }), r.env);
  const used = await (await r.sbm.sbmFormPage(null, r.env, new URL("https://cims.test/sbm?t=" + r.token))).text();
  assert.match(used, /already in/);
  const none = await (await r.sbm.sbmFormPage(null, r.env, new URL("https://cims.test/sbm"))).text();
  assert.match(none, /link has expired/);
});

/* -------------------- the no-bonus-mechanics guarantee -------------------- */

test("NOTHING the shipboard manager sees mentions bonus mechanics", async () => {
  const NO_MONEY = /bonus|seval|score card|payout|gate|forfeit|\$\d/i;
  const ctx = { name: "Maria Murillo", firstName: "Maria", ship: "Navigator of the Seas", off: T7_OFF, link: "https://cims.test/sbm?t=x" };
  assert.doesNotMatch(sbmInviteEmail(ctx).html + sbmInviteEmail(ctx).subject, NO_MONEY);
  assert.doesNotMatch(sbmReminderEmail(ctx).html + sbmReminderEmail(ctx).subject, NO_MONEY);
  assert.doesNotMatch(sbmSurveyHtml({ ...ctx, token: "x", brand: "Royal Caribbean", signOnDate: "2026-01-14" }), NO_MONEY);
  // the internal variant is the one place mechanics ARE allowed
  const internal = sbmInternalEmail({ ...ctx, lastName: "Murillo", brand: "Royal Caribbean", rating: 4, answers: {}, consoleUrl: "https://cims.test/" });
  assert.match(internal.html, /Score Card/);
});

/* ------------------------------ crew cards ------------------------------- */

test("sbmCrewCards returns the Manager Feedback cards, newest first, by agency or crew id", async () => {
  const r = await invitedRig();
  await r.sbm.sbmSubmit(postSubmit({ t: r.token, rating: 4, q_teams: "Helps Housekeeping with signs", q_final: "Would work with her again" }), r.env);
  const byAgency = await r.sbm.sbmCrewCards(r.env, "SC-0038865");
  assert.equal(byAgency.ok, true);
  assert.equal(byAgency.cards.length, 1);
  const card = byAgency.cards[0];
  assert.equal(card.ship, "Navigator of the Seas");
  assert.equal(card.brand, "Royal Caribbean");
  assert.equal(card.rating, 4);
  assert.equal(card.q_teams, "Helps Housekeeping with signs");
  assert.equal(card.contract_signon, "2026-01-14");
  assert.equal(card.contract_signoff, T7_OFF);
  const byUuid = await r.sbm.sbmCrewCards(r.env, "u-maria");
  assert.equal(byUuid.cards.length, 1);
  const nobody = await r.sbm.sbmCrewCards(r.env, "SC-0000000");
  assert.equal(nobody.cards.length, 0);
});

/* ------------------------------ helpers ---------------------------------- */

test("legs adapter + date helpers", () => {
  const legs = sbmLegsFromSections([{ crew: [{ agency_id: "SC-1", name: "A", ship: "Quest", signOn: "2026-01-01", signOff: T7_OFF }, { agency_id: "SC-2" }] }]);
  assert.equal(legs.length, 1); // undated legs dropped
  assert.deepEqual(legs[0], { sc: "SC-1", name: "A", ship: "Quest", signOnDate: "2026-01-01", off: T7_OFF });
  assert.equal(sbmPlusDays("2026-07-03", 7), "2026-07-10");
  assert.equal(sbmPlusDays("2026-12-29", 4), "2027-01-02");
  assert.equal(sbmDateLong("2026-07-10"), "10 Jul 2026");
});

/* ------------------------- adversarial-review fixes ---------------------- */

test("S1: sbmNormShip folds board names, short names and MV prefixes to one key", () => {
  assert.equal(sbmNormShip("Navigator of the Seas"), "navigator");
  assert.equal(sbmNormShip("Navigator"), "navigator");
  assert.equal(sbmNormShip("MV Navigator of the Seas"), "navigator");
  assert.equal(sbmNormShip("  Navigator   of the Seas  "), "navigator");
  assert.equal(sbmNormShip(""), "");
});

test("S1: config seeded with the board name still reaches a SHORT-named board leg", async () => {
  const r = rig({
    board: [{ agency_id: "SC-0038865", name: "Maria Murillo", ship: "Navigator", signOn: "2026-01-14", signOff: T7_OFF }],
    config: { "recipient:Navigator of the Seas": "gsm.navigator@rccl.example" },
  });
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.invited, 1);
  assert.equal(r.state.requests[0].recipient_email, "gsm.navigator@rccl.example");
  assert.deepEqual(r.outbox[0].to, ["gsm.navigator@rccl.example"]);
});

test("S1: short-key seeding still works, for recipient and shipmail alike", async () => {
  const r = rig({
    board: [{ agency_id: "SC-0038865", name: "Maria Murillo", ship: "Navigator", signOn: "2026-01-14", signOff: T7_OFF }],
    config: { "recipient:Navigator": "gsm.short@rccl.example", "shipmail:Navigator of the Seas": "printer.navigator@ship.example" },
  });
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.invited, 1);
  assert.equal(r.state.requests[0].recipient_email, "gsm.short@rccl.example");
  // shipmail seeded with the board name is found for the SHORT req.ship too
  await r.sbm.sbmSubmit(postSubmit({ t: linkToken(r.outbox[0].html), rating: 5 }), r.env);
  const crewCopy = r.outbox.find(e => e.templateId === "hr.sbm.crewcopy.v1");
  assert.deepEqual(crewCopy.to, ["printer.navigator@ship.example"]);
});

test("S3: send failures and missing recipients reach the activity log", async () => {
  let r = rig({ config: {} });                         // no recipient configured
  await r.sbm.sbmDailySweep(r.env);
  assert.ok(r.activity.some(a => a.action === "sbm_no_recipient" && a.detail.includes("Navigator of the Seas")));
  r = rig({ mailFail: true });                         // invite send failure
  await r.sbm.sbmDailySweep(r.env);
  assert.ok(r.activity.some(a => a.action === "sbm_invite_send_failed" && a.detail.includes("SC-0038865")));
  r = rig();                                           // reminder send failure
  await r.sbm.sbmDailySweep(r.env);                    // T-7 invite goes out fine
  r.flags.mailFail = true;
  r.state.today = dayN(3);                             // T-4
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.equal(res.skipped[0].reason, "reminder_send_failed");
  assert.ok(r.activity.some(a => a.action === "sbm_reminder_send_failed" && a.detail.includes("SC-0038865")));
  assert.equal(r.state.requests[0].status, "sent");    // still eligible for a clean retry
});

test("S4: sweep acts only at 08:00 Europe/Budapest (auto_send's gate, default on)", async () => {
  const r = rig({ GATE_HOUR: undefined });             // undefined -> module default "08"
  // 12:00 UTC in July = 14:00 Budapest (CEST) -> gated out, nothing happens
  const off = await r.sbm.sbmDailySweep(r.env, { scheduledTime: Date.parse(TODAY + "T12:00:00Z") });
  assert.equal(off.skipped, "not_gate_hour");
  assert.equal(r.outbox.length, 0);
  assert.equal(r.state.requests.length, 0);
  // 06:00 UTC in July = 08:00 Budapest -> runs and invites
  const on = await r.sbm.sbmDailySweep(r.env, { scheduledTime: Date.parse(TODAY + "T06:00:00Z") });
  assert.equal(on.invited, 1);
  assert.equal(r.outbox.length, 1);
});

test("N6: sbmExpiryFor returns null for malformed dates -- never exp:NaN", () => {
  assert.equal(typeof sbmExpiryFor("2026-07-10"), "number");
  assert.equal(sbmExpiryFor("garbage"), null);
  assert.equal(sbmExpiryFor(""), null);
  assert.equal(sbmExpiryFor(null), null);
  assert.equal(sbmExpiryFor(undefined), null);
});

test("N7: sbmCrewCards without an id returns apiFeedbackCrew's not_found shape", async () => {
  const r = rig();
  for (const bad of ["", "   ", null, undefined]) {
    const res = await r.sbm.sbmCrewCards(r.env, bad);
    assert.equal(res.ok, false);
    assert.equal(res.error, "not_found");
    assert.deepEqual(res.cards, []);
  }
});

/* --------------------------- master ON/OFF switch ------------------------ */

test("master switch OFF by default: absent flag -> sweep does nothing, even at the gate hour", async () => {
  const r = rig({ settings: {} });                     // no app_setting row seeded
  const res = await r.sbm.sbmDailySweep(r.env);
  assert.deepEqual(res, { skipped: "disabled" });
  assert.equal(r.outbox.length, 0);
  assert.equal(r.state.requests.length, 0);
  // checked BEFORE the hour gate: 06:00 UTC in July = 08:00 Budapest would pass
  // the S4 gate, but the switch still wins
  const g = rig({ settings: {}, GATE_HOUR: undefined });
  const res2 = await g.sbm.sbmDailySweep(g.env, { scheduledTime: Date.parse(TODAY + "T06:00:00Z") });
  assert.deepEqual(res2, { skipped: "disabled" });
  assert.equal(g.outbox.length, 0);
  assert.equal(g.state.requests.length, 0);
  // an explicit "false" row is just as OFF
  const f = rig({ settings: { sbm_enabled: "false" } });
  assert.deepEqual(await f.sbm.sbmDailySweep(f.env), { skipped: "disabled" });
});

test("master switch: flipping ON arms the sweep, flipping OFF disarms it again", async () => {
  const r = rig({ settings: {} });
  assert.deepEqual(await r.sbm.sbmDailySweep(r.env), { skipped: "disabled" });
  r.state.settings.sbm_enabled = "true";               // Rita flips the toggle ON
  const on = await r.sbm.sbmDailySweep(r.env);
  assert.equal(on.invited, 1);
  assert.equal(r.outbox.length, 1);
  r.state.settings.sbm_enabled = "false";              // and back OFF
  assert.deepEqual(await r.sbm.sbmDailySweep(r.env), { skipped: "disabled" });
  assert.equal(r.outbox.length, 1);                    // nothing more went out
});

test("master switch: deps.isEnabled override is honoured (test seam)", async () => {
  const r = rig({ settings: {} });                     // flag absent...
  const sbm2 = installSbm({ ...r.deps, isEnabled: async () => true }); // ...but override says ON
  const res = await sbm2.sbmDailySweep(r.env);
  assert.equal(res.invited, 1);
});
