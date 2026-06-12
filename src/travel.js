// Travel-expense parser — pure. The workbook has one sheet per month; each month sheet holds
// up to three crew sections (CREW 1 / ON, CREW 2 / OFF, CREW 3 / TRANSFER), each a name column
// followed by AIR, HOTEL, MEDICAL, VISA, FOOD, TRANS. We normalize to one record per crew-leg.
// Year is taken from the caller (the filename) — NOT from the cells, because the 2025 file's
// Jan–Mar sheets carry stray 2024 dates.

const MONTHS = { JAN:1, FEB:2, MAR:3, APRIL:4, APR:4, MAY:5, JUNE:6, JUN:6, JULY:7, JUL:7, AUG:8, SEPT:9, SEP:9, OCT:10, NOV:11, DEC:12 };
const CATS = ["air", "hotel", "medical", "visa", "food", "transport"];

export function monthNum(name) { return MONTHS[String(name || "").toUpperCase().trim()] || null; }

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function legOf(headerCell) {
  const h = String(headerCell || "").toUpperCase();
  if (h.includes("TRANSFER")) return "transfer";
  if (h.includes("OFF")) return "off";
  return "on";
}

// Parse one month sheet (2-D array of rows) into crew-leg records.
export function parseMonthSheet(name, rows, year) {
  const mon = monthNum(name);
  if (!mon || !Array.isArray(rows) || rows.length < 2) return [];
  const r0 = rows[0] || [], r1 = rows[1] || [];
  // Section starts: columns where the row-1 label is "Crew".
  const secs = [];
  for (let c = 0; c < r1.length; c++) {
    if (String(r1[c]).trim().toLowerCase() === "crew") secs.push({ col: c, leg: legOf(r0[c]) });
  }
  const out = [];
  for (let ri = 2; ri < rows.length; ri++) {
    const row = rows[ri] || [];
    for (const s of secs) {
      const raw = row[s.col];
      if (raw == null) continue;
      const nm = String(raw).trim();
      if (!nm || nm.toLowerCase() === "nan" || nm.toLowerCase() === "crew") continue;
      const vals = CATS.map((_, k) => num(row[s.col + 1 + k]));
      const total = Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
      if (total <= 0) continue; // skip name rows with no spend
      const rec = { year, month: mon, leg: s.leg, kind: "crew", crew_name: nm, total, other: 0 };
      CATS.forEach((c, k) => { rec[c] = vals[k]; });
      out.push(rec);
    }
  }
  return out;
}

// Parse the CIMS sheet = shoreside-management staff travel. Layout: col0 name, col1 annual Total,
// then per-month blocks of 5: Flight, Hotel, Transportation, Meals, Other (month label in row0).
// Mapped to our columns: Flight->air, Hotel->hotel, Transportation->transport, Meals->food, Other->other.
export function parseCimsSheet(rows, year) {
  if (!Array.isArray(rows) || rows.length < 3) return [];
  const r0 = rows[0] || [];
  const blocks = [];
  for (let c = 2; c < r0.length; c++) {
    const m = monthNum(String(r0[c] || "").slice(0, 3));
    if (m) blocks.push({ col: c, month: m });
  }
  const out = [];
  for (let ri = 2; ri < rows.length; ri++) {
    const row = rows[ri] || [];
    const nm = String(row[0] == null ? "" : row[0]).trim();
    if (!nm || nm.toLowerCase() === "nan" || nm.toLowerCase().startsWith("total")) continue;
    for (const b of blocks) {
      const flight = num(row[b.col]), hotel = num(row[b.col + 1]), trans = num(row[b.col + 2]), meals = num(row[b.col + 3]), other = num(row[b.col + 4]);
      const total = Math.round((flight + hotel + trans + meals + other) * 100) / 100;
      if (total <= 0) continue;
      out.push({ year, month: b.month, leg: "shoreside", kind: "shoreside", crew_name: nm, air: flight, hotel, medical: 0, visa: 0, food: meals, transport: trans, other, total });
    }
  }
  return out;
}

// Parse a whole workbook: sheets = { sheetName: rows2D, ... }. Month sheets = crew; CIMS = shoreside.
export function parseTravelSheets(sheets, year) {
  let recs = [];
  for (const [name, rows] of Object.entries(sheets || {})) {
    if (monthNum(name)) recs = recs.concat(parseMonthSheet(name, rows, year));
    else if (String(name).toUpperCase().trim() === "CIMS") recs = recs.concat(parseCimsSheet(rows, year));
  }
  return recs;
}

// Roll-ups for the Travel view / API.
export function summarize(records) {
  const byMonth = {}, byCat = { air:0, hotel:0, medical:0, visa:0, food:0, transport:0, other:0 }, byLeg = { on:0, off:0, transfer:0 }, byKind = { crew:0, shoreside:0 };
  let total = 0; const crew = new Set();
  for (const r of records || []) {
    byMonth[r.month] = (byMonth[r.month] || 0) + r.total;
    if (byLeg[r.leg] != null) byLeg[r.leg] += r.total;
    byKind[r.kind || "crew"] = (byKind[r.kind || "crew"] || 0) + r.total;
    for (const c of CATS) byCat[c] += r[c] || 0;
    byCat.other += r.other || 0;
    total += r.total; crew.add(r.crew_name);
  }
  const round = (o) => { for (const k in o) o[k] = Math.round(o[k] * 100) / 100; return o; };
  return { total: Math.round(total * 100) / 100, records: (records || []).length, crew: crew.size,
    byMonth: round(byMonth), byCat: round(byCat), byLeg: round(byLeg), byKind: round(byKind) };
}

// Normalize a "Last, First" travel name to match the crew registry (first + last).
export function travelNameKey(name) {
  const s = String(name || "").toLowerCase().replace(/[^a-z, ]/g, "").trim();
  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  if (parts.length >= 2) return (parts[1] + " " + parts[0]).replace(/\s+/g, " ").trim();
  return s.replace(/\s+/g, " ").trim();
}
