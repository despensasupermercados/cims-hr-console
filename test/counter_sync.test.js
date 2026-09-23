// counter_sync.js — what a Contract Counter upload does to a board Rita has been working on.
// Every rule here is one Miguel stated on 14 Sep 2026; the comments name which.
import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, indexEdits, editFor, resolveLeg, diffCounter, ABSORB_DAYS } from "../src/counter_sync.js";

test("daysBetween: whole days, signed, null on anything that is not a date", () => {
  assert.equal(daysBetween("2026-09-01", "2026-09-08"), 7);
  assert.equal(daysBetween("2026-09-08", "2026-09-01"), -7);
  assert.equal(daysBetween("2026-09-01", "2026-09-01"), 0);
  assert.equal(daysBetween("2026-09-01T00:00:00Z", "2026-09-03"), 2, "a timestamp is read as its date");
  for (const bad of [null, "", "TBA", undefined]) assert.equal(daysBetween("2026-09-01", bad), null);
});

/* ---- Rita's edits belong to a contract, not to a position in the file ---- */

test("editFor: the SIGN-ON key wins over the position, so a renumbered file cannot reattach an edit", () => {
  const idx = indexEdits([
    { sc: "SC-1", seq: 1, on_key: "2026-03-08", sign_off: "2026-09-20", updated_at: "2026-09-12T10:00:00Z" },
    { sc: "SC-2", seq: 1, on_key: null, sign_off: "2026-08-01", updated_at: "2026-09-01T10:00:00Z" },
  ]);
  // The same contract now arrives as seq 4 of a multi-block file: the edit still finds it.
  assert.equal(editFor({ sc: "SC-1", seq: 4, sign_on: "2026-03-08" }, idx).sign_off, "2026-09-20");
  // A DIFFERENT contract that happens to land on seq 1 must NOT pick it up.
  assert.equal(editFor({ sc: "SC-1", seq: 1, sign_on: "2024-01-01" }, idx), null,
    "an edit reattached by position is how 31 recorded sign-offs would move to a 2024 contract");
  // A row written before on_key existed still resolves by position.
  assert.equal(editFor({ sc: "SC-2", seq: 1, sign_on: "2026-05-01" }, idx).sign_off, "2026-08-01");
  assert.equal(editFor(null, idx), null);
  assert.equal(editFor({ sc: "SC-9", seq: 1, sign_on: "2026-01-01" }, idx), null);
});

/* ---- the newer write wins, and the card names its source ---- */

const LEG = { sign_on: "2026-03-08", proj_off: "2026-09-14", act_off: null, ship: "Icon" };

test("no edit: the Counter is the source", () => {
  const r = resolveLeg({ ...LEG, imported_at: "2026-09-20" }, null);
  assert.deepEqual(r, { signOn: "2026-03-08", signOff: "2026-09-14", ship: "Icon", source: "counter", sourceAt: "2026-09-20", overridden: false });
});

