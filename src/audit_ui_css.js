// PRINTSHOP OPS AUDIT — the stylesheet (20 Oct 2026). The design system of the approved canvas
// (artifact 45Hsjnr7Vr6f1BPussctg3, Miguel: "1. yes"), as CSS variables so a phone in dark mode reads it too. One sheet for
// the whole app: the canvas names (.card, .chip, .btn, .eyebrow, .navy, .stats, .ck ...) mean one thing everywhere here.
// String.raw: no backtick or dollar-brace inside (scripts/verify_client_scripts.mjs reads the page this lands in).
export const AUDIT_CSS = String.raw`
:root{--bg:#F5F7FA;--card:#fff;--ink:#14243A;--ink2:#46566B;--txt:#2B3B50;--mut:#5B6A7D;--line:#E8EDF3;--lines:#EEF2F6;--line2:#D3DCE6;
--navy:#1B3A5C;--deep:#142D48;--nfg:#1B3A5C;--navybg:#E9EFF6;--green:#5FB946;--greenh:#56AB3F;--greend:#2F7A22;--greenbg:#EEF7EA;
--amber:#8A5A10;--amberm:#C98A1E;--amberbg:#FBF3E4;--red:#A33224;--redm:#B4382A;--redbg:#FCEDEA;--mbg:#EEF1F5;--mfg:#4F5E71;--quiet:#EEF2F6;
--soft:#F9FAFC;--dim:#9AA8B8;--sh:0 8px 24px rgba(20,45,72,.05);--fh:'Outfit',Helvetica,Arial,sans-serif;--ff:'DM Sans',Helvetica,Arial,sans-serif;
--fm:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0D1828;--card:#14233A;--ink:#E9EEF5;--ink2:#B6C2D2;--txt:#D3DCE8;--mut:#8C9AAE;
--line:#24344A;--lines:#1E2E44;--line2:#2F4259;--navy:#2B5A8C;--nfg:#9CC0E8;--navybg:#1C2F47;--greend:#7CCB66;--greenbg:#16301F;--amber:#E2AE5A;
--amberbg:#352812;--red:#F08A7C;--redbg:#3A1C18;--mbg:#1E2E44;--mfg:#A9B6C6;--quiet:#1E2E44;--soft:#182841;--dim:#5E6E82;--sh:none;color-scheme:dark}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--ff);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--nfg);text-decoration:none}
h1,h2,h3,p{margin:0}
button{font:inherit;color:inherit}
svg{flex:none}
.ic{width:20px;height:20px;flex:none}
.h{font-family:var(--fh)}
.h1{font-family:var(--fh);font-size:38px;line-height:1.12;font-weight:600;letter-spacing:-.5px;text-wrap:balance}
.h2{font-family:var(--fh);font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-.3px}
.h3{font-family:var(--fh);font-size:19px;line-height:1.3;font-weight:600;letter-spacing:-.1px}
.h4{font-family:var(--fh);font-size:16.5px;line-height:1.35;font-weight:600}
.lead{font-size:16.5px;line-height:1.55;color:var(--ink2);max-width:64ch;text-wrap:pretty}
.txt{font-size:14.5px;line-height:1.55;color:var(--txt);text-wrap:pretty}
.sm{font-size:13.5px;line-height:1.45;color:var(--mut)}
.xs{font-size:12.5px;line-height:1.4;color:var(--mut)}
.b{font-weight:600;color:var(--ink)}
.tnum{font-variant-numeric:tabular-nums}
.mono{font-family:var(--fm);font-size:12.5px}
.wrap{max-width:1120px;margin:0 auto;padding:40px 24px 72px;display:flex;flex-direction:column;gap:40px}
.sec{display:flex;flex-direction:column;gap:16px;min-width:0}
.sec.tight{gap:10px}
.sec-hd{display:flex;align-items:baseline;justify-content:space-between;gap:6px 16px;flex-wrap:wrap}
.split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:28px;align-items:start}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.hstack{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
/* the app bar: the mark and the name, who is signed in, History and Follow-ups */
.appbar{position:sticky;top:0;z-index:6;background:var(--card);border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top)}
.appbar-in{max-width:1120px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:10px}
.brand{display:flex;align-items:center;gap:12px;min-height:44px;color:var(--ink);min-width:0;margin-right:auto}
.brand>svg{width:36px;height:36px;border-radius:8px}
.brand b{font-family:var(--fh);font-size:19px;font-weight:600;letter-spacing:-.2px;white-space:nowrap}
.who{font-size:13.5px;color:var(--mut);white-space:nowrap;margin-right:6px}
.ib{position:relative;width:44px;height:44px;border-radius:12px;background:var(--quiet);color:var(--nfg);display:flex;align-items:center;justify-content:center;flex:none;border:0;cursor:pointer}
.ib.on{background:var(--navy);color:#fff}
.ib .bdg{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:var(--amberm);color:#fff;font-size:11.5px;font-weight:700;line-height:20px;text-align:center;box-shadow:0 0 0 2px var(--card)}
/* the blocks */
.card{background:var(--card);border-radius:18px;border:1px solid var(--line);box-shadow:var(--sh);min-width:0}
.clip{overflow:hidden}
.pad{padding:28px}
.pad-m{padding:22px 24px}
.soft{background:var(--soft)}
.line-t{border-top:1px solid var(--lines)}
.eyebrow{display:inline-flex;align-items:center;align-self:flex-start;gap:6px;background:var(--greenbg);color:var(--greend);font-size:13px;font-weight:600;line-height:18px;padding:4px 10px;border-radius:6px;white-space:nowrap}
.chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;font-size:12.5px;font-weight:600;line-height:1;white-space:nowrap;flex:none}
.chip .ic{width:14px;height:14px}
.chip.a{background:var(--amberbg);color:var(--amber)}.chip.r{background:var(--redbg);color:var(--red)}.chip.g{background:var(--greenbg);color:var(--greend)}
.chip.n{background:var(--navybg);color:var(--nfg)}.chip.m{background:var(--mbg);color:var(--mfg)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}
.dot.a{background:var(--amberm)}.dot.r{background:var(--redm)}.dot.g{background:var(--green)}.dot.m{background:#B8C4D2}.dot.n{background:var(--navy)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 20px;border-radius:12px;border:0;font-family:var(--ff);font-size:15px;font-weight:700;line-height:1;cursor:pointer;white-space:nowrap;text-decoration:none;transition:transform .12s}
.btn:active{transform:scale(.98)}
.btn .ic{width:18px;height:18px}
.btn.pri{background:var(--navy);color:#fff}.btn.pri:hover{background:var(--deep)}
.btn.green{background:var(--green);color:#142D48}.btn.green:hover{background:var(--greenh)}
.btn.ghost{background:var(--card);color:var(--nfg);box-shadow:inset 0 0 0 1.5px var(--line2)}
.btn.quiet{background:var(--quiet);color:var(--nfg)}
.btn.white{background:rgba(255,255,255,.08);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)}
.btn.redtxt{background:transparent;color:var(--red);padding:0 10px}
.btn.off,.btn:disabled,.btn[disabled]{background:var(--quiet);color:var(--mfg);box-shadow:none;cursor:default;transform:none}
.btn.s{height:40px;padding:0 14px;font-size:14px;border-radius:10px}
.cta{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.arrow{display:inline-flex;align-items:center;align-self:flex-start;gap:8px;font-weight:600;color:var(--nfg);min-height:36px;background:none;border:0;padding:0;cursor:pointer}
.arrow .ic{width:18px;height:18px}
.ul{display:inline-flex;align-items:center;align-self:flex-start;min-height:32px;font-weight:600;color:var(--nfg);text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1.5px;background:none;border:0;padding:0;cursor:pointer}
.fold{width:40px;height:40px;border-radius:10px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;flex:none;border:0;cursor:pointer}
.fold .ic{width:16px;height:16px;transition:transform .15s}
.fold.shut .ic{transform:rotate(-90deg)}
.fold.off{background:var(--quiet);color:var(--dim);cursor:default}
.pills{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pill{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--line2);background:var(--card);font-weight:600;font-size:14px;color:var(--ink2);cursor:pointer;white-space:nowrap;flex:none}
.pill.on{background:var(--navy);border-color:var(--navy);color:#fff}
.ck{display:flex;align-items:flex-start;gap:12px;font-size:14.5px;line-height:22px;min-width:0}
.ck>.c,.ck>.x,.ck>.w,.ck>.o{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}
.ck>span>.ic{width:12px;height:12px}
.ck>.c{background:var(--green);color:#142D48}.ck>.x{background:var(--redm);color:#fff}.ck>.w{background:var(--amberm);color:#fff}
.ck>.o{box-shadow:inset 0 0 0 2px var(--line2)}.ck>.o.on{box-shadow:inset 0 0 0 2px var(--green)}
.ck.cur{font-weight:600}.ck.todo{color:var(--mut)}
.prog{height:6px;border-radius:6px;background:var(--line);overflow:hidden}
.prog.thin{height:4px}
.prog>i{display:block;height:100%;border-radius:6px;background:var(--green);transition:width .5s cubic-bezier(.16,1,.3,1)}
.navy{position:relative;overflow:hidden;isolation:isolate;background:#142D48;border-radius:20px;color:#fff;padding:32px}
.navy::before{content:"";position:absolute;z-index:-1;right:-40px;top:-40px;width:320px;height:320px;background-image:radial-gradient(rgba(255,255,255,.16) 1.3px,transparent 1.8px);background-size:16px 16px;-webkit-mask-image:radial-gradient(closest-side,#000 25%,transparent);mask-image:radial-gradient(closest-side,#000 25%,transparent)}
.navy .eyebrow{background:rgba(95,185,70,.2);color:#A9E294}
.navy .sm,.navy .lead,.navy .xs{color:#C9D6E5}
.navy .arrow,.navy .h1,.navy .h2,.navy .h3,.navy .h4,.navy .b{color:#fff}
.navy .ck>.o{box-shadow:inset 0 0 0 2px rgba(255,255,255,.3)}.navy .ck>.o.on{box-shadow:inset 0 0 0 2px var(--green)}.navy .ck.todo{color:#9FB2C8}
.fi{width:48px;height:48px;border-radius:14px;background:var(--card);border:1px solid var(--line);box-shadow:5px -5px 0 0 #DCEFD3;color:var(--nfg);display:flex;align-items:center;justify-content:center;flex:none;margin:5px 5px 0 0}
.fi .ic{width:22px;height:22px}
.fi.n{box-shadow:5px -5px 0 0 #D8E2EE}.fi.a{box-shadow:5px -5px 0 0 #F3E1BF}.fi.r{box-shadow:5px -5px 0 0 #F4D3CD}
.fi.s{width:40px;height:40px;border-radius:12px}.fi.s .ic{width:20px;height:20px}
.stats{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 32px rgba(20,45,72,.07);overflow:hidden}
.stats>div{padding:20px 22px;display:flex;flex-direction:column;gap:2px;min-width:0;border-left:1px solid var(--lines)}
.stats>div:first-child{border-left:0}
.stats .v{font-family:var(--fh);font-size:26px;font-weight:600;line-height:1.2;letter-spacing:-.2px;white-space:nowrap}
.stats .k{font-size:13.5px;line-height:1.4;color:var(--mut)}
.help{display:flex;align-items:center;gap:16px 20px;padding:20px 24px;background:var(--card);border:1px solid var(--line);border-radius:18px;flex-wrap:wrap}
.help .t{flex:1 1 200px;min-width:0;display:flex;flex-direction:column;gap:2px}
.kv{display:grid;grid-template-columns:120px minmax(0,1fr);gap:4px 16px;padding:12px 0;border-top:1px solid var(--lines);font-size:14.5px;line-height:1.45}
.kv:first-child{border-top:0;padding-top:0}
.kv>span:first-child{color:var(--mut)}
.foot{font-size:12.5px;line-height:1.5;color:var(--mut)}
.err{display:flex;gap:10px;align-items:flex-start;padding:14px 16px;background:var(--redbg);color:var(--red);border-radius:14px;font-size:14px;font-weight:500}
.err .ic{width:18px;height:18px;margin-top:2px}
.retry{margin-left:auto;flex:none;border:0;background:none;color:inherit;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:0 0 0 6px;white-space:nowrap}
.kept{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--mut)}.kept .ic{width:16px;height:16px;flex:none}
.kept.bad{color:var(--red)}
.offl{max-width:1120px;margin:16px auto 0;padding:0 24px}.offl[hidden]{display:none}
.offl div{display:flex;gap:8px;align-items:center;background:var(--amberbg);color:var(--amber);font-weight:600;font-size:13.5px;padding:10px 14px;border-radius:12px}
.empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:28px 16px;text-align:center;color:var(--mut);font-size:14px}
.empty .ic{width:28px;height:28px;color:var(--line2)}
.sk{height:72px;border-top:1px solid var(--lines);background:linear-gradient(90deg,var(--card),var(--bg),var(--card));background-size:200% 100%;animation:sk 1.2s infinite}
.sk:first-child{border-top:0}
@keyframes sk{to{background-position:-200% 0}}
.toast{position:fixed;left:50%;bottom:calc(110px + env(safe-area-inset-bottom));transform:translate(-50%,20px);z-index:9;max-width:calc(100% - 32px);background:var(--deep);color:#fff;padding:12px 16px;border-radius:14px;font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.toast.on{opacity:1;transform:translate(-50%,0)}
.dock{display:none}
.only-m,.m-inl{display:none}
/* the landing: who the audit is for, then the customer, then its ships by what is due */
.search{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;height:54px;padding:0 6px 0 16px;color:var(--mut);box-shadow:var(--sh)}
.search input{border:0;outline:0;flex:1;font:inherit;font-size:16px;color:var(--ink);background:transparent;min-width:0;height:100%}
.search input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;display:none}
.search:focus-within{box-shadow:0 0 0 2px var(--green),var(--sh)}
.search .clr{width:44px;height:44px;border:0;border-radius:10px;background:none;color:var(--mut);display:flex;align-items:center;justify-content:center;cursor:pointer}
.search .clr[hidden]{display:none}
.tiles{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:14px}
.tile{display:flex;flex-direction:column;gap:6px;text-align:left;padding:22px;border:0;border-radius:16px;background:var(--quiet);cursor:pointer;min-height:148px;min-width:0;color:var(--ink)}
.tile:hover{background:var(--mbg)}
.tile.on{background:var(--card);box-shadow:0 0 0 2px var(--navy),0 8px 24px rgba(20,45,72,.08)}
.tile-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.tile-name{font-family:var(--fh);font-size:21px;font-weight:600;line-height:26px;letter-spacing:-.2px}
.tile-alert{font-size:14px;font-weight:600;line-height:1.4;margin-top:auto}
.tile-alert.a{color:var(--amber)}.tile-alert.g{color:var(--greend)}.tile-alert.n{color:var(--nfg)}
.inprog{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:24px 40px;align-items:center}
.steps{display:flex;flex-direction:column;gap:14px;padding:20px 22px;border-radius:14px;background:rgba(255,255,255,.06)}
.ipl{display:flex;flex-direction:column}
.ipr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;align-items:center;padding:14px 0;border-top:1px solid rgba(255,255,255,.12);color:#fff}
.ipr:first-child{border-top:0;padding-top:0}
.ipr .chip{justify-self:end}
.grp-hd{display:flex;align-items:center;gap:14px;padding:16px 20px}
.grp-hd>div{flex:1;min-width:0}
.frow{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) 172px;gap:18px;align-items:center;width:100%;padding:14px 20px;border:0;border-top:1px solid var(--lines);background:none;text-align:left;color:var(--ink);cursor:pointer;font:inherit}
.frow:hover{background:var(--soft)}
.frow.off{cursor:default}.frow.off:hover{background:none}
.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mid{min-width:0}
.mid-t{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}
.end{display:flex;align-items:center;gap:10px;justify-content:flex-end}
.chev{color:var(--dim);display:flex}.chev .ic{width:18px;height:18px}
.more{display:flex;align-items:center;gap:8px;width:100%;min-height:52px;padding:0 20px;border:0;border-top:1px solid var(--lines);background:none;font-weight:600;color:var(--nfg);text-align:left;cursor:pointer}
.more .ic{width:16px;height:16px}
/* the briefing: whose contract, where the request stands, the contract, what others said */
.picks{display:flex;flex-direction:column;gap:10px;margin-top:4px}
.pick{display:flex;align-items:center;gap:14px;width:100%;min-height:76px;padding:14px 18px;border:1px solid var(--line2);border-radius:16px;background:var(--card);text-align:left;cursor:pointer;color:var(--ink);font:inherit}
.pick.on{border-color:var(--navy);box-shadow:0 0 0 1px var(--navy),0 8px 24px rgba(20,45,72,.07);cursor:default}
.radio{width:22px;height:22px;border-radius:50%;box-shadow:inset 0 0 0 2px #B8C4D2;display:flex;align-items:center;justify-content:center;flex:none}
.pick.on .radio{box-shadow:inset 0 0 0 2px var(--navy)}
.radio i{width:10px;height:10px;border-radius:50%}
.pick.on .radio i{background:var(--navy)}
.pk-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.relay{display:grid;grid-template-columns:200px minmax(0,1fr) 200px;gap:24px;align-items:center}
.rl-end{display:flex;flex-direction:column;gap:2px;min-width:0}
.rl-end.r{text-align:right;align-items:flex-end}
.rl-d{display:flex;justify-content:space-between;gap:8px;margin-top:8px}
.slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.slot{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px 16px;background:var(--card);border:1px solid var(--line);border-radius:14px;min-width:0}
.feed{display:grid;grid-template-columns:120px minmax(0,1fr);gap:18px;padding:22px 24px}
.fd-date{display:flex;flex-direction:column;gap:2px}
.rd>summary{list-style:none;cursor:pointer}.rd>summary::-webkit-details-marker{display:none}
.rd[open]>summary .o1,.rd:not([open])>summary .o2{display:none}
.rd .full{display:flex;flex-direction:column;gap:8px;margin-top:10px;padding:14px 16px;border-radius:12px;background:var(--soft);font-size:14px;line-height:1.55;color:var(--txt)}
.rd .full .also{font-weight:600;color:var(--ink);padding-top:8px;border-top:1px solid var(--lines)}
.feat{display:flex;flex-direction:column;gap:10px;padding:24px}
.feat>.fi+*{margin-top:6px}
.tbl{width:100%;border-collapse:collapse;font-size:14px;line-height:1.45}
.tbl th{text-align:left;font-weight:600;font-size:12.5px;color:var(--mut);padding:12px 16px;border-bottom:1px solid var(--line);white-space:nowrap}
.tbl td{padding:14px 16px;border-bottom:1px solid var(--lines);vertical-align:top}
.tbl tr:last-child td{border-bottom:0}
.tbl td:first-child,.tbl th:first-child{padding-left:24px}
.tbl td:last-child,.tbl th:last-child{padding-right:24px}
.tbl td.n,.tbl th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ck.bad{color:var(--red);font-weight:600}.ck>.o.red{box-shadow:inset 0 0 0 2px var(--redm)}
.navy .ck.bad{color:#F2A99D}.navy .ck>.o.red{box-shadow:inset 0 0 0 2px #F2A99D}
/* the ask and the request */
.who-card{display:flex;align-items:center;gap:14px;padding:16px 18px;background:var(--card);border:1px solid var(--line);border-radius:16px;margin-top:4px}
.send{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;padding:16px 24px;align-items:start}
.send .fi{width:44px;height:44px;border-radius:13px}
.press-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 24px}
.press-row .fi{margin:4px 4px 0 0;box-shadow:4px -4px 0 0 #D8E2EE}
.alert{display:flex;gap:12px;align-items:flex-start;padding:16px 18px;border-radius:14px;background:var(--redbg);color:var(--red)}
.alert .sm{color:var(--red)}
.finding{display:flex;flex-direction:column;gap:6px;padding:16px 18px;border-radius:14px;background:var(--amberbg);border:1px solid #F3E7CF}
.finding.ok{background:var(--greenbg);border-color:#E1EFDA}
.minis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:6px}
.minis>div{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:12px;background:var(--bg)}
/* the audit on board: the step rail, the step, the documents beside it */
.visit{display:grid;grid-template-columns:236px minmax(0,1fr) 280px;gap:24px;align-items:start}
.rail{display:flex;flex-direction:column;padding:10px;position:sticky;top:88px}
.rail-hd{display:flex;flex-direction:column;gap:2px;padding:10px 12px 14px;border-bottom:1px solid var(--lines);margin-bottom:6px}
.rs{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:6px 10px;border:0;border-radius:10px;background:none;text-align:left;cursor:pointer;font-size:14.5px;color:var(--ink2)}
.rs:hover{background:var(--bg)}
.rs .rn{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;font-family:var(--fh);font-weight:600;font-size:13px;box-shadow:inset 0 0 0 1.5px var(--line2);color:var(--mut)}
.rs .rn .ic{width:12px;height:12px}
.rs.done .rn{background:var(--green);box-shadow:none;color:#142D48}
.rs.cur{background:var(--quiet);color:var(--ink);font-weight:600}
.rs.cur .rn{background:var(--navy);box-shadow:none;color:#fff}
.stage{gap:20px}
.side{position:sticky;top:88px;gap:14px}
.grp{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 20px 10px;font-size:12.5px;font-weight:600;color:var(--mut);letter-spacing:.2px}
.grp em{font-style:normal;white-space:nowrap}.grp em.bad{color:var(--red)}
.tap{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:14px;align-items:center;width:100%;min-height:56px;padding:10px 20px;border:0;border-top:1px solid var(--lines);background:none;text-align:left;cursor:pointer;color:var(--ink);font:inherit}
.card>.tap:first-child{border-top:0}
.tap:hover{background:var(--soft)}
.tap .tl{display:flex;flex-direction:column;gap:1px;min-width:0;font-size:14.5px;line-height:1.4}
.tap .tl b{font-weight:500}
.tap.bad{background:var(--redbg)}
.tap.bad .tl b{font-weight:600}
.tk{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}
.tk .ic{width:12px;height:12px}
.tk.c{background:var(--green);color:#142D48}.tk.x{background:var(--redm);color:#fff}.tk.o{box-shadow:inset 0 0 0 2px var(--line2)}.tk.w{background:var(--amberm);color:#fff}
.pill-s{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.pill-s.ok{color:var(--greend)}.pill-s.r{background:var(--redbg);color:var(--red)}.pill-s.m{background:var(--mbg);color:var(--mfg)}.pill-s.a{background:var(--amberbg);color:var(--amber)}
.tap.bad .pill-s.r{background:var(--card)}
.info{display:flex;flex-direction:column;gap:2px;padding:12px 20px 14px}
.info>summary{list-style:none;cursor:pointer}.info>summary::-webkit-details-marker{display:none}
.measure{display:flex;align-items:center;gap:16px}
.iline{display:grid;grid-template-columns:minmax(0,1fr) auto 88px;gap:14px;align-items:center;padding:12px 20px}
.iline .d{font-family:var(--fh);font-weight:600;font-size:15px;min-width:32px;text-align:right;color:var(--amber);font-variant-numeric:tabular-nums}
.iline .d.z{color:var(--greend)}
.qty{display:flex;align-items:center;height:48px;border:1px solid var(--line2);border-radius:12px;background:var(--card);padding:0 12px}
.qty.on{border-color:var(--amberm);background:var(--amberbg)}
.qty:focus-within{box-shadow:0 0 0 2px var(--green)}
.qty input::placeholder{color:var(--dim);font-weight:500}
.qty input{border:0;outline:0;width:100%;min-width:0;font-family:var(--fh);font-size:18px;font-weight:600;text-align:center;color:var(--ink);background:transparent}
.scale{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.scale.six{grid-template-columns:repeat(6,minmax(0,1fr))}
.sc{height:48px;border:1px solid var(--line2);border-radius:12px;background:var(--card);font-family:var(--fh);font-weight:600;font-size:17px;color:var(--ink);cursor:pointer}
.sc.on{background:var(--navy);border-color:var(--navy);color:#fff}
.sc.on.lo{background:var(--redm);border-color:var(--redm)}
.sc.blank{font-family:var(--ff);font-size:13.5px}
.wrapit{flex-wrap:wrap;margin:0;padding:0;overflow:visible}
.lbl{display:flex;flex-direction:column;gap:6px}
.ta,.fld{font:inherit;font-size:15px;line-height:1.5;color:var(--ink);border:1px solid var(--line2);border-radius:12px;background:var(--card);width:100%}
.ta{padding:10px 12px;resize:vertical;min-height:68px}
.fld{height:48px;padding:0 12px}
.ta:focus,.fld:focus{outline:0;box-shadow:0 0 0 2px var(--green);border-color:transparent}
.why{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;font-weight:600;color:var(--red)}.why .ic{width:16px;height:16px;margin-top:2px}
.score{display:flex;align-items:center;gap:20px}
.ring{width:88px;height:88px;border-radius:50%;box-shadow:inset 0 0 0 3px var(--green);background:rgba(95,185,70,.12);display:flex;align-items:baseline;justify-content:center;padding-top:24px;flex:none}
.ring b{font-size:32px;line-height:1;font-weight:600}
.ring .of{font-size:16px;color:#C9D6E5;margin-left:1px}
.rv{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 20px}
.rv:first-child{border-top:0}
.wl{display:flex;gap:12px;align-items:flex-start}.wl .tk{margin-top:0}
.navrow{display:flex;align-items:center;gap:12px;padding-top:4px}
.mhd{flex-direction:column;gap:10px;padding:14px 16px;background:var(--card);border:1px solid var(--line);border-radius:16px}
.mhd-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.bars{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px}
.bars i{display:block;height:4px;border-radius:4px;background:var(--line)}
.bars i.done{background:var(--green)}.bars i.cur{background:var(--navy)}
.phs{display:flex;flex-wrap:wrap;gap:8px;padding:0 20px 14px}
.th{display:block;width:76px;height:76px;border-radius:12px;background:var(--quiet) center/cover no-repeat}
.th.q{opacity:.65;outline:2px dashed var(--amberm);outline-offset:-2px}
.vh{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none}
/* History: every filed audit read together */
.vr{width:1px;height:24px;background:var(--line2);margin:0 4px;flex:none}
.rates{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:28px 48px;align-items:center}
.rate{display:grid;grid-template-columns:110px minmax(0,1fr) 40px;gap:14px;align-items:center;min-height:36px;font-size:14.5px}
.rate b{text-align:right}
.track{height:10px;border-radius:6px;background:var(--quiet);overflow:hidden;display:flex}
.track i{display:block;height:100%}
.legend{display:flex;gap:6px 16px;flex-wrap:wrap;margin-top:4px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px}
.kb{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr);gap:16px;padding:16px 24px;align-items:center}
.kb-c{justify-content:flex-end;gap:6px}
.before{display:flex;gap:12px 14px;align-items:flex-start;flex-wrap:wrap}
.before .txt{flex:1 1 420px}
.fln{display:flex;justify-content:space-between;gap:12px;font-size:14px;line-height:1.4;padding:9px 0;border-top:1px solid var(--lines)}
.fln b{font-family:var(--fh);font-weight:600;white-space:nowrap}
.rs4{display:inline-flex;gap:4px}
.rsq{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:var(--quiet);font-family:var(--fh);font-weight:600;font-size:14px}
.rsq.lo{background:var(--redbg);color:var(--red)}.rsq.na{color:var(--mut);background:var(--bg)}
.audits tbody tr{cursor:pointer}.audits tbody tr:hover{background:var(--soft)}
.audits td.go{width:36px;vertical-align:middle}
.band{display:flex;flex-wrap:wrap;gap:18px 32px;align-items:center}
/* Follow-ups */
.item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px 24px;padding:20px 24px;border-top:1px solid var(--lines);align-items:center}
.item:first-child{border-top:0}
.acts{display:flex;flex-direction:column;gap:6px;align-items:flex-end;justify-content:center}
.acts .arrow{min-height:32px}
.ftl{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--mut);flex-wrap:wrap;margin-top:2px}
.ftl .d{width:9px;height:9px;border-radius:50%;background:var(--line2);flex:none}
.ftl .d.on{background:var(--navy)}.ftl .d.bad{background:var(--redm)}
.ftl .ln{width:24px;height:2px;background:var(--line);flex:none}
.ftl .tp{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.how4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.how{display:flex;flex-direction:column;gap:10px;padding:22px;border-left:1px solid var(--lines)}
.how:first-child{border-left:0}
.how .n{width:36px;height:36px;border-radius:10px;background:var(--green);color:#142D48;font-family:var(--fh);font-weight:700;display:flex;align-items:center;justify-content:center}
/* One audit, as filed */
.hero{align-items:stretch}
.links{display:flex;flex-direction:column;padding-top:6px;margin-top:4px}
.ring.big{width:96px;height:96px;padding-top:28px}.ring.big b{font-size:34px}
.ring.lo{box-shadow:inset 0 0 0 3px #E59B8F;background:rgba(229,155,143,.16)}
.fourr{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.fourr>div{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 6px;border-radius:12px;background:rgba(255,255,255,.07);text-align:center}
.fourr b{font-size:22px;line-height:1.2;font-weight:600}
.fourr span{font-size:12.5px;color:#C9D6E5}
.line-w{border-top:1px solid rgba(255,255,255,.12);padding-top:12px}
.qgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.q{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:12px;background:var(--card);border:1px solid var(--lines);min-width:0}
.sbody .q{background:var(--bg);border:0}
.shd{display:flex;align-items:center;gap:14px;padding:18px 24px;border-bottom:1px solid var(--lines)}
.shd-t{flex:1;min-width:0}
.num{width:36px;height:36px;border-radius:10px;background:var(--navybg);color:var(--nfg);font-family:var(--fh);font-weight:600;font-size:16px;display:flex;align-items:center;justify-content:center;flex:none}
.sbody{padding:18px 24px 22px;display:flex;flex-direction:column;gap:14px}
.press{border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.rrow{display:flex;gap:14px;align-items:flex-start}
.r5{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;font-family:var(--fh);font-weight:600;font-size:16px;background:var(--quiet);flex:none}
.r5.lo{background:var(--redbg);color:var(--red)}.r5.na{color:var(--mut);background:var(--bg)}
.fu{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:10px 16px;align-items:start;padding-top:12px}
.fu>.chip{justify-self:start}.fu:first-child{padding-top:0}.fu-t{min-width:0}.fu .arrow{min-height:26px}
.photos{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.ph{aspect-ratio:4 / 3;border-radius:12px;background:var(--quiet) center/cover no-repeat;display:flex;align-items:flex-end;padding:10px;font-size:12.5px;font-weight:600;color:#fff}
.ph span{background:rgba(20,45,72,.6);padding:2px 8px;border-radius:6px}
.goes{display:grid;grid-template-columns:minmax(0,1.2fr) repeat(3,minmax(0,1fr));gap:18px 28px;align-items:start}
@media (max-width:1100px){.visit{grid-template-columns:220px minmax(0,1fr)}.side{display:none !important}}
@media (max-width:1000px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.qgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.photos{grid-template-columns:repeat(3,minmax(0,1fr))}.goes{grid-template-columns:repeat(2,minmax(0,1fr))}.how4{grid-template-columns:repeat(2,minmax(0,1fr))}.how:nth-child(3){border-left:0}.how:nth-child(n+3){border-top:1px solid var(--lines)}}
@media (max-width:760px){
.wrap{padding:24px 16px calc(112px + env(safe-area-inset-bottom));gap:28px}
.appbar-in{padding:10px 16px}
.brand{gap:10px}.brand b{font-size:17px}.brand>svg{width:32px;height:32px}
.who{display:none}
.h1{font-size:28px;line-height:1.16;letter-spacing:-.3px}
.h2{font-size:21px;line-height:1.25}
.h3{font-size:17.5px}
.lead{font-size:15.5px}
.split,.grid3,.grid2{grid-template-columns:minmax(0,1fr);gap:16px}
.card{border-radius:16px}
.pad{padding:20px}.pad-m{padding:18px}
.navy{padding:22px;border-radius:18px}
.navy::before{width:200px;height:200px;right:-50px;top:-50px}
.cta .btn{flex:1 1 100%}
.stats{grid-template-columns:repeat(2,minmax(0,1fr));border-radius:16px}
.stats>div{padding:16px}.stats>div:nth-child(odd){border-left:0}.stats>div:nth-child(n+3){border-top:1px solid var(--lines)}
.stats>div:last-child:nth-child(odd){grid-column:1 / -1}
.stats .v{font-size:21px;white-space:normal}.stats .k{font-size:13px}
.pills{flex-wrap:nowrap;overflow-x:auto;margin:0 -16px;padding:2px 16px;scrollbar-width:none}
.pills::-webkit-scrollbar{display:none}
.help{padding:18px}
.fold{width:44px;height:44px}
.arrow,.ul{min-height:44px}
.pill{height:44px}
.btn.s{height:44px}
.kv{grid-template-columns:minmax(0,1fr);gap:2px}
.hide-m{display:none !important}
.only-m{display:flex}
.m-inl{display:inline}
.dock{display:flex;gap:10px;position:fixed;left:0;right:0;bottom:0;z-index:5;padding:12px 16px calc(16px + env(safe-area-inset-bottom));background:var(--card);border-top:1px solid var(--line);box-shadow:0 -8px 24px rgba(20,45,72,.06);flex-wrap:wrap}
.dock .btn{flex:1 1 0;min-width:0}
.dock .note{flex:1 1 100%;font-size:13px;color:var(--mut);text-align:center}
.offl{padding:0 16px}
.search{height:52px}
.tiles{gap:10px}.tiles.odd{grid-template-columns:minmax(0,1fr)}
.tile{padding:16px;min-height:0;gap:4px;border-radius:14px}
.tile-top{flex-direction:column;gap:6px;margin-bottom:4px}
.tile-name{font-size:17px;line-height:22px}
.tile .sm,.tile-alert{font-size:13px}
.inprog{grid-template-columns:minmax(0,1fr);gap:20px}
.steps{padding:18px}
.grp-hd{padding:14px 16px;gap:12px}
.frow{grid-template-columns:minmax(0,1fr);gap:10px;padding:14px 16px}
.frow .end{display:none}
.frow .ell{white-space:normal}
.more{padding:0 16px}
.pick{padding:14px;gap:12px;align-items:flex-start}
.relay{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.rl-mid{grid-column:1 / -1;order:-1}
.slots{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.slot{padding:12px 14px}
.feed{grid-template-columns:minmax(0,1fr);gap:8px;padding:18px}
.fd-date{flex-direction:row;align-items:baseline;gap:6px}
.feat{padding:20px}
.feat.rowm{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:16px;row-gap:4px;align-items:start}
.feat.rowm>.fi{grid-row:1 / span 4}
.feat.rowm>*:not(.fi){grid-column:2}
.feat.rowm>.fi+*{margin-top:4px}
.tbl.cards thead{display:none}
.tbl.cards,.tbl.cards tbody,.tbl.cards tr,.tbl.cards td{display:block}
.tbl.cards tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;padding:16px 18px;border-bottom:1px solid var(--lines)}
.tbl.cards tr:last-child{border-bottom:0}
.tbl.cards td{padding:0;border:0;min-width:0}
.tbl.cards td.n{text-align:left}
.tbl.cards td[data-l]::before{content:attr(data-l);display:block;font-size:12px;font-weight:600;line-height:1.4;color:var(--mut);margin-bottom:2px}
.tbl.cards td.full{grid-column:1 / -1}
.who-card{padding:14px}
.send{padding:16px 18px;gap:14px}
.press-row{padding:14px 18px}
.minis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.visit{grid-template-columns:minmax(0,1fr)}
.stage{gap:16px}
.grp{padding:12px 16px 8px}
.tap{padding:10px 16px;gap:12px}
.iline{padding:12px 16px;grid-template-columns:minmax(0,1fr) auto 76px;gap:10px}
.info{padding:12px 16px 14px}
.rv{padding:14px 16px}
.phs{padding:0 16px 14px}
.scale{gap:6px}
.sc.blank{font-size:12.5px}
.measure{gap:14px}
.score{gap:16px}
.vr{display:none}
.rates{grid-template-columns:minmax(0,1fr);gap:24px}
.rates>.sec:last-child{order:-1}
.rate{grid-template-columns:88px minmax(0,1fr) 34px;gap:10px}
.kb{grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;padding:14px 18px}
.kb>.sm{grid-column:1;order:2}
.kb-c{grid-row:1 / span 2;grid-column:2;flex-direction:column;align-items:flex-end}
.before{padding:16px 18px}
.band .btn{flex:1 1 100%}
.audits tr{grid-template-columns:minmax(0,1fr) auto;gap:12px 16px}
.audits td.f-date,.audits td.f-crew{display:none}
.audits td.f-ship{grid-column:1;grid-row:1}
.audits td.f-score{grid-column:2;grid-row:1;justify-self:end}
.audits td.f-rates{grid-column:1;grid-row:2}
.audits td.f-fu{grid-column:2;grid-row:2;justify-self:end;text-align:right}
.audits td.f-miss{grid-column:1 / -1;grid-row:3}
.item{grid-template-columns:minmax(0,1fr);padding:18px}
.acts{flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap}
.acts .arrow{min-height:44px}
.how4{grid-template-columns:minmax(0,1fr)}
.how{border-left:0;border-top:1px solid var(--lines);padding:18px;flex-direction:row;align-items:flex-start;flex-wrap:wrap;gap:6px 14px}
.how:first-child{border-top:0}
.how b{flex:1 1 180px;align-self:center}
.how .sm{flex:1 1 100%}
.qgrid{grid-template-columns:minmax(0,1fr);gap:8px}
.shd{padding:16px 18px;flex-wrap:wrap;gap:10px 12px}
.shd-t{flex:1 1 calc(100% - 52px)}
.shd .chip{margin-left:50px}
.fu{grid-template-columns:minmax(0,1fr);gap:6px}.fu .arrow{min-height:44px}
.sbody{padding:16px 18px 18px}
.photos{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.goes{grid-template-columns:minmax(0,1fr);gap:14px}
.fourr{gap:6px}.fourr>div{padding:10px 4px}
.ring.big{width:80px;height:80px;padding-top:22px}.ring.big b{font-size:28px}
}
@media (prefers-reduced-motion:reduce){.sk{animation:none}.prog>i,.btn,.fold .ic,.toast{transition:none}}
`;
