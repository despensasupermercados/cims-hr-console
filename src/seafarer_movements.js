/**
 * CIMS — Seafarer Movements weekly email
 * --------------------------------------
 * Single source of truth for the HTML rendered every Monday 07:00 Miami time.
 *
 * Window logic:
 *   ARRIVING (sign-on)  = sign-on date  falls within [runDate, runDate + 7 days] inclusive
 *   DEPARTING (sign-off)= sign-off date falls within [runDate, runDate + 7 days] inclusive
 *
 * DESIGN (v2, brand): sleek card layout on the CIMS/DG3 brand system — navy
 * #1B3A5C header + wordmark, green #5FB946 accent, DM Sans / Outfit type with
 * web-safe fallbacks. Email-safe: table-based layout, every style inlined,
 * 600px max width, no flexbox/grid in the OUTPUT (they break in Outlook).
 * Each departing seat is a card with a coloured left accent = relief state, so
 * an uncovered seat is spotable in one glance.
 *
 * Data note: rows are derived live from rotationSections() (the Keyman board's
 * own source) and cover OUR Keyman crew only. `newHire` = crew with zero full
 * contracts on record. `contract` is the leg length derived from sign-on->off.
 */

// ---------------------------------------------------------------------------
// PALETTE — CIMS / DG3 brand system (the only place colors are defined).
// ---------------------------------------------------------------------------
const C = {
  navy:      '#1B3A5C',   // DG3 Navy — primary / header
  navyDeep:  '#142D48',   // Deep navy
  green:     '#5FB946',   // DG3 Green — accent
  greenInk:  '#357D2A',   // green text on light
  ink:       '#1F2A37',   // body headings
  slate:     '#6B7280',   // body text
  lightSlate:'#9CA3AF',   // muted
  cloud:     '#F3F4F6',   // backgrounds
  border:    '#E5E7EB',   // hairlines
  page:      '#EAEDF1',   // canvas behind the card
  card:      '#FFFFFF',
  // status accents
  okAccent:  '#5FB946', okBg:  '#E7F4E1', okTx:  '#357D2A',
  warnAccent:'#E0A64B', warnBg:'#FBF0DA', warnTx:'#8A6620',
  badAccent: '#DC2626', badBg: '#FDE7E7', badTx: '#9B1C1C',
};

