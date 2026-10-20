// The audit on the ship (B1–B7), 19 Oct 2026: src/audit_steps.js (the rules, shared with the page) and the visit routes in
// src/audit_request.js, on REAL SQLite. Miguel, 19 Oct 2026: "where is the inventory count from dexter .. u missed the
// entire app" — the 15 Oct grade screen had stood in for the whole visit. The score the Score Card reads is unchanged (§1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ensureAuditTables } from "../src/audit_store.js";
import { installAuditRequest } from "../src/audit_request.js";
import { applyOverride } from "../src/override.js";
import { auditScore } from "../src/audit.js";
import { startVisit, normalizeVisit, visitProblems, evalOf, repeatCounts, beforeVisit, AUDIT_RULES_JS, WORKSTATION, TOOLS, fillVisit, obpMatches } from "../src/audit_steps.js";

/* ------------------------------------------------ harness ------------------------------------------------ */
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE crew (agency_id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT); CREATE TABLE crew_override (agency_id TEXT PRIMARY KEY, email TEXT, first_name TEXT, last_name TEXT)");
  db.prepare("INSERT INTO crew VALUES ('SC-1','John','Gorre','john@gmail.com')").run();
  db.prepare("INSERT INTO crew VALUES ('SC-2','Ana','Reyes','ana@gmail.com')").run();
  const mk = (sql) => { const st = { args: [] }; st.bind = (...a) => { st.args = a.map((x) => (x === undefined ? null : x)); return st; };
    st.all = async () => ({ results: db.prepare(sql).all(...st.args) }); st.first = async () => db.prepare(sql).get(...st.args) || null;
    st.run = async () => { const r = db.prepare(sql).run(...st.args); return { meta: { changes: Number(r.changes) } }; }; return st; };
  // a D1 batch is one transaction: all or nothing
  const batch = async (sts) => { db.exec("BEGIN"); try { const out = []; for (const s of sts) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } };
  return { db, DB: { prepare: mk, batch } };
}
const TC = { prepare: () => ({ all: async () => ({ results: [{ ship: "Oasis", email: "oa_printerspecialist@rccl.com", role: "printer_specialist" }] }) }) };
const OBP = [{ part_number: "A1", description: "Drum K", category: "Drum", on_hand: 2 }, { part_number: "B2", description: "Toner C", category: "Toner", on_hand: 5 }, { part_number: "C3", description: "Waste box", category: "Parts", on_hand: 4 }];
const HON = {
  ship: async () => ({ ok: true, ship: "Oasis", presses: [{ serial: "S1", model: "C4070", label: "PROD 1" }], obp: { asOf: "2026-10-13", lines: OBP, intransit: [{ part_number: "A1", qty: 1 }] } }),
  pattern43: async () => ({ ok: true, version: 5, state: "findings", legend: { state: "findings", items: [{ head: "LINES ALONG THE FEED IN CYAN", where: "cyan half tone · green", part: "CYAN DRUM OR CHARGING POLE", check: { say: "an even line reads as the drum" } }] } }),
  managementList: async () => ({ ok: true, version: 4, kind: "machine-list", lifeOver: [{ name: "Drum Unit/K (%)", partNo: "A1", pct: 140 }], recommendation: "Recommendation: have this machine looked at." }),
};
const R2 = () => { const m = new Map(); return { m, put: async (k, b) => { m.set(k, new Uint8Array(b)); }, head: async (k) => (m.has(k) ? { size: m.get(k).length } : null), get: async (k) => (m.has(k) ? { arrayBuffer: async () => m.get(k).buffer, body: null } : null) }; };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const BOARD = { sections: [{ ship: "Oasis", crew: [{ agency_id: "SC-1", current: true, aboard: true }, { agency_id: "SC-2", current: true, aboard: true }] }] };
function setup() {
  const { db, DB } = d1();
  const sent = [];
  const env = { DB, TIMECARD_DB: TC, HON, AUDIT_FILES: R2(), AUDIT_TO: "ray@dg3.com", AUDIT_LIVE: "true" };
  const R = installAuditRequest({ json, htmlResponse: (b) => new Response(b), ensureAudit: ensureAuditTables, applyOverride, logActivity: async () => {}, rotationSections: async () => BOARD,
    sendViaMailer: async (e, env2) => { sent.push(env2 || e); return { ok: true }; } });
  const call = async (method, path, body, session = { email: "dexter.lawrence@dg3.com" }, headers = {}) => {
    const u = new URL("https://audit.cims.work" + path);
    const raw = body instanceof Uint8Array;
    const req = new Request(u, { method, headers: Object.assign(raw ? {} : { "Content-Type": "application/json" }, headers), body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    return R.handle(u.pathname, req, env, u, session);
  };
  return { R, env, db, sent, call };
}
// a request whose documents are in: both files read, every line counted (Toner C off by 5, Waste box off by 1), one item
// found that is not on the OBP list
async function completeRequest(t, sc = "SC-1") {
  const r = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc })).json();
  assert.equal(r.ok, true, JSON.stringify(r));
  const token = (t.sent[t.sent.length - 1].text.match(/\/audit\/u\/([A-Za-z0-9_-]+)/) || [])[1];
  for (const kind of ["p43", "mgmt"]) {
    const u = await (await t.call("POST", "/api/audit/u/upload?t=" + token + "&serial=S1&kind=" + kind, new TextEncoder().encode("%PDF-1.4 " + kind), null, { "content-type": "application/pdf", "x-file-name": kind + ".pdf" })).json();
    await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null);
  }
  await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "2", B2: "0", C3: "3" }, extras: [{ text: "Fusing gears", counted: "2" }] }, null);
  const s = await (await t.call("POST", "/api/audit/u/submit?t=" + token, {}, null)).json();
  assert.equal(s.ok, true, JSON.stringify(s));
  return r.id;
}
// a clean, complete visit for that request: what Dexter's thumbs produce on the page
function cleanVisit(v) {
  const d = startVisit({ machines: v.machines, diff: v.count.diff });
  d.openedAt = new Date(Date.now() - 3600e3).toISOString();
  d.hw.machines.S1.p43 = "not_seen";
  for (const x of v.count.extras) d.inv.repairs[x.id] = "confirmed";
  d.rt = { inventory: 4, technical: 5, collaterals: 5, why: { inventory: "", technical: "", collaterals: "" } };
  d.ov.strengths = "Solid break-and-fix."; d.ov.improve = "Count from the shelf, not the printer.";
  return d;
}

