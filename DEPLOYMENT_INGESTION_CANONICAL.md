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

## The server — `src/relief_api.js`
- `POST /api/relief/vpd-load`
  - **Validates EVERY row:** brand ∈ {Celebrity, Royal Caribbean, Azamara, NCL}; date matches `^\d{4}-\d{2}-\d{2}$`; ship + port non-empty. Malformed rows are skipped and counted — never inserted. Returns `{inserted, skipped}`.
  - **BRAND-AWARE RESET:** first chunk carries `resetBrands` (the distinct brands in that file) → `DELETE FROM vessel_port_day WHERE brand IN (...)`. Each file cleanly replaces ONLY its own brands. **This is what guarantees no stale rows** (it fixed the 3 orphan Azamara rows that a source-tag reset had left behind). `INSERT OR REPLACE` on PK `(brand,ship_short,berth_date,stop_seq)`; source tag `DEPLOY`.
- `GET /api/relief/vpd-status` — the verify/tripwire. Returns totals (rows/turnarounds/ships/date-range), `by_brand`, `fleet_without_ports`, and **`fleet_short_coverage`** = fleet ships whose itinerary ends before today + `MIN_COVERAGE_MONTHS`.
- **`MIN_COVERAGE_MONTHS = 12`** — the rolling forward floor. Sign-off projects ~6 months out (Azamara min 5, rest 6); 12 months guarantees the picker always has turnarounds ahead. `fleet_short_coverage` is the "about to run dry" alarm.

## Name-match safety (the silent-failure guard)
- The picker queries `vessel_port_day WHERE ship_short = <fleet ship_short>`. Row validation catches malformed rows but NOT a well-formed row with a drifted ship name.
- Tripwire: `fleet_without_ports` (zero coverage) and `fleet_short_coverage` (< 12 mo) in vpd-status surface any fleet ship that lost coverage. If a **non-Azamara** ship appears there after a fresh load → name drift; investigate.
- Verified: all 44 CEL/RCI fleet `ship_short` match the Export file exactly. 6 non-fleet CEL/RCI ships load as harmless clutter (never queried). After both files: ~54 distinct ships in vpd (50 CEL/RCI + 4 Azamara); 48 are fleet.

## STILL OPEN
- **Console wiring (`worker.js`):** point the Data → Upload data page's "Vessel deployment" option at this loader engine (today at `/api/relief/deploy`). One edit to the main app file. This is what Miguel wants long-term ("always use the console one"). NOT yet done.
- **NCL decoder:** add on receipt of a sample export.
