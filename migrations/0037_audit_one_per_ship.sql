-- One person at a time per ship (Miguel, 20 Oct 2026: "we do 1 person at the time per ship"). Mirrors AUDIT_DDL in
-- src/audit_store.js. A second request waiting (draft, sent) on a ship is refused by the database too, for anyone. The
-- per-seafarer index of 0030 is implied by this one and stays. A request whose documents are in and that is not graded
-- is also open; that part is the SELECT's (src/audit.js OPEN_REQ_SQL), which an index condition cannot read.
-- Checked on production before applying: one request on file (Pursuit, complete), so no two are waiting on one ship.
CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_request_open_ship ON audit_request (normalized_ship) WHERE status IN ('draft','sent');
