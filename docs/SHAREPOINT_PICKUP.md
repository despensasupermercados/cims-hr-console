# The SharePoint pickup — the morning session's runbook

Miguel, 15 Oct 2026: *"I dont want rita to be dropping items .. I want you to either pick the file and read what u need
.. or we need to find a solution."*

This is the route that works **today**, with no IT ticket: a scheduled Claude session ("Cims SharePoint pickup", daily,
fresh session) reads the SharePoint folders through Miguel's Microsoft 365 connector and writes the sheets it read into
the console's **inbox** (`sp_inbox` in D1). The Worker's hourly cron (`applyInbox`, `src/worker.js`) loads them through the
SAME apply paths as drag-and-drop (`sgaStage` / `applySgaWorkbook`, `applyTravelYear`) and records every load on
`sp_sync` with `source = agent`. The session never parses the bill and never writes a bill or travel row — the Worker
does, from tested code (CLAUDE.md §3). The clean end state is still the Graph identity (`docs/SHAREPOINT_SYNC.md`): once
IT creates it, the Worker reads SharePoint itself every hour and this scheduled task is deleted.

## What the connector can and cannot do (measured 15 Oct 2026)

- `read_resource` on a **folder** URI lists its children: `<name> (folder|file, <bytes> bytes) <uri>`. No modified time.
- `sharepoint_search` returns items with `id`, `name`, `webUrl`, `lastModifiedDateTime` — use it for the modified time.
- `read_resource` on a **workbook** returns TEXT, not bytes: one `## Sheet: <name> — R rows × C columns (A1:..)` block per
  worksheet, tab-separated cells printed as Excel shows them (`1,428.52 `), `[n empty rows]` markers, a `Formulas:` block
  per sheet. It has a **read budget**: a big workbook is cut with `[Output truncated …]`. TDG's SGA workbook (230 sheets)
  delivers `SUMMARY MANNING` and `2026 SUMMARY TRAINREL` whole (they are sheets 3–5); the `TRAINING` line items never.
  Rita's travel workbook delivers JAN–SEPT whole and is **cut inside OCT** (its SUMMARY sheet alone is ~3,800 lines) — so
  from October her year cannot come through this route. `scripts/sp_pickup.mjs` refuses any cut or missing sheet; it never
  loads nine months as the year.
- **Read ONE workbook at a time and retry a cut one.** The budget VARIES from call to call: eight workbooks read in parallel
  on 15 Oct 2026 came back cut after three sheets each, February and March read whole, and January 2026 was cut at the
  `SUMMARY MANNING` header on three separate single reads. A read that stops before `SUMMARY MANNING` is retried up to
  three times, one at a time; a workbook that never comes through is reported as refused (`manning_cut`) — it is a line
  in the digest, and the Graph identity is what reads it.
- **The month is the FILE's, never the ref's.** TDG's ref `ADV-2026-09-32-01` carries a constant `09` (TDG's code for
  DG3): February 2026's refs read `2026-09-32`. The script and the Worker take the period from the file name
  (`DG3 SGA EXCEL FEBRUARY 2026.xlsx`, `MARCH'26`) or the month folder — always pass `--name` and `--path` as they are.
  The `DATE` cell of older workbooks is a `=TODAY()` formula, so `sga_date` on those reads as the day of the read.
- A large tool result is also saved by the harness under `~/.claude/projects/*/<session>/tool-results/
  mcp-Microsoft_365-read_resource-<ts>.txt` — that file is the dump to use (never retype a tool result by hand).

## The run, step by step

1. **Repo**: `cd` into the `cims-hr-console` checkout, `npm ci`. Read CLAUDE.md §7 (no secrets) and §10j (the Travel tab).
2. **What is already loaded** (Cloudflare D1 tool, database `cims-hr-console`, id `f0ac8b6a-deac-4214-8f42-e22b202d7d7d`):
   ```sql
   SELECT item_id, etag FROM sp_sync WHERE status='ok';
   SELECT DISTINCT item_id, modified FROM sp_inbox WHERE status IN ('pending','ok');
   ```
   A file is DONE when its key `item_id@modified` (`inboxFileKey`) is in either list. The agent's own loads carry
   `source='agent'`; a Graph load (when it exists) carries `sharepoint`. Both count.
