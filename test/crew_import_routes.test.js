import { test } from "node:test";
import assert from "node:assert/strict";
import { apiCrewImportStage, apiCrewImportApply, handleCrewImport } from "../src/crew_import_routes.js";

// --- fake D1 -------------------------------------------------------------
function fakeDB({ existing = [], overrides = [], dup = false, openFlags = [] } = {}) {
  const batched = [];
  function route(sql, args) {
    if (/FROM import_run WHERE file_hash/i.test(sql)) return { __first: dup ? { x: 1 } : null };
    if (/FROM sync_conflict WHERE field IN \('vessel_observed','presence'\) AND resolved=0/i.test(sql)) return { __all: { results: openFlags } };
    if (/FROM crew_override/i.test(sql)) return { __all: { results: overrides } };
    if (/FROM crew\b/i.test(sql)) return { __all: { results: existing } };
    return { __first: null, __all: { results: [] } };
  }
  const mk = (sql, args = []) => ({
    sql, args,
    bind(...a) { return mk(sql, a); },
    async first() { return route(sql, args).__first ?? null; },
    async all() { return route(sql, args).__all ?? { results: [] }; },
  });
  return {
    _batched: batched,
    prepare(sql) { return mk(sql); },
    async batch(stmts) { batched.push(...stmts); return stmts.map(() => ({ success: true })); },
  };
}
const req = (body) => ({ json: async () => body });

const EXISTING = [
  { agency_id: "SC-1", first_name: "Jomar", last_name: "Dela Cruz", status: "On board",
    vessel_observed: "Celebrity Edge", med_exp: "2026-03-19" },
];
const ROWS = [
  { "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board",
    "VESSEL NAME": "Celebrity Apex", "MEDICAL EXPIRATION DATE": "2028-03-19" },
];

test("stage returns tiered review and writes nothing", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const res = await apiCrewImportStage(req({ rows: ROWS, file_hash: "h1", filename: "f.xls" }), env);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.review.counts.ship_flag, 1);
  assert.equal(body.review.counts.cert, 1);
  assert.equal(env.DB._batched.length, 0);
});

test("stage rejects an already-imported file hash", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, dup: true }) };
  const res = await apiCrewImportStage(req({ rows: ROWS, file_hash: "seen" }), env);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "already_processed");
});

// Miguel, 6 Oct 2026: "data about the crew .. new data ?? goes stat right to the crew card". The file's ship
// is written by default — only through the fixed shipTakes statement; Keep board (flag) writes none.
test("apply writes the file's ship onto the card by default (fixed statement), and Keep board writes none", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h2" }), env)).json();
  const res = await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h2", run_by: "Rita" }), env);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.ship_taken, 1);
  const sqls = env.DB._batched.map(s => s.sql);
  assert.equal(sqls.filter(s => /UPDATE crew SET vessel_observed/i.test(s)).length, 1);
  assert.ok(sqls.every(s => !/UPDATE crew SET vessel_observed/i.test(s) || s === "UPDATE crew SET vessel_observed=?, updated_at=? WHERE agency_id=?"), "only the fixed take statement");
  const env2 = { DB: fakeDB({ existing: EXISTING }) };
  const stage2 = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h2b" }), env2)).json();
  await apiCrewImportApply(req({ review: stage2.review, decisions: { "ship:SC-1": "flag" }, file_hash: "h2b", run_by: "Rita" }), env2);
  assert.equal(env2.DB._batched.some(s => /UPDATE crew SET vessel_observed/i.test(s.sql)), false, "Keep board: no ship write");
  assert.ok(sqls.some(s => /INSERT INTO import_run/i.test(s)), "import_run logged");
  assert.ok(sqls.some(s => /INSERT INTO sync_conflict/i.test(s)), "ship flagged as conflict");
  assert.ok(sqls.some(s => /UPDATE crew SET med_exp/i.test(s)), "cert applied");
});

