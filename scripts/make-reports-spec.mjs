// make-reports-spec.mjs — generate an apply/*.json spec for the Reports-tab change.
//
// PURPOSE: this repo's CI has a documented mechanism (apply-spec.yml +
// scripts/apply-spec.mjs) for delivering changes to large files: instead of
// pushing the full 420 KB src/worker.js, an agent pushes a SMALL spec of
// find/replace blocks (base64-wrapped, per the spec format that
// scripts/apply-spec.mjs consumes) and CI rebuilds worker.js on the branch.
//
// HISTORY NOTE: this v1 generator used PREFIX anchors (NEW = OLD + addition),
// which under apply-spec.mjs semantics re-applies on every run — the same
// defect as the legacy step4 poison spec. Superseded by the v2 straddling-
// anchor spec committed as apply/reports-tab-v1.json (OLD = line-before +
// line-after, consumed on first application). Kept for the audit trail.
//
// This script diffs the CURRENT (edited) src/worker.js against the pristine
// main version saved at /tmp/worker.main.js, and emits apply/reports-tab-v1.json.
// Each OLD block is verified to occur exactly once, and the rebuilt result is
// verified byte-identical to the edited file before the spec is written.
//
// Usage: node scripts/make-reports-spec.mjs

import { readFileSync, writeFileSync } from "node:fs";

const oldSrc = readFileSync("/tmp/worker.main.js", "utf-8");   // pristine main
const newSrc = readFileSync("src/worker.js", "utf-8");          // edited version

const ol = oldSrc.split("\n"), nl = newSrc.split("\n");

function lcsOpcodes(a, b) {
  const idxB = new Map();
  b.forEach((line, i) => { if (!idxB.has(line)) idxB.set(line, []); idxB.get(line).push(i); });
  const ops = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    let bi = -1;
    const cand = idxB.get(a[i]) || [];
    for (const c of cand) if (c >= j) { bi = c; break; }
    if (bi >= 0) { ops.push(["insert", i, i, j, bi]); j = bi; continue; }
    ops.push(["delete", i, i + 1, j, j]); i++;
  }
  if (j < b.length) ops.push(["insert", i, i, j, b.length]);
  if (i < a.length) ops.push(["delete", i, a.length, j, j]);
  return ops;
}

const raw = lcsOpcodes(ol, nl);
if (raw.some(o => o[0] === "delete")) {
  console.error("Unexpected deletions — this change should be pure insertions. Aborting.");
  process.exit(1);
}

const b64 = s => Buffer.from(s, "utf-8").toString("base64");
const blocks = [];
for (const [, i1, i2, j1, j2] of raw) {
  let k = 1, oblock, nblock;
  for (;;) {
    const anchor = ol.slice(i1 - k, i1).join("\n");
    oblock = anchor;
    nblock = anchor + "\n" + nl.slice(j1, j2).join("\n");
    if (oblock.length && oldSrc.split(oblock).length - 1 === 1) break;
    k++;
    if (k > 15) { console.error("no unique anchor near old line " + i1); process.exit(1); }
  }
  blocks.push({ o: b64(oblock), n: b64(nblock), why: "insert Reports-tab code after old line " + i1 });
}

let rebuilt = oldSrc;
for (const blk of blocks) {
  const o = Buffer.from(blk.o, "base64").toString("utf-8");
  const n = Buffer.from(blk.n, "base64").toString("utf-8");
  if (rebuilt.split(o).length - 1 !== 1) { console.error("block not unique at verify"); process.exit(1); }
  rebuilt = rebuilt.replace(o, () => n);
}
if (rebuilt !== newSrc) { console.error("VERIFY FAILED: rebuild != edited file"); process.exit(1); }

const spec = { target: "src/worker.js", blocks };
writeFileSync("apply/reports-tab-v1.json", JSON.stringify(spec, null, 1));
console.log("OK: apply/reports-tab-v1.json — " + blocks.length + " blocks, " +
  JSON.stringify(spec).length + " bytes; rebuild verified byte-identical.");
