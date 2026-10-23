// hr.signoff.link.v2 — the 7-days-before-sign-off email, rebuilt in the sign-off pass style (Miguel, 23 Oct 2026: "Yes or no
// on rebuilding the 7-day sign-off link email in the same pass style .. give me the mocks up"). v1 (signoff_ack.js
// ACK_REQUEST_EMAIL, July) carries the retired navy bar, Arial only, an ISO date and a page with a tick box AND a button.
// This one: the canonical letterhead, a headline in words ("One week to go, Kevin."), the same pass as the instructions email
// (FROM the ship's code TO HOME via the port; signed on · sign-off; time aboard), the four things the crew confirms, written
// out, and ONE button that opens the confirmation page. The click does NOT confirm: a mail scanner opens every link in an
// email, so the confirmation is the deliberate tap on the page (one button, no tick box). Greeted by first name, signed by
// Rita, reply-to Rita. Never "HON": "Digital Handover Notes".
// NOT WIRED TO SEND (23 Oct 2026): a mock-up for Miguel's yes or no; the T-7 switch stays off (CIMS email standard §5).
import { mastRows } from "../cims-mast.js";
import { mdShort } from "../span_md.js";
import { shipCode } from "../ship_codes.js";
import { shipFullName, portName, shortDate, longDate, toGo } from "./hr.signoff.instructions.v2.js";

export const TEMPLATE_ID = "hr.signoff.link.v2";
const C = { navy: "#1B3A5C", green: "#5FB946", gink: "#3E7F2E", slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB",
  body: "#374151", grey: "#9CA3AF", gtint: "#EAF4E6", deep: "#142D48", sub: "#95A0AD" };
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";
const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dayN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;

// What the crew confirms, ONE list for the email and the page (the four lines v1's page carried, in plain words; v1's fifth,
// "I have read my summary", is what confirming means).
export const CONFIRMS = (ship, port) => [
  "My sign-off date" + (port ? " and port" : "") + " above are right.",
  "My Digital Handover Notes are submitted and my count is signed.",
  "Stock and par levels are left as required, and reported as they are.",
  "Every open machine issue is written down for my reliever.",
];

