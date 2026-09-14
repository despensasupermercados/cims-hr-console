// src/counter_sync.js
// What happens when a Contract Counter lands on a board that Rita has been working on.
//
// Miguel, 14 Sep 2026: "whats in the tdg import stay forever .. rita create projections .. and when
// she is sure .. cta is trigger to joy for action and the loop closes when u see it back in the
// keyman tab from the upload." So a Counter upload has to do three things this console never did:
//   1. ABSORB the yellow cards it now carries (the loop closing) — the projection retires by itself.
//   2. FLAG the yellow cards it contradicts — Rita decides, the console never guesses (CLAUDE.md §6).
//   3. Say which of Rita's own edits the file would overwrite, BEFORE anyone clicks Apply.
//
// Precedence, decided by Miguel the same day: the NEWER WRITE WINS between Rita's edit and the
// Counter, and the card names its source. Until now the edit won forever (the sign-off flows read
// `ovr || leg`), so a fresher TDG date could never reach the board.
//
// Pure: no IO, no dates of its own. Everything here is unit-testable and is.

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();
const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(0, 10) : null);

// Whole days between two ISO dates, or null.
export function daysBetween(a, b) {
  const x = day(a), y = day(b);
  if (!x || !y) return null;
  return Math.round((Date.parse(y + "T00:00:00Z") - Date.parse(x + "T00:00:00Z")) / 86400000);
}

// How close a projected sign-on has to be to a Counter sign-on for them to be the same contract.
// A week: TDG books the real crew-change port, Rita projects the nearest turnaround she knows.
export const ABSORB_DAYS = 7;

/* ------------------------------------------------------------------ *
 * Rita's edits: which leg an edit belongs to
 * ------------------------------------------------------------------ */
// contract_edit is keyed (sc, seq) — the crew's contract POSITION in the Counter. That only holds
// while the file keeps its shape: all 36 live edits sit on seq 1 because the 6 Jul file carried one
// block per crew, and a full multi-block Counter renumbers them, so Rita's 31 recorded sign-offs
// would silently reattach to a 2024 contract. `on_key` is the leg's SIGN-ON, which identifies the
// contract whatever position it lands in. seq stays as the fallback for rows written before the
// column existed and for a leg the file has never carried.
export function indexEdits(edits) {
  const byOn = {}, bySeq = {};
  for (const e of (edits || [])) {
    if (!e || !e.sc) continue;
    // An edit that KNOWS its contract is only ever that contract's. Leaving it in the position index
    // too is exactly the bug: a renumbered file would hand a 2024 leg the sign-off Rita recorded for
    // the current one. Position is the fallback for rows written before on_key existed.
    if (e.on_key) { byOn[e.sc + "|" + day(e.on_key)] = e; continue; }
    if (e.seq != null) bySeq[e.sc + "#" + e.seq] = e;
  }
  return { byOn, bySeq };
}
// The edit that applies to one Counter leg {sc, seq, sign_on}. Sign-on first, position second.
export function editFor(leg, idx) {
  if (!leg || !leg.sc || !idx) return null;
  return idx.byOn[leg.sc + "|" + day(leg.sign_on)] || idx.bySeq[leg.sc + "#" + leg.seq] || null;
}

/* ------------------------------------------------------------------ *
 * Newer write wins
 * ------------------------------------------------------------------ */
