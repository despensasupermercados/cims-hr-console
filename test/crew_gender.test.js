// Gender is TDG's word (6 Oct 2026): read from a GENDER or SEX column when the AdvancedQuery carries one,
// normalised to M / F, written like any other card field, and NEVER inferred from a name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRow, normGender, diffCrew } from "../src/crewimport.js";
import { CREW_WRITABLE } from "../src/crew_import_routes.js";

test("the file's word becomes M or F; anything else is unknown", () => {
  for (const [v, want] of [["M", "M"], ["m", "M"], ["Male", "M"], ["F", "F"], ["female", "F"], ["", null], ["X", null], [null, null], ["Mr", null]]) {
    assert.equal(normGender(v), want, String(v));
  }
});

test("a GENDER or SEX column is read; a file without one leaves gender unknown", () => {
  const base = { "CREW ID": "SC-0000001", "LAST NAME": "Cruz", "FIRST NAME": "Ana", "CREW STATUS": "On board" };
  assert.equal(mapRow({ ...base, "GENDER": "F" }).gender, "F");
  assert.equal(mapRow({ ...base, "SEX": "Male" }).gender, "M");
  assert.equal(mapRow(base).gender, null, "no column: unknown, never guessed from the first name");
});

test("a gender change reaches the card through the same write path as every other field", () => {
  assert.ok(CREW_WRITABLE.has("gender"));
  const existing = [{ agency_id: "SC-0000001", first_name: "Ana", last_name: "Cruz", status: "On board", gender: null }];
  const incoming = [mapRow({ "CREW ID": "SC-0000001", "LAST NAME": "Cruz", "FIRST NAME": "Ana", "CREW STATUS": "On board", "GENDER": "F" })];
  const d = diffCrew(incoming, existing);
  const ch = (d.change || []).find((c) => c.agency_id === "SC-0000001");
  assert.ok(ch && ch.changed.includes("gender"), "gender is tracked");
  const none = diffCrew([mapRow({ "CREW ID": "SC-0000001", "LAST NAME": "Cruz", "FIRST NAME": "Ana", "CREW STATUS": "On board" })], existing);
  assert.ok(!(none.change || []).some((c) => c.changed.includes("gender")), "a file without the column changes nothing");
});
