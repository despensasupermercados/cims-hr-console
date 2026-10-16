// THE AUDIT EMAILS SURVIVE OUTLOOK DESKTOP (Miguel, 16 Oct 2026, over the request as Kevin Jugao's Outlook on Pursuit drew
// it: "ths emial renders pretty bad"). Outlook desktop lays mail out with Word, and Word ignores padding and margin on a
// <div>, padding on an <a> and margin on a <table>. So the lead sat jammed under the headline, the button lost its shape
// and every gap in the navy card closed up. Spacing lives on table cells only. These checks read the RENDERED html of
// every audit email, so a new line written the old way fails here, not on a ship.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mastRows } from "../src/cims-mast.js";
import { auditRequestEmail } from "../src/emails/hr.audit.request.v1.js";
import { docsInEmail } from "../src/emails/hr.audit.docsin.v1.js";
import { overdueEmail } from "../src/emails/hr.audit.overdue.v1.js";

const link = "https://audit.cims.work/audit/u/rrSWg5Y5xKN_gy8uI5CUADCd";
const machines = [
  { label: "M1", model: "C4070", serial: "AC58011021415", p43: { state: "findings", legend: { items: [{ head: "Uneven density in cyan", detail: "Bands", where: "Half tone", part: "charging pole", check: { src: "DG3 tech library", say: "Dirty charging pole." } }], line: "1 mark" } },
    mml: { kind: "machine-list", lifeOver: [{ name: "Drum Unit/K (%)", partNo: "A9VK0Y0", pct: 112, cover: "2 on board · 1 on order" }], recommendation: "Recommendation: have this machine looked at." } },
  { label: "M2", model: "C4070", serial: "AC58011021416", p43: { state: "clean", legend: {} }, mml: { kind: "machine-list", lifeOver: [] } },
  { label: "M3", model: "C4070", serial: "AC58011021417", down: "Fuser error, tech booked" },
];
const EMAILS = {
  request: auditRequestEmail({ first: "Kevin", ship: "Pursuit", auditor: "Miguel San Martin", dueAt: "2026-10-17T10:34:53.589Z", link, machines: [{}], lines: 120 }),
  reminder: auditRequestEmail({ first: "Kevin", ship: "Pursuit", auditor: "Miguel San Martin", dueAt: "2026-10-17T10:34:53.589Z", link, machines: [{}], lines: 120, reminder: true }),
  "documents in": docsInEmail({ ship: "Pursuit", crew: "Kevin Leif Jugao", auditor: "Dexter", completeAt: "2026-10-16T20:00:00Z", machines,
    count: { total: 120, diff: [{ kind: "gap", part_no: "TN626K", description: "Toner black", obp: 4, counted: 2, diff: -2 }, { kind: "timing", part_no: "DR620", diff: 1 }], extras: [{ text: "Staples", counted: 3 }] }, obpAsOf: "2026-10-13" }),
  "documents in, nothing found": docsInEmail({ ship: "Pursuit", crew: "Kevin Leif Jugao", completeAt: "2026-10-16T20:00:00Z", machines: [machines[1]], count: { total: 0 } }),
  overdue: overdueEmail({ ship: "Pursuit", crew: "Kevin Leif Jugao", dueAt: "2026-10-17T10:34:53.589Z", missing: [{ say: "Pattern 43 for M1" }, "The count"] }),
};
// The letterhead is the canonical cims-mast.js, byte-identical in every CIMS repo (CIMS email standard §1): it is not
// judged here — changing it is an estate-wide change of its own.
const body = (html) => html.replace(mastRows(), "");
const tags = (html, name) => [...body(html).matchAll(new RegExp("<" + name + "\\b[^>]*>", "g"))].map((m) => m[0]);
const styleOf = (tag) => (tag.match(/style="([^"]*)"/) || [])[1] || "";

for (const [what, mail] of Object.entries(EMAILS)) {
  test(`${what}: no <div> carries padding or margin (Word drops both)`, () => {
    const bad = tags(mail.html, "div").filter((t) => /(^|;)\s*(padding|margin)[a-z-]*\s*:/.test(styleOf(t)));
    assert.deepEqual(bad, []);
  });
  test(`${what}: no <a> carries padding, no <table> carries margin`, () => {
    assert.deepEqual(tags(mail.html, "a").filter((t) => /padding/.test(styleOf(t))), []);
    assert.deepEqual(tags(mail.html, "table").filter((t) => /margin/.test(styleOf(t))), []);
  });
  test(`${what}: iOS cannot relink its dates`, () => {
    assert.match(mail.html, /name="format-detection"/);
    assert.match(mail.html, /x-apple-data-detectors/);
  });
}

test("request: the button's padding is on its cell; the typed address is plain text on a light inset", () => {
  const h = EMAILS.request.html;
  assert.match(h, /<td[^>]*bgcolor="#3E7F2E"[^>]*style="[^"]*padding:14px 26px[^"]*"[^>]*><a href=/);
  // Outlook auto-links a URL in its own blue: on the navy card it vanished, on the light inset it reads. Still no <a>
  // around it (Mimecast rewrites links; a typed address it cannot — test/audit_request.test.js).
  assert.match(h, new RegExp('<td bgcolor="#F3F4F6"[^>]*color:#1B3A5C[^>]*>' + link.replace(/[.?/]/g, "\\$&") + "</td>"));
});
