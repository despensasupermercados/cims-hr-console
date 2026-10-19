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

6. **Reading the files (PR G, moved INTO round 1 on Miguel's word, 14 Oct 2026: "remember the reading of the files is
   important so u cant forget this").** See §2 C. Pattern 43 is MEASURED and the Management List is READ by HON's own
   readers, called through a service binding; the assessment email (A7) is built from those reads, the OBP lines, the
   open orders and the Ordering Schedule; Rolando confirms a Pattern 43 finding (R1) before it is a record.

**Round 2**: anything the reads cannot yet carry — Rolando's rule 3 (one-side density) and full-tone marks, which HON
does not measure yet, and a reader for the hand-filled condition form beyond what HON transcribes.

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

**A. Other apps' data is read without writing to them.** Revised while building PR A (14 Oct 2026): HON's press
register is a code constant (`machineRegistry.js`, "the sole source of every serial the crew see") and its OBP readers
carry HON's own rule on which snapshot is truth, so everything from HON (presses, OBP lines and on-hand, open orders,
the Ordering Schedule) comes through HON's `AuditReader` entrypoint (choice C) — one reader, never a second copy that
can disagree. Only the timecard's one table is bound directly (`TIMECARD_DB`). The original wording follows.
**Originally: other apps' data is read through D1 bindings, never through their code.** The machine register and the OBP
lines live in `cims-hon`'s D1; the ship mailboxes in `cims-timecard`'s D1. A Worker may bind any D1 in the account,
so `wrangler.toml` gains two more D1 bindings (`HON_DB`, `TIMECARD_DB`). D1 has no read-only flag: the bindings are
read-only by discipline — the audit code issues SELECT only, pinned by a static guard in the `sqlsafety` style (any
INSERT / UPDATE / DELETE / CREATE / ALTER / DROP against those two bindings fails the suite) — and they carry no
`migrations_dir`, so no migration command can ever point at another app's database. No cross-repo PR for round 1,
one source of truth. The columns read are pinned by a test against each database's `sqlite_master`, and a missing
table degrades to "register unavailable" on the page, never a 500. Round 2 may move
these reads behind HON routes if HON wants to own them.

**B. The seafarer's upload page is this Worker's, built on the /sbm pattern, not HON's page.** Same token mechanics,
same mailer, files in `cims-audit-files`. The checks that need no reader (file present, not empty, a PDF or image,
under the size ceiling) run here.

