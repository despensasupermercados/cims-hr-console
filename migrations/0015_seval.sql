-- 0015_seval.sql
-- Supervisor Evaluation (sEval) state — Score Card integration, spec §6 (Phase B).
-- The human-approved MONEY PR that 0013_sbm_review.sql reserved these names for.
-- These tables do NOT change the payout math: src/bonus.js (computeBonus, ladder,
-- weights, FLOOR, gates) is untouched. They only record how the sEval VALUE (1..5)
-- the Score Card feeds to the engine is SOURCED (auto from the shipboard review)
-- and OVERRIDDEN (manual, money user, with a reason). The committed value stays
-- whatever is in the field at commit; bonus_outcome is never rewritten.
--
-- Keyed by (agency_id, contract_signoff): contract_signoff is the sign-off date =
-- the Score Card span end and the sbm_review_request contract_signoff, so a review
-- attaches to its contract deterministically (no name matching). ISO 'YYYY-MM-DD'.
-- Idempotent (CREATE IF NOT EXISTS), safe alongside the in-code ensureSeval().

CREATE TABLE IF NOT EXISTS seval_state (
  agency_id        TEXT NOT NULL,                       -- crew business key SC-...
  crew_id          TEXT,                                -- crew.id uuid bridge when known
  contract_signoff TEXT NOT NULL,                       -- ISO sign-off date (= Score Card span end)
  value            INTEGER CHECK (value BETWEEN 1 AND 5),
  source           TEXT NOT NULL DEFAULT 'none' CHECK (source IN ('auto','manual','none')),
  set_by           TEXT,                                -- 'system' for auto; user email for manual
  set_at           TEXT,                                -- ISO timestamp
  reason           TEXT,                                -- required for manual overrides (>= 10 chars)
  PRIMARY KEY (agency_id, contract_signoff)
);

-- Append-only provenance: every set / auto / override / not-applied transition.
CREATE TABLE IF NOT EXISTS seval_audit (
  id               TEXT PRIMARY KEY,                    -- 'sev_' + uuid
  agency_id        TEXT NOT NULL,
  contract_signoff TEXT NOT NULL,
  actor            TEXT,                                -- 'system' or user email
  old_value        INTEGER,
  new_value        INTEGER,
  old_source       TEXT,
  new_source       TEXT,
  reason           TEXT,
  note             TEXT,                                -- e.g. 'review after manual — not applied', 'post-commit'
  at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seval_audit_key ON seval_audit (agency_id, contract_signoff, at);
