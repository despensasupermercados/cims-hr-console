// THE CREW SURVEY INVITATION (Miguel, 22 Oct 2026; the render approved 23 Oct 2026, with "1. yes" to one reminder after 5
// days). Pure: (data) => { subject, html, text }. Sent the morning after the sign-off to the seafarer's own address, CC Rita
// and Miguel, reply-to Rita (src/crew_survey_send.js). The reminder is the same email with its own headline. Canonical
// letterhead (cims-mast.js), tables and solid colours only (CIMS email standard §2). Pinned by test/crew_survey.test.js.
import { mastRows } from "../cims-mast.js";
import { QUESTIONS } from "../crew_survey.js";

const C = { navy: "#1B3A5C", green: "#5FB946", gink: "#3E7F2E", slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB", body: "#374151", grey: "#9CA3AF", line: "#F0F1F3", pass: "#C9D4E0", lime: "#8FD27A" };
const FB = "'DM Sans',Helvetica,Arial,sans-serif", FH = "'Outfit',Helvetica,Arial,sans-serif";
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const lab = (t, al) => `<td${al ? ` align="${al}"` : ""} style="font-family:${FB};font-size:10.5px;font-weight:700;letter-spacing:1.4px;color:${C.grey};">${t}</td>`;
const fact = (k, v, w, al) => `<td width="${w}" valign="top"${al ? ` align="${al}"` : ""} style="font-family:${FB};font-size:10.5px;font-weight:700;letter-spacing:1.2px;color:${C.grey};">${k}<div style="font-family:${FH};font-size:16px;font-weight:600;color:${C.navy};letter-spacing:0;margin-top:4px;">${v}</div></td>`;
const row = (b, t, last) => `<tr><td style="font-family:${FB};font-size:14px;line-height:1.55;color:${C.body};padding:10px 0;${last ? "" : "border-bottom:1px solid " + C.line + ";"}"><b style="color:${C.navy};">${b}</b> ${t}</td></tr>`;

// d: { first, ship, shipShort, code, port, on, off, aboard, link, expires, today, reminder }
export function surveyInviteEmail(d) {
  const first = esc(d.first || "there"), shipShort = esc(d.shipShort || d.ship || "your ship"), ship = esc(d.ship || "");
  const head = d.reminder
    ? `Still a minute, ${first}?<br><span style="color:${C.grey};">How did ${shipShort} go?</span>`
    : `Welcome home, ${first}.<br><span style="color:${C.grey};">How did ${shipShort} go?</span>`;
  const lead = d.reminder
    ? `Your survey is still open until ${esc(d.expires)}. Three minutes, and every answer is read by the CIMS team. If something got in your way on ${shipShort}, this is where we hear it.`
    : `You know what worked and what got in your way better than anyone. Tell us straight: three minutes, and every answer is read by the CIMS team.`;
  const subject = d.reminder ? `Still a minute, ${d.first || "there"}? Your survey on ${d.shipShort || d.ship || "your contract"}` : `Welcome home, ${d.first || "there"}. How did ${d.shipShort || d.ship || "your contract"} go?`;
  const pre = d.reminder ? "Your end-of-contract survey is still open. Three minutes." : "Three minutes, " + QUESTIONS.length + " taps, one line in your words. Every answer is read.";
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title>
<style>@media (max-width:480px){.hl{font-size:30px !important}.px{padding-left:20px !important;padding-right:20px !important}}</style></head>
<body style="margin:0;padding:0;background:#EEF0EC;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EEF0EC" style="background:#EEF0EC;"><tr><td align="center" style="padding:0 0 32px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;max-width:600px;width:100%;">
${mastRows()}
<tr><td class="px" style="padding:28px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
 <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.gink};">${d.reminder ? "A REMINDER" : "CONTRACT COMPLETE"}</td>
 <td align="right" style="font-family:${FB};font-size:13px;color:${C.slate};">${esc(d.today)}</td></tr></table></td></tr>
<tr><td class="px" style="padding:14px 32px 0;">
 <div class="hl" style="font-family:${FH};font-size:36px;font-weight:600;letter-spacing:-0.6px;line-height:1.1;color:${C.navy};">${head}</div>
 <div style="font-family:${FB};font-size:15px;line-height:1.6;color:${C.body};margin-top:14px;">${lead}</div></td></tr>
<tr><td class="px" style="padding:24px 32px 0;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:18px;"><tr><td style="padding:10px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:14px;">
  <tr><td bgcolor="${C.navy}" style="background:${C.navy};border-radius:14px 14px 0 0;padding:13px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
   <td style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:1.6px;color:${C.pass};">YOUR CONTRACT, IN YOUR WORDS</td>
   <td align="right" style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:1.2px;color:${C.lime};">3 MIN</td></tr></table></td></tr>
  <tr><td style="padding:20px 20px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   <tr>${lab("FROM")}${lab("TO", "right")}</tr>
   <tr><td style="font-family:${FH};font-size:34px;font-weight:700;color:${C.navy};line-height:1.15;">${esc(d.code || "SHIP")}</td><td align="right" style="font-family:${FH};font-size:34px;font-weight:700;color:${C.navy};line-height:1.15;">HOME</td></tr>
   <tr><td style="font-family:${FB};font-size:12.5px;color:${C.slate};">${ship}</td><td align="right" style="font-family:${FB};font-size:12.5px;color:${C.slate};">${d.port ? "via " + esc(d.port) : ""}</td></tr>
  </table></td></tr>
  <tr><td style="padding:16px 20px 0;"><div style="border-top:1px solid ${C.border};font-size:0;line-height:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:14px 20px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
   ${fact("SIGNED ON", esc(d.on), "34%")}${fact("SIGNED OFF", esc(d.off), "33%")}${fact("ABOARD", esc(d.aboard), "33%", "right")}</tr></table></td></tr>
  <tr><td style="padding:18px 20px 0;"><div style="border-top:2px dashed ${C.border};font-size:0;line-height:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:16px 20px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   <tr><td style="font-family:${FB};font-size:14px;line-height:1.55;color:${C.body};padding-bottom:6px;"><b style="color:${C.navy};">${QUESTIONS.length} taps.</b> The job, the print shop, support, how you were treated, and overall.</td></tr>
   <tr><td style="font-family:${FB};font-size:14px;line-height:1.55;color:${C.body};"><b style="color:${C.navy};">One line in your words.</b> The one thing we should fix first.</td></tr></table></td></tr>
  <tr><td style="padding:20px 20px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
   <td align="center" bgcolor="${C.green}" style="background:${C.green};border-radius:12px;"><a href="${esc(d.link)}" target="_blank" style="display:block;padding:16px 10px;font-family:${FB};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;">Start the survey</a></td></tr></table></td></tr>
  <tr><td align="center" style="padding:4px 20px 20px;font-family:${FB};font-size:12.5px;color:${C.slate};">Your own link. No login. Open until ${esc(d.expires)}.</td></tr>
 </table></td></tr></table></td></tr>
<tr><td class="px" style="padding:28px 32px 0;">
 <div style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.gink};border-bottom:1px solid ${C.border};padding-bottom:8px;">WHAT HAPPENS TO YOUR ANSWERS</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
  ${row("We read every one.", "What you tell us shapes how we support the next contract.")}
  ${row("They stay with CIMS.", "Never sent to the cruise line, and they never touch your bonus.")}
  ${row("You get a copy.", "The moment you send, your answers land in this inbox.", true)}
 </table></td></tr>
