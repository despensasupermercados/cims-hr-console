# Crew Import “Review & Apply” — wiring & staging runbook

The feature code is merged as **inert, additive modules**. This doc is the ONLY remaining
step: register three routes, surface the loader in the console, and validate on **staging**
before prod. Nothing here runs against production data until step 4 passes.

## Modules (already on the branch)
- `src/crew_review.js` — pure tier classifier (tested)
- `src/crew_apply.js` — pure apply planner; `vessel_observed` can never be written (tested)
- `src/crew_import_routes.js` — `crewImportPage` / `apiCrewImportStage` / `apiCrewImportApply`
- `src/crew_import_ui.js` — `CREW_IMPORT_HTML` (drag-drop review screen)
- Tests: `test/crew_review.test.js`, `test/crew_apply.test.js`, `test/crew_import_routes.test.js` (23 cases)

## The three routes (all session-gated, like `/api/relief/deploy`)
| Method | Path | Handler | Writes? |
|--------|------|---------|---------|
| GET  | `/api/crew/import`        | `crewImportPage()`      | no |
| POST | `/api/crew/import/stage`  | `apiCrewImportStage`    | **no** (diff only) |
| POST | `/api/crew/import/apply`  | `apiCrewImportApply`    | yes — crew UPDATE/INSERT + import_run + sync_conflict, one D1 batch, idempotent by file_hash |

## 1. Register (surgical edit — mirror the relief dispatch)
Routes are dispatched the same way `/api/relief/deploy` is (see `src/relief_api.js`). Add the
three checks in that same router, **inside the §11 error-boundary wrapper**, gated by the same
session check the relief routes use. Import at the top of the dispatch module:
```js
import { crewImportPage, apiCrewImportStage, apiCrewImportApply } from "./crew_import_routes.js";
```
Then, next to the other `/api/...` checks:
```js
if (p === "/api/crew/import"       && request.method === "GET")  return crewImportPage();
if (p === "/api/crew/import/stage" && request.method === "POST") return apiCrewImportStage(request, env);
if (p === "/api/crew/import/apply" && request.method === "POST") return apiCrewImportApply(request, env);
```
Do **not** re-inline any logic into `worker.js`; keep it delegated (§3). Restrict `/apply` to
`MONEY_USERS` (Miguel + Rita) — it mutates crew.

## 2. Surface in the console
Add a **Data → Upload data → “Crew registry (TDG AdvancedQuery)”** entry that embeds
`/api/crew/import` in an iframe, exactly like the “Vessel deployment” loader.

## 3. Test gate
`npm test` must stay green (adds 23 cases). Do not weaken a test to pass (§2).

## 4. STAGING first (CLAUDE.md §4) — mandatory before prod
1. `npm run deploy:staging` (test → migrate staging → deploy to staging Worker).
2. On the **staging** console, drag in a recent AdvancedQuery export.
3. Verify: ship changes appear under “ship” and are **flagged, never written**; certs default
   accept; a hand-set `crew_override` field shows as “your manual entry” and stays on Apply;
   re-dropping the same file says “already processed.”
4. Confirm rows in `import_run` and `sync_conflict` on staging D1; confirm no `crew.vessel_observed`
   changed for a flagged keyman.

## 5. Promote + verify live (§9)
Merge to `main` → Workers Builds deploys. Then hit the live `/api/crew/import` and run one real
file end-to-end; confirm the same invariants on prod D1. A green commit is not a deploy.

## Rollback
Routes are additive and delegated — remove the three registration lines to fully disable; the
modules become dead code again. No schema migration is required for this feature (it uses the
existing `import_run` / `sync_conflict` tables).
