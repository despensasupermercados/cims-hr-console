// CIMS bonus engine — locked SOP. Pure, dependency-free, testable.
// This module is the SINGLE SOURCE OF the scoring logic. The Worker imports
// from here; the test suite pins it. A change to this file is a money change
// and must pass the golden tests + human approval (see CLAUDE.md).

export const LADDER = [0, 0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];
export function ladderValue(n) { return n <= 1 ? 0 : n >= 9 ? 2000 : LADDER[n]; }

export const FLOOR = 80;
export const FW = { sOrder: 20, sAcc: 25, sPar: 15, sHand: 10, sComm: 10, sMono: 5 };

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
    const oM = { "Always": 20, "Mostly": 14, "Often late": 6 }, aM = { "Accurate": 25, "Minor errors": 17, "Frequent errors": 8 }, pM = { "Maintained": 15, "Some gaps": 9, "Not maintained": 3 };
    if (ray.ontime != null) out.sliders.sOrder = oM[ray.ontime] ?? 20;
    if (ray.acc != null) out.sliders.sAcc = aM[ray.acc] ?? 25;
    if (ray.par != null) out.sliders.sPar = pM[ray.par] ?? 15;
    out.evidence.push("Ray: order " + ray.order + (ray.order === "Yes" ? (" (" + ray.rushcause + ")") : "") + " · on-time " + ray.ontime + " · acc " + ray.acc + " · par " + ray.par + " · audit " + ray.audit + (ray.note ? (' · "' + ray.note + '"') : ""));
  }
  if (rol) {
    let h = 10; if (rol.clean === "Minor issues") h -= 3; if (rol.clean === "No") h -= 6; if (rol.pm === "Partial") h -= 2; if (rol.pm === "No") h -= 4; if (rol.unres === "Minor") h -= 1; if (rol.unres === "Major") h -= 3;
    out.sliders.sHand = Math.max(0, h);
    out.evidence.push("Rolando: machine " + rol.clean + " · PM " + rol.pm + " · unresolved " + rol.unres + (rol.note ? (' · "' + rol.note + '"') : ""));
  }
  if (dex) {
    const m = parseFloat(dex.mono);
    if (!isNaN(m)) out.sliders.sMono = m <= 20 ? 5 : m >= 40 ? 0 : Math.round(5 * (40 - m) / 20);
    const bits = [dex.mono ? ("mono " + dex.mono + "%") : "", dex.inv && ("Inv: " + dex.inv), dex.tech && ("Tech: " + dex.tech), dex.overall && ("Overall: " + dex.overall)].filter(Boolean);
    out.evidence.push("Dexter: " + (bits.join(" · ") || (dex.assessed === "Yes" ? "assessed" : "N/A")));
  }
  return out;
}