// leg  : { sign_on, proj_off, act_off, ship, imported_at }   — the Counter row
// edit : { sign_on, sign_off, ship, updated_at }             — Rita's edit, or null
// Returns the effective values plus WHO wrote them and WHEN, so the card can say
// "Rita, 12 Sep" or "Counter, 20 Sep" instead of leaving the reader guessing.
//
// A field Rita left blank never wins: blank is "I did not set this", not "make it empty".
// A leg with no imported_at (every row written before this change) is treated as older than any
// edit — i.e. exactly today's behaviour, so the cutover moves nothing.
export function resolveLeg(leg, edit) {
  leg = leg || {};
  const counter = {
    signOn: day(leg.sign_on),
    signOff: day(leg.act_off) || day(leg.proj_off),
    ship: leg.ship || null,
  };
  if (!edit) return { ...counter, source: "counter", sourceAt: day(leg.imported_at) || null, overridden: false };
  const ritaAt = String(edit.updated_at || "");
  const counterAt = String(leg.imported_at || "");
  const ritaWins = !counterAt || (ritaAt && ritaAt > counterAt);
  const pick = (ritaValue, counterValue) => {
    if (ritaValue == null || ritaValue === "") return counterValue;   // blank never wins
    if (counterValue == null || counterValue === "") return ritaValue; // nothing to beat
    return ritaWins ? ritaValue : counterValue;
  };
  const signOn = pick(day(edit.sign_on), counter.signOn);
  const signOff = pick(day(edit.sign_off), counter.signOff);
  const ship = pick(edit.ship, counter.ship);
  const usedRita = (signOn != null && signOn === day(edit.sign_on)) ||
                   (signOff != null && signOff === day(edit.sign_off)) ||
                   (ship != null && ship === edit.ship && ship !== counter.ship);
  return {
    signOn, signOff, ship,
    source: usedRita ? "rita" : "counter",
    sourceAt: usedRita ? day(edit.updated_at) : (day(leg.imported_at) || null),
    // TRUE when the Counter is the newer write and it replaced a value Rita had set.
    overridden: !ritaWins && !!(day(edit.sign_off) || day(edit.sign_on) || edit.ship),
  };
}

/* ------------------------------------------------------------------ *
 * What a Counter upload would do to the board
 * ------------------------------------------------------------------ */
