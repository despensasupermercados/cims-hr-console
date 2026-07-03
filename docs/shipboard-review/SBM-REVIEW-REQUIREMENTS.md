# CIMS — Shipboard Management Review: Requirements v2

_Status: DRAFT for Miguel's approval. Mockups complete; NO integration until explicit green light._
_Supersedes GSM-SURVEY-REQUIREMENTS v1. Prepared 2026-07-03, updated with Miguel's feedback of same date (voice notes + "A couple of things.docx" + Score Card screenshot)._

---

## 1. Terminology (binding)

The term **"GSM" is retired everywhere** — templates, UI, code, docs. The program is the **Shipboard Management Review** ("SBM review"). The respondent is the **shipboard manager**. Rationale (Miguel): brand-neutral naming lets the same templates serve Royal Caribbean, Celebrity, Azamara, and any future customer without rework. At RCI the shipboard manager happens to be the Guest Services Manager; the system never needs to know that.

Public route: **cims.work/sbm** (token-gated, single use).

## 2. Purpose

Replace the Microsoft Forms "Crew Feedback Survey – Printer Specialist" with a CIMS-native review, auto-triggered from the HR console around each specialist's sign-off. Three outcomes:

1. **Bonus input** — the overall rating (1–5) feeds the Supervisor Evaluation on the Score Card, automatically displayed, manually overridable (§6 — the heart of this spec).
2. **Crew history** — every response becomes a permanent "Manager Feedback" card on the crew member's record (§7).
3. **Customer signal** — structured, per-brand data on how customers perceive our people.

## 3. Scope v1

| Item | Decision |
|---|---|
| Brands | Royal Caribbean first; Celebrity + Azamara are configuration (ship list, accent color, recipient emails), not new code |
| Respondent | Shipboard manager. External — no CIMS login. Single-use signed token link (same mechanism as `/fb`) |
| Trigger | Automatic, keyed to seafarer sign-off date |
| Recipients | Per-ship/per-brand shipboard-manager emails — config table in the console, editable by Miguel/Rita. **List still pending from Miguel** |

## 4. Workflow

| Step | When | To | Condition |
|---|---|---|---|
| ① Invite | T−7 before sign-off | ship's shipboard manager | unless suppressed |
| ② Reminder | T−4 | same | only if unanswered; sent ONCE |
| ③ Internal notification | on submission | Rita + team distribution (§8) | always on submission |

**Suppression matrix** — ① and ② are cancelled automatically when any of: crew already signed off · response already submitted · sign-off date moved out of window · contract cancelled · crew retired/inactive. A cancelled reminder never un-cancels.

**No response by sign-off** — nothing breaks and nothing is zeroed: the Score Card behaves exactly as today (manual evaluation by Rita). A missed review must NEVER cost a bonus point by itself.

## 5. Survey content

Same 11 items as the Forms original, restructured:

| # | Field | Type | Required |
|---|---|---|---|
| 1 | Ship | Prefilled from contract (token); corrections via `mailto:rita.berenyi@dg3.com` | auto |
| 2 | Review date | Removed from form — submission timestamp captured server-side | auto |
| 3 | Specialist name | Prefilled from contract; displayed as hero block | auto |
| 4 | **Overall performance 1–5** | Selector; no numeric anchor in the example (the old "4 – Does a great job!" anchored answers at 4) | **yes — only required input** |
| 5–10 | Six qualitative questions (business sense, guests first, helps us grow, integrity, teamwork, energy) | Free text + example hint | no |
| 11 | Final thoughts | Free text | no |

Identity is deterministic: the token IS the crew/contract ID. No name matching, ever (contrast: intel pipeline §10 of CLAUDE.md).

## 6. Supervisor Evaluation integration — THE MONEY RULES

Console facts (from the live Score Card): Supervisor Evaluation (1–5) = **15% weight**; **1–2 → bonus forfeited, count held; 3/4/5 → full 15 points**; floor 80.

### 6.1 Source model

The Score Card's Supervisor Evaluation field carries a **value + source**, one of:

| Source | Meaning | Display |
|---|---|---|
| `auto` | From SBM review(s) for this contract | Value shown automatically, badge "from shipboard review", link to the response(s) |
| `manual` | Entered or overridden by a money user | Value + badge "manual — {user}, {date}", reason on hover |
| `none` | No review received, nothing entered | Empty — Rita enters manually, as today |

### 6.2 Precedence — no ambiguity

