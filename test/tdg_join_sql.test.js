// Every crew read that joins TDG's file runs on a REAL SQLite database (6 Oct 2026). Joining
// registry_snapshot as a plain table made the readers' unqualified `SELECT agency_id, status, ...`
// ambiguous — six crew routes would have failed. The static pins could not see it; this can.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { TDG_ABSENT_JOIN, TDG_ABSENT_COL, crewStatus } from "../src/crew_status.js";

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8") + readFileSync(new URL("../src/doc_radar.js", import.meta.url), "utf-8");

function db() {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE crew (id TEXT, agency_id TEXT, first_name TEXT, middle_name TEXT, last_name TEXT, status TEXT, rank_observed TEXT, rank_override TEXT,
    vessel_observed TEXT, dob TEXT, province TEXT, phone TEXT, email TEXT, gender TEXT, pp_no TEXT, med_exp TEXT, sirb_exp TEXT, pp_exp TEXT, usv_exp TEXT, sch_exp TEXT,
    baseline_count INTEGER, ship_crew_id TEXT, redacted INTEGER DEFAULT 0);
    CREATE TABLE sync_conflict (id TEXT, import_run_id TEXT, agency_id TEXT, field TEXT, old_value TEXT, new_value TEXT, resolved INTEGER, created_at TEXT);
    CREATE TABLE registry_snapshot (agency_id TEXT PRIMARY KEY, status TEXT, vessel TEXT, run_at TEXT, import_run_id TEXT, name TEXT, raw_status TEXT);
    INSERT INTO crew (id, agency_id, first_name, last_name, status, vessel_observed) VALUES ('1','SC-1','Jerome','Valdesco','On board',NULL), ('2','SC-2','John','Aquitania','Inactive',NULL);
    INSERT INTO registry_snapshot VALUES ('SC-1','On board','MV BRILLIANCE OF THE SEAS','2026-10-05','r1','Jerome Valdesco','On board'), ('SC-2',NULL,'MV CELEBRITY CONSTELLATION','2026-10-05','r1','John Aquitania','Reserved Crew');`);
  return d;
}

test("every crew read that joins the TDG file runs on real SQLite (no ambiguous column)", () => {
  const re = /"SELECT ([^"]+), " \+ TDG_ABSENT_COL \+ " (?:" \+\s*")?FROM crew " \+ TDG_ABSENT_JOIN \+ " WHERE redacted=/g;
  const cols = [...SRC.matchAll(re)].map((m) => m[1]);
  assert.ok(cols.length >= 7, "found " + cols.length + " readers");
  const d = db();
  for (const c of cols) {
    const rows = d.prepare("SELECT " + c + ", " + TDG_ABSENT_COL + " FROM crew " + TDG_ABSENT_JOIN + " WHERE redacted=0").all();
    assert.equal(rows.length, 2, c);
  }
});

test("the kept file's word reaches crewStatus: active beats a Retired tag; Reserved Crew reads On Vacation", () => {
  const rows = db().prepare("SELECT agency_id, status, " + TDG_ABSENT_COL + " FROM crew " + TDG_ABSENT_JOIN + " WHERE redacted=0 ORDER BY agency_id").all();
  const by = Object.fromEntries(rows.map((r) => [r.agency_id, r]));
  assert.equal(by["SC-1"].tdg_ship, "MV BRILLIANCE OF THE SEAS");
  assert.equal(crewStatus(by["SC-1"], { retired: 1 }, [], "2026-10-06"), "On board", "TDG has him aboard: the tag is overridden");
  assert.equal(crewStatus(by["SC-2"], {}, [], "2026-10-06"), "On Vacation", "TDG's 'Reserved Crew' is the reserve pool");
  assert.equal(crewStatus({ status: "Inactive" }, { retired: 1 }, [], "2026-10-06"), "Retired", "no kept word: the tag stands");
  assert.equal(crewStatus({ status: "On board", tdg_status: "On Vacation" }, { status: "On board" }, [], "2026-10-06"), "On board", "an inactive file word does not beat a status edit");
});
