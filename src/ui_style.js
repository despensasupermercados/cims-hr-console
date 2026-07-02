// Shared CSS for the server-rendered pages (login, feedback, console app).
// Moved VERBATIM from src/worker.js — the string bytes are unchanged; it was
// relocated (with the page templates) purely to keep src/worker.js at a
// manageable file size.
export const STYLE = `
:root{--navy:#1B3A5C;--deep:#142D48;--ink:#16293D;--green:#5FB946;--green-d:#3E8E2A;--amber:#B0741A;--red:#BC3B2C;--royal:#1E6FD0;--line:#E4E9F0;--line-2:#D5DDE9;--mut:#6B7C93;--bg:#E9EDF3;--surface:#fff}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
h1,h2,h3,.fh{font-family:'Outfit',system-ui,sans-serif;letter-spacing:-.012em}
.brandmark{width:30px;height:30px;border-radius:8px;background:var(--green);display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Outfit';font-weight:800;font-size:16px}
header{background:linear-gradient(180deg,#1F4268,#16314F);color:#fff;padding:0 22px;display:flex;align-items:center;gap:16px;height:58px;position:sticky;top:0;z-index:20}
header .brand{font-family:'Outfit';font-weight:700;font-size:15px}
header .brand small{display:block;font-size:9px;font-weight:500;color:#9fb4cc;letter-spacing:.1em;text-transform:uppercase}
nav{margin-left:auto;display:flex;gap:4px}
nav button{background:transparent;border:0;color:#b9cce0;padding:8px 14px;border-radius:8px;font-family:'Outfit';font-weight:600;font-size:13.5px;cursor:pointer}
nav button.on,nav button:hover{background:rgba(255,255,255,.12);color:#fff}
nav a.out{color:#9fb4cc;font-size:12.5px;text-decoration:none;padding:8px 10px}
.burger{display:none;background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;margin-left:auto;padding:6px 8px}
@media(max-width:900px){
  .burger{display:block}
  header nav{display:none;position:absolute;top:56px;right:8px;margin-left:0;flex-direction:column;align-items:stretch;gap:2px;background:#16314F;padding:8px;border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.35);min-width:200px;z-index:60}
  header nav.open{display:flex}
  nav button{text-align:left;width:100%;font-size:15px;padding:11px 14px}
  nav a.out{padding:11px 14px}
}
.wrap{max-width:1180px;margin:0 auto;padding:22px}
.shipsec{background:#fff;border:1px solid var(--line);border-radius:13px;box-shadow:0 2px 10px rgba(20,45,72,.06);overflow:hidden;margin-bottom:10px}
.shiphdr{display:flex;align-items:center;padding:12px 14px;cursor:pointer;border-left:3px solid var(--royal)}
.shiphdr .nm{font-family:'Outfit';font-weight:700;color:var(--navy);font-size:15px}
.shiphdr .meta{margin-left:auto;color:var(--mut);font-size:12.5px;display:flex;align-items:center;gap:8px}
.shiphdr .arw{display:inline-block;transition:transform .15s}.shiphdr .arw.closed{transform:rotate(-90deg)}
.shipbody{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;padding:6px 14px 14px}
.shipbody.closed{display:none}
.rcard{background:#fcfdff;border:1px solid var(--line);border-radius:11px;padding:10px 12px;cursor:grab}
.rcard:active{cursor:grabbing}.rcard:hover{border-color:var(--navy)}
.rcard .rnm{font-family:'Outfit';font-weight:700;color:var(--navy);font-size:13.5px;margin-bottom:4px}
.rcard .rleg{font-size:11.5px;color:var(--mut);display:flex;align-items:center;gap:6px}
.rcard .rleg i{width:8px;height:8px;border-radius:50%;display:inline-block}
.rcard .rleg2{font-size:11.5px;color:#3a4a5e;display:flex;align-items:center;gap:6px;margin-top:2px}
.rcard .rleg2 i{width:7px;height:7px;border-radius:50%;display:inline-block}
.rcard .rleg2 i.ondot{background:var(--green)}.rcard .rleg2 i.offdot{background:var(--amber)}
.rcard .rdur{display:inline-block;margin-top:6px;background:#eef2f7;color:var(--mut);font-size:10.5px;padding:2px 8px;border-radius:20px}
.rtags{margin-top:7px;display:flex;flex-wrap:wrap;gap:4px}
.rtag{font-size:9px;font-weight:800;letter-spacing:.03em;padding:2px 6px;border-radius:6px;border:1px solid var(--line-2);color:var(--mut);background:#fff}
.rtag.on{background:#EAF6E6;border-color:#bfe0b0;color:var(--green-d)}
.rtag.rtoggle{cursor:pointer;user-select:none}
.poolwrap{background:#fff;border:1px dashed var(--line-2);border-radius:13px;padding:12px 14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:8px;min-height:48px}
.rcard.cur{box-shadow:0 0 0 2px var(--green) inset}
.rcard .notedot{color:var(--amber);font-size:9px;vertical-align:middle}
.modwrap{position:fixed;inset:0;background:rgba(16,30,48,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:200;overflow:auto}
.modcard{background:#fff;border-radius:16px;max-width:680px;width:100%;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.modhd{display:flex;align-items:flex-start;gap:12px}.modhd>div:first-child{flex:1}
.chip{display:inline-block;font-size:12px;font-weight:600;padding:5px 12px;border-radius:20px;border:1px solid var(--line-2);color:var(--mut);background:#fff;cursor:pointer;margin:0 2px 4px 0}
.chip.on{background:var(--navy);border-color:var(--navy);color:#fff}
.zlabel{font-family:'Outfit';font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin:20px 0 10px;display:flex;align-items:center;gap:12px}
.zlabel::after{content:'';height:1px;background:var(--line-2);flex:1}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(20,45,72,.05);text-align:center}
.tile .n{font-family:'Outfit';font-size:30px;font-weight:800;color:var(--navy);line-height:1}
.tile .l{font-size:10.5px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:8px}
.tile.green .n{color:var(--green-d)}.tile.amber .n{color:var(--amber)}.tile.royal .n{color:var(--royal)}.tile.gray .n{color:#6B7C93}.tile.red .n{color:var(--red)}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 14px}
.bar h2{font-size:19px;color:var(--navy);margin-right:auto}
.bar input,.bar select,.bar button,.bar .btn{height:38px;box-sizing:border-box;font-size:13.5px;border-radius:9px;line-height:1}
input,select{font-family:inherit;font-size:13.5px;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--deep)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 15px;box-shadow:0 1px 2px rgba(20,45,72,.05);border-left:3px solid var(--navy)}
.card.b-Royal{border-left-color:#1E6FD0}.card.b-Celebrity{border-left-color:#0C8C8C}.card.b-Azamara{border-left-color:#7A5AA8}.card.b-NCL{border-left-color:#E0962B}
.cname{font-family:'Outfit';font-weight:700;font-size:15px;color:var(--navy)}
.csub{font-size:12px;color:var(--mut);margin-top:2px}
.statdot{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;margin-top:9px}
.statdot i{width:9px;height:9px;border-radius:50%;display:inline-block}
.vessel{font-size:13px;font-weight:600;color:var(--deep);margin-top:9px}
.cchips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.cchip{font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px}
.cchip.red{background:#fbe9e7;color:var(--red)}.cchip.amber{background:#fff5e6;color:var(--amber)}.cchip.ok{background:#eaf6e6;color:var(--green-d)}
.crew-card{position:relative;cursor:pointer}
.crew-card .tools{position:absolute;top:10px;right:10px;display:flex;gap:4px}
.crew-card .tools button{background:#f1f4f9;border:1px solid var(--line);border-radius:7px;width:26px;height:26px;cursor:pointer;font-size:13px;line-height:1;color:var(--navy);padding:0}
.crew-card .tools button:hover{background:#e4ebf5}
.crow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
.cdates{font-size:12px;color:var(--deep);margin-top:7px}
.pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;display:inline-block}
.pill.rank{background:#eef3f9;color:var(--navy)}
.pill.cnt{background:var(--navy);color:#fff}
.pill.next{background:#eaf6e6;color:var(--green-d)}
.pill.next.zero{background:#f1f4f9;color:var(--mut)}
.vchip{font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:#fff5e6;color:var(--amber);margin-left:5px}
.notedot{position:absolute;bottom:11px;right:12px;width:9px;height:9px;border-radius:50%;background:#f5b301;box-shadow:0 0 0 2px #fff;cursor:pointer}
.notelog{margin-top:12px;display:flex;flex-direction:column;gap:8px;max-height:300px;overflow:auto}
.noteitem{border-left:3px solid var(--royal);background:#f7f9fc;border-radius:0 8px 8px 0;padding:8px 11px}
.notemeta{font-size:11px;color:var(--mut);font-weight:600;display:flex;align-items:center}
.notedel{margin-left:auto;color:var(--mut);cursor:pointer;font-weight:700;padding:0 4px;border-radius:5px}
.notedel:hover{background:#fbe9e7;color:var(--red)}
.notetext{font-size:13px;color:var(--deep);margin-top:3px;white-space:pre-wrap}
.fbp{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:#f1f4f9;color:var(--mut);cursor:pointer;display:inline-block;margin:1px}
.fbp.on{background:#eaf6e6;color:var(--green-d)}
.fbp.pend{background:#fff5e6;color:var(--amber)}
.dzone{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px;margin-bottom:6px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(20,45,72,.05)}
.panel h3{font-family:'Outfit';font-size:12.5px;color:var(--navy);margin:0 0 10px;font-weight:700}
.panel.center{display:flex;flex-direction:column;align-items:center}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:12px;color:var(--deep)}
.legend i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:middle}
.muted{color:var(--mut);font-size:13px;padding:30px;text-align:center}
.ov{position:fixed;inset:0;background:rgba(20,45,72,.5);display:flex;align-items:center;justify-content:center;z-index:60;padding:20px}
.modal{background:#fff;border-radius:15px;width:560px;max-width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 70px rgba(20,45,72,.28)}
.mh{background:linear-gradient(180deg,#1F4268,#16314F);color:#fff;padding:15px 20px;font-family:'Outfit';font-weight:700;font-size:16px;display:flex;align-items:center;border-bottom:2px solid var(--green)}
.mh button{margin-left:auto;background:transparent;border:0;color:#cdd9e8;font-size:22px;cursor:pointer;line-height:1}
.mb{padding:20px}
.fg{margin-bottom:13px}.fg label{display:block;font-size:12px;font-weight:600;color:var(--mut);margin-bottom:5px;text-transform:uppercase;letter-spacing:.03em}
.fg input,.fg select,.fg textarea{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px}
.f2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.rng{display:flex;align-items:center;gap:10px}.rng input[type=range]{flex:1}.rng .v{font-family:'Outfit';font-weight:700;color:var(--navy);width:30px;text-align:center}
.ck{display:flex;align-items:center;gap:9px;padding:7px 0;font-size:13.5px}.ck input{width:17px;height:17px}
.scorebox{background:var(--bg);border-radius:11px;padding:14px;margin:8px 0}
.scorerow{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}.scorerow b{font-family:'Outfit'}
.bigpay{font-family:'Outfit';font-weight:800;font-size:30px;color:var(--green-d);text-align:center;margin:6px 0}.bigpay.zero{color:var(--red)}
.gateflag{background:#fbe9e7;color:var(--red);border-radius:8px;padding:8px 11px;font-size:12.5px;font-weight:600;margin-top:6px}
.mf{display:flex;gap:9px;justify-content:flex-end;margin-top:10px}
.sec{display:flex;align-items:center;font-family:'Outfit';font-weight:700;color:var(--navy);font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.sec .n{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--navy);color:#fff;font-size:11px;margin-right:8px;flex:none}
label.req::after{content:' *';color:var(--red);font-weight:700}
.fg input.bad{border-color:var(--red);background:#fdecea}
.ckgate{border-left:3px solid var(--amber);padding-left:10px;border-radius:0 8px 8px 0;margin:4px 0;transition:background .15s}
.ckgate.on{border-left-color:var(--red);background:#fbe9e7}
.scsec{position:relative;transition:opacity .15s,filter .15s}
.scsec.gated{opacity:.4;filter:grayscale(.4);pointer-events:none}
.gateban{display:none;background:#fbe9e7;color:var(--red);border:1px solid #f3c0b8;border-radius:9px;padding:9px 11px;font-size:12.5px;font-weight:600;margin-bottom:10px}
.scsec.gated .gateban{display:block;pointer-events:auto}
.resultbar{position:sticky;bottom:0;margin:18px -20px 0;padding:13px 20px;background:#fff;border-top:1px solid var(--line);box-shadow:0 -9px 24px -14px rgba(16,38,64,.32);display:flex;align-items:center;gap:12px;flex-wrap:wrap;z-index:5}
.resultbar #scoreOut{flex:1;display:flex;align-items:center;gap:12px;min-width:140px}
.rnums{display:flex;gap:13px;font-size:12px;color:var(--mut);flex-wrap:wrap;align-items:center}
.rnums b{font-family:'Outfit';color:var(--navy)}
.rpay{font-family:'Outfit';font-weight:800;font-size:25px;color:var(--green-d);margin-left:auto;white-space:nowrap}
.rpay.zero{color:var(--red)}
.gchip{background:#fbe9e7;color:var(--red);border-radius:7px;padding:2px 8px;font-weight:700;font-size:11px}
.rbtns{display:flex;gap:8px;flex:none}
.fbdot{display:inline-block;width:9px;height:9px;border-radius:50%;border:1px solid rgba(0,0,0,.08)}
.intcount{color:var(--mut);font-weight:600;text-transform:none;letter-spacing:0}
.intelcard{background:#fff;border:1px solid var(--line);border-left:3px solid var(--navy);border-radius:11px;padding:11px 13px;margin-bottom:9px;box-shadow:0 1px 4px rgba(20,45,72,.06)}
.intelhd{display:flex;align-items:flex-start;gap:8px;margin-bottom:7px}
.intelmeta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;flex:1;font-size:11.5px;color:var(--mut)}
.intelmeta .intdate{font-weight:600}
.intelmeta .intrep{font-weight:700;color:var(--navy)}
.intelmeta .intedited{font-style:italic;opacity:.7}
.intchip{background:var(--bg);border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:700;color:var(--mut);white-space:nowrap}
.intchip.src{background:#eef4ff;color:#1E6FD0;text-transform:capitalize}
.intchip.ctr{background:#eaf7ee;color:var(--green-d)}
.intelact{display:flex;gap:4px;flex:none}
.intelact button{background:transparent;border:1px solid var(--line);border-radius:7px;cursor:pointer;font-size:11px;font-weight:600;color:var(--mut);padding:3px 9px}
.intelact button:hover{background:var(--bg);color:var(--navy)}
.intelact button.del:hover{background:#fdecea;color:var(--red);border-color:#f3c0b8}
.inteltext{font-size:13px;color:var(--ink);line-height:1.55}
.inteledit{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;line-height:1.5}
.sbadge{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12px;padding:5px 12px;border-radius:20px;margin-bottom:10px}
.sbadge.on{background:#e8f6ed;color:var(--green-d)}
.sbadge.off{background:#fff1de;color:var(--amber)}
.sbadge.idle{background:#eef1f5;color:var(--mut)}
.modal.sc-off .mh{border-bottom-color:var(--amber)}
.modal.sc-on .mh{border-bottom-color:var(--green)}
.btn{padding:9px 15px;border:0;border-radius:9px;background:var(--navy);color:#fff;font-weight:600;cursor:pointer;font-family:'DM Sans';font-size:13.5px}
.btn.green{background:var(--green)}.btn.ghost{background:#fff;border:1px solid var(--line);color:var(--navy)}
.warn{background:#fdf7ec;border:1px solid #ecdfc2;color:var(--amber);border-radius:9px;padding:9px 11px;font-size:12.5px;margin-bottom:12px}
.brow{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;margin-bottom:7px;cursor:pointer}
.brow:hover{border-color:var(--navy)}
.tbl{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13.5px}
.tbl th{text-align:left;background:#F2F5FA;color:var(--navy);font-family:'Outfit';font-weight:700;padding:9px 12px;border-bottom:1px solid var(--line-2);cursor:pointer;user-select:none}
.tbl th[data-sort=asc]::after{content:' ▲';font-size:9px}.tbl th[data-sort=desc]::after{content:' ▼';font-size:9px}
.tbl td{padding:8px 12px;border-bottom:1px solid var(--line);color:var(--ink)}
.tbl tr:last-child td{border-bottom:0}
.setmenu.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.printhead{display:none;font-family:'Outfit';font-weight:800;color:var(--navy);font-size:17px;margin-bottom:12px}
@media print{header,.noprint{display:none!important}.wrap{padding:0}.printhead{display:block!important}body{background:#fff}.tile,.card,table{break-inside:avoid}}
.rchip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:5px 9px;margin:3px 4px 3px 0;font-size:12.5px;cursor:grab}
.rchip i{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.shipbody{min-height:34px;margin-top:6px}
.shipdrop{transition:outline .08s}
.tbl td:nth-child(n+2),.tbl th:nth-child(n+2){text-align:right}
.tbl td:first-child,.tbl th:first-child{text-align:left}
.hint{font-size:11.5px;color:var(--mut);margin-top:3px}

/* ===== 2026 refresh — toggle controls + modern surfaces (overrides) ===== */
/* Checkbox -> iOS-style toggle switch (the "toggle look for the clicks") */
input[type=checkbox]{appearance:none;-webkit-appearance:none;width:40px;height:23px;border-radius:23px;background:#cfd8e3;position:relative;cursor:pointer;transition:background .2s cubic-bezier(.4,0,.2,1);vertical-align:middle;flex:none;border:0;box-shadow:inset 0 1px 2px rgba(20,45,72,.12)}
input[type=checkbox]::after{content:'';position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(16,38,64,.3);transition:transform .2s cubic-bezier(.4,0,.2,1)}
input[type=checkbox]:checked{background:var(--green)}
input[type=checkbox]:checked::after{transform:translateX(17px)}
input[type=checkbox]:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.ck input,.bar input[type=checkbox]{width:40px;height:23px}
.ck{gap:11px;font-size:13.5px;color:var(--ink)}
/* Inputs / selects — softer, rounded, clear focus ring */
input,select,textarea{border:1px solid var(--line-2);border-radius:11px;transition:border-color .15s,box-shadow .15s;background:#fff}
input:not([type=checkbox]):focus,select:focus,textarea:focus{outline:0;border-color:var(--green);box-shadow:0 0 0 3px rgba(95,185,70,.18)}
select{appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--mut) 50%),linear-gradient(135deg,var(--mut) 50%,transparent 50%);background-position:calc(100% - 16px) 52%,calc(100% - 11px) 52%;background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:32px}
/* Buttons — pill, subtle depth + hover lift */
.btn{border-radius:11px;font-weight:700;letter-spacing:.005em;transition:transform .12s ease,box-shadow .15s ease,filter .15s ease;box-shadow:0 1px 2px rgba(16,38,64,.14)}
.btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px -4px rgba(16,38,64,.32)}
.btn:active{transform:translateY(0)}
.btn.green{box-shadow:0 1px 2px rgba(62,142,42,.3)}.btn.green:hover{box-shadow:0 8px 18px -5px rgba(62,142,42,.5)}
.btn.ghost{box-shadow:none}.btn.ghost:hover{background:#f6f9fc;box-shadow:0 4px 12px -4px rgba(16,38,64,.18)}
/* Modals — bigger radius, blurred backdrop, refined shadow + entrance */
.modwrap,.ov{background:rgba(16,30,48,.42);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
.modcard,.modal{border-radius:22px;box-shadow:0 30px 70px -15px rgba(16,38,64,.45);border:1px solid rgba(255,255,255,.7);animation:modin .22s cubic-bezier(.2,.7,.3,1)}
@keyframes modin{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
/* Cards / tiles / ship sections — softer shadow + hover lift */
.tile{border-radius:16px;border-color:var(--line);box-shadow:0 1px 3px rgba(20,45,72,.05);transition:transform .14s ease,box-shadow .14s ease}
.tile[data-rf],.tile[data-kind],.tile[data-go],.tile[data-fm]{cursor:pointer}
.tile[data-rf]:hover,.tile[data-kind]:hover,.tile[data-go]:hover,.tile[data-fm]:hover{transform:translateY(-2px);box-shadow:0 10px 24px -8px rgba(20,45,72,.22)}
.card{border-radius:15px;box-shadow:0 1px 3px rgba(20,45,72,.06);transition:transform .14s ease,box-shadow .14s ease}
.card[data-crew]:hover{transform:translateY(-2px);box-shadow:0 10px 24px -8px rgba(20,45,72,.2)}
.shipsec{border-radius:16px}
.pill{padding:3px 10px;font-weight:700}
.pill.rank{background:linear-gradient(180deg,#f0f5fb,#e7eef7);box-shadow:inset 0 0 0 1px rgba(27,58,92,.08)}
.rtag.rtoggle{transition:background .15s,border-color .15s,color .15s}
summary::-webkit-details-marker{color:var(--mut)}
details.ddwrap>summary{padding:6px 0}
/* Per-ship deployment history (schedule tabs): ours = light card, former/other = greyed dashed */
.histsec{padding:2px 14px 13px}.histsec.closed{display:none}
.histhd{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:0 0 8px;border-top:1px dashed var(--line-2);padding-top:9px}
.histgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:7px}
.hcard{border-radius:10px;padding:7px 10px;border:1px solid var(--line);background:#f7f9fc;transition:background .12s,transform .12s}
.hcard.ours{cursor:pointer}.hcard.ours:hover{background:#eef4fb;transform:translateY(-1px)}
.hcard.former{background:repeating-linear-gradient(135deg,#f3f4f7,#f3f4f7 8px,#eef0f4 8px,#eef0f4 16px);border-style:dashed;border-color:#d7dce5}
.hcard .hnm{font-size:11.5px;font-weight:700;color:var(--navy);display:flex;align-items:center;gap:6px;justify-content:space-between}
.hcard.former .hnm{color:#7c879a}
.hcard .hspan{color:var(--mut);font-size:10px;margin-top:2px}
.hcard .hdur{color:var(--navy);font-size:10.5px;font-weight:700;margin-top:3px}
.htag{font-size:8px;font-weight:800;letter-spacing:.05em;padding:1px 6px;border-radius:6px;text-transform:uppercase;flex:none}
.htag.ours{background:#eaf6e6;color:var(--green-d)}.htag.former{background:#e6e9ef;color:#8a93a3}
`;
