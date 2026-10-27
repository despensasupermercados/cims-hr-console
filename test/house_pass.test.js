// THE STAFF-HOUSE PASS (27 Oct 2026). Miguel: "we will send an email .. with a link where people can book a room in
// manila .. the mail goes to the personal email and cc rita and I and Mary joy" .. "send it 3 days before a crew sign
// off .. build it and push it". Three layers, each pinned: the template (house.signoff.keycard.v1), the sender
// (house_pass.js) and its place on the auto-timing rail (auto_send.js kind "house", window T-3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { houseKeyCardEmail, daysOut, TEMPLATE_ID, BOOK_URL, HOUSE_CC, HOUSE_REPLY_TO } from "../src/emails/house.signoff.keycard.v1.js";
import { installHousePass } from "../src/house_pass.js";
import { installAutoSend } from "../src/auto_send.js";
import { mastRows } from "../src/cims-mast.js";

const plus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => plus(0);

// ----------------------------------------------------------------------------------------------------- the template
const DATA = { name: "Maria Santos", first_name: "Maria", ship: "Celebrity Reflection", signoff_date: "2026-11-03", today: "2026-10-31" };

test("template: the CIMS letterhead, Outlook-safe markup, no gradient, no rgba, every bgcolor paired", () => {
  const { html } = houseKeyCardEmail(DATA);
  assert.ok(html.includes(mastRows()), "the canonical mast rows, byte for byte");
  assert.doesNotMatch(html, /linear-gradient/);
  assert.doesNotMatch(html, /rgba\(/);
  for (const m of html.matchAll(/<(?:td|table)[^>]*bgcolor="([^"]+)"[^>]*>/g)) assert.match(m[0], /style="[^"]*background:/, "bgcolor without a paired background: " + m[0].slice(0, 80));
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /display:\s*(flex|grid)/);
});

test("template: Miguel's wording — 'Time to rest', never 'done with you'; the pass look; the book button to house.cims.work", () => {
  const { subject, html, text } = houseKeyCardEmail(DATA);
  assert.equal(subject, "Signing off in three days? Your bed in Manila is one tap away");
  assert.match(html, /Time to rest, Maria\.<br>Manila has a bed for you\./);
  assert.doesNotMatch(html + text, /done with you/i);
  assert.match(html, /STAFF HOUSE MANILA &mdash; SIGN-OFF IN 3 DAYS/);
  assert.match(html, /GUEST PASS/);
  assert.match(html, /TUE 3 NOV/, "the sign-off date on the pass");
  assert.match(html, /Celebrity Reflection/);
  assert.match(html, new RegExp('href="' + BOOK_URL.replace(/[.\/]/g, "\\$&") + '"[^>]*>Book my bed'));
  assert.match(text, new RegExp("Book my bed: " + BOOK_URL.replace(/[.\/]/g, "\\$&")));
  assert.doesNotMatch(text, /<[a-z]+[^>]*>/i, "plain text carries no markup");
  assert.match(html, /Rita\.Berenyi@dg3\.com/);
  assert.match(html, /maryjoy\.manzanares@dg3\.com/);
});

test("template: the days-out is computed from the run day, so a self-healed late send never says 'three days'", () => {
  assert.deepEqual(daysOut("2026-11-03", "2026-10-31"), { n: 3, eyebrow: "SIGN-OFF IN 3 DAYS", subject: "Signing off in three days?", intro: "three days from now" });
  assert.equal(daysOut("2026-11-03", "2026-11-01").intro, "two days from now");
  assert.equal(daysOut("2026-11-03", "2026-11-02").eyebrow, "SIGN-OFF TOMORROW");
  assert.equal(daysOut("2026-11-03", "2026-11-03").eyebrow, "SIGN-OFF TODAY");
  assert.equal(daysOut("2026-11-03", "2026-11-05").n, 0, "a passed date floors at today, never 'in -2 days'");
  assert.equal(daysOut(null, "2026-11-05").n, 3, "no dates at all: the default is the T-3 copy");
  const { subject, html } = houseKeyCardEmail({ ...DATA, today: "2026-11-02" });
  assert.match(subject, /^Signing off tomorrow\?/);
  assert.match(html, /SIGN-OFF TOMORROW/);
});

test("template: nothing but the name and the ship leaves — no national ID, no email, no passport, whatever the data carries", () => {
  const { html, text } = houseKeyCardEmail({ ...DATA, national_id: "P1234567A", passport: "XZ99", email: "maria@gmail.com", phone: "+63 900 1" });
  for (const leak of ["P1234567A", "XZ99", "maria@gmail.com", "+63 900 1"]) {
    assert.ok(!html.includes(leak), "html leaks " + leak);
    assert.ok(!text.includes(leak), "text leaks " + leak);
  }
});

test("template: a one-word name and a missing ship still render", () => {
  const { html } = houseKeyCardEmail({ name: "Jun", signoff_date: "2026-11-03", today: "2026-10-31" });
  assert.match(html, /Time to rest, Jun\./);
  assert.match(html, />your ship</);
});

// ------------------------------------------------------------------------------------------------------- the sender
function crewDb(row) {
  const asked = [];
  return { asked, DB: { prepare(sql) { const st = { sql, args: [] }; st.bind = (...a) => { st.args = a; return st; }; st.first = async () => { asked.push({ sql, args: st.args }); return /FROM crew c/.test(sql) ? row : null; }; st.run = async () => ({}); st.all = async () => ({ results: [] }); return st; } } };
}

test("sender: to the PERSONAL address (Rita's override first), cc Rita, Miguel and Maryjoy, reply-to Rita, one idempotency key per seat", async () => {
  const sent = [];
  const env = crewDb({ first_name: "Maria Luisa", last_name: "Santos", email: "maria@gmail.com", redacted: 0 });
  const { sendHousePassFor } = installHousePass({ sendViaMailer: async (_e, envelope) => { sent.push(envelope); return { ok: true }; }, today: () => "2026-10-31" });
  const r = await sendHousePassFor(env, "SC-0012345", 20261103, "https://cims.work", { ship: "Reflection", proj_off: "2026-11-03", act_off: null, port: "Freeport", ctx: { brand: "Celebrity" } });
  assert.deepEqual(r, { emailed: true, crew_name: "Maria Santos", to: "maria@gmail.com", cc: HOUSE_CC });
  assert.equal(sent.length, 1);
  const e = sent[0];
  assert.deepEqual(e.to, ["maria@gmail.com"]);
  assert.deepEqual(e.cc, ["Rita.Berenyi@dg3.com", "Miguel.Sanmartin@dg3.com", "maryjoy.manzanares@dg3.com"]);
  assert.equal(e.replyTo, HOUSE_REPLY_TO);
  assert.equal(e.templateId, TEMPLATE_ID);
  assert.equal(e.idempotencyKey, "house.signoff:SC-0012345:20261103");
  assert.equal(e.critical, false);
  assert.equal(e.subject, "Signing off in three days? Your bed in Manila is one tap away");
  assert.match(e.html, /Time to rest, Maria\./);
  assert.match(e.html, /Celebrity Reflection/, "the ship's full name off the brand");
  assert.ok(e.text && !/<[a-z]/i.test(e.text));
  assert.ok(env.asked.some((q) => /crew_override/.test(q.sql) && q.args[0] === "SC-0012345"), "the address is read through Rita's override");
});

test("sender: no address on file → not sent, hasEmail:false (the rail reports it as NO EMAIL)", async () => {
  let calls = 0;
  const env = crewDb({ first_name: "Jun", last_name: "Cruz", email: null, redacted: 0 });
  const { sendHousePassFor } = installHousePass({ sendViaMailer: async () => { calls++; return { ok: true }; } });
  const r = await sendHousePassFor(env, "SC-1", 20261103, "https://cims.work", { proj_off: "2026-11-03" });
  assert.equal(r.emailed, false); assert.equal(r.hasEmail, false); assert.equal(calls, 0);
});

test("sender: redacted crew, a training visit, an unknown seat, a seat with no sign-off — nothing goes", async () => {
  let calls = 0;
  const mailer = async () => { calls++; return { ok: true }; };
  const row = { first_name: "Jun", last_name: "Cruz", email: "jun@x.com", redacted: 0 };
  assert.equal((await installHousePass({ sendViaMailer: mailer }).sendHousePassFor(crewDb({ ...row, redacted: 1 }), "SC-1", 1, "o", { proj_off: "2026-11-03" })).error, "redacted");
  assert.equal((await installHousePass({ sendViaMailer: mailer }).sendHousePassFor(crewDb(row), "SC-1", 1, "o", { proj_off: "2026-11-03", ctx: { visit: true } })).error, "training_visit");
  assert.equal((await installHousePass({ sendViaMailer: mailer }).sendHousePassFor(crewDb(row), "SC-1", 1, "o", { proj_off: "2026-11-03", ctx: { instruct: false } })).error, "training_visit");
  assert.equal((await installHousePass({ sendViaMailer: mailer }).sendHousePassFor(crewDb(null), "SC-1", 1, "o", { proj_off: "2026-11-03" })).error, "crew_not_found");
  assert.equal((await installHousePass({ sendViaMailer: mailer }).sendHousePassFor(crewDb(row), "SC-1", 1, "o", {})).error, "no_signoff");
  assert.equal(calls, 0);
});

test("sender: the mailer saying no is reported, not swallowed, so the rail retries tomorrow", async () => {
  const env = crewDb({ first_name: "Jun", last_name: "Cruz", email: "jun@x.com", redacted: 0 });
  const { sendHousePassFor } = installHousePass({ sendViaMailer: async () => ({ ok: false, error: "mailer_down" }) });
  const r = await sendHousePassFor(env, "SC-1", 20261103, "https://cims.work", { proj_off: "2026-11-03" });
  assert.equal(r.emailed, false); assert.equal(r.error, "mailer_down"); assert.equal(r.to, "jun@x.com");
});

// --------------------------------------------------------------------------------------------------------- the rail
function gateHourInstant() {
  for (let h = 0; h < 24; h++) {
    const d = new Date(Date.UTC(2026, 10, 2, h, 0, 0));
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false }).formatToParts(d).find((p) => p.type === "hour").value;
    if (hour === "08") return d;
  }
  throw new Error("no UTC hour maps to 08:00 Europe/Budapest");
}

