// THE RELIEVER IS ONE RULE, AN EARMARK TDG ALSO HAS TURNS GREEN, AND A CREW EARMARKED FOR THE SHIP HE IS ABOARD KEEPS HIS
// SEAT — Miguel's answers of 17 Oct 2026 to the logic review ("Adopt it everywhere"; "Yes, turn green"; "remember that Ida is
// onboard"). The board, the profile, the dashboard and the instructions email named three different relievers on the 16 Oct
// file; the rows below are that file's (Pursuit, Enchantment, Apex, Grandeur, Xcel).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickReliever, assignRelievers, reliefFrom, RELIEF_WINDOW_DAYS } from "../src/reliever.js";
import { legsFromRegistry } from "../src/ship_leg_source.js";
import { seatContexts } from "../src/signoff_context.js";
import { handovers } from "../src/crew_profile.js";
import { buildOps } from "../src/ops_dashboard.js";

const F16 = "2026-10-16T13:36:44.757Z", T17 = "2026-10-17";
const VES = [{ name: "Pursuit", brand: "Azamara" }, { name: "Enchantment", brand: "Royal Caribbean" }, { name: "Apex", brand: "Celebrity" }, { name: "Grandeur", brand: "Royal Caribbean" }];
const row = (sc, vessel, embarked_at, o = {}) => ({ sc, status: "On board", raw_status: "On board", vessel, embarked_at, debarked_at: null, run_at: F16, crew_id: "c" + sc, crew_name: o.name || "Crew " + sc, ...o });
const by = (legs) => Object.fromEntries(legs.map((l) => [l.sc, l]));

test("the rule: 45 days before the EARLIER of the shown and the projected sign-off; never a visit; TDG's undated row last", () => {
  assert.equal(RELIEF_WINDOW_DAYS, 45);
  assert.equal(reliefFrom("2026-05-02", "2026-10-31", true), "2026-08-18", "Jugao: projected 2 Oct (Azamara 5) is earlier than Rita's 31 Oct");
  assert.equal(reliefFrom("2026-06-20", "2027-01-31", false), "2026-12-06", "Valderrama: projected 20 Jan 2027");
  const jugao = { sc: "K", on: "2026-05-02", off: "2026-10-31", azamara: true };
  assert.equal(pickReliever(jugao, [{ sc: "JA", on: "2026-10-16", visit: true }, { sc: "AJ", on: "2026-10-16" }]).sc, "AJ", "Baleña, never the trainer");
  const val = { sc: "V", on: "2026-06-20", off: "2027-01-31" };
  assert.equal(pickReliever(val, [{ sc: "SUA", on: "2026-10-03" }, { sc: "LAN", on: "2027-01-31" }]).sc, "LAN", "Suarez boarded months before the window: a colleague");
  assert.equal(pickReliever(val, [{ sc: "SUA", on: "2026-10-03" }]), null);
  assert.equal(pickReliever(val, [{ sc: "SUA", on: "2026-10-03" }, { sc: "TDG", on: null }]).sc, "TDG", "TDG's undated Earmarked row is the last resort");
  // AN EXTENSION KEEPS THE RELIEVER: boarded on the original plan (1 Oct), Rita extends the outgoing to 30 Dec — 90 days later
  const ext = { sc: "X", on: "2026-03-01", off: "2026-12-30" };
  assert.equal(pickReliever(ext, [{ sc: "R", on: "2026-10-01" }]).sc, "R", "the projected 1 Oct anchors the window, not the extended date");
});

test("one person relieves one seat: the seat whose sign-off is nearest his sign-on takes him, the other looks further", () => {
  // Wonder: Santos held aboard since her 1 Sep sign-off, Villacortes off 30 Oct; Pintucan joins 28 Oct, a second earmark May 2027
  const cands = [{ sc: "P2", on: "2027-05-01" }, { sc: "P", on: "2026-10-28" }];
  const [s, v] = assignRelievers([{ sc: "S", on: "2026-02-01", off: "2026-09-01", cands }, { sc: "V", on: "2026-03-22", off: "2026-10-30", cands }]);
  assert.equal(v.sc, "P", "Villacortes leaves 2 days after Pintucan joins");
  assert.equal(s.sc, "P2");
  // A second printer aboard since May is not relieved by the first's relief
  const c2 = [{ sc: "C", on: "2026-10-25" }];
  const [a, b] = assignRelievers([{ sc: "A", on: "2026-02-01", off: "2026-10-30", cands: c2 }, { sc: "B", on: "2026-05-01", off: "2027-01-15", cands: c2 }]);
  assert.equal(a.sc, "C"); assert.equal(b, null);
});