1. **Auto fills, never commits.** A submitted review sets the field to `auto` with the rating. It is a PREFILL. Nothing touches `bonus_outcome` until a money user presses Commit — the committed value is whatever is in the field at commit time, regardless of source.
2. **Manual always wins.** A money user (Miguel, Rita — `MONEY_USERS` only) can override at any time. Override requires a reason (free text, min 10 chars). Stored: who, when, reason, previous value.
3. **Auto never overwrites manual.** If a review arrives after a manual value exists, the field stays `manual`; the review is filed on the crew card and the evidence panel shows it with a notice "review received after manual entry — not applied".
4. **Multiple reviews, one contract** (rare): field shows the **average of the overall ratings, rounded half-up**; every raw response visible in the evidence panel.
5. **Review arrives after Commit:** the committed `bonus_outcome` is immutable (append-only ledger — never rewritten). The response still files to the crew card, and the internal notification carries a flag "received post-commit — no bonus effect". Any correction goes through the existing outcome-adjustment process, human-decided.
6. **Audit:** every transition of value or source (auto set, manual set, override) is an append-only audit row: timestamp, actor (system/user), old → new, reason.

### 6.3 Guardrails (per CLAUDE.md)

- Wiring §6 into `src/bonus.js` / the Score Card is a **money change**: PR + Miguel's explicit approval, never auto-merged, tests are the SOP.
- This pipeline stays fully separate from crew-intel (`crew-reports@cims.work`): intel is never-money; this IS a money input and flows only through the Score Card.
- Crew never log in; the shipboard manager never sees bonus mechanics (no weights, gates, or dollar figures anywhere on the survey or in ①/②).

## 7. Crew record — "Manager Feedback" card (from Miguel's docx)

On the crew tab, **below Contract History**, new section **"Manager Feedback"**:

- One dated card per response: ship, brand, contract span, overall rating, all qualitative answers verbatim, submitted-at.
- Because the trigger knows the crew ID and contract, cards attach deterministically — no review queue, no fuzzy matching.
- Cards are append-only and permanent; they follow the crew member across contracts (the record Miguel wants for history).
- Visible to all console users (qualitative content); the rating's bonus effect remains a Score Card concern.

## 8. Internal notification ③ — distribution (updated per docx)

- **To:** Rita. **Cc:** Miguel + the CIMS team distribution list (config table — "important for everybody to know").
- **Seafarer copy:** cc the specialist's **working ship email** (never personal email). ⚠️ Design rule to avoid drama: the seafarer receives a **crew-facing variant** — the feedback content and thank-you only, WITHOUT the sEval/gate/bonus framing. The full version with score mechanics goes only to the internal list. Two templates, one event.
- Content (internal variant): overall score, gate status pill (green ≥3 / red 1–2 with freeze warning), qualitative pull-quotes, link to Score Card, post-commit flag when applicable (§6.2.5).

## 9. Data model (proposed)

- `sbm_review_request` — crew_id, contract span, ship, brand, recipient email, token hash, sent_at, reminder_at, status: `sent / reminded / submitted / expired / suppressed`.
- `sbm_review_response` — request_id, answers (Q1–Q11), submitted_at, source IP/UA. **Append-only.**
- `seval_state` (per contract) — value, source (`auto/manual/none`), set_by, set_at, reason; plus append-only `seval_audit`.
- Crew card reads from `sbm_review_response`; Score Card reads `seval_state`.

## 10. Emails & branding

- Sender `CIMS <cims@cims.work>` via cims-mailer (Resend). All shipboard-manager-facing emails signed **"With appreciation, Rita Berenyi / Head of HR / DG3 Cruise Industry Managed Services"**.
- Logo: estate brand icon (navy squircle + green waves — cims.work favicon, `src/icons.js`) as inline SVG; wordmark "DG3 CIMS". No green-"D", no anchors, no avatar circles.
- Tokens: navy #1B3A5C, green #5FB946, Outfit/DM Sans. Brand accents: RCI #1E6FD0; Celebrity #33415C and Azamara #0E8C8C are placeholders — confirm at integration.

## 11. Open items (Miguel)

1. Per-brand/per-ship shipboard-manager email list.
2. Team distribution list for notification ③.
3. Historical MS Forms responses → import into Manager Feedback cards? (Recommended: yes, one-time CSV.)
4. Confirm route name `cims.work/sbm`.
5. Confirm Celebrity/Azamara accent colors.
6. Shipboard-manager rotation edge case (manager 7 days pre-sign-off may be new): accept, or per-ship role inbox.

## 12. Delivery plan

1. ✅ Requirements v2 (this doc) — awaiting Miguel's sign-off.
2. ✅ Mockups: survey page + 3-email set (SBM terminology).
3. 🚦 **GREEN LIGHT from Miguel.**
4. Integration, in order: D1 tables (§9) → `/sbm` route + form → scheduler on sign-off dates → cims-mailer templates (①②③ + crew-facing variant) → crew-tab Manager Feedback section → Score Card auto-display/override (**money PR, human-approved**) → RCI pilot → Celebrity/Azamara config.
