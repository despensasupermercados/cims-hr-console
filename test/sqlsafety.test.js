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

// 2026-09-14: the board (rotationSections), the crew list and the rank map read every Counter
// contract through counter_legs.KC3_LEGS_SQL — one statement, raw column names, no reserved alias.
// (P3.13 had them on the frozen ship_leg snapshot; before that a `sign_on AS on` alias silently
// broke days-worked, which is what this guard exists for.)
test("board / crew-list / rank legs come from KC3_LEGS_SQL, which uses no keyword alias", async () => {
  const { KC3_LEGS_SQL, COUNTER_LEG_SQL } = await import("../src/counter_legs.js");
  assert.match(SRC, /env\.DB\.prepare\(KC3_LEGS_SQL\)\.all\(\)/);
  assert.doesNotMatch(SRC, /FROM ship_leg WHERE ours=1 AND is_current=1/, "a reader still takes current legs from the frozen snapshot");
  const bad = /\b\w+\s+(?:as\s+)?on\b(?=\s*[,)]|\s+from\b)/i;
  assert.equal(bad.test(KC3_LEGS_SQL), false);
  assert.equal(bad.test(COUNTER_LEG_SQL), false);
});
