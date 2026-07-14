# CIMS HR Console — Data Page Redesign & File Auto-Detection: Decisions & Logic

_Captured from the 2026-07-14 session. Companion to `docs/CREW_IMPORT_DECISIONS.md`.
Purpose: preserve the reasoning so no future agent or person re-litigates settled calls.
Miguel asked explicitly that all decisions, changes, and modifications from this session be
recorded in detail. This file is that record._

---

## A. Context — why we redesigned the Data page

- The **safe crew importer** (Review & Apply: stage writes nothing → Rita ratifies → Apply)
  was built, tested (27/27 unit tests + real staging D1), and merged to prod (PR #38, commit
  `6b2665c`). It serves at `/api/crew/import`.
- BUT a **second, UNSAFE crew importer** (from a different, uncoordinated Claude session) is
  still wired into the Data page. It was proven to overwrite ship allocation (SC-9001 vessel
  EDGE→APEX), log nothing to `import_run`, and flag nothing. This violates locked decision D1.
- Miguel's directive: redesign the **entire Data page**, inspired by Notion / Linear / Stripe,
  and **replace** the old unsafe importer with OUR safe one — all inside the Data landing page.
  "I don't want to have apps or something else somewhere else." One door, not two.

## B. Redesign — two options built, one chosen

Two full-page static mockups were produced and delivered (render) this session:

- **Option A — "Calm" (Notion-inspired).** Warm off-white (`#f7f7f5`), soft borders, generous
  spacing, change **cards** with plain-language headers ("the file disagrees with your board").
  Forgiving, low-stress. Trade-off: lower density → more scrolling on heavy import weeks.
  File: `data_redesign_A_calm.html` (session workspace; reference artifact).
- **Option B — "Operator" (Linear/Stripe-inspired).** Navy brand sidebar, top bar with a live
  "writes nothing until Apply" safety badge, 5 metric tiles, each change as a tight **table row**
  with monospace IDs/dates/counts. Denser, faster to scan, reads like a system of record.
  File: `data_redesign_B_operator.html` (session workspace; reference artifact).

**DECISION (R1): Miguel chose Option A ("version 1" / Calm).**
Claude's recommendation had been B (control surface for compliance data → scannability + an
always-visible safety signal beat calm). Miguel overrode; he knows Rita and the real workload.
**Agreed compromise (R2):** build A's calm shell but **graft in B's two best traits** —
(1) monospace, column-aligned IDs and dates so `2026-07-20` is instantly comparable to the value
above it, and (2) a **persistent** "nothing saved yet / writes nothing until Apply" badge that
does not scroll away. Also keep A's plain-language section headers (better than B's terse labels).

## C. Integration principle (non-negotiable)

- **REPLACE, do not add.** Integration means removing/neutralizing the old unsafe importer so the
  Data page has exactly one crew-import path — ours. Leaving both means Rita can still hit the
  unsafe door. "Mostly cosmetic" is true for the rest of the page; the crew importer swap is the
  one substantive change.
- The new page is a **skin over the already-tested endpoints** `/api/crew/import/stage` and
  `/apply`. No decision logic moves into the UI; the pure modules (crewimport, crew_review,
  crew_apply) remain the source of truth. Skin = easy part; wiring + retiring the old path = real work.

## D. File TYPE auto-detection (Miguel's question: recognize the file instead of picking it)

**Question:** instead of Rita selecting "Crew registry — AdvancedQuery" from a dropdown, can the
system recognize the file type on drop? Options? Danger? Doable? Efficient?

**Verdict: doable, cheap, and worth doing — as a HYBRID, never as a silent guess.**

### D.1 Options (worst → best)
1. **Filename pattern** (`AdvancedQuery*.xls`). Zero cost but brittle — a rename breaks it.
   Use only as a weak tie-breaker hint, never as the decision.
2. **Column-header signature** (RECOMMENDED). After SheetJS parses the file we already hold the
   header row (row 2 of AdvancedQuery). Match those headers against a known fingerprint —
   e.g. must contain `CREW ID` + `MEDICAL EXPIRATION DATE` + `SIRB … EXPIRATION` + `VESSEL NAME`.
   Robust to reordering and rename. **This is the real answer.**
