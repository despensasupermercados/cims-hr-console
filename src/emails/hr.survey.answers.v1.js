// THE CREW SURVEY: HIS COPY OF THE ANSWERS (Miguel, 22 Oct 2026: "the reply will be for his personal email and cc
// onboardsupport@DG3.com"; the render approved 23 Oct 2026; on 23 Oct he took back the "Rita answers within a week"
// line: "make them generic all of them .. I don't want anything standing or pending" — no reply is promised). Pure: (data) => { subject, html, text }. Sent the moment he presses Send. Every answer is his own number in its
// statement's words; the colours read 4–5 green, 3 amber, 1–2 red. Canonical letterhead. Pinned by test/crew_survey.test.js.
import { mastRows } from "../cims-mast.js";
import { QUESTIONS, SECTIONS, FIX_QUESTION, statementFor, isNothing } from "../crew_survey.js";
import { esc } from "./hr.survey.invite.v1.js";

const C = { navy: "#1B3A5C", green: "#5FB946", gink: "#3E7F2E", slate: "#6B7280", cloud: "#F3F4F6", border: "#E5E7EB", body: "#374151", grey: "#9CA3AF", line: "#F0F1F3" };
const FB = "'DM Sans',Helvetica,Arial,sans-serif", FH = "'Outfit',Helvetica,Arial,sans-serif";
const PILL = { g: ["#EAF5E4", "#3E7F2E"], a: ["#F6EEE1", "#B7791F"], r: ["#F4E5E3", "#96281B"] };
const tone = (v) => (v >= 4 ? "g" : v === 3 ? "a" : "r");

