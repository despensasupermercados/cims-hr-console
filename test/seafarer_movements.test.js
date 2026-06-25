import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeMovements, buildSeafarerMovementEmail, monthsLabel } from '../src/seafarer_movements.js';

const RUN = '2026-06-29'; // a Monday; window 29 Jun .. 06 Jul

const crew = [
  { agency_id: 'SC-1', name: 'Cruz, Juan',  ship: 'Symphony',  embark: 'Miami',    disembark: '', signOn: '2026-07-02', signOff: '2026-10-02', contracts: 0 }, // arriving, new hire, 3mo
  { agency_id: 'SC-2', name: 'Reyes, Ana',  ship: 'Allure',    embark: '',         disembark: 'Barcelona', signOn: '2025-12-01', signOff: '2026-07-04', contracts: 3 }, // departing
  { agency_id: 'SC-3', name: 'Lim, Pedro',  ship: 'Jewel',     embark: 'Tampa',    disembark: '', signOn: '2026-08-15', signOff: '2026-12-15', contracts: 2 }, // out of window
  { agency_id: 'SC-4', name: 'Tan, Mia',    ship: 'Oasis',     embark: 'Cape Liberty', disembark: 'Cape Liberty', signOn: '2026-06-29', signOff: '2026-06-30', contracts: 5 }, // on AND off same window
];

test('shapeMovements: window + fields', () => {
  const { signOns, signOffs } = shapeMovements(crew, RUN);
  const onNames = signOns.map(p => p.name).sort();
  assert.deepEqual(onNames, ['Cruz, Juan', 'Tan, Mia']); // SC-3 excluded (Aug)
  const offNames = signOffs.map(p => p.name).sort();
  assert.deepEqual(offNames, ['Reyes, Ana', 'Tan, Mia']);
});

test('shapeMovements: newHire = zero full contracts; ports + contract label', () => {
  const { signOns } = shapeMovements(crew, RUN);
  const juan = signOns.find(p => p.name === 'Cruz, Juan');
  assert.equal(juan.newHire, true);
  assert.equal(juan.port, 'Miami');
  assert.equal(juan.contract, '3 months');
  const mia = signOns.find(p => p.name === 'Tan, Mia');
  assert.equal(mia.newHire, false); // 5 contracts
});

test('shapeMovements: missing port -> TBA', () => {
  const { signOffs } = shapeMovements([{ agency_id:'X', name:'No Port', ship:'Quest', signOff:'2026-07-01' }], RUN);
  assert.equal(signOffs[0].port, 'TBA');
});

test('monthsLabel', () => {
  assert.equal(monthsLabel('2026-07-02','2026-10-02'), '3 months');
  assert.equal(monthsLabel('2026-07-02','2026-08-01'), '1 month');
  assert.equal(monthsLabel('2026-07-02', null), '—');
  assert.equal(monthsLabel('2026-07-02','2026-07-01'), '—');
});

test('buildSeafarerMovementEmail: renders rows, badge, footer, window', () => {
  const { signOns, signOffs } = shapeMovements(crew, RUN);
  const html = buildSeafarerMovementEmail({ runDate: RUN, signOns, signOffs });
  assert.match(html, /Cruz, Juan/);
  assert.match(html, /New hire/);
  assert.match(html, /Reyes, Ana/);
  assert.match(html, /07:00 Miami time/);
  assert.match(html, /29 Jun – 06 Jul 2026/);
  assert.doesNotMatch(html, /Lim, Pedro/); // out of window
  assert.doesNotMatch(html, /08:00 Miami time/);
});

test('buildSeafarerMovementEmail: empty states', () => {
  const html = buildSeafarerMovementEmail({ runDate: RUN, signOns: [], signOffs: [] });
  assert.match(html, /No sign-ons scheduled/);
  assert.match(html, /No sign-offs scheduled/);
});
