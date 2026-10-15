// TDG's SGA workbook parsers (src/sga.js), on the layout of DG3 SGA EXCEL SEPTEMBER'26 / AUGUST'2026 — synthetic
// amounts, the real column words and the real ref format. Columns are found by header text because they move
// month to month (September 2026 gained ID NUMBER / NATIONALITY / HMO).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSgaManning, parseSgaTraining, summarizeSga, pickSgaSheets, sgaManningHeader, REF_RE } from "../src/sga.js";

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

test("the ref carries ship code, year, month, SGA number and sequence", () => {
  const m = REF_RE.exec("SYS-2026-09-39-02");
  assert.deepEqual(m.slice(1), ["SYS", "2026", "09", "39", "02"]);
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
  const { meta, records, others, grand_total } = parseSgaManning(SEPT);
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
  const { records } = parseSgaManning(SEPT);
  const s = summarizeSga(records);
  assert.equal(s.rows, 5); assert.equal(s.crew, 5);
  assert.equal(s.byMonth["2026-09"], s.total);
  assert.equal(s.byBrand.royal, Math.round((1290.76 + 1552.31 + 1015.07) * 100) / 100);
  assert.equal(s.byCat.air, 614); assert.equal(s.byCat.hmo, Math.round((117.64 + 123.79 + 111.49) * 100) / 100);
  assert.deepEqual(pickSgaSheets({ "SGA SUMMARY WITH SBP ": [], "2026 SUMMARY TRAINREL": [], "SUMMARY MANNING": [], "SOA ADV1": [] }), { manning: "SUMMARY MANNING", training: "2026 SUMMARY TRAINREL" });
  assert.deepEqual(pickSgaSheets({ TRAINING: [], "SUMMARY MANNING ": [] }), { manning: "SUMMARY MANNING ", training: "TRAINING" });
});
