// Maria — turning an internal error code into a sentence a non-developer can act on.
//
// Today from China, Maria answered two questions with the literal text `model_http_403`. The
// cause was real and mundane: Cloudflare ran the Worker in a region the Anthropic API geo-blocks,
// so the model call was refused. Permission, not credit, not the key, and nothing to do with the
// reader or their data. What the reader saw was a developer code, which is exactly the jargon
// Maria is supposed to never show.
//
// The raw code is still returned separately as `code`, and the provider's own response body is
// persisted to maria_log.note, so the next failure is one D1 query away instead of a guess.
//
// Wording rule: say what happened, say whose problem it is, say whether to retry. Never claim
// someone has been alerted unless something actually alerts them — the console records these in
// maria_log and nothing emails anyone, so the text says "recorded", not "notified".
const RECORDED = " It is recorded in Maria's log for Miguel.";

export function mariaFriendlyError(code) {
  if (!code) return null;
  const c = String(code);
  if (c === "model_http_401") return "Maria could not sign in to the AI service — the API key needs attention." + RECORDED;
  if (c === "model_http_403") return "Maria reached the AI service but is not currently permitted to use the model. That is a permissions setting on the AI account, not a problem with your question or your data." + RECORDED;
  if (c === "model_http_429") return "The AI service is busy right now (rate limit). Give it a moment and ask again.";
  if (c === "model_http_400" || c === "model_http_402") return "There is a billing problem on the AI account." + RECORDED;
  if (c === "model_http_408" || c === "model_http_504") return "The AI service took too long to answer. Ask again; if it keeps happening, try a narrower question.";
  if (/^model_http_5\d\d$/.test(c)) return "The AI service is having trouble at its end. Ask again in a few minutes." + RECORDED;
  if (c.indexOf("model_http_") === 0) return "Maria could not reach the AI model right now." + RECORDED;
  // An unmapped code is still returned verbatim: inventing a soothing sentence for a failure
  // nobody has classified hides it, and hiding it is how it stays unclassified.
  return c;
}
