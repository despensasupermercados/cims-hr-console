-- Notes are archived, never deleted (Miguel, 12 Oct 2026: "archive"; "I dont wanna lose the notes").
-- Who wrote the note, and when / by whom it was archived. Additive and nullable: old rows read as
-- "author not recorded, not archived". ensureCrewExtras applies the same columns idempotently.
ALTER TABLE crew_note_log ADD COLUMN created_by TEXT;
ALTER TABLE crew_note_log ADD COLUMN archived_at TEXT;
ALTER TABLE crew_note_log ADD COLUMN archived_by TEXT;
