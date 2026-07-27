// src/leg_projection.js
// -----------------------------------------------------------------------------
// Projects FUTURE `assignment` rows into `ship_leg` as is_current=0 legs.
//
// WHY THIS EXISTS
// The relief board writes forward crew assignments to `assignment`
// (relief_api.js). Everything else — the rotation board, the dashboard, the
// billing export and the Seafarer Movements email — reads `ship_leg`, which is
// a one-time keyman_roster snapshot that nothing has ever written to. The two
// never met, so 35 forward sign-ons were invisible and the movements email's
// "Arriving" section was structurally always 0.
//
// This module is the bridge. `assignment` is the single write source; ship_leg
// becomes a projection of it for the forward window.
//
// THE SAFETY CONTRACT — four invariants, each pinned by a test:
//
//  1. NEVER writes is_current=1. The partial unique index
//     `ux_leg_current ON ship_leg(brand, ship_short) WHERE is_current = 1`
//     defines the billing-visible set, and EVERY existing reader filters on
//     `is_current = 1` (worker.js:460,881,988,1101,1267,2068; relief_api.js:50,
//     239,246). Writing only is_current=0 rows is therefore invisible to all of
//     them — the rotation board, dashboard and billing export return byte-
//     identical results before and after this runs. That is what makes this
//     deployable without re-validating money numbers.
//
//  2. NEVER touches a row whose `source` is not 'assignment:%'. The 48
//     keyman_roster rows — including the 8 that have no assignment record —
//     are carried as-is and are physically unreachable by this code.
//     (Miguel's decision, 2026-07-27: carry the orphans through the transition.)
//
//  3. Idempotent and converging. Rows are keyed on
//     `source = 'assignment:<assignment_id>'`. Re-running produces no drift, and
//     projected rows whose assignment has since closed or vanished are removed —
//     but ONLY rows this module created.
//
//  4. Brand is resolved from ship_leg's OWN (brand, ship_short) pairs. A vessel
//     the board doesn't already know is SKIPPED and reported, never guessed.
//     Same for malformed dates. Fail loud, not quietly wrong.
//
// WHAT THIS DELIBERATELY DOES NOT DO
// It never promotes a future leg to is_current=1 when its date arrives. That
// flip changes the billing-visible set and belongs in its own reviewed change
// (see docs — Phase 2). Until then a projected leg simply ages past its start
// date as is_current=0, which is visibly wrong on the board but harmless to
// money. That is the intended trade.
// -----------------------------------------------------------------------------

const SRC_PREFIX = "assignment:";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function ymd(s) {
  if (typeof s === "string" && ISO.test(s.slice(0, 10))) return s.slice(0, 10);
  return null;
}

function sourceKey(assignmentId) {
  return SRC_PREFIX + String(assignmentId);
}

// A row is ours to modify ONLY if its source carries our prefix. Invariant 2.
function isProjected(row) {
  return typeof (row && row.source) === "string" && row.source.startsWith(SRC_PREFIX);
}

/**
 * PURE. Decide what the projection should do. No IO, fully unit-testable.
 *
 * @param assignments      [{ id, vessel_name, sign_on, planned_sign_off, on_port_seed,
 *                            off_port_seed, sc, crew_id, on_date_conf, off_date_conf }]
 * @param shipIndex        Map|object: ship_short -> brand, built from ship_leg itself
 * @param existingRows     ALL ship_leg rows (projected and not) — used to detect
 *                         collisions and to find our own stale rows
 * @param today            'YYYY-MM-DD'
 * @returns { inserts, updates, deletes, skipped }
 */
