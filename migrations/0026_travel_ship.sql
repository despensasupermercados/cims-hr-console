-- 15 Oct 2026 — the hull a travel-ledger row sits under (Rita's workbook: column A of every month sheet).
-- Lets a line item know its ship and its cruise line (Royal / Celebrity / Azamara / NCL). The same ALTER rides in
-- ensureTravelImpl's wave for a table created before this file; a table that already carries it answers with an
-- error the guard ignores.
ALTER TABLE travel_expense ADD COLUMN ship TEXT;
