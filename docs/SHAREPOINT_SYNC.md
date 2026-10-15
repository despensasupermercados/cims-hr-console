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

## Until IT delivers: the INBOX route (15 Oct 2026, the same evening)

Miguel: *"I dont want rita to be dropping items .. I want you to either pick the file and read what u need .. or we need to
find a solution."* A scheduled Claude session ("Cims SharePoint pickup", daily) reads the folders through his Microsoft
365 connector and writes the sheets into `sp_inbox`; the hourly cron (`applyInbox`) loads them through the same two apply
paths and records them on `sp_sync` with `source = agent`. Runbook: `docs/SHAREPOINT_PICKUP.md`; code `src/sp_inbox.js`,
`scripts/sp_pickup.mjs`; pinned by `test/sp_inbox.test.js`. Its limit, measured: the connector returns a workbook as
text under a read budget — TDG's bill comes through whole, Rita's workbook only until about October. When the Graph
identity exists the Worker reads SharePoint itself and the scheduled task is deleted; nothing else changes.

**Retired 15 Oct 2026, 21:29 UTC** — Miguel: *"we not gonna use this way .. we will do the email way instead"*. The scheduled
task is disabled (not deleted), the Graph identity is not being requested from IT, and finance emails the bill once a month to
sga@cims.work (below). The hourly `maybeSyncSharePoint` stays dormant: it runs only if `GRAPH_*` / `SP_DRIVE_ID` ever exist.
The inbox (`sp_inbox`, `applyInbox`) stays: it is the mail intake's queue, and the session loaded the year's history into it
from Miguel's own uploads (batches of five; CLAUDE.md §10j).

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

## The mail intake — sga@cims.work (15 Oct 2026, the same evening)

Miguel: *"give me an email where finance can send u this .. u might get more emails .. but this will be one of them so
you can pick it up and add the data where needs to be."*

**This is THE route** (Miguel, the same evening: finance sends the bill once a month; the SharePoint pickup and the Graph
identity are dropped). Finance (TDG accounting, or Rita forwarding) emails the workbook to **sga@cims.work**. The Worker's email handler
(`intakeMailToInbox`, `src/mail_intake.js`) parses the mail, keeps only `DG3 SGA EXCEL <month>.xlsx` (REVISED beats plain)
and `UPDATED - Travel Expenses <year> ….xlsx`, reads the sheets with SheetJS, writes them into `sp_inbox` and applies the
inbox at once through the same paths as drag-and-drop. The PDF scans and the body are ignored and listed on the receipt
(`mail_intake`, shown by `GET /api/sharepoint/status` under `mail`).

**Setup, once, in the Cloudflare dashboard** (Email Routing has no API in the tools the agent holds): cims.work →
Email Routing → Routing rules → Create address → `sga@cims.work` → Action *Send to a Worker* → `cims-hr-console`. The
`crew-reports@cims.work` rule for field intel is the model; the two addresses share the handler and never cross.

**Who may feed the console**: `SGA_MAIL_SENDERS` in `wrangler.toml [vars]` (default `dg3.com`). A workbook from any
other sender is written `held` and loads nothing; the receipt names the sender, so after TDG's first mail Miguel adds
their domain (e.g. `dg3.com, tdgcrew.com`) and the next mail loads. Until then Rita can forward TDG's mail from her
dg3.com address and it loads at once.

## The archive of the original workbooks (15 Oct 2026, later that evening)

Miguel: *"keep this [the files] somewhere in a bucket in the database or u will figure out where .. I dont wanna lose this
.. so is accessible to the brain when need it."*

Every workbook the Worker receives is kept as it arrived: the bytes in the **EXPORTS R2 bucket** (`cims-hr-exports`, prefix
`sga-archive/<kind>/<year>/<MM>/<sha16>-<name>`) and one row on `sga_source_file` keyed by the file's SHA-256 — the same
identity as the inbox rows and `sga_file.file_hash`. The mail intake archives every attachment it took; the Upload page sends
the raw file to `POST /api/sga/archive` after a successful Apply; `GET /api/sga/file?hash=` returns it; the Travel tab's
"Bills on file" table says kept / not kept / no record. A mail whose file is already loaded is archived and receipted, never
queued again — re-sending a bill to sga@cims.work archives its original without re-applying the month. Code
`src/sga_archive.js`, `archiveSourceFile` in worker.js; pinned by `test/sga_archive.test.js`, `test/mail_intake.test.js`.

The ten workbooks loaded from Miguel's uploads on 15 Oct 2026 (Dec 2025, Jan–Sep 2026) have rows with no `r2_key`: they were
parsed outside the Worker and no tool in that session could carry a 2 MB binary into the bucket. Dragging each once on Upload
data, or emailing it to sga@cims.work, keeps the original.
