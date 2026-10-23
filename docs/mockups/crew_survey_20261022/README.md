# Crew survey: mock-ups for approval (22 Oct 2026)

Miguel, 22 Oct 2026: one end-of-contract survey for all four cruise lines (Royal Caribbean, Celebrity, Azamara, NCL), sent when the seafarer signs off. Results live under Reports → **Crew survey**. Mock-ups first; nothing is wired until he approves.

## The flow

| Step | What | To | Cc |
|---|---|---|---|
| 1 | **Invitation** (`invite_email.html`). Sent the morning after the sign-off, at 07:00 Miami, once per contract. | the seafarer's own email (TDG's file, else Rita's override) | Rita, Miguel |
| 2 | **Survey page** (`survey.html`). His own link: no login, open 30 days, name, ship and dates prefilled. | — | — |
| 3 | **Copy of his answers** (`answers_email.html`), sent the moment he presses Send. | the same personal email | onboardsupport@dg3.com |
| 4 | **Report** (`report.html`): Reports → Crew survey. | console | — |

## Rules

- The sign-off date comes from the board's ONE schedule (§10d): TDG's debark date, else Rita's typed date.
  - A **training visit** is never asked (§10i).
  - A contract with no email on file is listed in the report and never guessed.
- **Questions:** Rita's 19 statements, word for word, plus her one open question (Microsoft Forms, Dec 2025).
  - So answers since Dec 2025 stay comparable with the new ones.
  - They are grouped into five screens: The job · The print shop · Support · You · Overall.
  - The supervisor statement names the line's own title: GSM (Royal), DCM (Celebrity), BOM (Azamara).
- **Feedback only.** It never feeds the Score Card, `bonus_outcome` or any payout (§1). It is never sent to the cruise line.
- **History to import:** the Forms export Rita holds ("Seafarer End-of-Contract _ Exit Survey(1-64).xlsx"). As read on 22 Oct 2026 it contains rows 57–64 only; the report mock-up shows those 8 real answers. Rows 1–56 need a full export from Forms.

## What the two files sent on 22 Oct are

`Crew Feedback Survey _ Royal Caribbean Printer Specialist (1-49)` and `… Celebrity Printer Specialist (1-18)` are the **ship manager's review of the Printer Specialist**. They are not the seafarer's own survey:
- Their questions are, one for one, the console's existing GSM review (`sbm_review_response`: rating plus seven DG3-value questions).
- The Royal history is already imported under Reports → Shipboard Feedback.
- That review feeds the Score Card's supervisor evaluation, which is money (§1).
- So these two files belong in **Shipboard Feedback** (adding Celebrity's 18), not in Crew survey.

## Open for Miguel

1. One reminder 5 days after the invitation if he has not answered: yes or no.
2. Who answers "the one thing to fix first": the copy email promises Rita within a week.
3. The NCL manager's title, for the supervisor statement.
