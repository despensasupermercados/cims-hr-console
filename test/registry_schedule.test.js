// THE SCHEDULE IS THE ADVANCEDQUERY (Miguel, 7 Oct 2026). The weekly TDG file now carries EMBARKEDDATE and
// DEBARKEDDATE; the console keeps them (registry_snapshot) and reads the board's dates from the file:
//   sign-on = embark; sign-off = TDG's own word (debark, Counter actual sign-off, or the file's own cross-over:
//   a second crew On board the same hull with a later embark), else the NEWER of Rita's typed date and her
//   reliever card's sign-on, else embark + 7 months (Azamara 5). A reliever's sign-on that has passed ends the
//   outgoing contract (the swap); a projected sign-off that has passed is overdue, not gone. The Counter is
//   history: never a seat, never a seat's dates, dropped where the file carries the same contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legsFromRegistry, foldCounterHistory, CONTRACT_MONTHS, AZAMARA_CONTRACT_MONTHS } from "../src/ship_leg_source.js";
import { mapRowFull } from "../src/crewimport.js";
import { apiCrewImportStage, apiCrewImportApply, applySummary } from "../src/crew_import_routes.js";

const TODAY = "2026-10-07";
const AT = "2026-10-07T08:00:00.000Z";
const VES = [{ name: "Wonder", brand: "Royal Caribbean" }, { name: "Navigator", brand: "Royal Caribbean" }, { name: "Apex", brand: "Celebrity" }, { name: "Quest", brand: "Azamara" }];
const row = (sc, status, vessel, embarked_at, debarked_at, o = {}) => ({ sc, status, raw_status: status, vessel, embarked_at, debarked_at, run_at: AT, crew_id: "c" + sc, crew_name: "Crew " + sc, ...o });
const by = (legs) => Object.fromEntries(legs.map((l) => [l.sc + "|" + l.ship, l]));

test("sign-on = the file's embark; sign-off = embark + 7 months (Azamara 5), projected, still current when it has passed (overdue)", () => {
  const legs = legsFromRegistry({ rows: [
    row("A", "On board", "MV CELEBRITY APEX", "2026-03-14", null),   // 7 months -> 14 Oct 2026 (ahead)
    row("B", "On board", "MV AZAMARA QUEST", "2026-07-29", null),    // Azamara: 5 months -> 29 Dec 2026
    row("C", "On board", "MV WONDER OF THE SEAS", "2026-01-15", null), // 7 months -> 15 Aug 2026: passed
  ], vessels: VES, today: TODAY });
  const L = by(legs);
  assert.equal(CONTRACT_MONTHS, 7); assert.equal(AZAMARA_CONTRACT_MONTHS, 5);
  assert.deepEqual({ on: L["A|Apex"].on, off: L["A|Apex"].off, src: L["A|Apex"].offSource, cur: L["A|Apex"].is_current, brand: L["A|Apex"].brand, source: L["A|Apex"].source }, { on: "2026-03-14", off: "2026-10-14", src: "projected", cur: true, brand: "Celebrity", source: "registry" });
  assert.deepEqual({ off: L["B|Quest"].off, brand: L["B|Quest"].brand }, { off: "2026-12-29", brand: "Azamara" });
  assert.equal(L["C|Wonder"].off, "2026-08-15");
  assert.equal(L["C|Wonder"].is_current, true, "past a PROJECTED sign-off the seat is held: overdue, not gone");
  assert.equal(L["C|Wonder"].ours, true);
  assert.equal(L["C|Wonder"].fileAt, "2026-10-07");
});

