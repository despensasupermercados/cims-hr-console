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
// 16 Oct 2026 (Ray Guerra on Ryan Marto's record, Miguel: "the AI mixed the notes on how it was originally by dates"): the
// emails are mostly FORWARDED THREADS that run for months. The first prompt asked for one "What happened", so a May-to-
// October thread became one story filed on the forwarding day: a projected end-of-month count was written as a stock-out
// that had happened, the day a cost was emailed became the day the shipment went, and the AI's own "Recommended action"
// read as the sender's. Now: one dated line per message that matters, oldest first, each saying who said it; a forecast
// stays a forecast; what the sender ASKED and what was DECIDED are quoted, never invented.
export function intelSystemPrompt() {
  return [
    "You are an operations analyst for DG3 CIMS, a maritime printer-services company.",
    "You read an email from a shipboard contributor or a shore manager about a specific crew member (a printer specialist) and extract decision-grade intelligence a manager can act on.",
    "Be factual, specific, and concise. Use ONLY what the email states — never invent names, numbers, dates, or outcomes. If something is unclear, say so plainly.",
    "The email is often a FORWARDED THREAD: the newest message is at the top and the earlier messages follow below, each with its own From / Sent date. Read the whole thread.",
    "DATES: every event keeps the date of the message that reports it. Never move an event to another date: the day an email was sent or forwarded is not the day the events in it happened.",
    "FORECASTS: a projected, expected or estimated count ('expected to end with', 'final count at end of month', a statistics sheet's future months) is a forecast — write it as projected, never as something that happened.",
    "SIDES: say who said each thing. When the crew member replied or explained, include his reply.",
    "Output PLAIN TEXT only: no markdown headers, no bold, no code fences. Each line is a bullet starting with '• '.",
    "Produce these lines in this order, and OMIT any line you have no information for:",
    "• Summary: one sentence with the period the thread covers (first date to last date) and what it is about.",
    "• Then one line per message that matters, OLDEST FIRST, each starting with its date and the person: '• 2 Sep 2026 — Ray Guerra: ...' with the numbers exactly as stated.",
    "• Impact: the operational and/or financial consequence the email states (cost, downtime, inventory, client risk); mark forecasts as projected.",
    "• Asked of the crew: what the sender explicitly asked the crew member to do, in the sender's words — only if the email asks it.",
    "• Decision: a decision a manager states in the thread, with who made it and the date — only if there is one.",
    "Keep the whole output under about 220 words. No greeting, no preamble, no sign-off."
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
