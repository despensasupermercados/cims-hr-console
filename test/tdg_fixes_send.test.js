// "Email Joy · To correct in TDG" wired (Miguel, 23 Oct 2026: "all approved"): the rows the dashboard shows, a dry run that
// names the recipient, Deploy's recipient and copy (never a guess), the same rows not sent twice in a week unless confirmed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tdgFixesSend, fixesKey, ACTION } from "../src/tdg_fixes_send.js";

const FIXES = [
  { kind: "held", sc: "SC-1", ship: "Quantum", brand: "Royal", code: "QN", name: "Ryan Paolo Marto", surname: "Marto", byName: "Allen Edward Cedilla", byOn: "2026-10-22" },
  { kind: "undated", sc: "SC-2", ship: "Spectrum", brand: "Royal", code: "SP", name: "Jonathan Alonzo", surname: "Alonzo" }];
function deps(over = {}) {
  const sent = [], logs = [];
  return { sent, logs, ops: async () => ({ today: "2026-10-23", tdg: { advq: { at: "2026-10-23" }, fixes: over.fixes || FIXES } }),
    recipient: () => ("to" in over ? over.to : "joy@tdg.example"), cc: () => ["Rita.Berenyi@dg3.com"],
    send: async (env, m) => { sent.push(m); return over.fail ? { ok: false, error: "down" } : { ok: true }; },
    log: async (env, who, action, detail) => { logs.push({ who, action, detail }); },
    lastSend: async () => over.last || null, now: () => "2026-10-23T15:00:00Z" };
}
const S = { email: "Miguel.Sanmartin@dg3.com" };

test("dry run: names the recipient, the copy, the count and the subject, and sends nothing", async () => {
  const d = deps();
  const r = await tdgFixesSend({}, {}, S, d);
  assert.equal(r.ok, true); assert.equal(r.dryRun, true); assert.equal(r.recipient, "joy@tdg.example"); assert.deepEqual(r.cc, ["Rita.Berenyi@dg3.com"]);
  assert.equal(r.count, 2); assert.equal(r.subject, "To correct in TDG · 2 seafarers · file of Oct 23"); assert.equal(d.sent.length, 0);
});

test("send: one email to Joy, cc Rita, reply to the sender, the rows as the board has them; logged with the rows' key", async () => {
  const d = deps();
  const r = await tdgFixesSend({}, { send: true }, S, d);
  assert.equal(r.ok, true); assert.equal(d.sent.length, 1);
  const m = d.sent[0];
  assert.deepEqual(m.to, ["joy@tdg.example"]); assert.deepEqual(m.cc, ["Rita.Berenyi@dg3.com"]); assert.equal(m.replyTo, S.email);
  assert.equal(m.templateId, "hr.keyman.tdg_fixes.v1"); assert.equal(m.critical, true);
  assert.match(m.html, /Allen Edward Cedilla signed on Oct 22 as the reliever/); assert.match(m.html, /Please enter Jonathan&#39;s embark date\.|Please enter Jonathan's embark date\./);
  assert.match(m.html, /Miguel\./, "signed by the person who sent it");
  assert.equal(d.logs.length, 1); assert.equal(d.logs[0].action, ACTION); assert.equal(JSON.parse(d.logs[0].detail).key, fixesKey(FIXES));
});

test("refused: no recipient (never a guess), nothing to correct, a mail that did not go is not logged", async () => {
  let d = deps({ to: null });
  assert.equal((await tdgFixesSend({}, { send: true }, S, d)).error, "no_recipient"); assert.equal(d.sent.length, 0);
  d = deps({ fixes: [] });
  assert.equal((await tdgFixesSend({}, { send: true }, S, d)).error, "nothing_to_correct");
  d = deps({ fail: true });
  const r = await tdgFixesSend({}, { send: true }, S, d);
  assert.equal(r.error, "not_sent"); assert.equal(d.logs.length, 0, "nothing logged as sent");
});

test("the same rows within a week ask once more; a changed set is a new email", async () => {
  const last = { at: "2026-10-21T09:00:00Z", detail: JSON.stringify({ key: fixesKey(FIXES) }) };
  let d = deps({ last });
  const r = await tdgFixesSend({}, { send: true }, S, d);
  assert.equal(r.error, "already_sent"); assert.equal(r.sameAsLast, true); assert.equal(d.sent.length, 0);
  d = deps({ last });
  assert.equal((await tdgFixesSend({}, { send: true, resend: true }, S, d)).ok, true);
  d = deps({ last, fixes: FIXES.slice(0, 1) });
  assert.equal((await tdgFixesSend({}, { send: true }, S, d)).ok, true, "a different set is not the same email");
  d = deps({ last: { at: "2026-10-10T09:00:00Z", detail: last.detail } });
  assert.equal((await tdgFixesSend({}, { send: true }, S, d)).ok, true, "older than a week");
});
