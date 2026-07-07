// src/relief_deploy.js
// One-off loader for the full vessel deployment itinerary. Served at GET /api/relief/deploy
// (session-gated). Accepts the tab-separated export (brand, ship_short, berth_date, stop_seq,
// port_name, is_sea) and POSTs it to /api/relief/vpd-load in chunks → vessel_port_day.
export const DEPLOY_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Load vessel deployment</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1b2a4a}
h1{font-size:20px}p{color:#5b6472;font-size:14px}
input[type=file]{margin:14px 0;font-size:14px}
.log{margin-top:16px;font-size:13px;font-family:ui-monospace,Menlo,monospace;background:#f4f3ee;border-radius:8px;padding:12px 14px;max-height:340px;overflow:auto}
.log div{padding:1px 0}.ok{color:#1f7a3d}.err{color:#b0342f;font-weight:600}
.bar{height:8px;background:#e8f1fb;border-radius:20px;overflow:hidden;margin:10px 0}.bar>i{display:block;height:100%;width:0;background:#1f5fa8;transition:width .2s}
</style></head><body>
<h1>Load vessel deployment</h1>
<p>Upload <b>vessel_deployment.tsv</b> (tab-separated: brand · ship · date · stop · port · is_sea).
This fills <code>vessel_port_day</code> — the port schedule the relief board derives cities from.
It <b>replaces</b> the CEL/RCI ports and keeps Azamara. Safe to re-run.</p>
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
 const CH=600;let done=0;
 for(let i=0;i<rows.length;i+=CH){
  const chunk=rows.slice(i,i+CH);
  let res;try{res=await fetch("/api/relief/vpd-load",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:chunk,reset:i===0,asof:today})}).then(r=>r.json());}catch(x){res={ok:false,error:"network"};}
  if(!res||!res.ok){log("ERROR at row "+i+": "+((res&&res.error)||"?"),"err");return;}
  done+=chunk.length;document.getElementById("pi").style.width=Math.round(done/rows.length*100)+"%";
  if(done%3000<CH)log("loaded "+done+" / "+rows.length);
 }
 log("DONE — "+done+" port-days loaded. Reload the relief board.","ok");
};
</script></body></html>`;
