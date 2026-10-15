-- 15 Oct 2026: TDG's OTHER / PORT AGENT EXPENSE column on SUMMARY MANNING (ensureSga runs the same ALTER, ignoring "duplicate column").
ALTER TABLE sga_line ADD COLUMN other REAL DEFAULT 0;
