// TDG's completed-contract COUNT file (src/contract_count.js), pinned on the real shape of the file
// Miguel handed over on 24 Sep 2026 — two tabs, four columns, ids in three formats, the count as prose.
//
// Why a count file at all: the console derived contracts from Counter dates and was low on 18 of 41
// crew (Espenilla Zandro: TDG 7, derived 0). Rank sits on this number. The count is an import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCountTab, parseCompletedContracts, bridgeCounts, diffCounts, normId } from "../src/contract_count.js";

const HEAD = ["CREW ID", "CREW NAME", "COMPLETED CONTRACTS", "POSITION"];
const ACTIVE = [
  HEAD,
  ["\tPCN 6141HEL65159", "Domingo, Adrian Dexter", "4 Contracts", "Printer Specialist"],
  ["493010", "Espenilla, Zandro", "7 Contracts", "Senior Printer Specialist"],
  ["", "", "", ""],                                                   // the spacer rows the sheet has
  ["569037", "Olid, Jim", "2 Contract", "Printer Specialist"],         // wording drifts
  ["500945", "Sarmiento, John Mc Claine", "1 Contracts", "Printer Specialist"],
  ["647250", "Encina, Ariel Rafhael", "Ongoing", "Junior Printer Specialist"],
  ["349195", "Ida Bagus", "3 Contracts", "Printer Specialist"],       // first-name only in the file
];
const INACTIVE = [
  HEAD,
  ["517755", "Paygane, Erik", "2 Contracts", "Printer Specialist"],
  ["PCN: 6741MAI39126 ", "Cucio, Almond Christian", "4 Contracts", "Printer Specialist"],
  ["517755", "Paygane, Erik", "4 Contracts", "Printer Specialist"],   // the real duplicate, different count
  ["AZAM488831", "Ruiz, Matilde", "2 Contracts", "Printer Specialist"],
  ["999", "Broken, Row", "some day", "Printer Specialist"],
];

test("ids come in three formats and the PCN prefix is stripped, tab or no tab, colon or no colon", () => {
  assert.equal(normId("\tPCN 6141HEL65159"), "6141HEL65159");
  assert.equal(normId("PCN: 6741MAI39126 "), "6741MAI39126");
  assert.equal(normId("PCN6141HEL58212"), "6141HEL58212");
  assert.equal(normId("493010.0"), "493010", "a spreadsheet float artifact");
  assert.equal(normId("AZAM488831"), "AZAM488831");
});

test("the count is read from prose, whatever the wording, and Ongoing is zero, not unknown", () => {
  const { rows, unparsed } = parseCountTab(ACTIVE, "ACTIVE");
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by["6141HEL65159"].completed, 4);
  assert.equal(by["493010"].completed, 7);
  assert.equal(by["493010"].position, "Senior Printer Specialist");
  assert.equal(by["569037"].completed, 2, "'2 Contract' (singular) still reads 2");
  assert.equal(by["500945"].completed, 1, "'1 Contracts' still reads 1");
  assert.equal(by["647250"].completed, 0, "Ongoing = a junior with no completed contract yet");
  assert.equal(rows.length, 6, "the spacer row is not a crew");
  assert.equal(unparsed.length, 0);
});

test("a row whose count cannot be read is reported, never guessed", () => {
  const { rows, unparsed } = parseCountTab(INACTIVE, "INACTIVE");
  assert.equal(unparsed.length, 1);
  assert.equal(unparsed[0].raw, "some day");
  assert.ok(!rows.some((r) => r.id === "999"));
});

test("both tabs are required — a half file is refused, not half-imported", () => {
  const r = parseCompletedContracts({ ACTIVE });
  assert.equal(r.error, "need_both_tabs");
  assert.deepEqual(r.rows, []);
  const ok = parseCompletedContracts({ " active ": ACTIVE, "Inactive": INACTIVE });
  assert.equal(ok.error, undefined, "tab names match case-insensitively, trimmed");
  assert.deepEqual(ok.tabs, { ACTIVE: 6, INACTIVE: 4 });
});

test("a crew id that appears twice with different counts is flagged and NOT imported (§6)", () => {
  const r = parseCompletedContracts({ ACTIVE, INACTIVE });
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].id, "517755");
  assert.deepEqual(r.duplicates[0].rows.map((x) => x.completed), [2, 4]);
  assert.ok(!r.rows.some((x) => x.id === "517755"), "neither Paygane row reaches the import");
});

const ROSTER = [
  { agency_id: "SC-0026127", first_name: "Adrian Dexter", last_name: "Domingo", ship_crew_id: "515277" }, // km differs from the file's PCN
  { agency_id: "SC-0038467", first_name: "Zandro", last_name: "Espenilla", ship_crew_id: "493010" },
  { agency_id: "SC-0040153", first_name: "Jim", last_name: "Olid", ship_crew_id: "569037" },
  { agency_id: "SC-0040197", first_name: "John Mc Claine", last_name: "Sarmiento", ship_crew_id: null },
  { agency_id: "SC-0040010", first_name: "Ida Bagus Made", last_name: "Purnama", ship_crew_id: "349195" },
  { agency_id: "SC-0037896", first_name: "Almond Christian", last_name: "Cucio", ship_crew_id: "527885" },
];

test("bridging: cruise-line id first, then last|first, then a unique surname — and unmatched stays unmatched", () => {
  const parsed = parseCompletedContracts({ ACTIVE, INACTIVE });
  const { matched, unmatched } = bridgeCounts(parsed, ROSTER);
  const sc = Object.fromEntries(matched.map((m) => [m.id, m.sc]));
  assert.equal(sc["493010"], "SC-0038467", "by ship_crew_id");
  assert.equal(sc["349195"], "SC-0040010", "'Ida Bagus' has no surname in the file; the id carries it");
  assert.equal(sc["6141HEL65159"], "SC-0026127", "PCN id unknown to the console: falls to last|first");
  assert.equal(sc["500945"], "SC-0040197", "no ship_crew_id on the roster: name match");
  assert.equal(sc["6741MAI39126"], "SC-0037896", "unique surname");
  const names = unmatched.map((u) => u.name);
  assert.ok(names.includes("Encina, Ariel Rafhael"), "not on the roster given (redacted in prod) -> unmatched, not invented");
  assert.ok(names.includes("Ruiz, Matilde"));
});

test("the diff says before -> after per crew and carries the date-derived number for the comparison", () => {
  const parsed = parseCompletedContracts({ ACTIVE, INACTIVE });
  const { matched } = bridgeCounts(parsed, ROSTER);
  const { changes, same } = diffCounts(matched, { "SC-0038467": 7, "SC-0040153": 1 }, { "SC-0038467": 0, "SC-0040153": 1 });
  const z = changes.find((c) => c.sc === "SC-0038467"), o = changes.find((c) => c.sc === "SC-0040153");
  assert.equal(z, undefined, "already 7 in the console: unchanged");
  assert.ok(same.some((c) => c.sc === "SC-0038467"));
  assert.deepEqual([o.before, o.after, o.derived], [1, 2, 1]);
  assert.equal(changes[0].after - (changes[0].before || 0) >= changes[changes.length - 1].after - (changes[changes.length - 1].before || 0), true, "biggest rises first");
});
