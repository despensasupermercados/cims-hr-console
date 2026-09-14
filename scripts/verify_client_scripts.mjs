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

export const PAGES = ["APP_HTML", "LOGIN_HTML", "FB_HTML"];
// Pages that live in their own module with a plain named export (no temp copy needed).
//
// COVERAGE WIDENED 2026-09-10 — the gate was checking 4 of the 9 pages that serve an inline
// <script>. The five it missed were RELIEF_HTML, DEPLOY_HTML (two scripts), ACK_HTML, INSTR_HTML
// and the SBM survey. Two of those, /ack and /instr, are PUBLIC seafarer pages: a syntax error
// there white-screens a crew member's sign-off link and nobody internal ever sees it, which is
// strictly worse than the July console outage this gate was built for. ACK_HTML and INSTR_HTML
// were hoisted out of their install*() closures to module scope so they are reachable here.
// test/client_script_syntax.test.js has a meta-guard that fails if a NEW page with an inline
// script is added and not listed here — the list cannot silently fall behind again.
export const EXTRA = [
  ["CREW_IMPORT_HTML", new URL("../src/crew_import_ui.js", import.meta.url)],
  ["RELIEF_HTML", new URL("../src/relief_ui.js", import.meta.url)],
  ["DEPLOY_HTML", new URL("../src/relief_deploy.js", import.meta.url)],
  ["ACK_HTML", new URL("../src/signoff_ack.js", import.meta.url)],
  ["INSTR_HTML", new URL("../src/signoff_instructions.js", import.meta.url)],
];

// Pages BUILT per request rather than stored as a constant. They still serve an inline script, so
// they still have to parse — rendered here with representative arguments. The SBM survey embeds the
// token via JSON.stringify, which is exactly the kind of string-into-script seam that broke in July.
export const RENDERED = [
  ["SBM_SURVEY_HTML", new URL("../src/sbm.js", import.meta.url), "sbmSurveyHtml", [{
    token: "sample-token", name: "Ana Cruz", ship: "Reflection", brand: "Celebrity",
    signoff: "2026-11-20", rid: "rq_sample",
  }]],
  ["SBM_CLOSED_HTML", new URL("../src/sbm.js", import.meta.url), "sbmClosedHtml", ["expired"]],
];

// Evaluate the real src/worker.js (a temp copy next to it with the page constants exported, so
// sibling imports resolve) and return { page -> [inline script source, ...] }. Throws SyntaxError
// on the first unparseable script, naming the page.
const WORKER = new URL("../src/worker.js", import.meta.url);

// A page constant is a JS TEMPLATE LITERAL holding a whole HTML document. A stray backtick inside
// it — in markup, in a string, or (this is how it happens) in a code comment in the inline script —
// CLOSES the literal. The file then fails to parse and the failure reads as some unrelated
// identifier hundreds of lines later, which is a bad half hour. The import below cannot report
// this, because a file that does not parse cannot be imported. So it is checked on the raw text
// FIRST, and named for what it is. (Found 2026-09-14: a comment mentioning the vessel table in
// backticks took the whole console out; `npm test` said "Unexpected identifier 'vessel'".)
export function scanPageLiterals(text) {
  const bad = [];
  for (const m of text.matchAll(/^const (\w*_?HTML) = `/gm)) {
    const name = m[1];
    let i = m.index + m[0].length;
    for (;;) {
      const ch = text[i];
      if (ch === undefined) { bad.push({ name, line: null, why: "the literal is never closed" }); break; }
      if (ch === "\\") { i += 2; continue; }                       // escaped character
      if (ch === "$" && text[i + 1] === "{") {                      // ${...} interpolation: skip it whole
        let depth = 1; i += 2;
        while (i < text.length && depth) { if (text[i] === "{") depth++; else if (text[i] === "}") depth--; i++; }
        continue;
      }
      if (ch === "`") {
        // The first unescaped backtick CLOSES the literal. If what follows is not the end of the
        // assignment, this backtick is a stray and everything after it has been reinterpreted as code.
        const after = text.slice(i + 1, i + 3);
        if (!/^\s*[;,)]/.test(after)) {
          bad.push({ name, line: text.slice(0, i).split("\n").length, why: "an unescaped backtick closes the page literal early — escape it or reword" });
        }
        break;
      }
      i++;
    }
  }
  return bad;
}

export async function verifyClientScripts() {
  const raw = readFileSync(WORKER, "utf-8");
  const stray = scanPageLiterals(raw);
  if (stray.length) {
    throw new Error("unescaped backtick inside a page literal:\n  " +
      stray.map((b) => `${b.name} at src/worker.js:${b.line} — ${b.why}`).join("\n  "));
  }
  const tmp = new URL(`../src/__verify_${process.pid}__.mjs`, import.meta.url);
  writeFileSync(tmp, raw + `\nexport { ${PAGES.join(", ")} };\n`, "utf-8");
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
  for (const [name, url, fn, args] of RENDERED) {
    const mod = await import(url.href);
    if (typeof mod[fn] !== "function") throw new Error(`${fn} is not exported from ${url.pathname}`);
    pages[name] = mod[fn](...args);
  }
  for (const name of Object.keys(pages)) {
    const html = pages[name];
    if (!html || !html.length) throw new Error(`${name} is empty`);
    // Every inline script, whatever its attributes (type=module, defer, ...); external src= tags have no body.
    const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
    // SBM_CLOSED_HTML is a static "link expired" notice with no script by design — it is included
    // so that if it ever GAINS one, that script is parsed from day one rather than slipping the gate.
    if (!scripts.length && name !== "SBM_CLOSED_HTML") throw new Error(`no inline scripts in ${name}`);
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
