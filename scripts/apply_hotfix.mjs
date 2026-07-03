// BUILD-TIME HOTFIX (2026-07-03) -- runs automatically via npm "predeploy".
// Bug: autoToggleClick's alert string contains '\n' INSIDE the APP_HTML template
// literal in src/worker.js. The template evaluates the escape, so the browser
// receives a raw newline inside a single-quoted string: a SyntaxError that kills
// the entire inline script -> white screen for every signed-in user.
// src/worker.js (318KB) is too large to patch through the GitHub API directly,
// so this script repairs it in the build workspace before test + deploy.
// Idempotent: no-op once the source itself is fixed. When the fix is committed
// to src/worker.js for real, delete this file and the "predeploy" entry in
// package.json.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import vm from "node:vm";

const p = "src/worker.js";
let s = readFileSync(p, "utf-8");
const bad  = "(r.seeded>0?('\\n'+r.seeded+' in-window items";
const good = "(r.seeded>0?(' \u2014 '+r.seeded+' in-window items";

const n = s.split(bad).length - 1;
if (n === 1) {
  s = s.replace(bad, good);
  writeFileSync(p, s, "utf-8");
  console.log("[hotfix] autoToggleClick alert string repaired in build workspace");
} else if (n === 0 && s.includes(good)) {
  console.log("[hotfix] source already fixed -- no-op (safe to delete this hook)");
} else {
  console.error(`[hotfix] unexpected state: ${n} occurrences of broken pattern`);
  process.exit(1);
}

// Hard verification: evaluate the real module (temp copy with exports appended,
// so sibling imports resolve) and vm-parse every inline <script> it serves.
const tmp = "src/__hotfix_verify__.mjs";
writeFileSync(tmp, s + "\nexport { APP_HTML, LOGIN_HTML, FB_HTML };\n", "utf-8");
try {
  const m = await import("../" + tmp);
  for (const [name, html] of Object.entries({ APP_HTML: m.APP_HTML, LOGIN_HTML: m.LOGIN_HTML, FB_HTML: m.FB_HTML })) {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]);
    if (!scripts.length) { console.error(`[hotfix] no inline scripts in ${name}`); process.exit(1); }
    for (const src of scripts) new vm.Script(src, { filename: `${name}.inline.js` });
    console.log(`[hotfix] verified ${name}: ${scripts.length} inline script(s) parse cleanly`);
  }
} finally {
  unlinkSync(tmp);
}
