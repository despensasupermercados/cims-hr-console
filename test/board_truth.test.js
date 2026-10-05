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
  assert.deepEqual(f.SAN, { status: "On board", raw: "MV WONDER OF THE SEAS", ship: "Wonder", key: "wonder", known: true, at: "2026-10-05", vesselAt: "2026-09-26", hullUnknown: false, source: "registry" });
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
      { sc: "GAY", name: "Cherry Blair Gayda", ship: "Jewel", key: "jewel", aboard: true, on: "2026-07-20", verdict: "ashore", at: "2026-10-05", fileStatus: "Inactive", fileShip: "Voyager" },
      { sc: "OLI", name: "Jim Olid", ship: "Liberty", key: "liberty", aboard: false, on: "2026-10-31", verdict: "elsewhere", at: "2026-10-05", fileStatus: "Earmarked", fileShip: "Odyssey" },
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
  assert.deepEqual(got, [
    "empty_hull:Jewel", "empty_hull:Xcel",
    "dropped:JAR",
    "contradicted:GAY", "contradicted:OLI",
    "completed_still_aboard:CLY",
    "counter:PUR",
    "held:VAL",
    "no_dates:SAN",
    "earmarked_no_card:TAL", "earmarked_no_card:PUR",   // within a kind: by ship (Allure, Xcel)
  ]);
  const t = Object.fromEntries(rows.map((r) => [r.kind + ":" + (r.sc || r.ship), r.text]));
  assert.equal(t["empty_hull:Jewel"], "Nobody on board per the TDG file · your card here is contradicted");
  assert.equal(t["dropped:JAR"], "Not in the TDG file since 2026-09-06 · last TDG word: On board, Explorer");
  assert.equal(t["contradicted:GAY"], "Your card: aboard Jewel since 2026-07-20 · TDG file 2026-10-05: Inactive, Voyager");
  assert.equal(t["completed_still_aboard:CLY"], "Your recorded sign-off 2026-09-25 · TDG file 2026-10-05 still: On board, Navigator");
  assert.equal(t["counter:PUR"], "Contract Counter: Xcel 2026-04-26 → 2026-11-21 · TDG file 2026-10-05: Earmarked, Xcel");
  assert.equal(t["held:VAL"], "Your status edit: Retired · TDG file: On board, Brilliance");
  assert.equal(t["earmarked_no_card:TAL"], "TDG earmarks for Allure (named 2026-08-22) · no card on the board");
  // What is NOT a row:
  assert.ok(!got.some((g) => g.endsWith(":OSO")), "a Counter leg past its sign-off under a file that left the ship: completed, not wrong");
  assert.ok(!got.some((g) => g.endsWith(":CAG") || g === "empty_hull:Silhouette"), "a card the bootstrap cannot judge yet is neither contradicted nor an empty hull");
  assert.ok(!got.includes("empty_hull:Brilliance"), "the file has someone aboard whom Rita's edit keeps off: that is the held row, not an empty hull");
  assert.ok(!got.includes("earmarked_no_card:OLI"), "Olid's contradicted card already says it");
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
