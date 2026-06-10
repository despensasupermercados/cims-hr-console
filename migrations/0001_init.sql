-- ============================================================
-- DG3 CIMS HR OPERATIONAL CONSOLE — D1 (SQLite) SCHEMA v1
-- Phase 1 foundation. Locked-irreversible structure (SRS §4.2).
-- Store facts; derive count/rank/age/compliance/Days-Worked in code.
-- Dates: plain ISO 'YYYY-MM-DD' TEXT. Money: REAL. IDs: TEXT UUID.
-- ============================================================
PRAGMA foreign_keys = ON;

-- ---------- reference: agency (multi-agency ready) ----------
CREATE TABLE IF NOT EXISTS agency (
  id          TEXT PRIMARY KEY,            -- uuid
  code        TEXT NOT NULL UNIQUE,        -- e.g. 'TDG'
  name        TEXT NOT NULL
) STRICT;

-- ---------- reference: vessel ----------
CREATE TABLE IF NOT EXISTS vessel (
  id          TEXT PRIMARY KEY,            -- uuid
  name        TEXT NOT NULL UNIQUE,        -- e.g. 'MV WONDER OF THE SEAS'
  brand       TEXT NOT NULL CHECK (brand IN ('Royal Caribbean','Celebrity','Azamara','NCL'))
) STRICT;

