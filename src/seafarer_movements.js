/**
 * CIMS — Seafarer Movements weekly email
 * --------------------------------------
 * Single source of truth for the HTML rendered every Monday 07:00 Miami time.
 *
 * Window logic:
 *   ARRIVING (sign-on)  = sign-on date  falls within [runDate, runDate + 7 days] inclusive
 *   DEPARTING (sign-off)= sign-off date falls within [runDate, runDate + 7 days] inclusive
 *
 * Email-safety: table-based layout, every style inlined, web-safe fonts,
 * 600px max width. No flexbox/grid/CSS-variables in the OUTPUT (they break in
 * Outlook). The palette below lives ONCE here and is inlined at render time.
 *
 * Data note: rows are derived live from rotationSections() (the Keyman board's
 * own source) and cover OUR Keyman crew only. `newHire` = crew with zero full
 * contracts on record (best-effort signal; conservative — favours not labelling
 * a veteran). `contract` is the leg length in months derived from sign-on->off.
 */

// ---------------------------------------------------------------------------
// PALETTE — the only place colors are defined.
// ---------------------------------------------------------------------------
const C = {
  brand:    '#0B2A4A',
  accentOn: '#157A5B',
  accentOff:'#B45309',
  badgeBg:  '#FEF3C7',
  badgeTx:  '#92400E',
  ink:      '#1A2430',
  muted:    '#6B7280',
  rule:     '#E5E7EB',
  rowAlt:   '#F7F8FA',
  page:     '#EEF1F4',
  card:     '#FFFFFF',
};

