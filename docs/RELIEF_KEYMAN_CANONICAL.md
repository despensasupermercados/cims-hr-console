# CIMS Keyman + Relief Board — Canonical (as of 2026-07-08)

Single source of truth for the Keyman tab, the Relief board, the crew card,
the Edit-contract modal, and the city/port logic. If this file and the code
disagree, the code wins — then fix this file.

Prod worker: `cims-hr-console`. Prod D1 id: `f0ac8b6a-deac-4214-8f42-e22b202d7d7d`.

---

## 0. HARD RULES (do not violate)

- **worker.js is ~332 KB / ~3850 lines and CANNOT be pushed as a whole file**
  through the GitHub connector, and it is NOT split into modules. Edit worker.js
  ONLY via surgical, single-line find/replace in the GitHub web editor.
  NEVER call create_or_update_file / push_files with a full worker.js body.
- **Every worker.js change is dry-run first** on a `git clone --depth 1` using a
  Python patch that asserts each find matches exactly once, then `node --check`,
  then the resulting file is saved as a target. After editing in the browser and
  committing, re-clone and `diff` against the target — it MUST be BYTE-IDENTICAL.
- **Relief modules (`relief_*.js`, `city_resolver.js`, `relief_board.js`) ARE
  safe to push full-file via the connector** (they are ≤ ~33 KB). Always verify
  after with a re-clone `node --check` + `diff`.
- **Deploys are gated by the GitHub Actions `tests` workflow** (npm test). A
  deploy happens only when `.deploy-trigger` on `main` is bumped with a new
  commit. Red tests block the deploy. Every change this session: commit the file,
  then bump `.deploy-trigger`, then confirm the deploy run is green.
- **cims.work is login-gated** — Claude cannot authenticate or visually verify
  the live UI. Verification is done by DB queries (Cloudflare D1 MCP) + code
  review + byte-diff, and by asking Miguel to eyeball the result.
- **Financial/credential safety**: never authenticate, never move money.

### worker.js function-override trick (used repeatedly, safe)
worker.js's client app (`APP_HTML`) is one giant template literal; its helper
functions live at the top level of the served `<script>`. Because duplicate
top-level function declarations are legal and the LAST one wins, we override a
function by INSERTING a new definition (as a single line) right before a stable
anchor (`function rotShip(sec){`). The old definition stays as dead code. This
is how `rotCard`, `reliefSlot`, `reliefBanner`, `openRelief`, and the message
listener were all replaced without multi-line edits. To avoid quote-escaping in
the web editor, inline handlers use arg-free / element-based calls
(`onclick="rcClick(this)"`, `onclick="openRelief(this)"` reading `data-*`),
not `onclick="f(\'id\')"`.

---

## 1. Two data layers (do not confuse them)

There are TWO parallel board models. They read DIFFERENT tables.

### A. Keyman / rotation board (the main board, `/keyman` tab)
- Built by `rotationSections(env)` in `worker.js`.
- Reads `ship_leg` (one current leg per ship, `is_current=1 AND ours=1`) with an
  overlay from `contract_edit` (Rita's manual edits: cities, dates,
  confirmations, comments).
- P2 addition: also loads `vessel_port_day` once + `groupPortDays`, and for each
  crew computes `on_city/on_conf/off_city/off_conf` via `resolveCity` (the
  itinerary-derived city + confidence). These are attached to each crew object.
- Rendered client-side: `rotationSections` → `renderRotation()` → per ship
  `rotShip(sec)` → per crew `rotCard(x)`.

### B. Relief board (`/relief`, embedded in the Keyman tab)
- Data layer `relief_api.js` (`reliefBoardData`); front end `relief_ui.js`
  (`RELIEF_HTML`); assembly `relief_board.js` (`buildReliefBoard`,
  `workflowStatus`, `validateWrite`).
- Reads `ship_leg` (printers) + `assignment`/`contract`/`crew` (relievers), joins
  `vessel_port_day`, resolves cities with `city_resolver.js`.
