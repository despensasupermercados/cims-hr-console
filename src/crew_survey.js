// THE CREW SURVEY — what the seafarer says at the end of a contract (Miguel, 22 Oct 2026: "build one that function for ..
// all now 4 customers .. triggered once the seafarer sign off .. u will use the seafarer email for that .. and cc rita and
// myself .. when the seafarer answer the survey .. the reply will be for his personal email and cc onboardsupport@DG3.com ..
// the reporting .. under the hr console under reports tab .. we will call it . crew survey"; mock-ups approved 23 Oct 2026
// with "1. yes. 2. yes or ok, 3. call it shipboard manager": one reminder after 5 days, NCL's supervisor reads "shipboard
// manager"; the same day "make them generic all of them .. I don't want anything standing or pending": no reply to the seafarer
// is promised anywhere). Pure: the questions, who is due, the reminder, the answer check, the report and the Forms history reader. FEEDBACK ONLY: nothing here feeds the Score Card, bonus_outcome or
// a payout (§1), and nothing is sent to the cruise line. Pinned by test/crew_survey.test.js.

// Rita's 19 statements, word for word (Microsoft Forms "Seafarer End-of-Contract / Exit Survey", 18 Dec 2025), keyed in HER
// order so every answer since December stays comparable; the page groups them into five short screens by topic.
export const QUESTIONS = [
  ["q01", "I have received clear expectations for my job.", "Clear expectations"],
  ["q02", "The onboarding and handover process prepared me adequately for my role.", "Onboarding & handover"],
  ["q03", "The equipment and tools provided allowed me to perform my job effectively.", "Equipment & tools"],
  ["q04", "Training received prior to embarkation met the actual job requirements onboard.", "Training before embarking"],
  ["q05", "Systems, SOPs, and workflows onboard were clear and practical.", "Systems, SOPs & workflows"],
  ["q06", "Inventory availability supported uninterrupted job performance.", "Inventory availability"],
  ["q07", "My direct supervisor{M} provided clear direction and expectations.", "Supervisor direction"],
  ["q08", "I received timely support when issues or escalations arose.", "Timely support on issues"],
  ["q09", "Shore-side support was accessible and effective when needed.", "Shore-side support"],
  ["q10", "Workload and scheduling were reasonable for the role.", "Workload & scheduling"],
  ["q11", "Communication between departments was effective.", "Communication between departments"],
  ["q12", "I felt respected and treated fairly onboard.", "Respected & treated fairly"],
  ["q13", "Contract terms matched what was originally communicated.", "Contract terms as communicated"],
  ["q14", "Pay, benefits, and contract administration were handled accurately and on time.", "Pay, benefits & admin"],
  ["q15", "Crew welfare, rest periods, and well-being were taken seriously.", "Welfare & rest"],
  ["q16", "I received constructive feedback on my performance.", "Constructive feedback"],
  ["q17", "I had opportunities to learn, improve, or grow in my role.", "Room to grow"],
  ["q18", "Overall, I am satisfied with my contract experience.", "Overall satisfaction"],
  ["q19", "I would consider returning for another contract.", "Would return"],
  // Added 23 Oct 2026 (Miguel: "3. yes do it"): travel is the largest cost line and the Forms' one written fix was "hotel
  // accommodations before embarking"; no statement measured it. Keyed after Rita's 19 so her history stays comparable.
  ["q20", "My travel, hotel and joining arrangements were well organized.", "Travel & joining"],
].map(([key, text, short]) => ({ key, text, short }));
export const FIX_QUESTION = "What is the one thing we should fix first to improve the seafarer experience?";
export const KEYS = QUESTIONS.map((q) => q.key);
export const OVERALL = "q18", RETURN = "q19";
// The statements the Microsoft Forms survey asked (Rita's 19); q20 came with the console, so a Forms answer never has it.
export const FORMS_KEYS = KEYS.filter((k) => k !== "q20");
export const SECTIONS = [
  { title: "The job", intro: "Before you boarded and your first weeks.", keys: ["q01", "q02", "q03", "q04", "q20"] },
  { title: "The print shop", intro: "How the work itself ran.", keys: ["q05", "q06", "q10", "q11"] },
  { title: "Support", intro: "The people behind you, aboard and ashore.", keys: ["q07", "q08", "q09", "q16", "q17"] },
  { title: "You", intro: "How you were treated, and how you were paid.", keys: ["q12", "q15", "q13", "q14"] },
  { title: "Overall", intro: "Two last ones, then one in your own words.", keys: ["q18", "q19"], open: true },
];
export const SCALE = ["No", "Not really", "Partly", "Mostly", "Yes"];

