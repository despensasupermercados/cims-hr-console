# The night watch: the nightly bug hunter for the HR console and the audit app

Miguel, 16 Oct 2026: *"add a night watcher to look for bugs and fix it just like the other apps we have built"*.

The night watch is a scheduled Claude task called **"Cims night watch (in Miguel's session)"** (`trig_01SUCNgF53mPqyfMmBUSzCbK`). It runs once a night at 02:45 America/New_York **inside Miguel's long-running Claude Code session** (`session_018m28ANv7ThyLJmt5z37RZq`), which already holds the repo with push access and the three connectors it needs: the Cloudflare Developer Platform (D1 + worker code), GitHub, and the Brain. Each run works on its own branch `night-watch/<date>` cut from `origin/main`.

**Why not a fresh session per night** (16 Oct 2026). The first design was a routine that starts a fresh session each night (`trig_01LYtAgz4kL1YmU5JrXyTkFj`, now paused, kept for its history). Its two runs (15 Oct by hand, 16 Oct 02:45) had the repo read-only and NO Cloudflare, GitHub or Brain tools: the suite ran, the health checks could not, and the one real bug it found (#262) could not be pushed. A routine's repositories and connectors are attached only in the claude.ai routines page; a session cannot attach them (`create_trigger` with connectors is refused for this organization), and Miguel could not ("cant do it .. figure it out"). Binding the routine to the session that already has everything was the way. If that session is ever archived, the routine disables itself (`auto_disabled_session_gone`): recreate it from a session that holds the repo and the three connectors.

It does two jobs, always in this order:

1. **Health.** It checks that what is deployed is what was tested, and that last night's jobs ran.
2. **Bug hunt.** It takes one area of the code each night, finds a defect traced to a real input, and proposes the fix as a pull request.

It replaces the GitHub Action `nightly-self-maintenance` as the watcher. That Action ran for about 22 seconds a night, had 8 tool calls refused, and changed nothing. Its schedule is off and it can still be run by hand.

## The rules (CLAUDE.md wins on any disagreement)

- **The watcher merges only a SMALL fix, and only through the gate** (Miguel, 16 Oct 2026: "Merge small fixes"; CLAUDE.md §5). It may merge its own PR only when ALL of these hold:
  - CI `test` is green on the PR head.
  - The full suite is green locally, and the new test was proven to FAIL on the old code.
  - `node scripts/night_merge_gate.mjs origin/main <branch>` prints `MERGE_OK`. The gate refuses:
    - money (bonus, Score Card, supervisor evaluation);
    - auth;
    - migrations, and any D1 write or schema statement added or changed in `src/`;
    - the TDG import paths;
    - the intel pipeline;
    - email templates;
    - `wrangler.toml`, `.github/` and dependencies;
    - a diff with no test, and more than 120 changed lines in `src/`.
  - It is the first merge of the night. At most one merge a night.
- **Everything the gate refuses is a draft PR** titled `Night watch: <what>` for Miguel, with the gate's reasons in the body. Anything touching money (§1), auth, schema or crew data is never merged by an agent without Miguel.
- **After a merge, prove the deploy live** (CLAUDE.md §9: the deployed worker code carries the fix). If it cannot be proven, or main turns red, open a revert PR at once and flag it in the digest.
- **A bug is a failure traced to a real input.** That means a D1 row, a real file name, or a real request, written into the PR. A style preference is not a bug, and neither is "this could be cleaner".
  - Every fix carries a test that **fails before** the fix and **passes after**.
  - Run `npm test` in full before opening the PR.
  - Never weaken, skip or delete a test (§2).
- **D1 is read-only for the watcher.** It uses SELECT only. A data problem is a finding, not a fix: flag it, never repair it (§6). A money-affecting mismatch goes to Miguel by name.
- **The watcher stays out of these:**
  - secrets (§7);
  - email sends;
  - `.github/workflows/`;
  - `wrangler.toml` `[vars]`;
  - disabled scheduled tasks (never re-enable one, e.g. the keyman board guard or the SharePoint pickup);
  - Miguel's decisions recorded in CLAUDE.md. Do not re-raise them.
- **Limits per night:** at most 2 PRs. Never open a second PR for a defect that an open `Night watch:` PR already covers; list the open ones first.

## Part 1: Health (read-only, about 10 minutes)

D1 production is `cims-hr-console`, id `f0ac8b6a-deac-4214-8f42-e22b202d7d7d`.

1. **The suite on main.** Run `npm ci && npm test`.
   **On the first night of each month, also run it with the clock pushed ahead**: `SHIFT_DAYS=30`, `120` and `400` with
   `node --import ./scripts/clock_shift.mjs --test`. A dated fixture is a time bomb (16 Oct 2026: four tests would have gone red on
   main on 25 Oct, 29 Nov, 10 Jan and 1 Feb — a red main deploys nothing). A failure is fixed by pinning that test's clock
   (`mock.timers.enable({ apis: ["Date"], now })`) or deriving the fixture from today, in a PR like any other bug.
   - If it is red on an untouched main, that is the night's first finding.
   - Reproduce it, find the cause, and fix it in a PR. A dated fixture that expired is a real fix: run it on its day with `mock.timers`.
2. **Deployed equals main.** Use `workers_get_worker_code` on `cims-hr-console`, then grep it for a marker from the newest merged PR on main: `AUDIT_VERSION` in `src/audit_routes.js`, or a function the PR added.
   - If main is more than about 30 minutes old and the deploy does not carry it, report "deploy behind main" with the commit.
3. **Last night's jobs.** Each check names a table and what it should show.

| What | Query (read-only) | Healthy |
|---|---|---|
| Auto-send heartbeat | `SELECT * FROM auto_send_run WHERE run_at >= date('now','-1 day')` | at least one row, outcome `disabled` or `ran` |
| Mail that did not go | `SELECT kind, to_addr, created_at FROM outbox WHERE status='failed' AND created_at >= date('now','-2 day')` | none |
| Notifications failed | `SELECT template_key, to_addr, created_at FROM notification_log WHERE status='failed' AND created_at >= date('now','-2 day')` | none |
| Intel mail stuck | `SELECT COUNT(*) FROM email_inbox WHERE status='new' AND received_at < datetime('now','-2 hour')` | 0 |
| Bill inbox stuck | `SELECT name, status, detail FROM sp_inbox WHERE status NOT IN ('ok') AND at < datetime('now','-2 hour')` | none, or `held` with a reason |
| Audit files not read | `SELECT request_id, kind, read_state, at FROM audit_upload WHERE read_state IN ('pending','failed') AND superseded_at IS NULL AND at < datetime('now','-2 hour')` | none |
| Audit requests overdue | `SELECT ship, crew_name, due_at FROM audit_request WHERE status='sent' AND test_mode=0 AND due_at < datetime('now')` | listed, not a defect |
| Slow routes | `SELECT path, COUNT(*) n, MAX(dur) mx, CAST(AVG(dur) AS INT) av FROM perf_log WHERE at >= datetime('now','-1 day') GROUP BY path HAVING mx > 3000 ORDER BY mx DESC` | none over 3 s average |

How to read the results:

- A failed mail is a finding with its kind and date. It is never re-sent from here.
- A stuck file names its file.
- A slow route is a finding only when its **average** is over 2 s. Otherwise it is one line.

## Part 2: The bug hunt (one area a night)

The weekday is read in America/New_York.

| Night | Area | Start from |
|---|---|---|
| Mon | **The audit app** (audit.cims.work) | `src/audit_routes.js`, `audit_ui.js`, `audit_upload_ui.js`, `audit.js`, `rush_orders.js`, the audit emails |
| Tue | The Keyman board | `rotationSections`, `ship_leg_source.js`, `board_truth.js`, `earmark*.js`, `projection.js`, the page's rotation code |
| Wed | The crew profile, statement, crew file | `crew_profile.js`, `apiCrewOne`, `composeStatement`, `pdf.js`, `hr.statement.v2.js` |
| Thu | The TDG imports | `crewimport.js`, `registry_sync.js`, `keymanimport.js`, `contract_count.js`, `counter_sync.js` |
| Fri | Travel, the bill, the mail intake | `travel.js`, `travel_match.js`, `sga.js`, `sga_archive.js`, `mail_intake.js`, `sp_inbox.js` |
| Sat | The Score Card read (money: PR only, §1) | `score_auto.js`, `seval.js`, `/api/score/auto`, the feedback links |
| Sun | Cron, emails, auth, the error boundary | `scheduled()`, `mail_guard.js`, `auth.js`, `policy.js`, the fetch wrapper (§11) |

Method:

1. **Read the area's code end to end**, plus the invariants CLAUDE.md lists for it. They say what must stay true.
2. **Hunt for these defect shapes.** Each one has bitten this repo before.
   - An unescaped name in HTML.
   - A date compared as a UTC `Date` against the clock.
   - A month added without clamping.
   - A blank ship or sign-on that matches everything.
   - A read that is not in its wave (§12).
   - An awaited route outside the error boundary.
   - A writer that bypasses `storableStatus`.
   - A field dropped between server and page.
   - A count that names no noun.
   - Two definitions of one concept.
   - A fixture that carries the field the query does not.
3. **Prove each candidate against production.** Find the D1 row or real input that triggers it.
   - If nothing in production can trigger it, it is a note in the digest, not a PR.
   - Weigh the code the fix adds against what it prevents.
4. **Fix the confirmed one** with a failing-first test.
   - Pin it in the test file the area already uses.
   - Update CLAUDE.md's section for the area when a rule changed.
5. **Open the PR** (a draft unless step 6 merges it).
   - Title: `Night watch: <defect in plain words>`.
   - Body: the input that triggers it, what the user saw, the fix, and the test.
   - Follow the attribution rules the session gives.

6. **Merge only through the gate.** Wait for CI `test` on the PR head, then run `node scripts/night_merge_gate.mjs origin/main <branch>`. `MERGE_OK` and no earlier merge tonight: mark the PR ready and squash-merge it, then prove it live. `DRAFT_ONLY`: leave it a draft and paste the gate's reasons into the PR body.

## The digest (every run, at most 8 lines)

End the session with this digest; it is the run's notification.

```
Night watch <date> · <area>
Health: tests <green/red> · deploy <= main / behind (<sha>) · jobs <ok / N findings>
Findings: <one line each, with the table/row or file:line>
PRs: <Night watch: … #N — merged + live / draft (gate: reason)> or none
Flags for Miguel: <money / data / decisions only>
```

If the night found and opened nothing, the digest says so in two lines.

When a PR was opened or a money/data flag raised, also file one Brain log (`brain_correct`, domain CIMS, subject "CIMS HR Console", **kind "log"**) with the same lines. A clean night writes nothing to the Brain.
