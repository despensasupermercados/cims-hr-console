// hr.audit.request.v1 — the request to the seafarer (A4 of the approved mock-up). To the ship's printshop mailbox, a copy
// to his personal address (Miguel, 14 Oct 2026: "use the ship email and his personal email .. display the ship email
// only .. his personal email gets a copy"). Three things to upload, how to print each, the deadline, ONE address.
// The address is PLAIN TEXT, never a hyperlink: RCCL's Mimecast rewrites inbound links and the crew landed on its page
// (HON CLAUDE.md, "The crew read it back"). The same template carries the 12-hour reminder (`reminder: true`).
import { frame, row, card, esc, fmtWhen, T, FH, FB, FM } from "./audit_kit.js";

export const TEMPLATE_ID = "hr.audit.request.v1";
export const REMINDER_ID = "hr.audit.reminder.v1";

export function auditRequestEmail({ first, ship, auditor, dueAt, link, machines = [], lines = 0, reminder = false, test = false, today }) {
  const who = first || "there";
  const n = machines.length;
  const subject = (test ? "[TEST] " : "") + (reminder ? "Reminder · " : "") + "Printshop audit · " + ship + " · upload by " + fmtWhen(dueAt);
  const pre = (reminder ? "Still open: " : "") + "Pattern 43, the Machine Management List and a blind count, by " + fmtWhen(dueAt) + ".";
  const steps = [
    ["Pattern 43", n ? "One per machine (" + n + ")" : "One per machine", "Print Pattern 43 on the machine. Scan all 12 pages as ONE PDF. Upload it under that machine."],
    ["Machine Management List", n ? "One per machine (" + n + ")" : "One per machine", "Print the MACHINE Management List (the long report with the life %), not the User Management List. Scan it as one PDF. Upload."],
    ["Inventory count", lines ? lines + " lines" : "Every line", "Count the shelf. Type the total for every line, 0 included. Add anything that is not on the list."],
  ];
  const stepRows = steps.map(([name, sub, how], i) => `<tr><td valign="top" width="34" style="padding:12px 0;border-top:${i ? "1px solid " + T.border : "0"};"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="26" height="26" align="center" valign="middle" bgcolor="${T.navy}" style="background:${T.navy};border-radius:13px;font-family:${FH};font-size:13px;font-weight:700;color:#FFFFFF;">${i + 1}</td></tr></table></td>
<td valign="top" style="padding:12px 0 12px 8px;border-top:${i ? "1px solid " + T.border : "0"};font-family:${FB};"><div style="font-family:${FH};font-size:17px;font-weight:600;color:${T.navy};">${esc(name)} <span style="font-family:${FB};font-size:12px;font-weight:500;color:${T.slate};">· ${esc(sub)}</span></div><div style="font-size:14px;color:${T.body};line-height:1.45;padding-top:3px;">${esc(how)}</div></td></tr>`).join("");
  const rows = [
    test ? row(card(`<div style="font-family:${FB};font-size:13px;color:${T.amber};font-weight:700;">TEST MODE · this went to you, not to the ship. Nobody aboard has seen it.</div>`, "amber")) : "",
    row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepRows}</table>`),
    row(card(`<div style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.2px;color:${T.slate};text-transform:uppercase;">Your upload page · copy it into the browser</div>
<div style="font-family:${FM};font-size:15px;color:${T.navy};padding-top:8px;word-break:break-all;">${esc(link)}</div>
<div style="font-family:${FB};font-size:13px;color:${T.slate};padding-top:8px;">Works on the ship's PC or your phone. It saves as you go.</div>`)),
    row(`<div style="font-family:${FB};font-size:14px;color:${T.body};line-height:1.5;"><b style="color:${T.navy};">A machine will not print?</b> Mark it down on the page and write why. That machine needs nothing else.</div>`),
    row(`<div style="font-family:${FB};font-size:14px;color:${T.body};line-height:1.5;">The audit starts only when everything is in.</div>`, "14px 32px 0"),
  ].join("");
  const html = frame({
    preheader: pre, eyebrow: reminder ? "Printshop audit · reminder" : "Printshop audit", date: ship,
    head: reminder ? "Still open, " + who + "." : "Hi " + who + ", " + (auditor || "Dexter") + " is auditing " + ship + ".",
    head2: "Upload by " + fmtWhen(dueAt) + ".",
    lead: "Three things, about twenty minutes. Before " + esc(auditor || "Dexter") + " starts, the console reads what you send.",
    rows, footer: "Sent by CIMS on behalf of " + esc(auditor || "Dexter Lawrence") + " · Printshop audit · audit.cims.work",
  });
  const text = [
    (test ? "[TEST - this went to you, not to the ship]\n\n" : "") + "Hi " + who + ",",
    (auditor || "Dexter") + " is auditing " + ship + ". Upload these by " + fmtWhen(dueAt) + ":",
    ...steps.map(([n2, s, h], i) => (i + 1) + ". " + n2 + " (" + s + "): " + h),
    "Your upload page: " + link,
    "A machine will not print? Mark it down on the page and write why.",
    "The audit starts only when everything is in.",
  ].join("\n\n");
  return { subject, html, text };
}
