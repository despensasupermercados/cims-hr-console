# CIMS HR Console — Agent Operating Rules

This file governs any AI agent (interactive or the nightly job) that works in this repo.
Read it fully before changing anything. These rules exist to keep an autonomous system
trustworthy around real crew data and real money.

## 1. The money gate — hard rule
`src/bonus.js` is the locked bonus SOP. Any change to bonus scoring, the ladder,
weights, the FLOOR, gate logic, payout math, or how `bonus_outcome` is written is a
**money change**. The agent may PROPOSE such a change in a pull request with a written
rationale, but it MUST NOT auto-merge it. A money change requires Miguel's explicit
review and approval (enforced by CODEOWNERS + branch protection). Never weaken or delete
a test in `test/bonus.test.js` to make a change pass — the tests are the SOP.

## 2. The test suite is law
`npm test` must be green before anything deploys. If a change breaks a test, fix the
change, not the test (unless the SOP itself was deliberately and approvedly changed).
The CI gate blocks deploys on red tests. Do not bypass it.

## 3. Deployed code must equal tested code
`src/worker.js` imports the bonus and auth logic from `src/bonus.js` and `src/auth.js`.
Do not re-inline copies of that logic into the Worker — duplication lets the deployed
behaviour drift from what the tests pin. (The browser-side preview `computeBonusC`
inside the HTML is display-only and non-authoritative; the server always recomputes.)

## 4. Staging before production
Validate on the staging Worker + staging D1 copy before promoting to prod. Never run an
untested migration or data load against the production database.

## 5. What the nightly agent MAY auto-merge (whitelist only)
- Dependency version bumps that keep tests green.
- Lint / formatting / comment fixes.
- Regenerating derived/export data (e.g. Days-Worked export) from source of truth.
- Documentation updates.
Anything else — and ALWAYS anything touching money, auth, schema, or crew data — must be
a PR for human review, not an auto-merge.

## 6. Data integrity is a first-class job
The crew identity bridge is fragile: AdvancedQuery uses agency IDs `SC-00NNNNN`; Keyman
uses 6-digit Royal IDs; they are matched by name until `ship_crew_id` is stored on crew.
The agent must flag (never silently "fix") any reconciliation mismatch that could affect
a bonus count or a billing figure. Money-affecting anomalies are escalated to Miguel.

## 7. Never handle secrets
Secrets (`SESSION_SECRET`, `BOOTSTRAP_KEY`, `RESEND_API_KEY`, Cloudflare/Anthropic API
tokens) live in the CI/Worker secret stores. The agent must never print, log, commit, or
move them. If a task seems to need a secret in code, stop and flag it.

## 8. Auditability
Every change is a commit with a clear message; every agent run posts a short digest of
what it checked, fixed, and flagged. Prefer small, reviewable PRs over large ones.

## 9. Verify the deploy is LIVE, not just committed
A green commit is not a deploy. Cloudflare Workers Builds is a separate pipeline from the
GitHub CI test gate, and a web-uploader commit can silently no-op. After every deploy the
agent MUST confirm the change is actually serving by hitting the live API
(`fetch('/api/…', {cache:'no-store'})`) and checking the behaviour — never trust a
screenshot of a green commit. (Cautionary case: `ed41384` read as shipped + tests green but
the fix was never live; found and corrected in Session 4.)

## Project facts
- 7 full users (Miguel, Rita + 5 contributors, added 2026-06-12 by Miguel's explicit decision).
  **Money actions (bonus commit, baseline) are restricted to Miguel + Rita** (`MONEY_USERS` in
  `policy.js`). Do NOT widen `@dg3.com` into role 'full'. Crew never log in.
- Auth: magic-link (stateless HMAC token) + bootstrap dev-login; 12h signed-cookie session.
- DB: Cloudflare D1 `cims-hr-console` (id f0ac8b6a-deac-4214-8f42-e22b202d7d7d).
- Bonus count is event-sourced from `bonus_outcome` (append-only); never overwrite history.
