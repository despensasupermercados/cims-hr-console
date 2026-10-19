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
The nightly agent is **"Cims night watch"** (scheduled Claude task, 02:45 America/New_York, run inside Miguel's own Claude Code session that holds the repo + Cloudflare + GitHub + Brain — a fresh-session routine could not be given them, 16 Oct 2026 "figure it out";
runbook `docs/NIGHT_WATCH.md`, Miguel 16 Oct 2026: "add a night watcher to look for bugs and fix it"): health first (the
suite on main, deployed = main, last night's jobs from D1, read-only), then one area of the code a night by weekday;
every fix is a PR "Night watch: …" with a failing-first test. The GitHub Action `nightly-self-maintenance` is manual-only
since that day (its nightly runs were refused 8 tool calls and changed nothing).
**The night watch MAY merge its own SMALL fix** (Miguel, 16 Oct 2026, asked "draft PRs only" or "merge small fixes":
"Merge small fixes") — a sixth line on the whitelist above, and only when ALL hold: CI `test` green on the PR head; the full
suite green locally; its new test proven to FAIL on the old code; at most one merge a night; and
`node scripts/night_merge_gate.mjs origin/main <branch>` prints `MERGE_OK` — the gate refuses money (bonus / Score Card /
supervisor eval, §1), auth, migrations and any added or changed D1 write or schema statement in `src/` (crew data, schema),
the TDG import paths, the intel pipeline (what is filed on a seafarer, and on whom), email templates (Miguel signs off a
render), `wrangler.toml`, `.github/`, dependencies, a diff with no test, more than 120 changed lines in `src/`, and (17 Oct 2026, #281 passed by file alone) a hunk in ANY `src/` file that lands inside or names the money or auth path (`MONEY_RX` / `AUTH_RX`, git's hunk header names the function — `worker.js` holds most of both). After a
merge it proves the deploy live (§9) and names the merge in its digest; a deploy it cannot prove, or a red main, gets a
revert PR and a flag. Everything the gate refuses stays a draft PR for Miguel. Pinned by `test/night_merge_gate.test.js`.

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
**Proving it is the agent's job, never Miguel's** (13 Oct 2026: "I told u .. dont ask me to prove the merges.. u go
ahead and do it"). When the agent's network cannot open cims.work, prove the deploy through the deployed worker code
(Cloudflare `workers_get_worker_code`, grep for the new functions) and the D1 rows/schema the change needs, and report
what was proven and what could not be — never ask Miguel to open the site to check.

## Project facts
- 7 full users (Miguel, Rita + 5 contributors, added 2026-06-12 by Miguel's explicit decision).
  **Money actions (bonus commit, baseline) are restricted to Miguel + Rita** (`MONEY_USERS` in
  `policy.js`). Do NOT widen `@dg3.com` into role 'full'. Crew never log in.
- Auth: magic-link (stateless HMAC token) + bootstrap dev-login; 30-day signed-cookie session (Miguel, 9 Oct 2026:
  "30 days" — it read 12h here while the code said 30 days); the allowlist is re-checked on every request (§11c).
  **One sign-in for every *.cims.work host** (14 Oct 2026, Miguel could not enter audit.cims.work while signed in on
  cims.work): the session cookie carries `Domain=cims.work` there (`cookieDomain`), an older host-only session is re-issued
  when the console opens, logout clears both; audit.cims.work's login reads "Printshop Audit". Pinned by
  `test/audit_signin.test.js`.
- DB: Cloudflare D1 `cims-hr-console` (id f0ac8b6a-deac-4214-8f42-e22b202d7d7d).
- Bonus count is event-sourced from `bonus_outcome` (append-only); never overwrite history.

## 10. Field intel (crew-reports@cims.work) — qualitative, NEVER money
The intel pipeline (Session 5) lets anyone email crew-reports@cims.work; AI summarises and files a
dated card on the crew. Hard rules:
- **It is SEPARATE from the scored bonus.** Intel is narrative field knowledge — it must never feed,
  adjust, or be confused with `bonus_outcome`, baselines, or payout. Keep the two code paths apart.
  **One exception, Miguel's decision of 15 Oct 2026** ("if you read that he usually sends you feedback about a problem
  with order accuracy, automatically set it to zero ... Allow Ray to rectify that"; confirmed "yes" the same day): a field
  report dated inside a contract that names an ORDER-ACCURACY or PAR problem PRE-FILLS that Score Card factor at 0
  (`score_auto.js`, rule in `bonus.js autoScore`), only with the report's own words as the quote (`parseFlag`), until Ray
  answers after it. It is a pre-fill a money user sees and can move, never a write to `bonus_outcome`; the intel pipeline
  itself is unchanged.
- **Identity stays deterministic.** Which crew an email is about is decided by `crewmatch.js`
  (high/med auto-file; low/none → human review queue). The LLM writes the summary only — it must
  never pick the crew. A wrong match is a false record on the wrong seafarer.
- **Engine preference:** Claude (`ANTHROPIC_API_KEY` secret, optional) → Workers AI (`[ai]` binding,
  default, no key) → none (leave email queued for manual). The agent never handles the key (see §7).
  Currently runs on Workers AI. Adding the Anthropic key in Cloudflare auto-upgrades, no redeploy.
- **A thread is a dated timeline** (16 Oct 2026, Ray Guerra on Ryan Marto's record; Miguel: "I think the AI mixed the notes on
  how it was originally by dates"). The forwarded emails run for months; the first prompt asked for ONE "What happened", so
  Marto's May–October threads became stories filed on the forwarding day: a projected end-of-September count written as a
  stock-out, the 8 Oct cost email read as the dispatch date, "no disciplinary action" and "no-return list" in one card, the
  AI's "Recommended action" read as Ray's. `intelSystemPrompt` now asks for one line per message, oldest first, each with
  its own date and who said it; a forecast stays a forecast; "Asked of the crew" and "Decision" quote the thread, never the
  model. Marto's 3 cards were replaced (status `replaced`, kept; backup `bak_crew_intel_marto_20261016`, activity
  `act_intel_marto_20261016`) by 4 written from Ray's emails, dated by event (6 May, 3 Jun, 2 Sep, 8 Oct). Cards filed
  before the prompt change keep the old shape; correcting another crew's is per record, from its source emails, never in
  bulk. Pinned by `test/intelai.test.js`.
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
  **Rita's typed date outranks the cross-over** (Miguel, 17 Oct 2026, on Kevin Jugao, Pursuit: the 16 Oct file has his
  relievers aboard, Rita typed 31 Oct, TDG still lists him On board — "Rita's typed date"): a sign-off she typed for the
  contract wins over the file's cross-over (source `rita`), the file's second crew still named as the reliever; the held
  rule still applies once her date passes. On the 16 Oct file it moved Jugao 16 Oct → 31 Oct and Valderrama (Enchantment,
  Suarez embarked 3 Oct) 3 Oct → 31 Jan 2027; Belhida (Apex) reads 7 Oct either way. Pinned by `test/registry_schedule.test.js`.
- **The swap.** When the reliever's sign-on has PASSED (file row or card), the outgoing contract ends that
  day — non-current, drawn "Contract completed" underneath with who relieved them — and the reliever holds
  the seat: from the file row if the file has them, else from the card, drawn green **"ABOARD · AWAITING
  TDG FILE"** (`awaiting`), Deploy and Remove kept. A card whose sign-on passed but that a file DATED AFTER
  it does not have aboard (ashore / elsewhere) is contradicted: it ends nothing and is off the board (§11).
- **HELD: TDG's On board wins** (Miguel, 8 Oct 2026: "we follow what tdg has in the software", on Belhida / Reyes /
  Villacortes — relievers aboard since 2 and 7 Oct, TDG still listing them On board). The file's cross-over DATES the
  outgoing sign-off but is no longer final. Any sign-off that is not TDG's final word (cross-over, Rita's typed date,
  a reliever card) that has passed while the latest file — dated ON or AFTER it — still has the crew On board that
  hull with no DEBARKEDDATE keeps the contract CURRENT (`heldByFile`): status On board, the card red "TDG still has
  them On board, past the sign-off (X embarked <date>)", never a recorded sign-off. Only TDG ends it (debark date,
  Counter actual sign-off, or a file that no longer has them On board). A sign-off AFTER the file's date (the file
  could not see it) still swaps as below. Two crew aboard one hull sit side by side, ordered by sign-on like the
  timeline. Pinned by `test/registry_schedule.test.js`. This replaces the swap/cross-over-ends rule of 7 Oct.
- **The file absorbs the card** (registry apply, `cards_absorbed`): a card the file confirms aboard with an
  embark within `ABSORB_DAYS` of its sign-on is removed after the batch; a sign-off Rita CONFIRMED on it
  (OFF DATE) is kept first as hers for that contract (`recordSignoffEdit`). Wider than the window: the card
  stays (confirmed, one card: the seat absorbs it visually, Rita removes it).
- **A PROJECTED sign-off lands on a turnaround day** (Miguel, 8 Oct 2026, Alonzo's Allure card ending Jun 29, 2027 in
  Willemstad: "Curaçao is not a turnaround port ... look at the 7 months, I also want you to look at the turnaround
  port, not the middle of the voyage. Even if you are a couple of days shorter or a couple of days over, it's okay
  because it's a projected day ... Always look for the turnaround days"). `src/turnaround.js` (pure): the raw embark + 7
  months (Azamara 5) moves to the NEAREST turnaround day of the hull's itinerary (`vessel_port_day.is_turnaround`,
  `fetchTurnarounds`: one bounded query in the board's wave, −45 days to +15 months, ~3,800 rows, never the whole
  table), a tie to the later day, nothing within ±14 days → the raw date stands (`offSnapped` = days moved, the
  turnaround port as the disembark port). Applied in ONE place per path: the board's seat (`legsFromRegistry`,
  `turnarounds` map riding on `boardLegs` non-enumerably for the bench) and every projection route
  (`defaultProjectionDates` + `createProjection` with `deps.turnarounds` = `fetchShipTurnarounds`: the drag, the one-tap
  bench, the TDG-earmark card; `off_port_seed` = the turnaround port). TDG's debark, Rita's typed sign-off and a reliever
  card's sign-on are never moved. The card says "projected, 7 months after embark on the turnaround". Pinned by
  `test/turnaround.test.js`. The 13 open cards dated before this rule still end mid-voyage: re-snapping them is Miguel's
  call, never silent.
- **Overdue** = a PROJECTED sign-off that passed: still current, red, "Past the projected sign-off". A tdg /
  rita / card sign-off that passed ENDED the contract. A dated On Vacation / Inactive / Reserved row is the
  last contract, ended by TDG (the Score Card's default span, the scoring queue's "signed off recently").
