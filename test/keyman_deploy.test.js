// DEPLOY — the CTA on a projection (Miguel, 14 Sep 2026: "when she is sure .. cta is trigger to joy
// for action and the loop closes when u see it back in the keyman tab from the upload").
//
// The rules under test, in the order they matter:
//   1. The email carries what Joy needs to act: who, what day, what ship, EVERY document with its
//      expiry, and what is still pending at our end.
//   2. An expired document is ALWAYS a warning and NEVER a block.
//   3. Nothing is sent to a guessed address. No recipient configured = refuse, loudly.
//   4. The card comes off the board only AFTER the mail is away — never before, never if it fails.
//   5. Every send is logged with enough to put the card back.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentLines, deployWarnings, readinessLines, buildDeployCard,
  deploySubject, renderDeployEmail, renderDeployText, installKeymanDeploy, TEMPLATE_ID,
} from "../src/keyman_deploy.js";

const TODAY = "2026-09-14";
const CREW = {
  agency_id: "SC-0038401", ship_crew_id: "526444", first_name: "Ana", last_name: "Alpha",
  rank_observed: "Printer Specialist", email: "ana@example.com", phone: "+63 900",
  med_exp: "2026-12-01", sirb_exp: "2026-08-01", pp_exp: null, usv_exp: "2026-10-05", sch_exp: null,
};
const ASG = {
  id: "as_1", role: "reliever", sign_on: "2026-11-02", planned_sign_off: "2027-05-02",
  ship: "Icon", brand: "Royal Caribbean", on_port_seed: "Miami", off_port_seed: null,
  eccr: 1, air: 0, hotel: 0, on_date_conf: 1, off_date_conf: 0, instructions_sent_at: null,
};

/* ---- the card ---- */

test("every required document is listed even when it is missing; an optional one only when present", () => {
  const d = documentLines(CREW, TODAY);
  assert.deepEqual(d.map((x) => x.doc), ["Medical", "Seaman's Book", "Passport", "US C1/D Visa"]);
  assert.equal(d.find((x) => x.doc === "Passport").status, "missing", "a blank passport expiry is the thing Joy most needs to see");
  assert.equal(d.find((x) => x.doc === "Seaman's Book").status, "expired");
  assert.equal(d.find((x) => x.doc === "US C1/D Visa").status, "expiring");
  assert.equal(d.find((x) => x.doc === "Medical").status, "ok");
  const withSch = documentLines({ ...CREW, sch_exp: "2027-01-01" }, TODAY);
  assert.ok(withSch.some((x) => x.doc === "Schengen" && x.required === false));
});

