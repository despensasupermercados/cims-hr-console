import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installInstr } from "../src/signoff_instructions.js";
import { installAck } from "../src/signoff_ack.js";
import { installAutoSend } from "../src/auto_send.js";
import { seatContexts, contractKey } from "../src/signoff_context.js";
import { instructionsEmail } from "../src/emails/hr.signoff.instructions.v2.js";
import { signToken, verifyToken } from "../src/auth.js";

// THE 27 OCT 2026 REVIEW OF THE SIGN-OFF EMAILS (Miguel: "fix code bugs .. and if there is any logic issue .. we are not
// building .. we are fixing issues .. gaps"). Every case here was reproduced on the code as it stood before the fix.
//  1. A mail the mailer did not take left a PENDING row. The daily run (auto_send.js manualExists) reads any row within
//     ±21 days of the sign-off as "a manual send on file" and skipped the seat for ever, and the crew page said "Not emailed
//     (no crew email on file)" about a crew whose email was right there.
//  2. The crew page keyed its row by the Counter number it was given (the same for every contract TDG's file dates, §10d),
//     the daily run by the sign-off date: a manual send after the daily one made a SECOND row and a second live link, and a
//     crew's next contract read "already_acknowledged" off the last one.
//  3. A seat the board holds for a crew TDG lists as Earmarked for the hull his contract still runs on (`earmarkedHere`,
//     §11f, Purnama on Xcel) was never instructed: seatContexts kept `current` seats only.
//  4. The daily digest's failure was never recorded: sendViaMailer answers { ok:false } and never throws (§11e).
//  5. The plain-text part printed the port's HTML escape ("St. George&#39;s").

const SECRET = "test-secret-not-a-real-key";
const OFF = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);   // a future sign-off on any day the suite runs
const KEY = Number(OFF.replace(/-/g, ""));
const sha256hex = async (s) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
};

function fakeDb() {
  const rows = [];
  const crew = { id: "crew_1", agency_id: "SC-1", first_name: "Ana", last_name: "Cruz", email: "ana@example.com" };
  return {
    rows,
    prepare(sql) {
      const st = { sql, args: [] };
      st.bind = (...a) => { st.args = a; return st; };
      st.run = async () => {
        if (/^DELETE FROM (ack_request|instr_ack) WHERE id=\?/.test(sql)) {
          for (let i = rows.length - 1; i >= 0; i--) if (rows[i].id === st.args[0]) rows.splice(i, 1);
        } else if (/^DELETE FROM (ack_request|instr_ack) WHERE sc=\? AND seq=\?/.test(sql)) {
          for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sc === st.args[0] && rows[i].seq === st.args[1]) rows.splice(i, 1);
        } else if (/^INSERT INTO (ack_request|instr_ack)/.test(sql)) {
          const [id, sc, seq, , token_hash, crew_name, vessel, port, sign_off_date, requested_by] = st.args;
          rows.push({ id, sc, seq, token_hash, status: "pending", crew_name, vessel, port, sign_off_date, requested_by });
        }
        return { meta: { changes: 1 } };
      };
      st.first = async () => {
        if (/FROM (ack_request|instr_ack) WHERE sc=\? AND seq=\?/.test(sql)) return rows.find((x) => x.sc === st.args[0] && x.seq === st.args[1]) || null;
        if (/FROM (ack_request|instr_ack) WHERE token_hash=\?/.test(sql)) return rows.find((x) => x.token_hash === st.args[0]) || null;
        if (/FROM keyman_contract3/.test(sql)) return { sc: st.args[0], seq: st.args[1], ship: "Reflection", proj_off: OFF, act_off: null };
        if (/FROM crew WHERE agency_id=\?/.test(sql)) return crew;
        return null;
      };
      st.all = async () => ({ results: [] });
      return st;
    },
  };
}

