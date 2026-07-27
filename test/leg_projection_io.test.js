import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectFutureLegs } from '../src/leg_projection.js';

// The pure planner is covered in leg_projection.test.js. THIS file covers the half
// that unit tests usually miss and a live DB would only reveal after it had already
// written bad rows: the SQL layer. A mismatch between an INSERT's column list and
// its .bind() argument order is silent — SQLite happily stores ship names in the sc
// column — so every statement is asserted for placeholder/arg arity and, for the
// INSERT, for column-to-value mapping.

// Recording D1 stub. Captures (sql, args) per prepared statement and the batch.
function stubEnv({ assignments = [], ships = [], existing = [] } = {}) {
  const calls = [];
  const batches = [];
  const env = {
    DB: {
      prepare(sql) {
        const rec = { sql: sql.replace(/\s+/g, ' ').trim(), args: null };
        return {
          bind(...args) { rec.args = args; calls.push(rec); return this; },
          async all() {
            if (rec.args === null) calls.push(rec);
            if (/FROM assignment/i.test(rec.sql)) return { results: assignments };
            if (/DISTINCT brand, ship_short/i.test(rec.sql)) return { results: ships };
            if (/FROM ship_leg/i.test(rec.sql)) return { results: existing };
            return { results: [] };
          },
        };
      },
      async batch(stmts) { batches.push(stmts); return stmts.map(() => ({ success: true })); },
    },
  };
  return { env, calls, batches };
}

const ASG = {
  id: 'as_1', vessel_name: 'Quest', sign_on: '2026-07-29', planned_sign_off: '2026-12-15',
  on_port_seed: 'SAN JUAN', off_port_seed: 'MIAMI', on_date_conf: 1, off_date_conf: 0,
  sc: 'SC-0038328', crew_id: 'crew_SC_0038328',
};
const SHIPS = [{ brand: 'Azamara', ship_short: 'Quest' }];

const writes = calls => calls.filter(c => /^(INSERT|UPDATE|DELETE)/i.test(c.sql));

test('every prepared statement binds exactly as many args as it has placeholders', async () => {
  const { env, calls } = stubEnv({ assignments: [ASG], ships: SHIPS });
  await projectFutureLegs(env, { today: '2026-07-27' });
  assert.ok(calls.length > 0, 'no statements were prepared');
  for (const c of calls) {
    if (c.args === null) continue; // prepare().all() with no bind
    const placeholders = (c.sql.match(/\?/g) || []).length;
    assert.equal(
      c.args.length, placeholders,
      `arity mismatch — ${placeholders} placeholders vs ${c.args.length} bound args:\n  ${c.sql}`
    );
  }
});

test('INSERT maps every column to the right value (the silent-corruption case)', async () => {
  const { env, calls } = stubEnv({ assignments: [ASG], ships: SHIPS });
  await projectFutureLegs(env, { today: '2026-07-27' });

  const ins = writes(calls).find(c => /^INSERT INTO ship_leg/i.test(c.sql));
  assert.ok(ins, 'no INSERT was produced for a valid future assignment');

  // Parse the declared column list, drop the ones filled by literals in VALUES.
  const cols = ins.sql.match(/INSERT INTO ship_leg \(([^)]+)\)/i)[1]
    .split(',').map(s => s.trim());
  const vals = ins.sql.match(/VALUES \(([^)]+)\)/i)[1].split(',').map(s => s.trim());
  assert.equal(cols.length, vals.length, 'column list and VALUES list differ in length');

  const bound = {};
  let i = 0;
  cols.forEach((col, n) => { if (vals[n] === '?') bound[col] = ins.args[i++]; });

  assert.equal(bound.brand, 'Azamara');
  assert.equal(bound.ship_short, 'Quest');
  assert.equal(bound.sc, 'SC-0038328');
  assert.equal(bound.crew_id, 'crew_SC_0038328');
  assert.equal(bound.on_date, '2026-07-29');
  assert.equal(bound.off_date, '2026-12-15');
  assert.equal(bound.embark, 'SAN JUAN');
  assert.equal(bound.disembark, 'MIAMI');
  assert.equal(bound.on_conf, 1);
  assert.equal(bound.off_conf, 0);
  assert.equal(bound.source, 'assignment:as_1');

  // is_current and ours are literals, never bound — that is the whole safety argument.
  assert.equal(vals[cols.indexOf('is_current')], '0');
  assert.equal(vals[cols.indexOf('ours')], '1');
});

