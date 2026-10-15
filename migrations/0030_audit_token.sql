-- 16 Oct 2026 review of the Printshop Audit (CLAUDE.md §10i). Mirrors AUDIT_DDL in src/audit_store.js.
CREATE TABLE IF NOT EXISTS audit_token (token_hash TEXT PRIMARY KEY, request_id TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_token_req ON audit_token (request_id, at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_request_open ON audit_request (agency_id, normalized_ship) WHERE status IN ('draft','sent');
