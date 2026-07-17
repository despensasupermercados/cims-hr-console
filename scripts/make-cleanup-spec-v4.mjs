// make-cleanup-spec-v4.mjs — definitive cleanup: reduce the importer copy-run to
// exactly ONE copy, on the branch AND (via this PR) in main.
//
// FINDINGS (diag-copyrun.mjs): the poison spec step4 block 5 has fired in past
// sessions too — repo MAIN already ships 3 adjacent identical 84-line copies of
// the inline importer block; the feature branch accumulated 5. Correct end-state
// everywhere is 1 copy.
//
// STRATEGY: a "peeler" spec that removes ONE copy per CI run:
//   OLD = [m tail lines of a copy][one full copy][previewImport line]
//   NEW = [m tail lines][previewImport line]
// While >=2 copies exist, OLD matches exactly once (only the LAST copy is
// followed by previewImport, and the text before it is the previous copy's
// tail). At exactly 1 copy, the text before the survivor is the unique
// IMP_FLAB/BADBOX section — not a copy tail — so OLD cannot match and the
// skip rule (NEW present, OLD absent) makes every further run a no-op.
// The branch needs 4 peels (5→1); the planned commit sequence provides 7 runs.
//
// This script:
//   1. builds the deduped local target (1 copy) and writes it to src/worker.js
//   2. generates apply/z-cleanup-dedupe.json (the peeler) + neutralized step4
//   3. proves: uniqueness at every copy-count state 5..2, absence at state 1,
//      byte-identical convergence, and no-op tail — by full simulation.
//
// Usage: node scripts/make-cleanup-spec-v4.mjs   (then: npm test)

import { readFileSync, writeFileSync } from "node:fs";

const branch = readFileSync("/tmp/worker.branch2.js", "utf-8"); // 5 copies
const local = readFileSync("src/worker.js", "utf-8");            // 3 copies + reports
const count = (hay, needle) => hay.split(needle).length - 1;
const b64 = s => Buffer.from(s, "utf-8").toString("base64");

function copyRun(src) {
  const L = src.split("\n");
  const pv = L.findIndex(l => l === "async function previewImport(){");
  const first = L.slice(pv - 84, pv).join("\n");
  let k = 0;
  while (L.slice(pv - 84 * (k + 1), pv - 84 * k).join("\n") === first && k <= 12) k++;
  return { L, pv, k, copy: first, start: pv - 84 * k };
}

// ---- 1. deduped local target: keep exactly ONE copy --------------------------
const lt = copyRun(local);
if (lt.k !== 3) { console.error("expected 3 copies locally, got " + lt.k); process.exit(1); }
const target = lt.L.slice(0, lt.start).concat(lt.L.slice(lt.start + 84 * 2)).join("\n");
const tt = copyRun(target);
if (tt.k !== 1) { console.error("dedup failed"); process.exit(1); }
writeFileSync("src/worker.js", target);
console.log("local target deduped: 3 -> 1 copy; run npm test next");

// ---- 2. the peeler spec -------------------------------------------------------
const bt = copyRun(branch);
if (bt.k !== 5) { console.error("expected 5 copies on branch, got " + bt.k); process.exit(1); }
let spec = null;
for (let m = 1; m < 30 && !spec; m++) {
  for (let ka = 1; ka < 4 && !spec; ka++) {
    const tail = bt.L.slice(bt.pv - 84 - m, bt.pv - 84).join("\n"); // tail of copy k-1
    const after = bt.L.slice(bt.pv, bt.pv + ka).join("\n");
    const o = tail + "\n" + bt.copy + "\n" + after;
    const n = tail + "\n" + after;
    // prove across every state 5..1 by actually peeling
    let ok = true, st = branch;
    for (let copies = 5; copies >= 2; copies--) {
      if (count(st, o) !== 1) { ok = false; break; }
      st = st.replace(o, () => n);
    }
    if (!ok) continue;
    if (count(st, o) !== 0) continue;          // state 1: OLD must be gone
    if (count(target, o) !== 0) continue;      // final target: never matches
    if (count(target, n) !== 1) continue;      // skip rule anchor present once
    if (st !== target) continue;               // byte-identical convergence
    spec = { o, n, m, ka };
  }
}
if (!spec) { console.error("no safe peeler anchor found"); process.exit(1); }
console.log("peeler anchors: tail " + spec.m + " lines, after " + spec.ka +
  " lines; OLD " + spec.o.length + " chars");

const zSpec = { target: "src/worker.js", blocks: [{ o: b64(spec.o), n: b64(spec.n),
  why: "peeler: removes ONE duplicated importer copy per CI run. The poison spec " +
       "step4 block 5 (NEW contained its own OLD anchor) fired repeatedly across " +
       "sessions - main ships 3 adjacent identical copies, this branch reached 5. " +
       "OLD only matches when >=2 adjacent copies exist (last copy preceded by a " +
       "copy tail, followed by previewImport); at 1 copy it cannot match and the " +
       "skip rule makes every run a no-op. 4 runs converge this branch to 1 copy." }] };
writeFileSync("apply/z-cleanup-dedupe.json", JSON.stringify(zSpec, null, 1));

const emptyStep4 = { target: "src/worker.js", blocks: [],
  note: "NEUTRALIZED 2026-07-17: block 5 was a poison spec - its NEW contained its " +
        "own OLD anchor ('async function previewImport(){'), so it re-applied and " +
        "duplicated 84 lines on EVERY apply-spec run (main accumulated 3 copies, " +
        "this branch 5). Emptied in the same commit that ships the z-cleanup " +
        "peeler. File deleted in the stale-spec prune commits that follow." };
writeFileSync("apply/step4-branded-datatab.json", JSON.stringify(emptyStep4, null, 1));
console.log("z spec bytes:", JSON.stringify(zSpec).length);

// ---- 3. full simulation of the commit sequence --------------------------------
function run(src, specs) {
  for (const f of [...specs].sort()) {
    const d = JSON.parse(readFileSync(f, "utf-8"));
    for (const b of d.blocks) {
      const oo = Buffer.from(b.o, "base64").toString("utf-8");
      const nn = Buffer.from(b.n, "base64").toString("utf-8");
      if (src.includes(nn) && !src.includes(oo)) continue;
      const c = count(src, oo);
      if (c === 0) continue;
      if (c > 1) { console.error(f + " non-unique OLD (" + c + ")"); process.exit(2); }
      src = src.replace(oo, () => nn);
    }
  }
  return src;
}
const steps = ["apply/step2-embed-mode.json", "apply/step2-retire-old-importer.json",
  "apply/step3-full-branded-page.json", "apply/step5-branded-shell.json",
  "apply/step6-upload-view.json"];
let specsNow = ["apply/reports-tab-v1.json", "apply/step4-branded-datatab.json",
  "apply/z-cleanup-dedupe.json"].concat(steps);
let src = run(branch, specsNow);                                  // run 1 (the commit)
let copies = copyRun(src).k; console.log("run1 copies:", copies);
// runs 2..7: each stale-spec deletion triggers one more run
for (let i = 0; i < 6; i++) {
  specsNow = specsNow.filter((f, idx) => f !== (["apply/step4-branded-datatab.json"].concat(steps))[i]);
  src = run(src, specsNow);
  console.log("run" + (i + 2) + " copies:", copyRun(src).k);
}
console.log("final == deduped target:", src === target);
let prev = src; src = run(src, specsNow);
console.log("extra run is no-op:", src === prev);
