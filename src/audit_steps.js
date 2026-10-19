// PRINTSHOP AUDIT — the audit on the ship (B1–B7), the pure rules. docs/AUDIT_DESIGN.md "Phase B · on the ship" and the
// approved mock-up v12 (docs/mockups/audit_20261014/, screens A8 and B1–B7), 14 Oct 2026. Built 19 Oct 2026, after
// Miguel found that only the request half of the app existed ("where is the inventory count from dexter .. u missed the
// entire app"): the 15 Oct grade screen had stood in for the whole visit.
//
// Seven steps, one per screen: Workstation · Machines & tools · Inventory · Ratings · Crew · Overall · Review. Every
// checklist starts clean ("one tap when nothing is wrong"); what the reads found before the visit rides into the steps
// as items to confirm (A8): Pattern 43 marks and parts past rated life on the Machines step, the crew's blind count
// against OBP on the Inventory step. A required answer holds Next with the reason under the field.
//
// THE SCORE IS UNCHANGED (§1). The three ratings and the optional Overall are filed through the same audit_eval row and
// the same rule (audit.js auditScore: Overall, else the average of the three rounded down) the Score Card reads. The
// dispatch rating rates TDG's travel, not the specialist: it is kept on the visit and never enters the score. No
// manual mono click % (the design's optional field): mono is read from OBP's clicks file (§10j) — a typed number would
// be a second source for a money factor. Nothing here imports bonus.js (test/audit_guards.test.js).
import { auditScore, gradeProblems, GRADE_NOTE_MIN, AUDIT_RATINGS, parseCount, rating } from "./audit.js";

export const VISIT_VERSION = 1;
export const STEPS = [
  { key: "workstation", title: "Workstation", short: "Workstation" },
  { key: "machines", title: "Machines & tools", short: "Machines" },
  { key: "inventory", title: "Inventory", short: "Inventory" },
  { key: "ratings", title: "Ratings", short: "Ratings" },
  { key: "crew", title: "Crew", short: "Crew" },
  { key: "overall", title: "Overall", short: "Overall" },
  { key: "review", title: "Review", short: "Review" },
];
export const PHOTO_STEPS = ["workstation", "machines", "inventory", "crew"];

// B1 — the Forms survey's desktop checklist (ticked in full on nearly every one of the 61 rows; only the SOPs varied),
// now starting full: Dexter taps what is missing and the record keeps the gaps.
export const WORKSTATION = [
  { grp: "DG3 folder", items: [
    { key: "svc_prod", label: "Service manuals", sub: "Prod" },
    { key: "parts_prod", label: "Parts manual", sub: "Prod" },
    { key: "maint_prod", label: "Maintenance manual", sub: "Prod" },
    { key: "mfd_manuals", label: "Service, Parts, Maintenance", sub: "MFD" },
    { key: "mfd_consumables", label: "Consumables list", sub: "MFD" },
    { key: "sops", label: "SOPs · ordering & transfers" },
  ] },
  { grp: "OneNote", items: [
    { key: "ips", label: "Machine & controller IPs" },
    { key: "contacts", label: "Shoreside contacts" },
  ] },
  { grp: "Browser bookmarks", items: [
    { key: "bm_obp", label: "Onboard Print" }, { key: "bm_zendesk", label: "Zendesk" }, { key: "bm_crunchtime", label: "Crunchtime" },
    { key: "bm_fleet", label: "Fleet Visitor" }, { key: "bm_eccr", label: "ECCR" }, { key: "bm_master", label: "Master Loading" },
  ] },
];
// B2 — per press: the three checks Dexter runs on the machine. Past rated life is information from the Management List,
// never a check he passes or fails ("copy quality decides, not the counter", Miguel 14 Oct 2026).
export const MACHINE_CHECKS = [{ key: "test", label: "Test pattern" }, { key: "scan", label: "Scan to email" }, { key: "collab", label: "Collaboration" }];
// The Forms survey's "tools not on inventory": the Fiery back-up HDD was missing on 28 of 61 rows, the thumb drive and
// the magnetizer on 11 each; the head lamp is from the reviewer feedback.
export const TOOLS = [
  { key: "fiery_hdd", label: "2-Fiery back-up HDD" }, { key: "thumb_drive", label: "Print driver thumb drive" },
  { key: "magnetizer", label: "Magnetizer" }, { key: "head_lamp", label: "Head lamp" },
];
// B5 — Miguel's own note on the survey, 10 Sep 2024: "add list of missing training, uniforms, coveralls, DG3 shirt, perhaps HON".
export const TRAINING = [
  { key: "mfd", label: "MFD refresher" }, { key: "stats", label: "Statistic report" }, { key: "zendesk", label: "Zendesk" },
  { key: "hon", label: "HON app" }, { key: "fiery", label: "Fiery" }, { key: "breakfix", label: "Break-fix PROD" },
];
export const PPE = [{ key: "shirt", label: "DG3 shirt" }, { key: "coveralls", label: "Coveralls" }, { key: "shoes", label: "Safety shoes" }];
// Each rating card says what 5 and 3 mean (the mock-up's anchors).
export const RATING_TEXT = {
  inventory: { label: "Inventory management", hint: "5 OBP live, counts match · 3 updated late · 1 not maintained" },
  technical: { label: "Technical services", hint: "5 break-fix without the manual · 3 relies on it, parts late" },
  collaterals: { label: "Customer collaterals", hint: "5 no incident · 3 incidents, handled · 1 complaints reached the GSM" },
  dispatch: { label: "Dispatch and arrival", hint: "As the crew tells it: travel, hotel, joining. For Rita, never in the score." },
  overall: { label: "Overall, this contract", hint: "Optional. Left blank, the score is the average of the three, rounded down." },
};
export const FOLLOW_OWNERS = ["Rolando", "Ray", "Rita", "Dexter", "Miguel"];
export const TEXT_MIN = 3;        // a box that must say something
export const TEXT_MAX = 2000;
export const FOLLOW_DAYS = 30;    // the follow-up's default due date

