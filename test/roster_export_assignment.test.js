/**
 * THE EXPORT MUST SEE THE HULL THE RELIEF BOARD PUT SOMEBODY ON.
 *
 * ship_leg is a one-time keyman_roster snapshot. Nothing writes a CURRENT leg
 * to it any more — every movement since is an `assignment` row, and
 * leg_projection.js mirrors those in as is_current = 0 because is_current = 1
 * is the billing-visible set.
 *
 * So this query, which joined ship_leg ON is_current = 1 and nothing else,
 * could not see where anybody who had rotated actually was. Live on 2 Sep 2026:
 * eleven crew exported with a NULL ship and a NULL brand. Downstream in
 * cims-timecard a crew member with no ship cannot owe a card — so they were
 * never chased, their filed cards stranded at ship='?', and their VESSELS fell
 * out of the client compliance report. Azamara read "2 of 2 ships reported"
 * while Journey and Quest were absent and Quest's printer held a confirmed MLC
 * rest-hour violation. A hull that vanishes improves the score.
 *
 * These tests run the REAL ROSTER_SQL against real SQLite with the production
 * table shapes. A regex over the query string would have passed on every
 * broken draft of this fix; only executing it proves the join does not
 * duplicate a crew row, and that is the failure that would corrupt a headcount.
 *
 * Run: node --test test/roster_export_assignment.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER_SQL } from '../src/roster_export.js';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* asserted below */ }

const SCHEMA = `
CREATE TABLE crew (id TEXT PRIMARY KEY, ship_crew_id TEXT, agency_id TEXT, first_name TEXT,
  last_name TEXT, rank_override TEXT, rank_observed TEXT, vessel_observed TEXT,
  status TEXT, email TEXT, redacted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE crew_override (agency_id TEXT, first_name TEXT, last_name TEXT,
  rank_override TEXT, vessel_observed TEXT, status TEXT, email TEXT, retired INTEGER DEFAULT 0);
CREATE TABLE ship_leg (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT, ship_short TEXT,
  vessel_id TEXT, sc TEXT, crew_id TEXT, ours INTEGER NOT NULL DEFAULT 1,
  on_date TEXT, off_date TEXT, is_current INTEGER NOT NULL DEFAULT 0, source TEXT);
CREATE TABLE vessel (id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL);
CREATE TABLE contract (id TEXT PRIMARY KEY, crew_id TEXT NOT NULL, status TEXT);
CREATE TABLE assignment (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, vessel_id TEXT,
  vessel_name TEXT NOT NULL, sign_on TEXT NOT NULL, planned_sign_off TEXT, actual_sign_off TEXT);
INSERT INTO vessel (id,name,brand) VALUES
  ('ves_journey','Journey','Azamara'),
  ('ves_quest','Quest','Azamara'),
  ('ves_ovation','Ovation','Royal Caribbean'),
  ('ves_rhapsody','Rhapsody','Royal Caribbean');
`;

const YESTERYEAR = '2025-11-01';
const PAST = '2026-07-25';
const FUTURE = '2026-11-02';

function db() {
  const d = new DatabaseSync(':memory:');
  d.exec(SCHEMA);
  return d;
}
const addCrew = (d, id, last, status = 'On board', vesselObserved = null) =>
  d.prepare(`INSERT INTO crew (id,ship_crew_id,agency_id,last_name,first_name,status,
              vessel_observed,redacted) VALUES (?,?,?,?,'X',?,?,0)`)
    .run(id, id.toUpperCase(), 'AG-' + id, last, status, vesselObserved);
const addLeg = (d, crewId, ship, brand, isCurrent, on = YESTERYEAR) =>
  d.prepare(`INSERT INTO ship_leg (brand,ship_short,crew_id,ours,on_date,is_current)
             VALUES (?,?,?,1,?,?)`).run(brand, ship, crewId, on, isCurrent);
const addAssignment = (d, crewId, aid, vesselId, name, signOn, actualOff = null) => {
  d.prepare('INSERT OR IGNORE INTO contract (id,crew_id,status) VALUES (?,?,\'Active\')')
    .run('k_' + crewId, crewId);
  d.prepare(`INSERT INTO assignment (id,contract_id,vessel_id,vessel_name,sign_on,
              planned_sign_off,actual_sign_off) VALUES (?,?,?,?,?,'2027-01-01',?)`)
    .run(aid, 'k_' + crewId, vesselId, name, signOn, actualOff);
};
const run = (d) => d.prepare(ROSTER_SQL).all();
const one = (d, id) => run(d).find((r) => r.ship_crew_id === id.toUpperCase());

test('node:sqlite is available, so everything below actually runs', () => {
  assert.ok(DatabaseSync, 'node:sqlite unavailable — the export query went unverified.');
});

test('the query is valid SQL against the production table shapes', () => {
  const d = db();
  addCrew(d, 'c1', 'Siao');
  assert.doesNotThrow(() => run(d));
});

test('an in-force assignment supplies ship and brand when there is no current leg', () => {
  const d = db();
  addCrew(d, 'vicedo', 'Vicedo');
  addAssignment(d, 'vicedo', 'a1', 'ves_journey', 'Journey', PAST);
  const r = one(d, 'vicedo');
  assert.equal(r.ship, 'Journey');
  assert.equal(r.brand, 'Azamara', 'brand had NO fallback before — this is what made client "?"');
  assert.equal(r.sign_on, PAST);
});

