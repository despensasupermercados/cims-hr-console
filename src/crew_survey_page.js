// THE CREW SURVEY PAGE — the seafarer's own link, no login (the link is the key), the design Miguel approved on 23 Oct 2026
// (docs/mockups/crew_survey_20261022/survey.html): five short screens, 19 taps, one line in his own words, light on the eye,
// CIMS colours. Pure: (model) => HTML. The page posts its answers to its own address; the server checks every one again
// (crew_survey.checkAnswers). Pinned by test/crew_survey.test.js (the inline script runs in node:vm).
import { QUESTIONS, SECTIONS, SCALE, FIX_QUESTION, statementFor } from "./crew_survey.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// A JSON blob safe inside <script>: no "</script>", no U+2028/2029.
const safeJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
export const BRAND_NAME = { Royal: "Royal Caribbean", Celebrity: "Celebrity Cruises", Azamara: "Azamara", NCL: "Norwegian Cruise Line" };
export const BRAND_DOT = { Royal: "#1E6FD0", Celebrity: "#2B2B2B", Azamara: "#0E5A7A", NCL: "#0A3D91" };

const CSS = `
:root{--navy:#1B3A5C;--deep:#142D48;--green:#5FB946;--gink:#3E7F2E;--mint:#EAF5E4;--bg:#F5F6F2;--card:#FFFFFF;--ink:#16293D;--body:#3F4A57;--mut:#7A8594;--line:#E6E9E2;--red:#B4483A}
*{box-sizing:border-box;margin:0;padding:0}html,body{background:var(--bg)}
body{font-family:'DM Sans',Helvetica,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
h1,h2{font-family:'Outfit',Helvetica,Arial,sans-serif;letter-spacing:-.015em}
button{font:inherit;cursor:pointer}
.wrap{max-width:560px;margin:0 auto;padding:18px 18px 64px}
.top{display:flex;align-items:center;justify-content:space-between;padding:6px 2px 18px}
.wm{font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:800;font-size:17px;letter-spacing:4px;color:var(--navy);line-height:1}
.wm i{display:block;width:44px;height:2px;background:var(--green);margin-top:5px}
.chip{font-size:11.5px;font-weight:700;color:var(--navy);background:#fff;border:1px solid var(--line);padding:6px 11px;border-radius:99px;display:flex;align-items:center;gap:7px}
.chip i{width:8px;height:8px;border-radius:50%;background:var(--brand,#1E6FD0)}
.card{background:var(--card);border-radius:24px;box-shadow:0 1px 2px rgba(22,41,61,.04),0 8px 28px rgba(22,41,61,.06);padding:26px 22px}
.eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gink)}
.hero h1{font-size:34px;line-height:1.08;margin:12px 0 10px;color:var(--deep)}.hero h1 em{font-style:normal;color:var(--mut)}
.hero p{font-size:16px;line-height:1.55;color:var(--body)}
.strip{margin:22px 0 4px;border-radius:18px;background:linear-gradient(135deg,#1B3A5C,#24507c);color:#fff;padding:18px 18px 16px;position:relative;overflow:hidden}
.strip:after{content:"";position:absolute;right:-30px;top:-30px;width:140px;height:140px;border-radius:50%;background:rgba(95,185,70,.18)}
.strip .ship{font-family:'Outfit',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;position:relative}
.strip .ln{font-size:12px;color:#B9C7D8;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px}
.strip .row{display:flex;gap:18px;margin-top:14px;position:relative}
.strip .row div{font-size:11px;color:#B9C7D8;letter-spacing:.08em;text-transform:uppercase}
.strip .row b{display:block;font-family:'Outfit',Helvetica,Arial,sans-serif;font-size:16px;color:#fff;letter-spacing:0;text-transform:none;margin-top:3px}
.facts{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 22px}.facts span{font-size:13px;color:var(--body);background:var(--bg);padding:7px 12px;border-radius:99px}.facts b{color:var(--ink)}
.go{display:block;width:100%;border:0;border-radius:16px;background:var(--green);color:#fff;font-weight:700;font-size:17px;padding:17px;box-shadow:0 6px 16px rgba(95,185,70,.32);transition:transform .12s}
.go:active{transform:scale(.985)}.go[disabled]{background:#C8D3C2;box-shadow:none;cursor:default}
.fine{text-align:center;font-size:12.5px;color:var(--mut);margin-top:12px;line-height:1.5}
.prog{display:flex;gap:6px;margin:4px 2px 18px}.prog i{flex:1;height:5px;border-radius:99px;background:#DFE4DA}
.prog i.pd{background:var(--green)}.prog i.pn{background:linear-gradient(90deg,var(--green) var(--p,0%),#DFE4DA var(--p,0%))}
.shead{display:flex;align-items:baseline;justify-content:space-between;margin:0 2px 6px}.shead h2{font-size:24px;color:var(--deep)}.shead small{font-size:12.5px;color:var(--mut)}
.sintro{font-size:14.5px;color:var(--body);margin:0 2px 16px;line-height:1.5}
.q{background:#fff;border-radius:20px;padding:18px 16px 16px;margin-bottom:12px;box-shadow:0 1px 2px rgba(22,41,61,.04),0 4px 16px rgba(22,41,61,.04);border:1.5px solid transparent;transition:border-color .15s}
.q.ans{border-color:#D7EBCD}.q p{font-size:16px;line-height:1.4;font-weight:600;color:var(--ink);margin-bottom:14px}
.scale{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
.scale button{border:1.5px solid var(--line);background:#FAFBF8;border-radius:14px;padding:10px 0 8px;display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--body);transition:all .12s}
.scale button b{font-family:'Outfit',Helvetica,Arial,sans-serif;font-size:19px;color:var(--ink)}
.scale button span{font-size:10px;line-height:1.1;text-align:center;min-height:11px}
.scale button:hover{border-color:#C9D6C1}
.scale button.on{background:var(--navy);border-color:var(--navy);color:#C8D6E6}.scale button.on b{color:#fff}
.scale button.on.lo{background:var(--red);border-color:var(--red);color:#F6D9D3}
.ends{font-size:11px;color:var(--mut);margin-top:7px;padding:0 4px}
textarea{width:100%;min-height:120px;border:1.5px solid var(--line);border-radius:16px;padding:14px;font:15px/1.5 'DM Sans',Helvetica,Arial,sans-serif;color:var(--ink);background:#FAFBF8;resize:vertical}
textarea:focus{outline:none;border-color:var(--green);background:#fff}
.nav{display:flex;gap:10px;margin-top:8px}.back{border:1.5px solid var(--line);background:#fff;color:var(--navy);font-weight:700;border-radius:16px;padding:16px 18px}.nav .go{flex:1}
.left{font-size:12.5px;color:var(--mut);text-align:center;margin-top:10px}.err{color:var(--red);font-weight:700}
.done{text-align:center;padding:34px 22px 28px}.tick{width:84px;height:84px;border-radius:50%;background:var(--mint);margin:0 auto 18px;display:grid;place-items:center}
.tick svg{width:42px;height:42px}.tick path{stroke:var(--green);stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:48;stroke-dashoffset:48;animation:draw .5s .15s ease forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.done h1{font-size:30px;color:var(--deep);line-height:1.1;margin-bottom:10px}.done p{font-size:15.5px;color:var(--body);line-height:1.55;max-width:38ch;margin:0 auto}
.copy{margin:22px auto 0;background:var(--bg);border-radius:16px;padding:14px 16px;text-align:left;font-size:13.5px;color:var(--body);line-height:1.5}.copy b{color:var(--ink)}
.sign{margin-top:22px;font-size:13.5px;color:var(--mut)}.sign b{display:block;color:var(--ink);font-size:15px}
.foot{text-align:center;font-size:11.5px;color:var(--mut);margin-top:26px;line-height:1.6}
@media (max-width:420px){.hero h1{font-size:30px}.scale button span{font-size:9px}}`;

