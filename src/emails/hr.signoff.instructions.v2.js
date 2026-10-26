// hr.signoff.instructions.v2 — the two-weeks-before-sign-off email to the Printer Specialist (Miguel + Rita, 16 Oct 2026,
// seven rounds on the rendered mock-up, then "now that we are good with this .. shoot this email 2 weeks prior .. CC onboard
// support"). Replaces v1 (a hand-built navy header, "two copies" of paper notes, signed by Miguel, two buttons).
// The rules it carries, each Miguel's or Rita's (Brain recnTLnsjGVcXs4EU, rec2dsh7hh8mIYwgV, recJIAzBJv8SDDl1N, recTAzAfzjpC0bSXX):
// - The handover notes are DIGITAL, in HON (open hon.cims.work, select the ship), and mandatory. A short printed copy still
//   stays onboard: one for the reliever, one for the shipboard manager.
// - The shipboard manager's title is the brand's own: Azamara BOM, Royal GSM, Celebrity DCM.
// - Never promise that the two specialists meet: only when the reliever's sign-on is before this sign-off (an overlap).
// - The final count is signed in the handover notes; Ray Guerra and Jonathan Placer Alonzo receive it.
// - One call to action: the button goes through the acknowledgment link, which records the receipt and forwards to HON.
// - Greeted by first name. Signed by Rita.
// THE SIGN-OFF PASS (Miguel, 19 Oct 2026: "looks too computer .. make it more human sounding"; "people dont know what HON
// is .. replace that by Digital Hand Over notes .. across the email"; "add .. the name .. phone and email of the incoming
// crew .. so they can be in contact"; "convert all this to something similar to a digital airline pass"; two rounds on
// the render, desktop and phone, then "I like it now"). The opening is a headline in words ("Two weeks to go, <name>."),
// one sentence, and a boarding pass: FROM the ship's code TO HOME via the sign-off port; the seafarer and position; signed
// on · sign-off · audit window; a tear line; the reliever; a tear line; the one button, "Open my Digital Handover Notes".
// The crew never reads "HON": the product is "Digital Handover Notes", hon.cims.work stays once as the address to type on a
// ship's computer. The reliever's mobile and email are printed ONLY when TDG has the reliever (the TDG PLANNING chip — read IN TDG until 26 Oct 2026: TDG's Earmarked row,
// the file's own row, or Rita's card TDG also earmarks) — a plan only the console holds must reach nobody (§10d), and a
// phone number in a crew email would reach the person before TDG has told them.
// Built to the CIMS email standard: the canonical letterhead (cims-mast.js), tables and inline styles only, no rgba, no
// gradients, bgcolor paired with background. Pure: (data) => { subject, html, text }.
import { mastRows } from "../cims-mast.js";
import { mdWords } from "../span_md.js";
import { shipCode } from "../ship_codes.js";

export const TEMPLATE_ID = "hr.signoff.instructions.v2";
export const HON_URL = "https://hon.cims.work";
// Contracts ending on or after this day score the Ship handover factor from a submitted HON handover (Brain reczJqxZnOuzkv74X).
export const HON_BONUS_FROM = "2026-11-01";

const C = { navy: "#1B3A5C", green: "#5FB946", gink: "#3E7F2E", slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB",
  body: "#374151", amber: "#B7791F", atint: "#F6EEE1", grey: "#9CA3AF", gtint: "#EAF4E6", deep: "#142D48", sub: "#95A0AD" };
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The shipboard manager, by brand (Miguel, 16 Oct 2026).
export const MANAGER = { Azamara: ["BOM", "Business Operations Manager"], Royal: ["GSM", "Guest Services Manager"], Celebrity: ["DCM", "Digital Communication Manager"] };
// A brand with no title on record (NCL, the Getaway pilot, 20 Oct 2026) reads "your shipboard manager", never Royal's GSM.
// A missing brand is still Royal (instructionsEmail defaults it), as before.
export const managerOf = (brand) => MANAGER[brand] || null;

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
  if (brand === "NCL") return /^norwegian /i.test(s) ? s : "Norwegian " + s; // "Getaway" -> "Norwegian Getaway"
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

