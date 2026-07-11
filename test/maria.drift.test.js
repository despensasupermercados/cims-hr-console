// Glossary-vs-SOP drift guard + eval-harness tests.
// THE POINT: MARIA_GLOSSARY is prose duplicated from the locked SOP modules — a
// deliberate SSOT trade (the model needs prose). This file is the contract that
// makes the trade safe: if bonus.js or contracts.js constants change and the
// glossary text doesn't, the build goes red. A stale glossary is worse than no
// glossary — it makes Maria confidently wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LADDER, ladderValue, FLOOR } from "../src/bonus.js";
import { GAP_DAYS, MIN_AZ, MIN_RCL } from "../src/contracts.js";
import { MARIA_GLOSSARY } from "../src/maria.js";
import { GOLDEN_QUESTIONS, checkExpectation, runEvals } from "../src/maria_eval.js";

test("drift: glossary states the CURRENT contract-grouping and full-contract rules", () => {
  assert.ok(MARIA_GLOSSARY.includes(GAP_DAYS + " days"), "glossary must state the " + GAP_DAYS + "-day gap rule");
  assert.ok(MARIA_GLOSSARY.includes(MIN_AZ + " months on Azamara"), "glossary must state the Azamara minimum (" + MIN_AZ + "mo)");
  assert.ok(MARIA_GLOSSARY.includes(MIN_RCL + " months"), "glossary must state the non-Azamara minimum (" + MIN_RCL + "mo)");
});

test("drift: glossary states the CURRENT bonus ladder and floor", () => {
  for (const v of LADDER.filter(x => x > 0)) {
    assert.ok(MARIA_GLOSSARY.includes(String(v)), "glossary must contain ladder rung $" + v);
  }
  assert.ok(MARIA_GLOSSARY.includes("9+->" + ladderValue(9)), "glossary must state the 9+ top rung");
  assert.ok(MARIA_GLOSSARY.includes("floor " + FLOOR + "%"), "glossary must state the " + FLOOR + "% floor");
});

test("golden set: well-formed, unique ids, at least 8 behaviours pinned", () => {
  assert.ok(GOLDEN_QUESTIONS.length >= 8);
  const ids = new Set();
  for (const g of GOLDEN_QUESTIONS) {
    assert.ok(g.id && g.q && g.expect, "question needs id/q/expect: " + JSON.stringify(g));
    assert.ok(!ids.has(g.id), "duplicate id: " + g.id);
    ids.add(g.id);
    const e = g.expect;
    assert.ok((e.answer_matches && e.answer_matches.length) || (e.tools_any && e.tools_any.length) || (e.tools_none && e.tools_none.length),
      "expectation must assert something: " + g.id);
  }
  // the behaviours that must never regress are all represented
  for (const must of ["readonly", "movements", "denied", "baseline"]) assert.ok(ids.has(must), "missing critical golden: " + must);
});

test("checkExpectation: matches, tool sets, case-insensitivity, error propagation", () => {
  const r = { answer: "There are 288 line items (table: travel_expense).", sources: ["glossary", "run_sql"] };
  assert.equal(checkExpectation(r, { answer_matches: ["\\d", "(?i)TRAVEL_EXPENSE"], tools_any: ["run_sql"], tools_none: ["contract_ledger"] }).pass, true);
  assert.equal(checkExpectation(r, { tools_none: ["run_sql"] }).pass, false);
  assert.equal(checkExpectation(r, { tools_any: ["upcoming_movements"] }).pass, false);
  assert.equal(checkExpectation(r, { answer_matches: ["nonexistent phrase"] }).pass, false);
  const err = checkExpectation({ answer: null, error: "model_http_500", sources: [] }, {});
  assert.equal(err.pass, false);
  assert.match(err.failures[0], /model_http_500/);
});

test("runEvals: scores pass and fail deterministically with a mocked model", async () => {
  // mock model: always calls upcoming_movements, then answers with a number
  let phase = 0;
  const fetchImpl = async () => {
    phase = 1 - phase;
    if (phase === 1) return { ok: true, json: async () => ({ stop_reason: "tool_use", content: [
      { type: "tool_use", id: "t", name: "upcoming_movements", input: { days: 7 } }
    ] }) };
    return { ok: true, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "3 crew are arriving." }] }) };
  };
  const execTool = async () => ({ arriving: [1, 2, 3], departing: [] });
  const qs = [
    { id: "good", q: "who arrives?", expect: { tools_any: ["upcoming_movements"], answer_matches: ["\\d"] } },
    { id: "bad",  q: "who arrives?", expect: { tools_none: ["upcoming_movements"] } },
  ];
  const out = await runEvals({ apiKey: "k", execTool, fetchImpl, questions: qs, today: "2026-07-11" });
  assert.equal(out.total, 2);
  assert.equal(out.pass, 1);
  assert.equal(out.fail, 1);
  assert.equal(out.results[0].pass, true);
  assert.equal(out.results[1].pass, false);
  assert.match(out.results[1].failures[0], /forbidden tool/);
});