test("no leg without a hull the console knows or an embark date; Earmarked and dash rows give nothing; a dated On Vacation / Inactive row is the LAST contract, ended by TDG", () => {
  const legs = legsFromRegistry({ rows: [
    row("D", "On board", "MV WONDER OF THE SEAS", null, null),
    row("E", "Earmarked", "MV WONDER OF THE SEAS", null, null),
    row("F", "On Vacation", "MV CELEBRITY APEX", "2026-02-01", "2026-09-05"),
    row("G", "Inactive", "MV CELEBRITY APEX", "2025-07-28", "2025-10-13"),
    row("H", "Reserved Crew", "MV CELEBRITY APEX", "2024-10-22", "2025-05-09", { status: null }), // the raw word is read
    row("I", "On board", "MV NOWHERE", "2026-05-01", null),
  ], vessels: VES, today: TODAY });
  assert.deepEqual(legs.map((l) => l.sc).sort(), ["F", "G", "H", "I"]);
  const F = legs.find((l) => l.sc === "F");
  assert.deepEqual({ on: F.on, off: F.off, cur: F.is_current, src: F.offSource }, { on: "2026-02-01", off: "2026-09-05", cur: false, src: "tdg" });
  assert.equal(legs.find((l) => l.sc === "I").ship, "NOWHERE", "an unknown hull keeps the file's name (the board's valid-ship guard decides)");
});

test("TDG's own word is final: a debark on the row or the Counter's actual sign-off; the file's cross-over dates the sign-off but the crew TDG still lists On board stays current (Wonder: two On board, the reliever embarked 2 Oct; Miguel 8 Oct 2026: \"we follow what tdg has\")", () => {
  const legs = legsFromRegistry({ rows: [
    row("OLD", "On board", "MV WONDER OF THE SEAS", "2026-03-22", null),
    row("NEW", "On board", "MV WONDER OF THE SEAS", "2026-10-02", null),
    row("NAV1", "On board", "MV NAVIGATOR OF THE SEAS ", "2026-06-01", null),
    row("NAV2", "On board", "MV NAVIGATOR OF THE SEAS ", "2026-10-02", null),
    row("DEB", "On board", "MV CELEBRITY APEX", "2026-03-14", "2026-11-20"),
    row("ACT", "On board", "MV AZAMARA QUEST", "2026-04-01", null),
  ], counter: [{ sc: "ACT", seq: 3, sign_on: "2026-04-03", act_off: "2026-09-28" }],
     edits: [{ sc: "OLD", seq: 1, on_key: "2026-03-22", sign_off: "2026-12-01", updated_at: "2026-10-06T00:00:00Z" }],
     vessels: VES, today: TODAY });
  const L = by(legs);
  assert.deepEqual({ off: L["OLD|Wonder"].off, src: L["OLD|Wonder"].offSource, cur: L["OLD|Wonder"].is_current, rel: L["OLD|Wonder"].reliever.sc }, { off: "2026-10-02", src: "tdg", cur: true, rel: "NEW" }, "the reliever's embark dates the sign-off; TDG's file still lists the outgoing crew On board, so the contract stays current (held)");
  assert.equal(L["OLD|Wonder"].heldByFile, true, "drawn red: past the sign-off, TDG still has them aboard");
  assert.equal(L["OLD|Wonder"].offConfirmed, undefined, "never a recorded sign-off while TDG lists them On board");
  assert.equal(L["NEW|Wonder"].is_current, true); assert.equal(L["NEW|Wonder"].off, "2027-05-02");
  assert.equal(L["NAV1|Navigator"].off, "2026-10-02", "a trailing space in the vessel cell still meets the hull");
  assert.deepEqual({ off: L["DEB|Apex"].off, src: L["DEB|Apex"].offSource, cur: L["DEB|Apex"].is_current, conf: L["DEB|Apex"].offConfirmed }, { off: "2026-11-20", src: "tdg", cur: true, conf: undefined });
  assert.deepEqual({ off: L["ACT|Quest"].off, src: L["ACT|Quest"].offSource, cur: L["ACT|Quest"].is_current }, { off: "2026-09-28", src: "tdg", cur: false }, "the Counter's actual sign-off for the same contract (within the absorb window) is TDG's word");
});

