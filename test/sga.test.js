// TDG's SGA workbook parsers (src/sga.js), on the layout of DG3 SGA EXCEL SEPTEMBER'26 / AUGUST'2026 — synthetic
// amounts, the real column words and the real ref format. Columns are found by header text because they move
// month to month (September 2026 gained ID NUMBER / NATIONALITY / HMO).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSgaManning, parseSgaTraining, parseSgaSummary, summarizeSga, pickSgaSheets, sgaManningHeader, sgaManningMeta, excelSerialToISO, REF_RE, sgaPeriodFromName, sgaPeriodFromPath, sgaPeriodOf, isManningSheet, isSummarySheet } from "../src/sga.js";
import { WANT_SGA } from "../src/sharepoint_sync.js";
import { readFileSync } from "node:fs";

// A real workbook read by SheetJS carries the DATE cell as an Excel serial (Miguel's uploads of 15 Oct 2026: January's
// 46057 = 2026-02-04, February's 46085 = 2026-03-04, March's 46125 = 2026-04-13); the connector's text dump never did.
test("the bill's DATE as an Excel serial becomes a calendar date; TDG's own text and the SGA number are kept as written", () => {
  assert.equal(excelSerialToISO(46057), "2026-02-04");
  assert.equal(excelSerialToISO("46125"), "2026-04-13");
  assert.equal(excelSerialToISO(46085.4), "2026-03-04");
  assert.equal(excelSerialToISO("October 01, 2026"), null);
  assert.equal(excelSerialToISO(1428.52), null);   // an amount is never a date
  assert.equal(excelSerialToISO(""), null);
  assert.deepEqual(sgaManningMeta([[], ["", "DATE", ":", 46057], ["", "SGA NO.", ":", "31-A"]]), { date: "2026-02-04", sgaNo: "31-A" });
  assert.deepEqual(sgaManningMeta([[], ["", "DATE", ":", new Date(Date.UTC(2026, 4, 4))], ["", "SGA NO.", ":", "34-A"]]), { date: "2026-05-04", sgaNo: "34-A" });
  assert.deepEqual(sgaManningMeta([[], ["", "DATE", ":", "May 04, 2026"], ["", "SGA NO.", ":", "34-A"]]), { date: "May 04, 2026", sgaNo: "34-A" });
});