const KEYS = (list) => new Set(list.map((x) => x.key));
const WS_KEYS = KEYS(WORKSTATION.flatMap((g) => g.items));
const TOOL_KEYS = KEYS(TOOLS), TRAIN_KEYS = KEYS(TRAINING), PPE_KEYS = KEYS(PPE);
const txt = (v, max = TEXT_MAX) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).filter((k) => typeof k === "string" && allowed.has(k)))];
const isoDay = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + "T00:00:00Z")) ? v : null);
const isoTime = (v) => (typeof v === "string" && !isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(Date.parse(v)).toISOString() : null);
export const plusDays = (day, n) => new Date(Date.parse(String(day).slice(0, 10) + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/* --------------------------------- the clean start --------------------------------- */
// ctx: { machines: [{serial, down, p43, life}], diff: [{part_no, obp, counted, diff, kind}], extras: [{id}], followups: [{id}] }
// Inventory starts on what the crew's count says: lines that differ = "No, discrepancies"; none = "Yes, accurate".
export function startVisit(ctx) {
  const machines = {};
  for (const m of (ctx && ctx.machines) || []) machines[m.serial] = { checks: {}, p43: null, down: null, note: "" };
  const gaps = ((ctx && ctx.diff) || []).filter((d) => d.kind === "gap");
  return {
    v: VISIT_VERSION, openedAt: null,
    ws: { missing: [] },
    hw: { labeled: true, machines, tools: { missing: [] } },
    inv: { accurate: !gaps.length, lines: {}, added: [], repairs: {}, note: "" },
    rt: { inventory: null, technical: null, collaterals: null, why: { inventory: "", technical: "", collaterals: "" } },
    crew: { training: [], trainingOther: "", ppe: { missing: [] }, hon: "yes", dispatch: null },
    ov: { overall: null, why: "", strengths: "", improve: "", agreed: "", recommendBlock: false, followup: null },
    close: {},
  };
}

/* --------------------------------- what the server keeps --------------------------------- */
// Only known keys, typed values and bounded text survive: the page is open on audit.cims.work (no sign-in), so what
// arrives is treated as a stranger's input. Unknown machines, parts, follow-ups and checklist keys are dropped.
export function normalizeVisit(raw, ctx) {
  const r = raw && typeof raw === "object" ? raw : {};
  const serials = new Set(((ctx && ctx.machines) || []).map((m) => m.serial));
  const parts = new Set(((ctx && ctx.parts) || []));
  const extraIds = new Set(((ctx && ctx.extras) || []).map((x) => x.id));
  const fuIds = new Set(((ctx && ctx.followups) || []).map((f) => f.id));
  const hw = r.hw || {}, inv = r.inv || {}, rt = r.rt || {}, crew = r.crew || {}, ov = r.ov || {};
  const machines = {};
  for (const [serial, m0] of Object.entries(hw.machines || {})) {
    if (!serials.has(serial)) continue;
    const m = m0 || {}, checks = {};
    for (const c of MACHINE_CHECKS) if ((m.checks || {})[c.key] === "finding") checks[c.key] = "finding";
    machines[serial] = { checks, p43: m.p43 === "seen" || m.p43 === "not_seen" ? m.p43 : null, down: m.down === "still" || m.down === "running" ? m.down : null, note: txt(m.note, 600) };
  }
  for (const s of serials) if (!machines[s]) machines[s] = { checks: {}, p43: null, down: null, note: "" };
  const lines = {};
  for (const [part, l0] of Object.entries(inv.lines || {})) {
    if (!parts.has(part)) continue;
    const l = l0 || {};
    lines[part] = { shelf: parseCount(l.shelf), checked: l.checked === true };
  }
  // a line Dexter adds is any OBP part not already among the lines the crew's count put off; its shelf number rides in
  // lines too (the page keeps every shelf there), so "already listed" is the crew's gap lines and the added list itself
  const listed = new Set(((ctx && ctx.diff) || []).filter((x) => x.kind === "gap").map((x) => x.part_no));
  const added = [];
  for (const a0 of (Array.isArray(inv.added) ? inv.added : []).slice(0, 40)) {
    const part_no = txt(a0 && a0.part_no, 80);
    if (!part_no || !parts.has(part_no) || listed.has(part_no)) continue;
    listed.add(part_no);
    added.push({ part_no, shelf: parseCount(a0 && a0.shelf) });
  }
  const repairs = {};
  for (const [id, v] of Object.entries(inv.repairs || {})) if (extraIds.has(id) && (v === "confirmed" || v === "not_found")) repairs[id] = v;
  const close = {};
  for (const [id, v] of Object.entries(r.close || {})) if (fuIds.has(id) && (v === "fixed" || v === "open")) close[id] = v;
  let followup = null;
  if (ov.followup && typeof ov.followup === "object") followup = { owner: txt(ov.followup.owner, 60), due: isoDay(ov.followup.due), text: txt(ov.followup.text, 600) };
  return {
    v: VISIT_VERSION, openedAt: isoTime(r.openedAt),
    ws: { missing: pick(r.ws && r.ws.missing, WS_KEYS) },
    hw: { labeled: hw.labeled === false ? false : hw.labeled === true ? true : null, machines, tools: { missing: pick(hw.tools && hw.tools.missing, TOOL_KEYS) } },
    inv: { accurate: inv.accurate === true ? true : inv.accurate === false ? false : null, lines, added, repairs, note: txt(inv.note, 600) },
    rt: { inventory: rating(rt.inventory), technical: rating(rt.technical), collaterals: rating(rt.collaterals),
      why: { inventory: txt((rt.why || {}).inventory, 600), technical: txt((rt.why || {}).technical, 600), collaterals: txt((rt.why || {}).collaterals, 600) } },
    crew: { training: pick(crew.training, TRAIN_KEYS), trainingOther: txt(crew.trainingOther, 120), ppe: { missing: pick(crew.ppe && crew.ppe.missing, PPE_KEYS) },
      hon: ["yes", "no", "na"].includes(crew.hon) ? crew.hon : null, dispatch: rating(crew.dispatch) },
    ov: { overall: rating(ov.overall), why: txt(ov.why, 600), strengths: txt(ov.strengths), improve: txt(ov.improve), agreed: txt(ov.agreed),
      recommendBlock: ov.recommendBlock === true, followup },
    close,
  };
}

/* --------------------------------- what holds Next --------------------------------- */
// Every reason is said under its field, in the step it belongs to: { step, field, say }. The same list holds the
// File button on Review and is re-checked by the server before anything is written.
export function visitProblems(d, ctx, today) {
  const out = [], add = (step, field, say) => out.push({ step, field, say });
  const v = d || {};
  const hw = v.hw || {}, inv = v.inv || {}, rt = v.rt || {}, crew = v.crew || {}, ov = v.ov || {};
  // Machines & tools
  if (hw.labeled !== true && hw.labeled !== false) add("machines", "labeled", "Say whether all hardware is labeled.");
  for (const m of (ctx && ctx.machines) || []) {
    const a = (hw.machines || {})[m.serial] || {};
    const name = m.label || m.serial;
    if (m.down && !a.down) add("machines", "down:" + m.serial, name + ": the crew reported it down. Say whether it still is.");
    if (m.p43 && m.p43.state === "findings" && !a.p43 && a.down !== "still") add("machines", "p43:" + m.serial, name + ": Pattern 43 showed a mark. Say whether you saw it on the machine.");
    const finding = Object.values(a.checks || {}).includes("finding") || a.p43 === "seen";
    if (finding && txt(a.note).length < GRADE_NOTE_MIN) add("machines", "note:" + m.serial, name + ": one sentence on what you found.");
  }
  // Inventory
  if (inv.accurate !== true && inv.accurate !== false) add("inventory", "accurate", "Say whether OBP matches the shelf.");
  if (inv.accurate === false) {
    const shown = ((ctx && ctx.diff) || []).filter((x) => x.kind === "gap").length + (inv.added || []).length;
    if (!shown) add("inventory", "lines", "No discrepancies: add the line that is off, or answer “Yes, accurate”.");
  }
  for (const a of inv.added || []) if (a.shelf == null) add("inventory", "added:" + a.part_no, a.part_no + ": what is on the shelf?");
  for (const x of (ctx && ctx.extras) || []) if (!(inv.repairs || {})[x.id]) add("inventory", "repair:" + x.id, "“" + x.text + "”: confirm it is on the shelf, or not found.");
  // Ratings
  for (const k of ["inventory", "technical", "collaterals"]) {
    const r = rating(rt[k]);
    if (r == null) add("ratings", k, "Rate " + RATING_TEXT[k].label.toLowerCase() + ".");
    else if (r <= 3 && txt((rt.why || {})[k]).length < GRADE_NOTE_MIN) add("ratings", "why:" + k, RATING_TEXT[k].label + " is " + r + ": one sentence on why.");
  }
  // Crew
  if (!["yes", "no", "na"].includes(crew.hon)) add("crew", "hon", "Say whether the HON app is in use.");
  // Overall
  const o = rating(ov.overall);
  if (ov.overall != null && ov.overall !== "" && o == null) add("overall", "overall", "The Overall rating is 1 to 5, or blank.");
  if (o != null && o <= 3 && txt(ov.why).length < GRADE_NOTE_MIN) add("overall", "why", "Overall is " + o + ": one sentence on why.");
  if (txt(ov.strengths).length < TEXT_MIN) add("overall", "strengths", "Strengths: a few words.");
  if (txt(ov.improve).length < TEXT_MIN) add("overall", "improve", "To improve: a few words.");
  if (ov.followup) {
    const f = ov.followup;
    if (!txt(f.owner)) add("overall", "fu_owner", "The follow-up needs an owner.");
    if (!isoDay(f.due)) add("overall", "fu_due", "The follow-up needs a date.");
    else if (today && f.due < String(today).slice(0, 10)) add("overall", "fu_due", "The follow-up date has passed.");
    if (txt(f.text).length < TEXT_MIN) add("overall", "fu_text", "Say what the follow-up is.");
  }
  // Review: each follow-up still open on the ship is answered (it starts "Still open")
  for (const f of (ctx && ctx.followups) || []) if (!["fixed", "open"].includes((v.close || {})[f.id] || "open")) add("review", "close:" + f.id, "Say whether “" + f.text + "” is fixed.");
  return out;
}

// The ratings as the audit_eval row has always carried them (audit.js gradeProblems / auditScore, unchanged): the three,
// the optional Overall, and ONE note — the reasons for every rating of 3 or below, then "To improve".
export function evalOf(d) {
  const rt = (d && d.rt) || {}, ov = (d && d.ov) || {};
  const parts = [];
  for (const k of ["inventory", "technical", "collaterals"]) { const r = rating(rt[k]); const w = txt((rt.why || {})[k]); if (r != null && r <= 3 && w) parts.push(RATING_TEXT[k].label + " (" + r + "): " + w); }
  const o = rating(ov.overall);
  if (o != null && o <= 3 && txt(ov.why)) parts.push("Overall (" + o + "): " + txt(ov.why));
  if (txt(ov.improve)) parts.push("To improve: " + txt(ov.improve));
  const r = { inventory: rating(rt.inventory), technical: rating(rt.technical), collaterals: rating(rt.collaterals), overall: o, note: parts.join("\n").slice(0, TEXT_MAX) };
  return { r, problems: gradeProblems(r), score: auditScore(r) };
}

/* --------------------------------- carried from the last visit --------------------------------- */
// "The overdue follow-up shows 2nd time on the next visit" (design v5). A checklist item missing on this ship's previous
// filed visit and missing again now reads "2nd time" (3rd, …): times = the previous count + 1. Present now = it ends.
export function repeatCounts(prev, d) {
  const was = (prev && prev.repeat) || {};
  const prevMissing = new Set([...(((prev && prev.ws) || {}).missing || []), ...((((prev && prev.hw) || {}).tools || {}).missing || [])]);
  const out = {};
  for (const k of [...(((d && d.ws) || {}).missing || []), ...((((d && d.hw) || {}).tools || {}).missing || [])]) out[k] = prevMissing.has(k) ? (was[k] || 1) + 1 : 1;
  return out;
}
export const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");

/* --------------------------------- A8 · before the visit --------------------------------- */
// The findings of the documents, as items the steps will ask Dexter to confirm. Pattern 43 is provisional until Rolando
// confirms it (design v5); a part past rated life is information, never a replacement by itself. Amber, never red:
// nothing here has been seen on the ship yet.
export function beforeVisit({ machines = [], diff = [], extras = [] } = {}) {
  const out = [];
  for (const m of machines) {
    const name = m.label || m.serial;
    if (m.down) { out.push({ tone: "a", step: "machines", t: name + " reported down", s: "“" + m.down + "” · verify on board" }); continue; }
    const items = (m.p43 && m.p43.items) || [];
    if (items.length) out.push({ tone: "a", step: "machines", t: name + " · Pattern 43: " + items.map((i) => sentence(i.head)).join("; "), s: (items[0].part ? "Points to " + sentence(items[0].part) + " · " : "") + "provisional, Rolando confirms · see it on the machine" });
    const life = m.life || [];
    if (life.length) out.push({ tone: "a", step: "machines", t: name + " · " + life.length + (life.length === 1 ? " part" : " parts") + " past rated life", s: life.map((x) => partName(x.name) + " " + x.pct + "%").join(" · ") + " · copy quality decides" });
  }
  const gaps = diff.filter((x) => x.kind === "gap"), timing = diff.filter((x) => x.kind === "timing");
  if (gaps.length || extras.length) out.push({ tone: "a", step: "inventory", t: "Count: " + [gaps.length ? gaps.length + (gaps.length === 1 ? " line differs" : " lines differ") : "", extras.length ? extras.length + " not in OBP" : ""].filter(Boolean).join(" · "), s: "Counted blind · verify on the shelf" });
  if (timing.length) out.push({ tone: "n", step: "inventory", t: "Count: " + timing.length + (timing.length === 1 ? " line" : " lines") + " one unit off, the day OBP moved " + (timing.length === 1 ? "it" : "them"), s: "Timing (1 Oct rule) · flagged only if it does not close" });
  return out;
}
const sentence = (v) => { const t = String(v || "").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
export const partName = (n) => String(n || "").replace(/\s*\((?:[A-Za-z.]+\s*)?%\)\s*$/, "");

/* --------------------------------- the same rules on the phone --------------------------------- */
// The page is one inline script and cannot import a module, so the rules it gates Next and File with are THESE
// functions, serialized into it (AUDIT_RULES_JS) — one definition, never a hand-kept twin that drifts from what the
// server re-checks. test/audit_steps.test.js runs the serialized copy in a vm against the module on the same inputs.
const RULE_CONSTS = { VISIT_VERSION, STEPS, PHOTO_STEPS, WORKSTATION, MACHINE_CHECKS, TOOLS, TRAINING, PPE, RATING_TEXT, FOLLOW_OWNERS, TEXT_MIN, TEXT_MAX, FOLLOW_DAYS, GRADE_NOTE_MIN, AUDIT_RATINGS };
const RULE_VARS = { rating, txt, isoDay, plusDays, ordinal, partName, sentence };
const RULE_FNS = [startVisit, visitProblems, evalOf, gradeProblems, auditScore];
export const AUDIT_RULES_JS = "window.AR = (function () {\n\"use strict\";\n" +
  Object.entries(RULE_CONSTS).map(([k, v]) => "var " + k + " = " + JSON.stringify(v) + ";").join("\n") + "\n" +
  Object.entries(RULE_VARS).map(([k, f]) => "var " + k + " = " + f.toString() + ";").join("\n") + "\n" +
  RULE_FNS.map((f) => f.toString()).join("\n") + "\n" +
  "return { " + [...Object.keys(RULE_CONSTS), ...Object.keys(RULE_VARS), ...RULE_FNS.map((f) => f.name)].join(", ") + " };\n})();";
