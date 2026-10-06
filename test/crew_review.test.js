import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRows, diffCrew } from "../src/crewimport.js";
import { buildReview, classifyField, liveOverrideFields, TIER } from "../src/crew_review.js";

// --- shared fixture -------------------------------------------------------
const existing = {
  "SC-1": { agency_id: "SC-1", first_name: "Jomar", last_name: "Dela Cruz",
    status: "On board", vessel_observed: "Celebrity Edge", med_exp: "2026-03-19",
    pp_exp: "2030-01-01", phone: "+63900000000", province: "Cavite" },
  "SC-2": { agency_id: "SC-2", first_name: "Maria", last_name: "Murillo",
    status: "On board", vessel_observed: "Icon of the Seas", med_exp: "2026-09-01" },
  "SC-3": { agency_id: "SC-3", first_name: "Kevin", last_name: "Tibay",
    status: "On board", vessel_observed: "Adventure of the Seas" },
};

const rawRows = [
  { "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board",
    "VESSEL NAME": "Celebrity Apex", "MEDICAL EXPIRATION DATE": "2028-03-19",
    "MOBILE NO.": "09171112222", "PROVINCE": "Cavite" },
  { "CREW ID": "SC-2", "FIRST NAME": "Maria", "LAST NAME": "Murillo", "CREW STATUS": "On board",
    "VESSEL NAME": "Icon of the Seas", "MEDICAL EXPIRATION DATE": "2026-07-20" },
  { "CREW ID": "SC-9", "FIRST NAME": "New", "LAST NAME": "Guy", "CREW STATUS": "Earmarked",
    "VESSEL NAME": "Wonder of the Seas" },
];

const overrides = {
  "SC-1": { agency_id: "SC-1", phone: "+63999999999", retired: 0 },
};

function review() {
  const { mapped } = mapRows(rawRows);
  const incomingByAgency = Object.fromEntries(mapped.map(m => [m.agency_id, m]));
  const diff = diffCrew(mapped, existing);
  return buildReview(diff, existing, incomingByAgency, overrides);
}

test("D1 vessel_observed change is a ship_flag and is never written", () => {
  const c = classifyField("vessel_observed", "Celebrity Edge", "Celebrity Apex", new Set());
  assert.equal(c.tier, TIER.SHIP);
  assert.equal(c.write, false);
  const r = review();
  const ship = r.groups.ship_flag.find(x => x.agency_id === "SC-1");
  assert.ok(ship, "SC-1 ship change present in ship_flag group");
  assert.equal(ship.write, false);
  assert.equal(r.groups.cert.some(x => x.field === "vessel_observed"), false);
});

test("D2 cert renewal (later) defaults accept, not flagged earlier", () => {
  const c = classifyField("med_exp", "2026-03-19", "2028-03-19", new Set());
  assert.equal(c.tier, TIER.CERT);
  assert.equal(c.defaultAccept, true);
  assert.equal(c.earlier, false);
});

test("D2 medical expiry moving EARLIER is flagged", () => {
  const c = classifyField("med_exp", "2026-09-01", "2026-07-20", new Set());
  assert.equal(c.tier, TIER.CERT);
  assert.equal(c.earlier, true);
  const r = review();
  const m = r.groups.cert.find(x => x.agency_id === "SC-2" && x.field === "med_exp");
  assert.ok(m && m.earlier, "SC-2 earlier medical is flagged");
});

