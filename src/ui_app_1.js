// DG3 CIMS HR Console single-page app template — part 1 of 2.
// Moved VERBATIM from src/worker.js (APP_HTML); bytes unchanged. The template
// is split across two modules purely for file size and reassembled in
// ui_pages.js as  APP_HTML = APP_HTML_1 + APP_HTML_2.
import { STYLE } from "./ui_style.js";

export const APP_HTML_1 = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>DG3 CIMS · HR Console</title>
<link rel=icon href="/favicon.ico" sizes=any><link rel=apple-touch-icon href="/apple-touch-icon.png">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body>
<header>
  <div class=brandmark>D</div>
  <div class=brand>DG3 CIMS<small>HR Operational Console</small></div>
  <button class=burger aria-label="Menu" onclick="document.querySelector('header nav').classList.toggle('open')">☰</button>
  <nav>
    <button id=nav-dashboard class=on onclick="show('dashboard')">Dashboard</button>
    <button id=nav-crew onclick="show('crew')">Crew</button>
    <button id=nav-contracts onclick="show('contracts')">Contracts &amp; Bonus</button>
    <button id=nav-rotation onclick="show('rotation')">Keyman</button>
    <button id=nav-feedback onclick="show('feedback')">Feedback</button>
    <button id=nav-billing onclick="show('billing')">Billing</button>
    <button id=nav-travel onclick="show('travel')">Travel</button>
    <button id=nav-fleet onclick="show('fleet')">Fleet</button>
    <button id=nav-data onclick="show('data')">Data</button>
    <button id=nav-ask onclick="show('ask')">Ask Maria</button>
    <a class=out href="/api/auth/logout">Sign out</a>
  </nav>
