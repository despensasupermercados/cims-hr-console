// src/relief_api.js
// Relief board — data layer over D1. Read assembles the board; save writes STORED fields only.
import { groupPortDays } from "./city_resolver.js";
import { buildReliefBoard, validateWrite } from "./relief_board.js";
import { RELIEF_HTML } from "./relief_ui.js";
import { htmlPage } from "./etag.js";
import { fetchCurrentCounterLegs } from "./counter_legs.js";
import { fetchBoardPortDays, fetchAzamaraTurnarounds } from "./port_days.js";
import { docBadge } from "./keyman_deploy.js";
import { DEPLOY_HTML } from "./relief_deploy.js";

export const MIN_COVERAGE_MONTHS = 12;
// Azamara crew run ~5-month contracts (vs 6 for CEL/RCI). Their ship_leg off-dates sit mid-cruise, so
// the printer sign-off is PROJECTED: the next real turnaround on/after sign-on + AZAMARA_MONTHS
// (lands at ~5–5.5 months). Never before today (an overdue keyman snaps to the next turnaround from
// now). Rita's override (leg_flags.override_off_date) always wins.
export const AZAMARA_MONTHS = 5;

export function addMonthsISO(d, n) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return dt.toISOString().slice(0, 10);
}

export async function reliefBoardData(env, today) {
  // ONE wave (CLAUDE.md §12). The itinerary is fetched for the card dates only — never the whole
  // 40k-row table (port_days.js, 2026-09-15). Azamara turnarounds come as their own small list.
  const [cfgRow, pd, taRows, flagRes, legs] = await Promise.all([
    env.DB.prepare("SELECT critical_days, due_days FROM relief_window_config WHERE key='default'").first(),
    fetchBoardPortDays(env),
    fetchAzamaraTurnarounds(env, today || new Date().toISOString().slice(0, 10)),
    env.DB.prepare("SELECT vessel_key, crew_name, eccr, air, hotel, on_date_conf, off_date_conf, override_off_date FROM leg_flags").all(),
    fetchCurrentCounterLegs(env),
  ]);
  const cfg = cfgRow || { critical_days: 14, due_days: 30 };
  const portDaysByShip = groupPortDays(pd);
  // Turnarounds per Azamara ship (crew-change ports), ascending — the sign-off projection candidates.
  const taByShip = {};
  for (const r of taRows) (taByShip[r.ship_short] = taByShip[r.ship_short] || []).push({ berth_date: r.berth_date, port_name: r.port_name });
  for (const k in taByShip) taByShip[k].sort((a, b) => (a.berth_date < b.berth_date ? -1 : a.berth_date > b.berth_date ? 1 : 0));
  const flagsByKey = {};
  for (const f of (flagRes.results || [])) flagsByKey[f.vessel_key] = f;

  // Printers = current legs from the Contract Counter (counter_legs.js, the ONE definition;
  // until 2026-09-14 this read the frozen ship_leg snapshot).
  const printers = legs.map((l) => {
    const vk = l.brand + "|" + l.ship_short;
    const f = flagsByKey[vk];
    const applyF = f && (f.crew_name || "") === (l.crew_name || "");
    let off_date = l.off_date || null;
    let off_seed = l.disembark || null;
    // AZAMARA sign-off projection (see AZAMARA_MONTHS). CEL/RCI keep their stored, turnaround-aligned off.
    if (l.brand === "Azamara") {
      const ov = applyF ? f.override_off_date : null;
      const ta = taByShip[l.ship_short] || [];
      if (ov) {
        off_date = ov;
        const hit = ta.find((x) => x.berth_date === ov);
        if (hit) off_seed = hit.port_name;
      } else {
        let base = l.on_date ? addMonthsISO(l.on_date, AZAMARA_MONTHS) : (l.off_date || today);
        if (today && base && base < today) base = today;           // never project a sign-off in the past
        const hit = base ? ta.find((x) => x.berth_date >= base) : null;
        if (hit) { off_date = hit.berth_date; off_seed = hit.port_name; }
      }
    }
    return {
      id: "leg:" + vk,
      role: "printer", crew_name: l.crew_name,
      vessel_key: vk,
      on_date: l.on_date || null, off_date: off_date,
      on_port_seed: l.embark || null, off_port_seed: off_seed,
      eccr: applyF ? f.eccr : 0, air: applyF ? f.air : 0, hotel: applyF ? f.hotel : 0,
      on_date_conf: applyF ? f.on_date_conf : 0, off_date_conf: applyF ? f.off_date_conf : 0,
    };
  });

  // IN-FORCE assignments only. This query had no WHERE clause at all, so a reliever who signed off
  // months ago was still a candidate for "who is relieving this printer" — buildReliefBoard takes the
  // first reliever it finds for the ship.
  const rows = (await env.DB.prepare(
    `SELECT a.id, a.role, a.sign_on, a.planned_sign_off, a.actual_sign_off,
            a.on_port_seed, a.off_port_seed, a.override_on_city, a.override_off_city,
            a.succeeds_assignment_id, a.eccr, a.air, a.hotel, a.on_date_conf, a.off_date_conf,
            a.instructions_sent_at, a.signoff_link_sent_at, a.review_invite_sent_at,
            v.brand AS brand, COALESCE(v.name, a.vessel_name) AS ship_short,
            TRIM(COALESCE(cr.first_name,'') || ' ' || COALESCE(cr.last_name,'')) AS crew_name
       FROM assignment a
       JOIN contract c ON c.id = a.contract_id
       JOIN crew cr    ON cr.id = c.crew_id
       LEFT JOIN vessel v ON v.id = a.vessel_id
      WHERE a.actual_sign_off IS NULL`
  ).all()).results;

  const relievers = rows.map((r) => ({
    id: r.id, role: r.role, crew_name: r.crew_name,
    vessel_key: (r.brand || "?") + "|" + (r.ship_short || "?"),
    on_date: r.sign_on || null,
    off_date: r.actual_sign_off || r.planned_sign_off || null,
    on_port_seed: r.on_port_seed, off_port_seed: r.off_port_seed,
    override_on_city: r.override_on_city, override_off_city: r.override_off_city,
    succeeds_assignment_id: r.succeeds_assignment_id,
    eccr: r.eccr, air: r.air, hotel: r.hotel, on_date_conf: r.on_date_conf, off_date_conf: r.off_date_conf,
    instructions_sent_at: r.instructions_sent_at, signoff_link_sent_at: r.signoff_link_sent_at, review_invite_sent_at: r.review_invite_sent_at,
  }));

  const assignments = printers.concat(relievers);
  const board = buildReliefBoard({ assignments, portDaysByShip, config: cfg, today });
  return { board, config: cfg, today: today || null, count: assignments.length };
}

