import { test } from "node:test";
import assert from "node:assert/strict";
import { normDate, parseContractCounter, buildBridge, bridgeName, buildKeymanRows } from "../src/keymanimport.js";

// ---------------- EXISTING GOLDEN TESTS (unchanged) ----------------
test("normDate handles ISO, datetime strings, M/D/YYYY, Date objects, and junk", () => {
  assert.equal(normDate("2024-05-01"), "2024-05-01");
  assert.equal(normDate("2024-05-01 00:00:00"), "2024-05-01");
  assert.equal(normDate("5/1/2024"), "2024-05-01");
  assert.equal(normDate(new Date("2024-05-01T00:00:00Z")), "2024-05-01");
  assert.equal(normDate(""), null);
  assert.equal(normDate("not a date"), null);
});

const AOA = [
  ["Company", "Ship", "Status", "Ships's Crew ID", "Last Name", "Name", "Sign on Date", "Projected Sign off Date", "Ttl Months"],
  [null, null, null, null, null, null, "1st Contract", null, null],
  ["RCCL", "Radiance", "Onboard", "526444", "Mangulabnan", "Jomar", "2022-02-11", "2022-11-19", "9 mos", "2023-01-14", "2023-09-22", "8 mos"],
  ["AZAM", "Onward", "Onvacation", "999999", "Nobody", "Ghost", "2024-01-01", "2024-06-01", "5 mos"],
  [null, null, null, null, null, null], // blank
];

test("parseContractCounter: pulls crew + their contract blocks, skips header/blank rows", () => {
  const p = parseContractCounter(AOA);
  assert.equal(p.length, 2);
  const jomar = p[0];
  assert.equal(jomar.km, "526444");
  assert.equal(jomar.last, "Mangulabnan");
  assert.equal(jomar.ship, "Radiance");
  assert.equal(jomar.contracts.length, 2);
  assert.deepEqual(jomar.contracts[0], { seq: 1, on: "2022-02-11", proj: "2022-11-19" });
  assert.deepEqual(jomar.contracts[1], { seq: 2, on: "2023-01-14", proj: "2023-09-22" });
});

const ROSTER = [
  { agency_id: "SC-0038391", last_name: "Mangulabnan", first_name: "Jomar" },
  { agency_id: "SC-0099999", last_name: "Santos", first_name: "Mark" },
];

test("bridgeName: matches by full name; unmatched crew are reported, not invented", () => {
  const b = buildBridge(ROSTER);
  assert.equal(bridgeName({ last: "Mangulabnan", first: "Jomar" }, b), "SC-0038391");
  assert.equal(bridgeName({ last: "Nobody", first: "Ghost" }, b), null);
});

test("buildKeymanRows: matched crew -> keyman rows; unmatched listed", () => {
  const { rows, matched, unmatched } = buildKeymanRows(parseContractCounter(AOA), ROSTER);
  assert.deepEqual(matched, ["SC-0038391"]);
  assert.equal(rows.length, 2);                 // Jomar's two contracts
  assert.equal(rows[0].sc, "SC-0038391");
  assert.equal(rows[0].sign_on, "2022-02-11");
  assert.equal(rows[0].act_off, null);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].last, "Nobody");
});

// ---------------- NEW: persistent cruise-line id (ship_crew_id) bridge ----------------
const ROSTER_KM = [
  { agency_id: "SC-0038391", last_name: "Mangulabnan", first_name: "Jomar", ship_crew_id: "526444" },
  { agency_id: "SC-0099999", last_name: "Santos", first_name: "Mark", ship_crew_id: "111222" },
  { agency_id: "SC-0044444", last_name: "Cruz", first_name: "Juan", ship_crew_id: null }, // not filled yet
];

test("km bridge: exact cruise-line id wins even when the sheet misspells the name", () => {
  const b = buildBridge(ROSTER_KM);
  assert.equal(bridgeName({ last: "Mangulabnann", first: "Jomarr", km: "526444" }, b), "SC-0038391");
});

test("km bridge: id wins over a name that would match a DIFFERENT crew (kills mis-bridge)", () => {
  const b = buildBridge(ROSTER_KM);
  // The row's NAME is 'Santos, Mark' (SC-0099999) but its km 526444 is Jomar's. The id must win.
  assert.equal(bridgeName({ last: "Santos", first: "Mark", km: "526444" }, b), "SC-0038391");
});

test("km bridge: normalises a trailing .0 spreadsheet float artifact on either side", () => {
  const b = buildBridge([{ agency_id: "SC-1", last_name: "A", first_name: "B", ship_crew_id: "526444.0" }]);
  assert.equal(bridgeName({ last: "X", first: "Y", km: "526444" }, b), "SC-1");
  assert.equal(bridgeName({ last: "X", first: "Y", km: "526444.0" }, b), "SC-1");
});

test("fallback preserved: crew with no ship_crew_id still match by name (today's behavior)", () => {
  const b = buildBridge(ROSTER_KM);
  assert.equal(bridgeName({ last: "Cruz", first: "Juan", km: "" }, b), "SC-0044444");
  assert.equal(bridgeName({ last: "Cruz", first: "Juan" }, b), "SC-0044444"); // no km field at all
});

test("safety preserved: unknown km + no name match -> null (never invented)", () => {
  const b = buildBridge(ROSTER_KM);
  assert.equal(bridgeName({ last: "Ghost", first: "Nobody", km: "000000" }, b), null);
});

test("buildKeymanRows end-to-end: a km-only match still produces contract rows keyed by the right SC", () => {
  const aoa = [
    ["Company", "Ship", "Status", "Ships's Crew ID", "Last Name", "Name", "Sign on", "Proj", "Ttl"],
    ["RCCL", "Radiance", "Onboard", "526444", "MISSPELLED", "WRONG", "2022-02-11", "2022-11-19", "9 mos"],
  ];
  const { rows, matched, unmatched } = buildKeymanRows(parseContractCounter(aoa), ROSTER_KM);
  assert.deepEqual(matched, ["SC-0038391"]);   // matched by km despite wrong name
  assert.equal(unmatched.length, 0);
  assert.equal(rows[0].sc, "SC-0038391");
  assert.equal(rows[0].km, "526444");
});
