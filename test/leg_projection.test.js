import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planProjection, isProjected, sourceKey } from '../src/leg_projection.js';

const TODAY = '2026-07-27';
const SHIPS = { Quest: 'Azamara', Rhapsody: 'Royal Caribbean', Serenade: 'Royal Caribbean', Beyond: 'Celebrity' };

const asg = (o = {}) => ({
  id: 'as_1', vessel_name: 'Quest', sign_on: '2026-07-29', planned_sign_off: '2026-12-15',
  on_port_seed: null, off_port_seed: null, sc: 'SC-0038328', crew_id: 'crew_SC_0038328', ...o,
});

// The 48 keyman_roster rows look like this — no `source` prefix of ours.
const keymanRow = (o = {}) => ({
  id: 1, source: 'keyman_roster', brand: 'Azamara', ship_short: 'Quest', sc: 'SC-0000001',
  crew_id: 'crew_x', on_date: '2026-02-01', off_date: '2026-09-01', embark: null,
  disembark: null, on_conf: 0, off_conf: 0, is_current: 1, ...o,
});

const plan = (o = {}) =>
  planProjection({ assignments: [], shipIndex: SHIPS, existingRows: [], today: TODAY, ...o });

/* ---- Invariant 1: never writes is_current=1 ---- */

test('INVARIANT 1: every projected row is is_current=0', () => {
  const p = plan({
    assignments: [
      asg(),
      asg({ id: 'as_2', vessel_name: 'Rhapsody', sign_on: '2026-08-01', sc: 'SC-2' }),
      asg({ id: 'as_3', vessel_name: 'Beyond', sign_on: '2026-09-09', sc: 'SC-3' }),
    ],
  });
  assert.equal(p.inserts.length, 3);
  for (const r of p.inserts) assert.equal(r.is_current, 0);
});

test('INVARIANT 1: a projected leg never shadows an existing current leg', () => {
  const existing = [keymanRow({ sc: 'SC-0038328', ship_short: 'Quest', on_date: '2026-07-29', is_current: 1 })];
  const p = plan({ assignments: [asg()], existingRows: existing });
  assert.equal(p.inserts.length, 0);
  assert.equal(p.skipped[0].reason, 'collides_with_current_leg');
});

/* ---- Invariant 2: the keyman rows (incl. the 8 orphans) are untouchable ---- */

test('INVARIANT 2: keyman_roster rows are never updated or deleted', () => {
  const orphans = [
    keymanRow({ id: 1, sc: 'SC-ORPHAN-1' }),
    keymanRow({ id: 2, sc: 'SC-ORPHAN-2', ship_short: 'Rhapsody', brand: 'Royal Caribbean' }),
  ];
  const p = plan({ assignments: [asg()], existingRows: orphans });
  assert.deepEqual(p.deletes, []);
  assert.equal(p.updates.length, 0);
  // the one insert is ours, tagged, and touches neither orphan
  assert.equal(p.inserts.length, 1);
  assert.ok(p.inserts[0].source.startsWith('assignment:'));
});

test('INVARIANT 2: isProjected only claims our own rows', () => {
  assert.equal(isProjected({ source: 'assignment:as_1' }), true);
  assert.equal(isProjected({ source: 'keyman_roster' }), false);
  assert.equal(isProjected({ source: 'keyman_roster;on=TBA(Rita)' }), false);
  assert.equal(isProjected({ source: null }), false);
  assert.equal(isProjected({}), false);
});

/* ---- Invariant 3: idempotent + converging ---- */

test('INVARIANT 3: re-running with unchanged data is a no-op', () => {
  const first = plan({ assignments: [asg()] });
  const persisted = [{ ...first.inserts[0], id: 99 }];
  const second = plan({ assignments: [asg()], existingRows: persisted });
  assert.deepEqual(second, { inserts: [], updates: [], deletes: [], skipped: [] });
});

