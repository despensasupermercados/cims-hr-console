// Printshop Audit — the pure rules (src/audit.js) and the tables (src/audit_store.js), 14 Oct 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAuditHost, auditShellPath, contractLabel, addressFor, shipMailbox, blindLines, parseCount, countCompleteness, countDiff, checkUpload, gateState, plusHours, REQUEST_HOURS } from "../src/audit.js";
import { AUDIT_DDL } from "../src/audit_store.js";

test("the audit host and its shell paths", () => {
  assert.ok(isAuditHost("audit.cims.work")); assert.ok(isAuditHost("AUDIT.cims.work:443")); assert.ok(!isAuditHost("cims.work"));
  assert.ok(auditShellPath("audit.cims.work", "/")); assert.ok(auditShellPath("audit.cims.work", "/anything"));
  for (const p of ["/api/audit/ships", "/login", "/auth/verify", "/audit/u", "/audit/sw.js", "/audit/manifest.webmanifest"]) assert.ok(!auditShellPath("audit.cims.work", p), p);
  assert.ok(auditShellPath("cims.work", "/audit")); assert.ok(!auditShellPath("cims.work", "/")); assert.ok(!auditShellPath("cims.work", "/crew"));
});

test("the contract number reads TDG's count, never a guess", () => {
  assert.equal(contractLabel(3, true), "3 completed · on contract 4");
  assert.equal(contractLabel(0, true), "0 completed · on contract 1");
  assert.equal(contractLabel(5, false), "5 completed");
  assert.equal(contractLabel(null, true), "On contract · count not on file");
});

const CONTACTS = [
  { client: "RCCL", ship: "Oasis of the Seas", email: "oasis.printshop@rccl.com", role: "printer_specialist" },
  { client: "RCCL", ship: "Oasis", email: "oasis.mgr@rccl.com", role: "printer_manager" },
  { client: "Celebrity", ship: "Celebrity Apex", email: "apex.printer@celebrity.com", role: "printer" },
  { client: "Azamara", ship: "Azamara Journey", email: "not-an-address", role: "printer_manager" },
];
test("addressing: the ship mailbox is shown and sent to, the personal address is a copy", () => {
  assert.equal(shipMailbox(CONTACTS, "Oasis"), "oasis.printshop@rccl.com", "printer_specialist outranks printer_manager");
  const a = addressFor({ contacts: CONTACTS, ship: "Oasis of the Seas", personal: "john@gmail.com" });
  assert.deepEqual(a, { ok: true, shown: "oasis.printshop@rccl.com", to: ["oasis.printshop@rccl.com"], cc: ["john@gmail.com"], noPersonal: false });
  assert.equal(addressFor({ contacts: CONTACTS, ship: "Apex", personal: "" }).shown, "apex.printer@celebrity.com");
  assert.equal(addressFor({ contacts: CONTACTS, ship: "Apex", personal: "" }).noPersonal, true);
  const none = addressFor({ contacts: CONTACTS, ship: "Journey", personal: "x@y.com" });
  assert.equal(none.ok, false); assert.equal(none.reason, "no_ship_mailbox"); assert.deepEqual(none.to, []);
});

const OBP = [
  { part_number: "A1", description: "Drum K", category: "Drum", on_hand: 2, update_date: "2026-10-14" },
  { part_number: "B2", description: "Toner C", category: "Toner", on_hand: 5, update_date: "2026-10-01" },
  { part_number: "A1", description: "dup", on_hand: 9 },
  { part_number: "C3", description: "Belt", category: "Belt", on_hand: 0, update_date: "2026-10-13" },
];
test("the blind count sheet carries no quantity, ever", () => {
  const L = blindLines(OBP);
  assert.equal(L.length, 3);
  for (const l of L) { assert.deepEqual(Object.keys(l).sort(), ["category", "description", "part_no"]); }
  assert.doesNotMatch(JSON.stringify(L), /on_hand|"2"|:2|:5|:9/);
});

test("a count is a whole number, 0 included; blank is not a count", () => {
  assert.equal(parseCount("0"), 0); assert.equal(parseCount(" 12 "), 12);
  for (const v of ["", null, undefined, "-1", "1.5", "abc", "999999"]) assert.equal(parseCount(v), null, String(v));
  const c = countCompleteness(blindLines(OBP), { A1: "1", B2: "0" });
  assert.deepEqual(c, { total: 3, done: 2, missing: ["C3"] });
});

test("the count against OBP: a one-unit gap on a part OBP just moved is timing, not a discrepancy", () => {
  const d = countDiff(OBP.slice(0, 2).concat(OBP[3]), { A1: "1", B2: "3", C3: "0" }, "2026-10-14");
  assert.deepEqual(d.map((r) => [r.part_no, r.diff, r.kind]), [["B2", -2, "gap"], ["A1", -1, "timing"]]);
});

