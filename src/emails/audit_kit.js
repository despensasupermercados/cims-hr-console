// Printshop Audit emails — the shared frame (14 Oct 2026). CIMS email standard: the canonical letterhead (cims-mast.js,
// never hand-written), tables and inline styles only, no rgba, no gradients, bgcolor paired with background, Helvetica /
// Arial behind every webfont, a hidden preheader, one viewport meta, and a <style> block that is only an enhancement.
// Pure helpers; each template is (data) => { subject, html, text }.
import { mastRows } from "../cims-mast.js";

export const T = { navy: "#1B3A5C", deep: "#142D48", green: "#5FB946", greenInk: "#3E7F2E", slate: "#6B7280", cloud: "#F3F4F6",
  border: "#E5E7EB", body: "#374151", red: "#96281B", amber: "#B7791F", grey: "#9CA3AF", redTint: "#F4E5E3", amberTint: "#F6EEE1",
  greenTint: "#E6F1E1", page: "#EEF1F6",
  // amber TEXT (the token amber is a mark colour: 3.3:1 on white fails for text). HON's --amber-ink, same value.
  amberInk: "#8A5B12" };
export const FH = "'Outfit',Helvetica,Arial,sans-serif";
export const FB = "'DM Sans',Helvetica,Arial,sans-serif";
export const FM = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function fmtDate(v) { const d = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) + ", " + d.slice(0, 4) : ""; }
// "Oct 15, 16:40 UTC": a deadline is a moment, and the ship's clock is not known here, so UTC is said.
export function fmtWhen(v) { const t = Date.parse(v); if (isNaN(t)) return ""; const d = new Date(t); return MON[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " UTC"; }

export const pill = (txt, tone) => {
  const [bg, fg] = tone === "red" ? [T.redTint, T.red] : tone === "amber" ? [T.amberTint, T.amberInk] : tone === "green" ? [T.greenTint, T.greenInk] : [T.cloud, T.slate];
  return `<span style="display:inline-block;font-family:${FB};font-size:12px;font-weight:700;padding:6px 11px;border-radius:999px;background:${bg};color:${fg};white-space:nowrap;">${esc(txt)}</span>`;
};

// The frame: letterhead, eyebrow + date, headline (+ grey second clause), one sentence of context, the body rows, footer.
export function frame({ preheader, eyebrow, date, head, head2, lead, rows, footer }) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(eyebrow)}</title>
<style>@media only screen and (max-width:620px){.c{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.hl{font-size:30px!important}.fr{padding:0!important}}</style></head>
<body style="margin:0;padding:0;background:${T.page};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${T.page};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.page}" style="background:${T.page};"><tr><td class="fr" align="center" style="padding:24px 12px;">
<table role="presentation" class="c" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
${mastRows()}
<tr><td class="px" style="padding:24px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
 <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${T.greenInk};text-transform:uppercase;">${esc(eyebrow)}</td>
 <td align="right" style="font-family:${FB};font-size:13px;color:${T.slate};">${esc(date)}</td></tr></table></td></tr>
<tr><td class="px" style="padding:14px 32px 0;"><div class="hl" style="font-family:${FH};font-size:36px;font-weight:600;letter-spacing:-0.6px;color:${T.navy};line-height:1.1;">${esc(head)}${head2 ? `<br><span style="color:${T.grey};">${esc(head2)}</span>` : ""}</div>
${lead ? `<div style="font-family:${FB};font-size:15px;color:${T.body};line-height:1.5;padding-top:12px;">${lead}</div>` : ""}</td></tr>
${rows || ""}
<tr><td height="28" style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:24px 32px 24px;font-family:${FB};font-size:12px;color:${T.slate};line-height:1.5;border-top:1px solid ${T.border};">${footer || ""}</td></tr>
</table></td></tr></table></body></html>`;
  return html;
}
export const row = (inner, pad = "20px 32px 0") => `<tr><td class="px" style="padding:${pad};">${inner}</td></tr>`;
export const card = (inner, tone) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.cloud}" style="background:${T.cloud};border-radius:16px;${tone ? "border-left:3px solid " + (tone === "red" ? T.red : tone === "amber" ? T.amber : T.green) + ";" : ""}"><tr><td style="padding:18px 20px;">${inner}</td></tr></table>`;
export const stat = (n, label, tone) => {
  const col = tone === "red" ? T.red : tone === "amber" ? T.amber : T.green;
  return `<td width="33%" valign="top" style="padding:0 8px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="3" bgcolor="${col}" style="background:${col};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:10px 0 0;font-family:${FH};font-size:30px;font-weight:700;color:${T.navy};line-height:1.1;">${esc(n)}</td></tr><tr><td style="font-family:${FB};font-size:12px;color:${T.slate};padding-top:2px;">${esc(label)}</td></tr></table></td>`;
};
