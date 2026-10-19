// THE WELCOME ABOARD EMAIL (Miguel + Rita, 19 Oct 2026: "rita sends that email when the crew signs to the ship .. we will
// send it to the ship and to his personal email upon the same date"; the v3 render approved with "deploy"). Pure:
// (data) => { subject, html, text }. Filled from the board's schedule (src/welcome_context.js). Never a placeholder: a link
// not given is no button; no predecessor on record is no "You take over from"; the sign-off says where its date comes
// from (§10d). Canonical letterhead (cims-mast.js). Pinned by test/welcome_email.test.js.
import { mastRows } from "../cims-mast.js";
const C = { navy: "#1B3A5C", deep: "#142D48", green: "#5FB946", gink: "#3E7F2E", slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB",
  body: "#374151", grey: "#9CA3AF", sub: "#95A0AD", gtint: "#EAF4E6", amber: "#B7791F", atint: "#F6EEE1" };
const FB = "'DM Sans',Helvetica,Arial,sans-serif", FH = "'Outfit',Helvetica,Arial,sans-serif";

const lab = (t, al) => `<div style="font-family:${FB};font-size:10px;font-weight:700;letter-spacing:1.6px;color:${C.slate};text-transform:uppercase;line-height:14px;${al === "right" ? "margin-right:-1.6px;" : ""}">${t}</div>`;
const hair = (d) => `<div style="border-top:${d ? "2px dashed " + C.border : "1px solid " + C.border};font-size:0;line-height:0;">&nbsp;</div>`;
const tear = `<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
 <td width="14" height="28" bgcolor="${C.cloud}" style="background:${C.cloud};font-size:0;line-height:0;border-radius:0 14px 14px 0;">&nbsp;</td>
 <td style="padding:0 10px;">${hair(true)}</td>
 <td width="14" height="28" bgcolor="${C.cloud}" style="background:${C.cloud};font-size:0;line-height:0;border-radius:14px 0 0 14px;">&nbsp;</td></tr></table></td></tr>`;
const dot = `<td width="7" height="7" bgcolor="${C.green}" style="background:${C.green};border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>`;
const code = (t, extra = "") => `<div class="code" style="font-family:${FH};font-size:34px;font-weight:700;letter-spacing:1px;color:${C.navy};line-height:40px;padding-top:4px;white-space:nowrap;${extra}">${t}</div>`;
const under = (t) => `<div style="font-family:${FB};font-size:13px;line-height:18px;color:${C.slate};padding-top:2px;">${t}</div>`;
const cell = (k, v, w, al) => `<td class="pf" width="${w}" valign="top" align="${al}" style="text-align:${al};padding:0;">${lab(k, al)}<div class="pv" style="font-family:${FH};font-size:16px;font-weight:600;color:${C.navy};line-height:22px;padding-top:4px;">${v}</div></td>`;
const lnk = (href, t) => `<a href="${href}" style="color:${C.navy};font-weight:700;text-decoration:none;">${t}</a>`;
const btnG = (href, t) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.green}" style="background:${C.green};border-radius:10px;"><a href="${href}" target="_blank" style="display:block;font-family:${FB};font-size:16px;font-weight:700;line-height:20px;color:#FFFFFF;text-decoration:none;padding:15px 12px;border-radius:10px;">${t}</a></td></tr></table>`;
// a small navy outline button, Outlook-safe (a bordered cell)
// a soft navy pill (a solid tint, never rgba) with an arrow: quieter than the one green button, still a button
const btnS = (href, t, arrow = "&rarr;") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#E8EEF5" style="background:#E8EEF5;border-radius:999px;"><a href="${href}" target="_blank" style="display:inline-block;font-family:${FB};font-size:13px;font-weight:700;line-height:18px;color:${C.navy};text-decoration:none;padding:9px 16px;border-radius:999px;">${t} ${arrow}</a></td></tr></table>`;
const secTitle = (t, when) => `<tr><td class="px" style="padding:30px 32px 6px 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.gink};">${t}</td>
  <td align="right" style="font-family:${FB};font-size:13px;color:${C.slate};">${when || ""}</td></tr>
  <tr><td colspan="2" style="padding-top:8px;">${hair(false)}</td></tr></table></td></tr>`;
