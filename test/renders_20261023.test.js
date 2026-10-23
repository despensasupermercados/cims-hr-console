// Two renders for Miguel's sign-off (23 Oct 2026; proofs in docs/mockups/emails_20261023/), NOT wired to send (CIMS email
// standard §5): "Email Joy · all four" (the dashboard's To correct in TDG list) and the reliever's copy of the sign-off pass
// (the outgoing printer's contact, only once TDG has the crew change). These pin what each says and that nothing sends them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { tdgFixesEmail } from "../src/emails/hr.keyman.tdg_fixes.v1.js";
import { relieverEmail } from "../src/emails/hr.signoff.reliever.v1.js";

const plain = (h) => h.replace(/<wbr>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&middot;/g, "·").replace(/&ndash;/g, "–").replace(/\s+/g, " ");

test("Email Joy: one card per seafarer, held and undated, what the file says and what to enter; never a date the console inferred", () => {
  const m = tdgFixesEmail({ asOf: "2026-10-23", today: "2026-10-23", fixes: [
    { kind: "held", name: "Ryan Paolo Marto", ship: "Quantum", brand: "Royal", code: "QN", byName: "Allen Edward Cedilla", byOn: "2026-10-22" },
    { kind: "undated", name: "Jonathan Alonzo", ship: "Spectrum", brand: "Royal", code: "SP" }] });
  assert.equal(m.subject, "To correct in TDG · 2 seafarers · file of Oct 23");
  const t = plain(m.html);
  for (const s of ["2 seafarers to correct in TDG.", "Quantum of the Seas · QN", "Allen Edward Cedilla signed on Quantum of the Seas on Oct 22, 2026 as the reliever.",
    "Please enter Ryan's debark date in TDG.", "with no EMBARKEDDATE", "Please enter the embark date in TDG."]) assert.ok(t.includes(s), s);
  assert.doesNotMatch(t, /\b(his|her|he|she)\b/i);
  assert.match(m.text, /Ryan Paolo Marto · Quantum of the Seas: still On board in TDG/);
});

test("the reliever's pass: the outgoing printer's contact, 'together' only on an overlap, never 'HON' by name", () => {
  const base = { firstName: "A.J.", ship: "Pursuit", brand: "Azamara", port: "BARCELONA, SPAIN", today: "2026-10-17",
    outgoing: { name: "Kevin Leif Jugao", first: "Kevin", position: "Printer Specialist", signOff: "2026-10-31", phone: "09175550142", email: "kevin.sample@example.com" } };
  const a = relieverEmail({ ...base, relieverOn: "2026-10-16" });
  assert.equal(a.subject, "You take over from Kevin on Azamara Pursuit");
  const t = plain(a.html);
  for (const s of ["You take over from Kevin, A.J.", "You are aboard together from 16 October.", "+63 917 555 0142", "WhatsApp", "kevin.sample@example.com", "15 days aboard together."]) assert.ok(t.includes(s), s);
  assert.ok(!t.includes("A.J.."), "one full stop after an initial");
  assert.doesNotMatch(t.replace(/hon\.cims\.work/g, ""), /\bHON\b/, "the crew read 'Digital Handover Notes'");
  assert.doesNotMatch(t, /\b(his|her|he|she)\b/i);
  const b = relieverEmail({ ...base, relieverOn: "2026-11-20", outgoing: { ...base.outgoing, phone: "-", email: "" } });
  const tb = plain(b.html);
  assert.ok(tb.includes("You may or may not meet Kevin aboard"), "no promise to meet without an overlap");
  assert.ok(tb.includes("No mobile or email on file. Rita can put you in touch."), "TDG's '-' prints nothing");
  for (const h of [a.html, b.html]) { assert.doesNotMatch(h, /rgba\(|gradient/); assert.match(h, /CRUISE INDUSTRY MANAGED SERVICES/); }
});

test("not wired: nothing outside src/emails imports either until Miguel signs off the render", () => {
  const dir = new URL("../src/", import.meta.url);
  const users = readdirSync(dir).filter((f) => f.endsWith(".js")).filter((f) => /hr\.keyman\.tdg_fixes\.v1|hr\.signoff\.reliever\.v1/.test(readFileSync(new URL(f, dir), "utf8")));
  assert.deepEqual(users, []);
});
