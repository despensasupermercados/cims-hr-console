// hr.audit.filed.v1 — the audit is filed (docs/AUDIT_DESIGN.md "Filed": "summary email to Miguel with Rita, Ray, Rolando
// in copy"; the mock-up's B7 "Where it goes"). Built ONLY from what the filing stored: the grade (audit_eval), the steps
// and what the documents said (audit_visit_data, data.ctx), the follow-ups. Never from a later read.
// NOT WIRED TO SEND (19 Oct 2026): an email ships only after Miguel signs off its render (CIMS email standard §5).
// Never to the crew. Nothing here is money (§1): the score is said as the score the Score Card reads, never its points.
// Spacing is table-cell padding only (Outlook desktop / Word): blk() in audit_kit; pinned by test/audit_email_outlook.test.js.
import { frame, row, card, blk, pill, esc, fmtWhen, fmtDate, T, FH, FB, FM } from "./audit_kit.js";
import { WORKSTATION, TOOLS, TRAINING, PPE, MACHINE_CHECKS, RATING_TEXT, ordinal, partName } from "../audit_steps.js";

export const TEMPLATE_ID = "hr.audit.filed.v1";
const PARTS_RULE = "Parts are changed on copy quality, not on a count.";
const labelIn = (list, k) => { const x = list.find((i) => i.key === k); return x ? x.label + (x.sub ? " (" + x.sub + ")" : "") : k; };
const WS_ITEMS = WORKSTATION.flatMap((g) => g.items);
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const short = (v) => { const s = fmtDate(v); return s ? s.replace(/, \d{4}$/, "") : ""; };
// "Oct 12–14, 2026" — a visit often runs two or three days (design: stamped twice, opened and filed)
export function visitWhen(openedAt, filedAt) {
  const o = String(openedAt || "").slice(0, 10), f = String(filedAt || "").slice(0, 10);
  if (!o || o === f) return fmtDate(f);
  if (o.slice(0, 7) === f.slice(0, 7)) return short(o) + "–" + (+f.slice(8, 10)) + ", " + f.slice(0, 4);
  return short(o) + " – " + fmtDate(f);
}