// D3 + override.js: a manual crew_override field ALWAYS wins on read, so an accepted override
// conflict must NULL that one field on crew_override or the accept never reaches the card.
const OVR_EXISTING = [{ agency_id: "SC-1", first_name: "Jomar", last_name: "Dela Cruz", status: "On board", vessel_observed: "Celebrity Edge" }];
const OVR_ROWS = [{ "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "Inactive", "VESSEL NAME": "Celebrity Edge" }];
const OVR = [{ agency_id: "SC-1", status: "Earmarked", notes: "hand-set", retired: 0 }];

test("accepted override conflict clears ONLY that crew_override field (status) and writes the base", async () => {
  const env = { DB: fakeDB({ existing: OVR_EXISTING, overrides: OVR }) };
  const stage = await (await apiCrewImportStage(req({ rows: OVR_ROWS, file_hash: "h3" }), env)).json();
  assert.equal(stage.review.counts.override_conflict, 1, "status change under a live override lands in the override tier");
  const res = await apiCrewImportApply(req({ review: stage.review, decisions: { "SC-1:status": "accept" }, file_hash: "h3", run_by: "Rita" }), env);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.override_cleared, 1);
  const st = env.DB._batched;
  const clr = st.find(s => /UPDATE crew_override SET status=NULL/i.test(s.sql));
  assert.ok(clr, "override.status cleared");
  assert.match(clr.sql, /WHERE agency_id=\? AND status IS \?/, "clear is bound to the reviewed manual value");
  assert.deepEqual(clr.args.slice(1), ["SC-1", "Earmarked"]);
  const audit = st.find(s => /INSERT INTO sync_conflict/i.test(s.sql) && s.args[3] === "status");
  assert.equal(audit.args[4], "Earmarked", "audit old_value is the manual value being replaced");
  assert.equal(stage.review.groups.override_conflict[0].old, "Earmarked", "the card shows the manual value as 'old'");
  assert.ok(st.some(s => /UPDATE crew SET status=\?/i.test(s.sql) && s.args[0] === "Inactive"), "base status written");
  assert.equal(st.filter(s => /UPDATE crew_override/i.test(s.sql)).length, 1, "nothing else on the override row is touched");
});

test("kept override conflict (Keep mine) leaves crew_override untouched; the default now replaces it", async () => {
  const envD = { DB: fakeDB({ existing: OVR_EXISTING, overrides: OVR }) };
  const stageD = await (await apiCrewImportStage(req({ rows: OVR_ROWS, file_hash: "h4d" }), envD)).json();
  const def = await (await apiCrewImportApply(req({ review: stageD.review, decisions: {}, file_hash: "h4d", run_by: "Rita" }), envD)).json();
  assert.equal(def.override_cleared, 1, "6 Oct 2026: TDG's value replaces the manual entry by default");
  const env = { DB: fakeDB({ existing: OVR_EXISTING, overrides: OVR }) };
  const stage = await (await apiCrewImportStage(req({ rows: OVR_ROWS, file_hash: "h4" }), env)).json();
  const res = await apiCrewImportApply(req({ review: stage.review, decisions: { "SC-1:status": "keep" }, file_hash: "h4", run_by: "Rita" }), env);
  const body = await res.json();
  assert.equal(body.override_cleared, 0);
  assert.equal(env.DB._batched.some(s => /UPDATE crew_override/i.test(s.sql)), false);
  assert.equal(env.DB._batched.some(s => /UPDATE crew SET status/i.test(s.sql)), false);
});

// The base row may already equal the file (an earlier accept wrote it) while the override still
// disagrees: diffCrew sees no change, yet the card still shows the manual value. Must be raised.
test("override disagrees with the file while the base already matches: still an override conflict", async () => {
  const existing = [{ agency_id: "SC-1", first_name: "Jomar", last_name: "Dela Cruz", status: "Inactive", vessel_observed: "Celebrity Edge" }];
  const env = { DB: fakeDB({ existing, overrides: OVR }) };
  const stage = await (await apiCrewImportStage(req({ rows: OVR_ROWS, file_hash: "h5" }), env)).json();
  const it = stage.review.groups.override_conflict.find(x => x.agency_id === "SC-1" && x.field === "status");
  assert.ok(it, "raised even though crew.status already equals the file");
  assert.equal(it.old, "Earmarked");
  assert.equal(it.new, "Inactive");
});

test("a clear that matched no row (manual value changed since review) is reported as skipped, not cleared", async () => {
  const env = { DB: fakeDB({ existing: OVR_EXISTING, overrides: OVR }) };
  env.DB.batch = async (stmts) => { env.DB._batched.push(...stmts); return stmts.map(s => ({ success: true, meta: { changes: /crew_override/.test(s.sql) ? 0 : 1 } })); };
  const stage = await (await apiCrewImportStage(req({ rows: OVR_ROWS, file_hash: "h6" }), env)).json();
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: { "SC-1:status": "accept" }, file_hash: "h6", run_by: "Rita" }), env)).json();
  assert.equal(body.override_cleared, 0);
  assert.equal(body.override_skipped, 1);
});

test("accepted rank conflict: UPDATE crew SET rank_observed + UPDATE crew_override SET rank_override=NULL bound to the manual rank", async () => {
  const existing = [{ agency_id: "SC-7", first_name: "Ana", last_name: "Cruz", status: "On board", rank_observed: "Cook", vessel_observed: "Edge" }];
  const rows = [{ "CREW ID": "SC-7", "FIRST NAME": "Ana", "LAST NAME": "Cruz", "CREW STATUS": "On board", "RANK": "Sous Chef", "VESSEL NAME": "Edge" }];
  const env = { DB: fakeDB({ existing, overrides: [{ agency_id: "SC-7", rank_override: "Chef de Partie", retired: 0 }] }) };
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "h9" }), env)).json();
  assert.equal(stage.review.counts.override_conflict, 1);
  assert.deepEqual(stage.unparsed, [], "stage reports unreadable date cells (none here)");
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: { "SC-7:rank_observed": "accept" }, file_hash: "h9", run_by: "Rita" }), env)).json();
  assert.equal(body.override_cleared, 1);
  const st = env.DB._batched;
  assert.ok(st.some(s => /UPDATE crew SET rank_observed=\?/i.test(s.sql) && s.args[0] === "Sous Chef"));
  const clr = st.find(s => /UPDATE crew_override SET rank_override=NULL/i.test(s.sql));
  assert.ok(clr, "the override COLUMN is cleared, not a non-existent crew_override.rank_observed");
  assert.deepEqual(clr.args.slice(1), ["SC-7", "Chef de Partie"]);
});

