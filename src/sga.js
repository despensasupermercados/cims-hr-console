// TDG's Statement of General Account workbook ("DG3 SGA EXCEL <month>.xlsx") — pure parsers.
//
// Miguel, 15 Oct 2026: the SGA is the AUDITED number for seafarer cost; Rita's travel workbook is the operational one;
// the console shows where they disagree, and Rita types less over time. The workbook is TDG's own working file
// (~212 sheets; one "SOA <code><n>" sheet per crew statement). Two sheets carry what the console needs:
//
//   SUMMARY MANNING   one row per crew per ship for the month, TDG's ref "SYS-2026-09-39-02" (ship code, year, month,
//                     SGA number, sequence), the crew's name, the vessel, and every cost column — HOME ALLOTMENT, MANNING /
//                     AGENCY FEE, SOCIAL COSTS, JOINING FEE, ACCOUNTING FEE, TRAVEL / PLANEFARE, MEDICAL, VISA, HOTEL, HMO,
//                     TRANSPORTATION, REFUND, BANK CHARGE … and AMOUNT. Columns MOVE month to month (September 2026 gained
//                     ID NUMBER / NATIONALITY / HMO; August had none), so they are found by HEADER TEXT, never by position.
//   2026 SUMMARY TRAINREL (hidden)  the training-related costs by month and category — RENTAL FEE, UTILITIES, HOTEL,
//                     PLANEFARE, OTHER EXPENSES, BANK CHARGES — and a TOTAL per month that equals the "TRAINING RELATED
//                     COSTS <month>.pdf" statement to the cent (September 2026: 843.94 / 228.05 / 1,374.09 / 2,109.03 /
//                     1,399.83 = 5,954.94). The PDF itself is a scan with no text; the Excel is read instead.
//
// Input is the same shape the Travel upload sends: { sheetName: rows2D } with raw cell values (numbers or strings such as
// " 1,169.60 ", "$5,028.73", " -   ", "(138.46)"). Nothing here is money in the §1 sense (the bonus); it is a reference
// read (§10b) and never an invoice source.

const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? Math.round(v * 100) / 100 : 0;
  const s = String(v).trim();
  if (!s || s === "-" || /^\$?\s*-\s*$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[$\s]/g, ""));
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return 0;
  return Math.round((neg ? -n : n) * 100) / 100;
};
const txt = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const up = (v) => txt(v).toUpperCase();

export const REF_RE = /^([A-Z]{2,4})-(\d{4})-(\d{2})-(\d+[A-Z]?)-(\d{2})$/;

// The cost columns of SUMMARY MANNING, by the words TDG puts in the header row. Order = display order.
export const SGA_COLS = [
  ["allotment", /HOME ALLOTMENT/],
  ["final_pay", /FINAL PAY/],
  ["agency_fee", /MANNING FEE|AGENCY FEE/],
  ["social", /SOCIAL COST/],
  ["joining_fee", /^JOINING FEE/],
  ["accounting_fee", /ACCOUNTING FEE/],
  ["transition_fee", /TRANSITION FEE/],
  ["air", /TRAVEL ?\/ ?PLANEFARE|PLANEFARE|TRAVEL FARE/],
  ["medical", /^MEDICAL$/],
  ["medical_repat", /MEDICAL REPAT/],
  ["visa", /^VISA/],
  ["hotel", /^HOTEL/],
  ["travel_insurance", /TRAVEL INSURANCE/],
  ["reimbursement", /REIMBURSEMENT/],
  ["funeral", /FUNERAL/],
  ["transport", /^TRANSPORTATION/],
  ["hmo", /^HMO/],
  ["cash_advance", /CASH ADVANCE/],
  ["donation", /DONATION/],
  ["refund", /^REFUND/],
  ["bank_charge", /BANK CHARGE|COURIER/],
];
export const SGA_COL_KEYS = SGA_COLS.map(([k]) => k);

// Which brand a section header names ("1. ROYAL VESSELS" → royal).
const sectionBrand = (s) => { const u = up(s); if (/ROYAL/.test(u)) return "royal"; if (/CELEBRITY/.test(u)) return "celebrity"; if (/AZAMARA/.test(u)) return "azamara"; if (/NCL|NORWEGIAN/.test(u)) return "ncl"; return null; };

