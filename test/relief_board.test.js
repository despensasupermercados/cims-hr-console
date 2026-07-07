import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReliefBoard, handoverStatus, urgency, workflowStatus, validateWrite } from "../src/relief_board.js";

const CONFIG = { critical_days: 14, due_days: 30 };
const TODAY = "2026-07-07";

test("urgency thresholds (§4.2)", () => {
  assert.equal(urgency(10, CONFIG), "critical");
  assert.equal(urgency(20, CONFIG), "due");
  assert.equal(urgency(40, CONFIG), "open");
  assert.equal(urgency(null, CONFIG), "open");
});

test("handover: none / clean / port_mismatch / gap (§4.1)", () => {
  assert.equal(handoverStatus({ off_date: "2026-08-10", off_city: "Athens" }, null).kind, "none");
  assert.equal(handoverStatus({ off_date: "2026-08-10", off_city: "Athens" }, { on_date: "2026-08-10", on_city: "Athens" }).kind, "clean");
  assert.equal(handoverStatus({ off_date: "2026-08-10", off_city: "Athens" }, { on_date: "2026-08-10", on_city: "Piraeus" }).kind, "port_mismatch");
  const g = handoverStatus({ off_date: "2026-08-10", off_city: "Athens" }, { on_date: "2026-08-13", on_city: "Athens" });
  assert.equal(g.kind, "gap"); assert.equal(g.days, 3);
});

test("workflowStatus from *_sent_at presence (§4.3)", () => {
  assert.deepEqual(workflowStatus({ instructions_sent_at: "x", signoff_link_sent_at: null }), { instructions: true, link: false, review: false });
});

test("board derives cities + sorts by cost of delay (§4.4)", () => {
  const assignments = [
    { id: "a1", role: "printer", crew_name: "Rudy", vessel_key: "Royal Caribbean|Quest", off_date: "2026-08-10", has_deployment: true },
    { id: "a2", role: "reliever", crew_name: "Orlan", vessel_key: "Royal Caribbean|Quest", on_date: "2026-08-10", has_deployment: true },
    { id: "a3", role: "printer", crew_name: "Ryan", vessel_key: "Celebrity|Onward", off_date: "2026-07-14", has_deployment: true },
    { id: "a4", role: "printer", crew_name: "Dave", vessel_key: "Celebrity|Pursuit", off_date: "2026-08-12", has_deployment: true },
  ];
  const portDaysByShip = {
    "Royal Caribbean|Quest": [{ berth_date: "2026-08-10", port_name: "Piraeus (Athens), Greece", is_sea: 0 }],
    "Celebrity|Onward": [{ berth_date: "2026-07-14", port_name: "Barcelona, Spain", is_sea: 0 }],
  };
  const board = buildReliefBoard({ assignments, portDaysByShip, config: CONFIG, today: TODAY });
  assert.equal(board[0].vessel_key, "Celebrity|Onward");
  assert.equal(board[0].urgency, "critical");
  assert.equal(board[board.length - 1].vessel_key, "Royal Caribbean|Quest");
  assert.equal(board[board.length - 1].handover.kind, "clean");
  const quest = board.find((r) => r.vessel_key === "Royal Caribbean|Quest");
  assert.equal(quest.reliever.on_city, "Piraeus (Athens), Greece");
  assert.equal(quest.reliever.on_conf, "derived");
});

test("Port-Louis seed case: no coverage + seed -> seed confidence", () => {
  const board = buildReliefBoard({
    assignments: [{ id: "p", role: "printer", crew_name: "Adrian", vessel_key: "Azamara|Journey", on_date: "2026-07-07", on_port_seed: "Port Louis", off_date: "2026-07-25", has_deployment: true }],
    portDaysByShip: { "Azamara|Journey": [{ berth_date: "2026-07-25", port_name: "Berlin (Warnemunde), Germany", is_sea: 0 }] },
    config: CONFIG, today: TODAY,
  });
  const j = board[0];
  assert.equal(j.printer.on_city, "Port Louis");
  assert.equal(j.printer.on_conf, "seed");
  assert.equal(j.printer.off_conf, "derived");
});

test("NCL (has_deployment=false, no port days) -> TBA, never fabricated (invariant #6)", () => {
  const board = buildReliefBoard({
    assignments: [{ id: "n", role: "printer", crew_name: "Pilot", vessel_key: "NCL|Getaway", on_date: "2026-07-20", off_date: "2026-08-20", has_deployment: false }],
    portDaysByShip: {}, config: CONFIG, today: TODAY,
  });
  assert.equal(board[0].printer.on_conf, "TBA");
  assert.equal(board[0].printer.off_conf, "TBA");
  assert.equal(board[0].printer.on_city, null);
});

test("validateWrite: rejects derived city writes, accepts stored (§6)", () => {
  const r = validateWrite({ crew_id: "c1", role: "reliever", override_on_city: "Athens", on_city: "HACK", off_conf: "derived" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.rejected.sort(), ["off_conf", "on_city"]);
  assert.equal(r.cleaned.override_on_city, "Athens");
  assert.equal(r.cleaned.on_city, undefined);
});

test("validateWrite: clean payload passes", () => {
  const r = validateWrite({ crew_id: "c1", role: "printer", sign_on: "2026-07-01", eccr: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.rejected.length, 0);
});
