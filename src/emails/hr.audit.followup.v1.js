// hr.audit.followup.v1 — to a follow-up's owner on its date. Miguel, 20 Oct 2026, asked "Should the owner of a follow-up
// get an email on its due date? If yes, the rendered email comes to you first": "yes to all on the 5th point".
// A follow-up is asked in the audit's last step (what, the owner, by when) and closed once: its owner marks it done on
// the Follow-ups page with a line on what was done, or Dexter ticks it Fixed at the next audit. Then the emails stop.
// One email per owner per day: what falls due that day, and under it what is still open past its date, so an owner
// with three items due on one day gets one email, not three. To the owner only, never to the crew.
// WIRED 23 Oct 2026 (Miguel signed off the render): the hourly sweep sends it (audit_request.js sendFollowups), 07:00 Miami.
import { frame, row, card, blk, esc, fmtDate, pill, T, FH, FB } from "./audit_kit.js";
import { ordinal } from "../audit_steps.js";

export const TEMPLATE_ID = "hr.audit.followup.v1";
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const sentence = (s) => { const t = String(s || "").trim(); return /[.!?]$/.test(t) ? t : t + "."; };
const cut = (s, n) => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const andList = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
// a name never breaks across two lines ("Leo / M.")
const nb = (s) => esc(s).replace(/ /g, "&nbsp;");
const uniq = (a) => a.filter((x, i) => x && a.indexOf(x) === i);

// One follow-up: the ship (and "2nd time" when the last audit asked it too), what was asked, who asked it and when, who
// was aboard then and, when it changed, who is aboard now. A late one says its date in red.
function itemBlock(f, late, noTitle) {
  // the ship as a white chip: the neutral pill is the card's own grey and vanished into it
  const shipChip = `<span style="display:inline-block;font-family:${FB};font-size:12px;font-weight:700;padding:6px 11px;border-radius:999px;background:#FFFFFF;color:${T.navy};white-space:nowrap;">${esc(f.ship)}</span>`;
  const chips = shipChip + (f.carried ? "&nbsp;" + pill(ordinal(f.carried + 1) + " time", "amber") : "") + (late && f.due ? "&nbsp;" + pill("Past " + fmtDate(f.due).replace(/, \d{4}$/, ""), "red") : "");
  const asked = "Asked by " + esc(f.askedBy || "Dexter") + " at the audit on " + esc(fmtDate(f.askedAt)) + (f.crew ? " · " + nb(f.crew) + " was aboard" : "");
  const now = f.aboardNow && f.aboardNow !== f.crew ? " · " + nb(f.aboardNow) + " is aboard now" : "";
  return blk("padding-bottom:8px;", chips) +
    (noTitle ? "" : blk(`font-family:${FH};font-size:18px;font-weight:600;color:${T.navy};line-height:1.3;`, esc(sentence(f.text)))) +
    blk(`padding-top:6px;font-family:${FB};font-size:13px;color:${T.slate};line-height:1.5;`, asked + now);
}
// between two follow-ups a hairline with air on both sides (the gap is a cell's padding: Word drops a div's margin)
// A single follow-up due today is the headline already, so its card carries the rest and not the words twice.
const divided = (items, late, noTitle) => items.map((f, i) => (i ? blk("padding-top:16px;font-size:0;line-height:0;", "&nbsp;") + blk(`padding-top:16px;border-top:1px solid ${T.border};`, itemBlock(f, late)) : itemBlock(f, late, noTitle))).join("");

export function followupEmail({ owner, due = [], late = [], link, test = false }) {
  const fn = first(owner) || "Hello";
  const ships = uniq(due.map((f) => f.ship));
  const one = due.length === 1 ? due[0] : null;
  const subject = (test ? "[TEST] " : "") + (one ? "Due today · " + one.ship + " · " + cut(one.text, 60) : due.length + " follow-ups due today · " + andList(ships));
  const head = one ? cut(sentence(one.text), 90) : due.length + " follow-ups are due today.";
  const head2 = one ? "Due today." : andList(ships) + ".";
  const lead = esc(fn) + ", " + (one ? "this was asked of you at a printshop audit and its date is today. When it is done, mark it on the Follow-ups page"
    : "these were asked of you at printshop audits and their date is today. Mark each one on the Follow-ups page once it is done") + ", with a line on what was done.";
  const button = link ? row(`${blk("", `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${T.navy}" style="background:${T.navy};border-radius:12px;padding:14px 26px;"><a href="${esc(link)}" target="_blank" style="display:inline-block;font-family:${FH};font-size:16px;font-weight:600;line-height:1.2;color:#FFFFFF;text-decoration:none;">Open the follow-ups</a></td></tr></table>`)}${blk(`padding-top:8px;font-family:${FB};font-size:12px;color:${T.slate};`, esc(link))}`, "24px 32px 0") : "";
  const rows = [
    test ? row(card(`<div style="font-family:${FB};font-size:13px;color:${T.amberInk};font-weight:700;">TEST MODE · sent to you only.</div>`)) : "",
    row(card(blk(`padding-bottom:12px;font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1px;color:${T.slate};text-transform:uppercase;`, "Due today") + divided(due, false, !!one), "amber"), "22px 32px 0"),
    late.length ? row(card(blk(`padding-bottom:12px;font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1px;color:${T.slate};text-transform:uppercase;`, "Still open past their date · " + late.length) + divided(late, true), "red"), "16px 32px 0") : "",
    button,
  ].join("");
  const footer = "Printshop Ops Audit · audit.cims.work · sent to the owner on a follow-up's date, never to the crew · it stops once the follow-up is marked done, or ticked Fixed at the next audit.";
  const html = frame({ preheader: head + " " + head2 + (late.length ? " " + late.length + " still open past their date." : ""), eyebrow: "Follow-up", date: one ? one.ship : ships.length + (ships.length === 1 ? " ship" : " ships"), head, head2, lead, rows, footer });
  const line = (f, l) => "- " + f.ship + (f.carried ? " (" + ordinal(f.carried + 1) + " time)" : "") + (l && f.due ? " · past " + fmtDate(f.due) : "") + ": " + sentence(f.text) + " Asked by " + (f.askedBy || "Dexter") + " at the audit on " + fmtDate(f.askedAt) + (f.crew ? ", " + f.crew + " aboard" : "") + ".";
  const text = [head + " " + head2, fn + ", " + (one ? "this was asked of you at a printshop audit. When it is done, mark it" : "these were asked of you at printshop audits. Mark each one once it is done") + " on the Follow-ups page, with a line on what was done.",
    "Due today:\n" + due.map((f) => line(f, false)).join("\n"),
    late.length ? "Still open past their date:\n" + late.map((f) => line(f, true)).join("\n") : "",
    link ? "Open the follow-ups: " + link : ""].filter(Boolean).join("\n\n");
  return { subject, html, text };
}
