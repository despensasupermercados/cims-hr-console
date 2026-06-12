# DG3 CIMS HR Operational Console — PROJECT MEMORY (canonical)

> Single source of truth for intent, processes, architecture, data, decisions, and open
> loops. Keep this current. If anything below conflicts with reality, reality wins —
> update this file. Last major update: 2026-06-11.

---

## 0. THE VISION / INTENT (do not lose this)
Miguel San Martin (GM, DG3 Cruise Industry Managed Services) wants a **self-sufficient,
near-autonomous operational platform** — "a fraction of what it will become." The product
should run, maintain, and increasingly improve **itself**: code changes flow to production
automatically, the system tests itself, a nightly agent reviews/repairs/flags, and data
stays fresh from source files without manual re-loading. Miguel operates "systems-first":
infrastructure before scale, single source of truth, prevention over reaction, margin
protection, clear ownership, fast execution once data validates direction. He wants Claude
to act as a **rigorous honest mentor** — challenge weak logic, flag risk, never be a yes-man,
be concise. He explicitly wants to "work on other stuff while the system works on its own."

**What CIMS is:** DG3/TDG places Filipino printer/communications seafarers ("Keyman" crew)
onto cruise ships (Royal Caribbean, Celebrity, Azamara; also Disney/MSC/NCL historically)
and runs the shipboard print operation. The console runs **seafarer Keyman rotation** and a
**contract-completion bonus** that disciplines costly rush air-freight orders. Two users:
**Miguel (GM)** and **Rita Berenyi (Head of HR)**. **Crew never log in** — statements are
delivered to them (server-side), they don't access the app.

---

## 1. HOW WE WORK / THE DEPLOY PROCESS (critical — this is the loop)
- **Repo (source of truth):** GitHub `despensasupermercados/cims-hr-console` (public).
- **Stack:** Cloudflare **Worker** (single ES module, `src/worker.js`) + **D1** (SQLite).
- **Auto-deploy:** Cloudflare **Workers Builds** is connected to the repo. **Every push to
  `main` → Cloudflare builds and deploys automatically** (proven: a commit goes live in
  ~30–60s). This is THE pipeline.
- **Test gate:** `.github/workflows/test.yml` runs `npm test` (Node `node:test`) on every
  push/PR. Currently **59 tests, all green.** Pure logic lives in tested modules.
- **How Claude ships a change (exact working procedure):**
  1. Edit files locally in the outputs workspace copy (`/outputs/cims-hr-console/`).
  2. Verify in the sandbox: `node -e "import('./src/worker.js')…"` (imports resolve),
     `node --test` (gate green), and extract+`node --check` any new client JS inside `APP_HTML`.
  3. Ship via the **GitHub web uploader driven through Chrome** (Claude-in-Chrome MCP):
     navigate to `https://github.com/despensasupermercados/cims-hr-console/upload/main/<dir>`,
     `file_upload` onto the "choose your files" input, scroll, click **Commit changes** (commit
     directly to `main`). Uploading a file with an existing name **replaces** it. ALWAYS commit
     a changed `src/worker.js` together with any new modules it imports in the **same commit**.
  4. Confirm the `tests` workflow goes green in Actions.
- **WHY this manual-ish path:** the GitHub **MCP connector is READ-ONLY** (writes 403). Claude
  cannot push via API. The installed **"Claude" GitHub App** (write-all) is the intended
  autonomous-dev engine for the future. Claude must **not** handle Cloudflare/GitHub credentials.
- **Sandbox note:** outputs = `/sessions/<id>/mnt/outputs/`. zip fails on the mounted FS → zip
  in `/tmp` then copy back.

---

## 2. ARCHITECTURE / FILE MAP (repo `src/`)
- `worker.js` — the Worker: routing, auth, all `/api/*` endpoints, and the full front-end
  (`STYLE`, `LOGIN_HTML`, `FB_HTML`, `APP_HTML` template-literal strings with inline client JS).
  **Imports** the pure modules so deployed == tested. Front-end is a tab SPA: `show(tab)` →
  `render*()` → fetch `/api/*` → set `#view`. (Escaping note: inside the `APP_HTML` backtick
  template, runtime-generated single quotes need `\\'`; avoid `${` in client JS; prefer
  `data-*` attribute + delegation over inline onclick.)
- `bonus.js` — **LOCKED bonus SOP (MONEY).** `computeBonus`, `ladderValue`, `mapFeedbackToScore`.
- `auth.js` — `signToken`/`verifyToken` (HMAC stateless; hardened: malformed → null not throw),
  `emailAllowed`.
