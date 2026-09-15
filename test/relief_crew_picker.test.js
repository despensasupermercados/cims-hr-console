// /api/relief/crew — the reliever picker's rows: status, ship, open projections, document standing (2026-09-15).
import { test } from "node:test";
import assert from "node:assert/strict";
import { RELIEF_CREW_PICKER_SQL } from "../src/relief_api.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SCHEMA = `
CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL UNIQUE, first_name TEXT, last_name TEXT, status TEXT, rank_observed TEXT, rank_override TEXT,
  vessel_observed TEXT, med_exp TEXT, sirb_exp TEXT, pp_exp TEXT, usv_exp TEXT, sch_exp TEXT, redacted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE crew_override (agency_id TEXT PRIMARY KEY, status TEXT, rank_override TEXT, vessel_observed TEXT, med_exp TEXT, sirb_exp TEXT, pp_exp TEXT, usv_exp TEXT, sch_exp TEXT);
CREATE TABLE vessel (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, brand TEXT NOT NULL);
CREATE TABLE contract (id TEXT PRIMARY KEY, crew_id TEXT NOT NULL);
CREATE TABLE assignment (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, vessel_id TEXT, vessel_name TEXT NOT NULL, sign_on TEXT NOT NULL, actual_sign_off TEXT);
INSERT INTO vessel VALUES ('ves_anthem','Anthem','Royal Caribbean'), ('ves_quest','Quest','Azamara');
INSERT INTO crew (id,agency_id,first_name,last_name,status,rank_observed,vessel_observed,pp_exp) VALUES
  ('c1','SC-1','Ana','Alpha','On board','Printer Specialist','MV ANTHEM OF THE SEAS','2025-01-01'),
  ('c2','SC-2','Ben','Bravo','On Vacation','Junior Printer Specialist',NULL,NULL),
  ('c3','SC-3','Hidden','Person','On board','Printer Specialist',NULL,NULL);
UPDATE crew SET redacted=1 WHERE id='c3';
INSERT INTO crew_override (agency_id, rank_override, vessel_observed) VALUES ('SC-2','Printer Specialist','Quest');
INSERT INTO contract VALUES ('k1','c1'), ('k2','c1');
INSERT INTO assignment VALUES ('a1','k1','ves_quest','Quest','2026-11-01',NULL), ('a2','k2',NULL,'Edge','2026-01-01','2026-06-01');
`;

test("node:sqlite is available, so everything below actually runs", () => {
  assert.ok(DatabaseSync, "node:sqlite unavailable — the picker SQL went unverified.");
});

test("the picker rows: override wins, open projections listed, hidden crew absent, document fields present", () => {
  const d = new DatabaseSync(":memory:"); d.exec(SCHEMA);
  const rows = d.prepare(RELIEF_CREW_PICKER_SQL).all();
  assert.deepEqual(rows.map((r) => r.id), ["c1", "c2"], "hidden crew never reach the picker; sorted by name");
  const [ana, ben] = rows;
  assert.equal(ana.status, "On board"); assert.equal(ana.vessel, "MV ANTHEM OF THE SEAS"); assert.equal(ana.rank, "Printer Specialist");
  assert.equal(ana.planned, "Quest", "only the OPEN projection counts; the ended Edge one does not");
  assert.equal(ana.pp_exp, "2025-01-01", "document expiries ride along for docBadge()");
  assert.equal(ben.rank, "Printer Specialist", "crew_override.rank_override wins");
  assert.equal(ben.vessel, "Quest", "crew_override.vessel_observed wins");
  assert.equal(ben.planned, null);
});
