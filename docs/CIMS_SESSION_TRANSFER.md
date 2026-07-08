# CIMS Keyman / Relief Board — Full Knowledge Transfer
### For the next Cowork session. Read this top to bottom before touching anything.
### Author: prior Cowork session. Date: 2026-07-08. Operator: Miguel San Martín (GM, DG3 Cruise Industry Managed Services / CIMS).

---

## 0. TL;DR — what you are inheriting

You are maintaining a **Cloudflare Worker web app** called **`cims-hr-console`** (the "CIMS console"), a crew-rotation / relief-planning tool used by Rita and the CIMS team. The app is a single Cloudflare Worker that serves an HTML/JS single-page app and a set of JSON APIs, backed by a **Cloudflare D1 (SQLite) database**.

The source lives in a **GitHub repo** you edit through the **GitHub MCP connector**. You verify data through the **Cloudflare D1 MCP**. You make the trickiest edits (to the giant `worker.js`) by hand in the **GitHub web editor driven through the Claude‑in‑Chrome MCP**, because that one file is too big to push through the connector. You test every change in a **Linux sandbox (bash MCP)** by cloning the repo and running `node --check`.

The last big block of work (this session) rebuilt the **Keyman board's relief experience**: the crew card redesign, an inline reliever modal, itinerary-derived cities, and turnaround-day port dropdowns. All of it is deployed and green.

There is a canonical product doc already in the repo: **`docs/RELIEF_KEYMAN_CANONICAL.md`** — read that too; it is the source of truth for the product logic. THIS file is the *operational* transfer (how to connect, how to work, how Chrome was driven, decisions, gotchas).

---

## 1. Who Miguel is and how to work with him

- **Miguel San Martín** — General Manager of DG3's Cruise Industry Managed Services (CIMS). NOT "Director of Operations". DG3 = Diversified Global Graphics Group (NOT "DigiTree").
- He is a **non-developer** but extremely systems-minded. He wants things **done for him**, or with dead-simple guidance. He communicates in fast, abbreviated, voice-to-text style ("u shodul", "embar", "reflief") — **interpret and execute; do not ask him to re-clarify spelling**.
- He explicitly asked me to act as a **rigorous, honest mentor**: challenge weak ideas, name blind spots, don't just agree, explain *why*, propose better alternatives. Keep that posture.
- **Be concise and direct.** Minimal formatting. He dislikes verbosity.
- **Decision-surfacing**: when there is a genuine product fork (e.g. "should a typed city override the itinerary?"), ask him ONE crisp multiple-choice question with a recommendation, then execute. Don't guess on real forks; don't over-ask on trivia.
- **Session-close protocol**: when a decision was made, a figure locked, or key data changed, prompt him to say "update the canonical" and then update the canonical doc immediately.
- **Email conventions** (if you draft email for him): Outlook plain-text for copy-paste; internal emails use WHY / WHAT / WHEN / WHO / HOW; external partner emails are data-driven, point at problems without prescribing/blaming; open emails to Eric Genova (SVP Professional Services, DG3) with "Hola señor Eric". EBITDA growth figure is **+303%** (never 222%). La Despensa is fully operational (same-day delivery LIVE) — never describe as future.
- He works across **three firewalled domains**: CIMS (this app), La Despensa (his Chilean supermarket), and Personal/Travel. This app is CIMS only.

---

## 2. The connections — how you reach everything

You have several MCP tool families. Their tool names are prefixed with an opaque server id; the ones that matter:

### 2.1 GitHub connector (read + write the repo)
- Tools (names as seen this session): `mcp__16b8e467-dfb8-4eae-b780-ed9c4558e334__*`
  - `...__get_file_contents` — read a file/dir.
  - `...__create_or_update_file` — write ONE file. Requires `owner`, `repo`, `path`, `content` (full new file body), `message`, `branch`, and `sha` (blob SHA of the existing file when updating).
  - `...__push_files`, `...__create_pull_request`, `...__list_pull_requests`, etc.
