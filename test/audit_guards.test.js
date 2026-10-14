// Printshop Audit — static guards (14 Oct 2026). A later PR cannot quietly make the audit money, write to another
// app's database, or put its routes outside the error boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url);
const AUDIT_FILES = readdirSync(SRC).filter((f) => /^audit/.test(f)).concat(readdirSync(new URL("emails/", SRC)).filter((f) => /audit/.test(f)).map((f) => "emails/" + f));
const read = (f) => readFileSync(new URL(f, SRC), "utf8");
// Code only: a comment that SAYS "never writes bonus_outcome" is the rule, not a breach of it.
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the audit is never money: no bonus import, no bonus or evaluation table touched (§1)", () => {
  assert.ok(AUDIT_FILES.length >= 4, "the guard sees the audit modules: " + AUDIT_FILES.join(", "));
  for (const f of AUDIT_FILES) {
    const s = code(f);
    assert.doesNotMatch(s, /from\s+["']\.\/(bonus|seval|policy|ledger)\.js["']/, f + " imports money code");
    assert.doesNotMatch(s, /\b(bonus_outcome|feedback_response2|seval_|bonus_baseline)\b/, f + " names a money table");
  }
});

test("another app's database is read, never written", () => {
  for (const f of AUDIT_FILES) {
    const s = read(f);
    for (const m of s.matchAll(/(TIMECARD_DB|HON_DB)\.prepare\(\s*["'`]([^"'`]*)/g)) assert.match(m[2].trim(), /^SELECT\b/i, f + ": " + m[2]);
    assert.doesNotMatch(s, /(TIMECARD_DB|HON_DB)\.(batch|exec)\(/, f + " batches or execs on another app's database");
  }
});

test("the audit's routes run inside the fetch handler's error boundary (§11)", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const wrap = W.indexOf("const res = await (async () => {");
  const hook = W.indexOf("const _au = await _audit(p, request, env, url, session)");
  const end = W.indexOf("const shell = htmlResponse(APP_HTML);");
  assert.ok(wrap > 0 && hook > wrap && hook < end, "the audit hook must sit inside the wrapper, before the console shell");
  assert.ok(hook > W.indexOf("const session = await getSession(request, env);"), "the hook needs the session");
});

test("the audit page escapes everything it draws from data", () => {
  const ui = read("audit_ui.js");
  assert.match(ui, /function esc\(v\)/);
  // every innerHTML built from a name / ship / text goes through esc(): a raw b.crew.name or f.text would be the bug
  assert.doesNotMatch(ui, /\+ (b\.crew\.name|f\.text|c\.name|s\.ship|a\.ship|t) \+/, "a data field reaches HTML unescaped");
});
