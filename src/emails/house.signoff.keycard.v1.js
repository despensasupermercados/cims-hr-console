// house.signoff.keycard.v1 — the staff-house pass, THREE DAYS before a Printer Specialist signs off (Miguel, 27 Oct 2026:
// "we will send an email .. with a link where people can book a room in manila .. make it fun, light and a good CTA ..
// make it look like hotel pass .. the mail goes to the personal email and cc rita and I and Mary joy"; then "I like A ..
// just change 'the ship is done with you' .. something like now is time to rest"; then "send it 3 days before a crew
// sign off .. build it and push it"). Render signed off by Miguel on 27 Oct 2026 (desktop and phone).
//
// A LOCAL COPY of CIMS_Housing/src/emails/signoff.js signoffKeyCardV1 — apps copy templates, never import across repos
// (EMAIL-CONVENTION §5). The house's own gallery at house.cims.work/preview/house.signoff.keycard.v1 is the reference
// render; this file must read the same. Differences on purpose: the days-out is computed from the sign-off date and the
// run day ("in 3 days" / "tomorrow" / "today"), because the daily run self-heals a missed morning and the copy must not
// say "three days" on a T-2 send.
//
// Why three days: the house's guest window is seven, so every night the crew could want is already bookable.
// Built to the CIMS email standard: the canonical letterhead (cims-mast.js), tables and inline styles only, no rgba, no
// gradients, bgcolor paired with background. Pure: (data) => { subject, html, text }.
import { mastRows } from "../cims-mast.js";

export const TEMPLATE_ID = "house.signoff.keycard.v1";
export const BOOK_URL = "https://house.cims.work/book";
// The envelope Miguel asked for: the crew member's PERSONAL address, cc Rita, Miguel and Maryjoy. Reply-to Rita, who runs
// the desk with Joy (the house's own emails reply to Rita too). The house's HOUSE_CONTACTS carries the same two people.
export const HOUSE_CC = ["Rita.Berenyi@dg3.com", "Miguel.Sanmartin@dg3.com", "maryjoy.manzanares@dg3.com"];
export const HOUSE_REPLY_TO = "Rita.Berenyi@dg3.com";
export const HOUSE_CONTACTS = [
  { name: "Rita", email: "Rita.Berenyi@dg3.com", phone: "" },
  { name: "Joy", email: "maryjoy.manzanares@dg3.com", phone: "+63 992 223 8347" },
];
// The house, as CIMS_Housing/src/emails/booking.js HOUSE names it.
export const HOUSE = {
  name: "Two Palmtree Villas", line1: "Cluster 2, Unit 2B", line2: "Newport Blvd, Pasay", line3: "Manila 1300, Philippines",
  map: "https://www.google.com/maps/search/Two+Palmtree+Villas+Newport+Blvd+Pasay+Manila+1300",
};