/* ------------------------------------------------ the pure rules ------------------------------------------------ */
const CTX = { machines: [{ serial: "S1", label: "PROD 1", down: null, p43: { state: "findings", items: [{ head: "LINES" }] }, life: [] }, { serial: "S2", label: "PROD 2", down: "paper jam", p43: null, life: [] }],
  diff: [{ part_no: "B2", obp: 5, counted: 0, diff: -5, kind: "gap" }], extras: [{ id: "x1", text: "Fusing gears" }], followups: [{ id: "f1", text: "SOPs folder" }], parts: ["A1", "B2", "C3"] };

test("the clean start: every checklist full, inventory starts on what the crew's count says", () => {
  const d = startVisit(CTX);
  assert.deepEqual(d.ws.missing, []); assert.deepEqual(d.hw.tools.missing, []); assert.equal(d.hw.labeled, true);
  assert.equal(d.inv.accurate, false, "a line differs: 'No, discrepancies'");
  assert.equal(startVisit({ machines: [], diff: [{ kind: "timing" }] }).inv.accurate, true, "a timing line alone is not a discrepancy");
  assert.equal(d.crew.hon, "yes");
  assert.deepEqual(Object.keys(d.hw.machines), ["S1", "S2"]);
});

test("what holds Next: each reason in its own step, under its own field", () => {
  const d = startVisit(CTX);
  const by = (step) => visitProblems(d, CTX, "2026-10-19").filter((p) => p.step === step).map((p) => p.field);
  assert.deepEqual(by("workstation"), [], "a full desktop needs no tap");
  // ONE way to answer (Miguel, 19 Oct 2026: "the dual thing .. not my favorite"): every answer starts in its normal state
  assert.deepEqual(by("machines"), [], "the machine the crew reported down starts running again, the Pattern 43 mark starts not seen");
  assert.deepEqual([d.hw.machines.S2.down, d.hw.machines.S1.p43], ["running", "not_seen"]);
  assert.deepEqual(by("inventory"), [], "the repair item the crew found starts on the shelf");
  assert.equal(d.inv.repairs.x1, "confirmed");
  // the server's guard stays for whatever arrives without them (the site is open: a stranger's input)
  const raw = JSON.parse(JSON.stringify(d)); raw.hw.machines.S1.p43 = null; raw.hw.machines.S2.down = null; delete raw.inv.repairs.x1;
  const rby = (step) => visitProblems(raw, CTX).filter((p) => p.step === step).map((p) => p.field);
  assert.deepEqual(rby("machines").sort(), ["down:S2", "p43:S1"]);
  assert.deepEqual(rby("inventory"), ["repair:x1"]);
  assert.deepEqual(by("ratings"), ["inventory", "technical", "collaterals"]);
  assert.deepEqual(by("overall"), ["strengths", "improve"], "Overall is optional; strengths and to improve are not");
  d.hw.machines.S1.p43 = "seen";
  assert.ok(visitProblems(d, CTX).some((p) => p.field === "note:S1"), "a mark seen on the machine needs one sentence");
  d.hw.machines.S1.note = "Cyan line on every print.";
  d.hw.machines.S2.down = "still";
  d.rt = { inventory: 3, technical: 5, collaterals: 5, why: { inventory: "short" } };
  assert.deepEqual(visitProblems(d, CTX).filter((p) => p.step === "ratings").map((p) => p.field), ["why:inventory"], "a 3 needs a sentence of 10 characters");
  d.rt.why.inventory = "OBP not updated after the drum change.";
  d.ov.overall = 2;
  assert.deepEqual(visitProblems(d, CTX).filter((p) => p.step === "overall").map((p) => p.field), ["why", "strengths", "improve"]);
  d.ov.followup = { owner: "", due: "2026-10-01", text: "" };
  assert.deepEqual(visitProblems(d, CTX, "2026-10-19").filter((p) => p.field.startsWith("fu_")).map((p) => p.field), ["fu_owner", "fu_due", "fu_text"], "an owner, a date not passed, what");
  d.inv.accurate = false; const noGaps = Object.assign({}, CTX, { diff: [] });
  assert.ok(visitProblems(d, noGaps).some((p) => p.field === "lines"), "'discrepancies' with no line says which");
});

test("the OBP verdict is measured from the lines, never asked; a kept draft gets the same normal answers, never over one given", () => {
  const d = startVisit(CTX);
  assert.equal(obpMatches(d, CTX), false, "the crew counted 0 where OBP says 5");
  assert.equal(d.inv.accurate, false);
  d.inv.lines.B2 = { shelf: 5 };
  assert.equal(obpMatches(d, CTX), true, "the shelf says OBP is right after all");
  d.inv.added.push({ part_no: "C3", shelf: 2 });
  assert.equal(obpMatches(d, Object.assign({}, CTX, { obp: { C3: 4 } })), false, "a line Dexter adds is off unless its shelf is OBP's number");
  assert.equal(obpMatches(d, Object.assign({}, CTX, { obp: { C3: 2 } })), true);
  assert.equal(obpMatches({ inv: {} }, { diff: [{ kind: "timing", part_no: "T", obp: 2, counted: 1 }] }), true, "a timing line is not a discrepancy (1 Oct rule)");
  const old = { hw: { labeled: null, machines: { S1: { checks: {}, p43: null } } }, inv: { lines: {}, added: [], repairs: {} }, crew: { hon: null } };
  fillVisit(old, CTX);
  assert.deepEqual([old.hw.labeled, old.hw.machines.S1.p43, old.hw.machines.S2.down, old.inv.repairs.x1, old.inv.accurate, old.crew.hon], [true, "not_seen", "running", "confirmed", false, "yes"], "a draft kept from before the change");
  const kept = { hw: { labeled: false, machines: { S1: { p43: "seen" }, S2: { down: "still" } } }, inv: { repairs: { x1: "not_found" } }, crew: { hon: "na" } };
  fillVisit(kept, CTX);
  assert.deepEqual([kept.hw.labeled, kept.hw.machines.S1.p43, kept.hw.machines.S2.down, kept.inv.repairs.x1, kept.crew.hon], [false, "seen", "still", "not_found", "na"], "an answer given is never overwritten");
});

