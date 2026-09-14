// src/counter_legs.js
// THE ONE DEFINITION of "a current leg" for the board, the relief printers, the roster export and
// the backup CSV: the Contract Counter (keyman_contract3), the second TDG import file — the one
// that carries sign-on and projected sign-off. Until 2026-09-14 those readers took current legs
// from `ship_leg`, a frozen snapshot of the 6 Jul 2026 Counter that no later upload ever refreshed
// (data_log: three Counter uploads, one board). Miguel, 14 Sep: "what's in the TDG import stays
// forever"; the board must read the file, not a copy of it.
//
// Shape is the ship_leg row shape (brand, ship_short, sc, crew_id, on_date, off_date, embark,
// disembark, ours, is_current, crew_name) so every existing reader swaps its source, not its logic.
//
// Rules carried by the SQL:
//   - current = the crew's LATEST contract in the Counter (highest seq with a sign-on). Earlier
//     contracts come through as history (is_current=0). A recorded sign-off closes a current leg at
//     the read layer (ship_leg_source.applyRecordedSignoffs), never here.
//   - a leg past its projected sign-off is still current: overdue, not gone. Only Rita's recorded
//     sign-off or the next Counter ends it.
//   - brand from the vessel table by ship name; ports = the snapshot row for the same crew +
//     sign-on when one exists (PORT MEMORY: the July snapshot carried itinerary-derived ports the
//     Counter never had; taken as-is, nulls included, so the cutover is byte-identical — verified
//     0 rows differ both ways on production, 14 Sep 2026), else Rita's contract_edit for legs the
//     snapshot never had. Retire the memory once ports live in contract_edit.
//   - ORPHAN ARM: a snapshot leg whose crew has NO Counter row at all is still served, tagged
//     'ship_leg:orphan', so nothing vanishes at the cutover. Today that is one Journey TBA leg
//     Rita entered by hand; it becomes her yellow card and this arm reports zero.
//   - projected assignment mirrors (source 'assignment:%', is_current=0) never enter: the arm
//     admits keyman_roster rows only.
//
// Not money: the console is not a billing platform (Miguel, 14 Sep); the days-worked export and the
// month view are reference reads. Still: the cutover is verified row for row against production.

export const COUNTER_LEG_SELECT = `
  SELECT COALESCE(v.brand, m.brand) AS brand,
         k.ship AS ship_short,
         k.sc AS sc,
         c.id AS crew_id,
         k.sign_on AS on_date,
         COALESCE(k.act_off, k.proj_off) AS off_date,
         CASE WHEN m.sc IS NOT NULL THEN m.embark    ELSE e.embark    END AS embark,
         CASE WHEN m.sc IS NOT NULL THEN m.disembark ELSE e.disembark END AS disembark,
         1 AS ours,
         CASE WHEN k.seq = (SELECT MAX(k2.seq) FROM keyman_contract3 k2
                             WHERE k2.sc = k.sc AND k2.sign_on IS NOT NULL) THEN 1 ELSE 0 END AS is_current,
         TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name,
         'counter' AS source
    FROM keyman_contract3 k
    LEFT JOIN crew c ON c.agency_id = k.sc
    LEFT JOIN vessel v ON lower(v.name) = lower(k.ship)
    LEFT JOIN contract_edit e ON e.sc = k.sc AND e.seq = k.seq
    LEFT JOIN ship_leg m ON m.sc = k.sc AND m.on_date = k.sign_on AND m.is_current = 1 AND m.ours = 1
                        AND m.source LIKE 'keyman_roster%'
   WHERE k.sign_on IS NOT NULL
  UNION ALL
  SELECT l.brand, l.ship_short, l.sc, l.crew_id, l.on_date, l.off_date, l.embark, l.disembark,
         l.ours, l.is_current,
         TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS crew_name,
         'ship_leg:orphan' AS source
    FROM ship_leg l
    LEFT JOIN crew c ON c.id = l.crew_id
   WHERE l.ours = 1 AND l.is_current = 1 AND l.source LIKE 'keyman_roster%'
     AND NOT EXISTS (SELECT 1 FROM keyman_contract3 k WHERE k.sc = l.sc AND k.sign_on IS NOT NULL)`;

export const COUNTER_LEG_SQL = COUNTER_LEG_SELECT + `
   ORDER BY brand, ship_short, on_date`;

// Every Counter leg (all contracts, not just the current one) in the {sc, ship, sign_on, proj_off,
// act_off, seq} shape the contract grouping (contracts.js) and the card enrichment expect.
export const KC3_LEGS_SQL =
  "SELECT sc, ship, sign_on, proj_off, act_off, seq FROM keyman_contract3 WHERE sign_on IS NOT NULL ORDER BY sc, seq";

export async function fetchCounterLegs(env) {
  const { results } = await env.DB.prepare(COUNTER_LEG_SQL).all();
  return results || [];
}

// Current legs only, as the relief printers / backup CSV want them.
export async function fetchCurrentCounterLegs(env) {
  return (await fetchCounterLegs(env)).filter((r) => Number(r.is_current) === 1);
}