const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const DAY = 86400000;
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function atMidnight(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function fmt(d)  { d = new Date(d); return `${WD[d.getUTCDay()]} · ${String(d.getUTCDate()).padStart(2,'0')} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function fmtShort(d){ d = new Date(d); return `${String(d.getUTCDate()).padStart(2,'0')} ${MO[d.getUTCMonth()]}`; }
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
// `crew` = array of board entries each like
//   { agency_id, name, ship, embark, disembark, signOn, signOff, contracts }
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
// row + section rendering
// ---------------------------------------------------------------------------
function cell(content, opts = {}) {
  const { align = 'left', bold = false, muted = false, width } = opts;
  const color = muted ? C.muted : C.ink;
  const weight = bold ? 'bold' : 'normal';
  const w = width ? `width:${width};` : '';
  return `<td style="padding:11px 14px;font-family:${FONT};font-size:13px;line-height:1.4;color:${color};font-weight:${weight};text-align:${align};border-bottom:1px solid ${C.rule};${w}vertical-align:top;">${content}</td>`;
}

function badge() {
  return ` <span style="display:inline-block;background:${C.badgeBg};color:${C.badgeTx};font-size:10px;font-weight:bold;letter-spacing:.4px;padding:2px 7px;border-radius:10px;text-transform:uppercase;white-space:nowrap;">New hire</span>`;
}

function header(rows, kind) {
  const cols = kind === 'on'
    ? ['Seafarer','Vessel','Port','Sign-on','Contract']
    : ['Seafarer','Vessel','Port','Sign-off'];
  const ths = cols.map((c) =>
    `<th style="padding:9px 14px;font-family:${FONT};font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#FFFFFF;text-align:left;font-weight:bold;">${c}</th>`
  ).join('');
  return `<tr bgcolor="${C.brand}" style="background:${C.brand};">${ths}</tr>`;
}

function onRow(p, idx) {
  const bg = idx % 2 ? C.rowAlt : C.card;
  const name = esc(p.name) + (p.newHire ? badge() : '');
  return `<tr bgcolor="${bg}" style="background:${bg};">`
    + cell(name, { bold: true, width: '26%' })
    + cell(esc(p.vessel), { width: '22%' })
    + cell(esc(p.port), { width: '18%' })
    + cell(fmt(p.date), { width: '20%' })
    + cell(esc(p.contract || '—'), { muted: true, width: '14%' })
    + `</tr>`;
}

function offRow(p, idx) {
  const bg = idx % 2 ? C.rowAlt : C.card;
  return `<tr bgcolor="${bg}" style="background:${bg};">`
    + cell(esc(p.name), { bold: true, width: '30%' })
    + cell(esc(p.vessel), { width: '28%' })
    + cell(esc(p.port), { width: '22%' })
    + cell(fmt(p.date), { width: '20%' })
    + `</tr>`;
}

function emptyRow(kind) {
  const span = kind === 'on' ? 5 : 4;
  const word = kind === 'on' ? 'No sign-ons' : 'No sign-offs';
  return `<tr><td colspan="${span}" style="padding:22px 14px;text-align:center;font-family:${FONT};font-size:13px;color:${C.muted};border-bottom:1px solid ${C.rule};">${word} scheduled in this window.</td></tr>`;
}

function section(title, accent, count, kind, rowsHtml) {
  return `
  <tr><td style="padding:26px 0 8px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:0 0 8px 0;font-family:${FONT};">
          <span style="display:inline-block;width:10px;height:10px;background:${accent};border-radius:2px;vertical-align:middle;margin-right:8px;"></span>
          <span style="font-size:15px;font-weight:bold;color:${C.ink};vertical-align:middle;letter-spacing:.2px;">${title}</span>
          <span style="font-size:13px;color:${C.muted};vertical-align:middle;">&nbsp;·&nbsp;${count}</span>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${C.rule};border-radius:6px;overflow:hidden;">
      ${header(null, kind)}
      ${rowsHtml}
    </table>
  </td></tr>`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function buildSeafarerMovementEmail({ runDate = new Date(), signOns = [], signOffs = [] } = {}) {
  const start = atMidnight(runDate);
  const end = new Date(start.getTime() + 7 * DAY);
  const startS = ymd(runDate), endS = addDaysStr(startS, 7);
  const inWin = s => { s = s && ymd(s); return s && s >= startS && s <= endS; };

  const ons  = signOns .filter(p => inWin(p.date)).sort((a,b)=> ymd(a.date) < ymd(b.date) ? -1 : ymd(a.date) > ymd(b.date) ? 1 : 0);
  const offs = signOffs.filter(p => inWin(p.date)).sort((a,b)=> ymd(a.date) < ymd(b.date) ? -1 : ymd(a.date) > ymd(b.date) ? 1 : 0);

  const onRows  = ons.length  ? ons.map(onRow).join('')   : emptyRow('on');
  const offRows = offs.length ? offs.map(offRow).join('') : emptyRow('off');

  const windowLabel = `${fmtShort(startS)} – ${fmtShort(endS)} ${endS.slice(0,4)}`;
  const preheader = `${ons.length} arriving · ${offs.length} departing · ${windowLabel}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Seafarer Movements</title>
<style>
  @media only screen and (max-width:620px){
    .wrap{width:100%!important}
    td{font-size:12px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
 <tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

   <!-- brand bar -->
   <tr><td bgcolor="${C.brand}" style="background:${C.brand};padding:18px 24px;border-radius:8px 8px 0 0;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
       <td style="font-family:${FONT};font-size:18px;font-weight:bold;color:#FFFFFF;letter-spacing:1px;">CIMS</td>
       <td align="right" style="font-family:${FONT};font-size:11px;color:#AEC1D6;letter-spacing:.5px;">SEAFARER MOVEMENTS</td>
     </tr></table>
   </td></tr>

   <!-- title block -->
   <tr><td bgcolor="${C.card}" style="background:${C.card};padding:22px 24px 4px 24px;">
     <div style="font-family:${FONT};font-size:21px;font-weight:bold;color:${C.ink};line-height:1.25;">Weekly crew movements</div>
     <div style="font-family:${FONT};font-size:13px;color:${C.muted};padding-top:5px;">7-day window · <strong style="color:${C.ink};">${windowLabel}</strong></div>
   </td></tr>

   <!-- sections -->
   <tr><td bgcolor="${C.card}" style="background:${C.card};padding:0 24px 8px 24px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
       ${section('Arriving (sign-on)', C.accentOn, ons.length, 'on', onRows)}
       ${section('Departing (sign-off)', C.accentOff, offs.length, 'off', offRows)}
     </table>
   </td></tr>

   <!-- footer -->
   <tr><td bgcolor="${C.card}" style="background:${C.card};padding:18px 24px 24px 24px;border-radius:0 0 8px 8px;border-top:1px solid ${C.rule};">
     <div style="font-family:${FONT};font-size:11px;color:${C.muted};line-height:1.6;">
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
