-- 0009_populate_ship_crew_id.sql  (PCN ids CONFIRMED 2026-07-01)
-- Populate the persistent ship_crew_id. Run AFTER 0008 adds the column.
-- Money-adjacent (CLAUDE.md 6): 68 crew set from data; 2 assigned later.

UPDATE crew SET ship_crew_id = (SELECT MAX(k.km) FROM keyman_contract3 k WHERE k.sc = crew.agency_id AND k.km GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]') WHERE agency_id IN (SELECT sc FROM keyman_contract3 GROUP BY sc HAVING COUNT(DISTINCT km) = 1 AND MAX(km) GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]');

UPDATE crew SET ship_crew_id = '342055' WHERE agency_id = 'SC-0038131';
UPDATE crew SET ship_crew_id = '493011' WHERE agency_id = 'SC-0038311';
UPDATE crew SET ship_crew_id = '356595' WHERE agency_id = 'SC-0038434';
UPDATE crew SET ship_crew_id = '6141MAI26133' WHERE agency_id = 'SC-0038383';
UPDATE crew SET ship_crew_id = '6741MAI69156' WHERE agency_id = 'SC-0038418';
UPDATE crew SET ship_crew_id = '6141HEL58212' WHERE agency_id = 'SC-0038380';
UPDATE crew SET ship_crew_id = '6741MAI80877' WHERE agency_id = 'SC-0039935';
