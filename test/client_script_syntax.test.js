// DEPLOY GATE (CI half): every inline <script> the worker serves must PARSE as JavaScript.
//
// Why this exists (incident 2026-07-03): the page templates are JS template literals, so an
// escape like '\n' written inside them is consumed at template evaluation and reaches the
// browser as a raw newline inside a string literal -- a SyntaxError that kills the ENTIRE
// inline script and white-screens the console. Wrangler deployed it anyway.
//
// This test calls the SAME function wrangler's [build] hook runs before every deploy
// (scripts/verify_client_scripts.mjs), so the CI gate and the deploy gate are one code path
// and cannot drift apart (CLAUDE.md §3 in spirit: the tested check == the deployed check). The
// build-time source PATCH that used to be mirrored here is gone: the source was fixed in July
// and the mirror had been a no-op since.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyClientScripts } from "../scripts/verify_client_scripts.mjs";

const pages = await verifyClientScripts(); // throws (fails the whole file) on any unparseable script

for (const name of ["APP_HTML", "LOGIN_HTML", "FB_HTML"]) {
  test(`${name}: every inline <script> parses as valid JavaScript`, () => {
    assert.ok(Array.isArray(pages[name]), `${name} was verified`);
    assert.ok(pages[name].length >= 1, `${name} contains at least one inline script`);
  });
}

test("the retired build-time patch pattern is not back in the source", () => {
  // The exact string that white-screened the console. The gate above would catch the resulting
  // SyntaxError anyway; this names the root cause so a regression reads clearly.
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.equal(src.includes("(r.seeded>0?('\\n'+r.seeded+' in-window items"), false,
    "autoToggleClick alert string carries a raw '\\n' inside the template literal again");
});
