// Dexter's audit grade (Miguel, 15 Oct 2026): the Overall rating is the score; no Overall = the average of
// Inventory, Technical and Customer collaterals, ROUNDED DOWN. What the score is worth on the bonus is bonus.js (§1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditScore, gradeProblems } from "../src/audit.js";

test("the score: Overall when given, else the average rounded down", () => {
  assert.deepEqual(auditScore({ inventory: 2, technical: 2, collaterals: 2, overall: 5 }), { score: 5, from: "overall" });
  assert.deepEqual(auditScore({ inventory: 4, technical: 3, collaterals: 4 }), { score: 3, from: "average" }, "3.67 rounds down to 3");
  assert.deepEqual(auditScore({ inventory: 4, technical: 4, collaterals: 5 }), { score: 4, from: "average" });
  assert.deepEqual(auditScore({ inventory: 4, technical: 4, collaterals: 5, overall: "" }), { score: 4, from: "average" }, "a blank Overall is no Overall");
  assert.deepEqual(auditScore({}), { score: null, from: null });
});

test("what a grade needs: the three ratings 1–5, Overall optional, a sentence when any rating is 3 or below", () => {
  assert.deepEqual(gradeProblems({ inventory: 5, technical: 5, collaterals: 5 }), []);
  assert.deepEqual(gradeProblems({ inventory: 5, technical: 6, collaterals: 0 }), ["technical", "collaterals"]);
  assert.deepEqual(gradeProblems({ inventory: 5, technical: 5, collaterals: 5, overall: 3 }), ["note"], "a low Overall needs the sentence too");
  assert.deepEqual(gradeProblems({ inventory: 2, technical: 5, collaterals: 5, note: "too short" }), ["note"]);
  assert.deepEqual(gradeProblems({ inventory: 2, technical: 5, collaterals: 5, note: "Counting from the printer, not the shelf." }), []);
  assert.deepEqual(gradeProblems({ inventory: 5, technical: 5, collaterals: 5, overall: 9 }), ["overall"]);
});
