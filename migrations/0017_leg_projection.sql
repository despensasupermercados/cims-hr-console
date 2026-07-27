-- 0017 — forward-leg projection guard (2026-07-27)
--
-- src/leg_projection.js mirrors each FUTURE `assignment` row into ship_leg as an
-- is_current=0 leg tagged source='assignment:<id>'. The hourly cron is the only
-- writer, but Cloudflare can retry a scheduled invocation, so the one-row-per-
-- assignment rule is enforced here at the schema layer rather than trusted to
-- application code.
--
-- The predicate deliberately scopes to is_current = 0: it therefore covers ZERO
-- existing rows (all 48 keyman_roster rows are is_current = 1) and cannot affect
-- the billing-visible set or the existing ux_leg_current index.
CREATE UNIQUE INDEX IF NOT EXISTS ux_leg_source_projected
  ON ship_leg(source)
  WHERE source IS NOT NULL AND is_current = 0;
