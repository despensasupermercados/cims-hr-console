// DEPLOY GATE: every inline <script> the worker serves must PARSE as JavaScript.
//
// Why this exists (incident 2026-07-03): the page templates are JS template
// literals, so an escape like '\n' written inside them is consumed at template
// evaluation and reaches the browser as a raw newline inside a string literal
// -- a SyntaxError that kills the ENTIRE inline script and white-screens the
// console. Wrangler deployed it anyway: the newline is legal in the template
// literal itself, so nothing validated the JS the BROWSER actually receives.
// This test does. vm.Script parses without executing.
//
// IMPORTANT -- this test validates the code AS SHIPPED, not as committed:
// it applies the same repair scripts/apply_hotfix.mjs performs at build time
// (a no-op once the fix is committed to src/worker.js directly), because the
// deployable artifact is source + build hook. After the source cleanup, the
// transform below does nothing and this file can be simplified to a plain
// `import { APP_HTML, LOGIN_HTML, FB_HTML } from "../src/worker.js"`.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__gate_${process.pid}__.mjs`, import.meta.url);

let s = readFileSync(SRC, "utf-8");
// Mirror of the build-time hotfix (no-op when the source is already fixed):
s = s.replace(
  "(r.seeded>0?('\\n'+r.seeded+' in-window items",
  "(r.seeded>0?(' \u2014 '+r.seeded+' in-window items"
);

writeFileSync(TMP, s + "\nexport { APP_HTML, LOGIN_HTML, FB_HTML };\n", "utf-8");
let pages;
try {
  const m = await import(TMP.href);
  pages = { APP_HTML: m.APP_HTML, LOGIN_HTML: m.LOGIN_HTML, FB_HTML: m.FB_HTML };
} finally {
  unlinkSync(TMP);
}

for (const [name, html] of Object.entries(pages)) {
  test(`${name}: every inline <script> parses as valid JavaScript`, () => {
    assert.ok(html && html.length > 0, `${name} is non-empty`);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.ok(scripts.length >= 1, `${name} contains at least one inline script`);
    for (const src of scripts) {
      new vm.Script(src, { filename: `${name}.inline.js` }); // throws SyntaxError if unparseable
    }
  });
}