test("stage lists unreadable date cells so a typo is visible instead of silently keeping the old value", async () => {
  const rows = [{ "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board", "VESSEL NAME": "Celebrity Edge", "MEDICAL EXPIRATION DATE": "2/30/2027" }];
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "h10" }), env)).json();
  assert.deepEqual(stage.unparsed, [{ agency_id: "SC-1", field: "med_exp", raw: "2/30/2027" }]);
  assert.equal(stage.review.counts.cert, 0, "the bad cell is not a change (old value kept)");
});

test("apply is MONEY_USERS only; stage is any session", async () => {
  const env = { DB: fakeDB({ existing: OVR_EXISTING, overrides: OVR }) };
  const url = { pathname: "/api/crew/import/apply" };
  const body = { review: { groups: {} }, decisions: {}, file_hash: "h7" };
  const denied = await handleCrewImport({ ...req(body), method: "POST" }, url, env, { email: "someone@dg3.com" });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error, "money_users_only");
  const none = await handleCrewImport({ ...req(body), method: "POST" }, url, env, null);
  assert.equal(none.status, 403);
  const ok = await handleCrewImport({ ...req(body), method: "POST" }, url, env, { email: "Rita.Berenyi@dg3.com" });
  assert.equal(ok.status, 200);
  const staged = await handleCrewImport({ ...req({ rows: OVR_ROWS, file_hash: "h8" }), method: "POST" }, { pathname: "/api/crew/import/stage" }, env, { email: "someone@dg3.com" });
  assert.equal((await staged.json()).ok, true);
});

// Ship flags (Miguel, 2026-09-05): the same flag was re-raised every weekly upload (411 open rows
// for 58 crew+ship pairs on prod) and nothing ever closed one.
test("apply: a ship flag the live board already satisfies is not inserted, and the open copy closes (resolved=2)", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, openFlags: [{ id: "f1", agency_id: "SC-1", new_value: "Celebrity Apex" }] }) };
  const deps = { boardLegs: async () => [{ ours: true, sc: "SC-1", ship: "Apex", on: "2026-08-01", off: "2027-02-01" }] };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h11" }), env)).json();
  assert.equal(stage.review.counts.ship_flag, 1, "the review still shows the flag (registry says Edge, file says Apex)");
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: { "ship:SC-1": "flag" }, file_hash: "h11", run_by: "Rita" }), env, deps)).json();
  assert.equal(body.open_conflicts, 0, "nothing left open: the board has the crew on Apex already");
  assert.equal(body.ship_flags.closed_board_matches, 1);
  const st = env.DB._batched;
  const upd = st.find(s => /UPDATE sync_conflict SET resolved=\? WHERE id=\? AND resolved=0/.test(s.sql));
  assert.ok(upd && upd.args[0] === 2 && upd.args[1] === "f1");
  assert.equal(st.some(s => /INSERT INTO sync_conflict/i.test(s.sql) && s.args[3] === "vessel_observed"), false, "no new ship flag row");
  const run = st.find(s => /INSERT INTO import_run/i.test(s.sql));
  assert.equal(run.args[5], 0, "import_run.conflicts counts what is actually left open");
});

test("apply: without the live board (no deps) a repeated flag is still deduped, a new one still inserted", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, openFlags: [{ id: "f1", agency_id: "SC-1", new_value: "Celebrity Apex" }] }) };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h12" }), env)).json();
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: { "ship:SC-1": "flag" }, file_hash: "h12", run_by: "Rita" }), env)).json();
  assert.equal(body.open_conflicts, 0, "same crew, same ship already open -> no duplicate");
  assert.equal(env.DB._batched.some(s => /UPDATE sync_conflict/i.test(s.sql)), false);
  const env2 = { DB: fakeDB({ existing: EXISTING, openFlags: [{ id: "f1", agency_id: "SC-1", new_value: "Quest" }] }) };
  const stage2 = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h13" }), env2)).json();
  const body2 = await (await apiCrewImportApply(req({ review: stage2.review, decisions: { "ship:SC-1": "flag" }, file_hash: "h13", run_by: "Rita" }), env2)).json();
  assert.equal(body2.open_conflicts, 1, "a different ship: inserted");
  assert.equal(body2.ship_flags.closed_superseded, 1, "and the older Quest flag is superseded");
});