- **An edit lands on its contract's row** (`contractEditSlot`): the row filed under the on_key, else the
  requested slot when free or unkeyed, else the next free slot — a Counter contract's edit is never re-keyed.
  The Edit modal sends `on_key` (the seat's embark) and shows the file's row and where the sign-off comes from.
- **The relief board's printer is the board's seat** (Miguel, 8 Oct 2026, Anthem: "dont have the option to create
  earmark"): `reliefBoardData` reads `boardLegsFromDb` (current legs, Rita's relief cards out, newest sign-on first,
  `printerLegsFromBoard`) instead of the Counter alone. Caag (Anthem, embarked 7 Sep per the file, absent from the
  Counter) had no printer, so the board drew no "Add earmark" slot: 21 hulls on 8 Oct data (25 → 46 with a slot, none
  lost). Recorded sign-offs and the held rule are applied once, in the board schedule. A ship whose last earmark has
  joined keeps an "Add earmark" slot for the NEXT one (`data-aid="new"`, the relief panel opens a new reliever who
  relieves the one aboard). Pinned by `test/relief_printers.test.js`. Still on the Counter: the backup CSV and the
  roster export (`fetchCurrentCounterLegs`, `roster_export.js`) — open item. (11 Oct 2026, closed for the export's
  placement: a crew TDG has On board is placed from `registry_snapshot` when the Counter/relief board give no sign-on
  or an older one — `roster_export.placeFromRegistry`, pinned by `test/roster_export_registry.test.js`, PR #198. Why:
  the 8 Oct rebuild of in-force contracts/assignments left 17 printers TDG had aboard with no ship in the export, and
  cims-timecard counted 30 ships owing a card against 47.)
- **THE 7 OCT FILE IS THE ONE TRUE SOURCE — Miguel, 11 Oct 2026: "keep the one from oct 7 as the one true source of
  knowledge and u start counting from there."** Who is aboard and since when is the AdvancedQuery (`registry_snapshot`),
  read through the rules above. The daily "Cims keyman board guard" scheduled task — which every morning deleted
  `keyman_contract3` and re-seeded it from the frozen `ship_leg` snapshot (`keyman_version` 2026-06-13-cc-v3) — is
  DISABLED as of 11 Oct 2026: it pinned the board to June, wiped any newer Counter upload, and contradicted §10d.
  Do not re-enable it or re-seed `keyman_contract3` from `ship_leg`; the Counter is history and stays as last uploaded.

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
- **AN EARMARK FOR A CREW ABOARD ANOTHER SHIP** (Miguel, 8 Oct 2026: Guazon aboard Liberty, earmarked Allure — "TDG
  ... doesn't really allow them to have one person on board the ship assigned to multiple ships ... when that crew signs
  off, you will email Joy and CC Rita"). A not_in_tdg row whose crew the file has On board ANOTHER ship is `waiting`
  ("Keep waiting" / "Drop mine", nobody emailed). The upload whose file no longer has them aboard that ship — read
  against the previous file (`registry_snapshot`, read at stage BEFORE apply replaces it, `previous`), or the file alone
  (ashore with a DEBARKEDDATE on another ship within `SIGNED_OFF_DAYS` = 30 of the file's date) — makes it `signed_off`:
  **Tell Joy is the default** (mode `signed_off`: "X signed off A on <date>. Please earmark X in TDG for B, sign-on …,
  projected sign-off …"), Not yet / Drop mine still Rita's. An earmark already told (`told_at`) defaults to Not yet.
  **Every Joy email lists the documents NOT VALID first** (expired, required and missing, or expiring before the planned
  sign-off), **valid second**, then the earmark against the file, then the seafarer ("the bottom part following that").
- **Edit** (Miguel's third choice, 8 Oct 2026: "accept it, change it, or ..."): on a discrepancy row Rita sets ship,
  sign-on and projected sign-off in the review (`body.edits["earmark:<id>"]`, `editOf`: ISO dates, sign-off ≥ sign-on);
  saved through the move path (`saveReliefAssignment`: unknown_ship / already_projected), then Joy gets mode `edited`
  ("Earmark corrected by CIMS"). A bad edit saves nothing, sends nothing, and the page blocks Apply until it is fixed.
  The apply sentence names every edit not saved and every email that did not go.
- **The Uploads screen shows the earmark rows** (worker.js `cimsRender`, 8 Oct 2026). Until then only the unused
  `/api/crew/import` page drew them, so every earmark decision of 7–8 Oct ran on the server default. The page's
  default per row (`impEmDef`) equals the server's; `crew_import_ui.js` keeps parity. Pinned by
  `test/earmark_signoff.test.js`.
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
  feeling"): a 3px line, hairline ticks, 10.5px type in two greys, soft fills; the ghost slot says
  "OFF IN 1 MO 22 D", never "OFF IN 53D". **Every card on the ship is on the line** (Miguel: "here you have 3 people .. so
  you should have 3 in the timeline"): a TDG earmark without dates is a short dashed stub AFTER the last dated contract,
  named, "no dates" under it; the dated part keeps its scale. **The handover banner under the cards is gone** (Miguel,
  same evening: "I don't think it's necessary" — "Clean handover · Miami · 2026-11-29"): the line says who relieves whom.
  **One row per ship** (Miguel, same evening: "most likely ... three people assigned ... they should all be side by side ...
  four is the maximum ... this side should be a little bit wider"): a ship's cards share ONE flex row at equal width
  (`.shipbody.onerow`, never a 2+1 wrap); the Keyman filter rail is 200px and the action column 220px (8 Oct: "make this smaller .. more room on the cards"; the
  "Ships (48)" label above the hulls is gone too) so the board is ~935px at 1440 (it was 719: the ship-tile side rail had stretched the column to 385px); a card under 260px compacts its
  type (container query); the pool and the shore list still wrap; phones stack. A card keeps its own height. The seat card lost its lane, dots and TODAY tick: a thin soft bar (4px) filled
  to today (soft red when overdue, a dashed track for an earmark), the two calendar dates under it as before — Miguel, same
  evening, when a first cut dropped them for an "aboard / to go" row: "you eliminated the dates ... we had them very, very
  well done earlier ... this progress bar should be more gentle". How long aboard is the status line, how long to go is the
  chip; neither is repeated under the bar. Dates on the card and the history read "Sep 22, 2027" (`fmtDateS`), the chip
  reads calendar months + days (`spanCompact`), never a bare day count. Pinned by `test/board_cards.test.js`. Mock-ups under `docs/mockups/`.
- **The seat card's NEXT line and the expired documents by name** (Miguel, 8 Oct 2026, on Harmony: "if the same crew
  member is earmarked for a future vessel, I want you to display it there ... how many months and days of vacation or
  space between the contracts"; "instead of saying 1 expired ... tag in red all the items that are expired"). Under the
  status line of a seafarer aboard: "NEXT <ship> · <sign-on> · N mo D d ashore" (`attachNextAssignments`,
  `src/next_assignment.js`, pure, run at the end of `rotationSections`: the same crew's earliest earmark still to come,
  Rita's card or TDG's Earmarked row, any hull, never the card itself); "back to back" at 0 days, red "overlaps …" when
  the next sign-on is before this sign-off, "TDG earmark, dates to plan" without dates. The status line's "7 mos" is
  the contract's length (sign-on → sign-off), unchanged. Documents: one red tag per EXPIRED document by name
  (`docBadge().items`), the missing / expiring summary stays one chip (`rest`). Pinned by `test/next_assignment.test.js`.
- **WHO CAN TAKE THE SEAT — the earmark bench** (Miguel, 8 Oct 2026, on Vision's empty slot: "give Rita ... available
  options ... everybody who has been home already for a minimum of 6 weeks, but with a cutoff of 6 months ... a total of
  9 names ... if Rita picks one ... the whole thing ... should pick up all the information"; mock-up B "polished, real
  list" approved with "go"). `src/earmark_bench.js`, pure: `benchPool` once per board read (active crew — On board / On
  Vacation / Reserved — with no earmark to come and a DATED time home: ashore from TDG's DEBARKEDDATE else the last
  schedule sign-off; aboard another ship from the board's own sign-off for that contract), `rankBench` per ship.
  **Both measured on the earmark's start date**, never today (today the list is empty for every ship: Ramos home 3 days,
  Alonzo 26): the date `defaultProjectionDates` gives the ship (the printer's sign-off), so the list and the one-tap
  earmark agree. Window: home ≥ 42 days and ≤ 6 months on that day; the ship's own printer never; the top 9 ride on
  `sec.bench` (no extra round trip, §12), `GET /api/rotation/bench?ship=` serves everyone (`ready` + `outside`: ashore
  beyond 6 months, faded in the panel, never on the board). The slot draws a soft-yellow box (`benchBox`, `.ebench`):
  name, where they are ("Home since 12 Sep · Symphony" / "Off Apex 7 Oct"), time home by the date with a thin bar, the
  documents that will not carry the contract in red (expired by sign-on, expiring before sign-off, required and missing).
  **One tap earmarks** through `/api/rotation/project` (the drag's route: sign-on = the printer's sign-off, +7 months /
  Azamara 5) and shows an Undo toast (`/api/relief/remove`). "+ N more" opens the relief panel on a NEW reliever, which
  lists everyone (`#mbench`, Most rested / Everyone available, `RB.pick` on a row) above the search; the picker rows
  carry `agency_id` for that. No candidate → the plain "Add earmark" slot as before. `drawRotation` carries `bench` on
  the section clone (the 15 Sep 2026 field-drop trap). Pinned by `test/earmark_bench.test.js`.
  **The brand rule and the Oasis / Icon rule** (Miguel, 8 Oct 2026, the same evening: "if we are looking within the Royal
  environment, you only display people who have done Royal Caribbean ships ... Celebrity ... the same applies for
  Azamara ... I don't want to see, on an Allure, a brand-new hire ... I don't want to have somebody from Celebrity, like
  Dan Belhida, on an Allure"): a crew's brands are the brands of every contract the board knows (`benchPool`:
  current, history, the file's last hull); a Royal hull lists Royal crew, Celebrity → Celebrity, Azamara → Azamara OR
  Royal (§10e, 7 Oct); a crew with no contract on record has no brand and passes — except on a `block` hull (Royal
  Oasis / Icon class, `vessel.jr_ps_rule`), where NO new hire (`newHire`: no leg, 0 completed contracts) and no Junior PS
  is listed. The box's footer prints the rule in force ("Royal crew only · no Junior PS, no new hire") so Rita knows who
  is not there. The rules filter the LIST only; a drag or the panel's search can still place anyone (a warning on the
  drop for a Junior, as before) — the console never blocks a person's decision.
  **Chips** (same day: "the tags all should be same size .. instead of 1 expiring .. name it and have it in yellow"):
  every document chip is the ONE `.rtag` chip — expired red by name, expiring amber by name with its month (`rtag due`,
  `docBadge().expiringItems`), the missing ones one muted count (`rtag mis`); never the page's `.warn` BOX class, which is
  what made "1 EXPIRING" a different size. **The contract modal** had a pixel pass the same evening (`editContractModal`):
  the file's word as a labelled strip (dates as "Oct 7, 2026", the hull as "Celebrity Apex", "projected · 7 months after
  embark" — 5 on Azamara, never "(Azamara 5)" on a Celebrity hull), port options as "Southampton, England · Oct 7, 2026",
  labels that never wrap the fields out of line, history dates formatted and unwrapped, 40px footer buttons with Save
  the widest, focus rings. The card's own sign-off note is brand-aware the same way (`x.brand` set in `rotShip`).
- **The next earmark follows the last one** (Miguel, 8 Oct 2026, on Beyond and Allure: "if I pick somebody ... automatically
  I need you to give me a third card, which would be a second earmark ... I want to have the flexibility to pick another").
  `defaultProjectionDates({ ..., chain })`: with an earmark still to come on the hull (open card, sign-on after today), the
  next one starts on the LAST earmark's sign-off (an earmark without one: its sign-on + 7 months, Azamara 5) and says whom it
  follows (`after`). The board's list (`sec.bench`) is measured on that day and its header reads "Next for X · after Y";
  the one-tap / drag route and Add crew chain (`deps.chain`, `SHIP_EARMARKS_SQL`); the TDG-earmark card at Apply does not
  (the review may be removing the card it would follow). On the page an earmark already drawn no longer swallows the slot
  (`nextSlot`): the list while it fits as the third item, the plain "Add earmark · FROM <date> · N AVAILABLE" slot as the
  fourth, nothing past four cards; a seat held by a card (no TDG printer on the relief board) gets the slot too. The relief
  panel's new earmark relieves the last in the chain (`lastInChain`). Pinned by `test/earmark_chain.test.js`.
- **The Keyman rail: Search, and a year / month filter that works** (same day: "I looked at picking a year and month .. I
  think there is an issue"; "instead of having a find ship .. I wanna just call it search .. by ship, by city .. by name").
  `legInFilter` compares ISO strings (it parsed dates as UTC and read them in local time: a contract ending Dec 1 missed
  December west of UTC), matches a month without a year in every year the contract spans (it checked the sign-on year only),
  and a ship with nothing in the window leaves the board (it stayed, empty); the Year facet lists the years earmarks reach.
  **Search** (`rotSearchHit`, `rotFold`) matches the ship, every seafarer and earmark on it and their ports, accents and
  case ignored; a matching ship is shown whole.
- **The Fleet Gantt** (Miguel, 9 Oct 2026: "right above the expand all ... this icon or similar Carta gantt icon", then
  "Open fleet Gantt"): a button with the Gantt icon (`GANTT_ICON`) right above Expand all opens every ship on ONE time
  axis (`fleetGantt`, `ganttRows`, read off the board the page holds — no request): the header line's segments and colours,
  Inactive seats out, a future gap between contracts red, TODAY, a dashed stub for an undated TDG earmark; sorted least
  covered first, the right column "covered to <date>" red under 60 days, amber under 120, "Nobody" for an empty hull. A row
  closes the view and opens that ship on the board. **Second cut, the same day** ("more colorful .. colors are too similar ..
  only 1 month before and 6 months after .. the entire width .. keep the headers on top"): the view is the whole window
  (`#ganttwrap` fixed, no card), the title, legend and month axis stay sticky while the rows scroll, Esc closes; the horizon
  is FIXED — the 1st of last month to the end of the month six months out — and a bar running past the right edge is clipped
  with a chevron (`.gs.over`); five states, five hues (aboard green `#2E9E5B`, awaiting the file teal `#1E9CB2`, earmark amber
  `#F2B01E`, TDG earmark orange `#E8702A`, uncovered red `#E5484D`), a projected sign-off FADES at its end instead of striping;
  the rows are split by tier (Nobody / under 2 months / under 4 months / 4+) with a count. **11 Oct 2026** (Miguel: "Solid bars, ~
  on the date"): no fade, no stripes; a coverage end that is only projected reads "~Apr 18, 2027" in the right column
  (`ganttRows().untilProj`). Pinned by `test/fleet_gantt.test.js`.
- **Miguel's answers of 11 Oct 2026** (Brain recAC90rD6BWf4tit): (1) the open earmarks dated before the turnaround rule were
  re-snapped in D1 — only cards whose sign-off was still the raw embark + 7 months (Azamara 5); 9 moved 1–3 days onto a
  turnaround day, Harmony already on one (port filled), Spectrum none within 14 days (unchanged); typed sign-offs untouched;
  backup `bak_assignment_resnap_20261011`, `activity_log` `act_resnap_20261011`. (2) Fleet Gantt "~" (above). (3) The bench
  hides crew already earmarked — it already did (`benchPool`: an open card with a future sign-on or TDG's Earmarked row).
  (4) New hires stay on every brand's bench except Royal Oasis/Icon — unchanged. (5) A ship's cards stop growing at 520px
  (`.shipbody.onerow>.rcard{max-width:520px}`). (6) The Documents block reads the contract (`docTags(docs, signOn,
  signOff)`, relief panel `docBlock` from its date inputs): expired BY the sign-on is Expired, valid at sign-on but gone
  before the sign-off is a fourth row **"Lapses during this contract"** (amber), "N of M valid for this contract".
  Pinned by `test/card_docs.test.js`, `test/board_cards.test.js`.
- **The contract modal, 12 Oct 2026** (Miguel, on Valderrama: "put those notes right below the sign-off workflow ... the notes
  for this current contract ... we don't need all the notes over the history ... we have them in the crew tab"; and on the
  file strip: "I love this information .. just organized it better"). (1) **Notes · this contract**, right below the Sign-off
  workflow (`contractNotes(d.notes, signOn, signOff)`): the dated Crew-tab notes (`crew_note_log`, now returned by
  `/api/rotation/crew` as `notes`) logged since this contract's sign-on (to its sign-off once it has ended), newest first; none
  = "No notes logged in this contract. Earlier notes are on the Crew tab." (2) **The card's note dot** (`hasNote`) was the
  Comment box only (`crew_ready.note`, one undated text per crew); it now also lights for a dated note logged on or after the
  card's sign-on — one grouped read (`MAX(ts) ... GROUP BY agency_id`) in the board's wave (§12). (3) **The TDG strip** is a
  labelled grid: "From the TDG file of <date>", then Status · Ship · Embarked (· Debarked), then a full-width "Sign-off shown"
  row with the date bold and its source beside it. Pinned by `test/card_docs.test.js`. (4) **Nothing said is lost** (Miguel,
  same day: "absolutely yes .. I dont wanna lose the notes"): `apiNote` keeps a CHANGED, non-empty Comment as a dated
  `crew_note_log` row in the same batch as the box (same text again or an empty box logs nothing; the box shows what Rita
  left in it). The 6 comments already saved were copied into the log on 12 Oct 2026, each dated by its own
  `crew_ready.updated_at` (`activity_log` `act_comment_backfill_20261012`; `crew_ready` untouched).
- **Update TG is gone** (Miguel, 8 Oct 2026: "remove it"). The 17 Aug 2026 per-ship digest of board changes to Joy never
  sent once (`TG_NOTIFY` was never set; 240 changes had queued, `tg_update_run` empty). The import review tells Joy row by
  row instead. Removed: the button, its page code, `/api/tg/*`, `src/tg_update.js`, `src/tg_collect.js` and their tests.
  The `tg_update_run` table stays (no schema change). `TG_NOTIFY` survives only as Deploy's fallback recipient.
- **Where they are, under the name; the documents against the contract** (Miguel, 8 Oct 2026, Villacortes' Allure
  earmark: "tell me there that he's on board on Wonder ... right below the name ... remove the bottom part ... If I click
  in the card ... right before the comments, all the tags"). The card's status line goes through `whereLine`: a crew the
  file has On board ANOTHER hull reads "On board <b>Wonder</b>", Earmarked elsewhere reads so, else the console's status
  (On Vacation, Reserved...). The bottom restatement ("Your earmark · TDG registry ...") is gone (`regNote` default ''). An
  earmark's chips read its OWN dates (`contractDocBadge(docs, sign_on, planned_sign_off)`): expired by the sign-on red,
  lapsing before the sign-off amber by name, required with no date one muted count; seats keep today's `docBadge`. Inside
  the card, right before Comment, a **Documents** block tags every document (`documentLines(..., today, 30)` on
  `/api/rotation/crew` → `docTags`; `docBlock` in the relief panel, reliever rows now carry `sc` + docs, manual entry
  first): Expired red, Within 30 days amber, Valid green, "N of M valid". Pinned by `test/card_docs.test.js`.
- The sources line names the FILE that dates the board first ("TDG file <date> · N crew, M with embark dates"); the
  Counter is "(history)", never warned about. Nothing here is money (§1) and nothing resolves a disagreement without
  Rita (§6).

## 10e. THE JUNIOR PS RULE IS ROYAL CARIBBEAN'S ONLY — Miguel, 7 Oct 2026
"We segmented the big ships because we can't have a junior in an Oasis class or an Icon class. For Celebrity, because
we only have almost the same class across the board, it applies to anybody: junior, senior, or printer specialist, all
apply the same way. For Azamara, it's exactly the same as Celebrity. Although for Azamara we will always send people,
most likely from Royal Caribbean for the most part; if it's a new hire to Azamara, it's because he comes with experience."
So: the "Junior PS on a block ship" warning (`jrWarn`, `vessel.jr_ps_rule`) is read for Royal Caribbean hulls ONLY
(`rotationSections`: a non-Royal brand is "open" whatever the row says). Royal: Oasis + Icon class `block`; **Quantum class
`open`** (Miguel, 8 Oct 2026: "Quantum is ok for Jrs"). **Data cleaned the same day on his order** ("the celebrity ..
clean them up"): every Celebrity row and the five Royal Quantum rows set to `open` in D1, so the table and the board
agree; only the nine Royal Oasis/Icon hulls carry `block` (14 Celebrity + 5 Quantum rows changed, 19 in all). The brand gate in code stays as the guard. Also in the Brain.

## 10f. THE CREW TYPES, AND INACTIVE REPLACES RETIRED — Miguel, 8 Oct 2026
His glossary, verbatim intent: **On board** (active) = aboard a ship. **On Vacation** (on holidays) = has sailed with
us, between contracts, no ship assigned. **Earmarked** = a ship assigned for a future contract, new hire or returning
crew. **Inactive** = has sailed with us, no ship, NOT part of the rotation until someone decides otherwise (reversible).
**Reserved Crew** = like On Vacation, they may or may not return. In the Brain (recwdSbjidOPholWK).
- **"inactive replace retired"**: the console has no Retired status. `crewStatus` / `deriveStatus` return Inactive for
  the manual tag (`crew_override.retired`, kept as the column, no schema change) and for the long-ashore rule
  (`RETIRE_MONTHS`). The page says Inactive everywhere: the Crew tab facet, the dashboard tile, the Edit modal's tag
  ("Inactive (manual — out of the rotation until you clear it)"), the import review ("Inactive tags TDG overrides",
  "Keep Inactive"), Maria (`include_inactive`; `include_retired` still accepted). The board hides Inactive seat and
  pool cards (as it hid Retired) but NEVER an earmark for its status (`pfilt`): a plan on an Inactive crew is Rita's
  to settle. On 8 Oct 2026 data: the 30 tagged crew moved Retired → Inactive, nothing else changed (104 crew compared).
  `OFF_FLEET` keeps "Retired" only so an old stored value still reads off the fleet.
- **Reserved and Not for Rehire are their own words** (Miguel, 8 Oct 2026: "yes"). `normalizeStatus` returns
  "Reserved" (TDG's "Reserved Crew") and "Not for Rehire". Reserved reads like On Vacation everywhere (`ASHORE` /
  `isAshore`: the unassigned pool, deployable on the doc radar, ashore for the earmark and registry verdicts, a dated
  row is the last contract ended by TDG); Not for Rehire reads like Inactive (`OFF_FLEET` / `isOffFleet`: hidden
  from the board and the pool, out of compliance, data gaps and GSM reviews) and, being TDG's word, beats Rita's older
  manual Inactive tag (Sison). `fileStatusOf` reads the file's RAW word first, so a snapshot kept before 8 Oct shows
  the right word without a re-upload. Facets, tiles (shown when the count is above 0), colours, the Edit modal's
  status list and Maria carry both. On 8 Oct data: De Leon (DG3 shoreside) → Reserved, Sison → Not for Rehire,
  nothing else changed.

## 10g. THE CREW PROFILE COLLECTS EVERYTHING, EACH VALUE WITH ITS SOURCE — Miguel, 12 Oct 2026
"lets start by showing the right data from the crew .. is where all the data should be collected from the crew .. coz is
the crew tab"; then, of three mock-ups, "I like A .. but add few things missing from the other 2 versions" (A+, artifact
GTGkBnj6Hvg3ki3a1zFcDk). `apiCrewOne` reads every table that holds something on one seafarer in ONE wave (§12) — crew +
override, the kept TDG row, the ONE schedule (`boardLegs`), the Counter (history), Rita's contract edits, the count file,
notes, the Comment + readiness, field intel, feedback (request2/response2, superseded kept), shipboard reviews, cards,
emails to Joy, TDG earmarks removed, status changes per upload (`sync_conflict`), travel (by name, "Last, First"),
the activity log, sign-off instructions/link sends — and `buildCrewProfile` (`src/crew_profile.js`, pure) turns them
into the page: the header (name, chips, ship, contact — the TDG file box beside it was removed the same evening: "dont think is needed"), a decision band when the crew is out of the rotation or a
contract ended early (> `EARLY_DAYS` = 21 before the plan), the numbers each with a source, the career line (bars, the
planned end dashed, a pin per note / intel / feedback, today), the last contract with EVERY date and its source (TDG's
shown, Rita's agrees or differs, the Counter's struck as history), readiness, sign-off emails, travel, what people said
(Ray / Rolando / Dexter / ship review slots + the feed; a note's author is the activity row of the same second — the
note table has no author), status history, documents (number, issuer, issue, expiry) read against the running
contract else a 7-month one from today, rotation, **To check** (why a contract ended early when nothing records it,
the console's grade vs TDG's position, feedback never asked after a contract ended, the name-only TDG id bridge, a
manual status over TDG's word) — the console never picks — and who did what. Sign-off sends are offered only while a
contract runs. The status word is `crewStatus`, the crew list's. The statement PDF reads the same schedule
(`statementContracts`): it printed James Agbada "projected Nov 21" and 163 sea-days while TDG had him off Sep 5 after
126. Masked: nothing (it is Miguel's own console). **Who he relieved and who relieves him** (same evening: "show who was before he took over and who is coming after .. in the timeline"): the contract's bar names, at its two ends, the contract on the same hull whose sign-off is nearest this sign-on (±`HANDOVER_DAYS` = 45) and the first contract or earmark starting after (TDG's undated Earmarked row only when nothing dated follows), each linked to that profile (`handovers`, `pfHandover`); a running contract with nobody after reads "No reliever planned yet"; a missing predecessor reads "Before: not on record" (the file keeps one row per crew — a predecessor who moved on may have no leg left). **The Crew tab opens on the active crew** (Miguel, 12 Oct 2026: "I want the active crew selected by default when u open the site"): `CREW_DEFAULT_STATUS = ['On board']` on open, on every return to the tab and on Clear filters; All crew is one tap. **Why a contract ended** (Miguel, 13 Oct 2026: "perhaps is a good idea. Add 'Resigned' as an end reason?"): its OWN
record, `contract_end` (`migrations/0021_contract_end.sql`; sc + on_key = the contract's sign-on; reason, note, set_by,
set_at), picked by Rita on an ended contract's card ("Why it ended" → Record why / Change / Clear) from ONE list
(`CONTRACT_END_REASONS` = `PF_END_REASONS`: Completed, Resigned, Medical, Compassionate, Emergency, Performance, Early
relief, Other), `POST /api/crew/contract-end`, audited. It shows on the state pill ("Ended 77 days early · Resigned") and
the decision band, and clears the To-check row. **NOT `assignment.end_reason`**: that column is written only by the bonus
commit from the gates (money, §1), carries a CHECK that would need a table rebuild in prod, had 0 of 36 rows set on 13
Oct 2026, and TDG-dated contracts have no assignment row. HR only: the bonus never reads `contract_end`, the crew's
statement and email never print it. Pinned by `test/crew_profile.test.js`, `test/crew_windows.test.js`.

**The windows, the statement and its email** (Miguel, 12 Oct 2026, evening: "review pixel by pixel .. the edit crew pop window
is not really well design .. the notes .. the same .. the pdf .. the email statement CC rita"; mock-ups approved: "1. archive.
2. yes .. 3. yes .. go"; the rendered proofs under `docs/mockups/proofs_20261012/`). Pinned by `test/crew_windows.test.js`.
- **Notes are archived, never deleted.** `crew_note_log` gained `created_by`, `archived_at`, `archived_by`
  (`migrations/0020_note_archive.sql`, the same ALTERs in `ensureCrewExtras`, one wave). `/api/crew/notes` `archive` /
  `restore` (the old `delete` archives too); every reader skips archived rows (crew list dot, board card dot, contract
  modal, profile feed); the Notes window shows them struck through with Restore. A note's author is `created_by`, else
  the activity row of the same second.
- **The Notes window** is one stream (notes, field intel, feedback, shipboard reviews), newest first, grouped by the
  contract it falls in, filter chips, the composer on top.
- **Edit crew** in sections (Person, Contact, Status & ship, Documents, Bonus). Every field starts as TDG's value; a field
  with a manual entry shows TDG's value under it and **Reset to TDG**, which sends "" (the manual entry CLEARED, never TDG's
  value pinned as one). No manual status / ship = "TDG: <word>". Save counts the changes; the baseline is disabled for
  anyone but Miguel and Rita (`canMoney` on `/api/crew/get`, the server still strips it — §1). `/api/crew/get` returns `tdg`
  (the row as the import wrote it) and `override`.
- **The statement email** (`hr.statement.v2`, `src/emails/hr.statement.v2.js`, canonical `cims-mast.js` letterhead) goes to
  the crew, **CC Rita and reply-to Rita** (`deployCc`), once per crew per `STATEMENT_RESEND_MIN` = 10 minutes
  (`already_sent` unless the page confirms a resend; Miguel's click sent Ian Alega's statement three times in three
  seconds on 12 Oct 2026). The page names the recipient before sending and disables the button while it sends.
- **The statement PDF** (`composeStatement`, `pdf.js` gained boxes, lines and letter spacing): the CIMS band, the crew and
  last ship, four numbers, the contracts with TDG's dates, every document with number / issue / expiry / issuer, the
  bonus standing, Rita as the contact on every page. **Both the PDF and the email are crew-facing: never notes, intel,
  feedback, the To-check rows, the console's status word or its grade beside TDG's position.**
- Profile pixel pass: the four numbers sit in the header's right half, the career card has its gap, the feedback buttons
  read "Ray · Orders ✓", the sign-off note "Ended <date>".

**Round 2 — the contract card, one panel, the PDF** (Miguel, 13 Oct 2026: "the PDF still comes out pretty bad. The window
for notes and documents is not the same size ... so much lack of detail ... the current contract ... too crowded ... See what
the people need to know"; proofs under `docs/mockups/proofs_20261013/`). Pinned by `test/crew_windows.test.js`.
- **The contract card** (`pfContract`) answers, in order: where and how far along (ship, route, a state pill: "Aboard · day N
  of M", "Ended N days early", "Past the sign-off · TDG still has them aboard"); **the relay** (`pfRelay`: who handed the
  seat over → this contract's track filled to today → who takes it next, each name a link; "No reliever yet" when nobody);
  **four facts** each with its source (Signed on · Sign-off · To go / Served · Signs off at); **the crew change**
  (`pfCrewChange`) as ONE checklist in four steps with a count — Reliever (planned, in TDG: only a file row or TDG's
  Earmarked row counts, "told Joy" is not yet in TDG), Dates (on / off confirmed), Travel (ECCR, flight, hotel), Sign-off
  (instructions, link, ship review) — read from Readiness and the sends, never typed here. "How these dates were set" and
  "Travel" fold away under the card; an ended contract folds its crew-change record away too. The header chip reads
  "Off in 5 mo 8 d" like the card (never "OFF in 159 d"). Status history merges the same word from upload after upload.
- **One side panel** (`openSheet`): Edit crew, Notes and Documents open in the same sheet — right edge, full height, 640px,
  the whole screen on a phone; header (`sheetHead`), scrolling body, footer; Esc or a click outside closes it.
- **Documents** (`docsModal`, now from `/api/crew/get`): per document the number, issued, expires with the time left
  (`dcSpan`: "in 9 yrs", "1 yr 5 mo ago"), the issuer, a standing pill read against the running contract (else 7 months
  from today, 5 on Azamara), and a line zoomed on the contract (45 days before it to 4 months after) showing the validity
  under the contract's window. Schengen stays optional ("Expired · optional", grey). Edit dates opens Edit crew's Documents.
- **The statement PDF** (`composeStatement`, `pdf.js` gained `rrect` and the real Helvetica metrics): the band, the name
  and position, "Your details on file · please check" (born, province, mobile, email), four shaded tiles (completed
  contracts with the TDG count's date, days at sea, documents valid, the CONSECUTIVE bonus count — two tiles, never one
  number, §10c), the current / last contract as a feature with its route and progress bar, the contracts as a striped
  table with a status pill and the route (the leg's ports, else the ones Rita typed — `gatherStatement` reads
  `contract_edit` in its wave), every document with number / issued / expires + time left / issuer / standing pill,
  "Bonus paid" only when something was paid, a "please check" note naming Rita when it fits, and the same line in the
  footer of every page. One page for a normal career. Still crew-facing only (no notes, intel, feedback, status word).

**13 Oct 2026, later — said once, one line, the emergency contact.**
- **Time at sea is said ONCE, in months and days** (Miguel: "X months at sea .. perhaps is more valuable .. u repeat it in
  the crew tab few times .. 1 is enough"). The header has three numbers: completed contracts, **Time at sea**
  (`pfSeaTime`: each contract's calendar span to its sign-off or today, added up — "8 mo 13 d", the day total under it) and
  the bonus count. Gone: the Aboard / Ashore tile, the header's "Off in" chip for a running contract (the card's To go
  says it; only "Past the sign-off" stays as a chip), "aboard so far" under To go (now "of a 7-month contract"), and the
  day count on the career bar. How far into THIS contract is the card's state pill ("Aboard · day N of M").
- **One line, not two** (Miguel, the Career box and the card's track: "u can merge these 2 into 1"): the career line
  (`pfCareer(K, feed, today, hiOn)`) is drawn INSIDE the contract card under who handed over and who takes over
  (`pfRelay`, `.pf3relay2`): every contract on one axis, this one bright and the earlier ones soft (`.pf2cb.dim`), a pin per
  note / intel / feedback, today, the planned end dashed. The separate Career section is gone.
- **The contract card runs the full page width** (same day: "the width of the page u built .. is too small. perhaps below
  the main or top card"): drawn right under the header card (and the decision band), above the two columns (`.pf3wide`).
- **The emergency contact** (Miguel: "u can add it"; Joy asked to add a next-of-kin / emergency-contact column to the
  AdvancedQuery): `crew.emergency_name / emergency_relation / emergency_phone` + the same on `crew_override`
  (`migrations/0022_emergency_contact.sql`, ALTERs in `ensureCrewExtras`). The import reads it from whatever header TDG uses
  (`pickEmergency`: EMERGENCY CONTACT / NEXT OF KIN / NOK, a split first + last name, RELATIONSHIP, … NO / NUMBER / PHONE),
  an empty cell in a column the file carries clears it, and an emergency header is NEVER read for the crew's own fields
  (`isEmergHeader` in `pick` / `blankCell`: "EMERGENCY CONTACT NO." must not become the crew's phone). Edit crew types it
  (Contact → Emergency contact, Reset to TDG); the profile header shows it ("Not on file" in amber until set); the crew's
  statement PDF lists it under "Your details on file · please check" (his own data). Pinned by `test/crew_windows.test.js`.

**13 Oct 2026, evening — the internal crew file, documents against the contract, the replacement on the line.**
- **The crew file** (Miguel, on the profile's What people said: "the PDF should include this also in a clean page ..
  regardless if there is space on a previous one .. as Contract feedback .. should display the entire historical data ..
  not just the contract that just ended"). It is a SECOND PDF, `GET /api/crew/file.pdf` (`apiCrewFilePdf`: the statement's
  wave + the profile, one `Promise.all`), the profile's "Crew file · internal" button. Pages 1+ are the statement; then
  **Contract feedback** always starts on a NEW page: `feedbackFile(profile, today)` (`src/crew_profile.js`, pure) groups
  every note, field intel (the full report), feedback answer (every role, in words — `FB_LABEL`; superseded ones kept and
  marked) and shipboard review under the contract it falls in, newest contract first, items newest first, the rest
  "Between contracts"; each contract's band prints its dates and "Ended N days early · <reason>" (`contract_end`). The
  "requests" strip is NOT printed ("this is not needed in the PDF"). The whole file speaks to HR (`INT` in
  `composeStatement`): no "please check", no "your", the red "Internal - CIMS HR crew file. Not for the crew." on every
  page. **It is never emailed**: the statement email (`apiStatementEmail`) still sends the crew-facing statement only —
  making the crew file the crew's is Miguel's call, never a default.
- **Documents read against the contract, in the PDF too** ("also in the PDF"): with a running contract the statement's
  Documents table and its tile read to its projected sign-off — Expired / **Lapses** (expires before the sign-off) / Valid,
  "N of 4 · for this contract, to <date>"; with none, today and a 90-day Expiring, as before.
- **The replacement on the line, as the board draws it** (Miguel, Infinity: "if u have a replacement .. projected .. so we
  are consistent on how we show it elsewhere"): `pfCareer(K, feed, today, hiOn, next)` — the running contract solid to
  today then a light dashed tail to its sign-off (`.pf2cb.live` + `.pf2ct`), the next one an amber segment from its
  sign-on (`.pf2nx`; its sign-off, else sign-on + 7 months): dashed pale while it is the console's plan only, SOLID once TDG
  has them — the file's own row, TDG's Earmarked row, or Rita's card for a crew TDG ALSO earmarks for that hull
  (`handovers().after.tdg`, the board's "EARMARK · TDG"; the relay then reads "earmark · TDG has them" and the crew-change
  "In TDG" ticks). A TDG earmark with no dates is a short orange dashed stub after the sign-off, "<name> · no dates". Earlier
  contracts are drawn first (`.dim`), so an older bar never covers the one the card is about. Pinned by
  `test/crew_windows.test.js`, `test/crew_profile.test.js`.

## 10j. THE SCORE CARD PRE-FILLS FROM THE SYSTEMS — Miguel, 15 Oct 2026 (money, §1: his merge)
His answers, each pinned by `test/score_auto.test.js`; rules in `bonus.js` (`autoScore`, `auditPoints`, `HON_FROM`), reads
in `src/score_auto.js` (`GET /api/score/auto`, one wave; `PARTS_DB` cims-parts-orders and `HON_DB` cims-hon READ ONLY,
SELECT only, no migration directory). Every value is a PRE-FILL with its evidence ("From the systems"); every slider stays
movable; the commit is a money user's click; committed outcomes are never touched.
- **On-time ordering (20):** a Parts Portal order marked "Vessel-side miss" on his ship inside the contract = 0 AND the rush
  gate ("if he misses an order, it goes down to zero"; the streak resets to 0, his choice). Equipment / shore misses don't count.
- **Order accuracy (25) / Par (15):** Ray's answers, ALL OR NOTHING ("Partial doesn't really work": only Always / Accurate /
  Maintained score); a field report in the contract naming the problem = 0 until Ray answers after it (§10 exception).
- **Handover (10):** contracts ending on/after **1 Nov 2026** need a signed HON handover for that ship (signed within 30 days
  before to 10 after the sign-off; HON's outgoing name must match when given) = 10, else 0; earlier contracts keep Rolando.
- **Dexter's audit (10) replaces "Communication (Rita)":** the audit score (Overall, else the average rounded down) — 5 = 10,
  4 = 8, 3 or below = 0; no audit in the contract (filed up to 30 days after the sign-off) = 10; several = the lowest.
- **Mono (5):** presses only, under 20% of clicks over the contract = 5, else 0; no click data = 5. The data is OBP's clicks
  table (ClicksDate, Color, Mono, is_mfd per machine); Jerwin is adding a daily month-to-date clicks file to the nightly
  export to obp-csv@cims.work (Miguel asked 15 Oct 2026). The reader is not built yet: until then, full points.
- **Supervisor evaluation (15):** unchanged (the shipboard manager review, `seval.js`).
- **The Score Card:** feedback links for Ray and Rolando only; Dexter is a green chip ("Dexter · audit 4/5 · date") opening
  the audit when one exists, nothing when none. The Inputs page lists every audit of the seafarer ("Not applicable · no audit
  on record" when none) instead of Dexter's old questions.
- **The 15 Oct 2026 review** (pinned by `test/score_auto.test.js`): no ship on the card = nothing from the Parts Portal, HON or
  the audits (a blank ship matched EVERY vessel-side miss in the fleet, armed the rush gate); no sign-on = no miss and no
  field report (a blank start read the ship's whole history); a transfer ("Quantum, Anthem") is every ship (`shipKeys`), the
  card defaults to the contract's own ship (`lastLeg.ship`, not where the crew was last seen) and re-reads when it changes;
  a contract whose sign-off is still ahead keeps the window's handover value ("checked at the sign-off"); Ray's answer and a
  field report are compared as INSTANTS (the same day, his 15:00 answer is after the 08:00 report); an audit counts only on
  one of the contract's ships, never a TEST request's, and the chip shows the LOWEST in-contract audit (red at 3 or below);
  an AI flag needs a real `true` and a quote of 15+ characters / 3+ words; HON's `outgoing_crew_id` decides the handover
  before the name; reports not read yet are said on the card ("N field reports ... not read yet"); an open-site grade says
  so. The page takes back only what the read set: a slider or gate the user moved stays, a rush gate the read armed is
  cleared when its miss leaves the window, the read's gate-note lines are swapped by exact text. Contributor rows escape
  names (TDG import).
- **Miguel's answers of 16 Oct 2026** ("1. is ok unlock for now. 2. agree. both .. 3. only the one who missed the order. 4. yes"):
  (1) grading stays open on the audit site (no sign-in), stamped "(open site, no sign-in)"; (2) **policy v2** (`POLICY_VERSION`
  in `bonus.js`, `bonus_policy` row `policy-v2`, migrations/0028, `ensureBonusV2`): v1's ladder, floor, weights, eval rule and
  gates to the character — only what `sComm` measures changed — and every commit stores **`bonus_outcome.evidence_json`**: the
  server re-runs the automatic read for the committed span and ships (`commitEvidence`, cached AI answers only, never blocks
  a commit) and keeps every evidence line with its source, the suggested sliders / gates and the audits. 0 outcomes existed
  before v2, so nothing was ever scored under v1's old meaning. (3) **A vessel-side miss counts only against the crew whose miss it is**
  — and, his second answer the same day, **that is the crew ABOARD** ("the audit is the person who's onboard .. when u have two
  people work with the person who is currently onboard or at least the one who has been more than 4 weeks";
  `missOwnerByBoard`, `aboardOn`, `ESTABLISHED_DAYS` = 28, over the board's ONE schedule): one crew aboard the hull on the
  order's day → theirs, whoever typed it; two aboard and ONE of them 4+ weeks → the 4+ weeks one (a reliever typing the rescue
  order in his first days is not charged); both 4+ weeks (a two-printer hull) or both new → the one the order's typed name
  (`requester`, placed by the travel ledger's name bridge `travel_match.js`) names; both new and unnamed → the longest
  aboard; both 4+ weeks and unnamed → nobody, flagged "Check whose miss it is" (§6). Nobody aboard per the schedule (an old
  order, a gap in the file) → the typed name decides (`missOwner`); a name the roster cannot place (Ray Guerra, the
  health-check orders, Purnama's two roster rows — fixed in another session) is flagged, never charged on a guess. Every
  charged line says why ("charged to this crew: aboard 18 weeks, the other under 4"). Staging got the v1 + v2 policy rows
  the same day (it never had the 0001 seed); `ensureBonusV2` seeds v1 first on any database that lacks it. (4) with no miss,
  on-time ordering is Ray's on-time answer, all or nothing — as built. Pinned by `test/score_auto.test.js`,
  `test/bonus_policy_v2.test.js`.

## 10h. THE OPERATIONAL DASHBOARD — Miguel, 13 Oct 2026 (mock-up B v4 "each fact once", then "deploy")
"redesign this dashboard .. items that would allow Rita to monitor and make decisions"; four rounds on the canvas
(artifact Rcd9BmKBpAxKc9d3GFgwQt). `GET /api/ops` (`apiOps`, one wave: `rotationSections`, `apiDashboard`, the score queue,
the crew's dates, the sign-off sends) → `buildOps` (`src/ops_dashboard.js`, pure): it SORTS what the Keyman board says,
it decides no date and no status. The page (`renderDashboard`) draws: five tiles (Past sign-off · No reliever · Can't sail
yet · Aboard · Bench ready), each scrolling to the one place that holds its detail; **Next 7 days** (Miguel, 14 Oct 2026:
"always the next 7 days when you open the console", option 1B "deploy"; `buildOps().week`, `opsWeek`): one lane per ship
that changes crew drawn like the Fleet Gantt — green aboard to the sign-off, amber from the reliever's sign-on (striped
when not in TDG yet), red while the seat is empty, a handover tick — then To do (score cards nobody asked for, the TDG
file, the bench) and Birthdays (surname · age); every open starts today (`OPS_WK=0`), one tap shows the 7 after (the
data holds 14 days), a "Then:" line names the next two crew changes; a phone (≤700px) gets the same days as a list; **Crew changes** (overdue + the next 90
days, one row per seat: When, Ship, Off → on, the reliever's documents read against the contract, Travel · kit only in
the last 30 days, a Next step that opens the ship on the board); Fleet coverage (one tile per ship); TDG (file ages, the
held / undated seats TDG must correct); Documents aboard; the crew and travel. Rules: a held seat (§10d) or a seat with
no embark date is TDG's to correct, never a crew change; an overdue seat is past whatever its earmark says. **Ship codes
are the cruise lines' own** (`src/ship_codes.js`, from cims-timecard `ship_contact`: QN Quantum / QS Quest, ID
Independence / IN Infinity, AX Apex / AT Ascent — "the first two letters" collides on six pairs); Miguel: "use the 2
letters .. rita knows who they are". The "Email Joy · all four" send he approved is NOT built yet: an email template
ships only after he signs off the rendered email (CIMS email standard). Pinned by `test/ops_dashboard.test.js`.

## 10j. THE TRAVEL TAB — Miguel, 15 Oct 2026 ("review the code .. connect the dots .. fix bugs")
His decisions, same day: (1) **TDG's Statement of General Account (SGA) is the audited number, Rita's travel workbook the
operational one, and the console shows where they disagree** — the goal is that Rita stops typing ("move away from the manual
entry"). (2) **Training centre cost = everything on TDG's monthly "Training-related costs" statement** (rent, utilities,
hotels, airfare, training fees). (3) **No budget except seafarer travel**; shoreside has none ("spend less over time").
(4) Ingest the whole SGA Excel. (5) **NCL-prep people stay in, tagged NCL** ("it's moving forward"). (6) **Automatic**: the
Worker reads SharePoint itself (Microsoft Graph; the app registration and secrets are his to create — §7).
- **Where the files are**: SharePoint `CruiseLineManagedServicesTeam / 1. ACCOUNTING / SGA / <year> / <NN month> /` — per month
  `DG3 SGA EXCEL <month>.xlsx` (TDG's working file, ~212 sheets: `SUMMARY MANNING` = one row per crew per ship with every cost
  column and TDG's ref `SYS-2026-09-39-02`; hidden `2026 SUMMARY TRAINREL` = training cost by month and category, the September
  row equals the PDF to the cent; hidden `TRAINING` = the line items), `TRAINING RELATED COSTS <month>.pdf` (a SCAN — page 1 is
  the statement, the rest receipts; no text in any month checked), the per-crew SGA PDFs under `Royal / Celebrity / Azamara
  Vessels` (text until ~Mar 2026, scanned since). Rita's workbook: `1. ACCOUNTING / Travel Expenses Crew / UPDATED - Travel
  Expenses <year> RCCL & AZAMARA & CELEBRITY.xlsx` — the file she drags into Upload data. **Read the Excel, never OCR the PDF.**
- **Rita's workbook ≠ TDG's bill.** September 2026: air $4,994 vs $5,029 (agrees); medical $420 vs $1,042 and visa $670 vs $139
  do not — hers carries DG3-paid items (US visas) and misses TDG-billed PEMEs. Her SUMMARY sheet's CIMS row is misaligned (a blank
  VISA column), so her own MOM totals for Apr / May / Aug 2026 are off by $1–2k; the console reads the month sheets directly and is
  right (`parseMonthSheet`). Neither is "wrong" to fix silently — the console shows both (§6).
- **The name bridge** (`src/travel_match.js`, pure, pinned by `test/travel_match.test.js`): the ledger names people by hand
  ("Villfranca, Dave", "Edelmar, Doctolero", "Marto ryan", "Espenilla, Zandro (Orlando)"). Rules in order, the first that yields
  exactly ONE crew wins, two = `ambiguous`, never a guess: surname exact + a first-name token (exact / 4+ letter prefix / one
  typo); unique surname alone; surname one typo away (5+ letters) + first name agrees; swapped halves; comma-less either order;
  every word a first-name token of one crew (JOSEPH, Emil Rondy). A bracketed or trailing note never matches; an "NCL" note
  tags `client = ncl`. Measured 15 Oct 2026 on production rows: **96% of crew spend reaches a profile (was 47%)**; the 19 names
  left are non-Filipino crew not on TDG's registry (Malkevich, Asim, Villaran, Tutaan, Aguas), the NCL preps, and Purnama, Ida
  (two roster rows). `/api/travel` returns every row with `agency_id`, `match`, `client`, `ship` and the `unmatched` list the
  Travel tab shows Rita ("Names the crew registry cannot place"). The profile's travel (`apiCrewOne` → `travelRowsFor`) reads the
  whole crew ledger (~400 rows, one statement in the wave) and lets the bridge decide — never the exact-string join again.
- **YTD = CLOSED months** (`closedMonths(today, year)`, `src/travel.js`): the running month is "in progress", not a budget month
  (October 2026 had charged a full month of budget against 9 rows). Page, `/api/travel` (`closed`) and `/api/dashboard`
  (`elapsedMo`) read the same helper on the DATA (UTC) basis — `test/date_basis.test.js`.
- **One budget constant**: `TRAVEL_BUDGET_MO` (`src/travel.js`, $15,000 = Rita's SUMMARY sheet), served as `budgetMo`; the page's
  `TBUD` is overwritten from it. **Settled, Miguel 16 Oct 2026**: "last year the budget was the same across all months .. I kept
  it all at 15000 per month" — $15,000 flat, every month, 2025 and 2026 alike; his "$150,000 for all our seafarers" of 15 Oct
  is not the figure. One constant, no per-year map, no per-month table.
- **`travel_expense.ship`** (migrations/0026, the same ALTER in `ensureTravelImpl`'s wave): the hull the row sits under, so a line
  item knows its cruise line (`travelClientOf`: Royal / Celebrity / Azamara / NCL; bare "Apex" is Celebrity — `shipname.clientOf`
  would call it Royal). Rows loaded before 15 Oct 2026 carry NULL until the year is re-uploaded.
- **The seed never re-runs on a live table**: the bundled 2025 history (`TRAVEL_2025` = crew + the 2025 CIMS sheet's 41 shoreside
  rows, $60,161.21, added 15 Oct 2026) seeds an EMPTY table or completes a legacy (pre-`kind`) one. "No shoreside rows" used to
  re-seed 2025 on every cold start (nine seeds on 25 Jun 2026). Pinned by `test/ensure_travel.test.js`.
- **THE SGA INGEST** (PR 2, same day; `src/sga.js` pure, pinned by `test/sga.test.js` + `test/sga_import.test.js` on real SQLite).
  Rita drops `DG3 SGA EXCEL <month>.xlsx` on Upload data (recognised by its `SUMMARY MANNING` sheet; "TDG SGA" in the
  chooser); the page sends only that sheet and the training summary (`TRAINREL` / `TRAINING`) as 2-D arrays to
  `POST /api/sga/import` (dry-run first: period, SGA no and date, lines, TDG's grand total and whether the lines
  **reconcile** to it, brands, the travel categories, training months, the names the roster cannot place, and whether
  the month is already on file). Apply **replaces the month** (`sga_line`, TDG issues REVISED workbooks) and the training
  years the sheet names (`training_cost`), and records the load on `sga_file` (name, hash, SGA no, date, who, when,
  source). Rules: the header row is found by `REF. NO.` and every cost column **by its header words, never by position**
  (September 2026 gained ID NUMBER / NATIONALITY / HMO; TRANSPORTATION and CASH ADVANCE appear twice and fold into one
  key); the hull sits under the merged `VESSELS` header or up to three cells right of it; `GRAND TOTAL` ends the table
  (its last number is TDG's total; the rows after it are signatures); a line without a ref must name someone AND bill
  something; `OTHERS` (the bank charge) is nobody's; the 2025 block of the training sheet is the whole SGA by category
  and its training figure is the `TRAINING RELATED` column alone (`summary_only`), decided by the block's header. Lines
  are placed on the roster by the same name bridge (TDG writes "CAAG, HAZIEL"; accents fold — TANGONAN / Tañgonan).
  Measured on the real September 2026 sheet: 76 lines, $76,046.94 + $15 bank charge = TDG's $76,061.94; unplaced =
  the NCL-prep people (TATEL, FINEZ, MANLIGAS — **TDG bills them on the same statement**, so NCL is in the SGA) and
  Purnama, Ida (two roster rows). `GET /api/sga` serves the newest file per month, every line with `agency_id`, the
  training rows and the files.
- **What the Travel tab shows from it**: "TDG's bill vs the workbook" per month of the year (air / hotel / medical /
  visa: bill, workbook, gap — amber when the workbook carries more, red when the bill does; nothing reconciled, §6) and
  the bill's own total of all crew costs; the **Training centre** view (the kind selector's fourth option — Miguel: "another
  filter called training center cost"): the year to date, vs last year's same months, rent + utilities per month, hotels +
  airfare for trainees, a bar per month, the table by category with last year beside it, and the bills on file; a
  person's page lists their lines on the bill (month, ship, TDG ref, the travel columns, allotment, fees, HMO, total
  billed — allotment and fees are shown because TDG bills them there; they are not travel and never enter the budget).
- **THE SHAREPOINT SYNC** (PR 3, same day — Miguel: "I want all this to be automatic"; `src/sharepoint_sync.js`, pinned
  by `test/sharepoint_sync.test.js` with a fake Graph and a real SheetJS workbook; setup in `docs/SHAREPOINT_SYNC.md`).
  Every hour (`maybeSyncSharePoint` in `scheduled`) the Worker lists `SP_SGA_PATH/<year>/<NN month>/` and `SP_TRAVEL_PATH`
  on the site's drive through Microsoft Graph, picks the month's SGA workbook (**REVISED beats plain**, PDFs never) and the
  year's `UPDATED - Travel Expenses` workbook, downloads what has a **new eTag**, parses it with SheetJS in the Worker
  (`xlsx`, bundled) into the Upload page's shape, and loads it through **the same two apply paths as drag-and-drop**
  (`applySgaWorkbook`, `applyTravelYear` — one code path each, `source = sharepoint`). Every attempt is on `sp_sync`;
  one failure skips that file and the rest proceed. `POST /api/sharepoint/sync` runs it now, `GET /api/sharepoint/status`
  says whether it is configured and lists the last attempts. **It runs only when the identity exists** (`GRAPH_TENANT_ID`,
  `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` as a Secret, `SP_DRIVE_ID`) and **never on staging** (`MAIL_ONLY_TO` set). The
  app registration, `Sites.Selected` on the one site, and the secret are Miguel's / IT's to create (§7) — the agent never
  sees them. Until then drag-and-drop is the path; nothing else changes.
- **THE INBOX — the automatic route that works TODAY** (Miguel, 15 Oct 2026, the same evening: "I dont want rita to be
  dropping items .. I want you to either pick the file and read what u need .. or we need to find a solution"; `src/sp_inbox.js`,
  `scripts/sp_pickup.mjs`, runbook `docs/SHAREPOINT_PICKUP.md`, pinned by `test/sp_inbox.test.js`). The Graph identity waits
  on DG3 IT. Meanwhile a scheduled Claude task ("Cims SharePoint pickup", daily 05:54 UTC, a fresh session on Miguel's
  Microsoft 365 + Cloudflare connectors) lists `1. ACCOUNTING/SGA/<year>/<NN Month>/` and `Travel Expenses Crew`, reads each
  new workbook (key = SharePoint item id @ modified time, checked against `sp_sync` / `sp_inbox`) through the connector —
  which returns the workbook as TEXT under a read budget — turns the dump into the 2-D sheets the Upload page sends
  (`dumpToSheets`), REFUSES any sheet the budget cut (`sgaFromDump` / `travelFromDump`: never nine months as the year, never
  a bill that does not reconcile to TDG's GRAND TOTAL), and INSERTs them into `sp_inbox` (one row per sheet part ≤ 60 KB,
  `file_parts` so a half-written file waits). The hourly cron's `applyInbox` loads a complete file through
  `sgaStage`/`applySgaWorkbook` or `applyTravelYear` — the ONE path each (§3) — records it on `sp_sync` (`source = agent`),
  marks the rows ok / error; `POST /api/sharepoint/inbox/apply` runs it now; `/api/sharepoint/status` carries `inbox`. The
  session writes nothing else, ever. Measured: TDG's SGA workbook (230 sheets) delivers SUMMARY MANNING + TRAINREL whole,
  the TRAINING line items never; Rita's workbook is cut inside OCT, so from October her year does not come this way —
  stated to Miguel, with the recommendation that the bill (the audited number) carry the Travel tab and the workbook become
  the optional comparison. When the Graph identity exists: delete the scheduled task, nothing else changes.
- **THE MONTH OF A BILL IS THE FILE'S, NEVER THE REF'S** (15 Oct 2026, found reading February's workbook through the
  connector: its refs read `ADV-2026-09-32-01` — the `09` is TDG's constant code for DG3, the `32` the SGA number; the first
  cut had staged February as SEPTEMBER and would have replaced September's lines). `sgaPeriodOf(name, path)`: the file name
  (`FEBRUARY 2026`, `MARCH'26`, `JULY'2026`) else the month folder; neither → `no_period`, refused (the file says its own date,
  §10c). Every line carries the file's period. Older workbooks' `DATE` cell is `=TODAY()`, so `sga_date` there is the read
  day. **Training months are replaced ONE AT A TIME and a NEWER bill's figure stands** (`applySgaWorkbook`: this file's
  detail beats its summary, a summary never replaces detail, detail replaces a summary, else the later `sga_file` period
  wins) — the first cut deleted the whole year the sheet named, so an older workbook loaded after September's would have
  wiped March–September. `SETTLEMENT TRANSPORTATION` folds into `transport`, `OTHER` / `PORT AGENT EXPENSE` is `other`
  (migrations/0027). **The connector's read budget varies per call** (January 2026 was cut at the manning header on three single
  reads; February and March came whole): workbooks are read one at a time, a cut read retried up to three times, a
  workbook that never comes through is a digest line — the Graph identity is what reads it. Pinned by `test/sga.test.js`, `test/sga_import.test.js`.
- **THE BILL'S MONTHLY SUMMARY SHEET** (15 Oct 2026, PR #253; `parseSgaSummary`, `sga_summary`, migrations/0028, pinned by
  `test/sga.test.js`, `test/sga_import.test.js`). TDG's workbook's third sheet, "2026 SUMMARY (2)", is one row per month with the
  whole SGA by category — 2025 whole, the current year to the bill's month — and the connector delivers it whole even when
  SUMMARY MANNING is cut (January, April, May 2026: three single reads each). Checked on September 2026: TOTAL 82,016.88 = the
  crew lines 76,046.94 + the 15.00 bank charge + training 5,954.94, so `crew_total = total − training − settlement` = SUMMARY
  MANNING's GRAND TOTAL (February 75,792.64 and March 72,174.30 agree; the stage reports `summaryAgrees`). Written per month,
  the newer bill wins. A workbook WITHOUT the manning sheet loads SUMMARY ONLY (totals, no lines, the month's lines untouched,
  `sga_file.rows = 0` so `/api/sga` never lets it hide a month's lines). The Travel tab's "TDG's bill vs the workbook" reads a
  month without lines from the summary row (marked "summary") and carries a "vs <last year>" column — the bill's crew costs
  against the same month a year earlier (Miguel: "a YOY comparison is important"). Measured through the connector on 15 Oct
  2026: lines for February, March, September; totals for every month of 2025 and 2026 to September.
- **THE MAIL INTAKE — sga@cims.work** (Miguel, 15 Oct 2026, evening: "give me an email where finance can send u this .. u
  might get more emails .. but this will be one of them so u can pick it up and add the data where needs to be";
  `src/mail_intake.js`, `intakeMailToInbox` in worker.js, pinned by `test/mail_intake.test.js` with a real MIME, the real
  `postal-mime` parser and a real SheetJS workbook on real SQLite). Cloudflare Email Routing sends mail for `MAIL_SGA_TO`
  (default `sga@cims.work`, a dashboard rule → this Worker) to `email()`, which routes it to the inbox and NEVER to the intel
  pipeline. The handler keeps only the workbooks the console knows — `DG3 SGA EXCEL <month>.xlsx` (REVISED beats plain for
  the same month, the month from the file name) and `UPDATED - Travel Expenses <year> ….xlsx` (the year from the name) —
  reads their sheets with SheetJS in the Worker (`sheetsOf`, `WANT_SGA` / `WANT_TRAVEL`), writes them into `sp_inbox` keyed
  by the attachment's SHA-256 (the same file twice is the same key; a REVISED re-send is a new one), keeps a receipt on
  `mail_intake` (sender, subject, files, what was ignored, outcome) and applies the inbox at once (the hourly cron is the
  safety net) through the ONE apply path each (§3). PDFs, the body and other files are ignored and listed on the receipt.
  **Only `SGA_MAIL_SENDERS` feed the console** (addresses or domains, comma-separated, default `dg3.com`): a workbook from
  anyone else is written `held`, loads nothing, and the receipt names the sender — Miguel adds TDG's domain to the var when
  their first mail shows it. `/api/sharepoint/status` carries `mail` (address, senders, last receipts). `postal-mime` is the
  Worker's second runtime dependency. Nothing here is money (§1).
- **THE EMAIL IS THE ROUTE — Miguel, 15 Oct 2026, later that evening: "we not gonna use this way .. we will do the email way
  instead .. in the future .. u will get the email from the finance team once a month."** So: the scheduled task "Cims
  SharePoint pickup" (trig_01BerujiS9nWejWvyGuKfqu9) is **DISABLED** (21:29 UTC, not deleted — its run history stays; do not
  re-enable it), the connectors are not attached to it, and the Graph identity ticket is **not pursued** (`sharepoint_sync.js`
  stays dormant: it runs only if the identity ever exists, nothing to remove). `docs/SHAREPOINT_PICKUP.md` is marked retired;
  `src/sp_inbox.js` stays because the inbox is the mail intake's queue. **The year's history came from Miguel's own uploads,
  in batches of five** ("I am gonna give u this year files .. in batches of 5 so u have the data and already display them"):
  the session parses each workbook with the Worker's own SheetJS read (`sheetsOf`, `WANT_SGA`), checks it like the pickup
  did (period from the file name, lines reconcile to GRAND TOTAL, the summary sheet agrees), writes `sp_inbox` rows with the
  MAIL INTAKE's identity (`inb_mail_<sha24>_NN`, `file_key mail:<sha16>@<sha16>`, written_by `upload:<Miguel>`), and the
  hourly cron loads them through the one path (scratchpad `sim/upload_intake.mjs` + `sim/inbox_dryrun.mjs`: the five files
  through `applyInbox` on real SQLite BEFORE the rows go to D1). Batch 1, 15 Oct 2026: January–May 2026 (SGA 31-A … 35-A;
  59 / 61 / 62 / 61 / 69 lines; $73,584.81 / $75,792.64 / $72,174.30 / $67,184.55 / $74,082.02 incl. the $15 bank charge;
  every month reconciles and agrees with the summary sheet; February and March equal the connector-read rows to the cent in
  every column, so re-loading them changed only `sga_date`). **A real workbook's DATE cell is an Excel serial** (46057),
  which the connector's text dump never showed: `excelSerialToISO` in `sga.js` turns it into `2026-02-04`; TDG's own text
  ("May 04, 2026") is kept as written. Pinned by `test/sga.test.js`. These older workbooks carry no TRAINREL sheet, so they
  write no `training_cost` row (September's TRAINREL already holds Jan–Sep 2026) and, being older bills, never replace the
  September file's `sga_summary` rows (the later period wins — the values are identical anyway). Batch 2, the same evening:
  December 2025 and June–September 2026 (SGA 30-A, 36-A, 37-A REVISED, 38-A, 39-A; 65 / 64 / 67 / 62 / 76 lines; $72,159.79 /
  $79,782.31 / $78,050.32 / $78,650.47 / $76,061.94); July–September carry TRAINREL, so `training_cost` holds the category
  detail for Jan–Sep 2026; December 2025's refs read `ADV-2026-01-30-01` and its period is still DECEMBER — the file's name
  (§10c), never the ref.
- **TDG's 2025 WORKBOOKS SPELL THINGS DIFFERENTLY — read them as they are** (16 Oct 2026, Miguel's third batch, July–November
  2025, PR #263). July and August name the manning sheet `SUMMARY MANNIING`, September's is `SEPTEMBER SUMMARY MANNING` with a
  `DG3 SUMMARY 2025` summary sheet, and July–October head the allotment column `BASIC PAY` ("Allotment Total" above it every
  month; `HOME ALLOTMENT` from November 2025). Read as 2026 files they were refused (`no_manning_sheet`) or did NOT reconcile
  (October $24,096.85 against TDG's $79,084.61 — the allotment column missing), and `applyInbox` would still have loaded the
  short totals. ONE source of truth in `sga.js`: `isManningSheet` (`SUMMARY MANN?I+NG`, never the hidden `SUMMARY MANNIING (2)`
  copy every workbook carries — CODE / PARTICULARS / REF. NO. / AMOUNT, no CREW column; `pickSgaSheets` takes the sheet whose
  rows carry the REF. NO. + CREW header), `isSummarySheet` (`2026 SUMMARY (2)`, `2025 SUMMARY`, `DG3 SUMMARY 2025`),
  `SGA_COLS.allotment` = HOME ALLOTMENT or BASIC PAY (no 2026 header carries both — checked on the ten 2026 workbooks), shared by
  the mail intake's `WANT_SGA`, the inbox and the Upload page's inline filters (static-guarded). A file name with underscores
  (`NOVEMBER_2025`) still says its month. Batch 3, 16 Oct 2026: July–November 2025 (SGA 25-A … 29-A; 58 / 57 / 67 / 59 / 58
  lines; $63,396.16 / $72,848.00 / $82,860.30 / $79,084.61 / $75,131.46 incl. the $15 bank charge), every month reconciling,
  the summary sheet agreeing where the workbook has one (July and August have none). These older bills write no
  `training_cost` row (their `TRAINING` sheet is a statement cover, not the TRAINREL table) and never replace the 2025
  `sga_summary` rows the September 2026 file wrote (the later period wins; the figures are identical). Pinned by `test/sga.test.js`.
- **THE ORIGINAL WORKBOOKS ARE KEPT — Miguel, 15 Oct 2026: "keep this [the files] somewhere in a bucket in the database or u
  will figure out where .. I dont wanna lose this .. so is accessible to the brain when need it."** `src/sga_archive.js` (pure)
  + `archiveSourceFile` in worker.js: every workbook the Worker receives goes to the **EXPORTS R2 bucket** (`cims-hr-exports`,
  under its own prefix `sga-archive/<kind>/<year>/<MM>/<sha16>-<name>`, never mixed with the Keyman backups under `keyman/`) and
  one row to `sga_source_file` keyed by the file's SHA-256 (migrations/0029, the same CREATE in `ensureSga`'s wave) — the same
  identity as the inbox (`file_key mail:<sha16>@<sha16>`) and `sga_file.file_hash`, so a bill on file, its inbox rows and its
  original are one thing. Two writers, both the Worker: the **mail intake** archives every attachment it took (held and
  already-loaded ones too — keeping costs nothing, loading is the gate), and the **Upload page** sends the raw file to
  `POST /api/sga/archive` after a successful Apply (`keepSgaOriginal`, "Original kept" chip). `GET /api/sga/file?hash=` returns
  the original; `/api/sga` carries `sources`; the Travel tab's Bills on file table says "kept · download" / "not kept" / "no
  record" per bill. **A mail whose file is already loaded (same bytes → same key, status ok) is archived and receipted, never
  queued again** (`already_loaded`) — so re-sending a bill to sga@cims.work is the way to archive an original without
  re-applying the month. A failed archive is reported on the result and never blocks a load; a row that already holds the
  bytes is never downgraded. **The ten workbooks Miguel uploaded on 15 Oct 2026 are loaded but their bytes are NOT in the
  bucket**: this session parsed them outside the Worker, and neither the Microsoft 365 connector (1 MB upload cap) nor the D1
  tool can carry a 2 MB binary — their `sga_source_file` rows say so (`r2_key` NULL, note). To keep them, drag each once on
  Upload data (Replace → identical lines, then the archive) or email them to sga@cims.work once the Email Routing rule exists.
  Pinned by `test/sga_archive.test.js`, `test/mail_intake.test.js`.
- **A BILL THAT DOES NOT RECONCILE IS HELD FOR RITA** (Miguel, 17 Oct 2026, of three options: "Hold it for Rita"). A workbook
  that arrives by itself — the inbox (`applyInbox`: the mail intake, the agent's rows) — whose lines + other charges do not
  add up to TDG's GRAND TOTAL loads NOTHING (`syncDeps.applySga` with `holdUnreconciled`, the inbox's only caller): its rows are
  `unreconciled`, `sp_sync` says `held`, the activity log names it, and `/api/sga` returns it as `held` (the month, lines,
  others, grand total, the gap, the kept original's hash) until a bill for that month is loaded AFTER it. The Travel tab's
  Needs a decision carries it in every view of its year, red, to the cent, with Download (`/api/sga/file`). Rita loads it on
  Upload data after checking with Finance (the dry-run's amber chip, then Apply — unchanged). A summary-only file has no
  total to miss; the dormant Graph sync and the Upload page are unchanged. The same held mail sent again is held again.
  Pinned by `test/sga_hold.test.js` (real MIME, postal-mime, SheetJS, SQLite), `test/travel_filters.test.js`.
- **THE TRAVEL TAB'S FILTERS ACT ON EVERY SECTION** (Miguel, 16 Oct 2026: "I dont think this filter is working correctly .. review
  this and all the filters and fix the bugs"; PR #265). The background revalidation (`cachedJson`) lands in `travelRefresh`,
  which repaints the body under the same `TF` — it used to re-run `renderTravel`, resetting Year / Month / Category / cruise
  line / kind and the search box to the defaults. `tPeriod` = year + month is the period every section reads (the year's
  closed months, or the one month; a month in progress or ahead has no budget pacing; the pacing chart and table keep the
  whole year and highlight the month); a Category narrows every amount and drops the pacing (the $15,000 is for all travel
  together; the share tile reads "Hotel share of $13,321 all categories"); All years shows the latest year on the overview
  and SAYS so ("latest year" on the tile, "all years" on the line items — the budget is annual, an all-years aggregate has
  no meaning against it); the search lists people inside the period; a previous year with no rows reads "—", never "$0";
  the Training centre view greys out the selectors it does not use; `usd0` prints "-$655". **A quiet year-over-year on every
  monthly chart** (Miguel, the same day, on the Training centre chart: "a very settle YOY comparison when filtered"; PR #270):
  ONE helper `tBars` draws last year's same month as a pale bar beside each month, a small muted percentage under the month
  (only for closed months — never "-100%" on months not yet run; hover for both figures) and one legend line; no previous
  year → the plain bar. Used by the Training centre chart and both Travel tab charts (the pacing one keeps its dashed budget
  line and red months). Pinned by `test/travel_filters.test.js`; `test/perf_invariants.test.js` names `travelRefresh` beside
  `crewRefresh`.
- **THE TRAVEL TAB, REDESIGNED** (Miguel, 17 Oct 2026: "improve this .. user experience and user interface .. fresh, young,
  luxury feeling .. place the filters like we have done elsewhere on the left .. allowing rita to make decisions"; proofs
  under `docs/mockups/travel_20261017/`). **The filters are a left rail** like the Crew and Keyman tabs (`crrail` `#trrail`,
  236px; the Filters button on a phone): Search (drawn ONCE in `renderTravel`, so it keeps its focus), View (Crew travel /
  Shoreside team / Crew + shoreside / Training centre), Year, Month (a 12-chip grid, a month with nothing on file greyed),
  Category, Cruise line — each row with its amount for the SAME period as the hero (`inPer`: the chosen month, else the
  year's closed months), repainted by `tvRail` on every `paintTravel`; Training centre keeps View + Year only. `TF` is
  unchanged, so every rule above holds. **The page answers in order**: one hero card (the number; "On budget · $X under" /
  "Over budget" for crew travel only, every category and line; the year against last year as a pill; the meter against the
  $180,000 with the pace tick and the dashed projection; last year same months, where the year lands, and **what is left a
  month** for the rest of the year to land on budget — or, on a view with no budget, "No budget for this view · year
  against year"); **Needs a decision** (`tvDecisions`): a closed month over $15,000 (budgeted view), TDG's bill against the
  workbook as ONE net gap per category over the months the bill covers, ≥ `TV_GAP_MIN` = $150 (Miguel, 17 Oct 2026:
  "Net per year" — a charge typed into the next month cancels out; a chosen month is that month alone; each month stays in
  the comparison fold), the category up most on last year
  (≥ 20% and ≥ $1,000), a closed month with spend and no bill on file, the names the roster cannot place, single movements
  above 2.5× the usual — each says what it means and opens the place that holds it (`tvGo` sets one filter, `tvOpen`
  opens a fold); it settles nothing (§6); none → "Nothing needs a decision in <period>". Then Month by month (`tBars`),
  Where it goes (bars, last year pale, click = that category) beside Who (top 8, initials, click = their history), and three
  folds: TDG's bill against the workbook (its summary says the year's bill and workbook totals; `sgaBillOf` is the ONE
  definition of the bill per month, read by the table and the decisions), the names the roster cannot place (the year
  shown, like its decision row), the line items. Pinned by `test/travel_filters.test.js` (the page in a vm on a small
  workbook + bill).
- **Budget and comparisons, settled 15 Oct 2026**: seafarer travel $15,000 / month (`TRAVEL_BUDGET_MO`, flat every month in
  every year — Miguel, 16 Oct 2026: "I kept it all at 15000 per month"); NO budget for
  shoreside or the training centre — those views show the year against the previous year (YoY), never a budget; TDG's "W"
  line on Azamara Quest stays as TDG wrote it ("leave the W as it is").
- Not money (§1). The Travel tab is a reference read (§10b), never an invoice source.

## 10i. THE SIGN-OFF INSTRUCTIONS EMAIL, 14 DAYS OUT — Miguel + Rita, 16 Oct 2026
Seven rounds on the rendered mock-up, then "shoot this email 2 week prior the seafarer sign off .. CC onboard support".
`src/emails/hr.signoff.instructions.v2.js` (pure, canonical letterhead), filled from the Keyman board (`seatContexts`,
`src/signoff_context.js`: the CURRENT seat's ship, brand, sign-off, port, and the first card / seat after it on that hull,
else TDG's undated Earmarked row). Sent by the daily auto-send (`auto_send.js`, 08:00 Budapest, once per seat in
`auto_send_log`) and by the crew page's button, both through `sendInstructionsFor` / `apiInstrRequest`. Rules (Brain
recnTLnsjGVcXs4EU, rec2dsh7hh8mIYwgV, recJIAzBJv8SDDl1N, recTAzAfzjpC0bSXX):
- Greeted by FIRST NAME (first word of TDG's first name). Signed by Rita; reply-to Rita; **CC onboardsupport@dg3.com**
  (the whole CIMS team's distribution list).
- **Digital Handover Notes** (the HON app; open hon.cims.work, select the ship — no other click), mandatory; a short PRINTED
  copy still stays onboard: one for the reliever, one for the shipboard manager. The manager's title is the brand's:
  Azamara **BOM**, Royal **GSM**, Celebrity **DCM** (`MANAGER`). Never "GSM" fleet-wide.
- **Never promise the two specialists meet** (Azamara usually overlaps; Royal / Celebrity usually do not, except a new
  hire). Only when the reliever's sign-on is BEFORE this sign-off does the email say "you overlap aboard for N days";
  otherwise "you may or may not meet <first name> aboard". No reliever: "not named yet", never a guess.
- The final count is signed in the handover notes; Ray Guerra and Jonathan Placer Alonzo receive it.
- **One call to action**: the pass's "Open my Digital Handover Notes" is the acknowledgment link (`/instr?t=`), which records
  the receipt (`instr_ack`, the onboardsupport confirmation, the profile's crew-change tick) and forwards to hon.cims.work.
  No "I have read" button.
- **THE SIGN-OFF PASS** (Miguel, 19 Oct 2026: "looks too computer .. make it more human sounding"; "people dont know what
  HON is .. replace that by Digital Hand Over notes .. across the email"; "add .. the name .. phone and email of the incoming
  crew .. so they can be in contact"; "convert all this to something similar to a digital airline pass"; two rounds on the
  render, desktop and phone, then "I like it now"; proofs under `docs/mockups/signoff_pass_20261019/`). The opening is a
  headline in words ("Two weeks to go, <first name>." — `toGo`, the pass says "14 DAYS TO GO"), one sentence, and a boarding
  pass: FROM the cruise line's ship code (`ship_codes.js`) TO HOME via the sign-off port; the seafarer (first word of the
  first name + surname) and TDG's position; Signed on · Sign-off · Audit window (sign-off −14 to −7); a tear line; the
  reliever; a tear line; the one button. **The crew never reads "HON"**: the product is "Digital Handover Notes";
  hon.cims.work stays once (step a) as the address to type on a ship's computer. **The reliever's mobile and email are
  printed ONLY when TDG has the reliever** (`signoff_context.relieverInTdg`, the IN TDG chip: TDG's Earmarked row, a seat the
  file put aboard, Rita's card the file confirms or earmarks for that hull — the dashboard's `tdgHas` reads the same; a
  card only the console holds, or "told Joy", is not): a plan only the console holds must reach nobody (§10d). A Philippine
  mobile reads "+63 917 555 0142" with tel: and WhatsApp links (`phoneOf`), anything else as written; TDG's "-" prints
  nothing. Every active crew had a phone and an email on file on 19 Oct 2026. The reliever is NOT sent the outgoing crew's
  contact (a new email; its render is Miguel's to sign off first).
- The HON bonus box (Ship handover factor, reczJqxZnOuzkv74X) shows only for sign-offs on or after 1 Nov 2026.
- **One switch per email** (the rail's Automation: Instructions · Sign-off link · GSM review; `/api/autosend` with `kind`).
  Switching a kind ON stamps the day (`auto_send_instr_since` / `auto_send_link_since`): a seat already inside the
  window is never auto-emailed, only listed in the digest ("inside the window at switch-on — send by hand"). The old
  one-for-both `auto_send_enabled` still means both. The T-7 sign-off link email was NOT reviewed in this round: its
  switch stays off until Miguel signs off its rendered email.
- **A TRAINING VISIT IS A TRIP, NOT A CONTRACT; THE TRAINERS ARE TAGGED** (Miguel, 17 Oct 2026: Jonathan "sometimes he goes
  to the ship to teach as crew and then home [to] support .. same as Ohji"; then "perhaps you can tag the 3 guys as trainers"
  — of the options, "Trainer tag"). Jonathan Placer Alonzo sailed a full contract (Rhapsody, Dec 2025 – Sep 2026) and is now
  teaching A.J. Baleña aboard Pursuit (embarked 16 Oct, Rita typed 24 Oct); Ohji Garcia Miranda taught on Onward 7–12 Sep;
  Joemar De Leon on Onward Jan–Feb. TDG lists them as Printer Specialists On board, so the file cannot tell a visit from a
  contract. `src/visits.js`: a trip is a visit when Rita marked THAT trip a visit (`contract_visit.kind`), or the crew is a
  **trainer** (`crew_trainer`, the "Trainer" toggle in Edit crew; Jonathan, Ohji, De Leon tagged on Miguel's word,
  `migrations/0033_crew_trainer.sql`) and Rita did NOT mark the trip a full contract (`kind = 'contract'`, the contract
  window's "FULL CONTRACT" chip on a trainer's trip, `POST /api/crew/contract-visit` with `kind`, audited), or the crew is
  on the shoreside team who never sail as printers (`SHORE_NM`: Ray, Rolando, Dexter Lawrence, Miguel, Rita; trainers are
  shoreside too — off the pool, the bench and the counts while ashore). Why the default is a visit, not a tick per visit:
  a forgotten tick named the trainer as somebody's reliever in a crew email; a forgotten "full contract" leaves the ship
  empty / red on the board and the Gantt, loud and internal. His answers on what a visit does: **no instructions email and
  no 7-days-out sign-off link** ("yes"; `seatContexts` instruct false / visit true; the daily run skips both silently; the
  buttons answer `not_instructed` / `training_visit`); **never the reliever** and its embark **never dates the printer's
  sign-off** (no cross-over in `legsFromRegistry`, never the cross-over's reliever, not picked by `seatContexts`, not the
  profile's before/after); **not a completed contract** (its debark never adds to TDG's count: `completedSince`, the
  `CC_*_SQL` join reads the mark and the tag); **off the bench and the seats** (a "Training visit · trainer" line under the
  ship's cards — `sec.visits` — never on the timeline, the Gantt or the dashboard). Time at sea still counts its days. The
  mark belongs to the trip that embarked that day: a later file that moves the embark makes it a new trip. (The same
  morning this was Jonathan's id alone, PR #284, then a per-trip tick, PR #285.) Checked on the 17 Oct 2026 production
  data before merging: Score Card inputs, statements and schedule legs identical for all 108 crew. Pinned by
  `test/visits.test.js`. A sign-off already past is never instructed (`signoff_passed`, 17 Oct 2026).
Pinned by `test/signoff_instructions_v2.test.js`.

## 10k. THE CREW HUB AND THE WELCOME EMAIL — Miguel, 19 Oct 2026
"what if we have this as a 'good to know' and you build something similar ... the landing page that they can read"; his
answers: per-crew link, fix the Expense Report's errors and keep its look, mock-ups first; the bonus wording approved as
written ("ok cool"), then "deploy". **No attachments** (the same evening: "we change the way we do it .. no more files with
the exception of the excel file for expenses .. u are drifting"): the Crew Hub carries what the five PDFs did (payroll
dates, compensation, tech support, ergonomics, mission and values); the email attaches NOTHING and the Expense Report is a
download link. An earlier "keep the six" answer is superseded — never attach files to this email again. Proofs under `docs/mockups/welcome_20261019/`.
- **The Crew Hub** (`src/crew_hub.js` page, `src/crew_hub_routes.js` routes): `GET /hub/<token>` opens one seafarer's page with
  NO login — the link is the key (`crew_hub_link`, migrations/0034: 24 random bytes, never derived from the crew id; revocable;
  `last_seen_at`). Signed in: `POST /api/hub/link` (the same link until revoked; the profile's "Crew Hub link" copies and opens
  it) and `POST /api/hub/revoke` (the next request makes a new one), both audited. `HUB_ORIGIN` = "https://hub.cims.work"
  (production `[vars]`; the custom domain exists since 19 Oct 2026; unset = the request's origin, as on staging). Headers: no-store, noindex, no-referrer.
- **What it shows, from where**: the running contract from the board's ONE schedule (`currentLeg`, never a training visit), its
  sign-off's source said (TDG / Rita / projected, §10d); the next payday from `src/payroll.js`; the contract number = the
  consecutive count + 1, READ through the Score Card's own helpers (`hubBonusCount`: the last committed `count_after`, else the
  baseline) — §1: never written. **No baseline and no committed outcome = no personal number**: the ladder only, never
  "contract 1" for a crew whose count is simply not recorded. The ladder and FLOOR are read from `bonus.js`; the page says
  "up to" — the payout is the step times the Score Card score, at 80 or more (his draft said "finish without a reset and you
  earn $500", which the engine does not do). The bonus wording is Miguel's approved text; changing it is his call.
- **Payroll dates are data** (`PAYROLL` in `src/payroll.js`, twelve [month, paid on] pairs per year, from payroll's own PDF):
  2027 is one more list, never derived; with no next date published the page says so, never a guess.
- **The Expense Report v3** is served at `/hub/expense.xlsx` (`src/hub_assets.js`, byte for byte
  `docs/mockups/welcome_20261019/expense_report_v3.xlsx`): Legend, Star, Symphony, Xcel on the ship list (now dropdowns, warning
  only), Mary Joy named, every line blank until used (v2's line 11 had no formula but was summed), and the rate's direction
  stated (USD for 1 unit of the receipt's currency — "1 USD = 58 PHP" typed into v2 overclaimed ~3,000x).
- **The welcome email** (`src/emails/hr.welcome.v1.js`, filled by `src/welcome_context.js`): the pass, the first 15 days, who to
  message, the Crew Hub card (one green button), the Expense Report download. Never a placeholder: a link not given is no
  button ("Rita sends you a time"); no predecessor within `RELIEF_WINDOW_DAYS` of the sign-on is no "You take over from"; the
  predecessor is named by first name, never "his". `GET /api/hub/welcome?id=` previews it with the crew's real data and their
  hub link (the profile's "Welcome email · preview").
- **The send** (`src/welcome_send.js`): To = the ship's mailbox (cims-timecard `ship_contact`, `audit.shipMailbox`, read only)
  AND the personal address (Rita's override first), never the same address twice; CC + reply-to Rita (`WELCOME_CC`); no
  ship mailbox = the personal address alone, neither = `no_recipient`, never sent. **Once per contract** (`welcome_send`,
  keyed sc + the sign-on), a resend is a deliberate second click. The profile's **Send welcome email** runs a dry run that
  names the recipients, then one confirm. The **daily run** (`_welcome.run` in `scheduled`, **07:00 Miami time** — `WELCOME_TZ` America/New_York,
  `WELCOME_HOUR`; Miguel, 19 Oct 2026: "the same day that the crew sign on .. 7am miami time") welcomes contracts that signed on today, catching up `WELCOME_CATCHUP_DAYS` = 2 for a missed run; never a training
  visit; a mail that did not go is not recorded, so the next morning retries; failures land in the activity log
  (`welcome_send_failed`). **Its switch is the Automation rail's "Welcome"** (`/api/hub/welcome/auto`, `welcome_auto_enabled`
  + `welcome_auto_since`): OFF until switched on, and switching on never emails a contract that started before that day. The
  missing training / day-7 / day-15 / SOP / booking links block nothing: no link = no button ("Rita sends you a time").
  Pinned by `test/crew_hub.test.js`, `test/welcome_email.test.js`, `test/welcome_send.test.js`.
- **THE CREW VIEW — Data › Crew view** (Miguel, 19 Oct 2026: "I wanna make sure I know what the crew is seeing";
  "impersonating a crew .. rita can chose the person .. and then it can see audit the information"). Rita picks anyone (or one
  example per case: aboard with a contract number, aboard with no count on record, just signed on, Azamara, between
  contracts — `hubExamples`) and sees their Crew Hub (`/api/hub/preview?id=`) or welcome email (`/api/hub/welcome?id=`) at
  phone or desktop width, beside **the audit** (`/api/hub/audit?id=`): every value the page shows with its source — the
  contract and how its sign-off was set, the contract number and whether it comes from the last committed outcome or the
  baseline (`hubCountDetail`, READ only, §1), the next payday, the hub link (made, by whom, last opened) and the welcome
  email (sent, to whom, or who it would go to). **A look writes nothing**: the preview and the audit read the SAME model as
  the crew's link (`modelFor`), make no link and record no visit; the welcome preview's hub button opens the console
  preview, never a real link. **hub.cims.work** with no link is the hub's landing page (`hubHomePage`), never the console.

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
- **The count keeps counting** (Miguel, 8 Oct 2026: "so u can keep counting as seafarer keep finishing their contract
  from that moment forward .. is an addition to the number"). TDG's number is fixed at the file's as-of date; a
  contract TDG ENDS after that date adds one (`completedSince`: the crew's row in the last AdvancedQuery carries a
  DEBARKEDDATE after the as-of date and not in the future). Every grade reader passes it as `cumulativeContracts(...,
  added)` and reports `contracts_added`; the page prints "TDG count as of <date> + N finished since". The next count
  file restates the number. Limit, stated: the snapshot keeps one row per crew, so a crew who finishes AND re-embarks
  before the next count file carries only the newer row. The derived fallback never takes the addition. The
  CONSECUTIVE bonus count is untouched (§1). The page reads the as-of date from TDG's filename with the month short
  or spelled in full ("as_of_08_October_2026" was refused as dateless until 8 Oct 2026).
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
  "Reserved Crew" reads Reserved (the vessel beside it is the last ship), "Not for Rehire" Not for Rehire (§10f). The join
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
  rule. (The backup CSV still reads the Counter; the roster export reads it first with the TDG file as fallback and newer-embark override since 11 Oct 2026 — §10d; the relief printers read this schedule since 8 Oct 2026.) A leg
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
  yellow card on the target ship and stays where it is (one crew, two ships). Dates = the ship's last earmark's
  sign-off (the chain, §10d, 8 Oct 2026), else its current printer's if ahead, else today; + 7 months (+ 5 Azamara) on
  the turnaround; the same ship twice is refused
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

## 11c. Invariants from the 8 Oct 2026 bug hunt (five reviews, every finding traced to a real input — don't regress)
Pinned by `test/bughunt_1008.test.js`.
- **crew.status holds four words.** Production's column carries `CHECK (status IN ('On board','On Vacation','Earmarked',
  'Inactive'))` (migration 0001, read from D1). Every writer goes through `storableStatus` (`crewimport.js`): Reserved →
  On Vacation, Not for Rehire → Inactive; TDG's own word stays on `registry_snapshot.raw_status`, which readers show first.
  A raw "Reserved" in the batch failed the WHOLE AdvancedQuery Apply.
- **`activeSpanOf` returns `{ active_on, active_off }`** in every branch (the 7 Oct registry branch returned another shape:
  every file-dated crew read "No active contract on file" on the Crew tab and the ledger — 50 aboard on 8 Oct).
- **`boardSource` returns null on a failed read and `boardLegs` throws** — never the frozen SHIP_HISTORY for a live board.
- **A session is re-checked against the allowlist** (`stillAllowed`, cached 5 min per isolate). SESSION_TTL is 30 days
  (Miguel, 9 Oct 2026).
- **Only what Rita changes is written.** Edit crew posts changed fields only (`crewEditBody` vs `CREW_EDIT_INIT`); the
  contract modal sends a PROJECTED sign-off only when changed (`offToSave`) — an untouched projection posted back became
  "Rita's" date. Saves report a refused response and keep the modal open.
- **Contributor answers, crew names and ports are text** (`escHtml`, `fbEsc`, `rEsc`): the Score Card's evidence ran HTML
  from the public `/fb` link inside a money user's session.
- **Dates are calendar dates**: month arithmetic clamps to the month's end (`addMonthsISO`, `plusMonths`); the page compares
  document dates as days (`dUntil`, `ageOf`), never a UTC-midnight `Date` against the clock.
- **Sign-off link / instructions resolve the SEAT** (`seatLeg`, the board schedule) and refuse to wipe an acknowledged row
  (`already_acknowledged` unless `force`). Telling Joy (`markDeployed`) leaves `assignment.updated_at` alone.
- **Earmarks:** one TDG earmark answers only the hull's EARLIEST future card (`firstFuture`); "signed off" needs an ashore
  word (On Vacation / Reserved), never an unreadable hull. Dismissals compare full timestamps.
- **Feedback answers are kept, not carried** (Miguel, 9 Oct 2026: "I like your idea but we need to keep stored somewhere
  the previous feedback"): a new window for a crew + role, or a second in-app answer, marks the old response
  `superseded_at` (never deleted); only `superseded_at IS NULL` feeds the Score Card prefill, the feedback board and the
  scoring queue; `/api/feedback/crew` returns `previous` and the Score Card lists them ("Earlier feedback kept · not used
  for this contract"). A money-adjacent change (bonus input): merged by Miguel, §1.
- **Decided, left as is (Miguel, 9 Oct 2026):** `contract_group_id` counting relief shells ("is ok"); any user may email a
  statement to any address ("is ok for now .. will change next year or so"); SESSION_TTL 30 days. Still open by design:
  the magic link is not single-use (mail scanners would burn it); a name-ladder match whose cruise-line id differs is
  kept (the count file uses PCN ids — Domingo — so a different id is not proof).

## 11d. Invariants from the 13 Oct 2026 review (Miguel: "it appears that is getting slower .. find bugs and fix them right away")
Measured, not guessed: production's `perf_log`, D1's own timings per statement, and the page in Chromium at 4x CPU.
Pinned by `test/bughunt_1013.test.js`, `test/port_days.test.js`, `test/turnaround.test.js`.
- **The itinerary is read by index, the date list outer.** The two board joins in `port_days.js` read ~190,000 rows (~70ms of
  D1, which runs one query at a time) on EVERY board and relief-board load. Now `FROM (dates) x CROSS JOIN vessel_port_day v`
  seeks `idx_vpd_ship_date (ship_short, berth_date)`; turnarounds use the partial `idx_vpd_turn_date` (migrations/0023,
  applied in prod; `ensurePortDayIndexes` on the board and `/api/relief/board`). ~3ms, ~1,000 rows, the same rows. Never
  drop the index: the CROSS JOIN order without it scans the table once per date.
- **Smart Placement** (`wrangler.toml [placement] mode = "smart"`): the D1 primary is in Prague; a Worker at the user's colo
  paid the ocean on every sequential round trip (HKG `/api/crew/get` 2.1s vs VIE 0.85s for the same reads).
- **The board draws once per render** (the relief data already here goes into the first paint), a chevron folds its ship
  in place, Search waits 160ms for a pause, `#rotbody>.shipsec` is `content-visibility:auto` (full draw 1,170 -> ~450ms,
  chevron ~1,000 -> 40ms at 4x CPU). The automation switches keep their state across renders (`applyChromeToggles`).
- **The page never lets an older answer win**: `openCrew` checks its own `VIEW_GEN` after the reads; the Crew tab's background
  refresh repaints (`crewRefresh`) and keeps the search; one note per click (`_noteBusy`); the Notes draft survives a chip;
  one contract modal, one relief overlay; `ganttClose` removes its Esc listener however the view closes; a relief-panel
  save calls `apiDirty` (an iframe is outside the fetch shim); Maria, previews and dry runs keep the cache (`_ro`).
  The relief panel saves once (`save._busy`) and the server refuses the same crew twice on one ship on INSERT too.
- **A contract TDG still has On board is current on the statement**: never "Signed off"/"Completed" for a held or overdue
  contract (`statementContracts`), and every current contract is at sea to today (profile, statement, crew file).
- **A span is never negative** (Jul 31 -> Mar 1 = 7 mo 1 d): the days after m whole months, month-end clamped — the email,
  the PDF and the page (`monthsDaysParts`). The email reads documents against the running contract like its PDF.
- **Rita's NEXT contract on the hull a crew is aboard** (a future card >= `NEXT_CONTRACT_DAYS` = 90 after the embark) is not an
  `embark_date` row — the default Accept deleted it.
- **The Counter is folded ONLY within `ABSORB_DAYS`** — never on overlap. A first cut of this review dropped a Counter
  contract that overlapped the file's on the same hull (Quiming, Infinity: Counter Apr 8, file embarked Aug 7 — 255 sea
  days became 67 on his statement); that was the console reconciling TDG's two files (§6, §10b). Reverted the same day:
  the contract is history, shown and counted, and the profile's To-check says "TDG's two files disagree"
  (`counter_overlap`). The triple check that found it: `scratchpad sim/moneydiff.mjs` — the Score Card's inputs, the
  statement and the schedule for every crew, before vs after. Run it before merging anything near the schedule.
- **Turnarounds are keyed like legs** (`shipKey`): "Celebrity Compass" now snaps.
- **PDF text**: a word wider than its column is cut, WinAnsi letters (Š, Ž, Œ, €, ™) print as themselves, the name is
  fitted to its column. Imported names are escaped everywhere the review found them raw.
- **Left as findings, not changed here** (reported to Miguel): `apiBonusCrew` / `gatherStatement` still make 3-4 sequential
  trips — they read the bonus count, so a rewrite is his to merge (§1); the bench box vs one-tap start date when a card
  the file contradicts is hidden; `guard_ms` overstates cold starts; `/api/crew/file.pdf` computes the board twice.

## 11e. Invariants from the 16 Oct 2026 bug hunt (Miguel: "read the code.. find bugs and fix them .. also review the logic")
Four pull requests, every fix reproduced first; the fifth (the Score Card's automatic read) is a DRAFT for Miguel (§1).
Pinned by `test/bughunt_1016.test.js` (the page, run in node:vm on a pinned clock), `test/bughunt_1016_imports.test.js`,
`test/bughunt_1016_plumbing.test.js` (worker.js internals through a copy of the file with an export line, real SQLite where a
sequence of writes is the point), and the suites named below.
- **A slow tab never paints over the next** (PR #275): every tab render captures `VIEW_GEN` and gives up when its answer lands
  after the user moved on; Dashboard and Fleet revalidate through `opsRefresh` / `fleetRefresh` (the week page, the filter, the
  mode and the search survive a changed answer); the relief overlay closes on Esc, a backdrop click and a 15-second notice, and
  the iframe reports a board it cannot open; `contractPass` counts between CALENDAR days ("OFF today", never "OFF 1 d ago" at
  14:00); the ship timeline and the relief board project an earmark's end month-end clamped (`pfAddMo`, 5 months on Azamara);
  the import run is signed by the SESSION (`runBy`), never by a hard-coded "Rita".
- **"-" is TDG's blank in EVERY cell** (PR #276), not only the dates (`crewimport pick` / `blankCell`): it became a province, a
  phone, a passport number or a SHIP and never cleared a card. **The file's SHIP CREW ID reaches the crew row**: a new crew's
  INSERT carries it, an existing crew with none is filled on Apply (bound `IS NULL`), a roster row whose id differs is listed
  (`review.km_mismatch`), never overwritten (§6). A cruise-line id shared by two roster rows resolves nobody (`buildBridge`). The
  count import holds a loaded count whose id the file still lists but the roster could not place this time. A re-drop compares
  the rows READ on both sides (`rows_seen`), not the rows with an agency id.
- **The Worker's plumbing** (PR #276): `decodeEmailBody` ends the text/plain part at ITS MIME boundary (a "-- " signature cut every
  forwarded report to its first paragraph), decodes quoted-printable only when declared and as UTF-8; the sign-off dispatchers are
  installed once (`_autoAck` / `_autoInstr`); every module guard runs once per database (`src/ensure_memo.js memoDdl`;
  `ensureAppSetting`, `ensureMariaLog` memoized); **`addColumn`** is the one way a guard ALTERs — "duplicate column" and "no such
  table" swallowed, any other error fails the guard so memoEnsure never records it as applied with the column missing; `getCookie`
  returns the raw value of a cookie that is not valid percent-encoding instead of a 500 on every request; an intel email the
  engine answers nothing for is asked `INTEL_MAX_ATTEMPTS` = 3 times, then goes to the human review queue with the sender's own
  words (`email_inbox.attempts`, migrations/0031) — it was released for the next sweep for ever; `applyInbox` CLAIMS a file (status
  `applying`, its own token) before loading it, a stale claim is released after `INBOX_STALE_MIN` — the mail intake and the
  hourly cron loaded one file twice.
- **The sign-off port is never the home-port seed** (PR #277): the seat says where its port came from (`disembarkSrc` rita / counter /
  card / home); `signoff_context.portOf` takes a typed port, else the itinerary's port ON the day (`resolveCity` "derived"), never the
  seed and never a port a day away. **A colleague is not the reliever**: a sign-on more than `RELIEF_WINDOW_DAYS` = 45 before this
  sign-off is the second printer. `completedSince` reads the row's embark too (`ccRowOf`, `CC_WITH_OFF_SQL`): a debark before the row's
  own embark is not a contract finished since the count. **Months and days have ONE definition**: `span_md.mdParts` / `mdShort` /
  `mdWords` — the statement, its email and the instructions email read it; the page keeps its inline twin (`monthsDaysParts`).
  Dexter is not "asked" (his audit replaced his feedback, §10j); the relay labels a Counter leg "per the Contract Counter".
- **The Keyman schedule** (PR #278): an ended card within `ABSORB_DAYS` of a leg of the same crew on the same hull is the
  same contract (`mergeBoardLegs`: it drew two "Contract completed" rows); a reliever card is contradicted only by a file dated
  AFTER its sign-on (`>`), never by the file of the same day — the export runs in the morning, the reliever embarks that day (the
  strict rule earmark.js already had). Checked on the 16 Oct 2026 production data before merging (§11d): no `assignment` row
  carries an `actual_sign_off` and no open card has a passed sign-on, so neither rule moved a seat, a date or a statement that day.
  **Left as designed**: the earmark bench lists a crew whose current contract is past its sign-off (held / overdue) as home from that
  sign-off — the pool is measured on the earmark's START date (`earmark_bench.test.js` pins it, "off 6 Oct per the board (held)").
- **The Score Card's automatic read — a DRAFT for Miguel (§1, the pull request after #278, never merged by the agent)**: Ray's answer from BEFORE this contract's sign-on is listed as earlier
  feedback and not used (it pre-filled the next contract because nobody asked again); `aboardOn` does not read an ENDED leg with no
  date as aboard for ever; HON's outgoing NAME must be this crew (a shared surname on the hull is not his handover; a surname with
  only a suffix beside it still is); a Parts Portal or HON read that FAILS is said on the card (`sources.partsRead / honRead`) and
  never read as "no miss" / "no handover"; the page's `applySeval` drops an answer that lands after the card moved to another crew.
- **Reported, not changed**: `crewmatch`'s "med" surname tier (design, pinned); the page's "today" is UTC while the user's is local
  (design); a card's own tick vs a confirmed sign-off on the timeline (`K3`, nuance); D1 as read on 16 Oct 2026: one `registry_snapshot`
  row with debark < embark (Ed Del Rosario, TDG's data, handled by `completedSince`), one legacy `contract_edit` without `on_key`
  (SC-0026127, Journey), 11 `keyman_contract3` rows without a projected sign-off (the Counter as uploaded, §6), 37 crew without
  `ship_crew_id` (filled by the next AdvancedQuery that carries the column).
- **The Feedback board is its window** (Miguel, 17 Oct 2026: "Add the 45/30-day window"): `apiFeedbackBoard` lists a crew On
  board / On Vacation / Reserved only when the contract ends within `FB_DUE_AHEAD` = 45 days or ended within `FB_DUE_BEHIND` = 30
  (no known sign-off = not listed), as its heading always said; Maria's scoring_board reads the same list. Pinned by
  `test/bughunt_1016_plumbing.test.js`.
- **The dated fixtures hold on every calendar day** (`scripts/clock_shift.mjs`, SHIFT_DAYS; `docs/NIGHT_WATCH.md`): four tests were
  time bombs (a DST-dependent gate hour in `sbm.test.js`, `mock.timers` in the earmark and board tests). The night watch runs the suite
  with the clock pushed +30 days every night, and +120 / +400 on the first night of each month. 18 Oct 2026: `signoff_public.test.js`
  dated its leg's sign-off "2026-11-20"; once `signoff_passed` landed (17 Oct) seven tests would have gone red on main on 21 Nov — the
  sign-off is now derived from today.

## 11f. Invariants from the 17 Oct 2026 logic review (Miguel: "review the code and the goal here .. if u see anything u dont understand for the logic let me know")
Five readers (Keyman schedule, Score Card, TDG imports + status, what the crew are told, travel / bill / audit), every
finding traced to a production row. What contradicted a rule already written here was fixed; the rest went to Miguel as
questions (his answers land in the sections they change). Pinned by `test/review_1017.test.js`, `test/signoff_public.test.js`.
- **The sign-off emails never print the home-port seed** (§11e): `resolveInstr` / the link's resolver fell back to
  `VESSEL_REF.homeport` when no port was typed and the board had none — "You sign off … in Miami". Now no port = "To be confirmed".
- **The instructions email's plain-text part says the overlap in months and days** (`mdWords`), like its HTML.
- **The reliever carries his own sign-on** (`leg.reliever.on`): since Rita's typed date outranks the cross-over, the held note
  printed "<reliever> embarked <the typed date>".
- **The profile's time at sea runs a CURRENT contract to today** (held, overdue), like the statement and the crew file (§11d).
- **The dashboard's crew travel is the closed months** (headline, % used and the categories), like the Travel tab (§10j).
- **The Uploads review lists what the file says that nothing changes** (`impFlagged`): a repeated agency id, a cruise-line id
  that differs from the roster, a row keyed on the cruise-line id, a new row with no readable status — the stage built them,
  only the unused `/api/crew/import` page drew one.
- **Maria's "former crew" is `isOffFleet(status)`**, never the manual tag (a tagged crew TDG has On board left her active
  lists; Not for Rehire could not be listed by name).

**Miguel's answers of 17 Oct 2026 to the review** (Brain recICJGsDk6oJJpSd). Pinned by `test/review_1017_board.test.js`.
- **THE RELIEVER IS ONE RULE** (`src/reliever.js`; "Adopt it everywhere"): the first person to sign on the hull after him,
  never a training visit, counted from `RELIEF_WINDOW_DAYS` = 45 before the EARLIER of his shown sign-off and his projected
  one (sign-on + 7 months, Azamara 5 — an extension keeps the reliever who boarded on the original plan); TDG's undated
  Earmarked row the last resort. **One person relieves one seat** (`assignRelievers`): two seats wanting the same person —
  he relieves the one whose sign-off is nearest his sign-on, the other looks further. The board computes it once per hull
  (`legsFromRegistry` → `leg.reliever`, with his own sign-on); the email (`seatContexts`), the profile (`handovers`: the
  board's answer for a file-dated contract, the rule for any other) and the dashboard (`relieverFor`: the board's answer, a
  reliever already aboard included — "in TDG") read the same. **It names, it never dates**: the cross-over still dates the
  sign-off (§10d). On the 16 Oct file: 0 dates moved; Lanuza (not Suarez) for Valderrama; 20 seats gained the name the board
  had left blank (it named a reliever only when he also dated the sign-off).
- **A card TDG earmarks for that very hull** turns green "ABOARD · AWAITING TDG FILE" on its sign-on (`awaitingCard`, the
  seat's `awaiting`: verdict `earmarked` like `pending`), and a later file still listing him Earmarked there does not
  contradict it (`legsFromRegistry`): TDG has the plan, not the embark yet (Corpin, Grandeur, 18 Oct).
- **Earmarked for the ship he is aboard** (Ida Purnama, Xcel: "remember that Ida is onboard"; one person, SC-0040010, the
  duplicate merged): TDG's Earmarked word for the hull his contract is still RUNNING on (a live leg there) is his next
  contract, not the end of this one — the board seats him (`earmarkedHere`) and never ends the leg "per the TDG file".
- Decided, nothing built: **Myrna Suarez** (Spa Hairdresser in TDG's file) — "ignore", no non-printer filter. The test
  audit request ar_eb101ea1 on Kevin Jugao is LIVE (test_mode 0) — Miguel says when to void or cancel it; do not grade it.

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
- **A wave of reads is ONE D1 batch** (`src/d1batch.js`, 13 Oct 2026 — Miguel: "going from tab to tab takes a lot").
  perf_log, his own clicks: every tab 1.2–1.4s, and the Dashboard on a WARM isolate 866ms for 22 statements — fired
  together they still cost ~40ms EACH (D1 serialises them, one trip apiece). `batchingDb(env.DB)` is installed once per
  binding in the fetch handler: the SELECTs a wave issues in one turn go as one `env.DB.batch()`; each caller gets its own
  `.all()` / `.first()` answer; writes are never grouped; a batch that fails or answers without rows falls back to the
  statements one by one — today's path, so a caller's `.catch` sees its own error. All 62 hot-tab statements verified clean
  in prod D1 before shipping (a failing one would cost a trip, not correctness). Sim at 40ms/trip: a Keyman load 38 trips /
  1.6s → 1–3 trips / ~0.2s. Pinned by `test/d1batch.test.js`. The sim harness's `batch` must answer like D1 (rows for a
  SELECT), or the fallback path is what you measure.
- **The tabs are prefetched after boot** (PR #217, 13 Oct 2026): 1.2s after the first paint the page warms
  `/api/dashboard`, `/api/crew`, `/api/rotation`, `/api/relief/board`, `/api/contracts` ONE AT A TIME, 250ms apart, through
  `cachedJson` (`prefetchTabs`, `PREFETCH_URLS`), so a tab switch paints from memory and revalidates behind the paint (the
  >2s rule). A URL cached or in flight is skipped, a hidden window warms nothing, and `apiDirty` re-arms it 2.5s after a
  write (debounced). Sim: Crew 33ms, Keyman 47ms. Never make the prefetch a burst, and never put a write on the list.

## 10i. THE PRINTSHOP AUDIT — audit.cims.work (Miguel, 14 Oct 2026)
Dexter's audit app on this worker: design `docs/AUDIT_DESIGN.md`, plan `docs/AUDIT_BUILD_PLAN.md`, mock-up
`docs/mockups/audit_20261014/`. Rules, in his words where he gave them:
- **The gate** ("without that completion, I don't want him to start the audit"): `audit.js gateState` opens only when every
  press has Pattern 43 AND the MACHINE Management List read OK by HON, or is down with a reason, and every OBP line is
  counted. No override, not even his.
- **Addressing** ("display the ship email only .. his personal email gets a copy"): `addressFor` — cims-timecard
  `ship_contact` (`TIMECARD_DB`, SELECT only), the personal address in copy, Rolando + Ray in copy (`AUDIT_REQUEST_CC`).
- **The blind count** ("dont show him what is on hand"): the crew's page and its API carry `blindLines` only; OBP's on-hand
  stays server-side for the team's diff. Pinned by `test/audit_request.test.js`.
- **The files are read by HON, never a copy of HON** ("remember the reading of the files is important"): the `HON`
  binding is cims-hon's named entrypoint `AuditReader` (ship / pattern43 / managementList; stores nothing). The read
  runs on the crew's page right after the upload; the hourly sweep retries what did not finish.
- **Copy quality decides** ("we dont ask people to replace items until copy quality is affected"): the assessment email
  never says "replace"; a part past life reads against that machine's Pattern 43 (clean / marks) and HON's
  Recommendation + PARTS_RULE.
- **LIVE since 14 Oct 2026** (Miguel: "i am good with the emails", after the rendered request, reminder, overdue and
  documents-in emails; CIMS email standard §5): `AUDIT_LIVE = "true"` in production `[vars]`. Removing it falls back to
  TEST MODE (every audit email to the auditor alone, marked [TEST]). Staging never carries it. A changed email template
  is re-rendered and shown to Miguel before it ships, as before.
- **NO LOGIN on audit.cims.work, for now** (Miguel, 15 Oct 2026: "remove the magic link for right now"; asked, he chose
  "No login on the audit site" after being told it exposes crew names, ships, contracts and briefing notes and lets anyone
  send request emails): `AUDIT_OPEN = "true"` + `AUDIT_OPEN_AS` in production `[vars]` (`auditOpen` in `audit_routes.js`).
  Only on the audit host: cims.work and its `/audit` keep the login. Every action is recorded as `AUDIT_OPEN_AS` (Dexter);
  the shell carries `X-Robots-Tag: noindex` and a robots meta. A real session still wins. Delete the two lines to bring
  the login back. Pinned by `test/audit_routes.test.js` ("open mode").
- **The briefing, 15 Oct 2026** (Miguel: "once you select that ship, it goes straight to [the briefing]"; "It's like the AI
  is talking to itself ... order, rush, and cost ... how a human would actually phrase it"). A ship with ONE crew aboard
  opens his briefing directly (the row already names him); two aboard keep the picker. "What others said": feedback answers
  become sentences in code (`feedbackPlain`, no model); field intel is rewritten by the intel engine into ≤ 2 short
  sentences, kept in `audit_plain` (migration 0025, keyed by a hash of the summary) and REFUSED when it carries a number the
  summary does not (`numbersKept`) or names a day the summary does not (`datesKept`: "early October" never becomes
  "October 8", which the first live rewrite did); no engine / refused → the summary's first sentence. The stored report stays under
  "Full report". A brand chip clears a search left in the box ("qu" + Azamara showed Quest alone). `test/audit_plain.test.js`.
  **One incident, one entry** (Miguel, same day: "if you see that it's the same problem, just merge them into one"):
  `mergeIntel` folds field-intel reports with the same text, or the same dollar amount ($100+) within 14 days; the newer
  leads, the header names every reporter, the others stay whole under "Full report". Deterministic, no model.
- **Rush orders this contract** (Miguel, 16 Oct 2026: "what I need to show is the stuff that has been tagged as 'miss'
  from the order portal ... if I had to spend any money on any item, as in I had to rush it because he didn't pay
  attention"). It REPLACED the same morning's OBP "Shipped this contract" card ("doesn't have any value to see what he
  ordered throughout the entire contract" — he had said "this info is in the order app" and the first cut read OBP
  instead: read his source). The briefing's card right before What others said: every Parts Portal order (order.cims.work,
  `PARTS_DB`, SELECT only) with `order_type='missed'`, not voided, on this hull (`shipKey`), from the contract's sign-on to
  its sign-off (today while it runs), with the portal's own tag (Vessel-side miss · Equipment / unexpected · Shore planning
  miss), the parts, freight + customs (the rush money) and the total. Three facts on top: rush orders, freight & customs,
  "<name>'s misses". **Whose miss is the Score Card's own rule** (`score_auto.js missOwnerByBoard`, never a copy): read only
  for a vessel-side miss; equipment and shore misses are shown and never his; a vessel-side miss nobody can be charged with
  reads "Check whose miss it is" (§6). His misses lead the list. `src/rush_orders.js` (pure `rushSummary`; the reads injected
  by worker.js as `rushOrders`, so the audit modules never import score code); the roster and the schedule are read only
  when a vessel-side miss needs an owner. No portal read = no card, never a zero; a clean contract says "None". Display
  only — nothing scores, writes or pays (§1). Prices on the open audit site: Miguel's decision, 16 Oct 2026 ("i am ok with
  the prices being shown"). Pinned by `test/rush_orders.test.js`, `test/audit_routes.test.js`.
- **Dexter's grade** (Miguel, 15 Oct 2026: the audit replaces "Communication (Rita)" on the Score Card; "if it's not [given]
  .. make from the final scores an average"; "Round down"). Once a request's documents are in, Dexter grades Inventory,
  Technical, Customer collaterals (1–5, required) and Overall (optional); a 3 or below needs a sentence (`gradeProblems`).
  The score is Overall, else the average of the three ROUNDED DOWN (`auditScore`, `src/audit.js`). Filed ONCE with its
  visit (`audit_visit` + `audit_eval`, migration 0026, one batch, never rewritten), `POST /api/audit/request/grade`. HR
  dispatch is not rated here (it rates TDG's travel). What a score is worth on the bonus (5 = 10 pts, 4 = 8, 3 or below = 0,
  no audit = 10) lives in `bonus.js` and is Miguel's to merge (§1); this module still never imports it.
- **THE AUDIT ON THE SHIP, B1–B7** (19 Oct 2026; Miguel: "where is the inventory count from dexter .. u missed the entire
  app" — only the request half had been built, and the 15 Oct grade screen stood in for the whole visit). Once the
  documents are in, the request opens on **Before the visit** (A8: what the reads and the count found, amber, each to
  confirm on board) and **Start the audit** — seven steps, one per screen: Workstation (starts full, tap what is missing),
  Machines & tools (per press: Test pattern / Scan to email / Collaboration, the Pattern 43 mark "Seen / Not seen", parts
  past rated life as information, a press the crew reported down "Still down / Running now", tools not on inventory),
  **Inventory** (the crew's blind count against the OBP the documents-in email compared it with — `audit_obp_at_count` —
  Dexter checks each line on the shelf and types what is there, adds any OBP line, confirms the crew's items not in OBP),
  Ratings, Crew (training, uniform & PPE, HON app, the dispatch rating for Rita — never in the score), Overall (optional;
  strengths, to improve, agreed; Oasis/Icon recommendation; a follow-up with an owner and a date), Review and File. The
  rules that hold Next and File are `src/audit_steps.js`, serialized into the page (`AUDIT_RULES_JS`), and the server
  re-checks with the same functions. Filed ONCE in one batch: `audit_visit`, the SAME `audit_eval` row and score rule the
  Score Card reads (unchanged, §1), `audit_visit_data` (the steps + what the documents said), `audit_followup`. The next
  audit of the ship lists the follow-ups still open (Fixed / Still open, "2nd time") and an item missing again ("2nd
  time"). Photos (`audit_file`, R2 `visit/<request>/<step>/<sha>`) are shrunk on the phone and wait in IndexedDB for
  signal; the draft lives on the phone at every tap; a filing without signal is kept and sent when the server answers.
  No manual mono % (mono is OBP's clicks, §10j). Migration 0035. Pinned by `test/audit_visit.test.js`. **The page's copy of
  the rules is the server's function, serialized** (`makeRules().toString()`): wrangler's esbuild adds `__name(...)` calls
  (keepNames) and renames a top-level name that collides with another module's (`txt` → `txt2`), so `makeRules` is
  self-contained (every helper inside it) and the page defines a no-op `__name` — both broke the live page once (#300,
  #302). The test bundles `src/worker.js` itself as the entry, the only way to see the rename. **The profile** (P1):
  "What people said" carries each filed audit (`buildCrewProfile` feed kind `audit`: the score and how it was reached, the
  four ratings with 3 or below in red, strengths / to improve / agreed, items missing, each follow-up open or fixed, "Open
  the audit"), the Dexter slot reads the audit (answered, or asked while a request waits), the Notes window lists it under
  Feedback, and the internal crew file prints it under its contract — never the statement or anything the crew reads; read
  in `apiCrewOne`'s one wave, TEST requests never. Still to build: the history page, the filed / dispatch emails (render
  first, Miguel signs off), Rolando's Pattern 43 confirmation (R1), the import of the 61 (I1), the web rail (W1).
- **Nothing here is money** (§1): `test/audit_guards.test.js`. Staging emails nobody but `MAIL_ONLY_TO` and runs no cron
  (`src/mail_guard.js`).
- **The 15 Oct 2026 review** (three reviews, every finding traced; pinned by `test/audit_request.test.js`,
  `test/audit_routes.test.js`, `test/audit_plain.test.js`). OPEN MODE limits what an anonymous visitor reaches: the briefing
  answers only for crew the board has aboard (or already asked), without the personal address (`crew.email`, `cc`), and
  reporters read by name (`personName`); a request goes only to a seafarer aboard THAT ship (`not_aboard`); a grade filed
  without a sign-in says so on `filed_by` ("(open site, no sign-in)") — grading stays open (Miguel, 16 Oct 2026: "is ok
  unlock for now"). Everywhere: a POST whose Origin is another host is
  refused (`crossSite`: the shared `Domain=cims.work` cookie reaches every *.cims.work app); a request is not re-sent within
  `RESEND_MIN` = 15 minutes (each resend breaks the crew's link and emails the ship again); a TEST request cannot be graded
  (`test_request`: a rehearsal would reach a real Score Card); a rating is a whole 1–5 (number or one-digit string, never
  `true` / " 5 " / 4.5) and the note is text. A graded request is finished: it is no longer "open" (briefing, preview, the
  ships list), so the next audit can be asked. The plain-words guard reads NUMBERS, not digits (`$` amounts match `$`
  amounts, "04" = 4, "$1.50" = "$1.5", "1,2" is two numbers), refuses a number word the note lacks ("twelve"), requires the
  note's headline cost (largest $100+) to stay, and reads ISO dates and bare ordinals as days; a REFUSED rewrite is kept as
  an empty `audit_plain` row (`refused:<engine>`) so it is not paid for on every open, a timeout is retried, a kept line
  that fails today's guards is not shown, and the Claude call is aborted on its 7s ceiling.
- **The 16 Oct 2026 review** (Miguel: "read the code and find bugs and fix gaps"; three reviews, 31 findings, the 21 distinct
  ones fixed, each reproduced first; pinned by `test/audit_request.test.js`, `test/audit_routes.test.js`,
  `test/audit_plain.test.js`, cims-hon `test/audit_reader.test.js`). Production had no audit request yet, so nothing stored
  needed repair. **A first email that fails closes its draft** (cancelled, "system: the request email did not go"): it used
  to block that crew and ship for good. **One open request per crew and ship** is a partial UNIQUE index
  (`ux_audit_request_open`, migrations/0030), not only a SELECT. **Links are added, never swapped** (`audit_token`): a
  reminder or resend adds its link only AFTER its email went, and the link the crew holds keeps working (a reminder at
  hour 12 cut off a page open mid-upload); a failed reminder is logged `remind_failed:` and tried again next hour; a link
  closes `LINK_DAYS` after the newest of the first send, the latest link and the deadline (a resend after day 14 used to
  open "expired"); a cancel closes every link. **The crew SENDS** (`POST /api/audit/u/submit`, "All in. Check your numbers"
  → "Send to <first name>"): the request no longer completes on the last keystroke (a "12" typed with a pause filed "1"
  and the correction was refused); the sweep sends it after `AUTO_SUBMIT_HOURS` = 6 idle or once the deadline passes. **A
  read that keeps failing** becomes "send it again" after `READ_TRIES` = 3 (it froze the tile at "Reading…" and starved the
  sweep, now least-recently-tried first); the tile keeps its file input while a read is retried. **What did not go is tried
  again**: an overdue note is logged only once sent; a documents-in email that failed is resent by the sweep for
  `DOCSIN_RETRY_DAYS` = 3 (never twice: a sent row is never overwritten). **No OBP list = no request** (`no_obp_list`): the
  count would be empty and the email said "Every line agrees". The crew page keeps unsaved counts on a failed save and
  flushes with `keepalive` on leaving; the file name travels URI-encoded (a "’" in the name threw in the browser and froze
  the tile at 0%). **Open mode**: the preview answers only for a seafarer the board has aboard (`aboardNow`: TDG's On board
  seat, dated or not — an undated seat used to read "Nobody aboard"); the briefing's pass is a LIVE request, never a
  cancelled or TEST one; "who asked" is not shown. A finished TEST request is never "open" (it cannot be graded and blocked
  the next audit); the rush window of a contract past its projected sign-off runs to today; the plain-words guard strips
  dates before comparing quantities ("2026-10-06" let a rewrite invent "6 toners"); an EMPTY engine answer is not stored as
  refused; a late error never replaces the screen moved on to; the request carries THIS seafarer's contract label.
  **HON's reader now sends `update_date`** (cims-hon PR #115, `AUDIT_READER_VERSION` 2): the one-unit TIMING rule never
  fired because the field never arrived.
