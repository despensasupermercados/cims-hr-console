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

## The design

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
