// ============================================================================
// CIMS — Shipboard Management Review (SBM), Phase A. cims.work/sbm
// ============================================================================
// Replaces the MS Forms "Crew Feedback Survey — Printer Specialist" with a
// CIMS-native review auto-triggered around each specialist's sign-off:
//   invite at T-7 -> one reminder at T-4 (if unanswered) -> internal
//   notification on submission. Responses file as permanent "Manager
//   Feedback" cards on the crew record (append-only).
//
// HARD BOUNDARIES (spec §6.3 + CLAUDE.md):
//   - NO money code. Nothing here reads or writes bonus_outcome, seval_*,
//     baselines or payout. The Score Card integration (spec §6) is Phase B,
//     a separate human-approved money PR.
//   - The shipboard manager NEVER sees bonus mechanics: no weights, gates or
//     dollar figures on the survey page or in emails ① / ② (tests pin this).
//   - Identity is deterministic: the token IS the request (crew + contract).
//     No name matching, ever.
//
// Wiring (src/worker.js, documented in docs/shipboard-review/WORKER_WIRING.md):
//   const _sbm = installSbm({ sendViaMailer, logActivity,
//     SECTIONS: rotationSections, VESSEL_REF, ORIGIN: "https://cims.work" });
//   routes: GET /sbm (public) · POST /api/sbm/submit (public, token-auth)
//           GET /api/sbm/crew (session) · sbmDailySweep(env) in scheduled().
//
// Same primitives as the /fb feedback windows: stateless HMAC token from
// src/auth.js (imported, never re-implemented — CLAUDE.md §3), sha256 token
// hash in D1, single-use enforced by request status. Email goes through the
// injected sendViaMailer (cims-mailer service binding), sender CIMS
// <cims@cims.work>, exactly like auto_send.js.
// ============================================================================

import { signToken, verifyToken } from "./auth.js";

/* ----------------------------- primitives ------------------------------ */