const T = {
  navy: "#16375A", deep: "#0F2740", green: "#4E9E37", greenInk: "#3A7A2A",
  slate: "#5B6A7B", cloud: "#F5F7FA", border: "#E4E9EF", body: "#41505F",
  onNavy: "#A8BACD", navyLine: "#2E5580",
};
const FH = "'Outfit',Helvetica,Arial,sans-serif";
const FB = "'DM Sans',Helvetica,Arial,sans-serif";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const dayN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d) => { const x = new Date(d + "T12:00:00Z"); return `${DOW[x.getUTCDay()]}, ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const dayUp = (d) => { const x = new Date(d + "T12:00:00Z"); return { dow: DOW[x.getUTCDay()].toUpperCase(), dm: `${x.getUTCDate()} ${MON[x.getUTCMonth()].toUpperCase()}` }; };
const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven"];

// How far off the sign-off is, in the three forms the email needs. n <= 0 reads "today": the run never sends for a
// passed sign-off (auto_send dueWithin), so "today" is the floor, not a bug to hide.
export function daysOut(signoffDate, today) {
  const a = iso(signoffDate), b = iso(today);
  const n = a && b ? Math.max(0, Math.round(dayN(a) - dayN(b))) : 3;
  if (n === 0) return { n, eyebrow: "SIGN-OFF TODAY", subject: "Signing off today?", intro: "today" };
  if (n === 1) return { n, eyebrow: "SIGN-OFF TOMORROW", subject: "Signing off tomorrow?", intro: "tomorrow" };
  const w = WORDS[n] || String(n);
  return { n, eyebrow: `SIGN-OFF IN ${n} DAYS`, subject: `Signing off in ${w} days?`, intro: `${w} days from now` };
}

// A real document (28 Oct 2026, Miguel's phone screenshot: the table alone, with no viewport, had iOS Mail scale the
// text up and squeeze the pass): the viewport meta and -webkit-text-size-adjust:100% make a phone render the sizes as
// written. No <style> block — every width below works with no CSS at all (the standard's rule, and this template's test).
const shell = (inner, subject) => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformat">
<title>${esc(subject || "CIMS Staff House")}</title></head>
<body style="margin:0;padding:0;background:${T.cloud};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.cloud}" style="background:${T.cloud};">
 <tr><td align="center" style="padding:20px 10px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
   ${mastRows()}
   <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:24px 20px;">${inner}</td></tr>
   <tr><td bgcolor="${T.deep}" style="background:${T.deep};padding:16px 24px;">
    <div style="font-family:${FB};font-size:10px;color:${T.slate};line-height:1.7;">
     CIMS Staff House &middot; ${esc(HOUSE.name)}, ${esc(HOUSE.line2)}<br>
     CIMS &mdash; Cruise Industry Managed Services &middot; A division of DG3</div>
   </td></tr>
  </table>
 </td></tr></table>
</body></html>`;

// Two facts side by side where there is room, one under the other on a phone — with no CSS: each block is an
// inline-block of at most 240px, so a 520px pass holds two across and a 318px one stacks them (the standard's
// layout-without-a-style-block rule). Outlook desktop ignores inline-block, so a ghost table holds its two columns.
const pair = (a, b) => `
     <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="50%" valign="top"><![endif]-->
     <div style="display:inline-block;width:100%;max-width:240px;vertical-align:top;padding-bottom:14px;">${a}</div><!--[if mso]></td><td width="50%" valign="top"><![endif]--><div style="display:inline-block;width:100%;max-width:240px;vertical-align:top;padding-bottom:14px;">${b}</div>
     <!--[if mso]></td></tr></table><![endif]-->`;

const button = (href, label) => `
 <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td bgcolor="${T.green}" style="background:${T.green};border-radius:8px;">
   <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FH};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;">${esc(label)}</a>
  </td></tr></table>`;

const label = (k, v, inkK, inkV, size = 14) => `
   <div style="font-family:${FB};font-size:8px;font-weight:700;letter-spacing:1.6px;color:${inkK};line-height:1.2;">${k}</div>
   <div style="font-family:${FH};font-size:${size}px;font-weight:700;color:${inkV};margin-top:3px;line-height:1.25;">${esc(v)}</div>`;

const contactsLine = (contacts) => contacts.length
  ? `Questions? Email ${contacts.map((c) => `<a href="mailto:${esc(c.email)}" style="color:${T.greenInk};font-weight:700;text-decoration:none;">${esc(c.name)}</a>`).join(" or ")}${
      contacts.filter((c) => c.phone).map((c) => ` &mdash; or call ${esc(c.name)} on <a href="tel:${esc(c.phone.replace(/[^+0-9]/g, ""))}" style="color:${T.greenInk};font-weight:700;text-decoration:none;">${esc(c.phone)}</a>`).join("")}.`
  : "";
const contactsText = (contacts) => contacts.length ? `Questions? Email ${contacts.map((c) => `${c.name} (${c.email})`).join(" or ")}.` : "";

const FACTS = [
  ["Free for CIMS crew", "No charge. Four beds, one studio, your own key."],
  ["Ten minutes from NAIA", `${HOUSE.name}, ${HOUSE.line2} — Newport City, by Terminal 3.`],
  ["Noon to noon", "Land at 3 AM? That still counts as the night before. Walk in and sleep."],
];

// data: { name, first_name, ship, signoff_date, today, bookUrl?, contacts? }
export function houseKeyCardEmail(data) {
  const first = String(data.first_name || data.name || "").trim().split(/\s+/)[0] || "there";
  const off = iso(data.signoff_date);
  const d = daysOut(off, data.today);
  const so = off ? dayUp(off) : { dow: "", dm: "" };
  const bookUrl = data.bookUrl || BOOK_URL;
  const contacts = data.contacts || HOUSE_CONTACTS;
  const subject = `${d.subject} Your bed in Manila is one tap away`;

  const html = shell(`
   <div style="font-family:${FH};font-size:9px;font-weight:700;letter-spacing:2.4px;color:${T.greenInk};">STAFF HOUSE MANILA &mdash; ${d.eyebrow}</div>
   <div style="font-family:${FH};font-size:22px;font-weight:600;color:${T.navy};margin-top:6px;line-height:1.25;">Time to rest, ${esc(first)}.<br>Manila has a bed for you.</div>
   <div style="font-family:${FB};font-size:13.5px;color:${T.body};line-height:1.65;margin-top:9px;">You sign off <strong style="color:${T.navy};">${esc(off ? day(off) : "soon")}</strong> &mdash; ${esc(d.intro)}. Contract done, bags packed, and the last thing you need is an airport chair. CIMS keeps a four-bed studio by NAIA, free for crew. Pick a bed, get your pass, walk in &mdash; no approval, no waiting.</div>

   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border-radius:14px;">
    <tr><td bgcolor="${T.deep}" style="background:${T.deep};padding:18px 18px 8px;border-radius:14px 14px 0 0;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:${FB};font-size:9px;font-weight:700;letter-spacing:2px;color:${T.onNavy};">STAFF HOUSE &nbsp;&middot;&nbsp; MANILA</td>
      <td align="right" style="padding:0;">
       <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr>
        <td bgcolor="${T.green}" style="background:${T.green};border-radius:999px;padding:5px 11px;font-family:${FH};font-size:9.5px;font-weight:700;letter-spacing:1.6px;color:${T.deep};">GUEST PASS</td>
       </tr></table>
      </td>
     </tr></table>

     <div style="margin-top:20px;font-size:0;line-height:0;">${pair(`
       <div style="font-family:${FB};font-size:8px;font-weight:700;letter-spacing:1.6px;color:${T.green};line-height:1.2;">SIGN-OFF</div>
       <div style="font-family:${FH};font-size:22px;font-weight:700;color:#FFFFFF;margin-top:5px;line-height:1.05;">${so.dow} ${so.dm}</div>
       <div style="font-family:${FB};font-size:11.5px;color:${T.onNavy};margin-top:4px;line-height:1.4;">${esc(data.ship || "your ship")}</div>`, `
       <div style="font-family:${FB};font-size:8px;font-weight:700;letter-spacing:1.6px;color:${T.green};line-height:1.2;">CHECK IN</div>
       <div style="font-family:${FH};font-size:22px;font-weight:700;color:#FFFFFF;margin-top:5px;line-height:1.05;">ANY DAY</div>
       <div style="font-family:${FB};font-size:11.5px;color:${T.onNavy};margin-top:4px;line-height:1.4;">from 12:00 noon &middot; out by noon</div>`)}</div>

     <div style="margin-top:4px;padding-top:16px;border-top:1px solid ${T.navy};font-size:0;line-height:0;">${pair(label("GUEST", data.name || first, T.green, "#FFFFFF"), label("BEDS", "4 · first come, first served", T.green, "#FFFFFF", 12))}${pair(label("RATE", "Free for CIMS crew", T.green, "#FFFFFF"), label("WHERE", "Newport City, by NAIA T3", T.green, "#FFFFFF", 12))}</div>
    </td></tr>

    <tr><td bgcolor="${T.deep}" style="background:${T.deep};padding:0;font-size:0;line-height:0;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="11" height="18" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:0 16px 16px 0;font-size:0;line-height:0;">&nbsp;</td>
      <td style="font-size:0;line-height:0;"><div style="border-bottom:2px dashed ${T.navyLine};height:9px;font-size:0;line-height:0;">&nbsp;</div></td>
      <td width="11" height="18" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px 0 0 16px;font-size:0;line-height:0;">&nbsp;</td>
     </tr></table>
    </td></tr>

    <tr><td bgcolor="${T.navy}" align="center" style="background:${T.navy};padding:20px 20px 22px;border-radius:0 0 14px 14px;">
     <div style="font-family:${FB};font-size:12.5px;color:${T.onNavy};line-height:1.6;margin-bottom:12px;">Your bed is one tap away. Beds open 7 days ahead &mdash; book yours now.</div>
     ${button(bookUrl, "Book my bed ›")}
     <div style="font-family:${FB};font-size:11px;color:${T.onNavy};margin-top:10px;">${esc(String(bookUrl).replace(/^https?:\/\//, ""))}</div>
    </td></tr>
   </table>

   <div style="font-family:${FH};font-size:9px;font-weight:700;letter-spacing:2.2px;color:${T.greenInk};margin-top:24px;">GOOD TO KNOW</div>
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
    ${FACTS.map(([t, x]) => `
    <tr><td style="padding:5px 0;font-family:${FB};font-size:13px;color:${T.body};line-height:1.6;">
     <span style="color:${T.green};font-weight:700;">&#9679;</span>&nbsp; <strong style="color:${T.navy};">${esc(t)}</strong> &mdash; ${esc(x)}
    </td></tr>`).join("")}
   </table>

   <div style="font-family:${FB};font-size:11.5px;color:${T.slate};line-height:1.6;margin-top:22px;border-top:1px solid ${T.border};padding-top:14px;">
    Not coming through Manila this time? Ignore this &mdash; the house will still be there next time. ${contactsLine(contacts)}
   </div>`, subject);

  const text = [
    `${d.eyebrow} — ${off ? day(off) : "soon"}`,
    `Time to rest, ${first}. Manila has a bed for you.`,
    "",
    `Contract done, bags packed, and the last thing you need is an airport chair. CIMS keeps a four-bed studio by NAIA, free for crew. Pick a bed, get your pass, walk in — no approval, no waiting.`,
    "",
    `Book my bed: ${bookUrl}`,
    "",
    ...FACTS.map(([t, x]) => `- ${t} — ${x}`),
    "",
    `${HOUSE.name}, ${HOUSE.line1}, ${HOUSE.line2}, ${HOUSE.line3}`,
    HOUSE.map,
    "",
    `Not coming through Manila this time? Ignore this — the house will still be there next time. ${contactsText(contacts)}`,
  ].join("\n");

  return { subject, html, text };
}