- `compliance.js` — `crewComplianceReport`.
- `rotation.js` — `buildRotationBoard`.
- `daysworked.js` — `billingReport` (per-crew + per-vessel, period-clipped, actual>projected>open),
  `contractDays`, `periodDays`, `effectiveOff`.
- `keyman_data.js` — generated contract history (203 rows / 65 crew): `{sc,km,ship,st,seq,on,proj,act}`.
- `vessel_ref.js` — `VESSEL_REF` (50 vessels) + `DRY_DOCK` (14 windows).
- `fleet.js` — `dryDockStatus`, `fleetDryDock`, `inDockNow`, `upcomingDocks`.
- `test/*.test.js` — bonus, feedback, auth, compliance, rotation, daysworked, fleet.
- `migrations/` — 0001 schema (16 tables), 0002 crew seed, 0003 feedback_v2. (Most live data
  now loads via **self-seeding `ensureX()` in code**, not migrations — see §3.)
- `CLAUDE.md` — agent rules. `.github/workflows/{test,self-maintenance}.yml`. `.github/CODEOWNERS`
  (bonus.js/auth.js/migrations/bonus tests → Miguel review, @despensasupermercados).

---

## 3. DATA MODEL (Cloudflare D1 `cims-hr-console`, id f0ac8b6a-deac-4214-8f42-e22b202d7d7d)
- `crew` — 97 rows, key `agency_id` = AdvancedQuery `SC-00NNNNN`. names, status
  (On board/On Vacation/Earmarked/Inactive), vessel_observed, rank_observed/override,
  contact (email/phone/province/dob), doc expiries (med/sirb/pp/usv/sch_exp),
  baseline_count (NULL until Rita confirms).
- `keyman_contract2` — self-seeded contract history (sc,km,ship,st,seq,sign_on,proj_off,act_off).
  Decoupled from bonus tables. (Old `keyman_contract` orphaned/unused.)
- `feedback_request2`/`feedback_response2` — feedback windows (self-seeded via `ensureFb`).
- `bonus_outcome` (append-only, **event-sourced count**), `contract`, `assignment`,
  `bonus_policy` v1, `users` (allowlist), `activity_log`, `outbox`, etc.
- Self-seeding pattern: `ensureKeyman`/`ensureFb` run `CREATE TABLE IF NOT EXISTS` then bulk-
  insert **only when the table is empty**. ⚠️ This means re-import/refresh does NOT happen by
  redeploy alone — a refresh must clear/upsert (relevant to §8).
- Vessel/fleet data is **in code** (`vessel_ref.js`), served directly; not a D1 table.

### Crew ID name-bridge (FRAGILE — money-adjacent)
AdvancedQuery/D1 key `SC-…` vs Keyman 6-digit Royal "Ship's Crew ID", bridged by **name match**.
66 confident matches (all high-conf), 31 crew with no Keyman record (newer hires; expected).
Wrong match → wrong contract/billing attribution. Plan: store `ship_crew_id` on crew to harden.

---

## 4. LOCKED BONUS SOP (MONEY — never change without Miguel + green tests)
- `LADDER=[0,0,250,500,750,1000,1250,1500,1750,2000]`; `ladderValue(n)=n<=1?0:n>=9?2000:LADDER[n]`.
- `FLOOR=80`. Weights sOrder20 sAcc25 sPar15 sHand10 sComm10 sMono5 (=85) + eval15 (if eval>=3) =100.
  Sliders clamp to max.
- Gate precedence: `not_completed`(&no compassion) > `rush` > `audit` > `eval_below_3`.
  not_completed/rush/audit → reset count to 0, no pay. eval<3 → hold count, forfeit pay.
  Compassionate bypass: complete=false+compassion=true skips not_completed (can still pay/advance).
- `nextCount = resets?0:advances?count+1:count`. `pay = (!gate && score>=FLOOR)?
  round(ladderValue(nextCount)*score/100):0`. **Count event-sourced** from `bonus_outcome`
  (+baseline). Never overwrite history.
- `mapFeedbackToScore`: Ray (orders/acc/par + rush & audit gates), Rolando (handling→sHand),
  Dexter (mono%→sMono). Worst-leg aggregation across contract legs.

---

