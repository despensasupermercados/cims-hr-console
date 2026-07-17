// make-submenu-spec.mjs — spec for the Reports left sub-menu restructure
// (Shipboard Feedback as first entry, Data-tab-style navy side menu).
//
// Diffs the current branch worker.js (/tmp/wfinal.js, byte-identical to the
// previously tested file) against the edited local src/worker.js and emits
// apply/reports-submenu.json in scripts/apply-spec.mjs format. Every block is
// SELF-CONSUMING by construction check: OLD must not be a substring of NEW,
// OLD unique in the old file, NEW absent from the old file; rebuild verified
// byte-identical, and a second application verified as a no-op via the skip rule.
//
// Usage: node scripts/make-submenu-spec.mjs

import { readFileSync, writeFileSync } from "node:fs";

const oldSrc = readFileSync("/tmp/wfinal.js", "utf-8");   // current branch state
const newSrc = readFileSync("src/worker.js", "utf-8");     // edited + tested
const ol = oldSrc.split("\n"), nl = newSrc.split("\n");
const count = (hay, needle) => hay.split(needle).length - 1;
const b64 = s => Buffer.from(s, "utf-8").toString("base64");

// line diff via common prefix/suffix per changed region using a simple LCS walk
function opcodes(a, b) {
  const idxB = new Map();
  b.forEach((line, i) => { if (!idxB.has(line)) idxB.set(line, []); idxB.get(line).push(i); });
  const ops = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    let bi = -1; for (const c of (idxB.get(a[i]) || [])) if (c >= j) { bi = c; break; }
    let ai = -1; for (let k = i; k < Math.min(a.length, i + 400); k++) if (a[k] === b[j]) { ai = k; break; }
    if (bi >= 0 && (ai < 0 || (bi - j) <= (ai - i))) { ops.push(["ins", i, i, j, bi]); j = bi; }
    else if (ai >= 0) { ops.push(["del", i, ai, j, j]); i = ai; }
    else { ops.push(["rep", i, i + 1, j, j + 1]); i++; j++; }
  }
  if (j < b.length) ops.push(["ins", i, i, j, b.length]);
  if (i < a.length) ops.push(["del", i, a.length, j, j]);
  const merged = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && op[1] <= last[2] + 1 && op[3] <= last[4] + 1) {
      last[2] = Math.max(last[2], op[2]); last[4] = Math.max(last[4], op[4]); last[0] = "rep";
    } else merged.push([...op]);
  }
  return merged;
}

const regions = opcodes(ol, nl);
console.log("changed regions:", regions.map(r => r[0] + " old " + (r[1]+1) + "-" + r[2] + " new " + (r[3]+1) + "-" + r[4]).join(" | "));

const blocks = [];
for (const [, i1, i2, j1, j2] of regions) {
  let k = 1, o, n;
  for (;;) {
    const before = ol.slice(i1 - k, i1).join("\n");
    const after = ol.slice(i2, i2 + k).join("\n");
    o = before + "\n" + ol.slice(i1, i2).join("\n") + (i2 > i1 ? "\n" : "") + after;
    n = before + "\n" + nl.slice(j1, j2).join("\n") + (j2 > j1 ? "\n" : "") + after;
    if (count(oldSrc, o) === 1 && !n.includes(o) && !o.includes(n) && count(oldSrc, n) === 0) break;
    k++;
    if (k > 20) { console.error("no safe anchor for region at old line " + (i1 + 1)); process.exit(1); }
  }
  blocks.push({ o: b64(o), n: b64(n), why: "reports sub-menu restructure at old line " + (i1 + 1) });
}

// verify rebuild + idempotence under apply-spec semantics
let src = oldSrc;
for (const blk of blocks) {
  const o = Buffer.from(blk.o, "base64").toString("utf-8");
  const n = Buffer.from(blk.n, "base64").toString("utf-8");
  if (count(src, o) !== 1) { console.error("verify: OLD not unique"); process.exit(1); }
  src = src.replace(o, () => n);
}
if (src !== newSrc) { console.error("VERIFY FAILED: rebuild != edited file"); process.exit(1); }
let again = src;
for (const blk of blocks) {
  const o = Buffer.from(blk.o, "base64").toString("utf-8");
  const n = Buffer.from(blk.n, "base64").toString("utf-8");
  if (again.includes(n) && !again.includes(o)) continue;
  if (count(again, o) === 1) again = again.replace(o, () => n);
}
if (again !== src) { console.error("VERIFY FAILED: re-run not a no-op"); process.exit(1); }

const spec = { target: "src/worker.js", blocks };
writeFileSync("apply/reports-submenu.json", JSON.stringify(spec, null, 1));
console.log("OK: apply/reports-submenu.json — " + blocks.length + " blocks, " +
  JSON.stringify(spec).length + " bytes; rebuild byte-identical, re-run no-op.");
