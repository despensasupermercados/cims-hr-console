#!/usr/bin/env node
// The SharePoint pickup — what the morning session runs on ONE workbook it read through the Microsoft 365 connector
// (CLAUDE.md §10j, src/sp_inbox.js). It never touches D1 itself: it checks the dump, reports what the file holds, and
// writes the INSERT statements for sp_inbox that the session then runs with the Cloudflare D1 tool. The Worker's hourly
// cron (applyInbox) loads the month / year from there through the same path as drag-and-drop.
//
//   node scripts/sp_pickup.mjs --kind sga    --dump sept.txt --id <itemId> --name "DG3 SGA EXCEL SEPTEMBER'26.xlsx" \
//        --modified 2026-10-02T03:11:09.000Z --path "1. ACCOUNTING/SGA/2026/09 September 2026" --out sept.sql
//   node scripts/sp_pickup.mjs --kind travel --dump trav.txt --id <itemId> --name "UPDATED - Travel Expenses 2026 ….xlsx" \
//        --modified <iso> --path "1. ACCOUNTING/Travel Expenses Crew" --year 2026 --out trav.sql
//
// Prints ONE JSON line. ok:true → the SQL file is written (run every statement); ok:false → nothing is written, `reason`
// says why (a sheet the connector's read budget cut, no SUMMARY MANNING, …) — report it, never load a partial file.
// Exit 0 when ok, 2 when refused, 1 on a usage error.
import { readFileSync, writeFileSync } from "node:fs";
import { dumpToSheets, sgaFromDump, travelFromDump, inboxParts, inboxFileKey } from "../src/sp_inbox.js";
import { parseSgaManning, parseSgaTraining, pickSgaSheets, sgaPeriodOf } from "../src/sga.js";
import { parseTravelSheets, summarize } from "../src/travel.js";

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith("--")) { args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true"; } }
const need = ["kind", "dump", "id", "name", "modified", "path", "out"];
const miss = need.filter((k) => !args[k]);
if (miss.length || !["sga", "travel"].includes(args.kind) || (args.kind === "travel" && !/^\d{4}$/.test(args.year || ""))) {
  console.log(JSON.stringify({ ok: false, reason: "usage", detail: "missing " + (miss.join(", ") || "a valid --kind / --year") }));
  process.exit(1);
}

const q = (v) => v == null ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const parsed = dumpToSheets(readFileSync(args.dump, "utf8"));
const base = { file: args.name, declared: parsed.declared, complete: parsed.complete.length, cut: parsed.cut, missing: parsed.missing };
let picked, year = args.year ? +args.year : null, month = null, report = {};

if (args.kind === "sga") {
  picked = sgaFromDump(parsed);
  if (picked.ok) {
    const pick = pickSgaSheets(picked.sheets);
    // the month is the FILE's — its name, else its folder; the ref's "09" is not a month (src/sga.js REF_RE)
    const per = sgaPeriodOf(args.name, args.path);
    const m = per ? parseSgaManning(picked.sheets[pick.manning], per) : null;
    if (!per) picked = { ok: false, reason: "no_period", detail: "neither the file name nor the path carries the month" };
    else if (m.error) picked = { ok: false, reason: "no_header", detail: "SUMMARY MANNING has no REF. NO. header row" };
    else {
      {
        year = per.year; month = per.month;
        const sum = Math.round(m.records.reduce((a, r) => a + (r.amount || 0), 0) * 100) / 100;
        const others = m.others.reduce((a, o) => a + (o.amount || 0), 0);
        const tr = pick.training ? parseSgaTraining(picked.sheets[pick.training]) : [];
        report = { period: { year, month, source: per.source }, sga_no: m.meta.sgaNo, sga_date: m.meta.date, lines: m.records.length, total: sum, others, grand_total: m.grand_total,
          reconciles: m.grand_total == null ? null : Math.abs(sum + others - m.grand_total) < 0.05, training_months: tr.filter((t) => !t.summary_only).length, training_sheet: picked.training, training_cut: picked.trainingCut || null };
      }
    }
  }
} else {
  picked = travelFromDump(parsed);
  if (picked.ok) {
    const recs = parseTravelSheets(picked.sheets, year);
    const s = summarize(recs);
    report = { year, month_sheets: picked.months, cims_sheet: picked.cims, records: recs.length, total: s.total, byKind: s.byKind };
  }
}

if (!picked.ok) {
  console.log(JSON.stringify({ ok: false, reason: picked.reason, detail: picked.detail || null, ...base }));
  process.exit(2);
}

const fileKey = inboxFileKey(args.id, args.modified);
const at = new Date().toISOString();
const by = args.by || "sharepoint-pickup";
const parts = inboxParts(picked.sheets);
const cols = "id, file_key, kind, year, month, item_id, name, path, modified, sheet, part, parts, file_parts, rows_json, written_by, at, status";
const sql = parts.map((p, i) => "INSERT OR REPLACE INTO sp_inbox (" + cols + ") VALUES (" + [
  "inb_" + fileKey.replace(/[^A-Za-z0-9]/g, "").slice(0, 48) + "_" + String(i).padStart(2, "0"), fileKey, args.kind, year, month, args.id, args.name, args.path, args.modified, p.sheet, p.part, p.parts, p.file_parts, p.rows_json, by, at, "pending",
].map(q).join(", ") + ");");
writeFileSync(args.out, sql.join("\n") + "\n", "utf8");
console.log(JSON.stringify({ ok: true, kind: args.kind, file_key: fileKey, statements: sql.length, largest_statement: Math.max(...sql.map((s) => s.length)), out: args.out, ...base, ...report }));
