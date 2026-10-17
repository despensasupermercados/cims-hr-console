// hr.signoff.instructions.v2 — the two-weeks-before-sign-off email to the Printer Specialist (Miguel + Rita, 16 Oct 2026,
// seven rounds on the rendered mock-up, then "now that we are good with this .. shoot this email 2 weeks prior .. CC onboard
// support"). Replaces v1 (a hand-built navy header, "two copies" of paper notes, signed by Miguel, two buttons).
// The rules it carries, each Miguel's or Rita's (Brain recnTLnsjGVcXs4EU, rec2dsh7hh8mIYwgV, recJIAzBJv8SDDl1N, recTAzAfzjpC0bSXX):
// - The handover notes are DIGITAL, in HON (open hon.cims.work, select the ship), and mandatory. A short printed copy still
//   stays onboard: one for the reliever, one for the shipboard manager.
// - The shipboard manager's title is the brand's own: Azamara BOM, Royal GSM, Celebrity DCM.
// - Never promise that the two specialists meet: only when the reliever's sign-on is before this sign-off (an overlap).
// - The final count is signed in the handover notes; Ray Guerra and Jonathan Placer Alonzo receive it.
// - One call to action: Open HON goes through the acknowledgment link, which records the receipt and forwards to HON.
// - Greeted by first name. Signed by Rita.
// Built to the CIMS email standard: the canonical letterhead (cims-mast.js), tables and inline styles only, no rgba, no
// gradients, bgcolor paired with background. Pure: (data) => { subject, html, text }.
import { mastRows } from "../cims-mast.js";
import { mdWords } from "../span_md.js";

export const TEMPLATE_ID = "hr.signoff.instructions.v2";
export const HON_URL = "https://hon.cims.work";
// Contracts ending on or after this day score the Ship handover factor from a submitted HON handover (Brain reczJqxZnOuzkv74X).
export const HON_BONUS_FROM = "2026-11-01";

const C = { navy: "#1B3A5C", green: "#5FB946", gink: "#3E7F2E", slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB",
  body: "#374151", amber: "#B7791F", atint: "#F6EEE1", grey: "#9CA3AF", gtint: "#EAF4E6" };
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The shipboard manager, by brand (Miguel, 16 Oct 2026).
export const MANAGER = { Azamara: ["BOM", "Business Operations Manager"], Royal: ["GSM", "Guest Services Manager"], Celebrity: ["DCM", "Digital Communication Manager"] };
export const managerOf = (brand) => MANAGER[brand] || MANAGER.Royal;

const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dayN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
const addDays = (d, n) => new Date((dayN(d) + n) * 86400000).toISOString().slice(0, 10);
export const longDate = (d) => (iso(d) ? (+d.slice(8, 10)) + " " + MON[+d.slice(5, 7) - 1] + " " + d.slice(0, 4) : "");
export const shortDate = (d) => (iso(d) ? (+d.slice(8, 10)) + " " + MON[+d.slice(5, 7) - 1].slice(0, 3) : "");
// "17–24 Oct", "28 Oct – 4 Nov"
function range(a, b) {
  if (a.slice(5, 7) === b.slice(5, 7)) return (+a.slice(8, 10)) + "&ndash;" + shortDate(b);
  return shortDate(a) + " &ndash; " + shortDate(b);
}

// "Pursuit" + Azamara -> "Azamara Pursuit"; "Wonder" + Royal -> "Wonder of the Seas"; "Apex" + Celebrity -> "Celebrity Apex".
export function shipFullName(ship, brand) {
  const s = String(ship || "").trim();
  if (!s) return "";
  if (brand === "Royal") return /of the seas$/i.test(s) ? s : s + " of the Seas";
  if (brand === "Celebrity") return /^celebrity /i.test(s) ? s : "Celebrity " + s;
  if (brand === "Azamara") return /^azamara /i.test(s) ? s : "Azamara " + s;
  return s;
}
// The board's ports are the itinerary's capitals ("HONG KONG, CHINA", "ORLANDO (PORT CANAVERAL), FLORIDA"): the city, in words.
export function portName(p) {
  const s = String(p || "").split(",")[0].trim();
  if (!s) return "";
  return s.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}
// The first word of the first name (TDG's "Kevin Leif" -> "Kevin"; "A.J. Lorenzo" -> "A.J.").
export const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";

