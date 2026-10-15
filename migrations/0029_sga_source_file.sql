-- The original workbooks the console loaded, one row per file by SHA-256 (15 Oct 2026, Miguel: "keep this somewhere in a
-- bucket .. I dont wanna lose this"). The bytes live in the EXPORTS R2 bucket under r2_key; a NULL r2_key is a file that
-- was loaded but whose bytes never reached the Worker. The same statement runs in ensureSga (one wave).
CREATE TABLE IF NOT EXISTS sga_source_file (
  hash TEXT PRIMARY KEY,
  name TEXT, kind TEXT, year INTEGER, month INTEGER, bytes INTEGER,
  r2_key TEXT, bucket TEXT, source TEXT, by TEXT, at TEXT, file_key TEXT, note TEXT
);
