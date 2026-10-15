// The travel-ledger → registry name bridge (src/travel_match.js), pinned on the names Rita actually typed
// (production travel_expense, 15 Oct 2026) against the roster as TDG spells it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTravelName, editDistance, buildCrewIndex, matchTravelName, annotateTravel, unmatchedTravel, travelClientOf } from "../src/travel_match.js";

const CREW = [
  ["SC-0038115", "Paqueo", "Bernard Winzon"], ["SC-0038090", "Villafranca", "Dave Maverick"], ["SC-0038193", "Egnisaban", "Mark Christian"],
  ["SC-0038131", "Eresmas", "Joe Art"], ["SC-0038388", "Murillo", "Maria Katrina Rica"], ["SC-0038701", "Reyes", "Manuel"],
  ["SC-0038377", "Tolentino", "Angelo"], ["SC-0038467", "Espenilla", "Zandro"], ["SC-0038283", "Espenilla", "Arwyn"],
  ["SC-0046075", "Tuazon", "Jaramiz Melen"], ["SC-0045606", "Tuazon", "Jeadrig Tizar"], ["SC-0045720", "Estandian", "Mark Jezreel"],
  ["SC-0038320", "Estandian", "Sharene"], ["SC-0045724", "Santos", "Christjel"], ["SC-0038075", "Santos", "Paul Aristedes"],
  ["SC-0038038", "Doctolero", "Edelmar"], ["SC-0045013", "Esteban", "Vincent"], ["358775", "JOSEPH", "EMIL RONDY"],
  ["SC-0038401", "Osorio", "Norman"], ["SC-0038447", "Marto", "Ryan Paolo"], ["SC-0038453", "Cedilla", "Allen Edward"],
  ["SC-0038391", "Mangulabnan", "Jomar"], ["SC-0046228", "Sapungan", "Queencel"], ["SC-0038473", "Dela Rosa", "Mark Joseph"],
  ["SC-0038464", "Valderrama", "Jeffrey"], ["SC-0038355", "Gorre", "John Jeffrey"], ["SC-0016319", "Corpin", "Archiegale"],
  ["SC-0038835", "Llobrera", "Artemio"], ["SC-0038379", "Medidas", "Mary Vivien"], ["SC-0044768", "Tañgonan", "Mara"],
  ["SC-0046383", "Baleña", "A.J. Lorenzo"], ["SC-0038381", "Espiritu", "Sheerween"], ["SC-0045989", "Quiming", "Raymond"],
  ["SC-0038350", "Villacortes", "Raymond"], ["SC-0038384", "Basto", "Juan Marcos"], ["SC-0045444", "Imperial", "Raymond"],
  ["SC-0038368", "Madrinico", "Rommel"], ["SC-0038390", "Tibay", "Kevin Louie"], ["SC-0038392", "De Leon", "Joemar"],
  ["SC-0038378", "Miranda", "Ohji"], ["SC-0040010", "Purnama", "Ida Bagus Made"], ["349195", "Purnama", "Ida"],
  ["SC-0043298", "Racho", "Christjhelen"], ["SC-0043083", "Catama", "Rnicolie"],
].map(([agency_id, last_name, first_name]) => ({ agency_id, last_name, first_name }));
const IX = buildCrewIndex(CREW);
const id = (raw) => matchTravelName(raw, IX).agency_id;
const how = (raw) => matchTravelName(raw, IX).how;

test("cleanTravelName strips notes, keeps the NCL tag", () => {
  const c = cleanTravelName("Espenilla, Zandro (Orlando)");
  assert.equal(c.last, "espenilla"); assert.deepEqual(c.first, ["zandro"]); assert.equal(c.note, "Orlando"); assert.equal(c.ncl, false);
  assert.equal(cleanTravelName("Manligas, Oscar (NCL prep.)").ncl, true);
  assert.equal(cleanTravelName("Velaso (in prep. for NCL)").ncl, true);
  assert.deepEqual(cleanTravelName("Ramos, Darryl (FLL) 1/11").first, ["darryl"]);
  assert.deepEqual(cleanTravelName("Vicedo, Manuel (Lima) 3 stops").first, ["manuel"]);
  assert.deepEqual(cleanTravelName("Estandian, Mark joins in Jan 2026").first, ["mark"]);
  assert.deepEqual(cleanTravelName("Alonzo, Jonathan (03/07 NH)").first, ["jonathan"]);
  assert.equal(cleanTravelName("Tañgonan, Mara").last, "tangonan", "accents fold");
});

