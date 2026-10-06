// The Keyman board shows TDG's file, and what is wrong (Miguel, 5 Oct 2026; Brain recddHTPgWjLy39AU).
// Cases are tonight's real crew, read off production's tables (5 Oct 2026, 22:0x UTC).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileWordBySc, boardIssues } from "../src/board_truth.js";

const TODAY = "2026-10-05";
const shipOf = (v) => {
  const t = String(v || "").replace(/^MV\s+/i, "").replace(/\s+OF THE SEAS$/i, "").replace(/^(CELEBRITY|AZAMARA)\s+/i, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : null;
};
const keyOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const valid = new Set(["jewel", "wonder", "freedom", "solstice", "navigator", "brilliance", "xcel", "voyager", "odyssey", "liberty", "millennium", "allure", "beyond", "explorer"]);

test("fileWordBySc: the file's status and hull per crew, canonicalised; an unknown hull is said as such", () => {
  const f = fileWordBySc([
    { agency_id: "SAN", status: "On board", vessel_observed: "MV WONDER OF THE SEAS", run_at: "2026-10-05T18:54:18Z", vessel_at: "2026-09-26T08:37:50Z", source: "registry" },
    { agency_id: "CAL", status: "On board", vessel_observed: null, vessel_unknown: true, run_at: "2026-10-05T18:54:18Z" },
    { agency_id: "ODD", status: "On board", vessel_observed: "MV NOWHERE", run_at: "2026-10-05T18:54:18Z" },
  ], { shipOf, keyOf, valid });
  assert.deepEqual(f.SAN, { status: "On board", raw: "MV WONDER OF THE SEAS", ship: "Wonder", key: "wonder", known: true, at: "2026-10-05", vesselAt: "2026-09-26", hullUnknown: false, source: "registry", name: null, rawStatus: null, onRoster: true });
  assert.equal(f.CAL.ship, null); assert.equal(f.CAL.hullUnknown, true);
  assert.equal(f.ODD.known, false);
});

const W = (status, hull, extra) => ({ status, raw: hull ? "MV " + hull.toUpperCase() : null, ship: hull || null, key: hull ? keyOf(hull) : null, known: !!hull, at: "2026-10-05", vesselAt: null, hullUnknown: false, ...extra });

test("boardIssues: tonight's board, row by row", () => {
  const rows = boardIssues({
    today: TODAY,
    crew: [
      { sc: "GAY", name: "Cherry Blair Gayda" },
      { sc: "SAN", name: "Christjel Santos" },
      { sc: "JAR", name: "Jaramiz Tuazon", absentSince: "2026-09-06", last: { status: "On board", ship: "Explorer" } },
      { sc: "CLY", name: "Andrea Calayag" },
      { sc: "VAL", name: "Jerome Valdesco", retired: true, fileRaw: { status: "On board", ship: "Brilliance" } },
      { sc: "PUR", name: "Ida Purnama" },
      { sc: "TAL", name: "Cyrus Talucod" },
      { sc: "OLI", name: "Jim Olid" },
      { sc: "OSO", name: "Norman Osorio" },
      { sc: "CAG", name: "Calang" },
    ],
    file: {
      GAY: W("Inactive", "Voyager"), SAN: W("On board", "Wonder"), CLY: W("On board", "Navigator"),
      PUR: W("Earmarked", "Xcel"), TAL: W("Earmarked", "Allure", { vesselAt: "2026-08-22" }), OLI: W("Earmarked", "Odyssey"),
      OSO: W("On Vacation", null), CAG: W("On board", null, { hullUnknown: true, known: false }),
    },
    seats: { SAN: { key: "wonder", ship: "Wonder", dated: false } },
    cards: [
      { sc: "GAY", name: "Cherry Blair Gayda", ship: "Jewel", key: "jewel", aboard: true, on: "2026-07-20", verdict: "ashore", at: "2026-10-05", fileStatus: "Inactive", fileShip: "Voyager", overridden: true },
      { sc: "OLI", name: "Jim Olid", ship: "Liberty", key: "liberty", aboard: false, on: "2026-10-31", verdict: "elsewhere", at: "2026-10-05", fileStatus: "Earmarked", fileShip: "Odyssey", overridden: true },
      { sc: "CAG", name: "Calang", ship: "Silhouette", key: "silhouette", aboard: true, on: "2026-09-05", verdict: "pending" },
    ],
    counter: [
      { sc: "PUR", ship: "Xcel", key: "xcel", on: "2026-04-26", off: "2026-11-21" },
      { sc: "OSO", ship: "Freedom", key: "freedom", on: "2025-12-08", off: "2026-08-22" },   // past + file On Vacation: completed, not wrong
    ],
    completed: { "CLY|navigator": "2026-09-25" },
    sections: [
      { ship: "Jewel", key: "jewel", seated: false, aboardCards: ["ashore"] },
      { ship: "Xcel", key: "xcel", seated: false, aboardCards: [] },
      { ship: "Brilliance", key: "brilliance", seated: false, fileAboard: true, aboardCards: [] },
      { ship: "Silhouette", key: "silhouette", seated: false, aboardCards: ["pending"] },
      { ship: "Wonder", key: "wonder", seated: true, aboardCards: [] },
    ],
  });
  const got = rows.map((r) => r.kind + ":" + (r.sc || r.ship));
  // Miguel, 6 Oct 2026: "if a crew is added?? u added it.. if a crew is removed?? u remove .. if a crew
  // finish his contract.. u move it as history". The board APPLIES the file; this list is only what a person
  // must clean up: Rita's cards and tags the file overrides, and TDG not caught up with a recorded sign-off.
  assert.deepEqual(got, [
    "empty_hull:Jewel", "empty_hull:Xcel",
    "overridden:GAY", "overridden:OLI",
    "held:VAL",
    "completed_still_aboard:CLY",
  ]);
  const t = Object.fromEntries(rows.map((r) => [r.kind + ":" + (r.sc || r.ship), r.text]));
  assert.equal(t["empty_hull:Jewel"], "No printer on board per the TDG file");
  assert.equal(t["overridden:GAY"], "TDG file 2026-10-05: Inactive, Voyager · your card aboard Jewel since 2026-07-20 is off the board · remove it");
  assert.equal(t["overridden:OLI"], "TDG file 2026-10-05: Earmarked, Odyssey · your card Liberty from 2026-10-31 is off the board · remove it");
  assert.equal(t["held:VAL"], "TDG file: On board, Brilliance · your Retired tag is overridden · remove it");
  assert.equal(t["completed_still_aboard:CLY"], "TDG not updated yet · your recorded sign-off 2026-09-25 · TDG file 2026-10-05 still: On board, Navigator");
  // Not rows any more: the board shows them, or they are not a disagreement with the file.
  for (const k of ["dropped:JAR", "counter:PUR", "no_dates:SAN", "earmarked_no_card:TAL", "earmarked_no_card:PUR"]) assert.ok(!got.includes(k), k);
  assert.ok(!got.some((g) => g.endsWith(":CAG") || g === "empty_hull:Silhouette"), "a card not yet judged is neither overridden nor an empty hull");
  assert.ok(!got.includes("empty_hull:Brilliance"), "the file has someone aboard under Rita's tag: the held row, not an empty hull");
});

test("boardIssues: a status held by Rita, an unknown ship, On board with no ship, and an empty input", () => {
  const rows = boardIssues({ today: TODAY,
    crew: [{ sc: "A", name: "A", held: "Earmarked" }, { sc: "B", name: "B" }, { sc: "C", name: "C" }, { sc: "D", name: "D", manual: "Earmarked" }],
    file: { A: W("On board", "Jewel"), B: W("On board", "Nowhere", { known: false }), C: W("On board", null), D: W("On Vacation", null) },
    seats: {}, cards: [], counter: [], completed: {}, sections: [] });
  const t = Object.fromEntries(rows.map((r) => [r.sc, r]));
  assert.equal(t.A.text, "Status held at Earmarked · TDG file 2026-10-05: On board, Jewel");
  assert.equal(t.B.kind, "unknown_ship");
  assert.equal(t.C.kind, "onboard_no_ship");
  assert.equal(t.D.text, "Your status edit: Earmarked · TDG file 2026-10-05: On Vacation");
  assert.deepEqual(boardIssues({}), []);
});

// Miguel, 5 Oct 2026: "I dont think so u are reading well the tdg file". The list printed hulls rebuilt
// from change flags under the latest file's date (Gayda: "TDG file 2026-10-05: Inactive, Voyager" — Voyager
// was named 22 Aug). Until the console keeps a copy of the file, no row may claim to be the file.
test("boardIssues: a rebuilt hull carries the date it was named; with no file kept the empty-hull row says so", () => {
  const rows = boardIssues({
    today: TODAY, fileKept: false,
    crew: [{ sc: "GAY", name: "Cherry Blair Gayda" }],
    file: { GAY: W("Inactive", "Voyager", { vesselAt: "2026-08-22" }) },
    cards: [{ sc: "GAY", name: "Cherry Blair Gayda", ship: "Jewel", key: "jewel", aboard: true, on: "2026-07-20", verdict: "ashore", at: "2026-10-05", fileStatus: "Inactive", fileShip: "Voyager", overridden: true }],
    sections: [{ ship: "Jewel", key: "jewel", seated: false, aboardCards: [] }],
  });
  const t = Object.fromEntries(rows.map((r) => [r.kind, r.text]));
  assert.equal(t.empty_hull, "No printer on board in the TDG uploads the console kept");
  assert.equal(t.overridden, "TDG file 2026-10-05: Inactive, Voyager (ship named 2026-08-22) · your card aboard Jewel since 2026-07-20 is off the board · remove it");
  // a kept copy (no vesselAt) reads as the file, undated hull
  const kept = boardIssues({ today: TODAY, crew: [], sections: [{ ship: "Xcel", key: "xcel", seated: false, aboardCards: [] }] });
  assert.equal(kept[0].text, "No printer on board per the TDG file");
});

test("boardIssues: a file row the roster does not carry is listed by the file's own name; an unreadable status word is listed, never dropped", () => {
  const rows = boardIssues({
    today: TODAY,
    crew: [{ sc: "SC-1", name: "Mara Tangonan", shown: "On board" }],
    file: {
      "SC-1": W(null, "Summit", { rawStatus: "Signed Off" }),
      "SC-9": W("On board", "Jewel", { name: "Jaramiz Tuazon", onRoster: false }),
    },
  });
  const by = Object.fromEntries(rows.map((r) => [r.kind, r]));
  assert.equal(by.file_only.name, "Jaramiz Tuazon");
  assert.equal(by.file_only.ship, "Jewel");
  assert.equal(by.file_only.text, "In the TDG file 2026-10-05 as SC-9 · not on the console roster · On board, Jewel");
  assert.equal(by.status_unread.text, "TDG file 2026-10-05 status 'Signed Off' is not one the console reads · it still shows On board");
  const hid = boardIssues({ today: TODAY, crew: [], file: { "SC-0046233": W("On board", "Serenade", { name: "Ariel Encina", onRoster: false, hidden: true }) } });
  assert.equal(hid[0].text, "In the TDG file 2026-10-05 as SC-0046233 · hidden on the console · On board, Serenade", "a hidden crew is on the roster, just hidden");
  // an INACTIVE file row the roster lacks is not a row (nothing to show); a hidden crew shown by a confirmed card is not either
  assert.equal(boardIssues({ crew: [], file: { Z: W("On Vacation", "Freedom", { name: "Allan Bulilan", onRoster: false }) } }).length, 0);
  assert.equal(boardIssues({ crew: [], file: { "SC-0046233": W("On board", "Serenade", { onRoster: false, hidden: true }) }, cards: [{ sc: "SC-0046233", verdict: "confirmed" }] }).length, 0);
  // a row built without onRoster (every caller before 5 Oct) is on the roster
  assert.equal(boardIssues({ today: TODAY, crew: [], file: { X: W("On board", "Jewel") } }).length, 0);
});
