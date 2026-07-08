// src/relief_ui.js
// Relief board — front end (Phase 3). Served at GET /relief (session-gated).
// Crew change at TURNAROUND ports only. Sign-on/off selects are minimalist: a short flat list of
// the nearest turnaround ports, shown as "CITY · date". Sign-on defaults to "follows printer";
// sign-off defaults to the first turnaround past the minimum contract (6mo; Azamara 5mo). "custom" overrides.
export const RELIEF_HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CIMS Keyman — Relief board</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.31.0/tabler-icons.min.css">
<style>
:root{--surface-2:#fff;--surface-1:#f4f3ee;--surface-0:#faf9f5;--border:rgba(20,24,38,.11);--border-strong:rgba(20,24,38,.22);--text-primary:#1b2a4a;--text-secondary:#5b6472;--text-muted:#8b93a1;--text-accent:#1f5fa8;--bg-accent:#e8f1fb;--border-accent:#9cc3ec;--text-success:#1f7a3d;--bg-success:#e3f5e8;--border-success:#57cc7a;--text-warning:#9a6410;--bg-warning:#fbeed6;--text-danger:#b0342f;--bg-danger:#fbe7e6;--radius:8px;--font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}
@media(prefers-color-scheme:dark){:root{--surface-2:#1c212b;--surface-1:#252b36;--surface-0:#161a22;--border:rgba(255,255,255,.12);--border-strong:rgba(255,255,255,.24);--text-primary:#e7ebf2;--text-secondary:#a7b0be;--text-muted:#7c8697;--text-accent:#79b0e8;--bg-accent:#16324e;--border-accent:#2f6ba3;--text-success:#6ed08d;--bg-success:#173a24;--border-success:#2f7d47;--text-warning:#e2b268;--bg-warning:#3d2f14;--text-danger:#e88a86;--bg-danger:#3d1f1e}}
*{box-sizing:border-box}body{margin:0;background:var(--surface-0);color:var(--text-primary);font-family:var(--font-sans);line-height:1.6}
.wrap{max-width:1040px;margin:0 auto;padding:24px 22px 60px}
h1{font-size:19px;margin:0 0 2px;font-weight:600}.sub{font-size:12.5px;color:var(--text-secondary);margin:0 0 16px}
input,select,button{font-family:inherit}
input[type=text],input[type=date],select{width:100%;height:36px;padding:0 10px;font-size:14px;border:.5px solid var(--border);border-radius:var(--radius);background:var(--surface-2);color:var(--text-primary);outline:none}
select:focus,input:focus{box-shadow:0 0 0 2px var(--bg-accent);border-color:var(--text-accent)}
.btn{cursor:pointer;background:var(--surface-2);border:.5px solid var(--border-strong);border-radius:var(--radius);color:var(--text-primary);font-size:13px;padding:7px 12px;margin:0 6px 6px 0}
.btn:hover{background:var(--surface-1)}
.metrics{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.metric{background:var(--surface-1);border-radius:var(--radius);padding:9px 12px;font-size:13px}.mn{font-size:18px;font-weight:600}
.reset{font-size:12px;color:var(--text-accent);background:var(--bg-accent);border:.5px solid var(--border-accent);border-radius:20px;padding:4px 11px;cursor:pointer;display:none}
.ship{background:var(--surface-2);border:.5px solid var(--border);border-radius:12px;padding:.85rem 1rem;margin-bottom:10px}
.ship h3{margin:0 0 9px;font-size:15px;display:flex;align-items:center;gap:8px;font-weight:600}
.grip{cursor:grab;color:var(--text-muted);padding:2px 4px;border-radius:5px}.grip:hover{background:var(--surface-1)}
.ship.over{box-shadow:0 0 0 2px var(--text-accent)}.ship.drag{opacity:.45}
.row{display:flex;flex-wrap:wrap;gap:9px}
.card{border-radius:12px;padding:11px 13px;cursor:pointer;position:relative;transition:box-shadow .12s,opacity .12s}
.card[draggable=true]{cursor:grab}.card.cdrag{opacity:.4}
.printer{background:var(--surface-2);border:2px solid var(--border-success);flex:1 1 260px;min-width:230px}
.relief{background:var(--surface-2);border:2px solid var(--text-accent);flex:1 1 220px;min-width:205px}
.ghost{border:2px dashed var(--border);flex:1 1 210px;min-width:200px;display:flex;flex-direction:column;justify-content:center;color:var(--text-muted)}
.badge{position:absolute;top:10px;right:10px;font-size:11px;padding:3px 8px;border-radius:20px;font-weight:500}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.line{font-size:13px;color:var(--text-secondary);margin:3px 0 0}
.tags{margin-top:8px;display:flex;flex-wrap:wrap;gap:5px}.t{font-size:10.5px;padding:2px 8px;border-radius:20px;background:var(--bg-success);color:var(--text-success);font-weight:500}
.hand{margin-top:9px;font-size:12px;padding:6px 11px;border-radius:var(--radius);display:flex;align-items:center;gap:7px}
.modal{position:fixed;inset:0;background:rgba(10,14,24,.44);display:none;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto;z-index:50}
.modal.show{display:flex}
.cc{background:var(--surface-2);border:.5px solid var(--border);border-radius:12px;width:100%;max-width:600px;box-shadow:0 18px 50px rgba(10,14,24,.28)}
.cchd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 11px;border-bottom:.5px solid var(--border)}
.x{cursor:pointer;font-size:13px;color:var(--text-secondary);border:.5px solid var(--border-strong);border-radius:var(--radius);padding:5px 9px}
.lbl{font-size:11px;color:var(--text-muted);margin:14px 0 5px;text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;gap:8px}
.mut{font-size:10.5px;color:var(--text-accent);cursor:pointer;text-transform:none;letter-spacing:0}
.chip{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:var(--radius);font-size:13.5px;margin-top:2px;background:var(--surface-1);color:var(--text-secondary)}
.tog{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 10px;border:.5px solid var(--border);border-radius:20px;margin:0 6px 6px 0;cursor:pointer;color:var(--text-secondary)}
.tog.on{border-color:var(--text-success);color:var(--text-success);background:var(--bg-success)}
.sw{width:24px;height:14px;border-radius:20px;background:var(--border-strong);position:relative}.sw.on{background:var(--text-success)}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:var(--surface-2);transition:left .12s}.sw.on::after{left:12px}
.drop{border:.5px solid var(--border);border-radius:var(--radius);margin-top:4px;max-height:150px;overflow:auto;background:var(--surface-2);display:none}
.opt{padding:8px 12px;font-size:14px;cursor:pointer}.opt:hover{background:var(--surface-1)}
.empty{color:var(--text-muted);font-size:14px;padding:30px 0;text-align:center}
.ghost.crit{border-color:var(--text-danger);background:var(--bg-danger);color:var(--text-danger)}
.ghost.due{border-color:var(--text-warning);background:var(--bg-warning);color:var(--text-warning)}
.derive{font-size:12px;color:var(--text-muted);margin-top:6px;min-height:16px}
.wrow{display:flex;align-items:center;justify-content:space-between;padding:9px 11px;border:.5px solid var(--border);border-radius:var(--radius);margin-top:6px;font-size:13.5px}
.wbtn{margin:0;padding:5px 10px;font-size:12px}
.sent{font-size:12px;color:var(--text-muted)}.sent.ok{color:var(--text-success)}
.cmt{font-size:13px;padding:8px 10px;border-radius:var(--radius);background:var(--surface-1);margin-top:6px}.cmt .cmeta{font-size:11px;color:var(--text-muted);margin-top:3px}
.match{cursor:pointer;background:var(--surface-2);border:.5px solid var(--border-accent);color:var(--text-accent);border-radius:var(--radius);font-size:12.5px;padding:6px 11px;margin-top:9px;display:inline-flex;align-items:center;gap:6px}
</style></head><body>
<div class="wrap">
  <h1>Relief board</h1>
  <p class="sub">Crew change at turnaround ports. A reliever follows the printer's sign-off, then signs off at the next turnaround ~6 months out. Drag a reliever to reassign · ⠿ to reorder · Esc to close. <span id="today"></span></p>
  <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px"><span id="reset" class="reset" onclick="RB.resetSort()"><i class="ti ti-arrow-back-up"></i> Reset to urgency</span></div>
  <div class="metrics" id="metrics"></div>
  <div id="board"></div>

  <div class="modal" id="modal">
    <div class="cc" onclick="event.stopPropagation()">
      <div class="cchd"><div><div id="mtitle" style="font-size:16px;font-weight:600">Contract</div><div id="msub" style="font-size:12px;color:var(--text-muted);margin-top:2px"></div></div>
        <div style="display:flex;gap:10px;align-items:center"><span style="font-size:11px;color:var(--text-muted)"><i class="ti ti-command"></i> Esc</span><span class="x" onclick="RB.close()"><i class="ti ti-x"></i> Close</span></div></div>
      <div style="padding:6px 16px 16px">
        <div id="mbanner" style="display:none"></div>
        <div class="lbl">Crew member<span id="mreq" style="color:var(--text-danger);text-transform:none;letter-spacing:0"> — required to activate</span></div>
        <input type="text" id="mcrew" placeholder="Search crew…" autocomplete="off" oninput="RB.filter()" onfocus="RB.filter()">
        <div id="mdrop" class="drop"></div>
        <div id="mpicked" style="display:none;margin-top:6px;font-size:14px"></div>
        <div class="lbl">Ship</div><select id="mship" onchange="RB.shipChange()"></select><div id="mshiphelp" class="derive">Preloaded from the slot. Change it to reassign — cities re-derive.</div>
        <div id="mdates"></div>
        <div class="lbl">Confirmed<span style="color:var(--text-muted);text-transform:none;letter-spacing:0;font-weight:400"> — shows as green tags on the card</span></div><div id="mtogs"></div><div class="lbl" id="mworklbl">Sign-off workflow</div><div id="mwork"></div><div class="lbl">Comment</div><div id="mcmts"></div><div style="display:flex;gap:8px;margin-top:6px"><input type="text" id="mcmt" placeholder="Add a note…" autocomplete="off"><button class="btn" style="white-space:nowrap;margin:0" onclick="RB.addComment()"><i class="ti ti-plus"></i> Post</button></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:12px;border-top:.5px solid var(--border)">
          <button class="btn" onclick="RB.close()">Cancel</button>
          <button class="btn" id="msave" style="border-color:var(--text-success);color:var(--text-success)" onclick="RB.save()"><i class="ti ti-check"></i> Save</button>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
const RB=(()=>{
 let BOARD=[],CREW=[],CFG={critical_days:14,due_days:30},manualOrder=null,cur=null,drag=null,PORTS=[],_CHG=false;
 const $=id=>document.getElementById(id);
 const shipName=k=>String(k||"").split("|")[1]||k;
 const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
 const fmtDate=d=>{if(!d)return"";const p=d.split("-");return MON[(+p[1])-1]+" "+(+p[2])+" "+p[0];};
 const CONF={derived:["var(--bg-success)","var(--text-success)","derived"],provisional:["var(--bg-warning)","var(--text-warning)","provisional"],seed:["var(--bg-danger)","var(--text-danger)","seed"],override:["var(--bg-accent)","var(--text-accent)","override"],TBA:["var(--surface-1)","var(--text-muted)","TBA"]};
 const col=c=>c==="muted"?["var(--surface-1)","var(--text-muted)"]:["var(--bg-"+c+")","var(--text-"+c+")"];
 async function load(){
  try{
   const [b,c]=await Promise.all([fetch("/api/relief/board").then(r=>r.json()),fetch("/api/relief/crew").then(r=>r.json()).catch(()=>({crew:[]}))]);
   BOARD=b.board||[];CFG=b.config||CFG;CREW=(c&&c.crew)||[];$("today").textContent="· today "+(b.today||"");
  }catch(e){BOARD=[];}
  render();
  var _op=new URLSearchParams(location.search).get("open");
  if(_op){var w=document.querySelector(".wrap");Array.prototype.forEach.call(w.children,function(c){if(c.id!=="modal")c.style.display="none";});document.body.style.background="transparent";var _m=document.getElementById("modal");if(_m)_m.style.background="transparent";if(BOARD.some(function(x){return x.vessel_key===_op;})){open(_op,"reliever");if(window.parent&&window.parent!==window){try{window.parent.postMessage({t:"reliefReady"},"*");}catch(e){}}}}
 }
 function order(){ if(manualOrder){const extra=BOARD.filter(r=>!manualOrder.includes(r.vessel_key));return manualOrder.map(k=>BOARD.find(r=>r.vessel_key===k)).filter(Boolean).concat(extra);} return BOARD; }
 function metrics(){
  const need=BOARD.filter(r=>!r.reliever&&r.days_to_off!=null&&r.days_to_off<=CFG.due_days).length;
  const urgent=BOARD.filter(r=>!r.reliever&&r.days_to_off!=null&&r.days_to_off<=CFG.critical_days).length;
  const set=BOARD.filter(r=>r.reliever).length;
  $("metrics").innerHTML='<div class="metric"><span class="mn" style="color:var(--text-warning)">'+need+'</span> need a reliever</div><div class="metric"><span class="mn" style="color:var(--text-danger)">'+urgent+'</span> urgent (≤'+CFG.critical_days+'d)</div><div class="metric"><span class="mn" style="color:var(--text-success)">'+set+'</span> handover set</div>';
  $("reset").style.display=manualOrder?"inline-flex":"none";
 }
 function cityLine(o,which){const city=which==="on"?o.on_city:o.off_city;const conf=which==="on"?o.on_conf:o.off_conf;const c=CONF[conf]||CONF.TBA;return '<span class="dot" style="background:'+c[1]+'"></span>'+(city||"— no coverage —");}
 function tagStrip(t){if(!t)return"";const on=Object.keys(t).filter(k=>t[k]);if(!on.length)return"";const lbl={eccr:"ECCR",air:"AIR",hotel:"HOTEL",on_date_conf:"ON DATE",off_date_conf:"OFF DATE"};return '<div class="tags">'+on.map(k=>'<span class="t">'+(lbl[k]||k)+'</span>').join("")+'</div>';}
 function handTxt(r){const h=r.handover||{kind:"none"};const d=r.days_to_off;
  if(h.kind==="clean")return{c:"success",ic:"ti-arrows-left-right",t:"Clean handover"+((r.reliever&&r.reliever.on_city)?(" · "+r.reliever.on_city+(r.reliever.on_date?(" · "+r.reliever.on_date):"")):"")};
  if(h.kind==="port_mismatch")return{c:"warning",ic:"ti-alert-triangle",t:"Same day, port differs — "+(h.relieverCity||"—")+" vs "+(h.printerCity||"—")};
  if(h.kind==="gap")return{c:"warning",ic:"ti-alert-triangle",t:(h.days!=null?h.days:"?")+"-day gap between OFF and reliever ON"};
  if(d!=null&&d<=CFG.critical_days)return{c:"danger",ic:"ti-alert-circle",t:"Reliever needed — printer signs off in "+d+" days"};
  if(d!=null&&d<=CFG.due_days)return{c:"warning",ic:"ti-clock",t:"Reliever due — printer signs off in "+d+" days"};
  return{c:"muted",ic:"ti-circle-dashed",t:d!=null?("Slot open — printer signs off in "+d+" days"):"Slot open"};}
 function render(){
  metrics();
  if(!BOARD.length){$("board").innerHTML='<div class="empty">No ships yet.</div>';return;}
  $("board").innerHTML=order().map(r=>{
   const p=r.printer,rel=r.reliever,d=r.days_to_off;
   const bc=d==null?"muted":d<=CFG.critical_days?"danger":d<=CFG.due_days?"warning":"muted",bcol=col(bc);
   let printer="";
   if(p){printer='<div class="card printer" onclick="RB.open(\\''+r.vessel_key+'\\',\\'printer\\')">'+(d!=null?'<span class="badge" style="background:'+bcol[0]+';color:'+bcol[1]+'">OFF in '+d+'d</span>':'')+'<div style="font-size:15px;font-weight:600;padding-right:64px">'+(p.crew_name||"—")+' <span style="font-size:11px;color:var(--text-accent)">PS</span></div><div class="line"><span class="dot" style="background:var(--text-success)"></span>On board</div><div class="line">'+cityLine(p,"off")+' · OFF '+(p.off_date||"TBA")+'</div>'+tagStrip(p.tags)+'</div>';}
   let reliever;
   if(rel){reliever='<div class="card relief" draggable="true" ondragstart="RB.cds(event,\\''+r.vessel_key+'\\',\\'reliever\\')" ondragend="RB.cde(event)" onclick="RB.open(\\''+r.vessel_key+'\\',\\'reliever\\')"><div style="font-size:14px;font-weight:600">'+(rel.crew_name||"—")+' <span style="font-size:11px;color:var(--text-accent)">reliever</span></div><div class="line"><span class="dot" style="background:var(--text-accent)"></span>Signs on'+(rel.auto_on?' <span style="color:var(--text-muted)">(follows printer)</span>':'')+'</div><div class="line">'+cityLine(rel,"on")+' · ON '+(rel.on_date||"TBA")+'</div>'+tagStrip(rel.tags)+'</div>';}
   else{reliever='<div class="card ghost'+(bc==='danger'?' crit':bc==='warning'?' due':'')+'" onclick="RB.open(\\''+r.vessel_key+'\\',\\'reliever\\')"><div style="font-size:13px;font-weight:500"><i class="ti ti-plus"></i> Add reliever</div><div style="font-size:11px;opacity:.8;margin-top:2px">empty slot · drop a card to fill</div></div>';}
   const ht=handTxt(r),hc=col(ht.c);
   return '<div class="ship" data-key="'+r.vessel_key+'" ondragover="RB.sov(event,\\''+r.vessel_key+'\\')" ondragleave="RB.sl(event)" ondrop="RB.sd(event,\\''+r.vessel_key+'\\')"><h3><span class="grip" draggable="true" title="Drag to reorder" ondragstart="RB.rs(event,\\''+r.vessel_key+'\\')" ondragend="RB.re(event)">⠿</span>'+shipName(r.vessel_key)+'</h3><div class="row">'+printer+reliever+'</div><div class="hand" style="background:'+hc[0]+';color:'+hc[1]+'"><i class="ti '+ht.ic+'"></i>'+ht.t+'</div></div>';
  }).join("");
 }
 function cds(e,k,role){drag={kind:"card",key:k,role};e.currentTarget.classList.add("cdrag");e.stopPropagation();}
 function cde(e){e.currentTarget.classList.remove("cdrag");document.querySelectorAll(".over").forEach(x=>x.classList.remove("over"));}
 function rs(e,k){drag={kind:"reorder",key:k};const b=e.currentTarget.closest(".ship");if(b)b.classList.add("drag");e.stopPropagation();}
 function re(e){document.querySelectorAll(".drag,.over").forEach(x=>x.classList.remove("drag","over"));}
 function sov(e,k){if(!drag)return;e.preventDefault();if(drag.key!==k)e.currentTarget.classList.add("over");}
 function sl(e){e.currentTarget.classList.remove("over");}
 async function sd(e,target){if(!drag)return;e.preventDefault();document.querySelectorAll(".over").forEach(x=>x.classList.remove("over"));
  if(drag.kind==="reorder"){reorder(drag.key,target);}else if(drag.kind==="card"){await reassign(drag.key,drag.role,target);}
  drag=null;}
 function reorder(from,to){const base=order().map(r=>r.vessel_key);const fi=base.indexOf(from),ti=base.indexOf(to);base.splice(fi,1);base.splice(ti,0,from);manualOrder=base;render();}
 function resetSort(){manualOrder=null;render();}
 async function reassign(fromKey,role,toKey){
  if(fromKey===toKey||role!=="reliever")return;
  const row=BOARD.find(r=>r.vessel_key===fromKey);const node=row&&row.reliever;if(!node)return;
  const target=BOARD.find(r=>r.vessel_key===toKey);if(target&&target.reliever){alert(shipName(toKey)+" already has a reliever.");return;}
  await post({id:node.id,vessel_name:shipName(toKey)});await load();
 }
 // ---- turnaround-port picker (minimalist: flat, CITY · date, nearest ~8) ----
 async function fetchPorts(ship){try{const r=await fetch("/api/relief/ports?ship="+encodeURIComponent(ship));const j=await r.json();PORTS=(j&&j.ports)||[];}catch(e){PORTS=[];}}
 function taPorts(){return (PORTS||[]).filter(p=>Number(p.is_turnaround)===1&&Number(p.is_sea)!==1&&p.port_name).slice().sort((a,b)=>a.berth_date<b.berth_date?-1:a.berth_date>b.berth_date?1:0);}
 function addMonths(d,n){if(!d)return"";const dt=new Date(d+"T00:00:00Z");dt.setUTCMonth(dt.getUTCMonth()+n);return dt.toISOString().slice(0,10);}
 function brandOf(ship){const row=BOARD.find(r=>shipName(r.vessel_key)===ship);return row?String(row.vessel_key).split("|")[0]:"";}
 function minMonths(){const b=brandOf($("mship")?$("mship").value:shipName(cur&&cur.key));return /azamara/i.test(b)?5:6;}
 function portOpts(list,selDate,lead){let h=lead;for(const p of list){h+='<option value="'+p.berth_date+'"'+(p.berth_date===selDate?' selected':'')+'>'+p.port_name+' · '+fmtDate(p.berth_date)+'</option>';}h+='<option value="__c">Custom date…</option>';return h;}
 function buildDates(node,role,ro){const el=$("mdates");
  if(ro){
   const isAz=String(cur.key).split("|")[0]==="Azamara";
   const ta=taPorts();
   const tp=date=>date?ta.find(p=>p.berth_date===date):null;
   const on=tp(node.on_date),off=tp(node.off_date);
   const onTxt=(on?on.port_name:(node.on_city||"— no port —"))+" · "+(node.on_date?fmtDate(node.on_date):"TBA");
   const offTxt=(off?off.port_name:(node.off_city||"— no port —"))+" · "+(node.off_date?fmtDate(node.off_date):"TBA");
   const leg=(cap,txt)=>'<div style="flex:1;min-width:0"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">'+cap+'</div><div style="background:var(--surface-1);border-radius:10px;padding:10px 12px;font-size:13.5px;font-weight:500;line-height:1.4">'+txt+'</div></div>';
   var offBlock;
   if(isAz){
    var opts='<option value="__auto" selected>↳ auto · 5-month projection ('+(node.off_date?fmtDate(node.off_date):"TBA")+')</option>';
    for(var qi=0;qi<ta.length;qi++){opts+='<option value="'+ta[qi].berth_date+'">'+ta[qi].port_name+' · '+fmtDate(ta[qi].berth_date)+'</option>';}
    offBlock='<div style="flex:1;min-width:0"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Sign-off · Azamara (adjustable)</div><select id="pazoff" onchange="RB.azTouch()">'+opts+'</select></div>';
   }else{
    offBlock=leg("Sign-off"+(off?" · turnaround":""),offTxt);
   }
   el.innerHTML='<div class="lbl">Ship</div><div style="font-size:15px;font-weight:600">'+shipName(cur.key)+' <span style="font-size:11px;color:var(--text-accent);font-weight:600">PS</span></div>'
    +'<div class="lbl" style="margin-top:16px">Rotation</div>'
    +'<div style="display:flex;align-items:center;gap:10px">'+leg("Sign-on"+(on?" · turnaround":""),onTxt)+'<div style="color:var(--text-muted);flex:0 0 auto"><i class="ti ti-arrow-right"></i></div>'+offBlock+'</div>';
   return;
  }
  var pd=cur.printerOff&&cur.printerOff.date;
  var onDate=(node&&node.on_date&&!node.auto_on)?node.on_date:(pd||"");
  var offDate=(node&&node.off_date)||(pd?addMonths(pd,minMonths()):"");
  el.innerHTML='<div style="display:flex;gap:14px">'
   +'<div style="flex:1"><div class="lbl">Sign-on date</div><input type="date" id="mon-date" value="'+onDate+'" onchange="RB.derive(this.id)"><div class="derive" id="mon-city">Pick a date to derive the city</div></div>'
   +'<div style="flex:1"><div class="lbl">Sign-off date</div><input type="date" id="moff-date" value="'+offDate+'" onchange="RB.derive(this.id)"><div class="derive" id="moff-city">Pick a date to derive the city</div></div>'
   +'</div>';
  derive("on");derive("off");
 }
 function rebuildOff(preselect){
  const ta=taPorts();
  const base=dateVal("on")||(cur&&cur.printerOff&&cur.printerOff.date)||"";
  const target=base?addMonths(base,minMonths()):"";
  const list=(target?ta.filter(p=>p.berth_date>=target):ta).slice(0,8);
  const sel=$("moff-sel"),cust=$("moff-cust");if(!sel)return;
  let want=(preselect!==undefined)?preselect:(sel.value==="__c"?cust.value:sel.value);want=want||"";
  const inList=list.some(p=>p.berth_date===want);
  sel.innerHTML=portOpts(list,inList?want:"",'<option value="">— pick a turnaround —</option>');
  if(want&&!inList){sel.value="__c";cust.value=want;cust.style.display="block";}
  else{cust.style.display="none";sel.value=inList?want:(list[0]?list[0].berth_date:"");}
 }
 function onSel(which){const sel=$(which==="on"?"mon-sel":"moff-sel");const cust=$(which==="on"?"mon-cust":"moff-cust");
  if(sel.value==="__c"){cust.style.display="block";cust.focus();}else{cust.style.display="none";}
  if(which==="on")rebuildOff();}
 function custom(which){const sel=$(which==="on"?"mon-sel":"moff-sel");sel.value="__c";onSel(which);}
 function dateVal(which){var el=$(which==="on"?"mon-date":"moff-date");return el?(el.value||""):"";}
 async function shipChange(){const s=$("mship").value;await fetchPorts(s);
  const row=BOARD.find(r=>shipName(r.vessel_key)===s);const pr=row&&row.printer;
  cur.printerOff=(cur.role==="reliever"&&pr)?{city:pr.off_city,conf:pr.off_conf,date:pr.off_date}:null;
  buildDates(null,cur.role,false);}
 async function open(key,role){const row=BOARD.find(r=>r.vessel_key===key);const node=row?row[role]:null;const printer=row?row.printer:null;
  const ro=!!(node&&String(node.id||"").startsWith("leg:"));
  cur={key,role,id:node?node.id:null,isNew:!node,readonly:ro,crewName:node?node.crew_name:null,printerOff:(role==="reliever"&&printer)?{city:printer.off_city,conf:printer.off_conf,date:printer.off_date}:null,tags:node?Object.assign({},node.tags):{eccr:false,air:false,hotel:false,on_date_conf:false,off_date_conf:false}};
  $("mtitle").textContent=ro?(node.crew_name||"Keyman"):((node?"Edit ":"New ")+(role==="reliever"?"reliever":"contract"));
  $("msub").textContent=ro?"Rotation from the Keyman board · confirmations editable here":((node?(node.id||""):shipName(key)+" · unassigned")+(role==="reliever"?" · reliever":" · printer"));
  $("msave").style.display="inline-block";
  const banner=$("mbanner");
  if(role==="reliever"&&printer){banner.style.cssText="display:block;background:var(--bg-accent);border-radius:var(--radius);padding:10px 12px;margin:8px 0;font-size:13px";banner.innerHTML='<b style="color:var(--text-accent)"><i class="ti ti-arrows-left-right"></i> Relieving '+(printer.crew_name||"—")+'</b><div style="color:var(--text-secondary);margin-top:3px">Printer OFF · '+(printer.off_city||"—")+' · '+(printer.off_date||"TBA")+'</div><button class="match" onclick="RB.matchHandover()"><i class="ti ti-wand"></i> Match handover</button>';}else banner.style.display="none";
  if(node){$("mcrew").style.display="none";$("mdrop").style.display="none";$("mpicked").style.display="flex";$("mpicked").innerHTML='<b>'+(node.crew_name||"—")+'</b>';cur.crew_id=null;}
  else{$("mcrew").style.display="block";$("mcrew").value="";$("mpicked").style.display="none";}
  const ships=[...new Set(BOARD.map(r=>shipName(r.vessel_key)))];$("mship").innerHTML=ships.map(s=>'<option'+(s===shipName(key)?" selected":"")+'>'+s+'</option>').join("")||'<option>'+shipName(key)+'</option>';
  $("mdates").innerHTML="";togs();cur.sent=node?Object.assign({},node.workflow||{}):{};workflow();
  $("mcrew").previousElementSibling.style.display=ro?"none":"";
  $("mship").previousElementSibling.style.display=ro?"none":"";$("mship").style.display=ro?"none":"";
  $("mtogs").previousElementSibling.style.display="";$("mtogs").style.display="";if($("mreq"))$("mreq").style.display=(!node&&!ro)?"":"none";if($("mshiphelp"))$("mshiphelp").style.display=ro?"none":"";
  if(ro){$("mcrew").style.display="none";$("mdrop").style.display="none";$("mpicked").style.display="none";}
  $("modal").classList.add("show");
  await fetchPorts(shipName(key));buildDates(node,role,ro);cur.azTouched=false;loadComments();
 }
 var WCOLS=["instructions_sent_at","signoff_link_sent_at","review_invite_sent_at"];
 var WKEYS=["instructions","link","review"];
 var WLBL=["Send instructions","Send sign-off link","Send review invite"];
 function workflow(){var el=$("mwork"),lbl=$("mworklbl");if(!el)return;if(cur.readonly){el.style.display="none";if(lbl)lbl.style.display="none";return;}el.style.display="";if(lbl)lbl.style.display="";if(!cur.id){el.innerHTML='<div class="wrow"><span style="color:var(--text-muted)">Save the reliever first to enable sign-off steps</span></div>';return;}var h="";for(var i=0;i<3;i++){var done=cur.sent&&cur.sent[WKEYS[i]];h+='<div class="wrow"><span>'+WLBL[i]+'</span>'+(done?'<span class="sent ok"><i class="ti ti-check"></i> sent</span>':'<button class="btn wbtn" onclick="RB.mark('+i+')">Mark sent</button>')+'</div>';}el.innerHTML=h;}
 async function mark(i){if(!cur.id)return;var now=new Date().toISOString();var payload={id:cur.id};payload[WCOLS[i]]=now;var r=await post(payload);if(r&&r.ok){cur.sent=cur.sent||{};cur.sent[WKEYS[i]]=true;workflow();}else{alert("Could not mark sent"+(r&&r.error?": "+r.error:""));}}
 function nearestPort(d){var best=null,bd=1e18,t=new Date(d).getTime();for(var i=0;i<(PORTS||[]).length;i++){var p=PORTS[i];if(!p.port_name||!p.berth_date)continue;var diff=Math.abs(new Date(p.berth_date).getTime()-t);if(diff<bd){bd=diff;best=p;}}return best;}
 function derive(w){var which=(w==="mon-date"||w==="on")?"on":"off";var inp=$(which==="on"?"mon-date":"moff-date"),box=$(which==="on"?"mon-city":"moff-city");if(!inp||!box)return;var d=inp.value;if(!d){box.textContent="Pick a date to derive the city";box.style.color="var(--text-muted)";return;}box.style.color="";var hit=null;for(var i=0;i<(PORTS||[]).length;i++){if(PORTS[i].berth_date===d&&PORTS[i].port_name){hit=PORTS[i];break;}}if(hit){var ta=Number(hit.is_turnaround)===1;box.innerHTML='<span class="dot" style="background:'+(ta?"var(--text-success)":"var(--text-warning)")+'"></span>'+hit.port_name+(ta?" · turnaround":" · not a turnaround port");}else{var n=nearestPort(d);box.innerHTML=n?('<span class="dot" style="background:var(--text-warning)"></span>~ '+n.port_name+" · nearest ("+fmtDate(n.berth_date)+")"):'<span class="dot" style="background:var(--text-muted)"></span>— no coverage —';}}
 function matchHandover(){if(!(cur&&cur.printerOff&&cur.printerOff.date))return;var on=$("mon-date");if(on){on.value=cur.printerOff.date;derive("on");}var off=$("moff-date");if(off){off.value=addMonths(cur.printerOff.date,minMonths());derive("off");}}
 async function loadComments(){var el=$("mcmts");if(!el)return;if(!cur.id){el.innerHTML='<div style="font-size:12px;color:var(--text-muted)">Save first to add comments</div>';return;}try{var r=await fetch("/api/relief/comments?assignment_id="+encodeURIComponent(cur.id));var j=await r.json();renderComments((j&&j.comments)||[]);}catch(e){el.innerHTML="";}}
 function renderComments(list){var el=$("mcmts");if(!el)return;if(!list.length){el.innerHTML='<div style="font-size:12px;color:var(--text-muted)">No comments yet</div>';return;}var h="";for(var i=0;i<list.length;i++){var c=list[i];h+='<div class="cmt">'+String(c.body||"").replace(/</g,"&lt;")+'<div class="cmeta">'+fmtDate(String(c.created_at||"").slice(0,10))+'</div></div>';}el.innerHTML=h;}
 async function addComment(){var inp=$("mcmt");if(!inp||!inp.value.trim())return;if(!cur.id){alert("Save the reliever first.");return;}try{var r=await fetch("/api/relief/comment",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({assignment_id:cur.id,vessel_key:cur.key,body:inp.value.trim()})});var j=await r.json();if(j&&j.ok){inp.value="";loadComments();}else alert("Post failed");}catch(e){alert("network");}}
 function togs(){const lbl={eccr:"ECCR",air:"AIR",hotel:"HOTEL",on_date_conf:"ON DATE",off_date_conf:"OFF DATE"};$("mtogs").innerHTML=Object.keys(cur.tags).map(k=>'<span class="tog '+(cur.tags[k]?"on":"")+'" onclick="RB.tog(\\''+k+'\\')"><span class="sw '+(cur.tags[k]?"on":"")+'"></span>'+lbl[k]+'</span>').join("");}
 function tog(k){if(cur.readonly)return;cur.tags[k]=!cur.tags[k];togs();}
 function filter(){const q=$("mcrew").value.toLowerCase();const hits=CREW.filter(c=>(c.name||"").toLowerCase().includes(q)).slice(0,20);$("mdrop").innerHTML=hits.map(c=>'<div class="opt" onclick="RB.pick(\\''+c.id+'\\',\\''+(c.name||"").replace(/'/g,"")+'\\')">'+(c.name||c.id)+'</div>').join("")||'<div class="opt" style="color:var(--text-muted)">no match</div>';$("mdrop").style.display="block";}
 function pick(id,name){cur.crew_id=id;$("mcrew").style.display="none";$("mdrop").style.display="none";$("mpicked").style.display="flex";$("mpicked").innerHTML='<b>'+name+'</b>';}
 function close(){$("modal").classList.remove("show");if(window.parent&&window.parent!==window){try{window.parent.postMessage({t:"reliefClose",changed:_CHG},"*");}catch(e){}}}
 function azTouch(){cur.azTouched=true;}
 async function save(){
  if(cur.readonly){
   const fl={vessel_key:cur.key,crew_name:cur.crewName||"",eccr:cur.tags.eccr?1:0,air:cur.tags.air?1:0,hotel:cur.tags.hotel?1:0,on_date_conf:cur.tags.on_date_conf?1:0,off_date_conf:cur.tags.off_date_conf?1:0};
   var pa=$("pazoff");if(pa&&cur.azTouched){fl.override_off_date=(pa.value==="__auto"?"":pa.value);}
   try{const r=await fetch("/api/relief/leg-flags",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(fl)});const j=await r.json();if(j&&j.ok){_CHG=true;close();await load();}else{alert("Save failed");}}catch(e){alert("network");}
   return;
  }
  const payload={sign_on:dateVal("on")||null,planned_sign_off:dateVal("off")||null,
   eccr:cur.tags.eccr?1:0,air:cur.tags.air?1:0,hotel:cur.tags.hotel?1:0,on_date_conf:cur.tags.on_date_conf?1:0,off_date_conf:cur.tags.off_date_conf?1:0};
  if(cur.id){payload.id=cur.id;}
  else{if(!cur.crew_id){alert("Pick a crew member first.");return;}payload.crew_id=cur.crew_id;payload.role=cur.role;payload.vessel_name=$("mship").value;}
  const res=await post(payload);
  if(res&&res.ok){_CHG=true;close();await load();}else{alert("Save rejected: "+(res&&(res.error||(res.rejected||[]).join(","))||"error"));}
 }
 async function post(payload){try{const r=await fetch("/api/relief/save",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});return await r.json();}catch(e){return{ok:false,error:"network"};}}
 document.addEventListener("keydown",e=>{if(e.key==="Escape")close();});
 document.getElementById("modal").addEventListener("click",close);
 load();
 return {open,close,save,azTouch,filter,pick,tog,resetSort,cds,cde,rs,re,sov,sl,sd,shipChange,onSel,custom,rebuildOff,derive,matchHandover,mark,addComment};
})();
</script></body></html>`;
