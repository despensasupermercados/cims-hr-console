// WHAT OTHERS SAID, IN PLAIN WORDS (Miguel, 15 Oct 2026, on the briefing's feed: "It's like the AI is talking to itself
// ... summarize this in a language that is understandable, like order, rush, and cost ... how a human would actually
// phrase it"). Two paths, one rule: say what happened, short, in the words people use.
// - Feedback answers are picked from fixed lists, so they become sentences HERE, with no model: nothing to invent.
// - Field intel is free text. A model rewrites the stored summary into one or two sentences, and the line is kept only
//   when every number in it is already in the summary (`numbersKept`): a rush cost or a toner count is never invented.
//   Without an engine, or when the check fails, the page shows the summary's own first sentence instead.
// Nothing here touches the bonus (§1, §10): it is display text for the auditor's briefing.

const money = (v) => {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) : "";
};
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const stop = (s) => (/[.!?]$/.test(s) ? s : s + ".");

// Ray's, Rolando's and Dexter's answers (worker.js feedback form) as sentences. Unknown keys read "Label: value".
export function feedbackPlain(a) {
  if (!a || typeof a !== "object") return "";
  const out = [], used = new Set(["note"]);
  const take = (k) => { used.add(k); const v = clean(a[k]); return v; };

  // Ray: orders
  const order = take("order"), cause = take("rushcause"), cost = take("rushcost");
  if (order === "Yes") {
    let s = "Rush order";
    if (money(cost)) s += ", " + money(cost);
    if (cause === "Crew ordering failure") s += ", caused by the crew's ordering";
    else if (/^Legitimate/i.test(cause)) s += ", not the crew's fault (machine, added sailing or port)";
    out.push(s + ".");
  } else if (order === "No") out.push("No rush orders.");
  const ON = { Always: "on time", Mostly: "mostly on time", "Often late": "often late" };
  const AC = { Accurate: "accurate", "Minor errors": "with minor errors", "Frequent errors": "with frequent errors" };
  const ot = ON[take("ontime")], ac = AC[take("acc")];
  if (ot || ac) out.push("Orders " + [ot, ac].filter(Boolean).join(", ") + ".");
  const PAR = { Maintained: "Par kept at handover.", "Some gaps": "Some gaps in par at handover.", "Not maintained": "Par not kept at handover." };
  const par = PAR[take("par")]; if (par) out.push(par);
  if (take("audit") === "Yes") out.push("Failed the end-of-contract inventory audit.");

  // Rolando: three grades, grouped worst first
  const AREAS = [["clean", "production presses"], ["pm", "MFDs"], ["unres", "part numbers and technical data"]];
  const byGrade = {};
  for (const [k, area] of AREAS) { const g = take(k); if (g) (byGrade[g] = byGrade[g] || []).push(area); }
  for (const g of ["Poor", "Acceptable", "Excellent"]) {
    const xs = byGrade[g]; if (!xs) continue;
    out.push(g + " on " + (xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs[0]) + ".");
  }
  for (const g of Object.keys(byGrade)) if (!["Poor", "Acceptable", "Excellent"].includes(g)) out.push(g + " on " + byGrade[g].join(", ") + ".");

  // Dexter
  const as = take("assessed");
  if (/^No/i.test(as)) out.push("Not assessed this contract.");
  const mono = take("mono");
  if (mono !== "" && isFinite(Number(mono))) out.push("Mono clicks " + Number(mono) + "% (target under 20%).");
  for (const [k, lb] of [["inv", "Inventory"], ["tech", "Technical"], ["overall", "Overall"]]) { const t = take(k); if (t) out.push(lb + ": " + stop(t)); }

  for (const [k, v] of Object.entries(a)) {
    if (used.has(k) || v == null || v === "") continue;
    out.push(k.replace(/_/g, " ") + ": " + clean(typeof v === "object" ? JSON.stringify(v) : v) + ".");
  }
  const note = clean(a.note);
  if (note) out.push("“" + note + "”");
  return out.join(" ");
}

