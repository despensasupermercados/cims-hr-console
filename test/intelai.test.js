import { test } from "node:test";
import assert from "node:assert/strict";
import { pickEngine, intelSystemPrompt, intelUserPrompt, parseIntelResponse } from "../src/intelai.js";

test("pickEngine: prefers Claude key, then Workers AI, then none", () => {
  assert.equal(pickEngine({ ANTHROPIC_API_KEY: "sk-x", AI: {} }), "claude");
  assert.equal(pickEngine({ AI: {} }), "workersai");
  assert.equal(pickEngine({}), "none");
  assert.equal(pickEngine(null), "none");
  assert.equal(pickEngine({ ANTHROPIC_API_KEY: "" }), "none"); // empty key is not set
});

test("system prompt: anti-hallucination + plain-text + decision sections", () => {
  const s = intelSystemPrompt();
  assert.match(s, /never invent/i);
  assert.match(s, /no code fences|PLAIN TEXT/i);
  assert.match(s, /Impact:/);
  assert.match(s, /Recommended action:/);
});

test("user prompt: embeds crew name + reporter + clipped body", () => {
  const u = intelUserPrompt("Rommel Madrinico", "Ray Guerra", "toner issue");
  assert.match(u, /Rommel Madrinico/);
  assert.match(u, /Ray Guerra/);
  assert.match(u, /EMAIL BODY:/);
  assert.match(u, /toner issue/);
});

test("user prompt: no crew name -> asks the model to identify from text", () => {
  const u = intelUserPrompt(null, null, "body");
  assert.match(u, /Identify which crew member/i);
  assert.doesNotMatch(u, /Reporter \(/); // reporter line omitted when absent
});

test("user prompt: body is clipped to a safe length", () => {
  const big = "x".repeat(20000);
  const u = intelUserPrompt("A B", "R", big);
  assert.ok(u.length < 9000);
});

test("parseIntelResponse: strips code fences and normalises bullets", () => {
  const raw = "```\n- Summary: late toner\n* Impact: downtime\n```";
  const out = parseIntelResponse(raw);
  assert.equal(out, "• Summary: late toner\n• Impact: downtime");
});

test("parseIntelResponse: drops blank lines, trims, caps length", () => {
  assert.equal(parseIntelResponse("  • a  \n\n\n• b \n"), "• a\n• b");
  assert.equal(parseIntelResponse(null), "");
  assert.ok(parseIntelResponse("• " + "y".repeat(5000)).length <= 4000);
});
