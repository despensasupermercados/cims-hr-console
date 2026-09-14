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
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { verifyClientScripts } from "../scripts/verify_client_scripts.mjs";

// The gate runs INSIDE a named test (not at module top level): a top-level throw fails the file
// at load with a raw stack and skips every other test here, including the root-cause pin below.
let pages = null;
test("deploy gate: every inline <script> the worker serves parses as JavaScript", async () => {
  pages = await verifyClientScripts(); // throws SyntaxError naming the page on the first bad script
});

for (const name of ["APP_HTML", "LOGIN_HTML", "FB_HTML", "CREW_IMPORT_HTML"]) {
  test(`${name}: every inline <script> parses as valid JavaScript`, () => {
    assert.ok(pages, "the deploy gate test above must run first and pass");
    assert.ok(Array.isArray(pages[name]), `${name} was verified`);
    assert.ok(pages[name].length >= 1, `${name} contains at least one inline script`);
  });
}

test("the deploy gate rejects an unparseable inline script (negative case, in-process)", () => {
  // Same vm.Script rule the gate applies, on a minimal broken script: proves the check has teeth.
  const vm = require("node:vm");
  assert.throws(() => new vm.Script("var s = 'a\nb';", { filename: "broken.inline.js" }), SyntaxError);
});

test("the retired build-time patch pattern is not back in the source", () => {
  // The exact string that white-screened the console. The gate above would catch the resulting
  // SyntaxError anyway; this names the root cause so a regression reads clearly.
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.equal(src.includes("(r.seeded>0?('\\n'+r.seeded+' in-window items"), false,
    "autoToggleClick alert string carries a raw '\\n' inside the template literal again");
});

test("both import-page escapers neutralise quotes (spreadsheet text lands inside HTML attributes and text)", () => {
  const ui = readFileSync(new URL("../src/crew_import_ui.js", import.meta.url), "utf-8");
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.match(ui, /function esc\(s\)\{[^\n]*&quot;/, "crew_import_ui esc() must escape a double quote");
  assert.match(src, /function impEsc\(s\)\{[^\n]*&quot;/, "worker impEsc() must escape a double quote");
});

// ---- META-GUARD: the gate's page list must not fall behind the code -------------------------
// 2026-09-10. The gate was built after the July white-screen outage, then quietly drifted: it was
// checking 4 of the 9 pages that serve an inline <script>. The five it missed included /ack and
// /instr — PUBLIC seafarer pages, where a syntax error white-screens a crew member's sign-off link
// and nobody internal ever sees it. Widening the list fixed today; this stops it drifting again.
// Adding a new page with an inline script now fails here until it is added to the gate.
import { readdirSync } from "node:fs";
import { PAGES, EXTRA, RENDERED } from "../scripts/verify_client_scripts.mjs";

// Comments are stripped first: the explanatory notes in signoff_ack.js / signoff_instructions.js
// mention "<script>" in prose, and a naive scan reports those as uncovered pages.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

test("every module serving an inline <script> is covered by the deploy gate", () => {
  const dir = new URL("../src/", import.meta.url);
  const covered = new Set([
    "worker.js",                                         // APP_HTML / LOGIN_HTML / FB_HTML via PAGES
    ...EXTRA.map(([, url]) => url.pathname.split("/").pop()),
    ...RENDERED.map(([, url]) => url.pathname.split("/").pop()),
  ]);

  const uncovered = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = stripComments(readFileSync(new URL(f, dir), "utf8"));
    // An inline script only — a <script src=...> tag has no body to parse.
    if (!/<script\b(?![^>]*\bsrc=)[^>]*>/.test(src)) continue;
    if (!covered.has(f)) uncovered.push(f);
  }
  assert.deepEqual(uncovered, [],
    "these modules serve an inline <script> that the deploy gate never parses — add them to " +
    "EXTRA or RENDERED in scripts/verify_client_scripts.mjs: " + JSON.stringify(uncovered));
});

test("the gate actually parses the public seafarer pages", () => {
  // Named explicitly: these two are the ones a broken script would hurt most quietly.
  const names = [...PAGES, ...EXTRA.map(([n]) => n), ...RENDERED.map(([n]) => n)];
  for (const n of ["ACK_HTML", "INSTR_HTML", "SBM_SURVEY_HTML"]) {
    assert.ok(names.includes(n), n + " must be in the deploy gate — it is a public, unauthenticated page");
  }
});

// A page constant is a template literal holding a whole HTML document. A stray backtick inside it
// closes the literal, the file stops parsing, and the error surfaces as an unrelated identifier
// hundreds of lines away. It happened on 2026-09-14: a code comment naming the vessel table in
// backticks took the whole console out and `npm test` reported "Unexpected identifier 'vessel'".
// The import-based gate cannot catch this — a file that does not parse cannot be imported — so the
// raw text is scanned first and the failure is named.
test("a stray backtick inside a page literal is caught on the raw text, and named", async () => {
  const { scanPageLiterals } = await import("../scripts/verify_client_scripts.mjs");
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.deepEqual(scanPageLiterals(src), [], "a page literal is closed early somewhere in worker.js");

  const anchor = "const APP_HTML = `";
  const at = src.indexOf(anchor) + anchor.length;
  const broken = src.slice(0, at + 40) + "`" + src.slice(at + 40);
  const found = scanPageLiterals(broken);
  assert.equal(found.length, 1, "the scanner must see a backtick dropped into APP_HTML");
  assert.equal(found[0].name, "APP_HTML");
  assert.ok(found[0].line > 1, "it must say WHICH line, or it saves nobody any time");
  assert.match(found[0].why, /closes the page literal early/);

  // An ESCAPED backtick is legitimate (a template literal inside an inline script) and must pass.
  const escaped = src.slice(0, at + 40) + "\\`" + src.slice(at + 40);
  assert.deepEqual(scanPageLiterals(escaped), []);
});
