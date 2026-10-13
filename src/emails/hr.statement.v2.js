// hr.statement.v2 — the crew statement email, to the seafarer, CC Rita (Miguel, 12 Oct 2026: "the email statement CC
// rita .. give me the mock up"). v1 was two bare <p> lines. Built to the CIMS email standard: the canonical letterhead
// (cims-mast.js, never hand-written), tables and inline styles only, no rgba / gradients, bgcolor paired with background.
// It goes to the CREW: it never carries notes, field intel, feedback or anything the console only keeps for HR.
// Pure: (data) => { subject, html, text }.
import { mastRows } from "../cims-mast.js";

export const TEMPLATE_ID = "hr.statement.v2";

const T = { navy: "#1B3A5C", greenInk: "#3E7F2E", green: "#5FB946", slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB",
  body: "#374151", red: "#96281B", amber: "#B7791F", grey: "#9CA3AF", redTint: "#F4E5E3", amberTint: "#F6EEE1", greenTint: "#E6F1E1", page: "#E9EDF3" };
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
export const fmtDate = (v) => { const d = iso(v); return d ? MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) + ", " + d.slice(0, 4) : ""; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dayN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
export function span(on, off) {
  const a = iso(on), b = iso(off); if (!a || !b || b < a) return "";
  let m = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); let d = +b.slice(8, 10) - +a.slice(8, 10);
  if (d < 0) { m -= 1; d += new Date(Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, 0)).getUTCDate(); }
  return (m ? m + (m === 1 ? " month" : " months") : "") + (m && d ? " " : "") + (d || !m ? d + (d === 1 ? " day" : " days") : "");
}
// The four required documents (Schengen is optional) and where each stands today.
export function docLines(c, today) {
  const t = iso(today);
  const L = [["Medical", c.med_exp], ["Seaman book", c.sirb_exp], ["Passport", c.pp_exp], ["US visa (C1/D)", c.usv_exp]];
  return L.map(([name, exp]) => { const e = iso(exp); return { name, exp: e, state: !e ? "missing" : (e < t ? "expired" : (dayN(e) - dayN(t) <= 90 ? "soon" : "ok")) }; });
}