</header>
<div class=wrap id=view></div>
<script>
const $=s=>document.querySelector(s);
let CREW=[];
let ROT=null,ROTF='';
let CURRENT_CREW=null,CURD=null;
// Click any .tbl header to sort that table (numeric / ISO-date / text aware).
document.addEventListener('click',function(e){
  var th=e.target&&e.target.closest?e.target.closest('.tbl thead th'):null; if(!th)return;
  var table=th.closest('table'); var tb=table.tBodies[0]; if(!tb)return;
  var idx=Array.prototype.indexOf.call(th.parentNode.children,th);
  var dir=th.getAttribute('data-sort')==='asc'?-1:1;
  th.parentNode.querySelectorAll('th').forEach(function(x){x.removeAttribute('data-sort');});
  th.setAttribute('data-sort',dir===1?'asc':'desc');
  var iso=/^\\d{4}-\\d{2}-\\d{2}/;
  var rows=Array.prototype.slice.call(tb.rows);
  rows.sort(function(a,b){
    var x=(a.cells[idx]?a.cells[idx].textContent:'').trim(), y=(b.cells[idx]?b.cells[idx].textContent:'').trim();
    if(iso.test(x)&&iso.test(y)) return (x<y?-1:x>y?1:0)*dir;
    var xn=x.replace(/[^0-9.-]/g,''), yn=y.replace(/[^0-9.-]/g,''), nx=parseFloat(xn), ny=parseFloat(yn);
    if(xn!==''&&yn!==''&&!isNaN(nx)&&!isNaN(ny)) return (nx-ny)*dir;
    return x.localeCompare(y)*dir;
  });
  rows.forEach(function(r){tb.appendChild(r);});
});
function dot(st){return {'On board':'#5FB946','On Vacation':'#B0741A','Earmarked':'#1E6FD0','Inactive':'#9aa7b6'}[st]||'#9aa7b6';}
function brandOf(v){v=(v||'').toUpperCase();if(v.includes('CELEBRITY'))return'Celebrity';if(v.includes('AZAMARA'))return'Azamara';if(v.includes('NCL')||v.includes('NORWEGIAN'))return'NCL';return'Royal';}
function docChip(label,d){if(!d)return'';const days=(new Date(d)-new Date())/86400000;const cls=days<0?'red':days<90?'amber':'ok';return '<span class="cchip '+cls+'">'+label+' '+d+'</span>';}
async function show(tab){
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('on'));
  var _nv=document.querySelector('header nav');if(_nv)_nv.classList.remove('open');
  var _b=$('#nav-'+(tab==='settings'?'data':tab));if(_b)_b.classList.add('on');
  if(tab==='dashboard')return renderDashboard();
  if(tab==='crew')return renderCrew();
  if(tab==='contracts')return renderContracts();
  if(tab==='rotation')return renderRotation();
  if(tab==='feedback')return renderFeedback();
  if(tab==='compliance')return renderCompliance();
  if(tab==='billing')return renderBilling();
  if(tab==='travel')return renderTravel();
  if(tab==='fleet')return renderFleet();
  if(tab==='data'||tab==='settings')return renderData();
  if(tab==='ask')return renderAsk();
}
// "Data" is now the single home for data status AND uploads/session/about (the old Settings tab was
// merged in). Left menu: Overview (data sources + load history), Upload data, Session, About.
function renderAsk(){
  $('#view').innerHTML='<div class=bar><h2>Ask Maria</h2></div>'
   +'<div class=csub style="margin:-6px 0 14px">Maria answers questions about CIMS data — crew, contracts, compliance, billing, fleet, travel. Read-only: she reports, she never changes anything.</div>'
   +'<div id=mchat style="max-width:820px;border:1px solid var(--line-2);border-radius:12px;padding:14px;min-height:200px;max-height:55vh;overflow:auto;background:#fff"></div>'
   +'<div style="max-width:820px;display:flex;gap:8px;margin-top:10px"><input id=mq placeholder="Ask about crew, contracts, compliance, billing, fleet, travel..." style="flex:1;padding:11px 12px;border:1px solid var(--line-2);border-radius:10px"><button class=btn id=masend>Ask</button></div>'
   +'<div style="max-width:820px;margin-top:8px" id=mchips></div>';
  var chips=['How many crew are on board right now?','Whose documents expire in the next 60 days?','Who are the Sr PS crew?','Which ships are in dry dock?'];
  var mc=$('#mchips'); mc.innerHTML='';
  chips.forEach(function(c){var btn=document.createElement('button');btn.className='btn ghost';btn.style.cssText='margin:3px 6px 3px 0;font-size:12px';btn.textContent=c;btn.onclick=function(){$('#mq').value=c;mariaSend();};mc.appendChild(btn);});
  $('#masend').onclick=mariaSend;
  $('#mq').onkeydown=function(e){if(e.key==='Enter')mariaSend();};
  window.MARIA_HIST=window.MARIA_HIST||[];
  mariaRender();
}
function mariaEsc(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
function mariaRender(){
  var box=$('#mchat'); if(!box)return;
  var h=(window.MARIA_HIST||[]).map(function(m){
    var who=m.role==='user'?'You':'Maria';
    var col=m.role==='user'?'var(--navy)':'var(--green)';
    var src=(m.sources&&m.sources.length)?'<div class=csub style="margin-top:4px;opacity:.65">source: '+m.sources.join(', ')+'</div>':'';
    return '<div style="margin:0 0 12px"><div style="font-weight:700;color:'+col+';font-size:12px">'+who+'</div><div style="white-space:pre-wrap;line-height:1.5">'+(m.html||'')+'</div>'+src+'</div>';
  }).join('');
  box.innerHTML=h||'<div class=csub style="opacity:.6">Ask a question to get started.</div>';
  box.scrollTop=box.scrollHeight;
}
async function mariaSend(){
  var i=$('#mq'); if(!i)return; var q=(i.value||'').trim(); if(!q)return;
  i.value='';
  window.MARIA_HIST=window.MARIA_HIST||[];
  var hist=window.MARIA_HIST.filter(function(m){return m.text;}).slice(-6).map(function(m){return {role:m.role,content:m.text};});
  window.MARIA_HIST.push({role:'user',html:mariaEsc(q),text:q});
  window.MARIA_HIST.push({role:'assistant',html:'<span class=csub style="opacity:.6">Maria is thinking…</span>'});
  mariaRender();
  try{
    var r=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,history:hist})});
    var j=await r.json();
    window.MARIA_HIST.pop();
    if(j&&j.answer){window.MARIA_HIST.push({role:'assistant',html:mariaEsc(j.answer),text:j.answer,sources:j.sources||[]});}
    else{window.MARIA_HIST.push({role:'assistant',html:'<span style="color:#b4232a">'+mariaEsc((j&&(j.error||j.detail))||'No answer returned.')+'</span>'});}
  }catch(e){window.MARIA_HIST.pop();window.MARIA_HIST.push({role:'assistant',html:'<span style="color:#b4232a">Network error — try again.</span>'});}
  mariaRender();
}
function renderSettings(){ return renderData(); }
function renderData(){
  $('#view').innerHTML='<div class=bar><h2>Data</h2></div>'
   +'<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">'
   +'<div style="min-width:170px"><div class=zlabel>Menu</div>'
     +'<button class="btn ghost setmenu" data-set="overview" style="display:block;width:100%;text-align:left;margin-bottom:6px">Overview</button>'
     +'<button class="btn ghost setmenu" data-set="uploads" style="display:block;width:100%;text-align:left;margin-bottom:6px">Upload data</button>'
     +'<button class="btn ghost setmenu" data-set="session" style="display:block;width:100%;text-align:left;margin-bottom:6px">Session</button>'
     +'<button class="btn ghost setmenu" data-set="about" style="display:block;width:100%;text-align:left">About</button>'
   +'</div><div id=setbody style="flex:1;min-width:320px"></div></div>';
  document.querySelectorAll('.setmenu').forEach(function(b){b.onclick=function(){document.querySelectorAll('.setmenu').forEach(function(x){x.classList.remove('on');});b.classList.add('on');setShow(b.getAttribute('data-set'));};});
  document.querySelector('.setmenu').classList.add('on');
  setShow('overview');
}
function setShow(s){ if(s==='overview')return dataOverview(); if(s==='uploads')return setUploads(); if(s==='session')return setSession(); return setAbout(); }
function setUploads(){
  $('#setbody').innerHTML='<div class=zlabel>Data uploads</div>'
   +'<div class="card" style="max-width:none;border-left:3px solid var(--navy)">'
   +'<label class=csub>Data type</label><br>'
   +'<select id=dstype style="margin:6px 0 14px"><option value="crew">Crew registry — AdvancedQuery (.xls / .xlsx)</option><option value="keyman">Keyman contracts — CIMS Keyman workbook (.xlsx)</option><option value="travel">Travel expenses — monthly workbook (.xls / .xlsx)</option><option value="vessel">Vessel deployment — preview structure (.xls / .xlsx)</option></select>'
   +'<div id=dropzone style="border:2px dashed var(--line-2);border-radius:12px;padding:30px 18px;text-align:center;cursor:pointer">'
     +'<div style="font-family:\\'Outfit\\';font-weight:700;color:var(--navy)">Drag &amp; drop the file here</div>'
     +'<div class=csub style="margin-top:4px">or click to choose · .xls or .xlsx only</div></div>'
   +'<input type=file id=crewfile accept=".xls,.xlsx" style="display:none" onchange="handleDrop(this.files)">'
   +'<div id=imp class=csub style="margin-top:12px"></div>'
   +'<p class=muted style="text-align:left;margin-top:10px">Only the data types listed above are accepted — nothing else is read. You\\'ll see a preview before anything is saved, and bonus baselines are never affected.</p>'
   +'</div>';
  var dz=$('#dropzone'), fi=$('#crewfile');
  dz.onclick=function(){fi.click();};
  dz.ondragover=function(e){e.preventDefault();dz.style.borderColor='var(--green)';dz.style.background='#F2F8EF';};
  dz.ondragleave=function(e){e.preventDefault();dz.style.borderColor='var(--line-2)';dz.style.background='';};
  dz.ondrop=function(e){e.preventDefault();dz.style.borderColor='var(--line-2)';dz.style.background='';handleDrop(e.dataTransfer.files);};
}
async function setSession(){
  var me={}; try{me=await (await fetch('/api/me')).json();}catch(e){}
  $('#setbody').innerHTML='<div class=zlabel>Session</div><div class="card" style="max-width:none">'
   +'<div class=csub>Signed in as <b style="color:var(--navy)">'+(me.email||'—')+'</b></div>'
   +'<div class=csub style="margin-top:6px">Sessions last 30 days. <a href="/api/auth/logout">Sign out</a></div></div>';
}
function setAbout(){
  $('#setbody').innerHTML='<div class=zlabel>About</div><div class="card" style="max-width:none">'
   +'<div class=csub>DG3 CIMS — HR Operational Console. Crew, rotation, document compliance, days-worked billing, and fleet. Auto-deployed from GitHub with a test gate and nightly self-maintenance.</div></div>';
}
let IMPROWS=null;
function loadSheetJS(cb){
  if(window.XLSX)return cb();
  var s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload=cb; s.onerror=function(){$('#imp').textContent='Could not load the spreadsheet parser.';};
  document.head.appendChild(s);
}
function parseCrewFile(f){
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
        var ws=wb.Sheets[wb.SheetNames[0]];
        // AdvancedQuery exports can have a blank/title row before the real headers, so don't assume
        // row 1 is the header. Read as a grid, find the row that has the CREW ID label, and build
        // objects from there. Without this the parser reads blank keys and the preview shows nothing.
        var aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
        var hi=-1;
        for(var i=0;i<Math.min(aoa.length,15);i++){ if((aoa[i]||[]).some(function(c){return /crew\\s*id/i.test(String(c));})){hi=i;break;} }
        if(hi<0)hi=0;
        var headers=(aoa[hi]||[]).map(function(c){return String(c).trim();});
        IMPROWS=[];
        for(var rr=hi+1;rr<aoa.length;rr++){
          var row=aoa[rr]; if(!row)continue; var o={}, any=false;
          headers.forEach(function(h,ci){ if(!h)return; var v=row[ci]==null?'':row[ci]; o[h]=v; if(String(v).trim())any=true; });
          if(any)IMPROWS.push(o);
        }
        previewImport();
      }catch(err){$('#imp').textContent='Could not parse that file: '+err.message;}
    };
    rd.readAsArrayBuffer(f);
  });
}
function handleDrop(files){
  var f=files&&files[0]; if(!f)return;
  var t=$('#dstype')?$('#dstype').value:'crew';
  if(t!=='crew'&&t!=='vessel'&&t!=='travel'&&t!=='keyman'){$('#imp').textContent='That data type is not enabled yet.';return;}
  if(!/\\.(xls|xlsx)$/i.test(f.name)){$('#imp').textContent='Please upload a .xls or .xlsx file.';return;}
  if(t==='vessel')return parseVesselFile(f);
  if(t==='travel')return parseTravelFile(f);
  if(t==='keyman')return parseKeymanFile(f);
  parseCrewFile(f);
}
var KEYMANUP=null;
function parseKeymanFile(f){
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
        var sn=wb.SheetNames.find(function(n){return n.toLowerCase().indexOf('contract counter')>=0;});
        if(!sn){$('#imp').innerHTML='<div style="'+BADBOX+'">No "Contract Counter" sheet found in this workbook. Upload the CIMS Keyman file.</div>';return;}
        KEYMANUP=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,dateNF:'yyyy-mm-dd',defval:''});
        previewKeyman();
      }catch(err){$('#imp').innerHTML='<div style="'+BADBOX+'">Could not parse that file: '+err.message+'</div>';}
    };
    rd.readAsArrayBuffer(f);
  });
}
async function previewKeyman(){
  if(!KEYMANUP||!KEYMANUP.length){$('#imp').innerHTML='<div style="'+BADBOX+'">No rows found in the Contract Counter sheet.</div>';return;}
  $('#imp').textContent='Analysing the Contract Counter…';
  var r=await (await fetch('/api/keyman/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:KEYMANUP,dryRun:true})})).json();
  if(r.error){$('#imp').innerHTML='<div style="'+BADBOX+'">Could not analyse: '+r.error+'</div>';return;}
  var h='<div style="margin-top:6px"><b style="color:var(--navy)">'+r.crewInFile+' crew in file</b> · <span class="cchip ok">'+r.matched+' matched to roster</span> <span class="cchip amber">'+r.unmatched+' not on roster</span> · '+r.contracts+' contracts'
    +'<div class=csub style="margin-top:4px">Current contract rows: '+r.currentRows+' → will refresh the matched crew. Unmatched are candidates/former crew (left as-is).</div></div>';
  if(r.sampleUnmatched&&r.sampleUnmatched.length)h+='<div class=hint style="margin-top:8px"><b style="color:var(--navy)">Not on roster (skipped)</b><br>'+r.sampleUnmatched.join('<br>')+(r.unmatched>r.sampleUnmatched.length?('<br>+'+(r.unmatched-r.sampleUnmatched.length)+' more'):'')+'</div>';
  h+='<button class="btn" style="margin-top:10px" onclick="applyKeyman()">Refresh contract history for '+r.matched+' crew</button>';
  $('#imp').innerHTML=h;
}
async function applyKeyman(){
  $('#imp').textContent='Refreshing contract history…';
  var r=await (await fetch('/api/keyman/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:KEYMANUP})})).json();
  if(r.ok){$('#imp').innerHTML='<div style="'+NOCHG+'">✓ Refreshed — '+r.applied+' contracts across '+r.crew+' crew. Rank &amp; contract counts now reflect this file. <a href="#" onclick="setShow(\\'overview\\');return false">View data overview</a></div>';KEYMANUP=null;}
  else $('#imp').innerHTML='<div style="'+BADBOX+'">Import failed'+(r.error?(': '+r.error):'')+'.</div>';
}
var TRAVELUP=null;
function parseTravelFile(f){
  var ym=(f.name.match(/20\\d\\d/)||[])[0];
  if(!ym){$('#imp').textContent='Could not detect the year from the filename (expected e.g. 2026 in the name).';return;}
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',raw:true});
        var want=['JAN','FEB','MAR','APRIL','MAY','JUNE','JULY','AUG','SEPT','OCT','NOV','DEC','CIMS'];
        var sheets={};
        wb.SheetNames.forEach(function(sn){ if(want.indexOf(sn.toUpperCase())>=0){ sheets[sn]=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:''}); }});
        TRAVELUP={sheets:sheets,year:+ym};
        previewTravel();
      }catch(err){$('#imp').textContent='Could not parse that file: '+err.message;}
    };
    rd.readAsArrayBuffer(f);
  });
}
async function previewTravel(){
  $('#imp').textContent='Analyzing…';
  var r=await (await fetch('/api/travel/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheets:TRAVELUP.sheets,year:TRAVELUP.year,dryRun:true})})).json();
  if(r.error){$('#imp').textContent='Error: '+r.error;return;}
  var h='<div style="margin-top:6px"><b style="color:var(--navy)">Preview '+r.year+'</b> — '+r.records+' line items · '+r.crew+' crew · $'+Number(r.total).toLocaleString()
    +'<div class=csub style="margin-top:4px">Sign-on $'+Number(r.byLeg.on||0).toLocaleString()+' · Sign-off $'+Number(r.byLeg.off||0).toLocaleString()+' · Transfer $'+Number(r.byLeg.transfer||0).toLocaleString()+'</div></div>';
  h+='<div class=csub style="margin-top:6px;color:var(--amber)">Applying replaces all '+r.year+' travel records (2025 history is untouched).</div>';
  if(r.records>0)h+='<button class="btn" style="margin-top:10px" onclick="applyTravel()">Apply '+r.year+' ('+r.records+' items)</button>';
  else h+='<div class=csub style="margin-top:8px">No travel line items found in that workbook.</div>';
  $('#imp').innerHTML=h;
}
async function applyTravel(){
  $('#imp').textContent='Applying…';
  var r=await (await fetch('/api/travel/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheets:TRAVELUP.sheets,year:TRAVELUP.year})})).json();
  if(r.ok)$('#imp').innerHTML='<span class="cchip ok">Done</span> loaded '+r.applied+' travel items for '+r.year+'. <a href="#" onclick="show(\\'travel\\');return false">Open Travel</a>';
  else $('#imp').textContent='Import failed.';
}
function parseVesselFile(f){
  $('#imp').textContent='Reading '+f.name+'…';
  loadSheetJS(function(){
    var rd=new FileReader();
    rd.onload=function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
        var h='<div style="margin-top:6px"><b style="color:var(--navy)">File profile</b> — '+wb.SheetNames.length+' sheet(s) in '+f.name+'</div>';
        wb.SheetNames.forEach(function(sn){
          var ws=wb.Sheets[sn];
          var rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
          var headers=(rows[0]||[]).map(function(x){return String(x);});
          var n=rows.length>0?rows.length-1:0;
          h+='<div class="card" style="max-width:none;margin-top:10px;border-left:3px solid var(--green)">'
            +'<div class=cname style="font-size:15px">'+sn+'</div>'
            +'<div class=csub>'+n+' data rows · '+headers.length+' columns</div>'
            +'<div class=csub style="margin-top:6px"><b>Columns:</b> '+headers.join('  |  ')+'</div>';
          var sample=rows.slice(1,4);
          if(sample.length){
            h+='<div style="overflow:auto"><table class=tbl style="margin-top:6px"><thead><tr>'+headers.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>'
              +sample.map(function(r){return '<tr>'+headers.map(function(_,i){return '<td>'+String(r[i]==null?'':r[i])+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
          }
          h+='</div>';
        });
        h+='<p class=muted style="text-align:left;margin-top:10px">Read-only structure preview — nothing saved. Screenshot this so the vessel deployment load can be built to match.</p>';
        $('#imp').innerHTML=h;
      }catch(err){$('#imp').textContent='Could not parse that file: '+err.message;}
    };
    rd.readAsArrayBuffer(f);
  });
}
var NOCHG='margin-top:8px;padding:10px 12px;border-radius:8px;background:#F2F8EF;border-left:3px solid var(--green);color:var(--navy);font-weight:600';
var BADBOX='margin-top:8px;padding:10px 12px;border-radius:8px;background:#FDF3F1;border-left:3px solid var(--red);color:var(--navy)';
var IMP_FLAB={first_name:'first name',middle_name:'middle name',last_name:'last name',status:'status',rank_observed:'rank',vessel_observed:'vessel',dob:'date of birth',province:'province',phone:'phone',email:'email',med_exp:'medical expiry',sirb_exp:'seaman-book expiry',pp_exp:'passport expiry',sch_exp:'Schengen expiry',usv_exp:'US-visa expiry'};
async function previewImport(){
  if(!IMPROWS||!IMPROWS.length){$('#imp').innerHTML='<div style="'+BADBOX+'">Couldn\\'t read any crew rows from this file. Make sure it\\'s the AdvancedQuery export (.xls/.xlsx).</div>';return;}
  $('#imp').textContent='Analyzing '+IMPROWS.length+' rows…';
  var r=await (await fetch('/api/crew/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:IMPROWS,dryRun:true})})).json();
  if(r.error){$('#imp').innerHTML='<div style="'+BADBOX+'">Could not analyse the file: '+r.error+'</div>';return;}
  // name lookup from the file rows, to show WHO changed (not just IDs)
  var nm={};IMPROWS.forEach(function(row){var id='',fn='',ln='';for(var k in row){var nk=k.toLowerCase();if(nk.indexOf('crew id')>=0||nk.indexOf('crewid')>=0)id=String(row[k]).trim();else if(nk.indexOf('first')>=0)fn=String(row[k]).trim();else if(nk.indexOf('last')>=0||nk.indexOf('surname')>=0)ln=String(row[k]).trim();}if(id)nm[id]=(fn+' '+ln).trim()||id;});
  if((r.add+r.change)===0){$('#imp').innerHTML='<div style="'+NOCHG+'">✓ No changes — this file is identical to the crew data already on file ('+r.total+' rows checked). Nothing to import.</div>';return;}
  var h='<div style="margin-top:6px"><b style="color:var(--navy)">'+r.total+' rows checked</b> · <span class="cchip ok">'+r.add+' new</span> <span class="cchip amber">'+r.change+' changed</span> '+r.unchanged+' unchanged'
    +(r.needsStatus?(' · <span class="cchip red">'+r.needsStatus+' new w/o status (skipped)</span>'):'')+(r.invalid?(' · '+r.invalid+' unreadable'):'')+'</div>';
  if(r.add&&r.sampleAdd&&r.sampleAdd.length)h+='<div class=hint style="margin-top:8px"><b style="color:var(--navy)">New crew ('+r.add+')</b><br>'+r.sampleAdd.map(function(id){return (nm[id]||id)+' <span class=csub>('+id+')</span>';}).join('<br>')+(r.add>r.sampleAdd.length?('<br>+'+(r.add-r.sampleAdd.length)+' more'):'')+'</div>';
  if(r.change&&r.sampleChange&&r.sampleChange.length)h+='<div class=hint style="margin-top:8px"><b style="color:var(--navy)">Changed ('+r.change+')</b><br>'+r.sampleChange.map(function(c){return (nm[c.agency_id]||c.agency_id)+' — '+c.changed.map(function(f){return IMP_FLAB[f]||f;}).join(', ');}).join('<br>')+(r.change>r.sampleChange.length?('<br>+'+(r.change-r.sampleChange.length)+' more'):'')+'</div>';
  h+='<button class="btn" style="margin-top:10px" onclick="applyImport()">Apply '+(r.add+r.change)+' changes</button>';
  $('#imp').innerHTML=h;
}
async function applyImport(){
  $('#imp').textContent='Applying…';
  var r=await (await fetch('/api/crew/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:IMPROWS})})).json();
  if(r.ok){$('#imp').innerHTML='<span class="cchip ok">Done</span> applied '+r.applied+' ('+r.added+' new, '+r.changed+' changed'+(r.skippedNoStatus?(', '+r.skippedNoStatus+' skipped'):'')+'). <a href="#" onclick="renderData();return false">Reload</a>';IMPROWS=null;}
  else $('#imp').textContent='Import failed.';
}
async function dataOverview(){
  $('#setbody').innerHTML='<div class=muted>Loading…</div>';
  const d=await (await fetch('/api/datastatus')).json();
  let h='<div class=zlabel>Data sources</div><table class=tbl><thead><tr><th>Dataset</th><th>Source</th><th>Records</th></tr></thead><tbody>'
    +d.datasets.map(function(x){return '<tr><td>'+x.name+'</td><td>'+x.source+'</td><td>'+x.count.toLocaleString()+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<div class=zlabel style="margin-top:18px">Recent loads</div>';
  if(!d.log.length)h+='<p class=muted style="text-align:left;padding:8px 2px">No load events recorded yet.</p>';
  else h+='<table class=tbl><thead><tr><th>Source</th><th>Records</th><th>Status</th><th>When</th></tr></thead><tbody>'
    +d.log.map(function(l){return '<tr><td>'+l.source+'</td><td>'+(l.rows||'')+'</td><td><span class="cchip ok">'+l.status+'</span></td><td>'+(l.at||'').slice(0,16).replace('T',' ')+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<p class=muted style="text-align:left;padding:10px 2px">To import a new crew registry, travel workbook, or vessel file, use <b>Upload data</b> in the menu. Bonus baselines stay gated for Rita.</p>';
  $('#setbody').innerHTML=h;
}
let TRV=null,TRV_KIND='',TRVALL=[],TF={q:'',year:'',month:'',cat:'',kind:''};
var TCATS=['air','hotel','medical','visa','food','transport','other'];
var TCATLAB={air:'Air',hotel:'Hotel',medical:'Medical',visa:'Visa',food:'Food',transport:'Transport',other:'Other'};
function usd(n){return n?('$'+Number(n).toLocaleString(undefined,{maximumFractionDigits:0})):'—';}
function usd0(n){return '$'+Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0});}
function pct(a,b){if(b==null||b===0)return null;return (a-b)/b*100;}
function deltaCell(a,b){var d=pct(a,b);if(d==null)return '<span class=muted style="padding:0">—</span>';var up=d>=0;return '<span style="color:'+(up?'var(--red)':'var(--green-d)')+';font-weight:700">'+(up?'▲':'▼')+' '+Math.abs(d).toFixed(0)+'%</span>';}
var TBUD=15000; // monthly travel budget — source: travel workbook SUMMARY!C55 ($15k/mo, $180k/yr). Edit here if the budget changes.
var TSEL=null;  // drilled-down crew name (null = overview)
var TLB=[];     // current leaderboard names (drill-click target by index)
var TMN=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function renderTravel(){
  $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2><span class=muted style="padding:0">Loading…</span></div>';
  try{ TRV=await (await fetch('/api/travel')).json(); if(TRV&&TRV.error)throw new Error(TRV.error); }
  catch(e){ $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2></div><div class="card" style="max-width:none"><b>Could not load travel data.</b><button class="btn" style="margin-top:10px" onclick="renderTravel()">Retry</button></div>'; return; }
  TRVALL=TRV.records||[];
  TSEL=null;
  TF={q:'',year:'',month:'',cat:'',kind:'crew'};
  var years=(TRV.years||[]).slice();
  $('#view').innerHTML='<div class=bar><h2>Travel expenses</h2>'
    +'<input id=tq placeholder="search a person…" oninput="TF.q=this.value;paintTravel()" style="margin-left:auto;width:180px">'
    +'<select id=tyear onchange="TF.year=this.value;paintTravel()"><option value="">All years</option>'+years.map(function(y){return '<option>'+y+'</option>';}).join('')+'</select>'
    +'<select id=tmonth onchange="TF.month=this.value;paintTravel()"><option value="">All months</option>'+TMN.slice(1).map(function(m,i){return '<option value="'+(i+1)+'">'+m+'</option>';}).join('')+'</select>'
    +'<select id=tcat onchange="TF.cat=this.value;paintTravel()"><option value="">All categories</option>'+TCATS.map(function(c){return '<option value="'+c+'">'+TCATLAB[c]+'</option>';}).join('')+'</select>'
    +'<select id=tkind onchange="TF.kind=this.value;paintTravel()"><option value="crew" selected>Crew only</option><option value="">Crew + shoreside</option><option value="shoreside">Shoreside only</option></select>'
    +'</div><div id=trbody></div>';
  paintTravel();
}

function tScope(){return TRVALL.filter(function(r){if(TF.kind&&(r.kind||'crew')!==TF.kind)return false;if(TF.q&&(r.crew_name||'').toLowerCase().indexOf(TF.q.toLowerCase())<0)return false;return true;});}
function tSum(rows,yr,months,cat){var t=0;for(var i=0;i<rows.length;i++){var r=rows[i];if(yr&&r.year!==yr)continue;if(months&&months.indexOf(r.month)<0)continue;t+=cat?(r[cat]||0):r.total;}return t;}
function pv(v,l,col){return '<div><div style="font-family:Outfit;font-size:24px;font-weight:800;color:'+(col||'var(--navy)')+'">'+v+'</div><div class=hint style="margin-top:0">'+l+'</div></div>';}
function travelDrill(i){TSEL=TLB[i];paintTravel();window.scrollTo(0,0);}
function travelBack(){TSEL=null;paintTravel();}

function paintTravel(){
  if(TSEL)return paintTravelCrew();
  if((TF.q||'').trim())return paintTravelSearch();
  var sc=tScope();
  var ys=Array.from(new Set(sc.map(function(r){return r.year;}))).sort(function(a,b){return b-a;});
  var LY=TF.year?+TF.year:ys[0], PY=TF.year?(+TF.year-1):ys[1];
  if(!LY){document.getElementById('trbody').innerHTML='<div class=muted>No travel data for this filter.</div>';return;}
  var now=new Date(),curY=now.getFullYear(),curM=now.getMonth()+1;
  var lastMo=(LY===curY)?curM:12;                 // YTD = ELAPSED calendar months (not months that merely have a row)
  var monthsLY=[];for(var mm=1;mm<=lastMo;mm++)monthsLY.push(mm);
  var dataMo={};sc.filter(function(r){return r.year===LY;}).forEach(function(r){dataMo[r.month]=1;}); // months with any record (for the table)
  var ytdA=tSum(sc,LY,monthsLY,null), ytdB=TBUD*lastMo, ytdP=PY?tSum(sc,PY,monthsLY,null):null;
  var air=tSum(sc,LY,monthsLY,'air');
  var byp={};sc.filter(function(r){return r.year===LY;}).forEach(function(r){byp[r.crew_name]=(byp[r.crew_name]||0)+r.total;});
  var pctUsed=Math.round(ytdA/(TBUD*12)*100);
  var fullProj=lastMo?(ytdA/lastMo*12):0;
  var h='';
  h+='<div class=tiles style="grid-template-columns:repeat(5,1fr);margin-bottom:6px">'
    +tile(usd0(ytdA),'YTD actual '+LY+' · '+lastMo+' mo')
    +tile('<span style="color:'+(ytdA<=ytdB?'var(--green-d)':'var(--red)')+'">'+usd0(Math.abs(ytdB-ytdA))+'</span>',(ytdA<=ytdB?'under':'over')+' budget YTD · '+usd0(ytdB))
    +tile((ytdP==null?'—':deltaCell(ytdA,ytdP)),'vs '+(PY||'PY')+' same period'+(ytdP!=null?(' · '+usd0(ytdP)):''))
    +tile(usd0(air)+' · '+(ytdA?Math.round(air/ytdA*100):0)+'%','Air share','amber')
    +tile('<span style="color:'+(pctUsed<=100?'var(--green-d)':'var(--red)')+'">'+pctUsed+'%</span>','of '+usd0(TBUD*12)+' annual budget used')+'</div>';
  h+='<div class=zlabel>Plan vs actual — budget pacing '+LY+'</div>';
  h+='<div class="card" style="max-width:none">';
  h+='<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:baseline;margin-bottom:10px">'
    +pv(usd0(ytdA),'YTD actual','var(--navy)')
    +pv(usd0(ytdB),'YTD budget','var(--muted)')
    +pv((ytdA<=ytdB?'+':'')+usd0(ytdB-ytdA),'variance ('+(ytdA<=ytdB?'under':'over')+')',ytdA<=ytdB?'var(--green-d)':'var(--red)')
    +pv(usd0(fullProj),'projected FY vs '+usd0(TBUD*12),fullProj<=TBUD*12?'var(--green-d)':'var(--red)')
    +'</div>';
  var maxv=TBUD;for(var m=1;m<=12;m++){var a=tSum(sc,LY,[m],null);if(a>maxv)maxv=a;}
  var budTop=(1-TBUD/maxv)*100;
  h+='<div style="display:flex;align-items:flex-end;gap:8px;height:150px;padding:14px 0 0;border-bottom:1px solid var(--line-2);position:relative">';
  h+='<div style="position:absolute;left:0;right:0;top:'+budTop.toFixed(1)+'%;border-top:2px dashed var(--amber)"></div>';
  for(var m=1;m<=12;m++){var a=tSum(sc,LY,[m],null);var hp=(a/maxv*100).toFixed(1);var over=a>TBUD;
    h+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;z-index:1">'
      +'<div style="font-size:9px;color:var(--navy);font-weight:700">'+(a?usd0(a):'')+'</div>'
      +'<div style="width:62%;border-radius:4px 4px 0 0;min-height:2px;height:'+hp+'%;background:'+(over?'var(--red)':'var(--navy)')+'"></div>'
      +'<div style="font-size:10px;color:var(--muted);margin-top:4px">'+TMN[m]+'</div></div>';}
  h+='</div>';
  h+='<div class=hint style="margin-top:6px">Dashed line = '+usd0(TBUD)+'/mo budget (source: travel sheet). Red bars = over budget. Projection = YTD run-rate × 12.</div>';
  h+='<table class=tbl style="margin-top:12px"><thead><tr><th>Month</th><th style="text-align:right">Actual</th><th style="text-align:right">Budget</th><th style="text-align:right">Variance</th><th style="text-align:right">'+(PY||'PY')+'</th></tr></thead><tbody>';
  for(var m=1;m<=12;m++){var a=tSum(sc,LY,[m],null);var p=PY?tSum(sc,PY,[m],null):null;var has=(!!dataMo[m]||m<=lastMo);var v=TBUD-a;
    if(!has&&!p)continue;
    h+='<tr><td>'+TMN[m]+'</td><td style="text-align:right">'+(has?usd0(a):'<span class=muted style="padding:0">pending</span>')+'</td><td style="text-align:right">'+usd0(TBUD)+'</td><td style="text-align:right">'+(has?('<span style="color:'+(v>=0?'var(--green-d)':'var(--red)')+';font-weight:700">'+(v>=0?'+':'')+usd0(v)+'</span>'):'—')+'</td><td style="text-align:right">'+(p?usd0(p):'—')+'</td></tr>';}
  h+='<tr style="border-top:2px solid var(--line-2)"><td><b>YTD</b></td><td style="text-align:right"><b>'+usd0(ytdA)+'</b></td><td style="text-align:right"><b>'+usd0(ytdB)+'</b></td><td style="text-align:right"><b><span style="color:'+(ytdB-ytdA>=0?'var(--green-d)':'var(--red)')+'">'+(ytdB-ytdA>=0?'+':'')+usd0(ytdB-ytdA)+'</span></b></td><td style="text-align:right"><b>'+(ytdP==null?'—':usd0(ytdP))+'</b></td></tr>';
  h+='</tbody></table></div>';
  h+='<div class=zlabel style="margin-top:18px">STLY — same time last year · '+TMN[1]+'–'+TMN[lastMo]+' ('+LY+' vs '+(PY||'PY')+') · top spenders</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
  var yc='<div><table class=tbl><thead><tr><th>Category</th><th style="text-align:right">STLY '+(PY||'')+'</th><th style="text-align:right">'+LY+'</th><th style="text-align:right">Δ</th></tr></thead><tbody>';
  TCATS.forEach(function(c){var l=tSum(sc,LY,monthsLY,c),p=PY?tSum(sc,PY,monthsLY,c):null;if(!l&&!p)return;yc+='<tr><td>'+TCATLAB[c]+'</td><td style="text-align:right">'+(p==null?'—':usd0(p))+'</td><td style="text-align:right">'+usd0(l)+'</td><td style="text-align:right">'+(p==null?'—':deltaCell(l,p))+'</td></tr>';});
  yc+='<tr style="border-top:2px solid var(--line-2)"><td><b>Total</b></td><td style="text-align:right"><b>'+(ytdP==null?'—':usd0(ytdP))+'</b></td><td style="text-align:right"><b>'+usd0(ytdA)+'</b></td><td style="text-align:right">'+(ytdP==null?'—':deltaCell(ytdA,ytdP))+'</td></tr></tbody></table></div>';
  TLB=Object.keys(byp).sort(function(a,b){return byp[b]-byp[a];}).slice(0,12);
  var lh='<div><table class=tbl><thead><tr><th>#</th><th>Person</th><th style="text-align:right">Trips</th><th style="text-align:right">Total</th></tr></thead><tbody>';
  TLB.forEach(function(n,i){var c=sc.filter(function(r){return r.year===LY&&r.crew_name===n;}).length;var k=(sc.find(function(r){return r.crew_name===n;})||{}).kind;lh+='<tr style="cursor:pointer" onclick="travelDrill('+i+')"><td>'+(i+1)+'</td><td>'+n+(k==='shoreside'?' <span class="cchip amber">shore</span>':'')+'</td><td style="text-align:right">'+c+'</td><td style="text-align:right"><b>'+usd0(byp[n])+'</b></td></tr>';});
  lh+='</tbody></table><div class=hint style="margin-top:6px">Click a name for their full history.</div></div>';
  h+=yc+lh+'</div>';
  var yrRows=sc.filter(function(r){return r.year===LY&&r.total>0;});
  var tt=yrRows.map(function(r){return r.total;}).sort(function(a,b){return a-b;});
  var med=tt.length?tt[Math.floor(tt.length/2)]:0;
  var outs=yrRows.filter(function(r){return r.total>med*2.5;}).sort(function(a,b){return b.total-a.total;}).slice(0,8);
  if(outs.length){
    h+='<div class=zlabel style="margin-top:18px">Anomalies — single movements &gt; 2.5× median ('+usd0(med)+')</div>';
    h+='<table class=tbl><thead><tr><th>Mo</th><th>Person</th><th>Leg</th><th style="text-align:right">Air</th><th style="text-align:right">Total</th></tr></thead><tbody>';
    outs.forEach(function(r){h+='<tr><td>'+TMN[r.month]+'</td><td>'+r.crew_name+'</td><td>'+(r.leg==='shoreside'?'—':r.leg)+'</td><td style="text-align:right">'+usd0(r.air)+'</td><td style="text-align:right"><b>'+usd0(r.total)+'</b></td></tr>';});
    h+='</tbody></table>';
  }
  var q=(TF.q||'').toLowerCase();
  var rows=TRVALL.filter(function(r){if(TF.kind&&(r.kind||'crew')!==TF.kind)return false;if(TF.year&&r.year!==+TF.year)return false;if(TF.month&&r.month!==+TF.month)return false;if(TF.cat&&!(r[TF.cat]>0))return false;if(q&&(r.crew_name||'').toLowerCase().indexOf(q)<0)return false;return true;});
  h+='<div class=zlabel style="margin-top:18px">Line items'+(rows.length?(' · '+rows.length):'')+'</div>';
  h+='<table class=tbl><thead><tr><th>Yr</th><th>Mo</th><th>Kind</th><th>Leg</th><th>Name</th><th style="text-align:right">Air</th><th style="text-align:right">Hotel</th><th style="text-align:right">Med</th><th style="text-align:right">Visa</th><th style="text-align:right">Food</th><th style="text-align:right">Trans</th><th style="text-align:right">Other</th><th style="text-align:right">Total</th></tr></thead><tbody>'
    +rows.map(function(r){return '<tr><td>'+r.year+'</td><td>'+TMN[r.month]+'</td><td>'+(r.kind==='shoreside'?'<span class="cchip amber">shore</span>':'crew')+'</td><td>'+(r.leg==='shoreside'?'—':r.leg)+'</td><td>'+r.crew_name+'</td><td style="text-align:right">'+usd(r.air)+'</td><td style="text-align:right">'+usd(r.hotel)+'</td><td style="text-align:right">'+usd(r.medical)+'</td><td style="text-align:right">'+usd(r.visa)+'</td><td style="text-align:right">'+usd(r.food)+'</td><td style="text-align:right">'+usd(r.transport)+'</td><td style="text-align:right">'+usd(r.other)+'</td><td style="text-align:right"><b>'+usd(r.total)+'</b></td></tr>';}).join('')||'<tr><td colspan=13 class=muted>No line items match these filters.</td></tr>';
  h+='</tbody></table>';
  document.getElementById('trbody').innerHTML=h;
}

function profileHTML(name){
  var rows=TRVALL.filter(function(r){return r.crew_name===name;});
  var ys=Array.from(new Set(rows.map(function(r){return r.year;}))).sort(function(a,b){return b-a;});
  var h='<div class=zlabel>'+name+'</div>';
  h+='<div class=tiles style="grid-template-columns:repeat('+Math.min(ys.length+1,5)+',1fr);margin-bottom:6px">';
  ys.forEach(function(y){var t=rows.filter(function(r){return r.year===y;}).reduce(function(a,b){return a+b.total;},0);var c=rows.filter(function(r){return r.year===y;}).length;h+=tile(usd0(t),y+' · '+c+' trips');});
  h+=tile(usd0(rows.reduce(function(a,b){return a+b.total;},0)),'All-time');
  h+='</div>';
  h+='<div class=zlabel style="margin-top:8px">Monthly spend by year</div><table class=tbl><thead><tr><th>Year</th>'+TMN.slice(1).map(function(m){return '<th style="text-align:right">'+m+'</th>';}).join('')+'<th style="text-align:right">Total</th></tr></thead><tbody>';
  ys.forEach(function(y){h+='<tr><td><b>'+y+'</b></td>';var tt=0;for(var m=1;m<=12;m++){var v=rows.filter(function(r){return r.year===y&&r.month===m;}).reduce(function(a,b){return a+b.total;},0);tt+=v;h+='<td style="text-align:right">'+(v?usd0(v):'·')+'</td>';}h+='<td style="text-align:right"><b>'+usd0(tt)+'</b></td></tr>';});
  h+='</tbody></table>';
  h+='<div class=zlabel style="margin-top:14px">By category (all-time)</div><table class=tbl><thead><tr>'+TCATS.map(function(c){return '<th style="text-align:right">'+TCATLAB[c]+'</th>';}).join('')+'<th style="text-align:right">Total</th></tr></thead><tbody><tr>';
  var gt=0;TCATS.forEach(function(c){var v=rows.reduce(function(a,b){return a+(b[c]||0);},0);gt+=v;h+='<td style="text-align:right">'+(v?usd0(v):'·')+'</td>';});h+='<td style="text-align:right"><b>'+usd0(gt)+'</b></td></tr></tbody></table>';
  h+='<div class=zlabel style="margin-top:14px">All movements</div><table class=tbl><thead><tr><th>Yr</th><th>Mo</th><th>Leg</th><th style="text-align:right">Air</th><th style="text-align:right">Hotel</th><th style="text-align:right">Other</th><th style="text-align:right">Total</th></tr></thead><tbody>';
  rows.sort(function(a,b){return b.year-a.year||b.month-a.month;}).forEach(function(r){var oc=r.medical+r.visa+r.food+r.transport+r.other;h+='<tr><td>'+r.year+'</td><td>'+TMN[r.month]+'</td><td>'+(r.leg==='shoreside'?'shore':r.leg)+'</td><td style="text-align:right">'+usd(r.air)+'</td><td style="text-align:right">'+usd(r.hotel)+'</td><td style="text-align:right">'+usd(oc)+'</td><td style="text-align:right"><b>'+usd(r.total)+'</b></td></tr>';});
  h+='</tbody></table>';
  return h;
}
function paintTravelCrew(){document.getElementById('trbody').innerHTML='<div style="cursor:pointer;color:var(--navy);font-weight:700;margin-bottom:6px" onclick="travelBack()">← Back</div>'+profileHTML(TSEL);}
function paintTravelSearch(){
  var q=(TF.q||'').trim().toLowerCase();var sc=tScope();
  var seen={},names=[],tot={};
  sc.forEach(function(r){if((r.crew_name||'').toLowerCase().indexOf(q)>=0){if(!seen[r.crew_name]){seen[r.crew_name]=1;names.push(r.crew_name);}tot[r.crew_name]=(tot[r.crew_name]||0)+r.total;}});
  names.sort(function(a,b){return (tot[b]||0)-(tot[a]||0);});
  var t=document.getElementById('trbody');if(!t)return;
  if(names.length===0){t.innerHTML='<div class=muted style="padding:20px 2px">No one matches "'+TF.q+'". Try another name, or change the Crew / shoreside filter.</div>';return;}
  if(names.length===1){t.innerHTML='<div class=hint style="margin-bottom:8px">Showing every expense for this person · clear the search box to return to the overview.</div>'+profileHTML(names[0]);return;}
  var h='<div class=zlabel>'+names.length+' people match "'+TF.q+'" — click one for their full history</div>';
  h+='<table class=tbl><thead><tr><th>#</th><th>Person</th><th style="text-align:right">Trips</th><th style="text-align:right">Total</th></tr></thead><tbody>';
  TLB=names.slice(0,60);
  TLB.forEach(function(n,i){var c=sc.filter(function(r){return r.crew_name===n;}).length;var k=(sc.find(function(r){return r.crew_name===n;})||{}).kind;h+='<tr style="cursor:pointer" onclick="travelDrill('+i+')"><td>'+(i+1)+'</td><td>'+n+(k==='shoreside'?' <span class="cchip amber">shore</span>':'')+'</td><td style="text-align:right">'+c+'</td><td style="text-align:right"><b>'+usd0(tot[n])+'</b></td></tr>';});
  h+='</tbody></table>';
  t.innerHTML=h;
}
async function loadTravel(){return renderTravel();}
let FLEET=null,FLT={mode:'all',q:''};
async function renderFleet(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  FLEET=await (await fetch('/api/fleet')).json();
  FLT={mode:'all',q:''};
  $('#view').innerHTML='<div class=bar><h2>Fleet</h2><input id=fq placeholder="Search ship, port, region, class, brand…" oninput="FLT.q=this.value;paintFleet()" style="margin-left:auto;width:300px"></div><div id=fleettiles class=tiles></div><div id=fleetbody></div>';
  paintFleet();
}
function paintFleet(){
  var f=FLEET;if(!f)return;
  var inDock=f.inDock||[];
  var isInDock=function(v){var u=(v.name||'').toUpperCase();return inDock.some(function(s){return u.indexOf(String(s).toUpperCase())>=0;});};
  var byBrand={};f.vessels.forEach(function(v){byBrand[v.brand]=(byBrand[v.brand]||0)+1;});
  var ft=function(n,l,cls,mode){return '<div class="tile '+(cls||'')+'" data-fm="'+mode+'" style="cursor:pointer;'+(FLT.mode===mode?'outline:2px solid var(--navy);outline-offset:-2px;':'')+'"><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';};
  document.getElementById('fleettiles').innerHTML=
     ft(f.vessels.length,'All vessels','','all')+ft(byBrand.RCI||0,'Royal','royal','rci')+ft(byBrand.CEL||0,'Celebrity','','cel')
    +ft(inDock.length,'In dry dock now',inDock.length?'red':'green','dock')+ft((f.upcoming||[]).length,'Docks ≤120d','amber','upcoming');
  document.querySelectorAll('#fleettiles .tile[data-fm]').forEach(function(el){el.onclick=function(){var m=el.getAttribute('data-fm');FLT.mode=(FLT.mode===m&&m!=='all')?'all':m;paintFleet();};});
  var q=(FLT.q||'').toLowerCase();
  var vmatch=function(v){
    if(FLT.mode==='rci'&&v.brand!=='RCI')return false;
    if(FLT.mode==='cel'&&v.brand!=='CEL')return false;
    if(FLT.mode==='dock'&&!isInDock(v))return false;
    if(FLT.mode==='upcoming'&&!(f.upcoming||[]).some(function(u){return u.ship===v.name;}))return false;
    if(q){var s=(v.name+' '+v.brand+' '+v.cls+' '+(v.homeport||'')+' '+(v.region||'')).toLowerCase();if(s.indexOf(q)<0)return false;}
    return true;
  };
  var vs=f.vessels.filter(vmatch);
  var ddBadge=function(s){var c=s==='in_dock'?'red':s==='upcoming'?'amber':'ok';var t=s==='in_dock'?'in dock':s;return '<span class="cchip '+c+'">'+t+'</span>';};
  var dd=(f.dryDock||[]).filter(function(d){if(!q)return true;var s=((d.ship||'')+' '+(d.loc||'')).toLowerCase();return s.indexOf(q)>=0;});
  var h='<details open class=ddwrap><summary class="zlabel ddsum" style="cursor:pointer;user-select:none">Dry-dock schedule'+(q?(' · matching "'+FLT.q+'"'):'')+' <span class=csub style="font-weight:600">('+dd.length+')</span></summary>'
    +'<table class=tbl style="margin-top:8px"><thead><tr><th>Ship</th><th>Start</th><th>End</th><th>Location</th><th>Days</th><th>Status</th></tr></thead><tbody>'
    +(dd.length?dd.map(function(d){return '<tr><td>'+d.ship+'</td><td>'+d.start+'</td><td>'+(d.end||'open')+'</td><td>'+d.loc+'</td><td>'+(d.days||'—')+'</td><td>'+ddBadge(d.status)+(d.note?(' <span class=csub>'+d.note+'</span>'):'')+'</td></tr>';}).join(''):'<tr><td colspan=6 class=muted style="padding:10px">No matches.</td></tr>')+'</tbody></table></details>';
  h+='<div class=zlabel style="margin-top:18px">Vessels ('+vs.length+')</div><table class=tbl><thead><tr><th>Ship</th><th>Brand</th><th>Class</th><th>Homeport</th><th>Region</th><th>Lead time</th></tr></thead><tbody>'
    +(vs.length?vs.map(function(v){return '<tr><td>'+v.name+'</td><td>'+v.brand+'</td><td>'+v.cls+'</td><td>'+(v.homeport||'—')+'</td><td>'+(v.region||'—')+'</td><td>'+(v.lead?(v.lead+'d'):'—')+'</td></tr>';}).join(''):'<tr><td colspan=6 class=muted style="padding:10px">No matches.</td></tr>')+'</tbody></table>'
    +'<p class=muted style="text-align:left;padding:10px 2px">Tap a tile to filter the vessel list; search matches ship, port, region, class, brand. Lead time = Miami PO to delivery at ship location.</p>';
  document.getElementById('fleetbody').innerHTML=h;
}
let BILL=null;
function ymd(d){return d.toISOString().slice(0,10);}
async function renderBilling(){
  if(!$('#billfrom')){
    const to=new Date();const from=new Date();from.setMonth(from.getMonth()-3);
    $('#view').innerHTML='<div class=bar><h2>Days-worked billing</h2>'
      +'<label class=csub style="margin-left:auto">From <input type=date id=billfrom value="'+ymd(from)+'"></label>'
      +'<label class=csub>To <input type=date id=billto value="'+ymd(to)+'"></label>'
      +'<button class="btn" onclick="loadBilling()">Run</button>'
      +'<button class="btn ghost" onclick="exportBilling()">Download CSV</button></div>'
      +'<div id=billsub class=csub style="margin:-6px 0 12px"></div><div id=billbody></div>';
  }
  loadBilling();
}
async function loadBilling(){
  const f=$('#billfrom').value,t=$('#billto').value;
  $('#billbody').innerHTML='<div class=muted>Calculating…</div>';
  BILL=await (await fetch('/api/daysworked?from='+f+'&to='+t)).json();
  const T=BILL.totals;
  $('#billsub').textContent=T.days.toLocaleString()+' sea-days · '+T.crew+' crew · '+T.vessels+' vessels · '+T.contracts+' contracts in window';
  const bdg=function(b){const c=b==='actual'?'ok':b==='mixed'?'amber':'royal';return '<span class="cchip '+c+'">'+b+'</span>';};
  let h='<div class=zlabel>By vessel</div><table class=tbl><thead><tr><th>Vessel</th><th>Crew</th><th>Days</th><th>Basis</th></tr></thead><tbody>'
    +BILL.perVessel.map(function(v){return '<tr><td>'+v.ship+'</td><td>'+v.crew+'</td><td>'+v.days.toLocaleString()+'</td><td>'+bdg(v.basis)+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<div class=zlabel style="margin-top:18px">By crew</div><table class=tbl><thead><tr><th>Crew</th><th>Days</th><th>Contracts</th><th>Basis</th></tr></thead><tbody>'
    +BILL.perCrew.map(function(c){return '<tr><td>'+c.name+'</td><td>'+c.days.toLocaleString()+'</td><td>'+c.contracts+'</td><td>'+bdg(c.basis)+'</td></tr>';}).join('')+'</tbody></table>'
    +'<p class=muted style="text-align:left;padding:10px 2px">Basis: actual = real sign-off · projected = planned · mixed = both. Per-vessel reflects current vessel assignment.</p>';
  $('#billbody').innerHTML=h;
}
function exportBilling(){
  if(!BILL)return;
  const rows=[['VESSEL DAYS','','','']];
  rows.push(['Vessel','Crew','Days','Basis']);
  BILL.perVessel.forEach(function(v){rows.push([v.ship,v.crew,v.days,v.basis]);});
  rows.push([]);rows.push(['CREW DAYS','','','']);rows.push(['Crew','Days','Contracts','Basis']);
  BILL.perCrew.forEach(function(c){rows.push([c.name,c.days,c.contracts,c.basis]);});
  const csv=rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?('"'+x.replace(/"/g,'""')+'"'):x;}).join(',');}).join('\\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='days-worked_'+$('#billfrom').value+'_'+$('#billto').value+'.csv';a.click();
}
let DRAGID=null,DRAGEL=null,ROT_F='',ROT_BRAND='',ROT_FIND='',ROT_CLOSED={},dragMoved=false,ROT_YEAR='',ROT_MONTHS=[];
function dragStart(el,id){dragMoved=true;DRAGID=id;DRAGEL=el;setTimeout(function(){el.classList.add('dragging');},0);}
function dragEnd(el){el.classList.remove('dragging');document.querySelectorAll('.shipdrop.dragover').forEach(function(z){z.classList.remove('dragover');});}
const BRANDCOL={Royal:'#1E6FD0',Celebrity:'#0C8C8C',Azamara:'#7A5AA8',NCL:'#E0962B'};
function rfTile(n,l,cls,st){return '<div class="tile '+(cls||'')+'" data-rf="'+st+'" style="cursor:pointer;'+((st&&ROT_F===st)?'outline:2px solid var(--navy);outline-offset:-2px;':'')+'"><div class=n>'+(n!=null?n:0)+'</div><div class=l>'+l+'</div></div>';}
function durLabel(a,b){if(!a||!b)return'';var d=Math.round((new Date(b)-new Date(a))/86400000);if(!(d>0))return'';var m=Math.round(d/30);return d+'d'+(m?(' · ~'+m+'mo'):'');}
function rankAbbr(r){var s=String(r||'').toLowerCase();if(!s)return'';if(s.indexOf('senior')>=0||s==='sr ps')return 'Sr PS';if(s.indexOf('junior')>=0||s.indexOf('jr')>=0)return 'Jr PS';if(s.indexOf('printer')>=0||s.indexOf('special')>=0||s==='ps')return 'PS';return String(r);}
function rtag(label,on,crew,field){var c=on?'rtag on':'rtag';if(field)return '<span class="'+c+' rtoggle" data-crew="'+crew+'" data-f="'+field+'" data-v="'+(on?1:0)+'" title="click to toggle">'+label+'</span>';return '<span class="'+c+'">'+label+'</span>';}
function rotCard(x){
  var tba='<span style="color:var(--amber);font-weight:700" title="port not set yet">TBA</span>';
  var on=x.signOn?((x.embark?x.embark:tba)+' · ON '+x.signOn):'';
  var off=x.signOff?((x.disembark?x.disembark:tba)+' · OFF '+x.signOff):'';
  var dur=monthsDays(x.signOn,x.signOff)||durLabel(x.signOn,x.signOff);
  var tg='';
  if(x.eccr)tg+='<span class="rtag on">ECCR</span>';
  if(x.air)tg+='<span class="rtag on">AIR</span>';
  if(x.hotel)tg+='<span class="rtag on">HOTEL</span>';
  if(x.onConfirmed)tg+='<span class="rtag on">ON ✓</span>';
  if(x.offConfirmed)tg+='<span class="rtag on">OFF ✓</span>';
  if(x.nextShip)tg+='<span class="rtag">NEXT: '+x.nextShip+'</span>';
  return '<div class="rcard'+(x.current?' cur':'')+'" draggable="true" data-crew="'+x.agency_id+'" data-seq="'+x.seq+'" title="click to edit · drag to reassign" onmousedown="dragMoved=false" ondragstart="dragStart(this,\\''+x.agency_id+'\\')" ondragend="dragEnd(this)" onclick="cardClick(\\''+x.agency_id+'\\','+x.seq+')">'
    +'<div class=rnm>'+x.name+(x.rank?(' <span style="color:var(--mut);font-weight:600;font-size:11px">'+rankAbbr(x.rank)+'</span>'):'')+(x.hasNote?' <span class=notedot title="has comment">●</span>':'')+'</div>'
    +'<div class=rleg><i style="background:'+dot(x.status)+'"></i>'+x.status+(dur?(' · '+dur):'')+'</div>'
    +(on?'<div class=rleg2><i class=ondot></i>'+on+'</div>':'')
    +(off?'<div class=rleg2><i class=offdot></i>'+off+'</div>':'')
    +(tg?'<div class=rtags>'+tg+'</div>':'')
    +'</div>';
}
function rotShip(sec){
  var col=BRANDCOL[sec.brand]||'#1E6FD0',closed=!!ROT_CLOSED[sec.ship];
  var hist=sec.history||[];
  var body=sec.crew.length?sec.crew.map(rotCard).join(''):'<div class=hint style="opacity:.55;padding:6px">drag crew here</div>';
  var histBlock=hist.length?('<div class="histsec'+(closed?' closed':'')+'"><div class=histhd>Also served this ship · '+hist.length+'</div><div class=histgrid>'+hist.map(histCard).join('')+'</div></div>'):'';
  var meta=sec.brand+' · '+sec.onboard+' onboard · '+sec.crew.length+' current'+(hist.length?(' · '+hist.length+' history'):'');
  return '<div class=shipsec><div class=shiphdr data-toggle="'+sec.ship+'" style="border-left-color:'+col+'"><span class=nm>'+sec.ship+'</span><span class=meta>'+meta+' <span class="arw'+(closed?' closed':'')+'">▾</span></span></div>'
    +'<div class="shipbody shipdrop'+(closed?' closed':'')+'" data-ship="'+sec.ship+'">'+body+'</div>'+histBlock+'</div>';
}
function monthsDays(a,b){
  if(!a||!b)return '';
  var d1=new Date(a),d2=new Date(b);
  if(isNaN(d1)||isNaN(d2)||d2<d1)return '';
  var m=(d2.getFullYear()-d1.getFullYear())*12+(d2.getMonth()-d1.getMonth());
  var d=d2.getDate()-d1.getDate();
  if(d<0){m--;d+=new Date(d2.getFullYear(),d2.getMonth(),0).getDate();}
  if(m<0)return '';
  var parts=[];if(m)parts.push(m+' mo'+(m===1?'':'s'));if(d)parts.push(d+' day'+(d===1?'':'s'));
  return parts.join(' ')||'0 days';
}
function histCard(h){
  var span=(h.on||'')+(h.off&&h.off!==h.on?(' → '+h.off):'');
  var dur=monthsDays(h.on,h.off);
  var durHtml=dur?('<div class=hdur>'+dur+'</div>'):'';
  if(h.ours&&h.sc)return '<div class="hcard ours" data-crew="'+h.sc+'" onclick="openCrew(\\''+h.sc+'\\')"><div class=hnm><span>'+h.name+'</span></div><div class=hspan>'+span+'</div>'+durHtml+'</div>';
  return '<div class="hcard former"><div class=hnm><span>'+h.name+'</span><span class="htag former">former</span></div><div class=hspan>'+span+'</div>'+durHtml+'</div>';
}
function rotExpand(open){if(!ROT)return;(ROT.sections||[]).forEach(function(s){ROT_CLOSED[s.ship]=!open;});drawRotation();}
function cardClick(id,seq){if(dragMoved)return;editContractModal(id,seq);}
async function editContractModal(id,seq){
  var e=null;(ROT.sections||[]).forEach(function(s){s.crew.forEach(function(x){if(x.agency_id===id&&x.seq===seq)e=x;});});
  if(!e)return;
  var d={};try{d=await (await fetch('/api/rotation/crew?id='+encodeURIComponent(id))).json();}catch(_){}
  var note=String((d.ready&&d.ready.note)||'').replace(/</g,'&lt;');
  var ships={};(ROT.sections||[]).forEach(function(s){ships[s.ship]=1;});if(e.ship)ships[e.ship]=1;
  var shipOpts=Object.keys(ships).sort().map(function(s){return '<option'+(s===e.ship?' selected':'')+'>'+s+'</option>';}).join('');
  // The wrapper handles the tap (tgFlip) and the checkbox is pointer-events:none, so a tap can only
  // produce ONE flip — fixes the iPad double-toggle where the box landed back where it started.
  var ck=function(i,lab,on){return '<span style="display:inline-flex;align-items:center;gap:5px;margin:0 14px 6px 0;font-size:13px;cursor:pointer" onclick="tgFlip(\\''+i+'\\')"><input type=checkbox id="'+i+'"'+(on?' checked':'')+' style="pointer-events:none"> '+lab+'</span>';};
  var legs=(d.legs||[]).map(function(l){var off=l.act_off||l.proj_off||'—';return '<tr><td>'+l.seq+'</td><td>'+(l.ship||'—')+'</td><td>'+(l.sign_on||'—')+'</td><td>'+off+'</td></tr>';}).join('');
  var fld=function(lab,inp){return '<div><label class=csub>'+lab+'</label>'+inp+'</div>';};
  var h='<div class=modcard><div class=modhd><div><div class=cname>Edit contract — '+e.name+'</div><div class=csub>'+id+' · contract #'+seq+'</div></div><button class="btn ghost" onclick="closeRotModal()">Close ✕</button></div>'
   +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">'
   +fld('Embark city','<input id=eEmb value="'+(e.embark||'')+'" style="width:100%">')
   +fld('Disembark city','<input id=eDis value="'+(e.disembark||'')+'" style="width:100%">')
   +fld('Sign-on','<input id=eOn type=date value="'+(e.signOn||'')+'" style="width:100%">')
   +fld('Sign-off','<input id=eOff type=date value="'+(e.signOff||'')+'" style="width:100%">')
   +'<div style="grid-column:1/3">'+fld('Ship','<select id=eShip style="width:100%">'+shipOpts+'</select>')+'</div>'
   +'</div>'
   +'<div class=zlabel style="margin-top:12px">Confirmed — shows as green tags on the card</div>'
   +'<div style="margin:6px 0 8px">'+ck('cEccr','ECCR',e.eccr)+ck('cAir','AIR',e.air)+ck('cHotel','HOTEL',e.hotel)+ck('cOn','ON DATE',e.onConfirmed)+ck('cOff','OFF DATE',e.offConfirmed)+'</div>'
   +'<div class=zlabel>Comment</div><textarea id=cmt rows=2 style="width:100%" placeholder="Note for this crew…">'+note+'</textarea>'
   +(legs?'<div class=zlabel style="margin-top:12px">Contract history</div><table class=tbl><thead><tr><th>#</th><th>Ship</th><th>On</th><th>Off</th></tr></thead><tbody>'+legs+'</tbody></table>':'')
      +'<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line)"><div class=csub style="margin-bottom:6px">SIGN-OFF WORKFLOW</div><button class="btn ghost" style="font-size:12px" onclick="sendSignoffInstructions(\\''+id+'\\','+seq+')">Send instructions</button> <button class="btn ghost" style="font-size:12px" onclick="sendSignoffLink(\\''+id+'\\','+seq+')">Send sign-off link</button></div>'
   +'<div style="margin-top:12px;text-align:right"><span id=cmtmsg class=csub style="margin-right:8px"></span><button class="btn ghost" onclick="closeRotModal()">Cancel</button> <button class="btn green" onclick="saveContract(\\''+id+'\\','+seq+')">Save</button></div></div>';
  var w=document.createElement('div');w.id='rotmodal';w.className='modwrap';w.innerHTML=h;
  w.onclick=function(ev){if(ev.target===w)closeRotModal();};
  document.body.appendChild(w);
}
async function saveContract(id,seq){
  var g=function(x){return document.getElementById(x);};
  if(g('eOn').value&&g('eOff').value&&g('eOff').value<g('eOn').value){g('cmtmsg').textContent='Sign-off is before sign-on.';return;}
  g('cmtmsg').textContent='Saving…';
  var body={sc:id,seq:seq,embark:g('eEmb').value,disembark:g('eDis').value,sign_on:g('eOn').value,sign_off:g('eOff').value,ship:g('eShip').value,eccr:g('cEccr').checked,air:g('cAir').checked,hotel:g('cHotel').checked,on_conf:g('cOn').checked,off_conf:g('cOff').checked};
  try{
    await fetch('/api/rotation/contract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    await fetch('/api/rotation/note',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,note:g('cmt').value})});
    closeRotModal();renderRotation();
  }catch(e){g('cmtmsg').textContent='Failed to save.';}
}
async function sendSignoffInstructions(id,seq){try{var r=await (await fetch('/api/instructions/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sc:id,seq:seq,send:true})})).json();alert(r.error?('Error: '+r.error):(r.emailed?'Instructions emailed to the crew member.':('Not emailed (no crew email on file). Copy this link to send: '+r.link)));}catch(e){alert('Could not send instructions.');}}
async function sendSignoffLink(id,seq){try{var r=await (await fetch('/api/ack/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sc:id,seq:seq,send:true})})).json();alert(r.error?('Error: '+r.error):(r.emailed?'Sign-off request emailed to the crew member.':('Not emailed (no crew email on file). Copy this link to send: '+r.link)));}catch(e){alert('Could not send.');}}
function closeRotModal(){var m=document.getElementById('rotmodal');if(m)m.remove();}
function rmTag(label,field,on,id){return '<span class="rtag rtoggle'+(on?' on':'')+'" data-crew="'+id+'" data-f="'+field+'" data-v="'+(on?1:0)+'" onclick="rmToggle(this)">'+label+'</span>';}
function rmToggle(el){var nv=el.getAttribute('data-v')==='1'?0:1;el.setAttribute('data-v',nv);el.classList.toggle('on',!!nv);fetch('/api/rotation/ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:el.getAttribute('data-crew'),field:el.getAttribute('data-f'),value:nv})});}
async function saveNote(id){
  var t=document.getElementById('cmt').value;document.getElementById('cmtmsg').textContent='Saving…';
  try{var r=await (await fetch('/api/rotation/note',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,note:t})})).json();document.getElementById('cmtmsg').textContent=r.ok?'Saved ✓':'Failed';}catch(e){document.getElementById('cmtmsg').textContent='Failed';}
}
async function renderRotation(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  ROT=await (await fetch('/api/rotation')).json();
  ROT_F='';ROT_BRAND='';ROT_FIND='';ROT_CLOSED={__POOL__:true};ROT_MONTHS=[];
  var yrs={};(ROT.sections||[]).forEach(function(s){s.crew.forEach(function(x){if(x.signOn)yrs[x.signOn.slice(0,4)]=1;if(x.signOff)yrs[x.signOff.slice(0,4)]=1;});});
  var yopts='<option value="">All years</option>'+Object.keys(yrs).sort().reverse().map(function(y){return '<option'+(ROT_YEAR===y?' selected':'')+'>'+y+'</option>';}).join('');
  $('#view').innerHTML='<style>'
    +'.rcard{transition:transform .16s ease,box-shadow .16s ease,opacity .18s ease}'
    +'.rcard:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(20,45,72,.12)}'
    +'.rcard.dragging{opacity:.45;transform:scale(.97)}'
    +'.rcard.landing{animation:rland .26s ease}'
    +'@keyframes rland{0%{transform:scale(.92);opacity:.4}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}'
    +'.shipdrop{transition:background .15s ease,box-shadow .15s ease}'
    +'.shipdrop.dragover{background:rgba(95,185,70,.08);box-shadow:inset 0 0 0 2px var(--green);border-radius:10px}'
    +'.shipbody{transition:max-height .2s ease}'
    +'</style>'
    +'<div class=zlabel>Keyman — each ship shows its full crew history (onboard first). Click a card for detail + comment; drag to reassign.</div>'
    +'<div class=bar style="margin-bottom:8px;flex-wrap:wrap"><input id=rfind placeholder="find ship…" oninput="ROT_FIND=this.value;drawRotation()" style="width:170px">'
    +'<select id=ryear onchange="ROT_YEAR=this.value;drawRotation()">'+yopts+'</select>'
    +'<select id=rbrand onchange="ROT_BRAND=this.value;drawRotation()"><option value="">All cruise lines</option><option value="Royal">Royal Caribbean</option><option value="Celebrity">Celebrity</option><option value="Azamara">Azamara</option></select>'
    +'<button class="btn ghost" onclick="rotExpand(true)">Expand all</button><button class="btn ghost" onclick="rotExpand(false)">Collapse all</button>'
    +'<button class="btn" style="margin-left:auto" onclick="exportDaysExcel()" title="Days worked this month, per crew, for customer billing">Bill this month (Excel)</button></div>'
    +'<div id=rotchips style="margin-bottom:10px"></div><div id=rotbody></div>';
  drawRotation();
}
function rmonthChips(){
  var mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var h='<span class="chip'+(ROT_MONTHS.length?'':' on')+'" data-m="all">All months</span> ';
  for(var i=1;i<=12;i++)h+='<span class="chip'+(ROT_MONTHS.indexOf(i)>=0?' on':'')+'" data-m="'+i+'">'+mn[i-1]+'</span> ';
  document.getElementById('rotchips').innerHTML=h;
  document.querySelectorAll('#rotchips .chip').forEach(function(el){el.onclick=function(){var m=el.getAttribute('data-m');if(m==='all'){ROT_MONTHS=[];}else{m=+m;var k=ROT_MONTHS.indexOf(m);if(k>=0)ROT_MONTHS.splice(k,1);else ROT_MONTHS.push(m);}rmonthChips();drawRotation();};});
}
// True if a leg [signOn..signOff] overlaps the selected year and any selected month.
function legInFilter(x){
  if(!ROT_YEAR&&!ROT_MONTHS.length)return true;
  var on=x.signOn?new Date(x.signOn):null, off=x.signOff?new Date(x.signOff):on;
  if(!on)return false;
  if(ROT_YEAR){var y=+ROT_YEAR;if(!(on.getFullYear()<=y&&(off||on).getFullYear()>=y))return false;}
  if(ROT_MONTHS.length){
    var yr=ROT_YEAR?+ROT_YEAR:on.getFullYear();
    var hit=ROT_MONTHS.some(function(m){var a=new Date(yr,m-1,1),b=new Date(yr,m,0);return on<=b&&(off||on)>=a;});
    if(!hit)return false;
  }
  return true;
}
function drawRotation(){
  var b=ROT,c=b.counts;
  if(document.getElementById('rotchips'))rmonthChips();
  var sfilt=function(arr){return (arr||[]).filter(function(x){return (!ROT_F||x.status===ROT_F)&&legInFilter(x);});};
  var h='<div class=tiles>'+rfTile(c['On board'],'On board','green','On board')+rfTile(c['On Vacation'],'On vacation','amber','On Vacation')
    +rfTile(c['Earmarked'],'Earmarked','royal','Earmarked')+rfTile(c['Inactive'],'Inactive','gray','Inactive')+rfTile(c.vessels,'Vessels — show all','','')+'</div>';
  var shore=(b.shoreside||[]);
  if(shore.length){var hclosed=ROT_CLOSED['__SHORE__']!==false;
    h+='<div class=shipsec style="margin-top:4px"><div class=shiphdr data-toggle="__SHORE__" style="border-left-color:#7c879a"><span class=nm>Shoreside team</span><span class=meta>DG3 staff · not seafarers · '+shore.length+' <span class="arw'+(hclosed?' closed':'')+'">▾</span></span></div>'
     +'<div class="shipbody'+(hclosed?' closed':'')+'">'+shore.map(rotCard).join('')+'</div></div>';}
  var pool=sfilt(b.pool||[]);
  if(pool.length){var pclosed=!!ROT_CLOSED['__POOL__'];
    h+='<div class=shipsec style="margin-top:4px"><div class=shiphdr data-toggle="__POOL__" style="border-left-color:#9aa7b6"><span class=nm>Unassigned pool</span><span class=meta>active · no ship assigned · '+pool.length+' crew <span class="arw'+(pclosed?' closed':'')+'">▾</span></span></div>'
     +'<div class="shipbody shipdrop'+(pclosed?' closed':'')+'" data-ship="__POOL__">'+pool.map(rotCard).join('')+'</div></div>';}
  var secs=(b.sections||[]).slice();
  if(ROT_BRAND)secs=secs.filter(function(s){return s.brand===ROT_BRAND;});
  if(ROT_FIND){var q=ROT_FIND.toLowerCase();secs=secs.filter(function(s){return s.ship.toLowerCase().indexOf(q)>=0;});}
  secs=secs.map(function(s){return {ship:s.ship,brand:s.brand,onboard:s.onboard,crew:sfilt(s.crew),history:s.history};});
  if(ROT_F)secs=secs.filter(function(s){return s.crew.length>0;});
  h+='<div class=zlabel style="margin-top:14px">Ships ('+secs.length+')</div>'+(secs.length?secs.map(rotShip).join(''):'<div class=muted style="padding:10px">No ships match.</div>');
  document.getElementById('rotbody').innerHTML=h;
  document.querySelectorAll('#rotbody .tile[data-rf]').forEach(function(el){el.onclick=function(){var s=el.getAttribute('data-rf');ROT_F=(s===''||ROT_F===s)?'':s;drawRotation();};});
  document.querySelectorAll('#rotbody [data-toggle]').forEach(function(el){el.onclick=function(){var s=el.getAttribute('data-toggle');ROT_CLOSED[s]=!ROT_CLOSED[s];drawRotation();};});
  document.querySelectorAll('#rotbody .rtoggle').forEach(function(el){el.onclick=function(e){e.stopPropagation();var nv=el.getAttribute('data-v')==='1'?0:1;el.setAttribute('data-v',nv);el.classList.toggle('on',!!nv);fetch('/api/rotation/ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:el.getAttribute('data-crew'),field:el.getAttribute('data-f'),value:nv})});};});
  document.querySelectorAll('#rotbody .shipdrop').forEach(function(z){
    z.ondragover=function(e){e.preventDefault();z.classList.add('dragover');};
    z.ondragleave=function(){z.classList.remove('dragover');};
    z.ondrop=function(e){e.preventDefault();z.classList.remove('dragover');
      var ship=z.getAttribute('data-ship');
      // Optimistic, animated move: drop the card into the target ship immediately (no full-board flash).
      if(DRAGEL&&DRAGEL.parentNode!==z){var el=DRAGEL;el.classList.add('landing');z.appendChild(el);setTimeout(function(){el.classList.remove('landing');},260);}
      assignCrew(DRAGID,ship);
    };
  });
}
async function exportDaysExcel(){
  try{
    // Days actually WORKED this month by crew active in Keyman now (from the live board roster),
    // so accounting can bill the customer. The server scopes to [1st-of-month -> today].
    var d=await (await fetch('/api/billing/month')).json();
    var T=d.totals||{};var from=d.from||'';var to=d.to||'';
    var monthLabel=new Date((d.month||'')+'-01T00:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
    var rows=[
      ['DAYS WORKED FOR BILLING — '+monthLabel],
      ['Period (month-to-date):',from+' to '+to],
      ['Crew active this month:',(T.crew||0),'Total sea-days:',(T.days||0)],
      [],
      ['BY CREW — for customer billing'],
      ['Crew','Agency ID','Vessel','Customer','Status','Sign-on','Days worked']
    ];
    (d.perCrew||[]).forEach(function(c){rows.push([c.name,c.sc,c.ship||'',c.client||'',c.status||'',c.signOn||'',c.days]);});
    rows.push([]);rows.push(['BY VESSEL / CUSTOMER']);rows.push(['Vessel','Customer','Crew','Days']);
    (d.perVessel||[]).forEach(function(v){rows.push([v.ship,v.client||'',v.crew,v.days]);});
    var csv=rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?('"'+x.replace(/"/g,'""')+'"'):x;}).join(',');}).join('\\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='days-worked_'+from.slice(0,7)+'.csv';a.click();
  }catch(e){alert('Could not export days worked.');}
}
async function assignCrew(id,ship){
  if(!id)return; DRAGID=null; DRAGEL=null;
  try{
    var r=await (await fetch('/api/rotation/assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,ship:ship})})).json();
    // Success: keep the optimistic card placement (no jarring full re-render). Reconciles on next load.
    if(!r||!r.ok)renderRotation();
  }catch(e){renderRotation();}
}
let COMP=null;
async function renderCompliance(){
  if(!$('#compdays')){
    $('#view').innerHTML='<div class=bar><h2>Document compliance</h2>'
      +'<label class=csub style="margin-left:auto">Window '
      +'<select id=compdays onchange="loadCompliance()"><option value=30>30 days</option><option value=60 selected>60 days</option><option value=90>90 days</option></select></label>'
      +'<button class="btn ghost" onclick="exportCompliance()">Download CSV</button></div>'
      +'<div id=compsub class=csub style="margin:-6px 0 12px"></div><div id=compbody></div>';
  }
  loadCompliance();
}
async function loadCompliance(){
  const days=$('#compdays')?$('#compdays').value:60;
  $('#compbody').innerHTML='<div class=muted>Loading…</div>';
  COMP=await (await fetch('/api/compliance?days='+days)).json();
  const rows=COMP.report||[];
  const exp=rows.filter(function(r){return r.severity===3;}).length;
  $('#compsub').textContent=rows.length+' flagged ('+exp+' expired) · within '+COMP.warnDays+' days · as of '+COMP.today;
  if(!rows.length){$('#compbody').innerHTML='<p class=muted style="text-align:left;padding:14px 2px">All clear — no documents expired or expiring within '+COMP.warnDays+' days.</p>';return;}
  $('#compbody').innerHTML='<div class=grid>'+rows.map(function(r){
    const flags=r.flags.map(function(f){
      const cls=f.status==='expired'?'red':f.status==='expiring'?'amber':'royal';
      const txt=f.status==='missing'?(f.doc+' missing'):(f.doc+' '+(f.exp||'')+(f.days!=null?(' ('+(f.days<0?(Math.abs(f.days)+'d ago'):(f.days+'d'))+')'):''));
      return '<span class="cchip '+cls+'">'+txt+'</span>';
    }).join('');
    return '<div class="card b-'+brandOf(r.vessel)+'" data-crew="'+r.agency_id+'" style="cursor:pointer"><div class=cname>'+r.name+'</div><div class=csub>'+r.agency_id+' · '+(r.vessel||'—')+'</div><div class=statdot><i style="background:'+dot(r.status)+'"></i>'+(r.status||'')+'</div><div class=cchips>'+flags+'</div></div>';
  }).join('')+'</div>';
  document.querySelectorAll('#compbody .card[data-crew]').forEach(function(el){el.onclick=function(){openCrew(el.getAttribute('data-crew'));};});
}
function exportCompliance(){
  if(!COMP)return;
  const rows=[['Crew','ID','Vessel','Status','Document','Doc status','Expiry','Days']];
  (COMP.report||[]).forEach(function(r){r.flags.forEach(function(f){rows.push([r.name,r.agency_id,r.vessel||'',r.status||'',f.doc,f.status,f.exp||'',f.days==null?'':f.days]);});});
  const csv=rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?('"'+x.replace(/"/g,'""')+'"'):x;}).join(',');}).join('\\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='compliance_'+COMP.today+'_'+COMP.warnDays+'d.csv';a.click();
}
/* ---- hand-rolled inline-SVG charts (no CDN dependency) ---- */
function donutSVG(segs){
  var cx=90,cy=90,r=72,ir=46,total=segs.reduce(function(a,b){return a+(b.value||0);},0)||1,ang=-Math.PI/2,out='';
  segs.forEach(function(s){var v=s.value||0;if(v<=0)return;var a2=ang+v/total*Math.PI*2;
    var x1=cx+r*Math.cos(ang),y1=cy+r*Math.sin(ang),x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2);
    var xi2=cx+ir*Math.cos(a2),yi2=cy+ir*Math.sin(a2),xi1=cx+ir*Math.cos(ang),yi1=cy+ir*Math.sin(ang);
    var lg=(a2-ang)>Math.PI?1:0;
    out+='<path d="M'+x1.toFixed(1)+' '+y1.toFixed(1)+' A'+r+' '+r+' 0 '+lg+' 1 '+x2.toFixed(1)+' '+y2.toFixed(1)+' L'+xi2.toFixed(1)+' '+yi2.toFixed(1)+' A'+ir+' '+ir+' 0 '+lg+' 0 '+xi1.toFixed(1)+' '+yi1.toFixed(1)+' Z" fill="'+s.color+'"></path>';
    ang=a2;});
  return '<svg viewBox="0 0 180 180" width="158" height="158">'+out+'<text x="90" y="86" text-anchor="middle" font-size="28" font-weight="800" fill="#1B3A5C" font-family="Outfit">'+total+'</text><text x="90" y="104" text-anchor="middle" font-size="10" fill="#6B7C93">crew</text></svg>';
}
function barSVG(items){
  var max=items.reduce(function(a,b){return Math.max(a,b.value||0);},0)||1,w=260,bh=24,gap=11,h=items.length*(bh+gap),out='';
  items.forEach(function(it,i){var y=i*(bh+gap),bw=Math.max(2,(it.value||0)/max*(w-130));
    out+='<text x="0" y="'+(y+16)+'" font-size="11" fill="#42526a" font-family="DM Sans">'+it.label+'</text>';
    out+='<rect x="92" y="'+y+'" width="'+bw.toFixed(1)+'" height="'+bh+'" rx="5" fill="'+(it.color||'#1E6FD0')+'"></rect>';
    out+='<text x="'+(96+bw).toFixed(1)+'" y="'+(y+16)+'" font-size="11" font-weight="700" fill="#1B3A5C">'+(it.value||0)+'</text>';});
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'">'+out+'</svg>';
}
function lineSVG(pts){
  if(!pts.length)return '<div class=muted style="padding:16px">No data on file.</div>';
  var w=320,h=130,pad=26,max=pts.reduce(function(a,b){return Math.max(a,b.y||0);},0)||1,n=pts.length,dx=(w-pad*2)/Math.max(1,n-1);
  var co=pts.map(function(p,i){return [pad+i*dx,h-pad-(p.y/max)*(h-pad*2)];});
  var path=co.map(function(c,i){return (i?'L':'M')+c[0].toFixed(1)+' '+c[1].toFixed(1);}).join(' ');
  var area=path+' L'+co[n-1][0].toFixed(1)+' '+(h-pad)+' L'+co[0][0].toFixed(1)+' '+(h-pad)+' Z';
  var dots=co.map(function(c){return '<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="2.6" fill="#1E6FD0"></circle>';}).join('');
  var labs=pts.map(function(p,i){return '<text x="'+co[i][0].toFixed(1)+'" y="'+(h-7)+'" text-anchor="middle" font-size="8" fill="#6B7C93">'+p.x+'</text>';}).join('');
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'"><path d="'+area+'" fill="rgba(30,111,208,.12)"></path><path d="'+path+'" fill="none" stroke="#1E6FD0" stroke-width="2"></path>'+dots+labs+'</svg>';
}
function legendH(segs){return '<div class=legend>'+segs.filter(function(s){return (s.value||0)>0;}).map(function(s){return '<span><i style="background:'+s.color+'"></i>'+s.label+' '+s.value+'</span>';}).join('')+'</div>';}
var DASH=null,DASH_SH=false;
async function renderDashboard(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  var d;try{d=await (await fetch('/api/dashboard')).json();}catch(e){$('#view').innerHTML='<div class=muted>Could not load. <button class="btn ghost" onclick="renderDashboard()">Retry</button></div>';return;}
  DASH=d;var w=d.workforce,c=d.compliance,bd=d.birthdays||[],bz=d.bonus||{},mn=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
`;
