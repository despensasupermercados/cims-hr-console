// CIMS bonus engine — locked SOP. Pure, dependency-free, testable.
// This module is the SINGLE SOURCE OF the scoring logic. The Worker imports
// from here; the test suite pins it. A change to this file is a money change
// and must pass the golden tests + human approval (see CLAUDE.md).

export const LADDER = [0, 0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];
export function ladderValue(n) { return n <= 1 ? 0 : n >= 9 ? 2000 : LADDER[n]; }

export const FLOOR = 80;
export const FW = { sOrder: 20, sAcc: 25, sPar: 15, sHand: 10, sComm: 10, sMono: 5 };
// The policy every new outcome is committed under (bonus_policy.version). v2 (15 Oct 2026, Miguel: "agree. both"): the same
// ladder, floor, weights and gates as v1; sComm is Dexter's audit (no longer Communication) and the Score Card pre-fills
// from the systems (autoScore). An outcome records which rules it was scored under; v1 is never rewritten.
export const POLICY_VERSION = 2;

export function clampInt(v, max) {
  v = parseInt(v);
  if (isNaN(v) || v < 0) v = 0;
  if (v > max) v = max;
  return v;
}

// Authoritative scorer.
// inp: {count, sliders:{sOrder,sAcc,sPar,sHand,sComm,sMono}, evalScore, gates:{complete,compassion,rush,audit}}
export function computeBonus(inp) {
  const g = inp.gates || {};
  let op = 0; const breakdown = {};
  for (const k in FW) { const v = clampInt((inp.sliders || {})[k], FW[k]); breakdown[k] = v; op += v; }
  const ev = parseInt(inp.evalScore); const ep = ev >= 3 ? 15 : 0; breakdown.sEval = ep;
  const score = op + ep;
  let gate = null, resets = false, advances = true, forfeitOnly = false;
  if (!g.complete && !g.compassion) { gate = "not_completed"; resets = true; advances = false; }
  else if (g.rush) { gate = "rush"; resets = true; advances = false; }
  else if (g.audit) { gate = "audit"; resets = true; advances = false; }
  else if (ev < 3) { gate = "eval_below_3"; advances = false; forfeitOnly = true; }
  const count = parseInt(inp.count) || 0;
  const nextCount = resets ? 0 : (advances ? count + 1 : count);
  let pay = 0;
  if (!gate && score >= FLOOR) pay = Math.round(ladderValue(nextCount) * score / 100);
  return { score, gate, resets, advances, forfeitOnly, count, nextCount, pay, rung: ladderValue(nextCount), breakdown, floor: FLOOR };
}

