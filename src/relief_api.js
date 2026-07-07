// src/relief_api.js
// Relief board — data layer over D1. Read assembles the board; save writes STORED fields only.
// Kept out of worker.js so the wire-in is one router line. Pure SQL + the pure modules.
import { groupPortDays } from "./city_resolver.js";
import { buildReliefBoard, validateWrite } from "./relief_board.js";
import { RELIEF_HTML } from "./relief_ui.js";

// READ — one call returns the whole board (spec §6). Cities/handover/urgency all derived here.
export async function reliefBoardData(env, today) {
  const cfg = (await env.DB.prepare(
    "SELECT critical_days, due_days FROM relief_window_config WHERE key='default'"
  ).first()) || { critical_days: 14, due_days: 30 };

  const pd = (await env.DB.prepare(
    "SELECT brand, ship_short, berth_date, port_name, is_sea FROM vessel_port_day"
  ).all()).results;
  const portDaysByShip = groupPortDays(pd);

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
       LEFT JOIN vessel v ON v.id = a.vessel_id`
  ).all()).results;

  const assignments = rows.map((r) => ({
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

  const board = buildReliefBoard({ assignments, portDaysByShip, config: cfg, today });
  return { board, config: cfg, today: today || null, count: assignments.length };
}

// Columns that live on `assignment` (crew_id lives on `contract`, handled separately on insert).
const ASSIGN_COLS = new Set([
  "role", "vessel_id", "vessel_name", "succeeds_assignment_id",
  "sign_on", "planned_sign_off", "actual_sign_off", "on_port_seed", "off_port_seed",
  "override_on_city", "override_off_city", "eccr", "air", "hotel", "on_date_conf", "off_date_conf",
  "instructions_sent_at", "signoff_link_sent_at", "review_invite_sent_at", "end_reason", "readiness",
]);

// SAVE — stored fields only. Rejects any derived city/confidence write (spec §6).
//   payload.id present  → UPDATE that assignment.
//   payload.id absent   → INSERT (requires crew_id + vessel_name + role); creates a contract row.
export async function saveReliefAssignment(env, payload) {
  const { ok, cleaned, rejected } = validateWrite(payload || {});
  if (!ok) return { ok: false, error: "rejected_fields", rejected };
  const now = new Date().toISOString();

  // Resolve vessel_id from vessel_name so the board can key by (brand|ship_short) and derive cities.
  // Applies to both reassign (update) and create (insert) — a name without an id would otherwise
  // group under "?|Ship" and never pair with its printer.
  if (cleaned.vessel_name && !cleaned.vessel_id) {
    const v = await env.DB.prepare("SELECT id FROM vessel WHERE name=?").bind(cleaned.vessel_name).first();
    if (v) cleaned.vessel_id = v.id;
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

  // INSERT — needs a crew + a vessel + a role.
  if (!cleaned.crew_id) return { ok: false, error: "crew_id_required_for_insert" };
  if (!cleaned.vessel_name && !cleaned.vessel_id) return { ok: false, error: "vessel_required_for_insert" };
  if (!cleaned.role) return { ok: false, error: "role_required_for_insert" };

  const contractId = "ct_" + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO contract (id, crew_id, contract_group_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)"
  ).bind(contractId, cleaned.crew_id, contractId, "Active", now, now).run();

  const asId = "as_" + crypto.randomUUID();
  const cols = ["id", "contract_id", "created_at", "updated_at"];
  const vals = [asId, contractId, now, now];
  for (const k of Object.keys(cleaned)) {
    if (ASSIGN_COLS.has(k)) { cols.push(k); vals.push(cleaned[k]); }
  }
  if (!cols.includes("vessel_name")) { cols.push("vessel_name"); vals.push(cleaned.vessel_name || "?"); }
  if (!cols.includes("sign_on")) { cols.push("sign_on"); vals.push(cleaned.sign_on || now.slice(0, 10)); }
  const ph = cols.map(() => "?").join(",");
  await env.DB.prepare("INSERT INTO assignment (" + cols.join(",") + ") VALUES (" + ph + ")").bind(...vals).run();
  return { ok: true, id: asId, mode: "insert" };
}

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

// Single dispatcher — the ONLY thing worker.js calls. Returns a Response for our routes, else null.
// Mount it INSIDE the console's authenticated section so crew PII stays session-gated.
//   GET  /relief            → the board page (HTML)
//   GET  /api/relief/board  → the whole board (derived cities/handover/urgency)
//   GET  /api/relief/crew   → crew list for the picker
//   POST /api/relief/save   → stored-fields-only write (rejects city writes)
export async function handleRelief(request, url, env) {
  const p = url.pathname;
  if (p === "/relief" && request.method === "GET") {
    return new Response(RELIEF_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (p === "/api/relief/board" && request.method === "GET") {
    const today = new Date().toISOString().slice(0, 10);
    return jsonResp(await reliefBoardData(env, today));
  }
  if (p === "/api/relief/crew" && request.method === "GET") {
    const rows = (await env.DB.prepare(
      "SELECT id, TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) AS name FROM crew WHERE redacted=0 ORDER BY name"
    ).all()).results;
    return jsonResp({ crew: rows });
  }
  if (p === "/api/relief/save" && request.method === "POST") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResp({ ok: false, error: "bad_json" }, 400); }
    const res = await saveReliefAssignment(env, payload);
    return jsonResp(res, res.ok ? 200 : 400);
  }
  return null; // not our route
}
