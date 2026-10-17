import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { instructionsEmail, shipFullName, portName, managerOf, HON_URL, TEMPLATE_ID } from "../src/emails/hr.signoff.instructions.v2.js";
import { seatContexts } from "../src/signoff_context.js";
import { installInstr, INSTR_HTML } from "../src/signoff_instructions.js";
import { installAutoSend } from "../src/auto_send.js";
import { signToken, verifyToken } from "../src/auth.js";

// THE SIGN-OFF INSTRUCTIONS EMAIL, v2 (Miguel + Rita, 16 Oct 2026; Brain recnTLnsjGVcXs4EU, rec2dsh7hh8mIYwgV,
// recJIAzBJv8SDDl1N, recTAzAfzjpC0bSXX). Seven rounds on the rendered mock-up, then "shoot this email 2 week prior the
// seafarer sign off .. CC onboard support". These pin what each round settled.

const KEVIN = { firstName: "Kevin", ship: "Pursuit", brand: "Azamara", signOff: "2026-10-31", port: "HONG KONG, CHINA",
  reliever: { name: "A.J. Baleña", first: "A.J.", on: null }, link: "https://cims.work/instr?t=abc", today: "2026-10-17" };
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").replace(/ ([.,:;])/g, "$1");

test("Kevin's email: first name, Azamara title, the ship as HON lists it, the port in words, no promise to meet", () => {
  const { html, subject } = instructionsEmail(KEVIN);
  const t = text(html);
  assert.match(t, /Dear Kevin,/);
  assert.doesNotMatch(t, /Mr\. Jugao/);
  assert.match(t, /You sign off 31 Oct in Hong Kong\./);
  assert.match(t, /Digital Handover Notes\./);
  assert.match(t, /select Azamara Pursuit\. No login\./);
  assert.match(t, /your BOM \(Business Operations Manager\)/);
  assert.match(t, /You may or may not see A\.J\. aboard, so your notes must carry everything\./);
  assert.doesNotMatch(t, /in person/i, "never promise an in-person handover (rec2dsh7hh8mIYwgV)");
  assert.match(t, /A short printed copy still stays onboard for A\.J\. and your BOM/);
  assert.match(t, /Ray Guerra and Jonathan Placer Alonzo receive it/);
  assert.match(t, /Daily Planner/);
  assert.doesNotMatch(t, /Compass|Joemar/);
  assert.match(t, /Rita Berenyi/);
  assert.match(subject, /Azamara Pursuit · 31 Oct 2026 · Hong Kong/);
});

test("one call to action: Open HON is the acknowledgment link; no 'I have read' button", () => {
  const { html } = instructionsEmail(KEVIN);
  assert.doesNotMatch(html, /I have read and understood/);
  assert.equal((html.match(/>Open HON</g) || []).length, 1, "one button");
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith("mailto:"));
  assert.ok(hrefs.length >= 2 && hrefs.every((h) => h === KEVIN.link), "every link to HON goes through the acknowledgment: " + hrefs);
  assert.match(text(html), /Opening HON from this email also confirms you received these instructions\./);
});

