// registry_sync.js — what an AdvancedQuery upload says about Rita's projections.
//
// Miguel, 5 Oct 2026, Jewel: "if the person is onboard .. and if rita has already a card in there .. it
// should automatically compare with what the tdg file has and deploy it and remove the one in draft".
// Rita had dropped the registry file five times since Gayda's projection was made (9 Jul) and the card
// still read "Your projection · not in a TDG file yet": the registry import never looked at the board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileProjections, projectionSummary, registryFromStore, VERDICTS } from "../src/registry_sync.js";
import { strictShipMatcher } from "../src/crew_flags.js";
import { VESSEL_REF } from "../src/vessel_ref.js";

const TODAY = "2026-10-05";
const shipOf = strictShipMatcher(VESSEL_REF);
const P = (o) => ({ id: "as_" + o.sc, crew_name: o.sc + " name", planned_sign_off: "2027-04-01", ...o });

test("the file has them ON BOARD the projected ship: confirmed — the loop closes; a NEXT contract on the same ship is still a plan", () => {
  const { items, counts } = reconcileProjections({
    projections: [
      P({ sc: "SC-1", ship: "Jewel", sign_on: "2026-07-20" }),
      P({ sc: "SC-1", ship: "Jewel", sign_on: "2027-01-15", id: "as_next" }), // Rita's January contract on the same hull
    ],
    registry: [{ agency_id: "SC-1", status: "On board", vessel_observed: "MV JEWEL OF THE SEAS" }],
    today: TODAY, shipOf,
  });
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(by["as_SC-1"].verdict, "confirmed");
  assert.equal(by["as_SC-1"].file.ship_canon, "Jewel", "the strict hull matcher reads TDG's long name");
  assert.equal(by["as_next"].verdict, "pending", "the file speaks to the CURRENT contract: a future plan on the same ship keeps its Deploy button");
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

test("the file puts them on ANOTHER ship: elsewhere when the card says aboard HERE or TDG earmarks them elsewhere; a future plan under a crew aboard elsewhere today is normal", () => {
  const { items } = reconcileProjections({
    projections: [
      P({ sc: "SC-0040153", ship: "Liberty", sign_on: "2026-10-31" }),   // Olid: planned Liberty, file earmarks him for Odyssey
      P({ sc: "SC-2", ship: "Icon", sign_on: "2026-07-01" }),            // card aboard Icon; file: On board Harmony
      P({ sc: "SC-0038447", ship: "Utopia", sign_on: "2027-01-11" }),    // Marto: aboard Quantum today, Utopia in January — fine
    ],
    registry: [
      { agency_id: "SC-0040153", status: "Earmarked", vessel_observed: "MV ODYSSEY OF THE SEAS" },
      { agency_id: "SC-2", status: "On board", vessel_observed: "MV HARMONY OF THE SEAS" },
      { agency_id: "SC-0038447", status: "On board", vessel_observed: "MV QUANTUM OF THE SEAS" },
    ],
    today: TODAY, shipOf,
  });
  const by = Object.fromEntries(items.map((i) => [i.sc, [i.verdict, i.file.ship_canon]]));
  assert.deepEqual(by, { "SC-0040153": ["elsewhere", "Odyssey"], "SC-2": ["elsewhere", "Harmony"], "SC-0038447": ["pending", "Quantum"] });
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

/* ---- the file's word, read from what the console already holds (5 Oct 2026, "still see no updates") ---- */

test("registryFromStore: a crew with no snapshot row is read off the raw crew row + the latest open ship flag — Gayda reads ashore TODAY", () => {
  const registry = registryFromStore({
    snapshot: [],
    crew: [
      { agency_id: "SC-0044872", status: "Inactive", vessel_observed: null },                              // Gayda, 4 Oct
      { agency_id: "SC-0040153", status: "Earmarked", vessel_observed: "MV SYMPHONY OF THE SEAS" },     // Olid: registry still Symphony
      { agency_id: "SC-0046170", status: "On board", vessel_observed: null },                             // Bornea: registry ship blank, no flag
      { agency_id: "SC-0045531", status: "Earmarked", vessel_observed: "MV JEWEL OF THE SEAS" },        // De Torres: July ship on the row, no flag
      { agency_id: "SC-H", status: "On board", vessel_observed: null },                                    // Rita HELD the file's Inactive: crew.status kept
      { agency_id: "SC-M", status: "On board", vessel_observed: null, manual: true },                      // manual status edit: the file's status is unknown
      { agency_id: "SC-G", status: "On board", vessel_observed: null },                                    // not in the latest file (open presence flag)
      { agency_id: "SC-V", status: "Inactive", vessel_observed: null },                                     // Gayda-shaped, 5 Oct: Voyager flag first raised 22 Aug
    ],
    openFlags: [
      { agency_id: "SC-0040153", new_value: "MV ODYSSEY OF THE SEAS", created_at: "2026-10-04T13:12:10.010Z" },
      { agency_id: "SC-0040153", new_value: "MV LIBERTY OF THE SEAS", created_at: "2026-09-01T00:00:00.000Z" }, // older flag loses
      { agency_id: "SC-V", new_value: "MV VOYAGER OF THE SEAS", created_at: "2026-08-22T10:43:38.669Z" },
    ],
    statusAudit: [{ agency_id: "SC-H", new_value: "Inactive" }],
    absent: [{ agency_id: "SC-G" }],
    lastRun: "2026-10-04T13:12:10.010Z",
  });
  const by = Object.fromEntries(registry.map((r) => [r.agency_id, r]));
  assert.deepEqual(by["SC-0044872"], { agency_id: "SC-0044872", status: "Inactive", vessel_observed: null, run_at: "2026-10-04T13:12:10.010Z", vessel_at: null, source: "registry" });
  assert.equal(by["SC-0040153"].vessel_observed, "MV ODYSSEY OF THE SEAS", "the file's vessel lives in the newest open ship flag");
  assert.equal(by["SC-0040153"].run_at, "2026-10-04T13:12:10.010Z", "dated by the latest file");
  // Miguel, 5 Oct ("still appearing like this"): the line is dated by the LATEST file, never by an old
  // flag; the flag's own date rides along so the card can say when the hull was first named.
  assert.deepEqual(by["SC-V"], { agency_id: "SC-V", status: "Inactive", vessel_observed: "MV VOYAGER OF THE SEAS", run_at: "2026-10-04T13:12:10.010Z", vessel_at: "2026-08-22T10:43:38.669Z", source: "registry" });
  assert.equal(registryFromStore({ crew: [{ agency_id: "SC-V", status: "Inactive" }], openFlags: [{ agency_id: "SC-V", new_value: "MV VOYAGER OF THE SEAS", created_at: "2026-08-22T10:43:38.669Z" }] })[0].run_at, "2026-08-22T10:43:38.669Z", "no run recorded at all: the flag's date is the only one there is");
  assert.equal(by["SC-0046170"].vessel_observed, null);
  assert.equal(by["SC-H"].status, "Inactive", "a HELD status change: the file's word is the audit row, not crew.status");
  assert.equal(by["SC-M"].status, null, "a manual status edit: the file's status is unknown, never crew.status");
  assert.equal(by["SC-G"], undefined, "a crew the latest file does not carry gets no row: silence is not a verdict");
  assert.equal(by["SC-0045531"].vessel_observed, null, "crew.vessel_observed is NOT the file's vessel (D1 never writes it): a stale July ship must not be named");
  const { items } = reconcileProjections({
    projections: [
      P({ sc: "SC-0044872", ship: "Jewel", sign_on: "2026-07-20" }),
      P({ sc: "SC-0040153", ship: "Liberty", sign_on: "2026-10-31" }),
      P({ sc: "SC-0046170", ship: "Independence", sign_on: "2026-07-02" }),
      P({ sc: "SC-0045531", ship: "Navigator", sign_on: "2026-09-25" }),
    ],
    registry, today: TODAY, shipOf,
  });
  const v = Object.fromEntries(items.map((i) => [i.sc, i.verdict]));
  assert.equal(v["SC-0044872"], "ashore", "the card says aboard Jewel; the 4 Oct file says Inactive, no ship");
  assert.equal(v["SC-0040153"], "elsewhere", "planned for Liberty; the file has him earmarked for Odyssey");
  assert.equal(v["SC-0046170"], "pending", "On board with no readable ship: nothing to confirm until the file's row is kept");
  assert.equal(v["SC-0045531"], "ashore", "aboard Navigator per the card since 25 Sep; the file still has him Earmarked");
});

test("registryFromStore: a snapshot row wins over the raw crew row, keeps its own run date, and a snapshot-only crew is still returned", () => {
  const registry = registryFromStore({
    snapshot: [
      { agency_id: "SC-1", status: "On board", vessel: "MV JEWEL OF THE SEAS", run_at: "2026-10-11T09:00:00.000Z" },
      { agency_id: "SC-9", status: "On Vacation", vessel: null, run_at: "2026-10-11T09:00:00.000Z" },
    ],
    crew: [{ agency_id: "SC-1", status: "Inactive", vessel_observed: null }],
    openFlags: [{ agency_id: "SC-1", new_value: "MV ODYSSEY OF THE SEAS", created_at: "2026-10-04T00:00:00.000Z" }],
    lastRun: "2026-10-04T13:12:10.010Z",
  });
  const by = Object.fromEntries(registry.map((r) => [r.agency_id, r]));
  assert.deepEqual(by["SC-1"], { agency_id: "SC-1", status: "On board", vessel_observed: "MV JEWEL OF THE SEAS", run_at: "2026-10-11T09:00:00.000Z", source: "snapshot" });
  assert.equal(by["SC-9"].source, "snapshot");
  assert.equal(registryFromStore({}).length, 0);
  // a snapshot row for a crew an open presence flag says the latest file does not carry is skipped too
  assert.equal(registryFromStore({ snapshot: [{ agency_id: "SC-9", status: "On board", vessel: null, run_at: "2026-09-01" }], absent: [{ agency_id: "SC-9" }] }).length, 0);
});
