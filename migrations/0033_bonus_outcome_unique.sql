-- ONE OUTCOME PER CONTRACT SPAN, enforced by the database (17 Oct 2026 logic review). Numbered 0033: 0032 is contract_visit. apiBonusCommit's catch has cited
-- "UNIQUE(crew_id,span_start,span_end) (migration 0004, primary outcomes only)" since the double-commit guard was written,
-- but no migration ever created it: production's bonus_outcome carries only non-unique indexes, so two clicks (two tabs,
-- Miguel and Rita at once) that both pass the read-then-write pre-check append two outcomes — double pay, double count.
-- Primary outcomes only: a correction (corrects_id set) restates a span by design. 0 outcomes on 17 Oct 2026, so nothing
-- existing can collide. Applied at runtime too (ensureBonusV2), whatever order the migration and the deploy land in.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bonus_outcome_span ON bonus_outcome(crew_id, span_start, span_end) WHERE corrects_id IS NULL;
