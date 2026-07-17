// diag-anchor-v3.mjs — diagnose why the dup=2 small-anchor search fails.
// Finding: the \"clean\" file itself contained 3 adjacent identical copies
// (the poison spec had fired in past sessions), so every candidate OLD also
// matched the clean file — see diag-copyrun.mjs for the copy-run mapping.
import { readFileSync } from "node:fs";
const branch = readFileSync("/tmp/worker.branch2.js", "utf-8");
const target = readFileSync("src/worker.js", "utf-8");
const bl = branch.split("\n");
const count = (hay, needle) => hay.split(needle).length - 1;

const pvIdx = bl.findIndex(l => l === "async function previewImport(){");
console.log("pvIdx:", pvIdx, "| total lines:", bl.length);
const dupStart = pvIdx - 168;
console.log("--- lines around dupStart-2 .. dupStart+2:");
console.log(bl.slice(dupStart - 2, dupStart + 2).join("\n"));
console.log("--- is 168-line window two identical 84-line blocks?");
const A = bl.slice(dupStart, dupStart + 84).join("\n");
const B = bl.slice(dupStart + 84, pvIdx).join("\n");
console.log("A === B:", A === B);
for (const [m, ka] of [[1,1],[3,1],[6,1],[12,1],[3,3],[20,2]]) {
  const tail = bl.slice(dupStart - m, dupStart).join("\n");
  const dups = bl.slice(dupStart, pvIdx).join("\n");
  const after = bl.slice(pvIdx, pvIdx + ka).join("\n");
  const o = tail + "\n" + dups + "\n" + after;
  const n = tail + "\n" + after;
  console.log("m=" + m + " ka=" + ka,
    "| o in branch:", count(branch, o),
    "| o in target:", count(target, o),
    "| repl==target:", branch.replace(o, () => n) === target,
    "| n in target:", count(target, n));
}
