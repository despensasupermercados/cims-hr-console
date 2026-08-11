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

- `ship_leg` is the movement source (`is_current = 1 AND ours = 1`). Brand and
  ship short-name come from there, not from a vessel-by-name join.
- `crew_override` always wins — but only when `retired = 0`.
- `crew.redacted = 0` respects the `redact_crew()` seam.
- `keyman_contract3` is never read. Bonus/scoring layer only (P3.13 audit).

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
