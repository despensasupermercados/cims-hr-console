-- Bonus policy v2 + the evidence a commit was scored on (Miguel, 16 Oct 2026, asked "the commit does not store the evidence,
-- and policy_version is still 1 though the audit factor now means Dexter's audit": "agree. both").
-- v2 keeps v1's ladder, floor, weights, eval rule, gates and aggregation exactly; what changed is what the 10-point factor
-- `sComm` measures (Dexter's audit, not Communication) and that the Score Card pre-fills from the systems (bonus.js
-- autoScore). v1 is never rewritten; an outcome says which rules scored it. Applied at runtime too (ensureBonusV2).
INSERT OR IGNORE INTO bonus_policy (id,version,effective_at,ladder_json,floor_pct,weights_json,eval_rule,gates_json,agg_policy,notes)
  SELECT 'policy-v2', 2, '2026-10-15', ladder_json, floor_pct, weights_json, eval_rule, gates_json, agg_policy,
    'v1 weights and gates unchanged. sComm = Dexter''s audit (5=10, 4=8, 3 or below=0, none=10, lowest of several), not Communication. The Score Card pre-fills from the Parts Portal (vessel-side misses by the crew who placed them), HON handovers (from 1 Nov 2026), Ray''s answers (all or nothing), field reports (accuracy / par) and Dexter''s audit (bonus.js autoScore, 15-16 Oct 2026).'
  FROM bonus_policy WHERE version = 1;
-- What the systems said when the outcome was committed: the automatic read for the committed span and ships, re-run by the
-- server at commit time (cached AI answers only), with every evidence line and its source. NULL on outcomes before v2.
ALTER TABLE bonus_outcome ADD COLUMN evidence_json TEXT;
