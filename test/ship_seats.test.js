// Who is aboard each ship, who leaves first and who relieves him — the answer the console gives HON (src/ship_seats.js,
// the SeatReader entrypoint). Miguel, 30 Oct 2026: HON's Reflection handover named Michael Angelo Resposo, whom the
// Contract Counter still had aboard (16 Jan – 17 Jul, no sign-off recorded), while TDG's file has Bernard Paqueo aboard
// since 17 Jul and Resposo on Apex since 7 Oct.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shipSeats } from "../src/ship_seats.js";

const seat = (o) => Object.assign({ status: "On board", current: true, aboard: true, state: "green" }, o);
const card = (o) => Object.assign({ state: "yellow", role: "reliever" }, o);

test("Reflection: the man TDG's file has aboard, never the Counter's; the relief is Rita's card TDG also earmarks", () => {
  const sections = [{
    ship: "Reflection", brand: "Celebrity",
    crew: [seat({ agency_id: "SC-0038115", name: "Bernard Winzon Paqueo", signOn: "2026-07-17", signOff: "2026-11-13", offSource: "rita" })],
    projections: [card({ agency_id: "SC-0038104", name: "Darryl Dhan Ramos", assignment_id: "as_1", signOn: "2026-11-13", signOff: "2027-08-22", registry: { verdict: "earmarked" } })],
  }, {
    ship: "Apex", brand: "Celebrity",
    crew: [seat({ agency_id: "SC-0038129", name: "Michael Angelo Resposo", signOn: "2026-10-07", signOff: "2027-05-07", offSource: "projected" })],
  }];
  const r = shipSeats(sections);
  assert.equal(r.Reflection.outgoing.sc, "SC-0038115");
  assert.equal(r.Reflection.outgoing.off, "2026-11-13");
  assert.equal(r.Reflection.outgoing.offSource, "rita");
  assert.equal(r.Reflection.incoming.sc, "SC-0038104");
  assert.equal(r.Reflection.incoming.on, "2026-11-13");
  assert.equal(r.Reflection.incoming.tdg, true, "TDG earmarks him for that hull");
  assert.equal(r.Reflection.incoming.assignmentId, "as_1");
  assert.equal(r.Apex.outgoing.sc, "SC-0038129", "Resposo is on Apex");
  assert.ok(!r.Reflection.aboard.some((p) => p.sc === "SC-0038129"));
});

test("a seat TDG still holds past the sign-off leaves first; the relief already aboard is the incoming", () => {
  const r = shipSeats([{ ship: "Apex", brand: "Celebrity", crew: [
    seat({ agency_id: "B", name: "Belhida", signOn: "2026-03-14", signOff: "2026-10-07", offSource: "tdg", heldByFile: true }),
    seat({ agency_id: "R", name: "Resposo", signOn: "2026-10-07", signOff: "2027-05-07", offSource: "projected" }),
  ] }]);
  assert.equal(r.Apex.outgoing.sc, "B");
  assert.equal(r.Apex.outgoing.held, true);
  assert.equal(r.Apex.incoming.sc, "R");
  assert.equal(r.Apex.aboard.length, 2);
});

test("a training visit is never aboard, never outgoing, never the relief", () => {
  const r = shipSeats([{ ship: "Pursuit", brand: "Azamara",
    crew: [seat({ agency_id: "K", name: "Jugao", signOn: "2026-05-02", signOff: "2026-10-31", offSource: "rita" })],
    visits: [seat({ agency_id: "J", name: "Alonzo", signOn: "2026-10-16", signOff: "2026-10-24", visit: true })],
    projections: [card({ agency_id: "A", name: "Baleña", signOn: "2026-10-31", signOff: "2027-03-31" })],
  }]);
  assert.deepEqual(r.Pursuit.aboard.map((p) => p.sc), ["K"]);
  assert.equal(r.Pursuit.incoming.sc, "A");
});

test("Rita's card past its sign-on (awaiting the TDG file) is aboard", () => {
  const r = shipSeats([{ ship: "Grandeur", brand: "Royal", crew: [],
    projections: [card({ agency_id: "C", name: "Corpin", signOn: "2026-10-18", signOff: "2027-05-08", awaiting: true, aboard: true })] }]);
  assert.equal(r.Grandeur.outgoing.sc, "C");
  assert.equal(r.Grandeur.outgoing.awaiting, true);
  assert.equal(r.Grandeur.incoming, null);
});

test("a colleague who joined months ago is not the relief; nobody is named rather than a guess", () => {
  const r = shipSeats([{ ship: "Voyager", brand: "Royal", crew: [
    seat({ agency_id: "X", name: "First", signOn: "2026-04-14", signOff: "2026-11-13" }),
    seat({ agency_id: "Y", name: "Second", signOn: "2026-05-01", signOff: "2026-12-01" }),
  ] }]);
  assert.equal(r.Voyager.outgoing.sc, "X");
  assert.equal(r.Voyager.incoming, null);
});

test("nobody aboard: the first plan on the hull is the incoming, else TDG's undated Earmarked row", () => {
  const a = shipSeats([{ ship: "Getaway", brand: "NCL", crew: [],
    projections: [card({ agency_id: "E", name: "Eresmas", signOn: "2026-11-09", signOff: "2027-05-23" })] }]);
  assert.equal(a.Getaway.outgoing, null);
  assert.equal(a.Getaway.incoming.sc, "E");
  const b = shipSeats([{ ship: "Xcel", brand: "Celebrity", crew: [],
    projections: [card({ agency_id: "Q", name: "Aquitania", tdgEarmark: true, role: "earmark" })] }]);
  assert.equal(b.Xcel.incoming.sc, "Q");
  assert.equal(b.Xcel.incoming.on, null);
  assert.equal(b.Xcel.incoming.tdgEarmark, true);
});

test("worker.js exposes it as the SeatReader named entrypoint, read only, on the board's sections", () => {
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
  const i = src.indexOf("export const SeatReader = {");
  assert.ok(i > 0, "named export");
  const body = src.slice(i, src.indexOf("\n};\n", i));
  assert.match(body, /batchingDb\(env\.DB\)/);
  assert.match(body, /rotationSections\(env\)/);
  assert.match(body, /shipSeats\(sections\)/);
  assert.doesNotMatch(body, /INSERT|UPDATE|DELETE|MAILER/);
  assert.ok(src.indexOf("export const SeatReader") < src.indexOf("export default {"), "beside the default export");
});