// The intel summary's own first line ("• Summary: ..."), cut at a sentence or word, never mid-word.
export function intelFallback(text, max = 220) {
  const t = clean(text);
  const m = t.match(/Summary:\s*([^•]+)/i);
  let s = clean(m ? m[1] : t.replace(/^•\s*/, "").split(/\s*•\s*/)[0].replace(/^[A-Z][\w ]{2,30}:\s*/, ""));
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const dot = cut.lastIndexOf(". ");
  return dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

export const PLAIN_SYSTEM = [
  "Rewrite this note about a ship's printer specialist the way a manager would say it out loud to a colleague.",
  "Two short sentences, 25 words at most in total.",
  "First sentence: what happened and what it cost. Start with the event in two or three words (Rush order, Ran out of toner, Machine left down, Late order).",
  "Second sentence: why, in plain words.",
  "Do not name the ship: the reader is already on it. Use the crew member's first name only.",
  "Copy amounts, quantities and places exactly. Keep dates worded as the note words them: 'early October' stays 'early October'; leave a date out rather than make it more exact.",
  "Never add a number the note does not have. No jargon (protocols, escalations, resulting in, failed to), no labels, no bullets, no quotes, no preamble.",
  "Example of the style (not of the facts): Rush order to Miami, $900 for 6 toners. Juan stopped counting stock before the crossing.",
].join("\n");

export function plainPrompt(text) { return "NOTE:\n" + String(text || "").slice(0, 4000); }

export function parsePlain(txt) {
  let s = clean(String(txt || "").replace(/^```[a-z]*|```$/gi, ""));
  s = s.replace(/^(here(?:'s| is)[^:]*:|summary:)\s*/i, "").replace(/^["“]|["”]$/g, "").replace(/^[•\-*]\s*/, "");
  if (!s || s.length > 320) return null;
  return s;
}

// Every number in the plain line must already be in the source (THE ONE LAW of the fleet apps, applied here). Read as
// numbers, not as digit strings: "04" is 4, "$1.50" is $1.5, "1,240" is 1240 but "items 1,2" is 1 and 2. A dollar
// amount must match a dollar amount ("$10 freight for 550 toners" from "10 toners plus $550 in freight" is refused), a
// number word the source does not carry is refused ("twelve toners"), and the headline cost (the source's largest amount
// of $100 or more) must stay in the line: a rewrite that drops the rush cost lost the point of the note.
const normNum = (n) => {
  let t = String(n);
  t = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : t;
  if (/,/.test(t)) return null;
  if (/\./.test(t)) t = t.replace(/0+$/, "").replace(/\.$/, "");
  t = t.replace(/^0+(?=\d)/, "");
  return t;
};
const numTokens = (s) => {
  const out = [];
  for (const m of String(s).matchAll(/(\$\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g)) {
    const v = normNum(m[2]);
    if (v != null) out.push({ v, cash: !!m[1] });
  }
  return out;
};
const NUM_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, dozen: 12, thousand: 1000 };
// Dates are datesKept's to judge, never counted as quantities here: "2026-10-06" or "Oct 6, 2026" in the source let a
// rewrite invent "6 toners" or "10 toners" (16 Oct 2026 review). ISO dates, times and month–day phrases go first.
const MON_RX = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_RX = new RegExp("\\b\\d{4}-\\d{2}-\\d{2}(?:[t ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?z?)?\\b|\\b\\d{1,2}:\\d{2}\\b|\\b" + MON_RX + "\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?" + MON_RX + "(?:,?\\s+\\d{4})?\\b", "gi");
export const stripDates = (t) => String(t || "").replace(DATE_RX, " ");
export function numbersKept(plain, source) {
  const src = numTokens(stripDates(source)), pl = numTokens(stripDates(plain));
  const any = new Set(src.map((x) => x.v)), cash = new Set(src.filter((x) => x.cash).map((x) => x.v));
  for (const x of pl) {
    if (x.cash ? !cash.has(x.v) : !any.has(x.v)) return false;
  }
  const srcLow = String(source).toLowerCase();
  for (const m of String(plain).toLowerCase().matchAll(/\b([a-z]+)\b/g)) {
    const n = NUM_WORDS[m[1]];
    if (n != null && !new RegExp("\\b" + m[1] + "\\b").test(srcLow) && !any.has(String(n))) return false;
  }
  const big = src.filter((x) => x.cash && Number(x.v) >= 100).map((x) => Number(x.v));
  if (big.length) {
    const top = String(Math.max(...big)).replace(/\.0+$/, "");
    if (!pl.some((x) => x.cash && x.v === normNum(top))) return false;
  }
  return true;
}

// A day the rewrite names ("October 8", "8 Oct", "the 8th", "2026-10-08") must be named that way in the source too:
// "early October" never becomes "October 8" (the first live rewrite did exactly that, 15 Oct 2026, and every digit of it
// was in the note). An ISO date in the source counts as its month and day; a bare ordinal ("on the 5th") is a day too.
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MON3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const dayRefs = (s) => {
  const out = [];
  let t = String(s).toLowerCase();
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) { const mo = Number(m[2]); if (mo >= 1 && mo <= 12) out.push(MON3[mo - 1] + " " + Number(m[3])); }
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  for (const m of t.matchAll(new RegExp("\\b(" + MONTHS + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)", "g"))) out.push(m[1].slice(0, 3) + " " + Number(m[2]));
  for (const m of t.matchAll(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(" + MONTHS + ")\\b", "g"))) out.push(m[2].slice(0, 3) + " " + Number(m[1]));
  const named = t.replace(new RegExp("\\b(" + MONTHS + ")\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(" + MONTHS + ")\\b", "g"), " ");
  for (const m of named.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/g)) out.push("day " + Number(m[1]));
  return out;
};
export function datesKept(plain, source) {
  const have = dayRefs(source);
  const exact = new Set(have), days = new Set(have.map((d) => d.split(" ")[1]));
  return dayRefs(plain).every((d) => (d.startsWith("day ") ? days.has(d.slice(4)) : exact.has(d)));
}

export async function plainKey(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("plain-v2|" + clean(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// One rewrite through the intel engine (Claude when its key is set, else Workers AI). Never throws; null on failure.
// `onRefused` hears a rewrite the guards turned down (kept as a refusal by the caller, so the same note is not paid for on
// every open); a timeout or an engine error is not a refusal and is tried again next time.
export async function rewritePlain(env, text, { engine, claudeModel, workersModel, timeoutMs = 7000, onRefused } = {}) {
  if (!engine || engine === "none") return null;
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  const run = (async () => {
    if (engine === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctl ? ctl.signal : undefined,
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: claudeModel, max_tokens: 160, system: PLAIN_SYSTEM, messages: [{ role: "user", content: plainPrompt(text) }] }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return (j && j.content && j.content[0] && j.content[0].text) || "";
    }
    const j = await env.AI.run(workersModel, { messages: [{ role: "system", content: PLAIN_SYSTEM }, { role: "user", content: plainPrompt(text) }], max_tokens: 160 });
    return (j && (j.response || j.result || (typeof j === "string" ? j : ""))) || "";
  })().catch(() => null);
  const out = await Promise.race([run, new Promise((res) => { timer = setTimeout(() => res(null), timeoutMs); })]);
  if (timer) clearTimeout(timer);
  if (out == null) { if (ctl) ctl.abort(); return null; }
  const p = parsePlain(out);
  if (p && numbersKept(p, text) && datesKept(p, text)) return p;
  // an EMPTY answer is an engine fault, not a refusal: kept as refused it was never asked again
  if (p != null && typeof onRefused === "function") onRefused(p);
  return null;
}

// ONE INCIDENT, ONE ENTRY (Miguel, 15 Oct 2026: "if you find the same identical report ... or if you see that it's the same
// problem, just merge them into one"). Two field-intel reports are the same incident when their text is the same, or when
// they carry the same dollar amount (a rush cost, $100 or more) within 14 days of each other. The newer report leads; the
// others ride on it (`others`: who, when, full text) so nothing anyone wrote is lost — the page shows them under
// "Full report" and the header names every reporter. Deterministic: no model decides what is a duplicate.
const dollars = (s) => new Set((String(s).match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || []).map((x) => Number(x.replace(/[$,\s]/g, ""))).filter((n) => n >= 100));
const dayNo = (iso) => Math.floor(Date.parse(String(iso || "").slice(0, 10) + "T00:00:00Z") / 86400000);
export function sameIncident(a, b) {
  const ta = clean(a.full || a.text).toLowerCase(), tb = clean(b.full || b.text).toLowerCase();
  if (ta && ta === tb) return true;
  const gap = Math.abs(dayNo(a.at) - dayNo(b.at));
  if (!(gap <= 14)) return false;
  const da = dollars(ta), db = dollars(tb);
  for (const x of da) if (db.has(x)) return true;
  return false;
}
export function mergeIntel(feed) {
  const out = [];
  for (const f of feed) {
    if (f.kind !== "intel") { out.push(f); continue; }
    const lead = out.find((g) => g.kind === "intel" && sameIncident(g, f));
    if (!lead) { out.push({ ...f, others: [] }); continue; }
    lead.others.push({ who: f.who || null, at: f.at, full: f.full || f.text });
    const names = [lead.who].concat(lead.others.map((o) => o.who)).filter(Boolean);
    lead.whoAll = [...new Set(names)].join(" and ");
  }
  return out;
}
