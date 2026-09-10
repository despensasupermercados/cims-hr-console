import { test } from "node:test";
import assert from "node:assert/strict";
import { installAck } from "../src/signoff_ack.js";
import { installInstr } from "../src/signoff_instructions.js";
import { signToken, verifyToken } from "../src/auth.js";

// THE TWO PUBLIC SIGN-OFF ENDPOINTS. Until now: 444 lines, ZERO tests. (2026-09-10)
//
// Both are dispatched in worker.js BEFORE the `/api/` session gate, because the person clicking
// the link is a seafarer with no login. That makes the signed token the ONLY thing between the
// open internet and a crew member's name, vessel and sign-off date — and, on submit, the only
// thing that decides whose acknowledgement gets recorded and whose contract gets an email sent
// about it. They were the largest untested surface in the repo and the most exposed.
//
// They are near-identical by design (Email 1 = instructions at T-14, Email 2 = sign-off at T-7),
// so both are driven through the SAME table here. That is deliberate: if one ever drifts from the
// other on a security rule, this fails rather than leaving the weaker one unnoticed.

const SECRET = "test-secret-not-a-real-key";

// ---- a small in-memory D1 stand-in -----------------------------------------------------------
function fakeDb() {
  const rows = [];                 // ack_request / instr_ack rows
  const crew = { id: "crew_1", agency_id: "SC-1", first_name: "Ana", last_name: "Cruz", email: "ana@example.com" };
  const db = {
    rows,
    prepare(sql) {
      const stmt = { sql, args: [] };
      stmt.bind = (...args) => { stmt.args = args; return stmt; };
      stmt.run = async () => {
        if (/^DELETE FROM (ack_request|instr_ack)/.test(sql)) {
          const [sc, seq] = stmt.args;
          for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sc === sc && rows[i].seq === seq) rows.splice(i, 1);
        } else if (/^INSERT INTO (ack_request|instr_ack)/.test(sql)) {
          const [id, sc, seq, crew_id, token_hash, crew_name, vessel, port, sign_off_date, requested_by, requested_at] = stmt.args;
          rows.push({ id, sc, seq, crew_id, token_hash, status: "pending", crew_name, vessel, port, sign_off_date, requested_by, requested_at, ack_at: null });
        } else if (/^UPDATE (ack_request|instr_ack) SET status='acknowledged'/.test(sql)) {
          const th = stmt.args[stmt.args.length - 1];
          const r = rows.find((x) => x.token_hash === th);
          if (r) { r.status = "acknowledged"; r.ack_at = stmt.args[0]; }
        }
        return { meta: { changes: 1 } };
      };
      stmt.first = async () => {
        if (/FROM (ack_request|instr_ack) WHERE token_hash=\?/.test(sql)) return rows.find((x) => x.token_hash === stmt.args[0]) || null;
        if (/FROM keyman_contract3/.test(sql)) return { sc: stmt.args[0], seq: stmt.args[1], ship: "Reflection", proj_off: "2026-11-20", act_off: null };
        if (/FROM contract_edit/.test(sql)) return null;
        if (/FROM crew_override/.test(sql)) return null;
        if (/FROM crew WHERE agency_id=\?/.test(sql)) return crew;
        return null;
      };
      stmt.all = async () => ({ results: [] });
      return stmt;
    },
  };
  return db;
}

const sha256hex = async (s) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
};

function harness(install) {
  const sent = [];
  const deps = {
    json: (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } }),
    htmlResponse: (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } }),
    signToken, verifyToken, sha256hex,
    logActivity: async () => {},
    applyOverride: (base) => base,
    VESSEL_REF: [{ name: "Reflection", homeport: "Fort Lauderdale" }],
    sendViaMailer: async (env, envelope) => { sent.push(envelope); return { ok: true }; },
  };
  return { handle: install(deps), sent, env: { DB: fakeDb(), SESSION_SECRET: SECRET, MAILER: {} } };
}

const req = (method, body) => ({ method, url: "https://cims.work/x", json: async () => body, headers: { get: () => null } });
const GET = req("GET");

// Each variant: [label, installer, purpose, formPath, submitPath, requestPath]
const VARIANTS = [
  ["ack", installAck, "ack", "/api/ack/form", "/api/ack/submit", "/api/ack/request"],
  ["instr", installInstr, "instr", "/api/instr/form", "/api/instr/submit", "/api/instructions/request"],
];