- Azamara sign-off is PROJECTED: next real turnaround ≥ sign-on + `AZAMARA_MONTHS`
  (=5), floored at today; `leg_flags.override_off_date` (Rita) always wins.

---

## 2. City resolver (`src/city_resolver.js`)

`resolveCity({date, seed, override, portDays, hasDeployment=true})` precedence:
**override > TBA > derived > provisional > seed.**
- `derived` = exact port on that berth_date in `vessel_port_day`.
- `provisional` = nearest port when no exact match.
- `seed` = the stored free-text embark/disembark (lowest trust).
Confidence → colour: derived `#1f7a3d` (green), provisional `#a8791a` (amber),
seed `#b0342f` (red), override `#1f5fa8` (blue), TBA `#888780` (grey).
`groupPortDays(rows)` keys by `brand|ship_short`.

---

## 3. DECISION LOCKED 2026-07-08 — "Itinerary wins"

When a hand-typed city disagrees with the ship's itinerary, **the itinerary
wins**. The board derives the city from the port on the (Rita-verified) date;
stored free-text is only a fallback. Rita does NOT free-type cities anymore — she
picks from the ship's real ports (see §7). This was chosen to kill stale
free-text (e.g. a contract stored embark "Miami" while the itinerary + ship_leg
said "ORLANDO (PORT CANAVERAL), FLORIDA").

