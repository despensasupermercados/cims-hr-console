// The count IMPORT route (apiContractCountImport) end to end against a recording D1 fake:
//   1. dry-run writes nothing and reports before -> after, duplicates, unmatched, unparsed;
//   2. apply upserts the MATCHED crew only, stamped with the file's as-of date;
//   3. a duplicate id in the file never reaches the table (§6: flag, never pick);
//   4. a half file (one tab) is refused before any read.
// And the board: rotationSections' Contracts number is TDG's count when it exists, the date-derived
// count only for a crew the count file does not carry — plus the board now reports its own age.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__cnt_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { apiContractCountImport, KEYMAN_VERSION };\n", "utf-8");
let apiContractCountImport, KEYMAN_VERSION;
try { ({ apiContractCountImport, KEYMAN_VERSION } = await import(TMP.href)); } finally { unlinkSync(TMP); }

const HEAD = ["CREW ID", "CREW NAME", "COMPLETED CONTRACTS", "POSITION"];
const SHEETS = {
  ACTIVE: [HEAD,
    ["493010", "Espenilla, Zandro", "7 Contracts", "Senior Printer Specialist"],
    ["569037", "Olid, Jim", "2 Contracts", "Printer Specialist"],
    ["647250", "Encina, Ariel Rafhael", "Ongoing", "Junior Printer Specialist"]],
  INACTIVE: [HEAD,
    ["517755", "Paygane, Erik", "2 Contracts", "Printer Specialist"],
    ["517755", "Paygane, Erik", "4 Contracts", "Printer Specialist"]],
};
const ROSTER = [
  { agency_id: "SC-0038467", first_name: "Zandro", last_name: "Espenilla", ship_crew_id: "493010" },
  { agency_id: "SC-0040153", first_name: "Jim", last_name: "Olid", ship_crew_id: "569037" },
  { agency_id: "SC-0038385", first_name: "Erik", last_name: "Paygane", ship_crew_id: "517755" },
];

function fakeEnv(state = {}) {
  const writes = [], batches = [];
  const DB = {
    prepare(sql) {
      const S = String(sql).replace(/\s+/g, " ").trim();
      const s = { sql: S, args: [] };
      s.bind = (...a) => ({ ...s, args: a });
      s.run = async function () { writes.push(this); return { meta: { changes: 1 } }; };
      s.first = async () => null;
      s.all = async () => {
        if (S.startsWith("SELECT agency_id, first_name, last_name, ship_crew_id FROM crew")) return { results: ROSTER };
        if (S.startsWith("SELECT sc, completed FROM contract_count")) return { results: state.current || [] };
        return { results: [] }; // KC3_LEGS_SQL (the derived fallback) and anything else: empty
      };
      return s;
    },
    async batch(stmts) { batches.push(stmts); for (const st of stmts) writes.push(st); return stmts.map(() => ({ success: true })); },
  };
  return { env: { DB }, writes, batches };
}
const req = (body) => ({ json: async () => body });
const session = { email: "miguel@example.invalid" };
const dataWrites = (writes) => writes.filter((w) => /^INSERT INTO contract_count/.test(w.sql));

test("dry-run: nothing written; before -> after per crew, the duplicate flagged, the unmatched named", async () => {
  const { env, writes } = fakeEnv({ current: [{ sc: "SC-0040153", completed: 1 }] });
  const r = await (await apiContractCountImport(req({ sheets: SHEETS, asOf: "2026-09-24", dryRun: true }), env, session)).json();
  assert.equal(r.dryRun, true);
  assert.equal(r.asOf, "2026-09-24");
  assert.deepEqual(r.tabs, { ACTIVE: 3, INACTIVE: 2 });
  assert.equal(r.matched, 2, "Espenilla and Olid; Encina is not on this roster; Paygane is a duplicate");
  assert.equal(r.unmatched, 1);
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].id, "517755");
  const olid = r.changes.find((c) => c.sc === "SC-0040153"), zandro = r.changes.find((c) => c.sc === "SC-0038467");
  assert.deepEqual([olid.before, olid.after], [1, 2]);
  assert.deepEqual([zandro.before, zandro.after], [null, 7], "never counted before");
  assert.equal(dataWrites(writes).length, 0, "a dry-run writes nothing");
});

