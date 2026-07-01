-- 0008_crew_ship_id.sql
-- The persistent crew identity key (Miguel's #1 priority).
-- Adds ship_crew_id to crew: the cruise-line-side id (Royal 6-digit, or Celebrity/
-- Azamara alphanumeric) so AdvancedQuery (SC-) and Keyman join by KEY, not by name.
-- Additive & safe; proven on cims-hr-console-staging. TEXT on purpose: id formats
-- differ by cruise line, and more companies are coming. Population is a separate
-- reviewed step (0009).

ALTER TABLE crew ADD COLUMN ship_crew_id TEXT;

CREATE INDEX IF NOT EXISTS idx_crew_ship_crew_id ON crew(ship_crew_id);