test("the CIMS email standard: canonical letterhead, no rgba, no gradients, bgcolor paired", () => {
  const { html } = instructionsEmail(KEVIN);
  assert.match(html, /CRUISE INDUSTRY MANAGED SERVICES/);
  assert.doesNotMatch(html, /rgba\(|gradient/i);
  for (const m of html.matchAll(/bgcolor="([^"]+)"/g)) assert.ok(html.includes("background:" + m[1]), "bgcolor without its background: " + m[1]);
  const src = readFileSync(new URL("../src/emails/hr.signoff.instructions.v2.js", import.meta.url), "utf-8");
  assert.match(src, /import \{ mastRows \} from "\.\.\/cims-mast\.js";/, "the letterhead is never hand-written");
});

test("the manager title and the ship name follow the brand", () => {
  assert.deepEqual(managerOf("Royal"), ["GSM", "Guest Services Manager"]);
  assert.deepEqual(managerOf("Celebrity"), ["DCM", "Digital Communication Manager"]);
  assert.deepEqual(managerOf("Azamara"), ["BOM", "Business Operations Manager"]);
  assert.equal(shipFullName("Wonder", "Royal"), "Wonder of the Seas");
  assert.equal(shipFullName("Apex", "Celebrity"), "Celebrity Apex");
  assert.equal(shipFullName("Celebrity Compass", "Celebrity"), "Celebrity Compass");
  assert.equal(shipFullName("Pursuit", "Azamara"), "Azamara Pursuit");
  assert.equal(portName("ORLANDO (PORT CANAVERAL), FLORIDA"), "Orlando (Port Canaveral)");
  const roy = text(instructionsEmail({ ...KEVIN, ship: "Wonder", brand: "Royal" }).html);
  assert.match(roy, /your GSM \(Guest Services Manager\)/);
  assert.doesNotMatch(roy, /\bBOM\b/);
});

test("an overlap says so, and only then does the email talk about being aboard together", () => {
  const t = text(instructionsEmail({ ...KEVIN, reliever: { name: "A.J. Baleña", first: "A.J.", on: "2026-10-26" } }).html);
  assert.match(t, /You and A\.J\. Baleña overlap aboard for 5 days from 26 Oct: use them to walk A\.J\. through the ship\./);
  assert.match(t, /walk A\.J\. through it while you are both aboard/);
  assert.doesNotMatch(t, /may or may not see/);
  // a reliever who joins ON the sign-off day, or after, is no overlap
  const same = text(instructionsEmail({ ...KEVIN, reliever: { name: "A.J. Baleña", first: "A.J.", on: "2026-10-31" } }).html);
  assert.match(same, /may or may not see A\.J\. aboard/);
});

test("the HON bonus box shows only for sign-offs on or after 1 Nov 2026", () => {
  assert.doesNotMatch(instructionsEmail(KEVIN).html, /counts toward your bonus/);
  assert.match(instructionsEmail({ ...KEVIN, signOff: "2026-11-01" }).html, /counts toward your bonus/);
});

test("no reliever named yet: the email still reads, and never invents a name", () => {
  const t = text(instructionsEmail({ ...KEVIN, reliever: null }).html);
  assert.match(t, /Your reliever is not named yet\./);
  assert.match(t, /Relieved by Not named yet/);
  assert.match(t, /Your reliever must not inherit a shortage/);
  assert.match(t, /leave one for your reliever and give one to your BOM/);
});

test("names and ports are text, never markup", () => {
  const { html } = instructionsEmail({ ...KEVIN, firstName: "<b>x</b>", reliever: { name: "<script>alert(1)</script>", first: "<i>", on: null }, port: "<img src=x>" });
  assert.doesNotMatch(html, /<script>alert|<img src=x>|<b>x<\/b>|<i>/);
});

// ---- the seat context, off the Keyman board
const SECTIONS = [
  { ship: "Pursuit", brand: "Azamara", crew: [
    { agency_id: "SC-K", name: "Kevin Leif Jugao", ship: "Pursuit", current: true, signOn: "2026-05-02", signOff: "2026-10-31", disembark: "HONG KONG, CHINA" },
    { agency_id: "SC-A", name: "A.J. Lorenzo Baleña", ship: "Pursuit", tdgEarmark: true, signOn: null, signOff: null },
  ], projections: [] },
  { ship: "Wonder", brand: "Royal", crew: [
    { agency_id: "SC-V", name: "Raymond Villacortes", ship: "Wonder", current: true, signOn: "2026-03-22", signOff: "2026-10-30", disembark: "MIAMI, FLORIDA" },
    { agency_id: "SC-S", name: "Christjel Santos", ship: "Wonder", current: true, signOn: "2026-02-01", signOff: "2026-09-01" },
    { agency_id: "SC-P2", name: "Second Earmark", ship: "Wonder", state: "yellow", signOn: "2027-05-01", signOff: "2027-12-01" },
    { agency_id: "SC-P", name: "Francis Pintucan", ship: "Wonder", state: "yellow", signOn: "2026-10-28", signOff: "2027-05-28" },
  ], projections: [] },
];

test("seatContexts: the seat, its port, and the first reliever after it (TDG's undated earmark when nothing is dated)", () => {
  const X = seatContexts(SECTIONS);
  assert.equal(X["SC-K"].brand, "Azamara");
  assert.equal(X["SC-K"].port, "HONG KONG, CHINA");
  assert.deepEqual(X["SC-K"].reliever, { sc: "SC-A", name: "A.J. Lorenzo Baleña", first: "A.J.", on: null, tdg: true });
  assert.equal(X["SC-V"].reliever.sc, "SC-P", "the earliest dated sign-on after this seat");
  assert.equal(X["SC-V"].reliever.on, "2026-10-28");
  assert.ok(!X["SC-P"] && !X["SC-A"], "an earmark is never a seat to instruct");
  assert.notEqual(X["SC-V"].reliever.sc, "SC-S", "a crew aboard since before this seat is not the reliever");
});

// ---- the sender: CC onboard support, reply to Rita, the v2 template, the board's context
const sha256hex = async (s) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
function senderHarness(opts = {}) {
  const sent = [];
  const db = { prepare(sql) {
    const st = { sql, args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => ({ meta: { changes: 1 } });
    st.first = async () => {
      if (/COALESCE\(NULLIF\(o\.first_name/.test(sql)) return { fn: "A.J. Lorenzo", ln: "Baleña" };
      if (/FROM crew WHERE agency_id=\?/.test(sql)) return { id: "crew_k", agency_id: opts.sc || "SC-K", first_name: "Kevin Leif", last_name: "Jugao", email: "kevin@example.com" };
      return null;
    };
    st.all = async () => ({ results: [] });
    return st;
  } };
  const h = installInstr({
    json: (o, s = 200) => new Response(JSON.stringify(o), { status: s }), htmlResponse: (b) => new Response(b),
    signToken, verifyToken, sha256hex, logActivity: async () => {}, applyOverride: (b) => b, VESSEL_REF: [],
    instrContext: opts.ctx ? async () => opts.ctx : async (env, sc) => seatContexts(SECTIONS)[sc] || null,
    boardLegs: async () => [{ ours: true, sc: opts.sc || "SC-K", is_current: true, on: "2026-05-02", off: opts.off || "2026-10-31", ship: "Pursuit", disembark: "HONG KONG, CHINA" }],
    sendViaMailer: async (env, e) => { sent.push(e); return { ok: true }; },
  });
  return { h, sent, env: { DB: db, SESSION_SECRET: "s", MAILER: {} } };
}

// The sender refuses a sign-off already past, so these run on a fixed day (17 Oct 2026, the first T-14 run).
const ON_17_OCT = Date.UTC(2026, 9, 17, 6, 0, 0);
test("the T-14 send: v2 template, CC onboardsupport@dg3.com, reply to Rita, reliever as first name + surname", async (tc) => {
  tc.mock.timers.enable({ apis: ["Date"], now: ON_17_OCT });
  const { h, sent, env } = senderHarness();
  const ctx = seatContexts(SECTIONS)["SC-K"];
  const r = await h.sendInstructionsFor(env, "SC-K", 20261031, "https://cims.work", { ship: ctx.ship, proj_off: ctx.off, act_off: null, port: ctx.port, ctx });
  assert.equal(r.emailed, true);
  assert.equal(sent.length, 1);
  const e = sent[0];
  assert.deepEqual(e.to, ["kevin@example.com"]);
  assert.deepEqual(e.cc, ["onboardsupport@dg3.com"]);
  assert.equal(e.replyTo, "Rita.Berenyi@dg3.com");
  assert.equal(e.templateId, TEMPLATE_ID);
  assert.equal(e.critical, true);
  const t = text(e.html);
  assert.match(t, /Dear Kevin,/);
  assert.match(t, /Your reliever is A\.J\. Baleña\./, "first word of the first name + the surname, not every given name");
  assert.match(e.html, /href="https:\/\/cims\.work\/instr\?t=/);
});

test("the manual send from the crew page reads the same board context", async (tc) => {
  tc.mock.timers.enable({ apis: ["Date"], now: ON_17_OCT });
  const { h, sent, env } = senderHarness();
  const res = await h("/api/instructions/request", { method: "POST", url: "https://cims.work/x", json: async () => ({ sc: "SC-K", seq: 1, send: true }), headers: { get: () => null } },
    env, new URL("https://cims.work/api/instructions/request"), { email: "rita@dg3.com" });
  const b = await res.json();
  assert.equal(b.ok, true);
  assert.equal(b.emailed, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].cc, ["onboardsupport@dg3.com"]);
  const t = text(sent[0].html);
  assert.match(t, /You sign off 31 Oct in Hong Kong\./);
  assert.match(t, /Your reliever is A\.J\. Baleña\./);
  assert.match(t, /select Azamara Pursuit\./);
});

// 17 Oct 2026, Kevin Jugao (Pursuit): the board dated his sign-off at his reliever's embark (the file's cross-over,
// 16 Oct) while Rita typed 31 Oct and TDG still had him On board. A send from his page would have said "You sign off
// 16 Oct". A sign-off already past is never instructed — manual or automatic — and nothing is written for it.
test("a sign-off already past is never instructed: the crew page is refused, the T-14 sender skips it, nothing is written", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: ON_17_OCT });
  const past = { sc: "SC-K", ship: "Pursuit", brand: "Azamara", off: "2026-10-16", port: "HONG KONG, CHINA", reliever: null };
  const a = senderHarness({ ctx: past, off: "2026-10-16" });
  const writes = [];
  const prep = a.env.DB.prepare.bind(a.env.DB);
  a.env.DB.prepare = (sql) => { const st = prep(sql); const run = st.run; st.run = async () => { writes.push(sql); return run(); }; return st; };
  const res = await a.h("/api/instructions/request", { method: "POST", url: "https://cims.work/x", json: async () => ({ sc: "SC-K", seq: 1, send: true }), headers: { get: () => null } },
    a.env, new URL("https://cims.work/api/instructions/request"), { email: "rita@dg3.com" });
  assert.equal(res.status, 409);
  const b = await res.json();
  assert.equal(b.error, "signoff_passed");
  assert.equal(b.sign_off, "2026-10-16");
  assert.equal(a.sent.length, 0, "no email");
  assert.ok(!writes.some((w) => /^(INSERT|DELETE|UPDATE)\b[^;]*instr_ack/.test(w)), "no link issued, no acknowledgement row touched");
  const r = await a.h.sendInstructionsFor(a.env, "SC-K", 20261016, "https://cims.work", { ship: "Pursuit", proj_off: "2026-10-16", act_off: null, port: null, ctx: past });
  assert.equal(r.emailed, false);
  assert.equal(r.error, "signoff_passed");
  assert.equal(a.sent.length, 0);
  // the day itself still sends: a sign-off TODAY is not past
  const c = senderHarness({ ctx: { ...past, off: "2026-10-17" }, off: "2026-10-17" });
  const ok = await c.h.sendInstructionsFor(c.env, "SC-K", 20261017, "https://cims.work", { ship: "Pursuit", proj_off: "2026-10-17", act_off: null, port: null, ctx: { ...past, off: "2026-10-17" } });
  assert.equal(ok.emailed, true, JSON.stringify(ok));
});

test("/instr records the receipt, then forwards to HON; an expired link still points to HON", () => {
  assert.match(INSTR_HTML, /location\.replace\('https:\/\/hon\.cims\.work'\)/);
  assert.match(INSTR_HTML, /Your handover notes are still open in HON/);
  assert.ok(!INSTR_HTML.includes("${"), "a static page: no template interpolation");
  assert.equal(HON_URL, "https://hon.cims.work");
});

// ---- the per-kind switches
function gateHourInstant() {
  for (let hh = 0; hh < 24; hh++) {
    const d = new Date(Date.UTC(2026, 9, 17, hh, 0, 0));
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false }).formatToParts(d).find((p) => p.type === "hour").value;
    if (hour === "08") return d;
  }
}
function autoHarness(settings, legs) {
  const calls = { instr: [], link: [] }, digests = [];
  const env = { DB: { prepare(sql) {
    const st = { sql, args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => ({ meta: { changes: 1 } });
    st.first = async () => (/FROM app_setting/.test(sql) ? (settings[st.args[0]] != null ? { v: settings[st.args[0]] } : null) : null);
    st.all = async () => ({ results: legs.map((l) => ({ agency_id: l.sc, email: l.sc.toLowerCase() + "@x.com", redacted: 0 })) });
    return st;
  } } };
  const run = installAutoSend({
    sendInstructionsFor: async (e, sc) => { calls.instr.push(sc); return { emailed: true }; },
    sendSignoffLinkFor: async (e, sc) => { calls.link.push(sc); return { emailed: true }; },
    sendViaMailer: async (e, env2) => { digests.push(env2); return { ok: true }; },
    BOARD_LEGS: async () => legs, ORIGIN: "https://cims.work", DIGEST_TO: ["m@dg3.com"],
  });
  return { run, env, calls, digests };
}

test("instructions switched on alone: the T-14 email goes, the T-7 link never does", async (t) => {
  const today = gateHourInstant().toISOString().slice(0, 10);
  const plus = (n) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const legs = [{ sc: "SC-A", off: plus(14) }, { sc: "SC-B", off: plus(5) }];
  const h = autoHarness({ auto_send_instr_enabled: "true", auto_send_instr_since: plus(-30) }, legs);
  t.mock.timers.enable({ apis: ["Date"], now: gateHourInstant().getTime() });
  await h.run(h.env, { scheduledTime: gateHourInstant().getTime() });
  t.mock.timers.reset();
  assert.deepEqual(h.calls.instr.sort(), ["SC-A", "SC-B"]);
  assert.deepEqual(h.calls.link, [], "the T-7 link is not switched on");
});

test("switching on never emails the backlog: a seat already inside the 14 days is listed, not sent", async (t) => {
  const today = gateHourInstant().toISOString().slice(0, 10);
  const plus = (n) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  // switched on yesterday: SC-A crossed T-14 today (sends), SC-B crossed 9 days ago (inside the window at switch-on)
  const h = autoHarness({ auto_send_instr_enabled: "true", auto_send_instr_since: plus(-1) }, [{ sc: "SC-A", off: plus(14) }, { sc: "SC-B", off: plus(5) }]);
  t.mock.timers.enable({ apis: ["Date"], now: gateHourInstant().getTime() });
  await h.run(h.env, { scheduledTime: gateHourInstant().getTime() });
  t.mock.timers.reset();
  assert.deepEqual(h.calls.instr, ["SC-A"]);
  assert.match(h.digests[0].html, /inside the window at switch-on/);
  assert.doesNotMatch(h.digests[0].subject, /need email/, "a backlog row is not a missing address");
});

test("the old one-for-both switch still runs both emails", async (t) => {
  const today = gateHourInstant().toISOString().slice(0, 10);
  const plus = (n) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const h = autoHarness({ auto_send_enabled: "true" }, [{ sc: "SC-B", off: plus(5) }]);
  t.mock.timers.enable({ apis: ["Date"], now: gateHourInstant().getTime() });
  await h.run(h.env, { scheduledTime: gateHourInstant().getTime() });
  t.mock.timers.reset();
  assert.deepEqual(h.calls.instr, ["SC-B"]);
  assert.deepEqual(h.calls.link, ["SC-B"]);
});

test("everything off: nothing runs", async () => {
  const h = autoHarness({}, [{ sc: "SC-B", off: "2026-10-20" }]);
  const r = await h.run(h.env, { scheduledTime: gateHourInstant().getTime() });
  assert.equal(r.skipped, "disabled");
  assert.equal(h.calls.instr.length + h.calls.link.length, 0);
});

test("the worker feeds the board's context to both senders and keeps two switches in the rail", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.equal((W.match(/instrContext: instrSeatContext, sendViaMailer, boardLegs \}\)/g) || []).length, 1, "installed once at module level (16 Oct 2026)");
  assert.match(W, /_autoInstr\(p, request, env, url, session\)/, "the fetch handler dispatches through the module-level handle");
  assert.match(W, /return Object\.values\(seatContexts\(sections\)\)\.map/);
  assert.match(W, /id="autoToggle" onclick="autoToggleClick\(&#39;instructions&#39;\)"/);
  assert.match(W, /id="linkToggle" onclick="autoToggleClick\(&#39;signoff&#39;\)"/);
  assert.match(W, /if \(b\.kind === "instructions" \|\| b\.kind === "signoff"\) \{/);
});

