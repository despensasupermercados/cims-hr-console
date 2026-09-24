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

**Interactive sessions (Miguel's standing instruction, 2026-09-15: "next time u go ahead and merge
them"):** a session Miguel is driving may merge its OWN pull request once (a) CI is green, (b) the
change was verified locally (tests + the rendered page where UI changed) and (c) the PR is not a
money change under §1. Money changes (`src/bonus.js`, payout, `bonus_outcome`, baselines) stay
Miguel's to merge, always. §9 still applies after the merge: prove the deploy is live.

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

## 10. Field intel (crew-reports@cims.work) — qualitative, NEVER money
The intel pipeline (Session 5) lets anyone email crew-reports@cims.work; AI summarises and files a
dated card on the crew. Hard rules:
- **It is SEPARATE from the scored bonus.** Intel is narrative field knowledge — it must never feed,
  adjust, or be confused with `bonus_outcome`, baselines, or payout. Keep the two code paths apart.
- **Identity stays deterministic.** Which crew an email is about is decided by `crewmatch.js`
  (high/med auto-file; low/none → human review queue). The LLM writes the summary only — it must
  never pick the crew. A wrong match is a false record on the wrong seafarer.
- **Engine preference:** Claude (`ANTHROPIC_API_KEY` secret, optional) → Workers AI (`[ai]` binding,
  default, no key) → none (leave email queued for manual). The agent never handles the key (see §7).
  Currently runs on Workers AI. Adding the Anthropic key in Cloudflare auto-upgrades, no redeploy.
- `contract_no` on a `crew_intel` row is the crew's contract count snapshotted AT FILING; don't
  recompute it for already-filed rows (only the lazy backfill of legacy NULLs is allowed).

## 10b. NOT A BILLING PLATFORM — Miguel, 14 Sep 2026: "this is not a billing platform .. remember that"
`/api/daysworked` and `/api/billing/month` are **reference reads**. Neither is an invoice source.
A change to the board's data source is NOT a money change because those routes move — §1 (the money
gate) is about the **bonus**, and nothing else. A date on the Keyman board is a ROTATION fact: do not
translate a discrepancy into days, dollars, or payroll. This rule is in the brain (recz3DgTDbcf6RIA9)
because one session treated the console as a billing system; a second did it again on 23 Sep 2026.

**The loop, and why a stale Counter is not a defect** (his words): *"whats in the tdg import stay
forever .. rita create projections .. and when she is sure .. cta is trigger to joy for action and
the loop closes when u see it back in the keyman tab from the upload"*. Counter rows are never edited
or removed by the console — only the NEXT Contract Counter replaces them. Past its projected sign-off
is **overdue, not gone**. Dates are never hand-keyed; they come from the next Counter and we wait for
it. So the board disagreeing with the live TDG file is the loop still OPEN, not an error to
reconcile. Anyone with a login may upload the Counter; the dry-run lists every edit it would
override. The agent never infers, reconciles or corrects a contract date — ever.

