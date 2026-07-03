# CIMS Auto-Timing — Status & Knowledge Transfer
Last updated: 2026-07-03 (session with Claude). Machine-readable pointer: D1 `app_setting` key `auto_timing_kt`.

## WHERE WE STAND
**Feature complete. Deployed through commit `4f73c1d`. Toggle = OFF.**

Waiting on Miguel (his explicit call, do not preempt):
1. **Go-live:** he flips the Keyman toggle ON when he confirms the Keyman board dates are correct OR is ready to keep working on this. Nothing else is required — the toggle is the single switch.
2. **Unit tests for `src/auto_send.js`:** recommended, PARKED. Plan agreed: branch `tests/auto-send`, PR-only, exactly 2 files (`test/auto_send.test.js` new + ≤2-line time hook in `auto_send.js`), full suite green in sandbox before any push, mutation-check the tests, no scope creep.
3. **Secret rotation:** Resend key, Anthropic key, cims-order `ADMIN_KEY` (+`admin.html` same deploy).

## HOW IT WORKS (deployed behavior)
- Keyman page button `Auto-timing: OFF/ON` → `POST /api/autosend` (session-gated) → `app_setting.auto_send_enabled`.
- **Enable = confirm dialog → auto-seed**: everything already inside T-14/T-7 gets `auto_send_log` note `seeded` (INSERT OR IGNORE) — no retroactive emails. **Seeding failure fails CLOSED** (flag reverts to OFF, API 500, UI shows error).
- When ON: hourly cron → `runAutoSend` gates to 08:00 Europe/Budapest → instructions email at T-14, sign-off ack link at T-7 → digest to Miguel.Sanmartin@dg3.com cc Rita.Berenyi@dg3.com. Only successes logged (failures retry daily). No-email crew: red digest alert daily, never silently dropped. Seeded legs listed once in next digest.
- `AUTO_SEND_DRY_RUN` in wrangler.toml = "false" (toggle is live). Set "true" to rehearse (digest-only).
- **Heartbeat:** every gate-hour run writes `auto_send_run` (`disabled` | `ran` | `digest_failed`). Nightly guardian (step 3 of `.github/workflows/self-maintenance.yml`) opens an issue if yesterday's row is missing.

## INVARIANTS — never regress these
- Legs come from the LIVE board: `worker.js autoSendBoardLegs(env)` → `rotationSections(env)` → dep `BOARD_LEGS`. **NEVER query `keyman_contract3` for auto-timing** — it is the historical Contract Counter ("informational only", stale by design). Same dates as board + billing = Single Source of Truth.
- `seq` for auto legs = numeric sign-off date YYYYMMDD (stable, no collision with Keyman seqs).
- `manualExists` (±21-day `sign_off_date` window on `instr_ack`/`ack_request`) blocks auto-send over any existing request. Re-sending DELETEs + re-inserts the request row → kills the old emailed link and wipes acknowledgements. That guard is load-bearing.
- Senders accept optional 5th arg `ovr = {ship, proj_off, act_off, port}` (`sendInstructionsFor` / `sendSignoffLinkFor`); manual button path passes none. `contract_edit` values override everything.
- `await markSent(...)` — unlogged success = duplicate email next day.

## DATA NOTES
- Schedule source `src/ship_history.js`: dates are month-granularity approximations (cluster 1st/16th/26th). Miguel says dates are "usually definite"; precise per-crew dates entered via contract edits win automatically. 2026-07-03 snapshot: 77 future sign-offs / 61 crew.
- New D1 tables (auto-created): `app_setting`, `auto_send_log`, `auto_send_run`. SC-DRILL test records deleted 2026-07-02.

## COMMIT TRAIL (2026-07-02/03)
`3cba192` toggle UI · `fbdbc8c` guardian repair-only · `b176968` collision guard/await/DRY · `c94b1c0` API+client hardening · `34131bd` root dup removed · `9cf51e1` BOARD_LEGS · `294975d` board-driven dueWithin · `f42ca5e`+`c7bee1b` sender overrides · `1e8f433` seed-on-enable · `d0ab5a3` run audit · `d3b3f15` DRY_RUN off · `eed697a` fail-closed seeding · `61d9ed9` guardian heartbeat · `4f73c1d` digest transparency.

## TOOLING (for AI sessions)
- GitHub API writes WORK for normal files (create_or_update_file/delete_file). Exception: `.github/workflows/*` → 403 (token lacks `workflow` scope) → use the GitHub web editor.
- Byte-safety protocol for API edits: reproduce file in sandbox → verify git blob SHA vs GitHub → unique-match replacements → `node --check` → push → confirm returned blob SHA equals precomputed.
- Web editor (CM6): `document.querySelector('.cm-content').cmTile.view` → `view.state.doc.toString()` + `view.dispatch({changes:[...]})`. Page JS returning raw source gets `[BLOCKED]` — return booleans/counts only. Commit dialog often needs a second click on "Commit changes...".
- `src/worker.js` ~318 KB — never pull whole into context; edit via browser or delegate to a subagent.
- Deploy proof: Cloudflare `workers_list` `modified_on`, or 2/2 checks on the commit (tests + Workers Builds). Then behavior-probe the live API (CLAUDE.md §9).