// Find the header row: the one that says REF. NO. and carries the cost headers. Returns { row, cols: {key: colIndex},
// nameCol, vesselCol, amountCol, refCol } or null.
export function sgaManningHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i] || [];
    const refCol = r.findIndex((c) => /^REF\.? ?NO/.test(up(c)));
    if (refCol < 0) continue;
    const cols = {};
    r.forEach((c, j) => {
      const u = up(c);
      if (!u || j === refCol) return;
      for (const [key, re] of SGA_COLS) { if (cols[key] == null && re.test(u)) { cols[key] = j; break; } }
    });
    // "TRANSPORTATION" appears twice in 2026 (TRANSPORTATION, TRANSPORTATION EXPENSE); CASH ADVANCE twice too. The first
    // wins above; the later duplicates are folded into the same key when read (sgaManningRows sums every column whose
    // header matches). Keep every index per key for that:
    const all = {};
    r.forEach((c, j) => { const u = up(c); if (!u || j === refCol) return; for (const [key, re] of SGA_COLS) if (re.test(u)) { (all[key] = all[key] || []).push(j); break; } });
    const nameCols = r.map((c, j) => (/^CREW$/.test(up(c)) ? j : -1)).filter((j) => j >= 0);
    const vesselCol = r.findIndex((c) => /^VESSELS?$/.test(up(c)));
    const amountCol = r.findIndex((c) => /^AMOUNT$/.test(up(c)));
    const idCol = r.findIndex((c) => /^ID NUMBER$/.test(up(c)));
    const natCol = r.findIndex((c) => /NATIONALITY/.test(up(c)));
    if (!nameCols.length || Object.keys(all).length < 5) continue;
    return { row: i, cols: all, nameCols, vesselCol, amountCol, refCol, idCol, natCol };
  }
  return null;
}

// The month's SGA header: date and number ("DATE : October 01, 2026", "SGA NO. : 39-A").
export function sgaManningMeta(rows) {
  let date = null, sgaNo = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    for (let j = 0; j < r.length; j++) {
      const u = up(r[j]);
      if (u === "DATE" || u === "DATE:") { const v = r.slice(j + 1).map(txt).find((x) => x && x !== ":"); if (v) date = v; }
      if (/^SGA ?NO/.test(u)) { const v = r.slice(j + 1).map(txt).find((x) => x && x !== ":"); if (v) sgaNo = v; }
    }
  }
  return { date, sgaNo };
}

// One record per crew row of SUMMARY MANNING.
//   { ref, ship_code, year, month, sga_no, seq, crew_name, vessel, brand, id_number, nationality, <cost keys>, amount }
// `year` / `month` come from the ref ("ADV-2026-09-39-01" → 2026, 9); a row without a readable ref but with a name and
// an amount is kept with the sheet's period (`fallback` = { year, month }) and ref null, so nothing billed is dropped.
export function parseSgaManning(rows, fallback = {}) {
  const h = sgaManningHeader(rows || []);
  if (!h) return { meta: sgaManningMeta(rows || []), records: [], others: [], grand_total: null, error: "no_header" };
  const meta = sgaManningMeta(rows);
  const records = [], others = [];
  let brand = null, grand = null;
  // a cell that is a number (TDG's own number, or " 1,169.60 " / "$15.00" / "(50.00)"), never a label with digits in it
  const isNumCell = (x) => typeof x === "number" || (/\d/.test(String(x)) && !/[A-Za-z]/.test(String(x)));
  const lastNum = (r) => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== "" && r[j] != null && isNumCell(r[j])) return num(r[j]); return 0; };
  for (let i = h.row + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const first = txt(r.slice(0, 3).map(txt).find((x) => x) || "");
    const sb = sectionBrand(first);
    if (sb && /VESSELS/.test(up(first))) { brand = sb; continue; }
    // the GRAND TOTAL row ends the table: its last number is TDG's total; the rows after it are signatures
    if (/GRAND TOTAL/.test(r.map(up).join(" "))) { grand = lastNum(r); break; }
    const ref = txt(r[h.refCol]);
    const m = REF_RE.exec(ref);
    const name = txt(h.nameCols.map((j) => r[j]).find((x) => txt(x)));
    const amount = h.amountCol >= 0 ? num(r[h.amountCol]) : null;
    if (/^OTHERS?$/.test(up(first))) {
      // "OTHERS  Bank Charge - August 2026 SGA  15.00": a line that is nobody's; the amount is the row's last number
      const label = txt(r.map(txt).find((x) => x && !/^OTHERS?$/i.test(x) && !isNumCell(x)) || "Others");
      others.push({ label, amount: amount || lastNum(r) });
      continue;
    }
    // a crew line carries TDG's ref; without one it must at least name someone AND bill something (a signature row does not)
    if (!m && !(name && (amount || lastNum(r)))) continue;
    // VESSELS is a merged header: the hull sits under it or one to three cells to its right (September 2026: one right)
    const vessel = h.vesselCol >= 0 ? txt(r.slice(h.vesselCol, h.vesselCol + 4).map(txt).find((x) => x && !isNumCell(x)) || "") || null : null;
    const rec = { ref: m ? ref : null, ship_code: m ? m[1] : null, year: m ? +m[2] : (fallback.year || null), month: m ? +m[3] : (fallback.month || null),
      sga_no: m ? m[4] : (meta.sgaNo || null), seq: m ? +m[5] : null, crew_name: name || null, vessel,
      brand, id_number: h.idCol >= 0 ? txt(r[h.idCol]) || null : null, nationality: h.natCol >= 0 ? txt(r[h.natCol]) || null : null };
    let sum = 0;
    for (const key of SGA_COL_KEYS) { const v = (h.cols[key] || []).reduce((a, j) => a + num(r[j]), 0); rec[key] = Math.round(v * 100) / 100; sum += v; }
    rec.amount = amount != null && amount !== 0 ? amount : Math.round(sum * 100) / 100;
    rec.cols_sum = Math.round(sum * 100) / 100;
    if (!rec.crew_name && !rec.amount) continue;
    records.push(rec);
  }
  return { meta, records, others, grand_total: grand };
}

