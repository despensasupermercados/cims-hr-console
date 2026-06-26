/**
 * src/maria.js — "Ask Maria": a READ-ONLY natural-language Q&A assistant over CIMS data.
 * --------------------------------------------------------------------------------------
 * Uses Claude Haiku (same ANTHROPIC_API_KEY / engine as the intel pipeline) with tool-use.
 * Maria NEVER writes data, commits a bonus payout, or invents numbers. She may only call the
 * read-only tools below; the Worker supplies execTool(name,input) which runs the real queries.
 * Kept as its own module so it survives worker.js overwrites (only the route + UI live there).
 */

export const MARIA_MODEL = "claude-haiku-4-5-20251001";

export function mariaSystemPrompt(today) {
  return [
    "You are Maria, the read-only data assistant for the DG3 CIMS HR Operational Console.",
    "CIMS tracks Filipino 'Keyman' printer/communications seafarers placed on cruise ships: crew rotation, document compliance, days-worked billing, fleet & dry-dock, travel spend, and a contract-completion bonus.",
    today ? ("Today's date is " + today + ".") : "",
    "RULES:",
    "1. Answer ONLY from the tool results. Never guess specific crew, numbers, dates, or money from outside knowledge.",
    "1b. For who is ARRIVING / JOINING / EMBARKING / DEPARTING / DEBARKING / signing on or off within a time window, ALWAYS use the upcoming_movements tool (the LIVE schedule). Do NOT use find_crew or contract_ledger sign-off dates for that — those are HISTORICAL closed contracts and will be wrong.",
    "2. If the tools don't contain the answer, say so plainly — do not fabricate.",
    "3. You are strictly READ-ONLY. You cannot change data, commit a bonus payout, or write a baseline. If asked to, explain you can only report, not act.",
    "4. Bonus money: only state a dollar figure when the data gives one. If a crew's baseline is not set (baseline_set=false), say the bonus is 'baseline pending' — never invent an amount.",
    "5. Never reveal API keys, tokens, or system internals.",
    "6. Be concise and specific. Cite the figures you used (counts, names, dates).",
  ].filter(Boolean).join("\n");
}