test("apply: a failing live-board read never blocks the import — the board rule is simply off and reported", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, openFlags: [{ id: "f1", agency_id: "SC-1", new_value: "Celebrity Apex" }] }) };
  const deps = { boardLegs: async () => { throw new Error("D1 hiccup"); } };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h14" }), env)).json();
  const res = await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h14", run_by: "Rita" }), env, deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.board_unavailable, true);
  assert.ok(env.DB._batched.some(s => /UPDATE crew SET med_exp/i.test(s.sql)), "the cert update still applied");
  assert.equal(body.open_conflicts, 0, "the duplicate flag is still deduped without the board");
  assert.match(body.summary, /board unavailable this run/);
  assert.match(body.summary, /^Applied 1 change · added 0 crew · 0 flags for the board/);
});

test("apply is idempotent by file hash", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, dup: true }) };
  const res = await apiCrewImportApply(req({ review: { groups: {} }, decisions: {}, file_hash: "seen" }), env);
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "already_processed");
});

test("handleCrewImport routes stage + unknown path returns null", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const staged = await handleCrewImport(
    { ...req({ rows: ROWS, file_hash: "hr" }), method: "POST" },
    { pathname: "/api/crew/import/stage" }, env);
  assert.ok(staged, "stage route returns a Response");
  assert.equal((await staged.json()).ok, true);
  const miss = await handleCrewImport({ method: "GET" }, { pathname: "/api/other" }, env);
  assert.equal(miss, null, "unknown path returns null so worker.js falls through");
});

// D1 amendment (2026-09-15): an explicit per-row "Take TDG" is the ONE ship write, through its own fixed
// statement — the general UPDATE path (CREW_WRITABLE) still never carries vessel_observed.
test("apply with 'take' on the ship row: UPDATE crew SET vessel_observed (fixed statement) + override ship cleared + flag resolved", async () => {
  const env = { DB: fakeDB({ existing: EXISTING, overrides: [{ agency_id: "SC-1", vessel_observed: "Celebrity Edge", retired: 0 }] }) };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h-take" }), env)).json();
  const res = await apiCrewImportApply(req({ review: stage.review, decisions: { "ship:SC-1": "take" }, file_hash: "h-take", run_by: "Rita" }), env);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.ship_taken, 1);
  assert.match(body.summary, /1 ship taken from the file/);
  const takes = env.DB._batched.filter(s => /^UPDATE crew SET vessel_observed=\?, updated_at=\? WHERE agency_id=\?$/.test(s.sql));
  assert.equal(takes.length, 1);
  assert.deepEqual([takes[0].args[0], takes[0].args[2]], ["Celebrity Apex", "SC-1"]);
  const clears = env.DB._batched.filter(s => /^UPDATE crew_override SET vessel_observed=NULL/.test(s.sql));
  assert.equal(clears.length, 1);
  assert.equal(clears[0].args[1], "SC-1");
  const flagRow = env.DB._batched.find(s => /INSERT INTO sync_conflict/.test(s.sql) && s.args[3] === "vessel_observed");
  assert.equal(flagRow.args[6], 1, "audit row written as resolved");
});

test("apply with 'dismiss' or 'Keep board' emits NO ship write", async () => {
  for (const decisions of [{ "ship:SC-1": "flag" }, { "ship:SC-1": "dismiss" }]) {
    const env = { DB: fakeDB({ existing: EXISTING }) };
    const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h-nt" }), env)).json();
    const body = await (await apiCrewImportApply(req({ review: stage.review, decisions, file_hash: "h-nt", run_by: "Rita" }), env)).json();
    assert.equal(body.ship_taken, 0);
    assert.equal(env.DB._batched.some(s => /vessel_observed=/.test(s.sql)), false, "no ship write for " + JSON.stringify(decisions));
  }
});

// THE LOOP CLOSES FROM THE REGISTRY TOO (Miguel, 5 Oct 2026, Jewel: "if the person is onboard .. and if
// rita has already a card in there .. it should automatically compare with what the tdg file has").
// The projections arrive through deps.openProjections (the worker's fetchOpenAssignments); the importer
// never queries assignment itself (status_consistency.test.js).
const APEX_PLAN = [{ id: "as_1", sc: "SC-1", crew_name: "Jomar Dela Cruz", ship: "Apex", sign_on: "2026-08-01", planned_sign_off: "2027-02-01" }];

test("stage lists every open projection against the file, and carries the file's per-crew word to apply", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const deps = { openProjections: async () => APEX_PLAN };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h-pj1" }), env, deps)).json();
  assert.equal(stage.review.projections.length, 1);
  assert.equal(stage.review.projections[0].verdict, "confirmed", "the file has SC-1 On board Celebrity Apex: the Apex card is confirmed");
  assert.equal(stage.review.projection_counts.confirmed, 1);
  assert.deepEqual(stage.review.registry, [{ agency_id: "SC-1", status: "On board", vessel_observed: "Celebrity Apex", name: "Jomar Dela Cruz", status_raw: "On board" }]);
  assert.equal(env.DB._batched.length, 0, "stage still writes nothing");
});

