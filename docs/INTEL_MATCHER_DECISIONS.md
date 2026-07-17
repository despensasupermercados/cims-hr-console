# Field Intel — Matcher v2 & Review-Card Search (session memory, 2026-07-17, PRs #62 + #64)

_Why the matcher works the way it does. Companion to the pipeline: email → `email_inbox` →
`matchCrew` (src/crewmatch.js) → `aiSummarize` (src/intelai.js) → `crew_intel` (filed/pending)._

## The live bug that drove this ("Resposo case")
Ray forwarded an Outlook thread about **Michael Resposo** (roster: first_name "Michael Angelo").
The matcher suggested **Joemar De Leon** and **Ohji Miranda** — names from the quoted `To:/Cc:`
headers — and Resposo was not even a candidate. Three causes: (1) quoted-thread headers matched as
content; (2) compound first names required verbatim ("michael angelo"); (3) ambiguity
short-circuited before the last-name pass that would have found Resposo uniquely.

## Locked decisions
- **M1 — Deterministic only.** The WHO never comes from AI or fuzzy scoring; auto-filing requires a
  clean deterministic hit. (rankCrewMatches in maria.js stays chat-search only.)
- **M2 — Fresh-first.** Match the fresh note above the first quoted-thread marker first; a unique
  contiguous name there files HIGH (that is where the reporter names the subject).
- **M3 — Headers are metadata.** `From/To/Cc/Bcc/Sent/Date/Subject:` lines are stripped before
  matching — correspondents are not subjects.
- **M4 — First-name tokens.** Any first-name token ≥3 chars + surname counts ("Michael" satisfies
  "Michael Angelo").
- **M5 — No short-circuit.** Ambiguity → LOW, and candidates include phrase hits, first+last hits
  AND surname hits (deduped, capped 6) so the right person is always a button on the review card.
- **M6 — Human escape hatch.** Every review card has a crew search filing via the same
  `/api/intel/resolve` (roster ships with `/api/intel/review`). **Layout (PR #64, Miguel's call):
  ONE action row** — candidate buttons → compact "🔍 Search crew…" input (top-4 inline results) →
  Discard right-aligned. Suggestions are stored snapshots; the search covers stale/empty ones.

## Where filed intel DISPLAYS (Miguel tripped on this)
Crew profile page does NOT show field intel. It lives in the **"Notes & field intel" modal**,
opened from the **🗒 notes icon** in the crew card tools row (Crew tab). Candidate improvement
(not built): surface a Field intel section on the profile page next to Manager Feedback, reusing
`/api/intel/crew` + `intelCard`.

## Notes
- Tests: test/crewmatch.test.js — 8 legacy behaviors + 4 v2 cases incl. the exact forwarded thread.
- Old pending rows keep their stored candidates; fix via the search box (no backfill run).
- Hygiene rule in force: applied `apply/*.json` specs are pruned (see DATA_PAGE_BUILD_STATUS.md
  lesson 2 — never write a spec block where OLD ⊂ NEW).
