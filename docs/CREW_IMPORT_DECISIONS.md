# CIMS HR Console — Crew Import: Decisions & Logic (session memory)

_Captured from the 2026-07-13 design session. Companion to the `feat/crew-import-review` work.
Purpose: preserve the reasoning so no future agent or person re-litigates settled calls._

_Amended 2026-08-24 (D6, D7) after the crew roster was found frozen for six weeks.
See `CREW_IMPORT_STATUS_AUTHORITY.md` for the incident._

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

**Every imported field must appear in this table.** A field with no named owner gets given
one by accident — that is precisely how `status` ended up treated like ship allocation and
froze the roster for six weeks (D6).

| Domain | Fields | Source of truth | Import behavior |
|--------|--------|-----------------|-----------------|
| Certificates | medical, BDOS/SIRB, passport, visas | **TDG** (agency keeps current) | Default **Accept** |
| Crew status | `status` (On board / On Vacation / Earmarked / Inactive) | **TDG** (the register of who is where) | Default **Accept** — D6 |
| Ship allocation | current ship / vessel_observed | **Rita** (she dictates placement) | **Never written** — flag only |
| Identity | agency_id, ship_crew_id | **TDG**, but stable in our roster | **Never written** — match + flag, D7 |
| Manual corrections | any field with a live `crew_override` | **Rita** | Default **Keep** — D3 wins over D2 and D6 |
| Money | baseline_count | **Miguel** | Never touched by import |

TDG's file lags Rita's real moves and is often wrong on ship placement — so its ship column is a lagging record of her decisions, not truth. "Current ship" also lives in two places: `crew.vessel_observed` (file) vs `ship_leg`/`assignment` (the board Rita runs); a disagreement between them is the high-value signal.

Status is different from ship placement, and the distinction is the whole of D6: Rita *decides*
placement, so the file can only lag her. Nobody at CIMS *decides* status — TDG records it, and
the console has no independent way to know it. A lagging record of someone else's decision must
be flagged; the only record of a fact must be accepted.

## D. Locked decisions
- **D1** Import NEVER writes ship allocation → mismatch becomes a flag resolved on the board. No "adopt agency" path.
- **D2** Certificates default Accept; an expiry moving **earlier** is flagged (still one click).
- **D3** A change to a field with a **live** crew_override defaults Keep; if accepted, logged.
- **D4** Nothing auto-deletes; crew absent from file → flagged for review.
- **D5** Selective friction: only ship / override / identity / earlier-expiry demand attention; minor hygiene auto-applies. (An approval that fires on every trivial row trains rubber-stamping.)
- **D6** _(2026-08-24)_ **Status is TDG's and defaults Accept.** It stays in the CRITICAL review tier — shown prominently, keepable per row — but the default moves the registry toward the source of truth. A high-consequence field is an argument for making a change visible and reversible, not for making it hard to apply: a default needing ~30 manual clicks a week to track reality is not a safety control, it is guaranteed drift.
- **D7** _(2026-08-24)_ **Identity is `agency_id` first, cruise-line `ship_crew_id` second.** A row keyed on the cruise-line id matches the crew member we hold rather than inserting a duplicate; `agency_id` is never rewritten by an import, and the collision is raised as an open `identity` flag. Mirrors `keymanimport.buildBridge()`.

### What `resolved` means in `sync_conflict` _(clarified 2026-08-24)_
`resolved=1` means **the registry agrees with the source of truth** — nothing else. It does not
mean "a human looked at it". A kept status, which is a deliberate divergence from TDG, stays
`resolved=0` until TDG is corrected. Consequence: an unresolved count is real outstanding work
and can be reported to humans as such (the Fleet Document Radar footer does exactly this).

**The rule behind D6 and the `resolved` clarification:** a detected difference must either be
applied or stay visibly outstanding. It must never be parked silently. Any queue this system
grows needs something that reports its depth to a person on a schedule.

## E. UX principles ("Review & Apply")
- Upload is a **proposal Rita ratifies** (Word tracked-changes model). Nothing saves until Apply.
- Diff is **per-field, not per-row**. Every change anchored to a human + ship. Trust cues: "nothing saved yet", live Apply count, Discard path, post-apply audit toast (import_run + file-hash dedup).
- The apply receipt reports `status_applied` / `status_kept` so a default that moves data is never invisible.

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
- [x] Increment 1: pure review-tier classifier + tests.
- [ ] Increment 2: drag-drop review UI + apply route (import_run/sync_conflict), staging-first.
- [ ] Confirm `SC-0043297` passport dates are literal `"-"` in source (null + flag).
- [ ] Phase 2: compliance card/route (engine exists).
- [ ] **The 411 open `vessel_observed` flags have never been drained** (none resolved since July). Either the board reconciliation is real work nobody is doing, or the flag is noise and D1's flag-only rule needs a cheaper resolution path. Decide which — an ignored queue is worse than no queue.
- [ ] Longer term: separate CIMS from the Despensa GitHub org / Cloudflare account.
