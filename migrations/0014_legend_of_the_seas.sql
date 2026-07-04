-- 0014_legend_of_the_seas.sql
-- Legend of the Seas (Royal Caribbean, Icon class) enters service July 2026;
-- the fleet email roster carries her as "MV LEGEND OF THE SEAS" and VESSEL_REF /
-- SHIP_LIST / shipname canonicalization already resolve her to short name "Legend".
-- This guarantees the vessel row exists in D1 (0006 seeded 'ves_legend' on fresh
-- databases, but a database migrated before that row was present would lack it).
-- INSERT OR IGNORE keeps it idempotent: a no-op wherever the row already exists.
-- Row convention matches migrations/0006_seed_vessel.sql exactly (short name,
-- brand from the vessel CHECK vocabulary).

INSERT OR IGNORE INTO vessel (id, name, brand) VALUES
('ves_legend','Legend','Royal Caribbean');
