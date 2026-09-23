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
          // Is this date a FACT or a PLAN? The board already knows (onConfirmed/offConfirmed = the
          // Counter's actual date, or the tick Rita puts on a date she has confirmed). Carrying it
          // here is what lets the email say so instead of printing every date as if it were settled.
          confirmed: !!c.onConfirmed,
        });
      }
    }
    if (c.signOff && inWin(c.signOff)) {
      const key = c.agency_id + '|' + ymd(c.signOff);
      if (!seenOff.has(key)) {
        seenOff.add(key);
        signOffs.push({ name: c.name, vessel: c.ship, port: c.disembark || 'TBA', date: ymd(c.signOff), confirmed: !!c.offConfirmed });
      }
    }
  }
  return { signOns, signOffs };
}

// ---------------------------------------------------------------------------
// MOBILE FIRST (23 Sep 2026). Miguel, on the Outlook-iOS rendering: "looks
// horrible ... not cramped like that". It was four separate problems:
//   1. a fixed 600px desktop table with 30px side padding — on a phone the text
//      column collapsed to a sliver between two fat gutters;
//   2. 12.5px body copy, unreadable at arm's length;
//   3. name and status pill in two table cells side by side, so a long name
//      wrapped under a pill that had nowhere to go;
//   4. iOS data detectors turning every date into a blue underlined link.
// The layout is now fluid (max-width, never a fixed width), every card stacks
// into one column on a phone, the date gets a line of its own, and the detector
// styling is overridden. Nothing here changes what the email SAYS.
// ---------------------------------------------------------------------------

// Head CSS. Kept in one place: embedded <style> is the only lever that reaches
// the mobile apps, and every rule below is either a stack or a size bump.
const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap');
  /* iOS/Outlook turn dates and numbers into links. Let them; make them invisible. */
  a[x-apple-data-detectors], .nolink a {
    color: inherit !important; text-decoration: none !important; font-size: inherit !important;
    font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important;
    pointer-events: none !important;
  }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; max-width:100% !important; border-radius:12px !important; }
    .pagepad { padding:14px 10px !important; }
    .px { padding-left:14px !important; padding-right:14px !important; }
    .cardpad { padding:14px 15px !important; }
    /* two columns become two rows: a name never fights a pill for width */
    .stack { display:block !important; width:100% !important; max-width:100% !important;
             padding-left:0 !important; text-align:left !important; white-space:normal !important; }
    .stack-r { padding-top:9px !important; }
    .h1 { font-size:21px !important; }
    .nm { font-size:16px !important; }
    .sub, .dt, .note { font-size:14px !important; }
  }`;

// ---------------------------------------------------------------------------
// brand wordmark (email-safe, text-based; no external image needed)
// ---------------------------------------------------------------------------
function wordmark() {
  return `
  <tr><td class="px" style="background:${C.navy};padding:20px 28px 18px 28px;border-radius:14px 14px 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="stack" style="vertical-align:middle;">
        <div style="font-family:${FONTH};font-size:22px;font-weight:700;letter-spacing:5px;color:#FFFFFF;line-height:1;">CIMS</div>
        <div style="height:2px;width:34px;background:${C.green};margin:7px 0 6px 0;font-size:0;line-height:0;">&nbsp;</div>
        <div style="font-family:${FONT};font-size:8.5px;font-weight:600;letter-spacing:2.2px;text-transform:uppercase;color:rgba(255,255,255,0.6);">Cruise Industry Managed Services</div>
      </td>
      <td class="stack stack-r" align="right" style="vertical-align:top;">
        <div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Seafarer Movements</div>
        <div style="font-family:${FONT};font-size:8.5px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.4);padding-top:5px;">A division of <span style="color:${C.green};font-weight:700;">DG3</span></div>
      </td>
    </tr></table>
  </td></tr>`;
}

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------
function sectionHead(title, count, dot) {
  return `
  <tr><td class="px" style="padding:24px 28px 4px 28px;">
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};vertical-align:middle;margin-right:8px;"></span>
    <span style="font-family:${FONT};font-size:13.5px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:${C.ink};vertical-align:middle;">${title}</span>
    <span style="font-family:${FONT};font-size:13.5px;color:${C.lightSlate};vertical-align:middle;">&nbsp;·&nbsp;${count}</span>
  </td></tr>`;
}

function emptyCard(word) {
  return `
  <tr><td class="px" style="padding:8px 28px 0 28px;">
    <div class="sub" style="font-family:${FONT};font-size:13.5px;color:${C.lightSlate};padding:8px 0;">${word} scheduled in this window.</div>
  </td></tr>`;
}

function pill(bg, tx, label) {
  return `<span style="display:inline-block;background:${bg};color:${tx};font-family:${FONT};font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:4px 10px;border-radius:20px;white-space:nowrap;">${label}</span>`;
}

function badgeNewHire() {
  return ` ${pill(C.cloud, C.slate, 'New hire')}`;
}

// IS THIS DATE A FACT OR A PLAN? (Miguel, 23 Sep 2026.)
// Rita read a PROJECTED sign-off in this email as a settled fact on 21 Sep, could not see where it
// came from, and concluded the whole report was wrong. The date was right; the email simply never
// said what kind of date it was. Every date in this report now says so on its own line:
//   confirmed = a real sign-on/off is recorded (the Counter's actual date, or the tick in the console)
//   projected = the plan of record (TDG's projected sign-off, or a relief projection) — not a fact
// A projection is not a defect; printing one as though it were confirmed is.
function dateMark(confirmed) {
  const tx = confirmed ? C.greenInk : C.warnTx;
  const bg = confirmed ? C.okBg : C.warnBg;
  const word = confirmed ? 'confirmed' : 'projected';
  return ` <span style="display:inline-block;background:${bg};color:${tx};font-family:${FONT};font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:2px 8px;border-radius:5px;white-space:nowrap;">${word}</span>`;
}

// One card = one column of stacked lines: who, where, when. The right-hand cell
// (contract length, relief standing) drops UNDER that column on a phone instead
// of squeezing it.
function splitRow(left, right) {
  if (!right) return left;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="stack" style="vertical-align:top;">${left}</td>
      <td class="stack stack-r" align="right" style="vertical-align:top;white-space:nowrap;padding-left:12px;">${right}</td>
    </tr></table>`;
}

