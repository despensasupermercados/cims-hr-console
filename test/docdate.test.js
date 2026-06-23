import { test } from "node:test";
import assert from "node:assert/strict";
import { docState } from "../src/deploy.js";
import { docStatus } from "../src/statement.js";

const TODAY = "2026-06-23";

test("deploy.docState: valid dates classify as before", () => {
  assert.equal(docState(null, TODAY), "missing");
  assert.equal(docState("2020-01-01", TODAY), "expired");
  assert.equal(docState("2026-07-01", TODAY), "expiring"); // < 90d out
  assert.equal(docState("2030-01-01", TODAY), "ok");
});

test("deploy.docState: malformed date flags as missing, never silently 'ok'", () => {
  assert.equal(docState("not-a-date", TODAY), "missing");
  assert.equal(docState("2026-13-99", TODAY), "missing");
  assert.equal(docState("31/12/2026", TODAY), "missing"); // non-ISO -> unparseable here
});

test("statement.docStatus: malformed date renders muted, not 'ok' black", () => {
  const ok = docStatus("2030-01-01", TODAY);
  assert.deepEqual(ok.color, [0, 0, 0]); // valid future date -> black/ok
  const bad = docStatus("not-a-date", TODAY);
  assert.notDeepEqual(bad.color, [0, 0, 0]); // unparseable must NOT look 'ok'
  assert.equal(docStatus(null, TODAY).txt, "-");
});
