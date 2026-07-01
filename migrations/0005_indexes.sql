-- 0005_indexes.sql
-- Indexes on the hot lookup keys, so the schema stays fast as ships and
-- companies grow. Purely additive; CREATE INDEX IF NOT EXISTS is idempotent.
-- Proven clean on cims-hr-console-staging.

CREATE INDEX IF NOT EXISTS idx_crew_intel_agency ON crew_intel(agency_id);
CREATE INDEX IF NOT EXISTS idx_crew_intel_status ON crew_intel(status);
CREATE INDEX IF NOT EXISTS idx_email_inbox_status ON email_inbox(status);
CREATE INDEX IF NOT EXISTS idx_bonus_outcome_crew ON bonus_outcome(crew_id, committed_at);
CREATE INDEX IF NOT EXISTS idx_bonus_outcome_group ON bonus_outcome(contract_group_id);
CREATE INDEX IF NOT EXISTS idx_feedback_resp2_crew ON feedback_response2(crew_id);
CREATE INDEX IF NOT EXISTS idx_feedback_resp2_req ON feedback_response2(request_id);
CREATE INDEX IF NOT EXISTS idx_crew_note_log_agency ON crew_note_log(agency_id);
CREATE INDEX IF NOT EXISTS idx_travel_year ON travel_expense(year);
CREATE INDEX IF NOT EXISTS idx_crew_status ON crew(status);
CREATE INDEX IF NOT EXISTS idx_crew_vessel ON crew(vessel_observed);
CREATE INDEX IF NOT EXISTS idx_contract_crew ON contract(crew_id);
CREATE INDEX IF NOT EXISTS idx_assignment_contract ON assignment(contract_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_at ON activity_log(at);