// d: { first, ship, brand, when, answers: {q01..q19}, fix }
export function surveyAnswersEmail(d) {
  const first = esc(d.first || "there"), byKey = Object.fromEntries(QUESTIONS.map((q) => [q.key, q]));
  const fives = QUESTIONS.filter((q) => d.answers[q.key] === 5).length;
  let rows = "";
  for (const s of SECTIONS) {
    rows += `<tr><td colspan="2" style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:1.3px;color:${C.grey};padding:16px 0 2px;">${esc(s.title.toUpperCase())}</td></tr>`;
    for (const k of s.keys) {
      const v = d.answers[k], [bg, fg] = PILL[tone(v)];
      rows += `<tr><td style="font-family:${FB};font-size:14px;line-height:1.45;color:${C.body};padding:9px 12px 9px 0;border-bottom:1px solid ${C.line};">${esc(statementFor(byKey[k], d.brand))}</td>`
        + `<td width="44" align="right" valign="top" style="padding:9px 0;"><span style="display:inline-block;font-family:${FH};font-size:14px;font-weight:700;color:${fg};background:${bg};border-radius:999px;padding:3px 11px;">${v}</span></td></tr>`;
    }
  }
  const said = !isNothing(d.fix);
  const fixBox = `<tr><td class="px" style="padding:22px 32px 0;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cloud}" style="background:${C.cloud};border-radius:16px;"><tr><td style="padding:20px;">
  <div style="font-family:${FB};font-size:11px;font-weight:700;letter-spacing:1.4px;color:${C.grey};">THE ONE THING TO FIX FIRST</div>
  ${said ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr><td width="3" bgcolor="${C.green}" style="background:${C.green};width:3px;">&nbsp;</td>
   <td style="padding:2px 0 2px 12px;font-family:${FH};font-size:20px;font-weight:600;line-height:1.35;color:${C.navy};">&ldquo;${esc(d.fix)}&rdquo;</td></tr></table>
  <div style="font-family:${FB};font-size:13.5px;line-height:1.55;color:${C.slate};margin-top:12px;">Thank you for telling us. The whole CIMS team sees it.</div>`
    : `<div style="font-family:${FB};font-size:14.5px;line-height:1.55;color:${C.body};margin-top:10px;">${d.fix ? "&ldquo;" + esc(d.fix) + "&rdquo; Thank you, that is good to hear." : "You left this one blank. If something comes to mind, reply to this email."}</div>`}
 </td></tr></table></td></tr>`;
  const subject = `Your answers, ${d.first || "there"}. Thank you.`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title>
<style>@media (max-width:480px){.hl{font-size:30px !important}.px{padding-left:20px !important;padding-right:20px !important}}</style></head>
<body style="margin:0;padding:0;background:#EEF0EC;">
<div style="display:none;max-height:0;overflow:hidden;">Thank you, ${first}. Your answers, and the one thing you asked us to fix.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EEF0EC" style="background:#EEF0EC;"><tr><td align="center" style="padding:0 0 32px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;max-width:600px;width:100%;">
${mastRows()}
<tr><td class="px" style="padding:28px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
 <td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.gink};">CREW SURVEY · RECEIVED</td>
 <td align="right" style="font-family:${FB};font-size:13px;color:${C.slate};">${esc(d.when)}</td></tr></table></td></tr>
<tr><td class="px" style="padding:14px 32px 0;">
 <div class="hl" style="font-family:${FH};font-size:36px;font-weight:600;letter-spacing:-0.6px;line-height:1.1;color:${C.navy};">Thank you, ${first}.<br><span style="color:${C.grey};">Here is what you told us.</span></div>
 <div style="font-family:${FB};font-size:15px;line-height:1.6;color:${C.body};margin-top:14px;">Your answers on ${esc(d.ship || "your contract")} are with the CIMS team. This copy is yours to keep, and Onboard Support has it too, so you can reply to this email any time.</div></td></tr>
${fixBox}
<tr><td class="px" style="padding:22px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
 <tr><td style="font-family:${FB};font-size:12px;font-weight:700;letter-spacing:1.4px;color:${C.gink};border-bottom:1px solid ${C.border};padding-bottom:8px;">YOUR ANSWERS</td>
  <td align="right" style="font-family:${FB};font-size:12px;color:${C.slate};border-bottom:1px solid ${C.border};padding-bottom:8px;white-space:nowrap;">${fives} of ${QUESTIONS.length} at 5</td></tr>
 ${rows}</table></td></tr>
<tr><td class="px" style="padding:24px 32px 28px;">
 <div style="font-family:${FB};font-size:15px;line-height:1.6;color:${C.body};">Something you did not get to say? Reply to this email. It reaches Rita and Onboard Support.</div>
 <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
  <td width="3" bgcolor="${C.green}" style="background:${C.green};width:3px;">&nbsp;</td>
  <td style="padding:2px 0 2px 12px;font-family:${FB};font-size:13px;line-height:1.6;color:${C.slate};"><b style="color:${C.navy};font-size:14px;">Rita Berenyi</b><br>Manager, People &amp; Culture<br>Rita.Berenyi@dg3.com · DG3 Diversified Global Graphics Group</td></tr></table></td></tr>
<tr><td bgcolor="${C.cloud}" style="background:${C.cloud};padding:16px 32px;font-family:${FB};font-size:11.5px;line-height:1.6;color:${C.slate};">Sent by CIMS on behalf of DG3 Cruise Industry Managed Services to ${first}. Your answers stay with CIMS: never sent to the cruise line, never part of your bonus.</td></tr>
</table></td></tr></table></body></html>`;
  const lines = [];
  for (const s of SECTIONS) { lines.push("", s.title.toUpperCase()); for (const k of s.keys) lines.push(`${d.answers[k]}  ${statementFor(byKey[k], d.brand)}`); }
  const text = [`Thank you, ${d.first || "there"}. Here is what you told us.`, "",
    `Your answers on ${d.ship || "your contract"} are with the CIMS team. Onboard Support has this copy too: reply any time.`, "",
    FIX_QUESTION, d.fix ? `"${d.fix}"` : "(left blank)", ...lines, "", "Rita Berenyi, Manager, People & Culture, Rita.Berenyi@dg3.com"].join("\n");
  return { subject, html, text };
}