const ASSIGN_COLS = new Set([
  "role", "vessel_id", "vessel_name", "succeeds_assignment_id",
  "sign_on", "planned_sign_off", "actual_sign_off", "on_port_seed", "off_port_seed",
  "override_on_city", "override_off_city", "eccr", "air", "hotel", "on_date_conf", "off_date_conf",
  "instructions_sent_at", "signoff_link_sent_at", "review_invite_sent_at", "end_reason", "readiness",
]);

// `vessel` is reference data: 54 hulls, added by migration, never edited at runtime. Resolving the name
// to an id cost a round trip on EVERY save (16 Sep 2026). Cached per isolate, and only HITS are cached —
// a miss stays uncached so a hull added while this isolate is alive is still found on the next save.
const _vesselIds = new WeakMap();
async function vesselIdFor(env, name) {
  let m = _vesselIds.get(env.DB);
  if (!m) { m = new Map(); _vesselIds.set(env.DB, m); }
  if (m.has(name)) return m.get(name);
  const v = await env.DB.prepare("SELECT id FROM vessel WHERE name=?").bind(name).first();
  if (v && v.id) m.set(name, v.id);
  return v ? v.id : null;
}

export async function saveReliefAssignment(env, payload) {
  const { id: _keyId, ...toValidate } = (payload || {});
  const { ok, cleaned, rejected } = validateWrite(toValidate);
  if (!ok) return { ok: false, error: "rejected_fields", rejected };
  const now = new Date().toISOString();

  if (cleaned.vessel_name && !cleaned.vessel_id) {
    const vid = await vesselIdFor(env, cleaned.vessel_name);
    if (vid) cleaned.vessel_id = vid;
  }

  if (payload.id) {
    const sets = [], binds = [];
    for (const k of Object.keys(cleaned)) {
      if (ASSIGN_COLS.has(k)) { sets.push(k + "=?"); binds.push(cleaned[k]); }
    }
    if (!sets.length) return { ok: false, error: "nothing_to_update" };
    sets.push("updated_at=?"); binds.push(now);
    binds.push(payload.id);
    await env.DB.prepare("UPDATE assignment SET " + sets.join(", ") + " WHERE id=?").bind(...binds).run();
    return { ok: true, id: payload.id, mode: "update" };
  }

  if (!cleaned.crew_id) return { ok: false, error: "crew_id_required_for_insert" };
  if (!cleaned.vessel_name && !cleaned.vessel_id) return { ok: false, error: "vessel_required_for_insert" };
  if (!cleaned.role) return { ok: false, error: "role_required_for_insert" };

  const contractId = "ct_" + crypto.randomUUID();
  const contractIns = env.DB.prepare(
    "INSERT INTO contract (id, crew_id, contract_group_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)"
  ).bind(contractId, cleaned.crew_id, contractId, "Active", now, now);

  const asId = "as_" + crypto.randomUUID();
  const cols = ["id", "contract_id", "created_at", "updated_at"];
  const vals = [asId, contractId, now, now];
  for (const k of Object.keys(cleaned)) {
    if (ASSIGN_COLS.has(k)) { cols.push(k); vals.push(cleaned[k]); }
  }
  if (!cols.includes("vessel_name")) { cols.push("vessel_name"); vals.push(cleaned.vessel_name || "?"); }
  if (!cols.includes("sign_on")) { cols.push("sign_on"); vals.push(cleaned.sign_on || now.slice(0, 10)); }
  const ph = cols.map(() => "?").join(",");
  // Contract + assignment travel in ONE batch (one round trip, one transaction): the relief Save, a
  // drop on the board and Add crew all come through here, and the D1 primary is far from the Worker.
  await env.DB.batch([contractIns, env.DB.prepare("INSERT INTO assignment (" + cols.join(",") + ") VALUES (" + ph + ")").bind(...vals)]);
  return { ok: true, id: asId, mode: "insert" };
}

