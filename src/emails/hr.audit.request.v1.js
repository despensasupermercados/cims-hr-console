// hr.audit.request.v1 — the request to the seafarer (A4 of the approved mock-up). To the ship's printshop mailbox, a copy
// to his personal address (Miguel, 14 Oct 2026: "use the ship email and his personal email .. display the ship email
// only .. his personal email gets a copy"). Three things to upload, how to print each, the deadline, ONE address.
// A BUTTON, and under it the same address as PLAIN TEXT (Miguel, 14 Oct 2026: "why u put a link here and not a button??").
// The button is the one-tap way in (his personal copy, any filter that lets it through). The plain-text address stays:
// RCCL's Mimecast rewrites inbound links and the crew landed on its page (HON CLAUDE.md, "The crew read it back"), and
// a typed address is the way in that no gateway can rewrite. The same template carries the 12-hour reminder (`reminder: true`).
import { frame, row, card, blk, esc, fmtWhen, T, FH, FB, FM } from "./audit_kit.js";

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
<td valign="top" style="padding:12px 0 12px 8px;border-top:${i ? "1px solid " + T.border : "0"};font-family:${FB};"><div style="font-family:${FH};font-size:17px;font-weight:600;color:${T.navy};">${esc(name)}</div>${blk(`padding-top:1px;font-family:${FB};font-size:12px;font-weight:600;color:${T.slate};`, esc(sub))}${blk(`padding-top:3px;font-family:${FB};font-size:14px;color:${T.body};line-height:1.45;`, esc(how))}</td></tr>`).join("");
  const by = (auditor || "Dexter").split(" ")[0];
  // The two facts he acts on sit together, first: when, and where. A navy card so it reads as the one thing to keep.
  // Word (Outlook desktop) keeps only table-cell padding: every gap below is a cell and the button's shape is its cell's
  // padding. The typed address stays plain text (no gateway can rewrite it) on a light inset: Outlook auto-links a URL in
  // its own blue, which vanished on navy (Pursuit, 16 Oct 2026) and reads on the light box.
  const key = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.deep}" style="background:${T.deep};border-radius:16px;"><tr><td style="padding:20px 22px;">
${blk(`font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.2px;color:#9FB3C8;text-transform:uppercase;`, "Upload by")}
${blk(`padding-top:4px;font-family:${FH};font-size:26px;font-weight:600;color:#FFFFFF;line-height:1.15;`, esc(fmtWhen(dueAt)))}
${blk("padding-top:18px;", `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${T.greenInk}" style="background:${T.greenInk};border-radius:12px;padding:14px 26px;"><a href="${esc(link)}" target="_blank" style="display:inline-block;font-family:${FH};font-size:16px;font-weight:600;line-height:1.2;color:#FFFFFF;text-decoration:none;">Open my upload page</a></td></tr></table>`)}
${blk(`padding-top:16px;font-family:${FB};font-size:13px;color:#C9D5E2;line-height:1.45;`, "Button blocked by the ship's mail filter? Type this address in the browser:")}
${blk("padding-top:8px;", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${T.cloud}" style="background:${T.cloud};border-radius:8px;padding:10px 12px;font-family:${FM};font-size:13px;color:${T.navy};word-break:break-all;">${esc(link)}</td></tr></table>`)}
${blk(`padding-top:10px;font-family:${FB};font-size:13px;color:#C9D5E2;`, "The ship's PC or your phone. It saves as you go.")}</td></tr></table>`;
  const rows = [
    test ? row(card(`<div style="font-family:${FB};font-size:13px;color:${T.amberInk};font-weight:700;">TEST MODE · this went to you, not to the ship. Nobody aboard has seen it.</div>`, "amber")) : "",
    row(key),
    row(`${blk(`padding-bottom:2px;font-family:${FH};font-size:18px;font-weight:600;color:${T.navy};`, "What to upload")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepRows}</table>`, "26px 32px 0"),
    row(card(`<div style="font-family:${FB};font-size:14px;color:${T.body};line-height:1.5;"><b style="color:${T.navy};">A machine will not print?</b> Mark it down on the page and write why. That machine needs nothing else.</div>`)),
    row(`<div style="font-family:${FB};font-size:14px;color:${T.body};line-height:1.5;">The audit starts only when everything is in.</div>`, "16px 32px 0"),
  ].join("");
  const html = frame({
    preheader: pre, eyebrow: reminder ? "Printshop audit · reminder" : "Printshop audit", date: ship,
    head: reminder ? "Still open, " + who + "." : by + " is auditing " + ship + ".",
    lead: reminder ? "Some of it is not in yet. The page shows what is left." : "Hi " + esc(who) + ". Before the visit, upload three things. About twenty minutes.",
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
