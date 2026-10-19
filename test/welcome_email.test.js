// THE WELCOME ABOARD EMAIL (19 Oct 2026): the context off the board, the template, the signed-in preview. It never sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { welcomeEmail, RITA_BOOK_URL } from "../src/emails/hr.welcome.v1.js";
import { welcomeContext, predecessorOf, currentLeg } from "../src/welcome_context.js";
import { installHub, HUB_DDL } from "../src/crew_hub_routes.js";
import { mastRows } from "../src/cims-mast.js";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const LEGS = [
  { sc: "SC-1", name: "Archie Corpin", ship: "Grandeur of the Seas", brand: "Royal", on: "2026-10-18", off: "2027-05-18", is_current: true, ours: true, offSource: "projected", embark: "Baltimore" },
  { sc: "SC-2", name: "Mark Joseph Dela Rosa", ship: "Grandeur of the Seas", brand: "Royal", on: "2026-02-28", off: "2026-10-20", is_current: true, ours: true },
  { sc: "SC-3", name: "Old Timer", ship: "Grandeur of the Seas", brand: "Royal", on: "2025-01-01", off: "2025-08-01", is_current: false, ours: true },
  { sc: "SC-4", name: "Trainer Visit", ship: "Grandeur of the Seas", brand: "Royal", on: "2026-10-01", off: "2026-10-17", is_current: false, ours: true, visit: true },
];
const CREW = { agency_id: "SC-1", first_name: "Archie", last_name: "Corpin", rank_observed: null };
const LINKS = { hub: "https://cims.work/hub/TOKEN", expense: "https://cims.work/hub/expense.xlsx" };

test("node:sqlite is available, so the preview route test actually runs", () => assert.ok(DatabaseSync));

test("context: the running contract, the person handing over (never a visit, never an old contract), the next payday", () => {
  const c = welcomeContext({ crew: CREW, legs: LEGS, today: "2026-10-19", links: LINKS });
  assert.equal(c.ship, "Grandeur of the Seas");
  assert.equal(c.shipShort, "Grandeur");
  assert.equal(c.code, "GR");
  assert.equal(c.port, "Baltimore");
  assert.equal(c.on, "18 Oct 2026");
  assert.equal(c.off, "18 May 2027");
  assert.equal(c.months, "7 months");
  assert.deepEqual(c.prev, { sc: "SC-2", name: "Mark Joseph Dela Rosa", first: "Mark", since: "28 Feb 2026" });
  assert.equal(c.nextPay, "Wed 4 Nov");
  assert.equal(c.position, "Printer Specialist");
  assert.equal(predecessorOf(LEGS.filter((l) => l.sc !== "SC-2"), currentLeg(LEGS, "SC-1")), null, "no one within the window: nobody is named");
  assert.equal(welcomeContext({ crew: { ...CREW, agency_id: "SC-9" }, legs: LEGS, today: "2026-10-19" }), null, "no running contract: nothing to welcome");
  assert.equal(welcomeContext({ crew: CREW, legs: [{ ...LEGS[0], off: "2027-03-20" }], today: "2026-10-19" }).months, "5 mo 2 d");
});