**C. The files are read by HON, never by a copy of HON** (decided 14 Oct 2026, "do what is best"). HON already holds
the two readers, tested and calibrated: `p43Measure.js` (Pattern 43 decoded page by page in the Worker and measured
against Rolando's six rules — no model guesses a part; version 5) and `mmlRead.js` (the Management List transcribed:
which of the THREE documents it is, every life % row with its part number and reset count; version 4), plus
`PARTS_RULE` and `recommendationFor` ("Recommendation: have this machine looked at. Parts are changed on copy quality,
not on a count."). Copying 1,200 lines that are still being calibrated would fork the reader the day Rolando moves a
limit. So:
- HON gains a **named RPC entrypoint** (`AuditReader`, a `WorkerEntrypoint` with `measurePattern43(bytes)` and
  `readManagementList(bytes, type)`), stores nothing, returns HON's own state, legend and findings. A named entrypoint
  is reachable ONLY through a service binding, never from the internet — no secret to share, nothing for anyone to
  paste. One small PR in `cims-hon`, its own tests, proven by `/api/health` there.
- This worker binds it (`[[services]] binding = "HON" service = "cims-hon" entrypoint = "AuditReader"`).
- **Read at upload, on the crew's page.** The crew sees what the reader found right away: "12 pages, every colour
  found" or "this is the User Management List — the settings listing. It carries no part life. Print the Machine
  Management List." A wrong document is caught while he is still at the press, not by Dexter on the ship. A read that
  did not finish (page closed, timeout) is picked up by the hourly sweep. The gate needs every file READ, not just
  sent.
- What reaches the assessment is labelled with its source and version ("measured by HON, ruler v5"; "read from the
  Machine management list of 8 Oct"). Pattern 43 findings stay "measured, Rolando to confirm" until he does.
- Cost, stated: the Management List read is a vision call on HON's key (one per machine per audit); Pattern 43 is
  pure measurement, no model.

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
| G | **Reading the files + the assessment** (right after C) | `cims-hon`: `src/worker.js` exports `AuditReader` (named entrypoint, stores nothing), its test. This repo: `wrangler.toml` (`HON` service with `entrypoint`), `src/audit_read.js` (calls HON, stores the read on `audit_upload`, the gate counts a file only once read), `src/audit_assess.js` (pure: parts past life × on board × on order, copy quality decides; the blind count against OBP with the 1 Oct timing rule; Ordering Schedule due dates without a PO; the For-the-visit list), `src/emails/hr.audit.assessment.v1.js`, Rolando's confirm page `/audit/p43?t=` | assessment shape on fixtures taken from real HON reads; "replace" never appears; a settings listing asks for the Machine Management List; an unread file keeps the gate shut; HON down = "read pending", never a clean machine | On staging: a real bundle and a real 52-page Machine Management List uploaded through the crew page, the read shown on the page, the assessment email to Miguel only |
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

Rough effort: A two days, B one, C three, G three, D three, E one, F half. Order: A, B, C, G, D, E, F. Staging validation and the first live audit sit
between C/D and the merge of each. If Dexter's next visit lands before D is merged, the request phase (C) can run
alone and the audit on paper, once.

## 3b. Progress

- 14 Oct 2026: PR A + B merged and proven live (#221); HON `AuditReader` merged and proven in HON's deployed code (cims-hon #113).
- 19 Oct 2026: PR D, first half: the audit on the ship (A8 + B1–B7), filing once, follow-ups and "2nd time", photos
  (Miguel found it missing: "u missed the entire app"). Still in D: the profile card (P1), history, the filed and
  dispatch emails. Then E (the 61), F (W1), R1.
- 14 Oct 2026: PR C built with the reads of G wired in (request, upload page, HON reads at upload, blind count, gate, documents-in email, 12 h reminder, 24 h overdue, read retries). Emails in TEST MODE until Miguel signs off the renders. Still to do in G: Ordering Schedule due dates in the assessment, OBP `update_date` from HON for the 1 Oct timing rule, Rolando's confirm page (R1).

## 4. Checklist before PR A can merge (what I need, and from whom)

**Miguel / dashboard**
- [ ] Add `audit.cims.work` as a custom domain on `cims-hr-console`. Miguel does it in Chrome with the prompt given on
      14 Oct 2026 (Workers & Pages → cims-hr-console → Settings → Domains & Routes → Add → Custom domain). Until PR A is
      live the address simply shows the console's login.
- [x] The bucket: `cims-audit-files` and `cims-audit-files-staging`, created 14 Oct 2026 (Miguel: "rather u create a cims
      audit file"). `cims-audit-evidence` is left alone.
- [x] The five recipients as one `AUDIT_TO` line in `[vars]`: Ray.Guerra, Rolando.Abellan, Ohji.Miranda,
      Jonathan.Alonzo, Miguel.Sanmartin (all @dg3.com). Staging: Miguel only.
- [x] The two D1 read bindings (choice A) and the HON reader binding (choice C): "do what is best".
- [x] The phone: iPhone 17 (Safari, Add to Home Screen; the offline store is IndexedDB, which iOS keeps for an
      installed app).
- [ ] The first ship for the live run (needed by C's prod step, not by A).

**Data (Rita / Ray)**
- [x] The timecard's `ship_contact` rows at `@celebrity.com`: Miguel, 14 Oct 2026, "celebrity emails are ok".
- [ ] The zip of the Forms "Printshop Audit" folder (PR E; rows import without it).

**Decisions still open, needed by round 2, not by round 1**
- [ ] "Due date missed" = an Ordering Schedule `due_date` passed with no PO on it (`schedule_order.po_number` empty) —
      PR G uses this and the email says the definition; Miguel corrects it if wrong. No override of the gate at all —
      as designed.

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