## 10c. THE CONTRACT COUNT IS AN IMPORT, NOT A CALCULATION — Miguel, 24 Sep 2026
TDG publishes each seafarer's completed-contract count: `DG3 Printer Specialist Completed Contract as of
<date>.xlsx`, two tabs, **ACTIVE and INACTIVE**, four columns (CREW ID · CREW NAME · COMPLETED CONTRACTS
· POSITION). It is imported by `POST /api/contracts/count/import` (`src/contract_count.js`) into
`contract_count`, one row per crew, stamped with the file's as-of date. The Keyman board's Contracts
number and rank read that row; the date-derived count (`fullContracts` over Counter dates) is only the
fallback for a crew the file does not carry. Measured 24 Sep: the derivation was LOW on 18 of 41 crew
(Espenilla Zandro: TDG 7, derived 0) — the ≥6-month rule drops contracts TDG counts. Rules:
- **Both tabs or nothing.** A workbook missing ACTIVE or INACTIVE is refused (`need_both_tabs`).
- **A crew id that appears twice with different counts is never imported** (Paygane, Erik 517755: 2 and
  4 in the same file). Flag, never pick (§6). "Ongoing" is a junior with no completed contract: 0.
- **Two counts, never confused.** The CUMULATIVE completed count drives the grade (`psRank` /
  `psSalary`, display + HR): TDG's stated count when the file carries the crew, else seeded baseline +
  date-derived legs (`cumulativeContracts` in `contract_count.js`); every reader — crew list, Score
  Card, ledger, PDF statement — carries `contracts_source` and the page prints it beside the rank. The
  CONSECUTIVE bonus count (`crewCount` / `contractLedgerRow`, resets on gates) drives the ladder and
  payout and NEVER reads the imported count — that is §1. Pinned by `test/contract_count_import.test.js`.
- **The board says its own age** (`sources` on `/api/rotation`, `rotSourcesLine` on the page): when the
  Counter was last uploaded (or that it never was — a NULL `imported_at` is the bundled seed), and the
  count's as-of date. Nobody inside the console could see either until 24 Sep; Rita found both from outside.
- The two TDG contract files have different jobs and both live in the Brain in full: the DATES file
  (Contract Counter sheet, recIWAATss33kZKNZ) and the COUNT file (recM1e5dbyfvhfm5m). Never ask for either.

## 11. Invariants from the Session-6 audit (don't regress these)
- **Every API route must run under the error boundary.** The fetch handler wraps the whole dispatch in
  `return await (async () => { ...routes... })();`. Routes use `return apiX(...)` without their own await,
  so they MUST stay inside that wrapper — an unawaited rejection outside it escapes the try/catch and
  returns Cloudflare's raw 500 (this bit `/api/daysworked`). Keep new routes inside the wrapper.
- **Rank + the "Contracts" number come from FULL contracts, not raw Keyman legs** — via
  `fullContracts()` / `fullContractMap()` (`src/contracts.js`: ≤21-day gap = same contract; full =
  ≥5mo Azamara / ≥6mo others). Never feed `psRank` a raw leg count again.
- **Status is derived at read time from the SCHEDULE** (`scheduleBySc` + `crewStatus`/`deriveStatus`),
  consistently in apiCrew, apiRotation, AND apiDashboard. Don't reintroduce a raw-`crew.status` count in
  one view only (the donut/tiles must use the same derived set). Manual `crew_override.status` and the
  `retired` flag win over derivation. Status does NOT come from the historical Contract Counter.
  The ONE schedule is `boardLegs(env)` = current legs from the **Contract Counter** (`keyman_contract3`,
  the TDG file that carries sign-on / sign-off; `src/counter_legs.js` is the ONE definition, 2026-09-14)
  + crew aboard per the relief board (in-force `assignment` rows, `ship_leg_source.boardLegsFromDb`).
  `ship_leg` is no longer a source of current legs: it survives inside `counter_legs.js` only as port
  memory for the July snapshot and as the orphan arm (a snapshot leg whose crew has no Counter row).
  The relief printers, the roster export and the backup CSV read the same definition. A Counter leg
  past its projected sign-off is overdue, not gone: only Rita's recorded sign-off or the next Counter
  ends it. One crew may hold legs on two ships (jumpers); nothing collapses to one-per-crew. Never call
  `scheduleBySc()` bare — it used to fall back to the frozen `SHIP_HISTORY` constant, which is how the
  crew list and dashboard silently diverged from the board (pinned by `test/status_consistency.test.js`).
  The same schedule feeds the Score Card's default sign-on/off (`apiBonusCrew`) and the scoring queue
  (`apiScoreQueue`); no route loops over the `SHIP_HISTORY` constant directly — it is history backfill only.
- **Toggle checkboxes use the wrapper pattern:** `<span onclick="tgFlip(id)">` + the `<input
  type=checkbox style="pointer-events:none">`. Native label-wrapped checkboxes double-fire per tap
  (one flip cancels the other). Don't add a bare clickable checkbox.
- **Manual reassignment + manual ports go to `crew_override`**, never the base `crew` row — AdvancedQuery
  imports COALESCE onto the base row and would clobber a manual edit. The card pipeline must carry BOTH
  `embark` and `disembark` (a dropped field = the port silently never shows).
- **Keyman import refreshes matched crew only** and re-pins `KEYMAN_VERSION` so the bundled self-seed
  (`ensureKeyman`) can't overwrite it. Crew bridge is by name (km ≠ SC id). The self-seed only ever
  seeds an EMPTY `keyman_contract3` (2026-09-04, P3.13 H6): a version bump on a populated table is
  refused and logged, never applied. The bundled constant is a dated SNAPSHOT of prod regenerated by
  `scripts/keyman_snapshot.mjs` (never hand-edited; `KEYMAN_VERSION` = the snapshot date). Pinned by
  `test/keyman_seed_guard.test.js` + `test/keyman_snapshot.test.js`.
- **A NULL `imported_at` is never backfilled.** An import stamps `imported_at` on the rows it writes
  (since 2026-09-14); every row written before that carries NULL, and `resolveLeg` reads a missing
  stamp as "older than anything", so a recorded `contract_edit` outranks them. Writing a date onto
  those rows would silently flip the 8 crew whose Counter disagrees with Rita from her recorded
  sign-off to the Counter's projection. (ALL 47 rows carry NULL, not the ~33 first written here: no
  Counter has been uploaded through the console, so every row is the bundled July seed.) The
  origin of a legacy row is genuinely unknown: report it as not recorded (`counter.origin` on
  `/api/rotation/crew`), never invent one. A real fix is a fresh Counter upload, which stamps itself
  and shows every override in the dry-run diff BEFORE anyone clicks Apply.

- **Deploy is the only outbound to TDG from the board** (`src/keyman_deploy.js`, 2026-09-14). It sends
  Joy one email, THEN writes `deploy_log`, THEN removes the projection — in that order: a card must
  never leave the board for an email that did not go, and the log is written before the card goes. Recipient is `DEPLOY_TO`, else `TG_NOTIFY`;
  unset = refuse, never a default (the same rule as the TG loop). `DEPLOY_CC` defaults to Rita.
  Expired documents are ALWAYS a warning on the card, the preview and the email, and NEVER a block.
  The sent line clears itself when the next Contract Counter carries that seafarer — that is the loop
  closing, and it is the only thing that closes it. Restore rebuilds the card from the log.
- **A drop on the Keyman board creates or moves a PROJECTION, never a registry ship** (2026-09-15,
  `src/projection.js`, `POST /api/rotation/project`). Every card drags: a yellow card MOVES (the
  assignment changes ship; on the pool it is removed after one confirm); a green or pool card CREATES a
  yellow card on the target ship and stays where it is (one crew, two ships). Dates = the target ship's
  current printer sign-off if ahead, else today; + 6 months (+ 5 Azamara); the same ship twice is refused
  (`already_projected`). The old `/api/rotation/assign` (crew_override.vessel_observed) is retired: it
  produced an undated green, undraggable card. A crew with an open projection leaves the unassigned pool.
  Pinned by `test/projection.test.js` + `test/board_cards.test.js`.
- **Never read the whole itinerary table.** `vessel_port_day` is ~40k rows (one per ship per day, 2.5
  years); reading it on every board request was the "takes forever to save". `src/port_days.js` fetches
  only the card dates ±1 day per ship (three ≤5-term compound queries in the wave) plus the Azamara
  turnarounds; rotationSections and the relief board both use it. Pinned by `test/port_days.test.js`
  (real SQLite) and its static guard (`FROM vessel_port_day` with no WHERE/JOIN fails the suite).
- **The reliever picker shows status · ship · open projections · document standing** beside each name
  (`RELIEF_CREW_PICKER_SQL`, `/api/relief/crew`) and confirms before a double booking.
- **A failed board API must say so on the page.** `renderRotation` shows the HTTP status and error instead
  of an empty ship list (the 15 Sep empty-board incident hid a 500 behind a blank board).
- **`preview_urls = false` stays in `wrangler.toml`.** Non-production branch builds run
  `wrangler versions upload`, which uploads a version of THIS worker on the PRODUCTION D1/R2/MAILER
  bindings; with preview URLs on, Cloudflare serves it at a public `<version>-cims-hr-console...
  workers.dev` link posted on the PR — unreviewed code, real crew data. wrangler 3.x treats a MISSING
  key as ENABLED, so deleting the line silently re-opens it. Pinned by `test/wrangler_config.test.js`;
  the other half (Settings > Build > Branch control) is dashboard-only — see `docs/BRANCH_CONTROL.md`.

## 12. Performance invariants (2026-07-17 round-trip fix — don't regress these)
The D1 data is tiny and sub-millisecond; console latency is Worker->D1 ROUND TRIPS. Pinned by
`test/perf_invariants.test.js` (static guards, same approach as sqlsafety):
- **Hot read routes fire their queries as ONE concurrent wave** (`await Promise.all([...])`) —
  apiDashboard, apiCrew, rotationSections. Never add a sequential `await env.DB...` chain to a hot
  path; add the new query to the existing wave instead.
- **`ensure*` schema guards are memoized once per isolate** (`memoEnsure`, WeakMap-keyed by
  `env.DB`). Never call raw DDL per request. New `ensureX` helpers must be wrapped the same way.
- **Every `/api` response carries `Server-Timing`** — it is the measurement instrument; without it
  a perf regression is invisible. Keep the stamp in the fetch handler.