// settings: the app_setting rows at the start of the run (null = absent). The stub honours INSERT OR IGNORE, so the
// first-run seeding is visible to the reads that follow it, as in D1.
function rail({ legs, settings = {}, ackRows = [], withHouse = true }) {
  const S = { ...settings };
  const digests = [], marked = [], house = [], instr = [], link = [], asked = [];
  const env = {
    DB: {
      prepare(sql) {
        const st = { sql, args: [] };
        st.bind = (...a) => { st.args = a; return st; };
        st.run = async () => {
          if (/INSERT OR REPLACE INTO auto_send_log/.test(sql)) marked.push({ sc: st.args[0], seq: st.args[1], kind: st.args[2], note: st.args[4] });
          const m = sql.match(/INSERT OR IGNORE INTO app_setting \(k,v\) VALUES \('([a-z_]+)',(?:'([a-z]+)'|\?)\)/);
          if (m && S[m[1]] == null) S[m[1]] = m[2] != null ? m[2] : st.args[0];
          return { meta: { changes: 1 } };
        };
        st.first = async () => {
          asked.push(sql);
          if (/SELECT v FROM app_setting/.test(sql)) return S[st.args[0]] == null ? null : { v: S[st.args[0]] };
          if (/FROM auto_send_log WHERE/.test(sql)) return marked.find((m) => m.sc === st.args[0] && m.seq === st.args[1] && m.kind === st.args[2]) ? { 1: 1 } : null;
          if (/FROM (instr_ack|ack_request)/.test(sql)) return ackRows.find((r) => r.sc === st.args[0]) || null;
          return null;
        };
        st.all = async () => (/FROM crew c/.test(sql) ? { results: legs.map((l) => ({ agency_id: l.sc, email: l.email === undefined ? "crew@example.com" : l.email, redacted: 0 })) } : { results: [] });
        return st;
      },
    },
  };
  const deps = {
    sendInstructionsFor: async (_e, sc, seq) => { instr.push({ sc, seq }); return { emailed: true, to: "crew@example.com" }; },
    sendSignoffLinkFor: async (_e, sc, seq) => { link.push({ sc, seq }); return { emailed: true, to: "crew@example.com" }; },
    sendViaMailer: async (_e, envelope) => { digests.push(envelope); return { ok: true }; },
    BOARD_LEGS: async () => legs, ORIGIN: "https://cims.work", DIGEST_TO: ["miguel@dg3.com"], DIGEST_CC: ["rita@dg3.com"],
  };
  if (withHouse) deps.sendHousePassFor = async (_e, sc, seq, _o, ovr) => { house.push({ sc, seq, off: ovr.proj_off, ship: ovr.ship, ctx: ovr.ctx }); return { emailed: true, crew_name: "Crew Name", to: "crew@example.com" }; };
  const run = installAutoSend(deps);
  return { run, env, S, digests, marked, house, instr, link, asked, event: { scheduledTime: gateHourInstant().getTime() } };
}
const ON = { auto_send_house_enabled: "true", auto_send_house_since: "2026-10-27" };

