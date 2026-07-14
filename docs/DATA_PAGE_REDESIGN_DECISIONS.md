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

## E. Final layout + commit UX (settled after 3 iteration rounds with Miguel)

- **DECISION (R4): the "cart" layout is the final skin.** The review list sits center; a **sticky
  right-hand "Ready to apply" cart** (checkout metaphor) holds the itemized tally, running totals,
  the Apply button, Discard, and the "nothing saved until you apply" lock. It rides down the page
  as Rita scrolls, so Apply is always one glance away. This replaced an earlier bottom commit-bar,
  which wasted the right-hand whitespace and cramped the summary horizontally.
- **Cart must be LIVE, not decorative:** flipping a row (Accept↔Hold, Add↔Skip, Keep↔Accept)
  updates the matching cart line, the two totals, and the Apply count in real time. The cart count
  must always equal what `/apply` will actually write. This is the whole point of the metaphor.
- **Held vs. save semantics in the cart:** GREEN lines = will be written (certs, new crew, tidy-ups);
  AMBER "held" lines = protected, NOT written (ship flag, live manual override). Held items appear in
  the cart precisely so the protection is visible, not buried.
- **Count integrity:** the Apply count must reconcile with the itemized breakdown (sample math:
  2 certs + 1 new + 2 tidy-ups = 5 save; 1 ship + 1 manual = 2 held). A commit button whose number
  disagrees with the list quietly erodes trust — never ship a mismatch.
- Reference artifact: `data_redesign_cims.html` (session workspace) — the branded, cart-layout,
  auto-detect final mockup. Supersedes `data_redesign_A_calm.html`, `_B_operator.html`,
  `_A_final.html`, `_A_cart.html` (earlier iteration steps, kept for history only).

## F. Brand system — CIMS / DG3 (from `cimsbrandmanualv1.html`, uploaded 2026-07-14)

The Data page must carry the CIMS identity, not a generic palette. Source of truth = the brand
manual. Tokens the build MUST use:

| Token | Hex | Role |
|-------|-----|------|
| DG3 Navy | `#1B3A5C` | **Primary** — sidebar, headings, primary/segmented-active, cart header |
| Deep Navy | `#142D48` | deep headers / hovers |
| DG3 Green | `#5FB946` | **Accent CHROME ONLY** — top rule, logo underline, borders, icon strokes, active nav marker |
| Green-ink | `#3C7A2A` | **derived accessible shade** for green *text* + the Apply button fill (see note) |
| Slate | `#6B7280` | body text |
| Light slate | `#9CA3AF` | muted/meta |
| Cloud | `#F3F4F6` | page background |
| Border | `#E5E7EB` | hairlines / card borders |

- **Fonts:** headings + wordmark = **Outfit** (600/700); body = **DM Sans** (400/500). Loaded from
  Google Fonts (same as the manual).
- **Logo:** the print-mark SVG (stacked green document outlines) + `CIMS` wordmark (Outfit 700,
  letter-spacing 4px) + a 2px green underline + `Cruise Industry Managed Services` sub-label.
  Sidebar footer carries `A division of DG3` with green `DG3`.
- **Top accent rule:** 4px `linear-gradient(90deg, navy 62%, green 62%)` across the very top.

**DECISION (R5 — accessibility guardrail): DG3 Green `#5FB946` is an accent, not a text/fill color.**
White text on `#5FB946` (contrast ≈2.2:1) and green text on white both FAIL WCAG AA. The brand
manual itself only uses green for thin rules and tiny caps labels. So: keep `#5FB946` for chrome,
and use **Green-ink `#3C7A2A`** (same hue, darkened) wherever green must be *read* — "N save"
counts, the "renewed" tag, and the **Apply button fill** (white-on-`#3C7A2A` ≈5:1, passes AA).
Navy remains the authoritative primary. Functional status colors (amber for caution/held, red for
"your manual entry") are muted toward the brand and used only for semantics, not brand chrome.

## G. Build checklist (unblocked once Miguel approves the branded mockup)
- [x] Skin choice = Option A (Calm) → evolved into the branded **cart layout** (R4).
- [x] Auto-detect design settled (D) — recognizer registry, one entry, evidence shown, fail-safe.
- [x] Brand tokens + accessibility guardrail settled (F, R5).
- [ ] Build the integrated Data page from `data_redesign_cims.html` as the visual spec.
- [ ] Wire the shell to `/api/crew/import/stage` + `/apply` (endpoints already prod-tested).
- [ ] Make the cart LIVE (row toggles → cart lines + totals + Apply count).
- [ ] Implement the recognizer registry + "detected" UI + unrecognized-drop log.
- [ ] **Retire/neutralize the old unsafe crew importer** in worker.js (one door only).
- [ ] Staging-first validation, then prod (DEPLOY_AND_VALIDATE.md runbook).

## H. Carry-over reminders (still open from prior session)
- [ ] Make the `cims-hr-console` repo **PRIVATE** (governance; 45-day reminder set ~Aug 27).
- [ ] Optionally restrict `/apply` to MONEY_USERS (Miguel + Rita) at the worker gate.
- [ ] Longer term: separate CIMS from the Despensa GitHub org / Cloudflare account.
