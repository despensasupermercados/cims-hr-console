// UI page templates for the HR console. Moved VERBATIM from src/worker.js —
// every string byte is unchanged; APP_HTML is reassembled from two part
// modules purely because of its size.
import { STYLE } from "./ui_style.js";
import { APP_HTML_1 } from "./ui_app_1.js";
import { APP_HTML_2 } from "./ui_app_2.js";

const LOGIN_HTML = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>DG3 CIMS · Sign in</title>
<link rel=icon href="/favicon.ico" sizes=any><link rel=apple-touch-icon href="/apple-touch-icon.png">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}
#g{min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,var(--deep),var(--navy));padding:24px}
.box{background:#fff;border-radius:16px;padding:34px 30px;width:360px;max-width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
.box h1{color:var(--navy);font-size:20px;margin:14px 0 4px}.box p{color:var(--mut);font-size:13px;margin-bottom:20px}
.box input{width:100%;text-align:center}.box button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:10px;background:var(--green);color:#fff;font-weight:700;font-family:'Outfit';font-size:15px;cursor:pointer}
.msg{font-size:12.5px;margin-top:12px;min-height:16px;color:var(--mut)}
</style></head><body><div id=g><div class=box>
<div class=brandmark style="margin:0 auto">D</div>
<h1>HR Operational Console</h1><p>DG3 Cruise Industry Managed Services</p>
<input id=email type=email placeholder="you@dg3.com" autocomplete=email>
<button onclick="req()">Send sign-in link</button>
<div class=msg id=msg></div>
<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
<a href="#" id=keytoggle style="color:var(--royal);font-size:12.5px;text-decoration:none">Sign in with access key</a>
<div id=keybox style="display:none;margin-top:10px">
<input id=akey type=password placeholder="Access key" autocomplete=off>
<button onclick="keyLogin()" style="background:var(--navy)">Sign in</button>
</div></div>
</div></div>
<script>
async function req(){
  const email=document.getElementById('email').value.trim();
  const msg=document.getElementById('msg');
  if(!email){msg.textContent='Enter your email.';return;}
  msg.textContent='Working…';
  const r=await fetch('/api/auth/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  const d=await r.json();
  if(d.sent){msg.textContent='If that address is authorized, a sign-in link is on its way.';}
  else{msg.innerHTML='Email isn\\'t set up yet. Use your access key below to sign in.';}
}
document.getElementById('keytoggle').addEventListener('click',function(e){e.preventDefault();var b=document.getElementById('keybox');b.style.display=(b.style.display==='none')?'block':'none';if(b.style.display==='block')document.getElementById('akey').focus();});
async function keyLogin(){
  var email=document.getElementById('email').value.trim();
  var key=document.getElementById('akey').value.trim();
  var msg=document.getElementById('msg');
  if(!email){msg.textContent='Enter your email first.';return;}
  if(!key){msg.textContent='Enter your access key.';return;}
  msg.textContent='Signing in…';
  var r=await fetch('/auth/dev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,key:key})});
  if(r.ok){location.href='/';}else{msg.textContent='Invalid email or access key.';}
}
document.getElementById('email').addEventListener('keydown',e=>{if(e.key==='Enter')req();});
</script></body></html>`;

const FB_HTML = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>CIMS Crew Feedback</title>
<link rel=icon href="/favicon.ico" sizes=any><link rel=apple-touch-icon href="/apple-touch-icon.png">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}#fbwrap{max-width:620px;margin:0 auto;padding:26px 18px}.fhd{display:flex;align-items:center;gap:12px;margin-bottom:6px}.card2{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 2px 10px rgba(20,45,72,.07);padding:20px 22px;margin-top:14px}</style>
</head><body><div id=fbwrap>
<div class=fhd><div class=brandmark>D</div><div><div style="font-family:'Outfit';font-weight:700;color:var(--navy)">DG3 CIMS — Crew Feedback</div><div class=hint id=fbsub>Loading…</div></div></div>
<div id=fbbody></div></div>
<script>
var T=new URLSearchParams(location.search).get('t');
var ROLE=null;
function sel(id,opts,val){return '<select id='+id+'>'+opts.map(function(o){return '<option'+(o===val?' selected':'')+'>'+o+'</option>';}).join('')+'</select>';}
function ta(id,v){return '<textarea id='+id+' rows=2>'+(v||'')+'</textarea>';}
async function start(){
  if(!T){document.getElementById('fbsub').textContent='Missing link token.';return;}
  var d=await (await fetch('/api/feedback/form?t='+encodeURIComponent(T))).json();
  if(d.error){document.getElementById('fbbody').innerHTML='<div class=card2><b>This link is invalid or has expired.</b><div class=hint style="margin-top:6px">Please ask Rita for a new feedback link.</div></div>';document.getElementById('fbsub').textContent='';return;}
  if(d.locked){document.getElementById('fbsub').textContent=d.roleLabel+' · '+d.crew;document.getElementById('fbbody').innerHTML='<div class=card2 style="text-align:center"><div style="font-family:Outfit;font-weight:800;color:var(--green-d);font-size:20px">✓ Already submitted</div><div class=hint style="margin-top:6px">This feedback window has been completed and is now closed. Thank you.</div></div>';return;}
  ROLE=d.role;var a=d.answers||{};
  document.getElementById('fbsub').textContent=d.roleLabel+' · '+d.crew+(d.vessel?(' · '+d.vessel):'');
  var f='';
  if(d.role==='ray'){
    f+='<div class=fg><label>Did any order fail / need a rush or emergency shipment?</label>'+sel('order',['No','Yes'],a.order||'No')+'</div>'
     +'<div class=fg><label>If yes — cause</label>'+sel('rushcause',['N/A','Crew ordering failure','Legitimate (machine / added sailing / port)'],a.rushcause||'N/A')+'<div class=hint>Only "Crew ordering failure" arms the rush gate.</div></div>'
     +'<div class=fg><label>Rush cost (USD)</label><input id=rushcost type=number min=0 value="'+(a.rushcost||'')+'" placeholder="e.g. 3000"></div>'
     +'<div class=fg><label>Orders placed on time (par respected)?</label>'+sel('ontime',['Always','Mostly','Often late'],a.ontime||'Always')+'</div>'
     +'<div class=fg><label>Order accuracy</label>'+sel('acc',['Accurate','Minor errors','Frequent errors'],a.acc||'Accurate')+'</div>'
     +'<div class=fg><label>Par maintained at handover</label>'+sel('par',['Maintained','Some gaps','Not maintained'],a.par||'Maintained')+'</div>'
     +'<div class=fg><label>Failed end-of-contract inventory audit?</label>'+sel('audit',['No','Yes'],a.audit||'No')+'</div>'
     +'<div class=fg><label>Note / evidence (optional)</label>'+ta('note',a.note)+'</div>';
  } else if(d.role==='rolando'){
    f+='<div class=fg><label>PROD Service Performance</label><div class=hint>Machine clean &amp; serviceable at handover? · Technical ability, error-code resolution.</div>'+sel('clean',['Excellent','Acceptable','Poor'],a.clean||'Excellent')+'</div>'
     +'<div class=fg><label>MFD Service Performance</label><div class=hint>Preventive maintenance done correctly? · Independent service, SOP adherence &amp; quality.</div>'+sel('pm',['Excellent','Acceptable','Poor'],a.pm||'Excellent')+'</div>'
     +'<div class=fg><label>Information / Database Knowledge</label><div class=hint>Unresolved technical issues left for the reliever? · Correct part numbers, use of technical data.</div>'+sel('unres',['Excellent','Acceptable','Poor'],a.unres||'Excellent')+'</div>'
     +'<div class=fg><label>Note / evidence (optional)</label>'+ta('note',a.note)+'</div>';
  } else {
    f+='<div class=fg><label>Did you assess this crew this contract?</label>'+sel('assessed',['No (N/A)','Yes'],a.assessed||'No (N/A)')+'</div>'
     +'<div class=fg><label>Mono click % this contract (&lt;20% target)</label><input id=mono type=number min=0 max=100 step=0.1 value="'+(a.mono||'')+'" placeholder="e.g. 14"><div class=hint>Feeds the Mono discipline sub-score.</div></div>'
     +'<div class=fg><label>Inventory observations</label>'+ta('inv',a.inv)+'</div>'
     +'<div class=fg><label>Technical observations</label>'+ta('tech',a.tech)+'</div>'
     +'<div class=fg><label>Overall impression</label>'+ta('overall',a.overall)+'</div>';
  }
  document.getElementById('fbbody').innerHTML='<div class=card2>'+f+'<div class=mf><button class="btn green" id=sb onclick="submitFb()">Submit feedback</button></div><div class=hint id=fbmsg style="text-align:right"></div></div>';
}
function val(id){var e=document.getElementById(id);return e?e.value:undefined;}
async function submitFb(){
  var ans={};
  if(ROLE==='ray')ans={order:val('order'),rushcause:val('rushcause'),rushcost:val('rushcost'),ontime:val('ontime'),acc:val('acc'),par:val('par'),audit:val('audit'),note:val('note')};
  else if(ROLE==='rolando')ans={clean:val('clean'),pm:val('pm'),unres:val('unres'),note:val('note')};
  else ans={assessed:val('assessed'),mono:val('mono'),inv:val('inv'),tech:val('tech'),overall:val('overall')};
  document.getElementById('sb').disabled=true;document.getElementById('fbmsg').textContent='Saving…';
  var r=await (await fetch('/api/feedback/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:T,answers:ans})})).json();
  document.getElementById('fbbody').innerHTML='<div class=card2 style="text-align:center"><div style="font-family:Outfit;font-weight:800;color:var(--green-d);font-size:20px">✓ Thank you</div><div class=hint style="margin-top:6px">Your feedback was recorded for Rita. You can close this page.</div></div>';
}
start();
</script></body></html>`;

const APP_HTML = APP_HTML_1 + APP_HTML_2;

export { STYLE, LOGIN_HTML, FB_HTML, APP_HTML };
