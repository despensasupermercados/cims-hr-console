// Ask Maria V2 "Command Bar" — UI wiring guards.
// These are source-level pins: the client_script_syntax gate proves the embedded
// client JS parses; these tests prove the V2 surface stays wired the way it shipped.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");

test("V2 overlay DOM + open/close/send functions exist", () => {
  assert.ok(src.includes("id=mkovl"), "overlay container");
  assert.ok(src.includes("function mkOpen"), "mkOpen");
  assert.ok(src.includes("function mkClose"), "mkClose");
  assert.ok(src.includes("async function mkSend"), "mkSend");
  assert.ok(src.includes("function mkRender"), "mkRender");
  assert.ok(src.includes('class=mkbtn onclick="mkOpen()"'), "topbar Ask Maria button");
});

test("V2 keyboard bindings: Cmd/Ctrl+K toggles, Escape closes", () => {
  assert.ok(src.includes("(e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')"));
  assert.ok(src.includes("e.key==='Escape'&&mkIsOpen()"));
});

test("single ask pipeline — tab and command bar share mariaAskCore", () => {
  // Exactly ONE client-side fetch('/api/ask' — duplicating the ask path lets the
  // two surfaces drift (CLAUDE.md §3 applies to client code too).
  const n = src.split("fetch('/api/ask'").length - 1;
  assert.strictEqual(n, 1, "expected exactly one client fetch of /api/ask");
  assert.ok(src.includes("async function mariaAskCore"), "shared core exists");
});

test("V2 answer card keeps provenance + feedback loop", () => {
  assert.ok(src.includes("mkSrcChips"), "Checked source chips");
  assert.ok(src.includes("mkVote("), "vote wiring");
  // knowledge-doc chips render with the doc (blue-dot) style
  assert.ok(src.includes("(s==='search_knowledge')?' doc':''"));
});

test("search_knowledge has a friendly label (no raw tool names in UI)", () => {
  assert.ok(src.includes("search_knowledge:'Knowledge library'"));
});

test("mobile bottom-sheet styling present", () => {
  assert.ok(src.includes("@media(max-width:700px){#mkovl{padding:0;align-items:flex-end}"));
});
