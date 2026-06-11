// Fleet / dry-dock logic — pure, testable. Drives dry-dock awareness across the app.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function parse(s) { if (!ISO.test(s || "")) return null; const d = new Date(s + "T00:00:00Z"); return isNaN(d) ? null : d; }

// status of a dry-dock window relative to `today`. end may be null (open-ended).
export function dryDockStatus(start, end, today) {
  const s = parse(start), t = parse(today);
  if (!s || !t) return "unknown";
  const e = parse(end);
  if (t < s) return "upcoming";
  if (e && t > e) return "completed";
  return "in_dock"; // started and not yet ended (or open-ended)
}

export function fleetDryDock(schedule, today) {
  return (schedule || []).map(d => ({ ...d, status: dryDockStatus(d.start, d.end, today) }));
}

export function inDockNow(schedule, today) {
  return fleetDryDock(schedule, today).filter(d => d.status === "in_dock").map(d => d.ship);
}

// upcoming docks within `days` of today (for early-warning).
export function upcomingDocks(schedule, today, days = 120) {
  const t = parse(today); if (!t) return [];
  return fleetDryDock(schedule, today).filter(d => {
    if (d.status !== "upcoming") return false;
    const s = parse(d.start); if (!s) return false;
    return Math.round((s - t) / 86400000) <= days;
  });
}
