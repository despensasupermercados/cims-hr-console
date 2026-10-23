-- The end-of-contract crew survey (Miguel, 22–23 Oct 2026: one survey for all four cruise lines, the morning after the
-- sign-off, his copy on answering). Mirrors SURVEY_DDL in src/crew_survey.js (ensureSurvey runs the same statements).
-- One row per contract asked (source 'console', keyed agency_id + on_key = the contract's sign-on) or per answer of the
-- Microsoft Forms survey before the console (source 'forms', form_no). Feedback only: the Score Card and the bonus never
-- read this table (CLAUDE.md section 1).
CREATE TABLE IF NOT EXISTS crew_survey (id TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT 'console', agency_id TEXT, crew_name TEXT, ship TEXT, brand TEXT, on_key TEXT, sign_off TEXT, token TEXT UNIQUE, email TEXT, invited_at TEXT, invite_to_json TEXT, invited_by TEXT, reminded_at TEXT, opened_at TEXT, expires_at TEXT, submitted_at TEXT, answers_json TEXT, fix_text TEXT, copy_sent_at TEXT, called_at TEXT, called_by TEXT, call_note TEXT, form_no INTEGER UNIQUE, placed_why TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_crew_survey_contract ON crew_survey (agency_id, on_key) WHERE source = 'console';
CREATE INDEX IF NOT EXISTS idx_crew_survey_submitted ON crew_survey (submitted_at);
