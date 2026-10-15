// The briefing's "What others said" in plain words (Miguel, 15 Oct 2026). src/audit_plain.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackPlain, intelFallback, numbersKept, parsePlain, rewritePlain } from "../src/audit_plain.js";

const MARTO = "• Summary: Printer Specialist Ryan Paolo Marto on Quantum of the Seas failed to follow weekly communication and consumption-tracking protocols since May 2026, resulting in a $1,807.75 emergency toner shipment to Brisbane in early October and leaving the vessel's inventory in poor condition. • What happened: Ryan Marto did not check weekly toner consumption as directed; missed multiple orders. An emergency shipment of 10 black, 5 yellow, and 5 cyan toner cartridges plus $550 in freight and duties.";

test("Ray's answers read as sentences, never as keys", () => {
  const s = feedbackPlain({ order: "Yes", rushcause: "Crew ordering failure", rushcost: "1807.75", ontime: "Mostly", acc: "Frequent errors", par: "Some gaps", audit: "No" });
  assert.equal(s, "Rush order, $1,807.75, caused by the crew's ordering. Orders mostly on time, with frequent errors. Some gaps in par at handover.");
  assert.doesNotMatch(s, /rushcause|ontime|acc:|par:/);
  assert.equal(feedbackPlain({ order: "No", ontime: "Always", acc: "Accurate", par: "Maintained", audit: "Yes" }),
    "No rush orders. Orders on time, accurate. Par kept at handover. Failed the end-of-contract inventory audit.");
});

test("Rolando's grades group worst first; Dexter's text keeps its own words; the note is quoted", () => {
  assert.equal(feedbackPlain({ clean: "Excellent", pm: "Poor", unres: "Excellent", note: "drum left dirty" }),
    "Poor on MFDs. Excellent on production presses and part numbers and technical data. “drum left dirty”");
  assert.equal(feedbackPlain({ assessed: "Yes", mono: "14", overall: "Solid" }), "Mono clicks 14% (target under 20%). Overall: Solid.");
  assert.equal(feedbackPlain({ assessed: "No (N/A)" }), "Not assessed this contract.");
});

test("the fallback is the summary's first line, cut at a sentence or a word, never mid-word", () => {
  const f = intelFallback(MARTO, 120);
  assert.match(f, /^Printer Specialist Ryan Paolo Marto/);
  assert.ok(f.length <= 121);
  assert.match(f, /(\.|…)$/);
  assert.doesNotMatch(f, /What happened/);
});

test("a rewrite that adds a number is refused (the rush cost and toner counts are copied, never invented)", async () => {
  assert.ok(numbersKept("Rush order to Brisbane: 10 black, 5 yellow, 5 cyan toner, $1,807.75.", MARTO));
  assert.equal(numbersKept("Rush order, $2,000.", MARTO), false);
  const env = (out) => ({ AI: { run: async () => ({ response: out }) } });
  assert.equal(await rewritePlain(env("Rush order to Brisbane, $1,807.75. Ryan stopped checking toner every week."), MARTO, { engine: "workersai" }),
    "Rush order to Brisbane, $1,807.75. Ryan stopped checking toner every week.");
  assert.equal(await rewritePlain(env("Rush order, $3,000."), MARTO, { engine: "workersai" }), null);
  assert.equal(await rewritePlain({}, MARTO, { engine: "none" }), null);
  assert.equal(parsePlain("Here is the summary: Rush order."), "Rush order.");
});

test("a rewrite that makes a date more exact than the note is refused", async () => {
  const { datesKept } = await import("../src/audit_plain.js");
  assert.equal(datesKept("Rush order on October 8, $1,807.75.", MARTO), false, "the note says early October");
  assert.ok(datesKept("Rush order in early October, $1,807.75.", MARTO));
  assert.ok(datesKept("Shipped Oct 4.", "Shipped to Brisbane on 4 October."));
  const env = { AI: { run: async () => ({ response: "Rush order on October 8, 2026, $1,807.75." }) } };
  assert.equal(await rewritePlain(env, MARTO + " Filed 8 2026.", { engine: "workersai" }), null);
});

test("one incident, one entry: the same text, or the same rush cost within 14 days, merges; the others ride on it", async () => {
  const { mergeIntel, sameIncident } = await import("../src/audit_plain.js");
  const a = { kind: "intel", who: "Miguel San Martin", at: "2026-10-08", full: "• Summary: $1,807.75 emergency toner shipment to Brisbane." };
  const b = { kind: "intel", who: "Ray Guerra", at: "2026-10-08", full: "• Summary: emergency shipment costing $1,807.75 to Brisbane." };
  const c = { kind: "intel", who: "Ray Guerra", at: "2026-09-02", full: "• Summary: magenta ran out before the Pacific crossing." };
  const fb = { kind: "feedback", who: "Ray", at: "2026-10-13", text: "Rush order, $1,807.75." };
  assert.ok(sameIncident(a, b));
  assert.equal(sameIncident(a, c), false);
  assert.equal(sameIncident(a, { ...b, at: "2026-11-30" }), false, "same cost far apart is another incident");
  const out = mergeIntel([fb, a, b, c]);
  assert.equal(out.length, 3, "feedback is never merged into intel");
  assert.equal(out[1].whoAll, "Miguel San Martin and Ray Guerra");
  assert.equal(out[1].others.length, 1);
  assert.equal(out[1].others[0].full, b.full);
  assert.ok(sameIncident({ at: "2026-01-01", full: "Same words." }, { at: "2026-05-01", full: "same words." }), "identical text merges whatever the dates");
});
