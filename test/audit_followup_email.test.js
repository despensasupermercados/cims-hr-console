// The follow-up reminder (hr.audit.followup.v1), 20 Oct 2026. Miguel was asked "Should the owner of a follow-up get an
// email on its due date? If yes, the rendered email comes to you first" and answered yes. The render is in
// docs/mockups/audit_followup_20261020/; nothing sends it until he signs it off (CIMS email standard §5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { followupEmail } from "../src/emails/hr.audit.followup.v1.js";

const link = "https://audit.cims.work/#followups";
const F = (o) => ({ ship: "Liberty", text: "Send a Fiery back-up HDD", askedBy: "Dexter", askedAt: "2026-09-30", due: "2026-10-20", crew: "Mark T.", ...o });

test("one follow-up due: its words are the headline once, the card carries who asked and when", () => {
  const m = followupEmail({ owner: "Ray Guerra", link, due: [F({ carried: 1 })] });
  assert.equal(m.subject, "Due today · Liberty · Send a Fiery back-up HDD");
  assert.equal((m.html.match(/Send a Fiery back-up HDD\./g) || []).length, 2); // the headline and the hidden preheader, never the card again
  assert.match(m.html, /Ray, this was asked of you at a printshop audit/);
  assert.match(m.html, /2nd time/);
  assert.match(m.html, /Asked by Dexter at the audit on Sep 30, 2026 · Mark&nbsp;T\. was aboard/);
  assert.match(m.html, /Open the follow-ups/);
  assert.match(m.text, /Open the follow-ups: https:\/\/audit\.cims\.work\/#followups/);
});

test("several due the same day are ONE email, and what is past its date rides under them in red", () => {
  const m = followupEmail({ owner: "Rita", link, due: [F({ ship: "Edge", text: "Safety shoes" }), F({ ship: "Pursuit", text: "Book the hotel", crew: "Leo M.", aboardNow: "Jon P." })],
    late: [F({ ship: "Odyssey", text: "Coveralls", due: "2026-10-12" })] });
  assert.equal(m.subject, "2 follow-ups due today · Edge and Pursuit");
  assert.match(m.html, /2 follow-ups are due today\./);
  assert.match(m.html, /Still open past their date · 1/);
  assert.match(m.html, /Past Oct 12</);
  assert.match(m.html, /Jon&nbsp;P\. is aboard now/);
  assert.match(m.text, /Odyssey · past Oct 12, 2026: Coveralls\./);
});

test("text the auditor typed is text, never markup", () => {
  const m = followupEmail({ owner: "Ray", link, due: [F({ text: "<img src=x onerror=alert(1)>" })] });
  assert.doesNotMatch(m.html, /<img src=x/);
  assert.match(m.html, /&lt;img src=x/);
});

test("wired (Miguel signed off the render, 23 Oct 2026): the hourly sweep sends it from audit_request.js", () => {
  const w = readFileSync(new URL("../src/audit_request.js", import.meta.url), "utf8");
  assert.match(w, /followupEmail\(\{ owner: b\.owner, due: b\.due\.map\(item\), late: b\.late\.map\(item\), link: AUDIT_ORIGIN \+ "\/#fu" \}\)/);
  assert.match(w, /try \{ out\.followups = await sendFollowups\(env\); \}/);
});