- Repo: **owner `despensasupermercados`, repo `cims-hr-console`, branch `main`.**
- To get a blob SHA before updating a file: from a local clone run `git rev-parse main:<path>` (see §2.4). The connector's update response also returns the new blob `sha` you'll need for the *next* update to the same file.
- **CRITICAL LIMIT**: `create_or_update_file` works for normal-sized files (modules up to ~30–35 KB verified fine). It does **NOT** work for `src/worker.js` (~332 KB) — pushing the full body fails / has failed catastrophically before (a subagent once overwrote it with a 28-byte stub). See §4 for how worker.js is edited instead.

Example — bumping the deploy trigger (this is the pattern for every deploy):
```
create_or_update_file(
  owner="despensasupermercados", repo="cims-hr-console", path=".deploy-trigger",
  branch="main", sha="<current blob sha of .deploy-trigger>",
  message="deploy: <what changed>",
  content="deploy trigger 2026-07-08X — <detailed note of what/why>\n")
```

### 2.2 Cloudflare D1 MCP (query the live database)
- Tool: `mcp__30b8de00-bbe7-463e-8d90-f893a8a56225__d1_database_query`
  - Args: `database_id`, `sql`, optional `params` (array for bound `?` params).
- **Prod D1 database_id: `f0ac8b6a-deac-4214-8f42-e22b202d7d7d`.**
- Other Cloudflare tools in the same family: `d1_databases_list`, `workers_list`, `workers_get_worker_code`, `r2_buckets_list`, `kv_namespaces_list`, `search_cloudflare_documentation`, etc.
- This is READ + WRITE against **production** — be careful. This session only ran SELECTs. Do not mutate prod data without Miguel's explicit ok.

Example — confirming a city mismatch (an actual query run this session):
```
d1_database_query(
  database_id="f0ac8b6a-deac-4214-8f42-e22b202d7d7d",
  sql="SELECT berth_date, port_name, is_turnaround, is_sea
       FROM vessel_port_day
       WHERE ship_short='Adventure' AND berth_date BETWEEN '2026-03-24' AND '2026-04-01'
       ORDER BY berth_date;")
```
Returned (abridged): 2026-03-28 = "ORLANDO (PORT CANAVERAL), FLORIDA", is_turnaround=1. That single query is how the "card shows Orlando, modal showed Miami" bug was root-caused (see §7 / §9).

### 2.3 Claude‑in‑Chrome MCP (drive the browser)
- Tools: `mcp__claude-in-chrome__*` — key ones:
  - `tabs_context_mcp` (get current tabs; `createIfEmpty:true` makes a tab if none), `tabs_create_mcp`, `navigate`, `read_page`, `computer` (mouse/keyboard/screenshot), `browser_batch` (run several actions in one call — USE THIS, it is much faster), `find`, `read_console_messages`.
- Used to operate the **GitHub web editor** to edit `worker.js`. See §5 for the full playbook, coordinates, and gotchas.
- The browser is on Miguel's real machine. cims.work itself is **login-gated** — you cannot log in and cannot visually verify the running app. You CAN operate github.com (he's logged in there).

### 2.4 Workspace bash sandbox (Linux, isolated)
- Tool: `mcp__workspace__bash` — Ubuntu-ish, has `git`, `node`, `python3`. Each call is independent (no cwd carryover) — use absolute paths, `cd /tmp/... && ...`.
- This is where you **clone the repo, dry-run patches, and validate** before/after editing.
- Clone (read-only, public over https — no push creds in the sandbox):
```
cd /tmp && rm -rf v && git clone --depth 1 https://github.com/despensasupermercados/cims-hr-console.git v && cd v
node --check src/worker.js && echo OK
git rev-parse main:.deploy-trigger      # get a blob SHA for the connector
```
- The sandbox has NO write access back to GitHub. It is purely for validation and for composing/patching file bodies you then push via the connector (for modules) or transcribe into the web editor (for worker.js).

