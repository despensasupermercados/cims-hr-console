// THE NIGHT WATCH'S MERGE GATE (Miguel, 16 Oct 2026: the night watch may merge "small fixes"). The watcher may merge its
// own fix ONLY when this script, run on the PR's diff, prints MERGE_OK. Anything else is a draft PR for Miguel. The rule is
// a check, not a paragraph: CLAUDE.md §5 and docs/NIGHT_WATCH.md point here.
//
//   node scripts/night_merge_gate.mjs <base-ref> [<head-ref>]      (default head: HEAD)
//
// CI green on the PR head, the full suite green, and the failing-first test are the watcher's to prove BEFORE running
// this; this gate judges only what the diff touches and how big it is.
import { execFileSync } from "node:child_process";

// money (§1), auth, schema, deploy config, workflows, email templates (an email ships only after Miguel signs off its
// render), dependencies (their own whitelist line), and the TDG imports that write crew data
export const NEVER = [
  [/^src\/bonus\.js$/, "money: bonus.js (§1)"],
  [/bonus/i, "money: a bonus file (§1)"],
  [/^src\/score_auto\.js$/, "money: the Score Card read (§1)"],
  [/^src\/seval\.js$/, "money: the supervisor evaluation (§1)"],
  [/^src\/(auth|policy|session)[^/]*\.js$/, "auth"],
  [/^migrations\//, "schema: a migration"],
  [/^wrangler\.toml$/, "deploy config"],
  [/^\.github\//, "CI workflows"],
  [/^src\/emails\//, "an email template (Miguel signs off the render)"],
  [/^package(-lock)?\.json$/, "dependencies"],
  [/^src\/(crewimport|keymanimport|contract_count|counter_sync|registry_sync|crew_import[^/]*)\.js$/, "crew data: a TDG import path"],
  [/^src\/(intelai|crewmatch|intel[^/]*)\.js$/, "crew data: what is filed on a seafarer's record, and on whom (§10)"],
];
// a D1 write or schema statement added or changed anywhere in src/ = crew data or schema, never the watcher's to merge
export const WRITE_RX = /\b(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|REPLACE\s+INTO|CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX))\b/i;
export const MAX_SRC_LINES = 120;
// THE MONEY AND AUTH PATHS LIVE INSIDE worker.js TOO (night watch, 17 Oct 2026). A change to apiBonusCrew — which contract
// the Score Card opens on (PR #281) — printed MERGE_OK because only the FILE was judged, and worker.js is nobody's file. A
// hunk in any src/ file is also judged by the function it lands in (git's hunk header names it) and by the symbols its
// lines name: the bonus / Score Card / feedback-window / supervisor-evaluation path (§1) and the sign-in / session path.
export const MONEY_RX = /\b(apiBonus\w*|computeBonusC?|mapFeedbackToScore|autoScore|auditPoints|ladderValue|crewCount|effectiveBaseline|resolveBaseline|commitEvidence|gatherAuto|listAudits|defaultScoreLeg|classifyWindow|apiScore\w*|apiFeedback\w*|loadFeedbackState|feedbackSubmittable|openScore|ledgerScore|commitBonus|applyAuto|applyFeedback|applySeval|recalcScore|sevalDirty|viewSeval|installSeval|seval\w*|bonus_outcome|bonus_policy|POLICY_VERSION|baseline_count|MONEY_USERS|isMoneyUser)\b/;
export const AUTH_RX = /\b(signToken|verifyToken|SESSION_SECRET|BOOTSTRAP_KEY|SESSION_TTL|stillAllowed|cookieDomain|getCookie|apiLogin|apiLogout|magicLink\w*|allowlist\w*|ALLOWLIST)\b/;

// files: [{ path, added: [lines], removed: [lines] }] → { ok, reasons, srcLines }
export function judge(files) {
  const reasons = [];
  let srcLines = 0;
  for (const f of files) {
    for (const [rx, why] of NEVER) if (rx.test(f.path)) { reasons.push(f.path + " — " + why); break; }
    if (f.path.startsWith("src/")) {
      srcLines += f.added.length + f.removed.length;
      const lines = [...f.added, ...f.removed], where = [...(f.ctx || []), ...lines];
      if (lines.some((l) => WRITE_RX.test(l))) reasons.push(f.path + " — adds or changes a D1 write or schema statement (crew data / schema)");
      if (where.some((l) => MONEY_RX.test(l))) reasons.push(f.path + " — money: a hunk inside or naming the bonus / Score Card / supervisor-evaluation path (§1)");
      if (where.some((l) => AUTH_RX.test(l))) reasons.push(f.path + " — auth: a hunk inside or naming the sign-in / session path");
    }
  }
  if (!files.some((f) => f.path.startsWith("test/"))) reasons.push("no test in the diff (every fix carries a failing-first test)");
  if (srcLines > MAX_SRC_LINES) reasons.push(srcLines + " changed lines in src/ (more than " + MAX_SRC_LINES + ": not a small fix)");
  return { ok: reasons.length === 0, reasons, srcLines };
}

export function parseDiff(text) {
  const files = [];
  let cur = null;
  for (const line of String(text).split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) { cur = { path: m[2], added: [], removed: [], ctx: [] }; files.push(cur); continue; }
    if (!cur || line.startsWith("+++") || line.startsWith("---")) continue;
    const h = line.match(/^@@ [^@]*@@ ?(.*)$/); // the hunk header: git names the function the hunk lands in
    if (h) { if (h[1].trim()) cur.ctx.push(h[1].trim()); continue; }
    if (line.startsWith("+")) cur.added.push(line.slice(1));
    else if (line.startsWith("-")) cur.removed.push(line.slice(1));
  }
  return files;
}

if (import.meta.url === "file://" + process.argv[1]) {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) { console.error("usage: node scripts/night_merge_gate.mjs <base-ref> [<head-ref>]"); process.exit(2); }
  const diff = execFileSync("git", ["diff", "--no-color", base + "..." + head], { encoding: "utf8", maxBuffer: 64 << 20 });
  const r = judge(parseDiff(diff));
  if (r.ok) { console.log("MERGE_OK (" + r.srcLines + " src lines)"); process.exit(0); }
  console.log("DRAFT_ONLY");
  for (const x of r.reasons) console.log("- " + x);
  process.exit(1);
}