// Structured contributor answers -> gates + sub-scores. Server is the single source of this mapping.
export function mapFeedbackToScore(answers) {
  const out = { gates: {}, sliders: {}, evidence: [], gateNote: [] };
  const ray = answers.ray, rol = answers.rolando, dex = answers.dexter;
  if (ray) {
    if (ray.order === "Yes" && ray.rushcause === "Crew ordering failure") { out.gates.rush = true; out.gateNote.push("Rush from crew ordering failure" + (ray.rushcost ? (" — $" + Number(ray.rushcost).toLocaleString()) : "") + " (Ray)"); }
    if (ray.audit === "Yes") { out.gates.audit = true; out.gateNote.push("Failed inventory audit (Ray)"); }
    // ALL OR NOTHING (Miguel, 15 Oct 2026: "Partial doesn't really work"): only the best answer earns the factor.
    // Until then "Mostly" gave 14 of 20, "Minor errors" 17 of 25, "Some gaps" 9 of 15.
    if (ray.ontime != null) out.sliders.sOrder = ray.ontime === "Always" ? FW.sOrder : 0;
    if (ray.acc != null) out.sliders.sAcc = ray.acc === "Accurate" ? FW.sAcc : 0;
    if (ray.par != null) out.sliders.sPar = ray.par === "Maintained" ? FW.sPar : 0;
    out.evidence.push("Ray: order " + ray.order + (ray.order === "Yes" ? (" (" + ray.rushcause + ")") : "") + " · on-time " + ray.ontime + " · acc " + ray.acc + " · par " + ray.par + " · audit " + ray.audit + (ray.note ? (' · "' + ray.note + '"') : ""));
  }
  if (rol) {
    // Rolando's three technical answers (PROD / MFD / Information-Database) deduct from a 10-pt handover
    // sub-score. The display labels were relabelled Excellent/Acceptable/Poor (2026-06-25, Rolando), but
    // the WEIGHTS are unchanged — each question keeps its own deductions, so payouts do not move. We accept
    // BOTH the new words and the legacy Yes/Minor/No strings so already-stored answers still score the same.
    let h = 10;
    if (rol.clean === "Minor issues" || rol.clean === "Acceptable") h -= 3;
    if (rol.clean === "No"          || rol.clean === "Poor")       h -= 6;
    if (rol.pm    === "Partial"     || rol.pm    === "Acceptable") h -= 2;
    if (rol.pm    === "No"          || rol.pm    === "Poor")       h -= 4;
    if (rol.unres === "Minor"       || rol.unres === "Acceptable") h -= 1;
    if (rol.unres === "Major"       || rol.unres === "Poor")       h -= 3;
    out.sliders.sHand = Math.max(0, h);
    out.evidence.push("Rolando: PROD " + rol.clean + " · MFD " + rol.pm + " · Info/DB " + rol.unres + (rol.note ? (' · "' + rol.note + '"') : ""));
  }
  if (dex) {
    const m = parseFloat(dex.mono);
    if (!isNaN(m)) out.sliders.sMono = m <= 20 ? 5 : m >= 40 ? 0 : Math.round(5 * (40 - m) / 20);
    const bits = [dex.mono ? ("mono " + dex.mono + "%") : "", dex.inv && ("Inv: " + dex.inv), dex.tech && ("Tech: " + dex.tech), dex.overall && ("Overall: " + dex.overall)].filter(Boolean);
    out.evidence.push("Dexter: " + (bits.join(" · ") || (dex.assessed === "Yes" ? "assessed" : "N/A")));
  }
  return out;
}