### 2.5 Other connectors available (not central here)
Gmail/Outlook-style mail, Google Calendar, Box, Airtable, iMessage, Shopify, a "brain" skill, etc. Not used for the console work. The mcp‑registry (`mcp__mcp-registry__search_mcp_registry` / `suggest_connectors`) can find more.

---

## 3. The application — architecture you must understand

### 3.1 Shape
- One Cloudflare Worker (`cims-hr-console`) whose `src/worker.js` both:
  1. serves the SPA HTML/JS as a giant template literal called `APP_HTML`, and
  2. routes JSON APIs and delegates to imported modules.
- Front-end is **vanilla JS inside `APP_HTML`** (no framework). All the client functions (`renderRotation`, `rotShip`, `rotCard`, `editContractModal`, `saveContract`, etc.) are defined as plain functions inside that template's `<script>`.
- Modules under `src/` (pushable via connector): `relief_ui.js`, `relief_api.js`, `relief_board.js`, `city_resolver.js`, `relief_deploy.js`, `ship_leg_source.js`, `bonus.js`, `auth.js`, `crewmatch.js`, `keyman_data.js`, `travel*.js`, `sbm.js`, `auto_send.js`, and many more.

### 3.2 The TWO data layers (do not confuse them)
This is the single most important thing to internalize.

**A) Keyman / rotation board** (the main `/keyman` tab):
- Built by `rotationSections(env)` in `worker.js`.
- Reads `ship_leg` (the current leg per ship: `is_current=1 AND ours=1`) overlaid with `contract_edit` (Rita's manual edits).
- P2 enhancement: also loads `vessel_port_day` + `groupPortDays`, and computes `on_city/on_conf/off_city/off_conf` per crew via `resolveCity` (itinerary-derived city + confidence).
- Renders client-side: `renderRotation()` → `rotShip(sec)` per ship → `rotCard(x)` per crew.

**B) Relief board** (`/relief`, embedded as an overlay iframe in the Keyman tab):
- Data: `relief_api.js` `reliefBoardData`; assembly `relief_board.js` `buildReliefBoard`; UI `relief_ui.js` `RELIEF_HTML`.
- Reads `ship_leg` (printers) + `assignment`/`contract`/`crew` (relievers) + `vessel_port_day`.
- Azamara sign-off is PROJECTED (see §3.4).

### 3.3 Key D1 tables (verify with `d1_database_query`)
- `ship_leg` — current leg per ship: `brand, ship_short, embark, disembark, on_date, off_date, on_conf, off_conf, is_current, ours, crew_id`. (Base truth for the Keyman board.)
- `contract_edit` — Rita's overlay: `sc, seq, ship, embark, disembark, sign_on, sign_off, eccr, air, hotel, on_conf, off_conf`. Small (was 3 rows this session). NO override columns.
- `vessel_port_day` — the itinerary: `brand, ship_short, berth_date, stop_seq, port_name, is_sea, is_turnaround, source, source_asof`. This is where cities are DERIVED from.
- `assignment` — reliever assignments: `id, role('printer'|'reliever'), contract_id, vessel_id, vessel_name, sign_on, planned_sign_off, actual_sign_off, on_port_seed, off_port_seed, override_on_city, override_off_city, eccr, air, hotel, on_date_conf, off_date_conf, instructions_sent_at, signoff_link_sent_at, review_invite_sent_at`.
- `contract`, `crew` (crew has `first_name,last_name,redacted`), `vessel`.
- `leg_flags` — printer overlay keyed by `vessel_key`: `eccr, air, hotel, on_date_conf, off_date_conf, override_off_date, crew_name`.
- `relief_comment` — created this session: `id, assignment_id, vessel_key, body, created_at`.
- `relief_window_config` — `key='default'` → `critical_days, due_days`.

