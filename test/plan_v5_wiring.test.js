// Keyman Board Redesign v5, phase 4 (2026-09-15) — static pins on the wiring that the sqlite/fake-D1
// suites cannot reach: the Add-crew form, the Counter dry-run checkboxes and the Hide confirms live in
// the inline client script; apiCrewAdd's statements are pinned by shape (the same approach as
// status_consistency.test.js). Behaviour of the modules themselves is pinned in crew_apply.test.js,
// crew_import_routes.test.js, crew_flags.test.js, keyman_import_apply.test.js and projection.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const UI = readFileSync(new URL("../src/crew_import_ui.js", import.meta.url), "utf8");

function body(sig) {
  const i = SRC.indexOf(sig);
  assert.ok(i >= 0, "missing " + sig);
  let depth = 0, j = SRC.indexOf("{", i);
  for (; j < SRC.length; j++) { if (SRC[j] === "{") depth++; else if (SRC[j] === "}" && --depth === 0) break; }
  return SRC.slice(i, j + 1);
}

// C. A ship on the Add-crew form is a PROJECTION, not a registry ship.
test("apiCrewAdd never writes vessel_observed (crew or crew_override) and creates a projection instead", () => {
  const add = body("async function apiCrewAdd(");
  const crewIns = add.slice(add.indexOf("INSERT INTO crew ("), add.indexOf(".run()", add.indexOf("INSERT INTO crew (")));
  assert.match(crewIns, /vessel_observed,dob,pp_no,baseline_count,redacted,created_at,updated_at\) VALUES \(\?,\?,'MAN',\?,\?,\?,\?,\?,NULL,/,
    "crew.vessel_observed must be a literal NULL on add — the registry ship is TDG's word, not the form's");
  assert.doesNotMatch(crewIns, /b\.vessel_observed/, "the form's ship must not be bound into the crew row");
  const ovr = add.slice(add.indexOf("INSERT INTO crew_override"));
  const cols = ovr.slice(ovr.indexOf("(") + 1, ovr.indexOf(")"));
  assert.ok(!/\bvessel_observed\b/.test(cols), "crew_override.vessel_observed must not be seeded on add. Columns: " + cols);
  assert.match(add, /createProjection\(env, \{ agencyId: id, ship, today: TODAY\(\) \}/, "the ship becomes a projection through the drag's own path");
  assert.match(add, /canonShipWith\(planShip, SHIP_KEYS\)/, "the form's 'MV ADVENTURE' must canonicalise to the vessel table's short name");
  assert.match(add, /projection_create/, "a created plan is logged like a drop");
  assert.match(add, /return json\(\{ ok: true, agency_id: id, projection \}\)/, "the crew row is saved even when the plan fails; the plan result travels back");
});

test("the Add-crew form sends the ship as a plan and tells the user when the plan failed", () => {
  const save = body("async function saveNewCrew(");
  assert.match(save, /ship:document\.getElementById\('aShip'\)\.value\|\|null/);
  assert.doesNotMatch(save, /vessel_observed/, "the client must not send vessel_observed from Add crew");
  assert.match(save, /r\.projection&&!r\.projection\.ok/, "a failed plan is surfaced, not swallowed");
  const modal = body("function addCrewModal(");
  assert.match(modal, /Ship \(plan/, "the field is labelled as a plan");
  assert.match(modal, /yellow card/, "the hint says what the ship becomes");
});

// B. Counter upload: contradicted projections are settled per row.
test("the Counter dry-run offers a checkbox per contradicted projection and Apply sends the ticked ids", () => {
  assert.match(SRC, /<input type=checkbox class=kmdrop value="'\+impEsc\(x\.id\)\+'">/, "one .kmdrop checkbox per conflict row, keyed by assignment id");
  const apply = body("async function applyKeyman(");
  assert.match(apply, /querySelectorAll\('\.kmdrop:checked'\)/);
  assert.match(apply, /dropConflicts:drop/);
  assert.match(apply, /r\.dropped/, "the result names the cards the file replaced");
});

test("apiKeymanImport honours dropConflicts only for ids the diff reported as conflicts", () => {
  const b = body("async function apiKeymanImport(");
  assert.match(b, /for \(const c of report\.conflicts\) \{\s*if \(!wanted\.has\(String\(c\.id\)\)\) continue;/, "iterate the diff's conflicts, filter by the request — never the other way round");
  assert.doesNotMatch(b, /for \(const id of b\.dropConflicts/, "the request list must never drive removals directly");
});

// D. Hide says the person leaves the timecard roster export too.
test("both Hide confirms name the timecard roster export", () => {
  const confirms = SRC.match(/confirm\('Hide this crew card\?[^']*'\)/g) || [];
  assert.equal(confirms.length, 2, "expected the Keyman-board and Crew-tab Hide confirms");
  for (const c of confirms) assert.match(c, /timecard roster export/, c);
});

// A. AdvancedQuery review: the ship row is a three-way decision.
test("the review UI offers Keep board / Take TDG / Dismiss on a ship flag, and seg renders N options", () => {
  assert.match(UI, /seg\("ship:"\+it\.agency_id,"flag",\["flag","take","dismiss"\],\["Keep board","Take TDG","Dismiss"\]\)/);
  assert.match(UI, /for\(var i=0;i<opts\.length;i\+\+\)h\+='<button class="'\+\(cur===opts\[i\]\?'on':''\)/, "seg must loop over options — the third button was silently dropped by the two-slot version");
  assert.match(UI, /shipTake/, "the cart counts takes as saves");
});

// The foreign key that killed every manual add: crew.agency_code -> agency(code), and only TDG was seeded.
test("ensureCrewExtras seeds the MAN agency row that apiCrewAdd's INSERT depends on (and the migration matches)", () => {
  const ens = body("async function ensureCrewExtrasImpl(");
  assert.match(ens, /INSERT OR IGNORE INTO agency \(id,code,name\) VALUES \('agency-man','MAN',/);
  const add = body("async function apiCrewAdd(");
  assert.match(add, /await ensureCrewExtras\(env\)/, "apiCrewAdd must run the guard before its INSERT");
  assert.ok(add.indexOf("ensureCrewExtras(env)") < add.indexOf("INSERT INTO crew ("), "guard runs before the crew insert");
  assert.match(add, /'MAN'/, "the manual agency code apiCrewAdd writes");
  const mig = readFileSync(new URL("../migrations/0018_agency_manual.sql", import.meta.url), "utf8");
  assert.match(mig, /INSERT OR IGNORE INTO agency \(id,code,name\) VALUES \('agency-man','MAN',/);
});