test("apply keeps the file's word per crew (registry_snapshot) — the snapshot itself is never a ship allocation", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const deps = { openProjections: async () => APEX_PLAN };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h-pj2" }), env, deps)).json();
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: { "ship:SC-1": "flag" }, file_hash: "h-pj2", run_by: "Rita" }), env, deps)).json();
  assert.equal(body.ok, true);
  assert.equal(body.projections.counts.confirmed, 1);
  assert.match(body.summary, /1 projection confirmed aboard by the file/);
  const st = env.DB._batched;
  const snap = st.filter(s => /INSERT INTO registry_snapshot \(agency_id, status, vessel, run_at, import_run_id, name, raw_status\)/.test(s.sql));
  assert.equal(snap.length, 1, "one row per crew the file carried");
  assert.equal(snap[0].args[0], "SC-1");
  assert.equal(snap[0].args[1], "On board");
  assert.equal(snap[0].args[2], "Celebrity Apex");
  assert.deepEqual(snap[0].args.slice(5), ["Jomar Dela Cruz", "On board"], "the file's own name and status word are kept");
  assert.match(snap[0].sql, /ON CONFLICT\(agency_id\) DO UPDATE SET status=excluded\.status, vessel=excluded\.vessel, run_at=excluded\.run_at/, "the latest file is the latest word");
  assert.equal(st.some(s => /UPDATE assignment/.test(s.sql)), false, "no verdict is written on the card: the board derives it at read time");
  assert.equal(st.some(s => /vessel_observed=/.test(s.sql)), false, "D1 still holds: the registry never writes a ship");
  assert.equal(st.some(s => /keyman_contract3|contract_edit/.test(s.sql)), false, "no Counter row or edit is touched (§10b)");
});

test("apply: a contradicted card is shown as such, never removed; a crew the file does not carry gets no verdict", async () => {
  const rows = [
    { "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "Inactive", "VESSEL NAME": "" },
  ];
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const plans = [...APEX_PLAN, { id: "as_2", sc: "SC-2", crew_name: "Nobody In File", ship: "Icon", sign_on: "2026-07-01", planned_sign_off: "2027-01-01" }];
  const deps = { openProjections: async () => plans };
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "h-pj3" }), env, deps)).json();
  assert.deepEqual(stage.review.projections.map(p => [p.id, p.verdict]), [["as_1", "ashore"]], "Gayda's shape: aboard per the card, Inactive per the file");
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h-pj3", run_by: "Rita" }), env, deps)).json();
  const st = env.DB._batched;
  const snap = st.filter(s => /INSERT INTO registry_snapshot/.test(s.sql));
  assert.equal(snap.length, 1);
  assert.deepEqual(snap[0].args.slice(0, 3), ["SC-1", "Inactive", null], "the file's word, blank vessel kept blank");
  assert.equal(st.some(s => /DELETE FROM assignment/.test(s.sql)), false, "flagged on the card, never removed (§6)");
  assert.match(body.summary, /1 card aboard per your board but not per the file/);
});

test("apply: without the projection feed nothing is compared for the review, the snapshot is still kept, and a review cannot name a card", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h-pj4" }), env)).json();
  assert.deepEqual(stage.review.projections, []);
  stage.review.projections = [{ id: "as_evil", sc: "SC-1", verdict: "confirmed" }];
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h-pj4", run_by: "Rita" }), env)).json();
  assert.equal(body.ok, true);
  assert.equal(env.DB._batched.some(s => /UPDATE assignment|DELETE FROM assignment/.test(s.sql)), false);
  assert.equal(env.DB._batched.filter(s => /INSERT INTO registry_snapshot/.test(s.sql)).length, 1, "the file's word is kept regardless");
  assert.doesNotMatch(body.summary, /projection/);
});

test("apply: the snapshot rows a file does not carry are removed in the same batch; an empty registry (old page) removes nothing", async () => {
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const stage = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h-pj5" }), env)).json();
  await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h-pj5", run_by: "Rita" }), env);
  const st = env.DB._batched;
  const run = st.find(s => /INSERT INTO import_run/i.test(s.sql));
  const del = st.find(s => /DELETE FROM registry_snapshot WHERE import_run_id IS NOT \?/.test(s.sql));
  assert.ok(del, "rows the latest file did not touch go");
  assert.equal(del.args[0], run.args[0], "bound to THIS run's id");
  assert.ok(st.indexOf(del) > st.findIndex(s => /INSERT INTO registry_snapshot/.test(s.sql)), "after the upserts");
  const env2 = { DB: fakeDB({ existing: EXISTING }) };
  const stage2 = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h-pj6" }), env2)).json();
  stage2.review.registry = [];
  await apiCrewImportApply(req({ review: stage2.review, decisions: {}, file_hash: "h-pj6", run_by: "Rita" }), env2);
  assert.equal(env2.DB._batched.some(s => /DELETE FROM registry_snapshot/.test(s.sql)), false, "no rows carried: the table is left alone");
});