### 3.4 City resolver — `src/city_resolver.js`
`resolveCity({date, seed, override, portDays, hasDeployment})` precedence:
**override > TBA > derived > provisional > seed.**
- `derived` = exact port on that `berth_date` in `vessel_port_day` (confidence green `#1f7a3d`).
- `provisional` = nearest port when no exact match (amber `#a8791a`).
- `seed` = the stored free-text embark/disembark (red `#b0342f`, lowest trust).
- `override` blue `#1f5fa8`; `TBA` grey `#888780`.
- `groupPortDays(rows)` keys by `brand|ship_short`.
Azamara projection lives in `reliefBoardData`: next real turnaround ≥ sign-on + `AZAMARA_MONTHS(=5)`, floored at today, `leg_flags.override_off_date` wins. `MIN_COVERAGE_MONTHS=12`.

---

## 4. THE HARD RULES (break these and you can break prod)

1. **worker.js is edited ONLY by surgical single-line find/replace in the GitHub web editor.** Never push a full worker.js body through the connector. It is ~332 KB / ~3850 lines and the connector cannot handle it; a bad full-file push has stubbed it to 28 bytes before.
2. **Every worker.js change is dry-run on a clone first.** Write a Python patch that asserts each `find` occurs exactly once (`assert s.count(old)==1`), apply it, `node --check`, and `cp` the result to a target file (e.g. `/tmp/worker_targetN.js`). Only then edit in the browser. After committing, **re-clone and `diff` the deployed file against your target — it MUST be byte-identical.** This caught/prevented every mistake this session.
3. **Modules (`relief_*.js`, `city_resolver.js`, `relief_board.js`) may be pushed full-file via the connector**, but still re-clone + `node --check` + `diff` after.
4. **Deploys are gated by GitHub Actions `tests` (npm test).** A commit does not deploy by itself — deploy is triggered by bumping the `.deploy-trigger` file on `main`. Red tests block deploy. Flow: commit the code, then `create_or_update_file(".deploy-trigger", ...)`, then confirm the two runs (your code commit + the deploy-trigger commit) go green in Actions.
5. **cims.work is login-gated.** You cannot see the live app. Verify via D1 queries + code review + byte-diff, and ask Miguel to eyeball.
6. **Never** authenticate on his behalf, enter credentials, or move money.
7. **Function-override trick** (safe, used all session): to replace a client function in `APP_HTML` without a multi-line edit, INSERT a new `function foo(){...}` (single line) right before the stable anchor `function rotShip(sec){`. Duplicate top-level function declarations are legal and the LAST wins; the old one becomes dead code. Used for `rotCard`, `reliefSlot`, `reliefBanner`, `openRelief`, `portOptions`, `pickPort`, and the `window.addEventListener('message',...)` listener.
8. **Avoid quote-escaping in the web editor.** Inline handlers use element/arg-free forms that read `data-*` attributes: `onclick="rcClick(this)"`, `ondragstart="rcDrag(event,this)"`, `onclick="openRelief(this)"`, `onchange="pickPort(this)"` — never `onclick="f('id')"` (the nested quotes are painful to type and error-prone).
9. **Unicode when typing into the editor**: `·` (U+00B7) and `—` (U+2014) type fine via the chrome `type` action (pass the actual character). Keep everything else ASCII. Make your dry-run target use the SAME literal characters you'll type, or the byte-diff will fail spuriously.

---

## 5. THE CHROME PLAYBOOK (how worker.js gets edited by hand)

This is the fiddly part. Read carefully; it's the workflow that made 15+ worker.js edits land byte-perfect this session.

### 5.1 Tabs
- Start with `tabs_context_mcp({createIfEmpty:true})` to get a tab id. Tabs die between long gaps — if a tool call says "Tab N no longer exists", call `tabs_context_mcp` again to get the new id.
- Do everything through `browser_batch` (array of actions) — it runs several steps in one round-trip. Each action targets a `tabId`.

