// THE COUNT IS NOT IN THE NOTES ANY MORE (Miguel, 27 Oct 2026: the paper inventory sent to Rolando is replaced by two blind
// counts in cims-hon, stockCount.js). The reliever's pass and the T-7 confirmation say what HON now does: the incoming's
// arrival count opens at 9:00 ship time on the day the shelf becomes his, for 24 hours, by its own email; the outgoing
// cannot confirm at T-7 a count that opens at T-2. The T-14 and welcome emails are pinned in their own test files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { relieverEmail } from "../src/emails/hr.signoff.reliever.v1.js";
import { CONFIRMS, linkEmail } from "../src/emails/hr.signoff.link.v2.js";

const strip = (h) => h.replace(/<style>[^]*?<\/style>/, "").replace(/<[^>]+>/g, " ").replace(/&rsquo;/g, "'").replace(/&middot;/g, "·").replace(/\s+/g, " ");
const OUT = { name: "Kevin Leif Jugao", first: "Kevin", signOff: "2026-10-31", phone: "09171234567", email: "kevin@example.com" };
const R = { firstName: "A.J.", ship: "Pursuit", brand: "Azamara", port: "HONG KONG, CHINA", today: "2026-10-17", outgoing: OUT };

test("the reliever's pass: the arrival count opens on the day the shelf becomes his, by its own email", () => {
  const after = relieverEmail({ ...R, relieverOn: "2026-11-02" });
  assert.match(strip(after.html), /Count the shelf when it becomes yours\. Your arrival count opens at 9:00 ship time on 2 Nov, the day you join, for 24 hours; the link comes in its own email\. It is blind, and any gap you find goes against Kevin\./);
  assert.match(after.text, /3\. Count the shelf: your arrival count opens at 9:00 ship time on 2 Nov, the day you join, for 24 hours, by its own email\./);
  // Joining before the sign-off: the shelf is still Kevin's until he leaves.
  const overlap = relieverEmail({ ...R, relieverOn: "2026-10-24" });
  assert.match(strip(overlap.html), /opens at 9:00 ship time on 31 Oct, the day Kevin signs off, for 24 hours/);
  assert.match(relieverEmail({ ...R, relieverOn: null }).text, /opens at 9:00 ship time on the day the shelf becomes yours/, "no date on record names no day");
  for (const e of [after, overlap]) assert.doesNotMatch(e.html + e.text, /sign your own count|signed count|Count and sign/i);
});

test("the plain text names the outgoing as written, never an HTML escape", () => {
  const e = relieverEmail({ ...R, relieverOn: "2026-10-24", outgoing: { ...OUT, first: "D'Angelo", name: "D'Angelo Cruz" } });
  assert.match(e.text, /the day D'Angelo signs off/);
  assert.doesNotMatch(e.text, /&#39;|&amp;/);
});

test("T-7: the crew confirms the notes are submitted, never a count that has not opened yet", () => {
  const items = CONFIRMS("Azamara Pursuit", "Hong Kong");
  assert.ok(items.includes("My Digital Handover Notes are submitted."));
  assert.ok(items.every((s) => !/count/i.test(s)), "the final count opens two days before the sign-off, after this email");
  const e = linkEmail({ firstName: "Kevin", ship: "Pursuit", brand: "Azamara", signOff: "2026-10-31", port: "HONG KONG, CHINA", today: "2026-10-24", link: "https://cims.work/ack?t=x" });
  assert.doesNotMatch(e.html + e.text, /count is signed/);
});
