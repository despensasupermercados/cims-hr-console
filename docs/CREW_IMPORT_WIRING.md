# Crew Import “Review & Apply” — wiring & staging runbook

The feature code is on the branch as **inert, additive modules**. This doc is the ONLY remaining
step: register the router, surface the loader in the console, and validate on **staging** before
prod. Nothing here runs against production data until step 4 passes.

## Modules (already on the branch, 24 tests green)
- `src/crew_review.js` — pure tier classifier
- `src/crew_apply.js` — pure apply planner; `vessel_observed` can never be written
- `src/crew_import_routes.js` — exports `handleCrewImport(request, url, env)` (+ handlers)
- `src/crew_import_ui.js` — `CREW_IMPORT_HTML` (drag-drop review screen)

## Routes (via handleCrewImport, all session-gated like handleRelief)
| Method | Path | Writes? |
|--------|------|---------|
| GET  | `/api/crew/import`        | no |
| POST | `/api/crew/import/stage`  | **no** (diff only) |
| POST | `/api/crew/import/apply`  | yes — crew UPDATE/INSERT + import_run + sync_conflict, one D1 batch, idempotent by file_hash |

## 1. Wire it — a 2-line mirror of handleRelief (do NOT push worker.js whole-file)
`handleCrewImport` has the SAME shape as `relief_api.handleRelief` (returns a Response or null).
Edit `src/worker.js` in the GitHub web editor / github.dev (surgical, per §11 — never a whole-file
push). (a) Next to the existing relief import add:
```js
import { handleCrewImport } from "./crew_import_routes.js";
```
(b) Find where `handleRelief(` is called in the fetch dispatch (inside the §11 error-boundary
wrapper) — it looks like `const r = await handleRelief(request, url, env); if (r) return r;` —
and add the identical line right after it:
```js
const ci = await handleCrewImport(request, url, env); if (ci) return ci;
```
That's the whole wiring. Restrict `/api/crew/import/apply` to `MONEY_USERS` (Miguel + Rita) at
the same gate the other crew-mutating routes use.

## 2. Surface in the console
Add **Data → Upload data → “Crew registry (TDG AdvancedQuery)”** embedding `/api/crew/import`
in an iframe, exactly like the “Vessel deployment” loader.

## 3. Test gate
`npm test` must stay green (adds 24 cases). Do not weaken a test to pass.

## 4. STAGING first (CLAUDE.md §4) — mandatory before prod
1. `npm run deploy:staging`.
2. On the staging console, drag in a recent AdvancedQuery export.
3. Verify: ship changes appear under “ship” and are **flagged, never written**; certs default
   accept; a hand-set `crew_override` field shows “your manual entry” and stays on Apply;
   re-dropping the same file says “already processed.”
4. Confirm rows land in `import_run` + `sync_conflict` on staging D1, and that no
   `crew.vessel_observed` changed for a flagged keyman. Confirm a NEW-crew insert satisfies the
   NOT-NULL/CHECK constraints (this is the one thing only staging can prove).

## 5. Promote + verify live (§9)
Merge to `main` → Workers Builds deploys. Hit live `/api/crew/import`, run one real file
end-to-end, confirm the same invariants on prod D1. A green commit is not a deploy.

## Rollback
Remove the two `worker.js` lines to fully disable; the modules become dead code again. No schema
migration is needed (uses the existing `import_run` / `sync_conflict` tables).
