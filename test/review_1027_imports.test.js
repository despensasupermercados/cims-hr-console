// 27 Oct 2026 review — the TDG import's identity and blanks, and the console's plumbing. Each case failed on the code of
// that morning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapRow, diffCrew, buildIdentityIndex, resolveExisting } from "../src/crewimport.js";
import { buildReview, TIER } from "../src/crew_review.js";
import { secretEquals } from "../src/roster_export.js";

const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

test("the header is matched EXACTLY first: SHIP CREW ID before CREW ID keys the row on the crew id, CIVIL STATUS before CREW STATUS reads the status", () => {
  const a = mapRow({ "SHIP CREW ID": "349195", "CREW ID": "SC-0040010", "FIRST NAME": "Ida", "LAST NAME": "Purnama", "CREW STATUS": "On board" });
  assert.equal(a.agency_id, "SC-0040010", "every row used to key on the 6-digit cruise-line id: 37 new crew, the Purnama duplicate x37");
  assert.equal(a.ship_crew_id, "349195");
  const b = mapRow({ "CREW ID": "SC-1", "FIRST NAME": "A", "LAST NAME": "B", "CIVIL STATUS": "Married", "CREW STATUS": "On board" });
  assert.equal(b.status, "On board"); assert.equal(b.status_raw, "On board");
  const c = mapRow({ "SHIP CREW ID": "349195", "FIRST NAME": "A", "LAST NAME": "B", "STATUS": "On board" });
  assert.equal(c, null, "a file with no crew-id column keys nothing on the cruise-line id");
  const d = mapRow({ "CREW ID": "SC-2", "FIRST NAME": "A", "LAST NAME": "B", "STATUS": "On board", "VESSEL": "MV APEX" });
  assert.equal(d.vessel_observed, "MV APEX", "the substring fallback still reads TDG's headers as before");
});

test("two file rows that resolve to one crew are a COLLISION: neither applied, both listed; a cruise-line id two roster rows share resolves nobody", () => {
  const ex = [{ agency_id: "SC-0040010", first_name: "Ida Bagus Made", last_name: "Purnama", status: "On board", ship_crew_id: "349195" }];
  const inc = [
    { agency_id: "SC-0040010", first_name: "Ida Bagus Made", last_name: "Purnama", status: "On board" },
    { agency_id: "349195", first_name: "Ida", last_name: "Purnama", status: "On Vacation" },
  ];
  const d = diffCrew(inc, buildIdentityIndex(ex));
  assert.deepEqual(d.collisions, [{ agency_id: "SC-0040010", incoming_ids: ["SC-0040010", "349195"] }]);
  assert.deepEqual([d.change, d.add, d.rekeyed], [[], [], []], "the second row used to overwrite the first's name and status on the crew");
  const rv = buildReview(d, Object.fromEntries(ex.map((r) => [r.agency_id, r])), Object.fromEntries(inc.map((m) => [m.agency_id, m])), {});
  assert.equal(rv.groups.collisions.length, 1);
  assert.deepEqual(rv.groups.departed, [], "in the file twice is not 'left the fleet'");
  const idx = buildIdentityIndex([{ agency_id: "SC-DUP", ship_crew_id: "349195", redacted: 1 }, { agency_id: "SC-0040010", ship_crew_id: "349195" }]);
  assert.equal(resolveExisting({ agency_id: "349195" }, idx).row, null, "a shared cruise-line id resolves nobody (it used to pick the first, a hidden row)");
  assert.ok(idx.kmClash.has("349195"));
});

test("a blank cell over a manual entry whose base is already empty is reconciled like any other blank", () => {
  const ex = { "SC-1": { agency_id: "SC-1", phone: null, status: "On board" } };
  const inc = { agency_id: "SC-1", status: "On board", phone: null };
  Object.defineProperty(inc, "_blank", { value: ["phone"], enumerable: false });
  const rv = buildReview({ change: [], add: [], rekeyed: [], needsStatus: [] }, ex, { "SC-1": inc }, { "SC-1": { agency_id: "SC-1", phone: "0917 000 0000" } });
  const it = rv.groups[TIER.OVERRIDE].find((x) => x.field === "phone");
  assert.ok(it, "the manual phone used to stay while the same file cleared another card's");
  assert.equal(it.new, null); assert.equal(it.override_value, "0917 000 0000");
});

test("the console's plumbing: an agency id is TDG's shape, escHtml escapes the apostrophe, console POSTs refuse another host's Origin, the bootstrap key compares in constant time", async () => {
  assert.match(W, /if \(!\/\^\[A-Za-z\]\{1,4\}-\?\[A-Za-z0-9\]\{3,12\}\$\/\.test\(id\)\) return json\(\{ error: "bad_agency_id" \}, 400\);/, "Add crew refuses a free-text id");
  assert.match(W, /function escHtml\(s\)\{[^\n]*replace\(\/'\/g,'&#39;'\);\}/, "escHtml escapes ' (eight onclick handlers embed the id in a quoted JS string)");
  assert.match(W, /data-crew="'\+escHtml\(h\.sc\)\+'" onclick="openCrew\(\\\\''\+escHtml\(h\.sc\)\+'\\\\'\)"/, "the Keyman history card escapes the id");
  assert.match(readFileSync(new URL("../src/relief_ui.js", import.meta.url), "utf8"), /function rEsc\(v\)\{[^\n]*replace\(\/'\/g,"&#39;"\);\}/);
  assert.match(W, /if \(request\.method === "POST" && crossSite\(request, url\)\) return json\(\{ error: "cross_site" \}, 403\);\n        if \(p === "\/api\/me"\)/, "the Origin check sits right after the session check on every /api POST");
  assert.match(W, /import \{ installAudit, crossSite \} from "\.\/audit_routes\.js";/);
  assert.match(W, /!\(await secretEquals\(String\(key \|\| ""\), env\.BOOTSTRAP_KEY\)\)/);
  assert.equal(await secretEquals("a-long-key", "a-long-key"), true);
  assert.equal(await secretEquals("a-long-key", "a-long-kez"), false);
  assert.equal(await secretEquals("", ""), false);
});

test("the profile's grade reads the count row like every other reader (the visit mark rides on it); Maria never sees an archived note", () => {
  assert.match(W, /SELECT c\.\*, r\.debarked_at AS tdg_off, r\.embarked_at AS tdg_on" \+ CC_VISIT_COLS \+ " FROM contract_count c LEFT JOIN registry_snapshot r ON r\.agency_id = c\.sc" \+ CC_VISIT_JOIN \+ " WHERE c\.sc=\?"\)\.bind\(id\)/);
  assert.match(W, /completedSince\(ccRow\.as_of, ccRow\.tdg_on !== undefined \? ccRowOf\(ccRow\) : rsRow, today\)/);
  assert.match(W, /manual_notes: \(notes\.notes \|\| \[\]\)\.filter\(\(n\) => !n\.archived_at\)/);
});
