import { test } from "node:test";
import assert from "node:assert/strict";
import { norm, buildRoster, matchCrew } from "../src/crewmatch.js";

const roster = buildRoster([
  { agency_id: "SC-1", first_name: "Rommel", last_name: "Madrinico", status: "On Vacation" },
  { agency_id: "SC-2", first_name: "Zandro", last_name: "Espenilla", status: "On board" },
  { agency_id: "SC-3", first_name: "Adrian Dexter", last_name: "Domingo", status: "On board" },
  { agency_id: "SC-4", first_name: "John", last_name: "Santos", status: "On board" },
  { agency_id: "SC-5", first_name: "Mark", last_name: "Santos", status: "On board" },
]);

test("norm lowercases and strips punctuation", () => {
  assert.equal(norm("O'Brien, Jr."), "o brien jr");
  assert.equal(norm(null), "");
});

test("full name (first + last) -> high confidence, single crew", () => {
  const r = matchCrew("Issue with Rommel Madrinico on the Utopia — late toner orders.", roster);
  assert.equal(r.agency_id, "SC-1");
  assert.equal(r.confidence, "high");
});

test("name in reversed order still matches high", () => {
  const r = matchCrew("Re: Madrinico Rommel — par not maintained", roster);
  assert.equal(r.agency_id, "SC-1");
  assert.equal(r.confidence, "high");
});

test("first and last anywhere in the text -> high", () => {
  const r = matchCrew("Zandro did great this contract. Espenilla kept the machine clean.", roster);
  assert.equal(r.agency_id, "SC-2");
  assert.equal(r.confidence, "high");
});

test("unique last name only -> med confidence", () => {
  const r = matchCrew("Espenilla had a rush order last week.", roster);
  assert.equal(r.agency_id, "SC-2");
  assert.equal(r.confidence, "med");
});

test("ambiguous shared last name -> low, no auto-file", () => {
  const r = matchCrew("Santos missed a PM cycle.", roster); // two Santos
  assert.equal(r.agency_id, null);
  assert.equal(r.confidence, "low");
  assert.deepEqual(r.candidates.sort(), ["SC-4", "SC-5"]);
});

test("no name found -> none", () => {
  const r = matchCrew("General reminder about toner ordering deadlines.", roster);
  assert.equal(r.agency_id, null);
  assert.equal(r.confidence, "none");
});

test("multi-word first name (Adrian Dexter Domingo)", () => {
  const r = matchCrew("forwarded: Adrian Dexter Domingo — communication issues on Journey", roster);
  assert.equal(r.agency_id, "SC-3");
  assert.equal(r.confidence, "high");
});
