// The two emails a filed audit will send (19 Oct 2026; docs/AUDIT_DESIGN.md "Filed"): hr.audit.filed.v1 (Miguel; cc Rita,
// Ray, Rolando) and hr.audit.dispatch.v1 (Rita). Both are built from what the filing STORED (the grade, the steps, what
// the documents said in data.ctx) and are rendered for Miguel's sign-off before anything sends them (CIMS email
// standard §5). These checks pin what they may and may not say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { filedEmail, visitWhen } from "../src/emails/hr.audit.filed.v1.js";
import { dispatchEmail } from "../src/emails/hr.audit.dispatch.v1.js";
import { startVisit, normalizeVisit } from "../src/audit_steps.js";

const CTX = { asOf: "2026-10-13", extras: [{ id: "x1", text: "Fusing gears", counted: 2 }],
  machines: [{ serial: "S1", label: "PROD 1", model: "C4070", down: null, p43: { state: "findings", items: [{ head: "UNEVEN DENSITY IN CYAN" }] }, life: [{ name: "Transfer Belt Unit (%)", pct: 104 }] },
    { serial: "S2", label: "MFD deck 5", model: "bizhub", down: "Paper feed error", p43: null, life: [] }],
  diff: [{ kind: "gap", part_no: "TN-623C", description: "TONER CYAN", obp: 6, counted: 4, diff: -2 }] };
function filedData(mut) {
  const d = startVisit({ machines: CTX.machines, diff: CTX.diff });
  d.ws.missing = ["sops"]; d.hw.labeled = true; d.hw.tools.missing = ["fiery_hdd"];
  d.hw.machines.S1 = { checks: { test: "finding" }, p43: "seen" }; d.hw.machines.S2 = { down: "still" };
  d.inv = { accurate: false, lines: { "TN-623C": { shelf: 4, checked: true } }, added: [], repairs: { x1: "confirmed" } };
  d.rt = { inventory: 3, technical: 4, collaterals: 5, why: { inventory: "OBP is updated a week late." } };
  d.crew = { training: ["stats"], ppe: { missing: ["shoes"] }, hon: "yes", dispatch: 2, dispatchNote: "No hotel booking" };
  d.ov = { overall: null, strengths: "Clean shop.", improve: "OBP the same day.", agreed: "", recommendBlock: true, followup: null };
  if (mut) mut(d);
  const data = normalizeVisit(d, { machines: CTX.machines, diff: CTX.diff, extras: CTX.extras, parts: ["TN-623C"], followups: [] });
  data.repeat = { sops: 2, fiery_hdd: 1 }; data.ctx = CTX;
  return data;
}
const BASE = { id: "ar_4", ship: "Oasis", crew: "John Jeffrey Gorre", contract: "3 completed · on contract 4", auditor: "Dexter Lawrence", openedAt: "2026-10-12T09:00:00Z", filedAt: "2026-10-14T17:42:00Z", link: "https://audit.cims.work/#q=ar_4" };
const plain = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ");

test("the filed email: the score in words, how it was reached, every step from what the filing stored", () => {
  const m = filedEmail({ ...BASE, grade: { score: 3, from: "average" }, data: filedData(), photos: 2,
    followups: [{ owner: "Rolando", due: "2026-11-18", text: "Confirm the cyan line", status: "open" }], carried: [{ text: "Resend the SOPs folder", owner: "Ray", state: "open", times: 2 }, { text: "Labels", owner: "Dexter", state: "fixed" }] });
  assert.equal(m.subject, "Printshop audit · Oasis · John Jeffrey Gorre · 3/5 · follow-up for Rolando");
  const t = plain(m.html);
  for (const s of ["John scored 3 out of 5.", "One follow-up for Rolando by Nov 18.", "Oct 12–14, 2026", "the average of the three ratings, rounded down",
    "OBP is updated a week late.", "Not given · the score is the average", "Clean shop.", "Confirm the cyan line", "2nd time · Still open", "Fixed",
    "SOPs · ordering & transfers", "2nd time", "2-Fiery back-up HDD", "Test pattern: finding.", "seen on the machine.", "1 part past rated life (Transfer Belt Unit).",
    "Still down: Paper feed error.", "1 off on the shelf", "Fusing gears: seen", "Statistic report", "Missing: Safety shoes", "Recommended", "Open the audit", "2 photos kept with the audit"])
    assert.ok(t.includes(s), s);
  assert.ok(m.text.includes("Open the audit: https://audit.cims.work/#q=ar_4"));
});

