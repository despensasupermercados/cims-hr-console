// src/relief_deploy.js
// Loader for the vessel deployment itinerary. Served at GET /api/relief/deploy (session-gated).
// Accepts the tab-separated export (brand, ship_short, berth_date, stop_seq, port_name, is_sea,
// is_turnaround) and POSTs it to /api/relief/vpd-load in chunks. Server validates every row.
// After loading it calls /api/relief/vpd-status and shows exactly what landed + any coverage gaps.
export const DEPLOY_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Load vessel deployment</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1b2a4a}
h1{font-size:20px}p{color:#5b6472;font-size:14px}code{background:#f4f3ee;padding:1px 5px;border-radius:4px;font-size:12.5px}
input[type=file]{margin:14px 0;font-size:14px}
.log{margin-top:16px;font-size:13px;font-family:ui-monospace,Menlo,monospace;background:#f4f3ee;border-radius:8px;padding:12px 14px;max-height:360px;overflow:auto}
.log div{padding:1px 0}.ok{color:#1f7a3d}.err{color:#b0342f;font-weight:600}.hd{font-weight:600;margin-top:6px}
.bar{height:8px;background:#e8f1fb;border-radius:20px;overflow:hidden;margin:10px 0}.bar>i{display:block;height:100%;width:0;background:#1f5fa8;transition:width .2s}
</style></head><body>
<h1>Load vessel deployment</h1>
<p>Upload <b>vessel_deployment.tsv</b> — columns: brand · ship_short · berth_date · stop_seq · port_name · is_sea · is_turnaround.
Fills <code>vessel_port_day</code> (the schedule the relief board derives from). Every row is validated
server-side; malformed rows are skipped, never inserted. Replaces CEL/RCI ports, keeps Azamara. Safe to re-run.</p>
<input type="file" id="f" accept=".tsv,.txt,.csv">
<div class="bar"><i id="pi"></i></div>
<div class="log" id="log"></div>
<script>
const log=(m,cls)=>{const d=document.getElementById("log");d.innerHTML+='<div class="'+(cls||"")+'">'+m+'</div>';d.scrollTop=d.scrollHeight;};
document.getElementById("f").onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 const text=await file.text();
 let lines=text.split(/\\r?\\n/).filter(x=>x.trim());
 if(lines.length&&/brand/i.test(lines[0]))lines.shift();
 const rows=lines.map(l=>l.split("\\t")).filter(r=>r.length>=6);
 log(rows.length+" rows parsed. Loading…");
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
 // verify what actually landed
 let st;try{st=await fetch("/api/relief/vpd-status").then(r=>r.json());}catch(x){st=null;}
 if(st){
  log("Verify — "+st.total+" rows · "+st.turnarounds+" turnarounds · "+st.ships+" ships · "+(st.first_date||"?")+" → "+(st.last_date||"?"),"ok hd");
  if(st.fleet_without_ports&&st.fleet_without_ports.length){log("⚠ Fleet ships with NO deployment ("+st.fleet_without_ports.length+"): "+st.fleet_without_ports.join(", "),"err");log("   (Azamara ships use a separate deployment file — expected.)");}
  else{log("All fleet ships have deployment coverage.","ok");}
 }
 log("Done — reload the relief board.","ok");
};
</script></body></html>`;
