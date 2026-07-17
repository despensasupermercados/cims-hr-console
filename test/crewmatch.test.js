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

// ---- v2: the "Resposo case" and forwarded-thread hygiene ----
const roster2 = buildRoster([
  { agency_id: "SC-0038129", first_name: "Michael Angelo", last_name: "Resposo", status: "On board" },
  { agency_id: "SC-0038392", first_name: "Joemar", last_name: "De Leon", status: "On board" },
  { agency_id: "SC-0038378", first_name: "Ohji", last_name: "Miranda", status: "Earmarked" },
]);

const FWD = [
  "Team, employee: Michael Resposo has inventory discrepancies that must be corrected before sign-off.",
  "",
  "From: Michael Resposo <mr@ship.com>",
  "To: Joemar De Leon <joemar.deleon@dg3.com>",
  "Cc: Ray Guerra <rg@dg3.com>; Ohji Miranda <Ohji.Miranda@dg3.com>",
  "Subject: RE: OPB Inventory Review",
  "",
  "Noted on the findings below. Will correct the OPB figures.",
  "Michael Resposo",
  "Printer Specialist, Celebrity Reflection",
].join("\n");

test("v2: forwarded thread files to the subject named in the fresh note (Resposo case)", () => {
  const r = matchCrew(FWD, roster2);
  assert.equal(r.agency_id, "SC-0038129");
  assert.equal(r.confidence, "high");
});

test("v2: quoted To/Cc header names do not become candidates", () => {
  const r = matchCrew(FWD, roster2);
  assert.deepEqual(r.candidates, ["SC-0038129"]);
});

test("v2: compound first name matches on a single token (Michael Resposo)", () => {
  const r = matchCrew("Michael Resposo missed the PM cycle on Reflection.", roster2);
  assert.equal(r.agency_id, "SC-0038129");
  assert.equal(r.confidence, "high");
});

test("v2: ambiguity still never auto-files, and includes surname hits in candidates", () => {
  const two = buildRoster([
    { agency_id: "SC-A", first_name: "Joemar", last_name: "De Leon" },
    { agency_id: "SC-B", first_name: "Ohji", last_name: "Miranda" },
    { agency_id: "SC-C", first_name: "Michael Angelo", last_name: "Resposo" },
  ]);
  const r = matchCrew("Joemar De Leon and Ohji Miranda discussed the case of Resposo.", two);
  assert.equal(r.agency_id, null);
  assert.equal(r.confidence, "low");
  assert.ok(r.candidates.includes("SC-C"), "surname-only hit must appear on the review card");
});