const FONT  = "'DM Sans','Segoe UI',Helvetica,Arial,sans-serif";
const FONTH = "'Outfit','Segoe UI',Helvetica,Arial,sans-serif";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const DAY = 86400000;
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function atMidnight(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function fmt(d)  { d = new Date(d); return `${WD[d.getUTCDay()]} · ${String(d.getUTCDate()).padStart(2,'0')} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function fmtShort(d){ d = new Date(d); return `${String(d.getUTCDate()).padStart(2,'0')} ${MO[d.getUTCMonth()]}`; }
function fmtDay(d){ d = new Date(d); return `${WD[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2,'0')} ${MO[d.getUTCMonth()]}`; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ---- date-string window (tz-safe; data dates are 'YYYY-MM-DD') ----
function ymd(d){ if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0,10); return new Date(d).toISOString().slice(0,10); }
function addDaysStr(s, n){ const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
function monthsLabel(on, off){
  if (!on || !off) return '—';
  const days = (new Date(ymd(off)) - new Date(ymd(on))) / DAY;
  if (!(days > 0)) return '—';
  const m = Math.round(days / 30.44);
  return m <= 1 ? '1 month' : m + ' months';
}

// ---------------------------------------------------------------------------
// PURE: flatten rotation crew -> {signOns, signOffs} within the 7-day window.
// ---------------------------------------------------------------------------
function shapeMovements(crew, runDate, days = 7) {
  const start = ymd(runDate);
  const end = addDaysStr(start, days);
  const inWin = s => { s = s && ymd(s); return s && s >= start && s <= end; };
  const signOns = [], signOffs = [];
  const seenOn = new Set(), seenOff = new Set();
  for (const c of (crew || [])) {
    if (c.signOn && inWin(c.signOn)) {
      const key = c.agency_id + '|' + ymd(c.signOn);
      if (!seenOn.has(key)) {
        seenOn.add(key);
        signOns.push({
          name: c.name, vessel: c.ship, port: c.embark || 'TBA',
          date: ymd(c.signOn), contract: monthsLabel(c.signOn, c.signOff),
          newHire: (c.contracts || 0) === 0,
        });
      }
    }
    if (c.signOff && inWin(c.signOff)) {
      const key = c.agency_id + '|' + ymd(c.signOff);
      if (!seenOff.has(key)) {
        seenOff.add(key);
        signOffs.push({ name: c.name, vessel: c.ship, port: c.disembark || 'TBA', date: ymd(c.signOff) });
      }
    }
  }
  return { signOns, signOffs };
}

// ---------------------------------------------------------------------------
// brand wordmark (email-safe, text-based; no external image needed)
// ---------------------------------------------------------------------------
function wordmark() {
  return `
  <tr><td style="background:${C.navy};padding:20px 30px 18px 30px;border-radius:14px 14px 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">
        <div style="font-family:${FONTH};font-size:22px;font-weight:700;letter-spacing:5px;color:#FFFFFF;line-height:1;">CIMS</div>
        <div style="height:2px;width:34px;background:${C.green};margin:7px 0 6px 0;font-size:0;line-height:0;">&nbsp;</div>
        <div style="font-family:${FONT};font-size:8px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;color:rgba(255,255,255,0.6);">Cruise Industry Managed Services</div>
      </td>
      <td align="right" style="vertical-align:top;">
        <div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Seafarer Movements</div>
        <div style="font-family:${FONT};font-size:8px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.4);padding-top:6px;">A division of <span style="color:${C.green};font-weight:700;">DG3</span></div>
      </td>
    </tr></table>
  </td></tr>`;
}

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------
function sectionHead(title, count, dot) {
  return `
  <tr><td style="padding:22px 30px 2px 30px;">
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};vertical-align:middle;margin-right:8px;"></span>
    <span style="font-family:${FONT};font-size:13px;font-weight:600;color:${C.ink};vertical-align:middle;">${title}</span>
    <span style="font-family:${FONT};font-size:13px;color:${C.lightSlate};vertical-align:middle;">&nbsp;·&nbsp;${count}</span>
  </td></tr>`;
}

function emptyCard(word) {
  return `
  <tr><td style="padding:6px 30px 0 30px;">
    <div style="font-family:${FONT};font-size:13px;color:${C.lightSlate};padding:6px 0;">${word} scheduled in this window.</div>
  </td></tr>`;
}

function pill(bg, tx, label) {
  return `<span style="display:inline-block;background:${bg};color:${tx};font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 9px;border-radius:20px;white-space:nowrap;">${label}</span>`;
}

function badgeNewHire() {
  return ` ${pill(C.cloud, C.slate, 'New hire')}`;
}

// card wrapper with a coloured left accent
function card(accent, inner) {
  return `
  <tr><td style="padding:8px 30px 0 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FCFCFB;border:1px solid ${C.border};border-radius:10px;">
      <tr>
        <td width="4" style="background:${accent};border-radius:10px 0 0 10px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:13px 16px;">${inner}</td>
      </tr>
    </table>
  </td></tr>`;
}

function onCard(p) {
  const title = `<span style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${C.ink};">${esc(p.name)}</span>${p.newHire ? badgeNewHire() : ''}`;
  const sub = `${esc(p.vessel)} · ${esc(p.port)} · on ${esc(fmtDay(p.date))}`;
  const inner = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:top;">
        <div>${title}</div>
        <div style="font-family:${FONT};font-size:12.5px;color:${C.slate};padding-top:3px;">${sub}</div>
      </td>
      <td align="right" style="vertical-align:top;white-space:nowrap;">
        <div style="font-family:${FONT};font-size:12px;color:${C.lightSlate};">${esc(p.contract || '—')}</div>
      </td>
    </tr></table>`;
  return card(C.green, inner);
}

function reliefBits(r) {
  if (!r || r.state === 'unknown') return { accent: C.lightSlate, pill: `<span style="font-family:${FONT};font-size:12px;color:${C.lightSlate};">—</span>`, sub: '' };
  if (r.state === 'confirmed') return { accent: C.okAccent,   pill: pill(C.okBg,   C.okTx,   'Confirmed'),   sub: `${esc(r.reliever || '')}${r.signon ? ' · ' + fmtShort(r.signon) : ''}` };
  if (r.state === 'planned')   return { accent: C.warnAccent, pill: pill(C.warnBg, C.warnTx, 'Unconfirmed'), sub: `${esc(r.reliever || '')}${r.signon ? ' · ' + fmtShort(r.signon) : ''}` };
  return { accent: C.badAccent, pill: pill(C.badBg, C.badTx, 'No relief'), sub: '' };
}

function offCard(p) {
  const rb = reliefBits(p.relief);
  const sub = `${esc(p.vessel)} · ${esc(p.port)} · off ${esc(fmtDay(p.date))}`;
  const rsub = rb.sub ? `<div style="font-family:${FONT};font-size:12px;color:${C.lightSlate};padding-top:5px;">${rb.sub}</div>` : '';
  const inner = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:top;">
        <div style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${C.ink};">${esc(p.name)}</div>
        <div style="font-family:${FONT};font-size:12.5px;color:${C.slate};padding-top:3px;">${sub}</div>
      </td>
      <td align="right" style="vertical-align:top;white-space:nowrap;">
        ${rb.pill}${rsub}
      </td>
    </tr></table>`;
  return card(rb.accent, inner);
}

