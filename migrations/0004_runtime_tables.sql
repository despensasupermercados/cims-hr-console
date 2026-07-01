-- 0004_runtime_tables.sql
-- Bring the runtime "shadow" tables under migration control.
-- Every statement is CREATE TABLE IF NOT EXISTS, so on the live DB (where these
-- already exist) it is a no-op; on a fresh DB it builds them. Proven idempotent
-- on cims-hr-console-staging.

CREATE TABLE IF NOT EXISTS keyman_contract3 (sc TEXT NOT NULL, km TEXT, ship TEXT, st TEXT, seq INTEGER, sign_on TEXT, proj_off TEXT, act_off TEXT, PRIMARY KEY (sc, seq));

CREATE TABLE IF NOT EXISTS crew_override (agency_id TEXT PRIMARY KEY, first_name TEXT, middle_name TEXT, last_name TEXT, status TEXT, rank_override TEXT, vessel_observed TEXT, dob TEXT, province TEXT, phone TEXT, email TEXT, pp_no TEXT, med_exp TEXT, sirb_exp TEXT, pp_exp TEXT, usv_exp TEXT, sch_exp TEXT, baseline_count INTEGER, notes TEXT, updated_at TEXT, retired INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS crew_note_log (id INTEGER PRIMARY KEY AUTOINCREMENT, agency_id TEXT, ts TEXT, text TEXT);

CREATE TABLE IF NOT EXISTS crew_ready (agency_id TEXT PRIMARY KEY, eccr INTEGER DEFAULT 0, air INTEGER DEFAULT 0, hotel INTEGER DEFAULT 0, updated_at TEXT, note TEXT);

CREATE TABLE IF NOT EXISTS contract_edit (sc TEXT, seq INTEGER, embark TEXT, disembark TEXT, sign_on TEXT, sign_off TEXT, ship TEXT, eccr INTEGER DEFAULT 0, air INTEGER DEFAULT 0, hotel INTEGER DEFAULT 0, on_conf INTEGER DEFAULT 0, off_conf INTEGER, updated_at TEXT, PRIMARY KEY (sc, seq));

CREATE TABLE IF NOT EXISTS crew_intel (id TEXT PRIMARY KEY, agency_id TEXT, reporter TEXT, summary TEXT, source TEXT DEFAULT 'email', source_email_id TEXT, confidence TEXT, status TEXT DEFAULT 'filed', candidates TEXT, ts TEXT, created_by TEXT, contract_no INTEGER, edited_at TEXT);

CREATE TABLE IF NOT EXISTS email_inbox (id TEXT PRIMARY KEY, from_addr TEXT, to_addr TEXT, subject TEXT, raw TEXT, received_at TEXT, status TEXT DEFAULT 'new', processed_at TEXT);

CREATE TABLE IF NOT EXISTS travel_expense (id TEXT PRIMARY KEY, year INTEGER, month INTEGER, leg TEXT, crew_name TEXT, air REAL, hotel REAL, medical REAL, visa REAL, food REAL, transport REAL, total REAL, kind TEXT DEFAULT 'crew', other REAL DEFAULT 0);

CREATE TABLE IF NOT EXISTS feedback_request2 (id TEXT PRIMARY KEY, crew_id TEXT NOT NULL, role TEXT NOT NULL, token_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', due_date TEXT, requested_by TEXT, requested_at TEXT NOT NULL, UNIQUE (crew_id, role));

CREATE TABLE IF NOT EXISTS feedback_response2 (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, crew_id TEXT NOT NULL, role TEXT NOT NULL, answers_json TEXT NOT NULL, submitted_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS data_log (id TEXT PRIMARY KEY, source TEXT, rows INTEGER, status TEXT, at TEXT);

CREATE TABLE IF NOT EXISTS data_meta (k TEXT PRIMARY KEY, v TEXT);
