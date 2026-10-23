// hr.audit.dispatch.v1 — the dispatch note to Rita (docs/AUDIT_DESIGN.md: "HR · TDG dispatch / arrival is feedback on
// the dispatch (travel, hotel, joining), not on the specialist ... reaches Rita; it stays out of the crew's evaluation";
// the mock-up's B7: "Dispatch note to Rita"). The crew's rating of how TDG got them aboard, asked by the auditor, and
// their own words when given. Only when a rating was given. Never in the audit's score, never to the crew.
// WIRED 23 Oct 2026 (Miguel signed off the render): sent by audit_request.js sendFiledMails when a rating was given.
import { frame, row, card, blk, esc, fmtWhen, fmtDate, T, FH, FB } from "./audit_kit.js";
import { visitWhen } from "./hr.audit.filed.v1.js";

export const TEMPLATE_ID = "hr.audit.dispatch.v1";
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";

export function dispatchEmail({ ship, crew, auditor, openedAt, filedAt, rating, note, signOn, link, test = false }) {
  const fn = first(crew) || "The crew", who = auditor || "Dexter";
  const low = rating <= 3;
  const subject = (test ? "[TEST] " : "") + "Dispatch feedback · " + crew + " · " + ship + " · " + rating + "/5";
  const head = fn + " rated the dispatch " + rating + " out of 5.";
  const head2 = low ? "Worth a look." : "No action needed.";
  const lead = esc(who) + " asked during the printshop audit on " + esc(ship) + ", " + esc(visitWhen(openedAt, filedAt)) + ": the travel, the hotel and the joining, as " + esc(fn) +
    " tells it. It is about TDG's dispatch, not about " + esc(fn) + ", and it is not in the audit's score.";
  // the scale, five squares, the given one filled: the number is read at a glance, the words below it carry the why
  const sq = (n) => { const on = n === rating, col = low ? T.red : T.greenInk; return `<td width="44" height="44" align="center" valign="middle" bgcolor="${on ? col : "#FFFFFF"}" style="background:${on ? col : "#FFFFFF"};border-radius:10px;font-family:${FH};font-size:18px;font-weight:700;color:${on ? "#FFFFFF" : T.grey};">${n}</td><td width="8" style="font-size:0;line-height:0;">&nbsp;</td>`; };
  const scale = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${[1, 2, 3, 4, 5].map(sq).join("")}</tr></table>`;
  const anchors = blk(`padding-top:6px;font-family:${FB};font-size:12px;color:${T.slate};`, "1 · it went badly &nbsp;&nbsp;·&nbsp;&nbsp; 5 · it went smoothly");
  const words = note ? blk(`padding-top:16px;font-family:${FB};font-size:12px;color:${T.slate};`, "In " + esc(fn) + "'s words") + blk(`padding-top:4px;font-family:${FB};font-size:15px;color:${T.body};line-height:1.5;`, "“" + esc(note) + "”")
    : blk(`padding-top:16px;font-family:${FB};font-size:14px;color:${T.slate};`, "No words recorded beside the rating.");
  const rows = [
    test ? row(card(`<div style="font-family:${FB};font-size:13px;color:${T.amberInk};font-weight:700;">TEST MODE · sent to you only.</div>`)) : "",
    row(card(`${blk(`padding-bottom:10px;font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1px;color:${T.slate};text-transform:uppercase;`, "Dispatch and arrival")}${scale}${anchors}${words}`), "22px 32px 0"),
    signOn ? row(blk(`font-family:${FB};font-size:14px;color:${T.body};`, esc(fn) + " signed on " + esc(ship) + " on " + esc(fmtDate(signOn)) + "."), "16px 32px 0") : "",
    link ? row(blk(`font-family:${FB};font-size:13px;color:${T.slate};`, `The whole audit: <a href="${esc(link)}" target="_blank" style="color:${T.navy};font-weight:700;">${esc(link)}</a>`), "16px 32px 0") : "",
  ].join("");
  const footer = "From the audit filed by " + esc(who) + " " + esc(fmtWhen(filedAt)) + " · sent to Rita only · the rating is kept with the visit and never enters the score · never sent to the crew.";
  const html = frame({ preheader: head + " " + head2, eyebrow: "Dispatch feedback", date: ship, head, head2, lead, rows, footer });
  const text = [head + " " + head2, who + " asked during the printshop audit on " + ship + ", " + visitWhen(openedAt, filedAt) + ". It is about TDG's dispatch, not about " + fn + ", and it is not in the audit's score.",
    note ? "In " + fn + "'s words: " + note : "No words recorded beside the rating.", link ? "The whole audit: " + link : ""].filter(Boolean).join("\n\n");
  return { subject, html, text };
}