function planProjection({ assignments = [], shipIndex = {}, existingRows = [], today }) {
  const day = ymd(today);
  if (!day) throw new Error("planProjection: `today` must be YYYY-MM-DD");

  const brandOf = (ship) => {
    if (shipIndex instanceof Map) return shipIndex.get(ship) || null;
    return Object.prototype.hasOwnProperty.call(shipIndex, ship) ? shipIndex[ship] : null;
  };

  // Our own rows, by source key.
  const mine = new Map();
  for (const r of existingRows) if (isProjected(r)) mine.set(r.source, r);

  // The billing-visible set. We must never produce a row that shadows one of
  // these for the same crew+ship+date — that would double-count a leg the day
  // someone flips is_current. Invariant 1's companion guard.
  const currentKeys = new Set();
  for (const r of existingRows) {
    if (r && r.is_current) currentKeys.add([r.sc, r.ship_short, ymd(r.on_date)].join("|"));
  }

  const inserts = [], updates = [], skipped = [];
  const seen = new Set();

  for (const a of assignments) {
    const id = a && a.id;
    if (!id) { skipped.push({ id: null, reason: "no_assignment_id" }); continue; }

    const key = sourceKey(id);
    if (seen.has(key)) { skipped.push({ id, reason: "duplicate_assignment_id" }); continue; }
    seen.add(key);

    const on = ymd(a.sign_on);
    if (!on) { skipped.push({ id, reason: "no_sign_on" }); continue; }
    if (on <= day) { skipped.push({ id, reason: "not_future" }); continue; }

    const ship = a.vessel_name == null ? "" : String(a.vessel_name).trim();
    const brand = brandOf(ship);
    // Invariant 4: never invent a vessel the board doesn't know.
    if (!brand) { skipped.push({ id, reason: "unknown_vessel", vessel: ship }); continue; }

    const off = ymd(a.planned_sign_off);
    // ship_leg CHECK (on_date <= off_date) would reject this at write time.
    if (off && off < on) { skipped.push({ id, reason: "off_before_on", on, off }); continue; }

    if (currentKeys.has([a.sc, ship, on].join("|"))) {
      skipped.push({ id, reason: "collides_with_current_leg", vessel: ship, on });
      continue;
    }

    const row = {
      source: key,
      brand,
      ship_short: ship,
      sc: a.sc || null,
      crew_id: a.crew_id || null,
      ours: 1,
      on_date: on,
      off_date: off,
      // Honest nulls. We do NOT fall back to vessel homeport here: an invented
      // port reads as fact on the arrivals card and is wrong exactly when it
      // matters (repositioning, dry dock). Blank renders as TBA downstream.
      embark: a.on_port_seed || null,
      disembark: a.off_port_seed || null,
      on_conf: a.on_date_conf ? 1 : 0,
      off_conf: a.off_date_conf ? 1 : 0,
      is_current: 0, // Invariant 1. Never anything else.
    };

    const prev = mine.get(key);
    if (!prev) { inserts.push(row); continue; }
    mine.delete(key); // still live — not stale
    if (
      prev.brand !== row.brand || prev.ship_short !== row.ship_short ||
      (prev.sc || null) !== row.sc || (prev.crew_id || null) !== row.crew_id ||
      ymd(prev.on_date) !== row.on_date || ymd(prev.off_date) !== row.off_date ||
      (prev.embark || null) !== row.embark || (prev.disembark || null) !== row.disembark ||
      (prev.on_conf ? 1 : 0) !== row.on_conf || (prev.off_conf ? 1 : 0) !== row.off_conf
    ) updates.push(row);
  }

  // Anything left in `mine` is a row we created whose assignment is gone or no
  // longer future. Ours to remove — and only ours. Invariants 2 + 3.
  const deletes = [...mine.keys()];

  return { inserts, updates, deletes, skipped };
}