// ---- 16 Oct 2026 bug hunt: the port is never the home-port SEED; a colleague aboard is not the reliever ----------------
test("seatContexts: the home-port seed is not a sign-off port; the itinerary's port is, when the date lands on it; Rita's typed port wins", () => {
  const S = [{ ship: "Allure", brand: "Royal", crew: [
    { agency_id: "SC-H", name: "Home Seed", ship: "Allure", current: true, signOn: "2026-04-01", signOff: "2026-11-01", disembark: "MIAMI, FLORIDA", disembarkSrc: "home", off_city: "MIAMI, FLORIDA", off_conf: "seed" },
    { agency_id: "SC-D", name: "Derived", ship: "Allure", current: true, signOn: "2026-04-02", signOff: "2026-11-02", disembark: "MIAMI, FLORIDA", disembarkSrc: "home", off_city: "PORT CANAVERAL, FLORIDA", off_conf: "derived" },
    { agency_id: "SC-P", name: "Provisional", ship: "Allure", current: true, signOn: "2026-04-03", signOff: "2026-11-03", disembark: "MIAMI, FLORIDA", disembarkSrc: "home", off_city: "NASSAU, BAHAMAS", off_conf: "provisional" },
    { agency_id: "SC-R", name: "Rita Typed", ship: "Allure", current: true, signOn: "2026-04-04", signOff: "2026-11-04", disembark: "BARCELONA, SPAIN", disembarkSrc: "rita", off_city: "MIAMI, FLORIDA", off_conf: "derived" },
  ], projections: [] }];
  const X = seatContexts(S);
  assert.equal(X["SC-H"].port, null, "the console's seed is where the ship LIVES, not where he signs off — the email says no port rather than a wrong one");
  assert.equal(X["SC-D"].port, "PORT CANAVERAL, FLORIDA", "the itinerary's port on that day");
  assert.equal(X["SC-P"].port, null, "a port a day away is a guess, not a sign-off port");
  assert.equal(X["SC-R"].port, "BARCELONA, SPAIN", "a typed port wins over the itinerary");
  assert.equal(seatContexts(SECTIONS)["SC-K"].port, "HONG KONG, CHINA", "a fixture without the source word reads as before");
});

