// hr.signoff.reliever.v1 — the other half of the sign-off pass: the INCOMING printer gets the outgoing one's name, mobile and
// email (Miguel, 19 Oct 2026, on the sign-off pass: "add .. the name .. phone and email of the incoming crew .. so they can
// be in contact"; 23 Oct 2026: "The email that sent the outgoing contact to the reliever needs a render first. Yes, you
// have to make it and show it to me"). Meant to go the same day as hr.signoff.instructions.v2 (14 days before the sign-off),
// under the SAME rule: only when TDG has the reliever (signoff_context.relieverInTdg — TDG's Earmarked row, the file's own
// row, or Rita's card TDG also earmarks). A plan only the console holds must reach nobody (§10d).
// Never promises that the two meet: only an overlap (the reliever signs on before this sign-off) says "together".
// The crew never reads "HON": "Digital Handover Notes". Greeted by first name, signed by Rita, reply-to Rita.
// NOT WIRED TO SEND (23 Oct 2026): an email ships only after Miguel signs off its render (CIMS email standard §5).
import { mastRows } from "../cims-mast.js";
import { mdWords } from "../span_md.js";
import { shipFullName, portName, phoneOf, shortDate, longDate, firstWord, HON_URL } from "./hr.signoff.instructions.v2.js";

export const TEMPLATE_ID = "hr.signoff.reliever.v1";
const C = { navy: "#1B3A5C", green: "#5FB946", gink: "#3E7F2E", slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB",
  body: "#374151", grey: "#9CA3AF", gtint: "#EAF4E6", deep: "#142D48", sub: "#95A0AD", page: "#EEF1F6" };
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";
const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const emailOf = (e) => { const s = String(e || "").trim(); return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s) ? s : null; };
const dayN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;

