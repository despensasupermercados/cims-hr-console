-- 0013_sbm_review.sql
-- Shipboard Management Review (SBM) -- Phase A schema. NO money tables here:
-- seval_state / seval_audit (spec #6, the Score Card integration) are Phase B
-- and arrive in their own human-approved money PR. These three tables carry
-- the review pipeline only: request (invite/reminder lifecycle, token hash),
-- response (append-only survey answers -> "Manager Feedback" crew cards), and
-- config (per-ship/brand recipient emails + team list, editable in console).
--
-- Crew reference follows the house pattern: agency_id (SC-... business key,
-- like crew_intel / handover_notice) plus the crew.id uuid bridge when known
-- (like feedback_request2). Dates are ISO 'YYYY-MM-DD' TEXT, as everywhere.
-- Idempotent (CREATE IF NOT EXISTS) so it is safe alongside the in-code
-- ensureSbm() belt-and-suspenders, same as 0003_feedback_v2.

CREATE TABLE IF NOT EXISTS sbm_review_request (
  id               TEXT PRIMARY KEY,            -- 'sbmr_' + uuid
  crew_id          TEXT,                        -- crew.id uuid (nullable until bridge resolves)
  agency_id        TEXT NOT NULL,               -- crew agency_id business key (SC-...)
  contract_signon  TEXT,                        -- ISO date, leg sign-on
  contract_signoff TEXT NOT NULL,               -- ISO date the review is keyed to (T-7 / T-4)
  ship             TEXT,
  brand            TEXT,                        -- 'Royal Caribbean' | 'Celebrity' | 'Azamara'
  recipient_email  TEXT NOT NULL,               -- shipboard manager (from sbm_config)
  token_hash       TEXT NOT NULL UNIQUE,        -- sha256 of the single-use signed token
  sent_at          TEXT,                        -- invite sent
  reminder_at      TEXT,                        -- reminder sent (once, ever)
  status           TEXT NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent','reminded','submitted','expired','suppressed')),
  created_at       TEXT NOT NULL,
  UNIQUE (agency_id, contract_signoff)          -- one review per crew per sign-off (sweep idempotence)
);
CREATE INDEX IF NOT EXISTS idx_sbm_request_status ON sbm_review_request(status);
CREATE INDEX IF NOT EXISTS idx_sbm_request_crew   ON sbm_review_request(agency_id);

-- APPEND-ONLY: rows are inserted on submission and never updated or deleted.
-- The permanent "Manager Feedback" record that follows the crew member.
CREATE TABLE IF NOT EXISTS sbm_review_response (
  id           TEXT PRIMARY KEY,                -- 'sbmp_' + uuid
  request_id   TEXT NOT NULL REFERENCES sbm_review_request(id),
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),  -- the only required answer
  q_business   TEXT,                            -- understands the business / smart decisions
  q_guests     TEXT,                            -- guests & coworkers come first
  q_grow       TEXT,                            -- helps the team / improves how things are done
  q_integrity  TEXT,                            -- honest, fair, trustworthy
  q_teams      TEXT,                            -- works well with other teams
  q_energy     TEXT,                            -- energy & love for the job
  q_final      TEXT,                            -- final thoughts
  submitted_at TEXT NOT NULL,
  ip           TEXT,
  ua           TEXT
);
CREATE INDEX IF NOT EXISTS idx_sbm_response_request ON sbm_review_response(request_id);

-- Console-editable configuration. Keys used by the pipeline:
--   recipient:<ship>   shipboard-manager email for a ship  (checked first)
--   recipient:<brand>  brand-level fallback recipient
--   team_list          comma-separated cc list for the internal notification
--   shipmail:<ship>    specialist's working-ship mailbox (crew-facing copy)
-- No rows are seeded here: the per-ship list is still pending from Miguel
-- (spec #11.1). With no recipient configured the sweep skips and logs -- it
-- never errors and never guesses an address.
CREATE TABLE IF NOT EXISTS sbm_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);
