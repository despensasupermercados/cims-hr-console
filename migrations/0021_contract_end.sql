-- WHY A CONTRACT ENDED (Miguel, 13 Oct 2026: "Add 'Resigned' as an end reason?"). One row per crew + contract, keyed
-- by the contract's sign-on (on_key, as contract_edit). Rita's word, HR only: never read by the bonus (§1), never
-- printed on the crew-facing statement. assignment.end_reason is NOT reused: it is written by the bonus commit from
-- the gates, it carries a CHECK that would need a table rebuild, and the TDG-dated contracts have no assignment row.
CREATE TABLE IF NOT EXISTS contract_end (
  sc      TEXT NOT NULL,
  on_key  TEXT NOT NULL,
  reason  TEXT NOT NULL,
  note    TEXT,
  set_by  TEXT,
  set_at  TEXT NOT NULL,
  PRIMARY KEY (sc, on_key)
);
