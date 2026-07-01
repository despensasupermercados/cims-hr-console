-- 0011_handover.sql
-- Hand-over note (Ship Plan Rung 6). Tracks which contract legs have had a
-- hand-over note sent, and for which sign-off date — so a date change (extension,
-- late reliever, medical delay) re-triggers, and an unchanged date never double-sends.
-- Additive & safe; proven on cims-hr-console-staging. Also self-created by ensureHandover().

CREATE TABLE IF NOT EXISTS handover_notice (
  id            TEXT PRIMARY KEY,
  sc            TEXT NOT NULL,      -- crew agency_id
  seq           INTEGER NOT NULL,   -- contract leg
  sign_off_date TEXT,               -- the projected sign-off this note was sent for
  status        TEXT NOT NULL DEFAULT 'sent',
  sent_at       TEXT,
  UNIQUE (sc, seq)
);

CREATE INDEX IF NOT EXISTS idx_handover_notice_date ON handover_notice(sign_off_date);
