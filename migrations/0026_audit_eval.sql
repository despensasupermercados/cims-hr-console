-- Dexter's grade on an audit (Miguel, 15 Oct 2026). Filed once per audit, never rewritten.
CREATE TABLE IF NOT EXISTS audit_eval (visit_id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, agency_id TEXT NOT NULL, ship TEXT NOT NULL, r_inventory INTEGER NOT NULL, r_technical INTEGER NOT NULL, r_collaterals INTEGER NOT NULL, r_overall INTEGER, score INTEGER NOT NULL, score_from TEXT NOT NULL, note TEXT, filed_by TEXT NOT NULL, filed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_eval_sc ON audit_eval (agency_id, filed_at);
