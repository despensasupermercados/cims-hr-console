// hr.audit.docsin.v1 — "the documents are in" (A7, round 1). To AUDIT_TO (Ray, Rolando, Ohji, Jonathan, Miguel) and the
// auditor, the moment the gate opens. It is the reading of the files, in HON's own words (Miguel, 14 Oct 2026: "I need
// YOUR assessment of reading the pattern 43 and the management list .. as well look at the inventory"):
//   - Pattern 43 per machine: HON's ruler (p43Legend) — the head, the mark, what it points to, the sourced observation.
//   - The Machine Management List per machine: every part past 100% of its rated life (lifeOver), with what OBP has on
//     board and on order for that part number, and HON's Recommendation + PARTS_RULE. Copy quality decides (Miguel,
//     14 Oct: "we dont ask people to replace items until copy quality is affected"): the word "replace" never appears;
//     a part past life on a machine whose Pattern 43 reads clean says "copy reads clean".
//   - The blind count against OBP: gaps first, then one-unit gaps on a part OBP moved that day (timing, 1 Oct rule).
// Ordering-schedule due dates are NOT here yet (round-1 PR G); the footer says so rather than imply none were missed.
// Report layout per CIMS email standard §9. Healthy machines collapse into one line.
import { frame, row, card, stat, pill, esc, fmtWhen, fmtDate, T, FH, FB, FM } from "./audit_kit.js";

export const TEMPLATE_ID = "hr.audit.docsin.v1";
const PARTS_RULE = "Parts are changed on copy quality, not on a count.";

