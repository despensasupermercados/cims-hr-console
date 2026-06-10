// Tests for contributor answers -> gates/sub-scores mapping (worst-leg inputs to the scorer).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFeedbackToScore } from "../src/bonus.js";

test("Ray: crew ordering failure raises rush gate", () => {
  const r = mapFeedbackToScore({ ray: { order: "Yes", rushcause: "Crew ordering failure", rushcost: 1200 } });
  assert.equal(r.gates.rush, true);
  assert.ok(r.gateNote.some(n => n.includes("Rush from crew ordering failure")));
});

test("Ray: rush NOT raised when cause is not crew failure", () => {
  const r = mapFeedbackToScore({ ray: { order: "Yes", rushcause: "Vendor delay" } });
  assert.notEqual(r.gates.rush, true);
});

test("Ray: failed audit raises audit gate", () => {
  const r = mapFeedbackToScore({ ray: { audit: "Yes" } });
  assert.equal(r.gates.audit, true);
});

test("Ray: on-time / accuracy / par map to sub-scores", () => {
  const r = mapFeedbackToScore({ ray: { ontime: "Mostly", acc: "Minor errors", par: "Some gaps" } });
  assert.equal(r.sliders.sOrder, 14);
  assert.equal(r.sliders.sAcc, 17);
  assert.equal(r.sliders.sPar, 9);
});

test("Ray: best answers map to full marks", () => {
  const r = mapFeedbackToScore({ ray: { ontime: "Always", acc: "Accurate", par: "Maintained" } });
  assert.equal(r.sliders.sOrder, 20);
  assert.equal(r.sliders.sAcc, 25);
  assert.equal(r.sliders.sPar, 15);
});

test("Rolando: worst handling answers floor sHand at 0", () => {
  const r = mapFeedbackToScore({ rolando: { clean: "No", pm: "No", unres: "Major" } });
  // 10 -6 -4 -3 = -3 -> max(0,-3) = 0
  assert.equal(r.sliders.sHand, 0);
});

test("Rolando: minor issues deduct partially", () => {
  const r = mapFeedbackToScore({ rolando: { clean: "Minor issues", pm: "Partial", unres: "Minor" } });
  // 10 -3 -2 -1 = 4
  assert.equal(r.sliders.sHand, 4);
});

test("Dexter: mono <=20 -> full 5", () => {
  assert.equal(mapFeedbackToScore({ dexter: { mono: "20" } }).sliders.sMono, 5);
});

test("Dexter: mono >=40 -> 0", () => {
  assert.equal(mapFeedbackToScore({ dexter: { mono: "40" } }).sliders.sMono, 0);
});

test("Dexter: mono 30 -> proportional 3", () => {
  // round(5*(40-30)/20) = round(2.5) = 3
  assert.equal(mapFeedbackToScore({ dexter: { mono: "30" } }).sliders.sMono, 3);
});

test("empty answers produce no gates or sliders", () => {
  const r = mapFeedbackToScore({});
  assert.deepEqual(r.gates, {});
  assert.deepEqual(r.sliders, {});
});
