// diag-anchor.mjs — diagnose why no double-sided anchor satisfies the safety
// conditions for the z-cleanup spec (see make-cleanup-spec.mjs for context).
import { readFileSync } from "node:fs";
const branch = readFileSync("/tmp/worker.branch.js", "utf-8");
const target = readFileSync("src/worker.js", "utf-8");
const bl = branch.split("\n");
const [i1, i2] = [3215, 3299];
const count = (hay, needle) => hay.split(needle).length - 1;

for (const [kb, ka] of [[1,1],[3,3],[6,6],[12,12],[25,25],[50,50]]) {
  const before = bl.slice(i1 - kb, i1).join("\n");
  const after = bl.slice(i2, i2 + ka).join("\n");
  const o = before + "\n" + bl.slice(i1, i2).join("\n") + "\n" + after;
  const n = before + "\n" + after;
  console.log("kb=ka=" + kb,
    "| o in branch:", count(branch, o),
    "| o in target:", count(target, o),
    "| replace==target:", branch.replace(o, () => n) === target,
    "| n in target:", count(target, n));
}
// also show the lines just before and after the duplicate region
console.log("--- 3 lines before dup:"); console.log(bl.slice(i1-3, i1).join("\n"));
console.log("--- first 2 dup lines:"); console.log(bl.slice(i1, i1+2).join("\n"));
console.log("--- last 2 dup lines:"); console.log(bl.slice(i2-2, i2).join("\n"));
console.log("--- 3 lines after dup:"); console.log(bl.slice(i2, i2+3).join("\n"));
