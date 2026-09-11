// Maria's error surface — CLAUDE.md has no rule for this; the rule is Miguel's: Maria never shows
// the team a developer code.
//
// The incident: from China, two questions came back with the literal text `model_http_403`.
// Cloudflare had run the Worker in a region the Anthropic API geo-blocks, so the model call was
// refused — permission, not credit, not the key, and nothing to do with the reader's data. The
// reader saw jargon, and the provider's own explanation was thrown away before anything logged it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mariaFriendlyError } from "../src/maria_errors.js";

test("a provider code becomes a sentence, not a code", () => {
  const msg = mariaFriendlyError("model_http_403");
  assert.ok(!msg.includes("model_http"), "the code must not survive into the message");
  assert.ok(!/\b403\b/.test(msg), "nor the bare status number");
  assert.match(msg, /permissions setting on the AI account/);
  assert.match(msg, /not a problem with your question or your data/, "say plainly whose problem it is");
});

test("each mapped failure tells the reader whether to retry", () => {
  assert.match(mariaFriendlyError("model_http_429"), /ask again/i);
  assert.match(mariaFriendlyError("model_http_500"), /ask again/i);
  assert.match(mariaFriendlyError("model_http_503"), /ask again/i);
  assert.match(mariaFriendlyError("model_http_504"), /Ask again/);
  assert.match(mariaFriendlyError("model_http_401"), /API key/);
  assert.match(mariaFriendlyError("model_http_402"), /billing/);
  for (const c of ["model_http_401", "model_http_403", "model_http_429", "model_http_402", "model_http_500", "model_http_418"]) {
    assert.ok(!mariaFriendlyError(c).includes("model_http"), c + " leaked its code");
  }
});

test("an unclassified provider status still gets a sentence", () => {
  const msg = mariaFriendlyError("model_http_418");
  assert.match(msg, /could not reach the AI model/);
});

test("an unmapped, non-provider code is returned verbatim", () => {
  // Inventing a soothing sentence for a failure nobody has classified hides it, and hiding it is
  // how it stays unclassified.
  assert.equal(mariaFriendlyError("some_new_code"), "some_new_code");
  assert.equal(mariaFriendlyError(null), null);
  assert.equal(mariaFriendlyError(""), null);
  assert.equal(mariaFriendlyError(undefined), null);
});

test("no message claims someone was alerted, because nothing alerts them", () => {
  // The console writes a maria_log row. It does not email Miguel. Telling a reader they have been
  // notified when they have not is worse than saying nothing.
  for (const c of ["model_http_401", "model_http_403", "model_http_402", "model_http_429", "model_http_500", "model_http_418"]) {
    const msg = mariaFriendlyError(c);
    assert.ok(!/notified/i.test(msg), c + " claims a notification that does not happen");
  }
  assert.match(mariaFriendlyError("model_http_403"), /recorded in Maria's log/);
});

// --- wiring (static: apiAsk is DB- and network-bound) ------------------------
const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

test("apiAsk returns the sentence as `error` and the raw code as `code`", () => {
  assert.match(SRC, /error: mariaFriendlyError\(res\.error\), code: res\.error \|\| null/,
    "the reader gets the sentence; support gets the code, separately");
  assert.match(SRC, /import \{ mariaFriendlyError \} from "\.\/maria_errors\.js"/);
});

test("the provider's own reason is persisted to maria_log.note", () => {
  assert.match(SRC, /const noteVal = res\.error \? \(String\(res\.detail \|\| ""\)\.slice\(0, 500\) \|\| null\) : null;/,
    "without the body all we keep is a status code, and the reason has to be guessed");
  assert.match(SRC, /INSERT INTO maria_log \(user_email, question, answer, error, sources, sql_run, steps, in_tokens, out_tokens, ms, note\) VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)/,
    "note has to be in the column list AND have its own placeholder");
  // A successful answer must not write a note — that column is the user's feedback text.
  assert.ok(SRC.includes("res.error ? ("), "note is only written on a failure");
});

test("the client renders the sentence, never the raw provider body", () => {
  assert.match(SRC, /var em=\(j&&j\.error\)\|\|'No answer returned\.'/,
    "j.detail is the provider's raw body — showing it as a fallback is the same jargon problem");
  assert.doesNotMatch(SRC, /mariaEsc\(\(j&&\(j\.error\|\|j\.detail\)\)/);
  assert.match(SRC, /Reference: '\+mariaEsc\(j\.code\)/, "the code stays quotable for support");
});
