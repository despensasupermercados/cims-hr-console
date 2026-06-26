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
- `rotation.js` — `buildRotationBoard` (legacy pure helper; the LIVE board is built in `worker.js apiRotation`).
- `shipname.js` — **NEW (Session 4)** SINGLE SOURCE OF TRUTH for ship-name canonicalization:
  `canonShip`/`canonShipWith`/`buildShipKeys`/`validShipKeys`. Turns any raw vessel string
  (registry "MV CELEBRITY REFLECTION", keyman "Reflection", schedule "Celebrity Reflection",
  "MV AZAMARA QUEST") into ONE canonical short name so the rotation board's three data sources
  key-align instead of fragmenting. Fixes the dropped-history bug (Session 4 §A).
- `daysworked.js` — `billingReport` (per-crew + per-vessel, period-clipped, actual>projected>open),
  `contractDays`, `periodDays`, `effectiveOff`.
- `keyman_data.js` — generated contract history (203 rows / 65 crew): `{sc,km,ship,st,seq,on,proj,act}`.
- `vessel_ref.js` — `VESSEL_REF` (50 vessels) + `DRY_DOCK` (14 windows).
- `fleet.js` — `dryDockStatus`, `fleetDryDock`, `inDockNow`, `upcomingDocks`.
- `test/*.test.js` — bonus, feedback, auth, compliance, rotation, daysworked, fleet, deploy,
  statement, travel, crewimport, policy, **shipname (Session 4)**. **103 tests** (was 92).
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

---

## SESSION UPDATE — 2026-06-13 (UI build-out, biggest-first)

Shipped the remaining mockup-driven UI in five deploys (all through the test gate; 81 tests green):

1. **Keyman editable Edit-contract modal** (`4575a9a`). Card click → "Edit contract — [name]"
   modal: embark/disembark city, sign-on/off dates, ship dropdown, CONFIRMED checkboxes
   (ECCR/AIR/HOTEL/ON DATE/OFF DATE) that drive the green card tags, + comment. Persists to
   `contract_edit` (per-contract, manual-wins) and `crew_ready.note`.

2. **Crew tab rebuild** (`d5786d4`). Prototype-matched editable cards: passport + age, rank pill,
   vessel·client, province·phone with ⚠verify, contract span, contract count, next-bonus pill,
   doc badges, gold note dot. Tools: ✎ Edit, 🗒 Notes. Filters: status + compliance tiles,
   client + ship selects, sort (name/sign-off/contracts/ship), search. **+Add crew** and full
   **Edit** modals. Timestamped **notes log** (separate from the single edit-note).

3. **Dashboard** (`b6071e6`). Three zones (Workforce / Compliance / Cost & Bonus) with
   **hand-rolled inline-SVG charts** (donut status mix, donut by client, bar of expiring docs,
   line of travel spend by month) — no CDN dependency. Keeps the with/without-shoreside toggle.

4. **Contracts & Bonus tab** (`96150a3`). Fleet-wide bonus **ledger**: contract count, consecutive
   count, rank, next rung, last outcome, total paid; filters + sort; per-row **statement PDF** and
   **Score** shortcut; +New signer. Tab labels: "Contracts & Bonus" (ledger), "Score" (was Bonus).

5. **Feedback Windows tab** (`10531c6`). Near-sign-off board (contract ending ≤45d or ended ≤30d)
   with per-role window pills (Ray/Rolando/Dexter: green=in, amber=requested, grey=none) that
   generate single-use links, plus a Score shortcut (pulls window evidence into the Score Card).

### Architecture decisions this session
- **"Manual wins" via override tables, not in-place edits.** `crew_override` (per-field) is merged
  over the imported `crew` base row on every read (`applyOverride`); AdvancedQuery imports never
  touch overrides, so manual edits/added crew survive re-uploads. Same pattern as `contract_edit`.
  `+Add crew` writes a base row AND an override.
- **New tables (self-seeding):** `crew_override`, `crew_note_log`, `contract_edit`.
- **New endpoints:** `/api/crew/save`, `/api/crew/add`, `/api/crew/notes` (GET/POST),
  `/api/rotation/contract`, `/api/contracts` (ledger), `/api/feedback/board`.
- **Money honesty:** next-bonus $ is shown ONLY where a baseline is set; otherwise "baseline pending".
  Bonus math + gating untouched. #17 (Rita baseline reconciliation) still the gate before any payout.