test('UPDATE binds the WHERE source last, not into a SET column', async () => {
  const persisted = [{
    id: 9, source: 'assignment:as_1', brand: 'Azamara', ship_short: 'Quest',
    sc: 'SC-0038328', crew_id: 'crew_SC_0038328', on_date: '2026-07-29',
    off_date: '2026-11-11', embark: 'SAN JUAN', disembark: 'MIAMI',
    on_conf: 1, off_conf: 0, is_current: 0,
  }];
  const { env, calls } = stubEnv({ assignments: [ASG], ships: SHIPS, existing: persisted });
  await projectFutureLegs(env, { today: '2026-07-27' });

  const upd = writes(calls).find(c => /^UPDATE ship_leg/i.test(c.sql));
  assert.ok(upd, 'a changed off_date should produce an UPDATE');
  // last bound arg belongs to `WHERE source=?`
  assert.equal(upd.args[upd.args.length - 1], 'assignment:as_1');
  // the new off_date must actually be in the payload
  assert.ok(upd.args.includes('2026-12-15'), 'the corrected off_date was not bound');
  assert.match(upd.sql, /WHERE source=\? AND source LIKE 'assignment:%' AND is_current=0/);
});

test('DELETE targets only the stale projected source', async () => {
  const persisted = [{
    id: 9, source: 'assignment:as_gone', brand: 'Azamara', ship_short: 'Quest',
    sc: 'SC-9', crew_id: 'c9', on_date: '2026-09-09', off_date: null,
    embark: null, disembark: null, on_conf: 0, off_conf: 0, is_current: 0,
  }, {
    id: 10, source: 'keyman_roster', brand: 'Azamara', ship_short: 'Quest',
    sc: 'SC-ORPHAN', crew_id: 'cx', on_date: '2026-02-01', off_date: '2026-09-01',
    embark: null, disembark: null, on_conf: 0, off_conf: 0, is_current: 1,
  }];
  const { env, calls } = stubEnv({ assignments: [], ships: SHIPS, existing: persisted });
  const report = await projectFutureLegs(env, { today: '2026-07-27' });

  const dels = writes(calls).filter(c => /^DELETE FROM ship_leg/i.test(c.sql));
  assert.equal(dels.length, 1, 'exactly one stale projected row should be deleted');
  assert.deepEqual(dels[0].args, ['assignment:as_gone']);
  assert.equal(report.deleted, 1);
  // the keyman_roster orphan is never referenced by any write
  for (const c of writes(calls)) {
    assert.ok(!(c.args || []).includes('keyman_roster'), 'a write referenced a keyman_roster row');
  }
});

test('one batch, containing every write, and nothing when there is nothing to do', async () => {
  const b1 = stubEnv({ assignments: [ASG], ships: SHIPS });
  await projectFutureLegs(b1.env, { today: '2026-07-27' });
  assert.equal(b1.batches.length, 1, 'writes must go out as a single atomic batch');
  assert.equal(b1.batches[0].length, 1);

  const b2 = stubEnv({ assignments: [], ships: SHIPS });
  const rep = await projectFutureLegs(b2.env, { today: '2026-07-27' });
  assert.equal(b2.batches.length, 0, 'no batch should be issued when the plan is empty');
  assert.deepEqual([rep.inserted, rep.updated, rep.deleted], [0, 0, 0]);
});

test('dryRun plans but writes nothing', async () => {
  const { env, calls, batches } = stubEnv({ assignments: [ASG], ships: SHIPS });
  const report = await projectFutureLegs(env, { today: '2026-07-27', dryRun: true });
  assert.equal(report.dryRun, true);
  assert.equal(report.inserted, 1);
  assert.equal(batches.length, 0, 'dryRun issued a batch');
  assert.equal(writes(calls).length, 0, 'dryRun prepared a write statement');
});

test('the forward-assignment query is bound to today and excludes closed legs', async () => {
  const { env, calls } = stubEnv({ assignments: [ASG], ships: SHIPS });
  await projectFutureLegs(env, { today: '2026-07-27' });
  const q = calls.find(c => /FROM assignment/i.test(c.sql));
  assert.ok(q, 'the assignment query was never prepared');
  assert.deepEqual(q.args, ['2026-07-27']);
  assert.match(q.sql, /a\.actual_sign_off IS NULL/);
  assert.match(q.sql, /a\.sign_on > \?/);
});

test('a bad today throws before any statement is prepared', async () => {
  const { env, calls } = stubEnv({ assignments: [ASG], ships: SHIPS });
  await assert.rejects(() => projectFutureLegs(env, { today: 'nope' }), /YYYY-MM-DD/);
  assert.equal(calls.length, 0, 'statements were prepared before validating the date');
});
