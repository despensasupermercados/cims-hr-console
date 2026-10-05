// A seat the schedule has already released must not stay a red card on the Keyman board.
//
// Miguel, 5 Oct 2026, Navigator: Calayag's card read "On Vacation" in its status line and, on the same
// card, "OFF was 6d ago · No sign-off recorded. The seat stays held" — while De Torres sat beside her as
// a yellow "aboard" projection. Rita HAD recorded the sign-off (contract_edit 2026-09-25, confirmed, on
// 14 Jul). The schedule honoured it (applyRecordedSignoffs: is_current -> false, status -> On Vacation);
// the board did not, because the green card is placed by the registry's vessel_observed and only
// self-heals when that ship has NO leg for the crew. 18 seats were in that state in production.
//
// The rule is pure (releasedSeatKeys) and the board's use of it is pinned statically below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { releasedSeatKeys, applyRecordedSignoffs } from "../src/ship_leg_source.js";

const TODAY = "2026-10-05";
const leg = (o) => ({ ours: true, source: "counter", ...o });

test("a leg closed by a recorded sign-off releases the seat; an overdue projection does not", () => {
  const legs = [
    // Calayag: Counter leg on Navigator, Rita's recorded 25 Sep has passed -> closed at the read layer
    leg({ sc: "SC-0045797", ship: "Navigator", on: "2026-02-02", off: "2026-09-18", is_current: true }),
    // Osorio-shaped: current leg past its PROJECTED sign-off, nothing recorded -> overdue, not gone
    leg({ sc: "SC-0038401", ship: "Freedom", on: "2026-02-10", off: "2026-08-22", is_current: true }),
  ];
  const rec = { "SC-0045797|2026-02-02": "2026-09-25" };
  const hist = applyRecordedSignoffs(legs, rec, TODAY);
  const released = releasedSeatKeys(hist, TODAY);
  assert.ok(released.has("SC-0045797|navigator"), "Calayag's Navigator seat is released");
  assert.ok(!released.has("SC-0038401|freedom"), "a projected sign-off that merely passed keeps the seat: overdue, not gone (§11)");
});

test("a seat is released only when NO current leg remains on that ship", () => {
  const hist = [
    leg({ sc: "SC-1", ship: "Harmony", on: "2025-01-01", off: "2025-07-01", is_current: false }), // history
    leg({ sc: "SC-1", ship: "Harmony", on: "2026-05-01", off: "2026-11-01", is_current: true }),  // current, same ship
    leg({ sc: "SC-2", ship: "Jewel", on: "2025-11-15", off: "2026-08-28", is_current: false }),   // De Torres: closed on Jewel
    { ours: true, source: "assignment", sc: "SC-2", ship: "Navigator", on: "2026-09-25", off: "2027-03-18", is_current: true }, // aboard by plan elsewhere
  ];
  const released = releasedSeatKeys(hist, TODAY);
  assert.ok(!released.has("SC-1|harmony"), "a crew with a current leg on the ship keeps the seat");
  assert.ok(released.has("SC-2|jewel"), "De Torres' Jewel seat is released");
  assert.ok(!released.has("SC-2|navigator"), "his Navigator plan is current, not released");
});

test("a future recorded sign-off, a TBA sign-off and foreign legs never release a seat", () => {
  const hist = [
    leg({ sc: "SC-3", ship: "Anthem", on: "2026-06-01", off: "2026-12-01", is_current: false }), // off in the future: not past
    leg({ sc: "SC-4", ship: "Icon", on: "2026-06-01", off: null, is_current: false }),             // TBA
    { ours: false, sc: "SC-5", ship: "Edge", on: "2026-01-01", off: "2026-02-01", is_current: false }, // not ours
  ];
  const released = releasedSeatKeys(hist, TODAY);
  assert.equal(released.size, 0);
  assert.equal(releasedSeatKeys(null, TODAY).size, 0);
});

test("the ship key normaliser is honoured, so 'MV NAVIGATOR OF THE SEAS' and 'Navigator' meet", () => {
  const hist = [leg({ sc: "SC-6", ship: "Navigator", on: "2026-02-02", off: "2026-09-25", is_current: false })];
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  assert.ok(releasedSeatKeys(hist, TODAY, norm).has("SC-6|navigator"));
});

test("rotationSections applies the rule off the same HIST the status came from (static)", () => {
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  const b = src.slice(src.indexOf("async function rotationSections("), src.indexOf("const histByShip = {}, histDisp = {};"));
  assert.match(b, /const released = releasedSeatKeys\(HIST, today, \(s\) => normShip\(shipOf\(s\) \|\| s\)\);/, "computed once, before the roster loop, from HIST");
  // The guard is a MANUAL status edit (crew_override.status, the same test crewStatus applies) — not
  // "status is On board". De Torres IS On board (on Navigator, by projection) and that is exactly why his
  // Jewel seat must go; the first cut of this rule (b34ea57) kept him red on Jewel for that reason.
  assert.match(b, /const manualStatus = \(sc\) => \{ const o = ovMap\[sc\]; return !!\(o && o\.status != null && o\.status !== ""\); \};/, "the manual-override test is the one crewStatus uses");
  assert.match(b, /if \(ship && released\.has\(c\.agency_id \+ "\|" \+ k\) && !manualStatus\(c\.agency_id\)\)/, "a manual status edit still wins; a DERIVED On board elsewhere does not keep the old seat");
  assert.doesNotMatch(b, /released\.has\(c\.agency_id \+ "\|" \+ k\) && c\.status !== "On board"/, "the b34ea57 guard that kept De Torres red on Jewel");
  assert.match(b, /const effShip = se && se\.cur \? \(shipOf\(se\.ship\) \|\| se\.ship\) : null;/, "the crew goes where the schedule puts them today");
  assert.match(b, /if \(!plannedScs\.has\(c\.agency_id\)\) pool\.push\(base\);\s*continue;/, "else their projection draws them, else the pool");
  // No new D1 read was added for this: the rule runs on HIST already in the wave (§12).
  const at = b.indexOf("= await Promise.all([");
  const wave = b.slice(at, b.indexOf("]);", at));
  assert.doesNotMatch(wave, /released/);
});