test('a CURRENT leg still wins over an assignment, field for field', () => {
  /* The whole safety argument for this change: verified against production,
   * 102 rows before and after, every difference null -> value. Nothing that
   * had a leg may move. */
  const d = db();
  addCrew(d, 'alonzo', 'Alonzo');
  addLeg(d, 'alonzo', 'Rhapsody', 'Royal Caribbean', 1);
  addAssignment(d, 'alonzo', 'a1', 'ves_ovation', 'Ovation', PAST);
  const r = one(d, 'alonzo');
  assert.equal(r.ship, 'Rhapsody');
  assert.equal(r.brand, 'Royal Caribbean');
  assert.equal(r.sign_on, YESTERYEAR);
});

test('a future assignment places nobody aboard', () => {
  // Alonzo's real Ovation contract starts 2 Nov. He is not on Ovation today.
  const d = db();
  addCrew(d, 'future', 'Alonzo');
  addAssignment(d, 'future', 'a1', 'ves_ovation', 'Ovation', FUTURE);
  const r = one(d, 'future');
  assert.equal(r.ship, null);
  assert.equal(r.brand, null);
});

test('an assignment that has actually signed off places nobody aboard', () => {
  const d = db();
  addCrew(d, 'gone', 'Santos');
  addAssignment(d, 'gone', 'a1', 'ves_quest', 'Quest', PAST, '2026-08-01');
  assert.equal(one(d, 'gone').ship, null);
});

test('two in-force assignments yield ONE row, the later sign-on winning', () => {
  /* A LEFT JOIN matching twice would silently double a crew member: two rows,
   * two roster upserts downstream, one hull counted twice. The LIMIT 1
   * subquery is what stops it, and only executing the SQL proves it. */
  const d = db();
  addCrew(d, 'two', 'Transfer');
  addAssignment(d, 'two', 'a1', 'ves_quest', 'Quest', '2026-06-01');
  addAssignment(d, 'two', 'a2', 'ves_journey', 'Journey', '2026-08-01');
  const rows = run(d).filter((r) => r.ship_crew_id === 'TWO');
  assert.equal(rows.length, 1, 'the assignment join multiplied a crew row');
  assert.equal(rows[0].ship, 'Journey');
});

test('row count is exactly one per non-redacted crew member', () => {
  const d = db();
  addCrew(d, 'a', 'A'); addCrew(d, 'b', 'B'); addCrew(d, 'c', 'C');
  addLeg(d, 'a', 'Rhapsody', 'Royal Caribbean', 1);
  addAssignment(d, 'b', 'b1', 'ves_quest', 'Quest', PAST);
  addAssignment(d, 'b', 'b2', 'ves_journey', 'Journey', PAST);   // same day, two rows
  addLeg(d, 'c', 'Quest', 'Azamara', 0, PAST);                   // projected only
  assert.equal(run(d).length, 3);
});

test('status is not consulted — movements are truth, status is not', () => {
  /* Lazo is 'Earmarked' in crew and has been on Harmony since 18 Aug, with two
   * of his time cards sitting unread in the intake queue. Gating on status
   * would leave Harmony with no printer and drop the hull from the report. */
  const d = db();
  addCrew(d, 'lazo', 'Lazo', 'Earmarked');
  addAssignment(d, 'lazo', 'a1', 'ves_quest', 'Quest', PAST);
  assert.equal(one(d, 'lazo').ship, 'Quest');
});

test('with no leg the assignment is the best answer available', () => {
  const d = db();
  addCrew(d, 'ovr', 'Espenilla');
  addAssignment(d, 'ovr', 'a1', 'ves_quest', 'Quest', PAST);
  assert.equal(one(d, 'ovr').ship, 'Quest');
});

test('MUTATION GUARD: without the assignment join the eleven stay invisible', () => {
  const stripped = ROSTER_SQL
    .replace(/LEFT JOIN assignment a[\s\S]*?LIMIT 1\)/, '')
    .replace(/LEFT JOIN vessel av ON av\.id = a\.vessel_id/, '')
    .replace(/av\.name, a\.vessel_name,/, '')
    .replace(/COALESCE\(l\.brand, av\.brand\)/, 'l.brand')
    .replace(/COALESCE\(l\.on_date,\s*a\.sign_on\)/, 'l.on_date')
    .replace(/COALESCE\(l\.off_date, a\.actual_sign_off, a\.planned_sign_off\)/, 'l.off_date');
  const d = db();
  addCrew(d, 'vicedo', 'Vicedo');
  addAssignment(d, 'vicedo', 'a1', 'ves_journey', 'Journey', PAST);
  const before = d.prepare(stripped).all().find((r) => r.ship_crew_id === 'VICEDO');
  assert.equal(before.ship, null, 'the old query must reproduce the bug, or this proves nothing');
  assert.equal(one(d, 'vicedo').ship, 'Journey', 'and the new one must fix it');
});

test('billing is untouched: the export neither writes nor promotes a leg', () => {
  assert.doesNotMatch(ROSTER_SQL, /\b(INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(ROSTER_SQL, /is_current\s*=\s*0/);
  assert.match(ROSTER_SQL, /l\.is_current = 1/, 'the leg join stays pinned to the current set');
});