Worked example (Adventure / Karl Bernard Marc Lanuza, SC-0039963 #1):
- `ship_leg`: embark = ORLANDO (PORT CANAVERAL), disembark = FORT LAUDERDALE,
  on 2026-03-28, off 2026-11-29.
- `vessel_port_day`: 2026-03-28 = ORLANDO (PORT CANAVERAL) (turnaround);
  2026-11-29 = FORT LAUDERDALE (turnaround). ~120 turnarounds through 2028;
  ship homeports at ONE port for long stretches (FLL Nov→Apr, Orlando otherwise).
- `contract_edit` had a stale embark "Miami" (2 other rows also had drift:
  Independence overlay "Cape Liberty NJ" vs leg "Miami"; Anthem "Sydney"="Sydney").
  These stale city values remain in the DB but are now ignored for display.
  OPEN: sign-off emails, if they read raw `contract_edit.embark`, could still
  surface a stale city — clean the 3 rows or repoint emails to resolved city.

---

## 4. Keyman crew card (`rotCard`, redesigned 2026-07-08)

Redesigned to the approved mockup. Each card:
- **Initials avatar** (`.ravatar`, green `.cur` when onboard) + name + `PS` chip
  (`.rrank`) + status/tenure line (`.rleg`), stacked in a header (`.rhead`
  /`.rhcol`).
- **"OFF in Nd" urgency chip** top-right (`.offchip`), colour by days to the
  crew's own sign-off: `<=14` red (`.crit`), `<=30` amber (`.due`), else grey.
  Computed self-contained from `x.signOff` (no relief dependency).
- **Rotation block** (`.rrot`, hairline top border): labeled `on`/`off` rows
  (`.rrow` / `.rlbl` / `.rcity` / `.rdate`), city left (confidence-coloured via
  `oc()`), date right-aligned + non-wrapping.
- **Confirmed tags** as green pills (`.rtag.on`): ECCR / AIR / HOTEL / ON DATE /
  OFF DATE.
- Card is a `rotCard` override defined before `rotShip`. Inline handlers are
  delegated: `onclick="rcClick(this)"` and `ondragstart="rcDrag(event,this)"`
  read `data-crew`/`data-seq` (no escaped quotes).
- `.shipbody` grid is `auto-fit, minmax(300px,1fr)` so the onboard card + reliever
  slot FILL the row (was `auto-fill,240px`, which cramped them). `.poolwrap`
  grid left unchanged.

---

## 5. The two-card layout inside each Keyman ship row

For each ship the row shows, in `rotShip`, INSIDE `.shipbody`:
`[onboard crew card] [reliever card OR "+ Add reliever" slot]` then a full-width
`_rbanner` status pill below. Rendered by client helpers appended before
`rotShip`:
- `reliefSlot(rb)` — filled reliever card (`.rcard.rlvr`, navy RELIEVER chip) or
  a polished empty slot (`.ghostslot`): circled "+", "Add reliever", an urgency
  chip ("OFF IN Nd"), tinted red (`.crit`)/amber (`.due`)/neutral by urgency,
  hover feedback. Carries `data-vk` (vessel_key) and `onclick="openRelief(this)"`.
- `reliefBanner(rb)` — inline status pill (`.rbanner` + `.bdot`): green "Clean
  handover · city · date", amber "Reliever due · signs off in Nd", red "Reliever
  needed · signs off in Nd", grey "Slot open · signs off in Nd".
- Data comes from `window.RELIEF` (populated in `renderRotation` from
  `/api/relief/board`, keyed by `reliefKey(brand,ship)` where brand "Royal" →
  "Royal Caribbean").
- The old thin "Relief ·" text line and the separate `/relief` iframe section at
  the bottom of the board were REMOVED (one board, no duplication).

---

## 6. Inline reliever modal (overlay, no page nav)

Clicking a reliever slot/card opens the FULL New-reliever modal in place:
- `openRelief(el)` (worker.js): reads `data-vk`, mounts a full-screen overlay
  `#reliefovl` (`position:fixed;inset:0;z-index:99999;background:rgba(10,14,24,.44)`)
  containing an `<iframe src="/relief?open=<vessel_key>">` that starts
  `opacity:0;transition:opacity .12s`.
- `relief_ui.js` embed mode: when `?open=` is present it hides the board chrome
  (all `.wrap` children except `#modal`), sets body + modal backdrop transparent,
  and auto-opens that ship's modal; then postMessages `{t:'reliefReady'}`.
- worker.js message listener: on `reliefReady` fades the iframe in (kills the
  flash of the relief page while loading); on `reliefClose` removes the overlay
  and, if `changed`, calls `renderRotation()` to refresh the board in place.
- `relief_ui.close()` postMessages `{t:'reliefClose', changed:_CHG}`; `_CHG` is
  set true on any successful save.

### Relief modal contents (RELIEF_HTML, matches the designed mockup)
Printer card + reliever slot per ship; urgency-coloured empty slots; handover
banner. New-reliever modal: **Match handover** (reliever ON = printer OFF date +
min-months, derives city), crew search ("required to activate"), Ship (helper
"preloaded from the slot"), plain **date pickers** that live-derive the city
(green=turnaround / amber=nearest), CONFIRMED toggles (green tags), **sign-off
workflow** rows (Send instructions / sign-off link / review invite → "Mark sent",
state persisted), **Comment** box + Post. Reliever turnaround min = 5 (Azamara) /
6 (others).

IMPORTANT: the workflow "Mark sent" buttons only RECORD sent-state (timestamps in
`assignment.instructions_sent_at / signoff_link_sent_at / review_invite_sent_at`)
— they do NOT fire real emails to crew. Real dispatch needs templates + Miguel's
go. (The Keyman modal's SIGN-OFF WORKFLOW buttons DO send via existing routes —
see §8.)

---

## 7. Edit-contract modal port dropdowns (`editContractModal`)

The Keyman modal's **Embark / Disembark are port DROPDOWNS seeded from the
itinerary** (labelled "· from itinerary"), NOT free text. This is the concrete
implementation of "itinerary wins" + Miguel's port-picker logic:
- On open, the modal fetches `/api/relief/ports?ship=<e.ship>` → `P` (all
  `vessel_port_day` rows for the ship).
- `portOptions(ports, date, current)` filters to turnaround ports
  (`is_turnaround=1 && is_sea!=1`), sorts ascending, windows to the port on the
  given date + the next 5 (falls back to the last 6 if the date is past all
  turnarounds), preselects the option whose `berth_date === date`, and renders
  each as `PORT · date` with `data-d=berth_date`. **No de-dup by name** — a ship
  homeporting at one port shows the same port on multiple dates (that was the bug
  that collapsed the disembark list to one option).
- Embark uses the verified sign-on date; disembark uses the sign-off date.
- `pickPort(sel)`: on change, sets the matching date field
  (`eEmb`→`eOn`, `eDis`→`eOff`) to the chosen turnaround's `data-d`. So the
  dropdown is a real turnaround-day picker: pick a turnaround → date + city move
  together.
- `saveContract` stores the selected `port_name` into embark/disembark.

Reliever embark = the onboard crew's sign-off day/port → this is the relief
modal's **Match handover** (already built), not the Keyman modal.

---

## 8. Backend (`src/relief_api.js`, `src/relief_board.js`)

- Routes: `/relief`, `/api/relief/deploy`, `/api/relief/board`,
  `/api/relief/crew`, `/api/relief/ports?ship=`, `/api/relief/vpd-status`,
  `/api/relief/vpd-load`, `/api/relief/leg-flags`, `/api/relief/save`,
  `/api/relief/comments?assignment_id=|vessel_key=` (GET),
  `/api/relief/comment` (POST). Comments persist in a lazily-created
  `relief_comment(id, assignment_id, vessel_key, body, created_at)` table.
- **Bug fixed 2026-07-08**: `saveReliefAssignment` passed the whole payload
  (incl. `id`) to `validateWrite`, which rejects unknown keys → every
  `{id,...}` update (edit / mark-sent) returned `rejected_fields:['id']`. Fixed
  by destructuring `id` out before validation (`const {id:_keyId, ...toValidate}`).
- `validateWrite` (relief_board.js) whitelists STORED fields incl. the three
  `*_sent_at`; FORBIDS derived fields (`on_city/off_city/*_conf/handover/...`).
- Azamara projection lives in `reliefBoardData`: `AZAMARA_MONTHS=5`,
  `MIN_COVERAGE_MONTHS=12`, `addMonthsISO`, today-floor, `override_off_date` wins.
- Keyman modal SIGN-OFF WORKFLOW buttons call real endpoints:
  `sendSignoffInstructions`→`/api/instructions/request`,
  `sendSignoffLink`→`/api/ack/request`, `sendReviewInvite`→`/api/sbm/invite`
  (these DO email; GSM review must be ON for invites).

---

## 9. Vessel-deployment ingestion (unchanged, still live)

Drag-drop loader at `/api/relief/deploy`, surfaced in the Data page (Data type
"Vessel deployment" swaps the dropzone for the loader iframe). Auto-recognizes
Celebrity/RCCL wide "Export" vs Azamara "Itinerary". **Azamara turnaround rule
(Miguel-taught): the Day column read as a STRING; cell "1" or ending "/1" =
turnaround** (`/(^|[/])1$/`). Chunked POST, `resetBrands`, self-verify. Writes
`vessel_port_day`. Read floor: minimum 12 months coverage.

---

## 10. Open items / follow-ups

- Clean the 3 stale `contract_edit` city values (or repoint sign-off emails to the
  resolved city) so no stale city can surface in email.
- Reliever gap worklist email to Rita/Joy — BUILT, Miguel said "not yet"
  (top imminent: Independence/Janet Magana, Reflection/Michael Angelo Resposo,
  Summit/Lyndon Noche, Jewel/Jonathan De Torres).
- NCL export decoder — blocked on an NCL sample file.
- An unrelated open PR (#27, "Audit tab") exists on the repo — not ours; left alone.

---

## 11. Deploy log — 2026-07-08 session (main)

Relief board matched to mockup (action layer) → inline overlay modal
(no nav) → no-flash (instant dim + iframe fade-in on reliefReady) → keyman
two-card layout inline → polished empty-slot + status pill → crew card redesign
(avatar, rotation rows, tag pills) → modal shows itinerary-derived cities →
embark/disembark port dropdowns → dropdowns list turnaround days (name-dedup
removed) + pick sets date. All deploys green; every worker.js change verified
byte-identical to a locally `node --check`'d target.
