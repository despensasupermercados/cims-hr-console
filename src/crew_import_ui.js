// Crew import review UI — served at GET /api/crew/import. Drag-drop the TDG AdvancedQuery
// export; it parses client-side (SheetJS), POSTs the rows to /api/crew/import/stage (which
// writes nothing), renders the staged diff grouped by tier, and only on \"Apply\" POSTs the
// decisions to /api/crew/import/apply. Mirrors the deploy loader (relief_deploy.js).
// Visual/interaction spec: the delivered import_review_mockup.html.
export const CREW_IMPORT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crew registry — Review &amp; Apply</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<style>
:root{--ink:#1f2733;--sub:#6b7688;--line:#e3e8ef;--bg:#f4f6f9;--card:#fff;--blue:#1d5fb3;--blueb:#e8f0fb;--red:#c0392b;--redb:#fdecea;--amber:#b9770e;--amberb:#fef6e7;--green:#1e7e46;--greenb:#e9f6ee}
*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--ink);font-size:14px}
.wrap{max-width:900px;margin:0 auto;padding:20px 16px 120px}
h1{font-size:19px;margin:0 0 4px}.sub{color:var(--sub);font-size:13px;margin:0 0 16px}
#dz{border:2px dashed var(--line);border-radius:12px;padding:38px;text-align:center;cursor:pointer;background:var(--card)}
#dz.over{border-color:var(--blue);background:#f2f7fd}
.note{display:flex;gap:8px;align-items:center;background:var(--blueb);color:var(--blue);border:1px solid #cfe0f6;border-radius:8px;padding:9px 12px;font-weight:600;font-size:13px;margin:12px 0}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}
.chip{border:1px solid var(--line);background:var(--card);border-radius:20px;padding:5px 11px;font-size:12.5px;font-weight:600}
.sec{margin:18px 0}.sec h2{font-size:15px;margin:0 0 3px}.sec .d{font-size:12.5px;color:var(--sub);margin-bottom:9px}
.card{background:var(--card);border:1px solid var(--line);border-left-width:4px;border-radius:9px;padding:11px 13px;margin-bottom:8px}
.card.ship{border-left-color:var(--amber)}.card.crit{border-left-color:var(--red)}.card.ovr{border-left-color:var(--red)}
.card.cert{border-left-color:var(--green)}.card.add{border-left-color:var(--blue)}.card.dep{border-left-color:var(--sub)}
.who{font-weight:700;font-size:13.5px}.id{color:var(--sub);font-weight:500;font-size:12px;margin-left:6px}
.fl{margin:6px 0}.lab{font-weight:600;font-size:12.5px}.old{color:var(--sub);text-decoration:line-through}.new{font-weight:700}
.badge{font-size:11px;font-weight:700;padding:1px 7px;border-radius:20px;margin-left:6px}
.b-earlier{background:var(--amberb);color:var(--amber)}.b-ovr{background:var(--redb);color:var(--red)}.b-agency{background:var(--amberb);color:var(--amber)}
.tg{display:inline-flex;border:1px solid var(--line);border-radius:7px;overflow:hidden;margin-top:6px}
.tg button{border:none;background:#fff;padding:5px 12px;font-size:12.5px;font-weight:700;color:var(--sub);cursor:pointer}
.tg button+button{border-left:1px solid var(--line)}
.tg button.on{background:#eef1f6;color:var(--ink)}
details{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:4px 13px}
.bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:11px 16px}
.bar .in{max-width:900px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:12px}
.bar .s{font-size:12.5px;color:var(--sub)}.btn{border:none;border-radius:8px;padding:10px 16px;font-weight:700;font-size:13.5px;cursor:pointer}
.btn.p{background:#12203a;color:#fff}.btn.g{background:#eef1f6;color:#33415c}
</style></head><body><div class="wrap">
<h1>Crew registry — Review &amp; Apply</h1>
<p class="sub">Drop this week's TDG AdvancedQuery export. Nothing is saved until you press Apply. Ship allocation is never changed by the file — a mismatch is flagged for the board.</p>
<div id="dz"><div style="font-weight:600;font-size:15px">Drag &amp; drop the AdvancedQuery file</div><div style="font-size:12.5px;color:var(--sub);margin-top:4px">or click · .xls / .xlsx</div></div>
<input type="file" id="f" accept=".xlsx,.xls" style="display:none">
<div id="app"></div>
</div>
<div class="bar" id="bar" style="display:none"><div class="in"><div class="s" id="sum">Review in progress…</div>
<div><button class="btn g" onclick="discard()">Discard</button> <button class="btn p" id="ap" onclick="apply()">Apply</button></div></div></div>
<script>
var $=function(i){return document.getElementById(i);};
var STAGE=null, DEC={}, META={};
function esc(s){return String(s==null?\"\":s).replace(/[&<>]/g,function(c){return{\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\"}[c];});}
async function sha256(buf){var h=await crypto.subtle.digest(\"SHA-256\",buf);return Array.from(new Uint8Array(h)).map(function(b){return b.toString(16).padStart(2,\"0\");}).join(\"\");}
function parse(wb){
 var ws=wb.Sheets[\"AdvancedQuery\"]||wb.Sheets[wb.SheetNames[0]];
 var A=XLSX.utils.sheet_to_json(ws,{header:1,defval:\"\",raw:false});
 var hi=-1;for(var i=0;i<A.length;i++){var joined=A[i].join(\"|\").toLowerCase();if(joined.indexOf(\"crew id\")>=0){hi=i;break;}}
 if(hi<0)return[];
 var H=A[hi].map(function(x){return String(x).trim();});
 var idIdx=-1;for(var k=0;k<H.length;k++){if(/crew id/i.test(H[k])){idIdx=k;break;}}
 var rows=[];
 for(var r=hi+1;r<A.length;r++){var row=A[r];if(!row)continue;var o={},any=false;
  for(var c=0;c<H.length;c++){if(!H[c])continue;var v=row[c];o[H[c]]=v;if(String(v||\"\").trim())any=true;}
  if(any&&String((idIdx>=0?row[idIdx]:\"\")||\"\").trim())rows.push(o);
 }
 return rows;
}
async function handle(file){
 $(\"app\").innerHTML='<div class=\"note\"><span>Reading '+esc(file.name)+' …</span></div>';
 var buf=await file.arrayBuffer();var wb;try{wb=XLSX.read(buf,{type:\"array\"});}catch(e){$(\"app\").innerHTML='<div class=\"note\">Could not read the file.</div>';return;}
 var rows=parse(wb);if(!rows.length){$(\"app\").innerHTML='<div class=\"note\">No crew rows found (need a CREW ID header).</div>';return;}
 var hash=await sha256(buf);
 META={file_hash:hash,filename:file.name,rows_seen:rows.length};
 var res;try{res=await fetch(\"/api/crew/import/stage\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({rows:rows,file_hash:hash,filename:file.name})}).then(function(r){return r.json();});}catch(e){res={ok:false,error:\"network\"};}
 if(!res.ok){$(\"app\").innerHTML='<div class=\"note\">'+(res.error===\"already_processed\"?\"This exact file was already imported.\":\"Stage failed: \"+esc(res.error))+'</div>';return;}
 STAGE=res;DEC={};render();
}
function pick(id,key,v){DEC[key]=v;var el=$(id);el.querySelectorAll(\"button\").forEach(function(x){x.classList.toggle(\"on\",x.dataset.v===v);});summary();}
function toggle(key,def,opts,label0,label1){
 var id=\"t_\"+Math.random().toString(36).slice(2);
 var cur=DEC[key]||def;
 setTimeout(function(){var el=$(id);if(el)el.querySelectorAll(\"button\").forEach(function(x){x.classList.toggle(\"on\",x.dataset.v===cur);});},0);
 return '<div class=\"tg\" id=\"'+id+'\">'+
  '<button data-v=\"'+opts[0]+'\" onclick=\"pick(\\''+id+'\\',\\''+key+'\\',\\''+opts[0]+'\\')\">'+label0+'</button>'+
  '<button data-v=\"'+opts[1]+'\" onclick=\"pick(\\''+id+'\\',\\''+key+'\\',\\''+opts[1]+'\\')\">'+label1+'</button></div>';
}
function frow(lab,o,n,badge){return '<div class=\"fl\"><span class=\"lab\">'+esc(lab)+'</span> <span class=\"old\">'+esc(o)+'</span> → <span class=\"new\">'+esc(n)+'</span>'+(badge||\"\")+'</div>';}
function render(){
 var g=STAGE.review.groups,c=STAGE.review.counts,h=\"\";
 $(\"bar\").style.display=\"block\";
 h+='<div class=\"note\"><span>'+STAGE.rows_seen+' crew read · nothing saved yet</span></div>';
 h+='<div class=\"chips\"><span class=\"chip\">⚓ '+c.ship_flag+' ship</span><span class=\"chip\">🔴 '+(c.critical+c.override_conflict)+' need you</span><span class=\"chip\">🟡 '+c.cert+' cert</span><span class=\"chip\">➕ '+c.new+' new</span><span class=\"chip\">🚪 '+c.departed+' departed</span></div>';
 if(g.ship_flag.length){h+='<div class=\"sec\"><h2>⚓ Ship allocation — file disagrees with the board</h2><div class=\"d\">Your allocation stays. Flagged for the board unless you dismiss.</div>';
  g.ship_flag.forEach(function(it){h+='<div class=\"card ship\"><div class=\"who\">'+esc(it.agency_id)+'</div>'+frow(\"Current ship\",it.old,it.new,'<span class=\"badge b-agency\">agency reports</span>')+toggle(\"ship:\"+it.agency_id,\"flag\",[\"flag\",\"dismiss\"],\"Flag for board\",\"Dismiss\")+'</div>';});h+='</div>';}
 if(g.override_conflict.length||g.critical.length){h+='<div class=\"sec\"><h2>🔴 Needs your decision</h2><div class=\"d\">Status changes and fields you set by hand. Defaults to keeping current.</div>';
  g.override_conflict.forEach(function(it){h+='<div class=\"card ovr\"><div class=\"who\">'+esc(it.agency_id)+'</div>'+frow(it.field,it.old,it.new,'<span class=\"badge b-ovr\">✋ your manual entry</span>')+toggle(it.agency_id+\":\"+it.field,\"keep\",[\"accept\",\"keep\"],\"Accept file\",\"Keep mine\")+'</div>';});
  g.critical.forEach(function(it){h+='<div class=\"card crit\"><div class=\"who\">'+esc(it.agency_id)+'</div>'+frow(it.field,it.old,it.new,\"\")+toggle(it.agency_id+\":\"+it.field,\"keep\",[\"accept\",\"keep\"],\"Accept\",\"Keep\")+'</div>';});h+='</div>';}
 if(g.cert.length){h+='<div class=\"sec\"><h2>🟡 Certificate updates from TDG</h2><div class=\"d\">Accepted by default. An expiry moving earlier is flagged.</div>';
  g.cert.forEach(function(it){h+='<div class=\"card cert\"><div class=\"who\">'+esc(it.agency_id)+'</div>'+frow(it.field,it.old,it.new,it.earlier?'<span class=\"badge b-earlier\">⚠ moved earlier</span>':\"\")+toggle(it.agency_id+\":\"+it.field,\"accept\",[\"accept\",\"keep\"],\"Accept\",\"Keep\")+'</div>';});h+='</div>';}
 if(g.new.length){h+='<div class=\"sec\"><h2>➕ New crew</h2>';g.new.forEach(function(it){var f=it.fields||{};h+='<div class=\"card add\"><div class=\"who\">'+esc((f.last_name||\"\")+\", \"+(f.first_name||\"\"))+'<span class=\"id\">'+esc(it.agency_id)+'</span></div><div class=\"fl\">'+esc(f.vessel_observed||\"\")+' · '+esc(f.status||\"\")+'</div>'+toggle(\"new:\"+it.agency_id,\"add\",[\"add\",\"skip\"],\"Add\",\"Skip\")+'</div>';});h+='</div>';}
 if(g.departed.length){h+='<div class=\"sec\"><h2>🚪 Absent from this file</h2><div class=\"d\">Never auto-removed. Decide the status yourself.</div>';g.departed.forEach(function(it){h+='<div class=\"card dep\"><div class=\"who\">'+esc(it.agency_id)+'</div>'+toggle(\"departed:\"+it.agency_id,\"flag\",[\"flag\",\"dismiss\"],\"Flag\",\"Dismiss\")+'</div>';});h+='</div>';}
 if(g.minor.length){h+='<div class=\"sec\"><details><summary>⚪ '+g.minor.length+' minor changes — auto-applied</summary>'+g.minor.map(function(it){return '<div class=\"d\">'+esc(it.agency_id)+' · '+esc(it.field)+' → '+esc(it.new)+'</div>';}).join(\"\")+'</details></div>';}
 $(\"app\").innerHTML=h;summary();
}
function summary(){$(\"sum\").innerHTML=\"Certs, new crew and minor apply; ship &amp; manual edits default to keeping yours.\";}
async function apply(){
 $(\"ap\").disabled=true;$(\"ap\").textContent=\"Applying…\";
 var body={review:STAGE.review,decisions:DEC,file_hash:META.file_hash,filename:META.filename,rows_seen:META.rows_seen,run_by:\"Rita\"};
 var res;try{res=await fetch(\"/api/crew/import/apply\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify(body)}).then(function(r){return r.json();});}catch(e){res={ok:false,error:\"network\"};}
 if(!res.ok){$(\"sum\").textContent=(res.error===\"already_processed\"?\"Already processed.\":\"Apply failed: \"+res.error);$(\"ap\").disabled=false;$(\"ap\").textContent=\"Apply\";return;}
 $(\"app\").innerHTML='<div class=\"note\"><span>✓ Applied '+res.applied+' changes · added '+res.added+' crew · '+res.open_conflicts+' flags for the board · logged.</span></div>';
 $(\"bar\").style.display=\"none\";
}
function discard(){STAGE=null;DEC={};$(\"app\").innerHTML='<div class=\"note\"><span>Discarded. Nothing was saved.</span></div>';$(\"bar\").style.display=\"none\";}
var dz=$(\"dz\"),fi=$(\"f\");dz.onclick=function(){fi.click();};fi.onchange=function(e){if(e.target.files[0])handle(e.target.files[0]);};
[\"dragenter\",\"dragover\"].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.classList.add(\"over\");});});
[\"dragleave\",\"drop\"].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.classList.remove(\"over\");});});
dz.addEventListener(\"drop\",function(e){var f=e.dataTransfer.files[0];if(f)handle(f);});
</script></body></html>`;