test("the score is the Score Card's own rule, and the note carries every reason", () => {
  const d = startVisit(CTX);
  d.rt = { inventory: 3, technical: 4, collaterals: 5, why: { inventory: "OBP lags the part changes." } };
  d.ov.improve = "Count from the shelf.";
  const e = evalOf(d);
  assert.deepEqual(e.score, auditScore({ inventory: 3, technical: 4, collaterals: 5 }), "no Overall: the average rounded down, as since 15 Oct");
  assert.deepEqual(e.score, { score: 4, from: "average" });
  assert.equal(e.r.note, "Inventory management (3): OBP lags the part changes.\nTo improve: Count from the shelf.");
  assert.deepEqual(e.problems, []);
  d.ov.overall = 2; d.ov.why = "The printshop runs on luck.";
  assert.deepEqual(evalOf(d).score, { score: 2, from: "overall" });
  assert.match(evalOf(d).r.note, /^Inventory management \(3\).*\nOverall \(2\): The printshop runs on luck\.\nTo improve/s);
});

test("what the server keeps: known keys, typed values, bounded text — the open site is a stranger's input", () => {
  const raw = { ws: { missing: ["sops", "nope", "sops"] }, hw: { labeled: "yes", machines: { S1: { checks: { test: "finding", scan: "ok", bogus: "finding" }, p43: "maybe", note: 5 }, EVIL: { note: "x" } }, tools: { missing: ["head_lamp", "drill"] } },
    inv: { accurate: "no", lines: { B2: { shelf: "3", checked: "true" }, ZZ: { shelf: 9 } }, added: [{ part_no: "C3", shelf: "4" }, { part_no: "XX", shelf: 1 }, { part_no: "B2" }], repairs: { x1: "confirmed", x9: "confirmed" } },
    rt: { inventory: "4", technical: 4.5, collaterals: true }, crew: { training: ["mfd", "<script>"], hon: "maybe", dispatch: 9 }, ov: { overall: "", strengths: "a".repeat(5000), followup: { owner: "Rolando", due: "not a date", text: "x" } },
    close: { f1: "fixed", f9: "fixed" }, openedAt: "<b>" };
  const d = normalizeVisit(raw, CTX);
  assert.deepEqual(d.ws.missing, ["sops"]);
  assert.equal(d.hw.labeled, null, "only true / false");
  assert.deepEqual(Object.keys(d.hw.machines).sort(), ["S1", "S2"], "an unknown machine is dropped, a known one is always there");
  assert.deepEqual(d.hw.machines.S1, { checks: { test: "finding" }, p43: null, down: null, note: "" });
  assert.deepEqual(d.hw.tools.missing, ["head_lamp"]);
  assert.equal(d.inv.accurate, null);
  assert.deepEqual(d.inv.lines, { B2: { shelf: 3, checked: false } });
  assert.deepEqual(d.inv.added, [{ part_no: "C3", shelf: 4 }], "an unknown part, and a part the crew's count already put off, are dropped");
  // the page keeps an added line's shelf number in lines too: that is the same line, never a reason to drop it
  // (found 19 Oct 2026 walking the page in Chromium: Dexter's added drum line vanished on filing)
  const both = normalizeVisit({ inv: { lines: { C3: { shelf: 1, checked: true } }, added: [{ part_no: "C3", shelf: 1 }, { part_no: "C3", shelf: 2 }] } }, CTX);
  assert.deepEqual(both.inv.added, [{ part_no: "C3", shelf: 1 }], "kept once");
  assert.deepEqual(both.inv.lines, { C3: { shelf: 1, checked: true } });
  assert.deepEqual(d.inv.repairs, { x1: "confirmed" });
  assert.deepEqual([d.rt.inventory, d.rt.technical, d.rt.collaterals], [4, null, null]);
  assert.deepEqual(d.crew.training, ["mfd"]); assert.equal(d.crew.hon, null); assert.equal(d.crew.dispatch, null);
  assert.equal(d.ov.overall, null); assert.equal(d.ov.strengths.length, 2000);
  assert.deepEqual(d.ov.followup, { owner: "Rolando", due: null, text: "x" });
  assert.deepEqual(d.close, { f1: "fixed" }); assert.equal(d.openedAt, null);
});

test("'2nd time': an item missing on this ship's last visit and missing again", () => {
  const prev = { ws: { missing: ["sops", "ips"] }, hw: { tools: { missing: ["fiery_hdd"] } }, repeat: { sops: 2, ips: 1, fiery_hdd: 1 } };
  const d = { ws: { missing: ["sops", "contacts"] }, hw: { tools: { missing: ["fiery_hdd"] } } };
  assert.deepEqual(repeatCounts(prev, d), { sops: 3, contacts: 1, fiery_hdd: 2 });
  assert.deepEqual(repeatCounts(null, d), { sops: 1, contacts: 1, fiery_hdd: 1 });
});

test("A8: what the documents found, as items to confirm — amber, provisional, copy quality decides", () => {
  const b = beforeVisit({ machines: [{ serial: "S1", label: "PROD 1", p43: { items: [{ head: "LINES ALONG THE FEED IN CYAN", part: "CYAN DRUM" }] }, life: [{ name: "Drum Unit/K (%)", pct: 140 }] }, { serial: "S2", label: "PROD 2", down: "paper jam" }],
    diff: [{ kind: "gap" }, { kind: "timing" }], extras: [{ id: "x" }] });
  assert.deepEqual(b.map((x) => x.t), ["PROD 1 · Pattern 43: Lines along the feed in cyan", "PROD 1 · 1 part past rated life", "PROD 2 reported down", "Count: 1 line differs · 1 not in OBP", "Count: 1 line one unit off, the day OBP moved it"]);
  assert.match(b[0].s, /provisional, Rolando confirms/); assert.match(b[1].s, /Drum Unit\/K 140% · copy quality decides/);
  assert.ok(b.every((x) => x.tone !== "r"), "nothing is red before it is seen on the ship");
  assert.doesNotMatch(JSON.stringify(b), /replace/i);
  assert.deepEqual(beforeVisit({}), []);
});

