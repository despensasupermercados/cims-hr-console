// DEPLOY GATE: every inline <script> the worker serves must PARSE as JavaScript.
//
// Why (incident 2026-07-03): the page templates are JS template literals, so an escape like
// '\n' written inside them is consumed at template evaluation and reaches the browser as a raw
// newline inside a string literal — a SyntaxError that kills the ENTIRE inline script and
// white-screens the console for every signed-in user. Wrangler deployed it anyway: the newline
// is legal in the template literal itself, so nothing validated the JS the BROWSER receives.
//
// This module does. It is the ONE code path for that check: wrangler's [build] hook runs it
// before every deploy (Workers Builds, local, CI) and test/client_script_syntax.test.js calls
// the same function under `npm test`. The build-time PATCH that used to live here
// (scripts/apply_hotfix.mjs) is gone — the source has been fixed since July and the patch had
// been a no-op; the verification stays. vm.Script parses without executing.
import { readFileSync, writeFileSync, unlinkSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const PAGES = ["APP_HTML", "LOGIN_HTML", "FB_HTML"];
// Pages that live in their own module with a plain named export (no temp copy needed).
const EXTRA = [["CREW_IMPORT_HTML", new URL("../src/crew_import_ui.js", import.meta.url)]];

// Evaluate the real src/worker.js (a temp copy next to it with the page constants exported, so
// sibling imports resolve) and return { page -> [inline script source, ...] }. Throws SyntaxError
// on the first unparseable script, naming the page.
const WORKER = new URL("../src/worker.js", import.meta.url);
export async function verifyClientScripts() {
  const tmp = new URL(`../src/__verify_${process.pid}__.mjs`, import.meta.url);
  writeFileSync(tmp, readFileSync(WORKER, "utf-8") + `\nexport { ${PAGES.join(", ")} };\n`, "utf-8");
  let m;
  try {
    m = await import(tmp.href);
  } finally {
    unlinkSync(tmp);
  }
  const out = {};
  const pages = {}; // a module namespace is frozen, so collect into a plain object
  for (const name of PAGES) pages[name] = m[name];
  for (const [name, url] of EXTRA) pages[name] = (await import(url.href))[name];
  for (const name of Object.keys(pages)) {
    const html = pages[name];
    if (!html || !html.length) throw new Error(`${name} is empty`);
    // Every inline script, whatever its attributes (type=module, defer, ...); external src= tags have no body.
    const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
    if (!scripts.length) throw new Error(`no inline scripts in ${name}`);
    for (const src of scripts) new vm.Script(src, { filename: `${name}.inline.js` }); // throws SyntaxError
    out[name] = scripts;
  }
  return out;
}

// CLI entry (wrangler [build]): exit non-zero on any failure so the deploy stops. import.meta.url is
// realpath-resolved by the ESM loader, so argv[1] must be too — otherwise a checkout under a
// symlinked directory (macOS /tmp, container mounts) makes this guard false and the gate exits 0
// having verified NOTHING (the silent no-op CLAUDE.md §9 warns about).
const isCli = (() => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
})();
if (isCli) {
  try {
    const res = await verifyClientScripts();
    for (const [name, scripts] of Object.entries(res)) {
      console.log(`[verify] ${name}: ${scripts.length} inline script(s) parse cleanly`);
    }
  } catch (e) {
    console.error("[verify] FAILED —", (e && e.stack) || e);
    process.exit(1);
  }
}
