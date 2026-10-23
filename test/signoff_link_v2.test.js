// The 7-day sign-off link email and its page in the pass style, wired 23 Oct 2026 (Miguel: "all approved"): the email is
// hr.signoff.link.v2 (the pass, the four lines, one button), the row keeps the pass it showed, the page reads it back with
// the four lines and ONE button (no tick box), and nothing is recorded until the page's tap — the email's click confirms
// nothing. The T-7 switch stays off (auto_send.js is unchanged).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installAck, ACK_HTML } from "../src/signoff_ack.js";
import { signToken, verifyToken } from "../src/auth.js";

const OFF = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
const ON = new Date(Date.now() - 160 * 864e5).toISOString().slice(0, 10);
function fakeDb() {
  const rows = [];
  return { rows, prepare(sql) {
    const st = { sql, args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => {
      if (/^DELETE FROM ack_request/.test(sql)) { const [sc, seq] = st.args; for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sc === sc && rows[i].seq === seq) rows.splice(i, 1); }
      else if (/^INSERT INTO ack_request/.test(sql)) { const [id, sc, seq, crew_id, token_hash, crew_name, vessel, port, sign_off_date, requested_by, requested_at, pass_json] = st.args; rows.push({ id, sc, seq, crew_id, token_hash, status: "pending", crew_name, vessel, port, sign_off_date, requested_by, requested_at, pass_json, ack_at: null }); }
      else if (/^UPDATE ack_request SET status='acknowledged'/.test(sql)) { const r = rows.find((x) => x.token_hash === st.args[st.args.length - 1]); if (r) { r.status = "acknowledged"; r.ack_at = st.args[0]; } }
      return { meta: { changes: 1 } };
    };
    st.first = async () => {
      if (/FROM ack_request WHERE token_hash=\?/.test(sql)) return rows.find((x) => x.token_hash === st.args[0]) || null;
      if (/FROM ack_request WHERE sc=\?/.test(sql)) return null;
      if (/FROM crew_override/.test(sql)) return null;
      if (/FROM crew WHERE agency_id=\?/.test(sql)) return { id: "crew_k", agency_id: "SC-K", first_name: "Kevin Leif", last_name: "Jugao", email: "kevin@example.com", rank_observed: "Printer Specialist" };
      return null;
    };
    st.all = async () => ({ results: [] });
    return st;
  } };
}
const sha256hex = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
function harness() {
  const sent = [];
  const handle = installAck({
    json: (o, s = 200) => new Response(JSON.stringify(o), { status: s }), htmlResponse: (b) => new Response(b),
    signToken, verifyToken, sha256hex, logActivity: async () => {}, applyOverride: (b) => b, VESSEL_REF: [],
    ackContext: async () => ({ ship: "Pursuit", brand: "Azamara", on: ON, off: OFF, port: "BARCELONA, SPAIN" }),
    boardLegs: async () => [{ ours: true, sc: "SC-K", is_current: true, on: ON, off: OFF, ship: "Pursuit", disembark: "BARCELONA, SPAIN" }],
    sendViaMailer: async (env, e) => { sent.push(e); return { ok: true }; },
  });
  return { handle, sent, env: { DB: fakeDb(), SESSION_SECRET: "s", MAILER: {} } };
}
const req = (method, body) => ({ method, url: "https://cims.work/x", json: async () => body, headers: { get: () => null } });
const plain = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&middot;/g, "·").replace(/&ndash;/g, "–").replace(/\s+/g, " ");