test("what the filed email never says: a replacement, points or money, the dispatch rating, a pronoun for the crew", () => {
  const m = filedEmail({ ...BASE, grade: { score: 4, from: "overall" }, data: filedData((d) => { d.ov.overall = 4; }) });
  const t = plain(m.html) + " " + m.text;
  assert.doesNotMatch(t, /\breplac/i, "copy quality decides: the word is never used");
  assert.doesNotMatch(t, /\$|\bpoints?\b|\bbonus\b|Score Card/i, "nothing here is money (§1)");
  assert.doesNotMatch(t, /No hotel booking/, "the dispatch note goes to Rita alone");
  assert.doesNotMatch(t, /\b(his|her|he|she)\b/i);
  assert.ok(t.includes("Nothing to follow up.") && t.includes("the Overall rating."));
});

test("the dispatch email: Rita's alone, about TDG's dispatch, the crew's words when given, never the score", () => {
  const m = dispatchEmail({ ...BASE, rating: 2, note: "The hotel had no booking & I waited six hours.", signOn: "2026-06-02" });
  assert.equal(m.subject, "Dispatch feedback · John Jeffrey Gorre · Oasis · 2/5");
  const t = plain(m.html);
  for (const s of ["John rated the dispatch 2 out of 5.", "Worth a look.", "not about John, and it is not in the audit's score", "“The hotel had no booking & I waited six hours.”", "John signed on Oasis on Jun 2, 2026."]) assert.ok(t.includes(s), s);
  assert.doesNotMatch(t, /\b(his|her|he|she)\b/i);
  const g = plain(dispatchEmail({ ...BASE, rating: 5, note: "" }).html);
  assert.ok(g.includes("No action needed.") && g.includes("No words recorded beside the rating."));
});

test("the dispatch note: kept bounded beside a rating, dropped without one", () => {
  const ctx = { machines: [], diff: [], extras: [], parts: [], followups: [] };
  assert.equal(normalizeVisit({ crew: { dispatch: 2, dispatchNote: "x".repeat(900) } }, ctx).crew.dispatchNote.length, 600);
  assert.equal(normalizeVisit({ crew: { dispatch: null, dispatchNote: "kept?" } }, ctx).crew.dispatchNote, "");
  assert.equal(startVisit({ machines: [], diff: [] }).crew.dispatchNote, "");
});

test("a visit's two dates read like a visit", () => {
  assert.equal(visitWhen("2026-10-12T09:00:00Z", "2026-10-14T17:00:00Z"), "Oct 12–14, 2026");
  assert.equal(visitWhen("2026-10-14T09:00:00Z", "2026-10-14T17:00:00Z"), "Oct 14, 2026");
  assert.equal(visitWhen("2026-09-30T09:00:00Z", "2026-10-02T17:00:00Z"), "Sep 30 – Oct 2, 2026");
  assert.equal(visitWhen(null, "2026-10-14T17:00:00Z"), "Oct 14, 2026");
});

test("wired (Miguel signed off the renders, 23 Oct 2026): only the audit's request module sends them, to the design's people", () => {
  const dir = new URL("../src/", import.meta.url);
  const users = readdirSync(dir).filter((f) => f.endsWith(".js")).filter((f) => /hr\.audit\.(filed|dispatch)\.v1/.test(readFileSync(new URL(f, dir), "utf8")));
  assert.deepEqual(users, ["audit_request.js"]);
});
