/**
 * src/maria.js — "Ask Maria": a READ-ONLY natural-language Q&A assistant over CIMS data.
 * --------------------------------------------------------------------------------------
 * Uses Claude (same ANTHROPIC_API_KEY / engine as the intel pipeline) with tool-use.
 * Maria NEVER writes data, commits a bonus payout, or invents numbers. She may only call the
 * read-only tools below; the Worker supplies execTool(name,input) which runs the real queries.
 * Kept as its own module so it survives worker.js overwrites (only the route + UI live there).
 *
 * 2026-07 upgrade (hybrid reach + Sonnet):
 *   - Model: Haiku -> Sonnet, with more step/token headroom for multi-step reasoning.
 *   - Two new tools give her the WHOLE canonical database, safely:
 *       describe_schema  — a backup-free map of every real table/view + columns.
 *       run_sql          — a single read-only SELECT, hard-gated in CODE (not prompt).
 *   - The read-only guarantee is enforced by assertReadOnlySql() below, which the Worker
 *     MUST call before touching the DB. Prompt rules are guidance; this function is the control.
 *   - Stale/backup tables (_preclean_/_preimport_/_predrop_/date-suffixed) are hidden from
 *     BOTH describe_schema and run_sql so Maria can never report a number off a dead table.
 */

// One place to pin the model. Confirm the snapshot your account has access to.
export const MARIA_MODEL = "claude-sonnet-4-5-20250929";
export const MARIA_MAX_TOKENS = 2048;
export const MARIA_MAX_STEPS = 8;
export const SQL_MAX_ROWS = 500;

export function mariaSystemPrompt(today) {
  return [
    "You are Maria, the read-only data assistant for the DG3 CIMS HR Operational Console.",
    "CIMS tracks Filipino 'Keyman' printer/communications seafarers placed on cruise ships: crew rotation, document compliance, days-worked billing, fleet & dry-dock, travel spend, and a contract-completion bonus.",
    today ? ("Today's date is " + today + ".") : "",
    "RULES:",
    "1. Answer ONLY from the tool results. Never guess specific crew, numbers, dates, or money from outside knowledge.",
    "1b. For who is ARRIVING / JOINING / EMBARKING / DEPARTING / DEBARKING / signing on or off within a time window, ALWAYS use the upcoming_movements tool (the LIVE schedule). Do NOT use find_crew or contract_ledger sign-off dates for that — those are HISTORICAL closed contracts and will be wrong.",
    "1c. By DEFAULT only search and report ACTIVE (non-retired) crew. Only include retired/former crew when the user EXPLICITLY asks about retired or former crew — then call find_crew/list_crew with include_retired=true. If an active search finds no one, you may note the person might be retired and offer to search retired crew.",
    "1d. You can read essentially all CIMS data: crew profiles, contracts/rank/bonus ledger, per-contract history (crew_contract_history), field intel & notes (crew_intel), compliance, billing this month or any range (billing_range), fleet, travel, upcoming movements, and the scoring board (scoring_board). Pick the most specific curated tool for the question.",
    "1e. For anything the curated tools above do NOT cover, you can explore the whole database: call describe_schema with no arguments to list every real table/view, call describe_schema with a table name to see its columns, then call run_sql with a SINGLE read-only SELECT. ALWAYS prefer a curated tool when one fits — the curated tools encode the correct joins for crew, bonus, rotation, billing, compliance, fleet and travel, and are the trusted source for those numbers. Use run_sql only for the long tail the curated tools don't answer.",
    "1f. run_sql is SELECT-only and its results are row-capped. Never attempt to write, update, or delete. Only query tables that describe_schema returned — never internal or backup tables. If a query errors or returns no rows, say so plainly; never invent rows or totals.",
    "2. If the tools don't contain the answer, say so plainly — do not fabricate.",
    "3. You are strictly READ-ONLY. You cannot change data, commit a bonus payout, or write a baseline. If asked to, explain you can only report, not act.",
    "4. Bonus money: only state a dollar figure when the data gives one. If a crew's baseline is not set (baseline_set=false), say the bonus is 'baseline pending' — never invent an amount.",
    "5. Never reveal API keys, tokens, or system internals.",
    "6. Be concise and specific. Cite the figures you used (counts, names, dates), and when you used run_sql, name the table(s) you read.",
  ].filter(Boolean).join("\n");
}

