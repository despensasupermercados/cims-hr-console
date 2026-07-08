# Audit tab — console integration (cims-hr-console)

This lands the Audit feature **inside** `cims.work` (I1/I11) as a console tab that proxies to the
separate `cims-audit-pipeline` worker (I2). It is a **schema-adjacent + money-adjacent** change,
so per `CLAUDE.md` §1/§4/§5 it ships as a **PR reviewed by Miguel**, validated on **staging first**,
and never auto-merged.

## Files added (non-destructive)
- `src/audit_proxy.js` — the session-gated proxy (`apiAudit`). All logic stays in the worker; this
  only forwards with `X-CIMS-Reviewer/Money/Role` over the `AUDIT` service binding. No secret (§13).
  (Named `_proxy` to avoid colliding with any existing console module.)
- `public/cims-audit-tab.html` — Dashboard / New audit / Review UI (§B2).

## Four surgical edits to `src/worker.js` (all inside the existing error-boundary wrapper, §11)

**1. Import** (with the other module imports):
```js
import { apiAudit } from "./audit_proxy.js";
```

**2. Nav button** — in the `<nav>` block, after the existing buttons:
```html
<button id=nav-audit onclick="show('audit')">Audit</button>
```

**3. View mount** — add the Audit view container where the other tab `<div>`s live; mount the
`public/cims-audit-tab.html` body (or `<iframe src="/cims-audit-tab.html">` for a first cut).

**4. API route** — inside the `/api/` dispatch, INSIDE the `return await (async () => {…})()` wrapper:
```js
if (p === "/api/audit" || p.startsWith("/api/audit/")) return apiAudit(request, env, session);
```
`session` is the object from the existing `getSession(request, env)`; `apiAudit` re-checks it (401 if absent).

## `wrangler.toml` — add the service binding
```toml
[[services]]
binding = "AUDIT"
service = "cims-audit-pipeline"
```
(Add the same under `[env.staging]` pointing at `cims-audit-pipeline-staging`.)

## Prod schema migration
The audit tables are already applied to **staging** (`cims-hr-console-staging`). After PR review,
apply to prod once (human-run money-safety gate), from the `cims-audit-pipeline` repo:
```
wrangler d1 migrations apply cims-hr-console --remote
```

## The bonus prefill (SEPARATE money-change PR — not in this one)
`supervisor_eval` maps onto the Score Card `sEval` (3/4/5 → 15 pts; 1/2 → 0 + `eval_below_3` gate,
see `BONUS_STRUCTURE.md`). Wiring the audit's settled eval into the Score Card prefill is a money-path
change → its **own** PR with golden-test coverage + Miguel's approval (`CLAUDE.md` §1). The read it
consumes already exists: `GET /api/audit/eval?contract_id=…` → latest **settled** eval. The audit never
writes `bonus_outcome`.

## Definition of Done to verify on staging (§14/§B7)
- Audit tab mounts with sub-nav Dashboard / New audit / Review (I1/I11).
- 5 KPIs from `/api/audit/summary`; "Needs you" shows client approvals AND eval confirms.
- Records table filters + export (role-gated + logged, §13); row → detail drawer.
- Submit commits, returns `eval_status`; 1–2 → `pending_confirm`, excluded from the bonus read (I8).
- Client email never auto-sends; crew/shoreside auto-release 24h; `client_flag` escalates (I7/I9).
- Verify **live**, not just committed (`CLAUDE.md` §9): hit `/api/audit/summary` on the staging URL.
