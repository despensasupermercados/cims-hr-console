// The 23 Oct 2026 review of the three emails wired that day (Joy's TDG fixes, the reliever's pass, the 7-day pass). Each
// test fails on the code as merged in #345 and pins the rule it broke.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOps } from "../src/ops_dashboard.js";
import { tdgFixesSend } from "../src/tdg_fixes_send.js";
import { tdgFixesEmail } from "../src/emails/hr.keyman.tdg_fixes.v1.js";
import { relieverEmail } from "../src/emails/hr.signoff.reliever.v1.js";
import { CONFIRMS, linkEmail } from "../src/emails/hr.signoff.link.v2.js";
import { installAck } from "../src/signoff_ack.js";
import { signToken, verifyToken } from "../src/auth.js";

const seat = (o) => Object.assign({ current: true, state: "green", status: "On board", eccr: false, air: false, hotel: false, offConfirmed: false, heldByFile: false }, o);
const plain = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ");

test("a held seat names ITS reliever (the board's one rule), never the colleague; no reliever = no reliever claimed", () => {
  const sections = [
    // Oasis, two printers: Alan held, relieved by Cara on 16 Oct; Ben a colleague aboard since 1 Jun (sorted first by sign-on)
    { ship: "Oasis", brand: "Royal", crew: [
      seat({ agency_id: "B", name: "Ben Dos Colleague", signOn: "2026-06-01", signOff: "2027-01-01" }),
      seat({ agency_id: "A", name: "Alan Uno Held", signOn: "2026-03-01", signOff: "2026-10-16", heldByFile: true, reliever: { sc: "C", name: "Cara Tres Relief", on: "2026-10-16" } }),
      seat({ agency_id: "C", name: "Cara Tres Relief", signOn: "2026-10-16", signOff: "2027-05-16" })] },
    // Allure: held past Rita's typed date, nobody relieving, a colleague aboard
    { ship: "Allure", brand: "Royal", crew: [
      seat({ agency_id: "E", name: "Eve Cinco Colleague", signOn: "2026-07-01", signOff: "2027-02-01" }),
      seat({ agency_id: "D", name: "Dan Cuatro Held", signOn: "2026-03-10", signOff: "2026-10-20", heldByFile: true, reliever: null })] }];
  const ops = buildOps({ today: "2026-10-23", sections, crew: [] });
  const fx = ops.tdg.fixes.filter((f) => f.kind === "held");
  const alan = fx.find((f) => f.sc === "A"), dan = fx.find((f) => f.sc === "D");
  assert.equal(alan.byName, "Cara Tres Relief"); assert.equal(alan.byOn, "2026-10-16");
  assert.equal(dan.byName, null); assert.equal(dan.byOn, null);
  const m = tdgFixesEmail({ fixes: fx, asOf: "2026-10-23", today: "2026-10-23" });
  const t = plain(m.html);
  assert.ok(t.includes("Cara Tres Relief signed on Oct 16 as the reliever."));
  assert.ok(!t.includes("Ben Dos Colleague") && !t.includes("Eve Cinco Colleague"), "a colleague is never named the reliever");
  assert.ok(t.includes("The sign-off the board has, Oct 20, has passed."), t);
  assert.doesNotMatch(t + m.text, /The reliever has signed on|the reliever has signed on/, "never a reliever the board does not know");
});

test("Joy: the same rows within a week ask once more even when another set went in between (A, A+B, A)", async () => {
  const fixes = [{ kind: "undated", sc: "SC-2", ship: "Spectrum", brand: "Royal", code: "SP", name: "Jonathan Alonzo" }];
  const key = "undated:SC-2:Spectrum";
  const sends = [{ at: "2026-10-21T09:00:00Z", detail: JSON.stringify({ key: key + "|held:SC-1:Quantum" }) }, { at: "2026-10-20T09:00:00Z", detail: JSON.stringify({ key }) }];
  const sent = [];
  const r = await tdgFixesSend({}, { send: true }, { email: "rita@dg3.com" }, {
    ops: async () => ({ today: "2026-10-23", tdg: { advq: { at: "2026-10-23" }, fixes } }), recipient: () => "joy@tdg.example", cc: () => [],
    send: async (env, m) => { sent.push(m); return { ok: true }; }, log: async () => {}, recentSends: async () => sends, now: () => "2026-10-23T15:00:00Z" });
  assert.equal(r.error, "already_sent"); assert.equal(sent.length, 0);
  assert.equal(r.lastSent, "2026-10-21T09:00:00Z", "the newest send is still the one named");
});