test("apply: a crew whose vessel in this file AGREES with the registry closes their older open ship flag (file_agrees)", async () => {
  // registry says Celebrity Edge; the file says Celebrity Edge too; an old flag still names Apex
  const rows = [{ "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board", "VESSEL NAME": "Celebrity Edge" }];
  const env = { DB: fakeDB({ existing: EXISTING, openFlags: [{ id: "f-old", agency_id: "SC-1", new_value: "Celebrity Apex" }] }) };
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "h-pj7" }), env)).json();
  assert.equal(stage.review.counts.ship_flag, 0, "no disagreement in this file");
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h-pj7", run_by: "Rita" }), env)).json();
  assert.equal(body.ship_flags.closed_file_agrees, 1);
  const upd = env.DB._batched.find(s => /UPDATE sync_conflict SET resolved=\? WHERE id=\? AND resolved=0/.test(s.sql));
  assert.ok(upd && upd.args[1] === "f-old");
  assert.match(body.summary, /the file now agrees with the registry/);
  // a BLANK vessel in the file says nothing and closes nothing
  const rows2 = [{ "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board", "VESSEL NAME": "" }];
  const env2 = { DB: fakeDB({ existing: EXISTING, openFlags: [{ id: "f-old", agency_id: "SC-1", new_value: "Celebrity Apex" }] }) };
  const stage2 = await (await apiCrewImportStage(req({ rows: rows2, file_hash: "h-pj8" }), env2)).json();
  const body2 = await (await apiCrewImportApply(req({ review: stage2.review, decisions: {}, file_hash: "h-pj8", run_by: "Rita" }), env2)).json();
  assert.equal(body2.ship_flags.closed_file_agrees, 0);
});

test("stage: the same agency id twice in one file is reported and only the last row stands; a rekeyed row's registry word is carried under the real agency id", async () => {
  const rows = [
    { "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On Vacation", "VESSEL NAME": "Celebrity Edge" },
    { "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board", "VESSEL NAME": "Celebrity Edge" },
    { "CREW ID": "SC-NEW", "FIRST NAME": "Nina", "LAST NAME": "New", "CREW STATUS": "On board", "VESSEL NAME": "Celebrity Apex" },
    { "CREW ID": "SC-NEW", "FIRST NAME": "Nina", "LAST NAME": "New", "CREW STATUS": "On board", "VESSEL NAME": "Celebrity Apex" },
  ];
  const env = { DB: fakeDB({ existing: EXISTING }) };
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "h-dup" }), env)).json();
  assert.deepEqual(stage.review.duplicate_ids, ["SC-1", "SC-NEW"]);
  assert.equal(stage.review.groups.new.length, 1, "one INSERT for the new crew, not two (UNIQUE used to fail the whole batch)");
  assert.deepEqual(stage.review.registry.filter(r => r.agency_id === "SC-1").map(r => r.status), ["On board"], "the last row stands");
  // rekeyed: the file keyed Jomar on his cruise-line id; the snapshot/verdict/flag rows must use SC-1
  const existing = [{ ...EXISTING[0], ship_crew_id: "526444" }];
  const rows2 = [{ "CREW ID": "526444", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board", "VESSEL NAME": "Celebrity Edge" }];
  const env2 = { DB: fakeDB({ existing }) };
  const stage2 = await (await apiCrewImportStage(req({ rows: rows2, file_hash: "h-rk" }), env2)).json();
  assert.equal(stage2.review.groups.rekeyed.length, 1);
  assert.deepEqual(stage2.review.registry.map(r => r.agency_id), ["SC-1"], "carried under the real agency id, not the id the file used");
});

// THE SAME FILE, DROPPED AGAIN, FILLS THE BOARD'S COPY (Miguel, 5 Oct 2026: "I dont think so u are
// reading well the tdg file"). The 5 Oct upload ran before the console kept a copy of the file.
function redropDB({ runs, held = 0, existing = EXISTING }) {
  const batched = [];
  const latest = [...runs].sort((a, b) => (a.run_at < b.run_at ? 1 : -1))[0];
  const route = (sql, args) => {
    if (/SELECT 1 AS x FROM import_run WHERE file_hash/i.test(sql)) return { __first: runs.some(r => r.file_hash === args[0]) ? { x: 1 } : null };
    if (/SELECT id, run_at FROM import_run WHERE file_hash/i.test(sql)) return { __first: runs.find(r => r.file_hash === args[0]) || null };
    if (/SELECT id FROM import_run ORDER BY run_at DESC/i.test(sql)) return { __first: latest ? { id: latest.id } : null };
    if (/COUNT\(\*\) AS n FROM registry_snapshot WHERE import_run_id/i.test(sql)) return { __first: { n: held } };
    if (/FROM crew_override/i.test(sql)) return { __all: { results: [] } };
    if (/FROM crew\b/i.test(sql)) return { __all: { results: existing } };
    return { __first: null, __all: { results: [] } };
  };
  const mk = (sql, args = []) => ({ sql, args, bind(...a) { return mk(sql, a); }, async first() { return route(sql, args).__first ?? null; }, async all() { return route(sql, args).__all ?? { results: [] }; } });
  return { _batched: batched, prepare(sql) { return mk(sql); }, async batch(st) { batched.push(...st); return st.map(() => ({ success: true })); } };
}
const RUNS = [
  { id: "run-oct4", file_hash: "h-oct4", run_at: "2026-10-04T13:12:10.010Z" },
  { id: "run-oct5", file_hash: "h-oct5", run_at: "2026-10-05T18:54:18.694Z" },
];
const ensured = { ensureRegistrySnapshot: async () => {} };