// Remove a reliever card: delete the assignment, its PROJECTED forward leg (is_current=0 only
// — never the billing-visible set, per leg_projection invariants), its comments, and the 1:1
// contract shell the relief insert created — but only when nothing else references it. Refuses
// if a committed bonus outcome is tied to the contract. Printer legs (id "leg:...") are not
// removable here.
export async function removeReliefAssignment(env, id) {
  id = String(id || "").trim();
  if (!id) return { ok: false, error: "id_required" };
  if (!id.startsWith("as_")) return { ok: false, error: "not_removable" };
  // ONE round trip for every question, then ONE for every write (16 Sep 2026). This was FIVE sequential
  // trips to a D1 primary on another continent — read the assignment, check bonus history, delete, count
  // what still depends on the contract, delete the contract — and perf_log measured a card removal at
  // 1179ms, which is almost exactly 5 x the ~220ms GRU-to-PRG round trip. Every read keys off the
  // assignment id directly, so they travel together; the deletes then travel as one batch.
  // The two deliberate fallbacks are unchanged: a bonus check that ERRORS still reads as "no bonus"
  // (that is the pre-existing behaviour, not a new one), and a dependency count that errors keeps the
  // contract shell.
  const [a, bonus, dep] = await Promise.all([
    env.DB.prepare("SELECT id, contract_id FROM assignment WHERE id=?").bind(id).first(),
    env.DB.prepare("SELECT 1 x FROM bonus_outcome WHERE contract_id=(SELECT contract_id FROM assignment WHERE id=?) LIMIT 1").bind(id).first().catch(() => null),
    // Counts what will REMAIN once this assignment is gone, so the contract shell can be dropped in the
    // same batch instead of a second round trip after the delete.
    env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM assignment WHERE contract_id=c.cid AND id<>?) " +
      "     + (SELECT COUNT(*) FROM feedback_request WHERE contract_id=c.cid) " +
      "     + (SELECT COUNT(*) FROM feedback_response WHERE contract_id=c.cid) AS n " +
      "FROM (SELECT contract_id AS cid FROM assignment WHERE id=?) c"
    ).bind(id, id).first().catch(() => ({ n: 1 })),
  ]);
  if (!a) return { ok: false, error: "not_found" };
  if (bonus) return { ok: false, error: "has_bonus_history" };
  const cid = a.contract_id;
  const contract_removed = !!(dep && Number(dep.n) === 0);
  const writes = [
    env.DB.prepare("DELETE FROM assignment WHERE id=?").bind(id),
    env.DB.prepare("DELETE FROM ship_leg WHERE source=? AND source LIKE 'assignment:%' AND is_current=0").bind("assignment:" + id),
    env.DB.prepare("DELETE FROM relief_comment WHERE assignment_id=?").bind(id),
  ];
  if (contract_removed) writes.push(env.DB.prepare("DELETE FROM contract WHERE id=?").bind(cid));
  await env.DB.batch(writes);
  return { ok: true, id, mode: "remove", contract_removed };
}

