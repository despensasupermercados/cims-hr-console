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
// A figure group never breaks inside itself ("on order" / "1" on two lines): each " · " part is kept whole.
const keep = (s) => String(s).split(" · ").map((p) => `<span style="white-space:nowrap;">${esc(p)}</span>`).join(" · ");

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

  const machineCard = (m) => {
    const p = m.p43 || {}, legend = p.legend || {}, items = legend.items || [];
    const lo = (m.mml && m.mml.lifeOver) || [];
    const copyClean = p.state === "clean";
    const tone = items.length ? "amber" : lo.length ? "amber" : "";
    let h = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${FH};font-size:22px;font-weight:600;color:${T.navy};">${esc(m.label)}<div style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.2px;color:${T.slate};text-transform:uppercase;padding-top:4px;">Pattern 43</div></td><td align="right">${items.length ? pill(items.length + (items.length === 1 ? " mark" : " marks"), "amber") : pill("Clean", "green")}</td></tr></table>
<div style="font-family:${FM};font-size:12px;color:${T.slate};padding-top:2px;">${esc(m.serial)}${m.model ? " · " + esc(m.model) : ""}</div>`;
    for (const it of items) {
      h += `<div style="margin-top:12px;padding-left:10px;border-left:3px solid ${T.amber};font-family:${FB};font-size:14px;color:${T.body};line-height:1.45;"><b style="color:${T.navy};">${esc(it.head)}</b><br>${esc(it.line)}${it.pointsTo ? `<br><span style="color:${T.slate};">Points to: ${esc(it.pointsTo)}</span>` : ""}${it.check ? `<br><span style="color:${T.slate};">Observation (${esc(it.check.src)}): ${esc(it.check.say)}</span>` : ""}</div>`;
    }
    if (!items.length && legend.line) h += `<div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:8px;">Measured: ${esc(legend.line)}</div>`;
    if (lo.length) {
      h += `<div style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.2px;color:${T.slate};text-transform:uppercase;padding-top:16px;">Past rated life · ${lo.length} · ${copyClean ? "copy reads clean" : items.length ? "copy shows marks above" : "copy not judged"}</div>`;
      h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">` + lo.map((x) => `<tr><td style="padding:6px 0;border-top:1px solid ${T.border};font-family:${FB};font-size:14px;color:${T.body};"><b style="color:${T.navy};">${esc(x.name)}</b>${x.partNo ? `<br><span style="font-family:${FM};font-size:12px;color:${T.slate};">${esc(x.partNo)}</span>` : ""}</td>
<td align="right" style="padding:6px 0;border-top:1px solid ${T.border};font-family:${FB};font-size:13px;color:${T.slate};"><b style="font-family:${FH};font-size:17px;color:${T.amberInk};">${esc(x.pct)}%</b><br>${x.cover ? keep(x.cover) : keep("not on the OBP list")}</td></tr>`).join("") + `</table>`;
      h += `<div style="font-family:${FB};font-size:13px;color:${T.body};padding-top:8px;">${esc((m.mml && m.mml.recommendation) || "Recommendation: have this machine looked at. " + PARTS_RULE)}</div>`;
    } else if (m.mml && m.mml.kind === "machine-list") {
      h += `<div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:8px;">Machine Management List: no part past its rated life.</div>`;
    }
    return row(card(h, tone));
  };

  const busy = live.filter((m) => (m.p43 && m.p43.state === "findings") || ((m.mml && m.mml.lifeOver) || []).length);
  const quiet = live.filter((m) => !busy.includes(m));
  const rows = [
    test ? row(card(`<div style="font-family:${FB};font-size:13px;color:${T.amberInk};font-weight:700;">TEST MODE · sent to you only.</div>`, "amber")) : "",
    row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stat(marked.length, (marked.length === 1 ? "machine" : "machines") + " with Pattern 43 marks", marked.length ? "amber" : "green")}${stat(past, (past === 1 ? "part" : "parts") + " past rated life", past ? "amber" : "green")}${stat(gaps.length, "count " + (gaps.length === 1 ? "line" : "lines") + " off OBP", gaps.length ? "amber" : "green")}</tr></table>`, "22px 32px 0"),
    ...busy.map(machineCard),
    quiet.length ? row(`<div style="font-family:${FB};font-size:14px;color:${T.body};">${quiet.map((m) => esc(m.label)).join(", ")}: Pattern 43 nothing found, no part past its rated life.</div>`, "14px 32px 0") : "",
    ...down.map((m) => row(card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${FH};font-size:20px;font-weight:600;color:${T.navy};">${esc(m.label)}</td><td align="right">${pill("Down", "red")}</td></tr></table><div style="font-family:${FM};font-size:12px;color:${T.slate};padding-top:2px;">${esc(m.serial)}</div><div style="margin-top:10px;padding-left:10px;border-left:3px solid ${T.red};font-family:${FB};font-size:14px;color:${T.body};">${esc(m.down)}</div>`, "red"))),
    gaps.length || timing.length || (count.extras || []).length ? row(card(
      `<div style="font-family:${FH};font-size:20px;font-weight:600;color:${T.navy};">The blind count against OBP</div><div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:2px;">OBP as of ${esc(fmtDate(obpAsOf) || "the latest export")} · ${count.total || 0} lines counted</div>` +
      (gaps.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">` + gaps.map((d) => `<tr><td style="padding:6px 0;border-top:1px solid ${T.border};font-family:${FB};font-size:14px;color:${T.body};"><b style="color:${T.navy};">${esc(d.description || d.part_no)}</b><br><span style="font-family:${FM};font-size:12px;color:${T.slate};">${esc(d.part_no)}</span></td><td align="right" style="padding:6px 0;border-top:1px solid ${T.border};font-family:${FB};font-size:13px;color:${T.slate};"><b style="font-family:${FH};font-size:17px;color:${T.amberInk};">${d.diff > 0 ? "+" : "\u2212"}${esc(Math.abs(d.diff))}</b><br>${keep("OBP " + d.obp + " · counted " + d.counted)}</td></tr>`).join("") + `</table>` : `<div style="font-family:${FB};font-size:14px;color:${T.body};padding-top:8px;">Every line agrees with OBP.</div>`) +
      (timing.length ? `<div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:10px;">One unit off on ${timing.length} part${timing.length === 1 ? "" : "s"} OBP moved the same day (${timing.map((d) => esc(d.part_no)).join(", ")}): timing, flagged only if it does not close tomorrow.</div>` : "") +
      ((count.extras || []).length ? `<div style="font-family:${FB};font-size:13px;color:${T.body};padding-top:10px;"><b style="color:${T.navy};">Not on the OBP list:</b> ${(count.extras || []).map((x) => esc(x.text) + (x.counted != null ? " (" + esc(x.counted) + ")" : "")).join(" · ")}</div>` : ""),
      gaps.length ? "amber" : "")) : "",
  ].join("");
  const footer = "Pattern 43 measured and the Management List read by HON's readers, the same ones on the handover record · the count is the crew's, blind · " +
    "ordering-schedule due dates are not in this email yet · completed " + esc(fmtWhen(completeAt)) + " · " + PARTS_RULE;
  const html = frame({ preheader: head + " " + head2, eyebrow: "Documents in", date: ship, head, head2, lead, rows, footer });
  const text = [head + " " + head2, lead.replace(/<[^>]+>/g, ""),
    ...busy.map((m) => m.label + " (" + m.serial + "): " + ((m.p43 && m.p43.legend && m.p43.legend.items) || []).map((i) => i.head).join("; ") + (((m.mml && m.mml.lifeOver) || []).length ? " · past rated life: " + m.mml.lifeOver.map((x) => x.name + " " + x.pct + "%").join(", ") : "")),
    ...down.map((m) => m.label + " down: " + m.down),
    gaps.length ? "Count off OBP: " + gaps.map((d) => d.part_no + " OBP " + d.obp + " counted " + d.counted).join("; ") : "Count agrees with OBP.",
    PARTS_RULE].join("\n\n");
  return { subject, html, text };
}
