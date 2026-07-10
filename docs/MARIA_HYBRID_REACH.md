# Ask Maria — Hybrid Reach upgrade (2026-07)

## What changed
- **Engine:** Haiku → Sonnet (`claude-sonnet-4-5-20250929`), steps 5→8, tokens 1024→2048.
  If the account lacks that snapshot, `runMaria` returns `model_http_404` — swap
  `MARIA_MODEL` to the `claude-sonnet-4-5` alias (one line in `src/maria.js`).
- **Reach:** Maria keeps all 13 curated tools (they encode the trusted joins for crew,
  bonus, rotation, billing, compliance, fleet, travel) and gains two new ones:
  - `describe_schema` — backup-free map of every real table/view (+ columns per table).
  - `run_sql` — ONE read-only SELECT, hard-gated in code.

This closes the gap between Maria's 13 curated tools and the ~40 canonical tables in D1
(`bonus_outcome`, `bonus_policy`, `candidate`, `assignment`, `seval_state`,
`sbm_review_request/response`, `ship_leg`, `vessel_port_day`, `travel_expense`,
`orders`, `ups_shipment`, `notification_log`, `activity_log`, ...).

## Where the safety lives (not in the prompt)
`assertReadOnlySql()` in `src/maria.js` is the control. The Worker runs ONLY the string
it returns. It rejects: writes/DDL (INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/...),
multi-statement stacking, PRAGMA/ATTACH/VACUUM, comment-smuggled statements, any
reference to a backup table (`*_preclean_*`, `*_preimport_*`, `*_predrop_*`,
`*_YYYYMMDD`, `*_bak/_old/_tmp`), and the denylisted config stores. It
force-appends/clamps `LIMIT` to `SQL_MAX_ROWS` (500). `isHiddenTable()` additionally
hides those tables from `describe_schema`.
All of it is unit-tested in `test/maria.test.js`, including a drift guard asserting
every `MARIA_TOOLS` entry has a live `mariaExecTool` handler.

## Precedence rule taught to Maria
Curated tool when one fits (trusted numbers, correct joins — especially anything
money- or rotation-adjacent); `describe_schema` → `run_sql` only for the long tail the
curated tools don't answer. She must name the tables she read when using `run_sql`.

## Access scope note
`/api/ask` is session-gated; per CLAUDE.md there are 7 full users (Miguel, Rita + 5
contributors added 2026-06-12). `run_sql` reaches crew PII (passport, DOB, phone) —
the SAME fields `find_crew` already returns to those same users, so no new exposure.
What IS newly reachable is everything else in D1, so the gate denylists the key/value
config stores (`app_config`, `app_setting` — the tables a secret could someday land in,
CLAUDE.md §7) from both `describe_schema` and `run_sql` (`SQL_DENY_TABLES` in maria.js).
Money remains protected structurally: run_sql cannot write, so `bonus_outcome`,
baselines, and payouts are readable but untouchable — same as every curated tool.

## Not a money change
Nothing here writes; `bonus.js` and `bonus_outcome` are untouched. `run_sql` cannot
write by construction (single SELECT/WITH statement, enforced in code + tests).

## Open follow-up: make apply-spec consume its specs (Miguel, 1 edit)
The 2026-07-10 incident (stale specs re-applied and corrupted worker.js on this
branch) is fixed here, but the systemic guard needs a workflow edit the GitHub
connector cannot push (no `workflow` scope). In `.github/workflows/apply-spec.yml`,
in the "Commit rebuilt files" step, delete the applied specs inside the bot commit:

    git rm -q apply/*.json 2>/dev/null || true
    # then include the deletions in the same add/commit/push

That makes every spec one-shot by construction — a spent spec can never lie in
wait for the next branch's bot run again.