// Printer leg flags — PARTIAL upsert keyed by vessel_key (stores crew_name so a rotation resets).
// Only the fields present in the body are written, so a confirmations-save and an Azamara off-override
// save don't clobber each other. Pass override_off_date:"" or null to clear the override (→ projection).
export async function saveLegFlags(env, b) {
  b = b || {};
  const vk = String(b.vessel_key || "");
  if (!vk) return { ok: false, error: "vessel_key_required" };
  const now = new Date().toISOString();
  const cols = ["vessel_key", "crew_name"], vals = [vk, String(b.crew_name || "")];
  for (const k of ["eccr", "air", "hotel", "on_date_conf", "off_date_conf"]) {
    if (Object.prototype.hasOwnProperty.call(b, k)) { cols.push(k); vals.push(b[k] ? 1 : 0); }
  }
  if (Object.prototype.hasOwnProperty.call(b, "override_off_date")) {
    cols.push("override_off_date"); vals.push(b.override_off_date || null);
  }
  cols.push("updated_at"); vals.push(now);
  const ph = cols.map(() => "?").join(",");
  const upd = cols.filter((c) => c !== "vessel_key").map((c) => c + "=excluded." + c).join(",");
  await env.DB.prepare(
    "INSERT INTO leg_flags (" + cols.join(",") + ") VALUES (" + ph + ") ON CONFLICT(vessel_key) DO UPDATE SET " + upd
  ).bind(...vals).run();
  return { ok: true };
}

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

// Memoized once per isolate (CLAUDE.md §12): this DDL used to run on every comment read and write.
const _commentEnsured = new WeakMap();
function ensureCommentTable(env) {
  let pr = _commentEnsured.get(env.DB);
  if (!pr) {
    pr = env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS relief_comment (id TEXT PRIMARY KEY, assignment_id TEXT, vessel_key TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL)"
    ).run().catch((e) => { _commentEnsured.delete(env.DB); throw e; });
    _commentEnsured.set(env.DB, pr);
  }
  return pr;
}

