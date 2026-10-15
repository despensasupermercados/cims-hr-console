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

// Every number in the plain line must already be in the source (THE ONE LAW of the fleet apps, applied here).
const nums = (s) => (String(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, ""));
export function numbersKept(plain, source) {
  const have = new Set(nums(source));
  return nums(plain).every((n) => have.has(n));
}

// A day the rewrite names ("October 8", "8 Oct") must be named that way in the source too: "early October" never becomes
// "October 8" (the first live rewrite did exactly that, 15 Oct 2026, and every digit of it was in the note).
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const dayRefs = (s) => {
  const out = [], t = String(s).toLowerCase();
  for (const m of t.matchAll(new RegExp("\\b(" + MONTHS + ")\\.?\\s+(\\d{1,2})(?!\\d)", "g"))) out.push(m[1].slice(0, 3) + " " + Number(m[2]));
  for (const m of t.matchAll(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(" + MONTHS + ")\\b", "g"))) out.push(m[2].slice(0, 3) + " " + Number(m[1]));
  return out;
};
export function datesKept(plain, source) {
  const have = new Set(dayRefs(source));
  return dayRefs(plain).every((d) => have.has(d));
}

export async function plainKey(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("plain-v2|" + clean(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// One rewrite through the intel engine (Claude when its key is set, else Workers AI). Never throws; null on failure.
export async function rewritePlain(env, text, { engine, claudeModel, workersModel, timeoutMs = 7000 } = {}) {
  if (!engine || engine === "none") return null;
  const run = (async () => {
    if (engine === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
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
  const out = await Promise.race([run, new Promise((res) => setTimeout(() => res(null), timeoutMs))]);
  const p = parsePlain(out);
  return p && numbersKept(p, text) && datesKept(p, text) ? p : null;
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