<tr><td class="px" style="padding:24px 32px 28px;">
 <div style="font-family:${FB};font-size:15px;line-height:1.6;color:${C.body};">Thank you for this contract, ${first}. Enjoy your time home.</div>
 <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
  <td width="3" bgcolor="${C.green}" style="background:${C.green};width:3px;">&nbsp;</td>
  <td style="padding:2px 0 2px 12px;font-family:${FB};font-size:13px;line-height:1.6;color:${C.slate};"><b style="color:${C.navy};font-size:14px;">Rita Berenyi</b><br>Manager, People &amp; Culture<br>Rita.Berenyi@dg3.com · DG3 Diversified Global Graphics Group</td></tr></table></td></tr>
<tr><td bgcolor="${C.cloud}" style="background:${C.cloud};padding:16px 32px;font-family:${FB};font-size:11.5px;line-height:1.6;color:${C.slate};">Sent by CIMS on behalf of DG3 Cruise Industry Managed Services to ${first}. Intended only for the named recipient. If it reached you by mistake, delete it and do not share it.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    d.reminder ? `Still a minute, ${d.first || "there"}? How did ${d.shipShort || d.ship || "your contract"} go?` : `Welcome home, ${d.first || "there"}. How did ${d.shipShort || d.ship || "your contract"} go?`,
    "",
    d.reminder ? `Your survey is still open until ${d.expires}. Three minutes, and every answer is read by the CIMS team.` : "You know what worked and what got in your way better than anyone. Tell us straight: three minutes, and every answer is read by the CIMS team.",
    "",
    `${d.ship || ""}: signed on ${d.on}, signed off ${d.off}, aboard ${d.aboard}.`,
    "",
    "Start the survey (your own link, no login, open until " + d.expires + "):",
    d.link,
    "",
    "We read every one. Your answers stay with CIMS: never sent to the cruise line, never part of your bonus. You get a copy the moment you send.",
    "",
    "Rita Berenyi, Manager, People & Culture, Rita.Berenyi@dg3.com",
  ].join("\n");
  return { subject, html, text };
}
