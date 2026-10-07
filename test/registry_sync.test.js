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
    inForce: { "SC-0045531": [{ hull: "Navigator", on: "2026-09-25" }] },
    shipKey: (v) => String(v || "").toLowerCase().replace(/^mv\s+/, "").replace(/\s+of the seas$/, "").replace(/^celebrity\s+/, "").replace(/[^a-z0-9]/g, ""),
  });
  const by = Object.fromEntries(registry.map((r) => [r.agency_id, r]));
  assert.deepEqual(by["SC-0044872"], { agency_id: "SC-0044872", status: "Inactive", vessel_observed: null, run_at: "2026-10-04T13:12:10.010Z", vessel_at: null, vessel_from: null, vessel_unknown: false, source: "registry" });
  assert.equal(by["SC-0040153"].vessel_observed, "MV ODYSSEY OF THE SEAS", "the file's vessel lives in the newest open ship flag");
  assert.equal(by["SC-0040153"].run_at, "2026-10-04T13:12:10.010Z", "dated by the latest file");
  // Miguel, 5 Oct ("still appearing like this"): the line is dated by the LATEST file, never by an old
  // flag; the flag's own date rides along so the card can say when the hull was first named.
  assert.deepEqual(by["SC-V"], { agency_id: "SC-V", status: "Inactive", vessel_observed: "MV VOYAGER OF THE SEAS", run_at: "2026-10-04T13:12:10.010Z", vessel_at: "2026-08-22T10:43:38.669Z", vessel_from: "flag", vessel_unknown: false, source: "registry" });
  assert.equal(registryFromStore({ crew: [{ agency_id: "SC-V", status: "Inactive" }], openFlags: [{ agency_id: "SC-V", new_value: "MV VOYAGER OF THE SEAS", created_at: "2026-08-22T10:43:38.669Z" }] })[0].run_at, "2026-08-22T10:43:38.669Z", "no run recorded at all: the flag's date is the only one there is");
  assert.equal(by["SC-0046170"].vessel_observed, null);
  assert.equal(by["SC-H"].status, "Inactive", "a HELD status change: the file's word is the audit row, not crew.status");
  assert.equal(by["SC-M"].status, null, "a manual status edit: the file's status is unknown, never crew.status");
  assert.equal(by["SC-G"], undefined, "a crew the latest file does not carry gets no row: silence is not a verdict");
  // De Torres: the registry column still says Jewel (July), no flag was ever raised — but Rita's card has him
  // aboard Navigator since 25 Sep, and the import is silent when the file agrees with the board. A hull older
  // than an in-force card on another ship is not the file's word: unknown until the snapshot.
  assert.equal(by["SC-0045531"].vessel_observed, null, "a stale July ship must not be named against a newer in-force card");
  assert.equal(by["SC-0045531"].vessel_unknown, true);
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
  assert.deepEqual(by["SC-1"], { agency_id: "SC-1", status: "On board", vessel_observed: "MV JEWEL OF THE SEAS", run_at: "2026-10-11T09:00:00.000Z", vessel_at: null, vessel_from: "snapshot", vessel_unknown: false, source: "snapshot", name: null, raw_status: null, embarked_at: null, debarked_at: null });
  assert.equal(by["SC-9"].source, "snapshot");
  assert.equal(by["SC-9"].on_roster, false, "a file row the roster does not carry is marked as such");
  assert.equal(by["SC-1"].on_roster, undefined);
  assert.equal(registryFromStore({}).length, 0);
  // a snapshot row for a crew an open presence flag says the latest file does not carry is skipped too
  assert.equal(registryFromStore({ snapshot: [{ agency_id: "SC-9", status: "On board", vessel: null, run_at: "2026-09-01" }], absent: [{ agency_id: "SC-9" }] }).length, 0);
});

