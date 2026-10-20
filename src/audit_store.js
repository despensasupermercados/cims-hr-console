// PRINTSHOP AUDIT — the tables (14 Oct 2026). ONE list of statements, used twice: migrations/0024_audit.sql is the
// record, and ensureAuditTables (wrapped in memoEnsure in worker.js, §12) is what reaches production — the prod deploy
// runs no migration (package.json `deploy:staging` and Workers Builds both skip it), exactly like ensureSbm.
// test/audit.test.js checks the two never drift. (Amended 14 Oct 2026 for PR C — normalized_ship, test_mode — before
// any environment had created the tables: production and staging both checked empty of audit_* that day.)
//
// Append-only where a row records a fact: an upload is never overwritten (a new file supersedes the old one,
// `superseded_at`), a sent email is a row in audit_send_log, a filed visit is never rewritten.
export const AUDIT_DDL = [
  "CREATE TABLE IF NOT EXISTS audit_request (id TEXT PRIMARY KEY, ship TEXT NOT NULL, normalized_ship TEXT, agency_id TEXT NOT NULL, crew_name TEXT, contract_label TEXT, auditor TEXT NOT NULL, to_ship TEXT, cc_personal TEXT, token_hash TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','complete','cancelled')), test_mode INTEGER NOT NULL DEFAULT 1, machines_json TEXT, lines_json TEXT, created_at TEXT NOT NULL, sent_at TEXT, due_at TEXT, reminded_at TEXT, overdue_at TEXT, complete_at TEXT, cancelled_at TEXT, cancelled_by TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_audit_request_ship ON audit_request (ship, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_audit_request_sc ON audit_request (agency_id, created_at)",
  "CREATE TABLE IF NOT EXISTS audit_upload (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, serial TEXT, kind TEXT NOT NULL CHECK (kind IN ('p43','mgmt','photo')), r2_key TEXT NOT NULL, filename TEXT, content_type TEXT, bytes INTEGER, at TEXT NOT NULL, read_state TEXT NOT NULL DEFAULT 'pending' CHECK (read_state IN ('pending','ok','wrong_doc','unreadable','failed')), read_json TEXT, read_at TEXT, read_version INTEGER, superseded_at TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_audit_upload_req ON audit_upload (request_id, serial, kind)",
  "CREATE TABLE IF NOT EXISTS audit_count (request_id TEXT NOT NULL, part_no TEXT NOT NULL, counted INTEGER NOT NULL CHECK (counted >= 0), at TEXT NOT NULL, PRIMARY KEY (request_id, part_no))",
  "CREATE TABLE IF NOT EXISTS audit_count_extra (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, text TEXT NOT NULL, counted INTEGER CHECK (counted >= 0), at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit_down (request_id TEXT NOT NULL, serial TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (request_id, serial))",
  "CREATE TABLE IF NOT EXISTS audit_send_log (request_id TEXT NOT NULL, kind TEXT NOT NULL, sent_at TEXT NOT NULL, to_json TEXT, ok INTEGER NOT NULL DEFAULT 0, note TEXT, PRIMARY KEY (request_id, kind))",
  "CREATE TABLE IF NOT EXISTS audit_visit (id TEXT PRIMARY KEY, request_id TEXT UNIQUE, ship TEXT NOT NULL, agency_id TEXT NOT NULL, auditor TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','filed')), opened_at TEXT NOT NULL, filed_at TEXT)",
  // migrations/0025_audit_plain.sql: the briefing's field intel in plain words, keyed by a hash of the summary (an edit re-writes it)
  "CREATE TABLE IF NOT EXISTS audit_plain (h TEXT PRIMARY KEY, text TEXT NOT NULL, engine TEXT, at TEXT NOT NULL)",
  // migrations/0026_audit_eval.sql: Dexter's grade, filed once per audit (never rewritten)
  "CREATE TABLE IF NOT EXISTS audit_eval (visit_id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, agency_id TEXT NOT NULL, ship TEXT NOT NULL, r_inventory INTEGER NOT NULL, r_technical INTEGER NOT NULL, r_collaterals INTEGER NOT NULL, r_overall INTEGER, score INTEGER NOT NULL, score_from TEXT NOT NULL, note TEXT, filed_by TEXT NOT NULL, filed_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_audit_eval_sc ON audit_eval (agency_id, filed_at)",
  // migrations/0030_audit_token.sql (16 Oct 2026 review): every link a request was ever sent with stays valid while the
  // request is open — a reminder or a resend adds a link, it never breaks the one the crew already has open
  "CREATE TABLE IF NOT EXISTS audit_token (token_hash TEXT PRIMARY KEY, request_id TEXT NOT NULL, at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_audit_token_req ON audit_token (request_id, at)",
  // one open request per seafarer and ship: two taps (or two visitors on the open site) cannot both send one
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_request_open ON audit_request (agency_id, normalized_ship) WHERE status IN ('draft','sent')",
  // migrations/0035_audit_visit.sql (19 Oct 2026): the audit on the ship (B1–B7). The steps' answers are kept whole with
  // the visit, filed once; the follow-up is its own record (owner, date, fixed or still open at the next visit); the
  // photos are files in the bucket; the OBP the count was compared with is kept when the documents come in.
  "CREATE TABLE IF NOT EXISTS audit_visit_data (visit_id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, ship TEXT NOT NULL, normalized_ship TEXT, agency_id TEXT NOT NULL, data_json TEXT NOT NULL, version INTEGER NOT NULL, filed_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_audit_visit_data_ship ON audit_visit_data (normalized_ship, filed_at)",
  "CREATE TABLE IF NOT EXISTS audit_followup (id TEXT PRIMARY KEY, visit_id TEXT NOT NULL, request_id TEXT NOT NULL, ship TEXT NOT NULL, normalized_ship TEXT NOT NULL, agency_id TEXT NOT NULL, crew_name TEXT, owner TEXT NOT NULL, due TEXT, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixed')), carried INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, closed_at TEXT, closed_visit_id TEXT, closed_by TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_audit_followup_ship ON audit_followup (normalized_ship, status)",
  "CREATE TABLE IF NOT EXISTS audit_file (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, step TEXT NOT NULL, client_key TEXT NOT NULL, r2_key TEXT NOT NULL, content_type TEXT, bytes INTEGER, taken_at TEXT, uploaded_at TEXT NOT NULL, uploaded_by TEXT, UNIQUE (request_id, client_key))",
  "CREATE TABLE IF NOT EXISTS audit_obp_at_count (request_id TEXT PRIMARY KEY, as_of TEXT, lines_json TEXT NOT NULL, intransit_json TEXT, at TEXT NOT NULL)",
  // migrations/0037_audit_one_per_ship.sql (20 Oct 2026): ONE PERSON AT A TIME PER SHIP (Miguel: "we do 1 person at the time
  // per ship"). A second request waiting on a ship is refused by the database too, for anyone; the per-seafarer index
  // above is now implied by it and stays (0030 made it). "In and not graded" is open too: that is the SELECT's
  // (src/audit.js OPEN_REQ_SQL), which an index condition cannot read.
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_request_open_ship ON audit_request (normalized_ship) WHERE status IN ('draft','sent')",
];

export async function ensureAuditTables(env) {
  for (const s of AUDIT_DDL) await env.DB.prepare(s).run();
}