for (const [label, install, purpose, formPath, submitPath, requestPath] of VARIANTS) {
  // Issue a real link the way the console does, and return its token.
  async function issue(h) {
    const r = await h.handle(requestPath, req("POST", { sc: "SC-1", seq: 1, send: true }), h.env, new URL("https://cims.work" + requestPath), { email: "rita@dg3.com" });
    const body = await r.json();
    assert.equal(body.ok, true, label + ": issuing the link should succeed");
    return new URL(body.link).searchParams.get("t");
  }

  test(label + ": the privileged issue route refuses an anonymous caller", async () => {
    const h = harness(install);
    const r = await h.handle(requestPath, req("POST", { sc: "SC-1", seq: 1 }), h.env, new URL("https://cims.work" + requestPath), null);
    assert.equal(r.status, 401, "issuing a link must require a session — it emails a seafarer and exposes their data");
    assert.equal(h.env.DB.rows.length, 0, "nothing may be written for an unauthenticated caller");
  });

  test(label + ": form with no token / junk token -> 401, never a crew record", async () => {
    const h = harness(install);
    for (const t of ["", "garbage", "a.b", "..", "x".repeat(200)]) {
      const r = await h.handle(formPath, GET, h.env, new URL("https://cims.work" + formPath + "?t=" + encodeURIComponent(t)));
      assert.equal(r.status, 401, label + ": token " + JSON.stringify(t) + " must be rejected");
      const b = await r.json();
      assert.ok(!b.crew_name, "a rejected request must not leak a crew name");
    }
  });

  test(label + ": a TAMPERED signature is rejected", async () => {
    const h = harness(install);
    const t = await issue(h);
    const [body] = t.split(".");
    const forged = body + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const r = await h.handle(formPath, GET, h.env, new URL("https://cims.work" + formPath + "?t=" + encodeURIComponent(forged)));
    assert.equal(r.status, 401, "an unsigned/forged token must never resolve");
  });

  test(label + ": an EXPIRED token is rejected", async () => {
    const h = harness(install);
    const stale = await signToken({ p: purpose, sc: "SC-1", seq: 1, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
    const r = await h.handle(formPath, GET, h.env, new URL("https://cims.work" + formPath + "?t=" + encodeURIComponent(stale)));
    assert.equal(r.status, 401);
  });

  test(label + ": a token for the OTHER flow is rejected (purpose confusion)", async () => {
    // Both flows are signed with the SAME SESSION_SECRET. Only the `p` claim keeps them apart, so
    // an instructions token must not open a sign-off record, or vice versa.
    const h = harness(install);
    const other = purpose === "ack" ? "instr" : "ack";
    const wrong = await signToken({ p: other, sc: "SC-1", seq: 1, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);

    // ISOLATE THE PURPOSE CHECK. Seed a row under the foreign token's hash first. Without this the
    // request is rejected by the token_hash row lookup (no row = "revoked") and the test passes even
    // with the `p.p !== purpose` check deleted — it would pass for the wrong reason and guard nothing.
    // Verified: with the row seeded, removing the purpose check makes this test fail.
    h.env.DB.rows.push({ id: "seeded", sc: "SC-1", seq: 1, crew_id: "crew_1", token_hash: await sha256hex(wrong),
      status: "pending", crew_name: "Ana Cruz", vessel: "Reflection", port: "Fort Lauderdale",
      sign_off_date: "2026-11-20", requested_by: "test", requested_at: "2026-09-10", ack_at: null });

    const r = await h.handle(formPath, GET, h.env, new URL("https://cims.work" + formPath + "?t=" + encodeURIComponent(wrong)));
    assert.equal(r.status, 401, "a validly-signed token from the other flow must not be accepted here");
    assert.equal((await r.json()).error, "invalid_or_expired", "it must be the PURPOSE check rejecting it, not the row lookup");
  });

  test(label + ": a token signed with a DIFFERENT secret is rejected", async () => {
    const h = harness(install);
    const foreign = await signToken({ p: purpose, sc: "SC-1", seq: 1, exp: Math.floor(Date.now() / 1000) + 600 }, "some-other-secret");
    const r = await h.handle(formPath, GET, h.env, new URL("https://cims.work" + formPath + "?t=" + encodeURIComponent(foreign)));
    assert.equal(r.status, 401);
  });

  test(label + ": re-issuing in the SAME SECOND returns the identical link (known, harmless)", async () => {
    // The token payload is {p, sc, seq, exp} with NO nonce, and exp has one-second resolution, so
    // two issues inside the same second are byte-identical. Documented rather than "fixed": the
    // row is deleted and re-inserted under the same hash, so the link keeps working and it is
    // always the same crew and the same leg. Nothing is leaked and nothing breaks. Worth pinning
    // because it makes the revocation guarantee below conditional on the clock advancing — if a
    // nonce is ever added, this test should flip to asserting the two differ.
    const h = harness(install);
    const realNow = Date.now;
    let first, second;
    // Frozen, not merely "fast": relying on both issues landing inside the same wall-clock second
    // makes the test flaky roughly once per second of real time.
    try { const t0 = realNow(); Date.now = () => t0; first = await issue(h); second = await issue(h); }
    finally { Date.now = realNow; }
    assert.equal(first, second, "same second + no nonce = same token");
    assert.equal(h.env.DB.rows.length, 1, "re-issuing must still leave exactly one live row");
  });

  test(label + ": a SUPERSEDED link is dead once a new one is issued", async () => {
    // Re-issuing deletes the row and stores a new token hash. The old token still verifies
    // cryptographically, so the DB row is what actually revokes it. That must hold.
    // The clock is advanced so the second issue really is a DIFFERENT token (see the test above).
    const h = harness(install);
    const first = await issue(h);
    const realNow = Date.now;
    let second;
    try { Date.now = () => realNow() + 5000; second = await issue(h); } finally { Date.now = realNow; }
    assert.notEqual(first, second, "a later issue must mint a different token");
    assert.equal(h.env.DB.rows.length, 1, "re-issuing must leave exactly one live row for the leg");

    const ok = await verifyToken(first, SECRET);
    assert.ok(ok, "the old token is still a valid signature — revocation must come from the row");

    const r = await h.handle(formPath, GET, h.env, new URL("https://cims.work" + formPath + "?t=" + encodeURIComponent(first)));
    assert.equal(r.status, 401, "the superseded link must be dead");
    assert.equal((await r.json()).error, "revoked");
  });

  test(label + ": a valid link returns only the seafarer's own record", async () => {
    const h = harness(install);
    const t = await issue(h);
    const r = await h.handle(formPath, GET, h.env, new URL("https://cims.work" + formPath + "?t=" + encodeURIComponent(t)));
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.equal(b.ok, true);
    assert.equal(b.crew_name, "Ana Cruz");
    assert.equal(b.vessel, "Reflection");
    assert.equal(b.locked, false);
    assert.ok(!("email" in b), "the response must not echo the crew email back to the browser");
  });

  test(label + ": submit records once and is idempotent — no second notification", async () => {
    const h = harness(install);
    const t = await issue(h);
    const before = h.sent.length;

    const r1 = await h.handle(submitPath, req("POST", { t }), h.env, new URL("https://cims.work" + submitPath));
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).ok, true);
    assert.equal(h.env.DB.rows[0].status, "acknowledged");
    assert.ok(h.env.DB.rows[0].ack_at, "the acknowledgement must be timestamped");
    const afterFirst = h.sent.length;
    assert.equal(afterFirst, before + 1, "exactly one confirmation goes out");

    const r2 = await h.handle(submitPath, req("POST", { t }), h.env, new URL("https://cims.work" + submitPath));
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).already, true, "a repeat submit reports already-done");
    assert.equal(h.sent.length, afterFirst, "a repeat submit must NOT notify Crew Ops again");
  });

  test(label + ": submit with a junk token records nothing", async () => {
    const h = harness(install);
    await issue(h);
    const r = await h.handle(submitPath, req("POST", { t: "not-a-token" }), h.env, new URL("https://cims.work" + submitPath));
    assert.equal(r.status, 401);
    assert.equal(h.env.DB.rows[0].status, "pending", "a rejected submit must leave the record untouched");
  });

  test(label + ": an unrelated path is not claimed by this module", async () => {
    const h = harness(install);
    assert.equal(await h.handle("/api/crew", GET, h.env, new URL("https://cims.work/api/crew"), { email: "x@dg3.com" }), null);
  });
}