const shell = (title, brand, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body style="--brand:${BRAND_DOT[brand] || "#1E6FD0"}">
<div class="wrap"><div class="top"><div class="wm">CIMS<i></i></div>${brand && BRAND_NAME[brand] ? `<div class="chip"><i></i><span>${esc(BRAND_NAME[brand])}</span></div>` : ""}</div>
${body}
<div class="foot">Cruise Industry Managed Services · a division of DG3<br>Your link is yours alone. No login, nothing to install.</div></div></body></html>`;

// The browser side. Plain ES5, no template literals and no backslashes: it rides inside a JS module as a string.
const CLIENT = `
var M = JSON.parse(document.getElementById('m').textContent);
var LBL = M.scale, step = 0, ans = {}, fix = '', busy = false, err = '', t0 = null;
function $(s){ return document.querySelector(s); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function total(){ return M.keys.length; }
function answered(){ return Object.keys(ans).length; }
function render(){
  var h = '';
  if (step === 0) {
    h = '<div class="card hero"><div class="eyebrow">Contract complete</div>'
      + '<h1>How was ' + esc(M.shipShort) + ', ' + esc(M.first) + '?<br><em>Tell us straight.</em></h1>'
      + '<p>You know what worked and what got in the way better than anyone. Three minutes, and every answer is read by the CIMS team.</p>'
      + '<div class="strip"><div class="ln">Your contract</div><div class="ship">' + esc(M.ship) + '</div>'
      + '<div class="row"><div>Signed on<b>' + esc(M.on) + '</b></div><div>Signed off<b>' + esc(M.off) + '</b></div><div>Aboard<b>' + esc(M.aboard) + '</b></div></div></div>'
      + '<div class="facts"><span><b>3</b> minutes</span><span><b>' + M.keys.length + '</b> quick taps</span><span><b>1</b> line in your words</span></div>'
      + '<button class="go" onclick="go(1)">Start</button>'
      + '<div class="fine">Your answers go to the CIMS team, never to the cruise line, and they never touch your bonus.</div></div>';
  } else if (step <= M.sections.length) {
    var S = M.sections[step - 1];
    var inS = S.qs.filter(function(q){ return ans[q.key]; }).length;
    h = '<div class="prog">' + M.sections.map(function(_, j){ return j < step - 1 ? '<i class="pd"></i>' : j === step - 1 ? '<i class="pn" style="--p:' + Math.round(inS / S.qs.length * 100) + '%"></i>' : '<i></i>'; }).join('') + '</div>'
      + '<div class="shead"><h2>' + esc(S.title) + '</h2><small>' + step + ' of ' + M.sections.length + '</small></div><div class="sintro">' + esc(S.intro) + '</div>';
    S.qs.forEach(function(q){
      var v = ans[q.key];
      h += '<div class="q' + (v ? ' ans' : '') + '"><p>' + esc(q.text) + '</p><div class="scale">'
        + [1,2,3,4,5].map(function(x){ return '<button type="button" class="' + (v === x ? 'on' + (x <= 2 ? ' lo' : '') : '') + '" onclick="pick(' + "'" + q.key + "'" + ',' + x + ')"><b>' + x + '</b><span>' + LBL[x - 1] + '</span></button>'; }).join('')
        + '</div></div>';
    });
    if (S.open) {
      h += '<div class="q' + (fix ? ' ans' : '') + '"><p>' + esc(M.fixQ) + '</p>'
        + '<textarea id="fix" maxlength="2000" placeholder="Hotel before embarking, a part that never arrived, training you wish you had... anything." oninput="fix=this.value">' + esc(fix) + '</textarea>'
        + '<div class="ends">Optional, but this is the one we act on.</div></div>';
    }
    var ok = inS === S.qs.length && !busy, last = step === M.sections.length;
    h += '<div class="nav"><button class="back" onclick="go(' + (step - 1) + ')">Back</button>'
      + '<button class="go"' + (ok ? '' : ' disabled') + ' onclick="' + (last ? 'send()' : 'go(' + (step + 1) + ')') + '">' + (busy ? 'Sending...' : last ? 'Send my answers' : 'Next') + '</button></div>'
      + '<div class="left">' + (err ? '<span class="err">' + esc(err) + '</span>' : (total() - answered()) + ' to go' + (last ? ' · you can change any answer before you send' : '')) + '</div>';
  } else {
    h = '<div class="card done"><div class="tick"><svg viewBox="0 0 48 48"><path d="M13 25 l8 8 l15 -17"/></svg></div>'
      + '<h1>Thank you, ' + esc(M.first) + (String(M.first || '').slice(-1) === '.' ? '' : '.') + '</h1>'
      + '<p>Your answers are with the CIMS team. We read every one, and what you tell us shapes how we support the next contract.</p>'
      + (M.email ? '<div class="copy">A copy of your answers is on its way to <b>' + esc(M.email) + '</b>, with Onboard Support in copy, so you can reply to it any time.</div>' : '')
      + '<div class="sign"><b>Rita Berenyi</b>Manager, People &amp; Culture · enjoy your time home</div></div>';
  }
  $('#app').innerHTML = h;
}
function pick(k, x){ ans[k] = x; err = ''; var t = document.getElementById('fix'); if (t) fix = t.value; render(); }
function go(s){ var t = document.getElementById('fix'); if (t) fix = t.value; if (s === 1 && !t0) t0 = Date.now(); step = s; err = ''; render(); window.scrollTo(0, 0); }
function send(){
  if (busy) return; var t = document.getElementById('fix'); if (t) fix = t.value;
  if (document.body.getAttribute('data-preview')) { step = M.sections.length + 1; render(); window.scrollTo(0, 0); return; }
  busy = true; err = ''; render();
  fetch(location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: ans, fix: fix, secs: t0 ? Math.round((Date.now() - t0) / 1000) : null }) })
    .then(function(r){ return r.json().catch(function(){ return { ok: false, error: 'HTTP ' + r.status }; }); })
    .then(function(d){ busy = false; if (d && d.ok) { step = M.sections.length + 1; render(); window.scrollTo(0, 0); } else { err = d && d.error === 'already_sent' ? 'These answers were already sent. Thank you.' : d && d.error === 'closed' ? 'This link has closed.' : 'Could not send. Check your signal and try again.'; render(); } })
    .catch(function(){ busy = false; err = 'Could not send. Check your signal and try again.'; render(); });
}
render();`;

// m: { first, ship, shipShort, brand, on, off, aboard, email (masked) }
export function surveyPage(m) {
  const model = {
    first: m.first || "there", ship: m.ship || "", shipShort: m.shipShort || m.ship || "your ship", on: m.on || "", off: m.off || "", aboard: m.aboard || "", email: m.email || null,
    scale: SCALE, fixQ: FIX_QUESTION, keys: QUESTIONS.map((q) => q.key),
    sections: SECTIONS.map((s) => ({ title: s.title, intro: s.intro, open: !!s.open, qs: s.keys.map((k) => { const q = QUESTIONS.find((x) => x.key === k); return { key: k, text: statementFor(q, m.brand) }; }) })),
  };
  return shell("Your contract, in your words · CIMS", m.brand, `<div id="app"></div><script id="m" type="application/json">${safeJson(model)}</script><script>${CLIENT}</script>`);
}

// Answers already sent: the thank-you, never the form again.
export function surveyThanksPage(m) {
  return shell("Thank you · CIMS", m && m.brand, `<div class="card done"><div class="tick"><svg viewBox="0 0 48 48"><path d="M13 25 l8 8 l15 -17"/></svg></div>
<h1>Thank you, ${esc((m && m.first) || "there")}${/\.$/.test(String((m && m.first) || "")) ? "" : "."}</h1><p>Your answers reached the CIMS team${m && m.when ? " on " + esc(m.when) : ""}. We read every one. Something to add? Reply to the copy in your inbox.</p></div>`);
}
export function surveyGonePage() {
  return shell("Link closed · CIMS", null, `<div class="card done"><h1>This link has closed.</h1><p>Survey links stay open for 30 days. If you still want to tell us something, reply to Rita's email: she reads every one.</p></div>`);
}
export { CLIENT as SURVEY_CLIENT_JS };
