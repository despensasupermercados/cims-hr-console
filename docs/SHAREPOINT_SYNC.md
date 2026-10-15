# SharePoint → console, automatic (PR 3)

Miguel, 15 Oct 2026: *"I want all this to be automatic, so we have to do what we have to do."*

Today Rita drags two workbooks into Upload data: TDG's **`DG3 SGA EXCEL <month>.xlsx`** (the bill — one folder per
month under `1. ACCOUNTING/SGA/<year>/<NN month>/`) and her own **`UPDATED - Travel Expenses <year> RCCL & AZAMARA &
CELEBRITY.xlsx`** (`1. ACCOUNTING/Travel Expenses Crew/`). Both already live on SharePoint
(`dg3365.sharepoint.com/sites/CruiseLineManagedServicesTeam`). With this change the Worker reads them itself, once an
hour, and loads whatever is new or changed through the SAME parsers and the SAME apply paths the drag-and-drop uses
(`src/travel.js`, `src/sga.js`, `applyTravelYear`, `applySgaWorkbook`). Nothing is parsed twice, nothing is
reconciled, every load is recorded (`sp_sync`, `sga_file`, `data_log`) with the file's id, name, modified time and
eTag, so the console can always say which file a number came from.

## What Miguel (or DG3 IT) sets up — once

The Worker needs an identity in DG3's Microsoft 365 tenant. The agent never sees these values (CLAUDE.md §7).

1. **App registration** — Microsoft Entra admin center → *App registrations* → *New registration*.
   Name `CIMS HR Console (SharePoint read)`, single tenant, no redirect URI. Note the **Application (client) ID** and the
   **Directory (tenant) ID**.
2. **Permission** — *API permissions* → *Add* → *Microsoft Graph* → **Application permissions** → `Sites.Selected` →
   *Grant admin consent*. (`Sites.Selected` lets the app read only the sites it is explicitly given; the broader
   `Files.Read.All` would read every site in the tenant — do not use it.)
3. **Give the app the one site** — an admin runs, once (Graph Explorer or PowerShell):
   ```
   POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
   { "roles": ["read"], "grantedToIdentities": [{ "application": { "id": "<client id>", "displayName": "CIMS HR Console" } }] }
   ```
   where `{site-id}` is the CruiseLineManagedServicesTeam site (`GET /sites/dg3365.sharepoint.com:/sites/CruiseLineManagedServicesTeam`).
4. **Client secret** — *Certificates & secrets* → *New client secret* (24 months). Copy the **value** once.
5. **Cloudflare** — Workers & Pages → `cims-hr-console` → Settings → Variables and Secrets:
   - Secrets (type **Secret**): `GRAPH_CLIENT_SECRET` = the value from step 4.
   - Variables (plain, or in `wrangler.toml [vars]` so they survive deploys): `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`,
     `SP_DRIVE_ID` = `b!fl3m7gvQAUWsJkPOuwz3xeG86ZS15I9Pnk3LJerabezIxjsfTdIgSY0jSMrznSmH` (the site's Documents drive,
     read 15 Oct 2026), `SP_SGA_PATH` = `1. ACCOUNTING/SGA`, `SP_TRAVEL_PATH` = `1. ACCOUNTING/Travel Expenses Crew`.
   - Nothing on **staging**: staging runs no cron (`wrangler.toml [env.staging.triggers] crons = []`) and must never hold
     the secret. The sync also refuses to run when `MAIL_ONLY_TO` is set (the staging marker).

Until the secret exists the sync does nothing and says so on the Data page ("SharePoint sync: not configured");
drag-and-drop keeps working exactly as before.

## What the Worker does — every hour (`maybeSyncSharePoint`, in `scheduled`)

1. Token: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` (client credentials,
   scope `https://graph.microsoft.com/.default`). Cached in the isolate until it expires.
2. **SGA**: list `{SP_SGA_PATH}/{this year}` and `{last year}` → each month folder → its `.xlsx` whose name contains
   `SGA EXCEL`. When a folder has both `DG3 SGA EXCEL…` and `REVISED DG3 SGA EXCEL…`, the **REVISED** one is the
   month's file. A file is loaded when its `(id, eTag)` is not in `sp_sync` as processed.
3. **Travel**: list `{SP_TRAVEL_PATH}` → `UPDATED - Travel Expenses <year>…xlsx` for this year (and last year until
   February) → same eTag rule.
4. Download (`/drives/{drive}/items/{id}/content`), parse with SheetJS in the Worker (`xlsx`, bundled by wrangler;
   `sheet_to_json(header:1, raw:true, defval:'')` — the same shape the page sends), hand the sheets to the existing
   stage + apply (`sgaStage` → apply; `parseTravelSheets` → replace the year). Source is recorded as `sharepoint`.
5. Record the outcome on `sp_sync` (id, path, name, modified, eTag, kind, status ok/error, detail, at). One Graph
   call fails → that file is skipped and retried next hour; nothing else is affected. A parse that does not reconcile
   to TDG's grand total still loads (the dry-run flag `reconciles` is stored) and is shown on the Data page.
6. The Data page lists the last 20 sync events and the files on file; the Travel tab's "Bills on file" names the source.

## What it will never do

- Write to SharePoint (read-only permission, read-only code).
- Touch the bonus, baselines or `bonus_outcome` (§1), or treat any of this as an invoice source (§10b).
- Read the scanned PDFs (no text in them) or any folder outside the two paths above.
- Run on staging, or with a secret in the repo.

## Open before building

- The `TRAINING` line-item sheet (who each hotel / fee was for) — its layout is unread; the summary sheet is loaded
  today. Reading it needs the actual workbook file once (attach it in the chat, or it arrives with the first sync).
- Whether Rita's 2025 workbook should be re-read (the console's 2025 crew rows came from the June 2026 seed; the file
  on SharePoint has no December sheet — the seed has one).
