// Regenerates EXPENSE_XLSX_B64 in src/hub_assets.js from the approved workbook, so the Crew Hub serves that file byte for
// byte (/hub/expense.xlsx). Usage: node scripts/hub_expense_asset.mjs docs/mockups/<folder>/<file>.xlsx
// The form's MASTER is the file in this repo (23 Nov 2026): a new edition is an edit of the served file, never of an older
// copy. Rita's 26 Oct 2026 file was her edit of v2 and had lost every fix of 19 Oct. Then: the test's path, CLAUDE.md §10k.
import { readFileSync, writeFileSync } from "node:fs";
const src = process.argv[2];
if (!src) { console.error("usage: node scripts/hub_expense_asset.mjs <workbook.xlsx>"); process.exit(1); }
const bytes = readFileSync(src);
if (bytes.subarray(0, 2).toString("latin1") !== "PK") { console.error("not an .xlsx (zip) file: " + src); process.exit(1); }
const target = new URL("../src/hub_assets.js", import.meta.url);
const js = readFileSync(target, "utf8");
const rx = /export const EXPENSE_XLSX_B64 = "[A-Za-z0-9+/=]*";/;
if (!rx.test(js)) { console.error("EXPENSE_XLSX_B64 not found in src/hub_assets.js"); process.exit(1); }
writeFileSync(target, js.replace(rx, 'export const EXPENSE_XLSX_B64 = "' + bytes.toString("base64") + '";'));
console.log("src/hub_assets.js: EXPENSE_XLSX_B64 = " + src + " (" + bytes.length + " bytes)");
