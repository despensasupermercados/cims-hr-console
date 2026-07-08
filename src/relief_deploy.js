// src/relief_deploy.js
// Vessel-deployment loader — served at GET /api/relief/deploy (session-gated).
//
// Drag & drop a deployment file; it AUTO-RECOGNIZES the format by structure (never by filename) and
// loads it into vessel_port_day. Two formats today, NCL slots in as a third:
//   • Celebrity / Royal Caribbean — wide "Export" sheet (brand in row 0, ship in row 2, 7-col blocks
//     from col 2: | PORT RANK "PORT NAME" ARRIVE DEPART TENDER). is_sea = RANK 'S' / AT SEA; is_turn
//     = RANK ends 'T'.
//   • Azamara — long "Itinerary" sheet (Ship, Date, Cruise Nr, Day, Location, Country ...). Brand is
//     always Azamara; ship_short = ship minus the "Azamara " prefix (NAMES CHANGE, so key off the
//     file's structure, not a fixed list). is_sea = Location/Country 'At sea'. TURNAROUND RULE (per
//     operator): the "Day" column marks the cruise day; a cell that is "1" or ends in "/1" (e.g.
//     "12/1" = day 12 of the ending cruise AND day 1 of the next) is the crew-change turnaround day.
//     Cruise lengths vary — so the Day cell must be read as a STRING (parseInt would drop the "/1").
// Decoders verified against source: CEL/RCI 37,592 rows (0 miss/0 extra); Azamara 2,961 rows / 261 turnarounds.
// Load is chunked to /api/relief/vpd-load with resetBrands = the brands the file carries, so each
// file cleanly replaces only its own ships (no stale rows). Then it self-verifies (12-month floor).
export const DEPLOY_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Load vessel deployment</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<style>
:root{--ink:#1b2a4a;--sub:#5b6472;--line:#c9d2df;--bg:#eef1f6;--card:#fff;--accent:#1f5fa8;--ok:#1f7a3d;--warn:#b0342f;--amber:#8a6d1a}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--ink)}
.wrap{max-width:680px;margin:48px auto;padding:0 20px}
h1{font-size:21px;margin:0 0 4px}
.sub{color:var(--sub);font-size:13.5px;line-height:1.5;margin:0 0 22px}
.card{background:var(--card);border-radius:16px;padding:26px;box-shadow:0 1px 3px rgba(20,30,55,.06)}
#dz{border:2px dashed var(--line);border-radius:13px;padding:44px 20px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s}
#dz.over{border-color:var(--accent);background:#f2f7fd}
#dz .big{font-size:16px;font-weight:600}
#dz .small{font-size:12.5px;color:var(--sub);margin-top:5px}
.badge{display:none;margin:18px 0 4px;padding:11px 14px;border-radius:10px;font-size:13.5px;font-weight:600}
.badge.show{display:block}
.badge.rec{background:#eaf5ee;color:var(--ok)}
.badge.bad{background:#fbeceb;color:var(--warn)}
.bar{height:7px;background:#e6edf6;border-radius:20px;overflow:hidden;margin:14px 0 0;display:none}
.bar.show{display:block}.bar>i{display:block;height:100%;width:0;background:var(--accent);transition:width .18s}
.result{margin-top:18px;font-size:13.5px;line-height:1.6;display:none}
.result.show{display:block}
.result .hd{font-weight:700;margin-bottom:6px}
.chip{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;font-weight:600;margin:3px 6px 3px 0}
.chip.b{background:#eef3fb;color:var(--accent)}
.warnline{padding:9px 12px;border-radius:9px;margin-top:8px;font-size:12.5px}
.warnline.red{background:#fbeceb;color:var(--warn)}
.warnline.amber{background:#fbf5e6;color:var(--amber)}
.warnline.good{background:#eaf5ee;color:var(--ok)}
.foot{margin-top:16px;font-size:12px;color:var(--sub)}
</style></head><body><div class="wrap">
<h1>Vessel deployment</h1>
<p class="sub">Drop the deployment file — the system recognizes it automatically (Celebrity/Royal Caribbean or Azamara; NCL coming). Every row is validated; each file cleanly replaces only its own brand. Safe to re-run anytime.</p>
<div class="card">
 <div id="dz"><div class="big">Drag &amp; drop the deployment file</div><div class="small">or click to choose · .xls / .xlsx</div></div>
 <input type="file" id="f" accept=".xlsx,.xls" style="display:none">
 <div class="badge" id="badge"></div>
 <div class="bar" id="bar"><i id="pi"></i></div>
 <div class="result" id="result"></div>
</div>
<div class="foot" id="foot"></div>
</div>
<script>
var $=function(id){return document.getElementById(id);};
var BRANDW={CEL:"Celebrity",RCI:"Royal Caribbean"};
function fmtDate(v){
 if(v instanceof Date){var d=new Date(v.getTime()+12*3600*1000);return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");}
 var m=String(v).match(/^(\\d{4})-(\\d{2})-(\\d{2})/);if(m)return m[1]+"-"+m[2]+"-"+m[3];
 m=String(v).match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);return m?m[3]+"-"+String(m[1]).padStart(2,"0")+"-"+String(m[2]).padStart(2,"0"):null;
}
// --- Celebrity / Royal Caribbean wide "Export" ---
function decodeWide(A){
 var row0=A[0]||[],row2=A[2]||[],nb=Math.floor(((A[3]||[]).length-2)/7),out=[];
 function pc(v){if(v instanceof Date)return{date:fmtDate(v),stop:1};var p=String(v).split(" - Stop ");return{date:fmtDate(p[0]),stop:p[1]?(parseInt(p[1],10)||1):1};}
 for(var r=4;r<A.length;r++){
  var raw=(A[r]||[])[0];if(raw===""||raw==null)continue;var d=pc(raw);if(!d.date)continue;
  for(var b=0;b<nb;b++){var base=2+b*7;
   var ship=String(row2[base]||"").trim(),rank=String(A[r][base+2]||"").trim(),port=String(A[r][base+3]||"").trim();
   if(!ship||!port)continue;
   var brand=BRANDW[String(row0[base]||"").trim()]||String(row0[base]||"").trim();
   out.push([brand,ship,d.date,d.stop,port,(rank==="S"||port==="AT SEA"||port==="CRUISING")?1:0,/T$/.test(rank)?1:0]);
  }
 }
 return out;
}
// --- Azamara long "Itinerary" ---
// Turnaround = Day cell "1" or ending in "/1" (e.g. "12/1"). Day read as STRING (parseInt drops "/1").
function decodeAzamara(A){
 var H=(A[0]||[]).map(function(x){return String(x).trim().toLowerCase();});
 var ci=function(n){return H.indexOf(n);};
 var cShip=ci("ship"),cDate=ci("date"),cDay=ci("day"),cLoc=ci("location"),cCountry=ci("country");
 var isTurn=function(dv){return /(^|[/])1$/.test(String(dv).trim());};
 var out=[],seqKey={};
 for(var r=1;r<A.length;r++){var row=A[r];if(!row||!row[cShip])continue;
  var ship=String(row[cShip]).replace(/^Azamara\\s+/i,"").trim();
  var date=fmtDate(row[cDate]);if(!date)continue;
  var loc=String(row[cLoc]||"").trim(),country=String(row[cCountry]||"").trim();
  var sea=(/^at sea$/i.test(loc)||/^at sea$/i.test(country))?1:0;
  var port=sea?"AT SEA":(country&&!/^at sea$/i.test(country)?(loc+", "+country).toUpperCase():loc.toUpperCase());
  var turn=(!sea&&isTurn(row[cDay]))?1:0;
  var key=ship+"|"+date;seqKey[key]=(seqKey[key]||0)+1;
  out.push(["Azamara",ship,date,seqKey[key],port,sea,turn]);
 }
 return out;
}
// --- recognizer: structure, not filename ---
function recognize(wb){
 var names=wb.SheetNames;
 // CEL/RCI: an "Export" sheet whose row 3 carries the PORT NAME sub-headers
 for(var i=0;i<names.length;i++){
  var A=XLSX.utils.sheet_to_json(wb.Sheets[names[i]],{header:1,raw:true,cellDates:true,defval:""});
  var r3=(A[3]||[]).map(function(x){return String(x).trim().toUpperCase();});
  if(names[i].toLowerCase()==="export"&&r3.indexOf("PORT NAME")>=0){return{fmt:"CEL/RCI",label:"Celebrity / Royal Caribbean — Vessel Deployment",rows:decodeWide(A)};}
  var h=(A[0]||[]).map(function(x){return String(x).trim().toLowerCase();});
  if(h.indexOf("ship")>=0&&h.indexOf("location")>=0&&h.indexOf("cruise nr")>=0){return{fmt:"Azamara",label:"Azamara — Itinerary",rows:decodeAzamara(A)};}
 }
 return null;
}
function badge(cls,txt){var b=$("badge");b.className="badge show "+cls;b.textContent=txt;}
function brandsOf(rows){var s={};rows.forEach(function(r){s[r[0]]=1;});return Object.keys(s);}
async function handle(file){
 $("result").className="result";$("foot").textContent="";
 badge("rec","Reading "+file.name+" …");
 var wb;try{wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});}catch(x){badge("bad","Could not read the file.");return;}
 var rec=recognize(wb);
 if(!rec||!rec.rows.length){badge("bad","Unrecognized file. Expected the Celebrity/RCCL Export sheet or the Azamara Itinerary sheet. (NCL not wired yet — send me a sample.)");return;}
 var brands=brandsOf(rec.rows),ships={};rec.rows.forEach(function(r){ships[r[1]]=1;});
 badge("rec","✓ Recognized: "+rec.label+" · "+Object.keys(ships).length+" ships · "+rec.rows.length+" port-days — loading…");
 $("bar").className="bar show";
 var today=new Date().toISOString().slice(0,10),CH=600,done=0,skip=0,rows=rec.rows;
 for(var i=0;i<rows.length;i+=CH){
  var body={rows:rows.slice(i,i+CH),reset:i===0,resetBrands:brands,asof:today};
  var res;try{res=await fetch("/api/relief/vpd-load",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json();});}catch(x){res={ok:false,error:"network"};}
  if(!res||!res.ok){badge("bad","Load failed at row "+i+": "+((res&&res.error)||"?"));return;}
  done+=res.inserted||0;skip+=res.skipped||0;$("pi").style.width=Math.round((i+CH)/rows.length*100)+"%";
 }
 $("pi").style.width="100%";
 badge("rec","✓ Loaded "+rec.label+" — "+done+" port-days"+(skip?(" ("+skip+" skipped)"):""));
 var st;try{st=await fetch("/api/relief/vpd-status").then(function(r){return r.json();});}catch(x){st=null;}
 render(st,rec);
}
function render(st,rec){
 var R=$("result");R.className="result show";
 if(!st){R.innerHTML="Loaded. (Could not fetch verification.)";return;}
 var h='<div class="hd">In the database now</div>';
 h+='<div>'+st.total+' port-days · '+st.turnarounds+' turnarounds · '+st.ships+' ships · '+(st.first_date||"?")+' → '+(st.last_date||"?")+'</div>';
 h+='<div style="margin-top:8px">'+(st.by_brand||[]).map(function(b){return '<span class="chip b">'+b.brand+': '+b.ships+' ships</span>';}).join("")+'</div>';
 var noP=st.fleet_without_ports||[],sc=st.fleet_short_coverage||[];
 if(noP.length){h+='<div class="warnline red">No deployment for: '+noP.join(", ")+' — load that brand\\'s file. (Azamara names change; that\\'s expected until its file is loaded.)</div>';}
 if(sc.length){h+='<div class="warnline amber">Under '+(st.min_coverage_months||12)+' months forward: '+sc.map(function(s){return s.ship_short+" (ends "+s.last_date+")";}).join(", ")+' — reload once a newer export is available.</div>';}
 if(!noP.length&&!sc.length){h+='<div class="warnline good">Every fleet ship has ≥ '+(st.min_coverage_months||12)+' months of forward coverage.</div>';}
 R.innerHTML=h;
 $("foot").textContent="Reload the Keyman relief board to see updated ports.";
}
// wiring: click + drag & drop
var dz=$("dz"),fi=$("f");
dz.onclick=function(){fi.click();};
fi.onchange=function(e){if(e.target.files[0])handle(e.target.files[0]);};
["dragenter","dragover"].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.classList.add("over");});});
["dragleave","drop"].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.classList.remove("over");});});
dz.addEventListener("drop",function(e){var f=e.dataTransfer.files[0];if(f)handle(f);});
</script></body></html>`;
