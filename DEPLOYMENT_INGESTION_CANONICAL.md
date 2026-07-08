# Vessel-deployment ingestion — CANONICAL

_Locked 2026-07-08. Miguel tested both files on the live loader — confirmed working._

`vessel_port_day` is the schedule the relief-board picker derives cities and turnarounds from. This
doc is the source of truth for how deployment data gets INTO it. Build on top; do not re-derive.

## Files Miguel will always receive
1. **Celebrity / Royal Caribbean** — one wide `.xlsx` export ("Export" sheet). **Stable format, stable names.**
2. **Azamara** — one long `.xlsx` "Itinerary" sheet. **Stable format, but the SHIP NAMES CHANGE.** Recognize by structure, never by a fixed roster.
3. **NCL** — coming later. Miguel does NOT have it yet. A third decoder plugs into the same recognizer when he sends a sample.

## The loader — `GET /api/relief/deploy` (`src/relief_deploy.js`, DEPLOY_HTML)
- **Drag & drop. AUTO-RECOGNIZES the file by structure, never by filename.** No data-type selector.
- Flow: SheetJS decode client-side → chunked POST (600 rows) to `/api/relief/vpd-load` → auto-calls `/api/relief/vpd-status` → renders verify summary (per-brand ship counts + coverage warnings).
- Recognizer (`recognize(wb)`):
  - **CEL/RCI wide** if a sheet named `Export` has `PORT NAME` in row 3. Brand row 0 (`CEL`→Celebrity, `RCI`→Royal Caribbean); ship row 2; 7-col blocks from col 2 (`| PORT RANK "PORT NAME" ARRIVE DEPART TENDER`); berth date col 0 (`- Stop N` suffix → stop_seq). `is_sea` = RANK `S` or port AT SEA/CRUISING; `is_turnaround` = RANK ends `T`. **Decoder proven identical to the validated pipeline: 37,592 rows, 0 miss / 0 extra.**
  - **Azamara long** if header row has `Ship` + `Location` + `Cruise Nr`. Brand forced = Azamara; `ship_short` = Ship minus the `Azamara ` prefix (handles name changes). `is_sea` = Location/Country `At sea`; `is_turnaround` = embark (Day 1) OR last day of a cruise (Cruise Nr changes next). ~2,208 rows / 4 ships.
- Date parsing: **noon-shift** (`+12h`, then UTC Y/M/D) neutralizes midnight-datetime timezone drift; harmless for pure-date cells.

## Where Rita loads it — the CONSOLE (done 2026-07-08)
- **Data → Upload data → data type "Vessel deployment — Celebrity / RCCL + Azamara"** now embeds the loader (`/api/relief/deploy`) in an iframe right in the page. Select that type and the drag-drop loader appears inline. The old client-side "preview structure" path is guarded off (`handleDrop` returns early for `vessel`). This is the intended home; the raw `/api/relief/deploy` URL still works as a fallback.

## The server — `src/relief_api.js`
- `POST /api/relief/vpd-load`
  - **Validates EVERY row:** brand ∈ {Celebrity, Royal Caribbean, Azamara, NCL}; date matches `^\d{4}-\d{2}-\d{2}$`; ship + port non-empty. Malformed rows are skipped and counted — never inserted. Returns `{inserted, skipped}`.
  - **BRAND-AWARE RESET:** first chunk carries `resetBrands` (the distinct brands in that file) → `DELETE FROM vessel_port_day WHERE brand IN (...)`. Each file cleanly replaces ONLY its own brands. **This is what guarantees no stale rows.** `INSERT OR REPLACE` on PK `(brand,ship_short,berth_date,stop_seq)`; source tag `DEPLOY`.
- `GET /api/relief/vpd-status` — the verify/tripwire. Returns totals, `by_brand`, `fleet_without_ports`, and **`fleet_short_coverage`** = fleet ships ending before today + `MIN_COVERAGE_MONTHS`.
- **`MIN_COVERAGE_MONTHS = 12`** — the rolling forward floor. `fleet_short_coverage` is the "about to run dry" alarm.
- Printer confirmations: `POST /api/relief/leg-flags` upserts ECCR/AIR/HOTEL/ON/OFF into `leg_flags` (keyed by vessel_key + crew; resets on rotation). Board reads it into printers.

## ⚠️ worker.js EDITING RULE (post-incident 2026-07-08)
`src/worker.js` is ~332KB. It **cannot** be pushed as a whole file through the GitHub connector (the content can't be reproduced byte-perfect) and it is NOT split into modules. **Edit worker.js ONLY via surgical in-place edits** — GitHub web editor find/replace (single-line find→replace) or github.dev. **Never** call create_or_update_file / push_files with a full worker.js body, and never delegate a "push worker.js" to a subagent. (An agent once overwrote it with a stub; recovery was a byte-perfect restore from the prior commit's raw view pasted back in the web editor, then 4 single-line find/replace edits for the feature.) Relief modules (`relief_*.js`, ≤~13KB) ARE safe to push via the connector.

## Name-match safety
- Row validation catches malformed rows but NOT a well-formed row with a drifted ship name. `fleet_without_ports` / `fleet_short_coverage` in vpd-status are the drift tripwire. All 44 CEL/RCI fleet `ship_short` match the Export file exactly.

## STILL OPEN
- **NCL decoder:** add on receipt of a sample export.