// The supervisor statement names the line's own title; NCL has none on record (Miguel, 23 Oct 2026: "call it shipboard
// manager").
export const SUPERVISOR = { Royal: "GSM", Celebrity: "DCM", Azamara: "BOM", NCL: "shipboard manager" };
export const statementFor = (q, brand) => q.text.replace("{M}", SUPERVISOR[brand] ? " (" + SUPERVISOR[brand] + ")" : "");

export const SURVEY_CATCHUP_DAYS = 14;   // TDG's file can confirm a debark a week or more after the day
export const SURVEY_DELAY_DAYS = 3;      // Miguel, 23 Oct 2026 ("ok go ahead"): 3 days after the sign-off, so Rita can record
                                         // why a contract ended (Performance / Medical / Compassionate are not asked) first
export const SURVEY_REMIND_DAYS = 5;     // Miguel, 23 Oct 2026: "1. yes" — one reminder
export const SURVEY_LINK_DAYS = 30;
export const SURVEY_TZ = "America/New_York";
export const SURVEY_HOUR = "07";
export const SURVEY_CC = ["Rita.Berenyi@dg3.com", "Miguel.Sanmartin@dg3.com"];
export const SURVEY_REPLY_TO = "Rita.Berenyi@dg3.com";
export const SURVEY_ANSWERS_CC = "onboardsupport@dg3.com";
export const NEEDS_CALL_LOW = 3;         // the watchlist: three or more answers at 1–2
export const NEEDS_CALL_RETURN = 2;      // or "Would return" at 1–2 (Miguel, 23 Oct 2026, the HR view: "said they would not return")
// The HR view (Miguel, 23 Oct 2026). Under SURVEY_MIN_READ answers the averages are a floor check, not a measure, and the page
// says so; a cell of the theme table with fewer than SURVEY_MIN_CELL answers stays grey; a quarter shows on the trend only
// with SURVEY_MIN_QUARTER answers; a fix theme named by FIX_HOT people in the period leads, in red.
export const SURVEY_MIN_READ = 20, SURVEY_MIN_CELL = 3, SURVEY_MIN_QUARTER = 10, FIX_HOT = 3;
// The written fix, grouped by keyword (no model) and owned (Miguel, 23 Oct 2026: "2. yes" to these three owners). A fix that
// names two themes is under both; one that names none is "Other", no owner set.
// What a seafarer asked us to fix, by keyword, no model (Miguel, 23 Oct 2026: "2. yes"; then, of the report built on it, "it does
// not make any sense"). Read CLAUSE by clause: a clause that names a theme counts only when it is not praise or a "nothing"
// ("perks, benefits and guidance are impeccable" is not a pay ask; "the training was not lacking" is not a training ask). A
// written answer with no theme counts as "Other asks" only when a clause asks or complains (ASK_RX); the rest is thanks.
// Handover is its own theme (the lowest statement on the Forms history, and five of them asked for a longer one); owner
// Ray / Rolando (Miguel, 23 Oct 2026: "do it", on the suggestion).
export const FIX_THEMES = [
  { key: "travel", label: "Travel & joining", owner: "Rita / TDG", rx: /\b(hotels?|flights?|airports?|airfare|layovers?|lounges?|tickets?|visas?|joining|embark\w*|transfers?|transportation|accommodations?|luggage|baggage|jet ?lags?|rest)\b/i },
  { key: "handover", label: "Handover time", owner: "Ray / Rolando", rx: /\b(hand ?-?overs?|turn ?-?overs?|endors\w*)\b/i },
  { key: "pay", label: "Pay & benefits", owner: "Miguel", rx: /\b(pay|payroll|salary|salaries|wages?|allowances?|internet|wi-?fi|bonus(?:es)?|benefits?|compensation|hmo|stripes?|stipes|service awards?|allotments?|reimburs\w*)\b/i },
  { key: "training", label: "Training", owner: "Ray / Rolando", rx: /\b((more|better|additional|deeper|further|proper|in[- ]depth)\s+(\w+\s+){0,2}training|troubleshoot\w*|courses?)\b/i },
];
const PRAISE_RX = /\b(nothing|not lacking|impeccable|excellent|works fine|all (is )?good|no complaints?)\b/i;
const ASK_RX = /\b(please|requests?|i hope (next|to|that|we|i)|would like (to have|a|an|more)|wish|maybe|bring (it )?back|increase|provide|(?<!anything )more (?!to |than )\w+|do \d|should|never|not enough|too (much|many|long|short|late|little)|late|delay\w*|lack\w*|difficult)\b/i;
// "but" / "except" / "however" start a new clause: "The hotel was excellent but the flight was delayed" is a travel ask,
// never thanks because its first half praises (23 Oct 2026 review)
const clausesOf = (t) => String(t == null ? "" : t).split(/(?<=[.;!?])\s+|\n+|,\s+|\s+-\s+|\s+(?=(?:but|except|however|although|though)\b)/i).map((x) => x.replace(/^and\s+/i, "").trim()).filter(Boolean);
// The themes one written answer asks about, and whether it asks for anything at all.
export function fixThemes(text) {
  if (isNothing(text)) return { themes: [], ask: false };
  const cl = clausesOf(text).filter((c) => !PRAISE_RX.test(c));
  const themes = FIX_THEMES.filter((t) => cl.some((c) => t.rx.test(c))).map((t) => t.key);
  return { themes, ask: themes.length > 0 || cl.some((c) => ASK_RX.test(c)) };
}
// An answer is "quick" when every statement got the same number in under a minute (Miguel, 23 Oct 2026: "4. ok"): it stays
// listed and counted, but leaves the averages, so a tap-through on 5 does not lift the score. Forms answers have no timing.
export const QUICK_SECS = 60;
// Who is NOT asked (Miguel, 23 Oct 2026, "yes to all"): a contract ended for Performance, or a seafarer TDG (or Rita's manual
// status) has as Not for Rehire, gets no "Welcome home" email; a Medical or Compassionate ending is not asked either, the tone
// would be wrong. Each is listed on the report with its reason and a Send anyway button, nothing waits for anyone.
export const SKIP_REASONS = { not_for_rehire: "Not for Rehire", performance: "Ended for performance", medical: "Medical sign-off", compassionate: "Compassionate sign-off" };
export function surveySkip({ status, rawStatus, endReason } = {}) {
  if (/not\s*for\s*re-?hire/i.test(String(rawStatus || "")) || /not\s*for\s*re-?hire/i.test(String(status || ""))) return "not_for_rehire";
  const r = String(endReason || "").trim().toLowerCase();
  if (r === "performance") return "performance";
  if (r === "medical") return "medical";
  if (r === "compassionate") return "compassionate";
  return null;
}
export const quickAnswer = (r) => !!(r && r.source !== "forms" && Number.isInteger(r.answer_secs) && r.answer_secs < QUICK_SECS && r.answers
  && new Set(KEYS.map((k) => r.answers[k]).filter((v) => v != null)).size === 1);
