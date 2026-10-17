-- A TRAINING VISIT IS A TRIP, NOT A CONTRACT (Miguel, 17 Oct 2026: Jonathan "sometimes he goes to the ship to teach as crew
-- and then home [to] support .. same as Ohji"; his choice: "Rita ticks 'Training visit'"). One row per crew + trip, keyed
-- by the trip's embark (on_key, as contract_edit / contract_end). A visit gets no sign-off instructions, is nobody's
-- reliever and never dates the printer's sign-off, never adds to TDG's contract count, and is drawn as a visit line, not a
-- seat, and off the earmark bench (src/visits.js). The shoreside team's trips are visits without a row. The same CREATE
-- runs in ensureCrewExtras.
CREATE TABLE IF NOT EXISTS contract_visit (
  sc      TEXT NOT NULL,
  on_key  TEXT NOT NULL,
  set_by  TEXT,
  set_at  TEXT NOT NULL,
  PRIMARY KEY (sc, on_key)
);
