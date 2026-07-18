# Audit → sEval integration (MONEY PR — Miguel + Rita approval required)

**This is a money PR** (`CLAUDE.md` §1): it changes how the Score Card's `sEval` value is
**sourced**. It does **NOT** touch `src/bonus.js` (ladder, weights, FLOOR, gates, payout math)
and never writes `bonus_outcome`. Do not auto-merge.

## What it does
Spec I5: a printshop audit's `supervisor_eval` is THE supervisor evaluation that feeds pay.
This PR makes a **settled** audit eval an additive `auto` source into the existing `seval_state`
(the same field the shipboard review already prefills), reusing the existing precedence:

- **Manual always wins** — a money-user override (`sevalOverride`) is never overwritten by an audit.
- **Audit is authoritative among autos** — once an audit sets the value (`set_by 'audit:<id>'`),
  a later shipboard-review average does **not** overwrite it (`sevalAutoApply` now guards this).
- **Post-commit** audits are recorded + flagged, never affecting the immutable `bonus_outcome`.

New function: `installSeval().sevalApplyAudit(env, agency_id, contract_signoff, value, crew_id, auditId)`.
Golden tests: `test/audit_seval.test.js` (5). Existing `test/seval.test.js` still green (no regression).

## >>> DECISION 1 — you must confirm the policy <<<
Both the **shipboard review** (Rita's SBM instrument) and the **printshop audit** (Dexter) can
source `sEval`. This PR implements **audit-authoritative-among-autos**: the audit wins over a
review, manual wins over both. If instead you want them **averaged**, or the review to win, say so
— it's a one-function change here, pinned by a test. (Recommended: audit wins, per I5 + "only
Dexter's score goes to the scorecard.")

## >>> DECISION 2 — confirm the key mapping <<<
`seval_state` is keyed by **`(agency_id, contract_signoff)`**. The audit stores `contract_id`
(→ `contract.id`) and `scored_crew_id` (→ `crew.id`). The console must map:

- `agency_id` = `crew.agency_id` for the scored crew.
- `contract_signoff` = the contract's **sign-off date** — and it must equal the value the bonus
  uses as `bonus_outcome.span_end` (that's how `isCommitted` matches). Confirm the exact column:
  `assignment.actual_sign_off` (fallback `planned_sign_off`) for the audit's contract, vs. how the
  Score Card derives sign-off today. **A wrong join moves the wrong paycheck** — please verify.

Until both are confirmed, the wiring below stays behind review.

## Wiring (depends on PR #27's `audit_proxy.js`)
In the console, after a successful audit action, call `sevalApplyAudit` for the mapped keys —
**only when the eval is settled** (3/4/5 immediately; a 1/2 only after Miguel confirms, I8):

```js
// on POST /api/audit/submit  → if eval_status === 'settled'
// on POST /api/audit/{id}/eval:confirm  (a 1/2 that Miguel just confirmed)
const { agency_id, contract_signoff, crew_id } = mapAuditToContract(env, contract_id, scored_crew_id);
await _seval.sevalApplyAudit(env, agency_id, contract_signoff, supervisor_eval, crew_id, audit_id);
```
`installSeval` is already constructed in `worker.js` (`const _seval = installSeval({});`).
An audit override (correction, §12.4) re-applies with the corrected value; a pending 1/2 is
**never** applied until confirmed.

## Definition of Done
- [ ] `sevalApplyAudit` applies a settled audit eval as `auto` (`set_by audit:<id>`).
- [ ] Manual override always wins; audit authoritative over a later review.
- [ ] 1/2 audits are applied ONLY after Miguel's confirm (caller-enforced, I8).
- [ ] `bonus.js` unchanged; `bonus_outcome` never written by this path (I5).
- [ ] `test/seval.test.js` + `test/audit_seval.test.js` both green.
- [ ] Decision 1 (precedence) and Decision 2 (key mapping) signed off by Miguel/Rita.