function nameLine(name, extra) {
  return `<div class="nm" style="font-family:${FONT};font-size:15.5px;font-weight:700;color:${C.ink};line-height:1.3;">${esc(name)}${extra || ''}</div>`;
}
function whereLine(vessel, port) {
  return `<div class="sub" style="font-family:${FONT};font-size:13.5px;color:${C.slate};padding-top:4px;line-height:1.45;">${esc(vessel)} &nbsp;·&nbsp; ${esc(port)}</div>`;
}
// The date gets a line to itself, in the body ink rather than the muted grey: it
// is the single thing every reader opens this email for.
function whenLine(word, date, confirmed) {
  return `<div class="dt nolink" style="font-family:${FONT};font-size:13.5px;font-weight:600;color:${C.ink};padding-top:7px;line-height:1.5;">${word} ${esc(fmtDay(date))}${dateMark(confirmed)}</div>`;
}

// card wrapper with a coloured left accent
function card(accent, inner) {
  return `
  <tr><td class="px" style="padding:9px 28px 0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FCFCFB;border:1px solid ${C.border};border-radius:12px;">
      <tr>
        <td width="5" style="width:5px;background:${accent};border-radius:12px 0 0 12px;font-size:0;line-height:0;">&nbsp;</td>
        <td class="cardpad" style="padding:15px 18px;">${inner}</td>
      </tr>
    </table>
  </td></tr>`;
}

function onCard(p) {
  // Contract length is a footnote to the arrival, so it follows the date. Stacked beside the name it
  // read as an orphan line between the seafarer and their ship.
  const len = p.contract && p.contract !== '—'
    ? `<div class="sub nolink" style="font-family:${FONT};font-size:12.5px;color:${C.lightSlate};padding-top:6px;line-height:1.5;">Contract · ${esc(p.contract)}</div>` : '';
  const inner = nameLine(p.name, p.newHire ? badgeNewHire() : '')
    + whereLine(p.vessel, p.port)
    + whenLine('on', p.date, p.confirmed)
    + len;
  return card(C.green, inner);
}

