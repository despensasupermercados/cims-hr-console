// hr.audit.overdue.v1 — to the auditor only, when 24 hours pass and the documents are not all in. Says what is still
// missing, line by line (the gate's own list), and that the audit stays closed. Transactional, short.
import { frame, row, card, blk, esc, fmtWhen, T, FB } from "./audit_kit.js";

export const TEMPLATE_ID = "hr.audit.overdue.v1";

export function overdueEmail({ ship, crew, dueAt, missing = [], test = false }) {
  const subject = (test ? "[TEST] " : "") + "Printshop audit · " + ship + " · documents overdue";
  const head = ship + " is overdue.";
  const rows = row(card(`<div style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.2px;color:${T.slate};text-transform:uppercase;">Still missing</div>` +
    missing.map((m) => blk(`padding-top:6px;font-family:${FB};font-size:14px;color:${T.body};`, esc(m.say || m))).join(""), "red")) +
    row(`<div style="font-family:${FB};font-size:14px;color:${T.body};">The audit stays closed until everything is in. From the app: resend the request, or give 24 more hours.</div>`, "14px 32px 0");
  const html = frame({ preheader: head + " " + missing.length + " still missing.", eyebrow: "Printshop audit · overdue", date: ship, head, head2: "Due " + fmtWhen(dueAt) + ".",
    lead: esc(crew) + " has not sent everything yet.", rows, footer: "Printshop audit · audit.cims.work" });
  const text = head + " Due " + fmtWhen(dueAt) + ".\n\nStill missing:\n" + missing.map((m) => "- " + (m.say || m)).join("\n") + "\n\nThe audit stays closed until everything is in.";
  return { subject, html, text };
}
