import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotateReliefCoverage } from '../src/relief_coverage.js';

// Minimal D1 stub: env.DB.prepare(sql).bind(...).all() -> { results }
function stubEnv(rows) {
  return {
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async all() { return { results: rows }; },
        };
      },
    },
  };
}

test('confirmed reliever (on board) within window', async () => {
  const env = stubEnv([{ ship: 'Jewel', signon: '2026-07-20', reliever: 'Cherry Gayda', status: 'On board', aboard_ship: 'MV JEWEL OF THE SEAS' }]);
  const offs = await annotateReliefCoverage(env, [{ name: 'De Torres', vessel: 'Jewel', date: '2026-07-20' }]);
  assert.equal(offs[0].relief.state, 'confirmed');
  assert.equal(offs[0].relief.reliever, 'Cherry Gayda');
});

test('planned reliever (earmarked) -> unconfirmed', async () => {
  const env = stubEnv([{ ship: 'Independence', signon: '2026-07-02', reliever: 'Mark Bornea', status: 'Earmarked' }]);
  const offs = await annotateReliefCoverage(env, [{ name: 'Magana', vessel: 'Independence', date: '2026-07-16' }]);
  assert.equal(offs[0].relief.state, 'planned');
});

test('no reliever in system -> none', async () => {
  const env = stubEnv([]);
  const offs = await annotateReliefCoverage(env, [{ name: 'Noche', vessel: 'Summit', date: '2026-07-17' }]);
  assert.equal(offs[0].relief.state, 'none');
});

test('reliever on a different ship does not match', async () => {
  const env = stubEnv([{ ship: 'Jewel', signon: '2026-07-18', reliever: 'X', status: 'On board' }]);
  const offs = await annotateReliefCoverage(env, [{ name: 'Noche', vessel: 'Summit', date: '2026-07-17' }]);
  assert.equal(offs[0].relief.state, 'none');
});

test('reliever outside +/-30 days does not match', async () => {
  const env = stubEnv([{ ship: 'Summit', signon: '2026-09-30', reliever: 'Late Guy', status: 'On board' }]);
  const offs = await annotateReliefCoverage(env, [{ name: 'Noche', vessel: 'Summit', date: '2026-07-17' }]);
  assert.equal(offs[0].relief.state, 'none');
});

test('confirmed preferred over planned when both exist', async () => {
  const env = stubEnv([
    { ship: 'Summit', signon: '2026-07-18', reliever: 'Planned Guy', status: 'Earmarked' },
    { ship: 'Summit', signon: '2026-07-25', reliever: 'Onboard Guy', status: 'On board', aboard_ship: 'Celebrity Summit' },
  ]);
  const offs = await annotateReliefCoverage(env, [{ name: 'Noche', vessel: 'Summit', date: '2026-07-17' }]);
  assert.equal(offs[0].relief.state, 'confirmed');
  assert.equal(offs[0].relief.reliever, 'Onboard Guy');
});

// 8 Oct 2026: "On board" ANYWHERE read as confirmed — Guazon aboard Liberty and earmarked for Allure was "Relief
// confirmed" on Allure. Confirmed now means On board THIS ship per the TDG file.
test('a reliever On board ANOTHER ship is planned, not confirmed', async () => {
  const env = stubEnv([{ ship: 'Allure', signon: '2026-11-29', reliever: 'Edward Guazon', status: 'On board', aboard_ship: 'MV LIBERTY OF THE SEAS' }]);
  const offs = await annotateReliefCoverage(env, [{ name: 'Gorre', vessel: 'Allure', date: '2026-11-29' }]);
  assert.equal(offs[0].relief.state, 'planned');
  assert.equal(offs[0].relief.reliever, 'Edward Guazon');
});

test('DB failure degrades to unknown, never throws', async () => {
  const env = { DB: { prepare() { return { bind() { return this; }, async all() { throw new Error('boom'); } }; } } };
  const offs = await annotateReliefCoverage(env, [{ name: 'Noche', vessel: 'Summit', date: '2026-07-17' }]);
  assert.equal(offs[0].relief.state, 'unknown');
});
