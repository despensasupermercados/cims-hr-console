-- The crew survey's answer time (Miguel, 23 Oct 2026, "4. ok"): seconds from Start to Send, as the page measured them.
-- Every statement the same number in under QUICK_SECS (60) is a quick tap-through: listed, never averaged. Mirrors
-- SURVEY_ALTERS in src/crew_survey.js (ensureSurvey runs it through addColumn, which tolerates the column existing).
ALTER TABLE crew_survey ADD COLUMN answer_secs INTEGER;
