/**
 * CIMS — Fleet Document Radar (weekly compliance email)
 * -----------------------------------------------------
 * Every active crew with a document EXPIRED, EXPIRING (<=90 days), or MISSING,
 * worst-first, on the CIMS/DG3 brand. Catches the lapses that ground a crew
 * change (medical, US C1/D visa, seaman's book, passport, Schengen) before they
 * bite — and surfaces missing records so the registry gets completed.
 *
 * Cadence: Monday 03:00 America/New_York (Miami), weekly, deduped. Sent via the
 * existing hourly cron (maybeSendDocRadar) — no new infrastructure.
 * Recipients: To Rita; CC Maryjoy, Joyce (TDG), Miguel.
 *
 * Read-only over the crew registry. Content-only; delivery is the cims-mailer
 * service binding (owns Resend key, retries, mail_log). Fail-safe: any error is
 * logged and swallowed so it can never break the shared cron.
 */

import { isMoneyUser } from "./policy.js";

// --- recipients (edit here; lives in code so it survives every deploy) -------
const TO = ["Rita Berenyi <Rita.Berenyi@dg3.com>"];
const CC = [
  "Maryjoy Manzanares <maryjoy.manzanares@dg3.com>",
  "Joyce Castillo <Joyce.Castillo@tdgcm.ph>",
  "Miguel San Martin <Miguel.Sanmartin@dg3.com>",
];

const WINDOW_DAYS = 90;   // expiring horizon
const MAX_ROWS = 60;      // safety cap on email size

// --- brand palette -----------------------------------------------------------
const C = { navy:'#1B3A5C', green:'#5FB946', ink:'#1F2A37', slate:'#6B7280', light:'#9CA3AF', border:'#E5E7EB', page:'#EAEDF1', card:'#FFFFFF' };
const S = {
  valid:   { bg:'#E7F4E1', tx:'#357D2A', ac:'#5FB946' },
  expiring:{ bg:'#FBF0DA', tx:'#8A6620', ac:'#E0A64B' },
  expired: { bg:'#FDE7E7', tx:'#9B1C1C', ac:'#DC2626' },
  missing: { bg:'#ECEFF3', tx:'#4B5563', ac:'#94A3B8' },
  na:      { bg:'#F5F6F7', tx:'#B7B6B2', ac:'#E5E7EB' },
};
const F  = "'DM Sans','Segoe UI',Helvetica,Arial,sans-serif";
const FH = "'Outfit','Segoe UI',Helvetica,Arial,sans-serif";

// PP/SIRB/MED/C1D/SCH — label, column, full name
const DOCS = [
  ['PP',   'pp_exp',   'Passport'],
  ['SIRB', 'sirb_exp', "Seaman's book"],
  ['MED',  'med_exp',  'Medical'],
  ['C1/D', 'usv_exp',  'US C1/D'],
  ['SCH',  'sch_exp',  'Schengen'],
];
const CRITICAL = new Set(['pp_exp', 'sirb_exp', 'med_exp', 'usv_exp']); // Schengen is optional

