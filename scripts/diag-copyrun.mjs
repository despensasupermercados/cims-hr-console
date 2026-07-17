// diag-copyrun.mjs — map the run of adjacent identical 84-line importer blocks
// before previewImport, in both the branch file and the local tested file.
import { readFileSync } from "node:fs";

function mapCopies(path) {
  const src = readFileSync(path, "utf-8");
  const L = src.split("\n");
  const pv = L.findIndex(l => l === "async function previewImport(){");
  const first = L.slice(pv - 84, pv).join("\n");          // block immediately before pv
  let k = 0;
  while (true) {
    const cand = L.slice(pv - 84 * (k + 1), pv - 84 * k).join("\n");
    if (cand === first) k++; else break;
    if (k > 12) break;
  }
  const start = pv - 84 * k;
  console.log(path + ":");
  console.log("  previewImport at line " + (pv + 1) + ", adjacent identical copies: " + k +
    ", copy-run starts line " + (start + 1));
  console.log("  3 lines before copy-run: " + JSON.stringify(L.slice(start - 3, start)));
  console.log("  copy first line: " + JSON.stringify(L[start]));
  console.log("  total marker count: " +
    (src.split("Inline branded crew importer").length - 1));
  return { k };
}
mapCopies("/tmp/worker.branch2.js");
mapCopies("src/worker.js");
mapCopies("/tmp/worker.main.js");