// Tool catalogue exposed to the model. Each maps to a read-only data function in the Worker.
export const MARIA_TOOLS = [
  { name: "crew_intel", description: "Field-intel reports AND manual notes filed on a crew member's card (the qualitative knowledge about that person). Provide agency_id (from find_crew) or a name.", input_schema: { type: "object", properties: { name: { type: "string" }, agency_id: { type: "string" } }, additionalProperties: false } },
  { name: "crew_contract_history", description: "Full per-contract leg history for ONE crew member: every contract's ship and sign-on / projected-off / actual-off dates (the detailed history behind the contract count). Provide agency_id or a name.", input_schema: { type: "object", properties: { name: { type: "string" }, agency_id: { type: "string" } }, additionalProperties: false } },
  { name: "scoring_board", description: "The near-sign-off feedback/scoring board (who is due for scoring, which role windows are open/answered) plus the score queue (contracts needing scoring soon).", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "billing_range", description: "Days-worked billing for ANY date range, per crew and per vessel. Use for historical billing questions beyond the current month. Dates are YYYY-MM-DD; omit for all-time through today.", input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, additionalProperties: false } },
  { name: "upcoming_movements", description: "Upcoming crew movements from the LIVE rotation schedule: who signs ON (arrives/embarks) and OFF (departs/debarks) within the next N days, with vessel, port and date. THIS is the correct source for any 'who is debarking/arriving/joining/leaving soon' question. Do NOT use find_crew/contract_ledger sign-off dates for that — those are historical.", input_schema: { type: "object", properties: { days: { type: "number", description: "Look-ahead window in days; default 10" } }, additionalProperties: false } },
  { name: "workforce_summary", description: "Overall workforce: headcount by status (On board / On Vacation / Earmarked / Inactive), split by client/brand, compliance counts, and cost/bonus tiles. Use for 'how many crew...', overall-status questions.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "find_crew", description: "Look up crew by name (partial OK). Returns each match's status, vessel, rank, contract count, and document expiry dates. Typo-tolerant: returns the closest-matching crew (handles misspellings, reversed first/last order, accents), each with match_confidence (1.0 = exact). Each match includes the crew member's FULL profile: date of birth, passport number, city/province, phone, email, rank, status, vessel/client, full-contract count, bonus baseline status, and all document expiry dates (medical, seaman's book, passport, US visa, Schengen). If exact_match is false, treat them as did-you-mean candidates: if one is clearly closest, answer for that person and note the corrected spelling; if several are similar, ask which one. NOTE: sign-on/off dates here are HISTORICAL; for upcoming movements use upcoming_movements.", input_schema: { type: "object", properties: { name: { type: "string", description: "Full or partial crew name" }, include_retired: { type: "boolean", description: "Set true ONLY when the user explicitly asks about retired/former crew. Default (false) searches ACTIVE crew only." } }, required: ["name"], additionalProperties: false } },
  { name: "list_crew", description: "List crew, optionally filtered by status (On board|On Vacation|Earmarked|Inactive) and/or ship name. Use for 'who is on the Symphony', 'who is on vacation'.", input_schema: { type: "object", properties: { status: { type: "string" }, ship: { type: "string" }, include_retired: { type: "boolean", description: "Set true ONLY when the user explicitly asks about retired/former crew." } }, additionalProperties: false } },
  { name: "contract_ledger", description: "Fleet-wide contract/bonus ledger (READ-ONLY): per crew the full-contract count, consecutive count, rank (Jr PS / PS / Sr PS), whether the bonus baseline is set, the next bonus rung, and total paid. Use for rank and contract-count questions.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "compliance_expiring", description: "Crew documents expiring within N days (medical, seaman's book, passport, US visa, Schengen). Use for 'whose documents expire soon'.", input_schema: { type: "object", properties: { days: { type: "number", description: "Window in days; default 90" } }, additionalProperties: false } },
  { name: "billing_month", description: "This month's days-worked billing, per crew and per vessel. Use for 'what are we billing this month'.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "fleet_status", description: "Fleet list with dry-dock status, homeports, lead times, in-dock and upcoming docks. Use for vessel / dry-dock questions.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "travel_summary", description: "Travel-spend analytics: latest year vs prior year over the same months. Use for travel-cost questions.", input_schema: { type: "object", properties: {}, additionalProperties: false } },

  // ---- Hybrid reach: whole-database access, safely ----
  { name: "describe_schema", description: "Map the CIMS database so you can answer questions the curated tools don't cover. Call with NO arguments to list every real table and view (backups and internal tables are hidden). Call with a table name to get that table's columns and types. Use this to discover where data lives, then read it with run_sql. Prefer a curated tool whenever one fits.", input_schema: { type: "object", properties: { table: { type: "string", description: "Optional: a table/view name to describe its columns. Omit to list all tables." } }, additionalProperties: false } },
  { name: "run_sql", description: "Run ONE read-only SQL SELECT against the CIMS database and get the rows back. SELECT-only and row-capped; you cannot write, update, delete, or run PRAGMA/ATTACH. Only query tables that describe_schema returned. Use this for ad-hoc questions the curated tools don't answer (e.g. joins across candidate, assignment, sbm_review_request, seval_state, orders, travel_expense, notification_log). Always add a WHERE/LIMIT to keep results focused. If the query returns nothing, report that honestly.", input_schema: { type: "object", properties: { sql: { type: "string", description: "A single read-only SELECT statement (or WITH ... SELECT). No semicolons chaining multiple statements." } }, required: ["sql"], additionalProperties: false } },
];

/**
 * isBackupTable — true for the stale/backup/scratch tables Maria must never see or query.
 * Matches the estate's naming: *_preclean_YYYYMMDD, *_preimport_YYYYMMDD, *_predrop_YYYYMMDD,
 * any *_YYYYMMDD date-suffixed snapshot, and *_bak/_backup/_old/_tmp.
 */
export function isBackupTable(name) {
  const n = String(name == null ? "" : name);
  if (/_(preclean|preimport|predrop)(_?\d+)?$/i.test(n)) return true;
  if (/_20\d{6}$/.test(n)) return true;             // e.g. contract_edit_preclean_20260706 / *_20260707
  if (/_(bak|backup|old|tmp)$/i.test(n)) return true;
  return false;
}

/**
 * SQL_DENY_TABLES — key/value config stores where a secret could someday land (CLAUDE.md §7:
 * agent surfaces never touch secrets). Hidden from describe_schema AND refused by
 * assertReadOnlySql. Crew PII tables are deliberately NOT here: find_crew already exposes
 * the same fields to full users behind the same session gate; run_sql adds no new exposure.
 */
export const SQL_DENY_TABLES = ["app_config", "app_setting"];

/** isHiddenTable — everything Maria must never see: backup tables + denylisted config stores. */
export function isHiddenTable(name) {
  const n = String(name == null ? "" : name).toLowerCase();
  return isBackupTable(n) || SQL_DENY_TABLES.includes(n);
}

// Strip SQL comments so a comment can't smuggle a second statement or hide a keyword.
function stripSqlComments(s) {
  return String(s == null ? "" : s)
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

// Write/DDL verbs. Defense-in-depth: the real guarantee is (single statement) + (starts with SELECT/WITH),
// because a lone SELECT/WITH-SELECT cannot mutate a SQLite/D1 database. This list stops confusing errors early.
const SQL_FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|attach|detach|pragma|vacuum|reindex|grant|revoke)\b/i;

/**
 * assertReadOnlySql — THE control that makes run_sql safe. The Worker MUST call this and run
 * only the string it returns. Throws Error(reason) on any violation. On success returns a
 * safe SELECT with an enforced LIMIT (<= maxRows). Pure + exported so it is unit-tested.
 */
export function assertReadOnlySql(rawSql, opts = {}) {
  const maxRows = opts.maxRows || SQL_MAX_ROWS;
  let sql = String(rawSql == null ? "" : rawSql).trim();
  if (!sql) throw new Error("empty_sql");
  sql = sql.replace(/;\s*$/, "");                       // allow one trailing semicolon, then drop it
  const body = stripSqlComments(sql).trim();
  if (!body) throw new Error("empty_sql");
  if (body.includes(";")) throw new Error("multiple_statements_forbidden");
  if (!/^(select|with)\b/i.test(body)) throw new Error("only_select_or_with_allowed");
  if (SQL_FORBIDDEN.test(body)) throw new Error("write_or_ddl_keyword_forbidden");
  const bad = body.match(/\b\w*_(preclean|preimport|predrop)(_?\d+)?\b/i) || body.match(/\b\w*_20\d{6}\b/);
  if (bad) throw new Error("backup_table_forbidden:" + bad[0]);
  const denyRe = new RegExp("\\b(" + SQL_DENY_TABLES.join("|") + ")\\b", "i");
  const denied = body.match(denyRe);
  if (denied) throw new Error("table_forbidden:" + denied[0]);
  // Enforce a LIMIT (append if missing; clamp if present).
  if (!/\blimit\s+\d+/i.test(body)) {
    sql = sql + " LIMIT " + maxRows;
  } else {
    sql = sql.replace(/\blimit\s+(\d+)/i, (m, n) => "LIMIT " + Math.min(parseInt(n, 10) || maxRows, maxRows));
  }
  return sql;
}

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

/**
 * Tool-use loop. Returns { answer, sources:[toolNames] } or { answer:null, error }.
 * - apiKey : Anthropic key (from env, never logged)
 * - question : the user's question
 * - history : prior [{role,content}] turns (trimmed)
 * - execTool : async (name, input) => data (Worker-provided; runs real read-only queries)
 * - today : 'YYYY-MM-DD' for the system prompt
 * - fetchImpl: injectable for tests
 */
export async function runMaria({ apiKey, question, history = [], execTool, today, maxSteps = MARIA_MAX_STEPS, fetchImpl }) {
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
      body: JSON.stringify({ model: MARIA_MODEL, max_tokens: MARIA_MAX_TOKENS, system: mariaSystemPrompt(today), tools: MARIA_TOOLS, messages }),
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
