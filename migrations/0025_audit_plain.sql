-- The briefing's field intel in plain words (Miguel, 15 Oct 2026). Keyed by a hash of the stored summary.
CREATE TABLE IF NOT EXISTS audit_plain (h TEXT PRIMARY KEY, text TEXT NOT NULL, engine TEXT, at TEXT NOT NULL);