// The training sheet ("2026 SUMMARY TRAINREL"): blocks headed by a year cell, then month rows, then TOTAL.
// Returns [{ year, month, rental, utilities, hotel, air, other, bank_charge, total }], one per month with any amount.
const MONTHS = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };
export const TRAIN_COLS = [
  ["rental", /RENTAL/], ["utilities", /UTILIT/], ["hotel", /^HOTEL$/], ["air", /PLANEFARE|AIR ?FARE|TRAVEL/], ["other", /OTHER/], ["bank_charge", /BANK/],
  ["training_related", /^TRAINING RELATED/],
];
export function parseSgaTraining(rows) {
  const out = [];
  let year = null, cols = null, totalCol = -1, summaryBlock = false;
  for (const r0 of rows || []) {
    const r = r0 || [];
    const a = up(r[0]);
    if (/^20\d\d$/.test(a)) {
      year = +a; cols = {}; totalCol = -1;
      r.forEach((c, j) => { const u = up(c); if (!u || j === 0) return; if (/^TOTAL$/.test(u)) { totalCol = j; return; } for (const [k, re] of TRAIN_COLS) if (cols[k] == null && re.test(u)) { cols[k] = j; break; } });
      // Two block shapes share the sheet. The 2026 block is the training centre BY CATEGORY (RENTAL FEE, UTILITIES, HOTEL,
      // PLANEFARE, OTHER …, TOTAL). The 2025 block is the WHOLE SGA by category (HOME ALLOTMENT … HOTEL … TRAINING RELATED,
      // TOTAL): there the month's training figure is the TRAINING RELATED column alone, and its HOTEL is the crew's hotels,
      // not the centre's. The block decides by its header, never row by row.
      summaryBlock = cols.training_related != null;
      continue;
    }
    if (!year || !cols) continue;
    const m = MONTHS[a];
    if (!m) continue;
    const rec = { year, month: m };
    if (summaryBlock) {
      rec.total = num(r[cols.training_related]);
      rec.summary_only = true;
      if (!rec.total) continue;
      out.push(rec); continue;
    }
    let sum = 0;
    for (const [k] of TRAIN_COLS) { if (k === "training_related") continue; const v = cols[k] != null ? num(r[cols[k]]) : 0; rec[k] = v; sum += v; }
    rec.total = totalCol >= 0 ? num(r[totalCol]) : Math.round(sum * 100) / 100;
    if (!rec.total && !sum) continue;
    out.push(rec);
  }
  return out;
}

// Roll-ups the console shows: per month per brand, per crew, by category.
export function summarizeSga(records) {
  const byMonth = {}, byBrand = {}, byCat = {};
  let total = 0;
  for (const r of records || []) {
    const k = r.year + "-" + String(r.month).padStart(2, "0");
    byMonth[k] = Math.round(((byMonth[k] || 0) + r.amount) * 100) / 100;
    byBrand[r.brand || "other"] = Math.round(((byBrand[r.brand || "other"] || 0) + r.amount) * 100) / 100;
    for (const c of SGA_COL_KEYS) if (r[c]) byCat[c] = Math.round(((byCat[c] || 0) + r[c]) * 100) / 100;
    total += r.amount;
  }
  return { total: Math.round(total * 100) / 100, rows: (records || []).length, crew: new Set((records || []).map((r) => r.crew_name)).size, byMonth, byBrand, byCat };
}

// Find the sheets by their job, whatever TDG called them this month.
export function pickSgaSheets(sheets) {
  const names = Object.keys(sheets || {});
  const manning = names.find((n) => /SUMMARY MANNING/i.test(n)) || null;
  const training = names.find((n) => /TRAINREL/i.test(n)) || names.find((n) => /^TRAINING$/i.test(n.trim())) || null;
  return { manning, training };
}