function harness(install, mailerUp = true) {
  const sent = [], logs = [];
  const up = { v: mailerUp };
  const handle = install({
    json: (o, s = 200) => new Response(JSON.stringify(o), { status: s }), htmlResponse: (b) => new Response(b),
    signToken, verifyToken, sha256hex, applyOverride: (b) => b, VESSEL_REF: [],
    logActivity: async (env, who, action, detail) => { logs.push(action + " " + detail); },
    sendViaMailer: async (env, e) => { if (!up.v) return { ok: false, error: "bad mailer response (HTTP 502)" }; sent.push(e); return { ok: true }; },
  });
  return { handle, sent, logs, up, env: { DB: fakeDb(), SESSION_SECRET: SECRET, MAILER: {} } };
}
const post = (body) => ({ method: "POST", url: "https://cims.work/x", json: async () => body, headers: { get: () => null } });

const VARIANTS = [
  ["instr", installInstr, "/api/instructions/request", "sendInstructionsFor"],
  ["ack", installAck, "/api/ack/request", "sendSignoffLinkFor"],
];

test("contractKey: the sign-off date as YYYYMMDD; without a date, the number it was given", () => {
  assert.equal(contractKey({ seq: 3, sign_off_date: "2026-10-31" }), 20261031);
  assert.equal(contractKey({ seq: 3, sign_off_date: "2026-10-31T00:00:00Z" }), 20261031);
  assert.equal(contractKey({ seq: 3, sign_off_date: null }), 3);
});

for (const [label, install, route, sender] of VARIANTS) {
  test(label + ": a manual send the mailer refuses says so and leaves no row (the daily run sends it later)", async () => {
    const h = harness(install, false);
    const res = await h.handle(route, post({ sc: "SC-1", seq: 1, send: true }), h.env, new URL("https://cims.work" + route), { email: "rita@dg3.com" });
    const b = await res.json();
    assert.equal(b.ok, false, "never ok:true over a mail that did not go");
    assert.equal(b.error, "not_sent");
    assert.equal(res.status, 502);
    assert.equal(h.env.DB.rows.length, 0, "a pending row reads as a manual send on file: the daily run would skip the seat for ever");
    assert.ok(h.logs.some((l) => /send_failed/.test(l)), "the failure is on the activity log");
  });

  test(label + ": the daily run's send the mailer refuses leaves no row, so the next morning retries", async () => {
    const h = harness(install, false);
    const r = await h.handle[sender](h.env, "SC-1", KEY, "https://cims.work", { ship: "Reflection", proj_off: OFF, act_off: null, port: null, ctx: { sc: "SC-1", ship: "Reflection", brand: "Royal", off: OFF, instruct: true } });
    assert.equal(r.emailed, false);
    assert.equal(h.env.DB.rows.length, 0);
    h.up.v = true;
    const r2 = await h.handle[sender](h.env, "SC-1", KEY, "https://cims.work", { ship: "Reflection", proj_off: OFF, act_off: null, port: null, ctx: { sc: "SC-1", ship: "Reflection", brand: "Royal", off: OFF, instruct: true } });
    assert.equal(r2.emailed, true);
    assert.equal(h.env.DB.rows.length, 1);
  });

  test(label + ": one row per contract — a manual send after the daily one replaces it, keyed by the sign-off date", async () => {
    const h = harness(install);
    await h.handle[sender](h.env, "SC-1", KEY, "https://cims.work", { ship: "Reflection", proj_off: OFF, act_off: null, port: null, ctx: { sc: "SC-1", ship: "Reflection", brand: "Royal", off: OFF, instruct: true } });
    assert.equal(h.env.DB.rows.length, 1);
    assert.equal(h.env.DB.rows[0].seq, KEY);
    const res = await h.handle(route, post({ sc: "SC-1", seq: 1, send: true }), h.env, new URL("https://cims.work" + route), { email: "rita@dg3.com" });
    assert.equal((await res.json()).ok, true);
    assert.equal(h.env.DB.rows.length, 1, "two rows = two live links for one contract");
    assert.equal(h.env.DB.rows[0].seq, KEY, "keyed by the sign-off date, never the Counter number the page sent");
  });

  test(label + ": a confirmed contract asks before re-sending, whichever path sent it", async () => {
    const h = harness(install);
    await h.handle[sender](h.env, "SC-1", KEY, "https://cims.work", { ship: "Reflection", proj_off: OFF, act_off: null, port: null, ctx: { sc: "SC-1", ship: "Reflection", brand: "Royal", off: OFF, instruct: true } });
    h.env.DB.rows[0].status = "acknowledged";
    const res = await h.handle(route, post({ sc: "SC-1", seq: 1, send: true }), h.env, new URL("https://cims.work" + route), { email: "rita@dg3.com" });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "already_acknowledged");
    assert.equal(h.env.DB.rows[0].status, "acknowledged", "the crew's confirmation is never wiped without force");
  });
}

