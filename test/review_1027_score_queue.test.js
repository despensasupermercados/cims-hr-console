// THE 27 OCT 2026 REVIEW: THE SCORE QUEUE (money-adjacent, §1 — Miguel's merge). The queue ("signed off recently, needs
// scoring") walked the schedule's raw legs while the commit scores CONTRACTS (scorequeue.scoreContracts, Miguel 17 Oct 2026):
// a trainer's visit and one leg of a transfer were listed as due while the commit refuses both (visit, still_aboard).
// worker.js keeps apiScoreQueue private, so the file is copied with an export line (the bughunt_1016_plumbing way).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
const TMP = new URL(`../src/__sq1027_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, SRC + "\nexport { apiScoreQueue };\n", "utf-8");
let W;
try { W = await import(TMP.href); } finally { unlinkSync(TMP); }

const crew = (sc, first, last) => ({ id: "crew_" + sc, agency_id: sc, first_name: first, last_name: last, vessel_observed: null });
const state = (today, HIST) => ({
  today, HIST,
  crewRows: [crew("SC-OHJI", "Ohji", "Miranda"), crew("SC-TUAZ", "Jaramiz", "Tuazon"), crew("SC-PLAIN", "Ana", "Reyes")],
  fbRoles: () => [], statusOf: () => "On board", shipOf: (v) => v || null,
});
const queue = async (st, days = 14) => (await W.apiScoreQueue({}, new URL("https://x/api/score/queue?days=" + days), st)).json();

test("a training visit is never 'signed off, needs scoring'", async () => {
  const HIST = [{ sc: "SC-OHJI", ours: true, ship: "Onward", on: "2026-09-07", off: "2026-09-12", is_current: false, visit: true }];
  const q = await queue(state("2026-09-15", HIST));
  assert.deepEqual(q.recent.map((r) => r.agency_id), []);
});

test("one leg of a transfer is not a contract signed off; the transfer is listed once it has ended, every ship on it", async () => {
  const HIST = [
    { sc: "SC-TUAZ", ours: true, ship: "Explorer", on: "2026-06-06", off: "2026-08-23", is_current: false },
    { sc: "SC-TUAZ", ours: true, ship: "Jewel", on: "2026-08-28", off: "2027-03-28", is_current: true },
  ];
  const q = await queue(state("2026-08-30", HIST));
  assert.deepEqual(q.recent.map((r) => r.agency_id), [], "still aboard Jewel: the Score Card refuses it (still_aboard)");
  const ended = HIST.map((h) => (h.ship === "Jewel" ? { ...h, off: "2027-03-20", is_current: false } : h));
  const q2 = await queue(state("2027-03-25", ended));
  assert.deepEqual(q2.recent.map((r) => [r.agency_id, r.ship, r.signOn, r.signOff]), [["SC-TUAZ", "Explorer, Jewel", "2026-06-06", "2027-03-20"]]);
});

test("a plain contract is listed as before", async () => {
  const HIST = [{ sc: "SC-PLAIN", ours: true, ship: "Radiance", on: "2026-03-01", off: "2026-09-10", is_current: false }];
  const q = await queue(state("2026-09-15", HIST));
  assert.deepEqual(q.recent.map((r) => [r.agency_id, r.ship, r.signOff]), [["SC-PLAIN", "Radiance", "2026-09-10"]]);
  const up = await queue(state("2026-09-01", HIST));
  assert.deepEqual(up.upcoming.map((r) => [r.agency_id, r.signOff]), [["SC-PLAIN", "2026-09-10"]]);
});
