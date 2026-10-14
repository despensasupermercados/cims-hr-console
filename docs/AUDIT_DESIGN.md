# Printshop Audit on the HR console — design note (14 Oct 2026, before building)

Miguel, 13 Oct 2026: "we will take this survey and put in a landing page for Dexter to fill in ... audit.cims.work ...
once he selects the company and then selects the ship, you automatically can pull the crew member's name from the
HR console ... the number of the contract with DG3 ... preload what happened to that member in the past so Dexter
can read it ... after question number 5 it's just basic questions, cards that he can select ... Before we do
anything, think about it, strategize it, and give me a mockup."

Mock-up: `docs/mockups/audit_20261014/audit_mockup.html` (the same page is published as a claude.ai artifact).
Nothing in this note is built. The Forms survey itself could not be fetched from the agent's network
(forms.cloud.microsoft is unreachable); every question below is read from the 61-row export.

## What the 61 responses say (Sep 2024 → Sep 2026)

- ~51 real audits, ~10 test rows ("asasa", pasted news text, "ABC Test"). About two audits a month, one auditor.
- Ship is typed: 52 spellings for ~40 hulls ("AD", "CEL - Consellation", "QS - Azamara", "RCG - Vision of the
  Seas"). Crew name typed: 12 blank, first names only (Ryan, Sandra, Kevin, Raymond), one row with two people
  ("Sharene \ Karl"). Contract count typed, 12 blank. None of it joins to the console today.
- Desktop folder (8 boxes), OneNote (2), bookmarks (6): ticked in full on nearly every row. Only the SOPs folder
  varies (present on 26 of 61) — the one box that carried information.
- OBP count: "See attachment" on 46 of 61. Repair items not in OBP: "NA" on 34.
- Four 1–5 ratings (Inventory, Technical, Customer collaterals, HR dispatch/arrival), each with a comment box
  answered "NA" on 15–40 rows. Inventory and Technical are where the 2s and 3s live.
- Machine status: four boxes, always all ticked when answered.
- Tools not on inventory: 2-Fiery back-up HDD missing on 28 rows, print driver thumb drive 11, magnetizer 11.
- Overall rating (1–5): added late, present on 16 rows. Labelled "Ship Overall Operation's Rating".
- Reviewer feedback: the real content. 300–1,500 characters, strengths → "However" → what was agreed. Recurring
  themes: parts past counter life, OBP not updated after part changes, counting from the printer instead of the
  shelf, reliance on service manuals, training not retained, housekeeping, missing head lamp / HDD.
- Files: 52 rows carry SharePoint links (up to 4 per row) under Miguel's personal OneDrive, written by Forms.
- Miguel's own note in row 2 (10 Sep 2024): "remove ERGO, add list of missing training, uniforms, coveralls, DG3
  shirt, perhaps HON" — never added to the form.

## Phase A · before the visit (Miguel, 14 Oct 2026: "without that completion, I don't want him to start the audit")

Miguel's addition, in his order: Dexter picks the ship, picks the person, reads everything the console holds, then
**creates a request**. The request emails the seafarer to upload, within 24 hours, for every machine in the printshop:
**Pattern 43** (the 12-page test pattern the C4070 prints, scanned as one PDF), the **Management List** (the machine's
own report, three documents; the life percentages are read from the third — Brain rec0kJ0u8LI0pePrd,
recXWOTyJnXS923Wc), and a **full inventory count** (the OBP lines, today's counted quantity typed per line). When the
seafarer has sent everything, Dexter is told; the console writes the **pre-visit report** to Ray, Rolando, Ohji,
Jonathan and Miguel (Dexter in copy): every part over 100 % life from the Management Lists, with on-board and on-order
against it ("will be missing" when neither), any Ordering Schedule due date missed, every machine the crew reported
down. Only then does the audit open, from the link in that report, under Dexter's login. The count is not graded:
it pre-fills Dexter's Inventory step for him to confirm on the shelf. The parts past life pre-fill the Machines step.

- **Addressing** (Miguel, 14 Oct 2026: "use the ship email and his personal email, but display the ship email only;
  his personal email gets a copy"): To = the ship's printshop mailbox, Cc = the crew record's personal email, Rolando
  and Ray. The screen and the record show the ship mailbox only; the personal address is never displayed.
  **The ship mailboxes already exist** (Miguel: "the emails you have in the Brain, inside the apps we built"): the
  fleet email directory of cims-timecard, D1 `ae52e15f-…`, table `ship_contact`, 188 rows, all 48 ships — the
  printer-specialist mailbox per hull is role `printer_specialist` (30 Royal, @rccl.com), `printer` (14 Celebrity,
  @celebritycruises.com), `printer_manager` (4 Azamara, @azamaraships.com) (Brain recPHlvv1wzYOEFzg). The audit reads
  that table over a service binding, one source, never a copy typed into `sbm_config`. The record carries a caveat to
  check first: 55 rows sit at `@celebrity.com` rather than `@celebritycruises.com`. No mailbox for the hull → sent to
  the personal email alone and Dexter told so; neither on file → the request is blocked, never guessed.
- **The count is blind** (Miguel, 14 Oct 2026: "display in the upload landing page all items the crew has available in
  the OBP portal, so he can enter the total; don't show him what is on hand; allow him to count blind and report").
  The sheet lists every item the ship carries in OBP (part number, description, the portal's own grouping and order,
  from the nightly OBP export in cims-hon) and nothing else: no on-hand figure anywhere on the page, before or after
  submission. The crew counts the shelf and types the total per line; 0 is an answer, blank is not, and the sheet is
  complete only when every line has a number. "Found something not on the list" adds a line (part and count) — those
  become the audit's "repair items not in OBP" for Dexter to confirm. Saves line by line, resumes on the same link,
  works on the phone in the store (numeric keypad, "next uncounted"). After submission the console diffs counted vs
  the OBP export of the same night: the lines that differ pre-fill Dexter's Inventory step and go into the pre-visit
  report as facts, with Miguel's 1 Oct rule noted (a one-unit gap on a part just consumed is timing until the next
  export says otherwise). The crew never sees the diff: showing it would let OBP be "fixed" before Dexter arrives,
  and the audit is about the real state. The count is the ship's: one per visit, reused for a second specialist.
- **The seafarer's page is the HON upload, reused**: a signed single-use link, no login (like /fb and /sbm), one row
  per document per machine from the machine register, each file checked as it lands (size above zero, 12 pages, four
  channels for Pattern 43; a bad scan asked for again on the spot), scans shrunk client-side to 2–5 MB because a 64 MB
  scan does not cross a satellite link (Brain recp1N5c3hEqQ7wTW). Each upload saves on its own; the link keeps working
  to the deadline. **Machine down**: the crew marks the machine with a reason; that counts as explained, the report
  says so, and the audit's Machines step marks it "verify on board" — Dexter must touch it.
- **The gate**: no request, no audit. Resend and Extend 24 h are Dexter's; "start anyway" does not exist. At 24 hours
  with gaps: a reminder to the crew and Dexter told; the audit stays locked.
- **The email is a whole assessment, not a table** (Miguel, 14 Oct 2026: "what I need is YOUR assessment of reading
  the Pattern 43 and the Management List, as well look at the inventory and due dates for that ship; I need a whole
  assessment on that email"). Shape: one verdict band (Good / Attention / Critical) and a paragraph that says what
  matters most; then **1 · Machines**, a card per machine with the Pattern 43 reading in Rolando's grammar (white
  dots, lines, short density, mix-page channel isolation; feed direction derived, never assumed; fidelity stated,
  never guessed) with a stated confidence, the Management List reading, and each part past life as a row with a life
  bar, on board / on order chips and a verdict sentence; **2 · Inventory**, the blind count against the OBP export of
  the same night, each gap with its reading (timing per the 1 Oct rule, OBP lagging, unrecorded receipt, item outside
  the system) and an assessment of the OBP discipline; **3 · Ordering and due dates**, the Ordering Schedule slot
  missed (no PO, Ray's rule), the next due date and what belongs on it, run-out before the next container from the
  fleet burn rate, and the parts that cannot wait (a rush there is a crew ordering failure under Ray's window, said
  as a fact); **4 · For the visit**, a numbered list of what Dexter walks in to do with the owner of each item; the
  audit button; and a method footer that says, per source, how it was read and how sure it is.
- **Copy quality decides, not the counter** (Miguel, 14 Oct 2026: "we don't ask people to replace items until copy
  quality is affected; we tell them when it is happening; the decision is made when copy quality is affected"). A part
  past 100 % on the Management List is reported as information, never as a replacement by itself. The assessment
  joins it to the Pattern 43 reading of the same machine: a defect that points to the part (banding → transfer belt,
  white dots → drum, short density → developer) makes it "Copy affected · replace"; no defect makes it "Copy fine ·
  keep running", and the only question then is whether the replacement is on board or ordered for when it goes.
  "Will be missing" is retired: the phrase is "none on board for when it goes". In the audit's Machines step the
  Test pattern cell carries the finding and a Past life cell carries the information, amber. A first cut of the
  assessment told Dexter to replace three parts on counters alone; that was the console deciding what Miguel's rule
  reserves for copy quality, and it is corrected in v5.
- **Pattern 43 is assessed, provisionally — this reverses the 1 Oct decision on Miguel's word.** The Brain's record
  of 1 Oct 2026 (recnTfj9bYmsGruys) says the automated vision read failed on 3 of 7 fleet bundles (Navigator missed
  the cyan banding; Anthem invented a line on six pages; Odyssey missed, misplaced and invented) and nothing from it
  reaches a record until the reader is calibrated on Rolando's labelled bundles. Miguel's ask of 14 Oct puts the
  reading in the email. The way through: every Pattern 43 reading is labelled provisional with its confidence,
  Rolando confirms it before anyone acts on it, and his confirmations and corrections ARE the calibration set (the
  HON four-loop learning architecture, recE6buLC658S1lkA: capture, store with evidence, retrieve similar cases,
  human-gated promotion). The Management List percentages are read as text, deterministic, and need no such caveat.
  To be written to the Brain as Miguel's call once he confirms.
- **Where the reading runs: HON** (recommended). The machine register (247 machines, serials), the nightly OBP
  export, the open-orders list (intransititems), the Ordering Schedule due dates and the Pattern 43 upload checks all
  live in cims-hon today. The HR console owns the request, the gate and the audit; HON owns the upload page and the
  reading and hands the result back over a service binding. Building it twice in the HR console is the alternative.
  Caveat: HON's assessment email has never fired in production (zero signed handovers, recf2jsHwZYKMGeJZ); this
  would be its first live use.
- **A visit on a ship with two specialists**: one request per visit, addressed to the specialist Dexter audits; the
  machine documents are the ship's, the count is the ship's, so a second audit on the same visit reuses them.

## Phase B · on the ship

1. **Pick the ship** — vessel table, by brand, with who is aboard per the TDG file and the last audit date/ratings.
2. **Before you walk in** — crew aboard (contract number from the console's count, day N of the contract, projected
   sign-off, document lapses), the last audit on this ship with its "to improve" points as fixed / still open, the
   crew's earlier audits anywhere, and what the console already holds: Ray's latest window (rush order, on-time,
   accuracy, par, inventory audit), Rolando's, the shipboard manager review, field intel. Facts only; no score,
   no bonus figure on the page.
3. **The audit** — six cards: Workstation (checklists start full, tap what is missing), Hardware & machines (labels
   Y/N; per machine pass/finding, parts past counter life as its own field), Inventory (Accurate / Discrepancies
   + lines part·OBP·counted, repair items as a list, photos beside the finding), Ratings (four cards, 3 or below
   needs one sentence), Crew (training needed, uniform & PPE, HON app in use, optional mono click %), Overall
   (rating, reviewer feedback as strengths / to improve / agreed, recommend for Oasis/Icon, follow-up to a named
   person by a date). Autosaved draft; date stamped on filing.
4. **Filed** — audit card on the crew profile ("What people said"), follow-up as its own record (owner, due date,
   fixed / still open at the next visit) mirrored as a line in the profile — not a `crew_note_log` row, which has
   no owner or due date,
   files in the bucket under ship / date / audit id, summary email to Miguel with Rita, Ray, Rolando in copy,
   open points carried to the next audit of that ship or crew. Never sent to the crew; never read by the bonus.

## Mobile first (v3, 14 Oct 2026, after a render review at 390px)

The v2 mock-up failed its own phone render: the audit was one 3,000px scroll with the File button at the end, chips
28px tall in a cloud of twelve, machine checks as 10px tags, and a CSS bug that drew the scale anchors as two empty
boxes. v3 is a stepper: seven steps, one per screen, the step name in the header, a progress line, Back and Next in
a bottom bar. Rules the build is held to:
- **Works without signal.** Ship Wi-Fi drops. The draft is saved on the phone at every tap (IndexedDB), photos queue,
  the audit can be FILED offline and syncs when the phone sees the server; a strip at the top says which state the
  phone is in. This makes the app an installable PWA with a service worker and an upload queue, not a plain page.
- **Photos are the evidence.** A full-width Take photo button on every step that takes evidence; photos shrunk on
  the phone before upload (longest side 1600px, ~300 KB); each tagged with its step and machine.
- **One tap when nothing is wrong.** Every checklist step starts clean (All present / Pass / Accurate / Nothing
  missing). A clean ship is seven taps, three ratings and three short sentences.
- **Thumb sizes.** Rows 52px, chips 40px, rating squares 54px, bottom buttons 52px, text inputs 16px (no iOS zoom).
  Back top-left, the next action in the bottom bar, always the same place.
- **A required answer holds Next with the reason under the field**, never a failure at the end.
- **The reviewer feedback is three short boxes** (strengths · to improve · agreed with the crew), not one long one;
  the keyboard's mic dictates.
- **The dispatch / arrival question lives on the Crew step** and goes to Rita; the Ratings step holds the three
  ratings about the specialist.
- **The laptop view is the same column**, 560px wide, centred. Nothing else to design.

## Architecture (recommendation)

- **Same worker.** `audit.cims.work` as a second custom domain on `cims-hr-console`, the page chosen by hostname and
  also served at `cims.work/audit`. Same D1, same magic-link login (the link is built on `url.origin`, so a login
  asked from audit.cims.work lands there; Dexter is on the allowlist), same mailer. A separate worker would need a
  service binding plus copies of the crew / ship / contract readers, for one user and ~50 records a year.
  **The domain is added in the dashboard, not in wrangler.toml** (self-review, 14 Oct): cims.work is attached in the
  dashboard and wrangler.toml declares no routes; a deploy that declares custom domains replaces the worker's
  domain list with what it declares, so a config carrying only audit.cims.work would detach cims.work. Dashboard:
  Workers & Pages → cims-hr-console → Settings → Domains & Routes → Add → Custom domain → `audit.cims.work`.
- **Modules, not inline:** `src/audit.js` (pure: the question set, scoring none, the import mapping), routes inside
  the error boundary (§11), reads in one wave (§12), `test/audit.test.js` pins it.
- **Storage:** D1 tables `audit_visit` / `audit_item` / `audit_file` (append-only, edits versioned); files in an R2
  bucket bound as `AUDIT_FILES`, keyed `<ship>/<date>/<audit id>/<file>`, served behind the session. Not GitHub.
  Note: an R2 bucket `cims-audit-evidence` already exists in the account (created 8 Jul 2026) with no Brain
  record of its owner — reuse it only once Miguel says it is this project's.
- **Import of the 61:** dry-run review like every other import — test rows dropped and named, ship codes mapped
  to the vessel table, names through the identity ladder (`keymanimport.buildBridge`), ambiguous rows listed for
  Dexter, two-person rows split. First-name-only rows (Ryan, Sandra, Kevin, Raymond, Haziel) stay "name only"
  until Dexter picks: the console's schedule does not reach back to 2024, so it cannot suggest who was aboard.
  The SharePoint files need a one-time zip export of the Forms folder; most are named by machine serial and
  timestamp (`S011021355_2510231514000…`), the machines' own counter / inventory exports, so each can be attached
  to its machine where the console knows the serial.
- **Money (§1):** the audit is qualitative, like intel (§10). Phase 1 shows the overall rating on the profile as a
  fact and touches nothing on the Score Card page. Phase 2 pre-fills Dexter's contributor window
  (`feedback_response2`, role dexter: mono click %, inventory, technical, overall) the way the shipboard review
  pre-fills sEval (`src/seval.js`: auto pre-fills, manual wins, never commits). Phase 2 writes a bonus input and is
  a money PR for Miguel — and it should follow phase 1 within the fortnight, because until it ships Dexter enters
  the same facts twice (the audit, then his window for the scoring queue). **Never sEval:** the overall rating must
  not become the supervisor evaluation — a 2 there is a bonus gate (`eval_below_3`), and the GSM review already
  feeds it; double-counting one visit into a gate is the wrong design.
- **HR · TDG dispatch / arrival** is feedback on the dispatch (travel, hotel, joining), not on the specialist: it
  files on the contract's travel record and reaches Rita; it stays out of the crew's evaluation.
- **Dates:** stamped twice (opened, filed) — a visit often runs two or three days; the record reads "Visit Oct 12–14".
- **Contract number** is shown as both numbers ("3 completed, on contract 4"): the typed field mixed them (Vivien
  Medidas, Harmony Nov 2024: typed 1, text says "now on her second contract"; Allen Cedilla, Liberty: typed 2,
  text says "second contract").
- **Auditor = the logged-in user**, recorded on the record; nothing assumes Dexter. The Brain names the single
  auditor as a structural risk (rec4pbllraTBMDEdI).
- **A crew the file does not have aboard** (Jewel, Xcel, a joiner before the next upload): "pick from all crew",
  and the row is listed for Rita like any other file disagreement (§6). The console never moves the crew.
- **The briefing and anchoring:** the last audit's open points come first (he checks them). Ray's window, the GSM
  review and intel are folded under "What others said", opened on tap, so they do not lead the rating. Miguel's call.

## Mock-up v5 (14 Oct 2026, evening): the light pass and the missing screens

Miguel: "review all the cards pixel by pixel, fresh and light; phone first, but the web version must look and feel
similar; people don't read; then review the logic and build what is missing for us to build the app later."
- **Lighter**: hairlines at lower contrast, shadows softer, one weight of bold, radius 14 on cards / 28 on the phone,
  captions one line, hints one line, colour only on a finding, selection in navy. The seafarer's and assessment emails
  cut to what a reader needs; the assessment keeps its four sections and the method footer.
- **Added screens**: **W1** the same app on a laptop (rail: In progress · Ships · History · Open follow-ups; the phone
  column in the middle; the pre-visit assessment and the last visit's open points on the right); **R1** Rolando
  confirms or corrects each Pattern 43 reading from one link in the assessment (Confirm / Correct / Cannot tell, the
  six-rule chips and a line; corrections replace the console's reading and feed the calibration set); **P1** the audit
  card on the crew profile under What people said (ratings, To improve, Agreed, follow-up state, links; the earlier
  audits and the open follow-up row beside it); **I1** the import review of the 61 Forms audits (settled / for Dexter /
  dropped / files; a zip of the Forms folder; Apply holds the rows Dexter has not settled).
- **Logic closed in this pass**: the request's 24-hour state (reminder, strip turns red, Dexter told, Resend / Extend);
  a visit with two specialists shares the request's documents and the count; the auditor is the login; the dispatch
  rating leaves the evaluation; the overdue follow-up shows "2nd time" on the next visit.

## Build spec (what the build session needs; nothing here is built)

**Where it runs.** The `cims-hr-console` Worker. Host `audit.cims.work` (added in the dashboard) and `cims.work/audit`
serve the audit shell; `/audit/*` pages, `/api/audit/*` routes inside the fetch handler's error boundary (§11), session
auth as today (Dexter is on the allowlist; the auditor is `session.email`). The shell is an installable PWA: manifest,
service worker scoped to `/audit/`, IndexedDB draft, upload queue, client-side image shrink.

**Bindings** (wrangler.toml): D1 `DB` (exists) · R2 `AUDIT_FILES` → the bucket Miguel names (decision 3) · service
`HON` → `cims-hon` (worker `1eb812649e3c4bc1b9d751b2ab717ff9`, D1 `cims-hon` `7b4387c8-…`): machine register by hull
and serial, OBP lines and on-hand per ship, open orders, Ordering Schedule due dates and POs, the Pattern 43 upload
checks and the readings, the Management List read · service `TIMECARD` → `cims-timecard` (worker `aeb577e3…`, D1
`ae52e15f-…`): `ship_contact` mailboxes by hull and role · `MAILER` (exists). Each cross-worker read is one request
per wave (§12), never a chain. Both target workers need a small authenticated route for it; the HON side is a
separate repo and needs its own session (`add_repo` cims-hon).

**Tables** (migration `0024_audit.sql`, idempotent, mirrored in an `ensureAudit` under `memoEnsure`):
- `audit_visit` (id, ship, auditor, opened_at, filed_at, status draft|filed, request_id)
- `audit_eval` (visit_id, agency_id, r_inventory, r_technical, r_collaterals, r_overall, r_dispatch, why_inventory …,
  strengths, improve, agreed, recommend_block 0|1, mono_pct, training_json, ppe_json, hon_in_use)
- `audit_check` (visit_id, grp, item, state present|missing) · `audit_machine` (visit_id, serial, checks_json,
  finding_json, state pass|finding|down) · `audit_obp` (visit_id, part_no, obp_qty, counted, source crew|dexter,
  confirmed 0|1) · `audit_tool` (visit_id, tool, missing) · `audit_file` (visit_id, step, serial, r2_key, bytes,
  taken_at, uploaded_at) · `audit_followup` (id, agency_id, visit_id, owner, due, text, status open|fixed,
  closed_visit_id)
- `audit_request` (id, visit_id, agency_id, token_hash, to_ship, cc_personal, sent_at, due_at, reminded_at, status
  sent|complete|overdue|cancelled) · `audit_upload` (id, request_id, serial, kind p43|mgmt|count, r2_key, pages,
  channels, ok 0|1, down_reason, at) · `audit_count` (request_id, part_no, counted, at) + `audit_count_extra`
  (request_id, text, counted) · `audit_assessment` (request_id, verdict good|attention|critical, body_json, sent_at,
  recipients) · `p43_confirm` (upload_id, by, verdict confirm|correct|unsure, correction_json, at) — the calibration set
- `audit_import_row` (source_row, mapped_ship, mapped_sc, state settled|held|dropped, note) for the 61
Append-only where it records a fact (uploads, assessments, confirmations, filed visits); a filed visit is never
rewritten, a correction is a new row.

**Routes.** Dexter (session): `GET /api/audit/ships` · `GET /api/audit/brief?ship=&sc=` · `POST /api/audit/request` ·
`GET /api/audit/request/:id` · `POST /api/audit/request/:id/resend|extend` · `POST /api/audit/visit` (draft) ·
`PUT /api/audit/visit/:id/step/:n` · `POST /api/audit/visit/:id/file` · `POST /api/audit/file` (R2 put, returns key) ·
`GET /api/audit/history` · `POST /api/audit/import` (dry run / apply) · `POST /api/audit/followup/:id/close`. Public,
token-auth like /fb and /sbm: `GET /audit/u?t=` (the upload page) · `POST /api/audit/u/upload` · `POST /api/audit/u/count`
· `POST /api/audit/u/down` · `GET /audit/p43?t=` and `POST /api/audit/p43/confirm` (Rolando). Every page states its
state on failure (§11).

**Emails** (CIMS letterhead, through `MAILER`): `hr.audit.request.v1` (to the ship mailbox, cc personal + Rolando +
Ray) · `hr.audit.reminder.v1` (12 h and 24 h) · `hr.audit.assessment.v1` (Ray, Rolando, Ohji, Jonathan, Miguel; cc
Dexter) · `hr.audit.filed.v1` (Miguel; cc Rita, Ray, Rolando) · `hr.audit.dispatch.v1` (Rita). Recipients are
configuration (`audit_config`), never guessed; a missing address is reported.

**Scheduled.** The hourly `scheduled()` gains an audit sweep: reminders at 12 h, overdue at 24 h (strip red, Dexter
told), requests cancelled when a visit is abandoned after 7 days. Idempotent by `(request_id, kind)` like
`auto_send_log`.

**Tests to pin** (`test/audit*.test.js`): the gate (no complete request → no visit); request addressing (ship mailbox
first, personal cc, none → blocked); the blind count (page HTML never carries an on-hand quantity; completeness = every
line numbered; 0 valid); the count diff and the 1 Oct timing rule; the parts-over-life parse from a Management List
sample; the assessment verdict ladder; Pattern 43 readings carry a confidence and are marked provisional until a
`p43_confirm` row; the audit module never imports `bonus.js` and the statement / crew email never print an audit;
import mapping of the 61 (ship codes, the identity ladder, two-person rows, test rows); wrangler bindings present;
the hot routes fire one wave (§12 static guard).

**Connectors verified 14 Oct 2026.** Cloudflare (workers and D1 above, R2: `cims-audit-evidence` exists) · GitHub as
`despensasupermercados`, scope `cims-hr-console` (the HON and timecard repos need `add_repo`) · the Brain · the mailer
binding. Still needed from Miguel: Jonathan's address, the bucket, the zip, the phone, the offline confirmation.

## Decisions needed from Miguel

1. One audit per crew within a visit (recommended) or one per ship.
2. Overall rating: profile card only (phase 1) now; Score Card pre-fill (phase 2) later, or never.
3. The bucket: reuse `cims-audit-evidence` or create `cims-audit-files`.
4. audit.cims.work on the HR console worker (recommended) or a separate worker; the domain added in the dashboard.
5. The zip export of the Forms files for the import.
6. Readers: Miguel, Rita, Ray, Rolando read; the crew never. Any console user may file an audit (auditor recorded).
7. The briefing: Ray / GSM / intel folded until tapped (recommended), or open on the screen.
8. Phase 2 (Dexter's window pre-filled from the audit) scheduled right after phase 1, or Dexter enters twice.
9. Offline: confirm the app must file without signal (installable PWA, upload queue), and whether the phone is a
   DG3 iPhone or Dexter's own.
10. Jonathan's email address: he is not on the console's allowlist; the report's recipients are configuration.
11. Pattern 43 attached for Rolando, not graded by the console, until the reader is calibrated (Brain, 1 Oct 2026).
12. The reading runs in HON over a service binding (recommended), or is rebuilt inside the HR console.
13. "Due date missed" = an Ordering Schedule date with no PO on file (Ray's rule in HON); confirm. And confirm there is
    no override of the gate at all, not even Miguel's.
