# Data Page Redesign — Build Status (live tracker)

_Companion to `docs/DATA_PAGE_REDESIGN_DECISIONS.md`. Short, updated as the build ships._

## ✅ COMPLETE — all steps merged to prod (final: 2026-07-17, PR #59)

| Step | PR | What shipped |
|------|----|--------------|
| 1 | #50 | Branded standalone importer page at `/api/crew/import` |
| 2 | #52 | **One door:** legacy direct-write `POST /api/crew/import` neutralized (it wrote `vessel_observed` — D1 violation) |
| 3–4 | #54, #55 | Course corrections; safe review + live cart engine moved INLINE into the Data tab (`/stage` + `/apply` only) |
| 5 | #56 | Data tab shell → navy CIMS sidebar, print-mark logo, "A division of DG3" |
| 6 | #57 | Upload view → mockup layout: h1 + big dropzone, NO dropdown, header-signature auto-detect (fail-safe chooser), keyman/travel detected, vessel via link |
| 7 | #59 | **Visual parity 1:1 with the approved mockup:** crew names + monospace IDs on cards, white icon chips, bold Outfit section headers + descriptions, monospace diffs with tag pills, icon-tile cart, green "Apply [N] updates →" with count chip, "Discard all", 🔒 lock. "Not this? Change type" opens an explicit type chooser. Zero logic changes. |

### The weekly flow (final)
Data → Upload data → drop AdvancedQuery → green "Recognized ✓ N/12 columns" band → named, tiered
review + navy live cart → Apply (or Discard). Ship never written; idempotent by file hash; logged.

### Pipeline lessons (IMPORTANT for future agents)
1. **APP_HTML constraint:** client code inserted into `worker.js` must contain NO backticks, NO
   dollar-brace, NO backslashes. Simulate the full rebuild locally + `node --check` BEFORE pushing.
2. **POISON-SPEC BUG (cost hours):** an apply-spec *insert* block whose OLD anchor is a substring
   of its own NEW replacement is **never skipped** by the idempotence check — every bot run
   re-applies it (duplicating code), and the duplicate then makes later specs hard-fail with
   "OLD occurs 2 times". **Rule: never write a block where `o ⊂ n`; anchor inserts on a
   neighboring line instead. And PRUNE consumed `apply/*.json` from every branch/PR** (they merged
   into main historically; branches cut from main inherit them; PR #59 pruned them all).
3. raw.githubusercontent caches ~5 min — don't diagnose "not applied" from a single stale fetch;
   confirm against branch commits.

### Dead code (optional cleanup, no urgency)
`apiCrewImport` (server), `previewImport`/`applyImport` (client) — unreferenced.

## Carry-over
- [ ] Make `cims-hr-console` repo PRIVATE (governance; ~Aug 27 reminder).
- [ ] Optionally restrict `/apply` to MONEY_USERS at the worker gate.
- [ ] Staging auth config if a real interactive test env is ever wanted.
