-- THE EMERGENCY CONTACT (Miguel, 13 Oct 2026: "u can add it"). TDG's AdvancedQuery is asked to carry a next-of-kin /
-- emergency-contact column; the import writes it onto crew (an empty cell clears it, like every TDG field), and a value
-- typed in Edit crew lives on crew_override with Reset to TDG. Additive only.
ALTER TABLE crew ADD COLUMN emergency_name TEXT;
ALTER TABLE crew ADD COLUMN emergency_relation TEXT;
ALTER TABLE crew ADD COLUMN emergency_phone TEXT;
ALTER TABLE crew_override ADD COLUMN emergency_name TEXT;
ALTER TABLE crew_override ADD COLUMN emergency_relation TEXT;
ALTER TABLE crew_override ADD COLUMN emergency_phone TEXT;