- **Verification gate now: 81 tests** + worker import + client-JS `node --check`
  (scripts/checkclient.js). Client JS escaping: `\\'` for quotes; avoid `\\"` (checker/runtime
  don't normalize it) and `${`.

### Still open (unchanged + new)
- Runtime UI verification of the new tabs needs an authenticated session (magic link) — only Miguel/Rita.
- #17 bonus baselines (Rita reconciliation); R2 bucket for statements; DG3 IT email allowlist.

### SESSION UPDATE — 2026-06-13 (continued: live review + refinements)

After the five tabs above were deployed, Miguel logged in and reviewed live; these refinements followed (all deployed, gate green, 81 tests):

- **Crew notes — delete.** Each entry in the Crew → 🗒 Notes log now has a ✕ (confirm-guarded). Server: `POST /api/crew/notes {delete:<id>}` removes a row from `crew_note_log`. Gold note dot clears when the last note is removed.
- **Keyman — collapsible Unassigned pool.** The "no Keyman history" pool is now a collapsible `shipsec` header, **collapsed by default** (`ROT_CLOSED.__POOL__=true`). It was eating the screen.
- **Uniform toolbar controls.** Global rule `.bar input,.bar select,.bar button,.bar .btn{height:38px;box-sizing:border-box;...}` — all toolbars across every tab now have equal-height controls (Miguel flagged the Keyman filters looked uneven).
- **Travel tab — full analytics rebuild** (replaces the old single-series view):
  - **YTD same-period comparison**: latest year vs prior year over the *identical* months the latest year has on file (never partial-vs-full-year). Headline total + Δ% + per-category table. Live example 2026: Jan–Jun 2026 $41,690 vs Jan–Jun 2025 $79,630 = −48% (Air is the main driver, −51%).
  - **Month-by-month LY vs PY** table; total row compares **same period only**; months the latest year hasn't reached / aren't uploaded show **"pending"** (NOT −100%). Prior-year full-year shown as a note.
  - **Line-item explorer** with filters: name search, year, month, category, kind (crew/shoreside). **Header tiles recompute live** (total, Air %, Hotel, each category, top spender) for exactly the filtered set.
  - Client helpers added: `usd0`, `pct`, `deltaCell`, `tSum`; globals `TRVALL`, `TF`, `TCATS`, `TCATLAB`. `apiTravel` unchanged (returns all records; filtering is client-side).
  - **Accuracy note:** the −48% YoY is only valid if Rita has fully uploaded 2026 Jan–Jun. Confirm completeness before reading strategy into it.

### Deploy mechanics reminder (unchanged, for the next session)
- Edit `src/worker.js` locally → run gate: `node -e "import('./src/worker.js')…"` + `node scripts/checkclient.js` (extracts APP_HTML <script>, `node --check`) + `node --test` (81). Then deploy by uploading `src/worker.js` via GitHub web uploader (Chrome MCP `file_upload` to `/upload/main/src`, JS-click the "Commit changes" button). Push → Workers Builds runs the test gate and deploys to cims.work. Verify live by navigating the authenticated Chrome tab (session cookie is shared) and screenshotting; `/` redirects to `/login` for unauthenticated curl, so curl can't see the app shell.
- Client-JS string escaping: use `\\'` for single quotes inside single-quoted JS strings; AVOID `\\"` (neither checker nor runtime normalizes it) and `${`.

### Open / next (for the new chat)
- #17 bonus baselines — still GATED on Rita's reconciliation before any payout; Contracts & Bonus shows "baseline pending" everywhere until then.
- **Feedback Windows board is empty** because the loaded Keyman snapshot's sign-off dates are mostly 2025 (stale) — nothing falls in the ±45/30-day window as of Jun 2026. Decide: (1) refresh Keyman data, or (2) re-base the trigger on live registry status instead of Keyman off-dates.
- Dashboard "shoreside $0" for 2026 — likely the 2026 travel upload lacks the CIMS (shoreside) sheet; confirm with Rita.
- Still: R2 bucket for statement storage; DG3 IT email allowlist for Resend deliverability.

---

## SESSION UPDATE — 2026-06-13 (session 3: money-hardening, registry-driven rotation, data refresh)

Big session. **Test gate now 92** (was 81). New module `src/policy.js`. Keyman table migrated
`keyman_contract2` → **`keyman_contract3`** (race-proof). Rotation board fundamentally reworked to
be **registry-driven**. Crew registry re-imported from a fresh AdvancedQuery. Full 2026 visual
refresh. Read this section first — it supersedes parts of §3, §5, §6, §10 above.

### A. MONEY-HARDENING BATCH (deployed `f704185` + tests `0a51751`) — was an adversarial bug hunt
New pure module **`src/policy.js`** (`resolveBaseline`, `isMoneyUser`, `feedbackSubmittable`) +
**`test/policy.test.js`** (11 tests). `src/bonus.js` UNCHANGED. Fixes (all live):
1. **Baseline read was split (P0 money bug).** `baseline_count` is in `OVR_FIELDS`, so a baseline set
   via the crew Edit modal lands in `crew_override`. The ledger/crew-card read the override, but the
   payout math (`apiBonusCommit`→`crewCount`), `apiBonusCrew`, and the PDF statement read the **base
   crew row** → would have shown a baseline on screen but paid from 0. Added `effectiveBaseline()`
   (override-wins) so all read paths agree. 0 is treated as a real baseline, not unset.
2. **Commit double-submit guard.** `apiBonusCommit` now no-ops if an outcome already exists for the
   same crew + exact (span_start, span_end) → returns the existing one. Prevents double pay/double count.
3. **Money-authority gate.** `apiBonusCommit` + baseline writes (`crew/save`, `crew/add`) restricted to
   MONEY users (Miguel, Rita) via `isMoneyUser` — the 5 contributors are all role 'full' and could
   otherwise commit payouts. Lowercased set: `miguel.sanmartin@dg3.com`, `rita.berenyi@dg3.com`.
4. **Feedback links truly single-use.** `apiFeedbackSubmit` rejects a 2nd submission (status not
   pending → 409); `apiFeedbackForm` returns `locked:true` and no prior answers once answered. The
   public `/fb` page shows a "✓ Already submitted" state.
5. **Error hygiene.** Top-level catch no longer leaks `err.message` to the client (logs server-side);
   null-crew guard in the feedback form.
**NOTE:** `scripts/checkclient.js` referenced in old notes is NOT in the repo — the real CI gate is
just `npm test`. Claude replicates the client-JS `node --check` manually (extract rendered
`LOGIN_HTML/FB_HTML/APP_HTML` <script> blocks from the *evaluated* template, not the raw source).

### B. KEYMAN REFRESH + race-proof reseed (`keyman_contract3`)
- Regenerated **`src/keyman_data.js`** from the **"Contract Counter"** sheet of the new
  *CIMS Keyman (latest version).xlsx* (HR's authoritative per-crew contract list). Bridged Royal
  6-digit km → SC via the existing keyman map + **AdvancedQuery roster** (exact last+first, then
  unique-surname, then normalized concat). **71 crew, ~204–209 contract legs, 0 bridge conflicts.**
  The unbridged Contract-Counter rows are mostly genuinely **not our crew** (other-line printers).
- **CRITICAL BUG FIXED — reseed triplication.** Old `ensureKeyman` did seed-when-empty, then a
  versioned DELETE+INSERT. Under concurrent requests it **raced and stacked rows** (one crew showed
  9 legs = 3×3; fleet total 627 vs the correct 209). Fixed by switching to **`keyman_contract3` with
  `PRIMARY KEY (sc, seq)` + `INSERT OR REPLACE`** — idempotent and race-proof (verified: 6 concurrent
  hits all return the correct count). `KEYMAN_VERSION` gates reseed; bump it to force a one-time reload
  + it prunes (sc,seq) no longer in the dataset. **All `keyman_contract2` query refs → `keyman_contract3`.**

### C. ROTATION BOARD — now REGISTRY-DRIVEN (the big rework)
The board used to build "who's onboard" from stale Keyman contract legs (2024–25 dates) → ships
showed **empty** or showed inactive long-gone crew as if current. Root fix: **onboard now comes from
the live registry** (`crew.status` + `crew.vessel_observed`), the source of truth. Keyman/schedule
only enrich + provide history.
- **`apiRotation` rebuilt:** prominent per-ship cards = active crew (status ≠ Inactive) whose
  `vessel_observed` maps to that ship; `current` = status 'On board'. Naturally shows **2-up
  crew-change overlaps** (verified: Allure=Gorre+Lazo, Constellation=Ramos+Aquitania, Voyager=
  Batadlan+Gayda). Inactive crew + crew who've moved on drop to greyed **"Also served this ship"** history.
- **`shipOf(vessel)`** maps a registry vessel string ("MV AZAMARA QUEST") → canonical short ship name
  ("Quest") via longest VESSEL_REF match, **+ the 4 Azamara short names (Journey/Onward/Quest/Pursuit)**
  because VESSEL_REF lacks Azamara and the registry uses "MV AZAMARA X" while keyman/schedule use "X".
  This was the cause of "a lot of them" missing dates (every Azamara ship). Else prettifies the raw name.
- **Date/length enrichment:** onboard cards get sign-on/off from Keyman legs, **then fall back to the
  schedule tabs** (`schEnr`). Cards show the **contract number** (`C{n}`) and the **months+days length**
  (`monthsDays()`). History cards ("Also served") also show on→off + months+days length.
- **SHORESIDE team:** Miguel's DG3 staff are tagged shoreside and **kept off the ships** + excluded from
  seafarer counts, shown in a collapsible **"Shoreside team"** group. Hard-coded set in `apiRotation`:
  `SHORE_IDS = {SC-0038392 Joemar De Leon, SC-0038378 Ohji Miranda}` + `SHORE_NM` name set for the
  7 (de leon joemar / miranda ohji / guerra ray / abellan rolando / lawrence dexter / sanmartin miguel /
  berenyi rita). (Ray/Rolando/Dexter Lawrence/Miguel/Rita aren't in the seafarer roster; only Joemar &
  Ohji needed pulling out. "Adrian Dexter Domingo" SC-0026127 is a *different* person, a real seafarer —
  do NOT tag him.) To add/remove shoreside, edit these sets.
- **`src/ship_history.js`** (new): per-ship deployment history parsed from the 3 schedule tabs
  (Celebrity / "+ + RCCL SCHEDULE + +" / Azamara). `{ship,name,sc,ours,on,off,brand}`. **Filtered to
  TDG roster crew only** (`ours=true`) per Miguel — former/other-line crew excluded (the schedule
  free-text was too noisy: ports-as-names, month fragments, typo'd dupes). History-only sections are
  restricted to real VESSEL_REF ships (guards junk "ship" names like "# of flights:").
- **Other rotation UX:** smooth optimistic drag-drop (card animates into the new ship, no full-board
  flash; reverts only on API failure), **cruise-line filter** relabeled "All cruise lines"
  (Royal Caribbean / Celebrity / Azamara). Pool = active crew with no ship match (now usually empty).

### D. CREW REGISTRY RE-IMPORT (live data refresh)
Re-imported the fresh **AdvancedQuery-8ba3c8e9.xls** via `POST /api/crew/import` (parsed rows pushed
from the authenticated tab; apply path, COALESCE so blanks don't clobber, **never touches
baseline_count**). Result: 9 status/vessel changes + 1 new crew (**Dan Angelo Bo, SC-0046132**). The
registry now matches the file (51 On board, the 2-up overlaps Constellation/Voyager/Allure/Quest).
This is the manual-refresh path working end-to-end; the nightly/auto refresh (§8) still needs the
Drive credential.

### E. OTHER UI FIXES (all deployed this session)
- **Rank tags fixed:** crew card pill now reads the **registry rank** (`rankTag(c.rank,...)`), showing
  the real blend (~71 Printer Specialist / ~26 Jr PS) instead of everyone "Jr PS" (was derived from the
  gated baseline). Bonus/ledger rank stays count-derived per the SOP.
- **Feedback board re-based on registry status** (§9 old item resolved): shows crew with status
  'On Vacation' (feedback due now) + 'On board' (upcoming), not stale Keyman off-dates. Was 0 rows → ~64.
- **2026 visual refresh:** all checkboxes → iOS-style **toggle switches**; rounded inputs with green
  focus rings; pill buttons with hover lift; blurred modal backdrops + entrance animation; softer
  cards/tiles with hover. Appended as override block at the end of `STYLE`.
- **Collapsible Dry-dock schedule** (Fleet tab, native `<details>`).

### F. DEPLOY MECHANICS — updates for next session
- The GitHub commit button is **flaky via Chrome**: prefer `find` → click `ref` of "Commit changes";
  if it doesn't navigate, click coordinate ~**(159, 790)** (single-file layout) / ~(160, 841) (multi-file).
  The commit-message field usually won't take focus → default "Add files via upload" is fine. **Verify
  the commit landed via the GitHub MCP `list_commits` (HEAD sha), not the screen.**
- **Cloudflare Workers Builds propagation can be SLOW** — usually 30–60s but this session one build
  (`ed41384`) took **>4 min** and was still serving the old version when the session paused. GitHub
  Actions `tests` (#70) went green; the Cloudflare deploy is a separate pipeline. If a change isn't live
  after a couple minutes, check whether the Workers Build failed vs just queued (Cloudflare dashboard
  hangs in the automation tab, so this is hard to see — wait it out or push a trivial re-commit).

### G. OPEN / NEXT (session-3)
- **Last deploy `ed41384` (months+days length on cards, schedule date-enrichment, Azamara `shipOf`
  fix) was committed + tests-green but had NOT propagated when the session paused.** Verify Santos/
  Quest + the Azamara ships show dates; ~26/71 onboard cards still lacked sign-on dates (crew with no
  Keyman leg AND no schedule entry on that ship — a data-coverage limit, not a logic bug).
- **NO automated tests on the new rotation logic** (`shipOf` matching, shoreside, schedule enrichment,
  registry onboard). High churn this session via many rapid money-adjacent prod deploys. **Recommended
  consolidation pass: extract + unit-test these** so they're locked in. (Also still un-tested from
  session 2: `applyOverride` merge, `apiContracts` ledger math.)
- Carryover: **#17 bonus baselines** (Rita reconciliation — the core money gate, still NULL);
  R2 bucket for statement storage; DG3 IT email allowlist for Resend deliverability; data.xlsx
  itinerary parse; the §8 nightly auto-refresh (needs Drive credential).
- Shoreside set is hard-coded in `apiRotation` — if the team changes, edit `SHORE_IDS`/`SHORE_NM`.

---

## SESSION UPDATE — 2026-06-23 (session 4: full code audit + rotation ship-name fix)
**Mandate:** verify the entire codebase, find and fix bugs, backfill tests, ship. Repo HEAD at
start `c65217d`; **HEAD at handoff `3eaa360`.** Two commits, both verified live on cims.work.

### A. THE BIG BUG — rotation board was silently dropping 38% of schedule history (FIXED)
- **Symptom (the real one):** the board keyed ships from THREE sources that name them differently
  — registry/keyman use the bare hull name ("Reflection", "Quest"); the schedule tabs prefix
  Celebrity ("Celebrity Reflection") and use Azamara short names absent from `VESSEL_REF`. The
  `validShip` "junk guard" (session-3 commit 831c109) then discarded every non-exact match.
- **Measured impact (simulated against live data):** **136 of 362 `ours` history rows dropped** —
  ALL 14 Celebrity ships showed ZERO history (88 rows), ALL Azamara dropped/fragmented (39 rows),
  plus typos. Azamara onboard cards also showed the wrong title ("AZAMARA QUEST") and wrong brand
  colour (Royal, not Azamara), and Celebrity/Azamara onboard cards lost schedule-date enrichment.
- **CORRECTION to session-3 §G:** this was **a logic bug, NOT the "data-coverage limit" it was filed
  as.** The §8 claim that `ed41384` shipped an "Azamara `shipOf` fix" was FALSE — at `c65217d`,
  `shipOf` had zero Azamara handling. The web-uploader commit had silently no-op'd / never contained
  it, and nobody verified against the API. (See deploy rule below.)
- **The fix:** new pure module `src/shipname.js` = ONE canonicalizer applied to all three sources so
  their section keys align (longest `VESSEL_REF` match → Azamara short name → prettify). Plus two
  data corrections in `ship_history.js`: the `Sympony`→`Symphony` typo (a canonicaliser can't catch a
  misspelling) and a junk `# of flights:` parse-artifact row. `apiRotation` now canonicalises
  registry + keyman + schedule names through `shipOf = canonShipWith(...)`, and `validShip` includes
  the 4 Azamara hulls.
- **Commit `1e85696`** (worker.js + shipname.js + ship_history.js, one commit per the "import in the
  same commit" rule). **Commit `3eaa360`** (test/shipname.test.js).
- **Verified LIVE (`GET /api/rotation`, no-store):** 49 sections; Azamara = Journey/Onward/Quest/
  Pursuit, all brand=Azamara, all with history; all 14 Celebrity sections now carry history; ZERO
  malformed titles; 247 history cards total. Bug closed.

### B. FULL AUDIT — everything else reviewed, no other bugs
- Read & audited every pure module + the worker money/ledger paths. **Clean:** `bonus.js` (locked
  SOP), `auth.js`, `policy.js`, `compliance.js`, `daysworked.js`, `travel.js`, `crewimport.js`,
  `fleet.js`, `clientOf`, and the money paths — `apiBonusCommit` (money-user gate + gate-note rule +
  span validation + double-submit guard), `crewCount` (event-sourced), `effectiveBaseline`/
  `resolveBaseline`, `applyOverride`. Nothing wrong.
- **Two non-issues noted, deliberately NOT changed:** (1) `deploy.js docState` / `statement.js
  docStatus` lack the ISO-date guard the other modules use → a malformed date returns "ok" instead of
  flagging; never triggers because D1 dates are always normalised ISO or null. (2) `apiContracts`
  resolves the baseline inline (`ov.baseline_count != null ? … : …`) instead of via `resolveBaseline`
  — functionally identical, but it's money-adjacent so left for Miguel's call rather than touched
  silently. (So §6's "all paths use resolveBaseline" is not literally true — the ledger duplicates it.)

### C. TESTS — §9.2 gap closed
- `test/shipname.test.js` (11 tests, total 92→**103**). Covers Celebrity-prefix mapping, Azamara
  (registry + short), case/parenthetical noise, longest-match priority, junk/empty handling, and a
  **regression guard** that FAILS LOUDLY if a future data refresh reintroduces an unmatched ship name
  (so a silent history-drop can't recur). `applyOverride` and `apiContracts` ledger math remain
  un-unit-tested (they're async/DB) — candidates for a future extract-and-test pass.

### D. DEPLOY MECHANICS — new standing rule (learned the hard way)
- The GitHub MCP (authenticated as `despensasupermercados`) can READ + verify commits (`get_commit`,
  `list_commits`) but the web uploader is still the write path for large files (worker.js is 213KB —
  too big to inline through the MCP `push_files`/`create_or_update_file` tools).
- **RULE: every deploy must END with an API check of the LIVE behaviour** (`fetch('/api/…',
  {cache:'no-store'})` via the Chrome JS tool), not a screenshot of a green commit. `ed41384` is the
  cautionary tale: it read as "shipped + tests green" but the fix was never actually live.

### E. OPEN / NEXT (session-4) — unchanged blockers, re-stated bluntly
- **#17 bonus baselines STILL the core unblock — `baseline_count` NULL fleet-wide, blocked on Rita
  for 4 sessions.** The platform's money function pays out nothing until she reconciles. This is a
  person problem, not a code problem. Next action proposed to Miguel: a hard-deadline ask + a one-line
  definition of the "reconciliation delivered" artifact.
- Carryover: R2 bucket for statement storage; DG3 IT email allowlist for Resend; data.xlsx itinerary
  (HR context only); §8 nightly auto-refresh (needs Drive read credential).
- Remaining data-coverage (NOT a bug): some onboard cards still lack sign-on dates where a crew has
  no Keyman leg AND no schedule entry for that ship — genuinely missing source data.

---

## SESSION UPDATE — 2026-06-24 (session 5: field-intel pipeline + AI auto-processing)

**The feature (Miguel's idea):** a crew card should be the "one true source of knowledge" on each
seafarer. Anyone (Ray, Rolando, Dexter, or anyone) emails crew-reports@cims.work about a crew member;
AI reads the WHOLE email, identifies the crew by name, summarises it into decision-grade bullets, and
files it as a dated entry on that crew's card. **Kept entirely SEPARATE from the scored bonus** — this
is qualitative field intel, not money.

### A. Pipeline, end-to-end (all LIVE + verified)
1. **Receive** — Cloudflare Email Routing → Worker `email()` handler stores the raw MIME in
   `email_inbox` (status `new`), then fires `ctx.waitUntil(processIntelInbox(env,5))` so processing
   starts on arrival (a card appears within seconds, no polling wait).
2. **Decode** — `decodeEmailBody(raw)` extracts text/plain, decodes quoted-printable/base64, strips
   HTML+URLs → clean prose (forwarded mail is always encoded; without this the matcher sees gibberish).
3. **Identify (deterministic, safe)** — `crewmatch.js matchCrew(text, roster)` → high (first+last) /
   med (unique last) / low (ambiguous) / none. high|med auto-files; low|none → pending review queue.
   The WHO stays deterministic on purpose; the LLM never decides identity (a wrong match = a false
   record on the wrong seafarer).
4. **Summarise (the AI, WHAT only)** — `intelai.js` builds the prompt; `aiSummarize()` calls the
   engine. Output is 5 decision sections: **Summary / What happened / Impact / Pattern / Recommended
   action**, plain-text bullets, anti-hallucination ("never invent numbers/dates").
5. **File** — `crew_intel` row: agency_id, reporter, summary, source, confidence, status,
   `contract_no` (snapshot of the crew's contract count AT FILING — so the card shows issues-per-
   contract over time), ts, created_by='ai'.
6. **Hourly backstop** — Worker `scheduled()` handler (cron `0 * * * *` in wrangler.toml) sweeps any
   email left `new` (engine briefly down). On-arrival + hourly both call `processIntelInbox`, which
   atomically CLAIMS each row (`UPDATE … status='processing' WHERE status='new'`) so they can't
   double-file.

### B. AI engine — preference ladder (no secret handled by the agent)
`pickEngine(env)`: **(1) Claude** if `ANTHROPIC_API_KEY` secret is set in Cloudflare (best detail,
model `claude-haiku-4-5`, via `fetch` to api.anthropic.com) → **(2) Workers AI** `[ai] binding="AI"`,
model `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (no key/setup) → **(3) none** = leave `new` for manual
(nothing lost). **Currently running on Workers AI** (verified live: `/api/intel/run` returns
`engine:"workersai"`). Miguel can later paste an Anthropic key into Cloudflare himself and the worker
auto-upgrades — NO redeploy. The agent never sees or moves the key (CLAUDE.md §7).

### C. UI — the crew card "Notes & field intel" modal (note icon on each crew card)
Each entry is its own contained `.intelcard`: **date only** ("Jun 24, 2026" — time removed at Miguel's
request), reporter, source chip, green **"Contract N"** chip, edited marker, and **Edit** (inline
textarea → `/api/intel/edit`) + **Delete** (`/api/intel/resolve {discard:true}`). Header shows entry
count. Empty state points to crew-reports@cims.work. Manual notes (`crew_note_log`) live below intel.
**Lazy backfill:** `apiIntelCrew` stamps any legacy NULL `contract_no` with the crew's current count on
read (all existing notes are recent, so now == time-of-logging; new notes snapshot at filing so no drift).

### D. New files + tests
- `src/intelai.js` — pure: `pickEngine`, `intelSystemPrompt`, `intelUserPrompt`, `parseIntelResponse`,
  model constants. `src/crewmatch.js` — pure matcher (session-4/5). Worker adds: `aiSummarize`,
  `fromDisplayName`, `processIntelEmail`, `processIntelInbox`, intel API routes (`/api/intel/
  inbox|file|crew|review|resolve|edit|run`).
- Tests: `crewmatch.test.js` (8) + `intelai.test.js` (7). **Total 103 → 138, all green.** Pure helpers
  only (engine calls + DB are integration, verified live instead).
- Schema: `email_inbox` (raw mail + status), `crew_intel` (filed/pending/discarded; cols added via
  `ensureIntel` ALTERs incl. `contract_no`, `edited_at`). Self-seeded, no migration.

### E. Verified live (commits 0a2d10b, f550877, 41adad3, c485477, 923024b)
Injected a realistic test report about Jonathan Alonzo (SC-0041465) → AI filed a high-confidence card
with all 5 sections, correctly pulled "$240 / June 18 / 3 incidents / 2nd-contract repeat / recommended
PM conversation", reporter "Rolando Cruz" from the From header. Test card discarded after (record clean).

### F. OPEN / NEXT (session-5)
- **#17 bonus baselines — STILL the core money unblock, blocked on Rita.** Unchanged from session 4.
- Optional upgrade: add `ANTHROPIC_API_KEY` in Cloudflare for Claude-grade extraction (Miguel's call;
  Workers AI is the current default and is good enough to start).
- The one legacy intel note (Jhocson Jeyuson SC-0038328) now shows "Contract 3" via the lazy backfill.
- Carryover (unchanged): R2 statement storage; DG3 IT email allowlist for Resend; §8 nightly refresh.

### G. DAYS-WORKED / BILLING FIXES (session 5, cont.)
1. **`/api/daysworked` 500 (silent since the keyman_contract3 rename).** `keymanRows` aliased a column
   to `on` — a reserved SQL keyword — so D1 rejected the query; the route returned the promise WITHOUT
   `await`, so the rejection escaped the fetch handler's try/catch and Cloudflare served its own error
   page (the days-worked export AND the billing tab were both dead). Fix: select raw columns + map in
   JS; wrap the endpoint to return JSON on error. Guard test `test/sqlsafety.test.js` forbids aliasing
   a column to `on`. (commits b7acef8, cbaf50f)
2. **"Days worked (Excel)" was billing LIFETIME, not the month.** It hit `/api/daysworked` with no
   window → all-time sea-days (43,023). Miguel needs *days worked THIS MONTH* per crew active in Keyman
   now, so accounting can bill the customer. Root insight (same lesson as the score-queue fix):
   `keyman_contract3` is the historical Contract Counter (closed past contracts only) — current onboard
   contracts with this-month dates live in the LIVE BOARD roster (registry status + schedule/contract_
   edit/keyman dates resolved in `apiRotation`). So billing must come from there, NOT keyman_contract3.
   - Refactored `apiRotation` → `rotationSections(env)` (returns the resolved board object) so billing
     reuses the EXACT same per-crew sign-on/off dates the board shows. `apiRotation` now just wraps it.
   - New `apiBillingMonth(env)` + route `/api/billing/month`: for each board-roster crew, days =
     `periodDays(signOn, off, monthStart, today)` where off = today if On board, else their sign-off;
     only days>0 this month appear. Returns perCrew {name, sc, ship, client, status, signOn, days} +
     perVessel {ship, client, crew, days} + totals. Customer = `clientLabel(section.brand)`.
   - Button renamed "Days worked (Excel)" → **"Bill this month (Excel)"**; `exportDaysExcel` now hits
     `/api/billing/month` and writes a billing CSV (BY CREW for customer billing + BY VESSEL/CUSTOMER),
     filename `days-worked_YYYY-MM.csv`. It is **month-to-date** (1st → today); re-run at month-end for
     the full month. "Active this month" includes crew who signed off mid-month (billable days), so the
     crew count runs a bit above the currently-onboard count. (commits 8c388be, 34d7f73, 2157f55)
   - Verified live June 2026: 58 crew, 1,244 sea-days, 47 vessels; Karl Bernard = 23 days on Adventure
     (Royal Caribbean), matching his board card. New test in `test/daysworked.test.js`. **Total 141.**
   - NOTE: `/api/daysworked` (historical, arbitrary from/to) still powers the Billing tab — left as is;
     only its perCrew now also carries vessel/client/status (harmless enrichment).

### H. WHERE THINGS LIVE (so they're findable — Miguel asked)
- **Email field-intel** (crew-reports@cims.work) → **Crew tab** → a crew card's **note icon** → "Notes
  & field intel" panel. Low-confidence/unmatched → **"Review intel"** button atop the Crew tab.
- **"Inputs →"** on Contracts & Bonus → the *contributor scoring* page (bonus questions). This is the
  MONEY/bonus path and is deliberately SEPARATE from the email field-intel.

---

## SESSION UPDATE — 2026-06-24 (session 6: full-contract rank, status auto-tag, Keyman import, audit)

This session added several subsystems and ended with a full platform audit. Key things to remember:

### A. FULL-CONTRACT COUNTING drives rank now (`src/contracts.js`, tested)
- A CONTRACT can span multiple ships (transfers). Ship-legs **≤ 21 days apart = one contract**; a bigger
  gap is a holiday = the contract ended. A contract counts as FULL only if its total duration reaches the
  line minimum: **Azamara ≥ 5 months, Royal/Celebrity/NCL ≥ 6 months** (`GAP_DAYS`, `MIN_AZ`, `MIN_RCL`).
- `fullContracts(legs)` (FULL count) feeds `psRank` (Jr=1st, PS=2nd-4th, Sr=5th+) AND the displayed
  "Contracts" number, via the server helper `fullContractMap(env)`/`legShape`. The raw Keyman leg count
  used to over-state seniority (e.g. SC-0038311: 9 legs → 4 full → PS, was Sr PS). Fleet Sr PS 10 → 4.

### B. STATUS AUTO-TAGGING from the SCHEDULE, not the Contract Counter (`deriveStatus` in contracts.js)
- The Contract Counter (`keyman_contract3`) is HISTORICAL (latest contracts mostly 2024-25; ~0 span
  today). Current status must come from the **schedule** (`SHIP_HISTORY`, has 2026+ future dates).
- `scheduleBySc()` + `crewStatus(base, ov, schedLegs, today)`: manual **Retired** tag wins → else manual
  `crew_override.status` wins → else `deriveStatus`. Derivation: on a ship now → On board; signed off
  within 6 months → On Vacation; **inactive > 6 months → auto Retired** (`RETIRE_MONTHS`); only-future /
  none → registry value. Earmarked only promotes to On board with a current assignment.
- Wired read-time into apiCrew, apiRotation (`rotationSections`), AND apiDashboard so all three agree.
  New `crew_override.retired` column + a Retired checkbox + an "Auto (from schedule)" status option in
  the edit modal. Live: On board 49 / On Vacation 22 / Retired 26 / Inactive 1.

### C. LIVE KEYMAN IMPORT (`src/keymanimport.js`, tested) — Data tab → "Keyman contracts"
- Parses the **Contract Counter** sheet (wide: cols 0-5 = Company/Ship/Status/km/Last/First, then
  [sign-on, proj-off, ttl] blocks from col 6). Bridges crew to SC **by name** (km is a cruise-line id,
  not our SC). `apiKeymanImport` dry-run shows matched/unmatched/contracts; apply refreshes
  keyman_contract3 for MATCHED crew only (delete+insert), pins KEYMAN_VERSION so `ensureKeyman`'s bundled
  self-seed won't overwrite it. Live: 119 crew in file → 69 matched, 34 unmatched (candidates/former).
- LIMITATION: the Contract Counter has ONE current ship per crew (no per-contract ship), so imported
  rows use that ship for all the crew's contracts. Per-contract ships / disembark ports live in the
  3 SCHEDULE tabs (CELEBRITY / RCCL / AZAMARA), in free-form cells like `MURILLO_OFF_23_PORT CANAVERAL`.

### D. CARD PORTS + iPad TOGGLE FIX
- Sign-off port falls back to the ship's **homeport** (round-trip), same as embark — Royal/Celebrity now
  show the port; **Azamara stays TBA** (roams, no homeport) for Rita to type in the Edit-contract
  **Disembark city** field. FIXED a real bug: the card pipeline carried `embark` but dropped
  `disembark`, so Rita's typed port never showed — added `disembark` to the byShip card. Missing port
  renders as amber **TBA**.
- TOGGLES: native `<input type=checkbox>` styled as pills double-fired per tap (on iPad AND a real
  click landed back where it started). FIX pattern (use everywhere): wrapper `<span onclick="tgFlip(id)">`
  + the input is `pointer-events:none` → one tap = exactly one flip. `tgFlip` is the global helper.

### E. FULL CODE AUDIT (this session) — findings + what was fixed
Ran a deep audit (self + verification subagent). **Confirmed solid:** the money gate (`apiBonusCommit`
checks `isMoneyUser` before any write; `baseline_count` stripped/gated for non-money users — the only
two baseline writers); the auth router (session gate above all sensitive routes; feedback form/submit are
signed-token authed); SQL safety (all values bound; the reserved-word `on` alias is avoided/quoted);
keyman seeding (PK + INSERT OR REPLACE + version pin, race-proof); intel claim/race (atomic
UPDATE...WHERE status='new'); feedback single-use.
**FIXED this session:**
1. **[HIGH] Async route rejections escaped the fetch try/catch.** Routes do `return apiX()` WITHOUT
   await, so a rejection bypassed the catch and returned Cloudflare's raw 500 (this bit /api/daysworked).
   Fix: the whole route block is now wrapped in `return await (async () => { ... })();` so every handler's
   rejection is caught and returned as clean `{error:"server_error"}` 500.
2. **[MED] Dashboard donut counted RAW status while the tiles used DERIVED status.** Now both compute from
   the same `crewStatus()`-derived active set (exclude Retired/Inactive), so the donut and tiles agree.
3. **[MED] Drag-to-reassign wrote vessel to the BASE crew row**, where a later AdvancedQuery import's
   COALESCE would clobber it. Now writes to `crew_override` (which always wins, untouched by imports);
   pool clears both override + base.
**STILL OPEN (lower priority, not yet fixed):** no DB `UNIQUE(crew_id,span_start,span_end)` on
`bonus_outcome` (double-commit is TOCTOU; mitigated by client button-disable + 2-user tool — would need
a migration); client `computeBonusC` doesn't clamp sliders to per-field max (display-only, server
authoritative); `decodeEmailBody` uses `\n--` heuristic instead of the real MIME boundary (worst case =
weaker auto-match → human review). **154 tests green.**

---

## SESSION 2026-06-26 — travel/dashboard/keyman overhaul + data-integrity fixes

### External sources / links (KEEP — reusable)
- **Azamara itinerary (intranet):** https://itinerary.azamara.com/intra/intranet/ — filter by Ship + From/To
  date → daily Location (port), ETA/ETD. THE source for Azamara embark/disembark ports (Azamara ships roam,
  no homeport). Caveat: our schedule sign-on/off dates are 1st-of-month APPROXIMATIONS, so a direct date
  lookup often lands on a sea day — the real changeover date+port is in the Excel AZAMARA SCHEDULE cells
  ("ON: NAME MM/DD PORT"). Use the Excel cell for the real date, the site to confirm the port.
- Source workbooks Rita uploads: AdvancedQuery.xls (registry, SC-ids), CIMS Keyman workbook
  (Contract Counter + 3 SCHEDULE tabs), Travel Expenses xlsx (SUMMARY has the budget at C55 = $15k/mo).

### Shipped this session (all via GitHub web uploader → main → Cloudflare; verified live; node --test green)
- **Travel tab → decision page:** budget pacing vs the real $180k/yr budget (source SUMMARY!C55 $15k/mo),
  per-crew search→full history, leaderboard, anomalies, **STLY** (Same-Time-Last-Year) framing, monthly
  bars w/ budget line. Importer verified against the 2026 file (parses; per-crew detail is authoritative;
  source had a Feb/May ship-block-vs-crew-detail mismatch ~$2.3k — Rita to reconcile).
- **Dashboard:** "Travel budget" card (29% of $180k annual used + crew spend + category bars; shoreside
  shown separately/unbudgeted; whole-dollar). Surfaced **Retired** count (26) on At-a-glance + donut shows
  active set (71 = on board + on vacation ≤6mo). Removed sea-days/contracts/bonus-committed tiles.
- **Compliance:** made active-only + derived-status + override-aware EVERYWHERE (Crew tab tiles, dedicated
  tab). **Hid the standalone Compliance tab**; per-crew docs now on the crew card via a **red-cross (✚) icon**
  → modal (all 5 docs, expiry, days left); fleet list + CSV moved to Crew tab "Docs CSV". (Dashboard
  compliance zone STILL counts all crew + its hint says "open the Compliance tab" — TODO: align to active-only.)
- **New endpoint** `GET /api/rotation/upcoming?days=N` — debarkations from the live SCHEDULE (the right
  source; the Contract Counter is closed contracts only). "Maria" / any assistant should use THIS for
  "who debarks in N days", NOT active_off (historical).
- **Keyman board redesign:** rank abbrev by name (Jr PS/PS/Sr PS); status line = status + duration
  ("On board · 7 mos 21 days"); removed SERVED word + duration pill. **Fixed inflated also-served spans**
  (were min-on/max-off merged across schedule+ContractCounter → 20–30mo; now one entry per real contract
  from the schedule, 0-day artifacts dropped). **Self-heal placement:** if a crew's registry vessel has no
  contract leg, place them on their actual schedule ship (current else last) — fixed Purnama (Apex→Xcel)
  & Cyrus (Allure→Utopia); prevents recurrence. **Phantom-ship guard:** only real vessels (validShipKeys)
  anchor a section — killed the phantom "Azamara"/"Unassigned" sections.
- **Azamara ports** added to schedule (Domingo Port Louis→Berlin, Medidas Barcelona, Jugao
  Barcelona→Hong Kong, Santos Miami→Edinburgh); board now shows schedule embark/disembark before TBA.

### Decisions made
- Money/auth governance HONORED: nothing on the money path auto-merged. The money/auth hardening lives on
  branch **`fix/money-auth-hardening`** (baseline-pending commit block; POST-only /auth/dev; eval-gate
  NaN-safety; UNIQUE(crew_id,span_start,span_end) migration 0004) — **awaiting Miguel's explicit go**.
- Auth: team uses the **magic link** (emails already in ALLOWLIST_SEED); access-key login kept POST-only.
- "Active" crew = on board + on-vacation **≤6 months** since sign-off; >6mo auto-Retired (RETIRE_MONTHS=6).
- Budget % shows against the **annual** $180k (not the YTD slice, which was misleading). Crew-only
  (shoreside is unbudgeted, tracked separately).

### OPEN ITEMS / GOALS
- **#17 BASELINES = THE money unblock (still open).** No real bonus payout until per-crew baselines are
  reconciled with Rita vs the golden Contract Counter. A reconciliation worksheet was generated for her
  (CIMS_baseline_reconciliation.xlsx) — derive from Keyman contract dates; ~31 rows need her judgment
  (trailing-short = likely current contract; mid-history shorts; name-bridge confidence). The fix-1 branch
  makes commit HARD-BLOCK on a NULL baseline (fail-safe) once merged.
- For Rita to correct in the source files: the two 14-month fused legs (Resposo/Reflection, Cucio/Journey);
  Gibas seq-1 ship = "Azamara" (should be a real vessel); Feb/May travel ship-total vs crew-detail mismatch.
- TODO: align the Dashboard compliance zone to active-only + fix its "open the Compliance tab" hint.