test("the board names the same reliever: Baleña for Jugao (Alonzo's trip is a visit), Lanuza's card for Valderrama, Resposo for Belhida", () => {
  const legs = legsFromRegistry({ rows: [
    row("SC-0039935", "MV AZAMARA PURSUIT", "2026-05-02", { name: "Kevin Jugao" }),
    row("SC-0041465", "MV AZAMARA PURSUIT", "2026-10-16", { name: "Jonathan Alonzo" }),
    row("SC-AJ", "MV AZAMARA PURSUIT", "2026-10-16", { name: "A.J. Baleña" }),
    row("SC-0038464", "MV ENCHANTMENT OF THE SEAS", "2026-06-20", { name: "Jeffrey Valderrama" }),
    row("SC-0036160", "MV ENCHANTMENT OF THE SEAS", "2026-10-03", { name: "Myrna Suarez" }),
    row("SC-0037752", "MV CELEBRITY APEX", "2026-03-14", { name: "Dan Belhida" }),
    row("SC-0038129", "MV CELEBRITY APEX", "2026-10-07", { name: "Michael Angelo Resposo" }),
  ], edits: [
    { sc: "SC-0039935", seq: 1, on_key: "2026-05-02", sign_off: "2026-10-31", updated_at: "2026-10-09T17:15:52Z" },
    { sc: "SC-0038464", seq: 1, on_key: "2026-06-20", sign_off: "2027-01-31", updated_at: "2026-10-09T16:18:28Z" },
    { sc: "SC-0037752", seq: 1, on_key: "2026-03-14", sign_off: "2026-10-07", updated_at: "2026-10-08T17:53:01Z" },
  ], open: [{ id: "as_lan", sc: "SC-0039963", ship: "Enchantment", sign_on: "2027-01-31", crew_name: "Karl Lanuza", created_at: "2026-10-09T11:06:50Z" }],
  visits: [{ sc: "SC-0041465", on_key: "2026-10-16" }], vessels: VES, today: T17 });
  const L = by(legs);
  assert.deepEqual(L["SC-0039935"].reliever, { sc: "SC-AJ", name: "A.J. Baleña", cardId: null, on: "2026-10-16" }, "not the trainer listed first");
  assert.deepEqual(L["SC-0038464"].reliever, { sc: "SC-0039963", name: "Karl Lanuza", cardId: "as_lan", on: "2027-01-31" }, "Lanuza's card, not Suarez");
  assert.equal(L["SC-0038464"].off, "2027-01-31", "the sign-off is Rita's: the rule names, it never dates");
  assert.equal(L["SC-0037752"].reliever.sc, "SC-0038129");
});

test("a card TDG earmarks for that very hull is not contradicted by a later file: it still relieves (Corpin, Grandeur)", () => {
  const legs = legsFromRegistry({ rows: [
    row("SC-DR", "MV GRANDEUR OF THE SEAS", "2026-03-18", { name: "Mark Joseph Dela Rosa", run_at: "2026-10-21T08:00:00Z" }),
    { sc: "SC-0016319", status: "Earmarked", raw_status: "Earmarked", vessel: "MV GRANDEUR OF THE SEAS", embarked_at: null, debarked_at: null, run_at: "2026-10-21T08:00:00Z", crew_name: "Archiegale Corpin" },
  ], edits: [{ sc: "SC-DR", seq: 1, on_key: "2026-03-18", sign_off: "2026-10-18", updated_at: "2026-10-01T00:00:00Z" }],
  open: [{ id: "as_cor", sc: "SC-0016319", ship: "Grandeur", sign_on: "2026-10-18", crew_name: "Archiegale Corpin", created_at: "2026-10-08T16:59:32Z" }],
  vessels: VES, today: "2026-10-22" });
  const dr = by(legs)["SC-DR"];
  assert.equal(dr.reliever && dr.reliever.sc, "SC-0016319", "TDG has the plan, not the embark yet: the card stands");
});

