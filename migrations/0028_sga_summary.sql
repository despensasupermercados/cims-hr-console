-- 15 Oct 2026: the bill's MONTHLY SUMMARY sheet ("2026 SUMMARY (2)"): one row per month, the whole SGA by category.
-- crew_total = total - training - settlement = the GRAND TOTAL of SUMMARY MANNING. ensureSga creates it the same way.
CREATE TABLE IF NOT EXISTS sga_summary (id TEXT PRIMARY KEY, file_id TEXT, year INTEGER, month INTEGER,
  allotment REAL DEFAULT 0, final_pay REAL DEFAULT 0, agency_fee REAL DEFAULT 0, social REAL DEFAULT 0, joining_fee REAL DEFAULT 0,
  accounting_fee REAL DEFAULT 0, transition_fee REAL DEFAULT 0, air REAL DEFAULT 0, medical REAL DEFAULT 0, medical_repat REAL DEFAULT 0,
  visa REAL DEFAULT 0, hotel REAL DEFAULT 0, travel_insurance REAL DEFAULT 0, reimbursement REAL DEFAULT 0, funeral REAL DEFAULT 0,
  transport REAL DEFAULT 0, hmo REAL DEFAULT 0, cash_advance REAL DEFAULT 0, donation REAL DEFAULT 0, refund REAL DEFAULT 0,
  other REAL DEFAULT 0, bank_charge REAL DEFAULT 0, training REAL DEFAULT 0, settlement REAL DEFAULT 0, total REAL, crew_total REAL);
