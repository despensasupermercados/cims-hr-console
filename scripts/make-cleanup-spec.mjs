// make-cleanup-spec.mjs — regenerate apply/z-cleanup-dedupe.json with double-sided
// anchors, in the spec format consumed by this repo's own scripts/apply-spec.mjs.
//
// A legacy spec (apply/step4-branded-datatab.json, block 5) is a "poison" spec:
// its NEW text contains its own OLD anchor, so every apply-spec CI run re-inserted
// an 84-line block into src/worker.js on the feature branch. This builds the
// one-time removal spec for that duplicate, with three safety proofs before
// writing: (1) OLD matches the duplicate site exactly once on the branch file,
// (2) OLD matches zero times in the clean tested file (can never fire again or
// touch a legitimate copy), (3) applying it reproduces the tested file exactly.
// It then simulates the full planned commit sequence end-to-end.
//
// Usage: node scripts/make-cleanup-spec.mjs

import { readFileSync, writeFileSync } from "node:fs";

const branch = readFileSync("/tmp/worker.branch.js", "utf-8"); // remote branch (has dup)
const target = readFileSync("src/worker.js", "utf-8");          // clean tested file
const bl = branch.split("\n");
const [i1, i2] = [3215, 3299];                                  // duplicate line span
const b64 = s => Buffer.from(s, "utf-8").toString("base64");
const count = (hay, needle) => hay.split(needle).length - 1;

// NOTE: the duplicate is adjacent to its identical original and the block is
// self-similar at its edges, so short anchors are periodic — OLD must extend
// past the ENTIRE previous copy so it only matches "two consecutive copies",
// a pattern that cannot exist in the clean file. Hence the large kb range.
let found = null;
outer:
for (let kb = 1; kb < 260; kb++) {
  for (let ka = 1; ka < 8; ka++) {
    const before = bl.slice(i1 - kb, i1).join("\n");
    const after = bl.slice(i2, i2 + ka).join("\n");
    const o = before + "\n" + bl.slice(i1, i2).join("\n") + "\n" + after;
    const n = before + "\n" + after;
    if (count(branch, o) === 1 && count(target, o) === 0 &&
        branch.replace(o, () => n) === target && count(target, n) === 1) {
      found = { o, n, kb, ka }; break outer;
    }
  }
}
if (!found) { console.error("no safe double-sided anchor found"); process.exit(1); }
console.log("anchors: before " + found.kb + " lines, after " + found.ka + " lines");

const spec = { target: "src/worker.js", blocks: [{ o: b64(found.o), n: b64(found.n),
  why: "one-time removal of the 84-line importer block duplicated by poison spec " +
       "step4 block 5 (its NEW contained its own OLD anchor, so it re-applied on " +
       "every CI run). OLD is anchored on BOTH sides so it matches only the " +
       "duplicate site, never a legitimate copy. step4 and the consumed step " +
       "specs are deleted in this PR." }] };
writeFileSync("apply/z-cleanup-dedupe.json", JSON.stringify(spec, null, 1));
console.log("z-cleanup spec written");

// ---- end-to-end simulation of the planned commit sequence -------------------
import { readFileSync as rf } from "node:fs";
function run(src, specs) { // faithful re-implementation of apply-spec.mjs semantics
  for (const f of [...specs].sort()) {
    const d = JSON.parse(rf(f, "utf-8"));
    for (const b of d.blocks) {
      const oo = Buffer.from(b.o, "base64").toString("utf-8");
      const nn = Buffer.from(b.n, "base64").toString("utf-8");
      if (src.includes(nn) && !src.includes(oo)) continue; // already applied
      const c = count(src, oo);
      if (c === 0) continue;                                // stale spec
      if (c > 1) { console.error(f + " non-unique OLD"); process.exit(2); }
      src = src.replace(oo, () => nn);
    }
  }
  return src;
}
const S = ["apply/reports-tab-v1.json", "apply/step2-embed-mode.json",
  "apply/step2-retire-old-importer.json", "apply/step3-full-branded-page.json",
  "apply/step4-branded-datatab.json", "apply/step5-branded-shell.json",
  "apply/step6-upload-view.json"];
const Z = "apply/z-cleanup-dedupe.json";

let src = run(branch, S);                                          // C1 run
src = run(src, S.concat([Z]));                                     // C2 run
const S3 = S.filter(f => !f.includes("step4")); src = run(src, S3.concat([Z])); // C3
const S4 = S3.filter(f => !f.includes("step2-embed")); src = run(src, S4.concat([Z])); // C4
console.log("after C4 == tested target:", src === target);
for (let r = 0; r < 4; r++) {
  const prev = src;
  src = run(src, ["apply/reports-tab-v1.json", Z]);
  if (src !== prev) { console.error("later run was NOT a no-op"); process.exit(3); }
}
console.log("all further runs are no-ops: true");