test('INVARIANT 3: a changed sign-off produces an update, not a duplicate', () => {
  const first = plan({ assignments: [asg()] });
  const persisted = [{ ...first.inserts[0], id: 99 }];
  const second = plan({ assignments: [asg({ planned_sign_off: '2027-01-31' })], existingRows: persisted });
  assert.equal(second.inserts.length, 0);
  assert.equal(second.updates.length, 1);
  assert.equal(second.updates[0].off_date, '2027-01-31');
});

test('INVARIANT 3: a vanished assignment removes only our own stale row', () => {
  const persisted = [
    { source: sourceKey('as_gone'), brand: 'Azamara', ship_short: 'Quest', sc: 'SC-9',
      crew_id: 'c9', on_date: '2026-08-20', off_date: null, embark: null, disembark: null,
      on_conf: 0, off_conf: 0, is_current: 0 },
    keymanRow({ id: 7, sc: 'SC-ORPHAN-1' }),
  ];
  const p = plan({ assignments: [], existingRows: persisted });
  assert.deepEqual(p.deletes, [sourceKey('as_gone')]);
});

/* ---- Invariant 4: fail loud, never guess ---- */

test('INVARIANT 4: an unknown vessel is skipped, not invented', () => {
  const p = plan({ assignments: [asg({ vessel_name: 'Mystery Boat' })] });
  assert.equal(p.inserts.length, 0);
  assert.equal(p.skipped[0].reason, 'unknown_vessel');
  assert.equal(p.skipped[0].vessel, 'Mystery Boat');
});

test('INVARIANT 4: off_date before on_date is skipped (would violate the CHECK)', () => {
  const p = plan({ assignments: [asg({ sign_on: '2026-09-01', planned_sign_off: '2026-08-01' })] });
  assert.equal(p.inserts.length, 0);
  assert.equal(p.skipped[0].reason, 'off_before_on');
});

test('INVARIANT 4: ports are honest nulls, never a homeport guess', () => {
  const p = plan({ assignments: [asg()] });
  assert.equal(p.inserts[0].embark, null);
  assert.equal(p.inserts[0].disembark, null);
});

test('ports are carried through when the assignment actually has them', () => {
  const p = plan({ assignments: [asg({ on_port_seed: 'SAN JUAN', off_port_seed: 'MIAMI' })] });
  assert.equal(p.inserts[0].embark, 'SAN JUAN');
  assert.equal(p.inserts[0].disembark, 'MIAMI');
});

/* ---- window + hygiene ---- */

test('past and same-day sign-ons are not projected', () => {
  const p = plan({
    assignments: [
      asg({ id: 'as_past', sign_on: '2026-07-01' }),
      asg({ id: 'as_today', sign_on: TODAY }),
    ],
  });
  assert.equal(p.inserts.length, 0);
  assert.deepEqual(p.skipped.map(s => s.reason), ['not_future', 'not_future']);
});

test('brand comes from the ship index, not a guess', () => {
  const p = plan({ assignments: [asg({ vessel_name: 'Serenade', sc: 'SC-5' })] });
  assert.equal(p.inserts[0].brand, 'Royal Caribbean');
  assert.equal(p.inserts[0].ship_short, 'Serenade');
});

test('a missing sign_on is skipped', () => {
  const p = plan({ assignments: [asg({ sign_on: null })] });
  assert.equal(p.skipped[0].reason, 'no_sign_on');
});

test('an open-ended leg (no planned sign-off) is allowed', () => {
  const p = plan({ assignments: [asg({ planned_sign_off: null })] });
  assert.equal(p.inserts.length, 1);
  assert.equal(p.inserts[0].off_date, null);
});

test('duplicate assignment ids are collapsed, not double-written', () => {
  const p = plan({ assignments: [asg(), asg()] });
  assert.equal(p.inserts.length, 1);
  assert.equal(p.skipped[0].reason, 'duplicate_assignment_id');
});

test('a bad `today` throws rather than silently projecting everything', () => {
  assert.throws(() => planProjection({ today: 'not-a-date' }), /YYYY-MM-DD/);
});
