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
is **overdue, not gone**. Dates are never hand-keyed by the agent; they come from TDG's files (since 7 Oct
2026 the AdvancedQuery's embark/debark, §10d; the Counter is history) and we wait for them. So the board
disagreeing with the live TDG file is the loop still OPEN, not an error to reconcile. Anyone with a login
may upload the Counter; the dry-run lists every edit it would override. The agent never infers,
reconciles or corrects a contract date — ever.

## 10d. THE SCHEDULE IS THE ADVANCEDQUERY — Miguel, 7 Oct 2026 ("rework the entire keyman tab around what I just explained")
Since 7 Oct 2026 the weekly AdvancedQuery carries **EMBARKEDDATE** and **DEBARKEDDATE** ("-" = blank). The
registry import keeps them on the file's row (`registry_snapshot.embarked_at / debarked_at`, never a crew
field) and the board's schedule is read from them (`ship_leg_source.legsFromRegistry`, pure, pinned by
`test/registry_schedule.test.js`). The rules, in his words and in order:
- **Sign-on = the embark date.** Full stop. The Contract Counter is **HISTORY ONLY**: it never seats, never
  dates a seat, never says overdue; a Counter contract the file carries (same crew, same hull, sign-on within
  `ABSORB_DAYS`) is dropped for the file's dates, the rest is served non-current (`foldCounterHistory`). A
  crew the file gives no dates for (an older file, no embark) keeps their Counter legs as before.
