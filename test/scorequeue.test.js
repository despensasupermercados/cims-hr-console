import { test } from "node:test";
import assert from "node:assert/strict";
import { dayDiff, classifyWindow } from "../src/scorequeue.js";

const TODAY = "2026-06-24";

test("dayDiff: whole days, null on bad input", () => {
  assert.equal(dayDiff("2026-06-24", "2026-06-24"), 0);
  assert.equal(dayDiff("2026-06-24", "2026-06-30"), 6);
  assert.equal(dayDiff("2026-06-24", "2026-06-10"), -14);
  assert.equal(dayDiff("", "2026-06-10"), null);
  assert.equal(dayDiff("2026-06-24", "not-a-date"), null);
  assert.equal(dayDiff(null, null), null);
});

test("classifyWindow: recent = signed off within the last 14 days (incl today)", () => {
  assert.equal(classifyWindow("2026-06-24", TODAY), "recent");  // today
  assert.equal(classifyWindow("2026-06-20", TODAY), "recent");  // 4 days ago
  assert.equal(classifyWindow("2026-06-10", TODAY), "recent");  // exactly 14 days ago
  assert.equal(classifyWindow("2026-06-09", TODAY), null);      // 15 days ago -> out
});

test("classifyWindow: upcoming = signing off within the next 14 days", () => {
  assert.equal(classifyWindow("2026-06-25", TODAY), "upcoming"); // tomorrow
  assert.equal(classifyWindow("2026-07-08", TODAY), "upcoming"); // exactly 14 days out
  assert.equal(classifyWindow("2026-07-09", TODAY), null);       // 15 days out -> out
});

test("classifyWindow: unparseable / null sign-off -> null", () => {
  assert.equal(classifyWindow(null, TODAY), null);
  assert.equal(classifyWindow("", TODAY), null);
  assert.equal(classifyWindow("bad", TODAY), null);
});

test("classifyWindow: custom window size", () => {
  assert.equal(classifyWindow("2026-06-04", TODAY, 30), "recent");  // 20 days ago, 30-day window
  assert.equal(classifyWindow("2026-06-04", TODAY, 14), null);      // 20 days ago, 14-day window
});
