-- THE CREW HUB LINK (Miguel, 19 Oct 2026: of the options, "Per-crew link"; then "deploy"). One unguessable token per
-- seafarer opens their Crew Hub (src/crew_hub.js) with no login. Revocable: a revoked row stops answering, and the next
-- request for a link makes a new one. Nothing here is money (§1) or crew data beyond who holds which link. The same
-- CREATE runs in the Worker's guard (ensureHubLink).
CREATE TABLE IF NOT EXISTS crew_hub_link (
  token        TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  created_by   TEXT,
  revoked_at   TEXT,
  revoked_by   TEXT,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_crew_hub_link_sc ON crew_hub_link (agency_id);