// d: { firstName (the reliever's), ship, brand, port, outgoing: { name, first, position, signOff, phone, email }, relieverOn, today }
export function relieverEmail(d) {
  const o = d.outgoing || {};
  const off = iso(o.signOff), on = iso(d.relieverOn);
  const ship = shipFullName(d.ship, d.brand || "Royal");
  const port = portName(d.port);
  const name = esc(d.firstName || "") || "colleague";
  const of = esc(o.first || firstWord(o.name)) || "the outgoing printer";
  const overlap = off && on && on < off ? { from: on, days: dayN(off) - dayN(on) } : null;
  const ph = phoneOf(o.phone), em = emailOf(o.email);

  const subject = "You take over from " + (o.first || firstWord(o.name)) + " on " + ship;
  const head = `You take over from ${of}, ${name}` + (/\.$/.test(name) ? "" : ".");
  const head2 = off ? `${esc(ship)} · sign-off ${shortDate(off)}${port ? ", " + esc(port) : ""}.` : esc(ship) + ".";
  const lead = overlap
    ? `You are aboard together from ${longDate(overlap.from).replace(/ \d{4}$/, "")}. Use those days: ${of} walks you through the ship and the Digital Handover Notes.`
    : `You may or may not meet ${of} aboard, so a short message before the sign-off helps. Introduce yourself, and ask what cannot wait for the notes.`;

  const lab = (t, al) => `<div style="font-family:${FB};font-size:10px;font-weight:700;letter-spacing:1.6px;color:${C.slate};text-transform:uppercase;line-height:14px;${al === "right" ? "margin-right:-1.6px;" : ""}">${t}</div>`;
  const lnk = (href, t) => `<a href="${esc(href)}" style="color:${C.navy};font-weight:700;text-decoration:none;">${t}</a>`;
  const hair = (dashed) => `<div style="border-top:${dashed ? "2px dashed " + C.border : "1px solid " + C.border};font-size:0;line-height:0;">&nbsp;</div>`;
  const tear = `<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
 <td width="14" height="28" bgcolor="${C.cloud}" style="background:${C.cloud};font-size:0;line-height:0;border-radius:0 14px 14px 0;">&nbsp;</td>
 <td style="padding:0 10px;">${hair(true)}</td>
 <td width="14" height="28" bgcolor="${C.cloud}" style="background:${C.cloud};font-size:0;line-height:0;border-radius:14px 0 0 14px;">&nbsp;</td></tr></table></td></tr>`;
  const cell = (k, v, w, al) => `<td width="${w}" valign="top" align="${al}" style="text-align:${al};padding:0;">${lab(k, al)}<div style="font-family:${FH};font-size:16px;font-weight:600;color:${C.navy};line-height:22px;padding-top:4px;">${v}</div></td>`;
  const crow = (k, v) => `<tr><td width="60" valign="top" style="font-family:${FB};font-size:13px;line-height:26px;color:${C.slate};">${k}</td><td valign="top" style="font-family:${FB};font-size:15px;line-height:26px;color:${C.body};word-break:break-word;">${v}</td></tr>`;
  const contact = (ph ? crow("Mobile", lnk("tel:" + ph.tel, esc(ph.shown)) + (ph.wa ? ` <span style="color:${C.grey};">&middot;</span> ` + lnk(ph.wa, "WhatsApp") : "")) : "")
    + (em ? crow("Email", lnk("mailto:" + em, esc(em).replace("@", "<wbr>@"))) : "");
  const together = overlap ? `${shortDate(overlap.from)}&ndash;${shortDate(off)}` : "May not meet";

  const pass = `<tr><td class="px" style="padding:22px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:20px;"><tr><td style="padding:14px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px;">
  <tr><td bgcolor="${C.deep}" style="background:${C.deep};border-radius:16px 16px 0 0;padding:13px 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:2px;line-height:16px;color:${C.sub};">HANDOVER PASS</td>
    <td align="right" style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1px;line-height:16px;color:${C.green};white-space:nowrap;padding-left:14px;">${esc(ship).toUpperCase()}</td></tr></table></td></tr>
  <tr><td style="padding:18px 22px 0 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top">${lab("You take over from")}<div style="font-family:${FH};font-size:22px;font-weight:600;color:${C.navy};line-height:28px;padding-top:4px;">${esc(o.name || "")}</div>${o.position ? `<div style="font-family:${FB};font-size:13px;color:${C.slate};padding-top:2px;">${esc(o.position)}</div>` : ""}</td>
    <td valign="top" align="right" style="padding-left:12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr><td bgcolor="${C.gtint}" style="background:${C.gtint};border-radius:999px;padding:5px 10px;font-family:${FB};font-size:11px;font-weight:700;letter-spacing:0.6px;color:${C.gink};white-space:nowrap;">IN TDG</td></tr></table></td>
   </tr></table>
   ${contact ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">${contact}</table>` : `<div style="font-family:${FB};font-size:13px;color:${C.slate};padding-top:10px;">No mobile or email on file. Rita can put you in touch.</div>`}
  </td></tr>
  ${tear}
  <tr><td style="padding:16px 22px 20px 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell("You sign on", on ? shortDate(on) + " " + on.slice(0, 4) : "To be confirmed", "34%", "left")}${cell("Sign-off", off ? shortDate(off) + " " + off.slice(0, 4) : "To be confirmed", "33%", "center")}${cell("Together", together, "33%", "right")}</tr></table>
   ${overlap ? `<div style="font-family:${FB};font-size:13px;color:${C.gink};padding-top:10px;">${mdWords(overlap.from, off)} aboard together.</div>` : ""}
  </td></tr>
 </table></td></tr></table></td></tr>`;

  const li = (n, t) => `<tr><td class="px" style="padding:14px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="40" valign="top"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${C.navy}" style="background:${C.navy};border-radius:14px;font-family:${FH};font-size:14px;font-weight:700;color:#FFFFFF;">${n}</td></tr></table></td>
  <td valign="top" style="font-family:${FB};font-size:14px;line-height:22px;color:${C.body};padding-top:3px;">${t}</td></tr></table></td></tr>`;
  const steps = [
    `<b>Say hello before ${of} signs off.</b> A short message: who you are, when you join, and anything you want ready for you.`,
    `<b>Read the Digital Handover Notes.</b> ${of} writes them before leaving. Open <a href="${HON_URL}" style="color:${C.navy};font-weight:700;">hon.cims.work</a> on any device, select ${esc(ship)}. No login.`,
    `<b>Count and sign your own count when you join.</b> ${of} signs one count, you sign yours; a signed count is never rewritten.`,
  ];
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no"><title>${esc(subject)}</title>
<style>a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media only screen and (max-width:620px){.c{width:100%!important}.px{padding-left:16px!important;padding-right:16px!important}.hl{font-size:28px!important}.fr{padding:0!important}}</style></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.page};">${esc(subject)}. ${overlap ? "You are aboard together from " + shortDate(overlap.from) + "." : "Here is how to reach " + (o.first || firstWord(o.name)) + "."}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};"><tr><td class="fr" align="center" style="padding:24px 12px;">
<table role="presentation" class="c" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
${mastRows()}
<tr><td class="px" style="padding:26px 32px 0 32px;"><div class="hl" style="font-family:${FH};font-size:32px;font-weight:600;letter-spacing:-0.5px;color:${C.navy};line-height:1.15;">${head}<br><span style="color:${C.grey};">${head2}</span></div>
<div style="font-family:${FB};font-size:15px;line-height:23px;color:${C.body};padding-top:12px;">${lead}</div></td></tr>
${pass}
${steps.map((t, i) => li(i + 1, t)).join("")}
<tr><td class="px" style="padding:24px 32px 0 32px;font-family:${FB};font-size:14px;line-height:22px;color:${C.body};">Welcome aboard ${esc(ship)}. Questions, reply to this email.<br><b style="color:${C.navy};">Rita Berenyi</b> <span style="color:${C.slate};">· People &amp; Culture, CIMS</span></td></tr>
<tr><td height="28" style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:20px 32px 24px 32px;font-family:${FB};font-size:12px;color:${C.slate};line-height:1.5;border-top:1px solid #E5E7EB;">CIMS · Cruise Industry Managed Services · sent to the incoming Printer Specialist once TDG has the crew change. ${of} gets your contact in the sign-off email.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [`You take over from ${o.first || firstWord(o.name)}, ${d.firstName || ""}. ${ship}${off ? ", sign-off " + longDate(off) : ""}${port ? ", " + port : ""}.`,
    overlap ? `You are aboard together from ${longDate(overlap.from)} (${mdWords(overlap.from, off)}).` : `You may or may not meet aboard, so a short message before the sign-off helps.`,
    [o.name, ph ? "Mobile: " + ph.shown + (ph.wa ? " (WhatsApp " + ph.wa + ")" : "") : "", em ? "Email: " + em : ""].filter(Boolean).join("\n"),
    "1. Say hello before the sign-off.\n2. Read the Digital Handover Notes: " + HON_URL + ", select " + ship + ". No login.\n3. Count and sign your own count when you join.",
    "Rita Berenyi, People & Culture, CIMS"].join("\n\n");
  return { subject, html, text };
}
