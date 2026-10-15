// THE ARCHIVE OF THE ORIGINAL WORKBOOKS (src/sga_archive.js; Miguel, 15 Oct 2026: "keep this somewhere in a bucket in the
// database or u will figure out where .. I dont wanna lose this"). The pure helpers, and the static guards that the Worker
// keeps every original: the mail intake archives what it took, the Upload page sends the raw file after Apply, the table
// exists in ensureSga's wave, and the Travel tab says kept / not kept beside every bill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { archiveKey, safeName, sourceRecord, sourceStanding, SOURCE_COLS, ARCHIVE_PREFIX } from "../src/sga_archive.js";

const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");

test("safeName keeps letters, digits, dot, dash and underscore; never empty", () => {
  assert.equal(safeName("REVISED DG3 SGA EXCEL JULY2026.xlsx"), "REVISED_DG3_SGA_EXCEL_JULY2026.xlsx");
  assert.equal(safeName("UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx"), "UPDATED_-_Travel_Expenses_2026_RCCL_AZAMARA_CELEBRITY.xlsx");
  assert.equal(safeName("  ../..\\evil name?.xlsx "), "evil_name_.xlsx");
  assert.equal(safeName(""), "workbook.xlsx"); assert.equal(safeName(null), "workbook.xlsx");
  assert.ok(safeName("x".repeat(500)).length <= 120);
});

test("archiveKey: a bill under its year and month, a travel workbook under its year, both by the hash's first 16 characters", () => {
  const h = "c0a920a5aadd54b684b5ddbd0123456789abcdef0123456789abcdef01234567";
  assert.equal(archiveKey({ kind: "sga", year: 2026, month: 7, hash: h, name: "REVISED DG3 SGA EXCEL JULY2026.xlsx" }), ARCHIVE_PREFIX + "sga/2026/07/c0a920a5aadd54b6-REVISED_DG3_SGA_EXCEL_JULY2026.xlsx");
  assert.equal(archiveKey({ kind: "travel", year: 2026, month: null, hash: h, name: "UPDATED - Travel Expenses 2026.xlsx" }), ARCHIVE_PREFIX + "travel/2026/c0a920a5aadd54b6-UPDATED_-_Travel_Expenses_2026.xlsx");
  assert.equal(archiveKey({ kind: "sga", year: null, month: null, hash: h, name: "x.xlsx" }), ARCHIVE_PREFIX + "sga/undated/c0a920a5aadd54b6-x.xlsx");
  assert.equal(ARCHIVE_PREFIX, "sga-archive/", "its own prefix in the EXPORTS bucket — never mixed with the Keyman backups under keyman/");
});

test("sourceRecord fills every column; sourceStanding reads kept / missing / none", () => {
  const r = sourceRecord({ hash: "abc", name: "n.xlsx", kind: "sga", year: 2026, month: 1, bytes: 10, r2_key: "k", bucket: "b", source: "email", by: "email:x@dg3.com", at: "2026-10-15T00:00:00Z", file_key: "mail:abc@abc" });
  assert.deepEqual(Object.keys(r).sort(), [...SOURCE_COLS].sort());
  assert.equal(r.note, null);
  assert.deepEqual(sourceStanding(r), { state: "kept", text: "Original kept", key: "k" });
  assert.equal(sourceStanding({ ...r, r2_key: null, note: "Bytes not kept: no EXPORTS bucket bound" }).state, "missing");
  assert.equal(sourceStanding({ ...r, r2_key: null, note: null }).text, "Loaded; the original file never reached the console");
  assert.equal(sourceStanding(null).state, "none");
  const s = sourceRecord({ hash: "h" }); assert.ok(s.at && !Number.isNaN(Date.parse(s.at)), "at defaults to now");
});

test("the Worker keeps every original: the table in ensureSga's wave, the intake archives, the page posts the raw file, the routes exist", () => {
  assert.match(W, /CREATE TABLE IF NOT EXISTS sga_source_file \(hash TEXT PRIMARY KEY/, "one wave with the other SGA tables");
  assert.match(W, /async function archiveSourceFile\(env, bytes, meta\)/);
  assert.match(W, /env\.EXPORTS\.put\(key, bytes, \{ httpMetadata/, "the bytes go to the EXPORTS bucket");
  assert.match(W, /archiveSourceFile\(env, f\.bytes, \{ hash: f\.hash[\s\S]*source: "email"/, "the mail intake archives what it took");
  assert.match(W, /done\.has\(f\.inbox\[0\]\.file_key\)\) \{ f\.status = "already_loaded"; continue; \}/, "a file already loaded is never queued again");
  assert.match(W, /if \(p === "\/api\/sga\/archive" && request\.method === "POST"\) return apiSgaArchive\(request, env, session\);/);
  assert.match(W, /if \(p === "\/api\/sga\/file"\)\s+return apiSgaFile\(request, env\);/);
  assert.match(W, /fetch\('\/api\/sga\/archive',\{method:'POST'[^}]*'X-File-Name'/, "the Upload page sends the raw workbook after Apply");
  assert.match(W, /if\(r\.ok\)keepSgaOriginal\(\);/);
  assert.match(W, /sources: srcRes\.results/, "/api/sga serves the archive rows");
  assert.match(W, /function sgaOriginalCell\(f\)/, "the Bills on file table says kept / not kept / no record");
  // the receipt never carries the bytes
  assert.match(W, /const receipt = r\.files\.map\(\(\{ inbox, bytes, \.\.\.f \}\) => f\);/);
});