test("template: the letterhead, the pass, the hub card, no placeholder link, no gendered pronoun", () => {
  const c = welcomeContext({ crew: CREW, legs: LEGS, today: "2026-10-19", links: LINKS });
  const m = welcomeEmail(c);
  assert.equal(m.subject, "Welcome aboard Grandeur of the Seas, Archie");
  assert.ok(m.html.includes(mastRows()), "the canonical letterhead, byte for byte");
  for (const s of ["Welcome aboard, Archie.", "Grandeur is yours since 18 Oct 2026.", "WELCOME PASS", "DAY 1 &middot; 18 OCT", "via Baltimore", "7 months", "18 May 2027",
    "Sign-off projected &middot; TDG confirms it later.", "Mark Joseph Dela Rosa", "Mark&rsquo;s Digital Handover Notes are waiting for you", "Read Mark&rsquo;s notes",
    "There is more on the other side.", "Wed 4 Nov", "Open my Crew Hub", LINKS.hub, LINKS.expense]) assert.ok(m.html.includes(s), s);
  assert.doesNotMatch(m.html, /#LINK|\bHis\b|\bhe leaves\b|rgba\(|gradient/);
  assert.doesNotMatch(m.html, /Pick a time|Open the training|Standard Operating Procedures/, "a link not given is no button");
  // "from today" only on the sign-on day (the send's day since 19 Oct 2026); a catch-up says "since", a preview before it "from".
  const onDay = welcomeEmail(welcomeContext({ crew: CREW, legs: LEGS, today: "2026-10-18", links: LINKS }));
  assert.ok(onDay.html.includes("Grandeur is yours from today.") && onDay.text.includes("Grandeur is yours from today."));
  assert.ok(welcomeEmail(welcomeContext({ crew: CREW, legs: LEGS, today: "2026-10-15", links: LINKS })).html.includes("Grandeur is yours from 18 Oct 2026."));
  assert.ok(m.text.includes("Grandeur is yours since 18 Oct 2026."));
  assert.match(m.text, /Your Crew Hub: https:\/\/cims\.work\/hub\/TOKEN/);
  // Day 7 (Miguel, 19 Oct 2026): Rita's calendar, booked whenever the crew needs, in the HTML and the plain text.
  assert.ok(m.html.includes("Here is Rita&rsquo;s calendar: book a time with her whenever you need."));
  assert.ok(m.html.includes('href="' + RITA_BOOK_URL + '"') && m.html.includes("Book a time with Rita"));
  assert.ok(m.text.includes("Book a time on her calendar whenever you need: " + RITA_BOOK_URL));
  // The Expense Report button (option A): solid navy, "Download the form", no arrow.
  assert.match(m.html, /bgcolor="#1B3A5C"[^>]*><a href="https:\/\/cims\.work\/hub\/expense\.xlsx"[^>]*>Download the form<\/a>/);
  assert.doesNotMatch(m.html, /Download &darr;/);
  // Day 15 books on Rita's calendar too; the Rita buttons carry the calendar icon (served by the hub), no button has an arrow.
  assert.ok(m.html.includes("Then one call a month. Book it on Rita&rsquo;s calendar."));
  assert.equal((m.html.match(/>Book a time with Rita</g) || []).length, 2);
  assert.match(m.text, /Day 15: expectations call\. Book it on Rita's calendar: https:\/\/bookings\.cloud\.microsoft\//);
  assert.doesNotMatch(m.html, /&rarr;|&darr;|Rita sends you a time/);
  const withIcon = welcomeEmail({ ...c, links: { ...LINKS, icons: "https://hub.cims.work/hub/i" } }).html;
  assert.equal((withIcon.match(/<img src="https:\/\/hub\.cims\.work\/hub\/i\/calendar\.png" width="16" height="16" alt=""/g) || []).length, 2);
  assert.match(RITA_BOOK_URL, /^https:\/\/bookings\.cloud\.microsoft\/book\/DG3RitaBerenyi@dg3\.com\//);
  const withLinks = welcomeEmail({ ...c, links: { ...LINKS, training: "https://t.example", onboarding: "https://o.example", review: "https://r.example", sops: "https://s.example", book: "https://b.example" } }).html;
  for (const s of ["Open the training", "https://o.example", "https://r.example", "Standard Operating Procedures", "Book time with me"]) assert.ok(withLinks.includes(s), s);
  assert.doesNotMatch(withLinks, /Rita sends you a time/);
});

test("template: no predecessor on record drops the block; TDG's date says so; names are escaped", () => {
  const c = welcomeContext({ crew: { ...CREW, first_name: "<b>Ann</b>" }, legs: [{ ...LEGS[0], offSource: "tdg" }], today: "2026-10-19", links: LINKS });
  const h = welcomeEmail(c).html;
  assert.doesNotMatch(h, /You take over from|TAKE OVER/i);
  assert.match(h, /Read the handover notes/);
  // Uniforms come from the shipboard manager by the brand's title, never the person handing over (Miguel, 19 Oct 2026).
  assert.match(h, /Uniforms: ask your GSM \(Guest Services Manager\) for the Uniform Request Form\./);
  assert.doesNotMatch(welcomeEmail(welcomeContext({ crew: CREW, legs: LEGS, today: "2026-10-19", links: LINKS })).html, /ask Mark for the Uniform|before Mark signs off/);
  const cel = welcomeEmail(welcomeContext({ crew: CREW, legs: [{ ...LEGS[0], brand: "Celebrity" }], today: "2026-10-19", links: LINKS }));
  assert.match(cel.html, /ask your DCM \(Digital Communication Manager\)/);
  assert.match(cel.text, /Uniforms: ask your DCM \(Digital Communication Manager\) for the Uniform Request Form\./);
  assert.match(welcomeEmail(welcomeContext({ crew: CREW, legs: [{ ...LEGS[0], brand: "Azamara" }], today: "2026-10-19", links: LINKS })).html, /ask your BOM \(Business Operations Manager\)/);
  assert.match(welcomeEmail(welcomeContext({ crew: CREW, legs: [{ ...LEGS[0], brand: null }], today: "2026-10-19", links: LINKS })).html, /ask your shipboard manager for the Uniform Request Form/);
  assert.match(h, /Sign-off confirmed by TDG\./);
  assert.doesNotMatch(h, /<b>Ann<\/b>/);
  assert.match(h, /&lt;b&gt;Ann&lt;\/b&gt;/);
});

test("preview route: signed in only, no real link made (its hub button opens the console preview), and nothing is sent", async () => {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE crew (id TEXT, agency_id TEXT, first_name TEXT, last_name TEXT, rank_observed TEXT, baseline_count INTEGER)");
  d.exec("CREATE TABLE activity_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, detail TEXT, at TEXT)");
  d.exec("INSERT INTO crew VALUES ('c1','SC-1','Archie','Corpin',NULL,NULL), ('c9','SC-9','Ashore','Crew',NULL,NULL)");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null, run: async () => ({ meta: { changes: d.prepare(sql).run(...args).changes } }) });
  const env = { DB: { prepare: (s) => stmt(s), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
  let sent = 0;
  env.MAILER = { fetch: async () => { sent++; return new Response("{}"); } };
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  const h = installHub({ ensure: async (e) => { for (const q of HUB_DDL) await e.DB.prepare(q).run(); }, boardLegs: async () => LEGS, bonusCount: async () => null, json, today: () => "2026-10-19" });
  const go = (id, session) => h("/api/hub/welcome", new Request("https://cims.work/api/hub/welcome?id=" + id), env, new URL("https://cims.work/api/hub/welcome?id=" + id), session);
  assert.equal((await go("SC-1", null)).status, 401);
  assert.equal((await go("SC-9", { email: "r@x" })).status, 404, "nobody to welcome without a running contract");
  const res = await go("SC-1", { email: "r@x" });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("https://cims.work/api/hub/preview?id=SC-1"), "a look never makes the crew's link");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='crew_hub_link'").get().n, 0, "nothing written by a preview");
  assert.ok(html.includes("https://cims.work/hub/expense.xlsx"));
  assert.equal(sent, 0, "a preview sends nothing");
  assert.ok(html.includes('src="https://cims.work/hub/i/calendar.png"'), "the preview carries the calendar icon from the hub");
  const icon = await h("/hub/i/calendar.png", new Request("https://cims.work/hub/i/calendar.png"), env, new URL("https://cims.work/hub/i/calendar.png"), null);
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get("Content-Type"), "image/png");
  const png = new Uint8Array(await icon.arrayBuffer());
  assert.deepEqual([...png.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], "a real PNG, no login");
  const R = readFileSync(new URL("../src/crew_hub_routes.js", import.meta.url), "utf8");
  assert.doesNotMatch(R, /MAILER|sendViaMailer/, "nothing in the hub module can send mail");
});
