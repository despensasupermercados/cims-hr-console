-- PRINTSHOP AUDIT, the audit on the ship (B1–B7), 19 Oct 2026. Mirrors AUDIT_DDL in src/audit_store.js (what reaches
-- production through ensureAudit); test/audit.test.js keeps the two identical.
CREATE TABLE IF NOT EXISTS audit_visit_data (visit_id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, ship TEXT NOT NULL, normalized_ship TEXT, agency_id TEXT NOT NULL, data_json TEXT NOT NULL, version INTEGER NOT NULL, filed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_visit_data_ship ON audit_visit_data (normalized_ship, filed_at);
CREATE TABLE IF NOT EXISTS audit_followup (id TEXT PRIMARY KEY, visit_id TEXT NOT NULL, request_id TEXT NOT NULL, ship TEXT NOT NULL, normalized_ship TEXT NOT NULL, agency_id TEXT NOT NULL, crew_name TEXT, owner TEXT NOT NULL, due TEXT, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixed')), carried INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, closed_at TEXT, closed_visit_id TEXT, closed_by TEXT);
CREATE INDEX IF NOT EXISTS idx_audit_followup_ship ON audit_followup (normalized_ship, status);
CREATE TABLE IF NOT EXISTS audit_file (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, step TEXT NOT NULL, client_key TEXT NOT NULL, r2_key TEXT NOT NULL, content_type TEXT, bytes INTEGER, taken_at TEXT, uploaded_at TEXT NOT NULL, uploaded_by TEXT, UNIQUE (request_id, client_key));
CREATE TABLE IF NOT EXISTS audit_obp_at_count (request_id TEXT PRIMARY KEY, as_of TEXT, lines_json TEXT NOT NULL, intransit_json TEXT, at TEXT NOT NULL);
