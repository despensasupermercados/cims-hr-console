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
4. **Filed** — audit card on the crew profile ("What people said"), follow-up as a dated crew note to its owner,
   files in the bucket under ship / date / audit id, summary email to Miguel with Rita, Ray, Rolando in copy,
   open points carried to the next audit of that ship or crew. Never sent to the crew; never read by the bonus.

## Architecture (recommendation)

- **Same worker.** `audit.cims.work` as a custom domain on `cims-hr-console` (wrangler.toml `routes`, custom
  domain; the next deploy creates the DNS record), the page chosen by hostname and also served at `cims.work/audit`.
  Same D1, same magic-link login (Dexter is on the allowlist), same mailer. A separate worker would need a service
  binding plus copies of the crew / ship / contract readers, for one user and ~50 records a year.
- **Modules, not inline:** `src/audit.js` (pure: the question set, scoring none, the import mapping), routes inside
  the error boundary (§11), reads in one wave (§12), `test/audit.test.js` pins it.
- **Storage:** D1 tables `audit_visit` / `audit_item` / `audit_file` (append-only, edits versioned); files in an R2
  bucket bound as `AUDIT_FILES`, keyed `<ship>/<date>/<audit id>/<file>`, served behind the session. Not GitHub.
  Note: an R2 bucket `cims-audit-evidence` already exists in the account (created 8 Jul 2026) with no Brain
  record of its owner — reuse it only once Miguel says it is this project's.
- **Import of the 61:** dry-run review like every other import — test rows dropped and named, ship codes mapped
  to the vessel table, names through the identity ladder (`keymanimport.buildBridge`), ambiguous rows listed for
  Dexter, two-person rows split. The SharePoint files need a one-time zip export of the Forms folder.
- **Money (§1):** the audit is qualitative, like intel (§10). Phase 1 shows the overall rating on the profile and
  in the Score Card's evidence list as a fact. Phase 2, if Miguel wants it, pre-fills Dexter's contributor window
  (mono click %, inventory, technical, overall) the way the shipboard review pre-fills sEval (`src/seval.js`:
  auto pre-fills, manual wins, never commits). Phase 2 touches a bonus input and is a money PR for Miguel.

## Decisions needed from Miguel

1. One audit per crew within a visit (recommended) or one per ship.
2. Overall rating: profile card only (phase 1) now; Score Card pre-fill (phase 2) later, or never.
3. The bucket: reuse `cims-audit-evidence` or create `cims-audit-files`.
4. audit.cims.work on the HR console worker (recommended) or a separate worker.
5. The zip export of the Forms files for the import.
6. Readers: Dexter files; Miguel, Rita, Ray, Rolando read; the crew never.
