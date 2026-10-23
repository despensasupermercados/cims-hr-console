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

test("16 Oct 2026 review: a date's digits are not quantities, and an empty answer is not a refusal", async () => {
  const src = "On 2026-10-06 Ray said he ordered 3 toners; freight $450. Oct 8, 2026 the parts left.";
  assert.ok(numbersKept("He ordered 3 toners; freight $450.", src));
  for (const bad of ["He ordered 6 toners; freight $450.", "10 toners, $450.", "2026 toners, $450."]) assert.equal(numbersKept(bad, src), false, bad);
  let refused = 0;
  const env = { AI: { run: async () => ({ response: "" }) } };
  assert.equal(await rewritePlain(env, src, { engine: "workersai", onRefused: () => refused++ }), null);
  assert.equal(refused, 0, "an empty answer is asked again next time, never kept as refused");
  const env2 = { AI: { run: async () => ({ response: "He ordered 9 toners, $450." }) } };
  await rewritePlain(env2, src, { engine: "workersai", onRefused: () => refused++ });
  assert.equal(refused, 1, "a real refusal is still kept");
});

// 20 Oct 2026 (Miguel, "2. yes"): the same incident without a dollar amount. Every pair of filed field reports on one crew
// within 14 days in production that day (19 pairs, 6 crew), each excerpt kept to the sentences carrying numbers and dates —
// all the rule reads. Two pairs are one incident (Kevin's 17 / 35 boxes; Medidas' one visit, 4 drums and 4 fuser units);
// the rest are not, and Lorono's pair (one missed order, sharing only its date) is left apart on purpose.
test("same incident by its counts: Kevin's 17 / 35 boxes merge; no other production pair does", async () => {
  const { sameIncident, mergeIntel, countsOf } = await import("../src/audit_plain.js");
  const R = {
    K1: ["SC-0039935", "2026-09-08", "Summary: the crew made a significant inventory data-entry error on 08/30/2026 that triggered a costly emergency paper supply response. On 08/30/2026 at 01:05 PM, he updated OBP showing 17 boxes of 8.5 x 11 DG3 paper consumed in a single entry, when he later confirmed via manual count that the actual consumption was one box. Actual inventory in the printshop locker was 35 boxes. Audit all August–September inventory entries for accuracy."],
    K2: ["SC-0039935", "2026-09-10", "• Summary: inaccurate consumption statistics for August 2026. He initially reported 17 cases of paper used in August (double normal usage), then corrected it to 1 case after Ray Guerra flagged the discrepancy on September 8, 2026. Manual recount showed actual inventory was 35 boxes. He attributed August irregularities to a 7-day dry dock period. Inaccurate consumption data jeopardizes 4-month supply planning."],
    M1: ["SC-0038379", "2026-09-08", "• What happened: During a management onboard visit, 13 inventory line items were found inaccurate; unused parts (4 drums, 4 fuser units, used gears, Canon parts) were stored without disposal. Risk of service delays (e.g., fusing unit showing zero true count against par level of 1)."],
    M2: ["SC-0038379", "2026-09-08", "• What happened: She did not perform full inventory at all locations upon boarding the vessel on or before September 8, 2026. Used parts (4 drums, 4 fuser units, used gears) were not disposed of properly. • Impact: 12 inventory line items on Onward show discrepancies between par level and true count, including critical parts at zero actual stock (Fusing Unit C3350i, Tire Double Feed Prevention C4070)."],
    M3: ["SC-0038379", "2026-09-22", "• What happened: she did not attend either meeting. The missed meetings were noted by Monday, September 21, 2026. • Recommended action: respond to Rita Berenyi within 24 hours."],
    R1: ["SC-0038129", "2026-07-06", "• Recommended action: immediate and sustained performance improvement across nine specific areas, including weekly inventory documentation, deadline compliance, 24-hour email response, and elimination of emergency orders."],
    R2: ["SC-0038129", "2026-07-14", "• What happened: discrepancies in his OPB inventory review dated July 13, 2026: Paper 8.5x11 and Toner Yellow consumption figures are below actual usage; Yellow Developer machines exceed 100% life expectancy and require ordering. Order one Yellow Developer unit immediately per SOP requirements for US vessels (four-month advance ordering window)."],
    R3: ["SC-0038129", "2026-07-20", "• What happened: During takeover on July 18, 2026, Bernard Winzon Paqueo documented that he failed to store incoming paper stock properly. • Impact: Two of three printing machines non-operational as of July 19, 2026; parts at zero PAR level with next delivery August 21."],
    R4: ["SC-0038129", "2026-07-20", "• What happened: During the July 15 HON inventory: DG3 Paper 11x17 (4-box variance), Conveyance Clutch CL6/CL7 (1-pc short), Conveyance Clutch CL8/CL9 (0 actual vs. 2 expected), Staple Cartridge C4070 SK-703 (0 actual vs. 1 expected), and two toner items with multiple unrecorded consumptions."],
    R5: ["SC-0038129", "2026-07-20", "• What happened: One Fusing Heater Lamp 4 (part number A50UM32E00 / 99PRD73353) was found damaged inside its box. Current on-board par is 2 pieces; Paqueo requested removal of 1 unit from inventory on July 18, 2026. • Impact: Inventory par reduced by 1 unit."],
    C1: ["SC-0038779", "2026-09-25", "• Summary: she failed to review a purchase order, resulting in a 7-item shortfall. PO received with only 12 items when OBP specified 19 items. Notified on September 25, 2026. The hotel storekeeper did not flag the missing 7 items initially. • Impact: 7 items missing from shipment until split orders (12 items plus new 7-item PO) are resolved."],
    C2: ["SC-0038779", "2026-10-01", "• Summary: she cannot account for a toner order due 09.27.2026, now four days overdue. She submitted her order notification at 11:55 PM the night before the deadline instead of 2-3 days in advance. Given a three-hour deadline (from 9:23 AM Miami Time)."],
    C3: ["SC-0038779", "2026-10-01", "• What happened: Performance meeting held October 1, 2026 identified six inventory concerns over three contracts. She contested eligibility based on contract start date (March 2026) versus bonus rule date (June 2026)."],
    L1: ["SC-0039963", "2026-06-24", "• What happened: An audit of the print shop on June 20, 2026, found inventory discrepancies, potential paper shortages, and missing tools."],
    L2: ["SC-0039963", "2026-07-01", "• What happened: On June 30, 2026, he requested emergency orders for toner (3 black, 9 cyan). On July 1, 2026, Ray Guerra escalated the emergency order request for 5 units TN634K black toner and 10 units TN619C cyan toner."],
    O1: ["SC-0043141", "2026-09-03", "• What happened: Order submitted on July 23, 2026 was never placed. Order was due for delivery 09/01/2026 and is now overdue."],
    O2: ["SC-0043141", "2026-09-04", "• Summary: failed to catch a missing purchase order placed July 23, 2026, until flagged on September 3, 2026. • Impact: he requests advancing the October 2026 order (RAN261011019) to September 30, 2026 delivery (RAN260929012), with consumption-based adjustments to 8 line items."],
  };
  assert.deepEqual(countsOf(R.K1[2].toLowerCase()), ["17", "35"], "no date, time, size or 'one box'");
  assert.deepEqual(countsOf(R.K2[2].toLowerCase()), ["17", "35"], "no year, '1 case', '7-day' or '4-month'");
  const same = new Set(["K1+K2", "M1+M2"]);
  const ids = Object.keys(R);
  let pairs = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const [a, b] = [R[ids[i]], R[ids[j]]];
    if (a[0] !== b[0] || Math.abs(Date.parse(a[1]) - Date.parse(b[1])) > 14 * 86400000) continue;
    pairs++;
    assert.equal(sameIncident({ at: a[1], full: a[2] }, { at: b[1], full: b[2] }), same.has(ids[i] + "+" + ids[j]), ids[i] + " / " + ids[j]);
  }
  assert.equal(pairs, 19, "every production pair is here");
  const out = mergeIntel([{ kind: "intel", who: "Ray Guerra", at: "2026-09-10", full: R.K2[2] }, { kind: "intel", who: "Ray Guerra", at: "2026-09-08", full: R.K1[2] }]);
  assert.equal(out.length, 1, "one incident, one entry");
  assert.equal(out[0].at, "2026-09-10", "the newer leads"); assert.equal(out[0].others[0].full, R.K1[2], "the other rides on it, whole");
  assert.equal(sameIncident({ at: "2026-09-08", full: R.K1[2] }, { at: "2026-10-08", full: R.K2[2] }), false, "the same counts a month apart are another incident");
});