const VPD_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VPD_BRANDS = new Set(["Celebrity", "Royal Caribbean", "Azamara", "NCL"]);
// Server-side bound on one vpd-load POST. The deploy screen already chunks at 600 rows
// (relief_deploy.js CH=600); this makes the server enforce what the client merely happens to do,
// so a different caller cannot ask the Worker to assemble an unbounded statement.
const VPD_MAX_ROWS = 2000;
// Rows per prepared statement. 50 x 9 columns = 450 bind params, far below SQLite's limit,
// and all statements still go in ONE batch = one D1 round trip (CLAUDE.md §12).
const VPD_CHUNK = 50;

// Every active seafarer with what the reliever picker shows beside the name. crew_override wins
// field by field (the same precedence as every other read); `planned` lists the ships they already
// hold an open projection on; the document fields feed docBadge().
export const RELIEF_CREW_PICKER_SQL =
  `SELECT c.id, TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS name,
          COALESCE(NULLIF(o.status,''), c.status) AS status,
          COALESCE(NULLIF(o.rank_override,''), c.rank_override, c.rank_observed) AS rank,
          COALESCE(NULLIF(o.vessel_observed,''), c.vessel_observed) AS vessel,
          COALESCE(NULLIF(o.med_exp,''), c.med_exp) AS med_exp, COALESCE(NULLIF(o.sirb_exp,''), c.sirb_exp) AS sirb_exp,
          COALESCE(NULLIF(o.pp_exp,''), c.pp_exp) AS pp_exp, COALESCE(NULLIF(o.usv_exp,''), c.usv_exp) AS usv_exp,
          COALESCE(NULLIF(o.sch_exp,''), c.sch_exp) AS sch_exp,
          (SELECT GROUP_CONCAT(COALESCE(v.name, a.vessel_name), ', ')
             FROM assignment a JOIN contract k ON k.id = a.contract_id LEFT JOIN vessel v ON v.id = a.vessel_id
            WHERE k.crew_id = c.id AND a.actual_sign_off IS NULL) AS planned
     FROM crew c LEFT JOIN crew_override o ON o.agency_id = c.agency_id
    WHERE c.redacted = 0
    ORDER BY name`;