// The reliever's mobile as TDG keeps it ("09171234567", "+63 917 123 4567", "639171234567"): a Philippine mobile reads
// +63 917 123 4567 with a tel: and a WhatsApp link; anything else is printed as written, with a tel: link only.
export function phoneOf(p) {
  const shown = String(p || "").trim();
  if (!shown || shown === "-") return null;
  const dg = shown.replace(/[^0-9]/g, "");
  if (dg.length < 7) return null;
  const ph = /^09\d{9}$/.test(dg) ? "63" + dg.slice(1) : /^639\d{9}$/.test(dg) ? dg : null;
  if (!ph) return { shown, tel: (shown.trim().startsWith("+") ? "+" : "") + dg, wa: null };
  return { shown: `+63 ${ph.slice(2, 5)} ${ph.slice(5, 8)} ${ph.slice(8)}`, tel: "+" + ph, wa: "https://wa.me/" + ph };
}
const emailOf = (e) => { const s = String(e || "").trim(); return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s) ? s : null; };
// "Two weeks to go" on the day the daily run sends it (T-14); the button on the crew page can send it any day.
export function toGo(days) {
  if (days == null || days < 0) return null;
  if (days === 0) return ["Sign-off day", "SIGN-OFF TODAY"];
  if (days === 1) return ["One day to go", "1 DAY TO GO"];
  if (days === 7) return ["One week to go", "7 DAYS TO GO"];
  if (days === 14) return ["Two weeks to go", "14 DAYS TO GO"];
  return [days + " days to go", days + " DAYS TO GO"];
}

