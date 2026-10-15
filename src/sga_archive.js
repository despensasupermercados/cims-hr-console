// THE ARCHIVE OF THE ORIGINAL WORKBOOKS — Miguel, 15 Oct 2026: "keep this [the files] somewhere in a bucket in the database
// or u will figure out where .. I dont wanna lose this .. so is accessible to the brain when need it."
//
// Every workbook the console loads (TDG's bill, Rita's travel workbook) is kept as it arrived: the bytes in the EXPORTS R2
// bucket (cims-hr-exports, the same bucket as the Keyman backups, under its own prefix) and one row on `sga_source_file`
// keyed by the file's SHA-256 — the same identity the mail intake and the inbox use (file_key mail:<sha16>@<sha16>), so a
// bill on file, its inbox rows and its original are one thing. The Worker is the only writer: the mail intake archives the
// attachment it took, and the Upload page sends the raw file to POST /api/sga/archive after a successful Apply. A row with
// no `r2_key` is a file the console loaded but whose bytes never reached it (this session's uploads of 15 Oct 2026 were
// parsed outside the Worker; the connector cannot carry a 2 MB binary) — the Travel tab says so, never pretends.
//
// Pure helpers here (pinned by test/sga_archive.test.js); R2 and D1 are the Worker's.

export const ARCHIVE_PREFIX = "sga-archive/";
export const SOURCE_COLS = ["hash", "name", "kind", "year", "month", "bytes", "r2_key", "bucket", "source", "by", "at", "file_key", "note"];

// "REVISED DG3 SGA EXCEL JULY2026.xlsx" → "REVISED_DG3_SGA_EXCEL_JULY2026.xlsx" (letters, digits, dot, dash, underscore)
export function safeName(name) {
  const s = String(name || "workbook.xlsx").trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.{2,}/g, ".").replace(/^[._-]+|[._-]+$/g, "");
  return s.slice(0, 120) || "workbook.xlsx";
}
// sga-archive/sga/2026/07/c0a920a5aadd54b6-REVISED_DG3_SGA_EXCEL_JULY2026.xlsx ; travel: sga-archive/travel/2026/<sha16>-<name>
export function archiveKey({ kind, year, month, hash, name }) {
  const y = year ? String(year) : "undated";
  const m = kind === "sga" && month ? String(month).padStart(2, "0") + "/" : "";
  return ARCHIVE_PREFIX + (kind || "file") + "/" + y + "/" + m + String(hash || "").slice(0, 16) + "-" + safeName(name);
}
// The row the Worker writes (INSERT OR REPLACE: the same bytes again refresh `at` / `by`, never duplicate).
export function sourceRecord({ hash, name, kind, year, month, bytes, r2_key, bucket, source, by, at, file_key, note }) {
  return { hash: String(hash), name: name || null, kind: kind || null, year: year ?? null, month: month ?? null, bytes: bytes ?? null,
    r2_key: r2_key || null, bucket: bucket || null, source: source || null, by: by || null, at: at || new Date().toISOString(), file_key: file_key || null, note: note || null };
}
// What the page prints beside a bill: kept (with its key) / loaded but bytes never reached the console / nothing on record.
export function sourceStanding(row) {
  if (!row) return { state: "none", text: "No original on record" };
  if (row.r2_key) return { state: "kept", text: "Original kept", key: row.r2_key };
  return { state: "missing", text: row.note || "Loaded; the original file never reached the console" };
}