// --- date helpers ------------------------------------------------------------
const DAY = 86400000;
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WDs = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function nyDateStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function isoOk(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s); }
function daysUntil(exp, todayStr) { return Math.round((new Date(exp.slice(0,10)+'T00:00:00Z') - new Date(todayStr+'T00:00:00Z')) / DAY); }
function shortDate(exp) { if (!isoOk(exp)) return ''; const d = new Date(exp.slice(0,10)+'T00:00:00Z'); return `${String(d.getUTCDate()).padStart(2,'0')} ${MO[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; }
function longDate(exp) { if (!isoOk(exp)) return ''; const d = new Date(exp.slice(0,10)+'T00:00:00Z'); return `${String(d.getUTCDate()).padStart(2,'0')} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function fmtRun(runDate) { const d = new Date(runDate.slice(0,10)+'T00:00:00Z'); return `${WDs[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2,'0')} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// --- assessment (pure) -------------------------------------------------------
export function docStatus(exp, todayStr) {
  if (!isoOk(exp)) return 'missing';
  const d = daysUntil(exp, todayStr);
  if (d < 0) return 'expired';
  if (d <= WINDOW_DAYS) return 'expiring';
  return 'valid';
}

export function assessCrew(row, todayStr) {
  const cells = {};
  let expired = 0, expiring = 0, missing = 0;
  for (const [, key] of DOCS) {
    let st = docStatus(row[key], todayStr);
    if (st === 'missing' && !CRITICAL.has(key)) st = 'na'; // blank Schengen = not held, not a gap
    cells[key] = st;
    if (st === 'expired') expired++;
    else if (st === 'expiring') expiring++;
    else if (st === 'missing') missing++;
  }
  const deployable = row.status === 'Earmarked' || row.status === 'On Vacation';
  const flagged = (expired + expiring + missing) > 0;
  // worst-first score: expired critical dominates, then missing, then expiring; deployable adds urgency.
  const score = expired * 100 + missing * 50 + expiring * 10 + (deployable && (expired + missing > 0) ? 25 : 0);
  // earliest bad date for tiebreak
  let earliest = null;
  for (const [, key] of DOCS) {
    if ((cells[key] === 'expired' || cells[key] === 'expiring') && isoOk(row[key])) {
      const v = row[key].slice(0,10);
      if (!earliest || v < earliest) earliest = v;
    }
  }
  return { cells, expired, expiring, missing, deployable, flagged, score, earliest };
}

// --- data --------------------------------------------------------------------
export async function fetchDocRadar(env, todayStr) {
  const { results } = await env.DB.prepare(
    "SELECT agency_id, first_name, last_name, status, pp_exp, sirb_exp, med_exp, usv_exp, sch_exp " +
    "FROM crew WHERE redacted=0 AND status != 'Inactive'"
  ).all();
  const flagged = [];
  const counts = { crew: 0, expired: 0, expiring: 0, missing: 0, deployable: 0 };
  for (const r of (results || [])) {
    const a = assessCrew(r, todayStr);
    if (!a.flagged) continue;
    counts.crew++; counts.expired += a.expired; counts.expiring += a.expiring; counts.missing += a.missing;
    if (a.deployable) counts.deployable++;
    flagged.push({
      agency_id: r.agency_id,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.agency_id,
      status: r.status, docs: { pp_exp:r.pp_exp, sirb_exp:r.sirb_exp, med_exp:r.med_exp, usv_exp:r.usv_exp, sch_exp:r.sch_exp }, ...a,
    });
  }
  flagged.sort((a, b) => b.score - a.score || (a.earliest || '9999') < (b.earliest || '9999') ? -1 : 1);
  // most-urgent callout
  let urgent = null;
  if (flagged.length) {
    const t = flagged[0];
    let label = null, date = null;
    for (const [lab, key] of DOCS) {
      if (t.cells[key] === 'expired') { label = lab; date = t.docs[key]; break; }
    }
    if (!label) for (const [lab, key] of DOCS) { if (t.cells[key] === 'missing') { label = lab; break; } }
    urgent = { name: t.name, status: t.status, deployable: t.deployable, label, date };
  }
  return { rows: flagged.slice(0, MAX_ROWS), truncated: Math.max(0, flagged.length - MAX_ROWS), counts, urgent };
}

// --- email (pure) ------------------------------------------------------------
function head(runDate) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Fleet Document Radar</title>
<style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap');@media only screen and (max-width:620px){.wrap{width:100%!important}}</style></head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};"><tr><td align="center" style="padding:32px 14px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;">
<tr><td style="background:${C.navy};padding:20px 30px;border-radius:14px 14px 0 0;"><table role="presentation" width="100%"><tr>
<td style="vertical-align:middle;"><div style="font-family:${FH};font-size:22px;font-weight:700;letter-spacing:5px;color:#fff;line-height:1;">CIMS</div>
<div style="height:2px;width:34px;background:${C.green};margin:7px 0 6px;font-size:0;line-height:0;">&nbsp;</div>
<div style="font-family:${F};font-size:8px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;color:rgba(255,255,255,.6);">Cruise Industry Managed Services</div></td>
<td align="right" style="vertical-align:top;"><div style="font-family:${F};font-size:10px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:rgba(255,255,255,.7);">Crew Compliance</div>
<div style="font-family:${F};font-size:8px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);padding-top:6px;">A division of <span style="color:${C.green};font-weight:700;">DG3</span></div></td>
</tr></table></td></tr>
<tr><td style="padding:24px 30px 2px;"><div style="font-family:${FH};font-size:23px;font-weight:700;color:${C.navy};line-height:1.25;">Fleet document radar</div>
<div style="font-family:${F};font-size:13px;color:${C.slate};padding-top:5px;">Active crew with a document expired, expiring &le;90 days, or missing · ${fmtRun(runDate)}</div></td></tr>`;
}
function legend() {
  return `<tr><td style="padding:14px 30px 2px;"><span style="font-family:${F};font-size:11px;color:${C.slate};">`
    + `<span style="color:${S.valid.tx};font-weight:700;">&#9679;</span> Valid &nbsp; `
    + `<span style="color:${S.expiring.tx};font-weight:700;">&#9679;</span> Expiring &nbsp; `
    + `<span style="color:${S.expired.tx};font-weight:700;">&#9679;</span> Expired &nbsp; `
    + `<span style="color:${S.missing.tx};font-weight:700;">&#9679;</span> Missing &nbsp; `
    + `<span style="color:${S.na.tx};font-weight:700;">&#9679;</span> Not held</span></td></tr>`;
}
const foot = `<tr><td style="padding:22px 30px 26px;"><div style="border-top:1px solid ${C.border};padding-top:14px;font-family:${F};font-size:11px;color:${C.light};line-height:1.6;">Automated weekly report · Monday 03:00 Miami time · Source: CIMS crew registry. Statuses derived from document expiry dates on file — accuracy depends on the registry being current.</div></td></tr></table></td></tr></table></body></html>`;

function cellHtml(state, exp) {
  const o = S[state] || S.na;
  const txt = state === 'missing' ? 'MISSING' : state === 'na' ? '&mdash;' : shortDate(exp);
  return `<td style="padding:7px 3px;text-align:center;border-bottom:1px solid ${C.border};"><div style="background:${o.bg};border-radius:6px;padding:5px 2px;font-family:${F};font-size:10px;font-weight:600;color:${o.tx};">${txt}</div></td>`;
}

export function buildDocRadarEmail({ runDate, rows, counts, urgent, truncated = 0 }) {
  let banner;
  if (!rows.length) {
    banner = `<tr><td style="padding:16px 30px 0;"><table role="presentation" width="100%" style="background:${S.valid.bg};border:1px solid #CDE9C0;border-radius:10px;"><tr><td width="4" style="background:${S.valid.ac};border-radius:10px 0 0 10px;font-size:0;">&nbsp;</td><td style="padding:11px 15px;font-family:${F};font-size:12.5px;color:${S.valid.tx};"><strong>All clear:</strong> no active crew has a document expired, expiring within 90 days, or missing.</td></tr></table></td></tr>`;
  } else {
    const bits = [];
    if (counts.expired) bits.push(`${counts.expired} expired`);
    if (counts.expiring) bits.push(`${counts.expiring} expiring`);
    if (counts.missing) bits.push(`${counts.missing} missing`);
    let urgentLine = '';
    if (urgent && urgent.label) {
      const where = urgent.date ? `${urgent.label} lapsed ${longDate(urgent.date)}` : `${urgent.label} not on file`;
      const dep = urgent.deployable ? ` — <strong>${esc(urgent.status)}</strong> (next to deploy)` : '';
      urgentLine = ` Most urgent: <strong>${esc(urgent.name)}</strong>${dep}, ${where}.`;
    }
    banner = `<tr><td style="padding:16px 30px 0;"><table role="presentation" width="100%" style="background:${S.expired.bg};border:1px solid #F5C2C2;border-radius:10px;"><tr><td width="4" style="background:${S.expired.ac};border-radius:10px 0 0 10px;font-size:0;">&nbsp;</td><td style="padding:11px 15px;font-family:${F};font-size:12.5px;color:${S.expired.tx};line-height:1.5;"><strong>${counts.crew} crew · ${bits.join(' + ')} documents.</strong>${urgentLine}</td></tr></table></td></tr>`;
  }

  let table = '';
  if (rows.length) {
    const hdr = `<tr style="background:${C.navy};"><th style="padding:9px 10px;font-family:${F};font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#fff;text-align:left;">Crew</th>`
      + DOCS.map(([l]) => `<th style="padding:9px 4px;font-family:${F};font-size:10px;letter-spacing:.3px;text-transform:uppercase;color:#fff;text-align:center;">${l}</th>`).join('') + `</tr>`;
    let body = '';
    rows.forEach((c, i) => {
      const bg = i % 2 ? '#F7F8FA' : '#FFFFFF';
      const cells = DOCS.map(([, key]) => cellHtml(c.cells[key], c.docs[key])).join('');
      const tag = c.deployable
        ? `<span style="font-family:${F};font-size:9px;font-weight:700;color:${S.expiring.tx};background:${S.expiring.bg};padding:1px 6px;border-radius:10px;">${esc(c.status)}</span>`
        : `<span style="font-family:${F};font-size:10px;color:${C.light};">${esc(c.status)}</span>`;
      body += `<tr style="background:${bg};"><td style="padding:7px 10px;border-bottom:1px solid ${C.border};"><div style="font-family:${F};font-size:12.5px;font-weight:600;color:${C.ink};">${esc(c.name)}</div><div style="padding-top:2px;">${tag}</div></td>${cells}</tr>`;
    });
    const more = truncated ? `<tr><td colspan="6" style="padding:9px 10px;font-family:${F};font-size:11px;color:${C.light};text-align:center;">+ ${truncated} more crew flagged — see the console.</td></tr>` : '';
    table = `<tr><td style="padding:12px 30px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${C.border};border-radius:8px;overflow:hidden;">${hdr}${body}${more}</table></td></tr>`;
  }

  return head(runDate) + banner + legend() + table + foot;
}

// --- delivery (self-contained; mirrors worker.sendViaMailer) -----------------
async function sendViaMailer(env, envelope) {
  if (!env.MAILER) return { ok: false, error: "MAILER binding missing" };
  try {
    const res = await env.MAILER.fetch("https://mailer/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: "cims-hr-console", from: env.MAIL_FROM || "CIMS <cims@cims.work>", ...envelope }),
    });
    const out = await res.json().catch(() => ({}));
    return out && typeof out === "object" ? out : { ok: false, error: "bad mailer response" };
  } catch (e) {
    return { ok: false, error: "mailer call threw: " + String((e && e.message) || e).slice(0, 300) };
  }
}

