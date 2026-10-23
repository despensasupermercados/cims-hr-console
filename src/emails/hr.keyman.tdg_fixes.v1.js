// hr.keyman.tdg_fixes.v1 — "Email Joy · all four" (Miguel approved the button on the operational dashboard, 13 Oct 2026;
// render asked for 23 Oct 2026: "the dashboard, email Joy, all four: show me the renders"). ONE email to Joy with every row
// of the dashboard's "To correct in TDG" (ops_dashboard.js tdg.fixes), read off the board, never typed:
//   - held: TDG's file still has the seafarer On board a hull after the reliever signed on (CLAUDE.md §10d, HELD);
//   - undated: On board in TDG's file with no embark date, so the board cannot date the seat.
// The console never changes TDG and never asks Joy to change a date it inferred: it says what the file shows and what the
// board knows, and the next AdvancedQuery closes each row. CIMS email standard §9 (a report: the answer in the first line,
// one card per item). NOT WIRED TO SEND (23 Oct 2026): an email ships only after Miguel signs off its render (§5).
import { frame, row, card, blk, pill, esc, fmtDate, T, FH, FB } from "./audit_kit.js";
import { shipFullName } from "./hr.signoff.instructions.v2.js";

export const TEMPLATE_ID = "hr.keyman.tdg_fixes.v1";
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const short = (d) => (fmtDate(d) || "").replace(/, \d{4}$/, "");

// fixes: [{ kind: "held" | "undated", name, surname, ship, brand, code, off, by, byName, byOn }]; asOf = the file's date
export function tdgFixesEmail({ fixes = [], asOf, today, from = "Rita", test = false }) {
  const held = fixes.filter((f) => f.kind === "held"), undated = fixes.filter((f) => f.kind === "undated");
  const n = fixes.length;
  const subject = (test ? "[TEST] " : "") + "To correct in TDG · " + n + (n === 1 ? " seafarer" : " seafarers") + (asOf ? " · file of " + short(asOf) : "");
  // Phone first (Miguel, 23 Oct 2026, on the render: "the mobile version needs work"): a headline that fits two lines at
  // 375px, stat labels of two words, the pill ABOVE the name (a long name never shares its line), the note in two short lines.
  const head = (n === 1 ? "One" : n) + " to correct in TDG.";
  const head2 = "The next file closes " + (n === 1 ? "it." : "them.");
  const lead = "Joy, on these rows TDG's AdvancedQuery" + (asOf ? " of " + esc(short(asOf)) : "") + " still says what the ships have moved past. Nothing changes on our side until TDG's file does.";
  const stats = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${statCell(held.length, "Still on board", "red")}${statCell(undated.length, "No embark date", "amber")}${statCell(n, "In all", "")}</tr></table>`;
  const item = (f) => {
    const ship = shipFullName(f.ship, f.brand) || f.ship;
    const tone = f.kind === "held" ? "red" : "amber";
    const top = blk("", f.kind === "held" ? pill("Still On board", "red") : pill("No embark date", "amber"))
      + blk(`padding-top:10px;font-family:${FH};font-size:22px;font-weight:600;color:${T.navy};line-height:1.2;`, `<span class="nm">${esc(f.name || f.surname)}</span>`);
    const id = blk(`padding-top:4px;font-family:${FB};font-size:13px;color:${T.slate};`, esc(ship) + (f.code ? " · " + esc(f.code) : ""));
    const said = f.kind === "held"
      ? "TDG: On board, no debark date. " + (f.byName ? esc(f.byName) + " signed on" + (f.byOn ? " " + esc(short(f.byOn)) : "") + " as the reliever." : "The sign-off the board has" + (f.off ? ", " + esc(short(f.off)) + "," : "") + " has passed.")
      : "TDG: On board, no embark date. The board cannot date the contract.";
    const ask = f.kind === "held" ? "Please enter " + esc(first(f.name)) + "'s debark date." : "Please enter " + esc(first(f.name)) + "'s embark date.";
    return card(top + id + blk(`padding-top:12px;font-family:${FB};font-size:14px;color:${T.body};line-height:1.5;`, said + "<br><b style=\"color:" + T.navy + ";\">" + ask + "</b>"), tone);
  };
  const rows = [
    test ? row(card(`<div style="font-family:${FB};font-size:13px;color:${T.amberInk};font-weight:700;">TEST MODE · sent to you only.</div>`)) : "",
    row(stats, "24px 32px 0"),
    ...fixes.map((f, i) => row(item(f), i ? "12px 32px 0" : "20px 32px 0")),
    row(blk(`font-family:${FB};font-size:14px;color:${T.body};line-height:1.5;`, "Questions on any of them, reply to this email. " + esc(from) + "."), "20px 32px 0"),
  ].join("");
  const footer = "CIMS HR console · from the Keyman board's “To correct in TDG” list" + (today ? " on " + esc(fmtDate(today)) : "") + " · the console never changes TDG; your next file does.";
  const html = frame({ preheader: head + " " + head2, eyebrow: "To correct in TDG", date: asOf ? "File of " + short(asOf) : "", head, head2, lead, rows, footer });
  const line = (f) => "- " + (f.name || f.surname) + " · " + (shipFullName(f.ship, f.brand) || f.ship) + ": " + (f.kind === "held"
    ? "still On board in TDG; " + (f.byName ? f.byName + " signed on" + (f.byOn ? " " + fmtDate(f.byOn) : "") + " as the reliever" : "the sign-off the board has" + (f.off ? " (" + fmtDate(f.off) + ")" : "") + " has passed") + ". Please enter the debark date."
    : "On board with no embark date. Please enter " + first(f.name) + "'s embark date.");
  const text = [head + " " + head2, "Joy, on these rows TDG's AdvancedQuery" + (asOf ? " of " + fmtDate(asOf) : "") + " still says what the ships have moved past.", fixes.map(line).join("\n"), "Questions on any of them, reply to this email. " + from + "."].join("\n\n");
  return { subject, html, text };
}

function statCell(nv, label, tone) {
  const col = tone === "red" ? T.red : tone === "amber" ? T.amber : T.green;
  return `<td width="33%" valign="top" style="padding:0 8px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="3" bgcolor="${col}" style="background:${col};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:10px 0 0;font-family:${FH};font-size:30px;font-weight:700;color:${T.navy};line-height:1.1;">${esc(nv)}</td></tr><tr><td style="font-family:${FB};font-size:12px;color:${T.slate};padding-top:2px;">${esc(label)}</td></tr></table></td>`;
}