test("the page gates with the SAME functions the server re-checks (serialized, not a hand-kept twin)", () => {
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(AUDIT_RULES_JS, ctx);
  const AR = ctx.window.AR;
  const d = startVisit(CTX);
  assert.deepEqual(JSON.parse(JSON.stringify(AR.startVisit(CTX))), JSON.parse(JSON.stringify(d)));
  for (const mut of [() => {}, (x) => { x.rt = { inventory: 2, technical: 3, collaterals: 5, why: { inventory: "Short." } }; }, (x) => { x.ov.overall = 1; x.ov.followup = { owner: "Ray", due: "2026-11-01", text: "Resend SOPs" }; }, (x) => { x.hw.machines.S1.checks.test = "finding"; }]) {
    mut(d);
    assert.deepEqual(JSON.parse(JSON.stringify(AR.visitProblems(d, CTX, "2026-10-19"))), visitProblems(d, CTX, "2026-10-19"));
    assert.deepEqual(JSON.parse(JSON.stringify(AR.evalOf(d))), JSON.parse(JSON.stringify(evalOf(d))));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(AR.WORKSTATION)), WORKSTATION); assert.deepEqual(JSON.parse(JSON.stringify(AR.TOOLS)), TOOLS);
  const page = readFileSync(new URL("../src/audit_ui.js", import.meta.url), "utf8");
  assert.match(page, /import \{ AUDIT_RULES_JS \} from "\.\/audit_steps\.js";/);
  assert.match(page, /<script>` \+ AUDIT_RULES_JS \+ String\.raw`<\/script>/);
  assert.doesNotMatch(page, /function visitProblems|function evalOf/, "no second copy in the page");
});