const H26 = ["", "REF. NO.", "", "ID NUMBER", "NATIONALITY", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "TRAVEL INSURANCE", "REIMBURSEMENT", "FUNERAL EXPENSE", "TRANSPORTATION", "HMO", "CASH ADVANCE", "TRANSPORTATION EXPENSE", "REFUND", "CASH ADVANCE", "BANK CHARGE / COURIER", "AMOUNT"];
const row = (ref, id, nat, name, vessel, vals) => { const r = new Array(H26.length).fill(""); r[1] = ref; r[3] = id; r[4] = nat; r[5] = name; r[6] = name; r[7] = vessel; Object.entries(vals).forEach(([k, v]) => { r[H26.indexOf(k)] = v; }); return r; };
const SEPT = [
  [], [], [], [" STATEMENT OF GENERAL ACCOUNT SUMMARY "], [],
  ["", "DATE", ":", "October 01, 2026"], ["", "SGA NO.", ":", "39-A"], [],
  ["", "", "", "", "", "", "PARTICULARS"],
  H26, [],
  ["", "#REF!"],
  ["", "1. ROYAL VESSELS      "],
  row("ADV-2026-09-39-01", "C34567", "FILIPINO", "Lanuza, Karl Bernard", "ADVENTURE OF THE SEAS", { "HOME ALLOTMENT": " 1,000.00 ", "MANNING FEE/ AGENCY FEE": " 65.00 ", "SOCIAL COSTS": " 78.12 ", "ACCOUNTING FEE": " 30.00 ", "HMO": " 117.64 ", "AMOUNT": " 1,290.76 " }),
  row("ANT-2026-09-39-01", "F45678", "FILIPINO", "CAAG, HAZIEL", "ANTHEM OF THE SEAS", { "HOME ALLOTMENT": 534.4, "MANNING FEE/ AGENCY FEE": 52, "SOCIAL COSTS": 78.12, "JOINING FEE": 120, "ACCOUNTING FEE": 30, "TRAVEL /PLANEFARE": 614, "HMO": 123.79, "AMOUNT": 1552.31 }),
  row("ANT-2026-09-39-02", "R34567", "FILIPINO", "LORONO, ANDREW", "ANTHEM OF THE SEAS", { "HOME ALLOTMENT": 623.79, "MANNING FEE/ AGENCY FEE": 34.67, "SOCIAL COSTS": 78.12, "ACCOUNTING FEE": 30, "HOTEL": 137, "HMO": 111.49, "AMOUNT": 1015.07 }),
  ["", "2. CELEBRITY VESSELS"],
  row("CAP-2026-09-39-01", "", "FILIPINO", "BELHIDA, DAN ANDREW", "CELEBRITY APEX", { "HOME ALLOTMENT": "$1,336.60", "MANNING FEE/ AGENCY FEE": 65, "SOCIAL COSTS": 79.2, "ACCOUNTING FEE": 30, "REFUND": "(50.00)", "AMOUNT": 1460.8 }),
  ["", "3. AZAMARA VESSELS"],
  row("AZQ-2026-09-39-01", "", "FILIPINO", "JEYUSON, JHOCSON", "AZAMARA QUEST", { "HOME ALLOTMENT": 1169.6, "MANNING FEE/ AGENCY FEE": 65, "SOCIAL COSTS": 79.2, "ACCOUNTING FEE": 30, "MEDICAL": 132, "VISA": 213.18, "AMOUNT": 1688.98 }),
  [], ["", "OTHERS", "", "", "", "", "Bank Charge - September 2026 SGA", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", " 15.00 ", " 15.00 "],
  [], ["", "", "", "", "", "", "", "", "GRAND TOTAL ", "", "", "$4,664.39", "$0.00", "$281.67", "", "", "", "", "$614.00", "$132.00", "", "$213.18", "$137.00", "", "", "", "", "$352.92", "", "", "($50.00)", "", "$15.00", "$7,022.92"],
];

test("the ref carries ship code, year, TDG's constant 09, SGA number and sequence — the 09 is NOT the month", () => {
  const m = REF_RE.exec("SYS-2026-09-39-02");
  assert.deepEqual(m.slice(1), ["SYS", "2026", "09", "39", "02"]);
  // 15 Oct 2026: February 2026's refs read ADV-2026-09-32-01 — the month comes from the file's name or folder
  assert.deepEqual(sgaPeriodFromName("DG3 SGA EXCEL FEBRUARY 2026.xlsx"), { year: 2026, month: 2, source: "name" });
  assert.deepEqual(sgaPeriodFromName("REVISED DG3 SGA EXCEL JULY'2026.xlsx"), { year: 2026, month: 7, source: "name" });
  assert.deepEqual(sgaPeriodFromName("DG3 SGA EXCEL SEPTEMBER'26.xlsx"), { year: 2026, month: 9, source: "name" });
  assert.deepEqual(sgaPeriodFromName("DG3 SGA EXCEL MARCH'26.xlsx"), { year: 2026, month: 3, source: "name" });
  assert.equal(sgaPeriodFromName("DG3 SGA EXCEL.xlsx"), null); assert.equal(sgaPeriodFromName("TRAINING RELATED COSTS.pdf"), null);
  assert.deepEqual(sgaPeriodFromPath("1. ACCOUNTING/SGA/2026/02 February 2026"), { year: 2026, month: 2, source: "path" });
  assert.deepEqual(sgaPeriodFromPath("1. ACCOUNTING/SGA/2025/09 September/"), { year: 2025, month: 9, source: "path" });
  assert.equal(sgaPeriodFromPath("1. ACCOUNTING/Travel Expenses Crew"), null);
  assert.deepEqual(sgaPeriodOf("DG3 SGA EXCEL.xlsx", "1. ACCOUNTING/SGA/2026/02 February 2026"), { year: 2026, month: 2, source: "path" });
  // the February 2026 header: SETTLEMENT TRANSPORTATION folds into transport, OTHER is its own column
  const h = sgaManningHeader([["", "REF. NO.", "", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "TRAVEL INSURANCE", "REIMBURSEMENT", "FUNERAL EXPENSE", "TRANSPORTATION", "SETTLEMENT TRANSPORTATION", "CASH ADVANCE", "HMO INSURANCE", "REFUND", "OTHER", "BANK CHARGE / COURIER", "AMOUNT"]]);
  assert.deepEqual(h.cols.transport, [24, 25]); assert.deepEqual(h.cols.other, [29]); assert.deepEqual(h.cols.bank_charge, [30]);
  assert.ok(REF_RE.test("ADV-2025-09-27-01"), "a 2025 SGA number");
  assert.equal(REF_RE.test("Bank Charge"), false);
});

test("the header row is found by text and the cost columns by their words, whatever their position", () => {
  const h = sgaManningHeader(SEPT);
  assert.equal(h.row, 9);
  assert.deepEqual(h.cols.air, [18]); assert.deepEqual(h.cols.hmo, [27]); assert.deepEqual(h.cols.allotment, [11]);
  assert.deepEqual(h.cols.transport, [26, 29], "TRANSPORTATION and TRANSPORTATION EXPENSE fold into one key");
  assert.deepEqual(h.cols.cash_advance, [28, 31]);
  assert.equal(h.vesselCol, 7); assert.equal(h.amountCol, 33); assert.equal(h.idCol, 3);
  // August 2026 had no ID NUMBER / NATIONALITY / HMO: the same words, other positions
  const H25 = ["", "REF. NO.", "", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "AMOUNT"];
  const h2 = sgaManningHeader([[], H25]);
  assert.deepEqual(h2.cols.air, [16]); assert.equal(h2.cols.hmo, undefined); assert.equal(h2.idCol, -1); assert.equal(h2.amountCol, 21);
});

test("parseSgaManning: one record per crew row with brand, every cost column, the ref split, and the OTHERS line apart", () => {
  const { meta, records, others, grand_total } = parseSgaManning(SEPT, { year: 2026, month: 9 });
  assert.deepEqual(meta, { date: "October 01, 2026", sgaNo: "39-A" });
  assert.equal(records.length, 5);
  const caag = records.find((r) => /CAAG/.test(r.crew_name));
  assert.equal(caag.ref, "ANT-2026-09-39-01"); assert.equal(caag.ship_code, "ANT"); assert.equal(caag.year, 2026); assert.equal(caag.month, 9);
  assert.equal(caag.sga_no, "39"); assert.equal(caag.seq, 1); assert.equal(caag.brand, "royal"); assert.equal(caag.vessel, "ANTHEM OF THE SEAS");
  assert.equal(caag.id_number, "F45678"); assert.equal(caag.nationality, "FILIPINO");
  assert.equal(caag.air, 614); assert.equal(caag.hmo, 123.79); assert.equal(caag.joining_fee, 120); assert.equal(caag.amount, 1552.31);
  assert.equal(caag.cols_sum, 1552.31, "the columns add up to TDG's AMOUNT");
  const lanuza = records[0];
  assert.equal(lanuza.allotment, 1000, "' 1,000.00 ' reads as a number"); assert.equal(lanuza.amount, 1290.76);
  const belhida = records.find((r) => /BELHIDA/.test(r.crew_name));
  assert.equal(belhida.brand, "celebrity"); assert.equal(belhida.allotment, 1336.6, "$-prefixed"); assert.equal(belhida.refund, -50, "(50.00) is negative");
  assert.equal(records.find((r) => /JEYUSON/.test(r.crew_name)).brand, "azamara");
  assert.deepEqual(others, [{ label: "Bank Charge - September 2026 SGA", amount: 15 }]);
  assert.equal(grand_total, 7022.92);
});

test("a row without a readable ref keeps the sheet's period; a sheet without the header says so", () => {
  const rows = SEPT.slice(0, 12).concat([row("", "", "", "Somebody, New", "ICON OF THE SEAS", { "TRAVEL /PLANEFARE": 700, "AMOUNT": 700 })]);
  const { records } = parseSgaManning(rows, { year: 2026, month: 9 });
  assert.equal(records.length, 1); assert.equal(records[0].ref, null); assert.equal(records[0].year, 2026); assert.equal(records[0].month, 9); assert.equal(records[0].air, 700);
  assert.equal(parseSgaManning([["nothing"], ["here"]]).error, "no_header");
});

test("parseSgaTraining reads the TRAINREL blocks: 2026 by category, 2025 as the whole-SGA block's TRAINING RELATED column", () => {
  const rows = [
    ["2025", "HOME ALLOTMENT", "MANNING FEE/AGENCY FEE", "TRAVEL/ PLANEFARE", "TRAINING RELATED", "TOTAL"],
    ["JANUARY", " 35,573.88 ", " 3,055.22 ", " 8,709.53 ", " 2,072.44 ", " 58,998.14 "],
    ["FEBRUARY", " 34,829.72 ", " 3,024.60 ", " 11,274.17 ", " 966.96 ", " 57,372.83 "],
    ["TOTAL", "", "", "", " 25,780.54 ", ""],
    [],
    ["2026", "RENTAL FEE", "UTILITIES", "HOTEL", "PLANEFARE", "OTHER EXPENSES", "BANK CHARGES", "TRAVEL/ PLANEFARE", "TOTAL"],
    ["JANUARY", " 870.48 ", " 97.07 ", " 51.28 ", "", "", "", "", " 1,018.83 "],
    ["SEPTEMBER", " 843.94 ", " 228.05 ", " 1,374.09 ", " 2,109.03 ", " 1,399.83 ", "", "", " 5,954.94 "],
    ["OCTOBER", "", "", "", "", "", "", "", " -   "],
    ["TOTAL", " 7,787.85 ", " 1,466.63 ", " 9,357.44 ", " 7,134.55 ", " 2,577.68 ", " -   ", "", " 28,324.15 "],
  ];
  const t = parseSgaTraining(rows);
  assert.deepEqual(t.map((r) => r.year + "-" + r.month), ["2025-1", "2025-2", "2026-1", "2026-9"], "October 2026 (nothing yet) and TOTAL rows are not months");
  const sep = t.find((r) => r.year === 2026 && r.month === 9);
  assert.equal(sep.rental, 843.94); assert.equal(sep.utilities, 228.05); assert.equal(sep.hotel, 1374.09); assert.equal(sep.air, 2109.03); assert.equal(sep.other, 1399.83);
  assert.equal(sep.total, 5954.94, "equals the TRAINING RELATED COSTS SEPTEMBER'26.pdf statement");
  assert.equal(sep.summary_only, undefined);
  const jan25 = t.find((r) => r.year === 2025 && r.month === 1);
  assert.equal(jan25.total, 2072.44, "2025 has one training column, not categories"); assert.equal(jan25.summary_only, true);
});

test("summarizeSga and pickSgaSheets", () => {
  const { records } = parseSgaManning(SEPT, { year: 2026, month: 9 });
  const s = summarizeSga(records);
  assert.equal(s.rows, 5); assert.equal(s.crew, 5);
  assert.equal(s.byMonth["2026-09"], s.total);
  assert.equal(s.byBrand.royal, Math.round((1290.76 + 1552.31 + 1015.07) * 100) / 100);
  assert.equal(s.byCat.air, 614); assert.equal(s.byCat.hmo, Math.round((117.64 + 123.79 + 111.49) * 100) / 100);
  assert.deepEqual(pickSgaSheets({ "SGA SUMMARY WITH SBP ": [], "2026 SUMMARY TRAINREL": [], "SUMMARY MANNING": [], "SOA ADV1": [] }), { manning: "SUMMARY MANNING", training: "2026 SUMMARY TRAINREL", summary: null });
  assert.deepEqual(pickSgaSheets({ TRAINING: [], "SUMMARY MANNING ": [] }), { manning: "SUMMARY MANNING ", training: "TRAINING", summary: null });
});

test("parseSgaSummary reads the monthly summary sheet: both year blocks, header words with a trailing 2, crew_total = total − training − settlement", () => {
  const rows = [
    ["2025", "HOME ALLOTMENT", "MANNING FEE/AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRAVEL/ PLANEFARE", "MEDICAL", "VISA", "HOTEL", "PORT AGENT EXPENSE", "TRAVEL INSURANCE", "HMO INSURANCE", "REFUND", "OTHER EXPENSES", "BANK CHARGE/ COURIER", "TRAINING RELATED", "", "TOTAL"],
    ["SEPTEMBER", " 48,795.11 ", " 3,143.83 ", " 4,245.15 ", " 900.00 ", " 1,590.00 ", " 9,583.92 ", " 553.71 ", " 831.61 ", " 223.00 ", " -   ", " -   ", " 12,978.97 ", " -   ", " -   ", " 15.00 ", " 2,356.31 ", "", " 85,216.61 "],
    ["TOTAL", " 529,503.31 ", "", "", "", "", "", "", "", "", "", "", "", "", "", "", " 25,780.54 ", "", " 837,386.38 "], [],
    ["2026", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/AGENCY FEE2", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRAVEL/ PLANEFARE", "MEDICAL", "VISA", "HOTEL", "DONATION", "PORT AGENT EXPENSE", "TRAVEL INSURANCE", "HMO INSURANCE", "SETTLEMENT TRANSPO", "CASH ADVANCE", "TRANSPORTATION EXPENSE", "BANK CHARGE/ COURIER", "REFUND", "TRAINING RELATED2", "SETTLEMENT PAYMENT", "TOTAL"],
    ["JANUARY", " 49,929.71 ", " -   ", " 3,137.00 ", " 4,178.67 ", " 840.00 ", " 1,620.00 ", " 11,991.73 ", " 924.00 ", " 948.70 ", " -   ", " -   ", " -   ", " -   ", " -   ", " -   ", " -   ", " -   ", " 15.00 ", " -   ", " 1,018.83 ", " 2,700.65 ", " 77,304.29 "],
    ["FEBRUARY", " 51,476.60 ", " -   ", " 3,160.65 ", " 4,570.49 ", " 1,080.00 ", " 1,770.00 ", " 12,331.06 ", " 780.00 ", " -   ", " 111.00 ", " -   ", " -   ", " -   ", " 485.34 ", " 12.50 ", " -   ", " -   ", " 15.00 ", " -   ", " 1,360.89 ", " -   ", " 77,153.53 "],
    ["OCTOBER", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", " -   "],
    ["TOTAL", " 472,218.50 ", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", " 28,324.15 ", " 2,700.65 ", " 706,388.16 "],
  ];
  const out = parseSgaSummary(rows);
  assert.deepEqual(out.map((r) => r.year + "-" + r.month), ["2025-9", "2026-1", "2026-2"], "months with a total; the TOTAL rows and an empty October are not months");
  const sep25 = out[0];
  assert.equal(sep25.air, 9583.92); assert.equal(sep25.hmo, 12978.97); assert.equal(sep25.other, 0, "PORT AGENT EXPENSE is -"); assert.equal(sep25.training, 2356.31); assert.equal(sep25.total, 85216.61);
  assert.equal(sep25.crew_total, Math.round((85216.61 - 2356.31) * 100) / 100);
  const jan = out[1];
  assert.equal(jan.agency_fee, 3137, "MANNING FEE/AGENCY FEE2"); assert.equal(jan.training, 1018.83, "TRAINING RELATED2"); assert.equal(jan.settlement, 2700.65);
  assert.equal(jan.crew_total, Math.round((77304.29 - 1018.83 - 2700.65) * 100) / 100, "= January's GRAND TOTAL on SUMMARY MANNING");
  const feb = out[2];
  assert.equal(feb.transport, 12.5, "SETTLEMENT TRANSPO folds into transport"); assert.equal(feb.hmo, 485.34); assert.equal(feb.crew_total, 75792.64, "February's GRAND TOTAL");
  assert.deepEqual(pickSgaSheets({ "2026 SUMMARY (2)": [], "2026 SUMMARY TRAINREL": [], "SUMMARY MANNING": [] }), { manning: "SUMMARY MANNING", training: "2026 SUMMARY TRAINREL", summary: "2026 SUMMARY (2)" });
  assert.equal(pickSgaSheets({ "2025 SUMMARY": [] }).summary, "2025 SUMMARY");
});

// THE 2025 WORKBOOKS (Miguel's third batch, 16 Oct 2026: July–November 2025). TDG spelled the manning sheet "SUMMARY
// MANNIING" (July, August), "SEPTEMBER SUMMARY MANNING" (September), headed the allotment column "BASIC PAY" (July–October;
// "Allotment Total" above it every month) and named September's summary sheet "DG3 SUMMARY 2025". Read as they came, July
// and August were refused (no manning sheet) and September / October did not reconcile ($34,050.19 and $24,096.85 against
// TDG's $82,860.30 and $79,084.61 — the allotment column missing). Every workbook also hides a "SUMMARY MANNIING (2)" sheet
// (CODE / PARTICULARS / REF. NO. / AMOUNT, no CREW column) that must never be taken for the manning sheet.
const H25 = ["", "REF. NO.", "", "CREW", "CREW", "VESSELS", "", "", "", "", "BASIC PAY", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "TRAVEL INSURANCE", "REIMBURSEMENT", "FUNERAL EXPENSE", "TRANSPORTATION", "PORT AGENT EXPENSE", "CASH ADVANCE", "HMO INSURANCE", "REFUND", "OTHER EXPENSES", "BANK CHARGE / COURIER", "AMOUNT"];
const row25 = (ref, name, vessel, vals) => { const r = new Array(H25.length).fill(""); r[1] = ref; r[3] = name; r[4] = name; r[5] = vessel; Object.entries(vals).forEach(([k, v]) => { r[H25.indexOf(k)] = v; }); return r; };
const OCT25 = [
  [], [], [], [" STATEMENT OF GENERAL ACCOUNT SUMMARY "], [], ["", "DATE", ":", 46084], ["", "SGA NO.", ":", "28-A"], [],
  ["", "", "", "", "PARTICULARS", "", "", "", "", "", "Allotment Total", "Final Pay Total", "Agency fee Total"],
  H25, [], ["", "1. ROYAL VESSELS"],
  row25("ADV-2025-09-28-01", "CAAG, HAZIEL", "ADVENTURE OF THE SEAS", { "BASIC PAY": 1169.6, "MANNING FEE/ AGENCY FEE": 95, "SOCIAL COSTS": 83.21, "TRAVEL /PLANEFARE": 614, "AMOUNT": 1961.81 }),
  row25("ALR-2025-09-28-02", "TAÑGONAN, RAYMOND", "ALLURE OF THE SEAS", { "BASIC PAY": 974.4, "MANNING FEE/ AGENCY FEE": 95, "SOCIAL COSTS": 80.21, "MEDICAL": 0, "AMOUNT": 1149.61 }),
  ["", "OTHERS", "", "", "", "", "Bank Charge - October 2025 SGA", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", 15, 15],
  ["", "", "", "GRAND TOTAL ", "", "", "", "", "", "", 2144, 0, 190, 163.42, 0, 0, 0, 614, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 3126.42],
];
const MANNIING2 = [[], ["", "CODE", "PARTICULARS", "", "", "", "REF. NO.", "AMOUNT"], ["", "1", "ALLOTMENT", "", "", "", "ADV-2025-09-28-01", 1169.6]];

test("the 2025 workbooks: BASIC PAY is the allotment column, and the lines reconcile to TDG's grand total", () => {
  const h = sgaManningHeader(OCT25);
  assert.ok(h, "the header row is found"); assert.deepEqual(h.cols.allotment, [10]); assert.deepEqual(h.cols.other, [26, 30], "OTHER EXPENSES + PORT AGENT EXPENSE fold into other");
  const { records, grand_total, others } = parseSgaManning(OCT25, { year: 2025, month: 10 });
  assert.equal(records.length, 2); assert.equal(records[0].allotment, 1169.6); assert.equal(records[0].amount, 1961.81);
  assert.equal(grand_total, 3126.42); assert.deepEqual(others, [{ label: "Bank Charge - October 2025 SGA", amount: 15 }]);
  assert.equal(Math.round((summarizeSga(records).total + others[0].amount) * 100) / 100, grand_total, "lines + the bank charge = GRAND TOTAL");
  // a 2026 header never carries BASIC PAY beside HOME ALLOTMENT (checked on the ten 2026 workbooks), so the fold never doubles
  assert.deepEqual(sgaManningHeader([H26]).cols.allotment, [H26.indexOf("HOME ALLOTMENT")]);
});

test("the manning sheet by every spelling TDG used, never the hidden '(2)' copy; the summary sheet by its 2025 names; a file name with underscores", () => {
  for (const n of ["SUMMARY MANNING", "SUMMARY MANNING ", "SUMMARY MANNIING", "SEPTEMBER SUMMARY MANNING", "summary manning"]) assert.equal(isManningSheet(n), true, n);
  for (const n of ["SUMMARY MANNIING (2)", "SUMMARY MANNING (3)", "SGA SUMMARY WITH SBP ", "SUMMARY 2", "TRAINING", "MANNING", ""]) assert.equal(isManningSheet(n), false, n);
  for (const n of ["2026 SUMMARY (2)", "2025 SUMMARY", "DG3 SUMMARY 2025", "dg3 summary 2025 ", "SUMMARY 2025"]) assert.equal(isSummarySheet(n), true, n);
  for (const n of ["2026 SUMMARY TRAINREL", "SGA SUMMARY WITH SBP ", "TEMPLATE SUMMARY SGA", "SUMMARY MANNING", "SUMMARY 2"]) assert.equal(isSummarySheet(n), false, n);
  // July 2025's book: the typo'd name and its hidden "(2)" copy — the one with the REF. NO. + CREW header is the manning sheet
  assert.deepEqual(pickSgaSheets({ "SGA SUMMARY WITH SBP ": [], "SUMMARY MANNIING": OCT25, TRAINING: [], "SUMMARY MANNIING (2)": MANNIING2 }), { manning: "SUMMARY MANNIING", training: "TRAINING", summary: null });
  // even listed first, the "(2)" copy is never picked; with no rows to tell them apart the name decides
  assert.equal(pickSgaSheets({ "SUMMARY MANNIING (2)": MANNIING2, "SUMMARY MANNIING": OCT25 }).manning, "SUMMARY MANNIING");
  assert.equal(pickSgaSheets({ "SUMMARY MANNIING (2)": [], "SUMMARY MANNING": [] }).manning, "SUMMARY MANNING");
  // September 2025: "SEPTEMBER SUMMARY MANNING" and "DG3 SUMMARY 2025"
  assert.deepEqual(pickSgaSheets({ "DG3 SUMMARY 2025": [], "SEPTEMBER SUMMARY MANNING": OCT25, TRAINING: [] }), { manning: "SEPTEMBER SUMMARY MANNING", training: "TRAINING", summary: "DG3 SUMMARY 2025" });
  // the same names reach the mail intake's sheet filter
  for (const n of ["SUMMARY MANNIING", "SEPTEMBER SUMMARY MANNING", "DG3 SUMMARY 2025", "2026 SUMMARY (2)", "2026 SUMMARY TRAINREL", "TRAINING"]) assert.equal(WANT_SGA(n), true, n);
  for (const n of ["SUMMARY MANNIING (2)", "SGA SUMMARY WITH SBP ", "4. TRAINING", "SOA ADV1"]) assert.equal(WANT_SGA(n), false, n);
  // and the Upload page's own filter is written with the same words (the page cannot import sga.js)
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  assert.match(W, /\/summary mann\?i\+ng\(\?! \*\\\\\(\\\\d\+\\\\\)\)\/i\.test\(s\)/, "the page sends every spelling of the manning sheet, never the (2) copy");
  assert.match(W, /\/\^\(dg3 \)\?\(\\\\d\{4\} summary\|summary \\\\d\{4\}\)\( \\\\\(\\\\d\+\\\\\)\)\?\$\/i\.test\(s\.trim\(\)\)/, "the page sends the summary sheet by its 2025 names too");
  assert.match(W, /\/summary mann\?i\+ng\/i\.test\(String\(n\)\)/, "the page recognises a 2025 workbook as TDG's bill");
  // an upload that swapped the spaces for underscores still says its month; the double dot of SEPTEMBER_2025..xlsx too
  assert.deepEqual(sgaPeriodFromName("REVISED_DG3_SGA_EXCEL_NOVEMBER_2025.xlsx"), { year: 2025, month: 11, source: "name" });
  assert.deepEqual(sgaPeriodFromName("DG3_SGA_EXCEL_SEPTEMBER_2025..xlsx"), { year: 2025, month: 9, source: "name" });
  assert.deepEqual(sgaPeriodFromName("REVISED DG3 SGA EXCEL AUG2025.xlsx"), { year: 2025, month: 8, source: "name" });
});
