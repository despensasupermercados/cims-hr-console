-- ACKNOWLEDGE A DECISION (Miguel, 19 Oct 2026, on the Travel tab's Needs a decision: "once acknowledge ?? the comments u made
-- .. they should disappear"). One row per acknowledged fact; the key carries the figure, so a fact that changes (a new bill,
-- a corrected workbook) is a new key and comes back. Undo deletes the row. Shared by everyone who opens the tab. The same
-- CREATE runs in ensureTravelImpl's wave.
CREATE TABLE IF NOT EXISTS travel_ack (
  key     TEXT PRIMARY KEY,
  label   TEXT,
  ack_by  TEXT,
  ack_at  TEXT NOT NULL
);
