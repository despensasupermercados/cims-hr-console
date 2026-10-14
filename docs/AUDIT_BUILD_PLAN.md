# Printshop Audit — build plan, round 1 (written 14 Oct 2026, before any code)

Miguel: "I'm ready for the first round of development. Before we continue iteration, get acquainted with all the logic,
connectors and all. Make a detailed plan on how you will develop this and not derail or build something we didn't
discuss. Get the plan ready, a checklist and all you need to deploy first."

The design is `docs/AUDIT_DESIGN.md` and the mock-up `docs/mockups/audit_20261014/audit_mockup.html` (v12). This plan
builds that and nothing else. Anything not in those two files is a question for Miguel, not a feature.

## 0. What round 1 is, and is not

**In** (everything that lives in the HR console and can be proven live without another team's work):
1. The app shell at `audit.cims.work` and `cims.work/audit`: login as today, installable, offline drafts.
2. Ships, the briefing, the request to the seafarer, the upload page, the blind count, the gate, the 24-hour sweep.
3. The audit itself (B1–B7), filing, the card on the crew profile, follow-ups, the history page, the files in R2.
4. The import of the 61 Forms audits (rows now; files when the zip arrives).
5. The web rail (W1): the same column with a rail, nothing more.

**Not in round 1** (round 2, after Miguel's decisions, mostly in HON):
- The automated assessment: Pattern 43 reading, Management List parsing, parts-past-life against on-board / on-order,
  Ordering Schedule due dates, the verdict email (A7), Rolando's confirmation page (R1).
- In its place, round 1 sends a plain **"documents in"** email to the same recipients: what came in, per machine, the
  machines reported down, the blind count's lines that differ from OBP, links to every file. No verdict, no reading.
  The gate works exactly as designed; only the automated judgment is missing.

**Never in this project without Miguel's own merge** (§1): the audit feeding Dexter's contributor window or any bonus
input; anything on the Score Card page; the supervisor evaluation. **Never at all**: an automated Pattern 43 verdict
before the reader is calibrated; "start anyway"; the crew seeing the OBP on-hand or the comparison; a recipient the
configuration does not carry; a write to any table of another app.

## 1. What the build stands on (read, verified 14 Oct 2026)

- **Dispatch**: one `fetch` handler, every `/api` route inside `return await (async () => { … })()` (§11); public
  token pages exist (`/fb`, `/sbm` via `installSbm`), session pages behind `requireSession`; `scheduled()` is hourly
  with `ctx.waitUntil` fan-out. New routes go inside the wrapper, new sweeps beside `sbmDailySweep`.
- **Patterns to reuse, not re-invent**: `installSbm` (public page + HMAC single-use token from `auth.js`, token hash
  in D1, `ensureSbm` under `memoEnsure`); `sendViaMailer(env, envelope)` through the `MAILER` binding; the email
  template shape `src/emails/hr.statement.v2.js` (pure `(data) => {subject, html, text}`, letterhead from
  `cims-mast.js`); `logActivity`; `boardLegsFromDb` / `rotationSections` for who is aboard; `cumulativeContracts` for
  the contract number; the crew profile feed in `crew_profile.js` (`feed.push({kind, …})`) for the audit card;
  `env.EXPORTS.put` for R2.
- **Guards that will fail a careless PR**: `test/perf_invariants.test.js` (hot routes read in one `Promise.all`
  wave, no sequential `await env.DB.prepare` beyond the allowance), `test/sqlsafety.test.js`, `test/port_days.test.js`
  (never read `vessel_port_day` whole), `test/wrangler_config.test.js` (`preview_urls=false`, `keep_vars=true`),
  `scripts/verify_client_scripts.mjs` (every inline script must parse; the audit page is a new page module in
  `PAGES`), the `test/bughunt_*` invariants (status words, `escHtml` on everything typed, calendar dates).
- **Connectors**: Cloudflare account (workers `cims-hr-console`, `cims-hon` `1eb81264…`, `cims-timecard` `aeb577e3…`,
  `cims-mailer`; D1 `cims-hr-console` `f0ac8b6a-…`, `cims-hon` `7b4387c8-…`, `cims-timecard` `ae52e15f-…`; R2
  `cims-audit-evidence` exists, owner unknown) · GitHub as `despensasupermercados` with push on `cims-hr-console`,
  `cims-hon`, `cims-timecard`, `cims-mailer` (the other repos need `add_repo` in a session that touches them) ·
  the Brain (`brain_ask`, `brain_correct`) · the mailer binding in `wrangler.toml`.

## 2. Two architecture choices round 1 makes (say no now if you disagree)

**A. Other apps' data is read through D1 bindings, never through their code.** The machine register and the OBP
lines live in `cims-hon`'s D1; the ship mailboxes in `cims-timecard`'s D1. A Worker may bind any D1 in the account,
so `wrangler.toml` gains two more D1 bindings (`HON_DB`, `TIMECARD_DB`). D1 has no read-only flag: the bindings are
read-only by discipline — the audit code issues SELECT only, pinned by a static guard in the `sqlsafety` style (any
INSERT / UPDATE / DELETE / CREATE / ALTER / DROP against those two bindings fails the suite) — and they carry no
`migrations_dir`, so no migration command can ever point at another app's database. No cross-repo PR for round 1,
one source of truth. The columns read are pinned by a test against each database's `sqlite_master`, and a missing
table degrades to "register unavailable" on the page, never a 500. Round 2 may move
these reads behind HON routes if HON wants to own them.

**B. The seafarer's upload page is this Worker's, built on the /sbm pattern, not HON's page.** Same token mechanics,
same bucket, same mailer. HON's upload checks (12 pages, four channels, client-side shrink) are re-implemented here
in a pure module with the same rules, pinned by tests. HON's assessment pipeline has never fired in production;
round 1 does not depend on it.

## 3. The PRs, in order (each small, green, proven live before the next starts)

Every PR: branch from `main` → `npm test` green → PR with the diff described → **staging first** for anything that
sends mail or writes crew-facing records (§4) → merge → **prove live through the API** (§9) → one line to the Brain.

| # | PR | Files | Tests added | Proof live |
|---|----|-------|-------------|------------|
| A | **Foundations** | `migrations/0024_audit.sql`; `src/audit.js` (pure: gate, stamping, addressing, count completeness and diff, the 1 Oct timing rule, upload checks); `src/audit_ui.js` (the page: shell, steps, offline store, upload queue, image shrink); `src/worker.js` (host switch for `audit.cims.work`, `/audit` and `/api/audit/*` inside the wrapper, `ensureAudit` under `memoEnsure` CREATING the audit tables `IF NOT EXISTS` — the prod deploy runs no migration, `0024_audit.sql` is the record and the guard is what reaches production, like `ensureSbm`; Server-Timing kept); `wrangler.toml` (`AUDIT_FILES` R2, `HON_DB`, `TIMECARD_DB`, `AUDIT_TO` in `[vars]`, and the same declared again under `[env.staging]` plus `MAILER` — §3a); `scripts/verify_client_scripts.mjs` (`AUDIT_HTML` from `src/audit_ui.js` in the module list, like `RELIEF_HTML`); manifest + service worker routes | `test/audit.test.js` (pure rules), `test/audit_routes.test.js` (wrapper, session, 404s), `test/audit_guards.test.js` (no `bonus.js` import; no on-hand on the count page; statement/email never print an audit), `test/wrangler_config.test.js` (bindings present) | `GET /api/audit/health` on cims.work returns the version; `/audit` returns the shell for a session; the R2 binding answers a HEAD |
| B | **Ships and briefing** | `src/audit.js`, `src/worker.js` (`apiAuditShips`, `apiAuditBrief`: one wave over `boardLegsFromDb`, crew, `cumulativeContracts`, last audit, open follow-ups, feedback / sbm / intel folded) | wave guard extended to the two routes; shape tests | `/api/audit/ships` lists 48 hulls with aboard + last audit; `/api/audit/brief?ship=&sc=` matches the mock-up fields |
| C | **Request, upload, count, gate, sweep** | `src/audit_request.js` (install pattern like `installSbm`): request create/resend/extend, token page `/audit/u`, uploads to R2 with checks, the blind count (OBP lines from `HON_DB`, no on-hand served), machine-down, the "documents in" email, reminders at 12 h / 24 h in `scheduled()`; `src/emails/hr.audit.request.v1.js`, `hr.audit.reminder.v1.js`, `hr.audit.docsin.v1.js` | token tests (sign, expiry, single use), upload checks (size, 12 pages, 4 channels), count completeness, addressing (ship mailbox + personal cc; none → blocked), gate (no complete request → no visit), sweep idempotence | On **staging** with Miguel's test address as the ship mailbox: request sent, upload page works from a phone, count saves line by line, gate opens; then prod with one real ship Miguel names |
| D | **The audit, filing, profile, follow-ups, history** | `src/audit.js`, `src/audit_ui.js` (B1–B7, review, offline file-and-sync), `src/worker.js` (visit routes, `apiAuditFile`, history), `src/crew_profile.js` (the audit card in the feed), `src/emails/hr.audit.filed.v1.js`, `hr.audit.dispatch.v1.js` (Rita) | step validation (3 or below needs a sentence), filing writes once (append-only), profile feed shape, follow-up open/close, the crew-facing statement and email exclude the audit | File one audit on staging; see the card on the profile; files in the bucket; follow-up row; history row; then prod |
| E | **Import of the 61** | `src/audit_import.js` (pure mapping: ship codes → vessel, names through `buildBridge`, two-person rows, test rows), `src/worker.js` (dry run / apply), the zip loader for files | mapping tests on the real export (51 settled / held / dropped counts pinned) | Dry run shows 37 settled, 14 held, 10 dropped; apply writes only settled rows; files land by name |
| F | **Web rail** | `src/audit_ui.js` only | none beyond render guards | The same page at 1200px shows the rail and the side panel |

### 3a. Staging cannot send an email today (found 14 Oct 2026, fixed in PR A)

`[env.staging]` declares only the Worker's name and `DB`. Wrangler does not inherit bindings into a named environment,
so the staging Worker has no `MAILER`, no `EXPORTS`, no `AI` and none of the `[vars]`: `sendViaMailer` answers
"MAILER binding missing" there, which also means no magic-link login on staging (the bootstrap dev-login is the only
way in). The `deploy-staging` Action's comment says it applies migrations; the script does not (`deploy:staging` =
test + deploy), so `ensureAudit` is what creates the schema on both sides. PR A declares under `[env.staging]`:
`MAILER` (the shared transport — the envelope's `app` reads `cims-hr-console-staging` there, one line in
`sendViaMailer`, so the mailer's log tells the two apart), `AUDIT_FILES` (a staging bucket), `HON_DB` and
`TIMECARD_DB` (the same two databases, SELECT only), and `AUDIT_TO` = Miguel's address only. `test/wrangler_config.test.js`
gains the check that every audit binding declared at the top level is declared for staging too.

**Login on the new host.** The session cookie is host-only (`Path=/`, no `Domain`), so a login on `audit.cims.work` is
its own session: Dexter asks for one magic link there, built on the request's origin as today, and the allowlist is the
same. The seafarer's upload link is built on the origin of the request that created it, never on the `ORIGIN` constant
`installSbm` carries.

Rough effort: A two days, B one, C three, D three, E one, F half. Staging validation and the first live audit sit
between C/D and the merge of each. If Dexter's next visit lands before D is merged, the request phase (C) can run
alone and the audit on paper, once.

## 4. Checklist before PR A can merge (what I need, and from whom)

**Miguel / dashboard**
- [ ] Add `audit.cims.work` as a custom domain on `cims-hr-console` (Workers & Pages → cims-hr-console → Settings →
      Domains & Routes → Add → Custom domain). Nothing in the repo does this.
- [ ] The bucket: reuse `cims-audit-evidence` (say whose it is) or let me create `cims-audit-files` (+ `-staging`). It
      must exist before PR A deploys, or the deploy fails on the binding.
- [ ] The five recipients of the "documents in" and "filed" emails (Ray, Rolando, Ohji, Jonathan, you) as one `AUDIT_TO`
      line in `[vars]`, like `DEPLOY_TO`. Jonathan's address is the one I do not have; without it the list ships with
      four and the email says so.
- [ ] Confirm the two D1 read bindings (choice A above): the audit reads HON's machine register and OBP lines and the
      timecard's ship mailboxes directly, read-only.
- [ ] The phone: a DG3 iPhone or Dexter's own (changes nothing in code, changes the install instructions).
- [ ] The first ship for the live run, and which address stands in for the ship mailbox on staging.

**Data (Rita / Ray)**
- [ ] The timecard's `ship_contact` rows at `@celebrity.com`: confirm or fix before the first Celebrity request.
- [ ] The zip of the Forms "Printshop Audit" folder (PR E; rows import without it).

**Decisions still open, needed by round 2, not by round 1**
- [ ] "Due date missed" = Ordering Schedule date with no PO · no override of the gate at all · HON as the reader ·
      the Pattern 43 reversal to the Brain.

## 5. How each PR stays on the rails

- A PR touches only the files its row names. A file outside the list is a sign the PR is drifting; it stops and asks.
- The static guards above are extended to the audit routes in PR A, so a later PR cannot quietly add a sequential
  D1 chain, a bonus import, an on-hand quantity on the count page, or a raw string into HTML.
- Nothing is written to `crew`, `crew_override`, `assignment`, `bonus_outcome`, `feedback_response2` or any table of
  another app. The audit writes its own tables, `audit_followup`, `activity_log`, and the R2 bucket.
- No email leaves without a configured recipient; the first send of every template goes to staging with Miguel's
  address.
- Every merge is followed by the §9 proof through the live API and one line to the Brain the same session.
- Scope creep is named, not built: a good idea found while building goes into `AUDIT_DESIGN.md` under "Later", with
  the reason, for Miguel.

## 6. Acceptance of round 1

One real audit, end to end, on the ship Miguel names: the request reaches the ship mailbox with the personal copy;
the crew uploads from the ship and counts blind; the gate opens; Dexter audits from his phone, offline part of the
way, and files; the card is on the crew's profile; the files are in the bucket; the follow-up is open; the history
row is there; Miguel, Rita, Ray and Rolando got the filed email. Proven through the API, not a screenshot (§9).