// d: { firstName, crewName, position, ship, brand, signOn, signOff, port, link, today }
export function linkEmail(d) {
  const off = iso(d.signOff), on = iso(d.signOn);
  const today = iso(d.today) || new Date().toISOString().slice(0, 10);
  const ship = shipFullName(d.ship, d.brand || "Royal");
  const port = portName(d.port);
  const name = esc(d.firstName || "") || "colleague";
  const go = off ? toGo(dayN(off) - dayN(today)) : null;
  const link = d.link || "#";
  const items = CONFIRMS(ship, port);

  const lab = (t, al) => `<div style="font-family:${FB};font-size:10px;font-weight:700;letter-spacing:1.6px;color:${C.slate};text-transform:uppercase;line-height:14px;${al === "right" ? "margin-right:-1.6px;" : ""}">${t}</div>`;
  const hair = (dashed, col) => `<div style="border-top:${dashed ? "2px dashed " + (col || C.border) : "1px solid " + C.border};font-size:0;line-height:0;">&nbsp;</div>`;
  const tear = `<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
 <td width="14" height="28" bgcolor="${C.cloud}" style="background:${C.cloud};font-size:0;line-height:0;border-radius:0 14px 14px 0;">&nbsp;</td>
 <td style="padding:0 10px;">${hair(true)}</td>
 <td width="14" height="28" bgcolor="${C.cloud}" style="background:${C.cloud};font-size:0;line-height:0;border-radius:14px 0 0 14px;">&nbsp;</td></tr></table></td></tr>`;
  const cell = (k, v, al) => `<td width="50%" valign="top" align="${al}" style="text-align:${al};padding:0;">${lab(k, al)}<div style="font-family:${FH};font-size:18px;font-weight:600;color:${C.navy};line-height:24px;padding-top:4px;white-space:nowrap;">${v}</div></td>`;
  const code = (t) => `<div class="code" style="font-family:${FH};font-size:34px;font-weight:700;letter-spacing:1px;color:${C.navy};line-height:40px;padding-top:4px;white-space:nowrap;">${t}</div>`;
  const under = (t) => `<div style="font-family:${FB};font-size:13px;line-height:18px;color:${C.slate};padding-top:2px;">${t}</div>`;
  const dot = `<td width="7" height="7" bgcolor="${C.green}" style="background:${C.green};border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>`;
  const tick = (t) => `<tr><td width="30" valign="top" style="padding:0 0 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="20" height="20" align="center" valign="middle" bgcolor="${C.gtint}" style="background:${C.gtint};border-radius:10px;font-family:${FB};font-size:12px;font-weight:700;color:${C.gink};line-height:20px;">&#10003;</td></tr></table></td><td valign="top" style="font-family:${FB};font-size:14px;line-height:21px;color:${C.body};padding:0 0 10px 0;">${t}</td></tr>`;

  const pass = `<tr><td class="px" style="padding:22px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:20px;"><tr><td class="pc" style="padding:14px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px;">
  <tr><td bgcolor="${C.deep}" style="background:${C.deep};border-radius:16px 16px 0 0;padding:13px 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:2px;line-height:16px;color:${C.sub};">SIGN-OFF PASS</td>
    <td align="right" style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1px;line-height:16px;color:${C.green};white-space:nowrap;padding-left:14px;">${go ? go[1] : ""}</td></tr></table></td></tr>
  <tr><td class="pp" style="padding:20px 22px 0 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td class="rside" width="38%" valign="top">${lab("From")}${code(esc(shipCode(ship) || "&nbsp;"))}${under(esc(ship || "Your ship"))}</td>
    <td class="rmid" width="24%" valign="top" style="padding:0 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px;"><tr>${dot}<td style="padding:0 2px;">${hair(true, C.grey)}</td>${dot}</tr></table></td>
    <td class="rside" width="38%" valign="top" align="right" style="text-align:right;">${lab("To", "right")}${code("HOME")}${under(port ? "via " + esc(port) : "Port to be confirmed")}</td>
   </tr></table></td></tr>
  <tr><td class="pp" style="padding:18px 22px 0 22px;">${hair(false)}</td></tr>
  <tr><td class="pp" style="padding:16px 22px 0 22px;">${lab("Seafarer")}<div style="font-family:${FH};font-size:18px;font-weight:600;color:${C.navy};line-height:24px;padding-top:4px;">${esc(d.crewName || d.firstName || "")}</div>${d.position ? under(esc(d.position)) : ""}</td></tr>
  <tr><td class="pp" style="padding:16px 22px 0 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell("Signed on", on ? shortDate(on) + " " + on.slice(0, 4) : "&ndash;", "left")}${cell("Sign-off", off ? shortDate(off) + " " + off.slice(0, 4) : "To confirm", "right")}</tr></table></td></tr>
  <tr><td class="pp" style="padding:14px 22px 20px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:10px;padding:9px 12px;font-family:${FB};font-size:13px;line-height:18px;color:${C.slate};"><b style="color:${C.navy};">${on && off ? mdShort(on, off) : "&ndash;"}</b> aboard ${esc(ship || "the ship")}</td></tr></table></td></tr>
  ${tear}
  <tr><td class="pp" style="padding:16px 22px 8px 22px;">${lab("When you confirm, you say")}
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">${items.map(tick).join("")}</table></td></tr>
  ${tear}
  <tr><td class="pp" align="center" style="padding:16px 22px 20px 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.green}" style="background:${C.green};border-radius:10px;"><a href="${esc(link)}" target="_blank" style="display:block;font-family:${FB};font-size:16px;font-weight:700;line-height:20px;color:#FFFFFF;text-decoration:none;padding:15px 12px;border-radius:10px;">Confirm my sign-off</a></td></tr></table>
   <div style="font-family:${FB};font-size:12px;line-height:18px;color:${C.slate};padding-top:9px;">Opens one page with the same four lines and one button. Nothing is recorded until you tap it there.</div>
  </td></tr>
 </table></td></tr></table></td></tr>`;

  const headA = go ? `${go[0]}, ${name}.` : `Your sign-off is coming up, ${name}.`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no"><title>Confirm your sign-off</title>
<style>a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media only screen and (max-width:620px){.c{width:100%!important}.fr{padding:0!important}.px{padding-left:16px!important;padding-right:16px!important}.h1{font-size:28px!important;line-height:32px!important}.pc{padding:8px!important}.pp{padding-left:16px!important;padding-right:16px!important}.code{font-size:30px!important;line-height:36px!important}.rside{width:42%!important}.rmid{width:16%!important}}</style></head>
<body style="margin:0;padding:0;background:${C.cloud};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.cloud};">${go ? go[0] + ". " : ""}Confirm your sign-off${off ? " of " + shortDate(off) : ""}: one tap.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};"><tr><td class="fr" align="center" style="padding:24px 12px;">
<table role="presentation" class="c" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
${mastRows()}
<tr><td class="px" style="padding:26px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.gink};">CONFIRM YOUR SIGN-OFF</td>
  <td align="right" style="font-family:${FB};font-size:13px;color:${C.slate};">${shortDate(today)} ${today.slice(0, 4)}</td></tr></table>
 <div class="h1" style="font-family:${FH};font-size:34px;font-weight:600;letter-spacing:-0.6px;line-height:38px;color:${C.navy};padding-top:14px;">${headA}<br><span style="color:${C.grey};">Confirm your sign-off.</span></div>
 <div style="font-family:${FB};font-size:15px;line-height:24px;color:${C.body};padding-top:14px;">Thank you for your contract on ${esc(ship || "board")}. Check the dates on your pass. If one is wrong, reply to this email instead of confirming.</div>
</td></tr>
${pass}
<tr><td class="px" style="padding:24px 32px 0 32px;font-family:${FB};font-size:14px;line-height:22px;color:${C.body};">Safe travels home.<br><b style="color:${C.navy};">Rita Berenyi</b> <span style="color:${C.slate};">&middot; Manager, People &amp; Culture</span></td></tr>
<tr><td height="28" style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:20px 32px 24px 32px;font-family:${FB};font-size:12px;color:${C.slate};line-height:1.5;border-top:1px solid ${C.border};">CIMS &middot; Cruise Industry Managed Services &middot; sent 7 days before your sign-off. The link is yours alone; it opens the confirmation page, it confirms nothing by itself.</td></tr>
</table></td></tr></table></body></html>`;
  const subject = (go ? go[0] + " · " : "") + "Confirm your sign-off" + (ship ? " · " + ship : "") + (off ? " · " + shortDate(off) : "");
  const text = [`${go ? go[0] + ", " : ""}${d.firstName || ""}. Confirm your sign-off.`,
    `${ship}${off ? ": sign-off " + longDate(off) : ""}${port ? ", " + port : ""}.${on && off ? " " + mdShort(on, off) + " aboard." : ""}`,
    "When you confirm, you say:\n" + items.map((t) => "- " + t).join("\n"),
    "Confirm my sign-off: " + link + "\n(Opens one page with one button. Nothing is recorded until you tap it there.)",
    "If a date is wrong, reply to this email instead of confirming.", "Rita Berenyi, Manager, People & Culture"].join("\n\n");
  return { subject, html, text };
}