### 5.2 Opening the file editor
- `navigate` to `https://github.com/despensasupermercados/cims-hr-console/edit/main/src/worker.js`, `wait` ~4–5s.
- The GitHub editor is a CodeMirror surface. It's a **browser (tier "read")** for screenshots but you interact via the claude‑in‑chrome `computer` tool (click/type/key) which works on github.com.
- **Opening find/replace**: click into the code area first (e.g. `left_click [700,450]`), then press `cmd+f`. Frequently the FIRST `cmd+f` doesn't open the panel or toggles it shut — take a screenshot; if the Find/Replace panel isn't shown, click into the code and press `cmd+f` again. The panel has: a **Find** field (top), a **Replace** field (below it), and buttons **Next / Previous / All / Replace / Replace All** and an **✕** to close.

### 5.3 Field coordinates (APPROXIMATE — they shift with window size!)
The window was resized mid-session; coordinates changed. ALWAYS screenshot and confirm before trusting a coordinate. Two layouts seen this session:
- Narrow window: Find ≈ `[414,233]`, Replace field ≈ `[414,268]`, Replace All ≈ `[601,268]`, close ✕ ≈ `[1301,182]` or `[1343,224]`.
- Wider window (later): Find ≈ `[442,248]`, Replace field ≈ `[442,286]`, Replace All ≈ `[641,286]`, close ✕ ≈ `[1346,240]`, Commit-changes button ≈ `[1281,138]`.
Screenshot first; adjust.

### 5.4 The find/replace ritual (per edit)
1. Click the **Find** field. If it may contain prior text: `key cmd+a` then `type` the FIND string. (First edit after opening: field is empty+focused, just `type`.)
2. Click the **Replace** field, `key cmd+a`, `type` the REPLACE string.
3. Click **Replace All**.
4. `screenshot` and confirm the Commit button turned green (a change happened) and the file still looks intact (imports at top, not one giant line — a wipe would show a 1-line file).

Keep FIND strings **short and unique** where possible (e.g. `function rotShip(sec){`) and put the long content in REPLACE — a short unique FIND is the safe pattern. When you must FIND a long line, that's fine but the byte-diff is your safety net.

### 5.5 Committing
- Close the find panel (click ✕), click **Commit changes…** (top-right green). A dialog appears with a Commit message field (placeholder "Copilot is thinking…"), "Commit directly to the main branch" (default, keep it), and **Commit changes** button (~`[849,662]` in the wide layout, `[821,679]` narrow).
- Click the message field, type a message, click **Commit changes**, `wait` ~2s.

### 5.6 Verify (ALWAYS)
```
cd /tmp && rm -rf vX && sleep 3 && git clone --depth 1 https://github.com/despensasupermercados/cims-hr-console.git vX && cd vX
node --check src/worker.js && echo SYNTAX_OK
diff src/worker.js /tmp/worker_targetN.js && echo BYTE_IDENTICAL || echo DIFF
```
If not identical, the edit was wrong — inspect the diff, fix in the editor, re-verify. Only after BYTE_IDENTICAL do you bump `.deploy-trigger`.

### 5.7 Gotchas learned the hard way
- **Two near-misses**: a find/replace click landed in the code, `cmd+a` selected the whole file, and typing began to wipe it. Caught before commit via screenshot; discarded via "Cancel changes". Lesson: screenshot after each edit; never commit blind.
- **Double `cmd+f` toggles the panel closed** — check the screenshot.
- **Navigating to /actions sometimes lands on the file blob** (history). Just `navigate` to the actions URL again.
- The `computer` single-tool call wants the action fields at top level; `browser_batch` wants `{name:"computer", input:{action:...}}`. Use `browser_batch`.

### 5.8 Checking the deploy
- `navigate` to `https://github.com/despensasupermercados/cims-hr-console/actions`, screenshot. You want the two most-recent runs (your code commit + the `.deploy-trigger` commit, both "tests #NNN") to show green ✓. `wait` ~8–10s after triggering (max single `wait` is 10s).

