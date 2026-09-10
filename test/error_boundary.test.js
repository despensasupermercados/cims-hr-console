import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// CLAUDE.md §11, FIRST invariant: every API route must run under the error boundary.
//
// The fetch handler wraps the whole dispatch in `const res = await (async () => { ...routes... })();`.
// Routes are written as `return apiX(...)` WITHOUT their own await, so a rejected promise is only
// caught because the IIFE itself is awaited inside the try. Move a route below the closing `})();`
// — or drop the await — and its rejection escapes the try/catch and the caller gets Cloudflare's
// raw 500 instead of a clean JSON error. That is not hypothetical: it is exactly what happened to
// /api/daysworked.
//
// Nothing pinned this. sbm_toggle.test.js mentions the boundary but only asserts it for its own
// route. This guards the rule for EVERY route at once.
const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

// Scope strictly to the fetch handler. The client-side app HTML further down the file is full of
// fetch('/api/...') string literals that are not routes and must not be mistaken for them.
function fetchHandler() {
  const start = SRC.indexOf("async fetch(request, env) {");
  assert.notEqual(start, -1, "fetch handler not found");
  const end = SRC.indexOf("async email(message, env, ctx)", start);
  assert.notEqual(end, -1, "could not find the end of the fetch handler");
  return { start, end, body: SRC.slice(start, end) };
}

test("the dispatch is awaited inside the try (an unawaited IIFE defeats the boundary)", () => {
  const { body } = fetchHandler();
  assert.match(body, /try\s*\{/, "the fetch handler must have a try block");
  assert.match(
    body,
    /const res = await \(async \(\) => \{/,
    "the dispatch must be `const res = await (async () => {` — dropping the await lets route rejections escape the try",
  );
  assert.match(body, /catch \(err\)/, "the boundary must catch");
  assert.match(body, /"server_error"/, "the boundary must return a clean JSON error, not leak internals");
});

test("every /api route registration sits INSIDE the error boundary", () => {
  const { body } = fetchHandler();
  const open = body.indexOf("const res = await (async () => {");
  const close = body.indexOf("})();", open);
  assert.ok(open !== -1 && close !== -1, "could not locate the boundary IIFE");

  // Every ROUTE REGISTRATION in the handler, wherever it is.
  //
  // The pattern is deliberately precise. `p.startsWith("/api/")` appears TWICE in the handler and
  // only one of them is a route: the dispatch gate `if (p.startsWith("/api/")) {` (inside the
  // boundary), and the Server-Timing predicate `if (p.startsWith("/api/") && res instanceof
  // Response)` which is CORRECTLY outside it — it stamps the already-resolved response and is not
  // a route at all. Requiring the closing paren immediately after keeps the two apart; a looser
  // pattern reports the timing stamp as an escaped route and the guard cries wolf.
  const routes = [];
  const re = /p === "\/api\/[^"]*"|p\.startsWith\("\/api\/"\)\)/g;
  let m;
  while ((m = re.exec(body))) routes.push({ at: m.index, text: m[0] });

  assert.ok(routes.length > 20, `expected the full route table, found ${routes.length}`);
  const outside = routes.filter((r) => r.at < open || r.at > close).map((r) => r.text);
  assert.deepEqual(outside, [], "these routes are OUTSIDE the error boundary and will return a raw 500 on rejection: " + JSON.stringify(outside));
});

test("routes stay bare `return apiX(...)` — the boundary, not per-route awaits, is the contract", () => {
  const { body } = fetchHandler();
  // A route that awaits its own handler is not itself a bug, but it signals the boundary is being
  // worked around rather than relied on. The daysworked incident began exactly that way.
  const awaited = body.match(/if \(p === "\/api\/[^"]*"\)\s*return await /g) || [];
  assert.deepEqual(awaited, [], "these routes await individually instead of relying on the boundary: " + JSON.stringify(awaited));
});