export const FIX_MAX = 2000;

export const SURVEY_DDL = [
  "CREATE TABLE IF NOT EXISTS crew_survey (id TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT 'console', agency_id TEXT, crew_name TEXT, ship TEXT, brand TEXT, on_key TEXT, sign_off TEXT, token TEXT UNIQUE, email TEXT, invited_at TEXT, invite_to_json TEXT, invited_by TEXT, reminded_at TEXT, opened_at TEXT, expires_at TEXT, submitted_at TEXT, answers_json TEXT, fix_text TEXT, copy_sent_at TEXT, called_at TEXT, called_by TEXT, call_note TEXT, form_no INTEGER UNIQUE, placed_why TEXT, created_at TEXT NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_crew_survey_contract ON crew_survey (agency_id, on_key) WHERE source = 'console'",
  "CREATE INDEX IF NOT EXISTS idx_crew_survey_submitted ON crew_survey (submitted_at)",
];
// Columns added after the table (migrations/0041): how long the answer took, Start to Send, in seconds (QUICK_SECS).
export const SURVEY_ALTERS = ["ALTER TABLE crew_survey ADD COLUMN answer_secs INTEGER"];

const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
export const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const emailOk = (e) => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(String(e || "").trim());
export const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";

// The contracts the daily run asks: ENDED on the board (TDG's debark, Rita's typed date or a reliever's card — a projected
// sign-off that passed is overdue, still aboard, never asked), never a training visit, ended SURVEY_DELAY_DAYS or more
// before today, within the catch-up window, and never before the day the switch went on. One per contract (sc + sign-on).
export function surveyDue(legs, today, since) {
  const lo = [addDays(today, -SURVEY_CATCHUP_DAYS), iso(since) || "0000-00-00"].sort().pop();
  const seen = new Set(), out = [];
  for (const l of Array.isArray(legs) ? legs : []) {
    if (!l || !l.sc || l.is_current || l.ours === false || l.visit || !iso(l.on) || !iso(l.off)) continue;
    if (!["tdg", "rita", "card"].includes(l.offSource)) continue;
    const off = iso(l.off);
    if (off > addDays(today, -SURVEY_DELAY_DAYS) || off < lo) continue;
    const k = l.sc + "|" + iso(l.on);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

// One reminder, SURVEY_REMIND_DAYS after the invitation, while the link is open and nothing was sent back.
// Counted in CALENDAR days: the run fires on the hour and the invitation is stamped seconds after it, so an exact 5×24h cut
// slipped every reminder to day 6 (23 Oct 2026 review).
export function remindDue(rows, nowIso) {
  const cut = addDays(String(nowIso).slice(0, 10), -SURVEY_REMIND_DAYS);
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.source === "console" && r.invited_at && String(r.invited_at).slice(0, 10) <= cut && !r.reminded_at && !r.submitted_at && (!r.expires_at || r.expires_at > nowIso));
}

// What the seafarer sent: every statement a whole 1–5, the open line optional text. Anything else is refused, never
// guessed into a number.
export function checkAnswers(body) {
  const a = body && typeof body === "object" ? body.answers : null;
  if (!a || typeof a !== "object") return { ok: false, error: "no_answers" };
  const out = {}, missing = [];
  for (const k of KEYS) {
    const v = a[k];
    const n = typeof v === "number" ? v : typeof v === "string" && /^[1-5]$/.test(v) ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 5) missing.push(k); else out[k] = n;
  }
  if (missing.length) return { ok: false, error: "incomplete", missing };
  const f = body.fix == null ? "" : body.fix;
  if (typeof f !== "string") return { ok: false, error: "bad_fix" };
  // How long he took, from Start to Send, as the page measured it: a whole number of seconds, else not recorded.
  const secs = Number.isInteger(body.secs) && body.secs >= 0 && body.secs <= 86400 ? body.secs : null;
  return { ok: true, answers: out, fix: f.replace(/\r/g, "").trim().slice(0, FIX_MAX) || null, secs };
}