test("Rita's typed sign-off stands for its contract (keyed on the embark; a legacy seq edit through the Counter position); it ends the leg once passed", () => {
  const legs = legsFromRegistry({ rows: [
    row("R1", "On board", "MV CELEBRITY APEX", "2026-03-14", null),
    row("R2", "On board", "MV WONDER OF THE SEAS", "2026-06-05", null),
    row("R3", "On board", "MV AZAMARA QUEST", "2026-07-29", null),
  ], edits: [
    { sc: "R1", seq: 7, on_key: "2026-03-16", sign_off: "2026-11-30", off_conf: 1, embark: "Miami", disembark: "Rome", eccr: 1, updated_at: "2026-09-01T00:00:00Z" },
    { sc: "R1", seq: 2, on_key: "2025-01-01", sign_off: "2025-06-01", updated_at: "2026-09-30T00:00:00Z" }, // another contract's edit: never this one's
    { sc: "R2", seq: 1, on_key: null, sign_off: "2026-09-30", updated_at: "2026-09-20T00:00:00Z" },        // legacy: by Counter position
    { sc: "R3", seq: 1, on_key: "2026-07-29", sign_off: "2026-07-01", updated_at: "2026-09-20T00:00:00Z" }, // before the sign-on: ignored
  ], counter: [{ sc: "R2", seq: 1, sign_on: "2026-06-01", act_off: null }], vessels: VES, today: TODAY });
  const L = by(legs);
  assert.deepEqual({ off: L["R1|Apex"].off, src: L["R1|Apex"].offSource, at: L["R1|Apex"].offAt, conf: L["R1|Apex"].offConfirmed, emb: L["R1|Apex"].embark, dis: L["R1|Apex"].disembark, eccr: L["R1|Apex"].edit.eccr, seq: L["R1|Apex"].edit.seq, cur: L["R1|Apex"].is_current },
    { off: "2026-11-30", src: "rita", at: "2026-09-01", conf: true, emb: "Miami", dis: "Rome", eccr: true, seq: 7, cur: true });
  assert.deepEqual({ off: L["R2|Wonder"].off, src: L["R2|Wonder"].offSource, cur: L["R2|Wonder"].is_current }, { off: "2026-09-30", src: "rita", cur: true }, "Rita's sign-off passed but the 7 Oct file still lists them On board: TDG wins, the contract is held (8 Oct 2026)");
  assert.equal(L["R2|Wonder"].heldByFile, true);
  const Lold = by(legsFromRegistry({ rows: [row("R2", "On board", "MV WONDER OF THE SEAS", "2026-06-05", null, { run_at: "2026-09-25T08:00:00.000Z" })],
    edits: [{ sc: "R2", seq: 1, on_key: "2026-06-05", sign_off: "2026-09-30", updated_at: "2026-09-26T00:00:00Z" }], vessels: VES, today: TODAY }));
  assert.deepEqual({ cur: Lold["R2|Wonder"].is_current, held: Lold["R2|Wonder"].heldByFile }, { cur: false, held: undefined }, "a sign-off AFTER the file's date (the file could not see it) still ends the contract");
  assert.deepEqual({ off: L["R3|Quest"].off, src: L["R3|Quest"].offSource }, { off: "2026-12-29", src: "projected" });
});