---

## 6. WORKFLOW RECIPES

### 6.1 Change a MODULE (e.g. relief_ui.js / relief_api.js)
1. Clone, patch in the sandbox with Python (assert counts), `node --check`.
2. `cat` the file, get its blob SHA (`git rev-parse main:src/relief_ui.js`).
3. `create_or_update_file(path="src/relief_ui.js", content=<full body>, sha=<blob sha>, ...)`.
4. Re-clone, `node --check`, `diff` vs your sandbox target → identical.
5. Bump `.deploy-trigger`. Confirm Actions green.

### 6.2 Change worker.js
1. Clone, write a Python patch (each `rep(old,new,tag)` asserts `count==1`), `node --check`, save target `/tmp/worker_targetN.js`. For the inner browser `<script>`, you can extract the template body and `node --check` that too.
2. Open the web editor (Chrome), do each find/replace, screenshot after each.
3. Commit to main. Re-clone, `node --check`, `diff` vs target → BYTE_IDENTICAL.
4. Bump `.deploy-trigger`. Confirm Actions green.

### 6.3 Root-cause a data question
Query D1 directly. Example patterns used this session:
```
SELECT ... FROM ship_leg WHERE ship_short='Adventure';
SELECT ... FROM contract_edit WHERE sc='SC-0039963';
SELECT berth_date,port_name FROM vessel_port_day
  WHERE ship_short='Adventure' AND is_turnaround=1 AND is_sea=0 ORDER BY berth_date;
```

---

## 7. WHAT WE BUILT THIS SESSION (chronological, with the "why")

All of this is deployed on `main` and green. Product detail is in `docs/RELIEF_KEYMAN_CANONICAL.md`; this is the narrative.

1. **Relief board matched to the mockup (action layer).** `relief_ui.js` gained: Match handover, sign-off workflow rows (Mark-sent state), comments, plain date pickers with live city-derive, empty-slot urgency tint, clean-handover "· city · date" suffix. Fixed a latent backend bug: `saveReliefAssignment` rejected any `{id,...}` payload because `id` isn't whitelisted by `validateWrite` — destructure `id` out before validating. Added `relief_comment` table + `/api/relief/comment(s)` routes.
2. **Merged the relief board into the Keyman tab, one board.** After several drift corrections from Miguel, the final architecture is: the Keyman ship rows themselves show `[onboard card][reliever slot]` + a status banner (via client helpers `reliefSlot`/`reliefBanner` reading `window.RELIEF`). The separate `/relief` iframe section and the old thin "Relief ·" text line were removed.
3. **Inline reliever modal (no page nav).** Clicking a slot opens the real New-reliever modal as a full-screen overlay iframe to `/relief?open=<vessel_key>`; `relief_ui` embed mode hides the board chrome and auto-opens the modal; postMessages `reliefReady` (parent fades the iframe in — kills the flash) and `reliefClose{changed}` (parent removes overlay + `renderRotation()` if changed).
4. **Crew card redesign** (`rotCard` override): initials avatar (green when onboard), name + PS chip, status/tenure header, hairline-separated rotation block with labeled `on`/`off` rows (city left / date right, non-wrapping), green confirmed tag pills, "OFF in Nd" urgency chip. `.shipbody` grid switched `auto-fill,240px` → `auto-fit,300px` so the pair fills the row.
5. **City-source fix — DECISION: "itinerary wins".** The card showed Orlando (derived) while the Edit-contract modal showed stale "Miami" (raw `contract_edit.embark`). Root-caused via D1. Modal now shows the resolved cities.
6. **Embark/disembark → port dropdowns** seeded from the itinerary (`portOptions`), matched to the Rita-verified sign-on/off date; picking sets the date (`pickPort`).
7. **Fixed the dropdown collapse**: `portOptions` de-duplicated by port name; ships homeport at one port for many turnarounds, so all options merged into one. Removed the name-dedup → each turnaround shows as `PORT · date`.

