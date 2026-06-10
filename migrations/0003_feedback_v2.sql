-- Feedback windows tables (promoted from runtime ensureFb() to a versioned migration).
-- Kept idempotent so it is safe alongside the in-code ensureFb() belt-and-suspenders.
CREATE TABLE IF NOT EXISTS feedback_request2 (
  id           TEXT PRIMARY KEY,
  crew_id      TEXT NOT NULL,
  role         TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  due_date     TEXT,
  requested_by TEXT,
  requested_at TEXT NOT NULL,
  UNIQUE (crew_id, role)
);
CREATE TABLE IF NOT EXISTS feedback_response2 (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL,
  crew_id      TEXT NOT NULL,
  role         TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);
