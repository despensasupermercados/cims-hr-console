# CIMS Transfer — ADDENDUM (things the main transfer missed)

Read this together with `docs/CIMS_SESSION_TRANSFER.md` and
`docs/RELIEF_KEYMAN_CANONICAL.md`. Captured 2026-07-08 from `wrangler.toml`,
`package.json`, `.github/workflows/`, `test/`, and `d1_databases_list`.

---

## A. The REAL deploy pipeline (correction + detail)

- Workflows live in `.github/workflows/`: **`test.yml`** (this is the run shown as
  "tests #NNN" in Actions — I earlier called it `tests.yml`; the file is
  `test.yml`), plus `apply-spec.yml` and `self-maintenance.yml`.
- `package.json` scripts:
  - `test` = `node --test` (runs the whole `test/` suite).
  - `migrate` = `wrangler d1 migrations apply cims-hr-console --remote`.
  - `deploy` = `npm test && npm run migrate && wrangler deploy`.
  - `deploy:staging` = `npm test && npm run migrate:staging && wrangler deploy --env staging`.
- So a real deploy: **runs the tests, applies D1 migrations to prod, then deploys
  the worker.** Bumping `.deploy-trigger` on `main` is what kicks the CI that runs
  this. Red tests block it.
- **`wrangler.toml` has a `[build]` verify hook**: `command = "node scripts/verify_client_scripts.mjs"`.
  It runs before EVERY bundle/deploy and hard-verifies every inline `<script>` the
  worker serves parses as JavaScript (vm.Script, no execution). It is VERIFY-ONLY:
  the old build-time source patch (`scripts/apply_hotfix.mjs`, retired 2026-09) is
  gone, so a re-introduced raw-newline string is NOT auto-fixed — the build fails
  and names the page. `test/client_script_syntax.test.js` calls the same function
  under `npm test`, so the CI gate and the deploy gate are one code path.

## B. Tests — USE THEM to pre-validate (stronger than node --check)

- The suite is `node --test` over ~40 files in `test/`, including:
  `client_script_syntax.test.js` (parses every inline `<script>` in APP_HTML — this
  is why inner-script validation matters), `rotation.test.js`, `relief_api.test.js`,
  `relief_board.test.js`, `city_resolver.test.js`, `override.test.js`,
  `watcher.test.js`, `sqlsafety.test.js`, `ship_history.test.js`, `sbm*.test.js`,
  `keymanimport.test.js`, `crewmatch.test.js`, `contracts.test.js`, etc.
- **Next session: in the bash sandbox, after patching, run the ACTUAL suite** to
  catch logic/inner-script/SQL-safety regressions before pushing:
  ```
  cd /tmp/clone && npm ci && npm test
  ```
  (This session only ran `node --check` + byte-diff; running `npm test` in the
  sandbox is a strict upgrade and would have caught anything the syntax check missed.)

## C. Databases (from d1_databases_list)

- **Prod (this app): `cims-hr-console` = `f0ac8b6a-deac-4214-8f42-e22b202d7d7d`** (~7 MB).
- **Staging: `cims-hr-console-staging` = `84ad4352-9979-4cd8-9bd2-fec887591257`.**
  Deploy to staging with `npm run deploy:staging` / `wrangler deploy --env staging`.
  Prefer staging for anything risky before prod.
- Other D1s in the account (NOT this app): `cims-mail`, `cims-parts-orders`,
  `cims-rag` (~160 MB), and Despensa's `despensa-rag`, `bsale-despensa`.
- **Migrations** live in `migrations/` and auto-apply on deploy. A schema change =
  ADD a migration file (don't hand-mutate prod). NOTE: the `relief_comment` table
  built this session was created lazily in code (`CREATE TABLE IF NOT EXISTS`), not
  via a migration file — fine, but be aware it isn't in `migrations/`.

## D. Worker bindings (wrangler.toml)

- `DB` → D1 `cims-hr-console` (prod).
- `MAILER` → **service binding to a SEPARATE worker `cims-mailer`**, which owns the
  Resend API key, retries/outbox, and `mail_log`. THIS worker only builds email
  content; it does NOT hold the mail key. `RESEND_API_KEY` here is DEPRECATED.
- `AI` → Workers AI.
- `EXPORTS` → R2 bucket `cims-hr-exports` (daily Keyman CSV backup, spec §14.3).
- `[triggers] crons = ["0 * * * *"]` — hourly: sweeps the crew-reports inbox and
  sends the weekly Seafarer Movements email Monday 07:00 America/New_York.
- `[vars]`: `MOVEMENTS_TO = onboardsupport@dg3.com`, `MAIL_FROM = "CIMS <cims@cims.work>"`,
  `AUTO_SEND_DRY_RUN = "false"` (so the Keyman auto-timing toggle is the single live
  switch; enabling it sends real T-14/T-7 crew email and auto-seeds in-window
  history so nobody is emailed retroactively).

## E. Secrets (NAMES only — values live in Cloudflare; never expose or change without Miguel)

Referenced in code as `env.*`: `SESSION_SECRET`, `BOOTSTRAP_KEY`,
`ANTHROPIC_API_KEY`, `ACK_NOTIFY`, `INSTR_NOTIFY`, `STATEMENTS`, plus the
`[vars]` above. (Set/rotate via `wrangler secret put <NAME>` — do NOT put secret
values in `wrangler.toml` or code.)

## F. App map (top-nav tabs → client `show(tab)`)

`dashboard`, `crew`, `contracts`, `rotation` (= the **Keyman board**, where all this
session's work lives), `fleet`, `travel`, `billing`, `feedback`, `data`
(upload / vessel-deployment loader), `ask` (AI). Only `rotation` and `data` were
touched this session; the others (billing/statement, travel, feedback, crew,
fleet, dashboard, ask) are NOT documented in depth — read their modules/tests if
Miguel asks about them.

## G. Auth

Magic-link email (sent as `cims@cims.work` via the MAILER binding), session keyed
by `SESSION_SECRET`. cims.work is login-gated → you cannot authenticate or view
the live app; verify via D1 + tests + byte-diff + Miguel's eyeball.

## H. Rollback

If a deploy breaks prod: revert the offending commit on `main`
(`git revert` / re-edit) and bump `.deploy-trigger` — CI redeploys the reverted
worker. D1 migrations are forward-only; don't try to "undo" a migration by hand —
write a new corrective migration. Cloudflare's dashboard also has worker
version rollback as a last resort.

## I. What is STILL not transferred (Miguel's call)

1. **`cims-mailer`** — the separate email-delivery worker (owns Resend, outbox,
   mail_log). Not in this repo; not documented here.
2. **The other console tabs' logic** (billing/statement, travel, feedback, crew,
   fleet, dashboard, ask/AI) — only relief/keyman is documented in depth.
3. **Secret VALUES** — correctly never transferred; they live in Cloudflare.
4. **La Despensa / other domains** — `bsale-despensa`, `despensa-rag`, the Airtable
   "Despensa Brain", the daily "brain" review skill — separate firewalled domain,
   out of scope of this CIMS transfer.
5. **cims-rag / cims-mail / cims-parts-orders** — sibling CIMS services, separate.

If you want any of #1–#5 transferred too, start there in the next session.