export const lowKeys = (ans) => KEYS.filter((k) => ans && Number.isInteger(ans[k]) && ans[k] <= 2);

// "Nothing", "none", "nothing to improve" and the like are not something to fix; "Nothing arrived on time" is.
export const isNothing = (t) => { const x = String(t == null ? "" : t).trim(); return !x || /^(n\/?a|none|nil|no|-+|\.+|no comments?|nothing(\s+(to\s+\w+|at all|for now|so far|else|really|much|in particular|special))*)[\s.!,]*$/i.test(x) || /^(for me it'?s nothing|nothing on my (side|part|end)\b)/i.test(x); };

// ---- the report: Reports › Crew survey -------------------------------------------------------------------------------
export const LINES = ["Royal", "Celebrity", "Azamara", "NCL"];
export function periodFrom(p, today) {
  const y = today.slice(0, 4), m = +today.slice(5, 7);
  if (p === "30D") return addDays(today, -30);
  if (p === "QTD") return y + "-" + String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0") + "-01";
  if (p === "YTD") return y + "-01-01";
  return "0000-00-00";
}
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const round2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

// The clause of a written fix that names the theme (Jeremy's one sentence carries two fixes); the whole text when it is short.
export function fixClause(text, rx) {
  const t = String(text == null ? "" : text).trim();
  if (t.length <= 90 || !rx) return t;
  const hit = clausesOf(t).find((x) => rx.test(x) && !PRAISE_RX.test(x));
  return hit && hit.length < t.length ? "\u2026" + hit.replace(/[.,;]+$/, "") + "\u2026" : t;
}
export function fixGroups(fixes) {
  const by = new Map(FIX_THEMES.map((t) => [t.key, { key: t.key, label: t.label, owner: t.owner, items: [] }]));
  by.set("other", { key: "other", label: "Other asks", owner: null, items: [] });
  for (const f of fixes || []) {
    const { themes, ask } = fixThemes(f.text);
    if (!ask) continue;
    if (!themes.length) by.get("other").items.push({ ...f, clause: fixClause(f.text, null) });
    for (const k of themes) by.get(k).items.push({ ...f, clause: fixClause(f.text, FIX_THEMES.find((t) => t.key === k).rx) });
  }
  return [...by.values()].filter((g) => g.items.length).map((g) => ({ ...g, n: g.items.length, hot: g.key !== "other" && g.items.length >= FIX_HOT }))
    .sort((a, b) => ((a.key === "other") - (b.key === "other")) || (b.hot - a.hot) || (b.n - a.n));
}
// Every answer the same number (all 5s, mostly): the ceiling the HR view warns about.
export const allSame = (ans) => { const v = KEYS.map((k) => ans && ans[k]).filter(Number.isInteger); return v.length > 1 && v.every((x) => x === v[0]); };
const quarterOf = (d) => d.slice(0, 4) + "-Q" + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);
// rows: crew_survey rows (answers parsed); ended: the board's ended contracts (for the loop's "signed off"); p: period;
// line: a cruise line or "all".
export function surveyReport({ rows, ended, today, p = "All", line = "all" }) {
  const from = periodFrom(p, today);
  const inLine = (b) => line === "all" || b === line;
  const all = (Array.isArray(rows) ? rows : []).filter((r) => r && inLine(r.brand));
  const answered = all.filter((r) => r.submitted_at && r.answers && iso(r.submitted_at) >= from);
  const asked = all.filter((r) => r.source === "console" && r.invited_at && iso(r.invited_at) >= from);
  const scored = answered.filter((r) => !quickAnswer(r)); // a quick tap-through is listed, never averaged
  const q = (k) => scored.map((r) => r.answers[k]).filter((v) => Number.isInteger(v));
  const statements = QUESTIONS.map((x) => ({ key: x.key, short: x.short, avg: round2(avg(q(x.key))), low: q(x.key).filter((v) => v <= 2).length, n: q(x.key).length }))
    .filter((s) => s.n).sort((a, b) => a.avg - b.avg || b.low - a.low || a.key.localeCompare(b.key));
  const ov = q(OVERALL), rt = q(RETURN);
  const byLine = LINES.map((b) => { const xs = scored.filter((r) => r.brand === b).map((r) => r.answers[OVERALL]).filter(Number.isInteger); return { line: b, n: xs.length, avg: round2(avg(xs)) }; });
  const callWhy = (r) => { const w = []; if (lowKeys(r.answers).length >= NEEDS_CALL_LOW) w.push("low"); if (Number.isInteger(r.answers[RETURN]) && r.answers[RETURN] <= NEEDS_CALL_RETURN) w.push("return"); return w; };
  const calls = answered.filter((r) => callWhy(r).length).map((r) => ({ why: callWhy(r), ret: r.answers[RETURN] ?? null,
    id: r.id, name: r.crew_name, agency_id: r.agency_id || null, ship: r.ship, at: iso(r.submitted_at), fix: r.fix_text || null,
    low: lowKeys(r.answers).map((k) => ({ key: k, short: QUESTIONS.find((x) => x.key === k).short, v: r.answers[k] })),
  }));
  const fixes = answered.filter((r) => fixThemes(r.fix_text).ask).map((r) => ({ id: r.id, text: r.fix_text, name: r.crew_name, ship: r.ship, at: iso(r.submitted_at) }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const endedIn = (Array.isArray(ended) ? ended : []).filter((l) => iso(l.off) >= from && inLine(l.brand));
  const loop = {
    signedOff: endedIn.length,
    invited: asked.length,
    opened: asked.filter((r) => r.opened_at).length,
    answered: asked.filter((r) => r.submitted_at).length,
    noEmail: endedIn.filter((l) => l.noEmail && !l.skip).map((l) => ({ sc: l.sc, name: l.name || null, ship: l.ship, off: iso(l.off) })),
    // not asked on purpose (surveySkip): each with its reason and the contract, for Send anyway
    skipped: endedIn.filter((l) => l.skip).map((l) => ({ sc: l.sc, on: iso(l.on), name: l.name || null, ship: l.ship, off: iso(l.off), why: l.skip, label: SKIP_REASONS[l.skip] || l.skip, asked: !!l.asked })),
  };
  const list = answered.slice().sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1)).map((r) => ({
    id: r.id, at: iso(r.submitted_at), name: r.crew_name, agency_id: r.agency_id || null, ship: r.ship, line: r.brand || null, source: r.source,
    overall: r.answers[OVERALL] ?? null, ret: r.answers[RETURN] ?? null, low: lowKeys(r.answers).length, words: fixThemes(r.fix_text).ask,
    answers: r.answers, fix: r.fix_text || null, secs: Number.isInteger(r.answer_secs) ? r.answer_secs : null, quick: quickAnswer(r), same: allSame(r.answers),
  }));
  // waiting = the link still open; one past SURVEY_LINK_DAYS is not "waiting", it closed unanswered (23 Oct 2026 review)
  const waiting = asked.filter((r) => !r.submitted_at && (!r.expires_at || iso(r.expires_at) >= today)).map((r) => ({ id: r.id, name: r.crew_name, agency_id: r.agency_id || null, ship: r.ship, invited_at: iso(r.invited_at), reminded_at: iso(r.reminded_at), opened: !!r.opened_at, expires_at: iso(r.expires_at) }));
  // The theme table: every line (the line chip does not narrow it), the period's scored answers, the number behind each cell.
  const inPeriod = (Array.isArray(rows) ? rows : []).filter((r) => r && r.submitted_at && r.answers && iso(r.submitted_at) >= from && !quickAnswer(r));
  const cell = (rs, keys) => { const xs = []; let n = 0; for (const r of rs) { const v = keys.map((k) => r.answers[k]).filter(Number.isInteger); if (v.length) { n++; xs.push(...v); } } return { n, avg: round2(avg(xs)) }; };
  const themeRows = SECTIONS.filter((x) => !x.open).map((x) => ({ title: x.title, keys: x.keys })).concat([{ title: "Would return", keys: [RETURN] }]);
  const themes = themeRows.map((t) => ({ title: t.title, keys: t.keys, short: t.keys.map((k) => QUESTIONS.find((x) => x.key === k).short),
    cells: Object.fromEntries(LINES.map((b) => [b, cell(inPeriod.filter((r) => r.brand === b), t.keys)])), all: cell(inPeriod, t.keys) }));
  // The trend: every period, this line; a quarter is drawn only with SURVEY_MIN_QUARTER answers.
  const qs = new Map();
  for (const r of all.filter((x) => x.submitted_at && x.answers && !quickAnswer(x))) { const k = quarterOf(iso(r.submitted_at)); if (!qs.has(k)) qs.set(k, []); qs.get(k).push(r); }
  const quarters = [...qs.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([q, rs]) => {
    const o = rs.map((r) => r.answers[OVERALL]).filter(Number.isInteger), t = rs.map((r) => r.answers[RETURN]).filter(Number.isInteger);
    return { q, n: rs.length, overall: round2(avg(o)), wouldReturn: t.length ? { yes: t.filter((v) => v >= 4).length, of: t.length } : null, shown: rs.length >= SURVEY_MIN_QUARTER };
  });
  const out = {
    p, line, from, n: answered.length, quick: answered.length - scored.length, allSame: answered.filter((r) => allSame(r.answers)).length,
    byLineCount: Object.fromEntries(LINES.map((b) => [b, answered.filter((r) => r.brand === b).length])),
    overall: round2(avg(ov)), fives: ov.filter((v) => v === 5).length,
    wouldReturn: rt.length ? { yes: rt.filter((v) => v >= 4).length, of: rt.length } : null,
    rate: asked.length ? { answered: loop.answered, of: asked.length } : null,
    // written answers that ask for nothing (thanks, "all good"), and answers with nothing written
    thanks: answered.filter((r) => String(r.fix_text || "").trim() && !fixThemes(r.fix_text).ask).length, unwritten: answered.filter((r) => !String(r.fix_text || "").trim()).length,
    watch: calls, statements, fixes, fixGroups: fixGroups(fixes), byLine, loop, list, waiting, themes, quarters,
    minRead: SURVEY_MIN_READ, minCell: SURVEY_MIN_CELL, minQuarter: SURVEY_MIN_QUARTER,
    questions: QUESTIONS.map((x) => ({ key: x.key, short: x.short, text: statementFor(x, null) })),
  };
  return out;
}

// ---- the Forms history (Rita's export "Seafarer End-of-Contract _ Exit Survey(1-64).xlsx") ------------------------------
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\{m\}/g, "").replace(/\([^)]*\)/g, "").replace(/[^a-z]+/g, " ").trim();
// Header → { id, done, name, ship, keys: {col: qKey}, fix } by the header's own words, never by position.
export function formsSurveyColumns(header) {
  const h = (Array.isArray(header) ? header : []).map((x) => norm(x));
  const find = (rx) => h.findIndex((x) => rx.test(x));
  const keys = {};
  for (const q of QUESTIONS) { const want = norm(q.text); const i = h.findIndex((x) => x === want); if (i >= 0) keys[i] = q.key; }
  return { id: find(/^id$/), done: find(/^completion time$/), name: find(/^write your name$/), ship: find(/select your current or last ship/), fix: find(/one thing we should fix first/), keys };
}
// "8/13/26 11:41:42" or a Date or an Excel serial → ISO day.
export function formsDay(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 864e5)).toISOString().slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(String(v || "").trim());
  if (!m) return iso(String(v || "")) || null;
  return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
}
// The sheet (2-D, header first) → { rows, skipped }. place(name, ship, day) → { sc, why } decides who it was (the audit
// Forms rule: the schedule that day, else a full name on the roster — never a guess); brandOf(ship) the cruise line.
export function readFormsSurvey(sheet, { place = () => ({ sc: null, why: "not placed" }), brandOf = () => null, shipName = (s) => s } = {}) {
  const rows = Array.isArray(sheet) ? sheet : [];
  const c = formsSurveyColumns(rows[0]);
  const out = [], skipped = [];
  if (Object.keys(c.keys).length < FORMS_KEYS.length || c.id < 0) return { rows: out, skipped, error: "not_the_exit_survey", found: Object.keys(c.keys).length };
  for (const r of rows.slice(1)) {
    if (!r || r.every((x) => x == null || String(x).trim() === "")) continue;
    const no = Number(r[c.id]);
    const ans = {};
    for (const [col, k] of Object.entries(c.keys)) { const v = Number(r[col]); if (Number.isInteger(v) && v >= 1 && v <= 5) ans[k] = v; }
    if (Object.keys(ans).length !== Object.keys(c.keys).length) { skipped.push({ form: no, why: "not every statement answered" }); continue; }
    const day = formsDay(r[c.done]);
    if (!day) { skipped.push({ form: no, why: "no completion date" }); continue; }
    const typed = String(r[c.name] == null ? "" : r[c.name]).trim();
    const shipRaw = String(r[c.ship] == null ? "" : r[c.ship]).trim();
    const ship = shipName(shipRaw) || shipRaw;
    const who = place(typed, ship, day) || {};
    const fix = c.fix >= 0 && r[c.fix] != null ? String(r[c.fix]).replace(/\r/g, "").trim() : "";
    out.push({ form_no: no, submitted: day, crew_name: typed || null, agency_id: who.sc || null, placed_why: who.why || null, ship, brand: brandOf(ship), answers: ans, fix: fix || null });
  }
  return { rows: out, skipped };
}