// The ONLY place the forward source is read. Mirrors relief_coverage.fetchRelievers
// so both live in one swappable spot.
async function fetchFutureAssignments(env, today) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.vessel_name, a.sign_on, a.planned_sign_off,
            a.on_port_seed, a.off_port_seed, a.on_date_conf, a.off_date_conf,
            c.agency_id AS sc, c.id AS crew_id
       FROM assignment a
       JOIN contract ct ON ct.id = a.contract_id
       JOIN crew     c  ON c.id  = ct.crew_id
      WHERE a.actual_sign_off IS NULL
        AND a.sign_on > ?`
  ).bind(today).all();
  return results || [];
}

async function fetchShipIndex(env) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT brand, ship_short FROM ship_leg"
  ).all();
  const idx = {};
  for (const r of results || []) if (r.ship_short && !idx[r.ship_short]) idx[r.ship_short] = r.brand;
  return idx;
}

async function fetchExistingRows(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, source, brand, ship_short, sc, crew_id, on_date, off_date, embark, disembark, on_conf, off_conf, is_current FROM ship_leg"
  ).all();
  return results || [];
}

/**
 * Run the projection. Returns a report; writes only is_current=0 rows tagged
 * 'assignment:<id>'. Safe to call repeatedly.
 *
 * @param opts.dryRun  plan only, write nothing (used by the staging check)
 */
async function projectFutureLegs(env, { today, dryRun = false } = {}) {
  const day = ymd(today);
  if (!day) throw new Error("projectFutureLegs: `today` must be YYYY-MM-DD");

  const [assignments, shipIndex, existingRows] = await Promise.all([
    fetchFutureAssignments(env, day),
    fetchShipIndex(env),
    fetchExistingRows(env),
  ]);

  const plan = planProjection({ assignments, shipIndex, existingRows, today: day });
  const report = {
    dryRun,
    considered: assignments.length,
    inserted: plan.inserts.length,
    updated: plan.updates.length,
    deleted: plan.deletes.length,
    skipped: plan.skipped,
  };
  if (dryRun) return report;

  const now = new Date().toISOString();
  const stmts = [];

  for (const r of plan.inserts) {
    stmts.push(env.DB.prepare(
      `INSERT INTO ship_leg (brand, ship_short, sc, crew_id, ours, on_date, off_date,
                             embark, disembark, on_conf, off_conf, is_current, source, updated_at)
       VALUES (?,?,?,?,1,?,?,?,?,?,?,0,?,?)`
    ).bind(r.brand, r.ship_short, r.sc, r.crew_id, r.on_date, r.off_date,
           r.embark, r.disembark, r.on_conf, r.off_conf, r.source, now));
  }

  // Every write is scoped by `source LIKE 'assignment:%'` as a belt-and-braces
  // restatement of invariant 2 at the SQL layer, not just in JS.
  for (const r of plan.updates) {
    stmts.push(env.DB.prepare(
      `UPDATE ship_leg SET brand=?, ship_short=?, sc=?, crew_id=?, on_date=?, off_date=?,
              embark=?, disembark=?, on_conf=?, off_conf=?, is_current=0, updated_at=?
        WHERE source=? AND source LIKE 'assignment:%' AND is_current=0`
    ).bind(r.brand, r.ship_short, r.sc, r.crew_id, r.on_date, r.off_date,
           r.embark, r.disembark, r.on_conf, r.off_conf, now, r.source));
  }

  for (const src of plan.deletes) {
    stmts.push(env.DB.prepare(
      "DELETE FROM ship_leg WHERE source=? AND source LIKE 'assignment:%' AND is_current=0"
    ).bind(src));
  }

  if (stmts.length) await env.DB.batch(stmts);
  return report;
}

// Forward legs for the Seafarer Movements "Arriving" section. This is the ONLY
// reader that looks at is_current=0 rows; everything else stays on is_current=1.
async function fetchArrivals(env, startDate, endDate) {
  const { results } = await env.DB.prepare(
    `SELECT l.ship_short AS ship, l.sc AS agency_id, l.on_date AS signOn, l.off_date AS signOff,
            l.embark, TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS name
       FROM ship_leg l
       LEFT JOIN crew c ON c.id = l.crew_id
      WHERE l.ours = 1 AND l.is_current = 0
        AND l.source LIKE 'assignment:%'
        AND l.on_date BETWEEN ? AND ?
      ORDER BY l.on_date, l.ship_short`
  ).bind(startDate, endDate).all();
  return results || [];
}

export { planProjection, projectFutureLegs, fetchArrivals, sourceKey, isProjected };
