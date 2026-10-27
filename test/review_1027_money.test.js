// 27 Oct 2026 review — the Score Card's refusals and pre-fills (MONEY, §1: Miguel's merge). Each case failed on the code of
// that morning; the behaviour pinned is the rule CLAUDE.md §10j already states.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commitBlock } from "../src/scorequeue.js";
import { gatherAuto } from "../src/score_auto.js";
import { installSeval, nearestOff, SEVAL_NEAR_DAYS } from "../src/seval.js";

const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

// Jaramiz Melen Tuazon's transfer once BOTH legs have ended: one TDG contract, one Score Card (Miguel, 17 Oct 2026: "One
// contract"). The running case was refused as still_aboard; the ended one could be committed leg by leg — two outcomes.
const TUAZON_ENDED = [
  { ship: "Explorer", sc: "SC-0046075", ours: true, on: "2026-06-06", off: "2026-08-23", is_current: false, source: "counter" },
  { ship: "Jewel", sc: "SC-0046075", ours: true, on: "2026-08-28", off: "2027-03-28", is_current: false, source: "registry", offSource: "tdg" },
];
const T = "2027-04-05";

test("commitBlock: an ENDED transfer cannot be committed leg by leg — the span must cover the whole contract", () => {
  const blk = commitBlock(TUAZON_ENDED, "SC-0046075", T, [], "2026-06-06", "2026-08-23");
  assert.equal(blk && blk.error, "transfer_partial", "the Explorer leg alone was committable once the contract had ended");
  assert.equal(blk.ship, "Explorer, Jewel"); assert.equal(blk.on, "2026-06-06"); assert.equal(blk.off, "2027-03-28");
  assert.equal(commitBlock(TUAZON_ENDED, "SC-0046075", T, [], "2026-08-28", "2027-03-28").error, "transfer_partial", "the Jewel leg alone neither");
  assert.equal(commitBlock(TUAZON_ENDED, "SC-0046075", T, [], "2026-06-06", "2027-03-28"), null, "the whole contract commits");
});

test("commitBlock: already_scored is contract-aware — an outcome on one leg blocks the other leg of the same transfer", () => {
  const outs = [{ span_start: "2026-06-06", span_end: "2026-08-23" }];
  assert.equal(commitBlock(TUAZON_ENDED, "SC-0046075", T, outs, "2026-08-28", "2027-03-28").error, "already_scored",
    "the Jewel dates do not overlap the Explorer outcome, but the contract does: one outcome per contract");
  assert.equal(commitBlock(TUAZON_ENDED, "SC-0046075", T, [{ span_start: "2025-01-01", span_end: "2025-08-01" }], "2026-06-06", "2027-03-28"), null, "an earlier contract's outcome blocks nothing");
});

