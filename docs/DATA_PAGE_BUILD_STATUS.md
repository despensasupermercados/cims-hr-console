# Data Page Redesign — Build Status (live tracker)

_Companion to `docs/DATA_PAGE_REDESIGN_DECISIONS.md`. Short, updated as the build ships._

## Step 1 — Branded crew-import UI ✅ MERGED TO PROD (2026-07-14)
- PR **#50** (`feat/crew-import-brand-ui`) merged to `main` → prod via Workers Builds.
- Swapped `src/crew_import_ui.js` for the CIMS-branded, cart-layout, auto-detect page settled
  with Miguel (decisions R1–R5). UI-only. Wired to the tested `/stage` + `/apply` endpoints.
- Served at `GET /api/crew/import` (session-gated).

## Step 2 — Retire the OLD unsafe importer ✅ MERGED TO PROD (2026-07-15)
- PR **#52** (`feat/crew-import-step2`) merged to `main` (commit `145da01`); `tests` workflow green.
  Two apply-specs (CI rebuilt the large files via the apply-bot):
  - `apply/step2-retire-old-importer.json` → `src/worker.js`:
    1. `dstypeChanged()`: the Data tab's **Crew registry** data-type now embeds the reviewed
       importer (`/api/crew/import?embed=1`), mirroring how **Vessel** embeds the relief loader.
       The old drag-drop → parse → preview → apply chain is unreachable from the UI.
    2. `POST /api/crew/import` (legacy route): **neutralized** — previously called `apiCrewImport`,
       which upserted `crew` INCLUDING `vessel_observed` (wrote ship allocation directly — the D1
       violation). Now returns `retired_use_reviewed_importer` and writes nothing.
  - `apply/step2-embed-mode.json` → `src/crew_import_ui.js`: embed mode — when loaded with
    `?embed=1` the page drops its own sidebar/accent so it sits cleanly inside the Data tab.
- **Result — ONE DOOR:** Data → Upload data → Crew registry shows OUR branded reviewed importer
  inline. Only safe write paths remain (`/stage` + `/apply`); ship never written; logged; idempotent.
- Prod visual confirmation: pending Miguel's eyeball (browser can't auth; staging login not set up,
  so validation is on the prod console where Miguel is already signed in).

### Follow-up cleanup (low priority)
- `apiCrewImport` function definition still exists at `worker.js:~749` but is now **dead code**
  (no route calls it). Safe to delete in a later cleanup once confirmed unused.

## Carry-over
- [ ] Make `cims-hr-console` repo PRIVATE (governance; ~Aug 27 reminder).
- [ ] Optionally restrict `/apply` to MONEY_USERS at the worker gate.
- [ ] (Optional) Stand up real staging auth (seed users + login email/secret) to make staging a
      usable interactive test env. Miguel + Rita already seeded into staging `users`.