test("the rules run in the page out of the REAL Worker bundle (wrangler renames colliding names, keepNames adds __name)", async () => {
  // 19 Oct 2026, twice live on audit.cims.work: "__name is not defined" (keepNames), then "txt2 is not defined" (the real
  // bundle renames a top-level `txt` that collides with another module's). Node never does either, and a bundle of
  // audit_steps.js alone has nothing to collide with — only the whole Worker shows it. So: bundle src/worker.js the way
  // wrangler does, take AUDIT_RULES_JS out of THAT bundle, run it like the page and compare with the module.
  // The entry must be src/worker.js itself, as wrangler's: the module order decides which colliding name gets the
  // suffix (a wrapper entry moved the rename onto another module and the old code passed). The rules are taken out of the
  // bundle through a footer export of whatever name the bundle gave them.
  const { build } = await import("esbuild");
  const r = await build({ entryPoints: [new URL("../src/worker.js", import.meta.url).pathname], bundle: true, format: "esm", keepNames: true, write: false,
    platform: "neutral", external: ["cloudflare:*", "node:*"], conditions: ["workerd", "worker", "browser"], mainFields: ["module", "main"], logLevel: "error" });
  let text = r.outputFiles[0].text;
  assert.match(text, /\btxt2\b/, "the real bundle does rename a colliding top-level `txt`");
  const name = (text.match(/\bvar (AUDIT_RULES_JS\d*) = /) || [])[1];
  assert.ok(name, "the rules are in the bundle");
  text += "\nexport { " + name + " as __AR };\n";
  const m = await import("data:text/javascript;base64," + Buffer.from(text).toString("base64"));
  assert.match(m.__AR, /__name\(/, "and the serialized rules do carry keepNames' helper");
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(m.__AR, ctx);
  const AR = ctx.window.AR;
  const d = startVisit(CTX), p = AR.startVisit(CTX);
  for (const mut of [() => {}, (x) => { x.rt = { inventory: 3, technical: 4, collaterals: 5, why: { inventory: "short" } }; x.ov.followup = { owner: "", due: "x", text: "" }; }, (x) => { x.hw.machines.S1.checks.test = "finding"; x.ov.overall = 2; }]) {
    mut(d); mut(p);
    assert.deepEqual(JSON.parse(JSON.stringify(AR.visitProblems(p, CTX, "2026-10-19"))), visitProblems(d, CTX, "2026-10-19"));
    assert.deepEqual(JSON.parse(JSON.stringify(AR.evalOf(p))), JSON.parse(JSON.stringify(evalOf(d))));
  }
  assert.deepEqual([AR.ordinal(2), AR.plusDays("2026-10-19", 30), AR.partName("Drum Unit/K (%)")], ["2nd", "2026-11-18", "Drum Unit/K"]);
});

/* ------------------------------------------------ the routes ------------------------------------------------ */
test("the visit: closed before the documents are in; then the reads, the count against OBP, the items to confirm", async () => {
  const t = setup();
  const r = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" })).json();
  let v = await (await t.call("GET", "/api/audit/visit?id=" + r.id)).json();
  assert.equal(v.status, "sent");
  const f = await t.call("POST", "/api/audit/request/grade", { id: r.id, visit: {} });
  assert.equal(f.status, 409, "the gate: no audit before the documents are in");
  t.db.prepare("UPDATE audit_request SET status='cancelled' WHERE id=?").run(r.id);
  const id = await completeRequest(t);
  v = await (await t.call("GET", "/api/audit/visit?id=" + id)).json();
  assert.equal(v.status, "complete"); assert.equal(v.filed, null);
  assert.deepEqual(v.machines.map((m) => [m.serial, m.p43.state, m.p43.items[0].head, m.life[0].pct, m.life[0].cover]), [["S1", "findings", "LINES ALONG THE FEED IN CYAN", 140, "on board 2 · on order 1"]]);
  assert.deepEqual(v.count.diff.map((x) => [x.part_no, x.obp, x.counted, x.diff]), [["B2", 5, 0, -5], ["C3", 4, 3, -1]]);
  assert.equal(v.count.asOf, "2026-10-13"); assert.equal(v.count.total, 3);
  assert.deepEqual(v.count.extras.map((x) => x.text), ["Fusing gears"]);
  assert.deepEqual(v.parts.find((p) => p.part_no === "A1"), { part_no: "A1", description: "Drum K", obp: 2, counted: 2 }, "Dexter sees OBP beside the count; the crew never did");
  assert.ok(v.before.length >= 3);
  const kept = t.db.prepare("SELECT as_of, lines_json FROM audit_obp_at_count WHERE request_id=?").get(id);
  assert.equal(kept.as_of, "2026-10-13", "the OBP the documents-in email compared with is kept");
  assert.equal(JSON.parse(kept.lines_json).length, 3);
});

test("filing: refused with the reasons and nothing written; then the visit, the grade, the steps and the follow-up in one batch, once", async () => {
  const t = setup();
  const id = await completeRequest(t);
  const v = await (await t.call("GET", "/api/audit/visit?id=" + id)).json();
  const unanswered = startVisit({ machines: v.machines, diff: v.count.diff }); unanswered.hw.machines.S1.p43 = null; // what a stranger's POST may carry
  const bad = await t.call("POST", "/api/audit/request/grade", { id, visit: unanswered });
  assert.equal(bad.status, 400);
  const bj = await bad.json();
  assert.ok(bj.problems.some((p) => p.field === "p43:S1") && bj.problems.some((p) => p.field === "inventory"));
  for (const tb of ["audit_visit", "audit_eval", "audit_visit_data", "audit_followup"]) assert.equal(t.db.prepare("SELECT COUNT(*) n FROM " + tb).get().n, 0, tb + " untouched");
  // the documents came in two hours ago; Dexter opened the audit an hour ago (an opening before the documents is not one)
  t.db.prepare("UPDATE audit_request SET complete_at=? WHERE id=?").run(new Date(Date.now() - 7200e3).toISOString(), id);
  const d = cleanVisit(v);
  d.ws.missing = ["sops"]; d.hw.tools.missing = ["fiery_hdd"];
  d.inv.lines.B2 = { shelf: 5, checked: true };
  d.crew.training = ["mfd"]; d.crew.dispatch = 2;
  d.ov.followup = { owner: "Rolando", due: "2099-11-15", text: "MFD refresher" };
  const ok = await (await t.call("POST", "/api/audit/request/grade", { id, visit: d })).json();
  assert.deepEqual([ok.ok, ok.score, ok.from], [true, 4, "average"], "(4+5+5)/3 = 4.67, rounded down");
  // the Score Card reads exactly what it read before (score_auto.js): the score, the ship, the date, who
  const sc = t.db.prepare("SELECT e.request_id, e.ship, e.score, e.score_from, e.r_inventory, e.r_overall, e.note FROM audit_eval e WHERE e.agency_id='SC-1'").get();
  assert.deepEqual({ ...sc }, { request_id: id, ship: "Oasis", score: 4, score_from: "average", r_inventory: 4, r_overall: null, note: "To improve: Count from the shelf, not the printer." });
  assert.equal(JSON.stringify(sc).includes("dispatch"), false, "the dispatch rating never enters the grade");
  const data = JSON.parse(t.db.prepare("SELECT data_json FROM audit_visit_data WHERE request_id=?").get(id).data_json);
  assert.deepEqual(data.ws.missing, ["sops"]); assert.equal(data.crew.dispatch, 2); assert.deepEqual(data.repeat, { sops: 1, fiery_hdd: 1 });
  assert.equal(data.ctx.diff.length, 2, "what the documents said is kept with the visit");
  const visit = t.db.prepare("SELECT opened_at, filed_at FROM audit_visit WHERE request_id=?").get(id);
  assert.equal(visit.opened_at, d.openedAt, "stamped twice: opened on the phone, filed now");
  assert.ok(visit.opened_at < visit.filed_at);
  assert.deepEqual({ ...t.db.prepare("SELECT owner, due, text, status, carried FROM audit_followup").get() }, { owner: "Rolando", due: "2099-11-15", text: "MFD refresher", status: "open", carried: 0 });
  const again = await t.call("POST", "/api/audit/request/grade", { id, visit: d });
  assert.equal(again.status, 409, "filed once; a retry after a lost answer changes nothing");
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM audit_followup").get().n, 1);
  const back = await (await t.call("GET", "/api/audit/visit?id=" + id)).json();
  assert.equal(back.filed.grade.score, 4); assert.deepEqual(back.filed.data.ws.missing, ["sops"]); assert.equal(back.filed.followups.length, 1);
});

test("the next audit of the ship: the follow-up still open, '2nd time', fixed or carried", async () => {
  const t = setup();
  const id1 = await completeRequest(t, "SC-1");
  const v1 = await (await t.call("GET", "/api/audit/visit?id=" + id1)).json();
  const d1v = cleanVisit(v1); d1v.ws.missing = ["sops"]; d1v.ov.followup = { owner: "Ray", due: "2099-01-01", text: "Resend the SOPs folder" };
  assert.equal((await (await t.call("POST", "/api/audit/request/grade", { id: id1, visit: d1v })).json()).ok, true);
  const id2 = await completeRequest(t, "SC-2");
  const v2 = await (await t.call("GET", "/api/audit/visit?id=" + id2)).json();
  assert.deepEqual(v2.followups.map((f) => [f.text, f.owner, f.carried]), [["Resend the SOPs folder", "Ray", 0]]);
  assert.deepEqual(v2.previous.missing, ["sops"]); assert.equal(v2.previous.sameCrew, false); assert.deepEqual(v2.previous.ppeMissing, [], "another crew's uniform is not his");
  const d2 = cleanVisit(v2); d2.ws.missing = ["sops"]; // still open, and missing again
  assert.equal((await (await t.call("POST", "/api/audit/request/grade", { id: id2, visit: d2 })).json()).ok, true);
  assert.deepEqual({ ...t.db.prepare("SELECT status, carried FROM audit_followup").get() }, { status: "open", carried: 1 });
  assert.deepEqual(JSON.parse(t.db.prepare("SELECT data_json FROM audit_visit_data WHERE request_id=?").get(id2).data_json).repeat, { sops: 2 });
  const id3 = await completeRequest(t, "SC-1");
  const v3 = await (await t.call("GET", "/api/audit/visit?id=" + id3)).json();
  assert.equal(v3.followups[0].carried, 1, "shown as the 2nd time");
  const d3 = cleanVisit(v3); d3.close[v3.followups[0].id] = "fixed";
  assert.equal((await (await t.call("POST", "/api/audit/request/grade", { id: id3, visit: d3 })).json()).ok, true);
  const f = t.db.prepare("SELECT status, closed_visit_id, closed_by FROM audit_followup").get();
  assert.equal(f.status, "fixed"); assert.ok(f.closed_visit_id); assert.equal(f.closed_by, "dexter.lawrence@dg3.com");
  assert.deepEqual((await (await t.call("GET", "/api/audit/visit?id=" + (await completeRequest(t, "SC-2")))).json()).followups, [], "fixed is no longer open");
});

test("photos: stored once per phone key, served back, refused before the documents are in or for a non-step", async () => {
  const t = setup();
  const r = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" })).json();
  const img = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const put = (id, q, type = "image/jpeg") => t.call("POST", "/api/audit/visit/photo?id=" + id + q, img, undefined, { "content-type": type, "x-taken-at": "2026-10-19T10:00:00Z" });
  assert.equal((await put(r.id, "&step=inventory&k=phonekey01")).status, 409, "not before the documents are in");
  t.db.prepare("UPDATE audit_request SET status='cancelled' WHERE id=?").run(r.id);
  const id = await completeRequest(t);
  assert.equal((await put(id, "&step=ratings&k=phonekey01")).status, 400);
  assert.equal((await put(id, "&step=inventory&k=bad")).status, 400);
  assert.equal((await put(id, "&step=inventory&k=phonekey01", "application/pdf")).status, 400);
  const a = await (await put(id, "&step=inventory&k=phonekey01")).json();
  const b = await (await put(id, "&step=inventory&k=phonekey01")).json();
  assert.equal(a.ok, true); assert.equal(b.id, a.id); assert.equal(b.dup, true, "a retry after a dropped signal is the same photo");
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM audit_file").get().n, 1);
  assert.equal(t.db.prepare("SELECT taken_at FROM audit_file").get().taken_at, "2026-10-19T10:00:00.000Z");
  const got = await t.call("GET", "/api/audit/visit/photo?f=" + a.id);
  assert.equal(got.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), img);
  assert.deepEqual((await (await t.call("GET", "/api/audit/visit?id=" + id)).json()).photos.map((p) => p.step), ["inventory"]);
  assert.equal((await t.call("GET", "/api/audit/visit?id=" + id, undefined, null)).status, 401, "behind the session (or the open site's)");
});