export function statementEmail({ crew = {}, contracts = [], daysWorked = 0, bonus = null, today, fileAt = null, replyName = "Rita" } = {}) {
  const c = crew || {};
  const t = iso(today) || new Date().toISOString().slice(0, 10);
  const first = c.first_name || "there";
  const full = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ") || c.agency_id || "";
  const done = bonus && bonus.contracts != null ? bonus.contracts : null;
  const docs = docLines(c, t);
  const valid = docs.filter((d) => d.state === "ok" || d.state === "soon").length;
  const last = (contracts || []).slice().sort((a, b) => String(a.on).localeCompare(String(b.on))).pop() || null;
  const lastOff = last ? (last.act || last.proj || null) : null;
  const running = last && last.on <= t && !last.act;
  const subject = "Your CIMS crew statement · " + fmtDate(t);
  const pre = "Your crew statement is attached" + (done != null ? " · " + done + " completed contract" + (done === 1 ? "" : "s") : "") + " · " + Number(daysWorked || 0).toLocaleString("en-US") + " days at sea.";
  const rule = (col) => `<td width="33%" valign="top" style="padding:0 6px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="3" bgcolor="${col}" style="background:${col};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
  const stat = (n, label, col) => rule(col) + `<tr><td style="padding:10px 0 0;font-family:${FH};font-size:30px;font-weight:700;color:${T.navy};line-height:1.1;">${esc(n)}</td></tr><tr><td style="font-family:${FB};font-size:12px;color:${T.slate};padding-top:2px;">${esc(label)}</td></tr></table></td>`;
  const docCol = valid === 4 ? T.green : (docs.some((d) => d.state === "expired" || d.state === "missing") ? T.red : T.amber);
  const docText = docs.map((d) => d.name + (d.state === "missing" ? " not on file" : d.state === "expired" ? " expired " + fmtDate(d.exp) : " to " + fmtDate(d.exp))).join(" · ");
  const pill = (txt, bg, fg) => `<span style="display:inline-block;font-family:${FB};font-size:12px;font-weight:700;padding:6px 11px;border-radius:999px;background:${bg};color:${fg};">${esc(txt)}</span>`;
  const card = last ? `<tr><td class="px" style="padding:18px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.cloud}" style="background:${T.cloud};border-radius:16px;"><tr><td style="padding:20px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="font-family:${FH};font-size:22px;font-weight:600;color:${T.navy};">${esc(last.ship || "")}</td>
  <td align="right">${running ? pill("Current contract", T.greenTint, T.greenInk) : pill("Last contract", T.greenTint, T.greenInk)}</td>
 </tr></table>
 <div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:4px;">${esc(span(last.on, lastOff))}${last.proj && !last.act ? " · sign-off projected" : ""}</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>
  <td style="font-family:${FB};font-size:12px;color:${T.slate};">Signed on <b style="color:${T.navy};">${esc(fmtDate(last.on))}</b></td>
  <td align="right" style="font-family:${FB};font-size:12px;color:${T.slate};">${last.act ? "Signed off" : "Projected sign-off"} <b style="color:${T.greenInk};">${esc(fmtDate(lastOff) || "not set")}</b></td>
 </tr></table>
</td></tr></table></td></tr>` : "";
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title>
<style>@media only screen and (max-width:620px){.wrap{width:100% !important}.pagepad{padding:0 !important}.px{padding-left:20px !important;padding-right:20px !important}.h1{font-size:28px !important}}</style></head>
<body style="margin:0;padding:0;background:${T.page};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.page}" style="background:${T.page};"><tr><td align="center" class="pagepad" style="padding:24px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
${mastRows()}
<tr><td class="px" style="padding:28px 32px 6px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${T.greenInk};">CREW STATEMENT</td>
  <td align="right" style="font-family:${FB};font-size:13px;color:${T.slate};">${esc(fmtDate(t))}</td>
 </tr></table>
 <div class="h1" style="font-family:${FH};font-size:32px;font-weight:600;letter-spacing:-0.6px;line-height:1.12;color:${T.navy};padding-top:14px;">Hi ${esc(first)}, your statement is attached. <span style="color:${T.grey};">Please check it.</span></div>
 <div style="font-family:${FB};font-size:15px;line-height:1.55;color:${T.body};padding-top:12px;">It lists your contracts with DG3, your documents and your bonus standing as CIMS holds them today. If anything is wrong, reply to this email — it goes to ${esc(replyName)}.</div>
</td></tr>
<tr><td class="px" style="padding:18px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
 ${stat(done != null ? done : "—", "Completed contract" + (done === 1 ? "" : "s"), T.green)}${stat(Number(daysWorked || 0).toLocaleString("en-US"), "Days at sea", T.green)}${stat(valid + " of 4", "Documents valid", docCol)}
</tr></table></td></tr>
${card}
<tr><td class="px" style="padding:20px 32px 24px;font-family:${FB};font-size:14px;line-height:1.6;color:${T.body};">Documents on file: ${esc(docText)}.</td></tr>
<tr><td class="px" style="padding:16px 32px 24px;border-top:1px solid ${T.border};font-family:${FB};font-size:12px;line-height:1.6;color:${T.slate};">Sent by CIMS for DG3 Cruise Industry Managed Services.${fileAt ? " Contract dates are from TDG's crew file of " + esc(fmtDate(fileAt)) + "." : ""} This email and its attachment are for ${esc(full)} only.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    "CIMS - Crew statement - " + fmtDate(t), "",
    "Hi " + first + ", your statement is attached. Please check it.",
    "It lists your contracts with DG3, your documents and your bonus standing as CIMS holds them today. If anything is wrong, reply to this email - it goes to " + replyName + ".", "",
    "Completed contracts: " + (done != null ? done : "-"), "Days at sea: " + Number(daysWorked || 0), "Documents valid: " + valid + " of 4",
    last ? "Last contract: " + last.ship + ", signed on " + fmtDate(last.on) + (lastOff ? (last.act ? ", signed off " : ", projected sign-off ") + fmtDate(lastOff) : "") : "",
    "Documents on file: " + docText + ".", "",
    "Sent by CIMS for DG3 Cruise Industry Managed Services. This email and its attachment are for " + full + " only.",
  ].filter((x) => x !== null).join("\n");
  return { subject, html, text };
}