test("a crew TDG earmarks for the hull his contract still runs on is a seat: instructed, with the hull's brand", () => {
  const sec = { ship: "Xcel", brand: "Celebrity", crew: [
    { agency_id: "SC-P", name: "Ida Purnama", ship: "Xcel", current: false, earmarkedHere: true, signOn: "2026-05-01", signOff: "2026-11-30", disembark: "Fort Lauderdale", disembarkSrc: "rita" },
  ], projections: [
    { agency_id: "SC-R", name: "Rafael Reliever", ship: "Xcel", signOn: "2026-11-28", signOff: "2027-06-28", state: "yellow" },
  ] };
  const ctx = seatContexts([sec])["SC-P"];
  assert.ok(ctx, "the board seats him (§11f), so the instructions email is his like any seat");
  assert.equal(ctx.brand, "Celebrity");
  assert.equal(ctx.off, "2026-11-30");
  assert.equal(ctx.reliever && ctx.reliever.sc, "SC-R");
  assert.equal(ctx.instruct, true);
});

test("the daily digest that did not go is recorded as digest_failed", async () => {
  let hour = null;
  for (let h = 0; h < 24 && hour == null; h++) {
    const d = new Date(Date.UTC(2026, 8, 10, h));
    if (new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false }).formatToParts(d).find((p) => p.type === "hour").value === "08") hour = d.getTime();
  }
  const runRows = [];
  const env = { DB: { prepare(sql) {
    const st = { sql, args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => { if (/INSERT INTO auto_send_run/.test(sql)) runRows.push(st.args[1]); return { meta: { changes: 1 } }; };
    st.first = async () => (/app_setting/.test(sql) ? { v: "true" } : null);
    st.all = async () => ({ results: [] });
    return st;
  } } };
  const run = installAutoSend({
    sendInstructionsFor: async () => ({ emailed: true }), sendSignoffLinkFor: async () => ({ emailed: true }),
    sendViaMailer: async () => ({ ok: false, error: "bad mailer response (HTTP 502)" }),
    BOARD_LEGS: async () => [], ORIGIN: "https://cims.work", DIGEST_TO: ["m@x"], DIGEST_CC: [],
  });
  await run(env, { scheduledTime: hour });
  assert.ok(runRows.includes("digest_failed"), "a digest the mailer refused is recorded: " + JSON.stringify(runRows));
});

test("the plain-text part carries the port as written, never its HTML escape", () => {
  const m = instructionsEmail({ firstName: "Ana", ship: "Reflection", brand: "Celebrity", signOff: "2026-11-20", port: "St. George's, Bermuda", reliever: null, link: "https://cims.work/instr?t=x", today: "2026-11-06" });
  assert.match(m.text, /You sign off 20 Nov( 2026)? in St\. George's\./);
  assert.doesNotMatch(m.text, /&#39;|&amp;/);
});

test("the crew page sends once per click and says when the mailer did not take it", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const body = W.slice(W.indexOf("async function sfSend("), W.indexOf("async function sendReviewInvite("));
  assert.match(body, /if\(_sfBusy\[k\]\)return;/, "a second press while the first is on its way does nothing");
  assert.match(body, /r\.error==='not_sent'/, "a refused mail is said, never 'no crew email on file'");
  assert.match(body, /r\.error==='already_acknowledged'[^\n]*confirm\(/, "a confirmed contract asks before re-sending");
  assert.match(W, /async function sendSignoffInstructions\(id,seq\)\{return sfSend\('instr'/);
  assert.match(W, /async function sendSignoffLink\(id,seq\)\{return sfSend\('link'/);
});