// The file's "rank" is crew.rank_observed; Rita's manual rank is crew_override.rank_override. They
// are the same field with two names — a rank change under a live manual rank must be a D3 conflict
// (it used to slip through the CERT tier and be accepted silently, invisible behind the override).
test("rank_observed under a live rank_override is an override_conflict, naming the override column", () => {
  const ex = { "SC-7": { agency_id: "SC-7", first_name: "Ana", last_name: "Cruz", status: "On board", rank_observed: "Cook" } };
  const rows = [{ "CREW ID": "SC-7", "FIRST NAME": "Ana", "LAST NAME": "Cruz", "CREW STATUS": "On board", "RANK": "Sous Chef" }];
  const { mapped } = mapRows(rows);
  const inc = Object.fromEntries(mapped.map(m => [m.agency_id, m]));
  const ov = { "SC-7": { agency_id: "SC-7", rank_override: "Chef de Partie", retired: 0 } };
  const r = buildReview(diffCrew(mapped, ex), ex, inc, ov);
  const it = r.groups.override_conflict.find(x => x.agency_id === "SC-7" && x.field === "rank_observed");
  assert.ok(it, "rank change under a manual rank must land in the override tier");
  assert.equal(it.override_field, "rank_override");
  assert.equal(it.old, "Chef de Partie", "the card shows the manual rank as the value being replaced");
  assert.equal(it.new, "Sous Chef");
  assert.equal(r.groups.cert.some(x => x.field === "rank_observed"), false, "and NOT silently in the accept-by-default tier");
  // base already equals the file, override still differs -> still raised (second pass)
  const ex2 = { "SC-7": { ...ex["SC-7"], rank_observed: "Sous Chef" } };
  const r2 = buildReview(diffCrew(mapped, ex2), ex2, inc, ov);
  assert.ok(r2.groups.override_conflict.some(x => x.field === "rank_observed" && x.override_field === "rank_override"));
});

test("D3 change to a field with a live override is an override_conflict, default keep", () => {
  const live = liveOverrideFields(overrides["SC-1"]);
  assert.ok(live.has("phone"));
  const c = classifyField("phone", "+63900000000", "+63917...", live);
  assert.equal(c.tier, TIER.OVERRIDE);
  assert.equal(c.defaultKeep, true);
  const r = review();
  assert.ok(r.groups.override_conflict.some(x => x.agency_id === "SC-1" && x.field === "phone"));
});

test("retired override does not protect a field", () => {
  const live = liveOverrideFields({ phone: "+63x", retired: 1 });
  assert.equal(live.has("phone"), false);
});

test("D4 crew absent from file is flagged departed", () => {
  const r = review();
  assert.ok(r.groups.departed.some(x => x.agency_id === "SC-3"));
});

test("new crew surfaces in the new group", () => {
  const r = review();
  assert.ok(r.groups.new.some(x => x.agency_id === "SC-9"));
});

test("attention counts ship + override + earlier-expiry", () => {
  const r = review();
  assert.equal(r.attention, 3);
});

// "FOLLOW THE TDG FILE ALWAYS" (Miguel, 6 Oct 2026). Measured that day: 30 of the 38 crew_override rows were
// Retired snapshots from 7 Jul 2026 carrying the whole card (phone, passport, expiries), never reconciled
// because the review only looked at live rows, yet still winning at read time; and 29 of 31 phone/email
// overrides were already equal to the file — a second copy that outranks the next upload for nothing.
import { reconcilableOverrideFields, sameValue } from "../src/crew_review.js";

test("sameValue: a phone is its digits (0 and +63 are one number), an email is case-blind, the rest exact", () => {
  assert.equal(sameValue("phone", "09943316597", "+63 994 331 6597"), true, "Valdesco, 6 Oct 2026");
  assert.equal(sameValue("phone", "639953384915", "+63 995 338 4915"), true, "Alandy");
  assert.equal(sameValue("phone", "+63 995 338 4915", "+63 995 338 4916"), false);
  assert.equal(sameValue("phone", "", ""), false, "two blanks are not a match");
  assert.equal(sameValue("email", "Jaybellc@gmail.com ", "jaybellc@gmail.com"), true);
  assert.equal(sameValue("med_exp", "2026-07-30", "2026-07-30"), true);
  assert.equal(sameValue("med_exp", "2026-07-30", "2026-07-31"), false);
  assert.equal(sameValue("phone", null, "0917"), false);
});