## 5. BUILT & LIVE (verified)
- Autonomous pipeline (Workers Builds auto-deploy + 59-test gate + nightly agent + CODEOWNERS).
- Auth: magic-link (code ready, no email provider) + **access-key/bootstrap login** (POST key to
  `/auth/dev`, not in URL) + **30-day sessions**.
- Dashboard (workforce, compliance-90d, contract-history tiles).
- Crew grid + **clickable crew-360 detail** (profile, contacts, doc chips, contract history+sea-days).
- Rotation (status filter tiles + by-vessel + dry-dock badge).
- Compliance (expiry report, 30/60/90 window, CSV, clickable cards).
- Billing/Days-Worked (date range, per-crew + per-vessel, actual/projected/mixed basis, CSV).
- Fleet (50 vessels, dry-dock live status, lead times, in-dock/upcoming counts).
- Feedback windows (Ray/Rolando/Dexter scoped single-use token forms).

---

## 6. OPEN LOOPS / PENDING
- **#16 Email login** — parked, no domain. Resend no-domain sender emails only the account
  owner. **Do NOT use sudespensa.cl** (reserved for Miguel's separate intelligence/Despensa
  tools — keep DG3 and Despensa identities apart). Wait for dg3.com. Interim: access-key + 30-day.
- **#17 Bonus baselines** — GATED on Rita's reconciliation. Money. baseline_count stays NULL
  until Rita confirms. Do not auto-load.
- **#22 Crew PDF statements** — needs real bonus runs (none yet) + delivery (R2 + email).
- **#28 Vessel economics (data.xlsx)** — IN PROGRESS. Fleet backbone done; granular per-ship
  meter/click/fee billing from 2.3MB `data.xlsx` pending (too big to stream through chat — drop
  into workspace when ready). **Miguel: NOT MFD/economics right now.**
- **Data-refresh mechanism** — active ask, see §8.

---

## 7. SECURITY / GOVERNANCE (always honor)
- Crew never log in. Only Miguel + Rita (allowlist `users`).
- Money gate: bonus logic / baselines need Miguel + green tests. Nightly agent auto-merges only a
  whitelist; money/auth/schema/crew → human PR.
- Claude never handles secrets/tokens (Cloudflare API token, BOOTSTRAP_KEY, SESSION_SECRET, API
  keys). Miguel sets them. Claude doesn't change access controls (branch protection) — Miguel does.
- Data refresh updates registry/contracts/fleet but **must NOT auto-load money baselines**; flag,
  don't silently overwrite money-relevant data.

---

## 8. DATA-FRESHNESS REQUIREMENT (Miguel, 2026-06-11) — design + plan
**Intent:** the Drive folder's source files (esp. Rita's **AdvancedQuery** TDG crew file, plus
Keyman, vessel data) must be **checked nightly** and the system must **always work with the
latest correct data**. Wants: (a) a **"Refresh data" button** for Rita (upload → refresh);
(b) ideally a **beacon** auto-refreshing when the folder changes. (NOT MFD/economics now.)

**Reality today:** data is snapshotted into code modules + loaded once into D1 via self-seeding
`ensureX()` (seeds only when empty). Nothing auto-updates on a new upload. Parse/transform logic
runs in Claude's Python sandbox, not the Worker. The Worker has no Drive access.

**Recommended (phased):**
1. **Manual "Refresh data" button (Rita) + nightly scheduled refresh** = robust, ~95% of value.
   Button = instant after upload; nightly = safety net.
2. **Real-time folder beacon** (Drive `changes.watch` push → webhook → refresh) = north star but
   fragile (watch channels expire ~7d, need renewal; webhook auth; Drive creds). Add LATER.

**Two ingest paths — DECISION NEEDED:**
- **Path A (recommended): nightly GitHub-Actions agent ingests.** Agent gets Drive read access +
  transform scripts in the repo; nightly (and on button via `workflow_dispatch`) it pulls the
  folder, re-parses, regenerates data modules, commits → auto-deploy → reseed/upsert D1. Keeps
  parsing/creds out of the Worker; reuses the autonomous pipeline.
- **Path B: Worker pulls live.** Worker gets Drive API creds + SheetJS; button/cron hits a Worker
  endpoint that fetches+parses+updates D1. More real-time; heavier; `.xls` parsing finicky.

**Blocker / Miguel must provide:** a **Drive read credential** (service account or read-only OAuth
token scoped to the folder) for the runner. Claude never holds it → CI/Worker secret.

