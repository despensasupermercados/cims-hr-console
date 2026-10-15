-- The Score Card's reading of field reports (Miguel, 15 Oct 2026): does a report name an order-accuracy or par problem,
-- with the report's own words as the quote. Keyed by a hash of the report's text. Created at runtime by ensureScoreFlag.
CREATE TABLE IF NOT EXISTS score_intel_flag (h TEXT PRIMARY KEY, accuracy INTEGER NOT NULL, par INTEGER NOT NULL, quote TEXT, engine TEXT, at TEXT NOT NULL);
