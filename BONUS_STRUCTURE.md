# DG3 CIMS — Bonus Structure: Full Knowledge Transfer
_Source of truth: `src/bonus.js` (locked SOP module) + the live Score Card in `src/worker.js`. This doc is exact, re-verified against code on 2026-06-23 (every worked example below was run through `computeBonus`). Any change to the bonus math is a "money change" — must pass the golden tests AND human approval (see CLAUDE.md)._
---
## 0. The idea / why it exists
The bonus exists to reward **printer specialists** (crew running shipboard print ops) for two things at once:
1. **Loyalty / continuity** — staying contract after contract (consecutive completions). Re-crewing and retraining is expensive; continuity protects service quality and cost.
2. **Operational excellence on that contract** — ordering discipline, accuracy, machine care, cost control (mono click discipline), communication, and a passing supervisor evaluation.
Design philosophy (Miguel's operating style): **systems over personalities, measurable and auditable, prevention rewarded, money protected.** So the bonus is deliberately built as: a fixed ladder (continuity) × a transparent score (performance), with hard gates that protect the company from paying out when something went materially wrong, and an immutable audit trail on every decision. Nothing is discretionary cash; everything traces to inputs.
The result is a single number per completed contract that is **defensible**: you can show the crew member exactly how it was derived.
---
## 1. The three mechanisms (how a payout is produced)
A bonus = **LADDER(consecutive count) × SCORE%**, but only if **no gate** fired and the score clears the **floor**.
### A) THE LADDER — continuity reward (the ceiling)
Payout ceiling rises with each **consecutive completed contract**:
| Consecutive contract # | Ladder value (max payout) |
|---|---|
| 1 | $0 |
| 2 | $250 |
| 3 | $500 |
| 4 | $750 |
| 5 | $1,000 |
| 6 | $1,250 |
| 7 | $1,500 |
| 8 | $1,750 |
| 9 or more | $2,000 (caps) |
Code: `LADDER = [0,0,250,500,750,1000,1250,1500,1750,2000]`; `ladderValue(n) = n<=1 ? 0 : n>=9 ? 2000 : LADDER[n]`.
The first contract always earns $0 — the bonus is explicitly a *continuity* reward; you build into it. This ladder value is called the **"rung."**
### B) THE SCORE — performance on this contract (0–100%)
The rung is multiplied by a performance score out of 100, built from weighted components:
| Component | Max pts | Where it comes from |
|---|---|---|
| Order accuracy (`sAcc`) | 25 | Ray (Inventory & Orders) window |
| On-time ordering (`sOrder`) | 20 | Ray window |
| Par maintenance (`sPar`) | 15 | Ray window |
| Supervisor evaluation ≥3 (`sEval`) | 15 | Score Card (1–5 select) — all-or-nothing |
| Ship-condition handover / handling (`sHand`) | 10 | Rolando (Technical) window |
| Communication (`sComm`) | 10 | **Manual — set by Rita** on the Score Card |
| Mono click discipline <20% (`sMono`) | 5 | Dexter (Field) window |
| **Total** | **100** | |
Notes:
- `sEval` is binary: supervisor evaluation of **3, 4, or 5 → full 15 points**; **1 or 2 → 0 points** (and triggers a gate, see below). **Because the eval is all-or-nothing, the maximum score achievable when the eval is below 3 is 85** (the six sliders only) — keep this in mind when reading scores alongside a sub-3 eval.
- `sComm` (Communication, 10) has **no contributor window** — it is a manual slider Rita sets directly. If left untouched it defaults to 0.
- All other sliders can be **pre-filled from the feedback windows** but Rita can override any of them (manual override is preserved by design).
### C) THE FLOOR
`FLOOR = 80`. **If the total score is below 80%, the payout is $0** — even when no gate fired. Sub-80 performance earns nothing; it does not earn a reduced amount.
### THE FORMULA
```
pay = (no gate AND score >= 80) ? round( ladderValue(nextCount) * score / 100 ) : 0
```
You earn the percentage of your rung equal to your score.
---
## 2. The gates — hard stops (protect the money)
Evaluated in this order; the first that applies wins:
| Gate | Trigger | Effect on count | Pay |
|---|---|---|---|
| `not_completed` | Contract NOT completed AND NOT approved compassionate leave | **Resets to 0** | $0 |
| `rush` | Emergency/rush shipment caused by a **crew ordering failure** | **Resets to 0** | $0 |
| `audit` | **Failed** end-of-contract inventory audit | **Resets to 0** | $0 |
| `eval_below_3` | Supervisor evaluation is 1 or 2 | **Held (no reset, no advance)** | $0 (forfeited) |
- **Compassionate leave**: an incomplete contract approved as compassionate is treated as completed (no `not_completed` gate) — so the crew member isn't penalized for an approved humane exception.
- `eval_below_3` is a **freeze, not a reset**: they forfeit this contract's pay and do not advance the ladder, but they keep their accumulated count (a bad evaluation shouldn't wipe years of loyalty).
---
## 3. Count progression (the consecutive counter)
```
nextCount = resets ? 0 : (advances ? count + 1 : count)
```
- `count` = the crew member's consecutive-completed-contract number **going INTO** this contract.
- `nextCount` = what they reach **after** it. **The payout uses `nextCount` — you are paid at the rung you just earned.**
- Clean completed contract (or approved compassionate) → **advance +1** (`nextCount = count + 1`).
- `rush` / `audit` / `not_completed` → **reset to 0** (`nextCount = 0`).
- `eval_below_3` → **hold flat** (`nextCount = count`).
**Convention used in the examples below:** "their Nth contract" means the contract that, if completed cleanly, makes their consecutive count = N (i.e. `nextCount = N`, paid at `ladderValue(N)`). After a clean Nth contract their count **is N** — not N+1.
---
## 4. Worked examples (each run through `computeBonus` — exact)
1. **Crew with 4 consecutive completions completes a clean 5th, score 90%** → rung `ladderValue(5)` = $1,000 × 0.90 = **$900**. Count **4 → 5**.
2. **Same crew, clean 5th but score 79%** → below the 80 floor → **$0**. Count still advances **4 → 5** (no pay, but it counts as a completion).
3. **Crew on their 3rd contract (count 2), score 95%, but failed the end-of-contract audit** → gate `audit` → **$0**, count **resets to 0**.
4. **Crew with 6 consecutive completions on their 7th, supervisor eval = 2, score 80%** → gate `eval_below_3` → **$0**, count **held at 6** (does not advance, does not reset). _(Note: with a sub-3 eval the score can be at most 85, since the 15 eval points are forfeited.)_
5. **A crew member's very 1st contract, score 100%** → rung `ladderValue(1)` = $0 → **$0** (the first contract always builds, never pays). Count **0 → 1**.
6. **Crew with 8 consecutive completions completes a clean 9th, score 100%** → rung caps at `ladderValue(9)` = $2,000 × 1.0 = **$2,000**. Count **8 → 9** (the rung stays $2,000 for the 9th contract and every one after).
---
## 5. Who scores what — the feedback windows
Scoring a contract pulls evidence from up to three **single-use contributor links** ("feedback windows"), each scoped to one role. Server maps their answers to sub-scores (`mapFeedbackToScore`); Rita reviews and can override before committing.
- **Ray — Inventory & Orders:**
  - On-time ordering: Always=20 / Mostly=14 / Often late=6 → `sOrder`
  - Order accuracy: Accurate=25 / Minor errors=17 / Frequent errors=8 → `sAcc`
  - Par maintenance: Maintained=15 / Some gaps=9 / Not maintained=3 → `sPar`
  - Rush order = Yes caused by "Crew ordering failure" → triggers **rush gate** (captures $ cost if entered)
  - Failed inventory audit = Yes → triggers **audit gate**