test("a Retired tag no longer shields the row: every manual field but the tag's status is reconciled", () => {
  const ov = { agency_id: "SC-R", retired: 1, status: "Inactive", phone: "09676423969", pp_no: "P5937592C", med_exp: "2026-07-30", baseline_count: 3, notes: "n", vessel_observed: "X" };
  const r = reconcilableOverrideFields(ov);
  assert.deepEqual([...r].sort(), ["med_exp", "phone", "pp_no"]);
  assert.equal(liveOverrideFields(ov).size, 0, "the old live set still reads a retired row as unprotected (unchanged)");
  const live = reconcilableOverrideFields({ agency_id: "SC-L", retired: 0, status: "Earmarked", phone: "0917" });
  assert.ok(live.has("status") && live.has("phone"), "on a live row the manual status is reconciled like any field");
});

test("an override equal to the file is ABSORBED (no decision), one that differs on a retired crew is a conflict", () => {
  const ex = {
    "SC-A": { agency_id: "SC-A", first_name: "Joseph", last_name: "Alandy", status: "Inactive", phone: "+63 995 338 4915", email: "josephdandyal@gmail.com" },
    "SC-V": { agency_id: "SC-V", first_name: "Jerome", last_name: "Valdesco", status: "On board", phone: "+63 994 331 6597" },
    "SC-K": { agency_id: "SC-K", first_name: "King", last_name: "Manzano", status: "Inactive", phone: "0917", med_exp: "2026-03-04" },
  };
  const rows = [
    { "CREW ID": "SC-A", "FIRST NAME": "Joseph", "LAST NAME": "Alandy", "CREW STATUS": "Inactive", "MOBILE NO.": "+63 995 338 4915", "EMAIL ADDRESS": "JosephDandyAl@gmail.com" },
    { "CREW ID": "SC-V", "FIRST NAME": "Jerome", "LAST NAME": "Valdesco", "CREW STATUS": "On board", "MOBILE NO.": "+63 994 331 6597" },
    { "CREW ID": "SC-K", "FIRST NAME": "King", "LAST NAME": "Manzano", "CREW STATUS": "Inactive", "MOBILE NO.": "0918", "MEDICAL EXPIRATION DATE": "2027-03-04" },
  ];
  const ov = {
    "SC-A": { agency_id: "SC-A", retired: 1, status: "Inactive", phone: "639953384915", email: "josephdandyal@gmail.com" },
    "SC-V": { agency_id: "SC-V", retired: 0, phone: "09943316597" },
    "SC-K": { agency_id: "SC-K", retired: 1, status: "On Vacation", phone: "0917", med_exp: "2026-03-04" },
  };
  const { mapped } = mapRows(rows);
  const inc = Object.fromEntries(mapped.map(m => [m.agency_id, m]));
  const r = buildReview(diffCrew(mapped, ex), ex, inc, ov);
  const ab = r.groups.override_absorbed;
  assert.deepEqual(ab.map(x => x.agency_id + ":" + x.field).sort(), ["SC-A:email", "SC-A:phone", "SC-V:phone"]);
  const a = ab.find(x => x.agency_id === "SC-A" && x.field === "phone");
  assert.equal(a.override_field, "phone"); assert.equal(a.override_value, "639953384915"); assert.equal(a.new, "+63 995 338 4915");
  assert.equal(r.groups.override_conflict.some(x => x.agency_id === "SC-A" || x.agency_id === "SC-V"), false, "equal is not a conflict");
  // retired crew, manual values the file contradicts: raised as conflicts (default accept), phone AND the expiry
  const k = r.groups.override_conflict.filter(x => x.agency_id === "SC-K").map(x => x.field).sort();
  assert.deepEqual(k, ["med_exp", "phone"]);
  assert.equal(r.groups.override_conflict.some(x => x.agency_id === "SC-K" && x.field === "status"), false, "the status kept with the tag is exempt (unretireItems owns it)");
  assert.equal(r.counts.override_absorbed, 3);
  assert.equal(r.attention, 2, "absorbed rows need nobody; the two SC-K conflicts do");
});