---

## 8. DECISIONS LOCKED THIS SESSION

- **Itinerary wins** over hand-typed cities. Cities are derived from `vessel_port_day` on the verified date; free-text is only a fallback. Rita picks ports from real itinerary turnarounds, never free-types.
- Relief lives **inside the Keyman board**, one board, no duplication. Reliever modal opens **inline** (overlay), never a separate page.
- Workflow "Mark sent" buttons in the RELIEF modal only **record state** (timestamps), they do NOT email crew — real dispatch needs templates + Miguel's go. (The KEYMAN modal's SIGN-OFF WORKFLOW buttons DO email via `/api/instructions/request`, `/api/ack/request`, `/api/sbm/invite`.)
- Azamara contract length = 5 months; sign-off projected; Rita override wins.
- Vessel-deployment ingestion: Azamara "Day" column read as STRING; cell "1" or ending "/1" = turnaround.

---

## 9. WORKED EXAMPLE (the Adventure / Karl case — keep for reference)

- Crew: Karl Bernard Marc Lanuza, contract SC-0039963 #1, ship Adventure, on 2026-03-28, off 2026-11-29.
- `ship_leg`: embark = ORLANDO (PORT CANAVERAL), FLORIDA; disembark = FORT LAUDERDALE, FLORIDA. Correct.
- `vessel_port_day`: 2026-03-28 = ORLANDO (PORT CANAVERAL) (turnaround); 2026-11-29 = FORT LAUDERDALE (turnaround). ~120 turnarounds through 2028. **Adventure homeports at ONE port for long stretches** (Orlando through early Nov, then Fort Lauderdale Nov→Apr) — this is why de-duping the dropdown by name collapsed it to one option.
- `contract_edit` (the overlay): embark was a **stale "Miami"** — the bug Miguel spotted. Two other overlay rows also drifted (Independence overlay "Cape Liberty NJ" vs leg "Miami"; Anthem "Sydney"="Sydney"). These stale values remain in the DB but are now ignored for display.
- **OPEN**: clean those 3 rows, or ensure sign-off emails read the resolved city, so no stale city leaks into an email.

---

## 10. CURRENT STATE / LAST CHANGES (deploy log, main, 2026-07-08)

In order (each is a code commit + a `.deploy-trigger` bump, all green in Actions):
1. relief_api: fix id-reject on save + comment table/routes.
2. relief_ui: match mockup — Match handover, workflow, comments, date pickers, slot tint, handover suffix.
3. deploy: relief board matches the mockup (action layer).
4. worker.js: append relief board to Keyman tab (iframe) — later removed.
5. worker.js: two-card mockup layout inside each Keyman ship row (helpers + CSS; removed thin line + iframe).
6. worker.js + relief_ui: reliever modal opens inline as overlay (no nav).
7. worker.js + relief_ui: kill the add-reliever open flash (instant dim + iframe fade-in on reliefReady).
8. worker.js: keyman card UX — fill row (auto-fit), OFF-in-Nd chip, no-wrap dates.
9. worker.js + CSS: crew card redesign (avatar, rotation rows, tag pills).
10. worker.js: modal shows itinerary-derived cities (read-only) — matches card.
11. worker.js: embark/disembark port dropdowns (itinerary-seeded).
12. worker.js: dropdowns list turnaround days (removed name-dedup) + pick sets the date.
13. docs: `docs/RELIEF_KEYMAN_CANONICAL.md` written.
14. docs: THIS transfer file.

The latest deployed `worker.js` is byte-identical to the session's final target (regenerate a baseline by cloning + `node --check` if needed).

---

## 11. OPEN ITEMS / NEXT STEPS