// a step: a green day chip, one bold line, one plain line, an optional small button
const step = (day, title, text, btn) => `<tr><td class="px" style="padding:14px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="56" valign="top" style="padding-top:2px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.gtint}" style="background:${C.gtint};border-radius:6px;padding:3px 0;width:46px;font-family:${FB};font-size:10px;font-weight:700;letter-spacing:0.6px;color:${C.gink};line-height:14px;">${day}</td></tr></table></td>
  <td valign="top"><div style="font-family:${FH};font-size:17px;font-weight:600;color:${C.navy};line-height:22px;">${title}</div>
   <div style="font-family:${FB};font-size:14px;line-height:21px;color:${C.body};padding-top:3px;">${text}</div>${btn ? `<div style="padding-top:9px;">${btn}</div>` : ""}</td>
 </tr></table></td></tr>`;
// a person row: role in slate, name bold, email link
const person = (role, name, email, last) => `<tr><td style="padding:9px 0;${last ? "" : "border-bottom:1px solid " + C.border + ";"}">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td class="pn" valign="top" style="font-family:${FB};font-size:14px;line-height:20px;color:${C.body};"><b style="color:${C.navy};">${name}</b><br><span style="font-size:13px;color:${C.slate};">${role}</span></td>
  <td class="pe" valign="top" align="right" style="font-family:${FB};font-size:13px;line-height:20px;white-space:nowrap;padding-left:12px;">${lnk("mailto:" + email, email.replace("@", "<wbr>@"))}</td>
 </tr></table></td></tr>`;
// a document / link line: a small icon square, title bold, one line why
const doc = (kind, title, why, href, last) => `<tr><td style="padding:8px 0;${last ? "" : "border-bottom:1px solid " + C.border + ";"}">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="56" valign="top"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="38" height="30" bgcolor="${kind === "xls" ? C.gtint : C.cloud}" style="background:${kind === "xls" ? C.gtint : C.cloud};border-radius:7px;font-family:${FB};font-size:9px;font-weight:700;letter-spacing:0.5px;color:${kind === "xls" ? C.gink : C.slate};">${kind === "www" ? "LINK" : kind.toUpperCase()}</td></tr></table></td>
  <td valign="top" style="font-family:${FB};font-size:14px;line-height:20px;color:${C.body};">${href ? lnk(href, title) : `<b style="color:${C.navy};">${title}</b>`}<br><span style="font-size:13px;color:${C.slate};">${why}</span></td>
 </tr></table></td></tr>`;

const hubTile = (k, v) => `<td class="ht" width="48%" valign="top" bgcolor="#21405F" style="background:#21405F;border-radius:12px;padding:12px 14px;">
 <div style="font-family:${FB};font-size:10px;font-weight:700;letter-spacing:1.4px;line-height:14px;color:${C.sub};text-transform:uppercase;">${k}</div>
 <div class="hv" style="font-family:${FH};font-size:17px;font-weight:600;line-height:22px;color:#FFFFFF;padding-top:3px;">${v}</div></td>`;