test("a TEST request is a rehearsal: no audit is filed on it", async () => {
  const t = setup();
  t.env.AUDIT_LIVE = undefined;
  const id = await completeRequest(t);
  const v = await (await t.call("GET", "/api/audit/visit?id=" + id)).json();
  assert.equal(v.test, true);
  const r = await t.call("POST", "/api/audit/request/grade", { id, visit: cleanVisit(v) });
  assert.equal(r.status, 409); assert.equal((await r.json()).error, "test_request");
});

/* ------------------------------------------------ P1 · the audit on the crew profile ------------------------------------------------ */
import { buildCrewProfile, feedbackFile } from "../src/crew_profile.js";
const PROFILE = (extra) => Object.assign({
  today: "2026-10-19",
  crew: { agency_id: "SC-0039935", status: "On board", first_name: "Kevin", last_name: "Jugao" }, override: null,
  snap: { agency_id: "SC-0039935", status: "On board", raw_status: "On board", vessel: "Azamara Pursuit", run_at: "2026-10-16T09:00:00Z", embarked_at: "2026-05-24", debarked_at: null },
  count: null, countAdded: 0, grade: null,
  legs: [{ ship: "Pursuit", sc: "SC-0039935", ours: true, on: "2026-05-24", off: "2026-10-31", is_current: true, source: "registry", offSource: "rita", brand: "Azamara" }],
  counter: [], edits: [], notes: [], ready: null, intel: [], fbReqs: [], fbResp: [], sbmRequests: [], sbm: [], cards: [], deploys: [], dismissals: [],
  statusRows: [], travel: [], activity: [], instr: [], links: [],
}, extra || {});
const AUDIT_ROW = { request_id: "ar_1", ship: "Pursuit", r_inventory: 3, r_technical: 4, r_collaterals: 5, r_overall: null, score: 4, score_from: "average", note: "Inventory management (3): OBP lags.\nTo improve: Book changes the same day.", filed_at: "2026-10-19T15:00:00.000Z",
  data_json: JSON.stringify({ ws: { missing: ["sops"] }, hw: { tools: { missing: ["head_lamp", "fiery_hdd"] } }, ov: { strengths: "Knows the C4070.", improve: "Book changes the same day.", agreed: "Count every Monday." } }) };