3. **Content shape** (column count, sheet name) — a supporting signal, not primary.

### D.2 Chosen architecture — a "recognizers" registry
A small client-side registry, one entry per upload type:
`{ id, label, requiredHeaders[], sentinelHeaders[], minScore }`.
On drop: parse headers → score each recognizer by how many required headers are present → pick
the best above `minScore`.
- **High confidence** (full signature matched): auto-select the type, show
  `Detected: Crew registry — AdvancedQuery ✓ (12/12 signature columns matched)`. The dropdown
  stays, pre-filled, as a visible **override**.
- **Low / ambiguous** (below threshold): **do NOT guess.** Show "I couldn't confidently identify
  this file — choose the type" and fall back to the manual dropdown. **Fail safe = ask.**

Detection selects the *parser*; it NEVER bypasses the Review & Apply step. Auto-detect + still
writes nothing until Apply.

### D.3 Dangers & mitigations (honest)
1. **Misclassification → crew logic on a non-crew file.** Blast radius is small because `stage`
   writes nothing and renders a full review; a misdetect shows up as garbage Rita discards — not
   data loss. Mitigation: require a strong signature; refuse to guess below threshold.
2. **Overlapping schemas (two types share columns).** Mitigation: require **distinctive sentinel
   columns** unique to each type.
3. **Over-trust / rubber-stamping.** Auto-detect could lull Rita into not checking. Mitigation:
   always SHOW what was detected and the match evidence; never hide it.
4. **TDG schema drift** (agency renames/adds/removes a column) → file goes "unrecognized."
   Mitigation: score-based (need N-of-M, not all) + **log unrecognized drops** so we notice drift.
   This is a feature: it catches the day TDG changes their export.
5. **Wrong parser on right file → wrong column mapping.** Low risk: `mapRow` already matches by
   header substring, so it is resilient; detection uses the same header inspection.

### D.4 Efficiency
Extremely efficient. Detection reads the header row already in memory after the SheetJS parse —
a handful of string comparisons, **client-side, no server round-trip**, before `/stage`. It
removes a click every week and costs effectively nothing.

### D.5 The honest framing of value TODAY
Right now there is effectively **one** upload type (AdvancedQuery), so the dropdown is a menu of
one. Auto-detect's convenience payoff (skip the pick) is minor today; its **real value now is a
WRONG-FILE GUARD** — it rejects Rita dropping, say, a relief/keyman roster or a random export
into the crew importer *before* it wastes a review cycle. The convenience/scaling payoff grows as
upload types multiply (crew registry, relief roster, compliance, Despensa feeds). Recommendation:
build the recognizer registry now with one entry; adding types later is a one-line registration.

**DECISION (R3): adopt the hybrid recognizer registry.** Auto-detect by header signature, show the
detection + evidence, keep the dropdown as a visible override, hard-refuse to auto-run below a
confidence threshold (fall back to manual pick), and log unrecognized drops.
Fits Miguel's operating philosophy: prevention over reactive (catches drift + wrong file),
single source of truth (pure modules unchanged), clear ownership (Rita still confirms).

## E. Open items (this workstream)
- [ ] Confirm skin choice = Option A (Calm) — Miguel said "version 1"; proceeding on that read.
- [ ] Build the integrated Data page: A's calm shell + B's monospace dates + persistent safety badge.
- [ ] Wire the shell to `/api/crew/import/stage` + `/apply` (endpoints already prod-tested).
- [ ] **Retire/neutralize the old unsafe crew importer** in worker.js (one door only).
- [ ] Implement the recognizer registry (one entry: AdvancedQuery) + "detected" UI + unrecognized log.
- [ ] Staging-first validation, then prod (DEPLOY_AND_VALIDATE.md runbook).

## F. Carry-over reminders (still open from prior session)
- [ ] Make the `cims-hr-console` repo **PRIVATE** (governance; 45-day reminder set ~Aug 27).
- [ ] Optionally restrict `/apply` to MONEY_USERS (Miguel + Rita) at the worker gate.
- [ ] Longer term: separate CIMS from the Despensa GitHub org / Cloudflare account.