// Risk banner — shown above the sections when any departing seat lacks a
// confirmed relief. Renders nothing when every seat is covered.
function coverageBanner(uncovered, unconfirmed) {
  const total = uncovered + unconfirmed;
  if (total <= 0) return '';
  const parts = [];
  if (uncovered) parts.push(`${uncovered} with <strong>no relief in the system</strong>`);
  if (unconfirmed) parts.push(`${unconfirmed} <strong>unconfirmed</strong>`);
  return `
  <tr><td style="padding:18px 30px 0 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.warnBg};border:1px solid #F1DCB0;border-radius:10px;">
      <tr>
        <td width="4" style="background:${C.warnAccent};border-radius:10px 0 0 10px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:11px 15px;font-family:${FONT};font-size:12.5px;line-height:1.55;color:${C.warnTx};">
          <strong>Coverage alert:</strong> ${parts.join(' · ')}. Relief status reflects records in the console only — an empty seat may mean the reliever was never entered, not that none exists. Confirm with crewing.
        </td>
      </tr>
    </table>
  </td></tr>`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function buildSeafarerMovementEmail({ runDate = new Date(), signOns = [], signOffs = [] } = {}) {
  const startS = ymd(runDate), endS = addDaysStr(startS, 7);
  const inWin = s => { s = s && ymd(s); return s && s >= startS && s <= endS; };
  const byDate = (a,b) => ymd(a.date) < ymd(b.date) ? -1 : ymd(a.date) > ymd(b.date) ? 1 : 0;

  const ons  = signOns .filter(p => inWin(p.date)).sort(byDate);
  const offs = signOffs.filter(p => inWin(p.date)).sort(byDate);

  const onCards  = ons.length  ? ons.map(onCard).join('')   : emptyCard('No sign-ons');
  const offCards = offs.length ? offs.map(offCard).join('') : emptyCard('No sign-offs');

  const uncovered   = offs.filter(p => p.relief && p.relief.state === 'none').length;
  const unconfirmed = offs.filter(p => p.relief && p.relief.state === 'planned').length;

  const windowLabel = `${fmtShort(startS)} – ${fmtShort(endS)} ${endS.slice(0,4)}`;
  const coverageNote = uncovered ? ` · ${uncovered} uncovered` : '';
  const preheader = `${ons.length} arriving · ${offs.length} departing${coverageNote} · ${windowLabel}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Seafarer Movements</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap');
  @media only screen and (max-width:620px){ .wrap{width:100%!important} }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
 <tr><td align="center" style="padding:32px 14px;">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;">

   ${wordmark()}

   <!-- title -->
   <tr><td style="padding:24px 30px 2px 30px;">
     <div style="font-family:${FONTH};font-size:24px;font-weight:700;color:${C.navy};line-height:1.25;letter-spacing:-0.2px;">Weekly crew movements</div>
     <div style="font-family:${FONT};font-size:13px;color:${C.slate};padding-top:5px;">7-day window · <strong style="color:${C.ink};">${windowLabel}</strong></div>
   </td></tr>

   ${coverageBanner(uncovered, unconfirmed)}

   ${sectionHead('Arriving (sign-on)', ons.length, C.green)}
   ${onCards}

   ${sectionHead('Departing (sign-off)', offs.length, C.warnAccent)}
   ${offCards}

   <!-- footer -->
   <tr><td style="padding:26px 30px 26px 30px;">
     <div style="border-top:1px solid ${C.border};padding-top:14px;font-family:${FONT};font-size:11px;color:${C.lightSlate};line-height:1.6;">
       Automated report · generated ${fmt(runDate)} 07:00 Miami time.<br>
       Movements within the next 7 days only. Source: CIMS Keyman board (our crew only).
     </div>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
}

export { buildSeafarerMovementEmail, shapeMovements, monthsLabel, C };