export async function renderDocRadar(env, runDate) {
  const today = nyDateStr();
  const rd = runDate || today;
  const { rows, counts, urgent, truncated } = await fetchDocRadar(env, today);
  return { html: buildDocRadarEmail({ runDate: rd, rows, counts, urgent, truncated }), count: counts.crew };
}

// toOverride: optional single address (or array) for a self-test — sends To that only, no CC.
export async function sendDocRadar(env, runDate, toOverride) {
  const { html, count } = await renderDocRadar(env, runDate);
  if (!env.MAILER) return { ok: false, sent: false, note: "no_mailer", count };
  const to = toOverride ? (Array.isArray(toOverride) ? toOverride : [toOverride]) : TO;
  const cc = toOverride ? [] : CC;
  const out = await sendViaMailer(env, {
    templateId: "hr.docradar.v1",
    to, cc,
    subject: `Fleet Document Radar · ${runDate} · ${count} flagged`,
    html,
    idempotencyKey: toOverride ? undefined : `docradar-${runDate}`,
    critical: true,
  });
  return { ok: !!out.ok, sent: !!out.ok, status: out.status || (out.ok ? "sent" : "failed"), to, cc, count };
}

// --- weekly cron: Monday 03:00 America/New_York, deduped ---------------------
export async function maybeSendDocRadar(env, event) {
  try {
    const now = event && event.scheduledTime ? new Date(event.scheduledTime) : new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(now);
    const get = t => (parts.find(x => x.type === t) || {}).value;
    if (get('weekday') !== 'Mon' || get('hour') !== '03') return;
    const runDate = nyDateStr(now);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS data_meta (k TEXT PRIMARY KEY, v TEXT)").run();
    const prev = await env.DB.prepare("SELECT v FROM data_meta WHERE k='docradar_last_sent'").first();
    if (prev && prev.v === runDate) return;
    const res = await sendDocRadar(env, runDate);
    if (res.sent) await env.DB.prepare("INSERT INTO data_meta (k,v) VALUES ('docradar_last_sent',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(runDate).run();
  } catch (e) { console.error("docradar_cron", (e && e.stack) || e); }
}

// --- HTTP handlers (return Response) -----------------------------------------
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

export async function docRadarPreviewResponse(env, url) {
  const date = url.searchParams.get('date') || undefined;
  const { html } = await renderDocRadar(env, date);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function docRadarSendResponse(request, env, session) {
  if (!session || !isMoneyUser(session.email)) return json({ error: "forbidden" }, 403);
  const b = await request.json().catch(() => ({}));
  const runDate = b.date || nyDateStr(new Date());
  const res = await sendDocRadar(env, runDate, b.to); // b.to (your address) => self-test, no CC
  return json(res);
}
