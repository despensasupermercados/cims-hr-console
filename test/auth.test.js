// Auth gate tests: token integrity, tamper rejection, expiry, allowlist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken, emailAllowed } from "../src/auth.js";

const SECRET = "test-secret-please-rotate";

test("signed token round-trips and preserves payload", async () => {
  const t = await signToken({ p: "session", email: "Miguel.Sanmartin@dg3.com" }, SECRET);
  const v = await verifyToken(t, SECRET);
  assert.equal(v.p, "session");
  assert.equal(v.email, "Miguel.Sanmartin@dg3.com");
});

test("token signed with one secret fails under a different secret", async () => {
  const t = await signToken({ p: "session", email: "x@dg3.com" }, SECRET);
  assert.equal(await verifyToken(t, "wrong-secret"), null);
});

test("tampered payload is rejected", async () => {
  const t = await signToken({ p: "session", email: "ray@dg3.com" }, SECRET);
  const [body, sig] = t.split(".");
  // flip the body to a forged admin-ish payload, keep the old signature
  const forgedBody = Buffer.from(JSON.stringify({ p: "session", email: "attacker@evil.com" }))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(await verifyToken(forgedBody + "." + sig, SECRET), null);
});

test("expired token is rejected", async () => {
  const t = await signToken({ p: "fb", role: "ray", exp: Math.floor(Date.now() / 1000) - 1 }, SECRET);
  assert.equal(await verifyToken(t, SECRET), null);
});

test("unexpired token with future exp passes", async () => {
  const t = await signToken({ p: "fb", role: "ray", exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  const v = await verifyToken(t, SECRET);
  assert.equal(v.role, "ray");
});

test("malformed tokens return null, never throw", async () => {
  assert.equal(await verifyToken("", SECRET), null);
  assert.equal(await verifyToken("no-dot", SECRET), null);
  assert.equal(await verifyToken("a.b.c", SECRET), null);
  assert.equal(await verifyToken(null, SECRET), null);
});

test("allowlist is case-insensitive and trims", () => {
  const list = ["Miguel.Sanmartin@dg3.com", "Rita.Berenyi@dg3.com"];
  assert.equal(emailAllowed(list, "miguel.sanmartin@dg3.com"), true);
  assert.equal(emailAllowed(list, "  RITA.BERENYI@dg3.com "), true);
});

test("allowlist rejects non-members and empty input", () => {
  const list = ["Miguel.Sanmartin@dg3.com", "Rita.Berenyi@dg3.com"];
  assert.equal(emailAllowed(list, "ray.guerra@dg3.com"), false); // contributor, not a tool user
  assert.equal(emailAllowed(list, ""), false);
  assert.equal(emailAllowed(list, null), false);
});
