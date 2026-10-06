-- 0019_crew_gender.sql (2026-10-06)
-- Gender as TDG's file states it (M / F). Read by the AdvancedQuery import from a GENDER or SEX column when the
-- file carries one; never inferred from a name. ensureCrewExtras and ensureRegistrySnapshot in src/worker.js
-- add the same column at runtime (idempotent); this file is the migration-of-record.
ALTER TABLE crew ADD COLUMN gender TEXT;