test("the cross-over: Rita's reliever card on the same hull sets the outgoing sign-off; the newer of card and typed date wins; a passed card sign-on swaps the seat; a card a later file contradicts is ignored", () => {
  const rows = [
    row("X1", "On board", "MV CELEBRITY APEX", "2026-03-14", null),
    row("X2", "On board", "MV WONDER OF THE SEAS", "2026-03-22", null),
    row("X3", "On board", "MV AZAMARA QUEST", "2026-07-29", null),
    row("X4", "On board", "MV NAVIGATOR OF THE SEAS", "2026-06-01", null),
    row("REL4", "On Vacation", null, null, null),               // the file, dated AFTER the card's sign-on, does not have them aboard
  ];
  const open = [
    { id: "as_a", sc: "REL1", crew_name: "Reliever One", ship: "Apex", sign_on: "2026-11-15", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" },
    { id: "as_b", sc: "REL2", crew_name: "Reliever Two", ship: "Wonder", sign_on: "2026-10-02", created_at: "2026-09-20T00:00:00Z", updated_at: null },
    { id: "as_c", sc: "X3", crew_name: "Same crew", ship: "Quest", sign_on: "2027-01-10", created_at: "2026-10-01T00:00:00Z" }, // a NEXT contract of the same crew: not a reliever
    { id: "as_d", sc: "REL4", crew_name: "Reliever Four", ship: "Navigator", sign_on: "2026-09-25", created_at: "2026-09-01T00:00:00Z" },
    { id: "as_e", sc: "REL1", crew_name: "Reliever One", ship: "Apex", sign_on: "2026-03-01", created_at: "2026-10-01T00:00:00Z" }, // before the embark: not a relief of this contract
  ];
  const edits = [{ sc: "X1", seq: 1, on_key: "2026-03-14", sign_off: "2026-11-01", updated_at: "2026-09-15T00:00:00Z" }];
  const L = by(legsFromRegistry({ rows, open, edits, vessels: VES, today: TODAY }));
  assert.deepEqual({ off: L["X1|Apex"].off, src: L["X1|Apex"].offSource, rel: L["X1|Apex"].reliever }, { off: "2026-11-15", src: "card", rel: { sc: "REL1", name: "Reliever One", cardId: "as_a" } }, "the card (1 Oct) is newer than the typed date (15 Sep): the card wins");
  const L2 = by(legsFromRegistry({ rows, open, edits: [{ ...edits[0], updated_at: "2026-10-05T00:00:00Z" }], vessels: VES, today: TODAY }));
  assert.deepEqual({ off: L2["X1|Apex"].off, src: L2["X1|Apex"].offSource }, { off: "2026-11-01", src: "rita" }, "typed after the card: Rita's date wins");
  assert.deepEqual({ off: L["X2|Wonder"].off, src: L["X2|Wonder"].offSource, cur: L["X2|Wonder"].is_current }, { off: "2026-10-02", src: "card", cur: true }, "the reliever's sign-on passed BEFORE the 7 Oct file, which still lists the outgoing crew On board: held, no swap (8 Oct 2026)");
  const Lsw = by(legsFromRegistry({ rows: rows.map((r) => ({ ...r, run_at: "2026-09-30T08:00:00.000Z" })), open, edits, vessels: VES, today: TODAY }));
  assert.deepEqual({ cur: Lsw["X2|Wonder"].is_current, src: Lsw["X2|Wonder"].offSource }, { cur: false, src: "card" }, "a reliever sign-on after the file's date: the swap stands until the next file");
  assert.deepEqual({ off: L["X3|Quest"].off, src: L["X3|Quest"].offSource }, { off: "2026-12-29", src: "projected" }, "the crew's own next card is not their reliever");
  assert.deepEqual({ off: L["X4|Navigator"].off, src: L["X4|Navigator"].offSource, cur: L["X4|Navigator"].is_current }, { off: "2027-01-01", src: "projected", cur: true }, "a card the 7 Oct file contradicts (REL4 On Vacation, sign-on 25 Sep) does not end the seat");
  const L3 = by(legsFromRegistry({ rows: rows.filter((r) => r.sc !== "REL4"), open, vessels: VES, today: TODAY }));
  assert.equal(L3["X4|Navigator"].off, "2026-09-25", "with no word on the reliever yet, the card stands");
});

test("foldCounterHistory: the Counter is history for a crew the file dates — the same contract is dropped, the rest go non-current; a crew the file does not date keeps their Counter legs", () => {
  const reg = legsFromRegistry({ rows: [row("K1", "On board", "MV CELEBRITY APEX", "2026-03-14", null), row("K2", "On Vacation", "MV WONDER OF THE SEAS", "2026-01-10", "2026-08-01")], vessels: VES, today: TODAY });
  const counter = [
    { ship: "Apex", sc: "K1", ours: true, on: "2026-03-16", off: "2026-09-20", is_current: true, source: "counter" },   // the same contract: TDG's dates stand
    { ship: "Quest", sc: "K1", ours: true, on: "2025-01-01", off: "2025-06-01", is_current: false, source: "counter" },
    { ship: "Wonder", sc: "K2", ours: true, on: "2026-01-10", off: "2026-07-10", is_current: true, source: "counter" },
    { ship: "Wonder", sc: "K3", ours: true, on: "2026-05-01", off: "2026-11-01", is_current: true, source: "counter" },  // not in the file's dates: unchanged
  ];
  const out = foldCounterHistory(counter, reg);
  assert.deepEqual(out.map((h) => h.sc + "|" + h.ship + "|" + h.is_current), ["K1|Quest|false", "K3|Wonder|true"]);
  assert.equal(foldCounterHistory(counter, []).length, 4, "no file dates at all (an older file): nothing changes");
});

test("the importer reads EMBARKEDDATE / DEBARKEDDATE as the file writes them; '-' is TDG's blank, never an unparsed date; neither is a crew field", () => {
  const r = mapRowFull({ "CREW ID": "SC-1", "CREW STATUS": "On board", "VESSEL NAME": "MV WONDER OF THE SEAS", "EMBARKEDDATE": "02 Oct 2026", "DEBARKEDDATE": "-" });
  assert.deepEqual({ on: r.row.embarked_at, off: r.row.debarked_at, un: r.unparsed }, { on: "2026-10-02", off: null, un: [] });
  const v = mapRowFull({ "CREW ID": "SC-2", "CREW STATUS": "On Vacation", "EMBARKEDDATE": "06 Dec 2025", "DEBARKEDDATE": "12 Sep 2026" });
  assert.deepEqual({ on: v.row.embarked_at, off: v.row.debarked_at }, { on: "2025-12-06", off: "2026-09-12" });
  const bad = mapRowFull({ "CREW ID": "SC-3", "CREW STATUS": "On board", "EMBARKEDDATE": "soon" });
  assert.deepEqual(bad.unparsed, [{ field: "embarked_at", raw: "soon" }]);
  const SRC = readFileSync(new URL("../src/crewimport.js", import.meta.url), "utf-8");
  const track = SRC.slice(SRC.indexOf("const TRACK = ["), SRC.indexOf("];", SRC.indexOf("const TRACK = [")));
  assert.doesNotMatch(track, /embarked_at|debarked_at/, "the dates are the board's (registry_snapshot), never diffed onto the crew card");
  const ROUTES = readFileSync(new URL("../src/crew_import_routes.js", import.meta.url), "utf-8");
  assert.doesNotMatch(ROUTES.slice(ROUTES.indexOf("export const CREW_WRITABLE"), ROUTES.indexOf("]);", ROUTES.indexOf("export const CREW_WRITABLE"))), /embarked_at|debarked_at/);
});

// --- the file absorbs the card at apply ---------------------------------------------------------
function fakeDB({ existing = [] } = {}) {
  const batched = [];
  const mk = (sql, args = []) => ({
    sql, args, bind(...a) { return mk(sql, a); },
    async first() { return null; },
    async all() { return /FROM crew\b/i.test(sql) && !/crew_override/i.test(sql) ? { results: existing } : { results: [] }; },
  });
  return { _batched: batched, prepare(sql) { return mk(sql); }, async batch(stmts) { batched.push(...stmts); return stmts.map(() => ({ success: true })); } };
}
const req = (body) => ({ json: async () => body });
const EXISTING = [{ agency_id: "SC-1", first_name: "Jomar", last_name: "Dela Cruz", status: "On Vacation", vessel_observed: "Celebrity Apex" }];
const FILE = [{ "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board", "VESSEL NAME": "Celebrity Apex", "EMBARKEDDATE": "03 Aug 2026", "DEBARKEDDATE": "-" }];
const CARD = (o = {}) => [{ id: "as_1", sc: "SC-1", crew_name: "Jomar Dela Cruz", ship: "Apex", sign_on: "2026-08-01", planned_sign_off: "2027-03-01", off_date_conf: 0, on_port_seed: "Rome", off_port_seed: null, ...o }];

async function applyWith(cards, deps, decisions = {}) {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const d = { openProjections: async () => cards, ...deps };
  const stage = await (await apiCrewImportStage(req({ rows: FILE, file_hash: "h-ab" }), env, d)).json();
  return { env, stage, body: await (await apiCrewImportApply(req({ review: stage.review, decisions, file_hash: "h-ab", run_by: "Rita" }), env, d)).json() };
}

test("a card the file confirms aboard with an embark within the absorb window is absorbed (removed) after the batch; a confirmed sign-off is kept first under the embark date", async () => {
  const removed = [], kept = [];
  const deps = { absorbCard: async (env, id) => { removed.push(id); return { ok: true }; }, recordSignoff: async (env, p) => { kept.push(p); return { ok: true, seq: 2 }; } };
  const { body } = await applyWith(CARD(), deps);
  assert.equal(body.projections.counts.confirmed, 1);
  assert.deepEqual(removed, ["as_1"]);
  assert.deepEqual(kept, [], "a sign-off Rita never confirmed is the 7-month projection's to replace");
  assert.deepEqual(body.cards_absorbed, [{ id: "as_1", sc: "SC-1", crew_name: "Jomar Dela Cruz", ship: "Apex", sign_on: "2026-08-01", embarked_at: "2026-08-03", ok: true, error: null, sign_off_kept: false }]);
  assert.match(body.summary, /1 earmark absorbed by the file \(the file's row is the seat now\)/);
  const r2 = await applyWith(CARD({ off_date_conf: 1 }), deps);
  assert.deepEqual(kept, [{ sc: "SC-1", on_key: "2026-08-03", sign_off: "2027-03-01", embark: "Rome", disembark: null }], "OFF DATE confirmed on the card: hers for the contract, filed under the file's embark");
  assert.equal(r2.body.cards_absorbed[0].sign_off_kept, true);
});

// 7 Oct 2026 (the earmark loop): a confirmed card whose sign-on is more than the window from the embark is an
// EARMARK DISCREPANCY (embark_date), decided by Rita: Accept (default) absorbs it; Keep leaves it and emails Joy.
test("a confirmed card far from the embark is an embark_date discrepancy: accepted by default (absorbed), kept on Rita's word; no absorb dep absorbs nothing; a failed removal is reported, never the import", async () => {
  const removed = [];
  const deps = { absorbCard: async (env, id) => { removed.push(id); return { ok: true }; } };
  const far = await applyWith(CARD({ sign_on: "2026-06-01" }), deps);
  assert.equal(far.body.projections.counts.confirmed, 1);
  assert.deepEqual(far.body.cards_absorbed, [], "not the silent absorb: the window rule still holds there");
  assert.deepEqual(removed, ["as_1"], "Accept (the default) absorbs the card through the earmark decision");
  assert.deepEqual(far.body.earmarks.accepted.map((x) => [x.kind, x.action, x.ok]), [["embark_date", "absorbed by the file's row", true]]);
  const kept = await applyWith(CARD({ sign_on: "2026-06-01" }), deps, { "earmark:as_1": "keep" });
  assert.deepEqual(kept.body.earmarks.accepted, []);
  assert.deepEqual(kept.body.earmarks.kept.map((x) => [x.kind, x.emailed, x.error]), [["embark_date", false, "no_mailer"]], "kept, and without a mailer dep the email is reported as not sent");
  const none = await applyWith(CARD(), {});
  assert.deepEqual(none.body.cards_absorbed, []);
  assert.equal(none.env.DB._batched.some((s) => /registry_snapshot/.test(s.sql)), true, "the file is still kept");
  const bad = await applyWith(CARD(), { absorbCard: async () => { throw new Error("boom"); } });
  assert.equal(bad.body.ok, true);
  assert.deepEqual({ ok: bad.body.cards_absorbed[0].ok, error: bad.body.cards_absorbed[0].error }, { ok: false, error: "boom" });
  assert.doesNotMatch(applySummary(bad.body), /absorbed/);
});

// --- the edit lands on its contract's row --------------------------------------------------------
const WORKER = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
const slotSrc = WORKER.slice(WORKER.indexOf("async function contractEditSlot("), WORKER.indexOf("async function apiContractEdit("));
const contractEditSlot = new Function("return " + slotSrc)();
const slotEnv = (rows) => ({ DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) } });

test("contractEditSlot: the row already filed under the contract key, else the requested slot when free or unkeyed, else the next free slot — a Counter contract's edit is never re-keyed", async () => {
  assert.equal(await contractEditSlot(slotEnv([{ seq: 1, on_key: "2026-03-14" }, { seq: 4, on_key: "2026-08-03T00:00:00Z" }]), "SC-1", 9, "2026-08-03"), 4, "the row that KNOWS this contract");
  assert.equal(await contractEditSlot(slotEnv([]), "SC-1", 2, "2026-08-03"), 2, "a free slot");
  assert.equal(await contractEditSlot(slotEnv([{ seq: 2, on_key: null }]), "SC-1", 2, "2026-08-03"), 2, "a legacy unkeyed row at that slot takes the key");
  assert.equal(await contractEditSlot(slotEnv([{ seq: 2, on_key: "2025-01-01" }, { seq: 5, on_key: "2025-06-01" }]), "SC-1", 2, "2026-08-03"), 6, "slot 2 belongs to another contract: the next free slot");
  assert.equal(await contractEditSlot(slotEnv([{ seq: 2, on_key: "2025-01-01" }]), "SC-1", 2, null), 2, "no key given (a Counter-only save): the slot as requested, as before");
  assert.match(WORKER, /b\.seq = await contractEditSlot\(env, b\.sc, b\.seq, b\.on_key\);/, "apiContractEdit files through it");
  assert.match(WORKER, /on_key:\(g\('eKey'\)&&g\('eKey'\)\.value\)\|\|null/, "the Edit modal sends the card's contract key");
});

// --- the board reads the file's leg first (static) -------------------------------------------------
test("rotationSections dates a seat from the file's leg (regEnr) before the Counter (legBSC); the schedule fallback uses only CURRENT legs; the seat and the sent line see registry legs", () => {
  const b = WORKER.slice(WORKER.indexOf("async function rotationSections("), WORKER.indexOf("const sections = Object.values(shipNames)"));
  assert.match(b, /const enr = live \? \(\(regEnr\[k\] \|\| \{\}\)\[sc\] \|\| \(legBSC\[k\] \|\| \{\}\)\[sc\] \|\| \{\}\) : \{\}/, "the file's dates come first");
  assert.match(b, /if \(!h \|\| h\.source !== "registry" \|\| !h\.is_current \|\| !h\.sc\) continue;/);
  assert.match(b, /for \(const h of HIST\) \{ if \(!h\.ours \|\| !h\.sc \|\| !h\.is_current\) continue; const cs = shipOf\(h\.ship\)/, "a non-current leg never dates a live seat");
  assert.match(b, /offSource: enr\.offSource \|\| null, offAt: enr\.offAt \|\| null, reliever: enr\.reliever \|\| null,/, "the card says where its sign-off comes from");
  // HELD (8 Oct 2026): the seat carries heldByFile; it is never a recorded sign-off; the card reads red with TDG's word.
  assert.match(b, /offSource: enr\.offSource \|\| null, offAt: enr\.offAt \|\| null, reliever: enr\.reliever \|\| null, heldByFile: !!enr\.heldByFile,/);
  assert.match(b, /offConfirmed: !h\.heldByFile && \(h\.offSource === "tdg" \|\| !!h\.offConfirmed\), heldByFile: !!h\.heldByFile,/);
  assert.match(WORKER, /if\(x\.heldByFile\)return true; \/\/ TDG's file still has them On board/, "cardOverdue: held is red before any recorded-sign-off check");
  assert.match(WORKER, /TDG still has them On board<\/b>, past the sign-off/);
  assert.match(WORKER, /for \(const h of HIST \|\| \[\]\) if \(h && h\.ours && h\.sc === sc && h\.source === "registry" && h\.is_current && h\.on\) return \{ active_on: h\.on, active_off: h\.off \|\| null \};/, "the Crew tab's active span is the file's leg first — in the shape the callers read (active_on / active_off): the 7 Oct shape left every file-dated crew 'No active contract on file'");
  assert.match(WORKER, /boardLegs\(env\), \/\/ the ONE schedule: the file's current leg for this crew/, "the Edit modal API reads the same schedule");
  assert.match(WORKER, /function fileDatesNote\(x\)\{/);
  assert.match(WORKER, /ABOARD &middot; AWAITING TDG FILE/);
});
