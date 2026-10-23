-- 0038_norwegian_getaway.sql
-- Norwegian Getaway, NCL's pilot hull for DG3 (Miguel, 20 Oct 2026: "yes get away i the console"). In service 16 Nov
-- 2026 (Brain rec2lUszqqzau4xns); the first printer, Joe Art Eresmas, signs on 9 Nov (recbpoXVhLjn9Ordl). VESSEL_REF
-- carries her as "Getaway" (brand NCL, from 2026-11-16); this guarantees the vessel row the projection and relief
-- paths look up (projection.js refuses an unknown ship). Same convention as 0006 / 0014: short name and the CHECK's
-- brand word ('NCL'). No jr_ps_rule: the column was added in production by hand, and the board reads the Junior PS rule
-- for Royal Caribbean hulls only (§10e), so an NCL hull is "open" whatever the row says.
INSERT OR IGNORE INTO vessel (id, name, brand) VALUES
('ves_getaway','Getaway','NCL');
