# CIMS — GSM Feedback Survey: Requirements v1 (Mockup Phase)

_Status: DRAFT for Miguel's review. No integration until explicit green light. Prepared 2026-07-03._
_Source research: `cims-hr-console` (PROJECT_MEMORY.md, BONUS_STRUCTURE.md, CLAUDE.md), existing MS Forms survey + 1 completed response (Navigator / M.K.R. Murillo)._

---

## 1. Purpose

Replace the Microsoft Forms "Crew Feedback Survey – Printer Specialist" with a CIMS-native, branded survey at **cims.work/gsm**, sent automatically to the ship's Guest Services Manager (GSM) before a Printer Specialist signs off.

Outcomes:

1. **Bonus input** — Q4 (1–5 overall rating) prefills the Supervisor Evaluation (`sEval`) on the Score Card.
2. **Crew history** — full response filed as a permanent card on the crew member's record (customer voice, contract by contract).
3. **Customer signal** — structured data on how each client brand perceives our people.

## 2. Scope

| Item | v1 |
|---|---|
| Brands | Royal Caribbean first; Celebrity Cruises and Azamara as variants of the same engine (per-brand ship list, accent color, supervisor emails) |
| Respondent | GSM (or brand-equivalent supervisor). External user — no CIMS login. Access via single-use signed token link (same pattern as existing `/fb` crew feedback) |
| Trigger | Automatic from HR console, keyed to seafarer sign-off date |
| Recipient emails | Miguel provides per-brand/per-ship supervisor emails (config table, editable in console) |

## 3. Workflow

1. **T−7 days before sign-off** — system generates a single-use token and emails the GSM the invite (via cims-mailer / Resend, sender `CIMS <cims@cims.work>`).
2. **T−4 days** — if not submitted, send ONE gentle reminder. Warm tone, no pressure — GSMs don't work for us; this is a courtesy ask.
3. **Suppression rules** — do NOT send (and cancel any pending reminder) if: crew already signed off, sign-off date moved out of window, response already submitted, contract cancelled, or crew marked retired/inactive.
4. **On submit** — store response, file crew-history card, prefill `sEval` on the Score Card for that contract, notify Rita/Miguel.
5. **No response by sign-off** — nothing breaks: Score Card behaves exactly as today (Rita sets the eval manually). A missed survey must never zero a bonus.

## 4. Survey content (unchanged from Forms, restructured)

| # | Field | Type | Required |
|---|---|---|---|
| 1 | Ship | **Prefilled from contract** — GSM confirms, can correct | Yes |
| 2 | Date of review | Prefilled today, editable | Yes |
| 3 | Printer Specialist name | **Prefilled from contract** — confirm | Yes |
| 4 | Overall performance | 1–5 selector | Yes |
| 5–10 | Six qualitative questions (business sense, guests first, helps us grow, integrity, teamwork, energy) | Free text + example hint | No |
| 11 | Final thoughts | Free text | No |

Change vs. Forms: ship and name prefilled from the token, not picked from a 29-ship list. Removes the two most likely data-entry errors and cuts completion time (~8 min observed → target <3).

## 5. Bonus linkage — money rules (hard constraints)

- Q4 maps to `sEval`: **≥3 → 15 pts; 1–2 → 0 pts + `eval_below_3` freeze gate.** The survey PREFILLS the Score Card; it does not write `bonus_outcome`. Rita/Miguel retain override and commit, exactly as today.
- Multiple responses for one contract (rare): Score Card shows the **average of Q4**, rounded, with all raw responses in the evidence panel.
- Per CLAUDE.md §1: wiring this into the Score Card is a **money change** → PR + Miguel's explicit approval, never auto-merged. This document is the written rationale.
- Keep separate from the crew-intel pipeline (§10): intel is never-money; this IS a money input, so it flows only through the Score Card path.

## 6. Data model (proposed)

- `gsm_survey_request` — crew, contract span, ship, brand, GSM email, token hash, sent_at, reminder_at, status (sent / reminded / submitted / expired / suppressed).
- `gsm_survey_response` — request id, Q1–Q11 answers, submitted_at, source IP/UA. Append-only.
- Crew card: dated "GSM Review" entry per response, visible in crew history alongside intel and bonus ledger.

## 7. Risks / open items (need Miguel's answers)

1. **GSM rotation** — the GSM 7 days pre-sign-off may themselves be new to the specialist. Accept as-is, or allow the ship's email to reach "current GSM" via a role inbox? (Config table per ship mitigates.)
2. **Historical Forms data** — import the existing MS Forms responses into crew history so records start complete? Recommended: yes, one-time CSV import.
3. **Q4 anchoring** — on the current form, "4" is the worked example ("4 – Does a great job!"), which anchors responses at 4. Keep for continuity or drop the anchor for cleaner data? Recommendation: drop the number from the example.
4. **Language** — GSMs are fleet-wide, English fine? Assumed yes.
5. Per-brand supervisor email list — awaiting from Miguel.

## 8. Delivery plan

1. ✅ Requirements (this doc)
2. ⏳ Mockups: survey page + invite/reminder emails (iterate here — this is where the time goes)
3. 🚦 Green light from Miguel
4. Integration: D1 tables + `/gsm` route in `cims-hr-console`, scheduler hook on sign-off dates, cims-mailer templates, Score Card prefill (money PR, human-approved), Celebrity + Azamara variants.