-- ---------- crew (registry; identity + docs + status) ----------
-- agency_id (CREW ID, e.g. SC-0038865) is the unique BUSINESS key, not the PK.
-- baseline_count is NULL until seeded from the golden Contract Counter tab.
-- rank/age are DERIVED in code, not stored. rank_observed kept only for cross-check.
CREATE TABLE IF NOT EXISTS crew (
  id              TEXT PRIMARY KEY,        -- uuid surrogate
  agency_id       TEXT NOT NULL UNIQUE,    -- CREW ID business key
  agency_code     TEXT NOT NULL DEFAULT 'TDG' REFERENCES agency(code),
  first_name      TEXT,
  middle_name     TEXT,
  last_name       TEXT,
  status          TEXT NOT NULL CHECK (status IN ('On board','On Vacation','Earmarked','Inactive')),
  rank_observed   TEXT,                    -- from agency file (cross-check only, NOT authoritative)
  rank_override   TEXT,                    -- nullable, for lateral hires
  vessel_observed TEXT,                    -- from agency file; authoritative vessel is via assignment
  dob             TEXT,                    -- ISO date
  province        TEXT,
  phone           TEXT,                    -- kept as text (mixed formats)
  email           TEXT,
  -- medical
  med_cert_no     TEXT,                    -- dirty free-text; store raw
  med_issue       TEXT,
  med_exp         TEXT,
  med_place       TEXT,
  -- seaman's book (SIRB)
  sirb_no         TEXT,
  sirb_issue      TEXT,
  sirb_exp        TEXT,
  sirb_place      TEXT,
  -- passport
  pp_no           TEXT,
  pp_issue        TEXT,
  pp_exp          TEXT,
  pp_place        TEXT,
  -- schengen (nullable; blank = not held)
  sch_no          TEXT,
  sch_issue       TEXT,
  sch_exp         TEXT,
  sch_place       TEXT,
  -- US C1/D visa
  usv_no          TEXT,
  usv_issue       TEXT,
  usv_exp         TEXT,
  usv_place       TEXT,
  baseline_count  INTEGER,                 -- NULL until Contract Counter seeded
  redacted        INTEGER NOT NULL DEFAULT 0,  -- redact_crew() seam
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crew_status ON crew(status);
CREATE INDEX IF NOT EXISTS idx_crew_agency ON crew(agency_id);

-- ---------- contract (the BONUS unit; groups assignment legs) ----------
-- contract_group_id = '<agency_id>-C<n>' identity (only increments).
-- 'count' is NOT stored here — it is derived from bonus_outcome.
CREATE TABLE IF NOT EXISTS contract (
  id                TEXT PRIMARY KEY,      -- uuid
  crew_id           TEXT NOT NULL REFERENCES crew(id),
  contract_group_id TEXT NOT NULL,         -- e.g. SC-0038865-C3
  status            TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Closed')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_contract_crew ON contract(crew_id);
CREATE INDEX IF NOT EXISTS idx_contract_group ON contract(contract_group_id);

-- ---------- assignment (one ship LEG = billing unit) ----------
-- Up to 3 ships per contract; 7-14 day handover overlap; never unmanned.
-- planned vs actual sign-off; end_reason drives 'completed?'.
CREATE TABLE IF NOT EXISTS assignment (
  id                TEXT PRIMARY KEY,      -- uuid
  contract_id       TEXT NOT NULL REFERENCES contract(id),
  vessel_id         TEXT REFERENCES vessel(id),
  vessel_name       TEXT NOT NULL,         -- denormalized for resilience
  is_transfer       INTEGER NOT NULL DEFAULT 0,  -- 1 = TRF leg (not the first leg)
  sign_on           TEXT NOT NULL,         -- ISO date
  planned_sign_off  TEXT,
  actual_sign_off   TEXT,                  -- NULL until signed off
  dep               TEXT,                  -- travel depart
  arr               TEXT,                  -- travel arrive
  end_reason        TEXT CHECK (end_reason IN
                      ('completed','medical','compassionate','emergency','performance','early_relief')),
  reason_code_src   TEXT,                  -- raw agency code (VAC/TRF/NEW/REH/ADJ) for trace
  readiness         TEXT,                  -- JSON blob: ECCR/AIR/HOTEL/OFF DATE/NEXT SHIP flags
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_assignment_contract ON assignment(contract_id);
CREATE INDEX IF NOT EXISTS idx_assignment_vessel ON assignment(vessel_id);

-- ---------- bonus_policy (versioned weights/ladder/floor/gates) ----------
-- Each outcome stamps the policy version it was scored under (immutable history).
CREATE TABLE IF NOT EXISTS bonus_policy (
  id            TEXT PRIMARY KEY,          -- uuid
  version       INTEGER NOT NULL UNIQUE,   -- 1, 2, ...
  effective_at  TEXT NOT NULL,
  ladder_json   TEXT NOT NULL,             -- [0,0,250,500,750,1000,1250,1500,1750,2000]
  floor_pct     INTEGER NOT NULL DEFAULT 80,
  weights_json  TEXT NOT NULL,             -- {sOrder:20,sAcc:25,sPar:15,sEval:15,sHand:10,sComm:10,sMono:5}
  eval_rule     TEXT NOT NULL DEFAULT 'e>=3?15:0',
  gates_json    TEXT NOT NULL,             -- gate precedence + effects
  agg_policy    TEXT NOT NULL DEFAULT 'worst_leg' CHECK (agg_policy IN ('worst_leg','average')),
  notes         TEXT
) STRICT;

-- ---------- bonus_outcome (APPEND-ONLY, immutable, correctable) ----------
-- 'count' is derived by replaying these per crew in contract order.
-- Corrections are NEW rows referencing the corrected outcome (never UPDATE/DELETE).
CREATE TABLE IF NOT EXISTS bonus_outcome (
  id                TEXT PRIMARY KEY,      -- uuid
  contract_id       TEXT NOT NULL REFERENCES contract(id),
  contract_group_id TEXT NOT NULL,
  crew_id           TEXT NOT NULL REFERENCES crew(id),
  policy_version    INTEGER NOT NULL REFERENCES bonus_policy(version),
  scorecard_json    TEXT NOT NULL,         -- per-factor awarded values
  score_pct         REAL NOT NULL,
  gate              TEXT,                  -- null | not_completed | rush | audit | eval_below_3
  gate_note         TEXT,                  -- required for reset gates
  count_before      INTEGER NOT NULL,
  count_after       INTEGER NOT NULL,
  pay_usd           REAL NOT NULL DEFAULT 0,
  span_start        TEXT NOT NULL,
  span_end          TEXT NOT NULL,
  ships_json        TEXT NOT NULL,         -- ordered ship names
  no_contributor_input TEXT,              -- JSON list of missing roles (audit/grievance)
  corrects_id       TEXT REFERENCES bonus_outcome(id),  -- non-null = correction row
  committed_by      TEXT NOT NULL,         -- user id
  committed_at      TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_outcome_crew ON bonus_outcome(crew_id);
CREATE INDEX IF NOT EXISTS idx_outcome_group ON bonus_outcome(contract_group_id);

-- ---------- feedback_request (Rita fires scoped windows; <=10/mo) ----------
-- token = single-use signed link payload (contributor auth). status models silence.
CREATE TABLE IF NOT EXISTS feedback_request (
  id                TEXT PRIMARY KEY,      -- uuid
  contract_id       TEXT NOT NULL REFERENCES contract(id),
  contract_group_id TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('ray','rolando','dexter')),
  token_hash        TEXT NOT NULL,         -- hash of single-use signed link
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered','na','overdue')),
  due_date          TEXT,
  requested_by      TEXT NOT NULL,
  requested_at      TEXT NOT NULL,
  UNIQUE (contract_id, role)
) STRICT;

-- ---------- feedback_response (one canonical schema; keyed by request) ----------
CREATE TABLE IF NOT EXISTS feedback_response (
  id            TEXT PRIMARY KEY,          -- uuid
  request_id    TEXT NOT NULL REFERENCES feedback_request(id),
  contract_id   TEXT NOT NULL REFERENCES contract(id),
  role          TEXT NOT NULL CHECK (role IN ('ray','rolando','dexter')),
  answers_json  TEXT NOT NULL,             -- canonical answer keys per role (SRS §6.2)
  submitted_at  TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_fbresp_contract ON feedback_response(contract_id);

-- ---------- candidate (readiness pipeline; agency-readiness = deployable) ----------
CREATE TABLE IF NOT EXISTS candidate (
  id              TEXT PRIMARY KEY,        -- uuid
  agency_id       TEXT,                    -- if already has a CREW ID
  full_name       TEXT NOT NULL,
  stage           TEXT,                    -- from 25-step SOP
  agency_ready    INTEGER NOT NULL DEFAULT 0,  -- 1 = deployable per agency
  checklist_json  TEXT,                    -- the 33-col readiness checklist
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
) STRICT;

-- ---------- users (two full users; for audit) ----------
CREATE TABLE IF NOT EXISTS users (
  id        TEXT PRIMARY KEY,              -- uuid
  email     TEXT NOT NULL UNIQUE,          -- magic-link allowlist
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT 'full' CHECK (role IN ('full'))
) STRICT;

-- ---------- app_config (editable params; future-only effect) ----------
CREATE TABLE IF NOT EXISTS app_config (
  key       TEXT PRIMARY KEY,
  value     TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- ---------- activity_log (cheap half: login/commit/export/bulk-read) ----------
CREATE TABLE IF NOT EXISTS activity_log (
  id        TEXT PRIMARY KEY,              -- uuid
  user_id   TEXT,
  action    TEXT NOT NULL,                 -- login | commit_outcome | export_days | bulk_read | import
  detail    TEXT,
  at        TEXT NOT NULL
) STRICT;

-- ---------- sync_conflict (import review queue) ----------
CREATE TABLE IF NOT EXISTS sync_conflict (
  id          TEXT PRIMARY KEY,            -- uuid
  import_run_id TEXT,
  agency_id   TEXT NOT NULL,
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  resolved    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
) STRICT;

-- ---------- import_run (idempotency by file hash) ----------
CREATE TABLE IF NOT EXISTS import_run (
  id          TEXT PRIMARY KEY,            -- uuid
  file_hash   TEXT NOT NULL UNIQUE,        -- idempotent: same file = no-op
  filename    TEXT,
  rows_seen   INTEGER,
  rows_upserted INTEGER,
  conflicts   INTEGER,
  run_by      TEXT,
  run_at      TEXT NOT NULL
) STRICT;

-- ---------- outbox (server-side email/notify; PDF statement delivery) ----------
CREATE TABLE IF NOT EXISTS outbox (
  id          TEXT PRIMARY KEY,            -- uuid
  kind        TEXT NOT NULL,               -- feedback_notify | statement_pdf | magic_link
  to_addr     TEXT NOT NULL,
  payload     TEXT,
  r2_key      TEXT,                        -- for statement PDFs in R2
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  created_at  TEXT NOT NULL,
  sent_at     TEXT
) STRICT;

-- ============================================================
-- SEED: agency + bonus_policy v1 (the locked built-SOP)
-- ============================================================
INSERT OR IGNORE INTO agency (id,code,name) VALUES
  ('agency-tdg','TDG','The Digital Group (POEA manning agency)');

INSERT OR IGNORE INTO bonus_policy
  (id,version,effective_at,ladder_json,floor_pct,weights_json,eval_rule,gates_json,agg_policy,notes)
VALUES (
  'policy-v1', 1, '2026-06-05',
  '[0,0,250,500,750,1000,1250,1500,1750,2000]',
  80,
  '{"sOrder":20,"sAcc":25,"sPar":15,"sEval":15,"sHand":10,"sComm":10,"sMono":5}',
  'e>=3?15:0',
  '{"precedence":["not_completed","rush","audit","eval_below_3"],"reset":["not_completed","rush","audit"],"hold":["eval_below_3"],"compassionate_bypass":true}',
  'worst_leg',
  'Built SOP weights (locked). Aggregation worst_leg pending Miguel confirm vs average.'
);

INSERT OR IGNORE INTO app_config (key,value,updated_at) VALUES
  ('streak_gap_weeks','7','2026-06-05'),
  ('seafarer_fee_usd_per_month','2800','2026-06-05'),
  ('feedback_requests_per_month_cap','10','2026-06-05');