test("the 7-day email is the pass: one week to go, the dates, the four lines, one button, reply to Rita", async () => {
  const h = harness();
  const r = await (await h.handle("/api/ack/request", req("POST", { sc: "SC-K", seq: 1, send: true }), h.env, new URL("https://cims.work/api/ack/request"), { email: "rita@dg3.com" })).json();
  assert.equal(r.ok, true); assert.equal(r.emailed, true);
  const e = h.sent[0];
  assert.equal(e.templateId, "hr.signoff.link.v2"); assert.deepEqual(e.to, ["kevin@example.com"]); assert.equal(e.replyTo, "Rita.Berenyi@dg3.com");
  assert.match(e.subject, /^One week to go · Confirm your sign-off · Azamara Pursuit · /);
  const t = plain(e.html);
  for (const s of ["One week to go, Kevin.", "PR", "via Barcelona", "Kevin Jugao", "Printer Specialist", "Confirm my sign-off", "Nothing is recorded until you tap it there."]) assert.ok(t.includes(s), s);
  assert.equal((e.html.match(/href="https:\/\/cims\.work\/ack\?t=/g) || []).length, 1, "one button");
  assert.equal(h.sent.length, 1, "the email's click confirms nothing; no confirmation went");
  assert.equal(h.env.DB.rows[0].status, "pending");
});

test("the page reads the pass the email showed, the four lines and one button; the tap records once, with its time", async () => {
  const h = harness();
  const r = await (await h.handle("/api/ack/request", req("POST", { sc: "SC-K", seq: 1, send: true }), h.env, new URL("https://cims.work/api/ack/request"), { email: "rita@dg3.com" })).json();
  const t = new URL(r.link).searchParams.get("t");
  const f = await (await h.handle("/api/ack/form", req("GET"), h.env, new URL("https://cims.work/api/ack/form?t=" + encodeURIComponent(t)), null)).json();
  assert.equal(f.ok, true); assert.equal(f.locked, false);
  assert.equal(f.pass.ship, "Azamara Pursuit"); assert.equal(f.pass.code, "PR"); assert.equal(f.pass.port, "Barcelona"); assert.equal(f.pass.name, "Kevin Jugao");
  assert.equal(f.pass.on, ON); assert.equal(f.pass.off, OFF); assert.match(f.pass.aboard, /^\d+ mo( \d+ d)?$/);
  assert.equal(f.confirms.length, 4); assert.match(f.confirms[0], /sign-off date and port above are right/);
  const s = await (await h.handle("/api/ack/submit", req("POST", { t }), h.env, new URL("https://cims.work/api/ack/submit"), null)).json();
  assert.equal(s.ok, true); assert.ok(s.ack_at);
  const again = await (await h.handle("/api/ack/submit", req("POST", { t }), h.env, new URL("https://cims.work/api/ack/submit"), null)).json();
  assert.equal(again.already, true); assert.equal(again.ack_at, s.ack_at);
  assert.equal(h.sent.filter((m) => m.templateId === "hr.signoff.ack-confirm.v1").length, 1, "the team is told once");
});

test("the page itself: the pass, one button, no tick box, nothing confirmed on load", () => {
  assert.doesNotMatch(ACK_HTML, /type="checkbox"|id="agree"/);
  assert.equal((ACK_HTML.match(/<button/g) || []).length, 1);
  assert.match(ACK_HTML, /SIGN-OFF PASS/); assert.match(ACK_HTML, /Confirm my sign-off/);
  const js = ACK_HTML.split("<script>")[1].split("</script>")[0];
  assert.doesNotThrow(() => new Function(js));
  assert.ok(js.indexOf("/api/ack/submit") > js.indexOf("$('go').onclick"), "the submit is only inside the button's tap");
  assert.match(js, /\/\^\\d\{4\}-\\d\\d-\\d\\d\$\//, "the date pattern survives the page string");
});

test("a row filed before the pass was kept still opens: the old fields, the four lines", async () => {
  const h = harness();
  const token = await signToken({ p: "ack", sc: "SC-K", seq: 1, exp: Math.floor(Date.now() / 1000) + 3600 }, "s");
  h.env.DB.rows.push({ id: "ack_old", sc: "SC-K", seq: 1, token_hash: await sha256hex(token), status: "pending", crew_name: "Kevin Leif Jugao", vessel: "Pursuit", port: "BARCELONA, SPAIN", sign_off_date: OFF, pass_json: null });
  const f = await (await h.handle("/api/ack/form", req("GET"), h.env, new URL("https://cims.work/api/ack/form?t=" + encodeURIComponent(token)), null)).json();
  assert.equal(f.ok, true); assert.equal(f.pass.name, "Kevin Leif Jugao"); assert.equal(f.pass.port, "Barcelona"); assert.equal(f.confirms.length, 4);
});