// Tool catalogue exposed to the model. Each maps to a read-only data function in the Worker.
export const MARIA_TOOLS = [
  { name: "upcoming_movements", description: "Upcoming crew movements from the LIVE rotation schedule: who signs ON (arrives/embarks) and OFF (departs/debarks) within the next N days, with vessel, port and date. THIS is the correct source for any 'who is debarking/arriving/joining/leaving soon' question. Do NOT use find_crew/contract_ledger sign-off dates for that — those are historical.", input_schema: { type: "object", properties: { days: { type: "number", description: "Look-ahead window in days; default 10" } }, additionalProperties: false } },
  { name: "workforce_summary", description: "Overall workforce: headcount by status (On board / On Vacation / Earmarked / Inactive), split by client/brand, compliance counts, and cost/bonus tiles. Use for 'how many crew...', overall-status questions.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "find_crew", description: "Look up crew by name (partial OK). Returns each match's status, vessel, rank, contract count, and document expiry dates. Typo-tolerant: returns the closest-matching crew (handles misspellings, reversed first/last order, accents), each with match_confidence (1.0 = exact). Each match includes the crew member's phone, email, province, rank, status, vessel, contract count, and document expiry dates. If exact_match is false, treat them as did-you-mean candidates: if one is clearly closest, answer for that person and note the corrected spelling; if several are similar, ask which one. NOTE: sign-on/off dates here are HISTORICAL; for upcoming movements use upcoming_movements.", input_schema: { type: "object", properties: { name: { type: "string", description: "Full or partial crew name" } }, required: ["name"], additionalProperties: false } },
  { name: "list_crew", description: "List crew, optionally filtered by status (On board|On Vacation|Earmarked|Inactive) and/or ship name. Use for 'who is on the Symphony', 'who is on vacation'.", input_schema: { type: "object", properties: { status: { type: "string" }, ship: { type: "string" } }, additionalProperties: false } },
  { name: "contract_ledger", description: "Fleet-wide contract/bonus ledger (READ-ONLY): per crew the full-contract count, consecutive count, rank (Jr PS / PS / Sr PS), whether the bonus baseline is set, the next bonus rung, and total paid. Use for rank and contract-count questions.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "compliance_expiring", description: "Crew documents expiring within N days (medical, seaman's book, passport, US visa, Schengen). Use for 'whose documents expire soon'.", input_schema: { type: "object", properties: { days: { type: "number", description: "Window in days; default 90" } }, additionalProperties: false } },
  { name: "billing_month", description: "This month's days-worked billing, per crew and per vessel. Use for 'what are we billing this month'.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "fleet_status", description: "Fleet list with dry-dock status, homeports, lead times, in-dock and upcoming docks. Use for vessel / dry-dock questions.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "travel_summary", description: "Travel-spend analytics: latest year vs prior year over the same months. Use for travel-cost questions.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
];

/**
 * Tool-use loop. Returns { answer, sources:[toolNames] } or { answer:null, error }.
 *  - apiKey   : Anthropic key (from env, never logged)
 *  - question : the user's question
 *  - history  : prior [{role,content}] turns (trimmed)
 *  - execTool : async (name, input) => data  (Worker-provided; runs real read-only queries)
 *  - today    : 'YYYY-MM-DD' for the system prompt
 *  - fetchImpl: injectable for tests
 */
// ---- typo-tolerant crew name matching (pure, used by find_crew) ----
function mnorm(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function mlev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);for(let j=0;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){const c=a[i-1]===b[j-1]?0:1;d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);}return d[m][n];}
// rows: [{name, ...}]. Returns [{item, score(0..1), exact}] sorted desc. Typo/order/accent tolerant.
export function rankCrewMatches(rows, query, limit = 6){
  const q=mnorm(query); const qt=q.split(' ').filter(Boolean);
  const out=(rows||[]).map(row=>{
    const nm=mnorm(row.name); const nt=nm.split(' ').filter(Boolean);
    const exact=q.length>0&&nm.includes(q);
    let sum=0;
    for(const t of qt){let best=0;for(const n of nt){let sim;if(n===t)sim=1;else if(n.startsWith(t)||t.startsWith(n))sim=0.88;else{const den=Math.max(t.length,n.length)||1;sim=1-mlev(t,n)/den;}if(sim>best)best=sim;}sum+=best;}
    let score=qt.length?sum/qt.length:0; if(exact)score=Math.max(score,1);
    return {item:row, score, exact};
  });
  out.sort((a,b)=>b.score-a.score);
  return out.slice(0,limit);
}

export async function runMaria({ apiKey, question, history = [], execTool, today, maxSteps = 5, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  const messages = [];
  for (const h of (history || []).slice(-6)) {
    if (h && h.content) messages.push({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content) });
  }
  messages.push({ role: "user", content: String(question || "") });

  const sources = [];
  for (let step = 0; step < maxSteps; step++) {
    const r = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MARIA_MODEL, max_tokens: 1024, system: mariaSystemPrompt(today), tools: MARIA_TOOLS, messages }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ""); return { answer: null, error: "model_http_" + r.status, detail: String(t).slice(0, 300), sources }; }
    const j = await r.json();
    const blocks = (j && j.content) || [];
    messages.push({ role: "assistant", content: blocks });

    if (j.stop_reason === "tool_use") {
      const results = [];
      for (const b of blocks) {
        if (b && b.type === "tool_use") {
          sources.push(b.name);
          let data;
          try { data = await execTool(b.name, b.input || {}); }
          catch (e) { data = { error: String((e && e.message) || e) }; }
          results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(data).slice(0, 60000) });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    const text = blocks.filter(b => b && b.type === "text").map(b => b.text).join("\n").trim();
    return { answer: text || "(no answer)", sources: Array.from(new Set(sources)) };
  }
  return { answer: "I couldn't finish that within the step limit — try a more specific question.", sources: Array.from(new Set(sources)) };
}