test("editDistance counts one typo or one swap as 1", () => {
  assert.equal(editDistance("villfranca", "villafranca"), 1);
  assert.equal(editDistance("eginsaban", "egnisaban"), 1, "a transposition");
  assert.equal(editDistance("murillio", "murillo"), 1);
  assert.equal(editDistance("reyes", "rezes"), 1);
  assert.equal(editDistance("paqueo", "espenilla", 1), 2, "capped");
});

test("the exact spelling and the usual shortenings resolve", () => {
  assert.equal(id("Paqueo, Bernard"), "SC-0038115", "first token of a two-word first name");
  assert.equal(id("Murillo, Rica"), "SC-0038388", "any token of the first name");
  assert.equal(id("Murillo, Rica (Orlando)"), "SC-0038388");
  assert.equal(id("Cedilla, Alen"), "SC-0038453", "one typo in the first name");
  assert.equal(id("Mangulabnan, Joemar"), "SC-0038391");
  assert.equal(id("Sapungan, Queeencel"), "SC-0046228");
  assert.equal(id("Corpin, Archie"), "SC-0016319", "a prefix");
  assert.equal(id("Medidas, Vivien"), "SC-0038379");
  assert.equal(id("Tangonan, Mara"), "SC-0044768", "ñ folds");
  assert.equal(id("Balena, AJ"), "SC-0046383", "A.J. folds to aj");
  assert.equal(id("Espiritu, Ween"), "SC-0038381", "the only Espiritu carries a nickname (Sheerween → Ween)");
  assert.equal(how("Espiritu, Ween"), "surname", "...and says the surname alone decided, so the page can show it as weaker");
});

test("a unique surname carries a missing or unreadable first name", () => {
  assert.equal(id("Dela Rosa (Tampa)"), "SC-0038473");
  assert.equal(how("Dela Rosa (Tampa)"), "surname");
  assert.equal(id("Valderrama, Frey"), "SC-0038464", "the only Valderrama");
  assert.equal(id("Gore, Jeffrey"), null, "a 4-letter surname is never fuzzed; Gorre is not reached");
  assert.equal(id("Gorre, Jeffrey"), "SC-0038355");
});

test("a typo in the surname resolves when the first name agrees", () => {
  assert.equal(id("Villfranca, Dave"), "SC-0038090"); assert.equal(how("Villfranca, Dave"), "fuzzy");
  assert.equal(id("Eginsaban, Mark"), "SC-0038193");
  assert.equal(id("Erasmas, Joe Art"), "SC-0038131");
  assert.equal(id("Erasmas, Joe Art (not a sign on)"), "SC-0038131");
  assert.equal(id("Murillio, Rica"), "SC-0038388");
  assert.equal(id("Rezes, Manuel"), "SC-0038701");
  assert.equal(id("Tolentiono, Angelo"), "SC-0038377");
  assert.equal(id("Quming, Raymond"), "SC-0045989");
  assert.equal(id("Villacortez, Raymond"), "SC-0038350");
  assert.equal(id("Bastos, Juan"), "SC-0038384");
  assert.equal(id("Villfranca, Zandro"), null, "a typo surname with the WRONG first name is nobody");
});

