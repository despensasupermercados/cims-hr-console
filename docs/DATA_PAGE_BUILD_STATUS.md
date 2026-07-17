# Data Page Redesign — Build Status (live tracker)

_Companion to `docs/DATA_PAGE_REDESIGN_DECISIONS.md`. Short, updated as the build ships._

## ✅ COMPLETE — all steps merged to prod (2026-07-16)

| Step | PR | What shipped |
|------|----|--------------|
| 1 | #50 | Branded standalone importer page at `/api/crew/import` (cart layout, auto-detect, live cart) |
| 2 | #52 | **One door:** Data tab routed to the safe importer; legacy direct-write `POST /api/crew/import` neutralized (`retired_use_reviewed_importer`) — it used to write `vessel_observed` (D1 violation) |
| 3–4 | #54, #55 | Course corrections: removed embed/redirect approaches; moved the safe review + **live cart engine** (`cimsStage/cimsRender/cimsCart/cimsApply`) INLINE into the Data tab, talking only to `/stage` + `/apply` |
| 5 | #56 | **Data tab shell rebuilt** to the approved mockup: navy `#1B3A5C` sidebar, CIMS print-mark logo + green underline, "Cruise Industry Managed Services", nav, "A division of DG3" |
| 6 | #57 | **Upload data view rebuilt** to the mockup: "Upload data" h1 + lede, big branded dropzone, **NO data-type dropdown** — header-signature auto-detect (R3): crew → green "Recognized ✓ N/12 columns" band → staged review + cart; keyman/travel auto-detected; unknown → fail-safe amber band with explicit choose buttons; vessel via quiet link |

### The flow now (weekly TDG import)
Data → Upload data → drop the AdvancedQuery file → green Recognized band → tiered review
(ship flags / needs-you / certificates / new / departed) + navy "Ready to apply" cart with live
totals → Apply (or Discard). Ship allocation never written; idempotent by file hash; logged to
`import_run`; conflicts to `sync_conflict`.

### Notes / lessons (for future agents)
- The Data tab lives inside `worker.js` `APP_HTML` (template literal). Client code inserted there
  must contain NO backticks, NO dollar-brace, NO backslashes. Full-rebuild simulation +
  `node --check` locally BEFORE pushing the apply-spec is the reliable guard.
- "Redesign the page" meant the page IN PLACE — not a separate page, not an embed, not a redirect.
  Three iterations were burned learning this; don't repeat it.
- `import_run.file_hash` dedup: a file that was ever APPLIED will stage as `already_processed`.
  Use a fresh export to demo.
- Old client fns `previewImport`/`applyImport` and server fn `apiCrewImport` are now dead code —
  optional cleanup.

## Carry-over
- [ ] Make `cims-hr-console` repo PRIVATE (governance; ~Aug 27 reminder).
- [ ] Optionally restrict `/apply` to MONEY_USERS at the worker gate.
- [ ] Staging auth (users seeded; login email/secret config still missing) if a real test env is wanted.