test("re-drop of the LATEST applied file keeps the board's copy under that run, and touches nothing else", async () => {
  const env = { DB: redropDB({ runs: RUNS }) };
  const body = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: "h-oct5" }), env, ensured)).json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "already_processed");
  assert.equal(body.snapshot_saved, 1);
  const st = env.DB._batched;
  const snap = st.filter(s => /INSERT INTO registry_snapshot/.test(s.sql));
  assert.equal(snap.length, 1);
  assert.deepEqual(snap[0].args, ["SC-1", "On board", "Celebrity Apex", "2026-10-05T18:54:18.694Z", "run-oct5", "Jomar Dela Cruz", "On board"], "dated by the run that applied the file, not by the re-drop");
  const del = st.find(s => /DELETE FROM registry_snapshot WHERE import_run_id IS NOT \?/.test(s.sql));
  assert.equal(del.args[0], "run-oct5");
  assert.equal(st.some(s => /INTO import_run|UPDATE crew|INSERT INTO crew|sync_conflict|crew_override/.test(s.sql)), false, "no crew row, flag, status or run is written again");
});

test("re-drop: an OLDER file, a file already copied, or no guard (tests, tools) keeps nothing", async () => {
  for (const [db, hash, deps] of [
    [redropDB({ runs: RUNS }), "h-oct4", ensured],             // an older file never overwrites the newer word
    [redropDB({ runs: RUNS, held: 104 }), "h-oct5", ensured],  // the board already holds this file
    [redropDB({ runs: RUNS }), "h-oct5", undefined],           // no ensure dep: the old refusal, unchanged
  ]) {
    const env = { DB: db };
    const body = await (await apiCrewImportStage(req({ rows: ROWS, file_hash: hash }), env, deps)).json();
    assert.deepEqual(body, { ok: false, error: "already_processed" });
    assert.equal(env.DB._batched.length, 0);
  }
});

// Miguel, 6 Oct 2026: "if it gets removed?? as in any information fro the crew ?? u pick it up and ensure you
// remove it from the crew card". An EMPTY cell in a column the file carries clears the card; a column the
// file does not carry at all says nothing.
test("an empty TDG cell clears the value on the crew card; a missing column clears nothing", async () => {
  const existing = [{ agency_id: "SC-1", first_name: "Jomar", last_name: "Dela Cruz", status: "On board", vessel_observed: "Celebrity Edge", pp_exp: "2030-01-01", phone: "+63900", email: "j@x.com" }];
  const rows = [{ "CREW ID": "SC-1", "FIRST NAME": "Jomar", "LAST NAME": "Dela Cruz", "CREW STATUS": "On board", "VESSEL NAME": "Celebrity Edge", "PASSPORT EXPIRATION DATE": "", "MOBILE": "" }];
  const env = { DB: fakeDB({ existing }) };
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "h-clr" }), env)).json();
  await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h-clr", run_by: "Rita" }), env);
  const st = env.DB._batched;
  const upd = (f) => st.find(s => new RegExp("^UPDATE crew SET " + f + "=\\?").test(s.sql));
  assert.ok(upd("pp_exp") && upd("pp_exp").args[0] === null, "empty passport cell: cleared");
  assert.ok(upd("phone") && upd("phone").args[0] === null, "empty mobile cell: cleared");
  assert.equal(upd("email"), undefined, "no email column in this file: the stored email stays");
  assert.equal(st.some(s => /UPDATE crew SET (first_name|last_name|status)=/.test(s.sql)), false, "identity and status are never cleared");
});

