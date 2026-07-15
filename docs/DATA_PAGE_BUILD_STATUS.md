# Data Page Redesign — Build Status (live tracker)

_Companion to `docs/DATA_PAGE_REDESIGN_DECISIONS.md`. Short, updated as the build ships._

## Step 1 — Branded crew-import UI ✅ MERGED TO PROD (2026-07-14)
- PR **#50** (`feat/crew-import-brand-ui`) merged to `main` → prod via Workers Builds.
- Swapped `src/crew_import_ui.js` for the CIMS-branded, cart-layout, auto-detect page settled
  with Miguel (decisions R1–R5). UI-only; `worker.js` and all logic/money modules untouched.
- Wired to the existing tested endpoints `/api/crew/import/stage` + `/apply`. Ship allocation
  still never written. 27/27 tests green; module imports clean.
- Served at `GET /api/crew/import` (session-gated).

### Staging note
- Staging (`cims-hr-console-staging`) had an EMPTY `users` table → login impossible → every
  request to the gated importer returned `{"error":"unauthorized"}`. This is the auth gate
  working, not a bug. Seeded `user_miguel` + `user_rita` into staging `users` while diagnosing.
- Staging still lacks working passwordless-login email/secret config, so staging is not a usable
  interactive test env yet. Because Step 1 is UI-only (backend already staging-validated), we
  validated on PROD after merge (drop → review → Discard, no write). Making staging a real test
  env is a separate, optional infra task.

## Step 2 — Retire the OLD unsafe importer 🔜 IN PROGRESS
- A second, uncoordinated crew importer is embedded in `worker.js` (the main SPA `APP_HTML`),
  reachable from the Data tab. It bypasses the safe stage/review flow and was shown to write ship
  allocation directly (violates D1). Goal: one door only.
- Plan: locate its exact block in `worker.js`, then a MINIMAL surgical edit to point the Data tab
  at `/api/crew/import` (link/iframe) and remove the old Apply path. Staging-safe → prod.

## Carry-over
- [ ] Make `cims-hr-console` repo PRIVATE (governance; ~Aug 27 reminder).
- [ ] Optionally restrict `/apply` to MONEY_USERS at the worker gate.
