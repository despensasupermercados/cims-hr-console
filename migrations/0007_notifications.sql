-- 0007_notifications.sql
-- The unified email / notifications system (see NOTIFICATIONS_STRATEGY.md).
-- Additive only: three new tables. The existing `outbox` table stays the single
-- send queue. Nothing existing is changed. Proven on cims-hr-console-staging.
--
-- Flow:  EVENT -> notification_rule -> notification_template -> outbox -> sender -> notification_log

-- Email templates as DATA (edit wording without a code deploy), same discipline
-- as the versioned bonus_policy table.
CREATE TABLE IF NOT EXISTS notification_template (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,          -- handover_note, movements_weekly, magic_link, ...
  channel     TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,                 -- HTML, with {{placeholders}} filled from the spine
  active      INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  updated_at  TEXT NOT NULL
) STRICT;

-- Maps an event to a template + a recipient rule. One row per "this fires that".
CREATE TABLE IF NOT EXISTS notification_rule (
  id            TEXT PRIMARY KEY,
  event_key     TEXT NOT NULL,               -- crew_sign_off, weekly_monday_0700, doc_expiring_60d, ...
  template_key  TEXT NOT NULL REFERENCES notification_template(key),
  recipient_rule TEXT NOT NULL,              -- e.g. 'reliever,technical_team,rita' — resolved from spine
  active        INTEGER NOT NULL DEFAULT 1,
  description   TEXT,
  updated_at    TEXT NOT NULL
) STRICT;

-- Audit: every notification that fired, what it was, to whom, and whether the
-- outbox row it produced was delivered. One place to answer "did it send?".
CREATE TABLE IF NOT EXISTS notification_log (
  id           TEXT PRIMARY KEY,
  event_key    TEXT NOT NULL,
  template_key TEXT NOT NULL,
  to_addr      TEXT NOT NULL,
  context_json TEXT,                         -- the data snapshot used to render (audit)
  outbox_id    TEXT REFERENCES outbox(id),
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  created_at   TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_notif_log_event ON notification_log(event_key, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_rule_event ON notification_rule(event_key);

-- Seed the catalogue of emails that already exist, so they become managed
-- templates rather than hardcoded strings. Bodies are placeholders to be filled
-- from the current code when each sender is migrated onto the pipeline.
INSERT OR IGNORE INTO notification_template (id, key, channel, subject, body, active, description, updated_at) VALUES
  ('tpl_magic_link','magic_link','email','Your CIMS sign-in link','{{magic_link_body}}',1,'Passwordless sign-in link', '2026-06-30'),
  ('tpl_statement','crew_statement','email','Your CIMS crew statement','{{statement_body}}',1,'Crew statement PDF delivery', '2026-06-30'),
  ('tpl_movements','movements_weekly','email','CIMS — Seafarer movements this week','{{movements_body}}',1,'Weekly Monday 07:00 movements digest', '2026-06-30'),
  ('tpl_feedback','feedback_request','email','CIMS — feedback requested','{{feedback_body}}',1,'Contributor feedback link', '2026-06-30'),
  ('tpl_handover','handover_note','email','Hand-over — {{vessel}} · reliever {{reliever}}','{{handover_body}}',1,'Crew sign-off hand-over note (to build)', '2026-06-30');