test("P1: a filed audit is on the profile's What people said, with the score, the boxes and the follow-up; Dexter's slot is his audit", () => {
  const p = buildCrewProfile(PROFILE({ audits: [AUDIT_ROW], auditFollowups: [{ request_id: "ar_1", owner: "Rolando", due: "2026-11-18", text: "MFD refresher", status: "open", closed_at: null }] }));
  const a = p.people.feed.find((f) => f.kind === "audit");
  assert.ok(a, "the audit is in the feed");
  assert.deepEqual([a.score, a.from, a.ratings.inventory, a.ship, a.request, a.missing], [4, "average", 3, "Pursuit", "ar_1", 3]);
  assert.deepEqual([a.strengths, a.improve, a.agreed, a.note], ["Knows the C4070.", "Book changes the same day.", "Count every Monday.", null], "the boxes, not the composed note, for an audit filed through the steps");
  assert.deepEqual(a.followups, [{ owner: "Rolando", due: "2026-11-18", text: "MFD refresher", status: "open", closed: null }]);
  const dx = p.people.slots.find((s) => s.role === "dexter");
  assert.deepEqual([dx.label, dx.state, dx.at], ["Dexter · Audit", "answered", "2026-10-19"]);
  // a 15 Oct grade (no steps): its note stands in for the boxes
  const old = buildCrewProfile(PROFILE({ audits: [Object.assign({}, AUDIT_ROW, { data_json: null })] })).people.feed.find((f) => f.kind === "audit");
  assert.equal(old.note, AUDIT_ROW.note); assert.equal(old.missing, null);
  // a request not yet audited: pending; nothing at all: the old feedback slot, untouched
  assert.equal(buildCrewProfile(PROFILE({ auditOpen: [{ id: "ar_2", sent_at: "2026-10-16T10:34:54Z" }] })).people.slots.find((s) => s.role === "dexter").state, "pending");
  assert.deepEqual(buildCrewProfile(PROFILE()).people.slots.find((s) => s.role === "dexter"), { role: "dexter", label: "Dexter · Field", state: "never", at: null });
});

test("P1: the internal crew file prints the audit under its contract; the crew-facing statement never reads the feed", () => {
  const p = buildCrewProfile(PROFILE({ audits: [AUDIT_ROW], auditFollowups: [{ request_id: "ar_1", owner: "Rolando", due: "2026-11-18", text: "MFD refresher", status: "fixed", closed_at: "2026-11-02T10:00:00Z" }] }));
  const f = feedbackFile(p, "2026-10-19");
  const it = f.groups.flatMap((g) => g.items).find((x) => x.kind === "audit");
  assert.equal(it.label, "Printshop Ops Audit");
  assert.deepEqual(it.tags, [["Score", "4/5"], ["Inventory", "3/5"], ["Technical", "4/5"], ["Collaterals", "5/5"], ["Ship", "Pursuit"]]);
  assert.deepEqual(it.lines.map((l) => l.label), ["Strengths", "To improve", "Agreed", "Follow-up"]);
  assert.match(it.lines[3].text, /^Rolando by 2026-11-18: MFD refresher \(fixed 2026-11-02\)$/);
  // the statement (crew-facing) is composed from contracts, documents and the bonus standing only — never people.feed
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const g = W.slice(W.indexOf("async function gatherStatement"), W.indexOf("\n}\n", W.indexOf("async function gatherStatement")));
  assert.ok(g.length > 100, "found gatherStatement");
  assert.doesNotMatch(g, /audit_eval|audit_visit|people\.feed/, "the crew's statement never reads an audit");
});

test("P1: the profile's data wave reads the audits with the rest (§12), never a TEST request's", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const one = W.slice(W.indexOf("async function apiCrewOne"), W.indexOf("async function apiCrewSave"));
  const at = one.indexOf("auditFuRes] = await Promise.all([");
  assert.ok(at > 0, "the audits ride the profile's one data wave");
  const wave = one.slice(at, one.indexOf("\n  ]);", at));
  assert.match(wave, /FROM audit_eval e .*COALESCE\(r\.test_mode, 0\) = 0/);
  assert.match(wave, /FROM audit_followup WHERE agency_id=\?/);
  assert.match(one, /audits: auditRes\.results, auditOpen: auditOpenRes\.results, auditFollowups: auditFuRes\.results/);
});

/* ------------------------------------------------ History · Follow-ups ------------------------------------------------ */
test("History: every filed audit, newest first, with what the filing wrote; a TEST request never; a 15 Oct grade says it has no steps", async () => {
  const t = setup();
  assert.deepEqual(await (await t.call("GET", "/api/audit/history")).json(), { today: new Date().toISOString().slice(0, 10), audits: [], followups: [] });
  const id1 = await completeRequest(t, "SC-1");
  const v1 = await (await t.call("GET", "/api/audit/visit?id=" + id1)).json();
  t.db.prepare("UPDATE audit_request SET complete_at=? WHERE id=?").run(new Date(Date.now() - 7200e3).toISOString(), id1);
  const d1v = cleanVisit(v1); d1v.ws.missing = ["sops"]; d1v.hw.tools.missing = ["fiery_hdd"]; d1v.crew.ppe.missing = ["shoes"]; d1v.crew.dispatch = 2;
  d1v.ov.followup = { owner: "Ray", due: "2099-01-01", text: "Resend the SOPs folder" };
  assert.equal((await t.call("POST", "/api/audit/visit/photo?id=" + id1 + "&step=inventory&k=phonekey01", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]), undefined, { "content-type": "image/jpeg" })).status, 200);
  assert.equal((await (await t.call("POST", "/api/audit/request/grade", { id: id1, visit: d1v })).json()).ok, true);
  // a grade filed on the 15 Oct screen (no steps): listed, and said so, never "nothing missing"
  const id2 = await completeRequest(t, "SC-2");
  assert.equal((await (await t.call("POST", "/api/audit/request/grade", { id: id2, inventory: 3, technical: 3, collaterals: 4, note: "Counts from the printer, not the shelf." })).json()).ok, true);
  t.db.prepare("UPDATE audit_eval SET filed_at=? WHERE request_id=?").run(new Date(Date.now() + 60e3).toISOString(), id2);
  const H = await (await t.call("GET", "/api/audit/history")).json();
  assert.deepEqual(H.audits.map((a) => a.id), [id2, id1], "newest first");
  const a1 = H.audits[1];
  assert.deepEqual([a1.ship, a1.sc, a1.crew, a1.score, a1.from, a1.steps, a1.photos], ["Oasis", "SC-1", "John Gorre", 4, "average", true, 1]);
  assert.deepEqual(a1.ratings, { inventory: 4, technical: 5, collaterals: 5, overall: null, dispatch: 2 }, "the dispatch rating is shown, it was never in the score");
  assert.deepEqual(a1.missing, { ws: ["sops"], tools: ["fiery_hdd"], ppe: ["shoes"] });
  assert.deepEqual(a1.followups, { open: 1, fixed: 0 });
  assert.ok(a1.openedAt && a1.openedAt < a1.filedAt, "the visit's two stamps");
  const a2 = H.audits[0];
  assert.deepEqual([a2.steps, a2.missing, a2.score, a2.ratings.dispatch], [false, null, 3, null]);
  assert.deepEqual(H.followups.map((f) => [f.text, f.owner, f.status, f.ship, f.crew, f.carried, f.request]), [["Resend the SOPs folder", "Ray", "open", "Oasis", "John Gorre", 0, id1]]);
  // a request turned into a TEST one is a rehearsal: off the history, its follow-up too
  t.db.prepare("UPDATE audit_request SET test_mode=1 WHERE id=?").run(id1);
  const H2 = await (await t.call("GET", "/api/audit/history")).json();
  assert.deepEqual([H2.audits.map((a) => a.id), H2.followups.length], [[id2], 0]);
});

