// THE 16 OCT 2026 BUG HUNT — the imports (Miguel: "read the code.. find bugs and fix them .. also review the logic").
// Each case was reproduced on the old code first. Pure modules here; the Worker-side plumbing is in
// test/bughunt_1016_plumbing.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRowFull } from "../src/crewimport.js";
import { buildBridge, bridgeName } from "../src/keymanimport.js";

// TDG writes "-" for an empty cell (every On board row's DEBARKEDDATE, a passport expiry on the 7 Oct 2026 file). The date
// cells already read it as blank; a TEXT cell did not: "-" became the crew's province, phone, passport number or SHIP
// ("-" as a hull → an unknown_ship row), and a "-" never cleared the card (blankCell saw a non-empty cell).
test("I1/I2: a lone '-' in a text cell is TDG's blank — null on the row, and it CLEARS the card like an empty cell", () => {
  const row = { "CREW ID": "SC-0040010", "FIRST NAME": "Ida", "LAST NAME": "Purnama", "STATUS": "On Vacation",
    "VESSEL": "-", "PROVINCE": "-", "MOBILE NO.": "-", "PASSPORT NO.": "-", "RANK": "Printer Specialist", "EMAIL": "" };
  const { row: m } = mapRowFull(row);
  assert.equal(m.vessel_observed, null, "'-' is not a ship");
  assert.equal(m.province, null); assert.equal(m.phone, null); assert.equal(m.pp_no, null);
  assert.equal(m.rank_observed, "Printer Specialist", "a real value stays");
  const blank = (m._blank || []).slice().sort();
  assert.deepEqual(blank, ["email", "phone", "pp_no", "province", "vessel_observed"], "'-' clears exactly as an empty cell does");
});

test("I1: the identity never reads '-' as a value, and a real dash inside a value is kept", () => {
  assert.equal(mapRowFull({ "CREW ID": "-", "FIRST NAME": "X", "LAST NAME": "Y", "STATUS": "On board" }), null, "no agency id");
  const { row: m } = mapRowFull({ "CREW ID": "SC-1", "FIRST NAME": "Jean-Paul", "LAST NAME": "Y", "STATUS": "On board", "MOBILE NO.": "+63-917-000", "PROVINCE": "Ilocos-Norte" });
  assert.equal(m.first_name, "Jean-Paul"); assert.equal(m.phone, "+63-917-000"); assert.equal(m.province, "Ilocos-Norte");
});

// Two roster rows carrying the SAME cruise-line id (Purnama's duplicate of 6 Sep 2026 kept 349195 on both rows until it
// was retired): byKm kept whichever row was listed last, so a Counter / count-file row on that id landed on one of the
// two by list order. The id resolves NOBODY (§6: flag, never pick) and the name ladder decides, as it does for a blank id.
test("I4: a cruise-line id shared by two roster rows is ambiguous — it resolves nobody, the name ladder still can", () => {
  const roster = [
    { agency_id: "SC-A", last_name: "Purnama", first_name: "Ida Bagus Made", ship_crew_id: "349195" },
    { agency_id: "SC-B", last_name: "Purnama", first_name: "Ida", ship_crew_id: "349195" },
    { agency_id: "SC-C", last_name: "Olid", first_name: "Jim", ship_crew_id: "569037" },
  ];
  const b = buildBridge(roster);
  assert.equal(Object.prototype.hasOwnProperty.call(b.byKm, "349195"), false, "the shared id is not a bridge");
  assert.equal(b.byKm["569037"], "SC-C", "a unique id still is");
  assert.equal(bridgeName({ km: "349195", last: "Olid", first: "Jim" }, b), "SC-C", "the name ladder decides a row carrying the ambiguous id");
  assert.equal(bridgeName({ km: "349195", last: "Nobody", first: "At All" }, b), null, "and never a guess by list order");
});