// d: { firstName, ship, brand, signOff, port, reliever: { name, first, on } | null, link, today }
export function instructionsEmail(d) {
  const off = iso(d.signOff);
  const today = iso(d.today) || new Date().toISOString().slice(0, 10);
  const brand = d.brand || "Royal";
  const [mgr, mgrLong] = managerOf(brand);
  const ship = shipFullName(d.ship, brand);
  const port = portName(d.port);
  const rel = d.reliever && d.reliever.name ? d.reliever : null;
  const relFirst = rel ? esc(rel.first || firstWord(rel.name)) : "your reliever";
  const RelFirst = rel ? relFirst : "Your reliever";
  const relOn = rel ? iso(rel.on) : null;
  const overlap = off && relOn && relOn < off ? { days: dayN(off) - dayN(relOn), from: relOn } : null;
  const bonus = !!off && off >= HON_BONUS_FROM;
  const name = esc(d.firstName || "") || "colleague";
  const link = d.link || HON_URL;

  const li = (t) => `<tr><td valign="top" width="16" style="font-family:${FB};font-size:14px;line-height:22px;color:${C.green};padding:0 0 6px 0;">&bull;</td><td style="font-family:${FB};font-size:14px;line-height:22px;color:${C.body};padding:0 0 6px 0;">${t}</td></tr>`;
  const list = (items) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items.map(li).join("")}</table>`;
  const phase = (label, when) => `<tr><td class="px" style="padding:30px 32px 6px 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.gink};">${label}</td>
  <td align="right" style="font-family:${FB};font-size:13px;color:${C.slate};">${when}</td></tr>
  <tr><td colspan="2" style="padding-top:8px;"><div style="border-top:1px solid ${C.border};font-size:0;line-height:0;">&nbsp;</div></td></tr></table></td></tr>`;
  const step = (n, title, html) => `<tr><td class="px" style="padding:16px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="40" valign="top"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${C.navy}" style="background:${C.navy};border-radius:14px;font-family:${FH};font-size:14px;font-weight:700;color:#FFFFFF;">${n}</td></tr></table></td>
  <td valign="top"><div style="font-family:${FH};font-size:17px;font-weight:600;color:${C.navy};line-height:24px;padding:2px 0 6px 0;">${title}</div>${html}</td>
 </tr></table></td></tr>`;
  const p = (t, extra = "") => `<div style="font-family:${FB};font-size:14px;line-height:22px;color:${C.body};${extra}">${t}</div>`;
  const note = (t, col, bg) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr><td bgcolor="${bg}" style="background:${bg};border-left:3px solid ${col};padding:10px 14px;font-family:${FB};font-size:13px;line-height:20px;color:${C.body};">${t}</td></tr></table>`;
  const fact = (k, v, w) => `<td class="stack" width="${w}" valign="top" style="padding:14px 12px 14px 0;border-top:3px solid ${C.navy};"><div style="font-family:${FB};font-size:12px;color:${C.slate};padding-bottom:3px;">${k}</div><div style="font-family:${FH};font-size:17px;font-weight:600;color:${C.navy};line-height:22px;">${v}</div></td>`;

  const meet = overlap
    ? `You and <b>${esc(rel.name)}</b> overlap aboard for ${mdWords(overlap.from, off)} from ${shortDate(overlap.from)}: use them to walk ${relFirst} through the ship.`
    : rel
      ? `Your reliever is <b>${esc(rel.name)}</b>. You may or may not see ${relFirst} aboard, so your notes must carry everything.`
      : `Your reliever is not named yet. You may not meet them aboard, so your notes must carry everything.`;
  const head = off ? `You sign off ${shortDate(off)}${port ? " in " + esc(port) : ""}.` : `Your sign-off is coming up.`;
  const reviewFrom = off ? addDays(off, -14) : null, reviewTo = off ? addDays(off, -7) : null;
  const steps = [
    `Open <a href="${esc(link)}" style="color:${C.navy};font-weight:700;">hon.cims.work</a> and select <b>${esc(ship || "your ship")}</b>. No login.`,
    `Complete all eleven sections and save each one: machine status, recurring issues, open tickets, stock and orders, tools, risks and active projects.`,
    `Count the inventory and tools and <b>sign your count</b>. ${RelFirst} records and signs their own count on joining; a signed count is never rewritten.`,
    `<b>Submit your notes</b> before you leave. HON sends them to you, ${rel ? relFirst + " " : "your reliever "}and onboardsupport<wbr>@dg3.com, which reaches the whole CIMS team.`,
    `<b>Print a short copy</b>: leave one for ${relFirst} and give one to your ${mgr} (${mgrLong}).`,
  ];
  const bonusBox = bonus ? `<tr><td style="padding:12px 0 0 40px;">${note(`<b style="color:${C.navy};">This handover now counts toward your bonus.</b> For contracts ending on or after 1 Nov 2026, the Ship handover factor (10 points) of your Score Card is your submitted digital handover notes for this ship, signed in the 30 days before your sign-off and up to 10 days after it. No submitted notes, no points.`, C.green, C.gtint)}</td></tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>Sign-Off Instructions</title>
<style>
 body{margin:0;padding:0;width:100%!important}table{border-collapse:collapse}
 a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
 @media only screen and (max-width:600px){.frame{padding:0!important}.px{padding-left:20px!important;padding-right:20px!important}.stack{display:block!important;width:auto!important}.h1{font-size:28px!important;line-height:32px!important}}
</style></head>
<body style="margin:0;padding:0;background:${C.cloud};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.cloud};">${head} Digital handover notes: complete them in HON before you leave.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};"><tr><td class="frame" align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
${mastRows()}
<tr><td class="px" style="padding:26px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.gink};">SIGN-OFF INSTRUCTIONS</td>
  <td align="right" style="font-family:${FB};font-size:13px;color:${C.slate};">${shortDate(today)} ${today.slice(0, 4)}</td></tr></table>
 <div class="h1" style="font-family:${FH};font-size:34px;font-weight:600;letter-spacing:-0.6px;line-height:38px;color:${C.navy};padding-top:14px;">${head}<br><span style="color:${C.grey};">Digital Handover Notes.</span></div>
 <div style="font-family:${FB};font-size:15px;line-height:23px;color:${C.body};padding-top:14px;">Dear ${name}, this is your formal notice to prepare your handover. ${meet} Your handover notes are completed in <b>HON</b> and are mandatory: they are the record of the ship we keep. A short printed copy still stays onboard for ${relFirst} and your ${mgr}.</div>
</td></tr>
<tr><td class="px" style="padding:20px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  ${fact("Sign-off", off ? longDate(off) : "To be confirmed", "34%")}${fact("Port", port ? esc(port) : "To be confirmed", "28%")}${fact("Relieved by", rel ? esc(rel.name) : "Not named yet", "38%")}
 </tr></table></td></tr>

${phase("Start now", "from " + shortDate(today))}
<tr><td class="px" style="padding:16px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:16px;"><tr><td style="padding:20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" width="40"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${C.green}" style="background:${C.green};border-radius:14px;font-family:${FH};font-size:14px;font-weight:700;color:#FFFFFF;">1</td></tr></table></td>
    <td valign="top"><div style="font-family:${FH};font-size:20px;font-weight:600;color:${C.navy};line-height:26px;padding-top:1px;">Your digital handover notes</div>
     <div style="font-family:${FB};font-size:14px;line-height:22px;color:${C.body};padding-top:6px;">You complete them in HON. They record the condition of the ship on the day you leave it, and everything ${relFirst} needs to step straight into the role, even if you never meet. Write them for someone who has never seen the room.</div></td></tr></table></td></tr>
   <tr><td style="padding:14px 0 0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
     ${steps.map((t, i) => `<tr><td valign="top" width="22" style="font-family:${FH};font-size:13px;font-weight:700;color:${C.navy};padding:0 0 8px 0;line-height:21px;">${String.fromCharCode(97 + i)}.</td><td style="font-family:${FB};font-size:14px;line-height:21px;color:${C.body};padding:0 0 8px 0;">${t}</td></tr>`).join("")}
    </table>
    <div style="padding-top:8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.navy}" style="background:${C.navy};border-radius:8px;"><a href="${esc(link)}" target="_blank" style="display:inline-block;font-family:${FB};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;padding:13px 26px;border-radius:8px;">Open HON</a></td></tr></table></div>
    <div style="font-family:${FB};font-size:12px;line-height:18px;color:${C.slate};padding-top:8px;">Start it now and keep it current${overlap ? ", and walk " + relFirst + " through it while you are both aboard" : ""}. Opening HON from this email also confirms you received these instructions.</div>
   </td></tr>
   ${bonusBox}
  </table></td></tr></table></td></tr>

${step(2, "Tickets &amp; open projects", list([
  `<b>Zendesk and service tickets</b>: update them all, then close each one or record its status and next action in your handover notes.`,
  `<b>Brand requests and incidents</b>: list open Daily Planner content, template and marketing work, and any open incident, with the stakeholder, deadline, status and next step.`,
]))}
${step(3, "Consumables &amp; reorders", list([
  `Check every open order and its ETA.`,
  `Flag anything at risk of running short in the next 30 days, and place the replacement order now.`,
]) + note(`${RelFirst} must not inherit a shortage you could have prevented.`, C.amber, C.atint))}
${step(4, "Tools &amp; company property", list([
  `Every tool and piece of company equipment accounted for, in working order.`,
  `Report any damage or loss <b>before</b> sign-off. An unreported discrepancy becomes yours at closing.`,
]))}

${phase("Handover review", "7&ndash;14 days before" + (off ? " &middot; " + range(reviewFrom, reviewTo) : ""))}
${step(5, "Pre-sign-off audit", p(`A member of the technical or inventory team will contact you to schedule a full audit. It is the official baseline of the transition.`) +
`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">${[
  ["Inventory", "full count, visually validated by the team member."],
  ["Order planning", "pending and future orders revised against recent consumption."],
  ["Stock availability", "enough stock on hand, or ordered, for the over-yield parts."],
  ["Tools", "full tools count, visually validated."],
  ["Discrepancies", "machine totals reconciled with the account counts."],
  ["Cleanliness", "machines and print shop against housekeeping standards."],
].map(([k, v], i) => `<tr><td style="font-family:${FB};font-size:13px;line-height:20px;color:${C.body};padding:7px 0;${i ? `border-top:1px solid ${C.border};` : ""}"><b style="color:${C.navy};">${k}</b> &middot; ${v}</td></tr>`).join("")}</table>`)}

${phase("Your last day", off ? longDate(off) : "")}
${step(6, "Final inventory count", p(`Count and submit it in your handover notes by <b>${off ? longDate(off) : "your last day"}</b>, even if your day runs late. Ray Guerra and Jonathan Placer Alonzo receive it.`) +
 p(`Your signed count closes your accountability for company property. ${RelFirst} records their own count beside yours.`, "padding-top:10px;"))}
${step(7, "Machine part usage reports", p(`Pull the management list that shows your part usage reports. Contact the technical team for support if needed.`))}
${step(8, "Shipboard appraisal", p(`Rita sends the appraisal link to your ${mgr} (${mgrLong}). Make sure it is completed before you leave.`))}

<tr><td class="px" style="padding:28px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.border};border-radius:16px;"><tr><td style="padding:18px 20px;">
  <div style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.navy};padding-bottom:8px;">YOUR RESPONSIBILITY</div>
  <div style="font-family:${FB};font-size:13px;line-height:21px;color:${C.body};">From receipt of this email, each step above is yours to complete, including the accuracy of every count and the condition of company property in your custody. Your submitted handover notes, with your signed final count, close your accountability.</div>
 </td></tr></table></td></tr>
<tr><td class="px" style="padding:26px 32px 28px 32px;">
 <div style="font-family:${FB};font-size:14px;line-height:22px;color:${C.body};padding-bottom:10px;">Thank you.</div>
 <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${C.green};padding:2px 0 2px 14px;">
  <div style="font-family:${FH};font-size:15px;font-weight:600;color:${C.navy};line-height:20px;">Rita Berenyi</div>
  <div style="font-family:${FB};font-size:13px;color:${C.body};line-height:20px;">Manager, People &amp; Culture</div>
  <div style="font-family:${FB};font-size:13px;color:${C.slate};line-height:20px;padding-top:4px;">M +36 70 270 3245<br>E <a href="mailto:Rita.Berenyi@dg3.com" style="color:${C.navy};text-decoration:none;">Rita.Berenyi@dg3.com</a></div>
  <div style="font-family:${FB};font-size:13px;color:${C.body};line-height:20px;padding-top:4px;">DG3 Diversified Global Graphics Group</div>
 </td></tr></table></td></tr>
<tr><td class="px" bgcolor="${C.cloud}" style="background:${C.cloud};padding:16px 32px;font-family:${FB};font-size:11px;line-height:17px;color:${C.slate};">Sent by CIMS on behalf of DG3 Cruise Industry Managed Services. Intended only for the named recipient; it may contain confidential information. If it reached you by mistake, delete it and do not share it.</td></tr>
</table></td></tr></table></body></html>`;

  const subject = "Sign-off instructions" + (ship ? " · " + ship : "") + (off ? " · " + shortDate(off) + " " + off.slice(0, 4) : "") + (port ? " · " + port : "");
  const text = [
    `Dear ${d.firstName || ""},`, "",
    head.replace(/&[a-z]+;/g, " ") + " Digital Handover Notes.",
    (overlap ? `You and ${rel.name} overlap aboard for ${mdWords(overlap.from, off)} from ${shortDate(overlap.from)}.` : rel ? `Your reliever is ${rel.name}. You may or may not see them aboard, so your notes must carry everything.` : `Your reliever is not named yet.`),
    "", `Complete your handover notes in HON: ${link}`,
    `Select ${ship || "your ship"}, complete all eleven sections, sign your count, submit before you leave, and print a short copy for your reliever and your ${mgr}.`,
    "", "Thank you.", "Rita Berenyi", "Manager, People & Culture", "Rita.Berenyi@dg3.com",
  ].join("\n");
  return { subject, html, text };
}