// incoming : keyman_contract3-shaped rows the file would write, [{sc, ship, seq, sign_on, proj_off}]
// current  : the crew's CURRENT Counter legs today,            [{sc, ship, sign_on, proj_off, act_off}]
// yellows  : open assignments (Rita's projections),            [{id, sc, crew_name, ship, sign_on, planned_sign_off}]
// edits    : contract_edit rows,                               [{sc, seq, on_key, sign_on, sign_off, ship, updated_at}]
//
// Returns, all keyed for display, never applied automatically:
//   appears   crew who gain a current leg the board does not show today
//   leaves    crew whose current leg the file drops entirely (they are not in the file at all)
//   moved     crew whose current ship or dates change
//   absorbs   yellow cards the file now carries — the loop closing; retired on apply
//   conflicts yellow cards the file contradicts — Rita decides, nothing is applied
//   overrides Rita's edits the file would overwrite (it is the newer write)
//   orphans   Rita's edits whose leg sign-on no longer exists in the file
export function diffCounter({ incoming, current, yellows, edits } = {}) {
  const latest = (rows) => {
    const by = {};
    for (const r of (rows || [])) {
      if (!r || !r.sc || !day(r.sign_on)) continue;
      const cur = by[r.sc];
      if (!cur || (r.seq != null && cur.seq != null ? r.seq > cur.seq : day(r.sign_on) > day(cur.sign_on))) by[r.sc] = r;
    }
    return by;
  };
  const inc = latest(incoming), cur = latest(current);
  const appears = [], leaves = [], moved = [], absorbs = [], conflicts = [], overrides = [], orphans = [];

  for (const sc in inc) {
    const a = inc[sc], b = cur[sc];
    if (!b) { appears.push({ sc, ship: a.ship || null, sign_on: day(a.sign_on), sign_off: day(a.proj_off) }); continue; }
    const shipChanged = norm(a.ship) !== norm(b.ship);
    const onChanged = day(a.sign_on) !== day(b.sign_on);
    const offChanged = day(a.proj_off) !== (day(b.act_off) || day(b.proj_off));
    if (shipChanged || onChanged || offChanged) {
      moved.push({
        sc,
        from: { ship: b.ship || null, sign_on: day(b.sign_on), sign_off: day(b.act_off) || day(b.proj_off) },
        to: { ship: a.ship || null, sign_on: day(a.sign_on), sign_off: day(a.proj_off) },
        shipChanged, onChanged, offChanged,
      });
    }
  }
  // "Leaves" means the file does not carry this crew AT ALL. A crew the file simply does not mention
  // keeps their rows (apply refreshes matched crew only) — so this is a warning, never a deletion.
  const incAll = new Set((incoming || []).map((r) => r && r.sc).filter(Boolean));
  for (const sc in cur) if (!incAll.has(sc)) leaves.push({ sc, ship: cur[sc].ship || null, sign_on: day(cur[sc].sign_on) });

  // Yellow cards: absorbed when the file carries the same crew on the same ship within ABSORB_DAYS
  // of the projection; contradicted when the file puts that crew somewhere else, or far away in time.
  for (const y of (yellows || [])) {
    if (!y || !y.sc) continue;
    const a = inc[y.sc];
    if (!a) continue;                                   // the file says nothing about them: card stands
    const gap = daysBetween(y.sign_on, a.sign_on);
    const sameShip = norm(y.ship) === norm(a.ship);
    const close = gap != null && Math.abs(gap) <= ABSORB_DAYS;
    const row = {
      id: y.id, sc: y.sc, crew_name: y.crew_name || null,
      card: { ship: y.ship || null, sign_on: day(y.sign_on), sign_off: day(y.planned_sign_off) },
      counter: { ship: a.ship || null, sign_on: day(a.sign_on), sign_off: day(a.proj_off) },
      gap_days: gap,
    };
    if (sameShip && close) absorbs.push(row);
    else conflicts.push({ ...row, why: sameShip ? "dates" : "ship" });
  }

  // Rita's edits: which the file overwrites (it is newer), and which lose their leg.
  const idx = indexEdits(edits);
  const incBySc = {};
  for (const r of (incoming || [])) if (r && r.sc && day(r.sign_on)) (incBySc[r.sc] = incBySc[r.sc] || []).push(r);
  for (const e of (edits || [])) {
    if (!e || !e.sc) continue;
    const legs = incBySc[e.sc] || [];
    // The leg this edit belongs to, in the INCOMING file.
    const key = e.on_key ? day(e.on_key) : null;
    const hit = key ? legs.find((l) => day(l.sign_on) === key)
                    : legs.find((l) => l.seq === e.seq);
    if (!legs.length) continue;                          // crew not in the file: the edit is untouched
    if (!hit) { orphans.push({ sc: e.sc, on_key: key, seq: e.seq, sign_off: day(e.sign_off) }); continue; }
    const before = resolveLeg({ ...hit, imported_at: null }, e);       // today: Rita wins
    const after = resolveLeg({ ...hit, imported_at: "9999-12-31" }, e); // after: the file is newer
    if (before.signOff !== after.signOff || before.signOn !== after.signOn || norm(before.ship) !== norm(after.ship)) {
      overrides.push({
        sc: e.sc, on_key: key || day(hit.sign_on),
        rita: { sign_on: before.signOn, sign_off: before.signOff, ship: before.ship, at: day(e.updated_at) },
        counter: { sign_on: after.signOn, sign_off: after.signOff, ship: after.ship },
      });
    }
  }
  const by = (k) => (x, y) => (String(x[k]) < String(y[k]) ? -1 : String(x[k]) > String(y[k]) ? 1 : 0);
  return {
    appears: appears.sort(by("sc")), leaves: leaves.sort(by("sc")), moved: moved.sort(by("sc")),
    absorbs: absorbs.sort(by("sc")), conflicts: conflicts.sort(by("sc")),
    overrides: overrides.sort(by("sc")), orphans: orphans.sort(by("sc")),
  };
}