3. **TDG's bill**: list `file:///b!fl3m7gvQAUWsJkPOuwz3xeG86ZS15I9Pnk3LJerabezIxjsfTdIgSY0jSMrznSmH/1. ACCOUNTING/SGA/<year>`
   for this year and last year (TDG's December bill arrives in January; last year matters until the end of February — the
   Worker's `yearsToScan` rule). Month folders are `NN Month YYYY` (`monthOfFolder`); `00 For approval` is not a month.
   List each month folder; the month's file is the `DG3 SGA EXCEL <month>.xlsx` — **REVISED beats plain, the newest wins,
   never a PDF** (`pickSgaItem`). Get its `lastModifiedDateTime` with `sharepoint_search` (query the file name, `fileType`
   `xlsx`, `folderName` the month folder); if the search does not surface it, use the listing's byte size as the second
   half of the key (`id@<bytes>`). Skip files whose key is DONE.
4. **Rita's workbook**: list `…/1. ACCOUNTING/Travel Expenses Crew`; the year's file is `UPDATED - Travel Expenses <year>
   RCCL & AZAMARA & CELEBRITY.xlsx` (`pickTravelItem`). Same key rule. Expect it to be refused from October on (see above);
   that is a report line, not a failure.
5. **For each candidate**: `read_resource` its file URI; take the saved dump file from `tool-results/` (the newest
   `mcp-Microsoft_365-read_resource-*.txt`), then
   ```
   node scripts/sp_pickup.mjs --kind sga --dump <dump.txt> --id <itemId> --name "<file name>" --modified <iso or bytes> \
        --path "1. ACCOUNTING/SGA/<year>/<NN Month YYYY>" --by "sharepoint-pickup" --out <file>.sql
   node scripts/sp_pickup.mjs --kind travel --dump <dump.txt> --id <itemId> --name "<file name>" --modified <iso> \
        --path "1. ACCOUNTING/Travel Expenses Crew" --year <YYYY> --by "sharepoint-pickup" --out <file>.sql
   ```
   It prints one JSON line. `ok:false` → nothing written; note `reason` (`manning_cut`, `sheet_cut`, `sheets_missing`,
   `no_manning`, `no_period`, …) in the digest and move on. `ok:true` → check the report: for the bill, `reconciles` must be
   `true` (the lines + OTHERS = TDG's GRAND TOTAL) — **if it is false, do NOT load; report it** (a new column or a parsing
   miss is Miguel's to look at, §6). Then run **every statement** in the `.sql` file with the D1 tool, one call each
   (2 statements for a bill, up to 14 for a travel year; each is under 100 KB).
6. **Digest** (the session's last message, ≤ 8 lines): files found / already loaded / written to the inbox (period, SGA
   no, lines, total, reconciles) / refused and why / errors. If nothing is new: one line. The Worker loads the inbox within
   the hour; the Data page's "SharePoint" block and `GET /api/sharepoint/status` (`inbox`) show it.

## What the session must never do

- Never `UPDATE`, `DELETE` or write to any table but `sp_inbox` (INSERT only, the statements the script wrote). The Worker
  owns `sga_line`, `sga_file`, `training_cost`, `travel_expense`, `sp_sync`.
- Never load a file the script refused, and never a bill that does not reconcile.
- Never retype a dump; never "fix" a name, an amount or a sheet. The console shows disagreements; it does not resolve them.
- No git commits, no emails, no secrets (§7). Nothing here is money (§1).

## Why not …

- **Graph app registration** — the right end state, already built and tested (`src/sharepoint_sync.js`); waits on DG3 IT
  for `Sites.Selected` + a client secret. The day it exists, delete the scheduled task.
- **Power Automate → email with attachment** — needs someone with M365 to build the flow and a new attachment path in the
  Worker; more moving parts than the inbox for the same result.
- **An "anyone with the link" share** — the Worker could not read it without cookies; fragile and a security hole.