test("the 7-day pass: one grammar for one date, no literal &nbsp; when the ship is unknown", () => {
  assert.equal(CONFIRMS("Pursuit", null)[0], "My sign-off date above is right.");
  assert.equal(CONFIRMS("Pursuit", "Barcelona")[0], "My sign-off date and port above are right.");
  const m = linkEmail({ firstName: "Kevin", crewName: "Kevin Jugao", ship: "", signOff: "2026-10-30", link: "https://cims.work/ack?t=x", today: "2026-10-23" });
  assert.doesNotMatch(m.html, /&amp;nbsp;/);
});

test("the reliever's pass: the outgoing name is escaped in the preheader; the text never ends a name with two dots", () => {
  const e = relieverEmail({ firstName: "A.J.", ship: "Pursuit", brand: "Azamara", port: "BARCELONA, SPAIN", today: "2026-10-17", relieverOn: "2026-11-20",
    outgoing: { name: "Ma<i>ria Santos", first: "Ma<i>ria", position: "Printer Specialist", signOff: "2026-10-31", phone: "", email: "" } });
  assert.doesNotMatch(e.html, /<i>ria/);
  assert.doesNotMatch(e.text, /A\.J\.\./);
});

test("the 7-day link is never sent for a sign-off that has passed (the instructions' rule); a future one still goes", async () => {
  const sha256hex = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const mk = (off) => {
    const sent = [], rows = [];
    const db = { prepare(sql) { const st = { sql, args: [] }; st.bind = (...a) => { st.args = a; return st; };
      st.run = async () => { if (/^INSERT INTO ack_request/.test(sql)) rows.push(st.args); return { meta: { changes: 1 } }; };
      st.first = async () => (/FROM crew WHERE agency_id=\?/.test(sql) ? { id: "c", agency_id: "SC-K", first_name: "Kevin", last_name: "Jugao", email: "kevin@example.com" } : null);
      st.all = async () => ({ results: [] }); return st; } };
    const handle = installAck({ json: (o, s = 200) => new Response(JSON.stringify(o), { status: s }), htmlResponse: (b) => new Response(b), signToken, verifyToken, sha256hex,
      logActivity: async () => {}, applyOverride: (b) => b, VESSEL_REF: [],
      ackContext: async () => ({ ship: "Pursuit", brand: "Azamara", on: iso(-160), off, port: null }),
      boardLegs: async () => [{ ours: true, sc: "SC-K", is_current: true, on: iso(-160), off, ship: "Pursuit" }],
      sendViaMailer: async (env, e) => { sent.push(e); return { ok: true }; } });
    return { handle, sent, rows, env: { DB: db, SESSION_SECRET: "s", MAILER: {} } };
  };
  const req = { method: "POST", url: "https://cims.work/api/ack/request", json: async () => ({ sc: "SC-K", seq: 1, send: true }), headers: { get: () => null } };
  const past = mk(iso(-7));
  const r = await (await past.handle("/api/ack/request", req, past.env, new URL(req.url), { email: "rita@dg3.com" })).json();
  assert.equal(r.error, "signoff_passed"); assert.equal(past.sent.length, 0); assert.equal(past.rows.length, 0, "nothing filed either");
  const auto = await past.handle.sendSignoffLinkFor(past.env, "SC-K", 1, "https://cims.work", { ship: "Pursuit", proj_off: iso(-7), act_off: null, port: null, ctx: { ship: "Pursuit", brand: "Azamara", on: iso(-160), off: iso(-7), port: null } });
  assert.equal(auto.error, "signoff_passed"); assert.equal(past.sent.length, 0);
  const soon = mk(iso(7));
  const ok = await (await soon.handle("/api/ack/request", req, soon.env, new URL(req.url), { email: "rita@dg3.com" })).json();
  assert.equal(ok.ok, true); assert.equal(soon.sent.length, 1);
});