- **Sign-off**, the first the console knows: (1) **TDG's own word, final** — a DEBARKEDDATE on the row, the
  Counter's actual sign-off for the same contract, or the file's own **cross-over** (a second crew On board
  the same hull with a later embark: Wonder and Navigator on the first file); (2) **Rita's, the newer action
  wins** — the sign-off she typed for this contract (`contract_edit`, keyed `on_key` = the embark date; a
  legacy seq edit through the Counter position) or her **reliever card** on the same hull (its sign-on is the
  outgoing crew's sign-off); (3) **projected: embark + 7 months, Azamara 5** ("TDG does not say the sign-off
  until very late"). Every card says which (`offSource` tdg / rita / card / projected, `fileDatesNote`).
- **The swap.** When the reliever's sign-on has PASSED (file row or card), the outgoing contract ends that
  day — non-current, drawn "Contract completed" underneath with who relieved them — and the reliever holds
  the seat: from the file row if the file has them, else from the card, drawn green **"ABOARD · AWAITING
  TDG FILE"** (`awaiting`), Deploy and Remove kept. A card whose sign-on passed but that a file DATED AFTER
  it does not have aboard (ashore / elsewhere) is contradicted: it ends nothing and is off the board (§11).
- **The file absorbs the card** (registry apply, `cards_absorbed`): a card the file confirms aboard with an
  embark within `ABSORB_DAYS` of its sign-on is removed after the batch; a sign-off Rita CONFIRMED on it
  (OFF DATE) is kept first as hers for that contract (`recordSignoffEdit`). Wider than the window: the card
  stays (confirmed, one card: the seat absorbs it visually, Rita removes it).
- **Overdue** = a PROJECTED sign-off that passed: still current, red, "Past the projected sign-off". A tdg /
  rita / card sign-off that passed ENDED the contract. A dated On Vacation / Inactive / Reserved row is the
  last contract, ended by TDG (the Score Card's default span, the scoring queue's "signed off recently").
- **An edit lands on its contract's row** (`contractEditSlot`): the row filed under the on_key, else the
  requested slot when free or unkeyed, else the next free slot — a Counter contract's edit is never re-keyed.
  The Edit modal sends `on_key` (the seat's embark) and shows the file's row and where the sign-off comes from.
- Not touched by this: the relief board's printer legs, the backup CSV and the roster export still read the
  Counter (`fetchCurrentCounterLegs`, `roster_export.js`) — open item, not a seat.

**THE EARMARK LOOP** (Miguel, 7 Oct 2026, same day, `src/earmark.js`, pinned by `test/earmark.test.js`): "all the
projections, people who are not on board but they're coming on board, we're going to call them earmarks". Rita's
open card and TDG's "Earmarked" row are ONE thing from two sides. **The Deploy button is gone** (Miguel, same evening:
"this deploy CTA does not need it anymore .. the logic is not like that no more"): Joy is told from the IMPORT REVIEW,
row by row — the console and TDG sync at Rita's upload, in both directions. The board says
EARMARK (never "placeholder" / "projection"): `EARMARK` (console only), `EARMARK · SENT TO TDG`, `EARMARK · TDG`
(the file earmarks them too). When the earmark's sign-on arrives it is the active seafarer: a GREEN-background
card "ABOARD · AWAITING TDG FILE" (`.rcard.awaiting`); the next file that has them On board makes it the ordinary
TDG card and absorbs the card. Each registry upload compares the two sides (`earmarkDiscrepancies`), row by row
in the review, Rita's decision per row, the rest of the file applies regardless:
- Discrepancies: `hull` (TDG earmarks / has them aboard on another ship), `other_person` (TDG earmarks SOMEBODY ELSE
  for the hull of Rita's future earmark, and not hers), `inactive` (Inactive / Not for Rehire), `not_aboard` (an aboard
  card a LATER file does not have aboard), `embark_date` (embark more than `ABSORB_DAYS` from the sign-on). TDG's
  Earmarked rows carry no dates, so a file can only disagree on the hull or the status until the crew embarks.
- **`not_in_tdg`** (the Deploy CTA, moved into the review): a FUTURE earmark TDG neither earmarks nor seats on that
  hull. Three choices, **Not yet** the default (a plan Rita is not sure of must reach nobody): **Tell Joy** emails the
  earmark with the full record (mode `add`, "please enter this earmark in TDG") and stamps the card SENT TO TDG
  (`deployed_at`, `markTold`); **Drop mine** removes it. A told earmark TDG still lacks comes back as the same row
  saying "told Joy <date>". Consequence, stated to Miguel: Joy learns of a new earmark at Rita's next upload, not the
  day Rita decides.
- **Accept** (default — "follow the TDG file always"): hull → the card MOVES to TDG's ship, Rita's dates kept;
  other_person → Rita's card goes and TDG's seafarer gets the card; inactive / not_aboard → removed; embark_date →
  absorbed (the file's row is the seat). **Keep mine**: the card stands and Joy gets ONE email per seafarer
  (`hr.keyman.earmark_discrepancy.v1`, Deploy's recipient + `DEPLOY_CC`, CIMS letterhead, critical) with the
  record, the earmark against the file's word and every document, so TDG is corrected before the next import.
  The emails are listed in the review BEFORE Apply; no recipient configured = reported, never guessed.
- A TDG earmark with no card for that crew becomes a console earmark on Apply (`createEarmarkCard` = the drag
  path: sign-on = the hull's current printer's projected sign-off else today, + 7 months; Rita adjusts). Skippable
  per row. A crew with a card elsewhere is a discrepancy row instead — one path acts, never two.
- **Every earmark card carries Remove, TDG's own included** (`apiEarmarkDismiss`, `earmark_dismiss`): removing a
  TDG earmark (or a console card TDG also earmarks) records the (crew, hull) as REJECTED — not drawn, not re-created
  by the next Apply while the file that showed it stands; a LATER file still carrying it brings it back (Joy did not
  correct TDG) — removes the card if any, and offers to tell Joy (mode `reject`, "CIMS does not plan this seafarer
  for this ship"). The console never changes TDG; Joy does.
- **The ship's timeline + the card's progress bar** (Miguel, 7 Oct 2026, evening: "a timeline from the sign-on of the active
  crew to the sign-off of the last earmarked crew ... so visually we see how far the ship is covered"; "this should be
  progress bar", variant C). `shipTimeline(sec)` on the page draws one line per ship header, its own full-width row under the
  name: one segment per crew in the chain (green aboard, dashed when the sign-off is projected; light green awaiting the file;
  yellow earmark, darker when TDG earmarks them too), a tick with the calendar date under every boundary, the name above,
  TODAY, a FUTURE gap between contracts red, two crew at once on two lanes, an open end faded to its projected date. Horizon
  = the active crew's sign-on → the last earmark's sign-off (Miguel's choice over a fixed 12-month window — every ship fills
  the width, so coverage depth is read off the end date). The header is the NAME, the LINE and a chevron — no brand, no
  counts (Miguel, same evening: "we don't need to have this royal one on board ... it has to be a little bit of a luxury
  feeling"): a 3px line, hairline ticks, 10.5px type in two greys, soft fills; the ghost slot and the relief banner say
  "off in 1 mo 22 d", never "OFF IN 53D". The seat card lost its lane, dots and TODAY tick: a thin soft bar (4px) filled
  to today (soft red when overdue, a dashed track for an earmark), the two calendar dates under it as before — Miguel, same
  evening, when a first cut dropped them for an "aboard / to go" row: "you eliminated the dates ... we had them very, very
  well done earlier ... this progress bar should be more gentle". How long aboard is the status line, how long to go is the
  chip; neither is repeated under the bar. Dates on the card and the history read "Sep 22, 2027" (`fmtDateS`), the chip
  reads calendar months + days (`spanCompact`), never a bare day count. Pinned by `test/board_cards.test.js`. Mock-ups under `docs/mockups/`.
- The sources line names the FILE that dates the board first ("TDG file <date> · N crew, M with embark dates"); the
  Counter is "(history)", never warned about. Nothing here is money (§1) and nothing resolves a disagreement without
  Rita (§6).

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
- **The board says its own age** (`sources` on `/api/rotation`): when the Counter was last uploaded (or that it
  never was — a NULL `imported_at` is the bundled seed), the count's as-of date and the kept TDG file's date.
  Nobody inside the console could see either until 24 Sep; Rita found both from outside. **The page line is
  gone** (Miguel, 7 Oct 2026 evening: "remove this" — the "Keyman · 48 ships" heading, the hint and the sources
  line above the ships); the API still carries `sources`, the Keyman tab starts with the first ship.
- The two TDG contract files have different jobs and both live in the Brain in full: the DATES file
  (Contract Counter sheet, recIWAATss33kZKNZ) and the COUNT file (recM1e5dbyfvhfm5m). Never ask for either.
- **DECIDED, Miguel 5 Oct 2026: the seeded baseline counts the contracts BEFORE the Counter's first one.**
  So baseline + full contracts derived from Counter dates (the fallback for a crew the count file does not
  carry) never double counts by definition. Do not re-raise.

## 11. Invariants from the Session-6 audit (don't regress these)
- **Every API route must run under the error boundary.** The fetch handler wraps the whole dispatch in
  `return await (async () => { ...routes... })();`. Routes use `return apiX(...)` without their own await,
  so they MUST stay inside that wrapper — an unawaited rejection outside it escapes the try/catch and
  returns Cloudflare's raw 500 (this bit `/api/daysworked`). Keep new routes inside the wrapper.
- **Rank + the "Contracts" number come from FULL contracts, not raw Keyman legs** — via
  `fullContracts()` / `fullContractMap()` (`src/contracts.js`: ≤21-day gap = same contract; full =
  ≥5mo Azamara / ≥6mo others). Never feed `psRank` a raw leg count again.
- **THE KEYMAN BOARD IS TDG'S FILE, AND WHAT IS WRONG** (Miguel, 5 Oct 2026, Brain recddHTPgWjLy39AU: "TDG is
  the one true source of knowledge ... force the Keyman tab to display what is in the TDG item, and ... what is
  wrong. We created a yellow thing ... as a placeholder ... If ... you know that that person ... completed his
  contract, ... underneath as a contract completed"). `src/board_truth.js` holds the rules, `rotationSections`
  applies them; nothing is written.
  **Green** = the latest AdvancedQuery has the crew On board a hull the console knows (`fileWordBySc` over
  `registryFromStore`), the crew is still in the file, and the console does not KNOW that contract completed.
  Dates come only from a leg still running on that hull (`liveLeg`); none = "No contract dates yet" + a row.
  **Yellow** = Rita's PLACEHOLDER (an open assignment). An in-force card on the file's hull is absorbed into
  the seat (rendered once, green "ABOARD · TDG REGISTRY", Remove kept); one on any other hull is drawn yellow
  with the file's verdict. **Underneath** = "Contract completed": only legs whose sign-off has passed.
  KNOWN completion (`completedOff`) = a recorded sign-off on that hull, past, within 180 days, nothing current
  on it since; an overdue Counter leg (projected sign-off passed, nothing recorded) is NOT one (§11).
  **What is wrong** = `issues` on `/api/rotation` (`boardIssues`), drawn as "TDG says otherwise · N" on the
  Keyman tab with a count — since 6 Oct 2026 ONLY what a person acts on: empty hull per the file, a card the
  file contradicts (overridden), an active file row the roster lacks (file_only), a status word the console
  cannot read (status_unread), an unknown or missing ship (unknown_ship / onboard_no_ship). NOT rows (they
  were until 6 Oct): a recorded completion the file still has aboard (drawn underneath), the Counter
  mid-contract where the file has no seat (history, "ended per TDG file"), a crew dropped from the file, a
  seat without dates, an earmark, a Retired tag the file overrides. Rita settles every row; the console never
  resolves one (§6, 7 Sep rule).
  **Gone** (do not restore): the seat read off `crew.vessel_observed`, the schedule "self-heal" placement and
  its SHIP_HISTORY backfill, the released-seat detour, the second-hull (jumper) draw and its ALSO ON tag —
  each was the console deciding where a seafarer is. One crew may still hold Counter legs on two hulls: the
  one the file does not name becomes history ("ended per TDG file"), not a row. Deploy on a card the file contradicts warns in red and asks
  once more (warn, never block). Pinned by `test/board_truth.test.js`, `test/released_seat.test.js`,
  `test/board_cards.test.js`, `test/registry_sync.test.js`.
- **THE BOARD APPLIES THE FILE** (Miguel, 6 Oct 2026: "if a crew is added?? u added it.. if a crew is removed?? u
  remove .. if a crew finish his contract.. u move it as history .. that the logic"). On top of the rules above:
  TDG **Earmarked X** is drawn on X as "EARMARKED · TDG" (no card needed; drag it to plan dates); Rita's card the
  file contradicts (`ashore` / `elsewhere`) is **off the board** — not deleted (§6), listed with a Remove button;
  a Counter leg that started on a hull where the file no longer has the crew On board (or they left the file) is
  **history**, ended on that file's date ("ended per TDG file") — a card is a placeholder and never history. The
  list ("TDG overrides · to clean up") holds only what a person acts on: an empty hull, an overridden card, an
  active file row the roster lacks, an unreadable status. NOT rows: a crew not in the file, a seat without dates,
  a stale Counter leg, an earmark, a Retired tag / status edit the file overrides (every screen shows the file's
  word and the import clears them), a recorded sign-off TDG has not caught up with (shown completed).
  A crew tagged Retired whom the file has On board / Earmarked loses the tag and its manual status on Apply
  (`unretireItems`, default Clear tag, audited; "Keep Retired" per row) — the tag still gates the roster export
  and GSM reviews, so leaving it would keep an active seafarer out of both.
- **Status is TDG's word, everywhere** (`crewStatus`, `src/crew_status.js`, 5 Oct 2026), consistently in
  apiCrew, apiDashboard, apiCompliance, rotationSections, the feedback board, the data page and the doc radar:
  0. (6 Oct 2026) the KEPT file (`registry_snapshot`, via the shared join as `tdg_status` / `tdg_raw`) saying On
  board or Earmarked wins over everything below — Valdesco, tagged Retired, On board Brilliance per TDG. TDG's
  "Reserved Crew" reads On Vacation (the vessel beside it is the last ship), "Not for Rehire" Inactive. The join
  aliases the snapshot's columns in a subquery: a plain join made every reader's `SELECT agency_id, status`
  ambiguous (pinned on real SQLite by `test/tdg_join_sql.test.js`);
  1. the manual `retired` flag; 2. a manual `crew_override.status` (listed on the board where it disagrees with
  the file); 3. not in the latest file (an open `presence` flag) → "Not in TDG file"; 4. the file's word
  (`crew.status`, written by every registry upload, D6) — except On board where the console KNOWS the contract
  on the file's hull (`tdg_ship`) ended (`knownCompleted`: a recorded sign-off, nothing aboard since, ≤180 days)
  → On Vacation; 5. no readable word → derived from the schedule (`deriveStatus`, incl. the overdue rule).
  Every crew read that feeds `crewStatus` carries `tdg_absent` + `tdg_ship` through ONE shared join
  (`TDG_ABSENT_JOIN` / `TDG_ABSENT_COL`) — no extra round trip (§12). Until 5 Oct the schedule outranked the
  file: a July Counter leg kept a crew On board after TDG said otherwise. Pinned by
  `test/status_consistency.test.js`.
  The ONE schedule is still `boardLegs(env)` = (since 7 Oct 2026, §10d) current legs from the **AdvancedQuery's
  embark/debark** (`registry_snapshot`, `ship_leg_source.legsFromRegistry`) + the **Contract Counter** folded
  in as history (`keyman_contract3`, `src/counter_legs.js`, current only for a crew the file does not date)
  + crew aboard per the relief board (in-force `assignment` rows); it dates the seats and feeds the overdue
  rule. (The relief printers, roster export and backup CSV still read the Counter — §10d open item.) A leg
  past its PROJECTED sign-off is overdue, not gone: TDG's word, Rita's date or a reliever ends it. Never call
  `scheduleBySc()` bare — it used to fall back to the frozen `SHIP_HISTORY` constant. The same schedule feeds the
  Score Card's default sign-on/off (`apiBonusCrew`) and the scoring queue (`apiScoreQueue`).
- **Toggle checkboxes use the wrapper pattern:** `<span onclick="tgFlip(id)">` + the `<input
  type=checkbox style="pointer-events:none">`. Native label-wrapped checkboxes double-fire per tap
  (one flip cancels the other). Don't add a bare clickable checkbox.
- **THE CREW CARD IS THE TDG ROW** (Miguel, 6 Oct 2026: "data about the crew .. new data ?? goes stat right to the
  crew card .. if it gets removed?? .. ensure you remove it from the crew card"). The AdvancedQuery import
  defaults every value onto the card: status (D6), certificates, the SHIP ("Take TDG", the fixed `shipTakes`
  statement — never the field-update path), and a value under a manual entry (D3 now defaults Accept and clears
  that override field). An EMPTY cell in a column the file carries clears the card (`CLEARABLE` in
  `crewimport.js`; never agency id, first/last name or status); a column the file lacks clears nothing.
  "Keep board" / "Keep mine" / "Hold" / "Dismiss" remain Rita's per-row choices in the review, and every change
  is audited. Pinned by `test/crew_apply.test.js` and `test/crew_import_routes.test.js`.
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
  Joy one email, THEN writes `deploy_log`, THEN marks the card sent (`assignment.deployed_at`,
  `deploy_log_id`) — in that order: nothing is stamped for an email that did not go, and the log is
  written before the stamp. **The card STAYS on the ship** (Miguel, 5 Oct 2026, after his first Deploy
  left Jewel blank: "Yes, keep the card"): it shows "SENT TO TDG <date>", its button reads "Sent <date>"
  and a second send asks first (`already_sent` unless `resend`); it leaves only when the Counter absorbs
  it or Rita removes it. Cards removed by the pre-5-Oct rule still show the one-line note with Restore.
  Recipient is `DEPLOY_TO`, else `TG_NOTIFY`; unset = refuse, never a default (the same rule as the TG
  loop). `DEPLOY_CC` defaults to Rita. Expired documents are ALWAYS a warning on the card, the preview
  and the email, and NEVER a block. The sent note (legacy) clears itself when the next Contract Counter
  carries that seafarer — that is the loop closing. Restore rebuilds a removed card from the log.
- **An overdue Counter leg takes TDG's registry status** (Miguel, 5 Oct 2026: "we follow TDG file").
  A leg still current whose projected sign-off has passed with nothing recorded is overdue, not gone
  (the seat is held) — and its status is whatever the last AdvancedQuery said for that crew
  (`contracts.deriveStatus`, `REGISTRY_STATUSES`), On board when the registry has no word. It used to
  read as "signed off" → On Vacation, then Retired after six months, while the board held the seat.
- **The Keyman card says what the last registry file said about every projection, at read time**
  (`src/registry_sync.js`, 2026-10-05; Miguel: "if the person is onboard .. and rita has already a card in
  there .. it should automatically compare with what the tdg file has", then an hour later "still see no
  updates in the console"). Gayda sat on Jewel as "not in a TDG file yet" through five AdvancedQuery
  uploads because that import never looked at the board. The verdict is DERIVED in `rotationSections`,
  like status — never a column written at upload: each apply keeps the file's row per crew
  (`registry_snapshot`: status + `vessel` as the file said them, stamped with the run; rows the latest file
  does not carry are removed), and a crew without a row yet (every crew until the first upload after 5 Oct)
  is BOOTSTRAPPED: status = the latest run's status audit row (the file's status even where Rita HELD it),
  else `crew.status` (unknown under a manual status edit); hull = the newest ship flag of ANY state (the last
  hull the file named — open, or closed because the board matched or it was taken/dismissed), else the
  registry column — but NOT against an in-force card on a different hull that started after it (the import
  is silent when the file agrees with the board, so an older hull cannot be told from a current one: Calang,
  flag Edge 22 Aug, card Silhouette 5 Sep → unknown, card stays a placeholder). The line is dated by the
  LATEST file (`lastRun`); a flag stamped when FIRST raised prints "named <date>" beside the hull. A crew
  under an open `presence` flag (absent from the latest file) gets no word at all.
  An open ship flag now closes when a later file agrees with the registry (`reconcileShipFlags` `agree`).
  **The bootstrap is a REBUILD, and the page says so** (Miguel, 5 Oct 2026: "I dont think so u are reading
  well the tdg file"): until `registry_snapshot` holds rows, "TDG says otherwise" carries a note, every
  rebuilt hull prints "(ship named <date>)", and an empty hull reads "in the TDG uploads the console kept",
  never "per the TDG file". Re-dropping the LATEST applied file (same hash) fills the snapshot under that
  run's id and date and writes nothing else (`keepCopyOfAppliedFile`); an older file or a run already
  copied keeps nothing. The snapshot keeps the file's own `name` and `raw_status`: a file row the roster
  does not carry is a `file_only` row (or "hidden on the console" for a redacted crew), and a status word
  `normalizeStatus` cannot read is a `status_unread` row — it used to vanish and leave the old status.
  Verdicts:
  **confirmed** (file: On board, same hull by the strict matcher, and the card says aboard NOW — a next
  contract projected on the same hull stays a plan) draws GREEN, keeps Rita's dates (the registry has
  none) and offers no Deploy; **elsewhere** (the card says aboard HERE, the file has them
  aboard elsewhere — or TDG earmarks them elsewhere) and **ashore** (card aboard, file On Vacation /
  Inactive / Earmarked) stay yellow and print the file's word; **earmarked / pending** inform — a crew
  aboard one hull today with a FUTURE plan on another is normal, not a contradiction. The file can only
  contradict what it could see: a card is "aboard, the file disagrees" only when its sign-on is BEFORE the
  file's date (Pintucan, 6 Oct: joining the day after the file is pending, not ashore). Nothing is removed;
  the Counter still absorbs the card when it carries the leg; a crew the file does not carry gets no
  verdict. The three reads ride the board's wave (§12); the projections reach the importer only through
  `deps.openProjections` (= `fetchOpenAssignments`) for the review screen. Pinned by
  `test/registry_sync.test.js`, `test/crew_import_routes.test.js`, `test/board_cards.test.js`.
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

## 11b. Invariants from the 5 Oct 2026 correction pass (three reviews, 24 defects — don't regress these)
- **An edit belongs to a CONTRACT, never to a position.** Every join from `keyman_contract3` to `contract_edit`
  is by `on_key` (= the leg's sign-on), `seq` only for an edit older than the column — `counter_legs.js`,
  `ship_leg_source.fetchRecordedSignoffs`, `counter_sync.editFor`. A seq join hands Rita's recorded sign-off to
  whatever contract a multi-block Counter renumbers onto that seq. The recorded sign-off also obeys "the newer
  write wins": a Counter stamped after the edit reopens the leg; `act_off` always counts.
- **One identity ladder for both TDG files** (`keymanimport.buildBridge/bridgeName`, reused by `contract_count`):
  cruise-line id, full name, first word, a unique surname only when the first names agree, swapped columns. Two
  roster crew on one key resolve nobody; two file rows resolving to one crew are a COLLISION — neither imported,
  both listed (§6). A blank cruise-line id reaches the ladder; a repeated id in the count file is a defect only
  when the counts differ.
- **The count file says its own date.** No as-of in the filename → `need_as_of`; a file older than the count
  loaded → `older_than_loaded` unless the screen forced it; rows the new file does not carry are listed and
  removed on apply (ACTIVE + INACTIVE is the whole population; §10c: no TDG row → the derived number). The
  board's fallback Contracts number is `cumulativeContracts` WITH the baseline, like every other reader.
- **Deploy reports what happened after the email.** The mail going is the truth (`ok, sent`); a log or remove
  failure is `logError` / `removeError`, never "Not sent" (a retry emailed Joy twice). The payload carries the
  workflow stamps and the card's comments; Restore claims the line first, re-inserts the comments, and refuses
  while the original card is still on the board. The "sent to TDG" line closes ONLY on a Counter leg within
  `ABSORB_DAYS` of the deployed sign-on — never on "any green card for that crew".
- **A move is a create.** Changing an open projection's ship runs `unknown_ship` / `already_projected`; a blank
  sign-on defaults to today (NOT NULL), clearing it is refused. A yellow card opens ITS projection (`aid`).
- **The registry import survives its own file**: a repeated agency id (last row stands, reported), a row keyed
  on the cruise-line id (carried under the real agency id), presence flags deduped while open and closed on
  reappearance, an open ship flag closed when a later file agrees with the registry.
- **A plan that starts after the file's current contract ends is the next contract**, not a conflict
  (`counter_sync.diffCounter`). Dashboard birthdays and tiles use the derived status and visible crew.

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