**Must preserve:** refresh updates crew registry / contracts / fleet; **baselines stay gated**
(Rita). Refresh runs an integrity diff and **flags** anomalies (name-bridge mismatches, count
changes) instead of silently overwriting money-relevant data. Extend the nightly agent brief with
this source-vs-D1 freshness check. Also: because `ensureX` only seeds-when-empty, the refresh must
explicitly clear/upsert the relevant table (not rely on redeploy).

---

## 9. KEY IDS / CONTACTS
- Cloudflare acct 7148946ab624fb49a34c77bb04c2f3a7 · Worker `cims-hr-console` · live URL
  `https://cims-hr-console.sanmartin.workers.dev` · D1 id f0ac8b6a-deac-4214-8f42-e22b202d7d7d.
- GitHub `despensasupermercados/cims-hr-console` (public). GitHub MCP = read-only; "Claude" App = write.
- Drive source folder id `1KS39kmCrKpLVZljY36Yo8UaQLtHWL7WQ` (AdvancedQuery.xls = Rita's crew
  registry; CIMS Keyman workbook; Email-Fleet). Sub-folder **Vessel Deployments**
  id `1A9cEPSHwwsCAKIQhnUpxffCjF1PC46ov` → `data.xlsx` (2.3MB) id `1_6LJq_Z6zMcMIOj1kNVlBPHsdaaRBiTY`;
  Vessel_Deployment_Reference.txt id `1VrUXiR8ioTlu-l49X3FbA1u9VnJ4h2fJ`.
- Team: Miguel.Sanmartin@dg3.com (GM), Rita.Berenyi@dg3.com (HR) — both allowlisted. Contributors:
  Ray.Guerra (feedback 'ray'), Rolando.Abellan ('rolando'), Dexter.Lawrence ('dexter'+mono%),
  Ohji.Miranda (role TBC), Joemar.DeLeon (trainer).

### ACCESS GRANTED 2026-06-12 — 5 contributors added as FULL users (Miguel's explicit decision)
Miguel decided "Full access now" 2026-06-12. The 5 below are now in the allowlist. Implemented as
code: `ALLOWLIST_SEED` + `ensureUsers()` in src/worker.js (idempotent INSERT OR IGNORE, runs on each
login via authRequest/authDev). Committed + deployed. The allowlist is now SINGLE SOURCE OF TRUTH in
code (all 7 = Miguel, Rita, + these 5). Note: only role 'full' exists, so all 7 see bonus $ + billing
+ crew PII. (Could NOT verify rows via Cloudflare D1 console — that UI hung all session; seed is
tested + deployed + login-triggered.) **Emails confirmed verbatim by Miguel:**
  1. Ray Guerra      — Ray.Guerra@dg3.com      (feedback 'ray')
  2. Rolando Abellan — Rolando.Abellan@dg3.com (feedback 'rolando')
  3. Dexter Lawrence — Dexter.Lawrence@dg3.com (feedback 'dexter' + mono%)
  4. Joemar De Leon  — joemar.deleon@dg3.com   (trainer; note: all-lowercase as given — auth is case-insensitive)
  5. Ohji Miranda    — Ohji.Miranda@dg3.com    (role TBC; Miguel spelled "Ohjie")
**Access-model caveat when granting:** the `users` table has only ONE role — `'full'` (CHECK role IN
('full')). Adding any of these = FULL access (bonus $, billing margins, crew PII: passport/visa/
medical). If Miguel wants them limited to feedback/their crew, a scoped role must be built FIRST
(new role value + per-tab gating). Flag this again at grant time.
**DECISION 2026-06-12:** keep the explicit allowlist. Domain-wide `@dg3.com` was REJECTED
(would give full PII + money to every DG3 employee; bad trade). If low-friction onboarding is
ever needed, build a scoped role FIRST, then domain-allow into that scoped role — never into 'full'.

---

## 10. LIVE STATE & SESSION-2 DECISIONS (2026-06-12)

### Live infrastructure
- **App is LIVE at https://cims.work** (Cloudflare Workers; custom domain attached; nameservers on
  Cloudflare: crystal/edward.ns.cloudflare.com). Also at cims-hr-console.sanmartin.workers.dev.
- **Email (Resend):** domain **cims.work VERIFIED** (DKIM/SPF/MX auto-configured into Cloudflare DNS).
  Secrets set by Miguel: `RESEND_API_KEY` + `MAIL_FROM` = `CIMS <noreply@cims.work>`. Magic-link login
  works end-to-end — verified: send → Resend "Delivered" to Miguel.Sanmartin@dg3.com.
  **DELIVERABILITY GAP:** DG3's mail filter quarantines (cold domain). FIX = DG3 IT allowlists
  `cims.work` / `noreply@cims.work` (an IT-request note was drafted for Miguel). Optional: add a
  DMARC record (offered, not yet added). Until then everyone uses **access-key (BOOTSTRAP_KEY) login**.