// Miguel, 5 Oct 2026: "TDG is the one true source". Until the first upload after 5 Oct fills the snapshot,
// the board reads the file's hull back from what the import left: the newest ship flag of ANY state,
// else the registry column — never against a newer in-force card on another hull.
test("registryFromStore bootstrap: newest flag of any state, else the registry column; an in-force card started after it makes the hull unknown", () => {
  const key = (v) => String(v || "").toLowerCase().replace(/^mv\s+/, "").replace(/\s+of the seas$/, "").replace(/^celebrity\s+/, "").replace(/^azamara\s+/, "").replace(/[^a-z0-9]/g, "");
  const reg = registryFromStore({
    crew: [
      { agency_id: "LAN", status: "On board", vessel_observed: "MV ADVENTURE OF THE SEAS" },   // Lanuza: no flag ever -> the registry column
      { agency_id: "BIL", status: "On board", vessel_observed: null },                          // Billones: flag closed by board_matches (22 Aug)
      { agency_id: "CAL", status: "On board", vessel_observed: null },                          // Calang: flag Edge 22 Aug, card Silhouette since 5 Sep
      { agency_id: "SAN", status: "On board", vessel_observed: "MV AZAMARA QUEST" },            // Santos: open flag Wonder 26 Sep, plan Pursuit 31 Oct (future)
      { agency_id: "ESP", status: "On board", vessel_observed: null },                          // Espenilla: flag Explorer 22 Aug, card Explorer 23 Aug (same hull)
      { agency_id: "NOC", status: "Earmarked", vessel_observed: "MV CELEBRITY SUMMIT" },        // Noche: flag Constellation 17 Sep (closed) newer than the registry
    ],
    vesselFlags: [
      { agency_id: "BIL", new_value: "MV CELEBRITY BEYOND", created_at: "2026-08-22T10:43:38Z", resolved: 2 },
      { agency_id: "CAL", new_value: "MV CELEBRITY EDGE", created_at: "2026-08-22T10:43:38Z", resolved: 2 },
      { agency_id: "SAN", new_value: "MV WONDER OF THE SEAS", created_at: "2026-09-26T08:37:50Z", resolved: 0 },
      { agency_id: "ESP", new_value: "MV EXPLORER OF THE SEAS", created_at: "2026-08-22T10:43:38Z", resolved: 2 },
      { agency_id: "NOC", new_value: "MV CELEBRITY CONSTELLATION", created_at: "2026-09-17T10:40:42Z", resolved: 2 },
    ],
    inForce: { CAL: [{ hull: "Silhouette", on: "2026-09-05" }], ESP: [{ hull: "Explorer", on: "2026-08-23" }] },
    shipKey: key, lastRun: "2026-10-05T18:54:18Z",
  });
  const by = Object.fromEntries(reg.map((r) => [r.agency_id, r]));
  assert.equal(by.LAN.vessel_observed, "MV ADVENTURE OF THE SEAS"); assert.equal(by.LAN.vessel_from, "registry"); assert.equal(by.LAN.vessel_at, null);
  assert.equal(by.BIL.vessel_observed, "MV CELEBRITY BEYOND", "a flag closed because the board matched is still the hull the file named");
  assert.equal(by.CAL.vessel_observed, null, "Edge (22 Aug) is older than the Silhouette card (5 Sep): the file's silence since cannot be read");
  assert.equal(by.CAL.vessel_unknown, true);
  assert.equal(by.SAN.vessel_observed, "MV WONDER OF THE SEAS", "a FUTURE plan is not in force: the open flag stands");
  assert.equal(by.ESP.vessel_observed, "MV EXPLORER OF THE SEAS", "the card agrees with the flag: no doubt");
  assert.equal(by.NOC.vessel_observed, "MV CELEBRITY CONSTELLATION", "a newer flag beats the July registry column");
  assert.ok(reg.every((r) => r.run_at === "2026-10-05T18:54:18Z"), "the status line is dated by the latest file");
  // with no vesselFlags the open flags still work (the pre-6-Oct input)
  assert.equal(registryFromStore({ crew: [{ agency_id: "X", status: "On board" }], openFlags: [{ agency_id: "X", new_value: "MV ICON OF THE SEAS", created_at: "2026-09-01" }] })[0].vessel_observed, "MV ICON OF THE SEAS");
});

// 6 Oct 2026, Pintucan: card aboard Wonder from 6 Oct; the 5 Oct file still has him On Vacation. The file
// predates the sign-on, so it cannot contradict the card yet. A card that signed on BEFORE the file can be.
test("reconcileProjections: a file older than the card's sign-on contradicts nothing; one written after it does", () => {
  const reg = [{ agency_id: "PIN", status: "On Vacation", vessel_observed: "MV SERENADE OF THE SEAS", run_at: "2026-10-05T18:54:18.694Z" }];
  const card = (on) => [{ id: "a1", sc: "PIN", ship: "Wonder", sign_on: on, planned_sign_off: "2027-04-09" }];
  const v = (on, today) => reconcileProjections({ projections: card(on), registry: reg, today }).items[0].verdict;
  assert.equal(v("2026-10-06", "2026-10-06"), "pending", "joined after the file: no word yet");
  assert.equal(v("2026-10-05", "2026-10-06"), "pending", "joined the day the file ran: TDG may not have caught up");
  assert.equal(v("2026-10-01", "2026-10-06"), "ashore", "aboard since before the file, the file says ashore");
  // Earmarked elsewhere: the same rule for an aboard card; a future plan still reads as elsewhere
  const em = [{ agency_id: "PIN", status: "Earmarked", vessel_observed: "MV CELEBRITY APEX", run_at: "2026-10-05T18:54:18.694Z" }];
  const ve = (on) => reconcileProjections({ projections: card(on), registry: em, today: "2026-10-06" }).items[0].verdict;
  assert.equal(ve("2026-10-06"), "pending");
  assert.equal(ve("2026-09-01"), "ashore");
  assert.equal(ve("2026-11-01"), "elsewhere");
});