// ============================ AUTOMATIC INPUTS (Miguel, 15 Oct 2026) ============================
// The Score Card pre-fills from what the systems recorded during the contract. Every value is a PRE-FILL with its
// evidence; the commit is still a money user's click and every slider stays movable. Rules, in his words:
//  - On-time ordering: "if he misses an order, it goes down to zero" — a Parts Portal order marked "Vessel-side miss"
//    on his ship during the contract zeroes it AND is the rush gate (no bonus, the streak resets to 0).
//  - Order accuracy / Par: Ray's answers, all or nothing; a field report in the contract that names an accuracy or
//    a par problem zeroes the factor until Ray answers after it ("allow Ray to rectify that").
//  - Ship handover: contracts ending on or after HON_FROM need a signed HON handover (10, else 0); before, Rolando's
//    answers as before.
//  - Dexter's audit (the old "Communication" 10): 5 = 10, 4 = 8, 3 or below = 0; no audit in the contract = 10.
//  - Mono (5): presses only, mono share of clicks over the contract under 20% = 5, else 0; no click data = 5.
export const HON_FROM = "2026-11-01";
export const MONO_LIMIT = 20;
export function auditPoints(score) {
  if (score == null) return FW.sComm;
  const s = Number(score);
  return s >= 5 ? FW.sComm : s === 4 ? Math.round(FW.sComm * 0.8) : 0;
}
const day = (v) => (v ? String(v).slice(0, 10) : "");
const inSpan = (d, on, off) => { const x = day(d); return !!x && (!on || x >= on) && (!off || x <= off); };
// Two moments as instants: "2026-08-01 15:00:00" and "2026-08-01T08:00:00Z" compared by time, not by day
// (a report at 08:00 and Ray's answer at 15:00 the same day: Ray answered AFTER it).
const instant = (v) => { const t = Date.parse(String(v || "").trim().replace(" ", "T")); return isNaN(t) ? null : t; };
// in: { signOn, signOff, answers:{ray,rolando,dexter}, rayAt (ISO the answer was given), misses:[{ref,at,total}],
//       handover:{signedAt,id}|null, audits:[{score,at,id}], flags:[{at,accuracy,par,quote}], mono:{pct}|null,
//       today (ISO day; default the clock) }
// Without a sign-on nothing dated is counted (a blank start read every miss in the ship's history); a contract whose
// sign-off is still ahead (or blank) is running, so its handover is not due yet and keeps the window's value.
export function autoScore(inp) {
  const x = inp || {}, on = day(x.signOn), off = day(x.signOff), today = day(x.today) || new Date().toISOString().slice(0, 10);
  const base = mapFeedbackToScore(x.answers || {});
  const sliders = { ...base.sliders }, gates = { ...base.gates }, gateNote = [...base.gateNote], evidence = [];
  const misses = on ? (x.misses || []).filter((m) => inSpan(m.at, on, off)) : [];
  if (misses.length) {
    sliders.sOrder = 0; gates.rush = true;
    for (const m of misses) {
      const t = "Vessel-side miss " + (m.ref || "") + " · " + day(m.at) + (m.total ? " · $" + Number(m.total).toLocaleString() : "") + (m.by ? " · placed by " + m.by : "");
      gateNote.push(t + " (Parts Portal)"); evidence.push({ factor: "sOrder", text: t, source: "Parts Portal" });
    }
  }
  const rayT = instant(x.rayAt);
  for (const f of (on ? x.flags || [] : []).filter((g) => inSpan(g.at, on, off))) {
    const fT = instant(f.at);
    const after = rayT != null && (fT != null ? rayT > fT : day(x.rayAt) > day(f.at)); // Ray answered after the report: his answer stands
    if (f.accuracy && !after) { sliders.sAcc = 0; evidence.push({ factor: "sAcc", text: "Field report " + day(f.at) + ": " + f.quote, source: "Field intel" }); }
    if (f.par && !after) { sliders.sPar = 0; evidence.push({ factor: "sPar", text: "Field report " + day(f.at) + ": " + f.quote, source: "Field intel" }); }
  }
  if (off && off >= HON_FROM && off > today && !x.handover) {
    evidence.push({ factor: "sHand", text: "Contract still running: the HON handover is checked at the sign-off", source: "HON" });
  } else if (off && off >= HON_FROM) {
    sliders.sHand = x.handover ? FW.sHand : 0;
    evidence.push({ factor: "sHand", text: x.handover ? "HON handover signed " + day(x.handover.signedAt) : "No signed HON handover for this sign-off", source: "HON" });
  }
  const audits = (x.audits || []).filter((a) => a.score != null && inSpan(a.at, on, off ? addDays(off, 30) : ""));
  const worst = audits.length ? Math.min(...audits.map((a) => Number(a.score))) : null;
  sliders.sComm = auditPoints(worst);
  evidence.push({ factor: "sComm", text: worst == null ? "No audit in this contract: full points" : "Dexter's audit " + worst + "/5" + (audits.length > 1 ? " (lowest of " + audits.length + ")" : ""), source: "Audit" });
  const pct = x.mono && x.mono.pct != null ? Number(x.mono.pct) : null;
  sliders.sMono = pct == null ? FW.sMono : pct < MONO_LIMIT ? FW.sMono : 0;
  evidence.push({ factor: "sMono", text: pct == null ? "No click data for this contract yet: full points" : "Mono " + Math.round(pct * 10) / 10 + "% of press clicks", source: "OBP clicks" });
  return { sliders, gates, gateNote, evidence: base.evidence.map((t) => ({ factor: null, text: t, source: "Windows" })).concat(evidence), audits };
}
function addDays(d, n) { const t = Date.parse(d + "T00:00:00Z"); return isNaN(t) ? d : new Date(t + n * 86400000).toISOString().slice(0, 10); }
