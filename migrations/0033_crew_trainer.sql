-- THE TRAINER TAG (Miguel, 17 Oct 2026: "perhaps you can tag the 3 guys as trainers"; of the options, "Trainer tag").
-- A trainer sails to teach and goes home to support: every trip of theirs is a training visit (src/visits.js: no sign-off
-- instructions or link, nobody's reliever, never dates the printer's sign-off, not a completed contract, a visit line on
-- the ship, off the bench) UNLESS Rita marks that trip a full contract (contract_visit.kind = 'contract'). Rita tags a
-- trainer in Edit crew. The same CREATE and ALTER run in ensureCrewExtras.
CREATE TABLE IF NOT EXISTS crew_trainer (
  sc      TEXT PRIMARY KEY,
  set_by  TEXT,
  set_at  TEXT NOT NULL
);
ALTER TABLE contract_visit ADD COLUMN kind TEXT DEFAULT 'visit';
-- The three trainers Miguel named the same day: Jonathan Placer Alonzo, Ohji Garcia Miranda, Joemar De Leon.
INSERT OR IGNORE INTO crew_trainer (sc, set_by, set_at) VALUES
  ('SC-0041465', 'Miguel 17 Oct 2026', '2026-10-17T10:00:00Z'),
  ('SC-0038378', 'Miguel 17 Oct 2026', '2026-10-17T10:00:00Z'),
  ('SC-0038392', 'Miguel 17 Oct 2026', '2026-10-17T10:00:00Z');
