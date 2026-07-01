-- 0010_signoff_ack.sql
-- Crew Sign-off Acknowledgement — the ack_request table (spec §6).
-- Mirrors feedback_request2. One live request per contract leg (UNIQUE sc,seq);
-- re-requesting replaces it. Additive & safe; proven on cims-hr-console-staging.
-- (The worker also self-creates this via ensureAck() in the /fb style, so it is
--  a no-op if it already exists — same belt-and-braces pattern as the other tables.)

CREATE TABLE IF NOT EXISTS ack_request (
  id            TEXT PRIMARY KEY,
  sc            TEXT NOT NULL,        -- crew agency_id
  seq           INTEGER NOT NULL,     -- contract leg
  crew_id       TEXT,                 -- crew.id
  token_hash    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | acknowledged | expired
  -- snapshot captured at request time (stable even if the contract is later edited):
  crew_name     TEXT,
  vessel        TEXT,
  port          TEXT,
  sign_off_date TEXT,
  requested_by  TEXT,
  requested_at  TEXT NOT NULL,
  ack_at        TEXT,
  ack_ip        TEXT,
  ack_ua        TEXT,
  UNIQUE (sc, seq)
);

CREATE INDEX IF NOT EXISTS idx_ack_request_token ON ack_request(token_hash);
CREATE INDEX IF NOT EXISTS idx_ack_request_status ON ack_request(status);