// The pill on the right of a departing card is about COVERAGE — is there a reliever — and it says
// "Relief ..." so it cannot be read as a statement about the DATE beside the name. Both words used
// to be a bare "Confirmed" on the same card, meaning two different things (caught in the rendered
// preview, 23 Sep 2026).
function reliefBits(r) {
  if (!r || r.state === 'unknown') return { accent: C.lightSlate, pill: '', sub: '' };
  if (r.state === 'confirmed') return { accent: C.okAccent,   pill: pill(C.okBg,   C.okTx,   'Relief confirmed'),   sub: `${esc(r.reliever || '')}${r.signon ? ' · ' + fmtShort(r.signon) : ''}` };
  if (r.state === 'planned')   return { accent: C.warnAccent, pill: pill(C.warnBg, C.warnTx, 'Relief unconfirmed'), sub: `${esc(r.reliever || '')}${r.signon ? ' · ' + fmtShort(r.signon) : ''}` };
  return { accent: C.badAccent, pill: pill(C.badBg, C.badTx, 'No relief'), sub: '' };
}

function offCard(p) {
  const rb = reliefBits(p.relief);
  // WHO RELIEVES THEM reads as a consequence of the sign-off, so it sits under the date — not beside
  // the name, where it pushed the vessel line down on a desktop and looked like part of it on a phone.
  const rsub = rb.sub ? `<div class="sub nolink" style="font-family:${FONT};font-size:12.5px;color:${C.lightSlate};padding-top:6px;line-height:1.5;">Relieved by ${rb.sub}</div>` : '';
  const inner = splitRow(nameLine(p.name), rb.pill || '')
    + whereLine(p.vessel, p.port)
    + whenLine('off', p.date, p.confirmed)
    + rsub;
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
  <tr><td class="px" style="padding:18px 28px 0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.warnBg};border:1px solid #F1DCB0;border-radius:12px;">
      <tr>
        <td width="5" style="width:5px;background:${C.warnAccent};border-radius:12px 0 0 12px;font-size:0;line-height:0;">&nbsp;</td>
        <td class="cardpad note" style="padding:12px 16px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.warnTx};">
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
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>Seafarer Movements</title>
<style>${STYLE}
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
 <tr><td align="center" class="pagepad" style="padding:30px 14px;">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;">

   ${wordmark()}

   <!-- title -->
   <tr><td class="px nolink" style="padding:24px 28px 2px 28px;">
     <div class="h1" style="font-family:${FONTH};font-size:24px;font-weight:700;color:${C.navy};line-height:1.25;letter-spacing:-0.2px;">Weekly crew movements</div>
     <div class="sub" style="font-family:${FONT};font-size:13.5px;color:${C.slate};padding-top:6px;line-height:1.5;">7-day window · <strong style="color:${C.ink};">${windowLabel}</strong></div>
   </td></tr>

   ${coverageBanner(uncovered, unconfirmed)}

   ${sectionHead('Arriving (sign-on)', ons.length, C.green)}
   ${onCards}

   ${sectionHead('Departing (sign-off)', offs.length, C.warnAccent)}
   ${offCards}

   <!-- footer -->
   <tr><td class="px" style="padding:26px 28px 26px 28px;">
     <div style="border-top:1px solid ${C.border};padding-top:16px;">
       <div class="note nolink" style="font-family:${FONT};font-size:12.5px;color:${C.slate};line-height:1.7;">
         <strong style="color:${C.ink};">Confirmed</strong> = a sign-on/off is recorded against the contract.
         <strong style="color:${C.ink};">Projected</strong> = the plan of record (TDG's projected date, or a relief projection) and still subject to change.
       </div>
       <div class="nolink" style="font-family:${FONT};font-size:11.5px;color:${C.lightSlate};line-height:1.7;padding-top:9px;">
         Movements within the next 7 days only. Source: CIMS Keyman board (our crew only).<br>
         Automated report · generated ${fmt(runDate)} 07:00 Miami time.
       </div>
     </div>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
}

export { buildSeafarerMovementEmail, shapeMovements, monthsLabel, C };