const docBtn = (kind, title, why, btn) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.border};">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="56" valign="top"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="38" height="30" bgcolor="${C.gtint}" style="background:${C.gtint};border-radius:7px;font-family:${FB};font-size:9px;font-weight:700;letter-spacing:0.5px;color:${C.gink};">XLS</td></tr></table></td>
  <td valign="top" style="font-family:${FB};font-size:14px;line-height:20px;color:${C.body};"><b style="color:${C.navy};">${title}</b><br><span style="font-size:13px;color:${C.slate};">${why}</span><div style="padding-top:8px;">${btn}</div></td>
 </tr></table></td></tr>`;

export const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const HON_URL = "https://hon.cims.work";
export const JD_URL = "https://support.onboardprint.com/hc/en-us/articles/8731895883805-RCCL-Printer-Specialist";

// d = { first, name, position, ship, shipShort, code, port, on, off, months, offSource, prev: { name, first, since } | null,
//       today, nextPay, links: { hub (required), expense, training, onboarding, review, sops, book } }  — dates already "18 Oct 2026"
export function welcomeEmail(d) {
  const L = Object.assign({ hon: HON_URL, jd: JD_URL }, d.links || {});
  const P = d.prev && d.prev.name ? { name: esc(d.prev.name), first: esc(d.prev.first || d.prev.name), since: esc(d.prev.since || "") } : null;
  const D = { first: esc(d.first), name: esc(d.name), pos: esc(d.position || "Printer Specialist"), ship: esc(d.ship), shipShort: esc(d.shipShort || d.ship),
    code: esc(d.code || ""), port: esc(d.port || ""), on: esc(d.on), off: esc(d.off), months: esc(d.months || ""), today: esc(d.today),
    onShort: esc(String(d.on || "").split(" ").slice(0, 2).join(" ").toUpperCase()), nextPay: esc(d.nextPay || "In the Hub"),
    offNote: d.offSource === "tdg" ? "Sign-off confirmed by TDG." : (d.offSource === "rita" || d.offSource === "card") ? "Sign-off planned by Rita &middot; TDG confirms it later." : "Sign-off projected &middot; TDG confirms it later." };
  const pass = `<tr><td class="px" style="padding:22px 32px 0 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:20px;"><tr><td class="passpad" style="padding:14px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px;">
    <tr><td bgcolor="${C.deep}" style="background:${C.deep};border-radius:16px 16px 0 0;padding:13px 22px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:2px;line-height:16px;color:${C.sub};">WELCOME PASS</td>
      <td align="right" style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1px;line-height:16px;color:${C.green};white-space:nowrap;padding-left:14px;">DAY 1 &middot; ${D.onShort}</td></tr></table></td></tr>
    <tr><td style="padding:20px 22px 0 22px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td width="1%" valign="bottom" style="white-space:nowrap;">${lab("From")}${code("HOME")}</td>
       <td valign="bottom" style="padding:0 14px 12px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${dot}<td style="padding:0 3px;">${hair(true).replace(C.border, C.grey)}</td>${dot}</tr></table></td>
       <td width="1%" valign="bottom" align="right" style="text-align:right;white-space:nowrap;">${lab("To", "right")}${code(D.code, "margin-right:-1px;")}</td></tr>
      <tr><td colspan="3" valign="top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top">${D.port ? under("via " + D.port) : ""}</td><td valign="top" align="right" style="text-align:right;padding-left:12px;">${under(D.ship)}</td></tr></table></td></tr>
     </table></td></tr>
    <tr><td style="padding:18px 22px 0 22px;">${hair(false)}</td></tr>
    <tr><td style="padding:16px 22px 0 22px;">${lab("Seafarer")}<div style="font-family:${FH};font-size:18px;font-weight:600;color:${C.navy};line-height:24px;padding-top:4px;">${D.name}</div>${under(D.pos)}</td></tr>
    <tr><td style="padding:16px 22px 20px 22px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell("Signed on", D.on, "34%", "left")}${cell("Contract", D.months || "&nbsp;", "33%", "center")}${cell("Sign-off", D.off, "33%", "right")}</tr></table>
     <div style="font-family:${FB};font-size:12px;line-height:18px;color:${C.slate};padding-top:8px;">${D.offNote}</div></td></tr>
    ${tear}
    ${P ? `<tr><td style="padding:16px 22px 20px 22px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top">${lab("You take over from")}<div style="font-family:${FH};font-size:22px;font-weight:600;color:${C.navy};line-height:28px;padding-top:4px;">${P.name}</div>
       <div style="font-family:${FB};font-size:13px;line-height:20px;color:${C.slate};padding-top:2px;">${P.since ? `Aboard since ${P.since}<br>` : ""}${P.first}&rsquo;s Digital Handover Notes are waiting for you</div></td>
     </tr></table></td></tr>
    ${tear}` : ""}
    <tr><td align="center" style="padding:16px 22px 20px 22px;">${btnG(L.hon, "Open the handover notes")}
     <div style="font-family:${FB};font-size:12px;line-height:18px;color:${C.slate};padding-top:9px;">${P ? `Read ${P.first}&rsquo;s notes` : "Read the handover notes"}, count the inventory, sign it. Within 24 hours. No login.</div></td></tr>
   </table></td></tr></table></td></tr>`;
  
  const html = `<!DOCTYPE html>
  <html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
  <title>Welcome aboard</title>
  <style>
   body{margin:0;padding:0;width:100%!important}table{border-collapse:collapse}
   a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
   @media only screen and (max-width:600px){.frame{padding:0!important}.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:28px!important;line-height:32px!important}.passpad{padding:10px!important}.code{font-size:30px!important;line-height:36px!important}.pf .pv{font-size:15px!important}.pn,.pe{display:block!important;width:100%!important;text-align:left!important;padding:0!important}.pe{padding-top:2px!important}.hubpad{padding:18px 16px!important}.hubh{font-size:21px!important;line-height:27px!important}.ht{padding:10px 11px!important}.hv{font-size:15px!important;line-height:20px!important}}
  </style></head>
  <body style="margin:0;padding:0;background:${C.cloud};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.cloud};">Welcome aboard ${D.ship}, ${D.first}. Your first 15 days, who to message, and what to read.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};"><tr><td class="frame" align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
  ${mastRows()}
  <tr><td class="px" style="padding:26px 32px 0 32px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.gink};">WELCOME ABOARD</td>
    <td align="right" style="font-family:${FB};font-size:13px;color:${C.slate};">${D.today}</td></tr></table>
   <div class="h1" style="font-family:${FH};font-size:34px;font-weight:600;letter-spacing:-0.6px;line-height:38px;color:${C.navy};padding-top:14px;">Welcome aboard, ${D.first}.<br><span style="color:${C.grey};">${D.shipShort} is yours from today.</span></div>
   <div style="font-family:${FB};font-size:15px;line-height:24px;color:${C.body};padding-top:14px;">We are glad you are here. Everything for your first weeks is on this one page, and the Onboard Support Team is one message away.</div>
  </td></tr>
  ${pass}
  
  ${secTitle("Your first 15 days", "four things")}
  ${step("TODAY", "Count the inventory and sign it", "Your own count, signed in your Digital Handover Notes. Use the green button above. It protects you.", "")}
  ${step("WEEK 1", "Finish the cruise line's training", "Log in to their app and complete every module. The cruise line checks it.", L.training ? btnS(L.training, "Open the training") : "")}
  ${step("DAY 7", "Onboarding call with Rita", "15 minutes. How is it going, what do you need." + (L.onboarding ? "" : " Rita sends you a time."), L.onboarding ? btnS(L.onboarding, "Pick a time") : "")}
  ${step("DAY 15", "Expectations call", "What a good contract looks like, agreed together. Then one call a month." + (L.review ? "" : " Rita sends you a time."), L.review ? btnS(L.review, "Pick a time") : "")}
  
  ${secTitle("Who to message", "")}
  <tr><td class="px" style="padding:4px 32px 0 32px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:16px;"><tr><td style="padding:14px 20px;">
    <div style="font-family:${FB};font-size:14px;line-height:21px;color:${C.body};"><b style="color:${C.navy};">One address reaches the whole team:</b> ${lnk("mailto:onboardsupport@dg3.com", "onboardsupport<wbr>@dg3.com")}</div>
   </td></tr></table>
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
    ${person("Head of Tech Support", "Rolando Abellan", "Rolando.Abellan@dg3.com")}
    ${person("Technical Operations", "Ohji Miranda", "Ohji.Miranda@dg3.com")}
    ${person("Inventory &amp; supplies", "Ray Guerra", "Ray.Guerra@dg3.com")}
    ${person("Inventory Operations", "Jonathan Alonzo", "Jonathan.Alonzo@dg3.com")}
    ${person("Training", "Joemar De Leon", "Joemar.Deleon@dg3.com")}
    ${person("Traveling Manager", "Dexter Lawrence", "Dexter.Lawrence@dg3.com")}
    ${person("HR &amp; scheduling", "Rita Berenyi", "Rita.Berenyi@dg3.com", true)}
   </table></td></tr>
  
  ${secTitle("Good to know", "")}
  <tr><td class="px" style="padding:6px 32px 0 32px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.deep}" style="background:${C.deep};border-radius:18px;"><tr><td class="hubpad" style="padding:22px 22px 22px 22px;">
    <div style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:2px;line-height:16px;color:${C.sub};">YOUR CREW HUB</div>
    <div class="hubh" style="font-family:${FH};font-size:24px;font-weight:600;letter-spacing:-0.3px;line-height:30px;color:#FFFFFF;padding-top:8px;">There is more on the other side.</div>
    <div style="font-family:${FB};font-size:14px;line-height:21px;color:#C9D1DB;padding-top:6px;">Your paydays, pay and benefits, the bonus ladder, the Staff House and who to ask. One page, made for your phone.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
     <tr>${hubTile("Next payday", D.nextPay)}<td width="4%" style="font-size:0;line-height:0;">&nbsp;</td>${hubTile("Pay &amp; benefits", "What DG3 covers")}</tr>
     <tr><td colspan="3" height="8" style="font-size:0;line-height:8px;">&nbsp;</td></tr>
     <tr>${hubTile("Staff House", "Free bed, Manila")}<td width="4%" style="font-size:0;line-height:0;">&nbsp;</td>${hubTile("Get help", "Ticket or email")}</tr>
    </table>
    <div style="padding-top:16px;">${btnG(L.hub, "Open my Crew Hub")}</div>
    <div style="font-family:${FB};font-size:12px;line-height:18px;color:${C.sub};padding-top:9px;text-align:center;">Your own link. No login. Save it on your phone.</div>
   </td></tr></table></td></tr>
  <tr><td class="px" style="padding:12px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   ${L.expense ? docBtn("xls", "Expense Report", "Fill it in, add your receipts, email it to Mary Joy.", btnS(L.expense, "Download", "&darr;")) : ""}
   ${doc("www", "Your Job Description", "On Zendesk. Read it this week.", L.jd, !L.sops)}
   ${L.sops ? doc("www", "Standard Operating Procedures", "Every SOP, one place.", L.sops, true) : ""}
  </table>
  </td></tr>
  <tr><td class="px" style="padding:14px 32px 0 32px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.atint}" style="background:${C.atint};border-left:3px solid ${C.amber};border-radius:0 10px 10px 0;padding:12px 16px;font-family:${FB};font-size:14px;line-height:21px;color:${C.body};"><b style="color:${C.navy};">Safety first.</b> Follow the ship's safety policies; the Safety Officer answers any question. We all go home the way we came aboard.</td></tr></table>
   <div style="font-family:${FB};font-size:13px;line-height:20px;color:${C.slate};padding-top:12px;">Uniforms: ${P ? `ask ${P.first} for the Uniform Request Form before ${P.first} signs off.` : "ask the storekeeper for the Uniform Request Form."} The Seafarer&rsquo;s Handbook is coming to Zendesk.</div>
  </td></tr>
  
  <tr><td class="px" style="padding:26px 32px 28px 32px;">
   <div style="font-family:${FB};font-size:15px;line-height:24px;color:${C.body};padding-bottom:12px;">Once again, welcome aboard. Have a great contract, ${D.first}.</div>
   <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${C.green};padding:2px 0 2px 14px;">
    <div style="font-family:${FH};font-size:15px;font-weight:600;color:${C.navy};line-height:20px;">Rita Berenyi</div>
    <div style="font-family:${FB};font-size:13px;color:${C.body};line-height:20px;">Manager, People &amp; Culture</div>
    <div style="font-family:${FB};font-size:13px;color:${C.slate};line-height:20px;padding-top:4px;">M +36 70 270 3245<br>E <a href="mailto:Rita.Berenyi@dg3.com" style="color:${C.navy};text-decoration:none;">Rita.Berenyi@dg3.com</a> ${L.book ? " &middot; " + lnk(L.book, "Book time with me") : ""}</div>
    <div style="font-family:${FB};font-size:13px;color:${C.body};line-height:20px;padding-top:4px;">DG3 Diversified Global Graphics Group</div>
   </td></tr></table></td></tr>
  <tr><td class="px" bgcolor="${C.cloud}" style="background:${C.cloud};padding:16px 32px;font-family:${FB};font-size:11px;line-height:17px;color:${C.slate};">Sent by CIMS on behalf of DG3 Cruise Industry Managed Services to ${D.first} and the ship. Intended only for the named recipient; it may contain confidential information. If it reached you by mistake, delete it and do not share it.</td></tr>
  </table></td></tr></table></body></html>`;
  
  const text = [
    `Welcome aboard, ${d.first}. ${d.shipShort || d.ship} is yours from today.`, "",
    `Ship: ${d.ship}${d.port ? " (joined in " + d.port + ")" : ""}`, `Signed on: ${d.on}`, `Sign-off: ${d.off} (${d.offSource === "tdg" ? "confirmed by TDG" : "TDG confirms it later"})`,
    ...(d.prev && d.prev.name ? [`You take over from: ${d.prev.name}`] : []), "",
    `Today: open the Digital Handover Notes (${HON_URL}), count the inventory and sign it.`,
    "Week 1: finish the cruise line's training. The cruise line checks it.",
    "Day 7: onboarding call with Rita. Day 15: expectations call.", "",
    `Your Crew Hub: ${L.hub}`, ...(L.expense ? [`Expense Report: ${L.expense}`] : []), `Job description: ${L.jd}`, "",
    "One address reaches the whole team: onboardsupport@dg3.com", "", "Rita Berenyi, Manager, People & Culture, Rita.Berenyi@dg3.com",
  ].join("\n");
  return { subject: `Welcome aboard ${d.ship}, ${d.first}`, html, text };
}
