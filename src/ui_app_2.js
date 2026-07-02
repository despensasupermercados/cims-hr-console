// DG3 CIMS HR Console single-page app template — part 2 of 2 (see ui_app_1.js).
// Moved VERBATIM from src/worker.js (APP_HTML); bytes unchanged.
export const APP_HTML_2 = `  var statusSegs=[{label:'On board',value:w.on_board,color:'#5FB946'},{label:'On vacation',value:w.on_vacation,color:'#B0741A'},{label:'Earmarked',value:w.earmarked,color:'#1E6FD0'}];
  var bc=w.byClient||{},clientSegs=[{label:'Royal Caribbean',value:bc['Royal Caribbean']||0,color:'#1E6FD0'},{label:'Celebrity',value:bc['Celebrity']||0,color:'#0C8C8C'},{label:'Azamara',value:bc['Azamara']||0,color:'#7A5AA8'},{label:'NCL',value:bc['NCL']||0,color:'#E0962B'}];
  var compBars=[{label:'Medical',value:c.med_exp_90,color:'#BC3B2C'},{label:'Seaman bk',value:c.sirb_exp_90,color:'#B0741A'},{label:'Passport',value:c.pp_exp_90,color:'#B0741A'},{label:'US visa',value:c.usv_exp_90,color:'#B0741A'},{label:'Schengen',value:c.sch_exp_90,color:'#7A5AA8'}];
  var compTot=compBars.reduce(function(a,b){return a+(b.value||0);},0);
  var h='<div class=bar><h2>Operational dashboard</h2><span class=csub style="margin-left:auto">as of '+d.today+' · '+w.total+' crew</span></div>';
  if(bd.length)h+='<div class="card" style="max-width:none;border-left:3px solid var(--green);margin:0 0 14px"><b style="color:var(--green-d)">🎂 Birthday today:</b> '+bd.map(function(b){return b.name+(b.vessel?(' · '+b.vessel):'');}).join(' &nbsp;•&nbsp; ')+'</div>';
  // ZONE 1 — WORKFORCE
  h+='<div class=zlabel>Workforce</div><div class=dzone>'
   +'<div class="panel center"><h3>Status mix</h3>'+donutSVG(statusSegs)+legendH(statusSegs)+'</div>'
   +'<div class="panel center"><h3>By client</h3>'+donutSVG(clientSegs)+legendH(clientSegs)+'</div>'
   +'<div class=panel><h3>At a glance</h3><div class=tiles style="grid-template-columns:1fr 1fr">'
     +tile(w.total,'Total crew','','crew')+tile(w.vessels,'Vessels','','fleet')
     +tile(w.retired||0,'Retired','gray','crew')+tile((d.dryDockNow||0),'In dry dock',(d.dryDockNow?'red':'green'),'fleet')
   +'</div></div></div>';
  // ZONE 2 — COMPLIANCE
  h+='<div class=zlabel>Compliance — documents expiring within 90 days</div><div class=dzone>'
   +'<div class="panel" style="grid-column:span 2"><h3>Expiring documents by type</h3>'+(compTot?barSVG(compBars):'<div class=muted style="padding:16px">All documents valid beyond 90 days.</div>')+'</div>'
   +'<div class=panel><h3>Action needed</h3><div class=tiles style="grid-template-columns:1fr 1fr">'
     +tile(compTot,'Total flagged',(compTot?'amber':'green'),'compliance')+tile(c.med_exp_90,'Medical','red','compliance')
   +'</div><p class=hint style="margin-top:10px">Open the Compliance tab for the crew list and CSV export.</p></div></div>';
  // ZONE 3 — COST & BONUS
  h+='<div class=zlabel>Cost &amp; bonus</div><div class=dzone>'
   +'<div class=panel style="grid-column:span 2"><h3>Travel spend by month'+(d.travel&&d.travel.year?(' · '+d.travel.year):'')+'</h3><div id=trvline></div><div id=trvmom class=csub style="margin-top:4px"></div></div>'
   +'<div class=panel><h3>Travel budget</h3><div id=trv class=tiles style="grid-template-columns:1fr 1fr"></div><div id=trvcat style="margin-top:12px"></div></div></div>'
   +'<p class=muted style="text-align:left;padding:10px 2px">Live from Cloudflare D1 · tip: tiles are clickable</p>';
  $('#view').innerHTML=h;
  document.querySelectorAll('#view .tile[data-go]').forEach(function(el){el.onclick=function(){show(el.getAttribute('data-go'));};});
  var bt=document.getElementById('shtog');if(bt)bt.onclick=function(){DASH_SH=!DASH_SH;paintDashCost();};
  paintDashCost();
}
function paintDashCost(){
  var d=DASH;if(!d)return;var tv=d.travel||{},mn=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var bt=document.getElementById('shtog');if(bt)bt.textContent=DASH_SH?'Show shoreside':'Hide shoreside';
  // line: total spend by month (shoreside is annual-only in source, so the toggle adjusts headline tiles)
  var ms=tv.months||[],lineEl=document.getElementById('trvline');
  if(lineEl)lineEl.innerHTML=lineSVG(ms.map(function(x){return {x:mn[x.m],y:x.t};}));
  var momEl=document.getElementById('trvmom');
  if(momEl&&ms.length){var last=ms[ms.length-1],prev=ms.length>1?ms[ms.length-2]:null;var mom=(prev&&prev.t)?((last.t-prev.t)/prev.t*100):null;var arrow=mom==null?'':(mom>=0?'▲':'▼');var col=mom==null?'var(--mut)':(mom>=0?'var(--red)':'var(--green-d)');var air=tv.air||0,share=tv.all?Math.round(air/tv.all*100):0;
    momEl.innerHTML='Latest: <b style="color:var(--navy)">'+mn[last.m]+'</b> $'+Math.round(last.t).toLocaleString()+(mom!=null?(' · <span style="color:'+col+'">'+arrow+' '+Math.abs(mom).toFixed(0)+'% vs '+mn[prev.m]+'</span>'):'')+' · air '+share+'% of spend';}
  var trv=document.getElementById('trv');
  if(trv){
    var annualBud=(tv.budgetMo||15000)*12;                  // actual budget $180k/yr
    var crew=tv.crew||0;                                    // crew travel = what the budget governs (shoreside is separate, unbudgeted)
    var pct=annualBud?Math.round(crew/annualBud*100):0;
    trv.innerHTML=
      tile('<span style="font-size:22px;color:'+(pct<=100?'var(--green-d)':'var(--red)')+'">'+pct+'%</span>','of $'+Number(annualBud).toLocaleString()+' annual budget used','','travel')
      +tile('<span style="font-size:22px">$'+Math.round(crew).toLocaleString()+'</span>','crew travel '+(tv.year||''),'','travel');
    trv.querySelectorAll('.tile[data-go]').forEach(function(x){x.onclick=function(){show(x.getAttribute('data-go'));};});
  }
  var catEl=document.getElementById('trvcat');
  if(catEl&&tv.cats){
    var order=['air','hotel','transport','medical','visa','food','other'];
    var labs={air:'Air',hotel:'Hotel',transport:'Transport',medical:'Medical',visa:'Visa',food:'Food',other:'Other'};
    var mx=0;order.forEach(function(k){if((tv.cats[k]||0)>mx)mx=tv.cats[k];});
    var rh=order.filter(function(k){return (tv.cats[k]||0)>0;}).map(function(k){var v=tv.cats[k]||0,w=mx?Math.round(v/mx*100):0;return '<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><div style="width:62px;font-size:11px;color:var(--mut)">'+labs[k]+'</div><div style="flex:1;background:#eef1f5;border-radius:4px;height:13px"><div style="width:'+w+'%;height:13px;background:var(--navy);border-radius:4px"></div></div><div style="width:64px;text-align:right;font-size:11px;font-weight:700">$'+Math.round(v).toLocaleString()+'</div></div>';}).join('');
    catEl.innerHTML='<div class=csub style="margin-bottom:4px">Crew spend by category'+(tv.year?(' · '+tv.year):'')+'</div>'+rh+'<div class=csub style="margin-top:8px;color:var(--mut)">+ $'+Math.round(tv.shoreside||0).toLocaleString()+' shoreside travel · tracked separately (no budget)</div>';
  }
}
function tile(n,l,cls,go){return '<div class="tile '+(cls||'')+'"'+(go?(' data-go="'+go+'" style="cursor:pointer"'):'')+'><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';}
function crewTile(n,l,cls,st){return '<div class="tile '+(cls||'')+'" data-st="'+st+'" style="cursor:pointer"><div class=n>'+(n!=null?n:'—')+'</div><div class=l>'+l+'</div></div>';}
var CF={q:'',status:'',comp:'',client:'',ship:'',sort:'az'};
var CLIENT_COL={'Royal Caribbean':'#1E6FD0','Celebrity':'#0C8C8C','Azamara':'#7A5AA8','NCL':'#E0962B'};
function ageOf(dob){if(!dob)return'';var d=new Date(dob);if(isNaN(d))return'';var t=new Date(),a=t.getFullYear()-d.getFullYear();if(t.getMonth()<d.getMonth()||(t.getMonth()===d.getMonth()&&t.getDate()<d.getDate()))a--;return a>0&&a<100?a:'';}
function fmtPhone(p){if(!p)return{txt:'',bad:false};var raw=String(p).replace(/[^0-9+]/g,'');var ok=/^\\+?63\\d{10}$/.test(raw)||/^09\\d{9}$/.test(raw);return{txt:String(p).trim(),bad:!ok};}
function rankShort(c){return (c!=null&&c>=1)?'PS':'Jr PS';}
// Rank tag from the REGISTRY rank string (AdvancedQuery: 'Printer Specialist' / 'Junior Printer
// Specialist'), falling back to count only if no registry rank. Fixes everyone showing 'Jr PS'.
function rankTag(r,c){var s=String(r||'').toLowerCase();if(s.indexOf('junior')>=0||s.indexOf('jr')>=0)return 'Jr PS';if(s.indexOf('printer')>=0||s.indexOf('special')>=0||s===' ps'||s==='ps')return 'PS';return rankShort(c);}
function docFlag(exp){if(!exp)return'missing';var days=(new Date(exp)-new Date())/86400000;if(days<0)return'expired';if(days<=90)return'90d';return'ok';}
function crewMatchesComp(c){
  if(c.status==='Inactive'||c.status==='Retired')return false;
  var f=CF.comp;
  if(f==='expired')return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){var g=docFlag(c[k]);return g==='expired'||g==='missing';});
  if(f==='soon')return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){return docFlag(c[k])==='90d';});
  if(f==='schengen'){if(!c.sch_exp)return false;var g=docFlag(c.sch_exp);return g==='expired'||g==='90d';}
  return true;
}
async function renderCrew(){
  CREW=[];CF.q='';CF.status='';CF.comp='';CF.client='';CF.ship='';CF.sort='az';
  $('#view').innerHTML='<div class=muted>Loading crew…</div>';
  try{var r=await (await fetch('/api/crew')).json();CREW=r.crew||[];}catch(e){$('#view').innerHTML='<div class=muted>Could not load crew. <button class="btn ghost" onclick="renderCrew()">Retry</button></div>';return;}
  var clients=Array.from(new Set(CREW.map(function(c){return c.client;}).filter(Boolean))).sort();
  $('#view').innerHTML=
   '<div class=bar><h2>Crew</h2>'
   +'<div class=search style="margin-left:auto"><input id=q placeholder="name, crew ID, or passport" oninput="CF.q=this.value;paintCrew()" style="width:230px"></div>'
   +'<select id=cClient onchange="CF.client=this.value;CF.ship=\\'\\';crewShipOpts();paintCrew()"><option value="">All clients</option>'+clients.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select>'
   +'<select id=cShip onchange="CF.ship=this.value;paintCrew()"><option value="">All ships</option></select>'
   +'<select id=cSort onchange="CF.sort=this.value;paintCrew()"><option value="az">Sort: name A–Z</option><option value="soon">Sort: sign-off soonest</option><option value="tenure">Sort: contracts (high→low)</option><option value="ship">Sort: ship</option></select>'
   +'<button class="btn ghost" onclick="clearCrewFilters()">Clear</button>'
   +'<button class="btn ghost" id=intelReviewBtn onclick="openIntelReview()">Review intel</button>'
   +'<button class="btn ghost" onclick="exportDocsCSV()">Docs CSV</button>'
   +'<button class="btn green" onclick="addCrewModal()">+ Add crew</button>'
   +'</div><div class=tiles id=crewtiles></div>'
   +'<div id=crewcount class=csub style="margin:8px 0 12px"></div><div id=crewgrid class=grid></div>';
  crewShipOpts();paintCrew();intelReviewCount();
}
async function intelReviewCount(){
  try{var r=await (await fetch('/api/intel/review')).json();var b=document.getElementById('intelReviewBtn');if(b)b.innerHTML='Review intel'+(r.count?(' <span class=vchip>'+r.count+'</span>'):'');}catch(e){}
}
async function openIntelReview(){
  var w=document.createElement('div');w.id='intelmodal';w.className='modwrap';
  w.innerHTML='<div class=modcard><div class=modhd><div><div class=cname>Field intel — needs review</div><div class=csub>Emails the matcher could not confidently attribute. Assign to a crew, or discard.</div></div><button class="btn ghost" onclick="closeIntelReview()">Close ✕</button></div><div id=intelrev style="margin-top:12px"><div class=muted style="padding:14px">Loading…</div></div></div>';
  w.onclick=function(e){if(e.target===w)closeIntelReview();};document.body.appendChild(w);loadIntelReview();
}
function closeIntelReview(){var w=document.getElementById('intelmodal');if(w)w.remove();}
async function loadIntelReview(){
  var box=document.getElementById('intelrev');if(!box)return;
  var r;try{r=await (await fetch('/api/intel/review')).json();}catch(e){box.innerHTML='<div class=muted style="padding:14px">Could not load.</div>';return;}
  var ps=r.pending||[];
  if(!ps.length){box.innerHTML='<div class=muted style="padding:14px">Nothing to review — all clear.</div>';return;}
  box.innerHTML=ps.map(function(p){
    var cands=(p.candidates||[]).map(function(c){return '<button class="btn green" style="padding:6px 10px;font-size:12px;margin:2px" onclick="intelAssign(\\''+p.id+'\\',\\''+c.agency_id+'\\')">→ '+String(c.name).replace(/</g,'&lt;')+'</button>';}).join('');
    return '<div class=noteitem><div class=notemeta>'+(p.reporter?(String(p.reporter).replace(/</g,'&lt;')+' · '):'')+'<span class=cchip>'+p.confidence+' match</span></div><div class=notetext>'+String(p.summary||'').replace(/</g,'&lt;').replace(/\\n/g,'<br>')+'</div><div style="margin-top:6px">'+(cands||'<span class=hint>No candidate names found. </span>')+' <button class="btn ghost" style="padding:6px 10px;font-size:12px;margin:2px" onclick="intelDiscard(\\''+p.id+'\\')">Discard</button></div></div>';
  }).join('');
}
async function intelAssign(id,aid){
  try{await fetch('/api/intel/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,agency_id:aid})});}catch(e){}
  loadIntelReview();intelReviewCount();
}
async function intelDiscard(id){
  if(!confirm('Discard this note?'))return;
  try{await fetch('/api/intel/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,discard:true})});}catch(e){}
  loadIntelReview();intelReviewCount();
}
function crewShipOpts(){
  var sel=document.getElementById('cShip');if(!sel)return;
  var ships=Array.from(new Set(CREW.filter(function(c){return !CF.client||c.client===CF.client;}).map(function(c){return c.vessel_observed;}).filter(Boolean))).sort();
  sel.innerHTML='<option value="">All ships</option>'+ships.map(function(s){return '<option'+(s===CF.ship?' selected':'')+'>'+s+'</option>';}).join('');
}
function clearCrewFilters(){CF.q='';CF.status='';CF.comp='';CF.client='';CF.ship='';CF.sort='az';renderCrew();}
function docsModal(id){
  var c=null,i;for(i=0;i<CREW.length;i++){if(CREW[i].agency_id===id){c=CREW[i];break;}}
  if(!c)return;
  var name=[c.first_name,c.middle_name,c.last_name].filter(Boolean).join(' ');
  var docs=[['Medical','med_exp'],['Seaman Bk','sirb_exp'],['Passport','pp_exp'],['US C1/D Visa','usv_exp'],['Schengen','sch_exp']];
  var map={expired:['Expired','red'],'90d':['Expiring','amber'],ok:['Valid','ok'],missing:['Missing','amber']};
  var body='<div class=hint style="margin-bottom:8px">'+c.agency_id+' · '+(c.vessel_observed||'—')+' · '+(c.status||'')+'</div>'
   +'<table class=tbl><thead><tr><th>Document</th><th>Expiry</th><th>Status</th><th style="text-align:right">Remaining</th></tr></thead><tbody>'
   +docs.map(function(d){var exp=c[d[1]];var g=docFlag(exp);var st=map[g]||map.missing;var days=exp?Math.round((new Date(exp)-new Date())/86400000):null;var dtxt=(days==null)?'—':(days<0?(Math.abs(days)+'d ago'):(days+'d left'));return '<tr><td>'+d[0]+'</td><td>'+(exp||'—')+'</td><td><span class="cchip '+st[1]+'">'+st[0]+'</span></td><td style="text-align:right">'+dtxt+'</td></tr>';}).join('')
   +'</tbody></table><div class=hint style="margin-top:8px">Fleet-wide list &amp; export: Crew tab → Docs CSV, or click the Docs tiles to filter.</div>';
  $('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class=modal><div class=mh>Document compliance — '+name+'<button onclick="mClose()">×</button></div><div class=mb>'+body+'</div></div></div>';MODAL_T=Date.now();
}
async function exportDocsCSV(){
  var d=await (await fetch('/api/compliance?days=90')).json();
  var rows=[['Crew','ID','Vessel','Status','Document','Doc status','Expiry','Days']];
  (d.report||[]).forEach(function(r){r.flags.forEach(function(f){rows.push([r.name,r.agency_id,r.vessel||'',r.status||'',f.doc,f.status,f.exp||'',f.days==null?'':f.days]);});});
  var csv=rows.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?('"'+x.replace(/"/g,'""')+'"'):x;}).join(',');}).join('\\n');
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='compliance_'+(d.today||'')+'.csv';a.click();
}
function crewTiles(){
  var on=CREW.filter(function(c){return c.status==='On board';}).length;
  var vac=CREW.filter(function(c){return c.status==='On Vacation';}).length;
  var ear=CREW.filter(function(c){return c.status==='Earmarked';}).length;
  var ina=CREW.filter(function(c){return c.status==='Inactive';}).length;
  var ret=CREW.filter(function(c){return c.status==='Retired';}).length;
  var act=CREW.filter(function(c){return c.status!=='Inactive'&&c.status!=='Retired';}); // active = excludes retired & inactive; doc compliance only matters for sailing crew
  var exp=act.filter(function(c){return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){var g=docFlag(c[k]);return g==='expired'||g==='missing';});}).length;
  var soon=act.filter(function(c){return ['med_exp','sirb_exp','pp_exp','usv_exp'].some(function(k){return docFlag(c[k])==='90d';});}).length;
  var sch=act.filter(function(c){return c.sch_exp&&['expired','90d'].indexOf(docFlag(c.sch_exp))>=0;}).length;
  function t(n,l,cls,kind,key){var onx=(kind==='st'?CF.status:CF.comp)===key&&key!=='';return '<div class="tile '+(cls||'')+(onx?' on':'')+'" data-kind="'+kind+'" data-key="'+key+'" style="cursor:pointer"><div class=n>'+n+'</div><div class=l>'+l+'</div></div>';}
  return t(CREW.length,'All crew','','st','')+t(on,'On board','green','st','On board')+t(vac,'On vacation','amber','st','On Vacation')+t(ret,'Retired','gray','st','Retired')+t(ear,'Earmarked','royal','st','Earmarked')+t(ina,'Inactive','gray','st','Inactive')
   +t(exp,'Docs expired/missing','red','comp','expired')+t(soon,'Docs ≤90 days','amber','comp','soon')+t(sch,'Schengen expiring','amber','comp','schengen');
}
function paintCrew(){
  document.getElementById('crewtiles').innerHTML=crewTiles();
  document.querySelectorAll('#crewtiles .tile[data-kind]').forEach(function(el){el.onclick=function(){
    var k=el.getAttribute('data-kind'),key=el.getAttribute('data-key');
    if(k==='st'){CF.status=(CF.status===key)?'':key;CF.comp='';}else{CF.comp=(CF.comp===key)?'':key;CF.status='';}
    paintCrew();
  };});
  var q=CF.q.trim().toLowerCase();
  var list=CREW.filter(function(c){
    if(CF.status&&c.status!==CF.status)return false;
    if(CF.comp&&!crewMatchesComp(c))return false;
    if(CF.client&&c.client!==CF.client)return false;
    if(CF.ship&&c.vessel_observed!==CF.ship)return false;
    if(q){var hay=((c.first_name||'')+' '+(c.last_name||'')+' '+(c.agency_id||'')+' '+(c.pp_no||'')).toLowerCase();if(hay.indexOf(q)<0)return false;}
    return true;
  });
  list.sort(function(a,b){
    if(CF.sort==='tenure')return (b.contract_count||0)-(a.contract_count||0);
    if(CF.sort==='ship')return (a.vessel_observed||'~').localeCompare(b.vessel_observed||'~');
    if(CF.sort==='soon'){var ax=a.active_off||'9999',bx=b.active_off||'9999';return ax<bx?-1:ax>bx?1:0;}
    return (a.last_name||'').localeCompare(b.last_name||'')||(a.first_name||'').localeCompare(b.first_name||'');
  });
  var filt=[];if(CF.status)filt.push(CF.status);if(CF.comp)filt.push({expired:'docs expired/missing',soon:'docs ≤90d',schengen:'Schengen expiring'}[CF.comp]);if(CF.client)filt.push(CF.client);if(CF.ship)filt.push(CF.ship);
  $('#crewcount').textContent=list.length+' of '+CREW.length+' crew'+(filt.length?' · '+filt.join(' · '):'');
  $('#crewgrid').innerHTML=list.map(card).join('')||'<div class=muted>No matches.</div>';
  document.querySelectorAll('#crewgrid .crew-card').forEach(function(el){
    el.onclick=function(ev){if(ev.target.closest('.tools')||ev.target.closest('.notedot'))return;openCrew(el.getAttribute('data-crew'));};
  });
}
async function loadCrew(){return renderCrew();}
function filterCrew(){paintCrew();}
async function openCrew(id){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  var dq=fetch('/api/crew/get?id='+encodeURIComponent(id)).then(function(r){return r.json();});
  var bq=fetch('/api/bonus/crew?id='+encodeURIComponent(id)).then(function(r){return r.json();}).catch(function(){return {};});
  const d=await dq; const bz=await bq;
  if(d.error){$('#view').innerHTML='<div class=muted>Not found.</div>';return;}
  const c=d.crew;const name=[c.first_name,c.middle_name,c.last_name].filter(Boolean).join(' ');
  const doc=function(label,dt){if(!dt)return '<span class="cchip">'+label+': —</span>';const days=(new Date(dt)-new Date())/86400000;const cls=days<0?'red':days<90?'amber':'ok';return '<span class="cchip '+cls+'">'+label+' '+dt+'</span>';};
  CURRENT_CREW=c.agency_id; CURD={crew:c,contracts:(d.contracts||[]),bonus:bz};
  let h='<div class="bar noprint"><h2>'+name+'</h2>'
    +'<button class="btn ghost" style="margin-left:auto" onclick="renderCrew()">← Back</button>'
    +'<button class="btn ghost" onclick="sendSignoffInstructions(\\''+c.agency_id+'\\','+((d.contracts&&d.contracts.length)?d.contracts[d.contracts.length-1].seq:0)+')">Send instructions</button>'
    +'<button class="btn ghost" onclick="sendSignoffLink(\\''+c.agency_id+'\\','+((d.contracts&&d.contracts.length)?d.contracts[d.contracts.length-1].seq:0)+')">Send sign-off link</button>'
    +'<button class="btn ghost" onclick="exportCrewCSV()">Export CSV</button>'
    +'<button class="btn ghost" onclick="emailStatement()">Email statement</button>'
    +'<button class="btn" onclick="downloadStatement()">Download PDF</button></div>'
    +'<div id=stmtout class="csub noprint" style="margin:-6px 0 10px"></div>';
  h+='<div class="card noprint" style="max-width:none;margin-bottom:14px"><div class=csub style="margin-bottom:6px">Request a feedback window (creates a single-use link to send the contributor):</div>'
    +'<button class="btn ghost rf" data-role="ray">Ray — Orders</button> '
    +'<button class="btn ghost rf" data-role="rolando">Rolando — Technical</button> '
    +'<button class="btn ghost rf" data-role="dexter">Dexter — Field</button>'
    +'<div id=fbout class=csub style="margin-top:8px"></div></div>';
  h+='<div class=stmt>';
  h+='<div class=printhead>DG3 CIMS — Crew Statement · '+name+' · '+new Date().toISOString().slice(0,10)+'</div>';
  h+='<div class="card" style="border-left:3px solid var(--navy);max-width:none">'
    +'<div class=cname>'+name+'</div>'
    +'<div class=csub>'+c.agency_id+' · '+(c.rank_override||c.rank_observed||'')+'</div>'
    +'<div class=statdot><i style="background:'+dot(c.status)+'"></i>'+c.status+'</div>'
    +'<div class=vessel>'+(c.vessel_observed||'—')+'</div>'
    +'<div class=csub style="margin-top:6px">'+[c.email,c.phone,c.province,(c.dob?('DOB '+c.dob):'')].filter(Boolean).join(' · ')+'</div>'
    +'<div class=cchips style="margin-top:8px">'+doc('Medical',c.med_exp)+doc("Seaman bk",c.sirb_exp)+doc('Passport',c.pp_exp)+doc('US visa',c.usv_exp)+doc('Schengen',c.sch_exp)+'</div>'
    +'</div>';
  var dp=d.deployment||{};
  if(dp.matched){
    var vlabel=dp.visa?(dp.visa.required+': '+(dp.visa.exp||'missing')):'Region entry visa varies by nationality';
    var vsuffix='',vcls='';
    if(dp.visa){var vs2=dp.visa.status;vcls=vs2==='ok'?'ok':(vs2==='expiring'?'amber':'red');if(vs2==='expired')vsuffix=' (EXPIRED)';else if(vs2==='expiring')vsuffix=' (<90d)';else if(vs2==='missing')vsuffix=' (MISSING)';}
    var dd=dp.nextDryDock;
    var ddTxt=dd?(dd.start+(dd.end?(' → '+dd.end):'')+' · '+(dd.loc||'')+(dd.note?(' · '+dd.note):'')):'none scheduled';
    h+='<div class="card" style="max-width:none;margin-top:12px;border-left:3px solid var(--royal)">'
      +'<div class=zlabel style="margin-bottom:6px">Deployment &amp; document fit</div>'
      +'<div class=csub>'+dp.vessel+' · '+(dp.brand||'')+' '+(dp.cls||'')+' class · Homeport '+(dp.homeport||'—')+' · '+(dp.region||'—')+'</div>'
      +'<div class=cchips style="margin-top:8px"><span class="cchip '+vcls+'">'+vlabel+vsuffix+'</span></div>'
      +'<div class=csub style="margin-top:8px"><b>Next dry dock (crew change):</b> '+ddTxt+'</div>'
      +'</div>';
  }
  if(bz&&!bz.error){
    h+='<div class=zlabel style="margin-top:16px">Bonus standing</div>';
    h+='<div class=csub style="margin-bottom:8px">Rank: <b style="color:var(--navy)">'+(bz.rank||'—')+'</b> · '+(bz.count!=null?bz.count:0)+' completed contract(s)'+(bz.baseline_set?'':' · baseline not yet set')+'</div>';
    h+='<div class=tiles>'+tile((bz.count!=null?bz.count:0),'Completed')+tile('$'+(bz.nextRungIfClean!=null?Number(bz.nextRungIfClean).toLocaleString():'—'),'Next rung if clean')+'</div>';
    var outs=bz.outcomes||[];
    if(outs.length) h+='<table class=tbl><thead><tr><th>Date</th><th>Ships</th><th>Score</th><th>Gate</th><th>Pay</th></tr></thead><tbody>'
      +outs.map(function(o){var ships='';try{ships=JSON.parse(o.ships_json||'[]').join(', ');}catch(e){}return '<tr><td>'+(o.committed_at||'').slice(0,10)+'</td><td>'+ships+'</td><td>'+o.score_pct+'%</td><td>'+(o.gate||'—')+'</td><td>$'+(o.pay_usd||0).toLocaleString()+'</td></tr>';}).join('')+'</tbody></table>';
    else h+='<p class=muted style="text-align:left;padding:6px 2px">No bonus outcomes committed yet.</p>';
  }
  const ct=d.contracts||[];
  h+='<div class=zlabel style="margin-top:16px">Contract history'+(d.daysWorked?(' · '+d.daysWorked.toLocaleString()+' sea-days'):'')+'</div>';
  if(!ct.length)h+='<p class=muted style="text-align:left;padding:8px 2px">No Keyman contract history on file.</p>';
  else h+='<table class=tbl><thead><tr><th>#</th><th>Ship</th><th>Sign on</th><th>Sign off</th><th>Basis</th></tr></thead><tbody>'
    +ct.map(function(x){var off=x.act||x.proj||'—';var basis=x.act?'<span class="cchip ok">actual</span>':(x.proj?'<span class="cchip royal">projected</span>':'<span class="cchip amber">open</span>');return '<tr><td>'+x.seq+'</td><td>'+(x.ship||'—')+'</td><td>'+x.on+'</td><td>'+off+'</td><td>'+basis+'</td></tr>';}).join('')+'</tbody></table>';
  h+='</div>';
  $('#view').innerHTML=h;
  document.querySelectorAll('#view .rf').forEach(function(b){b.onclick=function(){reqFeedback(b.getAttribute('data-role'));};});
}
async function reqFeedback(role){
  $('#fbout').textContent='Creating link…';
  try{
    var r=await (await fetch('/api/feedback/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:CURRENT_CREW,role:role})})).json();
    if(r.ok)$('#fbout').innerHTML='<div style="margin-top:4px"><b style="color:var(--navy)">'+r.role+'</b> link for '+r.crew+' (send to the contributor):<br><input readonly value="'+r.link+'" style="width:100%;margin-top:4px" onclick="this.select()"></div>';
    else $('#fbout').textContent='Could not create the link.';
  }catch(e){$('#fbout').textContent='Could not create the link.';}
}
function exportCrewCSV(){
  if(!CURD)return;
  var c=CURD.crew, rows=[];
  rows.push(['Field','Value']);
  [['Crew ID','agency_id'],['First name','first_name'],['Middle','middle_name'],['Last name','last_name'],['Status','status'],['Rank','rank_observed'],['Vessel','vessel_observed'],['DOB','dob'],['Province','province'],['Phone','phone'],['Email','email'],['Medical exp','med_exp'],['Seaman bk exp','sirb_exp'],['Passport exp','pp_exp'],['Schengen exp','sch_exp'],['US visa exp','usv_exp']].forEach(function(p){rows.push([p[0],c[p[1]]==null?'':c[p[1]]]);});
  rows.push([]);rows.push(['Contract #','Ship','Sign on','Sign off','Basis']);
  (CURD.contracts||[]).forEach(function(x){rows.push([x.seq,x.ship||'',x.on||'',x.act||x.proj||'',x.act?'actual':(x.proj?'projected':'open')]);});
  var csv=rows.map(function(r){return r.map(function(v){v=String(v==null?'':v);return /[",\\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v;}).join(',');}).join('\\n');
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='crew_'+c.agency_id+'.csv';a.click();
}
function downloadStatement(){ if(CURRENT_CREW) window.open('/api/crew/statement.pdf?id='+encodeURIComponent(CURRENT_CREW),'_blank'); }
async function emailStatement(){
  if(!CURRENT_CREW)return;
  var out=document.getElementById('stmtout'); if(out){out.style.color='';out.textContent='Sending…';}
  try{
    var r=await (await fetch('/api/crew/statement/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:CURRENT_CREW})})).json();
    if(out){
      if(r.sent) out.innerHTML='<span style="color:var(--green-d)">Statement emailed to '+r.to+(r.stored?' (stored)':'')+'.</span>';
      else out.innerHTML='<span style="color:var(--amber)">'+(r.note||'Could not send.')+'</span>';
    }
  }catch(e){ if(out){out.style.color='var(--red)';out.textContent='Could not send the statement.';} }
}
function card(c){
  var name=[c.first_name,c.last_name].filter(Boolean).join(' ');
  var b=brandOf(c.vessel_observed);
  var age=ageOf(c.dob);
  var sub=c.agency_id+(c.pp_no?(' · '+c.pp_no):'')+(age!==''?(' · '+age+' yrs'):'');
  var ph=fmtPhone(c.phone);
  var contact=[c.province,ph.txt?(ph.txt+(ph.bad?' <span class=vchip>⚠ verify</span>':'')):''].filter(Boolean).join(' · ');
  var span=c.active_on?('ON '+c.active_on+' → OFF '+(c.active_off||'open')+(c.active_off?(' · '+durLabel(c.active_on,c.active_off)):'')):'No active contract on file';
  // doc chips: only flag problems; else "Docs valid"
  var parts=[];
  function mk(exp,lbl){var f=docFlag(exp);if(f==='expired')parts.push('<span class="cchip red">'+lbl+' expired</span>');else if(f==='missing')parts.push('<span class="cchip red">'+lbl+' missing</span>');else if(f==='90d')parts.push('<span class="cchip amber">'+lbl+' ≤90d</span>');}
  mk(c.med_exp,'Medical');mk(c.sirb_exp,'SIRB');mk(c.pp_exp,'Passport');mk(c.usv_exp,'US visa');
  if(c.sch_exp){var sf=docFlag(c.sch_exp);if(sf==='expired')parts.push('<span class="cchip amber">Schengen expired</span>');else if(sf==='90d')parts.push('<span class="cchip amber">Schengen ≤90d</span>');}
  var comp=parts.length?'<div class=cchips>'+parts.join('')+'</div>':'<div class=cchips><span class="cchip ok">Docs valid</span></div>';
  // bonus pill: only show a $ figure when a baseline is set (otherwise it would be a guess)
  var bonusPill;
  if(c.baseline_count!=null){var nv=ladderValue((c.baseline_count||0)+1);bonusPill='<span class="pill next'+(nv===0?' zero':'')+'">Next bonus: '+(nv===0?'$0 (builds to PS)':'$'+nv.toLocaleString())+'</span>';}
  else bonusPill='<span class="pill next zero">Bonus: baseline pending</span>';
  return '<div class="crew-card card b-'+b+'" data-crew="'+c.agency_id+'">'
   +'<div class=tools><button title="Documents" style="color:var(--red);font-weight:800" onclick="docsModal(\\''+c.agency_id+'\\')">✚</button><button title="Notes" onclick="notesModal(\\''+c.agency_id+'\\')">🗒</button><button title="Edit" onclick="editCrewModal(\\''+c.agency_id+'\\')">✎</button></div>'
   +'<div class=cname>'+name+'</div>'
   +'<div class=csub>'+sub+'</div>'
   +'<div class=crow><span class=statdot><i style="background:'+dot(c.status)+'"></i>'+c.status+'</span><span class="pill rank">'+rankTag(c.rank,c.baseline_count)+'</span></div>'
   +'<div class=vessel>'+(c.vessel_observed||'—')+' <small style="color:var(--mut);font-weight:500">· '+(c.client||'')+'</small></div>'
   +(contact?'<div class=cdates>'+contact+'</div>':'')
   +'<div class=cdates>'+span+'</div>'
   +'<div class=crow><span class="pill cnt">Contracts '+(c.contract_count||0)+'</span>'+bonusPill+'</div>'
   +comp
   +(c.hasNote?'<span class=notedot title="View notes" onclick="notesModal(\\''+c.agency_id+'\\')"></span>':'')
   +'</div>';
}
var SHIP_LIST=["Adventure","Allure","Anthem","Apex","Ascent","Beyond","Brilliance","Constellation","Eclipse","Edge","Enchantment","Equinox","Explorer","Freedom","Grandeur","Harmony","Icon","Independence","Infinity","Jewel","Legend","Liberty","Mariner","Millennium","Navigator","Oasis","Odyssey","Ovation","Quantum","Radiance","Reflection","Rhapsody","Serenade","Silhouette","Spectrum","Star","Summit","Symphony","Utopia","Vision","Voyager","Wonder","Xcel","Azamara Journey","Azamara Onward","Azamara Pursuit","Azamara Quest"];
function shipOptions(sel){return '<option value="">—</option>'+SHIP_LIST.map(function(s){var full='MV '+s.toUpperCase();var m=(sel&&(sel===full||sel===s||sel.toUpperCase().indexOf(s.toUpperCase())>=0));return '<option value="'+full+'"'+(m?' selected':'')+'>'+s+'</option>';}).join('');}
// "" = Auto (let the app derive status from the schedule). A named pick becomes a manual override that
// wins (e.g. Rita pulling an auto-retired crew back to Earmarked).
function statusOptions(sel){var auto='<option value=""'+(!sel?' selected':'')+'>Auto (from schedule)</option>';return auto+['On board','On Vacation','Earmarked','Inactive'].map(function(s){return '<option'+(s===sel?' selected':'')+'>'+s+'</option>';}).join('');}
function crewById(id){return CREW.filter(function(c){return c.agency_id===id;})[0];}
function closeCrewModal(){var m=document.getElementById('crewmodal');if(m)m.remove();}
function addCrewModal(){
  var fg=function(lab,inp){return '<div class=fg><label>'+lab+'</label>'+inp+'</div>';};
  var h='<div class=modcard><div class=modhd><div><div class=cname>Add crew</div><div class=csub>Manual entry — protected from AdvancedQuery overwrites.</div></div><button class="btn ghost" onclick="closeCrewModal()">Close ✕</button></div>'
   +'<div class=f2 style="margin-top:12px">'
   +fg('First name','<input id=aFirst>')+fg('Last name','<input id=aLast>')
   +fg('Crew ID','<input id=aId placeholder="e.g. SC-0046000">')+fg('Passport no.','<input id=aPass>')
   +fg('Status','<select id=aStatus>'+statusOptions('Earmarked')+'</select>')+fg('Current vessel','<select id=aShip>'+shipOptions('')+'</select>')
   +fg('Date of birth','<input id=aDob type=date>')+fg('Starting rank','<select id=aRank><option value="">Junior Printer Specialist</option><option value="Printer Specialist">Printer Specialist</option></select>')
   +'</div>'
   +'<div style="margin-top:10px;text-align:right"><span id=aMsg class=csub style="margin-right:8px"></span><button class="btn ghost" onclick="closeCrewModal()">Cancel</button> <button class="btn green" onclick="saveNewCrew()">Add crew</button></div></div>';
  var w=document.createElement('div');w.id='crewmodal';w.className='modwrap';w.innerHTML=h;w.onclick=function(e){if(e.target===w)closeCrewModal();};document.body.appendChild(w);
}
async function saveNewCrew(){
  var g=function(x){return document.getElementById(x).value.trim();};
  if(!g('aId')||!g('aFirst')||!g('aLast')){document.getElementById('aMsg').textContent='ID, first and last name are required.';return;}
  document.getElementById('aMsg').textContent='Saving…';
  var body={agency_id:g('aId'),first_name:g('aFirst'),last_name:g('aLast'),pp_no:g('aPass')||null,status:g('aStatus'),vessel_observed:document.getElementById('aShip').value||null,dob:g('aDob')||null,rank_observed:document.getElementById('aRank').value||'Junior Printer Specialist'};
  try{var r=await (await fetch('/api/crew/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    if(r.ok){closeCrewModal();renderCrew();}else document.getElementById('aMsg').textContent=r.error==='exists'?'That crew ID already exists.':'Could not add.';
  }catch(e){document.getElementById('aMsg').textContent='Could not add.';}
}
async function editCrewModal(id){
  var c=crewById(id);if(!c)return;
  var fg=function(lab,inp){return '<div class=fg><label>'+lab+'</label>'+inp+'</div>';};
  var iv=function(v){return v==null?'':String(v).replace(/"/g,'&quot;');};
  var h='<div class=modcard><div class=modhd><div><div class=cname>Edit crew — '+[c.first_name,c.last_name].filter(Boolean).join(' ')+'</div><div class=csub>'+id+' · manual edits win over imports</div></div><button class="btn ghost" onclick="closeCrewModal()">Close ✕</button></div>'
   +'<div class=f2 style="margin-top:12px">'
   +fg('First name','<input id=eFirst value="'+iv(c.first_name)+'">')+fg('Last name','<input id=eLast value="'+iv(c.last_name)+'">')
   +fg('Middle name','<input id=eMid value="'+iv(c.middle_name)+'">')+fg('Province','<input id=eProv value="'+iv(c.province)+'">')
   +fg('Mobile','<input id=ePhone value="'+iv(c.phone)+'">')+fg('Email','<input id=eEmail value="'+iv(c.email)+'">')
   +fg('Crew ID (locked)','<input value="'+iv(c.agency_id)+'" disabled>')+fg('Passport no.','<input id=ePass value="'+iv(c.pp_no)+'">')
   +fg('Status','<select id=eStatus>'+statusOptions(c.status)+'</select>')+fg('Current vessel','<select id=eShip>'+shipOptions(c.vessel_observed)+'</select>')
   +fg('Date of birth','<input id=eDob type=date value="'+iv(c.dob)+'">')+fg('Consecutive contract count (bonus baseline)','<input id=eCount type=number min=0 value="'+(c.baseline_count!=null?c.baseline_count:'')+'">')
   +'</div>'
   +'<div class=zlabel>Document expiry (compliance)</div><div class=f2>'
   +fg('Medical','<input id=eMed type=date value="'+iv(c.med_exp)+'">')+fg('Seaman&rsquo;s book','<input id=eSirb type=date value="'+iv(c.sirb_exp)+'">')
   +fg('Passport','<input id=ePp type=date value="'+iv(c.pp_exp)+'">')+fg('US visa','<input id=eUsv type=date value="'+iv(c.usv_exp)+'">')
   +fg('Schengen (Europe only)','<input id=eSch type=date value="'+iv(c.sch_exp)+'">')
   +'</div>'
   +'<span class=ck style="margin-top:8px;font-weight:600;cursor:pointer;display:flex" onclick="tgFlip(\\'eRetired\\')"><input type=checkbox id=eRetired'+(c.retired?' checked':'')+' style="pointer-events:none"> Retired (manual — keeps this crew off the auto On board / On Vacation tagging)</span>'
   +'<div style="margin-top:12px;text-align:right"><span id=eMsg class=csub style="margin-right:8px"></span><button class="btn ghost" onclick="closeCrewModal()">Cancel</button> <button class="btn green" onclick="saveEditCrew(\\''+id+'\\')">Save</button></div></div>';
  var w=document.createElement('div');w.id='crewmodal';w.className='modwrap';w.innerHTML=h;w.onclick=function(e){if(e.target===w)closeCrewModal();};document.body.appendChild(w);
}
async function saveEditCrew(id){
  var v=function(x){var e=document.getElementById(x);return e?e.value:undefined;};
  document.getElementById('eMsg').textContent='Saving…';
  var cnt=v('eCount');
  var er=document.getElementById('eRetired');
  var body={agency_id:id,first_name:v('eFirst'),middle_name:v('eMid'),last_name:v('eLast'),province:v('eProv'),phone:v('ePhone'),email:v('eEmail'),pp_no:v('ePass'),status:v('eStatus'),vessel_observed:document.getElementById('eShip').value,dob:v('eDob'),med_exp:v('eMed'),sirb_exp:v('eSirb'),pp_exp:v('ePp'),usv_exp:v('eUsv'),sch_exp:v('eSch'),baseline_count:cnt===''?null:Number(cnt),retired:er&&er.checked?1:0};
  try{await fetch('/api/crew/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});closeCrewModal();renderCrew();}
  catch(e){document.getElementById('eMsg').textContent='Could not save.';}
}
async function notesModal(id){
  var c=crewById(id);var name=c?[c.first_name,c.last_name].filter(Boolean).join(' '):id;
  var h='<div class=modcard><div class=modhd><div><div class=cname>Notes & field intel — '+name+'</div><div class=csub>The crew\\'s story over time — newest first.</div></div><button class="btn ghost" onclick="closeCrewModal()">Close ✕</button></div>'
   +'<div class=sec style="margin-top:12px">Field intel<span id=intelcount class=intcount></span> — from contributor emails</div>'
   +'<div id=intellog class=notelog><div class=muted style="padding:14px">Loading…</div></div>'
   +'<div class=sec style="margin-top:16px">Manual notes</div>'
   +'<div style="margin-top:8px;display:flex;gap:8px;align-items:stretch"><textarea id=newNote rows=2 style="flex:1;padding:9px 12px;line-height:1.45;font-family:inherit;font-size:14px;resize:vertical" placeholder="Add a note…"></textarea><button class="btn green" onclick="addCrewNote(\\''+id+'\\')">Add note</button></div>'
   +'<div id=notelog class=notelog><div class=muted style="padding:14px">Loading…</div></div></div>';
  var w=document.createElement('div');w.id='crewmodal';w.className='modwrap';w.innerHTML=h;w.onclick=function(e){if(e.target===w)closeCrewModal();};document.body.appendChild(w);
  loadNoteLog(id); loadIntelLog(id);
}
async function loadIntelLog(id){
  var box=document.getElementById('intellog');if(!box)return;
  try{var r=await (await fetch('/api/intel/crew?id='+encodeURIComponent(id))).json();var ns=r.intel||[];
    var hdr=document.getElementById('intelcount');if(hdr)hdr.textContent=ns.length?(' · '+ns.length+(ns.length===1?' entry':' entries')):'';
    box.innerHTML=ns.length?ns.map(function(n){return intelCard(id,n);}).join(''):'<div class=muted style="padding:12px">No field intel yet. Forward crew emails to <b>crew-reports@cims.work</b> and they\\'ll be summarised here.</div>';
  }catch(e){box.innerHTML='<div class=muted style="padding:12px">Could not load intel.</div>';}
}
function intelCard(id,n){
  var d=new Date(n.ts);
  var dt=isNaN(d)?'':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  var rep=n.reporter?('<span class=intrep>'+String(n.reporter).replace(/</g,'&lt;')+'</span>'):'';
  var ctr=(n.contract_no!=null)?('<span class="intchip ctr">Contract '+n.contract_no+'</span>'):'';
  var edited=n.edited_at?'<span class=intedited>· edited</span>':'';
  return '<div class=intelcard><div class=intelhd>'
    +'<div class=intelmeta><span class=intdate>'+dt+'</span>'+rep+'<span class="intchip src">'+(n.source||'email')+'</span>'+ctr+edited+'</div>'
    +'<div class=intelact><button onclick="intelEdit(\\''+id+'\\',\\''+n.id+'\\')">Edit</button><button class=del onclick="intelDelete(\\''+id+'\\',\\''+n.id+'\\')">Delete</button></div></div>'
    +'<div class=inteltext id=ictext_'+n.id+'>'+String(n.summary||'').replace(/</g,'&lt;').replace(/\\n/g,'<br>')+'</div></div>';
}
function intelEdit(id,nid){
  var box=document.getElementById('ictext_'+nid);if(!box)return;
  var cur=box.innerHTML.replace(/<br>/g,'\\n').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  box.innerHTML='<textarea id=icedit_'+nid+' class=inteledit rows=6>'+cur.replace(/</g,'&lt;')+'</textarea>'
    +'<div style="margin-top:6px;display:flex;gap:6px"><button class="btn green" style="padding:5px 11px;font-size:12px" onclick="intelSave(\\''+id+'\\',\\''+nid+'\\')">Save</button><button class="btn ghost" style="padding:5px 11px;font-size:12px" onclick="loadIntelLog(\\''+id+'\\')">Cancel</button></div>';
}
async function intelSave(id,nid){
  var t=document.getElementById('icedit_'+nid);if(!t||!t.value.trim())return;
  try{await fetch('/api/intel/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:nid,summary:t.value})});}catch(e){}
  loadIntelLog(id);
}
async function intelDelete(id,nid){
  if(!confirm('Delete this field-intel entry? This cannot be undone.'))return;
  try{await fetch('/api/intel/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:nid,discard:true})});}catch(e){}
  loadIntelLog(id);
}
async function loadNoteLog(id){
  var box=document.getElementById('notelog');if(!box)return;
  try{var r=await (await fetch('/api/crew/notes?id='+encodeURIComponent(id))).json();var ns=r.notes||[];
    box.innerHTML=ns.length?ns.map(function(n){var d=new Date(n.ts);var meta=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});return '<div class=noteitem><div class=notemeta>'+meta+'<span class=notedel title="Delete note" onclick="deleteCrewNote(\\''+id+'\\','+n.id+')">✕</span></div><div class=notetext>'+String(n.text||'').replace(/</g,'&lt;')+'</div></div>';}).join(''):'<div class=muted style="padding:14px">No notes yet — the first one starts the log.</div>';
  }catch(e){box.innerHTML='<div class=muted style="padding:14px">Could not load notes.</div>';}
}
async function deleteCrewNote(id,noteId){
  if(!confirm('Delete this note? This cannot be undone.'))return;
  try{await fetch('/api/crew/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delete:noteId})});
    await loadNoteLog(id);
    // refresh the gold note dot if no notes remain
    var rr=await (await fetch('/api/crew/notes?id='+encodeURIComponent(id))).json();var c=crewById(id);if(c){c.hasNote=!!(rr.notes&&rr.notes.length);paintCrew();}
  }catch(e){}
}
async function addCrewNote(id){
  var t=document.getElementById('newNote');if(!t||!t.value.trim())return;
  var txt=t.value.trim();t.value='';
  try{await fetch('/api/crew/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,text:txt})});
    loadNoteLog(id);var c=crewById(id);if(c){c.hasNote=true;paintCrew();}
  }catch(e){t.value=txt;}
}
/* ---- bonus engine (client mirror of server logic) ---- */
var FW={sOrder:20,sAcc:25,sPar:15,sHand:10,sComm:10,sMono:5};
var LADDER=[0,0,250,500,750,1000,1250,1500,1750,2000];
function ladderValue(n){return n<=1?0:n>=9?2000:LADDER[n];}
var _SC=null;
function gateLabel(g){return {not_completed:'Contract not completed',rush:'Rush shipment from ordering failure',audit:'Failed inventory audit',eval_below_3:'Supervisor evaluation below 3'}[g]||g;}
function computeBonusC(){
  var g={complete:$('#gComplete').checked,compassion:$('#gCompassion').checked,rush:$('#gRush').checked,audit:$('#gAudit').checked};
  var op=0;for(var k in FW){var e=$('#'+k);var v=e?parseInt(e.value):0;op+=v;}
  var ev=parseInt($('#sEval').value);var ep=ev>=3?15:0;var score=op+ep;
  var gate=null,resets=false,advances=true;
  if(!g.complete&&!g.compassion){gate='not_completed';resets=true;advances=false;}
  else if(g.rush){gate='rush';resets=true;advances=false;}
  else if(g.audit){gate='audit';resets=true;advances=false;}
  else if(ev<3){gate='eval_below_3';advances=false;}
  var count=_SC.count;var nextCount=resets?0:(advances?count+1:count);
  var pay=(!gate&&score>=80)?Math.round(ladderValue(nextCount)*score/100):0;
  return {score:score,gate:gate,count:count,nextCount:nextCount,pay:pay,rung:ladderValue(nextCount)};
}
function rng(id,label,max){return '<div class=fg><label>'+label+' — '+max+'%</label><div class=rng><input type=range id='+id+' min=0 max='+max+' value=0 oninput="recalcScore()"><span class=v id='+id+'v>0</span></div></div>';}
/* ---- Contracts & Bonus: fleet-wide ledger ---- */
var CTL=null,CTLF={q:'',client:'',sort:'az'};
async function renderContracts(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  var d;try{d=await (await fetch('/api/contracts')).json();}catch(e){$('#view').innerHTML='<div class=muted>Could not load. <button class="btn ghost" onclick="renderContracts()">Retry</button></div>';return;}
  CTL=d;CTLF={q:'',client:'',sort:'az'};
  var clients=Array.from(new Set((d.rows||[]).map(function(r){return r.client;}).filter(Boolean))).sort();
  $('#view').innerHTML='<div class=bar><h2>Contracts &amp; Bonus</h2>'
   +'<div class=search style="margin-left:auto"><input id=ctq placeholder="name or crew ID" oninput="CTLF.q=this.value;paintContracts()" style="width:210px"></div>'
   +'<select id=ctc onchange="CTLF.client=this.value;paintContracts()"><option value="">All clients</option>'+clients.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select>'
   +'<select id=cts onchange="CTLF.sort=this.value;paintContracts()"><option value="az">Sort: name</option><option value="tenure">Sort: contracts</option><option value="next">Sort: next bonus</option><option value="paid">Sort: total paid</option></select>'
   +'<button class="btn ghost" onclick="openScoreWindow()">Contributor scoring →</button> <button class="btn green" onclick="addCrewModal()">+ New signer</button></div>'
   +'<div class=tiles style="grid-template-columns:repeat(3,1fr);margin-bottom:12px">'+tile(d.totals.crew,'Crew')+tile(d.totals.baselineSet+' / '+d.totals.crew,'Baselines set',(d.totals.baselineSet<d.totals.crew?'amber':'green'))+tile('$'+Number(d.totals.paid||0).toLocaleString(),'Bonus paid to date','green')+'</div>'
   +'<div class=hint style="margin:-4px 0 10px">Consecutive count drives the bonus ladder. Where a baseline is not yet confirmed, the next-bonus figure is withheld (shown as "baseline pending").</div>'
   +'<div id=ctcount class=csub style="margin-bottom:8px"></div><div id=cttable></div>';
  paintContracts();
}
function paintContracts(){
  if(!CTL)return;var q=CTLF.q.trim().toLowerCase();
  var rows=(CTL.rows||[]).filter(function(r){if(CTLF.client&&r.client!==CTLF.client)return false;if(q&&((r.name||'')+' '+(r.agency_id||'')).toLowerCase().indexOf(q)<0)return false;return true;});
  rows.sort(function(a,b){if(CTLF.sort==='tenure')return b.contracts-a.contracts;if(CTLF.sort==='next')return b.nextRung-a.nextRung;if(CTLF.sort==='paid')return b.totalPay-a.totalPay;return a.name.localeCompare(b.name);});
  $('#ctcount').textContent=rows.length+' of '+CTL.rows.length+' crew';
  var body=rows.map(function(r){
    var last=r.lastDate?(r.lastDate+' · '+(r.lastScore!=null?r.lastScore+'%':'—')+(r.lastGate?(' · '+r.lastGate):'')+' · $'+Number(r.lastPay||0).toLocaleString()):'<span class=muted style="padding:0">none yet</span>';
    var nb=r.baseline_set?('$'+Number(r.nextRung||0).toLocaleString()):'<span class=vchip>baseline pending</span>';
    return '<tr><td><b>'+r.name+'</b><div class=csub>'+r.agency_id+'</div></td><td>'+(r.vessel||'—')+'<div class=csub>'+(r.client||'')+'</div></td><td style="text-align:center">'+r.contracts+'</td><td style="text-align:center"><span class="pill rank">'+r.rank+'</span> '+r.count+'</td><td>'+nb+'</td><td>'+last+'</td><td style="text-align:right">$'+Number(r.totalPay||0).toLocaleString()+'</td><td style="white-space:nowrap"><button class="btn ghost" onclick="window.open(\\'/api/crew/statement.pdf?id='+encodeURIComponent(r.agency_id)+'\\',\\'_blank\\')">PDF</button> <button class="btn ghost" onclick="openFill(\\''+r.agency_id+'\\')" title="Ray / Rolando / Dexter fill in their inputs">Inputs →</button> <button class="btn green" onclick="ledgerScore(\\''+r.agency_id+'\\')">Score</button></td></tr>';
  }).join('')||'<tr><td colspan=8 class=muted>No matches.</td></tr>';
  $('#cttable').innerHTML='<table class=tbl><thead><tr><th>Crew</th><th>Ship · client</th><th>Contracts</th><th>Consec.</th><th>Next bonus</th><th>Last outcome</th><th style="text-align:right">Paid</th><th></th></tr></thead><tbody>'+body+'</tbody></table>';
}
function ledgerScore(id){openScore(id);}
/* ---- Feedback windows board ---- */
async function renderFeedback(){
  $('#view').innerHTML='<div class=muted>Loading…</div>';
  var d;try{d=await (await fetch('/api/feedback/board')).json();}catch(e){$('#view').innerHTML='<div class=muted>Could not load. <button class="btn ghost" onclick="renderFeedback()">Retry</button></div>';return;}
  var rows=d.rows||[],pn={ray:'Ray',rolando:'Rolando',dexter:'Dexter'};
  function dlabel(n){return n<0?(Math.abs(n)+'d ago'):(n===0?'today':('in '+n+'d'));}
  function pill(id,r){var cls=r.answered?'on':(r.status==='pending'?'pend':'');var mark=r.answered?'✓':(r.status==='pending'?'…':'+');var tt=r.answered?'response in':(r.status==='pending'?'requested — awaiting':'click to request a window');return '<span class="fbp '+cls+'" title="'+tt+'" onclick="fbRequest(\\''+id+'\\',\\''+r.role+'\\')">'+pn[r.role]+' '+mark+'</span>';}
  var body=rows.map(function(x){var due=x.days<=7?'red':(x.days<=21?'amber':'ok');
    return '<tr><td><b>'+x.name+'</b><div class=csub>'+x.agency_id+'</div></td><td>'+(x.vessel||'—')+'</td><td><span class="cchip '+due+'">'+x.signOff+' · '+dlabel(x.days)+'</span></td><td>'+x.roles.map(function(r){return pill(x.agency_id,r);}).join(' ')+'</td><td style="text-align:center">'+x.answeredCount+'/3</td><td><button class="btn green" onclick="ledgerScore(\\''+x.agency_id+'\\')">Score</button></td></tr>';
  }).join('')||'<tr><td colspan=6 class=muted>No crew in the feedback window right now.</td></tr>';
  $('#view').innerHTML='<div class=bar><h2>Feedback windows</h2><span class=csub style="margin-left:auto">'+rows.length+' crew · ending ≤45d or ended ≤30d</span></div>'
   +'<div class=hint style="margin:-4px 0 12px">Collect contributor feedback before a contract is scored. Click a role pill to generate a single-use window link — green = response in, amber = requested, grey = not yet. Score pulls the evidence into the Score Card.</div>'
   +'<div id=fbreqout class=csub style="margin-bottom:10px"></div>'
   +'<table class=tbl><thead><tr><th>Crew</th><th>Ship</th><th>Sign-off</th><th>Windows (Ray · Rolando · Dexter)</th><th style="text-align:center">In</th><th></th></tr></thead><tbody>'+body+'</tbody></table>';
}
async function fbRequest(id,role){
  var out=document.getElementById('fbreqout');if(out)out.textContent='Creating link…';
  try{var r=await (await fetch('/api/feedback/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,role:role})})).json();
    if(r.ok&&out)out.innerHTML='<b style="color:var(--navy)">'+r.role+'</b> link for '+r.crew+' — send to the contributor: <input readonly value="'+r.link+'" style="width:55%;margin:0 6px" onclick="this.select()"><button class="btn ghost" onclick="renderFeedback()">Refresh board</button>';
    else if(out)out.textContent='Could not create the link.';
  }catch(e){if(out)out.textContent='Could not create the link.';}
}
/* The old "Score" tab (renderBonus) was removed — scoring now lives in the Contracts & Bonus
   ledger (Score button per row) + the Contributor scoring window opened from that tab. */
/* ---- Contributor Scoring window (Ray / Rolando / Dexter submit their inputs in one place) ---- */
var _SW={};
var FBLABEL={ray:'Ray — Inventory & Orders',rolando:'Rolando — Technical',dexter:'Dexter — Field review'};
function swRender(title,inner){$('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class=modal><div class=mh>'+title+'<button onclick="mClose()">×</button></div><div class=mb id=swBody>'+inner+'</div></div></div>';MODAL_T=Date.now();}
function swSel(id,opts,val){return '<select id='+id+'>'+opts.map(function(o){return '<option'+(o===val?' selected':'')+'>'+o+'</option>';}).join('')+'</select>';}
function swTa(id,val){return '<textarea id='+id+' rows=2>'+(val||'')+'</textarea>';}
function sv(id){var e=$('#'+id);return e?e.value:undefined;}
function swIndex(arr){(arr||[]).forEach(function(c){_SW.byId[c.agency_id]=c;});}
async function openScoreWindow(){
  _SW={crew:null,role:null,byId:{}};
  swRender('Contributor scoring','<div class=muted>Loading crew…</div>');
  var d;try{d=await (await fetch('/api/score/queue')).json();}catch(e){$('#swBody').innerHTML='<div class=muted>Could not load. <button class="btn ghost" onclick="openScoreWindow()">Retry</button></div>';return;}
  _SW.queue=d;swIndex(d.recent);swIndex(d.upcoming);
  swCrewStep();
}
// Open the contributor-fill page straight to ONE crew (skips the picker) — used by the ledger's
// "Inputs" button so Ray/Rolando/Dexter go right to their question set for that crew.
async function openFill(id){
  var c=((CTL&&CTL.rows)||[]).find(function(r){return r.agency_id===id;})||{agency_id:id,name:id};
  _SW={crew:{agency_id:id,name:c.name||id,vessel:c.vessel||null,feedback:{}},role:null,byId:{}};
  _SW.byId[id]=_SW.crew;
  await swRoleStep();
  try{var d=await (await fetch('/api/score/queue')).json();_SW.queue=d;swIndex(d.recent);swIndex(d.upcoming);}catch(e){}
}
function swCrewStep(){
  var d=_SW.queue||{recent:[],upcoming:[]};
  var html='<div class=hint style="margin-bottom:8px">Pick the crew member whose contract you are scoring (just signed off, or about to).</div>'
   +'<div class=fg><input id=swq placeholder="Search any crew by name…" oninput="swSearch()"></div>'
   +'<div id=swSearchOut></div>'
   +swList('Just signed off — last 14 days',d.recent)
   +swList('Signing off soon — next 14 days',d.upcoming);
  swRender('Contributor scoring · pick crew',html);
}
function swList(title,arr){
  if(!arr||!arr.length)return '<div class=sec>'+title+'</div><div class=hint style="margin-bottom:6px">None in this window.</div>';
  return '<div class=sec>'+title+'</div>'+arr.map(swRow).join('');
}
function swRow(c){
  var fb=c.feedback||{};
  var dots=['ray','rolando','dexter'].map(function(r){var ok=(fb[r]==='answered'||fb[r]==='na');return '<span class=fbdot title="'+r+'" style="background:'+(ok?'var(--green)':'#dfe5ec')+'"></span>';}).join('');
  return '<div class=brow onclick="swPickCrew(\\''+c.agency_id+'\\')"><div><div class=cname style="font-size:14px">'+(c.name||c.agency_id)+'</div><div class=csub>'+c.agency_id+' · '+(c.ship||c.vessel||'—')+' · '+(c.signOn||'?')+' → '+(c.signOff||'?')+'</div></div><div style="margin-left:auto;display:flex;gap:5px;align-items:center" title="Ray / Rolando / Dexter">'+dots+'</div></div>';
}
var _swt;function swSearch(){clearTimeout(_swt);_swt=setTimeout(swSearchGo,90);}
async function swSearchGo(){
  var q=$('#swq')?$('#swq').value.trim().toLowerCase():'';
  if(!q){if($('#swSearchOut'))$('#swSearchOut').innerHTML='';return;}
  // Load the active roster ONCE (status != Inactive ≈ active in service), then filter locally as you type.
  if(!_SW.allCrew){ try{var r=await (await fetch('/api/crew')).json();_SW.allCrew=(r.crew||[]).filter(function(c){return String(c.status||'').toLowerCase().indexOf('inactive')<0;});}catch(e){_SW.allCrew=[];} }
  var arr=_SW.allCrew.filter(function(c){var nm=[c.first_name,c.last_name].filter(Boolean).join(' ').toLowerCase();return nm.indexOf(q)>=0||String(c.agency_id||'').toLowerCase().indexOf(q)>=0;})
    .slice(0,15).map(function(c){return {agency_id:c.agency_id,name:[c.first_name,c.last_name].filter(Boolean).join(' '),vessel:c.vessel_observed,ship:null,signOn:c.active_on,signOff:c.active_off,feedback:{}};});
  swIndex(arr);
  if($('#swSearchOut'))$('#swSearchOut').innerHTML='<div class=sec>Matches ('+arr.length+')</div>'+(arr.length?arr.map(swRow).join(''):'<div class=hint>No active crew match "'+q+'".</div>');
}
async function swPickCrew(id){
  _SW.crew=_SW.byId[id]||{agency_id:id,name:id,feedback:{}};
  await swRoleStep();
}
async function swRoleStep(){
  swRender('Contributor scoring · '+_SW.crew.name,'<div class=muted>Loading…</div>');
  var d={};try{d=await (await fetch('/api/feedback/crew?id='+encodeURIComponent(_SW.crew.agency_id))).json();}catch(e){}
  var st={ray:'none',rolando:'none',dexter:'none'};(d.requests||[]).forEach(function(r){st[r.role]=r.status;});
  _SW.status=st;_SW.prefill=d.prefill||{sliders:{},gates:{}};_SW.rawAnswers=d.answers||{};
  var roles=[['ray','Ray — Inventory & Orders'],['rolando','Rolando — Technical'],['dexter','Dexter — Field review']];
  var btns=roles.map(function(x){var s=st[x[0]];var done=(s==='answered'||s==='na');return '<button class="btn '+(done?'green':'ghost')+'" style="display:block;width:100%;text-align:left;margin-bottom:8px" onclick="swPickRole(\\''+x[0]+'\\')">'+(done?'✓ ':'')+x[1]+(done?' — submitted (tap to edit)':'')+'</button>';}).join('');
  swRender('Contributor scoring · '+_SW.crew.name,
   '<button class="btn ghost" onclick="swCrewStep()" style="margin-bottom:10px">← change crew</button>'
   +'<div class=hint style="margin-bottom:10px">'+_SW.crew.agency_id+' · '+(_SW.crew.ship||_SW.crew.vessel||'—')+' · '+(_SW.crew.signOn||'?')+' → '+(_SW.crew.signOff||'?')+'</div>'
   +'<div class=sec>Who are you?</div>'+btns+swResultBox(_SW.prefill,_SW.status));
}
function swPickRole(role){_SW.role=role;swQuestions();}
function swQuestions(){
  var role=_SW.role;var a=(_SW.rawAnswers&&_SW.rawAnswers[role])||{};var f='';
  if(role==='ray'){
    f='<div class=fg><label>Did any order fail / need a rush or emergency shipment?</label>'+swSel('order',['No','Yes'],a.order)+'</div>'
     +'<div class=fg><label>If yes — cause</label>'+swSel('rushcause',['N/A','Crew ordering failure','Legitimate (machine / added sailing / port)'],a.rushcause)+'<div class=hint>Only "Crew ordering failure" arms the rush gate.</div></div>'
     +'<div class=fg><label>Rush cost (USD)</label><input id=rushcost type=number min=0 value="'+(a.rushcost||'')+'" placeholder="e.g. 3000"></div>'
     +'<div class=fg><label>Orders placed on time (par respected)?</label>'+swSel('ontime',['Always','Mostly','Often late'],a.ontime)+'</div>'
     +'<div class=fg><label>Order accuracy</label>'+swSel('acc',['Accurate','Minor errors','Frequent errors'],a.acc)+'</div>'
     +'<div class=fg><label>Par maintained at handover</label>'+swSel('par',['Maintained','Some gaps','Not maintained'],a.par)+'</div>'
     +'<div class=fg><label>Failed end-of-contract inventory audit?</label>'+swSel('audit',['No','Yes'],a.audit)+'</div>'
     +'<div class=fg><label>Note / evidence (optional)</label>'+swTa('note',a.note)+'</div>';
  } else if(role==='rolando'){
    f='<div class=fg><label>PROD Service Performance</label><div class=hint>Machine clean &amp; serviceable at handover? · Technical ability, error-code resolution.</div>'+swSel('clean',['Excellent','Acceptable','Poor'],a.clean||'Excellent')+'</div>'
     +'<div class=fg><label>MFD Service Performance</label><div class=hint>Preventive maintenance done correctly? · Independent service, SOP adherence &amp; quality.</div>'+swSel('pm',['Excellent','Acceptable','Poor'],a.pm||'Excellent')+'</div>'
     +'<div class=fg><label>Information / Database Knowledge</label><div class=hint>Unresolved technical issues left for the reliever? · Correct part numbers, use of technical data.</div>'+swSel('unres',['Excellent','Acceptable','Poor'],a.unres||'Excellent')+'</div>'
     +'<div class=fg><label>Note / evidence (optional)</label>'+swTa('note',a.note)+'</div>';
  } else {
    f='<div class=fg><label>Did you assess this crew this contract?</label>'+swSel('assessed',['No (N/A)','Yes'],a.assessed)+'</div>'
     +'<div class=fg><label>Mono click % this contract (&lt;20% target)</label><input id=mono type=number min=0 max=100 step=0.1 value="'+(a.mono||'')+'" placeholder="e.g. 14"><div class=hint>Feeds the Mono discipline sub-score.</div></div>'
     +'<div class=fg><label>Inventory observations</label>'+swTa('inv',a.inv)+'</div>'
     +'<div class=fg><label>Technical observations</label>'+swTa('tech',a.tech)+'</div>'
     +'<div class=fg><label>Overall impression</label>'+swTa('overall',a.overall)+'</div>';
  }
  swRender('Contributor scoring · '+_SW.crew.name,
   '<button class="btn ghost" onclick="swRoleStep()" style="margin-bottom:10px">← back</button>'
   +'<div class=hint style="margin-bottom:8px"><b>'+FBLABEL[role]+'</b> · scoring '+_SW.crew.name+'</div>'
   +f+'<div class=mf><button class="btn ghost" onclick="swRoleStep()">Cancel</button><button class="btn green" id=swSub onclick="swSubmit()">Submit</button></div><div class=hint id=swMsg style="text-align:right"></div>');
}
async function swSubmit(){
  var role=_SW.role;var ans={};
  if(role==='ray')ans={order:sv('order'),rushcause:sv('rushcause'),rushcost:sv('rushcost'),ontime:sv('ontime'),acc:sv('acc'),par:sv('par'),audit:sv('audit'),note:sv('note')};
  else if(role==='rolando')ans={clean:sv('clean'),pm:sv('pm'),unres:sv('unres'),note:sv('note')};
  else ans={assessed:sv('assessed'),mono:sv('mono'),inv:sv('inv'),tech:sv('tech'),overall:sv('overall')};
  $('#swSub').disabled=true;$('#swMsg').textContent='Saving…';
  var res;try{res=await (await fetch('/api/feedback/score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:_SW.crew.agency_id,role:role,answers:ans})})).json();}catch(e){res={error:'network'};}
  if(res.error){$('#swSub').disabled=false;$('#swMsg').textContent='Error: '+res.error;return;}
  _SW.prefill=res.prefill;_SW.status=res.status;_SW.rawAnswers=_SW.rawAnswers||{};_SW.rawAnswers[role]=ans;
  swRender('Contributor scoring · '+_SW.crew.name,
   '<div style="text-align:center;font-family:Outfit;font-weight:800;color:var(--green-d);font-size:18px;margin-bottom:4px">✓ '+FBLABEL[role].split(' — ')[0]+' submitted</div>'
   +'<div class=hint style="text-align:center;margin-bottom:6px">Recorded for '+_SW.crew.name+' — it will pre-fill the Score Card.</div>'
   +swResultBox(_SW.prefill,_SW.status)
   +'<div class=mf style="margin-top:12px"><button class="btn ghost" onclick="swRoleStep()">Score another contributor</button><button class="btn green" onclick="mClose()">Done</button></div>');
}
function swResultBox(pf,st){
  pf=pf||{sliders:{},gates:{}};st=st||{ray:'none',rolando:'none',dexter:'none'};
  var sl=pf.sliders||{};var gates=pf.gates||{};
  var rows=[['sOrder','On-time ordering',20],['sAcc','Order accuracy',25],['sPar','Par maintenance',15],['sHand','Ship handover',10],['sMono','Mono discipline',5]];
  var pts=0;var body=rows.map(function(r){var v=(sl[r[0]]!=null)?sl[r[0]]:null;if(v!=null)pts+=v;return '<div class=scorerow><span>'+r[1]+'</span><b>'+(v!=null?v:'—')+' / '+r[2]+'</b></div>';}).join('');
  var gt=[];if(gates.rush)gt.push('RUSH');if(gates.audit)gt.push('AUDIT');
  var pending=['ray','rolando','dexter'].filter(function(r){return !(st[r]==='answered'||st[r]==='na');});
  return '<div class=scorebox style="margin-top:14px"><div class=scorerow style="font-weight:700;color:var(--navy)"><span>Accumulated contributor score</span><b>'+pts+' / 75</b></div>'+body
   +(gt.length?'<div class=gateflag>Gate armed: '+gt.join(', ')+' — would reset the bonus</div>':'')
   +(pending.length?'<div class=hint style="margin-top:6px">Still pending: '+pending.join(', ')+'. Communication (Rita) + supervisor eval (15) are added on the Score Card to reach 100%.</div>':'<div class=hint style="margin-top:6px">All three contributors in. Communication + supervisor eval are finalised on the Score Card.</div>')+'</div>';
}
async function openScore(id){
  var d=await (await fetch('/api/bonus/crew?id='+encodeURIComponent(id))).json();
  _SC=d; var cr=d.crew; var name=[cr.first_name,cr.middle_name,cr.last_name].filter(Boolean).join(' ');
  var _hasHist=!!(d.outcomes&&d.outcomes.length);
  var _blockCommit=(!d.baseline_set&&!_hasHist);
  var warn=d.baseline_set?'':'<div class=warn>⚠ Starting count not yet confirmed for this crew'+(_blockCommit?' — committing is blocked until the baseline is reconciled against the Contract Counter.':' (event-sourced from prior outcomes).')+'</div>';
  var hist=d.outcomes.length?('<div class=hint style="margin-top:6px">Prior outcomes: '+d.outcomes.length+' · latest count '+d.outcomes[0].count_after+'</div>'):'';
  var _st=(cr.status||'').toLowerCase();
  var _onship=_st.indexOf('board')>=0;
  var scCls=_onship?'sc-on':'sc-off';
  var _today=new Date().toISOString().slice(0,10);
  var _aboard=(_onship&&d.lastLeg&&d.lastLeg.on)?monthsDays(d.lastLeg.on,_today):'';
  var sb=_onship?('<div class="sbadge on">● On board'+(_aboard?(' — '+_aboard+' aboard'):' — still serving')+'</div>')
       :(_st.indexOf('vac')>=0?'<div class="sbadge off">⚓ Off the ship — on vacation</div>'
       :'<div class="sbadge idle">● '+(cr.status||'status unknown')+'</div>');
  var body=''
   +sb
   +'<div class=hint>'+cr.agency_id+' · '+d.rank+' · Contract count <b>'+d.count+'</b> → completing makes it <b>'+(d.count+1)+'</b>. Ladder if clean &amp; ≥80%: <b>$'+d.nextRungIfClean.toLocaleString()+'</b>.</div>'
   +warn+hist+'<div id=fbPanel></div>'
   +'<div class=sec><span class=n>1</span>Contract</div>'
   +'<div class=f2><div class=fg><label class=req>Sign-on</label><input type=date id=spanStart onchange="recalcScore()"></div><div class=fg><label class=req>Sign-off</label><input type=date id=spanEnd onchange="recalcScore()"></div></div>'
   +'<div class=hint id=dateEcho style="margin:-6px 0 10px"></div>'
   +'<div class=fg><label>Ship(s) — comma-separate for transfers</label><input type=text id=ships value="'+(cr.vessel_observed||'').replace(/"/g,'')+'"></div>'
   +'<div class=sec><span class=n>2</span>Outcome &amp; gates</div>'
   +'<span class=ck style="cursor:pointer" onclick="tgFlip(\\'gComplete\\')"><input type=checkbox id=gComplete checked onchange="recalcScore()" style="pointer-events:none"> Contract completed in full</span>'
   +'<span class=ck style="cursor:pointer" onclick="tgFlip(\\'gCompassion\\')"><input type=checkbox id=gCompassion onchange="recalcScore()" style="pointer-events:none"> Not completed — approved compassionate leave (treat as completed)</span>'
   +'<span class="ck ckgate" id=rowRush style="cursor:pointer" onclick="tgFlip(\\'gRush\\')"><input type=checkbox id=gRush onchange="recalcScore()" style="pointer-events:none"> Emergency/rush order from ordering failure <b>— resets count to 0</b></span>'
   +'<span class="ck ckgate" id=rowAudit style="cursor:pointer" onclick="tgFlip(\\'gAudit\\')"><input type=checkbox id=gAudit onchange="recalcScore()" style="pointer-events:none"> Failed end-of-contract inventory audit <b>— resets count to 0</b></span>'
   +'<div class=fg id=gateNoteWrap style="display:none"><label class=req>Reason &amp; evidence (required for a reset gate)</label><textarea id=gateNote rows=2 placeholder="e.g. Rush airfreight magenta toner 12 Mar — par hit 0, prior order skipped. Zendesk #5843."></textarea></div>'
   +'<div class=sec><span class=n>3</span>Scorecard</div>'
   +'<div class=scsec id=scoreSection><div class=gateban id=gateBan></div>'
   +'<div class=hint style="margin:-2px 0 8px">Award each factor from evidence (sliders start at 0).</div>'
   +rng('sOrder','On-time ordering',20)+rng('sAcc','Order accuracy',25)+rng('sPar','Par maintenance',15)
   +rng('sHand','Ship-condition handover',10)+rng('sComm','Communication (manual — Rita)',10)+rng('sMono','Mono click discipline (<20%)',5)
   +'<div class=fg style="margin-top:10px"><label>Supervisor evaluation (1–5) — 15%</label><select id=sEval onchange="recalcScore()"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select><div class=hint>1–2 → bonus forfeited, count held. 3/4/5 → full 15 points.</div></div>'
   +'</div>'
   +'<div class=resultbar id=resultBar><div id=scoreOut></div><div class=rbtns><button class="btn ghost" onclick="mClose()">Cancel</button><button class="btn green" id=commitBtn onclick="commitBonus()"'+(_blockCommit?' disabled title="Baseline pending — reconcile the starting count first"':'')+'>Commit</button></div></div>';
  $('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class="modal '+scCls+'"><div class=mh>Score Card — '+name+'<button onclick="mClose()">×</button></div><div class=mb>'+body+'</div></div></div>';MODAL_T=Date.now();
  if(d.lastLeg){if(d.lastLeg.on)$('#spanStart').value=d.lastLeg.on;if(d.lastLeg.off)$('#spanEnd').value=d.lastLeg.off;}
  recalcScore();
  applyFeedback(cr.agency_id);
}
async function applyFeedback(id){
  var d=await (await fetch('/api/feedback/crew?id='+encodeURIComponent(id))).json();
  if(!d||!d.ok||!document.getElementById('fbPanel'))return;
  var byRole={};(d.requests||[]).forEach(function(r){byRole[r.role]=r.status;});
  var roles=[['ray','Ray'],['rolando','Rolando'],['dexter','Dexter']];
  var btns=roles.map(function(x){var st=byRole[x[0]]||'none';var lbl=st==='answered'?'✓ '+x[1]:st==='na'?x[1]+': N/A':st==='pending'?x[1]+': pending':x[1]+': get link';var cls=st==='answered'?'green':'ghost';return '<button class="btn '+cls+'" style="padding:6px 10px;font-size:12px" onclick="genLink(\\''+id+'\\',\\''+x[0]+'\\')">'+lbl+'</button>';}).join(' ');
  var ev=(d.prefill&&d.prefill.evidence&&d.prefill.evidence.length)?('<div class=hint style="margin-top:8px"><b style="color:var(--navy)">Evidence from windows</b><br>'+d.prefill.evidence.join('<br>')+'</div>'):'';
  document.getElementById('fbPanel').innerHTML='<div class=fg style="margin-top:8px"><label>Contributor feedback windows</label><div style="display:flex;gap:6px;flex-wrap:wrap">'+btns+'</div><div id=fbLink></div>'+ev+'</div>';
  var pf=d.prefill||{};
  if(pf.gates){if(pf.gates.rush)$('#gRush').checked=true;if(pf.gates.audit)$('#gAudit').checked=true;}
  if(pf.sliders)for(var k in pf.sliders){var e=$('#'+k);if(e)e.value=pf.sliders[k];}
  if(pf.gateNote&&pf.gateNote.length){var gn=$('#gateNote');if(gn&&!gn.value)gn.value=pf.gateNote.join(' · ');}
  recalcScore();
}
async function genLink(id,role){
  var r=await (await fetch('/api/feedback/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agency_id:id,role:role})})).json();
  if(r.error){alert('Error: '+r.error);return;}
  document.getElementById('fbLink').innerHTML='<div class=hint style="margin-top:6px">Single-use '+role+' link — send to the contributor:<br><input readonly value="'+r.link+'" onclick="this.select()" style="width:100%;margin-top:4px;font-size:11px"></div>';
}
function fmtDate(iso){if(!iso)return'—';var m=['January','February','March','April','May','June','July','August','September','October','November','December'];var p=String(iso).split('-');if(p.length!==3)return iso;var mo=m[parseInt(p[1],10)-1];if(!mo)return iso;return mo+' '+parseInt(p[2],10)+', '+p[0];}
function recalcScore(){
  for(var k in FW){var e=$('#'+k);if(e)$('#'+k+'v').textContent=e.value;}
  var de=$('#dateEcho');if(de){var on=$('#spanStart').value,off=$('#spanEnd').value;de.innerHTML=(on||off)?('Reads as <b>'+fmtDate(on)+'</b> → <b>'+fmtDate(off)+'</b>'+((on&&off&&off<on)?' <span style="color:var(--red);font-weight:700">— sign-off is before sign-on!</span>':'')):'';}
  var rush=$('#gRush').checked,audit=$('#gAudit').checked;
  $('#gateNoteWrap').style.display=(rush||audit)?'block':'none';
  $('#rowRush').className='ck ckgate'+(rush?' on':'');
  $('#rowAudit').className='ck ckgate'+(audit?' on':'');
  var r=computeBonusC();
  var isReset=(r.gate==='rush'||r.gate==='audit'||r.gate==='not_completed');
  $('#scoreSection').className='scsec'+(isReset?' gated':'');
  $('#gateBan').innerHTML=isReset?('GATE: '+gateLabel(r.gate)+' → payout $0 and count resets to 0. The scores below are still recorded for the file, but they don\\'t change this outcome.'):'';
  var msg=r.gate?(r.gate==='eval_below_3'?'Forfeited — count holds at '+r.count:'Resets count to 0'):(r.score<80?'Below 80% floor — count advances to '+r.nextCount:'Ladder $'+r.rung.toLocaleString()+' × '+r.score+'%');
  var nums='<div class=rnums><span>Score <b>'+r.score+'%</b> / floor 80</span><span>Count <b>'+r.count+' → '+r.nextCount+'</b></span>'+(r.gate?'<span class=gchip>'+gateLabel(r.gate)+'</span>':'<span class=hint style="margin:0">'+msg+'</span>')+'</div>';
  $('#scoreOut').innerHTML=nums+'<div class="rpay '+(r.pay===0?'zero':'')+'">$'+r.pay.toLocaleString()+'</div>';
}
async function commitBonus(){
  var ss=$('#spanStart'),se=$('#spanEnd');
  ss.classList.toggle('bad',!ss.value);se.classList.toggle('bad',!se.value);
  if(!ss.value||!se.value){(!ss.value?ss:se).focus();return;}
  var btn=$('#commitBtn');btn.disabled=true;btn.textContent='Committing…';
  var sliders={};for(var k in FW)sliders[k]=parseInt($('#'+k).value);
  var payload={agency_id:_SC.crew.agency_id,spanStart:$('#spanStart').value,spanEnd:$('#spanEnd').value,
    ships:$('#ships').value.split(',').map(function(s){return s.trim();}).filter(Boolean),
    sliders:sliders,evalScore:parseInt($('#sEval').value),
    gates:{complete:$('#gComplete').checked,compassion:$('#gCompassion').checked,rush:$('#gRush').checked,audit:$('#gAudit').checked},
    gateNote:$('#gateNote')?$('#gateNote').value:''};
  var res=await (await fetch('/api/bonus/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).json();
  if(res.error){btn.disabled=false;btn.textContent='Commit';var msgs={gate_note_required:'A reset gate needs a written reason & evidence.',span_required:'Enter sign-on and sign-off dates.',span_invalid:'Sign-off must be after sign-on.',not_authorised:'Only the GM or Head of HR can commit a bonus payout.',baseline_pending:'Starting count not confirmed for this crew. Reconcile the baseline against the Contract Counter before committing a payout.',eval_required:'Set the supervisor evaluation (1–5) before committing.'};alert(msgs[res.error]||('Error: '+res.error));return;}
  var r=res.result;MODAL_T=Date.now();
  $('#modalRoot').innerHTML='<div class=ov onclick="ovc(event)"><div class=modal><div class=mh>Bonus committed<button onclick="mClose()">×</button></div><div class=mb><div class=hint>Contract '+res.group+' · '+res.ships.join(' → ')+'</div><div class="bigpay '+(r.pay===0?'zero':'')+'">$'+r.pay.toLocaleString()+'</div><div class=scorebox><div class=scorerow><span>Scorecard</span><b>'+r.score+'%</b></div><div class=scorerow><span>Count</span><b>'+r.count+' → '+r.nextCount+'</b></div>'+(r.gate?'<div class=gateflag>GATE: '+gateLabel(r.gate)+'</div>':'')+'</div><div class=hint>Recorded as an immutable outcome under policy v1. The crew\\'s count is now '+r.nextCount+'.</div><div class=mf><button class="btn green" onclick="mClose();show(\\'contracts\\')">Done</button></div></div></div></div>';
}
// Backdrop close, guarded against the "ghost click" on touch devices: tapping a Score/row button
// fires a delayed synthetic click (~300ms) that lands on the freshly-mounted overlay and used to
// close the modal instantly. Ignore overlay clicks for the first 450ms after a modal opens.
var MODAL_T=0;
function ovc(e){ if(e.target===e.currentTarget && (Date.now()-MODAL_T)>450) mClose(); }
function mClose(){$('#modalRoot').innerHTML='';}
// Toggle a checkbox explicitly from its wrapper's click (the input itself is pointer-events:none, so
// it never receives a native tap). One tap = exactly one flip + one change event, on every device —
// avoids the iPad double-toggle where a label-associated checkbox fires twice and lands back where it
// started. Used by the rotation/contract toggles, bonus gates, and the Retired tag.
function tgFlip(id){var c=document.getElementById(id);if(!c)return;c.checked=!c.checked;c.dispatchEvent(new Event('change',{bubbles:true}));}
show('dashboard');
</script>
<div id=modalRoot></div></body></html>`;
