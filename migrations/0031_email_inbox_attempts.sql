-- 16 Oct 2026 bug hunt: how many times the intel engine was asked about an email and answered nothing. After
-- INTEL_MAX_ATTEMPTS (worker.js processIntelEmail) the email goes to the human review queue instead of being released
-- for the next sweep for ever. The same ALTER runs in ensureIntelImpl (duplicate column tolerated).
ALTER TABLE email_inbox ADD COLUMN attempts INTEGER DEFAULT 0;
