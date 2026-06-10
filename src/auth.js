// Auth primitives — stateless HMAC-SHA256 signed tokens (Web Crypto).
// Pure and runtime-agnostic: works in Cloudflare Workers and Node 18+.
// The Worker imports these; the test suite pins them.

function b64url(buf) {
  let s = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signToken(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return body + "." + b64url(sig);
}
export async function verifyToken(token, secret) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [body, sig] = parts;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig),
      new TextEncoder().encode(body));
    if (!ok) return null;
    let payload; try { payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))); } catch { return null; }
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null; // malformed token must never throw -> clean 401, not a 500
  }
}

// Case-insensitive allowlist check. Mirrors the DB lookup `lower(email)=lower(?)`.
// Keeps the membership rule pure and testable independent of D1.
export function emailAllowed(allowlist, email) {
  if (!email) return false;
  const want = String(email).trim().toLowerCase();
  return allowlist.some(e => String(e).trim().toLowerCase() === want);
}
