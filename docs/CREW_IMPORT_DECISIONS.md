# CIMS HR Console — Crew Import: Decisions & Logic (session memory)

_Captured from the 2026-07-13 design session. Companion to the `feat/crew-import-review` work.
Purpose: preserve the reasoning so no future agent or person re-litigates settled calls._

---

## A. What the system is (established facts)
- `cims-hr-console` = live Cloudflare Worker + D1 (`f0ac8b6a-…`), two operators (Miguel + Rita); crew never log in.
- The `AdvancedQuery.xls` is a **TDG export** and is already imported (crew table holds the roster).
- CIMS and Despensa currently share one GitHub org + one Cloudflare account.

## B. Assessment — corrected
- Early take ("flat sheet, rebuild as 3 tables") was aimed at the **export**, not the real schema. **Retracted.**
- Production `crew` is STRICT, ISO dates, no stored age, real PK, override layer, import_run + sync_conflict scaffolding. **Clean and appropriately scaled** for a 2-user console.
- **Normalization (child table + vessel FK) is PARKED** — revisit only if crew grows 5–10× or many doc types are added.

## C. Authority model (the core insight)
| Domain | Fields | Source of truth | Import behavior |
|--------|--------|-----------------|-----------------|
| Certificates | medical, BDOS/SIRB, passport, visas | **TDG** (agency keeps current) | Default **Accept** |
| Ship allocation | current ship / vessel_observed | **Rita** (she dictates placement) | **Never written** — flag only |

TDG's file lags Rita's real moves and is often wrong on ship placement — so its ship column is a lagging record of her decisions, not truth. "Current ship" also lives in two places: `crew.vessel_observed` (file) vs `ship_leg`/`assignment` (the board Rita runs); a disagreement between them is the high-value signal.

## D. Locked decisions
- **D1** Import NEVER writes ship allocation → mismatch becomes a flag resolved on the board. No "adopt agency" path.
- **D2** Certificates default Accept; an expiry moving **earlier** is flagged (still one click).
- **D3** A change to a field with a **live** crew_override defaults Keep; if accepted, logged (audit row
  records the manual value replaced) AND that one crew_override field is cleared — otherwise the manual
  value keeps winning on read and the accept never reaches the card (found 2026-09-05, SC-0038392).
  The clear is bound to the reviewed value; a manual edit made after staging is left alone.
- **D4** Nothing auto-deletes; crew absent from file → flagged for review.
- **D5** Selective friction: only ship / status / override / earlier-expiry demand attention; minor hygiene auto-applies. (An approval that fires on every trivial row trains rubber-stamping.)

## E. UX principles ("Review & Apply")
- Upload is a **proposal Rita ratifies** (Word tracked-changes model). Nothing saves until Apply.
- Diff is **per-field, not per-row**. Every change anchored to a human + ship. Trust cues: "nothing saved yet", live Apply count, Discard path, post-apply audit toast (import_run + file-hash dedup).

## F. Priorities (cost-of-delay)
1. **Make the repo PRIVATE** (was public) — highest priority, unrelated to the build.
2. **Crew import review** (this work) — finishes the import_run/sync_conflict scaffolding.
3. **Compliance view** — surface expired/expiring docs (engine already in compliance.js).
4. **Normalize schema** — parked.

## G. Build model / guardrails
- Claude writes code as **PRs Miguel approves** (crew/schema/money = human PR, CLAUDE.md §1/§5).
- New module ≤~15KB, connector-pushable. Never push worker.js whole-file — surgical route registration only. Mirror the proven relief_deploy.js loader.
- Staging D1 first (§4); verify live after deploy (§9).

## H. Open items
- [ ] Make the repo private.
- [ ] Increment 1 (this PR): pure review-tier classifier + tests.
- [ ] Increment 2: drag-drop review UI + apply route (import_run/sync_conflict), staging-first.
- [ ] Confirm `SC-0043297` passport dates are literal `"-"` in source (null + flag).
- [ ] Phase 2: compliance card/route (engine exists).
- [ ] Longer term: separate CIMS from the Despensa GitHub org / Cloudflare account.