test("seatContexts: a second printer aboard for months is a colleague, not the reliever; the reliever is the sign-on near the sign-off", () => {
  const S = [{ ship: "Allure", brand: "Royal", crew: [
    { agency_id: "SC-A", name: "Printer One", ship: "Allure", current: true, signOn: "2026-02-01", signOff: "2026-10-30" },
    { agency_id: "SC-B", name: "Printer Two", ship: "Allure", current: true, signOn: "2026-05-01", signOff: "2027-01-15" },  // joined 6 months before A's sign-off: the second printer
    { agency_id: "SC-C", name: "The Reliever", ship: "Allure", state: "yellow", signOn: "2026-10-25", signOff: "2027-05-25" },
  ], projections: [] }];
  const X = seatContexts(S);
  assert.equal(X["SC-A"].reliever.sc, "SC-C", "not the colleague who has been aboard since May");
  assert.equal(X["SC-B"].reliever, null, "nobody is dated to relieve the second printer yet");
  const two = seatContexts([{ ...S[0], crew: S[0].crew.slice(0, 2) }]);
  assert.equal(two["SC-A"].reliever, null, "with no card near the sign-off there is no reliever — the email says so instead of naming the colleague");
});

test("the overlap is said in the email's own words for a span (months and days past a month), from one definition", () => {
  const long = text(instructionsEmail({ ...KEVIN, reliever: { name: "A.J. Baleña", first: "A.J.", on: "2026-09-21" } }).html);
  assert.match(long, /overlap aboard for 1 month 10 days from 21 Sep/);
  const short = text(instructionsEmail({ ...KEVIN, reliever: { name: "A.J. Baleña", first: "A.J.", on: "2026-10-26" } }).html);
  assert.match(short, /overlap aboard for 5 days from 26 Oct/);
});