test("the email reads the same rule: Baleña for Jugao, Lanuza for Valderrama", () => {
  const X = seatContexts([
    { ship: "Pursuit", brand: "Azamara", crew: [
      { agency_id: "K", name: "Kevin Leif Jugao", current: true, signOn: "2026-05-02", signOff: "2026-10-31" },
      { agency_id: "AJ", name: "A.J. Lorenzo Baleña", current: true, signOn: "2026-10-16", signOff: "2027-03-16" },
    ], visits: [{ agency_id: "JA", name: "Jonathan Alonzo", current: true, visit: true, signOn: "2026-10-16", signOff: "2026-10-24" }], projections: [] },
    { ship: "Enchantment", brand: "Royal", crew: [
      { agency_id: "V", name: "Jeffrey Valderrama", current: true, signOn: "2026-06-20", signOff: "2027-01-31" },
      { agency_id: "SUA", name: "Myrna Suarez", current: true, signOn: "2026-10-03", signOff: "2027-05-03" },
    ], projections: [{ agency_id: "LAN", name: "Karl Lanuza", state: "yellow", signOn: "2027-01-31", signOff: "2027-08-28" }] },
  ]);
  assert.equal(X.K.reliever.sc, "AJ");
  assert.equal(X.V.reliever.sc, "LAN");
  // Extended: the reliever boarded on the original plan (1 Oct); Rita moved the outgoing to 30 Dec. The 45 days count from the
  // projected 1 Oct, so the reliever stays named (the email's old window, from the sign-off alone, lost him).
  const E = seatContexts([{ ship: "Allure", brand: "Royal", crew: [
    { agency_id: "X", name: "Extended Crew", current: true, signOn: "2026-03-01", signOff: "2026-12-30" },
    { agency_id: "R", name: "Real Reliever", current: true, signOn: "2026-10-01", signOff: "2027-05-01" },
  ], projections: [] }]);
  assert.equal(E.X.reliever && E.X.reliever.sc, "R");
});

test("the profile reads the board's answer for a contract the file dates, the same rule for any other", () => {
  const leg = { ship: "Enchantment", sc: "V", on: "2026-06-20", off: "2027-01-31", source: "registry", reliever: { sc: "LAN", name: "Karl Lanuza", cardId: "as_lan", on: "2027-01-31" } };
  const legs = [leg, { ship: "Enchantment", sc: "SUA", name: "Myrna Suarez", on: "2026-10-03", off: "2027-05-03", source: "registry" }];
  const cards = [{ sc: "LAN", ship: "Enchantment", sign_on: "2027-01-31", planned_sign_off: "2027-08-28", crew_name: "Karl Lanuza" }];
  assert.equal(handovers(leg, { legs, cards, sc: "V" }).after.sc, "LAN", "not Suarez, the first contract after him");
  // A Counter contract (no board answer): the same window — the colleague is not the reliever
  const old = { ship: "Enchantment", sc: "V", on: "2026-06-20", off: "2027-01-31", source: "counter" };
  assert.equal(handovers(old, { legs, cards, sc: "V" }).after.sc, "LAN");
});

test("the dashboard: a reliever already aboard is the reliever (Baleña), never 'No reliever'", () => {
  const seat = (o) => Object.assign({ current: true, state: "green", status: "On board", eccr: false, air: false, hotel: false }, o);
  const o = buildOps({ today: T17, sections: [{ ship: "Pursuit", brand: "Azamara", crew: [
    seat({ agency_id: "K", name: "Kevin Jugao", signOn: "2026-05-02", signOff: "2026-10-31", offSource: "rita", reliever: { sc: "AJ" } }),
    seat({ agency_id: "AJ", name: "A.J. Baleña", signOn: "2026-10-16", signOff: "2027-03-16", offSource: "projected", file: { status: "On board", ship: "Pursuit" } }),
  ], projections: [] }], crew: [], dash: {}, queue: {}, kit: { instr: [], link: [] } });
  const r = o.changes.rows.find((x) => x.sc === "K");
  assert.ok(r, "Jugao's crew change is listed");
  assert.equal(r.reliever && r.reliever.sc, "AJ");
  assert.equal(r.reliever.tdg, true, "aboard per TDG's file is in TDG");
});

test("the board: an earmark TDG also has turns green on its sign-on; a crew earmarked for the ship he is aboard keeps his seat", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /const awaitingCard = \(a\) => \{ const v = regOf\(a\.id\); return !!\(a\.sign_on && a\.sign_on <= today\) && \(!v \|\| v\.verdict === "pending" \|\| v\.verdict === "earmarked"\); \};/);
  assert.match(W, /<= today && \(!regOf\(x\.asgId\) \|\| regOf\(x\.asgId\)\.verdict === "pending" \|\| regOf\(x\.asgId\)\.verdict === "earmarked"\)\)/);
  assert.match(W, /if \(w\.status === "Earmarked" && w\.key === k\) return null;/, "his running contract is not ended 'per the TDG file'");
});