export function filedEmail({ id, ship, crew, contract, auditor, openedAt, filedAt, grade = {}, data = {}, followups = [], carried = [], photos = 0, link, test = false }) {
  const d = data || {}, rt = d.rt || {}, ov = d.ov || {}, cr = d.crew || {}, hw = d.hw || {}, inv = d.inv || {}, cx = d.ctx || {};
  const fn = first(crew) || "The crew", who = auditor || "Dexter";
  const score = grade.score, fu = followups.filter((f) => f.status !== "fixed")[0] || null;
  const low = (v) => v != null && v <= 3;
  const missing = [...((d.ws || {}).missing || []).map((k) => [labelIn(WS_ITEMS, k), k]), ...(((hw.tools || {}).missing) || []).map((k) => [labelIn(TOOLS, k), k])];
  const times = (k) => (d.repeat || {})[k] || 1;
  const gaps = (cx.diff || []).filter((x) => x.kind === "gap");
  const shelfOf = (p) => ((inv.lines || {})[p] || {}).shelf;
  const offShelf = gaps.filter((g) => shelfOf(g.part_no) != null && shelfOf(g.part_no) !== g.obp);

  const subject = (test ? "[TEST] " : "") + "Printshop audit · " + ship + " · " + crew + " · " + score + "/5" + (fu ? " · follow-up for " + fu.owner : "");
  const head = fn + " scored " + score + " out of 5.";
  const head2 = fu ? "One follow-up for " + fu.owner + (fu.due ? " by " + short(fu.due) : "") + "." : "Nothing to follow up.";
  const lead = esc(who) + " audited " + esc(crew) + (contract ? " (" + esc(contract) + ")" : "") + " on " + esc(ship) + ", " + esc(visitWhen(openedAt, filedAt)) + ". The score is " +
    (grade.from === "overall" ? "the Overall rating." : "the average of the three ratings, rounded down.");

  const section = (txt, right) => row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${FH};font-size:18px;font-weight:600;color:${T.navy};">${txt}</td>${right ? `<td align="right" valign="bottom" style="font-family:${FB};font-size:13px;color:${T.slate};">${right}</td>` : ""}</tr></table>`, "28px 32px 0");
  const line = (k, v, i) => `<tr><td valign="top" width="116" style="padding:${i ? "10px" : "0"} 12px 0 0;${i ? "border-top:1px solid " + T.border + ";" : ""}font-family:${FB};font-size:13px;color:${T.slate};">${k}</td><td valign="top" style="padding:${i ? "10px" : "0"} 0 0;${i ? "border-top:1px solid " + T.border + ";" : ""}font-family:${FB};font-size:14px;color:${T.body};line-height:1.45;">${v}</td></tr>`;
  const lines = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.filter(Boolean).map((r, i) => line(r[0], r[1], i)).join("")}</table>`;
  const num = (v) => `<span style="font-family:${FH};font-size:16px;font-weight:700;color:${low(v) ? T.red : T.greenInk};">${v == null ? "–" : esc(v)}</span>`;

  // Ratings: each with its sentence when it is 3 or below (the rule that held the File button)
  const why = rt.why || {};
  const ratingRows = ["inventory", "technical", "collaterals"].map((k) => [esc(RATING_TEXT[k].label), num(rt[k]) + (low(rt[k]) && why[k] ? blk(`padding-top:3px;font-family:${FB};font-size:14px;color:${T.body};`, esc(why[k])) : "")]);
  ratingRows.push(["Overall", ov.overall == null ? `<span style="color:${T.slate};">Not given · the score is the average</span>` : num(ov.overall) + (low(ov.overall) && ov.why ? blk(`padding-top:3px;font-family:${FB};font-size:14px;color:${T.body};`, esc(ov.why)) : "")]);
  const feedback = [["Strengths", ov.strengths], ["To improve", ov.improve], ["Agreed with " + fn, ov.agreed]].filter((x) => x[1]).map((x) => [esc(x[0]), esc(x[1])]);

  // The desk and the tools: what was missing, "2nd time" when it was missing on this ship's last audit too
  const missRows = missing.map(([l, k], i) => { const bt = i ? "border-top:1px solid " + T.border + ";" : ""; return `<tr><td style="padding:${i ? 7 : 0}px 0 7px;${bt}font-family:${FB};font-size:14px;color:${T.body};">${esc(l)}</td><td align="right" style="padding:${i ? 7 : 0}px 0 7px 10px;${bt}">${times(k) > 1 ? pill(ordinal(times(k)) + " time", "red") : pill("Missing", "amber")}</td></tr>`; }).join("");
  const desk = card((missing.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${missRows}</table>` : blk(`font-family:${FB};font-size:14px;color:${T.greenInk};font-weight:700;`, "Everything in place.")) +
    blk(`padding-top:10px;font-family:${FB};font-size:13px;color:${T.slate};`, "Hardware labeled: " + (hw.labeled === true ? "yes" : hw.labeled === false ? "no" : "not said")));

  // Machines: what Dexter saw on each press, against what the documents said (data.ctx)
  const machineRows = (cx.machines || []).map((m, i) => {
    const s = ((hw.machines || {})[m.serial]) || {};
    const fails = MACHINE_CHECKS.filter((c) => (s.checks || {})[c.key] === "finding").map((c) => c.label);
    const marks = ((m.p43 && m.p43.items) || []).map((x) => x.head).filter(Boolean);
    const still = s.down === "still", back = s.down === "running";
    const verdict = still ? pill("Down", "red") : fails.length || s.p43 === "seen" ? pill("To look at", "amber") : pill("Clean", "green");
    const said = [];
    if (still) said.push("Still down" + (m.down ? ": " + esc(m.down) : "") + ".");
    if (back) said.push("Running again (the crew had reported it down).");
    if (fails.length) said.push(esc(fails.join(", ")) + ": finding.");
    if (marks.length) said.push("Pattern 43 (" + esc(marks.map((h) => h.charAt(0) + h.slice(1).toLowerCase()).join("; ")) + "): " + (s.p43 === "seen" ? "seen on the machine." : s.p43 === "not_seen" ? "not seen on the machine." : "not checked."));
    if ((m.life || []).length) said.push((m.life.length === 1 ? "1 part" : m.life.length + " parts") + " past rated life (" + esc(m.life.map((x) => partName(x.name)).join(", ")) + ").");
    if (s.note) said.push(esc(s.note));
    if (!said.length) said.push("Test pattern, scan to email and collaboration work.");
    return `<tr><td valign="top" style="padding:${i ? "12px" : "0"} 10px 0 0;${i ? "border-top:1px solid " + T.border + ";" : ""}"><div style="font-family:${FH};font-size:16px;font-weight:600;color:${T.navy};">${esc(m.label || m.serial)}</div>${blk(`padding-top:2px;font-family:${FM};font-size:12px;color:${T.slate};`, (m.model ? esc(m.model) + " · " : "") + esc(m.serial))}${blk(`padding-top:6px;font-family:${FB};font-size:14px;color:${T.body};line-height:1.45;`, said.join(" "))}</td><td valign="top" align="right" style="padding:${i ? "12px" : "0"} 0 0;${i ? "border-top:1px solid " + T.border + ";" : ""}">${verdict}</td></tr>`;
  }).join("");

  // Inventory: the crew's blind count, the OBP it was compared with, and what Dexter found on the shelf
  const cell = (v, col, b) => `<td align="right" style="padding:8px 0 8px 10px;border-top:1px solid ${T.border};font-family:${b ? FH : FB};font-size:${b ? 15 : 14}px;font-weight:${b ? 700 : 400};color:${col};white-space:nowrap;">${v}</td>`;
  const invRows = gaps.map((g) => { const sh = shelfOf(g.part_no); return `<tr><td style="padding:8px 0;border-top:1px solid ${T.border};font-family:${FB};font-size:14px;font-weight:700;color:${T.navy};line-height:1.3;">${esc(g.description || g.part_no)}${blk(`padding-top:2px;font-family:${FM};font-size:12px;font-weight:400;color:${T.slate};`, esc(g.part_no))}</td>${cell(esc(g.obp), T.body)}${cell(esc(g.counted), T.body)}${cell(sh == null ? "–" : esc(sh), sh == null ? T.slate : sh === g.obp ? T.greenInk : T.amberInk, true)}</tr>`; }).join("");
  const head4 = (t) => `<td align="right" style="padding:0 0 6px 10px;font-family:${FB};font-size:12px;color:${T.slate};">${t}</td>`;
  const added = (inv.added || []).map((a) => esc(a.part_no) + (a.shelf != null ? " (" + esc(a.shelf) + " on the shelf)" : "")).join(", ");
  const repairs = (cx.extras || []).map((x) => esc(x.text) + ": " + ((inv.repairs || {})[x.id] === "confirmed" ? "seen" : (inv.repairs || {})[x.id] === "not_found" ? "not found" : "not checked")).join(" · ");
  const invCard = card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${FH};font-size:20px;font-weight:600;color:${T.navy};">${inv.accurate === true ? "Accurate" : inv.accurate === false ? "Discrepancies" : "Not said"}</td><td align="right">${inv.accurate === false ? pill(offShelf.length ? offShelf.length + " off on the shelf" : "Discrepancies", "amber") : inv.accurate === true ? pill("Accurate", "green") : ""}</td></tr></table>` +
    blk(`padding-top:3px;font-family:${FB};font-size:13px;color:${T.slate};`, "The crew's blind count against OBP as of " + esc(fmtDate(cx.asOf) || "the export the documents used") + ", then the shelf") +
    (gaps.length ? blk("padding-top:10px;", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 0 6px;font-family:${FB};font-size:12px;color:${T.slate};">Part</td>${head4("OBP")}${head4("Crew")}${head4("Shelf")}</tr>${invRows}</table>`) : blk(`padding-top:8px;font-family:${FB};font-size:14px;color:${T.greenInk};font-weight:700;`, "The crew's count agreed with OBP.")) +
    (added ? blk(`padding-top:10px;font-family:${FB};font-size:14px;color:${T.body};`, `<b style="color:${T.navy};">Lines Dexter added:</b> ${added}`) : "") +
    (repairs ? blk(`padding-top:8px;font-family:${FB};font-size:14px;color:${T.body};`, `<b style="color:${T.navy};">Not on the OBP list:</b> ${repairs}`) : "") +
    (inv.note ? blk(`padding-top:8px;font-family:${FB};font-size:14px;color:${T.body};`, esc(inv.note)) : ""));

  // Crew: training, uniform, the HON app, the Oasis / Icon recommendation (the dispatch rating went to Rita on its own)
  const train = (cr.training || []).map((k) => labelIn(TRAINING, k)).concat(cr.trainingOther ? [cr.trainingOther] : []);
  const ppe = ((cr.ppe || {}).missing || []).map((k) => labelIn(PPE, k));
  const crewRows = [["Training needed", train.length ? esc(train.join(", ")) : "None"], ["Uniform &amp; PPE", ppe.length ? `<span style="color:${T.amberInk};font-weight:700;">Missing: ${esc(ppe.join(", "))}</span>` : "Complete"],
    ["HON app", cr.hon === "yes" ? "In use" : cr.hon === "no" ? `<span style="color:${T.amberInk};font-weight:700;">Not in use</span>` : "Not applicable"]];
  if (ov.recommendBlock) crewRows.push(["Oasis / Icon class", `<b style="color:${T.navy};">Recommended</b>`]);

  // Follow-ups: the one asked at this visit, and what this visit settled from the last one
  const fuCard = card(`${blk(`font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1px;color:${T.amberInk};text-transform:uppercase;`, "Follow-up")}${fu ? blk(`padding-top:6px;font-family:${FH};font-size:17px;font-weight:600;color:${T.navy};line-height:1.3;`, esc(fu.text)) + blk(`padding-top:4px;font-family:${FB};font-size:14px;color:${T.body};`, esc(fu.owner) + (fu.due ? " · by " + esc(fmtDate(fu.due)) : " · no date set")) : blk(`padding-top:6px;font-family:${FB};font-size:14px;color:${T.body};`, "None asked at this audit.")}` +
    (carried.length ? blk("padding-top:12px;", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td colspan="2" style="padding:0 0 6px;font-family:${FB};font-size:12px;color:${T.slate};">From the last audit of ${esc(ship)}</td></tr>${carried.map((c) => `<tr><td style="padding:7px 0;border-top:1px solid ${T.border};font-family:${FB};font-size:14px;color:${T.body};">${esc(c.text)}${blk(`padding-top:2px;font-family:${FB};font-size:12px;color:${T.slate};`, esc(c.owner))}</td><td align="right" valign="top" style="padding:7px 0 7px 10px;border-top:1px solid ${T.border};">${c.state === "fixed" ? pill("Fixed", "green") : pill((c.times > 1 ? ordinal(c.times) + " time · " : "") + "Still open", "red")}</td></tr>`).join("")}</table>`) : ""));

  const button = link ? row(`${blk("", `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${T.navy}" style="background:${T.navy};border-radius:12px;padding:14px 26px;"><a href="${esc(link)}" target="_blank" style="display:inline-block;font-family:${FH};font-size:16px;font-weight:600;line-height:1.2;color:#FFFFFF;text-decoration:none;">Open the audit</a></td></tr></table>`)}${blk(`padding-top:8px;font-family:${FB};font-size:12px;color:${T.slate};`, esc(link))}`, "24px 32px 0") : "";

  const rows = [
    test ? row(card(`<div style="font-family:${FB};font-size:13px;color:${T.amberInk};font-weight:700;">TEST MODE · sent to you only.</div>`)) : "",
    section("Ratings"), row(card(lines(ratingRows)), "12px 32px 0"),
    feedback.length ? row(card(lines(feedback)), "12px 32px 0") : "",
    fu || carried.length ? row(fuCard, "12px 32px 0") : "",
    section("The desk and the tools", missing.length ? missing.length + " missing" : ""), row(desk, "12px 32px 0"),
    (cx.machines || []).length ? section("Machines") : "", (cx.machines || []).length ? row(card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${machineRows}</table>`), "12px 32px 0") : "",
    section("Inventory"), row(invCard, "12px 32px 0"),
    section("Crew"), row(card(lines(crewRows)), "12px 32px 0"),
    button,
  ].join("");
  const footer = "Filed by " + esc(who) + " " + esc(fmtWhen(filedAt)) + (photos ? " · " + photos + (photos === 1 ? " photo" : " photos") + " kept with the audit" : "") +
    " · the dispatch rating went to Rita on its own · never sent to the crew · " + PARTS_RULE;
  const html = frame({ preheader: head + " " + head2, eyebrow: "Audit filed", date: ship, head, head2, lead, rows, footer });
  const unesc = (t) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const text = [head + " " + head2, unesc(lead),
    "Ratings: Inventory " + (rt.inventory ?? "–") + ", Technical " + (rt.technical ?? "–") + ", Collaterals " + (rt.collaterals ?? "–") + ", Overall " + (ov.overall ?? "not given") + ".",
    ov.strengths ? "Strengths: " + ov.strengths : "", ov.improve ? "To improve: " + ov.improve : "", ov.agreed ? "Agreed: " + ov.agreed : "",
    fu ? "Follow-up: " + fu.owner + (fu.due ? " by " + fmtDate(fu.due) : "") + ": " + fu.text : "",
    missing.length ? "Missing: " + missing.map(([l, k]) => l + (times(k) > 1 ? " (" + ordinal(times(k)) + " time)" : "")).join(", ") : "Desk and tools: everything in place.",
    link ? "Open the audit: " + link : ""].filter(Boolean).join("\n\n");
  return { subject, html, text };
}