// 17 Oct 2026, Miguel: a training visit is a trip, not a contract (visits.js). Jonathan Placer Alonzo (SC-0041465), a
// tagged trainer, teaches A.J. Baleña aboard Pursuit (TDG's 16 Oct file: both On board, embarked the same day).
// rotationSections carries the trip on the section as `visits`, never among the seats: never instructed, no sign-off
// link, never anybody's reliever. Before the rule moved to the trip this was his id alone ("Exclude him") — he also sails
// full contracts (Rhapsody, Dec 2025 – Sep 2026), and a trip marked a full contract is a seat, instructed like anybody's.
test("a training visit: never instructed, no sign-off link, never the reliever; his full contract is instructed", async (t) => {
  const JON = "SC-0041465";
  const kevin = { agency_id: "SC-K", name: "Kevin Leif Jugao", ship: "Pursuit", current: true, signOn: "2026-05-02", signOff: "2026-10-31" };
  const aj = { agency_id: "SC-A", name: "A.J. Lorenzo Baleña", ship: "Pursuit", current: true, signOn: "2026-10-16", signOff: "2027-03-16" };
  const jonVisit = { agency_id: JON, name: "Jonathan Placer Alonzo", ship: "Pursuit", current: true, visit: true, signOn: "2026-10-16", signOff: "2026-10-24" };
  const X = seatContexts([{ ship: "Pursuit", brand: "Azamara", crew: [kevin, aj], visits: [jonVisit], projections: [] }]);
  assert.equal(X["SC-K"].reliever.sc, "SC-A", "A.J. relieves Kevin");
  assert.equal(X[JON].instruct, false, "the visit is kept, flagged");
  assert.equal(X[JON].visit, true);
  assert.equal(X["SC-K"].instruct, true);
  const alone = seatContexts([{ ship: "Pursuit", brand: "Azamara", crew: [kevin], visits: [jonVisit], projections: [] }]);
  assert.equal(alone["SC-K"].reliever, null, "only the trainer after Kevin: nobody named, never him");
  // the same man on a FULL contract is a seat like any other: instructed, and a reliever when he relieves
  const rhapsody = seatContexts([{ ship: "Rhapsody", brand: "Royal", crew: [{ agency_id: JON, name: "Jonathan Placer Alonzo", ship: "Rhapsody", current: true, signOn: "2025-12-06", signOff: "2026-09-12" }], projections: [] }]);
  assert.equal(rhapsody[JON].instruct, true, "a contract is instructed whoever sails it");

  // the senders refuse a visit, manual and automatic
  t.mock.timers.enable({ apis: ["Date"], now: ON_17_OCT });
  const a = senderHarness({ ctx: X[JON], off: "2026-10-24", sc: JON });
  const r = await a.h.sendInstructionsFor(a.env, JON, 20261024, "https://cims.work", { ship: "Pursuit", proj_off: "2026-10-24", act_off: null, port: null, ctx: X[JON] });
  assert.equal(r.emailed, false);
  assert.equal(r.error, "not_instructed");
  const res = await a.h("/api/instructions/request", { method: "POST", url: "https://cims.work/x", json: async () => ({ sc: JON, seq: 1, send: true }), headers: { get: () => null } },
    a.env, new URL("https://cims.work/api/instructions/request"), { email: "rita@dg3.com" });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "not_instructed");
  assert.equal(a.sent.length, 0);
  t.mock.timers.reset();

  // the daily run skips a visit silently for BOTH emails (Miguel, 17 Oct 2026: the 7-days-out link too — "yes")
  const today = gateHourInstant().toISOString().slice(0, 10);
  const plus = (n) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const legs = [{ sc: JON, off: plus(5), ctx: { instruct: false, visit: true } }, { sc: "SC-B", off: plus(5), ctx: { instruct: true, visit: false } }];
  const h = autoHarness({ auto_send_enabled: "true" }, legs);
  t.mock.timers.enable({ apis: ["Date"], now: gateHourInstant().getTime() });
  await h.run(h.env, { scheduledTime: gateHourInstant().getTime() });
  t.mock.timers.reset();
  assert.deepEqual(h.calls.instr, ["SC-B"]);
  assert.deepEqual(h.calls.link, ["SC-B"], "no sign-off link for a visit either");
  assert.ok(!/not_instructed/.test(JSON.stringify(h.digests)), "no daily digest alert for a visit");
  assert.doesNotMatch(readFileSync(new URL("../src/signoff_context.js", import.meta.url), "utf-8"), /SC-0041465/, "no person's id decides it any more");
});
