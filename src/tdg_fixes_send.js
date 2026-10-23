// "Email Joy · To correct in TDG" (Miguel approved the button on the operational dashboard, 13 Oct 2026; the render, 23 Oct
// 2026: "all approved"). One email to Joy with every row of the dashboard's "To correct in TDG" (ops_dashboard.js tdg.fixes),
// read off the board at the moment of the click, never typed: held (TDG still has them On board after the reliever signed on)
// and undated (On board, no embark date). The console never changes TDG and never sends a date it inferred.
// Rules: a dry run first (the page names the recipient before anything goes); the recipient is Deploy's (DEPLOY_TO, else
// TG_NOTIFY) and the copy Deploy's (DEPLOY_CC, Rita) — unset = refused, never a guess; the same set of rows is not sent twice
// within RESEND_DAYS unless the page confirms a resend (a changed set is a new email); every send is on activity_log.
import { tdgFixesEmail, TEMPLATE_ID } from "./emails/hr.keyman.tdg_fixes.v1.js";

export const RESEND_DAYS = 7;
export const ACTION = "tdg_fixes_email";
export const fixesKey = (fixes) => (fixes || []).map((f) => f.kind + ":" + f.sc + ":" + f.ship).sort().join("|");
const firstOf = (email) => { const w = String(email || "").split("@")[0].split(/[._]/)[0]; return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "Rita"; };

// deps: { ops(env) -> buildOps output, recipient(env), cc(env), send(env, envelope), log(env, email, action, detail),
//         recentSends(env, sinceIso) -> [{ detail, at }] (or the older lastSend(env) -> { detail, at } | null), now() -> ISO }
export async function tdgFixesSend(env, body, session, deps) {
  const ops = await deps.ops(env);
  const fixes = (ops && ops.tdg && ops.tdg.fixes) || [];
  const asOf = ops && ops.tdg && ops.tdg.advq ? ops.tdg.advq.at : null;
  const today = (ops && ops.today) || String(deps.now()).slice(0, 10);
  const to = deps.recipient(env);
  const cc = (deps.cc(env) || []).filter((a) => to && a.toLowerCase() !== String(to).toLowerCase());
  const key = fixesKey(fixes);
  // every send of the last RESEND_DAYS, not only the latest: A, then A+B, then A again is still "the same rows this week"
  const since = new Date(Date.parse(deps.now()) - RESEND_DAYS * 864e5).toISOString();
  const recent = ((deps.recentSends ? await deps.recentSends(env, since).catch(() => []) : [await deps.lastSend(env).catch(() => null)]) || []).filter(Boolean);
  const keyOf = (row) => { try { return row && row.detail ? JSON.parse(row.detail).key : null; } catch { return null; } };
  const inWindow = (row) => row.at && (Date.parse(deps.now()) - Date.parse(row.at)) < RESEND_DAYS * 864e5;
  const last = recent.slice().sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0] || null;
  const sameAsLast = recent.some((row) => inWindow(row) && keyOf(row) === key);
  const mail = tdgFixesEmail({ fixes, asOf, today, from: firstOf(session && session.email) });
  const out = { recipient: to, cc, count: fixes.length, subject: mail.subject, asOf, lastSent: last ? last.at : null, sameAsLast };
  if (!body || !body.send) return { ok: true, dryRun: true, ...out };
  if (!fixes.length) return { ok: false, error: "nothing_to_correct", ...out };
  if (!to) return { ok: false, error: "no_recipient", detail: "Set DEPLOY_TO (or TG_NOTIFY) on the Worker. The console will not guess who Joy is.", ...out };
  if (sameAsLast && !body.resend) return { ok: false, error: "already_sent", ...out };
  const res = await deps.send(env, { templateId: TEMPLATE_ID, to: [to], cc, replyTo: session && session.email ? session.email : undefined, subject: mail.subject, html: mail.html, text: mail.text, critical: true });
  if (!res || !res.ok) return { ok: false, error: "not_sent", detail: (res && res.error) || "mailer", ...out };
  await deps.log(env, session && session.email, ACTION, JSON.stringify({ key, to, n: fixes.length, asOf }));
  return { ok: true, sent: true, ...out };
}
