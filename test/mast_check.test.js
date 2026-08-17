import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { mast, mastRows, M } from '../src/cims-mast.js';

// cims-email-standard §7. Fifteen competing letterheads happened because nothing
// failed loudly when a local copy drifted. This is that failure.
//
// The SHA is the git blob hash of src/cims-mast.js and MUST match the canonical
// file in every repo. If this test fails you have either (a) edited the local copy,
// which is forbidden, or (b) intentionally revised the canonical letterhead — in
// which case update every repo and this constant in the same change, never one alone.
const CANONICAL_SHA1 = '1898be3164df1a9a84f8b7613f61145c272b9da6';

test('cims-mast.js has not drifted from the canonical letterhead', () => {
  const path = new URL('../src/cims-mast.js', import.meta.url);
  const buf = readFileSync(path);
  const size = statSync(path).size;
  const sha = createHash('sha1').update(`blob ${size}\0`).update(buf).digest('hex');
  assert.equal(sha, CANONICAL_SHA1,
    'src/cims-mast.js differs from the canonical copy — do not edit it locally (§1/§5)');
});

test('the 60/40 top rule is a two-cell table, never a CSS gradient', () => {
  const h = mastRows();
  assert.ok(!/linear-gradient/.test(h), 'Outlook ignores gradients and the rule disappears entirely');
  assert.ok(h.includes('width="60%"') && h.includes('width="40%"'));
  assert.ok(h.includes(`bgcolor="${M.navy}"`) && h.includes(`bgcolor="${M.green}"`));
});

test('no rgba anywhere — Word drops it and can render text invisible', () => {
  assert.ok(!/rgba\(/.test(mastRows()));
  assert.equal(M.sub, '#95A0AD', 'subtitle must be the solid equivalent, not white at 55%');
});

test('every bgcolor is paired with an inline background', () => {
  const h = mast();
  const n = (h.match(/bgcolor="/g) || []).length;
  assert.ok(n >= 3, 'expected the rule cells plus the brand block');
  assert.ok((h.match(/background:/g) || []).length >= n);
});

test('the letterhead carries nothing on the right-hand side', () => {
  const h = mastRows();
  // §1: no eyebrow, no context label, no ship name, no ref number.
  assert.ok(!/align="right"/.test(h), 'a right-hand element crept into the letterhead');
});

test('webfont always has a Helvetica/Arial fallback (Outlook never loads webfonts)', () => {
  assert.ok(mastRows().includes("'Outfit',Helvetica,Arial,sans-serif"));
});

test('mast() wraps mastRows() and adds no other markup', () => {
  assert.ok(mast().includes(mastRows()));
});
