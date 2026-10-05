// registry_sync.js — what an AdvancedQuery upload says about Rita's projections.
//
// Miguel, 5 Oct 2026, Jewel: "if the person is onboard .. and if rita has already a card in there .. it
// should automatically compare with what the tdg file has and deploy it and remove the one in draft".
// Rita had dropped the registry file five times since Gayda's projection was made (9 Jul) and the card
// still read "Your projection · not in a TDG file yet": the registry import never looked at the board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileProjections, projectionSummary, VERDICTS } from "../src/registry_sync.js";
import { strictShipMatcher } from "../src/crew_flags.js";
import { VESSEL_REF } from "../src/vessel_ref.js";

const TODAY = "2026-10-05";
const shipOf = strictShipMatcher(VESSEL_REF);
const P = (o) => ({ id: "as_" + o.sc, crew_name: o.sc + " name", planned_sign_off: "2027-04-01", ...o });

test("the file has them ON BOARD the projected ship: confirmed — the loop closes", () => {
  const { items, counts } = reconcileProjections({
    projections: [P({ sc: "SC-1", ship: "Jewel", sign_on: "2026-07-20" })],
    registry: [{ agency_id: "SC-1", status: "On board", vessel_observed: "MV JEWEL OF THE SEAS" }],
    today: TODAY, shipOf,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].verdict, "confirmed");
  assert.equal(items[0].file.ship_canon, "Jewel", "the strict hull matcher reads TDG's long name");
  assert.equal(counts.confirmed, 1);
});

test("Gayda, 4 Oct: the card says aboard Jewel since 20 Jul, the file says Inactive with no ship — ashore, flagged, never removed", () => {
  const { items } = reconcileProjections({
    projections: [P({ sc: "SC-0044872", ship: "Jewel", sign_on: "2026-07-20" })],
    registry: [{ agency_id: "SC-0044872", status: "Inactive", vessel_observed: null }],
    today: TODAY, shipOf,
  });
  assert.equal(items[0].verdict, "ashore");
  assert.equal(items[0].aboard_by_card, true);
  assert.deepEqual(items[0].file, { status: "Inactive", ship: null, ship_canon: null });
});

test("the file puts them on ANOTHER ship: elsewhere, whether aboard or earmarked there", () => {
  const { items } = reconcileProjections({
    projections: [
      P({ sc: "SC-0040153", ship: "Liberty", sign_on: "2026-10-31" }),   // Olid: planned Liberty, file says Odyssey
      P({ sc: "SC-2", ship: "Icon", sign_on: "2026-12-12" }),
    ],
    registry: [
      { agency_id: "SC-0040153", status: "On board", vessel_observed: "MV ODYSSEY OF THE SEAS" },
      { agency_id: "SC-2", status: "Earmarked", vessel_observed: "MV HARMONY OF THE SEAS" },
    ],
    today: TODAY, shipOf,
  });
  const by = Object.fromEntries(items.map((i) => [i.sc, [i.verdict, i.file.ship_canon]]));
  assert.deepEqual(by, { "SC-0040153": ["elsewhere", "Odyssey"], "SC-2": ["elsewhere", "Harmony"] });
});

test("earmarked for THIS ship corroborates a future plan; earmarked elsewhere while the card says aboard is ashore", () => {
  const { items } = reconcileProjections({
    projections: [
      P({ sc: "SC-3", ship: "Constellation", sign_on: "2026-10-05" }),
      P({ sc: "SC-4", ship: "Jewel", sign_on: "2026-07-20" }),
    ],
    registry: [
      { agency_id: "SC-3", status: "Earmarked", vessel_observed: "MV CELEBRITY CONSTELLATION" },
      { agency_id: "SC-4", status: "Earmarked", vessel_observed: "MV CELEBRITY SUMMIT" },
    ],
    today: TODAY, shipOf,
  });
  const by = Object.fromEntries(items.map((i) => [i.sc, i.verdict]));
  assert.equal(by["SC-3"], "earmarked");
  assert.equal(by["SC-4"], "ashore");
});

test("a future plan the file neither confirms nor contradicts is pending; an unreadable status or vessel never confirms", () => {
  const { items, counts } = reconcileProjections({
    projections: [
      P({ sc: "SC-5", ship: "Icon", sign_on: "2026-12-12" }),       // On Vacation today, plan is in December
      P({ sc: "SC-6", ship: "Icon", sign_on: "2026-07-01" }),       // On board, vessel cell unreadable
      P({ sc: "SC-7", ship: "Icon", sign_on: "2026-07-01" }),       // status blank
    ],
    registry: [
      { agency_id: "SC-5", status: "On Vacation", vessel_observed: "MV HARMONY OF THE SEAS" },
      { agency_id: "SC-6", status: "On board", vessel_observed: "Here" },
      { agency_id: "SC-7", status: null, vessel_observed: "MV ICON OF THE SEAS" },
    ],
    today: TODAY, shipOf,
  });
  assert.deepEqual(items.map((i) => i.verdict), ["pending", "pending", "pending"]);
  assert.equal(counts.confirmed, 0);
});

test("a crew the file does not carry gets NO verdict: silence is not a contradiction", () => {
  const { items } = reconcileProjections({
    projections: [P({ sc: "SC-8", ship: "Icon", sign_on: "2026-07-01" })],
    registry: [{ agency_id: "SC-9", status: "On board", vessel_observed: "MV ICON OF THE SEAS" }],
    today: TODAY, shipOf,
  });
  assert.equal(items.length, 0);
  assert.equal(reconcileProjections({}).items.length, 0);
  assert.equal(reconcileProjections({ projections: null, registry: null }).items.length, 0);
});

test("the ship match is the STRICT matcher: an ambiguous or unknown hull never confirms", () => {
  const { items } = reconcileProjections({
    projections: [P({ sc: "SC-1", ship: "Star", sign_on: "2026-07-01" })],
    registry: [{ agency_id: "SC-1", status: "On board", vessel_observed: "MV STARLIGHT" }],
    today: TODAY, shipOf,
  });
  assert.equal(items[0].verdict, "pending", "'STARLIGHT' is not Star of the Seas");
});

test("items come back confirmed first, then earmarked, elsewhere, ashore, pending; counts cover every verdict", () => {
  const { items, counts } = reconcileProjections({
    projections: [
      P({ sc: "SC-a", ship: "Icon", sign_on: "2026-07-01" }),
      P({ sc: "SC-b", ship: "Icon", sign_on: "2026-07-01" }),
      P({ sc: "SC-c", ship: "Icon", sign_on: "2026-12-01" }),
    ],
    registry: [
      { agency_id: "SC-a", status: "Inactive", vessel_observed: null },
      { agency_id: "SC-b", status: "On board", vessel_observed: "MV ICON OF THE SEAS" },
      { agency_id: "SC-c", status: "On Vacation", vessel_observed: null },
    ],
    today: TODAY, shipOf,
  });
  assert.deepEqual(items.map((i) => i.verdict), ["confirmed", "ashore", "pending"]);
  assert.deepEqual(Object.keys(counts).sort(), [...VERDICTS].sort());
  assert.equal(projectionSummary(counts), "1 projection confirmed aboard by the file · 1 card aboard per your board but not per the file");
  assert.equal(projectionSummary({}), "");
});
