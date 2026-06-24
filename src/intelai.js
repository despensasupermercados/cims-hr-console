// Field-intel AI extraction — pure, engine-agnostic helpers. The worker calls an LLM with this
// prompt and stores the result as the crew member's field-intel summary. Engine preference:
//   1) Claude  — if an ANTHROPIC_API_KEY secret is set in Cloudflare (best, most detailed)
//   2) Workers AI — Cloudflare's built-in model, no key/setup required (good fallback)
//   3) none    — leave the email queued for manual processing (nothing is lost)
// The WHO (which crew) stays with the deterministic name matcher (crewmatch.js) for safety;
// the LLM only does the WHAT (the decision-grade summary). Prompt + parsing are kept pure + tested.

export const INTEL_MODEL_CLAUDE = "claude-haiku-4-5-20251001";
export const INTEL_MODEL_WORKERSAI = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Which engine is available, in preference order. envLike = { ANTHROPIC_API_KEY?, AI? }.
export function pickEngine(envLike) {
  if (envLike && envLike.ANTHROPIC_API_KEY) return "claude";
  if (envLike && envLike.AI) return "workersai";
  return "none";
}

// System instruction — defines the analyst role and the decision-grade output shape.
export function intelSystemPrompt() {
  return [
    "You are an operations analyst for DG3 CIMS, a maritime printer-services company.",
    "You read an email from a shipboard contributor about a specific crew member (a printer specialist) and extract decision-grade intelligence a manager can act on.",
    "Be factual, specific, and concise. Use ONLY what the email states or clearly implies — never invent names, numbers, dates, or outcomes. If something is unclear, say so plainly.",
    "Output PLAIN TEXT only: no markdown headers, no bold, no code fences. Each line is a bullet starting with '• '.",
    "Produce these lines in this order, and OMIT any line you genuinely have no information for:",
    "• Summary: one sentence capturing what this is about.",
    "• What happened: the specific issue or event, with crew name, ship, dates and numbers exactly as stated.",
    "• Impact: the operational and/or financial consequence (cost, downtime, inventory, par levels, client/contract risk).",
    "• Pattern: whether this is a repeat or tied to a prior issue, only if the email indicates it.",
    "• Recommended action: the concrete next step implied by the email, if any.",
    "Keep the whole output under about 140 words. No greeting, no preamble, no sign-off."
  ].join("\n");
}

// User message — the actual email plus the (already determined) crew name and reporter.
export function intelUserPrompt(crewName, reporter, body) {
  const who = crewName
    ? ("This email is about crew member: " + crewName + ".")
    : "Identify which crew member this email concerns from the text itself.";
  const rep = reporter ? ("Reporter (email sender): " + reporter + ".") : "";
  return [who, rep, "", "EMAIL BODY:", String(body == null ? "" : body).slice(0, 8000)]
    .filter(function (x) { return x !== ""; }).join("\n");
}

// Normalise an LLM response into the stored summary string: strip code fences, unify bullet
// markers to "• ", drop empty lines, cap length. Pure so it is unit-tested.
export function parseIntelResponse(text) {
  let s = String(text == null ? "" : text).trim();
  s = s.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim();
  s = s.split(/\r?\n/)
    .map(function (l) { return l.replace(/^\s*[-*]\s+/, "• ").replace(/^\s*•\s*/, "• ").replace(/\s+$/, ""); })
    .filter(function (l) { return l.length > 0; })
    .join("\n");
  return s.slice(0, 4000);
}