- Clean the 3 stale `contract_edit` city values (or repoint sign-off emails to resolved city).
- Reliever gap worklist email to Rita/Joy — BUILT, Miguel said "not yet". Imminent sign-offs to attach relievers/flights for: Independence / Janet Magana; Reflection / Michael Angelo Resposo; Summit / Lyndon Noche; Jewel / Jonathan De Torres.
- NCL export decoder — blocked on an NCL sample file from Miguel.
- Enable Crew auto-timing (T-14/T-7 emails) — was being held; confirm before arming.
- An **unrelated open PR #27 ("Audit tab")** exists on the repo — NOT ours; leave it alone unless Miguel asks.
- Optional: fold this + the canonical into one doc if Miguel prefers.

---

## 12. LINKS & IDENTIFIERS (quick reference)

- Repo: `https://github.com/despensasupermercados/cims-hr-console` (owner `despensasupermercados`, branch `main`).
- Edit worker.js: `https://github.com/despensasupermercados/cims-hr-console/edit/main/src/worker.js`
- Actions (deploy status): `https://github.com/despensasupermercados/cims-hr-console/actions`
- Clone (sandbox, read-only): `https://github.com/despensasupermercados/cims-hr-console.git`
- Live app (login-gated, you can't authenticate): `cims.work`
- Prod D1 database_id: `f0ac8b6a-deac-4214-8f42-e22b202d7d7d`
- Worker name: `cims-hr-console`
- Deploy trigger file: `.deploy-trigger` (bump on main to deploy)
- Canonical product doc: `docs/RELIEF_KEYMAN_CANONICAL.md`
- Key app routes: `/keyman` (board), `/relief` (relief board; `?open=<brand|ship>` embed mode), `/api/rotation`, `/api/rotation/crew?id=`, `/api/rotation/contract` (POST), `/api/rotation/note` (POST), `/api/relief/board`, `/api/relief/crew`, `/api/relief/ports?ship=`, `/api/relief/save`, `/api/relief/leg-flags`, `/api/relief/comment(s)`, `/api/relief/deploy`, `/api/relief/vpd-load`, `/api/relief/vpd-status`, `/api/instructions/request`, `/api/ack/request`, `/api/sbm/invite`, `/api/autosend`.

---

## 13. GOTCHAS & LESSONS (read before your first edit)

- The single biggest risk is a bad `worker.js` edit. The dry-run-on-clone + byte-diff discipline is non-negotiable. It caught every issue this session.
- Don't trust web-editor coordinates from this doc blindly — screenshot first; the window size changes them.
- Keep FIND strings unique; if `assert count==1` fails in your dry-run, your anchor isn't unique — pick a longer/full-line anchor.
- Duplicate-function override leaves dead code; that's fine and intentional (last decl wins). Don't "clean it up" by trying to delete the old multi-line function — that's a multi-line edit and risky.
- When a value is shown in one place (card) and edited in another (modal), check they read the SAME source. The Miami bug was exactly this: card used `resolveCity` (derived), modal used raw `contract_edit.embark`.
- `contract_edit` is an OVERLAY, not the base; the base is `ship_leg`. The overlay can be stale.
- Ships homeport at one port for months — any "distinct ports" UI must key on port+date, not port name.
- Miguel iterates fast and visually. Prefer showing him a rendered mockup (the `visualize`/`show_widget` tool renders inline in chat) to lock a design BEFORE editing worker.js, rather than deploy-screenshot-tweak loops (which are slow and blind because cims.work is gated).

---

## 14. HOW TO PICK UP (first 10 minutes of the next session)

1. Read `docs/RELIEF_KEYMAN_CANONICAL.md` and this file.
2. `git clone --depth 1` the repo in the bash sandbox; `node --check src/worker.js` to confirm a clean baseline.
3. If Miguel reports a UI issue: query D1 to see the real data first (don't guess), then decide card vs modal vs resolver.
4. For any worker.js change: dry-run patch → target → web-editor edit → byte-diff → deploy-trigger → Actions green.
5. Keep the mentor posture; surface real forks as one crisp question; update the canonical when a decision is locked.

— End of transfer. Good luck.