// Miguel, 6 Oct 2026, on "your Retired tag is overridden · remove it": the console applies TDG, it does not ask.
// A crew tagged Retired whom the file has On board / Earmarked: the tag and its manual status come off on Apply.
test("a Retired tag the file contradicts is cleared on Apply (tag + manual status), audited; Keep Retired leaves it", async () => {
  const existing = [{ agency_id: "SC-0042899", first_name: "Jerome", last_name: "Valdesco", status: "On board", vessel_observed: null }];
  const rows = [{ "CREW ID": "SC-0042899", "FIRST NAME": "Jerome", "LAST NAME": "Valdesco", "CREW STATUS": "On board", "VESSEL NAME": "MV BRILLIANCE OF THE SEAS" }];
  const fdb = (extra) => {
    const db = fakeDB({ existing });
    const prep = db.prepare.bind(db);
    db.prepare = (sql) => /COALESCE\(retired,0\)=1/.test(sql) && /^SELECT/.test(sql)
      ? { bind() { return this; }, async all() { return { results: [{ agency_id: "SC-0042899", status: "On Vacation" }] }; }, async first() { return null; } }
      : prep(sql);
    return db;
  };
  const env = { DB: fdb() };
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "h-ur" }), env)).json();
  assert.deepEqual(stage.review.groups.unretire, [{ agency_id: "SC-0042899", new: "On board", ship: "MV BRILLIANCE OF THE SEAS", manual_status: "On Vacation" }]);
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h-ur", run_by: "Rita" }), env)).json();
  assert.equal(body.unretired, 1);
  assert.match(body.summary, /1 Retired tag cleared \(TDG has them active\)/);
  const upd = env.DB._batched.find(s => /^UPDATE crew_override SET retired=0, status=NULL/.test(s.sql));
  assert.ok(upd && upd.args[1] === "SC-0042899" && /COALESCE\(retired,0\)=1$/.test(upd.sql), "bound to still-tagged");
  assert.ok(env.DB._batched.some(s => /INSERT INTO sync_conflict/.test(s.sql) && s.args[3] === "retired"), "audited");
  const env2 = { DB: fdb() };
  const stage2 = await (await apiCrewImportStage(req({ rows, file_hash: "h-ur2" }), env2)).json();
  await apiCrewImportApply(req({ review: stage2.review, decisions: { "unretire:SC-0042899": "keep" }, file_hash: "h-ur2", run_by: "Rita" }), env2);
  assert.equal(env2.DB._batched.some(s => /SET retired=0/.test(s.sql)), false, "Keep Retired: untouched");
  // an Inactive / On Vacation word does not clear the tag
  const env3 = { DB: fdb() };
  const stage3 = await (await apiCrewImportStage(req({ rows: [{ ...rows[0], "CREW STATUS": "Inactive" }], file_hash: "h-ur3" }), env3)).json();
  assert.deepEqual(stage3.review.groups.unretire, []);
});

// "follow the tdg file always" (Miguel, 6 Oct 2026), end to end: Alandy, tagged Retired since 7 Jul 2026 with
// phone "639953384915" on the override while the file (and the base row) say "+63 995 338 4915". Before: the
// retired row never reached the review, the override kept winning, the card showed the July digits. Now the
// stage lists it as absorbed and the apply NULLs that one field, bound to the reviewed value, audited.
test("a retired crew's manual phone equal to the file is absorbed on Apply: cleared, bound, audited", async () => {
  const existing = [{ agency_id: "SC-0038241", first_name: "Joseph Dandy", last_name: "Alandy", status: "Inactive", phone: "+63 995 338 4915", vessel_observed: "MV CELEBRITY EQUINOX" }];
  const rows = [{ "CREW ID": "SC-0038241", "FIRST NAME": "Joseph Dandy", "LAST NAME": "Alandy", "CREW STATUS": "Inactive", "VESSEL NAME": "MV CELEBRITY EQUINOX", "MOBILE NO.": "+63 995 338 4915" }];
  const overrides = [{ agency_id: "SC-0038241", retired: 1, status: "Inactive", phone: "639953384915", pp_no: "P6755439B" }];
  const env = { DB: fakeDB({ existing, overrides }) };
  const stage = await (await apiCrewImportStage(req({ rows, file_hash: "h-ab" }), env)).json();
  assert.equal(stage.review.counts.override_absorbed, 1);
  assert.equal(stage.review.counts.override_conflict, 0);
  assert.equal(stage.review.groups.override_absorbed[0].field, "phone");
  assert.equal(env.DB._batched.length, 0, "stage writes nothing");
  const body = await (await apiCrewImportApply(req({ review: stage.review, decisions: {}, file_hash: "h-ab", run_by: "Rita" }), env)).json();
  assert.equal(body.ok, true);
  assert.equal(body.override_cleared, 1);
  const clr = env.DB._batched.find(s => /^UPDATE crew_override SET phone=NULL/.test(s.sql));
  assert.ok(clr, "the manual phone is cleared");
  assert.deepEqual([clr.args[1], clr.args[2]], ["SC-0038241", "639953384915"], "bound to the value reviewed");
  assert.equal(env.DB._batched.some(s => /^UPDATE crew SET phone=/.test(s.sql)), false, "the base already equals the file: not rewritten");
  assert.ok(env.DB._batched.some(s => /INSERT INTO sync_conflict/.test(s.sql) && s.args[3] === "phone" && s.args[4] === "639953384915"), "audited");
  assert.equal(env.DB._batched.some(s => /SET retired=0/.test(s.sql)), false, "Inactive per the file: the Retired tag stays");
});