test("uploads: empty, too big and wrong type are refused with words a crew member can act on", () => {
  assert.equal(checkUpload({ kind: "p43", type: "application/pdf", size: 0 }).reason, "empty");
  assert.equal(checkUpload({ kind: "p43", type: "application/pdf", size: 30 * 1048576 }).reason, "too_big");
  assert.equal(checkUpload({ kind: "mgmt", type: "text/plain", size: 10 }).reason, "type");
  assert.equal(checkUpload({ kind: "mgmt", type: "", name: "x.PDF", size: 10 }).ok, true);
  assert.equal(checkUpload({ kind: "photo", type: "application/pdf", size: 10 }).ok, false);
  assert.equal(checkUpload({ kind: "nope", type: "application/pdf", size: 10 }).ok, false);
});

test("the gate: nothing short of every document READ (or the machine down) and every line counted", () => {
  const machines = [{ serial: "S1", label: "Machine # 1" }, { serial: "S2", label: "Machine # 2" }];
  const lines = blindLines(OBP);
  const req = { status: "sent" };
  assert.equal(gateState({ request: null, machines, lines }).open, false);
  assert.equal(gateState({ request: { status: "cancelled" }, machines, lines }).open, false);
  const up = (serial, kind, read_state, at = "2026-10-14T10:00:00Z") => ({ serial, kind, read_state, at });
  const counted = { A1: 1, B2: 0, C3: 2 };
  let g = gateState({ request: req, machines, lines, counted, uploads: [up("S1", "p43", "ok"), up("S1", "mgmt", "pending")], down: [{ serial: "S2", reason: "" }] });
  assert.equal(g.open, false);
  assert.deepEqual(g.missing.map((m) => m.say), ["Machine # 1 · Management List not read yet", "Machine # 2 · Pattern 43 not sent", "Machine # 2 · Management List not sent"]);
  g = gateState({ request: req, machines, lines, counted, uploads: [up("S1", "p43", "ok"), up("S1", "mgmt", "ok")], down: [{ serial: "S2", reason: "Fuser error C-3101, engineer called" }] });
  assert.equal(g.open, true);
  g = gateState({ request: req, machines, lines, counted, uploads: [up("S1", "p43", "ok"), up("S1", "mgmt", "ok"), up("S1", "mgmt", "wrong_doc", "2026-10-14T11:00:00Z")], down: [{ serial: "S2", reason: "x" }] });
  assert.deepEqual(g.missing.map((m) => m.say), ["Machine # 1 · Management List needs a new file"], "the newest file decides");
  g = gateState({ request: req, machines, lines, counted: { A1: 1 }, uploads: [up("S1", "p43", "ok"), up("S1", "mgmt", "ok")], down: [{ serial: "S2", reason: "x" }] });
  assert.equal(g.open, false); assert.equal(g.missing[0].say, "2 of 3 parts not counted");
});

test("the request window is 24 hours", () => {
  assert.equal(REQUEST_HOURS, 24);
  assert.equal(plusHours("2026-10-14T10:00:00.000Z", 24), "2026-10-15T10:00:00.000Z");
});

test("the migration is the same statements that reach production", () => {
  const sql = ["0024_audit.sql", "0025_audit_plain.sql", "0026_audit_eval.sql", "0030_audit_token.sql", "0035_audit_visit.sql", "0037_audit_one_per_ship.sql"].map((f) => readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8")).join("\n");
  const stmts = sql.split("\n").filter((l) => l && !l.startsWith("--")).map((l) => l.replace(/;$/, ""));
  assert.deepEqual(stmts, AUDIT_DDL);
  for (const s of AUDIT_DDL) assert.match(s, /^CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS /);
});

test("one definition of an open request: the SQL and the JS agree on every state", async () => {
  const { OPEN_REQ_SQL, isOpenRequest } = await import("../src/audit.js");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE audit_request (id TEXT, status TEXT, test_mode INTEGER); CREATE TABLE audit_eval (request_id TEXT, score INTEGER)");
  const rows = [["draft", 0, null], ["sent", 0, null], ["sent", 1, null], ["complete", 0, null], ["complete", 0, 4], ["complete", 1, null], ["cancelled", 0, null]];
  rows.forEach(([status, test, grade], i) => {
    db.prepare("INSERT INTO audit_request VALUES (?,?,?)").run("r" + i, status, test);
    if (grade != null) db.prepare("INSERT INTO audit_eval VALUES (?,?)").run("r" + i, grade);
  });
  const sql = new Set(db.prepare("SELECT r.id FROM audit_request r LEFT JOIN audit_eval e ON e.request_id = r.id WHERE " + OPEN_REQ_SQL).all().map((x) => x.id));
  rows.forEach(([status, test, grade], i) => assert.equal(sql.has("r" + i), isOpenRequest({ status, test_mode: test, grade }), status + " test=" + test + " grade=" + grade));
  assert.deepEqual([...sql].sort(), ["r0", "r1", "r2", "r3"], "draft, sent (live or test), and in-not-graded live");
});
