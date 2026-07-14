# Crew Registry Import — “Review & Apply” (canonical reference)

_The single source of truth for the weekly TDG crew import feature: what it is, when and how to
use it, how it's built, why it's built that way, and how to extend it. Read this before touching
the crew-import code or the staging deploy. Companion docs: `DEPLOY_AND_VALIDATE.md` (how to ship),
`CREW_IMPORT_DECISIONS.md` (decision log)._

## 1. What it is
A human-in-the-loop importer for the weekly **TDG “AdvancedQuery”** crew export (an `.xls` of ~99
seafarers: identity, status, vessel, and document expiries — medical, SIRB/BDOS, passport, Schengen,
US visa). Instead of silently overwriting the roster, it stages the file, shows Rita a **diff grouped
by tier**, and only writes what she approves. Served at **`GET /api/crew/import`**.

## 2. When to use it
Every time TDG sends a refreshed AdvancedQuery file (weekly or ad-hoc). Rita drops the file in, reviews
the changes, and applies. Re-dropping the same file is a safe no-op (idempotent by file hash).

## 3. How to use it (Rita's flow)
1. Open the Crew registry loader (Data → Upload → “Crew registry (TDG AdvancedQuery)”, or `/api/crew/import`).
2. Drag in the AdvancedQuery `.xls`. It parses in the browser and shows a review — **nothing is saved yet.**
3. Work top-down: **⛓ ship** conflicts, **🔴 needs-you** (status / your manual edits), **🟡 certificates**,
   **➕ new crew**, **🚪 departed**. Certificates are pre-accepted; ship changes default to keeping yours.
4. Press **Apply**. You get a summary; changes are logged to `import_run` + `sync_conflict`.

## 4. The authority model (the core idea)
Two domains, opposite owners:
- **Certificates** (medical, SIRB/BDOS, passport, visas) — **TDG is trusted.** Default **Accept**.
- **Ship allocation** (`vessel_observed`) — **Rita owns it, always.** The file's ship is a lagging record
  of her decisions, so the import **never writes it** — a mismatch becomes a flag resolved on the board.

## 5. Decisions (enforced in code — do not silently change)
- **D1** Import NEVER writes `vessel_observed`. Ship change → `sync_conflict` flag only. Enforced twice:
  in `crew_apply` (filtered + counted as `droppedShipWrites`) and in `crew_import_routes` (`CREW_WRITABLE`
  whitelist excludes it).
- **D2** Certificates default Accept; an expiry moving **earlier** is flagged for a look.
- **D3** A change to a field with a **live** `crew_override` defaults **Keep**; both keep and accept write an
  audit `sync_conflict` (resolved=1). Overrides always win at read (`override.js`).
- **D4** Crew absent from the file are **flagged**, never auto-removed/inactivated.
- **D5** Selective friction: only ship / status / override / earlier-expiry demand attention; minor hygiene
  auto-applies. (An approval that fires on every trivial row trains rubber-stamping.)

## 6. Architecture (thin Worker glue over pure, tested modules)
- `src/crewimport.js` — `mapRow` (tolerant header → fields), `normalizeDate/Status`, `diffCrew` (add/change/
  unchanged/needsStatus). **`mapRow` must match the EXPIRATION column, not the NO column** (see §8).
- `src/crew_review.js` — `buildReview(diff, existing, incoming, overrides)` → tiers
  (ship_flag / override_conflict / critical / cert / minor / new / departed) + counts + attention count.
- `src/crew_apply.js` — `buildApplyPlan(review, decisions, meta)` → side-effect-free plan
  (crewUpdates / newCrew / sync_conflict rows / import_run summary). Pure, so it's unit-tested.
- `src/crew_import_routes.js` — `handleCrewImport(request, url, env)` (mirrors `relief_api.handleRelief`):
  `GET /api/crew/import` (UI), `POST /api/crew/import/stage` (diff, writes nothing),
  `POST /api/crew/import/apply` (one D1 batch; idempotent by `import_run.file_hash`).
- `src/crew_import_ui.js` — `CREW_IMPORT_HTML` drag-drop review screen (SheetJS, mirrors `relief_deploy.js`).
- Reuses existing `override.js` (merge) and `compliance.js` (expiry report).
- Tables (all pre-existing): `crew`, `crew_override`, `import_run`, `sync_conflict`, `agency` (FK for new crew).

## 7. Wiring
`worker.js` delegates two lines inside the session-gated API dispatch (mirroring `handleRelief`):
```
import { handleCrewImport } from "./crew_import_routes.js";
...
if (session) { const ci = await handleCrewImport(request, url, env); if (ci) return ci; }
```
Edit `worker.js` ONLY via the web editor or an `apply/*.json` spec — never a whole-file connector push.

## 8. The `mapRow` expiry trap (regression guard)
The AdvancedQuery layout runs `‹DOC› NO`, `‹DOC› ISSUE`, `‹DOC› EXPIRATION`, `‹DOC› PLACE` side by side.
A loose substring (`"medical"`, `"passport"`…) matches the **NO** column first, so every expiry imports as
`null` — silently defeating the whole certificate purpose. `mapRow` must use specific `"‹doc› expiration"`
patterns first. Locked by `test/crewimport_headers.test.js`. Do not loosen these patterns.

## 9. Safety invariants
- Ship (`vessel_observed`) is never written by the import (D1, enforced in two layers).
- Manual `crew_override` values are protected (D3) and always win at read.
- Apply is one transactional D1 batch, idempotent by file hash (re-drop = no-op).
- New-crew INSERT relies on `agency.code = 'TDG'` existing (it does on prod). Validated on staging.

## 10. Validation status (2026-07-13)
- Pure logic: 27/27 tests green.
- DB layer: exercised against the **staging D1** — new-crew INSERT satisfies the `agency` FK and all
  constraints; a ship change is flagged not written; cert accepted; `import_run`/`sync_conflict` logged.
- `mapRow` expiry fix verified against real headers.
- End-to-end HTTP/UI: validated on the staging Worker (`cims-hr-console-staging`).

## 11. How to extend
- **New document type:** add its `‹doc›_exp` to `mapRow` (specific “expiration” pattern), to `TRACK` in
  `diffCrew`, and to `CERT_FIELDS` in `crew_review`. It flows through as a cert tier automatically.
- **Change what needs review:** edit the tier rules in `crew_review.classifyField` (that function IS the
  safety policy). Add a test.
- **Always** ship via `DEPLOY_AND_VALIDATE.md`: branch → test → deploy-staging button → validate → merge.

## 12. Open items
- Merge PR #38 to prod (after staging dress rehearsal), then verify live.
- Add the console Data-page iframe entry (cosmetic; route already serves the UI).
- Optional: restrict `/api/crew/import/apply` to MONEY_USERS (Miguel + Rita).
- Parked: normalize credentials into a child table (only if crew count or doc types grow a lot).
- Governance (separate): make the repo private; separate CIMS from the Despensa GitHub/Cloudflare account.