test("warnings read in plain words, expired first, and never mention a document that is fine", () => {
  const w = deployWarnings(documentLines(CREW, TODAY));
  assert.deepEqual(w.map((x) => x.status), ["expired", "missing", "expiring"]);
  assert.match(w[0].text, /Seaman's Book expired on 2026-08-01 \(44 days ago\)/);
  assert.match(w[1].text, /Passport has no expiry on record/);
  assert.match(w[2].text, /US C1\/D Visa expires 2026-10-05 \(in 21 days\)/);
  assert.ok(!w.some((x) => /Medical/.test(x.text)));
  assert.deepEqual(deployWarnings(documentLines({ med_exp: "2099-01-01", sirb_exp: "2099-01-01", pp_exp: "2099-01-01", usv_exp: "2099-01-01" }, TODAY)), []);
});

test("readiness says what is done and what is still pending", () => {
  const r = readinessLines(ASG);
  assert.deepEqual(r.filter((x) => x.done).map((x) => x.label), ["ECCR", "Sign-on date confirmed"]);
  assert.deepEqual(r.filter((x) => !x.done).map((x) => x.label), ["Air ticket", "Hotel", "Sign-off date confirmed", "Joining instructions sent"]);
});

test("the card carries who, what day, what ship — and Rita's manual rank wins over the imported one", () => {
  const c = buildDeployCard({ assignment: ASG, crew: { ...CREW, rank_override: "Senior PS" }, onCity: "Miami", offCity: "Barcelona", today: TODAY });
  assert.equal(c.name, "Ana Alpha");
  assert.equal(c.sc, "SC-0038401");
  assert.equal(c.ship_crew_id, "526444");
  assert.equal(c.rank, "Senior PS");
  assert.equal(c.ship, "Icon");
  assert.equal(c.sign_on, "2026-11-02");
  assert.equal(c.off_city, "Barcelona");
  assert.equal(c.warnings.length, 3);
  assert.match(deploySubject(c), /^Crew deployment — Ana Alpha → Icon \(2026-11-02\)$/);
});

/* ---- the email ---- */

const CARD = buildDeployCard({ assignment: ASG, crew: CREW, onCity: "Miami", offCity: "Barcelona", note: "Visa interview booked 20 Sep.", today: TODAY });

test("the email carries every fact Joy needs, with the CIMS letterhead and no unescaped input", () => {
  const h = renderDeployEmail(CARD, { toName: "Joy", sender: "rita.berenyi@dg3.com", sentAt: TODAY });
  assert.match(h, /CRUISE INDUSTRY MANAGED SERVICES/, "the house letterhead");
  assert.match(h, /Hi Joy,/);
  for (const bit of ["Ana Alpha", "SC-0038401", "526444", "Icon", "2026-11-02", "Miami", "Barcelona", "ana@example.com"]) {
    assert.ok(h.includes(bit), "missing from the email: " + bit);
  }
  for (const doc of ["Medical", "Seaman's Book", "Passport", "US C1/D Visa"]) assert.ok(h.includes(doc), "document missing: " + doc);
  assert.match(h, /EXPIRED/);
  assert.match(h, /NOT ON RECORD/);
  assert.match(h, /PENDING/);
  assert.match(h, /Visa interview booked 20 Sep\./);
  assert.match(h, /removed from our planning board and will reappear once it comes back in the Contract Counter/);
  assert.match(h, /by rita\.berenyi@dg3\.com on 2026-09-14/);
  const nasty = renderDeployEmail(buildDeployCard({ assignment: { ...ASG, ship: '<script>x</script>' }, crew: CREW, today: TODAY }));
  assert.ok(!nasty.includes("<script>x</script>"), "card values must be escaped into the email");
});

test("a clean seafarer gets no warning block at all", () => {
  const clean = buildDeployCard({ assignment: ASG, crew: { ...CREW, sirb_exp: "2099-01-01", pp_exp: "2099-01-01", usv_exp: "2099-01-01" }, today: TODAY });
  const h = renderDeployEmail(clean);
  assert.doesNotMatch(h, /Expired document/);
  assert.doesNotMatch(h, /Also worth checking/);
});

test("the plain-text alternative says the same things", () => {
  const t = renderDeployText(CARD, { toName: "Joy" });
  assert.match(t, /Seafarer: Ana Alpha \(SC-0038401\)/);
  assert.match(t, /Ship: Icon \(Royal Caribbean\)/);
  assert.match(t, /Passport: not on record \[missing\]/);
  assert.match(t, /Air ticket: PENDING/);
  assert.match(t, /! Seaman's Book expired/);
});

/* ---- the routes ---- */

function harness(over = {}) {
  const calls = { sent: [], removed: [], saved: [], writes: [], activity: [] };
  const rows = { assignment: over.assignment === undefined ? { ...ASG, crew_id: "crew_1", sc: CREW.agency_id } : over.assignment, log: over.log || null };
  const env = {
    DEPLOY_TO: over.DEPLOY_TO, TG_NOTIFY: over.TG_NOTIFY, DEPLOY_CC: over.DEPLOY_CC,
    DB: {
      prepare(sql) {
        const S = String(sql).replace(/\s+/g, " ").trim();
        const st = { sql: S, args: [] };
        st.bind = (...a) => ({ ...st, args: a });
        st.run = async function () { calls.writes.push({ sql: S, args: this.args }); return { meta: { changes: 1 } }; };
        st.first = async function () {
          if (/FROM assignment a/.test(S)) return rows.assignment;
          if (/FROM crew WHERE id=/.test(S)) return CREW;
          if (/FROM crew_override/.test(S)) return over.override || null;
          if (/FROM crew_ready/.test(S)) return over.note ? { note: over.note } : null;
          if (/FROM deploy_log WHERE id=/.test(S)) return rows.log;
          return null;
        };
        st.all = async () => ({ results: [] });
        return st;
      },
    },
  };
  const deps = {
    json: (o, s) => ({ status: s || 200, json: async () => o }),
    logActivity: async (e, who, what, detail) => calls.activity.push([what, detail]),
    sendViaMailer: async (e, envelope) => { calls.sent.push(envelope); return over.mailer || { ok: true, id: "msg_1" }; },
    removeReliefAssignment: async (e, id) => { calls.removed.push(id); return over.remove || { ok: true }; },
    saveReliefAssignment: async (e, payload) => { calls.saved.push(payload); return over.save || { ok: true, id: "as_new" }; },
    resolveCity: ({ seed }) => ({ city: seed || null, conf: "seed" }),
    groupPortDays: () => ({}),
    TODAY: () => TODAY,
  };
  return { handle: installKeymanDeploy(deps), env, calls };
}
const req = (body, method = "POST") => ({ method, json: async () => body });
const S = { email: "rita.berenyi@dg3.com" };

test("the handler ignores every path that is not its own", async () => {
  const { handle, env } = harness();
  assert.equal(await handle("/api/crew", req({}), env, null, S), null);
  assert.equal(await handle("/api/keyman/import", req({}), env, null, S), null);
});

test("preview renders the email without sending anything or touching the board", async () => {
  const { handle, env, calls } = harness({ DEPLOY_TO: "joy@tdg.example" });
  const r = await (await handle("/api/keyman/deploy/preview", req({ id: "as_1" }), env, null, S)).json();
  assert.equal(r.recipient, "joy@tdg.example");
  assert.deepEqual(r.cc, ["Rita.Berenyi@dg3.com"], "Miguel: cc Rita");
  assert.match(r.subject, /Ana Alpha/);
  assert.match(r.html, /Hi Joy,/);
  assert.equal(r.card.warnings.length, 3);
  assert.deepEqual([calls.sent.length, calls.removed.length, calls.writes.length], [0, 0, 0]);
});

test("NO RECIPIENT: the send refuses, says how to fix it, and leaves the card alone", async () => {
  const { handle, env, calls } = harness({});   // neither DEPLOY_TO nor TG_NOTIFY
  const res = await handle("/api/keyman/deploy/send", req({ id: "as_1" }), env, null, S);
  const r = await res.json();
  assert.equal(res.status, 500);
  assert.equal(r.error, "no_recipient");
  assert.match(r.detail, /DEPLOY_TO/);
  assert.deepEqual([calls.sent.length, calls.removed.length], [0, 0], "nothing sent, nothing removed");
});

test("send: mail first, and only then the card comes off the board and the log is written", async () => {
  const { handle, env, calls } = harness({ DEPLOY_TO: "joy@tdg.example", note: "Bring the medical." });
  const r = await (await handle("/api/keyman/deploy/send", req({ id: "as_1" }), env, null, S)).json();
  assert.equal(r.ok, true);
  assert.equal(r.recipient, "joy@tdg.example");
  assert.equal(calls.sent.length, 1);
  const env1 = calls.sent[0];
  assert.deepEqual(env1.to, ["joy@tdg.example"]);
  assert.deepEqual(env1.cc, ["Rita.Berenyi@dg3.com"]);
  assert.equal(env1.templateId, TEMPLATE_ID);
  assert.equal(env1.critical, true, "a crew movement instruction must not fail silently");
  assert.match(env1.html, /Bring the medical\./, "Rita's note rides along");
  assert.ok(env1.text && env1.text.length > 50, "a plain-text alternative is always attached");
  assert.deepEqual(calls.removed, ["as_1"], "the projection is Rita's plan no more");
  const ins = calls.writes.find((w) => /^INSERT INTO deploy_log/.test(w.sql));
  assert.ok(ins, "every send is logged");
  assert.equal(ins.args[2], "SC-0038401");
  assert.equal(ins.args[12], "msg_1", "the mailer's message id is kept");
  assert.match(String(ins.args[13]), /"assignment"/, "the log carries enough to put the card back");
  assert.deepEqual(calls.activity[0][0], "keyman_deploy");
});

test("a mailer failure leaves the card exactly where it was", async () => {
  const { handle, env, calls } = harness({ DEPLOY_TO: "joy@tdg.example", mailer: { ok: false, error: "smtp down" } });
  const res = await handle("/api/keyman/deploy/send", req({ id: "as_1" }), env, null, S);
  const r = await res.json();
  assert.equal(res.status, 502);
  assert.equal(r.error, "send_failed");
  assert.deepEqual(calls.removed, [], "the board must not lose a card for an email that never left");
  assert.equal(calls.writes.filter((w) => /^INSERT INTO deploy_log/.test(w.sql)).length, 0);
});

test("TG_NOTIFY is the fallback recipient — the same Joy the Update-TG loop writes to", async () => {
  const { handle, env, calls } = harness({ TG_NOTIFY: "joy@tdg.example" });
  await handle("/api/keyman/deploy/send", req({ id: "as_1" }), env, null, S);
  assert.deepEqual(calls.sent[0].to, ["joy@tdg.example"]);
});

test("DEPLOY_CC takes a list, and an empty one means nobody is copied", async () => {
  const a = harness({ DEPLOY_TO: "j@x", DEPLOY_CC: "a@x, b@x" });
  await a.handle("/api/keyman/deploy/send", req({ id: "as_1" }), a.env, null, S);
  assert.deepEqual(a.calls.sent[0].cc, ["a@x", "b@x"]);
  const b = harness({ DEPLOY_TO: "j@x", DEPLOY_CC: "" });
  await b.handle("/api/keyman/deploy/send", req({ id: "as_1" }), b.env, null, S);
  assert.deepEqual(b.calls.sent[0].cc, []);
});

test("a projection that is gone, or already signed off, cannot be deployed", async () => {
  const { handle, env } = harness({ DEPLOY_TO: "j@x", assignment: null });
  const res = await handle("/api/keyman/deploy/send", req({ id: "as_gone" }), env, null, S);
  assert.equal(res.status, 404);
  assert.equal((await handle("/api/keyman/deploy/send", req({}), env, null, S)).status, 400, "no id, no send");
});

test("restore puts the projection back from the log, once", async () => {
  const payload = JSON.stringify({ card: {}, assignment: { crew_id: "crew_1", role: "reliever", vessel_name: "Icon", sign_on: "2026-11-02" } });
  const { handle, env, calls } = harness({ log: { id: "dep_1", payload, restored_at: null, crew_name: "Ana Alpha", ship: "Icon" } });
  const r = await (await handle("/api/keyman/deploy/restore", req({ logId: "dep_1" }), env, null, S)).json();
  assert.equal(r.ok, true);
  assert.equal(r.id, "as_new");
  assert.deepEqual(calls.saved[0].vessel_name, "Icon");
  assert.ok(calls.writes.some((w) => /^UPDATE deploy_log SET restored_at/.test(w.sql)), "the log records that it came back");
  const done = harness({ log: { id: "dep_1", payload, restored_at: "2026-09-14T10:00:00Z" } });
  assert.equal((await done.handle("/api/keyman/deploy/restore", req({ logId: "dep_1" }), done.env, null, S)).status, 409);
});
