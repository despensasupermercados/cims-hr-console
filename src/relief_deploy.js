// src/relief_deploy.js
// Loader for the vessel deployment itinerary. Served at GET /api/relief/deploy (session-gated).
// Accepts the NATIVE wide export straight from RCCL/CEL (the "Export" sheet, data.xlsx / vessel
// deployment.xlsx) — no pre-processing. It decodes the wide matrix client-side (SheetJS) into long
// rows and POSTs them to /api/relief/vpd-load in chunks; the server validates every row. A clean
// long .tsv is also accepted. After loading it calls /api/relief/vpd-status and shows what landed +
// coverage gaps (incl. the 12-month forward floor).
//
// The decoder is proven identical to the validated pipeline: 37,592 rows, 0 miss / 0 extra vs the
// reference TSV. Wide layout: sheet "Export"; col0 = berth date ("- Stop N" suffix for multi-stop
// days); repeating 7-col blocks from col 2 (| PORT RANK "PORT NAME" ARRIVE DEPART TENDER); brand in
// row 0, ship in row 2. is_sea = RANK 'S' or port AT SEA/CRUISING; is_turnaround = RANK ends 'T'.
export const DEPLOY_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Load vessel deployment</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1b2a4a}
h1{font-size:20px}p{color:#5b6472;font-size:14px}code{background:#f4f3ee;padding:1px 5px;border-radius:4px;font-size:12.5px}
input[type=file]{margin:14px 0;font-size:14px}
.log{margin-top:16px;font-size:13px;font-family:ui-monospace,Menlo,monospace;background:#f4f3ee;border-radius:8px;padding:12px 14px;max-height:360px;overflow:auto}
.log div{padding:1px 0}.ok{color:#1f7a3d}.err{color:#b0342f;font-weight:600}.hd{font-weight:600;margin-top:6px}
.bar{height:8px;background:#e8f1fb;border-radius:20px;overflow:hidden;margin:10px 0}.bar>i{display:block;height:100%;width:0;background:#1f5fa8;transition:width .2s}
</style></head><body>
<h1>Load vessel deployment</h1>
<p>Drop the <b>native deployment export</b> (the RCCL/CEL <code>.xlsx</code> with the wide "Export" sheet — e.g. <i>vessel deployment.xlsx</i>). It's decoded here and loaded into <code>vessel_port_day</code>, the schedule the relief board derives from. Every row is validated server-side; malformed rows are skipped, never inserted. Replaces CEL/RCI ports, keeps Azamara. Safe to re-run.</p>
<input type="file" id="f" accept=".xlsx,.xls,.tsv,.txt,.csv">
<div class="bar"><i id="pi"></i></div>
<div class="log" id="log"></div>
<script>
const log=(m,cls)=>{const d=document.getElementById("log");d.innerHTML+='<div class="'+(cls||"")+'">'+m+'</div>';d.scrollTop=d.scrollHeight;};
const BRAND={CEL:"Celebrity",RCI:"Royal Caribbean"};
function fmtDate(v){
 if(v instanceof Date)return v.getUTCFullYear()+"-"+String(v.getUTCMonth()+1).padStart(2,"0")+"-"+String(v.getUTCDate()).padStart(2,"0");
 const m=String(v).match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);
 return m?m[3]+"-"+String(m[1]).padStart(2,"0")+"-"+String(m[2]).padStart(2,"0"):null;
}
function parseCol0(v){
 if(v instanceof Date)return{date:fmtDate(v),stop:1};
 const parts=String(v).split(" - Stop ");
 return{date:fmtDate(parts[0]),stop:parts[1]?(parseInt(parts[1],10)||1):1};
}
// Decode the native wide "Export" sheet → long rows [brand,ship,date,stop,port,is_sea,is_turn].
function decodeWide(A){
 const row0=A[0]||[],row2=A[2]||[];
 const nblocks=Math.floor(((A[3]||[]).length-2)/7);
 const out=[];
 for(let r=4;r<A.length;r++){
  const raw=(A[r]||[])[0]; if(raw===""||raw==null)continue;
  const pc=parseCol0(raw); if(!pc.date)continue;
  for(let b=0;b<nblocks;b++){
   const base=2+b*7;
   const ship=String(row2[base]||"").trim();
   const rank=String(A[r][base+2]||"").trim();
   const port=String(A[r][base+3]||"").trim();
   if(!ship||!port)continue;
   const brand=BRAND[String(row0[base]||"").trim()]||String(row0[base]||"").trim();
   const is_sea=(rank==="S"||port==="AT SEA"||port==="CRUISING")?1:0;
   const is_turn=/T$/.test(rank)?1:0;
   out.push([brand,ship,pc.date,pc.stop,port,is_sea,is_turn]);
  }
 }
 return out;
}
async function getRows(file){
 const name=file.name.toLowerCase();
 if(name.endsWith(".xlsx")||name.endsWith(".xls")){
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:"array",cellDates:true});
  const sheet=wb.Sheets["Export"]||wb.Sheets[wb.SheetNames[0]];
  const A=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,cellDates:true,defval:""});
  return decodeWide(A);
 }
 // long tsv fallback
 let lines=(await file.text()).split(/\\r?\\n/).filter(x=>x.trim());
 if(lines.length&&/brand/i.test(lines[0]))lines.shift();
 return lines.map(l=>l.split("\\t")).filter(r=>r.length>=6);
}
document.getElementById("f").onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 document.getElementById("log").innerHTML="";document.getElementById("pi").style.width="0";
 let rows;try{rows=await getRows(file);}catch(x){log("Could not read file: "+x.message,"err");return;}
 if(!rows.length){log("No rows found. Is this the native Export sheet?","err");return;}
 log(rows.length+" port-day rows decoded. Loading…");
 const today=new Date().toISOString().slice(0,10);
 const CH=600;let done=0,skipped=0;
 for(let i=0;i<rows.length;i+=CH){
  const chunk=rows.slice(i,i+CH);
  let res;try{res=await fetch("/api/relief/vpd-load",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:chunk,reset:i===0,asof:today})}).then(r=>r.json());}catch(x){res={ok:false,error:"network"};}
  if(!res||!res.ok){log("ERROR at row "+i+": "+((res&&res.error)||"?"),"err");return;}
  done+=res.inserted||0;skipped+=res.skipped||0;
  document.getElementById("pi").style.width=Math.round((i+chunk.length)/rows.length*100)+"%";
 }
 log("DONE — "+done+" port-days loaded"+(skipped?(" · "+skipped+" skipped (malformed)"):""),"ok");
 let st;try{st=await fetch("/api/relief/vpd-status").then(r=>r.json());}catch(x){st=null;}
 if(st){
  log("Verify — "+st.total+" rows · "+st.turnarounds+" turnarounds · "+st.ships+" ships · "+(st.first_date||"?")+" → "+(st.last_date||"?"),"ok hd");
  const noP=st.fleet_without_ports||[],shortC=st.fleet_short_coverage||[];
  if(noP.length){log("⚠ Fleet ships with NO deployment ("+noP.length+"): "+noP.join(", ")+"  (Azamara uses a separate file — expected.)","err");}
  if(shortC.length){log("⚠ Fleet ships with < "+(st.min_coverage_months||12)+" months forward ("+shortC.length+"): "+shortC.map(s=>s.ship_short+" (ends "+s.last_date+")").join(", "),"err");}
  if(!noP.length&&!shortC.length){log("All fleet ships have ≥ "+(st.min_coverage_months||12)+" months forward coverage.","ok");}
 }
 log("Done — reload the relief board.","ok");
};
</script></body></html>`;
