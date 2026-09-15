-- 0018_agency_manual.sql (2026-09-15)
-- The manual-entry agency. crew.agency_code REFERENCES agency(code); 0001_init seeded only TDG, so every
-- "+ Add crew" (which writes agency_code 'MAN') failed its foreign key — no manual add ever succeeded in
-- prod. ensureCrewExtras in src/worker.js seeds the same row at runtime (idempotent); this file is the
-- migration-of-record. INSERT OR IGNORE keeps both paths safe to run in any order.
INSERT OR IGNORE INTO agency (id,code,name) VALUES ('agency-man','MAN','Manual entry (CIMS console)');