test("rail: a seat three days out gets the pass once — logged as kind 'house', never twice", async () => {
  const h = rail({ legs: [{ sc: "SC-1", name: "Maria Santos", ship: "Reflection", off: plus(3), port: "Freeport", ctx: { brand: "Celebrity" } }], settings: ON });
  const r1 = await h.run(h.env, h.event);
  assert.equal(r1.ran, true);
  assert.deepEqual(h.house, [{ sc: "SC-1", seq: +plus(3).replace(/-/g, ""), off: plus(3), ship: "Reflection", ctx: { brand: "Celebrity" } }]);
  assert.deepEqual(h.marked, [{ sc: "SC-1", seq: +plus(3).replace(/-/g, ""), kind: "house", note: null }]);
  assert.deepEqual(h.instr, [], "the T-14 switch is off: nothing else went");
  assert.deepEqual(h.link, []);
  const r2 = await h.run(h.env, h.event);
  assert.equal(r2.sent, 0, "second morning: already on the log");
  assert.equal(h.house.length, 1);
});

test("rail: seven days out is NOT three — the pass waits for its own window", async () => {
  const h = rail({ legs: [{ sc: "SC-1", ship: "Reflection", off: plus(7) }, { sc: "SC-2", ship: "Voyager", off: plus(4) }], settings: ON });
  await h.run(h.env, h.event);
  assert.deepEqual(h.house, []);
  assert.deepEqual(h.marked, []);
});

