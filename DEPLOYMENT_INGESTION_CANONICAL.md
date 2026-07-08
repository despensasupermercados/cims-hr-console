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
- Flow: SheetJS decode client-side → chunked POST (600 rows) to `/api/relief/vpd-load` → auto-calls `/api/relief/vpd-status` → renders verify summary.
- Recognizer (`recognize(wb)`):
  - **CEL/RCI wide** if a sheet named `Export` has `PORT NAME` in row 3. Brand row 0 (`CEL`→Celebrity, `RCI`→Royal Caribbean); ship row 2; 7-col blocks from col 2 (`| PORT RANK "PORT NAME" ARRIVE DEPART TENDER`); berth date col 0 (`- Stop N` → stop_seq). `is_sea` = RANK `S` or AT SEA/CRUISING; `is_turnaround` = RANK ends `T`. **Proven 37,592 rows, 0 miss / 0 extra.**
  - **Azamara long** if header has `Ship` + `Location` + `Cruise Nr`. Brand forced = Azamara; `ship_short` = Ship minus `Azamara ` prefix.
    - **AZAMARA TURNAROUND RULE (taught by Miguel — DO NOT change):** the **`Day`** cell that is **`1`** or **ends in `/1`** (e.g. `12/1` = day 12 of ending cruise AND day 1 of the next) is the **crew-change turnaround**. Cruise lengths vary. Read the Day cell as a **STRING** (`parseInt` drops the `/1` — original bug). Regex `/(^|[/])1$/`. ~2,961 rows / **261 turnarounds** / 4 ships.
- Date parsing: **noon-shift** (`+12h`, then UTC) neutralizes midnight-datetime tz drift.

## Where Rita loads it — the CONSOLE
- **Data → Upload data → "Vessel deployment — Celebrity / RCCL + Azamara"** embeds the loader in an iframe. Old preview path guarded off. Raw `/api/relief/deploy` still works as fallback.

## The server — `src/relief_api.js`
- `POST /api/relief/vpd-load` — validates EVERY row (brand enum, `^\d{4}-\d{2}-\d{2}$`, non-empty ship/port; malformed skipped+counted). **BRAND-AWARE RESET:** `resetBrands` → `DELETE WHERE brand IN (...)`, so each file replaces only its own brands (no stale rows). `INSERT OR REPLACE` PK `(brand,ship_short,berth_date,stop_seq)`; source `DEPLOY`.
- `GET /api/relief/vpd-status` — totals, `by_brand`, `fleet_without_ports`, `fleet_short_coverage` (< today + `MIN_COVERAGE_MONTHS`=12).

## ⭐ AZAMARA SIGN-OFF PROJECTION + RITA OVERRIDE (locked 2026-07-08)
Azamara crews run **~5-month contracts** (`AZAMARA_MONTHS = 5`; CEL/RCI = 6, and their stored offs already land on turnarounds so they're left as-is). Azamara `ship_leg` off-dates sit mid-cruise / are unreliable, so the **printer sign-off is PROJECTED** in `reliefBoardData`:
- **base** = `on_date + 5 months` if sign-on present, else the stored `off_date`, else today.
- **floor:** never before today — an overdue keyman snaps to the next turnaround from *now* (avoids past sign-offs).
- **projected off** = first turnaround (`is_turnaround=1 AND is_sea!=1`) with `berth_date >= base`.
- **Rita override wins:** `leg_flags.override_off_date` (per vessel_key + crew; clears on rotation). Set via the **printer card's Azamara sign-off dropdown** (default "auto · 5-month projection"; pick any turnaround to override; pick "auto" to clear). Saved through `POST /api/relief/leg-flags` (PARTIAL upsert — override and the ECCR/AIR/HOTEL/ON/OFF confirmation toggles write independently, neither clobbers the other).
- Verified 2026-07-08: Journey→Copenhagen Jul 27 (snapped off mid-cruise Berlin), Onward→Lisbon Nov 17 (filled missing off), Pursuit→Tokyo Oct 2 (5-mo; stored was Oct 31 — Rita overrides if the run is really 6mo), Quest→Dublin Jul 15 (overdue, floored to today).
- CEL/RCI printers stay read-only; only Azamara printers get the adjustable dropdown.
- **Reliever side already = 5 months for Azamara** (`minMonths()`), and now "follows printer" lands on the projected real turnaround automatically.

## ⚠️ worker.js EDITING RULE (post-incident)
`src/worker.js` is ~332KB — **edit surgically in place ONLY** (GitHub web editor single-line find/replace or github.dev). NEVER push it as a whole file via the connector, never delegate a full-file worker.js push to a subagent. Relief modules (`relief_*.js`, ≤~15KB) ARE safe to push via the connector.

## Fleet health (audited 2026-07-08)
- All 48 fleet ships covered; every ship 47+ turnarounds, ~2-year horizons. Only soft flag: Spectrum ends 2027-05-01 (> 6-mo picker horizon). 6 non-fleet Celebrity future ships in the table are harmless — keep them.

## Name-match safety
- Validation catches malformed rows, NOT a drifted ship name. `fleet_without_ports` / `fleet_short_coverage` are the drift tripwire. All 44 CEL/RCI fleet `ship_short` match the Export file exactly.

## STILL OPEN
- **NCL decoder:** add on receipt of a sample export.
