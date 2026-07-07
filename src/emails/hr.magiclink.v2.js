// hr.magiclink.v2 — passwordless sign-in link for the CIMS HR Console.
// House-brand rebuild of v1 (which was a bare <p> link). Per CIMS Email
// Convention §1–2: one function, (data) => { subject, html, text }, built
// from the app's local cims-brand.js. v-bumped from v1 (breaking content).
import {
  NAVY, GREEN, DGREEN, INK, GRAY, PANEL, LINE, BODY_BG,
  FF, FH, FM, header, footer, esc,
} from "./cims-brand.js";

export const TEMPLATE_ID = "hr.magiclink.v2";

export function magicLinkEmail({ link, expiryMinutes = 15 } = {}) {
  const safeLink = esc(link);
  const mins = Number(expiryMinutes) || 15;
  const subject = "Your CIMS Console sign-in link";

  const html =
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only">` +
    `<title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${BODY_BG};">` +
    `<div style="display:none;max-height:0;overflow:hidden;">Your one-time sign-in link for the CIMS HR Console. Expires in ${mins} minutes.</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BODY_BG};"><tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;">` +
    header("HR Console") +
    `<tr><td style="padding:30px 30px 4px;">` +
      `<div style="${FH}font-size:21px;font-weight:700;color:${INK};">Sign in to the console</div>` +
      `<p style="${FF}font-size:14px;line-height:1.6;color:${GRAY};margin:12px 0 0;">You requested a sign-in link. Use the button below to sign in &mdash; no password needed.</p>` +
    `</td></tr>` +
    `<tr><td style="padding:22px 30px 6px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
        `<td align="center" bgcolor="${DGREEN}" style="border-radius:6px;">` +
          `<a href="${safeLink}" style="display:block;padding:14px 0;${FF}font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">Sign in to the console</a>` +
        `</td>` +
      `</tr></table>` +
    `</td></tr>` +
    `<tr><td style="padding:8px 30px 0;"><div style="${FM}font-size:12px;color:${GRAY};">&#9201; Expires in ${mins} minutes &middot; works once</div></td></tr>` +
    `<tr><td style="padding:18px 30px 0;">` +
      `<div style="${FF}font-size:13px;color:${GRAY};margin-bottom:8px;">Button not working? Copy this link:</div>` +
      `<div style="background:${PANEL};border:1px solid ${LINE};border-radius:6px;padding:11px 13px;">` +
        `<a href="${safeLink}" style="${FM}font-size:12px;color:${DGREEN};word-break:break-all;text-decoration:none;">${safeLink}</a>` +
      `</div>` +
    `</td></tr>` +
    `<tr><td style="padding:18px 30px 4px;"><p style="${FF}font-size:13px;line-height:1.6;color:${GRAY};margin:0;">Didn&rsquo;t request this? You can safely ignore this email &mdash; no one can sign in without the link, and it expires shortly.</p></td></tr>` +
    footer([
      "DG3 &middot; Cruise Industry Managed Services &middot; cims.work",
      "Automated security message &mdash; please don&rsquo;t forward it, the link signs in as you.",
    ]) +
    `</table></td></tr></table></body></html>`;

  const text = [
    "CIMS HR Console — sign in",
    "",
    "You requested a sign-in link. Open the link below to sign in — no password needed.",
    "",
    link,
    "",
    "This link expires in " + mins + " minutes and works once.",
    "",
    "Didn't request this? You can safely ignore this email — no one can sign in without the link.",
    "",
    "DG3 · Cruise Industry Managed Services · cims.work",
  ].join("\n");

  return { subject, html, text };
}