test("rail: a late morning self-heals — a seat two days out that was never sent gets the pass", async () => {
  const h = rail({ legs: [{ sc: "SC-1", ship: "Reflection", off: plus(2) }], settings: { auto_send_house_enabled: "true", auto_send_house_since: plus(-10) } });
  await h.run(h.env, h.event);
  assert.equal(h.house.length, 1);
});

test("rail: a T-7 link already on file for the seat does not count as a house pass (no request table for kind 'house')", async () => {
  const off = plus(3);
  const h = rail({ legs: [{ sc: "SC-1", ship: "Reflection", off }], settings: ON, ackRows: [{ sc: "SC-1", sign_off_date: off, status: "pending" }] });
  await h.run(h.env, h.event);
  assert.equal(h.house.length, 1, "the house pass still goes");
  assert.deepEqual(h.marked.map((m) => m.note), [null], "not 'manual-preexisting'");
  assert.ok(!h.asked.some((q) => /FROM (instr_ack|ack_request)/.test(q)), "the rail never asked the link tables for the house kind");
});

test("rail: first run ever seeds the switch ON with today as 'since', so nobody already inside T-3 is emailed by the switch-on", async () => {
  const h = rail({ legs: [{ sc: "SC-IN", ship: "Reflection", off: plus(1) }, { sc: "SC-EDGE", ship: "Voyager", off: plus(3) }], settings: {} });
  const r = await h.run(h.env, h.event);
  assert.equal(r.ran, true);
  assert.equal(h.S.auto_send_house_enabled, "true");
  assert.equal(h.S.auto_send_house_since, today());
  assert.deepEqual(h.house.map((x) => x.sc), ["SC-EDGE"], "exactly three days out crosses the window today: sent. One day out crossed it before the switch: not sent");
  const html = h.digests[0].html;
  assert.match(html, /Staff house pass \(T-3\)/);
  assert.match(html, /inside the window at switch-on/, "the backlog is listed once so Rita can send it by hand");
  assert.match(html, /staff-house window &le; /);
});

test("rail: switched OFF by hand stays off — the seed is a one-time thing, the toggle owns the row after", async () => {
  const h = rail({ legs: [{ sc: "SC-1", ship: "Reflection", off: plus(3) }], settings: { auto_send_house_enabled: "false", auto_send_house_since: "2026-10-27" } });
  const r = await h.run(h.env, h.event);
  assert.equal(r.skipped, "disabled", "every switch off: the run records 'disabled' and sends nothing");
  assert.deepEqual(h.house, []);
  assert.equal(h.S.auto_send_house_enabled, "false");
});

test("rail: a run without the house sender wired (the older harnesses) neither seeds nor sends", async () => {
  const h = rail({ legs: [{ sc: "SC-1", ship: "Reflection", off: plus(3) }], settings: { auto_send_instr_enabled: "true", auto_send_instr_since: "2026-10-16" }, withHouse: false });
  await h.run(h.env, h.event);
  assert.equal(h.S.auto_send_house_enabled, undefined);
  assert.deepEqual(h.marked.map((m) => m.kind), ["instructions"], "the T-14 email went as before; no house mark");
  assert.deepEqual(h.house, []);
});

test("rail: a crew with no address is a NO EMAIL alert for the house pass too, and comes back tomorrow", async () => {
  const h = rail({ legs: [{ sc: "SC-1", name: "No Mail", ship: "Reflection", off: plus(3), email: null }], settings: ON });
  const r = await h.run(h.env, h.event);
  assert.equal(r.alerts, 1); assert.deepEqual(h.house, []); assert.deepEqual(h.marked, []);
  assert.match(h.digests[0].html, /NO EMAIL/);
});

test("rail: a training visit never gets a house pass", async () => {
  const h = rail({ legs: [{ sc: "SC-1", ship: "Reflection", off: plus(3), ctx: { visit: true } }], settings: ON });
  await h.run(h.env, h.event);
  assert.deepEqual(h.house, []);
});
