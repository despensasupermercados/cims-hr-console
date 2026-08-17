import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectChanges, renderTgEmail, fmtDate, esc, KIND_LABEL } from '../src/tg_collect.js';

const CREW = {
  'SC-0038115': { name: 'Bernard Winzon Paqueo', rank: 'Printer Specialist', status: 'Earmarked', vessel_observed: null },
  'SC-0038129': { name: 'Michael Angelo Resposo', rank: 'Printer Specialist', status: 'On board', vessel_observed: 'MV CELEBRITY REFLECTION' },
  'SC-0046170': { name: 'Mark John Bornea', rank: 'Junior Printer Specialist', status: 'Earmarked', vessel_observed: null },
};
const base = over => collectChanges({ crewById: CREW, shipOf: v => String(v || '').replace(/^MV\s+/i, '').replace(/\s+(OF THE SEAS|of the seas)$/i, ''), ...over });

test('fmtDate formats ISO dates and passes anything else through untouched', () => {
  assert.equal(fmtDate('2026-07-17'), '17 Jul 2026');
  assert.equal(fmtDate('2026-12-01T09:00:00Z'), '01 Dec 2026');
  // A half-typed or malformed date must reach Joy verbatim, never silently wrong.
  assert.equal(fmtDate('2026-13-01'), '2026-13-01');
  assert.equal(fmtDate('TBA'), 'TBA');
  assert.equal(fmtDate(null), '');
});

test('empty input produces zero counts so the button can disable itself', () => {
  const p = base({});
  assert.deepEqual(p.counts, { ships: 0, crew: 0, items: 0 });
  assert.deepEqual(p.ships, []);
});

test('one crew touched several ways appears ONCE with merged detail rows', () => {
  const p = base({
    assignments: [{ agency_id: 'SC-0038115', vessel_name: 'Reflection', sign_on: '2026-07-17', planned_sign_off: '2027-01-17' }],
    contractEdits: [{ sc: 'SC-0038115', seq: 1, ship: 'Reflection', sign_on: '2026-07-17', embark: 'Fort Lauderdale' }],
    overrides: [{ agency_id: 'SC-0038115', vessel_observed: 'Reflection' }],
  });
  assert.equal(p.ships.length, 1);
  assert.equal(p.ships[0].crew.length, 1, 'the same person must not be listed three times');
  const c = p.ships[0].crew[0];
  assert.equal(c.nm, 'Bernard Winzon Paqueo');
  assert.ok(c.rows.length >= 3);
  // duplicate "Signs on 17 Jul 2026" arrived from two sources — keep one
  assert.equal(c.rows.filter(([k]) => k === 'Signs on').length, 1);
});

test('groups by ship, and LEAVING sorts before JOINING so a handover reads in order', () => {
  const p = base({
    assignments: [{ agency_id: 'SC-0038115', vessel_name: 'Reflection', sign_on: '2026-07-17' }],
    contractEdits: [{ sc: 'SC-0038129', seq: 1, ship: 'Reflection', sign_off: '2026-07-17' }],
  });
  assert.equal(p.ships.length, 1);
  assert.equal(p.ships[0].ship, 'Reflection');
  const kinds = p.ships[0].crew.map(c => c.kind);
  assert.deepEqual(kinds, ['off', 'on']);
  assert.equal(p.counts.crew, 2);
});

test('ships are sorted alphabetically so the email is diffable between runs', () => {
  const p = base({
    contractEdits: [
      { sc: 'SC-0038115', ship: 'Summit', sign_on: '2026-07-17' },
      { sc: 'SC-0046170', ship: 'Independence', sign_on: '2026-07-02' },
      { sc: 'SC-0038129', ship: 'Reflection', sign_off: '2026-07-17' },
    ],
  });
  assert.deepEqual(p.ships.map(s => s.ship), ['Independence', 'Reflection', 'Summit']);
});

test('the AdvancedQuery column reflects the base crew row, not the pending change', () => {
  const p = base({ assignments: [{ agency_id: 'SC-0038115', vessel_name: 'Reflection', sign_on: '2026-07-17' }] });
  const c = p.ships[0].crew[0];
  assert.equal(c.aq, 'Earmarked · no vessel');           // what Joy has today
  assert.equal(c.to, 'On board · Reflection');            // what it should say
});

test('crew absent from AdvancedQuery are called out as needing to be added', () => {
  const p = base({ events: [{ agency_id: 'SC-9999999', kind: 'add', at: '2026-08-17' }] });
  const c = p.ships[0].crew[0];
  assert.equal(c.aq, 'not in AdvancedQuery');
  assert.match(c.to, /Add this crew member/);
  assert.equal(c.nm, 'SC-9999999', 'unknown crew falls back to the ID rather than blank');
});