- **Favicon:** brand icon (navy #1B3A5C squircle + green #5FB946 waves, transparent corners) embedded
  as base64 in src/icons.js, served at /favicon.ico + /apple-touch-icon.png; <link> tags on all pages.

### Auth / access (see §9 block above for the 5 granted users)
- 7 full users total (Miguel, Rita + 5 contributors). Seeded in code: `ALLOWLIST_SEED` + `ensureUsers()`.
- Only role = 'full'. No scoped role yet. Crew never log in (unchanged).

### #22 Crew PDF statement — BUILT + deployed (delivery half gated)
- Dependency-free PDF: **src/pdf.js** (hand-rolled PDF writer, Helvetica, tables, auto page-break) +
  **src/statement.js** (brand layout; doc-compliance flags; **bonus standing INCLUDED incl. $** per
  Miguel's choice; contract history + sea-days). Verified by rendering to PNG.
- Endpoints: `GET /api/crew/statement.pdf?id=` (download — works now) + `POST /api/crew/statement/email`
  (stores to R2 if `env.STATEMENTS` bound + emails via Resend with PDF attachment). crew-360 has
  **Download PDF** + **Email statement** buttons.
- GATED: (1) R2 bucket not created yet (needs Cloudflare dashboard — hung all session) → bind
  `env.STATEMENTS` later; code is inert-safe until then. (2) auto-email rides on the deliverability fix.

### #28 Vessel deployment — REFRAMED: HR context, NOT billing/economics
- The "equipment/cost-per-click/manpower billing" framing was a MIS-TITLE (never intended; no such
  file exists). Vessel deployment was always meant as HR context. Use it across HR where it helps.
- `data.xlsx` (Drive, Vessel Deployments) = wide **deployment itinerary** matrix: 1 sheet "Export",
  2223 rows × 352 cols, stacked header brand(CEL/RCI)→class→ship→fields(PORT, RANK, PORT NAME, ARRIVE,
  DEPART, TENDER). ~51 ships. NOT yet parsed/loaded (the 2.3MB file can't be pulled through the Drive
  connector or chat without overflow; in-app preview uploader is the intake path).
- SHIPPED: **src/deploy.js** (pure, tested) → crew-360 "Deployment & document fit" card: ship
  homeport/region (from VESSEL_REF, already encoded), **region-required visa** check (US C1/D for US
  regions, Schengen for Europe) vs crew visa expiry, and **next dry-dock** (forced crew change).
- In-app **Vessel deployment — preview structure** option live in Settings → Data uploads (client-side
  SheetJS; shows sheets/columns/samples; read-only, no save). Next steps if wanted: parse the matrix
  → per-date ship position → pin relief ports to actual port calls.
- Logistics/lead-time planner was proposed then DEFERRED — Miguel said HR focus, not logistics (lead
  times are estimates in VESSEL_REF and fine as-is).

### Deploy mechanics (IMPORTANT for future sessions)
- GitHub MCP is READ-ONLY → deploy = upload changed files via the **GitHub web uploader driven with the
  Chrome MCP** (file_upload to the upload page, commit to main). Push to main triggers Workers Builds
  (runs `npm test` gate, then deploys). The commit-message field often won't take focus after upload —
  default "Add files via upload" message is fine.
- **Cloudflare dashboard hangs on its splash in the Chrome automation tab** (recurring, all session).
  Avoid dashboard-dependent steps where possible; D1 changes done via code seeding, DNS verified via
  `dig`. R2 bucket creation is the one thing still requiring the dashboard.
- Verification gate (run locally before every deploy): `node -e "import('./src/worker.js')…"` (validates
  imports + APP_HTML template), `node --test`, and a client-JS `node --check` on the extracted APP_HTML
  <script>. As of 2026-06-12: **73 tests pass.**

### Still open
- #17 bonus baselines — GATED on Rita's reconciliation (money); not loaded.
- R2 bucket for statement storage; email deliverability (IT allowlist).
- Optional: parse data.xlsx itinerary; per-nationality visa rules; DMARC record.
- Data-refresh mechanism (§8) — vessel preview is increment 1; crew refresh live; nightly/auto TBD.
