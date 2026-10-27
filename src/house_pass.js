// ============================================================================
// CIMS — the staff-house pass, 3 days before sign-off (Miguel, 27 Oct 2026)
// ============================================================================
// The third email on the auto-timing rail (auto_send.js kind "house", window
// T-3, switch auto_send_house_enabled). The sender resolves the crew the way
// every other sender does — Rita's override email first, then TDG's — and mails
// house.signoff.keycard.v1 to the PERSONAL address, cc Rita, Miguel and
// Maryjoy, reply-to Rita. It writes nothing: auto_send_log is the only record,
// and it is written by the rail on a successful send only.
//
// Not sent: a redacted crew, a crew with no address (reported in the digest as
// "no_email" until one is added), a training visit (the rail skips those before
// this is called; checked again here for a manual caller), a seat with no
// sign-off date.
//
// USAGE (src/worker.js):
//   const _house = installHousePass({ sendViaMailer });
//   installAutoSend({ ..., sendHousePassFor: _house.sendHousePassFor })
// ============================================================================
import { houseKeyCardEmail, TEMPLATE_ID, HOUSE_CC, HOUSE_REPLY_TO, BOOK_URL } from "./emails/house.signoff.keycard.v1.js";
import { shipFullName, firstWord } from "./emails/hr.signoff.instructions.v2.js";

export function installHousePass(deps) {
  const { sendViaMailer } = deps;
  const today = () => (deps.today ? deps.today() : new Date().toISOString().slice(0, 10));

  async function resolveCrew(env, sc) {
    return env.DB.prepare(
      "SELECT c.first_name, c.last_name, COALESCE(NULLIF(o.email,''), c.email) AS email, c.redacted" +
      " FROM crew c LEFT JOIN crew_override o ON o.agency_id = c.agency_id WHERE c.agency_id = ?"
    ).bind(sc).first();
  }

  // Same contract as sendInstructionsFor / sendSignoffLinkFor: (env, sc, seq, origin, ovr) → { emailed, crew_name, to, error }.
  async function sendHousePassFor(env, sc, seq, origin, ovr) {
    const c = await resolveCrew(env, String(sc));
    if (!c) return { emailed: false, error: "crew_not_found" };
    const first = firstWord(c.first_name);
    const name = [first, c.last_name].filter(Boolean).join(" ").trim();
    if (c.redacted) return { emailed: false, error: "redacted", crew_name: name };
    if (!c.email) return { emailed: false, hasEmail: false, crew_name: name };
    const ctx = (ovr && ovr.ctx) || null;
    if (ctx && (ctx.visit || ctx.instruct === false)) return { emailed: false, error: "training_visit", crew_name: name, to: c.email };
    const off = ovr && (ovr.act_off || ovr.proj_off);
    if (!off) return { emailed: false, error: "no_signoff", crew_name: name, to: c.email };
    const ship = shipFullName((ovr && ovr.ship) || (ctx && ctx.ship) || "", ctx && ctx.brand);
    const m = houseKeyCardEmail({ name, first_name: first, ship, signoff_date: off, today: today(), bookUrl: deps.bookUrl || BOOK_URL });
    const out = await sendViaMailer(env, {
      templateId: TEMPLATE_ID,
      // One pass per seat: the mailer refuses a second copy for the same key even if two runs ever overlap.
      idempotencyKey: "house.signoff:" + sc + ":" + seq,
      to: [c.email], cc: HOUSE_CC, replyTo: HOUSE_REPLY_TO,
      subject: m.subject, html: m.html, text: m.text,
      critical: false,
    });
    if (!out || out.ok !== true) return { emailed: false, error: (out && out.error) || "not_sent", crew_name: name, to: c.email };
    return { emailed: true, crew_name: name, to: c.email, cc: HOUSE_CC };
  }

  return { sendHousePassFor };
}