test("two crew on one surname: the first name decides, or nobody", () => {
  assert.equal(id("Tuazon, Jaramiz"), "SC-0046075");
  assert.equal(id("Tuazon, Jedrig Tizar"), "SC-0045606", "Jedrig is one letter from Jeadrig");
  assert.equal(id("Tuazon, Jeadrig"), "SC-0045606");
  assert.equal(how("Tuazon"), "ambiguous");
  assert.equal(id("Estandian, Mark"), "SC-0045720");
  assert.equal(id("Estandian, Shareene"), "SC-0038320");
  assert.equal(id("Estandian, Mark joins in Jan 2026"), "SC-0045720");
  assert.equal(id("Espenilla, Zandro (Orlando)"), "SC-0038467");
  assert.equal(id("Esenilla, Zandro"), "SC-0038467", "typo surname, two Espenillas, Zandro decides");
  assert.equal(id("Santos, Christjel"), "SC-0045724");
  assert.equal(id("Purnama, Ida"), null, "two Purnama Idas (the hidden duplicate) — ambiguous, listed, never picked");
  assert.equal(how("Purnama, Ida"), "ambiguous");
});

test("swapped halves and comma-less names", () => {
  assert.equal(id("Edelmar, Doctolero"), "SC-0038038"); assert.equal(how("Edelmar, Doctolero"), "swapped");
  assert.equal(id("Vincent, Esteban"), "SC-0045013");
  assert.equal(id("Rondy, Emil"), "358775", "JOSEPH, Emil Rondy — both words are first-name tokens");
  assert.equal(id("Emil, Rondy"), "358775");
  assert.equal(id("Osorio Norman"), "SC-0038401");
  assert.equal(id("Marto ryan"), "SC-0038447");
  assert.equal(id("Marto Ryan"), "SC-0038447");
  assert.equal(id("Imperial Raymond"), "SC-0045444");
  assert.equal(id("Madrinico Rommel"), "SC-0038368");
  assert.equal(id("Tibay Kevin"), "SC-0038390");
  assert.equal(id("Lawrence Dexter"), null, "shoreside typed as crew: not on the roster, stays unmatched");
  assert.equal(id("Ida (FLL-Tampa)"), null, "a lone first name is not a surname");
  assert.equal(id(""), null);
});

test("annotateTravel tags every row: agency_id, how, client; unmatchedTravel lists the rest by spend", () => {
  const rows = [
    { year: 2026, month: 9, kind: "crew", leg: "on", ship: "Anthem", crew_name: "Paqueo, Bernard", total: 100 },
    { year: 2026, month: 9, kind: "crew", leg: "on", ship: "Azamara Quest", crew_name: "Paqueo, Bernard", total: 50 },
    { year: 2026, month: 9, kind: "crew", leg: "on", ship: "Apex", crew_name: "Villfranca, Dave", total: 30 },
    { year: 2026, month: 9, kind: "crew", leg: "on", ship: "Summit", crew_name: "Manligas, Oscar (NCL prep.)", total: 132 },
    { year: 2025, month: 1, kind: "crew", leg: "off", ship: "Freedom", crew_name: "Lawrence Dexter", total: 955 },
    { year: 2026, month: 2, kind: "shoreside", leg: "shoreside", ship: null, crew_name: "Dexter Lawrance", total: 1000 },
  ];
  const a = annotateTravel(rows, CREW);
  assert.equal(a[0].agency_id, "SC-0038115"); assert.equal(a[0].match, "exact"); assert.equal(a[0].client, "royal");
  assert.equal(a[1].client, "azamara");
  assert.equal(a[2].agency_id, "SC-0038090"); assert.equal(a[2].match, "fuzzy"); assert.equal(a[2].client, "celebrity");
  assert.equal(a[3].agency_id, null); assert.equal(a[3].client, "ncl", "the note names NCL, whatever ship row Rita typed it under");
  assert.equal(a[5].match, "shoreside"); assert.equal(a[5].client, "shoreside");
  const un = unmatchedTravel(a);
  assert.deepEqual(un.map((u) => u.crew_name), ["Lawrence Dexter", "Manligas, Oscar (NCL prep.)"], "shoreside rows are not 'unmatched'");
  assert.deepEqual(un[0].years, [2025]);
  assert.equal(travelClientOf("Celebrity Apex", ""), "celebrity");
  assert.equal(travelClientOf("", ""), null);
});