export function docsInEmail({ ship, crew, auditor, completeAt, machines = [], count = {}, obpAsOf, test = false }) {
  const live = machines.filter((m) => !m.down);
  const down = machines.filter((m) => m.down);
  const marked = live.filter((m) => m.p43 && m.p43.state === "findings");
  const past = live.reduce((n, m) => n + ((m.mml && m.mml.lifeOver) || []).length, 0);
  const gaps = (count.diff || []).filter((d) => d.kind === "gap");
  const timing = (count.diff || []).filter((d) => d.kind === "timing");
  const look = marked.length + live.filter((m) => ((m.mml && m.mml.lifeOver) || []).length).length + (gaps.length ? 1 : 0) + down.length;
  const subject = (test ? "[TEST] " : "") + "Printshop audit · " + ship + " · documents in" + (look ? " · " + look + " to look at" : " · nothing found");
  const head = ship + " is ready for " + (auditor || "Dexter") + ".";
  const head2 = look ? look + (look === 1 ? " thing" : " things") + " to look at." : "Nothing found.";
  const lead = esc(crew) + " sent Pattern 43 and the Machine Management List for " + live.length + " machine" + (live.length === 1 ? "" : "s") +
    (down.length ? ", " + down.length + " reported down" : "") + ", and counted " + (count.total || 0) + " lines blind.";

  // ---- the body, v2 (Miguel, 14 Oct 2026, over this card: "redo this .. make it better ux ui") ----
  // Each machine is ONE card that answers in its first line (a verdict pill), then two labelled blocks: what Pattern 43
  // shows (each mark as What / Where / Points to, the sourced observation under it) and what the Management List says
  // (each part past its rated life with its %, and what OBP holds for it). No coloured side stripes; a clean machine and
  // a down machine are the same card shape, so the eye reads one list. The blind count is a small table.
  const sentence = (v) => { const t = String(v || "").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const partName = (n) => String(n || "").replace(/\s*\((?:[A-Za-z.]+\s*)?%\)\s*$/, ""); // "Drum Unit/K (%)" -> "Drum Unit/K"
  const H = (txt, right) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr><td style="font-family:${FH};font-size:15px;font-weight:600;color:${T.navy};">${txt}</td>${right ? `<td align="right" valign="bottom" style="font-family:${FB};font-size:13px;color:${T.slate};padding-left:10px;">${right}</td>` : ""}</tr></table>`;
  const box = (inner) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:12px;margin-top:8px;"><tr><td style="padding:14px 16px;">${inner}</td></tr></table>`;
  const kv = (k, v) => `<tr><td valign="top" width="68" style="padding:3px 10px 3px 0;font-family:${FB};font-size:13px;color:${T.slate};">${k}</td><td valign="top" style="padding:3px 0;font-family:${FB};font-size:14px;color:${T.body};line-height:1.45;">${v}</td></tr>`;
  const top = (m, verdict, tone) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top" style="font-family:${FH};font-size:22px;font-weight:600;color:${T.navy};line-height:1.2;">${esc(m.label)}</td><td valign="top" align="right">${pill(verdict, tone)}</td></tr></table>
<div style="font-family:${FM};font-size:12px;color:${T.slate};padding-top:3px;">${m.model ? esc(m.model) + " · " : ""}${esc(m.serial)}</div>`;

  const machineCard = (m) => {
    const p = m.p43 || {}, legend = p.legend || {}, items = legend.items || [];
    const lo = (m.mml && m.mml.lifeOver) || [];
    let h = top(m, "To look at", "amber");
    // Pattern 43
    h += H("Pattern 43", items.length ? items.length + (items.length === 1 ? " mark" : " marks") : p.state === "clean" ? "Nothing found" : "Not judged");
    for (const it of items) {
      const what = it.detail || null, where = it.where || null;
      const points = it.part ? sentence(it.part) : it.pointsTo || null;
      let b = `<div style="font-family:${FH};font-size:16px;font-weight:600;color:${T.navy};padding-bottom:6px;">${esc(sentence(it.head))}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">`;
      if (what) b += kv("What", esc(what));
      if (where) b += kv("Where", esc(where));
      if (!what && !where && it.line) b += kv("Seen", esc(it.line));
      if (points) b += kv("Points to", `<b style="color:${T.navy};">${esc(points)}</b>`);
      b += `</table>`;
      if (it.check && it.check.say) b += `<div style="font-family:${FB};font-size:13px;color:${T.slate};line-height:1.45;padding-top:8px;border-top:1px solid ${T.border};margin-top:8px;">${esc(it.check.src || "DG3 tech library")}: ${esc(it.check.say)}</div>`;
      h += box(b);
    }
    if (!items.length && legend.line) h += `<div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:4px;">${esc(legend.line)}</div>`;
    // Machine Management List
    if (lo.length) {
      h += H("Management List", lo.length + (lo.length === 1 ? " part" : " parts") + " past rated life");
      h += box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` + lo.map((x, i) => `<tr>
<td valign="top" style="padding:${i ? "10px" : "0"} 10px 0 0;${i ? "border-top:1px solid " + T.border + ";" : ""}font-family:${FB};font-size:14px;color:${T.navy};font-weight:700;line-height:1.3;">${esc(partName(x.name))}${x.partNo ? `<div style="font-family:${FM};font-size:12px;font-weight:400;color:${T.slate};padding-top:2px;">${esc(x.partNo)}</div>` : ""}</td>
<td valign="top" align="right" style="padding:${i ? "10px" : "0"} 0 ${i < lo.length - 1 ? "10px" : "0"};${i ? "border-top:1px solid " + T.border + ";" : ""}font-family:${FB};font-size:12px;color:${T.slate};"><div style="font-family:${FH};font-size:20px;font-weight:600;color:${T.amberInk};line-height:1.1;">${esc(x.pct)}%</div>${x.cover ? String(x.cover).split(" · ").map((c) => `<div style="white-space:nowrap;">${esc(c)}</div>`).join("") : "not on the OBP list"}</td></tr>`).join("") + `</table>`);
      h += `<div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:8px;">Pattern 43: ${p.state === "clean" ? "copy reads clean" : items.length ? "copy shows marks above" : "copy not judged"}.</div>`;
    } else if (m.mml && m.mml.kind === "machine-list") {
      h += H("Management List", "No part past rated life");
    }
    const rec = (m.mml && m.mml.recommendation) || legend.recommendation || "Recommendation: have this machine looked at. " + PARTS_RULE;
    const cut = rec.indexOf(":");
    h += `<div style="font-family:${FB};font-size:14px;color:${T.body};line-height:1.5;padding-top:14px;">${cut > 0 ? `<b style="color:${T.navy};">${esc(rec.slice(0, cut))}:</b>${esc(rec.slice(cut + 1))}` : esc(rec)}</div>`;
    return row(card(h), "12px 32px 0");
  };
  const cleanCard = (m) => row(card(top(m, "Clean", "green") + `<div style="font-family:${FB};font-size:14px;color:${T.body};padding-top:10px;">Pattern 43: nothing found. Management List: no part past its rated life.</div>`), "12px 32px 0");
  const downCard = (m) => row(card(top(m, "Down", "red") + box(`<div style="font-family:${FB};font-size:12px;color:${T.slate};padding-bottom:2px;">Reported by the crew</div><div style="font-family:${FB};font-size:14px;color:${T.body};line-height:1.45;">${esc(m.down)}</div>`)), "12px 32px 0");
  const section = (txt, pad) => row(`<div style="font-family:${FH};font-size:18px;font-weight:600;color:${T.navy};">${txt}</div>`, pad || "28px 32px 0");

  const busy = live.filter((m) => (m.p43 && m.p43.state === "findings") || ((m.mml && m.mml.lifeOver) || []).length);
  const quiet = live.filter((m) => !busy.includes(m));
  const num = (v, col, bold) => `<td align="right" style="padding:8px 0 8px 10px;border-top:1px solid ${T.border};font-family:${bold ? FH : FB};font-size:${bold ? 16 : 14}px;font-weight:${bold ? 600 : 400};color:${col};white-space:nowrap;">${v}</td>`;
  const countTable = gaps.length ? box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="padding:0 0 6px;font-family:${FB};font-size:12px;color:${T.slate};">Part</td><td align="right" style="padding:0 0 6px 8px;font-family:${FB};font-size:12px;color:${T.slate};">OBP</td><td align="right" style="padding:0 0 6px 8px;font-family:${FB};font-size:12px;color:${T.slate};">Count</td><td align="right" style="padding:0 0 6px 8px;font-family:${FB};font-size:12px;color:${T.slate};">Off</td></tr>` +
    gaps.map((d) => `<tr><td style="padding:8px 0;border-top:1px solid ${T.border};font-family:${FB};font-size:14px;font-weight:700;color:${T.navy};line-height:1.3;">${esc(d.description || d.part_no)}<div style="font-family:${FM};font-size:12px;font-weight:400;color:${T.slate};padding-top:2px;">${esc(d.part_no)}</div></td>${num(esc(d.obp), T.body)}${num(esc(d.counted), T.body)}${num((d.diff > 0 ? "+" : "−") + esc(Math.abs(d.diff)), T.amberInk, true)}</tr>`).join("") + `</table>`)
    : !count.total ? `<div style="font-family:${FB};font-size:14px;color:${T.amberInk};font-weight:700;padding-top:6px;">No OBP list to count against.</div>`
    : `<div style="font-family:${FB};font-size:14px;color:${T.greenInk};font-weight:700;padding-top:6px;">Every line agrees with OBP.</div>`;
  const countCard = row(card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${FH};font-size:20px;font-weight:600;color:${T.navy};">Blind count</td><td align="right">${gaps.length ? pill(gaps.length + (gaps.length === 1 ? " line off" : " lines off"), "amber") : !count.total ? pill("No list", "amber") : pill("Agrees", "green")}</td></tr></table>
<div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:3px;">${count.total || 0} lines, against OBP as of ${esc(fmtDate(obpAsOf) || "the latest export")}</div>` + countTable +
    (timing.length ? `<div style="font-family:${FB};font-size:13px;color:${T.slate};line-height:1.45;padding-top:10px;">One unit off on ${timing.length} part${timing.length === 1 ? "" : "s"} OBP moved that day (${timing.map((d) => esc(d.part_no)).join(", ")}): timing, flagged only if it does not close tomorrow.</div>` : "") +
    ((count.extras || []).length ? `<div style="font-family:${FB};font-size:14px;color:${T.body};line-height:1.45;padding-top:10px;"><b style="color:${T.navy};">Found, not on the OBP list:</b> ${(count.extras || []).map((x) => esc(x.text) + (x.counted != null ? " (" + esc(x.counted) + ")" : "")).join(" · ")}</div>` : "")), "12px 32px 0");
  const rows = [
    test ? row(card(`<div style="font-family:${FB};font-size:13px;color:${T.amberInk};font-weight:700;">TEST MODE · sent to you only.</div>`)) : "",
    row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stat(marked.length, (marked.length === 1 ? "machine" : "machines") + " with Pattern 43 marks", marked.length ? "amber" : "green")}${stat(past, (past === 1 ? "part" : "parts") + " past rated life", past ? "amber" : "green")}${stat(gaps.length, "count " + (gaps.length === 1 ? "line" : "lines") + " off OBP", gaps.length ? "amber" : "green")}</tr></table>`, "22px 32px 0"),
    section("Machines"),
    ...busy.map(machineCard), ...down.map(downCard), ...quiet.map(cleanCard),
    countCard,
  ].join("");
  const footer = "Pattern 43 measured and the Management List read by HON's readers, the same ones on the handover record · the count is the crew's, blind · " +
    "ordering-schedule due dates are not in this email yet · completed " + esc(fmtWhen(completeAt)) + " · " + PARTS_RULE;
  const html = frame({ preheader: head + " " + head2, eyebrow: "Documents in", date: ship, head, head2, lead, rows, footer });
  // the text part is plain text: the lead's tags go and its escaped entities come back as the characters ("O'Neil & Co")
  const unesc = (t) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const text = [head + " " + head2, unesc(lead.replace(/<[^>]+>/g, "")),
    ...busy.map((m) => m.label + " (" + m.serial + "): " + ((m.p43 && m.p43.legend && m.p43.legend.items) || []).map((i) => i.head).join("; ") + (((m.mml && m.mml.lifeOver) || []).length ? " · past rated life: " + m.mml.lifeOver.map((x) => x.name + " " + x.pct + "%").join(", ") : "")),
    ...down.map((m) => m.label + " down: " + m.down),
    gaps.length ? "Count off OBP: " + gaps.map((d) => d.part_no + " OBP " + d.obp + " counted " + d.counted).join("; ") : !count.total ? "No OBP list to count against." : "Count agrees with OBP.",
    PARTS_RULE].join("\n\n");
  return { subject, html, text };
}