export async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Token expiry: end of the sign-off day (the survey "expires on the sign-off
// date"). Deterministic from the stored contract_signoff, so the T-4 reminder
// re-derives the IDENTICAL token (same payload -> same HMAC) and the invite
// link and reminder link are one and the same single-use link.
export function sbmExpiryFor(signoffDate) {
  const t = Date.parse(String(signoffDate) + "T23:59:59Z");
  return Number.isFinite(t) ? Math.floor(t / 1000) : null; // malformed date -> null (caller skips), never exp:NaN
}

// Single-use signed token — SAME mechanism as /fb: HMAC payload signed with
// env.SESSION_SECRET; the DB stores only its sha256 hash; "used" is a status
// on the request row, never a token mutation.
export async function sbmToken(env, requestId, expiry) {
  return signToken({ p: "sbm", rid: requestId, exp: expiry }, env.SESSION_SECRET);
}
export async function sbmVerify(env, token) {
  const p = await verifyToken(token, env.SESSION_SECRET); // handles tamper + exp
  return p && p.p === "sbm" && p.rid ? p : null;
}

/* ------------------------------- brand --------------------------------- */

// Accents per spec §10 (Celebrity/Azamara are placeholders pending Miguel).
export const SBM_BRANDS = {
  "Royal Caribbean": { chip: "ROYAL CARIBBEAN INTERNATIONAL", accent: "#1E6FD0" },
  "Celebrity":       { chip: "CELEBRITY CRUISES",             accent: "#33415C" },
  "Azamara":         { chip: "AZAMARA",                       accent: "#0E8C8C" },
};
const AZ_SHIPS = ["journey", "onward", "quest", "pursuit"];
function normShip(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

// Ship -> canonical brand name (matches the vessel-table vocabulary). Same
// tolerant matching rotationSections uses: VESSEL_REF short names ("Navigator")
// match board names ("Navigator of the Seas"); the four Azamara ships are
// listed explicitly (they are not in VESSEL_REF).
export function sbmBrandForShip(ship, vesselRef) {
  const k = normShip(ship);
  if (!k) return null;
  for (const a of AZ_SHIPS) if (k === a || k.indexOf(a) === 0 || k.indexOf("azamara" + a) === 0) return "Azamara";
  let best = null;
  for (const v of vesselRef || []) {
    const n = normShip(v.name);
    if (n && k.indexOf(n) >= 0 && (!best || n.length > best.n.length)) best = { n, brand: v.brand };
  }
  return best ? (best.brand === "CEL" ? "Celebrity" : "Royal Caribbean") : null;
}

/* ---------------------- config: recipient fallback ---------------------- */

// recipient:<ship> first, else recipient:<brand>, else null (caller skips +
// logs; never errors, never guesses an address). `get` is a sync lookup so the
// rule stays pure and testable; the sweep feeds it pre-fetched sbm_config rows.
export function sbmPickRecipient(get, ship, brand) {
  const byShip = ship ? get("recipient:" + ship) : null;
  if (byShip) return byShip;
  const byBrand = brand ? get("recipient:" + brand) : null;
  return byBrand || null;
}

// Humans seed sbm_config keys with whatever ship name is at hand: the board
// name ("Navigator of the Seas"), the canonical SHORT name the live board
// emits ("Navigator"), sometimes an "MV " prefix. sbmNormShip folds all of
// these to one form so lookups can tolerate any of them; stored keys are never
// rewritten (lookup-side tolerance only -- accepted key forms documented in
// migrations/0013_sbm_review.sql).
export function sbmNormShip(s) {
  return String(s == null ? "" : s).trim().replace(/^mv\s+/i, "").replace(/\s+of\s+the\s+seas\s*$/i, "").replace(/\s+/g, " ").toLowerCase();
}

/* ------------------------- suppression matrix --------------------------- */

// Spec §4: invite/reminder are cancelled when the crew already signed off,
// the response is in (handled upstream: only status 'sent' rows are eligible),
// the sign-off date moved, the contract was cancelled, or the crew is
// retired/inactive. Returns the reason string, or null = not suppressed.
// A suppressed request never un-cancels (status 'suppressed' is terminal).
export function sbmSuppressReason(req, leg, crew, today) {
  if (!crew || crew.retired || crew.status === "Inactive") return "retired";
  if (!leg) return "cancelled";                                          // gone from the live schedule
  if (String(leg.off) !== String(req.contract_signoff)) return "date_moved";
  if (String(req.contract_signoff) < String(today)) return "signed_off"; // already off the ship
  return null;
}

/* ------------------------------ validation ------------------------------ */

// Rating 1-5 is the ONLY required input. Returns the normalized integer or null.
export function sbmValidRating(v) {
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export const SBM_QS = ["q_business", "q_guests", "q_grow", "q_integrity", "q_teams", "q_energy", "q_final"];
export const SBM_Q_LABELS = {
  q_business: "Smart with work", q_guests: "Guests come first", q_grow: "Helps us grow",
  q_integrity: "Acts with care", q_teams: "Team player", q_energy: "High energy", q_final: "Final thoughts",
};

/* --------------------------- schedule adapter --------------------------- */

// Legs from the LIVE board (rotationSections) — the same resolved sign-off
// dates the Keyman board displays and auto_send.js emails from, NOT the
// historical keyman_contract3. Past/undated legs are dropped by the date
// filter in the sweep.
export function sbmLegsFromSections(sections) {
  const out = [];
  for (const s of (sections || [])) for (const c of (s.crew || [])) {
    if (!c || !c.agency_id || !c.signOff) continue;
    out.push({ sc: c.agency_id, name: c.name || null, ship: c.ship || null,
               signOnDate: c.signOn ? String(c.signOn).slice(0, 10) : null,
               off: String(c.signOff).slice(0, 10) });
  }
  return out;
}

/* ------------------------------ dates ----------------------------------- */

export function sbmPlusDays(today, n) {
  const d = new Date(String(today) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function sbmDateLong(iso) { // '2026-07-10' -> '10 Jul 2026'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso) || "");
  return m ? String(Number(m[3])) + " " + MON[Number(m[2]) - 1] + " " + m[1] : String(iso || "");
}
function sinceLabel(signonIso) {
  const m = /^(\d{4})-(\d{2})/.exec(String(signonIso) || "");
  return m ? "On board since " + MON[Number(m[2]) - 1] + " " + m[1] : null;
}
function shipShort(ship) { return String(ship || "").split(" of the ")[0]; }

/* ------------------------------- emails --------------------------------- */
// Email-client-safe: tables + inline styles only (auto_send.js conventions).
// Estate brand: navy squircle + green waves inline SVG, wordmark "DG3 CIMS".
// Manager-facing templates (invite/reminder) are signed by Rita and carry NO
// bonus mechanics; the internal variant carries the score + gate pill.

const LOGO_SVG =
  '<svg width="34" height="34" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="display:block">' +
  '<rect x="1.5" y="1.5" width="97" height="97" rx="24" fill="#24486E" stroke="rgba(255,255,255,.30)" stroke-width="3"/>' +
  '<g fill="none" stroke="#5FB946" stroke-width="9" stroke-linecap="round">' +
  '<path d="M22 42 C31 34 41 34 50 40 S69 48 79 40"/>' +
  '<path d="M20 56 C29 48 39 48 48 54 S67 62 78 54"/>' +
  '<path d="M22 70 C31 62 41 62 50 68 S69 76 79 68"/></g></svg>';

const F = "font-family:Arial,Helvetica,sans-serif;";

function emailShell(bodyHtml, footText) {
  return '<div style="margin:0;padding:0;background:#E9EDF3;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E9EDF3;"><tr><td align="center" style="padding:26px 12px;">' +
    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:520px;background:#ffffff;border:1px solid #E4E9F0;border-radius:12px;">' +
    '<tr><td style="background:#1B3A5C;border-radius:12px 12px 0 0;padding:24px 32px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="34">' + LOGO_SVG + '</td>' +
    '<td style="padding-left:12px;"><div style="' + F + 'font-weight:bold;font-size:16px;color:#ffffff;">DG3 CIMS</div>' +
    '<div style="' + F + 'font-size:10px;color:#B9C7D8;letter-spacing:.06em;">CRUISE INDUSTRY MANAGED SERVICES</div></td></tr></table></td></tr>' +
    '<tr><td style="padding:34px 32px 28px;">' + bodyHtml + '</td></tr>' +
    '<tr><td style="border-top:1px solid #E4E9F0;padding:16px 32px 18px;' + F + 'font-size:11.5px;color:#6B7C93;line-height:1.6;">' + footText + '</td></tr>' +
    '</table></td></tr></table></div>';
}
const P = (s) => '<p style="' + F + 'font-size:14.5px;line-height:1.7;color:#16293D;margin:0 0 15px 0;">' + s + '</p>';
const PMUT = (s) => '<p style="' + F + 'font-size:13px;line-height:1.7;color:#6B7C93;margin:0 0 15px 0;">' + s + '</p>';
const H1 = (s) => '<div style="' + F + 'font-weight:bold;font-size:21px;color:#142D48;margin:0 0 16px 0;">' + s + '</div>';
const CTA = (href, label, sub) =>
  '<div style="text-align:center;margin:28px 0 14px;"><a href="' + href + '" style="display:inline-block;' + F +
  'font-weight:bold;font-size:15.5px;color:#ffffff;background:#5FB946;text-decoration:none;padding:14px 38px;border-radius:10px;">' + label + '</a>' +
  '<div style="margin-top:11px;' + F + 'font-size:12px;color:#6B7C93;">' + sub + '</div></div>';
const SIG = '<p style="' + F + 'font-size:14.5px;line-height:1.7;color:#16293D;margin:12px 0 0 0;">With appreciation,<br>' +
  '<b>Rita Berenyi</b><br>Head of HR<br><span style="color:#6B7C93;">DG3 Cruise Industry Managed Services</span></p>';

// ① Invite, T-7. To the shipboard manager. No bonus mechanics.
export function sbmInviteEmail(ctx) {
  const name = esc(ctx.name), first = esc(ctx.firstName || ctx.name), ship = esc(ctx.ship);
  const offLong = esc(sbmDateLong(ctx.off));
  const who = '<div style="background:#F4F8FD;border:1px solid #DCE7F5;border-radius:10px;padding:16px 20px;margin:20px 0;' + F +
    'font-size:14px;line-height:1.75;color:#16293D;"><b style="color:#142D48;">' + name + '</b> &middot; Printer Specialist<br>' +
    ship + ' &middot; signs off <b style="color:#142D48;">' + offLong + '</b></div>';
  return {
    subject: "A quick word about " + (ctx.firstName || ctx.name) + ", before the sign-off ✍️",
    html: emailShell(
      H1("Hello! 👋") +
      P("We're the team behind the Printer Specialist working with you onboard. In about a week, <b>" + name +
        "</b> completes " + "the contract on <b>" + ship + "</b> — and before " + first +
        " goes, we'd love to hear how things went, from the person who saw the work every day.") +
      who +
      P("It takes <b>under 3 minutes</b>. One rating is all we need — anything more is a gift. Your words go into " +
        first + "'s service record and help us recognize great work.") +
      CTA(ctx.link, "Share your feedback", "Private, single-use link &middot; expires on the sign-off date") +
      PMUT("We know this isn't part of your job, and we don't take your time for granted. Thank you for helping us take better care of the people who take care of your ship.") +
      SIG,
      "You're receiving this because a DG3 Printer Specialist is completing their assignment on your vessel. This link is unique to you — please don't forward it. Questions? Just reply to this email."
    ),
  };
}

// ② Reminder, T-4. Only if unanswered; sent ONCE. No bonus mechanics.
export function sbmReminderEmail(ctx) {
  const first = esc(ctx.firstName || ctx.name), ship = esc(ctx.ship);
  const offLong = esc(sbmDateLong(ctx.off));
  return {
    subject: "4 days left — 3 minutes for " + (ctx.firstName || ctx.name) + "? 🙏",
    html: emailShell(
      H1("Just a friendly nudge 🕊️") +
      P("No pressure at all — we know how full your days are. <b>" + first + "</b> signs off <b>" + ship +
        "</b> in four days, and the review is still open if you'd like to add a word before then.") +
      P("If you only have ten seconds: a single overall rating is genuinely enough. It still counts, and it still helps " + first + ".") +
      CTA(ctx.link, "Open " + first + "'s review", "Closes automatically on " + offLong + " &middot; we won't ask again") +
      PMUT("If it slips by, that's completely fine — this is the only reminder we'll send. Thank you for everything you do for our crew onboard.") +
      SIG,
      "This is the last message about this review. The link is unique to you — please don't forward it. Questions? Just reply."
    ),
  };
}

function quoteBlocks(resp) {
  let h = "";
  for (const k of SBM_QS) {
    if (!resp || !resp[k]) continue;
    h += '<div style="border-left:3px solid #D5DDE9;padding:3px 0 3px 14px;margin:14px 0;' + F +
      'font-size:13.5px;line-height:1.6;color:#16293D;"><div style="color:#6B7C93;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;">' +
      esc(SBM_Q_LABELS[k]) + '</div>&ldquo;' + esc(resp[k]) + '&rdquo;</div>';
  }
  return h;
}

// ③a Internal notification, on submission. To Rita, cc Miguel + team list.
// FULL version: rating, gate pill (green >=3 / red 1-2), pull-quotes, Score
// Card link. This is the ONLY place score mechanics appear.
export function sbmInternalEmail(ctx) {
  const r = ctx.rating, name = esc(ctx.name), ship = esc(ctx.ship);
  const good = r >= 3;
  const pill = good
    ? '<span style="display:inline-block;' + F + 'font-size:11.5px;font-weight:bold;color:#3E8E2A;background:#EAF6E4;border-radius:99px;padding:3px 10px;margin-top:5px;">EVAL &ge; 3 — prefills sEval 15/15 on the Score Card</span>'
    : '<span style="display:inline-block;' + F + 'font-size:11.5px;font-weight:bold;color:#B4232A;background:#FCEBEC;border-radius:99px;padding:3px 10px;margin-top:5px;">&#9888; EVAL 1&ndash;2 — freeze-gate warning: review before any commit</span>';
  const scorerow = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F8FD;border:1px solid #DCE7F5;border-radius:10px;margin:20px 0;"><tr>' +
    '<td width="86" align="center" style="padding:18px 0 18px 20px;"><div style="' + F + 'font-weight:bold;font-size:34px;line-height:1;color:' + (good ? "#3E8E2A" : "#B4232A") + ';">' + r + '/5</div>' +
    '<div style="' + F + 'font-size:10.5px;color:#6B7C93;letter-spacing:.04em;margin-top:5px;">OVERALL</div></td>' +
    '<td style="padding:18px 20px;' + F + 'font-size:13.5px;line-height:1.7;color:#16293D;"><b style="color:#142D48;">' + name + '</b> &middot; Printer Specialist<br>' +
    ship + ' &middot; ' + esc(ctx.brand || "") + ' &middot; signs off ' + esc(sbmDateLong(ctx.off)) + '<br>' + pill + '</td></tr></table>';
  return {
    subject: "Shipboard review in — " + (ctx.lastName || ctx.name) + " · " + shipShort(ctx.ship) + " · " + r + "/5 " + (good ? "✔" : "⚠️"),
    html: emailShell(
      H1("New shipboard management review") + scorerow + quoteBlocks(ctx.answers) +
      PMUT("Full response filed on " + name + "'s crew card. The rating only prefills the supervisor evaluation — you review and commit on the Score Card as usual." +
        (good ? "" : " A 1&ndash;2 rating would forfeit the bonus and hold the count if committed — nothing is committed automatically.")) +
      CTA(ctx.consoleUrl, "Open " + name + "'s Score Card", "cims.work &middot; HR console (login required)"),
      "Automated notification from the shipboard review pipeline. Full version to the CIMS team; the specialist receives a crew-facing copy (feedback only, no score mechanics) at their ship email."
    ),
  };
}

// ③b Crew-facing copy, to the specialist's WORKING SHIP email (never personal;
// spec §8). Thank-you + the feedback itself. NO sEval / gate / bonus framing.
export function sbmCrewEmail(ctx) {
  const first = esc(ctx.firstName || ctx.name), ship = esc(ctx.ship);
  return {
    subject: "Your shipboard manager shared feedback about you 🌊",
    html: emailShell(
      H1("Great news, " + first + "!") +
      P("Before your sign-off from <b>" + ship + "</b>, your shipboard manager took a few minutes to share feedback about your work. It is now part of your permanent service record with us.") +
      '<div style="text-align:center;margin:20px 0;"><span style="display:inline-block;' + F + 'font-weight:bold;font-size:30px;color:#142D48;">' + ctx.rating + '/5</span>' +
      '<div style="' + F + 'font-size:11px;color:#6B7C93;letter-spacing:.04em;margin-top:4px;">OVERALL RATING</div></div>' +
      quoteBlocks(ctx.answers) +
      P("Thank you for representing the team onboard — safe travels, and see you on the next one. 🚢") + SIG,
      "Automated copy of the feedback your shipboard manager submitted. Questions? Just reply to this email."
    ),
  };
}

/* ---------------------------- survey page ------------------------------- */
// Faithful port of docs/shipboard-review/sbm-survey-mockup.html, minus the
// mockup-only brand-switcher toolbar: the shipped page derives brand, crew and
// dates from the request row (the token IS the identity). All dynamic values
// are HTML-escaped. The client script posts JSON to /api/sbm/submit and flips
// to the thank-you state on success.

const SBM_CSS = `
:root{--navy:#1B3A5C;--deep:#142D48;--ink:#16293D;--green:#5FB946;--green-d:#3E8E2A;--line:#E4E9F0;--line-2:#D5DDE9;--mut:#6B7C93;--bg:#E9EDF3;--surface:#fff;--brand:#1E6FD0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:'Outfit',system-ui,sans-serif;letter-spacing:-.012em}
header{background:var(--navy);color:#fff;border-bottom:4px solid var(--brand)}
.hwrap{max-width:760px;margin:0 auto;padding:18px 20px;display:flex;align-items:center;gap:12px}
.mark{width:34px;height:34px;border-radius:8px;background:var(--green);display:grid;place-items:center;font-family:'Outfit';font-weight:700;font-size:17px;color:#fff;flex:none}
.logoimg{width:42px;height:42px;flex:none;display:block}
.wordmark{font-family:'Outfit';font-weight:700;font-size:19px;line-height:1.1}
.wordsub{font-size:11.5px;color:#B9C7D8;letter-spacing:.04em}
.brandchip{margin-left:auto;font-size:12px;font-weight:700;padding:5px 12px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25)}
main{max-width:760px;margin:0 auto;padding:28px 20px 80px}
.hello{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:26px 28px;margin-bottom:18px}
.hello h1{font-size:24px;color:var(--deep);margin-bottom:8px}
.hello p{color:var(--mut);font-size:15px;line-height:1.55;max-width:60ch}
.meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.meta span{font-size:12.5px;color:var(--mut);background:var(--bg);border:1px solid var(--line-2);padding:5px 11px;border-radius:99px}
.meta b{color:var(--ink)}
.ctx{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:14px;padding:24px 26px;margin-bottom:20px}
.ctx h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--mut);margin-bottom:16px}
.person{display:flex;align-items:center}
.pname{font-family:'Outfit';font-weight:700;font-size:22px;color:var(--deep);line-height:1.2}
.prole{font-size:13.5px;color:var(--mut);margin-top:3px}
.prole b{color:var(--ink);font-weight:500}
.pchips{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
.pchips span{font-size:12px;font-weight:500;color:var(--deep);background:var(--bg);border:1px solid var(--line-2);padding:4px 11px;border-radius:99px}
.prefnote{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:12.5px;color:var(--mut)}
.prefnote a{color:var(--brand);font-weight:500}
.q{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin-bottom:14px}
.q .num{font-size:11.5px;font-weight:700;color:var(--brand);letter-spacing:.1em;text-transform:uppercase}
.q h3{font-size:16.5px;color:var(--deep);margin:5px 0 4px;line-height:1.4}
.q .opt{font-size:12px;color:var(--mut);font-weight:400}
.hint{display:flex;gap:8px;align-items:baseline;font-size:13px;color:var(--mut);font-style:italic;margin:8px 0 12px}
.hint .tag{font-style:normal;font-size:11px;font-weight:700;color:var(--green-d);background:#EAF6E4;border-radius:99px;padding:2px 9px;white-space:nowrap}
textarea{width:100%;min-height:76px;font:inherit;font-size:14.5px;color:var(--ink);border:1px solid var(--line-2);border-radius:10px;padding:11px 13px;resize:vertical;background:#FBFCFE}
textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 15%,transparent)}
.rate{display:flex;gap:8px;margin-top:12px}
.rate button{flex:1;font-family:'Outfit';font-weight:600;font-size:20px;padding:14px 0 10px;border-radius:12px;border:1.5px solid var(--line-2);background:#FBFCFE;color:var(--ink);cursor:pointer;transition:.12s}
.rate button small{display:block;font-family:'DM Sans';font-weight:400;font-size:10.5px;color:var(--mut);margin-top:3px}
.rate button:hover{border-color:var(--brand)}
.rate button.sel{background:var(--brand);border-color:var(--brand);color:#fff}
.rate button.sel small{color:rgba(255,255,255,.85)}
.subrow{margin-top:22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.btn{font-family:'Outfit';font-weight:600;font-size:16px;color:#fff;background:var(--green);border:none;border-radius:12px;padding:14px 34px;cursor:pointer}
.btn:hover{background:var(--green-d)}
.btn[disabled]{opacity:.6;cursor:default}
.subnote{font-size:12.5px;color:var(--mut);max-width:40ch}
.privacy{margin-top:26px;font-size:12px;color:var(--mut);line-height:1.6}
#done{display:none;text-align:center;padding:70px 20px}
#done .mark{width:56px;height:56px;font-size:28px;border-radius:14px;margin:0 auto 18px}
#done h1{font-size:26px;color:var(--deep);margin-bottom:10px}
#done p{color:var(--mut);font-size:15.5px;line-height:1.6;max-width:48ch;margin:0 auto}
.closed{text-align:center;padding:70px 20px}
.closed h1{font-size:26px;color:var(--deep);margin-bottom:10px}
.closed p{color:var(--mut);font-size:15.5px;line-height:1.6;max-width:48ch;margin:0 auto}
.closed a{color:var(--brand);font-weight:500}
@media(max-width:560px){.rate{flex-wrap:wrap}.rate button{min-width:56px}}
`;

const PAGE_LOGO = LOGO_SVG.replace('width="34" height="34"', 'class="logoimg"');

function pageShell(title, accent, chip, inner) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<meta name="robots" content="noindex">' +
    '<title>' + esc(title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap" rel="stylesheet">' +
    '<style>' + SBM_CSS + '</style>' +
    (accent ? '<style>:root{--brand:' + esc(accent) + '}</style>' : '') +
    '</head><body><header><div class="hwrap">' + PAGE_LOGO +
    '<div><div class="wordmark">DG3 CIMS</div><div class="wordsub">CRUISE INDUSTRY MANAGED SERVICES</div></div>' +
    (chip ? '<div class="brandchip">' + esc(chip) + '</div>' : '') +
    '</div></header>' + inner + '</body></html>';
}

const FIX_MAIL = 'mailto:rita.berenyi@dg3.com?subject=Shipboard%20review%20%E2%80%94%20details%20need%20correction';

function qBlock(n, id, title, example, tag) {
  return '<section class="q"><div class="num">Question ' + n + ' <span class="opt">&middot; Optional</span></div>' +
    '<h3>' + title + '</h3>' +
    '<div class="hint">🔹 Example: &ldquo;' + example + '&rdquo; <span class="tag">' + tag + '</span></div>' +
    '<textarea id="' + id + '" placeholder="Type your answer…"></textarea></section>';
}

export function sbmSurveyHtml(ctx) {
  const b = SBM_BRANDS[ctx.brand] || { chip: ctx.brand ? String(ctx.brand).toUpperCase() : "", accent: "#1E6FD0" };
  const name = esc(ctx.name), ship = esc(ctx.ship || "your ship");
  const since = sinceLabel(ctx.signOnDate);
  const inner =
  '<main id="form">' +
    '<section class="hello"><h1>👋 Hello, and thank you!</h1>' +
    '<p>We\'d love your quick feedback about the Printer Specialist working with you onboard. This short survey helps us support our team better and recognize great work. No need to overthink it — just answer like you\'re talking to a friend. Each question comes with a small example to guide you.</p>' +
    '<div class="meta"><span>⏱ Takes <b>under 3 minutes</b></span><span>✏️ Only the rating is required</span><span>🔒 Single-use private link</span></div></section>' +
    '<section class="ctx"><h2>This review is about</h2><div class="person"><div>' +
      '<div class="pname">' + name + '</div>' +
      '<div class="prole">Printer Specialist &middot; <b>' + ship + '</b></div>' +
      '<div class="pchips"><span>Signs off <b>' + esc(sbmDateLong(ctx.off)) + '</b></span>' + (since ? '<span>' + esc(since) + '</span>' : '') + '</div>' +
    '</div></div>' +
    '<p class="prefnote">We\'ve prefilled these details for you — the review date is recorded automatically when you submit. Something doesn\'t look right? <a href="' + FIX_MAIL + '">Let us know</a>.</p></section>' +
    '<section class="q"><div class="num">Question 1 &middot; Required</div>' +
    '<h3>How would you rate the overall performance of the Printer Specialist?</h3>' +
    '<div class="rate" id="rate">' +
      '<button type="button" data-v="1" onclick="pick(this)">1<small>Needs work</small></button>' +
      '<button type="button" data-v="2" onclick="pick(this)">2<small>Below par</small></button>' +
      '<button type="button" data-v="3" onclick="pick(this)">3<small>Solid</small></button>' +
      '<button type="button" data-v="4" onclick="pick(this)">4<small>Great job</small></button>' +
      '<button type="button" data-v="5" onclick="pick(this)">5<small>Outstanding</small></button>' +
    '</div></section>' +
    qBlock(2, 'q_business', 'Do they understand how the business works and make smart decisions?', 'Knows when to save paper.', 'Smart with work') +
    qBlock(3, 'q_guests', 'Do they treat guests and coworkers like they matter most?', 'Always helpful to internal customers.', 'Guests come first') +
    qBlock(4, 'q_grow', 'Do they help the team work more smoothly, or improve how things are done onboard?', 'Prints smart, no waste.', 'Helps us grow') +
    qBlock(5, 'q_integrity', 'Are they honest, fair, and someone you can trust?', 'Always tells the truth.', 'Acts with care') +
    qBlock(6, 'q_teams', 'Do they work well with other teams or departments?', 'Helps Housekeeping with signs.', 'Team player') +
    qBlock(7, 'q_energy', 'Do they show energy and love for their job?', 'Always ready and smiling.', 'High energy') +
    qBlock(8, 'q_final', 'Anything else you\'d like to share about the outgoing Printer Specialist?', 'Great attitude. Always on time.', 'Final thoughts') +
    '<div class="subrow"><button class="btn" id="sbtn" onclick="submitForm()">Submit feedback</button>' +
    '<div class="subnote">Your response goes directly to the DG3 CIMS team and becomes part of the specialist\'s service record.</div></div>' +
    '<p class="privacy">This survey is operated by DG3 Cruise Industry Managed Services. Your response is used to support and recognize our crew; it is not anonymous to the CIMS team. This link is unique to this review and expires on the specialist\'s sign-off date. Questions? Reply to the email that brought you here or write to <b>cims@cims.work</b>.</p>' +
  '</main>' +
  '<section id="done"><div class="mark">✓</div><h1>Thank you — that means a lot.</h1>' +
  '<p>Your feedback has been recorded and will be shared with the CIMS team supporting <b>' + name + '</b>. We know your time onboard is precious — we appreciate you spending a few minutes of it on our crew.</p></section>' +
  '<script>' +
  'var TOKEN=' + JSON.stringify(String(ctx.token || "")) + ';' +
  'function pick(el){document.querySelectorAll("#rate button").forEach(function(b){b.classList.remove("sel");});el.classList.add("sel");}' +
  'async function submitForm(){' +
    'var sel=document.querySelector("#rate .sel");' +
    'if(!sel){alert("The overall rating (Question 1) is the only required field — one tap and you\'re done.");return;}' +
    'var body={t:TOKEN,rating:parseInt(sel.getAttribute("data-v"),10)};' +
    '["q_business","q_guests","q_grow","q_integrity","q_teams","q_energy","q_final"].forEach(function(k){var el=document.getElementById(k);if(el&&el.value.trim())body[k]=el.value.trim();});' +
    'var btn=document.getElementById("sbtn");btn.disabled=true;btn.textContent="Sending…";' +
    'try{' +
      'var r=await (await fetch("/api/sbm/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();' +
      'if(r.ok){document.getElementById("form").style.display="none";document.getElementById("done").style.display="block";window.scrollTo({top:0});return;}' +
      'if(r.already){alert("This review was already submitted — thank you!");return;}' +
      'alert(r.error==="rating_required"?"Please pick a rating from 1 to 5.":"Something went wrong — please try again, or reply to the email that brought you here.");' +
    '}catch(e){alert("Something went wrong — please try again.");}' +
    'btn.disabled=false;btn.textContent="Submit feedback";' +
  '}' +
  '</script>';
  return pageShell("DG3 CIMS · Printer Specialist Review", b.accent, b.chip, inner);
}

// Friendly terminal page — invalid, expired, used or suppressed link.
export function sbmClosedHtml(kind) {
  const already = kind === "submitted";
  const inner = '<main><section class="closed">' +
    '<h1>' + (already ? "This review is already in — thank you!" : "This link has expired") + '</h1>' +
    '<p>' + (already
      ? "Your feedback was received and shared with the CIMS team. Nothing more to do — we really appreciate it."
      : "Review links are single-use and close on the specialist’s sign-off date. If you’d still like to share feedback, we’d love to have it — just <a href=\"" + FIX_MAIL + "\">drop us a line</a> or reply to the email that brought you here.") +
    '</p></section></main>';
  return pageShell("DG3 CIMS · Shipboard Review", null, null, inner);
}

/* ------------------------------ install --------------------------------- */
// House pattern (installAck / installInstr / installAutoSend): the worker
// injects its transport + live-schedule readers; tests inject fakes. deps:
//   sendViaMailer(env, envelope)  cims-mailer service binding wrapper (worker.js)
//   logActivity(env, email, action, detail)   optional, best-effort
//   SECTIONS(env) -> { sections }             rotationSections (live board)
//   VESSEL_REF                                 ship -> brand reference
//   ORIGIN                                     public origin for links
//   NOTIFY_TO / NOTIFY_CC                      internal notification (defaults below)
//   today() -> 'YYYY-MM-DD'                    injectable clock for tests
//   GATE_TZ / GATE_HOUR                        hour gate (default 08 Europe/Budapest; null = no gate, tests)
//   isEnabled(env) -> bool                     master switch override (default: app_setting 'sbm_enabled')

export function installSbm(deps) {
  const sendViaMailer = deps.sendViaMailer;
  const logActivity = deps.logActivity || (async () => {});
  const ORIGIN = deps.ORIGIN || "https://cims.work";
  const NOTIFY_TO = deps.NOTIFY_TO || ["rita.berenyi@dg3.com"];
  const NOTIFY_CC = deps.NOTIFY_CC || ["miguel.sanmartin@dg3.com"];
  const todayStr = deps.today || (() => new Date().toISOString().slice(0, 10));
  const GATE_TZ = deps.GATE_TZ || "Europe/Budapest";                          // auto_send's hour gate, reused
  const GATE_HOUR = deps.GATE_HOUR === undefined ? "08" : deps.GATE_HOUR;     // null disables the gate (tests)
  // Master ON/OFF switch (Rita's toggle on the Keyman page). SAME mechanism as
  // auto_send_enabled: app_setting key 'sbm_enabled', flipped via /api/sbmtoggle.
  // Absent row / anything but "true" = OFF, so a fresh deploy ships disarmed.
  const isEnabled = deps.isEnabled || (async function (env) {
    try {
      const r = await env.DB.prepare("SELECT v FROM app_setting WHERE k='sbm_enabled'").first();
      return !!(r && r.v === "true");
    } catch (e) { return false; }
  });
  function hourIn(tz, now) {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).formatToParts(now)
      .reduce(function (a, p) { if (p.type === "hour") a = p.value; return a; }, "");
  }

  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  const html = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

  // Belt-and-suspenders alongside migrations/0013_sbm_review.sql (ensureFb pattern).
  async function ensureSbm(env) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS sbm_review_request (id TEXT PRIMARY KEY, crew_id TEXT, agency_id TEXT NOT NULL, contract_signon TEXT, contract_signoff TEXT NOT NULL, ship TEXT, brand TEXT, recipient_email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, sent_at TEXT, reminder_at TEXT, status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','reminded','submitted','expired','suppressed')), created_at TEXT NOT NULL, UNIQUE (agency_id, contract_signoff))").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS sbm_review_response (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES sbm_review_request(id), rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), q_business TEXT, q_guests TEXT, q_grow TEXT, q_integrity TEXT, q_teams TEXT, q_energy TEXT, q_final TEXT, submitted_at TEXT NOT NULL, ip TEXT, ua TEXT)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS sbm_config (key TEXT PRIMARY KEY, value TEXT)").run();
  }

  async function cfgGet(env, key) {
    const r = await env.DB.prepare("SELECT value FROM sbm_config WHERE key=?").bind(key).first();
    const v = r && r.value != null ? String(r.value).trim() : "";
    return v !== "" ? v : null;
  }
  function splitList(v) { return String(v || "").split(/[,;\s]+/).map(s => s.trim()).filter(s => s.indexOf("@") > 0); }

  // S1: tolerant '<prefix>:<ship>' config lookup -- the exact key first, then
  // the sbmNormShip-folded name against every stored '<prefix>:...' key.
  async function cfgGetShip(env, prefix, ship) {
    if (!ship) return null;
    const exact = await cfgGet(env, prefix + ":" + ship);
    if (exact) return exact;
    const want = sbmNormShip(ship);
    if (!want) return null;
    const rows = (await env.DB.prepare("SELECT key, value FROM sbm_config WHERE key LIKE ?").bind(prefix + ":%").all()).results || [];
    for (const r of rows) {
      if (sbmNormShip(String(r.key).slice(prefix.length + 1)) !== want) continue;
      const v = r.value != null ? String(r.value).trim() : "";
      if (v !== "") return v;
    }
    return null;
  }

  async function crewByAgencyId(env, sc) {
    return env.DB.prepare("SELECT id, first_name, middle_name, last_name FROM crew WHERE agency_id=?").bind(sc).first();
  }
  function fullName(cr, fallback) {
    const n = cr ? [cr.first_name, cr.middle_name, cr.last_name].filter(Boolean).join(" ") : "";
    return n || fallback || "our specialist";
  }
  function firstName(cr, fallback) { return (cr && cr.first_name) || String(fallback || "").split(" ")[0] || "our specialist"; }

  async function findByTokenHash(env, th) {
    return env.DB.prepare("SELECT id, crew_id, agency_id, contract_signon, contract_signoff, ship, brand, recipient_email, status FROM sbm_review_request WHERE token_hash=?").bind(th).first();
  }

  // ---- GET /sbm?t=... (public) -------------------------------------------
  async function sbmFormPage(request, env, url) {
    await ensureSbm(env);
    const t = url.searchParams.get("t");
    const p = t ? await sbmVerify(env, t) : null;      // signature + expiry
    if (!p) return html(sbmClosedHtml("expired"));
    const req = await findByTokenHash(env, await sha256hex(t));
    if (!req || req.id !== p.rid) return html(sbmClosedHtml("expired"));
    if (req.status === "submitted") return html(sbmClosedHtml("submitted"));
    if (req.status === "expired" || req.status === "suppressed" || String(req.contract_signoff) < todayStr())
      return html(sbmClosedHtml("expired"));
    const cr = await crewByAgencyId(env, req.agency_id);
    return html(sbmSurveyHtml({
      token: t, name: fullName(cr, req.agency_id), ship: req.ship, brand: req.brand,
      off: req.contract_signoff, signOnDate: req.contract_signon,
    }));
  }

  // ---- POST /api/sbm/submit (public, token-authenticated) -----------------
  async function sbmSubmit(request, env) {
    await ensureSbm(env);
    const b = await request.json().catch(() => ({}));
    const p = await sbmVerify(env, b.t);
    if (!p) return json({ error: "invalid_or_expired" }, 401);
    const req = await findByTokenHash(env, await sha256hex(b.t));
    if (!req || req.id !== p.rid) return json({ error: "invalid_or_expired" }, 401);
    // Single-use: reject a second submission instead of overwriting evidence.
    if (req.status === "submitted") return json({ ok: false, already: true, error: "already_submitted" }, 409);
    if (req.status === "expired" || req.status === "suppressed") return json({ error: "invalid_or_expired" }, 401);
    const rating = sbmValidRating(b.rating);
    if (rating == null) return json({ error: "rating_required" }, 400);
    const answers = {};
    for (const k of SBM_QS) { const v = b[k]; if (typeof v === "string" && v.trim() !== "") answers[k] = v.trim().slice(0, 4000); }
    const now = new Date().toISOString();
    // Append-only: INSERT only; sbm_review_response rows are never updated or deleted.
    await env.DB.prepare("INSERT INTO sbm_review_response (id,request_id,rating,q_business,q_guests,q_grow,q_integrity,q_teams,q_energy,q_final,submitted_at,ip,ua) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind("sbmp_" + crypto.randomUUID(), req.id, rating,
        answers.q_business || null, answers.q_guests || null, answers.q_grow || null, answers.q_integrity || null,
        answers.q_teams || null, answers.q_energy || null, answers.q_final || null,
        now, request.headers.get("CF-Connecting-IP") || null, request.headers.get("User-Agent") || null).run();
    await env.DB.prepare("UPDATE sbm_review_request SET status=? WHERE id=?").bind("submitted", req.id).run();
    try { await logActivity(env, null, "sbm_submit", req.agency_id + " " + rating + "/5"); } catch {}
    // ③ Internal notification (+ crew-facing copy). Best-effort: a mail hiccup
    // must never fail the manager's submission.
    try {
      const cr = await crewByAgencyId(env, req.agency_id);
      const name = fullName(cr, req.agency_id);
      const ctx = { name, firstName: firstName(cr, name), lastName: (cr && cr.last_name) || name,
        ship: req.ship, brand: req.brand, off: req.contract_signoff, rating, answers, consoleUrl: ORIGIN + "/" };
      const teamList = splitList(await cfgGet(env, "team_list"));
      const internal = sbmInternalEmail(ctx);
      await sendViaMailer(env, { templateId: "hr.sbm.notify.v1", to: NOTIFY_TO, cc: NOTIFY_CC.concat(teamList),
        subject: internal.subject, html: internal.html, critical: true });
      const shipMail = await cfgGetShip(env, "shipmail", req.ship); // exact key, then sbmNormShip key (S1)
      if (shipMail) {
        const crewCopy = sbmCrewEmail(ctx);
        await sendViaMailer(env, { templateId: "hr.sbm.crewcopy.v1", to: [shipMail],
          subject: crewCopy.subject, html: crewCopy.html, critical: false });
      }
    } catch (e) { try { console.error("sbm_notify", (e && e.stack) || e); } catch {} }
    // Score Card sEval auto-apply (spec §6): a submitted review prefills the
    // supervisor evaluation. Manual-wins + post-commit flagging live inside the
    // hook; a failure here must never fail the manager's submission.
    try { if (deps.onReviewStored) await deps.onReviewStored(env, req.agency_id, req.contract_signoff, req.crew_id); } catch (e) { try { console.error("seval_autoapply", (e && e.stack) || e); } catch {} }
    return json({ ok: true });
  }

  // ---- daily sweep (called from scheduled(); guarded by try/catch there) ---
  // T-7: create request + send invite. T-4: remind once if still 'sent'.
  // Idempotent: UNIQUE(agency_id, contract_signoff) + status transitions make
  // a second run the same day a no-op. Suppression matrix per spec §4.
  async function sbmDailySweep(env, event) {
    // Master switch FIRST -- checked BEFORE the hour gate: while shipboard
    // reviews are OFF the sweep must not touch the schedule, the DB or the
    // mailer at any hour (mirrors auto_send's `disabled` short-circuit).
    if (!(await isEnabled(env))) return { skipped: "disabled" };
    // S4 -- hour gate (auto_send rule): the cron ticks hourly; act once a day
    // at 08:00 Europe/Budapest. Status transitions keep the run idempotent.
    const now = event && event.scheduledTime ? new Date(event.scheduledTime) : new Date();
    if (GATE_HOUR != null && hourIn(GATE_TZ, now) !== GATE_HOUR) return { skipped: "not_gate_hour" };
    await ensureSbm(env);
    const today = todayStr();
    const t7 = sbmPlusDays(today, 7), t4 = sbmPlusDays(today, 4);
    const out = { date: today, invited: 0, reminded: 0, suppressed: 0, expired: 0, skipped: [] };

    const { sections } = await deps.SECTIONS(env);
    const legs = sbmLegsFromSections(sections);

    // Crew registry + overrides -> suppression facts (retired / Inactive / redacted).
    const crewRows = (await env.DB.prepare("SELECT agency_id, id, first_name, middle_name, last_name, status, redacted FROM crew").all()).results || [];
    const ovRows = (await env.DB.prepare("SELECT agency_id, status, retired FROM crew_override").all()).results || [];
    const ov = {}; for (const o of ovRows) ov[o.agency_id] = o;
    const crew = {};
    for (const c of crewRows) {
      const o = ov[c.agency_id] || {};
      crew[c.agency_id] = { ...c, status: o.status || c.status, retired: !!(o.retired || c.redacted) };
    }

    // Hygiene: open requests whose sign-off date has passed are done.
    const ex = await env.DB.prepare("UPDATE sbm_review_request SET status='expired' WHERE status IN ('sent','reminded') AND contract_signoff < ?").bind(today).run();
    out.expired = (ex && ex.meta && ex.meta.changes) || 0;

    // ① Invites at exactly T-7.
    for (const leg of legs) {
      if (leg.off !== t7) continue;
      const cr = crew[leg.sc];
      if (!cr || cr.retired || cr.status === "Inactive") { out.skipped.push({ sc: leg.sc, reason: "retired_or_inactive" }); continue; }
      const dup = await env.DB.prepare("SELECT id FROM sbm_review_request WHERE agency_id=? AND contract_signoff=?").bind(leg.sc, leg.off).first();
      if (dup) continue;                                        // already handled (any status) -> sweep is idempotent
      const brand = sbmBrandForShip(leg.ship, deps.VESSEL_REF);
      const byShip = await cfgGetShip(env, "recipient", leg.ship); // exact key, then sbmNormShip key (S1)
      const byBrand = brand ? await cfgGet(env, "recipient:" + brand) : null;
      const recipient = byShip || byBrand || null;              // sbmPickRecipient rule, pre-fetched
      if (!recipient) {                                         // skip + log, never error (list pending from Miguel)
        out.skipped.push({ sc: leg.sc, ship: leg.ship, reason: "no_recipient_configured" });
        try { console.log("sbm_sweep: no recipient configured for", leg.ship, "/", brand, "- skipped", leg.sc); } catch {}
        await logActivity(env, null, "sbm_no_recipient", leg.sc + " " + (leg.ship || "?") + " / " + (brand || "?"));
        continue;
      }
      const exp = sbmExpiryFor(leg.off);                        // N6: malformed date -> skip leg, never exp:NaN
      if (exp == null) { out.skipped.push({ sc: leg.sc, reason: "bad_signoff_date" }); continue; }
      const rid = "sbmr_" + crypto.randomUUID();
      const token = await sbmToken(env, rid, exp);
      const link = ORIGIN + "/sbm?t=" + token;                  // token is base64url — URL-safe as-is
      const cn = fullName(cr, leg.name);
      const mail = sbmInviteEmail({ name: cn, firstName: firstName(cr, cn), ship: leg.ship, off: leg.off, link });
      const res = await sendViaMailer(env, { templateId: "hr.sbm.invite.v1", to: [recipient], subject: mail.subject, html: mail.html, critical: false });
      if (!res || !res.ok) {                                    // row only on success (auto_send rule)
        out.skipped.push({ sc: leg.sc, reason: "send_failed" });
        try { console.error("sbm_sweep: invite send failed", leg.sc, leg.off); } catch {}
        await logActivity(env, null, "sbm_invite_send_failed", leg.sc + " " + leg.off);
        continue;
      }
      const now = new Date().toISOString();
      await env.DB.prepare("INSERT INTO sbm_review_request (id,crew_id,agency_id,contract_signon,contract_signoff,ship,brand,recipient_email,token_hash,sent_at,reminder_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(rid, (cr && cr.id) || null, leg.sc, leg.signOnDate, leg.off, leg.ship, brand, recipient, await sha256hex(token), now, null, "sent", now).run();
      out.invited++;
      await logActivity(env, null, "sbm_invite", leg.sc + " " + leg.off + " -> " + recipient);
    }

    // ② Reminders at exactly T-4, only for rows still 'sent' (once, ever).
    const open = (await env.DB.prepare("SELECT id, crew_id, agency_id, contract_signon, contract_signoff, ship, brand, recipient_email, status FROM sbm_review_request WHERE status='sent'").all()).results || [];
    for (const req of open) {
      if (req.contract_signoff !== t4) continue;
      const leg = legs.find(l => l.sc === req.agency_id && String(l.off) === String(req.contract_signoff)) || null;
      const reason = sbmSuppressReason(req, leg, crew[req.agency_id], today);
      if (reason) {                                             // terminal: a cancelled reminder never un-cancels
        await env.DB.prepare("UPDATE sbm_review_request SET status=? WHERE id=?").bind("suppressed", req.id).run();
        out.suppressed++;
        await logActivity(env, null, "sbm_suppress", req.agency_id + " " + req.contract_signoff + " " + reason);
        continue;
      }
      const cr = await crewByAgencyId(env, req.agency_id);
      // Same payload -> same HMAC: the reminder re-derives the ORIGINAL single-use link.
      const token = await sbmToken(env, req.id, sbmExpiryFor(req.contract_signoff));
      const cn = fullName(cr, req.agency_id);
      const mail = sbmReminderEmail({ name: cn, firstName: firstName(cr, cn), ship: req.ship, off: req.contract_signoff, link: ORIGIN + "/sbm?t=" + token });
      const res = await sendViaMailer(env, { templateId: "hr.sbm.reminder.v1", to: [req.recipient_email], subject: mail.subject, html: mail.html, critical: false });
      if (!res || !res.ok) {
        out.skipped.push({ sc: req.agency_id, reason: "reminder_send_failed" });
        try { console.error("sbm_sweep: reminder send failed", req.agency_id, req.contract_signoff); } catch {}
        await logActivity(env, null, "sbm_reminder_send_failed", req.agency_id + " " + req.contract_signoff);
        continue;
      }
      await env.DB.prepare("UPDATE sbm_review_request SET status='reminded', reminder_at=? WHERE id=?").bind(new Date().toISOString(), req.id).run();
      out.reminded++;
      await logActivity(env, null, "sbm_reminder", req.agency_id + " " + req.contract_signoff);
    }
    try { console.log("sbm_sweep " + today + ": invited=" + out.invited + " reminded=" + out.reminded + " suppressed=" + out.suppressed + " expired=" + out.expired + " skipped=" + out.skipped.length); } catch {}
    return out;
  }

  // ---- GET /api/sbm/crew?id=SC-... (session-authenticated route) ----------
  // Manager Feedback cards for the crew tab: every response, newest first,
  // qualitative answers verbatim (spec §7). Read-only.
  async function sbmCrewCards(env, crewId) {
    await ensureSbm(env);
    const id = String(crewId || "").trim();
    // N7: same JSON shape as apiFeedbackCrew's 404 ({ error: "not_found" }).
    // The worker.js caller wraps this in a 200 -- the HTTP 404 status itself
    // is deferred to a worker.js change (worker.js is frozen in this PR).
    if (!id) return { ok: false, error: "not_found", cards: [] };
    const rows = (await env.DB.prepare(
      "SELECT q.ship AS ship, q.brand AS brand, q.contract_signon AS contract_signon, q.contract_signoff AS contract_signoff, r.rating AS rating, r.q_business AS q_business, r.q_guests AS q_guests, r.q_grow AS q_grow, r.q_integrity AS q_integrity, r.q_teams AS q_teams, r.q_energy AS q_energy, r.q_final AS q_final, r.submitted_at AS submitted_at FROM sbm_review_response r JOIN sbm_review_request q ON q.id = r.request_id WHERE q.agency_id=? OR q.crew_id=? ORDER BY r.submitted_at DESC"
    ).bind(id, id).all()).results || [];
    return { ok: true, cards: rows };
  }

  return { ensureSbm, sbmFormPage, sbmSubmit, sbmDailySweep, sbmCrewCards };
}