test("commitBlock: a span that is not an ISO day is refused, never waved through", () => {
  assert.equal(commitBlock(TUAZON_ENDED, "SC-0046075", T, [], "2026-6-6", "2027-3-28").error, "span_invalid");
  assert.equal(commitBlock([], "X", T, [], "", "2026-07-01"), null, "a blank span is still the route's span_required");
  assert.match(W, /span_invalid" \}, 400\);\n  if \(b\.spanEnd < b\.spanStart\)/, "apiBonusCommit checks the ISO shape before the string compare");
  assert.match(W, /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(String\(b\.spanStart\)\)/);
});

// A failed read of the console's OWN tables used to come back as an empty answer: "No audit in this contract: full points".
const ROSTER = [{ agency_id: "SC-1", first_name: "Ryan Paolo", last_name: "Marto" }];
const stOf = (rows) => ({ bind: () => ({ all: async () => ({ results: rows }), first: async () => rows[0] || null, run: async () => ({}) }) });
const boom = { bind: () => ({ all: async () => { throw new Error("D1_ERROR: storage"); }, first: async () => { throw new Error("D1_ERROR"); } }) };

test("gatherAuto: the audits failing to read is no pre-fill at all, said — never 'full points'", async () => {
  const env = { DB: { prepare: (sql) => (/FROM audit_eval/.test(sql) ? boom : stOf(/FROM crew$/.test(sql) ? ROSTER : [])) } };
  const r = await gatherAuto(env, { sc: "SC-1", ship: "Quantum", signOn: "2026-04-01", signOff: "2026-11-05", crewName: "Ryan Marto", today: "2026-11-10" }, { engine: "none" });
  assert.equal(r.ok, false); assert.equal(r.error, "read_failed");
  assert.ok(r.failed && /D1_ERROR/.test(r.failed.audits));
  assert.equal(r.sliders, undefined, "nothing suggested");
  assert.match(r.text, /audits could not be read/);
});

test("gatherAuto: the feedback answers failing to read is said the same way (the Windows' pre-fill is left alone)", async () => {
  const env = { DB: { prepare: (sql) => (/feedback_response2/.test(sql) ? boom : stOf(/FROM crew$/.test(sql) ? ROSTER : [])) } };
  const r = await gatherAuto(env, { sc: "SC-1", ship: "Quantum", signOn: "2026-04-01", signOff: "2026-11-05", crewName: "Ryan Marto", today: "2026-11-10" }, { engine: "none" });
  assert.equal(r.ok, false); assert.ok(r.failed.feedback);
  assert.match(W, /if \(!a \|\| a\.ok === false\) return JSON\.stringify\(\{ at: new Date\(\)\.toISOString\(\), inputs/, "commitEvidence keeps the failure, not a clean picture");
  assert.match(W, /a&&a\.text\?escHtml\(a\.text\)/, "the page prints why");
});

test("gatherAuto: a clean read still pre-fills (the external sources' failures are still said per factor)", async () => {
  const env = { DB: { prepare: (sql) => stOf(/FROM crew$/.test(sql) ? ROSTER : []) }, PARTS_DB: { prepare: () => boom }, HON_DB: { prepare: () => boom } };
  const r = await gatherAuto(env, { sc: "SC-1", ship: "Quantum", signOn: "2026-04-01", signOff: "2026-11-05", crewName: "Ryan Marto", today: "2026-11-10" }, { engine: "none" });
  assert.equal(r.ok, true);
  assert.equal(r.sources.partsRead, false);
});

// The GSM review is keyed on the sign-off the sweep saw at T-7; TDG's debark can date the Score Card a few days away.
function fakeSevalDB(state) {
  const mk = (sql) => {
    const S = String(sql); const st = { args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => ({});
    st.first = async () => null;
    st.all = async () => {
      if (S.startsWith("SELECT agency_id, crew_id, contract_signoff, value, source")) return { results: state.stateRows.filter((r) => r.agency_id === st.args[0]) };
      if (S.includes("FROM sbm_review_response")) return { results: state.responses.filter((r) => r.agency_id === st.args[0]).map((r) => ({ rating: r.rating, off: r.contract_signoff })) };
      throw new Error("unexpected all(): " + S);
    };
    return st;
  };
  return { prepare: mk };
}

test("seval: a review keyed two days before the Score Card's sign-off is this contract's review", async () => {
  const seval = installSeval({ now: () => "2026-10-20T00:00:00.000Z" });
  const env = { DB: fakeSevalDB({ stateRows: [{ agency_id: "SC-5", contract_signoff: "2026-10-07", value: 2, source: "auto", set_by: "system", set_at: "x" }], responses: [{ agency_id: "SC-5", contract_signoff: "2026-10-07", rating: 2 }] }) };
  const g = await seval.sevalGet(env, "SC-5", "2026-10-09");
  assert.deepEqual([g.value, g.source, g.reviewCount, g.reviewAvg], [2, "auto", 1, 2], "the 2/5 used to be invisible: the eval defaulted to 3, full points, no forfeit");
  const far = await seval.sevalGet(env, "SC-5", "2027-04-01");
  assert.deepEqual([far.value, far.reviewCount], [null, 0], "another contract's review is not this one's");
});

test("nearestOff: the exact key first, else the nearest within the window, never beyond it", () => {
  assert.equal(nearestOff(["2026-10-07", "2026-10-09"], "2026-10-09"), "2026-10-09");
  assert.equal(nearestOff(["2026-10-07", "2026-09-01"], "2026-10-09"), "2026-10-07");
  assert.equal(nearestOff(["2026-09-01"], "2026-10-09"), null);
  assert.equal(SEVAL_NEAR_DAYS, 21);
  assert.match(W, /dd<=21&&dd<best/, "the page's 'view review' picks the same nearest card");
});

test("the Score Card page: the audit gate follows the read like the rush gate; a hand-picked eval survives a date change; a duplicate says so", () => {
  assert.match(W, /var ga=\$\('#gAudit'\),wantA=!!\(a\.gates&&a\.gates\.audit\);/);
  assert.match(W, /if\(ga&&!_TOUCHED\.gAudit\)\{if\(wantA\)\{ga\.checked=true;_AUTO\.audit=true;\}else if\(ga\.checked&&\(_AUTO\.audit\|\|_PF\.audit\)\)/);
  assert.match(W, /audit:!!\(pf\.gates&&pf\.gates\.audit\)\};/, "_PF remembers the Windows' audit gate");
  assert.match(W, /s\(Order\|Acc\|Par\|Hand\|Comm\|Mono\|Eval\)/, "sEval is a touched input");
  assert.match(W, /if\(s&&!_TOUCHED\.sEval\)s\.value=String\(d\.value\)/);
  assert.match(W, /policy: dup\.policy_version, committed_at: dup\.committed_at/);
  assert.match(W, /res\.duplicate\?'Already recorded'/);
  assert.match(W, /e\.error==='transfer_partial'/, "scBlockMsg words the new refusal");
});
