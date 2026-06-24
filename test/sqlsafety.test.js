import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression guard: aliasing a SELECT column to a reserved SQL keyword (e.g. `sign_on on`) makes
// D1/SQLite reject the query at runtime — it silently broke the days-worked export from the
// keyman_contract3 rename onward. These are unit-untestable (DB-bound), so we statically forbid the
// specific reserved-word aliases that have bitten us. If you must alias to a keyword, quote it.
const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

test("no SELECT column aliased to the reserved word `on` (unquoted)", () => {
  // matches `<ident> on` or `<ident> as on` used as a column alias, not the JOIN ... ON keyword.
  const bad = /\b\w+\s+(?:as\s+)?on\b(?=\s*[,)]|\s+from\b)/i;
  assert.equal(bad.test(SRC), false, "found a column aliased to reserved word `on` — quote it or rename");
});

test("days-worked reads keyman_contract3 raw columns (no keyword alias)", () => {
  assert.match(SRC, /SELECT sc, ship, sign_on, proj_off, act_off FROM keyman_contract3/);
});
