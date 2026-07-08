// Console-side Audit module for cims-hr-console (injected per CLAUDE.md §3 — do NOT inline in worker.js).
// This is the ONLY audit code in the console: a thin, session-gated proxy to the separate
// audit-pipeline Worker (I2). All audit LOGIC lives in that worker; the console never
// re-implements it. The service binding is the trust boundary (§13) — no shared secret.
//
// Wiring (see docs/AUDIT_INTEGRATION.md): worker.js dispatch adds, inside the error-boundary wrapper:
//     if (p === "/api/audit" || p.startsWith("/api/audit/")) return apiAudit(request, env, session);
// and wrangler.toml adds:  [[services]] binding = "AUDIT"  service = "cims-audit-pipeline"

// Money users (Miguel + Rita) — mirror of policy.js MONEY_USERS. They alone may confirm/override
// evals and release the client email (I7/I8). Keep in sync with policy.js; do not widen.
const MONEY_USERS = new Set(["miguel@cims.work", "rita@cims.work"]);

export async function apiAudit(request, env, session) {
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!env.AUDIT) return json({ error: "AUDIT binding missing" }, 500);

  const url = new URL(request.url);
  // strip the /api prefix — the worker serves /audit/*
  const target = "https://audit" + url.pathname.replace(/^\/api/, "") + url.search;

  const headers = new Headers(request.headers);
  headers.set("X-CIMS-Reviewer", session.email);
  headers.set("X-CIMS-Money", MONEY_USERS.has((session.email || "").toLowerCase()) ? "1" : "0");
  headers.set("X-CIMS-Role", session.role || "full");

  const init = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();

  // Forward to the audit-pipeline worker over the service binding.
  return env.AUDIT.fetch(new Request(target, init));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