test("apply: matched crew upserted with the as-of date; the duplicate and the unmatched never reach the table", async () => {
  const { env, writes } = fakeEnv();
  const r = await (await apiContractCountImport(req({ sheets: SHEETS, asOf: "2026-09-24" }), env, session)).json();
  assert.equal(r.ok, true);
  assert.equal(r.applied, 2);
  const rows = dataWrites(writes);
  assert.equal(rows.length, 2);
  const bySc = Object.fromEntries(rows.map((w) => [w.args[0], w.args]));
  assert.deepEqual(bySc["SC-0038467"].slice(1, 6), ["493010", 7, "Senior Printer Specialist", "ACTIVE", "2026-09-24"]);
  assert.deepEqual(bySc["SC-0040153"].slice(1, 6), ["569037", 2, "Printer Specialist", "ACTIVE", "2026-09-24"]);
  assert.equal(bySc["SC-0038385"], undefined, "Paygane: the file says 2 and 4 — nothing is written until it says one thing");
  assert.match(rows[0].sql, /ON CONFLICT\(sc\) DO UPDATE/, "an upsert: re-importing a newer file replaces, never duplicates");
  assert.equal(bySc["SC-0038467"][7], "miguel@example.invalid", "who imported it is on the row");
});

test("a file with one tab is refused before any read", async () => {
  const { env, writes } = fakeEnv();
  const res = await apiContractCountImport(req({ sheets: { ACTIVE: SHEETS.ACTIVE } }), env, session);
  assert.equal(res.status, 400);
  const r = await res.json();
  assert.equal(r.error, "need_both_tabs");
  assert.equal(dataWrites(writes).length, 0);
});

test("no as-of in the request: the import day is used, never an invented one", async () => {
  const { env } = fakeEnv();
  const r = await (await apiContractCountImport(req({ sheets: SHEETS, dryRun: true }), env, session)).json();
  assert.match(r.asOf, /^\d{4}-\d{2}-\d{2}$/);
  const bad = await (await apiContractCountImport(req({ sheets: SHEETS, asOf: "24 Sep 2026", dryRun: true }), env, session)).json();
  assert.match(bad.asOf, /^\d{4}-\d{2}-\d{2}$/, "an unparseable as-of falls back rather than being stored as text");
});

