// Crew import review UI — served at GET /api/crew/import. Drag-drop the TDG AdvancedQuery
// export; it parses client-side (SheetJS), auto-detects the file by column signature, POSTs
// the rows to /api/crew/import/stage (which writes NOTHING), renders the tiered review with a
// LIVE right-hand "Ready to apply" cart, and only on Apply POSTs decisions to /api/crew/import/apply.
//
// Brand: CIMS / DG3 (docs/DATA_PAGE_REDESIGN_DECISIONS.md §F). Navy #1B3A5C primary, DG3 green
// #5FB946 accent-chrome only, green-ink #3C7A2A for readable green text + Apply fill, Outfit
// headings / DM Sans body. Layout + cart + auto-detect settled with Miguel over the 2026-07-14
// session (R1–R5). Ship allocation is NEVER written by the file — a mismatch is flagged only.
//
// IMPORTANT: this whole file is a single template literal. Do NOT use nested backticks or ${}.
// All dynamic markup is built with string concatenation inside <script>; buttons use
// data-attributes + event delegation (no inline onclick), so no quote-escaping gymnastics.
export const CREW_IMPORT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CIMS Console — Upload data</title>
<script>if(location.search.indexOf('embed')>=0)document.documentElement.className='embed';</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap');
:root{
 --navy:#1B3A5C;--navy-deep:#142D48;--green:#5FB946;--green-ink:#3C7A2A;--green-bg:#EAF5E4;--green-line:#CDE8C1;
 --slate:#6B7280;--light-slate:#9CA3AF;--cloud:#F3F4F6;--border:#E5E7EB;--white:#fff;
 --amber:#9A6614;--amber-bg:#FBF2E0;--amber-line:#EAD9AE;--red:#A23B34;--red-bg:#F8ECEB;--ink:#1F2937;
 --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
 --shadow:0 1px 2px rgba(20,45,72,.05),0 2px 8px rgba(20,45,72,.05);
}
*{box-sizing:border-box}
body{margin:0;background:var(--cloud);color:var(--ink);font-family:'DM Sans',ui-sans-serif,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14.5px;line-height:1.5}
.accent{height:4px;background:linear-gradient(90deg,var(--navy) 62%,var(--green) 62%)}
.app{display:grid;grid-template-columns:244px 1fr;min-height:calc(100vh - 4px)}
/* embed mode: when iframed into the console Data tab (?embed=1), drop our own chrome */
html.embed body{background:var(--white)}
html.embed .accent,html.embed .side{display:none}
html.embed .app{grid-template-columns:1fr;min-height:0}
html.embed .content{padding:14px 18px 40px;max-width:100%}
html.embed .crumb{display:none}
/* embed mode: when iframed into the console Data tab (?embed=1), drop our own chrome */
html.embed body{background:var(--white)}
html.embed .accent,html.embed .side{display:none}
html.embed .app{grid-template-columns:1fr;min-height:0}
html.embed .content{padding:14px 18px 40px;max-width:100%}
html.embed .crumb{display:none}
/* embed mode: when iframed into the console Data tab (?embed=1), drop our own chrome */
html.embed body{background:var(--white)}
html.embed .accent,html.embed .side{display:none}
html.embed .app{grid-template-columns:1fr;min-height:0}
html.embed .content{padding:14px 18px 40px;max-width:100%}
html.embed .crumb{display:none}
/* embed mode: when iframed into the console Data tab (?embed=1), drop our own chrome */
html.embed body{background:var(--white)}
html.embed .accent,html.embed .side{display:none}
html.embed .app{grid-template-columns:1fr;min-height:0}
html.embed .content{padding:14px 18px 40px;max-width:100%}
html.embed .crumb{display:none}
/* embed mode: when iframed into the console Data tab (?embed=1), drop our own chrome */
html.embed body{background:var(--white)}
html.embed .accent,html.embed .side{display:none}
html.embed .app{grid-template-columns:1fr;min-height:0}
html.embed .content{padding:14px 18px 40px;max-width:100%}
html.embed .crumb{display:none}
/* embed mode: when iframed into the console Data tab (?embed=1), drop our own chrome */
html.embed body{background:var(--white)}
html.embed .accent,html.embed .side{display:none}
html.embed .app{grid-template-columns:1fr;min-height:0}
html.embed .content{padding:14px 18px 40px;max-width:100%}
html.embed .crumb{display:none}
h1,h2,.wordmark,.applyb,.cart .ch .h{font-family:'Outfit',sans-serif}
.side{background:var(--navy);color:rgba(255,255,255,.72);padding:26px 16px 22px;display:flex;flex-direction:column}
.brand{margin-bottom:30px;padding:0 6px}
.logo-mark{display:flex;align-items:center;gap:10px}
.wordmark{font-size:27px;font-weight:700;color:#fff;letter-spacing:4px}
.logo-underline{height:2px;background:var(--green);width:118px;border-radius:1px;margin:9px 0 8px}
.logo-sub{font-size:8.5px;font-weight:500;color:rgba(255,255,255,.5);letter-spacing:2.4px;text-transform:uppercase;line-height:1.6}
.nav{display:flex;align-items:center;gap:10px;padding:6px 9px;border-radius:6px;color:rgba(255,255,255,.66);font-weight:500;cursor:pointer;font-size:14px;margin:1px 0}
.nav:hover{background:rgba(255,255,255,.06);color:#fff}
.nav.active{background:rgba(255,255,255,.09);color:#fff;font-weight:600}
.nav svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.75;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:.8;flex:none}
.nav.active svg{opacity:1}
.grp{font-size:10.5px;letter-spacing:1.3px;text-transform:uppercase;color:rgba(255,255,255,.38);font-weight:600;padding:16px 9px 6px}
.side .spacer{flex:1}
.dg3{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.10);display:flex;align-items:center;gap:9px;padding-left:6px}
.dg3 .l{font-size:8px;color:rgba(255,255,255,.4);letter-spacing:1px;text-transform:uppercase}
.dg3 .d{width:1px;height:13px;background:rgba(255,255,255,.16)}
.dg3 .m{font-size:14px;font-weight:700;color:var(--green);letter-spacing:2px}
.content{padding:34px 40px 60px;max-width:1180px}
.crumb{color:var(--light-slate);font-size:12.5px;margin-bottom:6px}
h1{font-size:25px;margin:0 0 4px;color:var(--navy);font-weight:600;letter-spacing:-.2px}
.lede{color:var(--slate);margin:0 0 22px;font-size:13.5px}
#dz{border:2px dashed var(--border);border-radius:12px;background:var(--white);padding:22px;text-align:center;color:var(--slate);cursor:pointer}
#dz.over{border-color:var(--green);background:var(--green-bg)}
#dz b{display:block;color:var(--navy);font-size:15px;margin-bottom:3px;font-family:'Outfit',sans-serif;font-weight:600}
.band{display:flex;align-items:center;gap:12px;margin-top:12px;border-radius:12px;padding:12px 15px}
.band.ok{background:var(--green-bg);border:1px solid var(--green-line)}
.band.warn{background:var(--amber-bg);border:1px solid var(--amber-line)}
.band .tick{width:26px;height:26px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:14px;flex:none}
.band.ok .tick{background:var(--green-ink)} .band.warn .tick{background:var(--amber)}
.band .t{font-weight:700;font-family:'Outfit',sans-serif}
.band.ok .t{color:var(--green-ink)} .band.warn .t{color:var(--amber)}
.band .m{font-size:12.5px;font-family:var(--mono)}
.band.ok .m{color:var(--green-ink);opacity:.9} .band.warn .m{color:var(--amber);opacity:.95}
.band .file{font-family:var(--mono);font-size:11.5px;opacity:.75}
.band .act{margin-left:auto;white-space:nowrap}
.band .lnk{font-size:12.5px;text-decoration:underline;cursor:pointer}
.band.ok .lnk{color:var(--green-ink)}
.band .go{border:0;border-radius:8px;background:var(--navy);color:#fff;padding:8px 14px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:'DM Sans',sans-serif}
.work{display:grid;grid-template-columns:1fr 316px;gap:30px;align-items:start;margin-top:22px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 6px}
.chip{display:inline-flex;align-items:center;gap:7px;background:var(--white);border:1px solid var(--border);border-radius:999px;padding:6px 13px;font-weight:600;font-size:13px;box-shadow:var(--shadow)}
.chip .n{font-variant-numeric:tabular-nums;font-family:var(--mono)}
.chip.amber{color:var(--amber)} .chip.red{color:var(--red)} .chip.green{color:var(--green-ink)} .chip.navy{color:var(--navy)}
.sec{margin-top:20px}
.sec h2{font-size:15px;margin:0 0 2px;display:flex;align-items:center;gap:8px;color:var(--navy);font-weight:600}
.sec .d{color:var(--slate);font-size:12.5px;margin-bottom:10px}
.card{background:var(--white);border:1px solid var(--border);border-radius:12px;padding:13px 15px;margin-bottom:9px;box-shadow:var(--shadow)}
.card .who{font-weight:600;display:flex;align-items:baseline;gap:9px;color:var(--navy)}
.card .who .id{color:var(--light-slate);font-weight:500;font-size:12px;font-family:var(--mono)}
.row{margin-top:8px;display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center;font-size:13.5px}
.row .k{color:var(--slate);font-size:12px;text-transform:uppercase;letter-spacing:.4px}
.diff{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.old{font-family:var(--mono);color:var(--light-slate);text-decoration:line-through;font-size:12.5px}
.arw{color:var(--light-slate)}
.new{font-family:var(--mono);font-weight:700;font-size:12.5px;color:var(--navy)}
.tag{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px}
.t-amber{background:var(--amber-bg);color:var(--amber)} .t-red{background:var(--red-bg);color:var(--red)} .t-green{background:var(--green-bg);color:var(--green-ink)}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:10px}
.seg button{border:0;background:#fff;padding:6px 14px;font-size:12.5px;font-weight:700;color:var(--light-slate);cursor:pointer;font-family:'DM Sans',sans-serif}
.seg button+button{border-left:1px solid var(--border)}
.seg button.on{background:var(--navy);color:#fff}
.seg.soft button.on{background:var(--cloud);color:var(--navy)}
details.minor{background:var(--white);border:1px solid var(--border);border-radius:12px;padding:4px 15px;box-shadow:var(--shadow)}
details.minor summary{cursor:pointer;font-weight:600;color:var(--slate);padding:9px 0;font-size:13.5px}
details.minor summary .c{font-family:var(--mono);font-size:11px;color:var(--slate);background:var(--cloud);border-radius:20px;padding:1px 8px;margin-right:4px}
.cart{position:sticky;top:24px;align-self:start;background:var(--white);border:1px solid var(--border);border-radius:16px;box-shadow:0 6px 22px rgba(20,45,72,.09);overflow:hidden}
.cart .ch{padding:16px 18px 13px;background:var(--navy);color:#fff}
.cart .ch .h{font-weight:600;font-size:15px}
.cart .ch .sub{color:rgba(255,255,255,.6);font-size:12px;margin-top:2px}
.cart .items{padding:8px 18px}
.li{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--border)}
.li:last-child{border-bottom:0}
.li .ic{width:23px;height:23px;border-radius:6px;display:grid;place-items:center;font-size:12px;flex:none}
.li .nm{font-size:13.5px;flex:1;color:var(--navy);font-weight:600}
.li .nm small{display:block;color:var(--light-slate);font-size:11px;font-weight:400}
.li .q{font-family:var(--mono);font-weight:700;font-size:12.5px}
.li .q.save{color:var(--green-ink)} .li .q.held{color:var(--amber)}
.i-green{background:var(--green-bg);color:var(--green-ink)} .i-navy{background:#e7edf4;color:var(--navy)} .i-gray{background:var(--cloud);color:var(--slate)} .i-amber{background:var(--amber-bg);color:var(--amber)} .i-red{background:var(--red-bg);color:var(--red)}
.cart .totals{padding:13px 18px;background:var(--cloud);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.tl{display:flex;align-items:center;justify-content:space-between;font-size:13.5px;padding:2px 0;color:var(--navy)}
.tl .v{font-family:var(--mono);font-weight:700}
.tl .v.save{color:var(--green-ink)} .tl .v.keep{color:var(--amber)}
.cart .foot{padding:15px 18px}
.applyb{width:100%;border:0;border-radius:11px;background:var(--green-ink);color:#fff;padding:13px;font-weight:700;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 2px 9px rgba(60,122,42,.32)}
.applyb:hover{background:#336823}
.applyb[disabled]{opacity:.6;cursor:default}
.applyb .k{font-family:var(--mono);background:rgba(255,255,255,.22);border-radius:6px;padding:1px 7px;font-size:13px}
.discard{width:100%;border:0;background:transparent;color:var(--slate);padding:10px;margin-top:4px;font-weight:600;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif}
.discard:hover{color:var(--navy)}
.lock{display:flex;align-items:center;gap:7px;justify-content:center;color:var(--green-ink);background:var(--green-bg);border:1px solid var(--green-line);border-radius:9px;padding:8px;margin-top:10px;font-size:11px;font-weight:700;font-family:var(--mono)}
.msg{background:var(--white);border:1px solid var(--border);border-left:3px solid var(--green-ink);border-radius:10px;padding:14px 16px;margin-top:16px;color:var(--navy);font-weight:600}
</style></head><body>
<div class="accent"></div>
<div class="app">
 <aside class="side">
  <div class="brand">
   <div class="logo-mark">
    <svg width="30" height="30" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
     <rect x="4" y="2" width="20" height="26" rx="2" stroke="#5FB946" stroke-width="1.8" fill="none"/>
     <rect x="10" y="8" width="20" height="26" rx="2" stroke="#5FB946" stroke-width="1.2" fill="none" opacity="0.3"/>
     <line x1="8" y1="10" x2="20" y2="10" stroke="#5FB946" stroke-width="1.2" opacity="0.6"/>
     <line x1="8" y1="14" x2="18" y2="14" stroke="#5FB946" stroke-width="1.2" opacity="0.4"/>
     <line x1="8" y1="18" x2="16" y2="18" stroke="#5FB946" stroke-width="1.2" opacity="0.25"/>
    </svg>
    <span class="wordmark">CIMS</span>
   </div>
   <div class="logo-underline"></div>
   <div class="logo-sub">Cruise Industry<br>Managed Services</div>
  </div>
  <div class="grp">Workspace</div>
  <div class="nav"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg> Overview</div>
  <div class="nav active"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload data</div>
  <div class="nav"><svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> Maria knowledge</div>
  <div class="grp">Records</div>
  <div class="nav"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Crew roster</div>
  <div class="nav"><svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><polyline points="12 7 12 12 15 14"/></svg> Import history</div>
  <div class="spacer"></div>
  <div class="dg3"><span class="l">A division of</span><span class="d"></span><span class="m">DG3</span></div>
 </aside>
 <main class="content">
  <div class="crumb">Data · Uploads</div>
  <h1>Upload data</h1>
  <p class="lede">Drop a file — we recognize it, then show you exactly what changes before anything is saved.</p>
  <div id="dz"><b>Drag &amp; drop a file, or click to choose</b>Excel from TDG · read in your browser</div>
  <input type="file" id="f" accept=".xlsx,.xls" style="display:none">
  <div id="band"></div>
  <div id="msg"></div>
  <div class="work" id="work" style="display:none">
   <section class="review" id="app"></section>
   <aside class="cart" id="cart"></aside>
  </div>
 </main>
</div>
<script>
var $=function(i){return document.getElementById(i);};
var STAGE=null,DEC={},META={},PENDING=null;
var SIG=["crew id","first name","last name","status","rank","vessel","medical expiration","sirb","passport","us visa","mobile","province"];
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function norm(s){return String(s==null?"":s).toLowerCase().replace(/[^a-z0-9]/g,"");}
async function sha256(buf){var h=await crypto.subtle.digest("SHA-256",buf);return Array.from(new Uint8Array(h)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
function parse(wb){
 var ws=wb.Sheets["AdvancedQuery"]||wb.Sheets[wb.SheetNames[0]];
 var A=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
 var hi=-1;for(var i=0;i<A.length;i++){var joined=A[i].join("|").toLowerCase();if(joined.indexOf("crew id")>=0){hi=i;break;}}
 if(hi<0)return{headers:[],rows:[]};
 var H=A[hi].map(function(x){return String(x).trim();});
 var rows=[];
 for(var r=hi+1;r<A.length;r++){var row=A[r];if(!row)continue;var o={},any=false;
  for(var c=0;c<H.length;c++){if(!H[c])continue;var v=row[c];o[H[c]]=v;if(String(v==null?"":v).trim())any=true;}
  var idKey=H.find(function(x){return/crew id/i.test(x);});
  if(any&&idKey&&String(o[idKey]==null?"":o[idKey]).trim())rows.push(o);
 }
 return{headers:H.filter(function(x){return x;}),rows:rows};
}
function detect(headers){
 var hn=headers.map(norm),matched=0,i,j;
 for(i=0;i<SIG.length;i++){var s=norm(SIG[i]);for(j=0;j<hn.length;j++){if(hn[j].indexOf(s)>=0){matched++;break;}}}
 var hasId=false;for(j=0;j<hn.length;j++){if(hn[j].indexOf("crewid")>=0){hasId=true;break;}}
 return{label:"Crew registry — AdvancedQuery",matched:matched,total:SIG.length,ok:(hasId&&matched>=8)};
}
async function handle(file){
 $("band").innerHTML="";$("msg").innerHTML="";$("work").style.display="none";
 var buf;try{buf=await file.arrayBuffer();}catch(e){$("msg").innerHTML='<div class="msg">Could not read the file.</div>';return;}
 var wb;try{wb=XLSX.read(buf,{type:"array"});}catch(e){$("msg").innerHTML='<div class="msg">Could not read the file — is it a real Excel export?</div>';return;}
 var pr=parse(wb);
 var det=detect(pr.headers);
 var hash=await sha256(buf);
 PENDING={rows:pr.rows,file_hash:hash,filename:file.name,det:det};
 if(!pr.rows.length){
  $("band").innerHTML='<div class="band warn"><span class="tick">!</span><div><div class="t">This does not look like a crew file</div><div class="m">No CREW ID column found · '+det.matched+' / '+det.total+' signature columns matched</div><div class="file">'+esc(file.name)+'</div></div></div>';
  return;
 }
 if(det.ok){
  $("band").innerHTML='<div class="band ok"><span class="tick">&#10003;</span><div><div class="t">Recognized: '+esc(det.label)+'</div><div class="m">'+det.matched+' / '+det.total+' signature columns matched · auto-selected</div><div class="file">'+esc(file.name)+' · '+pr.rows.length+' rows</div></div><span class="act lnk" data-act="reset">Not this? Choose another file</span></div>';
  stage();
 }else{
  $("band").innerHTML='<div class="band warn"><span class="tick">?</span><div><div class="t">Not sure what this file is</div><div class="m">Only '+det.matched+' / '+det.total+' crew signature columns matched · '+pr.rows.length+' rows</div><div class="file">'+esc(file.name)+'</div></div><span class="act"><button class="go" data-act="force">Treat as Crew registry</button></span></div>';
 }
}
async function stage(){
 if(!PENDING)return;
 $("msg").innerHTML='<div class="msg">Reading '+esc(PENDING.filename)+' …</div>';
 META={file_hash:PENDING.file_hash,filename:PENDING.filename,rows_seen:PENDING.rows.length};
 var res;try{res=await fetch("/api/crew/import/stage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:PENDING.rows,file_hash:PENDING.file_hash,filename:PENDING.filename})}).then(function(r){return r.json();});}catch(e){res={ok:false,error:"network"};}
 if(!res.ok){$("msg").innerHTML='<div class="msg">'+(res.error==="already_processed"?"This exact file was already imported — nothing to do.":"Stage failed: "+esc(res.error))+'</div>';return;}
 $("msg").innerHTML="";STAGE=res;DEC={};render();
}
function badge(txt,cls){return ' <span class="tag '+cls+'">'+txt+'</span>';}
function diff(lab,o,n,b){return '<div class="row"><span class="k">'+esc(lab)+'</span><span class="diff"><span class="old">'+esc(o)+'</span> <span class="arw">&#8594;</span> <span class="new">'+esc(n)+'</span>'+(b||"")+'</span></div>';}
function seg(key,def,opts,labels,soft){
 var cur=DEC[key]||def;
 return '<div class="seg'+(soft?' soft':'')+'">'+
  '<button class="'+(cur===opts[0]?'on':'')+'" data-key="'+key+'" data-v="'+opts[0]+'">'+labels[0]+'</button>'+
  '<button class="'+(cur===opts[1]?'on':'')+'" data-key="'+key+'" data-v="'+opts[1]+'">'+labels[1]+'</button></div>';
}
function render(){
 var g=STAGE.review.groups,c=STAGE.review.counts,h="";
 $("work").style.display="grid";
 h+='<div class="chips">'+
  '<span class="chip amber">&#9875; <span class="n">'+c.ship_flag+'</span> ship</span>'+
  '<span class="chip red">&#9679; <span class="n">'+(c.critical+c.override_conflict)+'</span> needs you</span>'+
  '<span class="chip green">&#9677; <span class="n">'+c.cert+'</span> certificates</span>'+
  '<span class="chip navy">&#65291; <span class="n">'+c.new+'</span> new</span>'+
  '<span class="chip">&#128682; <span class="n">'+c.departed+'</span> departed</span></div>';
 if(g.ship_flag.length){h+='<div class="sec"><h2>&#9875; Ship allocation — the file disagrees with your board</h2><div class="d">Your allocation stays. Flagged for the board unless you dismiss. The file never changes a ship.</div>';
  g.ship_flag.forEach(function(it){h+='<div class="card"><div class="who">'+esc(it.agency_id)+'</div>'+diff("Current ship",it.old,it.new,badge("agency reports","t-amber"))+seg("ship:"+it.agency_id,"flag",["flag","dismiss"],["Keep board","Dismiss"])+'</div>';});h+='</div>';}
 if(g.override_conflict.length||g.critical.length){h+='<div class="sec"><h2>&#9679; Needs your decision</h2><div class="d">Fields you set by hand, and status changes. Defaults to keeping yours.</div>';
  g.override_conflict.forEach(function(it){h+='<div class="card"><div class="who">'+esc(it.agency_id)+'</div>'+diff(it.field,it.old,it.new,badge("&#9995; your manual entry","t-red"))+seg(it.agency_id+":"+it.field,"keep",["accept","keep"],["Accept file (replaces my entry)","Keep mine"])+'</div>';});
  g.critical.forEach(function(it){h+='<div class="card"><div class="who">'+esc(it.agency_id)+'</div>'+diff(it.field,it.old,it.new,"")+seg(it.agency_id+":"+it.field,"keep",["accept","keep"],["Accept","Keep"])+'</div>';});h+='</div>';}
 if(g.cert.length){h+='<div class="sec"><h2>&#9677; Certificate updates from TDG</h2><div class="d">Accepted by default — TDG maintains these. An expiry moving earlier is flagged.</div>';
  g.cert.forEach(function(it){h+='<div class="card"><div class="who">'+esc(it.agency_id)+'</div>'+diff(it.field,it.old,it.new,it.earlier?badge("&#9888; moved earlier","t-amber"):badge("renewed","t-green"))+seg(it.agency_id+":"+it.field,"accept",["accept","keep"],["Accept","Hold"],true)+'</div>';});h+='</div>';}
 if(g.new.length){h+='<div class="sec"><h2>&#65291; New crew</h2>';g.new.forEach(function(it){var f=it.fields||{};h+='<div class="card"><div class="who">'+esc((f.first_name||"")+" "+(f.last_name||""))+' <span class="id">'+esc(it.agency_id)+'</span></div><div class="row"><span class="k">Joining</span><span class="diff"><span class="new">'+esc(f.vessel_observed||"—")+'</span> · '+esc(f.rank_observed||f.status||"")+'</span></div>'+seg("new:"+it.agency_id,"add",["add","skip"],["Add","Skip"])+'</div>';});h+='</div>';}
 if(g.departed.length){h+='<div class="sec"><h2>&#128682; Absent from this file</h2><div class="d">Never auto-removed. Decide the status yourself.</div>';g.departed.forEach(function(it){h+='<div class="card"><div class="who">'+esc(it.agency_id)+'</div>'+seg("departed:"+it.agency_id,"flag",["flag","dismiss"],["Flag","Dismiss"],true)+'</div>';});h+='</div>';}
 if(g.minor.length){h+='<div class="sec"><details class="minor"><summary><span class="c">'+g.minor.length+'</span> minor tidy-ups auto-applied (spelling, spacing)</summary>'+g.minor.map(function(it){return '<div class="d">'+esc(it.agency_id)+' · '+esc(it.field)+' &#8594; '+esc(it.new)+'</div>';}).join("")+'</details></div>';}
 $("app").innerHTML=h;renderCart();
}
function cline(icls,ic,name,sub,q,qcls){return '<div class="li"><span class="ic '+icls+'">'+ic+'</span><span class="nm">'+name+(sub?' <small>'+sub+'</small>':'')+'</span><span class="q '+qcls+'">'+q+'</span></div>';}
function computeCart(){
 var g=STAGE.review.groups;
 function d(k,def){return DEC[k]||def;}
 var certAcc=0,certKeep=0;g.cert.forEach(function(it){if(d(it.agency_id+":"+it.field,"accept")==="accept")certAcc++;else certKeep++;});
 var ovAcc=0,ovKeep=0;g.override_conflict.forEach(function(it){if(d(it.agency_id+":"+it.field,"keep")==="accept")ovAcc++;else ovKeep++;});
 var crAcc=0,crKeep=0;g.critical.forEach(function(it){if(d(it.agency_id+":"+it.field,"keep")==="accept")crAcc++;else crKeep++;});
 var newAdd=0;g.new.forEach(function(it){if(d("new:"+it.agency_id,"add")==="add")newAdd++;});
 var minor=g.minor.length;
 var shipFlag=0;g.ship_flag.forEach(function(it){if(d("ship:"+it.agency_id,"flag")==="flag")shipFlag++;});
 var depFlag=0;g.departed.forEach(function(it){if(d("departed:"+it.agency_id,"flag")==="flag")depFlag++;});
 var fieldSave=ovAcc+crAcc;
 var willSave=certAcc+newAdd+minor+fieldSave;
 var kept=shipFlag+ovKeep+crKeep;
 return{g:g,certAcc:certAcc,fieldSave:fieldSave,newAdd:newAdd,minor:minor,shipFlag:shipFlag,ovKeep:ovKeep+crKeep,depFlag:depFlag,willSave:willSave,kept:kept};
}
function renderCart(){
 var x=computeCart(),g=x.g,items="";
 if(g.cert.length)items+=cline("i-green","&#9677;","Certificates","medical, visas, SIRB",x.certAcc+" save","save");
 if(g.override_conflict.length+g.critical.length && x.fieldSave)items+=cline("i-green","&#9998;","Field updates","status, contact",x.fieldSave+" save","save");
 if(g.new.length)items+=cline("i-navy","&#65291;","New crew","added to roster",x.newAdd+" save","save");
 if(g.minor.length)items+=cline("i-gray","&#9881;","Minor tidy-ups","spelling, spacing",x.minor+" save","save");
 if(g.ship_flag.length)items+=cline("i-amber","&#9875;","Ship flag","kept on your board",x.shipFlag+" held","held");
 if(g.override_conflict.length+g.critical.length && x.ovKeep)items+=cline("i-red","&#9995;","Your edits","kept as yours",x.ovKeep+" held","held");
 if(!items)items='<div class="li"><span class="nm" style="color:var(--slate);font-weight:400">Nothing to apply — all rows match.</span></div>';
 var flags=x.shipFlag+x.depFlag;
 var unp=(STAGE.unparsed||[]);
 var sub=STAGE.rows_seen+' crew read'+(flags?' · '+flags+' flagged for board':'')+(unp.length?' · '+unp.length+' date cell'+(unp.length===1?'':'s')+' unreadable, kept as is':'');
 // The unreadable cells themselves, visible (no hover on a tablet): fix them in the file, re-drop.
 var unpList=unp.length?'<div class="sub" style="color:var(--amber);white-space:normal">'+unp.map(function(u){return esc(u.agency_id+' '+u.field+': '+u.raw);}).join(' · ')+'</div>':'';
 var h='<div class="ch"><div class="h">Ready to apply</div><div class="sub">'+sub+'</div>'+unpList+'</div>'+
  '<div class="items">'+items+'</div>'+
  '<div class="totals"><div class="tl"><span>Will save to roster</span><span class="v save">'+x.willSave+'</span></div>'+
  '<div class="tl"><span>Kept as yours</span><span class="v keep">'+x.kept+'</span></div></div>'+
  '<div class="foot"><button class="applyb" id="ap" data-act="apply"'+(x.willSave+flags?'':' disabled')+'>Apply <span class="k">'+x.willSave+'</span> updates &#8594;</button>'+
  '<button class="discard" data-act="discard">Discard all</button>'+
  '<div class="lock">&#128274; NOTHING SAVED UNTIL YOU APPLY</div></div>';
 $("cart").innerHTML=h;
}
async function apply(){
 var ap=$("ap");if(ap){ap.disabled=true;ap.textContent="Applying…";}
 var body={review:STAGE.review,decisions:DEC,file_hash:META.file_hash,filename:META.filename,rows_seen:META.rows_seen,run_by:"Rita"};
 var res;try{res=await fetch("/api/crew/import/apply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json();});}catch(e){res={ok:false,error:"network"};}
 if(!res.ok){$("cart").innerHTML='<div class="ch"><div class="h">Apply failed</div></div><div class="foot"><div class="msg">'+(res.error==="already_processed"?"Already processed.":esc(res.error))+'</div></div>';return;}
 $("work").style.display="none";
 $("msg").innerHTML='<div class="msg">&#10003; '+esc(res.summary||('Applied '+res.applied+' changes.'))+'</div>';
}
function reset(){STAGE=null;DEC={};PENDING=null;$("band").innerHTML="";$("work").style.display="none";$("msg").innerHTML="";$("f").value="";}
function discard(){reset();$("msg").innerHTML='<div class="msg">Discarded. Nothing was saved.</div>';}
var dz=$("dz"),fi=$("f");
dz.onclick=function(){fi.click();};
fi.onchange=function(e){if(e.target.files[0])handle(e.target.files[0]);};
["dragenter","dragover"].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.classList.add("over");});});
["dragleave","drop"].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.classList.remove("over");});});
dz.addEventListener("drop",function(e){var f=e.dataTransfer.files[0];if(f)handle(f);});
$("app").addEventListener("click",function(e){var b=e.target.closest("button[data-key]");if(!b)return;var k=b.getAttribute("data-key"),v=b.getAttribute("data-v");DEC[k]=v;b.parentNode.querySelectorAll("button").forEach(function(x){x.classList.toggle("on",x.getAttribute("data-v")===v);});renderCart();});
document.addEventListener("click",function(e){var t=e.target.closest("[data-act]");if(!t)return;var a=t.getAttribute("data-act");if(a==="apply")apply();else if(a==="discard")discard();else if(a==="reset")reset();else if(a==="force")stage();});
</script></body></html>`;