export async function handleRelief(request, url, env) {
  const p = url.pathname;
  if (p === "/relief" && request.method === "GET") {
    // The card editor opens as an iframe on every click. Over Starlink that was a full page download each
    // time; it now revalidates and comes back as a 304 when unchanged (16 Sep 2026).
    return htmlPage(RELIEF_HTML);
  }
  if (p === "/api/relief/deploy" && request.method === "GET") {
    return new Response(DEPLOY_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (p === "/api/relief/board" && request.method === "GET") {
    const today = new Date().toISOString().slice(0, 10);
    return jsonResp(await reliefBoardData(env, today));
  }
  if (p === "/api/relief/crew" && request.method === "GET") {
    // The picker (plan v5, phase 5): status, current ship, open projections and document standing
    // beside every name, so Rita sees a double booking or an expired passport BEFORE she picks.
    const today = new Date().toISOString().slice(0, 10);
    const rows = (await env.DB.prepare(RELIEF_CREW_PICKER_SQL).all()).results || [];
    const crew = rows.map((r) => ({
      id: r.id, name: r.name, status: r.status || null, rank: r.rank || null, vessel: r.vessel || null,
      planned: r.planned || null, docs: docBadge(r, today),
    }));
    return jsonResp({ crew });
  }
  if (p === "/api/relief/ports" && request.method === "GET") {
    const ship = url.searchParams.get("ship") || "";
    const rows = (await env.DB.prepare(
      "SELECT berth_date, port_name, is_sea, is_turnaround FROM vessel_port_day WHERE ship_short=? ORDER BY berth_date"
    ).bind(ship).all()).results;
    return jsonResp({ ports: rows });
  }
  if (p === "/api/relief/vpd-status" && request.method === "GET") {
    const today = new Date().toISOString().slice(0, 10);
    const s = (await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM vessel_port_day) AS total,
              (SELECT COUNT(*) FROM vessel_port_day WHERE is_turnaround=1) AS turnarounds,
              (SELECT COUNT(DISTINCT ship_short) FROM vessel_port_day) AS ships,
              (SELECT MIN(berth_date) FROM vessel_port_day) AS first_date,
              (SELECT MAX(berth_date) FROM vessel_port_day) AS last_date`
    ).first()) || {};
    const noPorts = (await env.DB.prepare(
      `SELECT DISTINCT l.ship_short FROM ship_leg l
         WHERE l.is_current=1 AND l.ours=1
           AND NOT EXISTS (SELECT 1 FROM vessel_port_day v WHERE v.ship_short = l.ship_short)
         ORDER BY l.ship_short`
    ).all()).results.map((r) => r.ship_short);
    const shortCov = (await env.DB.prepare(
      `SELECT l.ship_short, MAX(v.berth_date) AS last_date
         FROM ship_leg l JOIN vessel_port_day v ON v.ship_short = l.ship_short
        WHERE l.is_current=1 AND l.ours=1
        GROUP BY l.ship_short
       HAVING MAX(v.berth_date) < date(?, '+' || ? || ' months')
        ORDER BY last_date`
    ).bind(today, String(MIN_COVERAGE_MONTHS)).all()).results;
    const byBrand = (await env.DB.prepare(
      "SELECT brand, COUNT(*) AS rows, COUNT(DISTINCT ship_short) AS ships FROM vessel_port_day GROUP BY brand ORDER BY brand"
    ).all()).results;
    return jsonResp({ ...s, today, min_coverage_months: MIN_COVERAGE_MONTHS, by_brand: byBrand, fleet_without_ports: noPorts, fleet_short_coverage: shortCov });
  }
  if (p === "/api/relief/vpd-load" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return jsonResp({ ok: false, error: "bad_json" }, 400); }
    const rows = body.rows || [];
    if (!Array.isArray(rows)) return jsonResp({ ok: false, error: "rows_must_be_array" }, 400);
    if (rows.length > VPD_MAX_ROWS) return jsonResp({ ok: false, error: "too_many_rows", max: VPD_MAX_ROWS, got: rows.length }, 413);
    if (body.reset) {
      const brands = (body.resetBrands || []).filter((b) => VPD_BRANDS.has(b));
      if (brands.length) {
        const ph = brands.map(() => "?").join(",");
        await env.DB.prepare("DELETE FROM vessel_port_day WHERE brand IN (" + ph + ")").bind(...brands).run();
      }
    }
    const good = [];
    let skipped = 0;
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 6) { skipped++; continue; }
      const brand = String(r[0] || "").trim(), ship = String(r[1] || "").trim(), date = String(r[2] || "").trim(), port = String(r[4] || "").trim();
      if (!VPD_BRANDS.has(brand) || !ship || !VPD_DATE.test(date) || !port) { skipped++; continue; }
      good.push(r);
    }
    // BOUND PARAMETERS, NOT A CONCATENATED STRING (2026-09-10).
    //
    // This used to build one giant INSERT by string concatenation, quoting every value with a
    // hand-rolled esc() that doubled single quotes. That escaping was actually CORRECT — SQLite
    // has no backslash escape, so '' is the only way out of a literal and doubling closes it —
    // and it was checked against injection attempts before being replaced. It was not a live
    // hole. Two things were still wrong with it:
    //
    //   1. NO SERVER-SIDE BOUND on rows. The deploy screen chunks at 600 rows per POST
    //      (relief_deploy.js), but nothing here enforced that, so any other caller could make
    //      the Worker assemble one arbitrarily large SQL string in memory.
    //   2. FRAGILE BY CONSTRUCTION. This repo carries test/sqlsafety.test.js because SQL built
    //      as text has bitten it before. Correct escaping today is one careless edit away from
    //      injection tomorrow — add a value and forget esc(), and the guarantee is gone with no
    //      test to catch it. Binding removes the class rather than defending it per-value.
    //
    // Still ONE D1 round trip (§12): a batch is a single call. Rows are chunked at 50 per
    // statement so the bind-parameter count per statement stays far below SQLite's limit.
    if (good.length) {
      const asof = String(body.asof == null ? "" : body.asof).slice(0, 40);
      const ROW_PH = "(?,?,?,?,?,?,?,?,?)";
      const HEAD = "INSERT OR REPLACE INTO vessel_port_day (brand,ship_short,berth_date,stop_seq,port_name,is_sea,is_turnaround,source,source_asof) VALUES ";
      const stmts = [];
      for (let i = 0; i < good.length; i += VPD_CHUNK) {
        const slice = good.slice(i, i + VPD_CHUNK);
        const binds = [];
        for (const r of slice) {
          binds.push(r[0], r[1], r[2], parseInt(r[3], 10) || 1, r[4],
                     String(r[5]) === "1" ? 1 : 0, String(r[6]) === "1" ? 1 : 0, "DEPLOY", asof);
        }
        stmts.push(env.DB.prepare(HEAD + slice.map(() => ROW_PH).join(",")).bind(...binds));
      }
      await env.DB.batch(stmts);
    }
    return jsonResp({ ok: true, inserted: good.length, skipped });
  }
  if (p === "/api/relief/leg-flags" && request.method === "POST") {
    let b;
    try { b = await request.json(); } catch { return jsonResp({ ok: false, error: "bad_json" }, 400); }
    const res = await saveLegFlags(env, b);
    return jsonResp(res, res.ok ? 200 : 400);
  }
  if (p === "/api/relief/save" && request.method === "POST") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResp({ ok: false, error: "bad_json" }, 400); }
    const res = await saveReliefAssignment(env, payload);
    return jsonResp(res, res.ok ? 200 : 400);
  }
  if (p === "/api/relief/remove" && request.method === "POST") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResp({ ok: false, error: "bad_json" }, 400); }
    const res = await removeReliefAssignment(env, payload && payload.id);
    return jsonResp(res, res.ok ? 200 : 400);
  }
  if (p === "/api/relief/comments" && request.method === "GET") {
    await ensureCommentTable(env);
    const aid = url.searchParams.get("assignment_id") || "";
    const vk = url.searchParams.get("vessel_key") || "";
    const q = aid
      ? env.DB.prepare("SELECT id, body, created_at FROM relief_comment WHERE assignment_id=? ORDER BY created_at DESC").bind(aid)
      : env.DB.prepare("SELECT id, body, created_at FROM relief_comment WHERE vessel_key=? ORDER BY created_at DESC").bind(vk);
    const rows = (await q.all()).results || [];
    return jsonResp({ ok: true, comments: rows });
  }
  if (p === "/api/relief/comment" && request.method === "POST") {
    await ensureCommentTable(env);
    let b; try { b = await request.json(); } catch { return jsonResp({ ok: false, error: "bad_json" }, 400); }
    const body = String((b && b.body) || "").trim();
    if (!body) return jsonResp({ ok: false, error: "empty" }, 400);
    const now = new Date().toISOString();
    const id = "rc_" + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO relief_comment (id, assignment_id, vessel_key, body, created_at) VALUES (?,?,?,?,?)")
      .bind(id, String((b && b.assignment_id) || ""), String((b && b.vessel_key) || ""), body, now).run();
    return jsonResp({ ok: true, id });
  }
  return null;
}