test("Follow-ups: closed from the list once, said who and when; the next audit no longer carries it; a TEST one is not found", async () => {
  const t = setup();
  const id1 = await completeRequest(t, "SC-1");
  const v1 = await (await t.call("GET", "/api/audit/visit?id=" + id1)).json();
  const d1v = cleanVisit(v1); d1v.ov.followup = { owner: "Rolando", due: "2099-11-15", text: "MFD refresher" };
  t.db.prepare("UPDATE audit_request SET complete_at=? WHERE id=?").run(new Date(Date.now() - 7200e3).toISOString(), id1);
  assert.equal((await (await t.call("POST", "/api/audit/request/grade", { id: id1, visit: d1v })).json()).ok, true);
  const fid = t.db.prepare("SELECT id FROM audit_followup").get().id;
  assert.equal((await t.call("POST", "/api/audit/followup/close", {})).status, 400);
  assert.equal((await t.call("POST", "/api/audit/followup/close", { id: "nope" })).status, 404);
  assert.equal((await t.call("GET", "/api/audit/followup/close")).status, 404, "a close is a POST");
  assert.equal((await t.call("POST", "/api/audit/followup/close", { id: fid }, null)).status, 401, "a session (open mode supplies one)");
  const ok = await (await t.call("POST", "/api/audit/followup/close", { id: fid }, { email: "Dexter.Lawrence@dg3.com", open: true })).json();
  assert.deepEqual([ok.ok, ok.closedBy], [true, "Dexter.Lawrence@dg3.com (open site, no sign-in)"]);
  assert.deepEqual({ ...t.db.prepare("SELECT status, closed_by, closed_visit_id FROM audit_followup").get() }, { status: "fixed", closed_by: "Dexter.Lawrence@dg3.com (open site, no sign-in)", closed_visit_id: null });
  const again = await t.call("POST", "/api/audit/followup/close", { id: fid });
  assert.deepEqual([again.status, (await again.json()).error], [409, "already_closed"], "closed once");
  const H = await (await t.call("GET", "/api/audit/history")).json();
  assert.deepEqual([H.followups[0].status, H.followups[0].closedOnVisit, H.audits[0].followups], ["fixed", false, { open: 0, fixed: 1 }]);
  const id2 = await completeRequest(t, "SC-2");
  assert.deepEqual((await (await t.call("GET", "/api/audit/visit?id=" + id2)).json()).followups, [], "the next audit of the ship no longer carries it");
  // a follow-up on a TEST request (a rehearsal) cannot be reached from the list
  t.db.prepare("UPDATE audit_followup SET status='open' WHERE id=?").run(fid);
  t.db.prepare("UPDATE audit_request SET test_mode=1 WHERE id=?").run(id1);
  assert.equal((await t.call("POST", "/api/audit/followup/close", { id: fid })).status, 404);
});

test("the home's two doors: the ships route counts the filed audits and the open follow-ups, TEST never (one wave)", async () => {
  const { installAudit } = await import("../src/audit_routes.js");
  const t = setup();
  const H = installAudit({ json, htmlResponse: (b) => new Response(b), ensureAudit: ensureAuditTables, applyOverride, logActivity: async () => {}, rotationSections: async () => BOARD, TODAY: () => "2026-10-19",
    crewProfile: async () => null, sendViaMailer: async () => ({ ok: true }) });
  const ships = async () => { const u = new URL("https://audit.cims.work/api/audit/ships"); return (await H(u.pathname, new Request(u), t.env, u, { email: "d@dg3.com" })).json(); };
  assert.deepEqual((await ships()).counts, { filed: 0, openFollowups: 0 });
  const id1 = await completeRequest(t, "SC-1");
  const v1 = await (await t.call("GET", "/api/audit/visit?id=" + id1)).json();
  const d1v = cleanVisit(v1); d1v.ov.followup = { owner: "Ray", due: "2099-01-01", text: "Labels on the presses" };
  t.db.prepare("UPDATE audit_request SET complete_at=? WHERE id=?").run(new Date(Date.now() - 7200e3).toISOString(), id1);
  assert.equal((await (await t.call("POST", "/api/audit/request/grade", { id: id1, visit: d1v })).json()).ok, true);
  assert.deepEqual((await ships()).counts, { filed: 1, openFollowups: 1 });
  t.db.prepare("UPDATE audit_request SET test_mode=1 WHERE id=?").run(id1);
  assert.deepEqual((await ships()).counts, { filed: 0, openFollowups: 0 });
  const src = readFileSync(new URL("../src/audit_routes.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("async function ships("), src.indexOf("async function brief("));
  assert.equal((body.match(/await /g) || []).length, 2, "ensureAudit, then ONE Promise.all (§12)");
});

test("the page: History and Follow-ups are routes, the doors are on the home, a close takes two taps", () => {
  const src = readFileSync(new URL("../src/audit_ui.js", import.meta.url), "utf8");
  for (const s of ['if (h === "hist") return historyView();', 'if (h === "fu") return followupsView();', 'data-go="hist"', 'data-go="fu"', '"/api/audit/followup/close"', 'b.classList.contains("sure")'])
    assert.ok(src.includes(s), s);
  return import("../src/audit_ui.js").then((m) => { new Function(m.AUDIT_HTML.split("<script>").slice(-1)[0].split("</script>")[0]); });
});
