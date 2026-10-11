# Roster export — `GET /api/roster/export`

Read-only endpoint so `cims-timecard` can draw the crew roster instead of
keeping its own copy. Additive; nothing existing changes.

## Status

This branch adds the module and its tests **only**. The route is deliberately
not wired: `src/worker.js` is the live dispatcher for the whole console, and a
blind patch to it is not worth the risk for one line. Merging this branch
changes nothing at runtime.

## Wiring (one line, by a human)

In `src/worker.js`, **before** the session gate — the caller is a Worker, not a
person, so it must not hit the login redirect:

```js
import { apiRosterExport } from './roster_export.js';
// ...
if (p === '/api/roster/export') return apiRosterExport(request, env);
```

Then:

```bash
wrangler secret put ROSTER_KEY        # same value on cims-timecard
```

Staging first (`cims-hr-console-staging`), then prod on Miguel's approval.

## Why a service binding *and* a header key

The timecard Worker declares `[[services]] binding = "HR"`. Service bindings
are not reachable from the public internet, so the endpoint is double-guarded:
unreachable externally, key-checked internally. Same posture as `cims-order`'s
`ORDER_API` binding.

## What leaves — and what must never

Exported: `ship_crew_id`, `agency_id`, first/last name, rank, ship, brand,
status, email, sign-on and sign-off dates.

Not exported, and enforced by a test: passport, SIRB, medical, Schengen and US
visa numbers or expiries, DOB, phone, province, baseline count, notes. The
timecard app has no use for them, and every exported field is a field that can
leak.

## Source discipline

Precedence, per crew (the doc above this section predates all of it and is
kept for its history; the code comments in `src/roster_export.js` are the
reference):

1. **Contract Counter** current leg (`counter_legs.COUNTER_LEG_SELECT`), with
   Rita's recorded edit applied by the board's own pair (`editFor` +
   `resolveLeg`, newer write wins).
2. **Relief board**: an in-force `assignment` (started, not signed off) where
   the Counter has no current leg.
3. **The TDG file** (`registry_snapshot`, since 11 Oct 2026): a crew the latest
   AdvancedQuery has **On board**, with an EMBARKEDDATE already passed and a
   vessel that resolves to a hull in `vessel` (via `shipname.js`), is placed on
   that hull from that date when (1) and (2) give no sign-on, or when the
   file's embark is **strictly later** than theirs. Sign-off is the file's
   DEBARKEDDATE or nothing. A tie keeps (1)/(2), Rita's sign-off included.
   Why: on 8 Oct 2026 the in-force assignments were rebuilt and seventeen
   printers TDG had aboard left this endpoint with no ship — cims-timecard
   counted 30 ships owing a card against 47.

- `crew_override` always wins for identity fields — but only when `retired = 0`.
- `crew.redacted = 0` respects the `redact_crew()` seam.
- Nothing is written; `EXPORT_FIELDS` is the only thing that can leave.

## Coverage counters

The response includes a `coverage` block alongside `crew`:

```json
{ "total": 0, "on_board": 0, "on_board_without_ship_crew_id": 0,
  "on_board_without_email": 0, "on_board_without_current_leg": 0 }
```

The timecard app matches a crew member to their Kronos card by `ship_crew_id`.
Someone without one cannot be matched, so they drop out of the denominator
silently — and "9 of 41 submitted" then reads as good news when it is actually
an unknown. The counters make that gap visible instead.
