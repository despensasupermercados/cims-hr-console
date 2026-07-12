// Maria AI-provider error surfacing (Session-7).
// When the Anthropic API refuses a call, two things must hold:
//  1. The user sees a human sentence, never a raw "model_http_403" code.
//  2. The provider's exact reason is persisted to maria_log.note for diagnosis.
// These are source-level pins (apiAsk isn't independently importable); the
// client_script_syntax + full-suite gates prove the module still parses.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");

test("friendly-error mapper exists and covers the provider codes", () => {
  assert.ok(src.includes("function mariaFriendlyError"), "mapper present");
  for (const code of ["model_http_401", "model_http_403", "model_http_429"]) {
    assert.ok(src.includes('"' + code + '"'), "maps " + code);
  }
  // catch-all so any unmapped model_http_* still becomes a sentence
  assert.ok(src.includes('code.indexOf("model_http_") === 0'), "catch-all branch");
});

test("apiAsk returns the friendly message, not the raw code, to the client", () => {
  assert.ok(src.includes("error: mariaFriendlyError(res.error)"), "friendly on error field");
  assert.ok(src.includes("code: res.error"), "raw code preserved separately");
});

test("provider failure reason is persisted to maria_log.note", () => {
  assert.ok(src.includes("const noteVal = res.error ? String(res.detail"), "note captured on error");
  assert.ok(src.includes("in_tokens, out_tokens, ms, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)"), "note column bound");
});