test("Rita edited after the file was imported: her date wins and is named", () => {
  const r = resolveLeg({ ...LEG, imported_at: "2026-09-10" }, { sign_off: "2026-09-30", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(r.signOff, "2026-09-30");
  assert.equal(r.source, "rita");
  assert.equal(r.sourceAt, "2026-09-12");
  assert.equal(r.overridden, false);
});

test("a NEWER Counter overwrites Rita's date and says so — the rule that changed on 14 Sep", () => {
  const r = resolveLeg({ ...LEG, imported_at: "2026-09-20" }, { sign_off: "2026-09-30", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(r.signOff, "2026-09-14", "the file is the newer write");
  assert.equal(r.source, "counter");
  assert.equal(r.overridden, true, "the card has to show that an edit was replaced");
});

test("a leg with no imported_at keeps TODAY's behaviour: Rita wins, nothing moves at the cutover", () => {
  const r = resolveLeg({ ...LEG, imported_at: null }, { sign_off: "2026-09-30", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(r.signOff, "2026-09-30");
  assert.equal(r.source, "rita");
});

test("a blank edit field never wins: blank means 'not set', not 'make it empty'", () => {
  const r = resolveLeg({ ...LEG, imported_at: "2026-09-01" }, { sign_off: "", sign_on: null, ship: "", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(r.signOff, "2026-09-14");
  assert.equal(r.signOn, "2026-03-08");
  assert.equal(r.ship, "Icon");
  assert.equal(r.source, "counter");
});

test("an actual sign-off in the Counter beats its own projection", () => {
  assert.equal(resolveLeg({ ...LEG, act_off: "2026-08-30" }, null).signOff, "2026-08-30");
});

test("Rita's value fills a gap the Counter leaves, whoever is newer", () => {
  const r = resolveLeg({ sign_on: "2026-03-08", proj_off: null, ship: "Icon", imported_at: "2026-09-20" }, { sign_off: "2026-10-01", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(r.signOff, "2026-10-01", "nothing to beat");
  assert.equal(r.source, "rita");
});

/* ---- what an upload would do to the board ---- */

const yellow = (o = {}) => ({ id: "as_1", sc: "SC-9", crew_name: "Jumper J", ship: "Icon", sign_on: "2026-10-05", planned_sign_off: "2027-04-05", ...o });

test("ABSORB: the file carries the projection, same ship, within a week — the loop closes", () => {
  const d = diffCounter({
    incoming: [{ sc: "SC-9", ship: "Icon", seq: 1, sign_on: "2026-10-02", proj_off: "2027-04-02" }],
    current: [], yellows: [yellow()], edits: [],
  });
  assert.equal(d.absorbs.length, 1);
  assert.equal(d.conflicts.length, 0);
  assert.equal(d.absorbs[0].id, "as_1");
  assert.equal(d.absorbs[0].gap_days, -3);
  assert.equal(d.appears.length, 1, "and the crew gains a green leg");
});

test("ABSORB boundary: exactly ABSORB_DAYS absorbs, one day more is a conflict Rita settles", () => {
  const at = (n) => diffCounter({ incoming: [{ sc: "SC-9", ship: "Icon", seq: 1, sign_on: "2026-10-05", proj_off: "2027-04-05" }], current: [], yellows: [yellow({ sign_on: "2026-10-05" })].map((y) => ({ ...y, sign_on: new Date(Date.parse("2026-10-05T00:00:00Z") + n * 86400000).toISOString().slice(0, 10) })), edits: [] });
  assert.equal(at(ABSORB_DAYS).absorbs.length, 1);
  assert.equal(at(-ABSORB_DAYS).absorbs.length, 1);
  assert.equal(at(ABSORB_DAYS + 1).conflicts[0].why, "dates");
});

test("CONFLICT: the file puts that crew on another ship — Rita decides, nothing is applied", () => {
  const d = diffCounter({
    incoming: [{ sc: "SC-9", ship: "Oasis", seq: 1, sign_on: "2026-10-05", proj_off: "2027-04-05" }],
    current: [], yellows: [yellow()], edits: [],
  });
  assert.equal(d.absorbs.length, 0);
  assert.equal(d.conflicts.length, 1);
  assert.equal(d.conflicts[0].why, "ship");
  assert.equal(d.conflicts[0].card.ship, "Icon");
  assert.equal(d.conflicts[0].counter.ship, "Oasis");
});

test("a yellow card for a crew the file does not mention is left alone", () => {
  const d = diffCounter({ incoming: [{ sc: "SC-1", ship: "Icon", seq: 1, sign_on: "2026-10-05" }], current: [], yellows: [yellow()], edits: [] });
  assert.deepEqual([d.absorbs.length, d.conflicts.length], [0, 0]);
});

test("appears / moved / leaves describe the board change in Rita's terms", () => {
  const d = diffCounter({
    incoming: [
      { sc: "SC-1", ship: "Icon", seq: 1, sign_on: "2026-03-08", proj_off: "2026-09-14" },   // unchanged
      { sc: "SC-2", ship: "Oasis", seq: 1, sign_on: "2026-04-01", proj_off: "2026-10-01" },  // moved ship
      { sc: "SC-3", ship: "Edge", seq: 1, sign_on: "2026-05-18", proj_off: "2026-11-18" },   // new
    ],
    current: [
      { sc: "SC-1", ship: "Icon", sign_on: "2026-03-08", proj_off: "2026-09-14" },
      { sc: "SC-2", ship: "Quest", sign_on: "2026-04-01", proj_off: "2026-10-01" },
      { sc: "SC-4", ship: "Vision", sign_on: "2026-01-01", proj_off: "2026-07-01" },          // not in the file
    ],
    yellows: [], edits: [],
  });
  assert.deepEqual(d.appears.map((x) => x.sc), ["SC-3"]);
  assert.deepEqual(d.moved.map((x) => x.sc), ["SC-2"]);
  assert.equal(d.moved[0].shipChanged, true);
  assert.equal(d.moved[0].onChanged, false);
  assert.deepEqual(d.leaves.map((x) => x.sc), ["SC-4"]);
  assert.equal(d.moved[0].from.ship, "Quest");
  assert.equal(d.moved[0].to.ship, "Oasis");
});

test("the LATEST contract is the one compared, not the first block in the file", () => {
  const d = diffCounter({
    incoming: [
      { sc: "SC-1", ship: "Quest", seq: 1, sign_on: "2024-01-01", proj_off: "2024-07-01" },
      { sc: "SC-1", ship: "Icon", seq: 2, sign_on: "2026-03-08", proj_off: "2026-09-14" },
    ],
    current: [{ sc: "SC-1", ship: "Icon", sign_on: "2026-03-08", proj_off: "2026-09-14" }],
    yellows: [], edits: [],
  });
  assert.deepEqual([d.appears.length, d.moved.length, d.leaves.length], [0, 0, 0],
    "a file that adds history without changing the current contract changes nothing on the board");
});

test("OVERRIDES: every Rita edit the file would overwrite is listed before Apply", () => {
  const d = diffCounter({
    incoming: [{ sc: "SC-1", ship: "Icon", seq: 3, sign_on: "2026-03-08", proj_off: "2026-09-14" }],
    current: [], yellows: [],
    edits: [{ sc: "SC-1", seq: 1, on_key: "2026-03-08", sign_off: "2026-09-30", updated_at: "2026-09-12T08:00:00Z" }],
  });
  assert.equal(d.overrides.length, 1);
  assert.equal(d.overrides[0].rita.sign_off, "2026-09-30");
  assert.equal(d.overrides[0].counter.sign_off, "2026-09-14");
  assert.equal(d.overrides[0].on_key, "2026-03-08");
});

test("an edit the file agrees with is not reported as an override", () => {
  const d = diffCounter({
    incoming: [{ sc: "SC-1", ship: "Icon", seq: 1, sign_on: "2026-03-08", proj_off: "2026-09-30" }],
    current: [], yellows: [],
    edits: [{ sc: "SC-1", seq: 1, on_key: "2026-03-08", sign_off: "2026-09-30", updated_at: "2026-09-12T08:00:00Z" }],
  });
  assert.equal(d.overrides.length, 0);
});

test("ORPHANS: an edit whose contract the file no longer carries is surfaced, never silently dropped", () => {
  const d = diffCounter({
    incoming: [{ sc: "SC-1", ship: "Icon", seq: 1, sign_on: "2026-03-08", proj_off: "2026-09-14" }],
    current: [], yellows: [],
    edits: [{ sc: "SC-1", seq: 1, on_key: "2025-01-01", sign_off: "2025-07-01", updated_at: "2026-09-12T08:00:00Z" }],
  });
  assert.equal(d.orphans.length, 1);
  assert.equal(d.orphans[0].on_key, "2025-01-01");
});

test("an edit for a crew the file does not carry is untouched — apply refreshes matched crew only", () => {
  const d = diffCounter({
    incoming: [{ sc: "SC-1", ship: "Icon", seq: 1, sign_on: "2026-03-08" }],
    current: [], yellows: [],
    edits: [{ sc: "SC-OTHER", seq: 1, on_key: "2020-01-01", sign_off: "2020-07-01", updated_at: "2026-09-12T08:00:00Z" }],
  });
  assert.deepEqual([d.overrides.length, d.orphans.length], [0, 0]);
});

test("an empty upload changes nothing and reports nothing", () => {
  const d = diffCounter({});
  for (const k of ["appears", "leaves", "moved", "absorbs", "conflicts", "overrides", "orphans"]) assert.deepEqual(d[k], [], k);
});

/* ---- review, 14 Sep 2026: defects found reading the diff, each pinned so it fails on the old code ---- */

test("a Counter that has NOT moved for a crew says nothing about their next projection — no conflict, no absorb", () => {
  const cur = [{ sc: "SC-9", ship: "Icon", sign_on: "2026-03-08", proj_off: "2026-09-14", act_off: null, seq: 1 }];
  const d = diffCounter({
    incoming: [{ sc: "SC-9", ship: "Icon", seq: 1, sign_on: "2026-03-08", proj_off: "2026-09-14" }],   // unchanged
    current: cur,
    yellows: [yellow({ ship: "Oasis", sign_on: "2026-11-02" })],                                          // her plan for his NEXT hull
    edits: [],
  });
  assert.deepEqual([d.absorbs.length, d.conflicts.length], [0, 0],
    "an unchanged Counter row must not be read as contradicting a future projection");
  // The moment the file DOES move him — to another ship than she planned — that is a conflict.
  const moved = diffCounter({
    incoming: [{ sc: "SC-9", ship: "Jewel", seq: 2, sign_on: "2026-11-05", proj_off: "2027-05-05" }],
    current: cur, yellows: [yellow({ ship: "Oasis", sign_on: "2026-11-02" })], edits: [],
  });
  assert.equal(moved.conflicts.length, 1);
  assert.equal(moved.conflicts[0].why, "ship");
  // ...and to the ship she planned, near her date — the loop closes.
  const closed = diffCounter({
    incoming: [{ sc: "SC-9", ship: "Oasis", seq: 2, sign_on: "2026-11-05", proj_off: "2027-05-05" }],
    current: cur, yellows: [yellow({ ship: "Oasis", sign_on: "2026-11-02" })], edits: [],
  });
  assert.equal(closed.absorbs.length, 1);
});

test("overridden is FALSE when the newer Counter agrees with Rita, or has nothing to replace hers with", () => {
  const agree = resolveLeg({ ...LEG, imported_at: "2026-09-20" }, { sign_off: "2026-09-14", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(agree.overridden, false, "same date on both sides: nothing was replaced");
  const gap = resolveLeg({ sign_on: "2026-03-08", proj_off: null, ship: "Icon", imported_at: "2026-09-20" }, { sign_off: "2026-10-01", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(gap.signOff, "2026-10-01", "the Counter has no sign-off, so Rita's stands");
  assert.equal(gap.source, "rita");
  assert.equal(gap.overridden, false, "a card must not say TDG replaced a date it never had");
  const real = resolveLeg({ ...LEG, imported_at: "2026-09-20" }, { sign_off: "2026-09-30", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(real.overridden, true, "different date, file newer: this one really was replaced");
});

test("a card names the FILE when both sides say the same thing — agreement is not an override", () => {
  // 23 Sep 2026. The mirror of Rita's question: the console used to label a date "Rita" whenever her
  // edit happened to match the Counter, even when the file was the newer write. Nothing was
  // overridden, so nothing is attributed to her.
  const agree = resolveLeg({ ...LEG, imported_at: "2026-09-20" }, { sign_on: "2026-03-08", sign_off: "2026-09-14", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(agree.signOff, "2026-09-14");
  assert.equal(agree.source, "counter", "identical values: the upstream file is the source");
  assert.equal(agree.overridden, false);
  // She still wins where she actually differs and her write is newer.
  const differs = resolveLeg({ ...LEG, imported_at: null }, { sign_off: "2026-09-25", updated_at: "2026-07-14T10:33:13.054Z" });
  assert.equal(differs.signOff, "2026-09-25");
  assert.equal(differs.source, "rita");
  // ...and where the Counter simply has no value of its own.
  const gap = resolveLeg({ sign_on: "2026-03-08", proj_off: null, ship: "Icon", imported_at: "2026-09-20" }, { sign_off: "2026-10-01", updated_at: "2026-09-12T08:00:00Z" });
  assert.equal(gap.source, "rita", "nothing to agree with: the date is hers");
});
