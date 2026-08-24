# Crew status: why the roster froze, and what changed

_Incident note, 2026-08-24. Companion to `CREW_IMPORT_DECISIONS.md` (decisions D6, D7)._

## What happened

The Fleet Document Radar of Monday 24 August 2026 went out to Rita, Maryjoy, Joyce (TDG)
and Miguel reporting **22 flagged crew**. Rita replied that the expiry dates were right but
the statuses were not, and listed ten crew by hand. Miguel, reading the report, proposed
retiring five crew as no-longer-earmarked. All five were aboard a ship.

The report was not wrong about documents. It was wrong about **who those people were**.

## Root cause

`crew_review.classifyField()` classified `status` like this:

```js
if (field === "status") {
  return { tier: TIER.CRITICAL, write: true, defaultKeep: true };
}
```

`defaultKeep` means: unless the reviewer explicitly flips this one row to "accept", the
imported value is discarded and the old value stands. Rita imports the TDG `AdvancedQuery.xls`
weekly. Every week roughly thirty crew change status. Every week the importer noticed all
of them, wrote them to `sync_conflict`, and threw them away.

At the point of the incident:

| | |
|---|---|
| Status rows in `sync_conflict` | 198 |
| Of those marked `resolved=1` | 198 |
| Crew whose registry status actually disagreed with the last TDG export | 34 |
| Last real status movement in `crew` | 13–23 July |
| Imports run since (all clean, all by Rita) | 28 Jul, 7 Aug, 14 Aug, 22 Aug |

The audit trail said everything was resolved. Nothing was.

### The second failure: "resolved" meant the wrong thing

`crew_apply.js` wrote `resolved: 1` on a status conflict **whether or not the value was
applied** — "resolved" meant *the reviewer saw it*. That is not a fact anyone can act on. It
made the one table that could have exposed the freeze report the opposite.

### The third failure: identity

`diffCrew()` matched incoming rows on `agency_id` alone. On 14 August the export delivered
two rows keyed on the **cruise-line** crew id (`349195`, `358775`) rather than the SC number.
Both looked brand new and were INSERTed. `349195` was a second copy of
`SC-0040010 Ida Bagus Made Purnama`.

The repo already had the answer: `keymanimport.buildBridge()` had used exactly this
prefer-id-then-fall-back-to-name matching since 1 July, for the Keyman money bridge. The
crew import never adopted it.

### The fourth failure: two-digit years

`normalizeDate()` fell through to `new Date(s)` for unrecognised formats. `new Date("9/22/34")`
returns **1934**-09-22. That is how the duplicate Purnama arrived carrying a passport that
had "lapsed 22 Sep 1934", and how she became the lead line of the email:

> Most urgent: Ida Purnama, PP lapsed 22 Sep 1934.

Her real passport is valid to 2034. A parse artifact outranked every real finding in the report.

## What changed

**D6 — TDG owns `status`; it defaults to ACCEPT.**
`CREW_IMPORT_DECISIONS.md` §C listed an authority for certificates (TDG → accept) and for
ship allocation (Rita → never write). Status was in neither row, and quietly got
ship-treatment. It is now in the table, and it behaves like the certificates it sits beside.
Status remains in the CRITICAL tier — it is still shown prominently and can still be kept
per row — but the default now moves the registry toward the source of truth.

A high-consequence field is an argument for making a change **visible and reversible**, not
for making it hard to apply. A default that requires thirty manual clicks a week to track
reality is not a safety control; it is a guarantee of drift.

**`resolved=1` now means one thing: the registry agrees with the source of truth.**
An applied status closes the conflict. A *kept* status leaves it **open** — the registry
deliberately disagrees with TDG and somebody has to go fix TDG. Anything unresolved is real,
outstanding work.

**D7 — identity is `agency_id` first, cruise-line id second.**
`buildIdentityIndex()` / `resolveExisting()` mirror the Keyman bridge. A row keyed on the
cruise-line id now matches the crew member we already hold, updates them, and raises an open
`identity` flag to get the export corrected. `agency_id` is never rewritten by an import, and
a matched crew member is no longer reported as "departed" on the same run.

**Two-digit years pivot on 70; document dates are sanity-bounded.**
`9/22/34` → `2034-09-22`. Any parsed document date outside 1950–2100 is treated as no date at
all: it shows as MISSING, which is honest, and is still flagged — but it can never again
present as a 90-year-old lapse and displace a real one.

## Repair applied to production, 2026-08-24

Backup: `crew_preclean_20260824` (104 rows). Logged in `activity_log`
(`rep-20260824-status`, `rep-20260824-phantom`).

- **32** crew statuses set to the 22 Aug TDG values.
- **`SC-0038392` De Leon held** — TDG says Inactive, Rita's email says On Vacation. Open flag.
- **`SC-0040153` Olid, `SC-0038401` Osorio** — Rita says On Vacation, the TDG export still says
  On board. Open flags; TDG to be corrected at source.
- **`SC-0046233` Encina skipped** — `redacted=1`, outside the roster and the radar.
- **Purnama duplicate merged.** `SC-0040010` set to On board, confirmed independently by an open
  Keyman contract on *Xcel* (sign-on 26 Apr 2026, no sign-off). Corrupt 1934 passport discarded;
  the real 2034-09-23 retained. Duplicate row deleted — it held no contract or money record.
- **`358775` EMIL RONDY JOSEPH retained** (D4: nothing auto-deletes). `ship_crew_id` set so the
  fixed importer matches rather than duplicates him; open `identity` flag for Rita to supply the
  SC number and the missing passport.

## The rule this cost us

A conflict queue that can be marked resolved without anyone deciding anything is not a
control. **A detected difference must either be applied or stay visibly outstanding — it must
never be parked silently.** Where a queue exists, something must report its depth to a human
on a schedule. That is why the radar footer now prints the reconciliation position instead of
the sentence "accuracy depends on the registry being current".
