---
name: brain-keeper
description: Write to Miguel San Martin's Brain so every other app and session can use what this one learned. Use it WHENEVER a session in his CIMS estate ships a change, merges or deploys, changes production data, gets a decision or correction from Miguel, finds a lesson, or finishes a piece of work, and always before the session ends, even when nobody mentions the Brain. Also use it when Miguel says "save this", "put it in the brain", "remember this" or "other sessions should know". It is the write side of `brain-recall` (read before you answer); the daily digest review is the `brain` skill.
---

# Brain Keeper: write so the next app can use it

Miguel, 20 Oct 2026 (Brain recSxVe1ezl3ECmDh):

> "the brain should always know what's happening. Because we are saving across
> multiple applications and multiple sessions ... whatever I'm saving on the brain,
> or whatever you're saving on the brain, should always be looking to the future as
> to how these can be used in another application ... whatever it is that you are
> saving, it should have everything and more."

The failure this skill prevents has already happened. The HR Console's brief stopped
on 11 Oct and its open items on 7 Oct. A week of shipped work (Crew Hub, welcome
email, audit app, Travel, Score Card) was in logs no one reads first. A new session
asking "what does the HR console do" got a September answer.

## When

- After every merge plus deploy proof, every production data change, and every
  decision Miguel gives. Write it in the same session, never "later".
- Before ending any session that changed something. A session that changed something
  and wrote nothing is not finished.

## Where things live (CIMS register, Airtable base `app2OLcIjn8LgYWW9`)

**Entities** `tblZ9puD1PUqVCsjc`: one row per subject. Fields:

| Field | ID | Notes |
|---|---|---|
| canonical_name | `fldS60tF0sIdhmImD` | |
| aliases | `fldaly9sCHL2R6uYb` | One per line. |
| brief | `fldUF5Evk5Z7zIYNJ` | The map. |
| open_items | `fld3HH4eVPB7hafII` | |
| ledger | `fldXnVl1XZ3IcyW3t` | Append-only. The nightly writes it; never hand-edit. |
| last_movement | `fldKvmUnb8TVSEMit` | |

**Context** `tblnVZyqGE08rGv17`: the records. Fields:

| Field | ID | Notes |
|---|---|---|
| Title | `fldgBWVI49wBG5B5p` | |
| Body | `fldCQWt9sQ5eYaMtb` | |
| Status | `fldXMjCureRcSS9bV` | Active, Archived or Reference. |
| Date Logged | `fldvXLhGmvMo7RFQK` | |

**Change Log** `tblAcxLhXkKRlQ44E`: one row per hand edit to an entity or record.
- Entry ID is `CL-YYYY-MM-DD-THREAD-NN`.
- Fields: Before `fldWAQ0nPyBkGaDQl`, After `fldym4az8Xb1sE2lO`, Reason `fldBHtj5FmHeLgcrF`.

Write with field IDs, never names.

Main subjects:
- CIMS HR Console `recxv2qIHj4vShj5P`
- CIMS Brain `reczbPycE3yvb5B8J`
- Brain Correction Protocol `recqF3Ba35BbrJoB7`
- Entity Resolution Protocol `recl16K1kSNglJ7Wf`

The `brain_correct` tool writes a Context record linked to an existing subject. It
never creates a subject. If the subject does not resolve, use the nearest existing
one and name the topic in the text.

Despensa is a separate brain. Nothing here writes to it, and the two registers never
cross.

## Pick the record type

| What happened | Write | How |
|---|---|---|
| Miguel ruled, decided, corrected | correction | `brain_correct`, his words verbatim + date + what it replaces; `supersedes` when it replaces one record |
| Work done: PRs, deploys, data changes, a state snapshot | log | `brain_correct` with `kind: "log"` (never a correction: it pushes his rulings out of the read-first six) |
| How something works: hosts, routes, tables, IDs, sources, owners | Reference | Airtable create on Context, Status `Reference` |
| A lesson (a mistake not to repeat, a mechanic that works) | log, or a line in the subject's lessons record | name the failure and the fix |

## Write for the next app, not this one

Every record must work cold for a stranger in another app or session. Include:
- **What and where.** The system, the repo, the host / URL / route, the D1 table and
  columns, the record or row IDs.
- **Where the truth lives.** The source of truth versus a copy or a derived read.
- **The rule and its owner.** Who decides, in his words when he gave them, with the
  date.
- **Limits.** What it must never be used for (money, crew-facing, billing). What is
  not built yet.
- **How to reuse it.** The route to call, the module to import, the table to read.

Banned: "as above", "the thing we did", "his" or "it" without a name, a date without a
year, and a claim without a record id.

## Keep the subject current

When the state changes:

1. **Update the brief.**
   - What the subject is and how it works now, with a record id on every line.
   - Start with "Rewritten by hand <date>, replacing <date>" so the age is visible.
   - End it with `[hand YYYY-MM-DD]` on its own line. The nightly never rewrites
     a brief without its own `[auto ...]` stamp, so a hand brief is yours to keep
     current. The stamp lets every read say how old it is and whether the
     subject has moved since (the-brain PR, 20 Oct 2026). Without it, a read says
     the age is unknown.
2. **Update open_items.**
   - One line per item: `[OPEN · owner · topic]`, the next date, the record id.
   - Drop what closed. History stays in the ledger and logs.
3. **Supersede, don't stack.**
   - A record a newer decision contradicts gets Status `Archived` and a title prefix
     `[SUPERSEDED <date> by recX]`.
   - Never delete a record.
4. **Log the hand edit.**
   - Every hand edit of brief, open_items, aliases or a record's status gets a Change
     Log row.
   - The row carries the full Before text, so nothing is lost.
5. **Add aliases.**
   - Add each new name Miguel uses for the subject.
   - First list every entity's aliases and check that none already holds it. A shared
     alias makes the resolver ambiguous; on 20 Oct "SGA" already belonged to SGA
     (Seafarer Cost Source).
   - Never create a subject without his yes.

6. **Check every citation you carry forward.**
   - Before copying a record id from an old brief into a new one, check its Status.
   - An Archived id re-asserts the fact it was archived for. On 20 Oct
     recQvCOBEB3HGFUK1 made a rewritten brief say branch control was still open; it
     had been done on 11 Oct (reclnkyXU7axfAAvH).
   - `brain_ask` lists a subject's archived ids under "archived (superseded)".

## Never

- Secrets: no keys, tokens, passwords or signed links in any record.
- Inventing a fact to fill a field. "Not recorded" is a valid value.
- Crossing CIMS and Despensa.

## Before you end the session

- [ ] Every ruling Miguel gave today is a correction, verbatim.
- [ ] Every merge / deploy / data change is in a log with PR numbers, commits, what
      was proven live and how.
- [ ] How-it-works knowledge a future app would need is a Reference record.
- [ ] The subject's brief and open_items match what is true now.
- [ ] Stale records are archived; hand edits have Change Log rows.
- [ ] New phrasings are aliases, with no collision.
- [ ] `brain_ask` answers a question a future session would ask, correctly, citing
      the new records. If it does not, fix the record, not the question.
- [ ] Tell Miguel in two lines what was saved and which record ids.