test("the board reads TDG's count and says its own age (static: the wave carries both reads)", () => {
  const src = readFileSync(SRC, "utf-8");
  const body = src.slice(src.indexOf("async function rotationSections("), src.indexOf("// Days worked THIS MONTH"));
  // Both new reads sit INSIDE the one concurrent wave (§12), not as a second await.
  // The READ wave is the destructuring one (`const [HIST, ...] = await Promise.all([`); the ensure wave
  // comes first in the function and closes before it.
  const at = body.indexOf("= await Promise.all([");
  const wave = body.slice(at, body.indexOf("]);", at));
  assert.match(wave, /FROM contract_count/, "TDG's count is read in the wave");
  assert.match(wave, /MAX\(imported_at\) AS stamp, COUNT\(\*\) AS rows, COUNT\(DISTINCT sc\) AS crew FROM keyman_contract3/, "the Counter's age is read in the wave");
  // The imported count overrides the date-derived one, per crew, and the derived stays as the fallback.
  assert.match(body, /for \(const sc in tdgCount\) contracts\[sc\] = tdgCount\[sc\];/);
  assert.match(body, /contracts\[sc\] = fullContracts\(/, "derived remains the fallback for a crew the count file does not carry");
  // ...and the response says where its numbers come from.
  assert.match(body, /sources, inDock/);
  assert.match(body, /seed: KEYMAN_VERSION/, "a NULL stamp is named as the bundled seed, not left blank");
  // The page renders it above the ships.
  assert.match(src, /function rotSourcesLine\(\)/);
  assert.match(src, /\+rotSourcesLine\(\)/);
  assert.match(src, /no upload since 14 Sep 2026/, "a NULL stamp is a missing STAMP, not a missing upload: the 6 Jul file predates stamping");
});

test("every grade reader takes TDG's stated count first, in its own wave, and keeps the derived fallback (static)", () => {
  // The four places a rank / base salary is computed: the crew list, the Score Card, the ledger and
  // the PDF statement. Each reads contract_count INSIDE its existing wave (§12) and passes the result
  // through cumulativeContracts, whose fallback is the pre-24-Sep baseline + derived rule.
  const src = readFileSync(SRC, "utf-8");
  const fn = (name, len = 6000) => src.slice(src.indexOf(name), src.indexOf(name) + len);
  const wave = (body) => { const at = body.indexOf("= await Promise.all(["); return body.slice(at, body.indexOf("]);", at)); };
  const crew = fn("async function apiCrew(");
  assert.match(wave(crew), /contractCountMap\(env\)/, "crew list: the count is read in the wave");
  assert.match(crew, /ensureContractCount\(env\)\]\)/, "crew list: the table is ensured in the ensure wave, not per crew");
  const bonus = fn("async function apiBonusCrew(");
  const bonusWave2 = bonus.slice(bonus.indexOf("const [baseline, outs, legRowsRes, tdgRow]"));
  assert.match(bonusWave2.slice(0, bonusWave2.indexOf("]);")), /FROM contract_count WHERE sc=\?/, "Score Card: the count is read in the second wave");
  assert.match(bonus, /cumulativeContracts\(tdgRow \? tdgRow\.completed : null, baseline, legN\)/);
  assert.match(bonus, /fullContracts\(legRows\.map\(legShape\)\)/, "the derived number is still computed — it is the fallback");
  const ledger = fn("async function apiContracts(");
  assert.match(wave(ledger), /contractCountMap\(env\)/, "ledger: the count is read in the wave");
  assert.match(ledger, /cumulativeContracts\(TDG\[b\.agency_id\]/);
  const stmt = fn("async function gatherStatement(", 3000);
  assert.match(stmt, /FROM contract_count WHERE sc=\?/);
  assert.match(stmt, /cumulativeContracts\(tdgRow \? tdgRow\.completed : null, baseline, fc\)/);
  // Every one of them says where its number came from.
  for (const [n, body] of [["crew", crew], ["bonus", bonus], ["ledger", ledger], ["statement", stmt]]) assert.match(body, /contracts_source: cc\.source/, n + " reports contracts_source");
  // The consecutive bonus count (money, §1) is not what changed: crewCount / contractLedgerRow still feed `count`.
  assert.match(bonus, /const count = await crewCount\(env, cr\.id, baseline\)/);
  assert.match(ledger, /contractLedgerRow\(b\.baseline_count, ov\.baseline_count, lo\)/);
  assert.match(bonus, /nextRungIfClean: ladderValue\(count \+ 1\)/, "the ladder still reads the consecutive count, never the cumulative one");
});

test("the page labels the two counts apart: completed (grade) vs bonus count (consecutive)", () => {
  const src = readFileSync(SRC, "utf-8");
  // Before this change the crew card printed the CONSECUTIVE bonus count under the label
  // "completed contract(s)" — a crew reset by a gate read as having completed fewer contracts.
  assert.match(src, /\(bz\.contracts!=null\?bz\.contracts:0\)\+' completed contract\(s\) '\+ctSrc\(bz\)/);
  assert.match(src, /tile\(\(bz\.count!=null\?bz\.count:0\),'Bonus count \(consecutive\)'\)/);
  assert.match(src, /d\.rank\+' \('\+d\.contracts\+' completed '\+ctSrc\(d\)\+'\) · Bonus count <b>'\+d\.count/);
  assert.match(src, /function ctSrc\(x\)/);
  assert.match(src, /date-derived, count file not loaded/, "a missing count file is said, in amber, not hidden");
});