// d: { firstName, crewName, position, ship, brand, signOn, signOff, port,
//      reliever: { name, first, on, tdg, phone, email } | null, link, today }
export function instructionsEmail(d) {
  const off = iso(d.signOff), on = iso(d.signOn);
  const today = iso(d.today) || new Date().toISOString().slice(0, 10);
  const brand = d.brand || "Royal";
  const mt = managerOf(brand), mgrSay = mt ? mt[0] + " (" + mt[1] + ")" : "shipboard manager", mgr = mt ? mt[0] : "shipboard manager";
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
  const go = off ? toGo(dayN(off) - dayN(today)) : null;
  // The contact, only when TDG has the reliever (see the header).
  const inTdg = !!(rel && rel.tdg);
  const ph = inTdg ? phoneOf(rel.phone) : null;
  const em = inTdg ? emailOf(rel.email) : null;

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

  // ---- the pass. A letter-spaced label leaves its spacing after the last letter: a right-aligned one is pulled back by it.
  const lab = (t, al) => `<div style="font-family:${FB};font-size:10px;font-weight:700;letter-spacing:1.6px;color:${C.slate};text-transform:uppercase;line-height:14px;${al === "right" ? "margin-right:-1.6px;" : ""}">${t}</div>`;
  const lnk = (href, t) => `<a href="${esc(href)}" style="color:${C.navy};font-weight:700;text-decoration:none;">${t}</a>`;
  const hair = (dashed) => `<div style="border-top:${dashed ? "2px dashed " + C.border : "1px solid " + C.border};font-size:0;line-height:0;">&nbsp;</div>`;
  // the tear line: a cloud half-circle each side (Outlook draws squares; it still reads as a tear line)
  const tear = `<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
 <td width="14" height="28" bgcolor="${C.cloud}" style="background:${C.cloud};font-size:0;line-height:0;border-radius:0 14px 14px 0;">&nbsp;</td>
 <td style="padding:0 10px;">${hair(true)}</td>
 <td width="14" height="28" bgcolor="${C.cloud}" style="background:${C.cloud};font-size:0;line-height:0;border-radius:14px 0 0 14px;">&nbsp;</td></tr></table></td></tr>`;
  const cell = (k, v, w, al) => `<td class="pf" width="${w}" valign="top" align="${al}" style="text-align:${al};padding:0;">${lab(k, al)}<div class="pv" style="font-family:${FH};font-size:16px;font-weight:600;color:${C.navy};line-height:22px;padding-top:4px;">${v}</div></td>`;
  const dot = `<td width="7" height="7" bgcolor="${C.green}" style="background:${C.green};border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>`;
  const code = (t) => `<div class="code" style="font-family:${FH};font-size:34px;font-weight:700;letter-spacing:1px;color:${C.navy};line-height:40px;padding-top:4px;white-space:nowrap;">${t}</div>`;
  const under = (t) => `<div style="font-family:${FB};font-size:13px;line-height:18px;color:${C.slate};padding-top:2px;">${t}</div>`;
  const crow = (k, v) => `<tr><td width="60" valign="top" style="font-family:${FB};font-size:13px;line-height:24px;color:${C.slate};">${k}</td><td valign="top" style="font-family:${FB};font-size:15px;line-height:24px;color:${C.body};word-break:break-word;">${v}</td></tr>`;
  const relWhen = !rel ? `Rita will tell you who takes over.`
    : overlap ? `Aboard with you from ${shortDate(overlap.from)} &middot; ${mdWords(overlap.from, off)} together`
    : relOn ? `Joins ${esc(ship || "the ship")} on ${shortDate(relOn)} ${relOn.slice(0, 4)}` : `Joining date to be confirmed`;
  const contact = (ph ? crow("Mobile", lnk("tel:" + ph.tel, esc(ph.shown)) + (ph.wa ? ` <span style="color:${C.grey};">&middot;</span> ` + lnk(ph.wa, "WhatsApp") : "")) : "")
    + (em ? crow("Email", lnk("mailto:" + em, esc(em).replace("@", "<wbr>@"))) : "");
  // The chip sits on the label's row, so the reliever's name and date keep the full width on a phone ("TDG PLANNING", 26 Oct
  // 2026, is wider than "IN TDG": beside the name it broke "Raymond Sample" onto two lines at 375px).
  const relBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
   <td valign="middle">${lab("Relieved by")}</td>
   ${inTdg ? `<td valign="middle" align="right" style="padding-left:12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr><td bgcolor="${C.gtint}" style="background:${C.gtint};border-radius:999px;padding:4px 10px;font-family:${FB};font-size:11px;font-weight:700;letter-spacing:0.6px;line-height:14px;color:${C.gink};white-space:nowrap;">TDG PLANNING</td></tr></table></td>` : ""}
  </tr></table><div style="font-family:${FH};font-size:22px;font-weight:600;color:${rel ? C.navy : C.grey};line-height:28px;padding-top:4px;">${rel ? esc(rel.name) : "Not named yet"}</div>
    <div style="font-family:${FB};font-size:13px;line-height:20px;color:${overlap ? C.gink : C.slate};padding-top:2px;">${relWhen}</div>${contact ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">${contact}</table>` : ""}`;
  const reviewFrom = off ? addDays(off, -14) : null, reviewTo = off ? addDays(off, -7) : null;
  const crewName = esc(d.crewName || d.firstName || "");
  const pass = `<tr><td class="px" style="padding:22px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:20px;"><tr><td class="passpad" style="padding:14px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px;">
  <tr><td bgcolor="${C.deep}" style="background:${C.deep};border-radius:16px 16px 0 0;padding:13px 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:2px;line-height:16px;color:${C.sub};">SIGN-OFF PASS</td>
    <td align="right" style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1px;line-height:16px;color:${C.green};white-space:nowrap;padding-left:14px;">${go ? go[1] : ""}</td></tr></table></td></tr>
  <tr><td style="padding:20px 22px 0 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td class="rside" width="34%" valign="top">${lab("From")}${code(esc(shipCode(ship) || "&nbsp;"))}${under(esc(ship || "Your ship"))}</td>
    <td class="rmid" width="32%" valign="top" style="padding:0 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px;"><tr>${dot}<td style="padding:0 2px;">${hair(true).replace(C.border, C.grey)}</td>${dot}</tr></table></td>
    <td class="rside" width="34%" valign="top" align="right" style="text-align:right;">${lab("To", "right")}${code("HOME").replace("white-space:nowrap;", "white-space:nowrap;margin-right:-1px;")}${under(port ? "via " + esc(port) : "Port to be confirmed")}</td>
   </tr></table></td></tr>
  <tr><td style="padding:18px 22px 0 22px;">${hair(false)}</td></tr>
  <tr><td style="padding:16px 22px 0 22px;">${lab("Seafarer")}<div style="font-family:${FH};font-size:18px;font-weight:600;color:${C.navy};line-height:24px;padding-top:4px;">${crewName}</div>${d.position ? under(esc(d.position)) : ""}</td></tr>
  <tr><td style="padding:16px 22px 20px 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell("Signed on", on ? shortDate(on) + " " + on.slice(0, 4) : "&ndash;", "34%", "left")}${cell("Sign-off", off ? shortDate(off) + " " + off.slice(0, 4) : "To be confirmed", "33%", "center")}${cell("Audit", off ? range(reviewFrom, reviewTo) : "&ndash;", "33%", "right")}</tr></table></td></tr>
  ${tear}
  <tr><td style="padding:16px 22px 20px 22px;">${relBlock}</td></tr>
  ${tear}
  <tr><td align="center" style="padding:16px 22px 20px 22px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.green}" style="background:${C.green};border-radius:10px;"><a href="${esc(link)}" target="_blank" style="display:block;font-family:${FB};font-size:16px;font-weight:700;line-height:20px;color:#FFFFFF;text-decoration:none;padding:15px 12px;border-radius:10px;">Open my Digital Handover Notes</a></td></tr></table>
   <div style="font-family:${FB};font-size:12px;line-height:18px;color:${C.slate};padding-top:9px;">Select ${esc(ship || "your ship")} &middot; no login. Opening them from this email also tells Rita you have these instructions.</div>
  </td></tr>
 </table></td></tr></table></td></tr>`;
  // One sentence under the pass: what the reliever means for the notes. Never a promise to meet (rec2dsh7hh8mIYwgV).
  const say = overlap
    ? `You are aboard together from ${longDate(overlap.from).replace(/ \d{4}$/, "")}: use those days to walk ${relFirst} through the ship and through your notes.`
    : rel
      ? `You may or may not meet ${relFirst} aboard, so your notes must carry everything.` + (contact ? ` A short message before you leave helps: introduce yourself, and say anything that cannot wait for the notes.` : "")
      : `You may not meet your reliever aboard, so your notes must carry everything.`;

  const headA = go ? `${go[0]}, ${name}.` : `Your sign-off is coming up, ${name}.`;
  const head = off ? `You sign off ${shortDate(off)}${port ? " in " + esc(port) : ""}.` : `Your sign-off is coming up.`;
  const steps = [
    `Open your notes with the button on your pass, or go to <a href="${esc(link)}" style="color:${C.navy};font-weight:700;">hon.cims.work</a> on any device, and select <b>${esc(ship || "your ship")}</b>. No login.`,
    `Complete all eleven sections and save each one: machine status, recurring issues, open tickets, stock and orders, tools, risks and active projects.`,
    `Count the inventory and tools and <b>sign your count</b>. ${RelFirst} records and signs their own count on joining; a signed count is never rewritten.`,
    `<b>Submit your notes</b> before you leave. They go to you, ${rel ? relFirst + " " : "your reliever "}and onboardsupport<wbr>@dg3.com, which reaches the whole CIMS team.`,
    `<b>Print a short copy</b>: leave one for ${relFirst} and give one to your ${mgrSay}.`,
  ];
  const bonusBox = bonus ? `<tr><td style="padding:12px 0 0 40px;">${note(`<b style="color:${C.navy};">This handover now counts toward your bonus.</b> For contracts ending on or after 1 Nov 2026, the Ship handover factor (10 points) of your Score Card is your submitted Digital Handover Notes for this ship, signed in the 30 days before your sign-off and up to 10 days after it. No submitted notes, no points.`, C.green, C.gtint)}</td></tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>Sign-Off Instructions</title>
<style>
 body{margin:0;padding:0;width:100%!important}table{border-collapse:collapse}
 a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
 @media only screen and (max-width:600px){.frame{padding:0!important}.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:28px!important;line-height:32px!important}.passpad{padding:10px!important}.code{font-size:30px!important;line-height:36px!important}.pf .pv{font-size:15px!important}.rside{width:42%!important}.rmid{width:16%!important}}
</style></head>
<body style="margin:0;padding:0;background:${C.cloud};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.cloud};">${go ? go[0] + ". " : ""}${head} Your Digital Handover Notes are due before you leave.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};"><tr><td class="frame" align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
${mastRows()}
<tr><td class="px" style="padding:26px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.gink};">SIGN-OFF INSTRUCTIONS</td>
  <td align="right" style="font-family:${FB};font-size:13px;color:${C.slate};">${shortDate(today)} ${today.slice(0, 4)}</td></tr></table>
 <div class="h1" style="font-family:${FH};font-size:34px;font-weight:600;letter-spacing:-0.6px;line-height:38px;color:${C.navy};padding-top:14px;">${headA}<br><span style="color:${C.grey};">Here is your sign-off pass.</span></div>
 <div style="font-family:${FB};font-size:15px;line-height:24px;color:${C.body};padding-top:14px;">Thank you for your work on ${esc(ship || "board")}. The first thing to start is your <b>Digital Handover Notes</b>: they are how ${relFirst} will get to know the ship, and the record of the ship we keep.</div>
</td></tr>
${pass}
<tr><td class="px" style="padding:18px 32px 0 32px;">
 <div style="font-family:${FB};font-size:15px;line-height:24px;color:${C.body};">${say}</div>
</td></tr>

${phase("Start now", "from " + shortDate(today))}
<tr><td class="px" style="padding:16px 32px 0 32px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:16px;"><tr><td style="padding:20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" width="40"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${C.green}" style="background:${C.green};border-radius:14px;font-family:${FH};font-size:14px;font-weight:700;color:#FFFFFF;">1</td></tr></table></td>
    <td valign="top"><div style="font-family:${FH};font-size:20px;font-weight:600;color:${C.navy};line-height:26px;padding-top:1px;">Your Digital Handover Notes</div>
     <div style="font-family:${FB};font-size:14px;line-height:22px;color:${C.body};padding-top:6px;">They record the condition of the ship on the day you leave it, and everything ${relFirst} needs to step straight into the role, even if you never meet. Write them for someone who has never seen the room. Start now and keep them current${overlap ? ", and walk " + relFirst + " through them while you are both aboard" : ""}.</div></td></tr></table></td></tr>
   <tr><td style="padding:14px 0 0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
     ${steps.map((t, i) => `<tr><td valign="top" width="22" style="font-family:${FH};font-size:13px;font-weight:700;color:${C.navy};padding:0 0 8px 0;line-height:21px;">${String.fromCharCode(97 + i)}.</td><td style="font-family:${FB};font-size:14px;line-height:21px;color:${C.body};padding:0 0 8px 0;">${t}</td></tr>`).join("")}
    </table>
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
${step(8, "Shipboard appraisal", p(`Rita sends the appraisal link to your ${mgrSay}. Make sure it is completed before you leave.`))}

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
  const relLine = !rel ? "Your reliever is not named yet."
    : "Your reliever: " + rel.name + (overlap ? `, aboard with you for ${mdWords(overlap.from, off)} from ${shortDate(overlap.from)}.` : relOn ? `, joining on ${shortDate(relOn)} ${relOn.slice(0, 4)}.` : ".");
  const text = [
    `Hi ${d.firstName || ""},`, "",
    (go ? go[0] + ". " : "") + head.replace(/&[a-z]+;/g, " "),
    "Before you leave, complete your Digital Handover Notes. They are mandatory.",
    "", `Open your Digital Handover Notes: ${link}`,
    `Select ${ship || "your ship"}, complete all eleven sections, sign your count, submit before you leave, and print a short copy for your reliever and your ${mgr}.`,
    "", relLine,
    ...(ph ? [`Mobile: ${ph.shown}`] : []), ...(em ? [`Email: ${em}`] : []),
    (overlap ? "" : rel ? `You may or may not meet ${rel.first || firstWord(rel.name)} aboard, so your notes must carry everything.` : ""),
    "", "Thank you.", "Rita Berenyi", "Manager, People & Culture", "Rita.Berenyi@dg3.com",
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
  return { subject, html, text };
}