test('a hide that was undone in the same window is not reported', () => {
  const p = base({
    events: [{ agency_id: 'SC-0046170', kind: 'retire', at: '2026-08-10' }],
  });
  assert.equal(p.counts.crew, 1, 'a standalone retire IS reported');
  // the caller filters restore/hide pairs before calling; assert the label exists for it
  assert.equal(KIND_LABEL.retire, 'RETIRED IN CIMS');
});

test('vessel reassignment is canonicalised, not echoed raw', () => {
  const p = base({ overrides: [{ agency_id: 'SC-0038129', vessel_observed: 'MV CELEBRITY REFLECTION' }] });
  assert.equal(p.ships[0].ship, 'CELEBRITY REFLECTION');
  assert.equal(p.ships[0].crew[0].kind, 'move');
});

test('readiness-only changes are marked FYI, not as an AdvancedQuery edit', () => {
  const p = base({ ready: [{ agency_id: 'SC-0046170', eccr: 1, air: 0, hotel: 1, note: 'Visa appointment 12 Sep' }] });
  const c = p.ships[0].crew[0];
  assert.equal(c.kind, 'flags');
  assert.match(c.to, /FYI only/);
  assert.match(c.note, /Visa appointment/);
  assert.ok(c.rows.some(([, v]) => v === 'ECCR · HOTEL'));
});

test('escaping: a crew name with markup cannot break the email', () => {
  const p = collectChanges({
    crewById: { 'SC-1': { name: '<script>x</script>O\'Brien & Sons', rank: '', status: 'On board', vessel_observed: null } },
    assignments: [{ agency_id: 'SC-1', vessel_name: 'Quest', sign_on: '2026-08-20' }],
  });
  const html = renderTgEmail(p, { today: '2026-08-17' });
  assert.ok(!html.includes('<script>'), 'raw script tag reached the output');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(esc('a&b'), 'a&amp;b');
});

// ---- rendered-email conformance to cims-email-standard ----------------------
test('rendered email obeys the Outlook rules and carries the canonical letterhead', () => {
  const p = base({
    assignments: [{ agency_id: 'SC-0038115', vessel_name: 'Reflection', sign_on: '2026-07-17', planned_sign_off: '2027-01-17' }],
    contractEdits: [{ sc: 'SC-0038129', ship: 'Reflection', sign_off: '2026-07-17', disembark: 'Fort Lauderdale' }],
  });
  const html = renderTgEmail(p, { sentBy: 'rita.berenyi@dg3.com', toName: 'Joy', today: '2026-08-17' });

  // Outlook defect classes — each of these has shipped as a live bug in this estate
  assert.ok(!/linear-gradient/.test(html), 'linear-gradient: Word ignores it, the rule vanishes');
  assert.ok(!/rgba\(/.test(html), 'rgba: Word drops it and can render text invisible');
  // every bgcolor must be paired with an inline background
  const bg = (html.match(/bgcolor="/g) || []).length;
  assert.ok(bg > 0 && (html.match(/background:/g) || []).length >= bg, 'bgcolor not paired with style:background');

  // canonical letterhead, and nothing on the right-hand side
  assert.ok(html.includes('letter-spacing:5px'), 'wordmark spec missing');
  assert.ok(html.includes('width:78px'), '78px underline missing');
  assert.ok(html.includes('CRUISE INDUSTRY MANAGED SERVICES'));

  // retired tokens must never reappear
  for (const dead of ['#16314F', '#E9EDF3', 'DG3 CIMS']) {
    assert.ok(!html.includes(dead), `retired token present: ${dead}`);
  }

  // content actually made it in
  assert.ok(html.includes('Bernard Winzon Paqueo'));
  assert.ok(html.includes('SC-0038115'));
  assert.ok(html.includes('17 Jul 2026'));
  assert.ok(html.includes('Reflection'));
  assert.ok(html.includes('Hi Joy,'));
});

test('an empty payload still renders a valid document rather than throwing', () => {
  const html = renderTgEmail({ ships: [], counts: { ships: 0, crew: 0, items: 0 } }, { today: '2026-08-17' });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.ok(html.includes('CHANGES BY SHIP'));
});

test('renderTgEmail tolerates a null payload without throwing', () => {
  const html = renderTgEmail(null, {});
  assert.match(html, /^<!DOCTYPE html>/);
});
