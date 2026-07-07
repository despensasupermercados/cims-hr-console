// src/relief_board.js
// Relief board — computed logic (spec §4) + write validation (§6). Pure/testable.
// Cities come from the resolver; handover, urgency, and sort are computed here, NEVER stored.
import { resolveCity } from "./city_resolver.js";

function dayDiff(a, b) {
  const t1 = Date.parse(a), t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round((t1 - t2) / 86400000);
}

// §4.2 relief-window urgency (per printer, from days_to_off). Thresholds from relief_window_config.
export function urgency(daysToOff, config) {
  const crit = (config && config.critical_days) != null ? config.critical_days : 14;
  const due = (config && config.due_days) != null ? config.due_days : 30;
  if (daysToOff == null) return "open";
  if (daysToOff <= crit) return "critical";
  if (daysToOff <= due) return "due";
  return "open";
}

// §4.1 handover status: reliever `on` vs the printer it relieves `off`. Computed, never stored.
export function handoverStatus(printer, reliever) {
  if (!reliever) return { kind: "none" };
  const sameDay = reliever.on_date && printer && printer.off_date && reliever.on_date === printer.off_date;
  if (sameDay && reliever.on_city === printer.off_city) return { kind: "clean" };
  if (sameDay) return { kind: "port_mismatch", printerCity: printer.off_city, relieverCity: reliever.on_city };
  const g = printer ? dayDiff(reliever.on_date, printer.off_date) : null;
  return { kind: "gap", days: g == null ? null : Math.abs(g) };
}

// §4.3 workflow status — derived from presence of each *_sent_at.
export function workflowStatus(a) {
  return {
    instructions: !!a.instructions_sent_at,
    link: !!a.signoff_link_sent_at,
    review: !!a.review_invite_sent_at,
  };
}

// §4.4 cost-of-delay rank: critical → due → gap/mismatch → open → clean.
const RANK = { critical: 0, due: 1, port_mismatch: 2, gap: 2, open: 3, clean: 4, none: 3 };

// Build the board. Inputs:
//   assignments : enriched rows { id, role('printer'|'reliever'), crew_name, vessel_key('<brand>|<ship_short>'),
//                 on_date, off_date, on_port_seed, off_port_seed, override_on_city, override_off_city,
//                 succeeds_assignment_id, eccr, air, hotel, on_date_conf, off_date_conf,
//                 instructions_sent_at, signoff_link_sent_at, review_invite_sent_at, has_deployment }
//   portDaysByShip : { vessel_key: [ {berth_date, port_name, is_sea} ] }
//   config : { critical_days, due_days }
//   today  : 'YYYY-MM-DD'
export function buildReliefBoard({ assignments = [], portDaysByShip = {}, config = {}, today } = {}) {
  today = today || new Date().toISOString().slice(0, 10);
  const byShip = {};
  for (const a of assignments) (byShip[a.vessel_key] = byShip[a.vessel_key] || []).push(a);

  const rows = Object.keys(byShip).map((key) => {
    const list = byShip[key];
    const printerRaw = list.find((a) => a.role === "printer") || null;
    const relieverRaw = list.find((a) => a.role === "reliever") || null;
    const pd = portDaysByShip[key] || [];
    const hasDep = pd.length > 0 ||
      (printerRaw && printerRaw.has_deployment) || (relieverRaw && relieverRaw.has_deployment) || false;

    const enrich = (a) => {
      if (!a) return null;
      const on = resolveCity({ date: a.on_date, seed: a.on_port_seed, override: a.override_on_city, portDays: pd, hasDeployment: hasDep });
      const off = resolveCity({ date: a.off_date, seed: a.off_port_seed, override: a.override_off_city, portDays: pd, hasDeployment: hasDep });
      return {
        id: a.id, role: a.role, crew_name: a.crew_name || null, vessel_key: key,
        on_date: a.on_date || null, off_date: a.off_date || null,
        on_city: on.city, on_conf: on.conf, off_city: off.city, off_conf: off.conf,
        days_to_off: a.off_date ? dayDiff(a.off_date, today) : null,
        succeeds_assignment_id: a.succeeds_assignment_id || null,
        tags: { eccr: !!a.eccr, air: !!a.air, hotel: !!a.hotel, on_date_conf: !!a.on_date_conf, off_date_conf: !!a.off_date_conf },
        workflow: workflowStatus(a),
      };
    };

    const printer = enrich(printerRaw);
    const reliever = enrich(relieverRaw);
    const handover = handoverStatus(printer, reliever);
    const daysToOff = printer ? printer.days_to_off : null;
    const urg = urgency(daysToOff, config);
    const statusKind = reliever ? handover.kind : urg; // reliever present → handover drives; else urgency
    const _rank = RANK[statusKind] != null ? RANK[statusKind] : 3;
    return { vessel_key: key, printer, reliever, handover, urgency: urg, days_to_off: daysToOff, status: statusKind, _rank };
  });

  rows.sort((a, b) =>
    a._rank - b._rank ||
    ((a.days_to_off == null ? 1e9 : a.days_to_off) - (b.days_to_off == null ? 1e9 : b.days_to_off)) ||
    a.vessel_key.localeCompare(b.vessel_key)
  );
  return rows.map(({ _rank, ...r }) => r);
}

// §6 write validation — accept STORED fields only; reject any attempt to write a derived city/confidence.
const WRITABLE = new Set([
  "crew_id", "role", "vessel_id", "vessel_name", "succeeds_assignment_id",
  "sign_on", "planned_sign_off", "actual_sign_off", "on_port_seed", "off_port_seed",
  "override_on_city", "override_off_city", "eccr", "air", "hotel", "on_date_conf", "off_date_conf",
  "instructions_sent_at", "signoff_link_sent_at", "review_invite_sent_at", "end_reason", "readiness",
]);
const FORBIDDEN = new Set(["on_city", "off_city", "on_conf", "off_conf", "days_to_off", "handover", "urgency", "status"]);

export function validateWrite(payload = {}) {
  const cleaned = {}, rejected = [];
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN.has(k)) { rejected.push(k); continue; }        // derived — never writable
    if (WRITABLE.has(k)) cleaned[k] = payload[k];
    else rejected.push(k);                                        // unknown — reject, don't guess
  }
  return { ok: rejected.length === 0, cleaned, rejected };
}