- **Rolando — Technical:**
  - Starts at 10; deductions: machine not clean (−6) / minor (−3); PM not done (−4) / partial (−2); unresolved issues major (−3) / minor (−1). Floor 0. → `sHand`
- **Dexter — Field:**
  - Mono % usage → `sMono`: ≤20% = 5 pts, ≥40% = 0 pts, linear in between (`round(5*(40−m)/20)`). Lower mono % = better discipline.
- **Score Card (Rita/Miguel), not a window:**
  - Supervisor evaluation 1–5 → `sEval` (≥3 → 15, else 0 + freeze gate)
  - Communication → `sComm` (manual, 10)
  - The four gate checkboxes (completed / compassionate / rush / audit)
The Score Card shows the prefilled values plus an **"Evidence from windows"** panel quoting each contributor's raw answers, so the number is auditable back to its source.
---
## 6. Committing & immutability (audit)
When Rita commits a score, the system writes a permanent `bonus_outcome` row: the full scorecard JSON, `score_pct`, `gate`, gate note, `count_before`, `count_after`, `pay_usd`, the contract span, the ships, who committed it, and when. The crew member's current consecutive count is read from their **latest committed outcome** (falling back to the baseline if none). Outcomes are an append-only ledger — the basis of the Crew statement PDF and the Contracts & Bonus ledger. A repeated/double-clicked commit for the same crew + exact contract span is rejected as a duplicate (no double pay, no double count).
---
## 7. CRITICAL open item — baselines (#17)
Every payout depends on the **consecutive-contract count**, which has a starting **baseline** per crew that must be reconciled with Rita against the golden Contract Counter before any real payout. Until that's confirmed:
- The system treats unknown baselines as **0** and shows **"baseline pending"** instead of a dollar figure on the Crew cards and the Contracts & Bonus ledger.
- **No payout should be finalized** until #17 is done. This is intentional money-safety, not a bug.
- Baseline is resolved override-wins through a single shared helper (`resolveBaseline`) on every path — Score Card, commit, PDF, and ledger — so the number on screen always equals the number the payout uses.
---
## 8. Governance (do not bypass)
- `src/bonus.js` is the single source of the math. The test suite pins it (golden tests). A change here is a money change: it must pass `node --test` and human approval, and is protected by branch protection + CODEOWNERS on the money path.
- Committing a payout is restricted to the **money users** (Miguel + Rita), even though all console users are role 'full'.
- Constants to remember: `LADDER`, `FLOOR = 80`, weights `FW = {sOrder:20, sAcc:25, sPar:15, sHand:10, sComm:10, sMono:5}`, eval bonus = 15 when ≥3.
---
## 9. Changelog
- **2026-06-23** — Corrected §4 worked examples: the resulting consecutive counts were each overstated by 1 (e.g. a clean 5th contract leaves the count at 5, not 6), and example 4's "88% with eval 2" was replaced (a sub-3 eval caps the score at 85). Added the §3 count convention and the §1B eval-cap note to prevent recurrence. All six examples re-verified by running `computeBonus`. No change to `bonus.js` — the engine was already correct; only this document was fixed.
