import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static guards for the forward-leg projection (2026-07-27), in the same spirit as
// sqlsafety / perf_invariants: the safety argument for this feature is that projected
// rows are is_current=0 and therefore invisible to every existing reader. That argument
// is only true for as long as BOTH halves hold, and neither half is unit-testable
// against a live DB — so we pin them statically.
const WORKER = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const PROJ = readFileSync(new URL("../src/leg_projection.js", import.meta.url), "utf8");
const RELIEF = readFileSync(new URL("../src/relief_api.js", import.meta.url), "utf8");
const LEGSRC = readFileSync(new URL("../src/ship_leg_source.js", import.meta.url), "utf8");

// These guards must inspect CODE, not prose: this module's header deliberately
// discusses is_current=1 at length, and a guard that greps the comments would
// pass or fail for the wrong reason.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// Every SQL string handed to env.DB.prepare(...).bind(...)
function preparedSql(src) {
  const out = [];
  const re = /env\.DB\.prepare\(([\s\S]*?)\)\s*\.\s*bind/g;
  let m;
  while ((m = re.exec(src))) {
    // drop the string literal's own delimiters so the statement starts at the verb
    out.push(m[1].replace(/\s+/g, " ").trim().replace(/^[`'"]/, "").replace(/[`'"]$/, ""));
  }
  return out;
}

// Pull each SQL statement that reads ship_leg out of a source file.
// Delimiter-aware: an earlier loose version matched from any `SELECT` up to the next
// quote and happily spanned two adjacent statements, so `.split(/WHERE/)` picked up
// the WRONG query's WHERE clause. Extract whole string literals instead.
function shipLegSelects(src) {
  const out = [];
  const re = /(`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g;
  let m;
  while ((m = re.exec(stripComments(src)))) {
    const body = m[1].slice(1, -1).replace(/\s+/g, " ").trim();
    if (/\bFROM\s+ship_leg\b/i.test(body)) out.push(body);
  }
  return out;
}

test("HALF 1: every existing ship_leg reader excludes projected forward legs", () => {
  const readers = [
    ...shipLegSelects(WORKER),
    ...shipLegSelects(RELIEF),
    ...shipLegSelects(LEGSRC),
  ];
  assert.ok(readers.length >= 8, `expected the known ship_leg readers, found ${readers.length}`);
  for (const sql of readers) {
    // Must be excluded in the WHERE clause, not merely mentioned in the SELECT list.
    // (The first cut of this guard only grepped for the token `is_current` and went green
    // against legsFromShipLeg, which SELECTs the column but never filtered on it. That
    // reader feeds schEnr date-enrichment and, through it, apiBillingMonth.)
    const where = sql.split(/\bWHERE\b/i)[1];
    if (!where) {
      // fetchShipIndex reads only DISTINCT brand/ship_short — no rows, no leak.
      assert.match(sql, /SELECT DISTINCT brand, ship_short/i,
        "a ship_leg read has no WHERE clause at all:\n  " + sql);
      continue;
    }
    const guarded =
      /is_current\s*=\s*1/.test(where) ||
      /is_current\s*=\s*0/.test(where) ||          // the arrivals reader, deliberately
      /assignment:%/.test(where);                   // explicit projected-row exclusion
    assert.ok(
      guarded,
      "a ship_leg read does not exclude projected forward legs in its WHERE clause — they would " +
      "leak into the board/dashboard/billing set:\n  " + sql
    );
  }
});

test("HALF 1: legsFromShipLeg specifically excludes projected rows", () => {
  const sql = LEGSRC.replace(/\s+/g, " ");
  assert.match(
    sql,
    /WHERE l\.ours = 1 AND NOT \(l\.source LIKE 'assignment:%' AND l\.is_current = 0\)/,
    "legsFromShipLeg lost its projected-leg exclusion. It has no is_current=1 filter, so " +
    "projected legs would win the schEnr off_date race and rewrite board dates + billed days."
  );
});

test("HALF 2: the projection never writes is_current=1", () => {
  const code = stripComments(PROJ);
  assert.equal(
    /is_current\s*=\s*1/.test(code), false,
    "leg_projection.js sets is_current=1 in CODE — that would put a projected leg into the " +
    "billing-visible set. Promotion is Phase 2 and needs its own review."
  );
  assert.match(code, /VALUES \(\?,\?,\?,\?,1,\?,\?,\?,\?,\?,\?,0,\?,\?\)/,
    "the INSERT column order changed — re-verify the is_current position is still literal 0");
  // and the plan itself must only ever emit 0
  assert.match(code, /is_current:\s*0/, "planProjection must pin is_current: 0 on every row it emits");
});

test("HALF 2: every projection write is scoped to rows the projection owns", () => {
  const writes = preparedSql(stripComments(PROJ))
    .filter(sql => /^(UPDATE|DELETE FROM)\s+ship_leg\b/i.test(sql));
  assert.equal(writes.length, 2, "expected exactly the UPDATE and the DELETE");
  for (const sql of writes) {
    assert.match(
      sql,
      /source LIKE 'assignment:%'/,
      "a projection write is not scoped to source LIKE 'assignment:%' — it could modify or delete " +
      "a keyman_roster row (including the 8 orphans Miguel asked to carry as-is):\n  " + sql
    );
    assert.match(sql, /is_current=0/,
      "a projection write is not pinned to is_current=0:\n  " + sql);
  }
});

test("the projection is wired to exactly ONE writer call site", () => {
  const calls = WORKER.match(/projectFutureLegs\s*\(/g) || [];
  assert.equal(calls.length, 1,
    `projectFutureLegs is called ${calls.length} times; keep it to one so two cron ticks cannot race`);
});

test("the arrivals reader is the only place that reads is_current=0", () => {
  assert.match(PROJ, /l\.is_current = 0/, "fetchArrivals should explicitly read the forward set");
  // and it must stay scoped to projected rows, so a stray is_current=0 row can't appear as an arrival
  assert.match(PROJ, /source LIKE 'assignment:%'[\s\S]{0,200}on_date BETWEEN/,
    "fetchArrivals must stay scoped to projected rows");
});
