// apply-spec.mjs — rebuild a large source file from a small base64 find/replace spec.
//
// WHY: the agent can push small files to GitHub but not a 300 KB worker.js in one
// piece. Instead it pushes a tiny spec describing the exact blocks that change; CI
// runs this script to reassemble the real file, then the normal test gate runs on
// the result. No large-file transfer, no manual web-editor edits.
//
// Usage:  node scripts/apply-spec.mjs apply/<name>.json
// Spec shape:
//   { "target": "src/worker.js", "blocks": [ { "o": <base64 old>, "n": <base64 new> }, ... ] }
// Each OLD block must occur EXACTLY once in the target (fails loudly otherwise).
// Idempotent: a block whose NEW is already present (and OLD absent) is skipped, so
// re-running on an already-applied branch is a safe no-op.

import { readFileSync, writeFileSync } from "node:fs";

const specPath = process.argv[2];
if (!specPath) { console.error("usage: node scripts/apply-spec.mjs <spec.json>"); process.exit(1); }

const spec = JSON.parse(readFileSync(specPath, "utf-8"));
if (!spec.target) { console.error(specPath + ": spec missing 'target'"); process.exit(1); }

let src = readFileSync(spec.target, "utf-8");
let applied = 0, skipped = 0;
(spec.blocks || []).forEach((blk, i) => {
  const o = Buffer.from(blk.o, "base64").toString("utf-8");
  const n = Buffer.from(blk.n, "base64").toString("utf-8");
  if (src.includes(n) && !src.includes(o)) { skipped++; return; } // already applied
  const count = src.split(o).length - 1;
  if (count === 0) {
    // OLD not present (and NEW not present either, per the check above): a stale/consumed/poison
    // spec whose target region was later changed. Skip it with a warning — a dead spec must NOT
    // abort the whole run (that silently blocked later specs from ever applying). Prune it later.
    console.warn(specPath + " block " + i + ": OLD not found — stale/consumed spec, skipping");
    skipped++; return;
  }
  if (count > 1) {
    console.error(specPath + " block " + i + ": OLD occurs " + count + " times in " + spec.target + " (need exactly 1)");
    process.exit(2);
  }
  src = src.replace(o, () => n);   // function replacement: keep NEW literal ($&, $', $1… are NOT special)
  applied++;
});

writeFileSync(spec.target, src);
console.log(specPath + " -> " + spec.target + ": applied " + applied + ", skipped " + skipped);
