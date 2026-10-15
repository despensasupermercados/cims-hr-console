// PRINTSHOP AUDIT — Dexter's page, v2 (14 Oct 2026; Miguel: "the idea behind is ok, but the UI and UX is horrible ..
// design it better"). Phone first (Dexter's iPhone 17, Safari, Add to Home Screen); the web is the same column.
// The same design language as the seafarer's upload page (src/audit_upload_ui.js): a deep navy header that says where
// you are, white cards on a grey page, Phosphor icons (src/audit_icons.js, generated, never hand-drawn), status said in
// sentence case with an icon and a colour, a progress bar wherever there is a "N of M", one primary button at the
// bottom. Screens: Ships (open requests first) -> who -> the briefing -> the request -> waiting / everything is in.
// String.raw keeps the client script's backslashes literal; nothing in it may use a backtick or a dollar-brace —
// scripts/verify_client_scripts.mjs parses this script on every build and test run.
import { ICONS } from "./audit_icons.js";

export const AUDIT_MANIFEST = (onAuditHost) => JSON.stringify({
  name: "CIMS Printshop Audit", short_name: "Audit", start_url: onAuditHost ? "/" : "/audit", scope: onAuditHost ? "/" : "/audit",
  display: "standalone", background_color: "#EEF1F6", theme_color: "#1B3A5C",
  icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
});

// The shell opens without signal (a ship's Wi-Fi drops); the API is never cached — a stale crew list is worse than
// none. Drafts kept offline arrive with the audit steps (PR D).
export const AUDIT_SW = String.raw`
const C = "cims-audit-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/auth/") || u.pathname === "/login") return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then((res) => { if (res.ok && !res.redirected) { const cp = res.clone(); caches.open(C).then((c) => c.put("shell", cp)); } return res; }).catch(() => caches.open(C).then((c) => c.match("shell")).then((m) => m || new Response("Offline. Open the app again when the ship has signal.", { headers: { "Content-Type": "text/plain" } }))));
  }
});
`;

export const AUDIT_HTML = String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Printshop Audit</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#142D48">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Audit">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/favicon.ico">
<link rel="manifest" id="mf" href="/audit/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{--nfg:#1B3A5C;--fill:#2F7A22;--navy:#1B3A5C;--deep:#142D48;--green:#5FB946;--green-d:#2F7A22;--greenbg:#EEF7EA;--red:#B4382A;--redbg:#FCEDEA;--amber:#9A6412;--amberbg:#FBF3E4;--navybg:#E9EFF6;
--ink:#14243A;--ink2:#46566B;--mut:#5B6A7D;--line:#E6EBF1;--line2:#D3DCE6;--bg:#F2F5F9;--card:#FFFFFF;--fh:'Outfit',Helvetica,Arial,sans-serif;--ff:'DM Sans',Helvetica,Arial,sans-serif;--fm:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--r:16px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#E9EEF5;--ink2:#B6C2D2;--mut:#8C9AAE;--line:#24344A;--line2:#2F4259;--bg:#0D1828;--card:#14233A;--greenbg:#16301F;--redbg:#3A1C18;--amberbg:#352812;--navybg:#1C2F47;--green-d:#7CCB66;--red:#F08A7C;--amber:#E2AE5A;--navy:#2B5A8C;--nfg:#9CC0E8;color-scheme:dark}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--ff);font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit}
.ic{width:1.15em;height:1.15em;flex:none;vertical-align:-.18em}
.top{position:sticky;top:0;z-index:6;background:var(--deep);color:#fff;padding:calc(10px + env(safe-area-inset-top)) 16px 12px}
.top .in{max-width:640px;margin:0 auto;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;min-height:40px}
.bk{width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.1);display:grid;place-items:center;border:0;color:#fff;cursor:pointer;transition:transform .12s}
.bk:active{transform:scale(.95)}.bk .ic{width:20px;height:20px}
.bk[hidden]{display:none}
.brand{font-family:var(--fh);font-weight:700;font-size:13px;letter-spacing:4px;opacity:.9}
.tt{font-family:var(--fh);font-weight:600;font-size:17px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts{font-size:12.5px;color:#B9C6D6;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tk{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;background:rgba(255,255,255,.1);padding:6px 11px;border-radius:999px;white-space:nowrap}
.tk:empty{display:none}.tk.late{background:#B4382A}.tk.done{background:var(--fill)}
.hero{background:var(--deep);color:#fff;padding:4px 16px 22px}
.hero .in{max-width:640px;margin:0 auto}
.hero h1{font-family:var(--fh);font-weight:600;font-size:30px;letter-spacing:-.4px;margin:0;line-height:1.1}
.hero.home{padding-top:calc(18px + env(safe-area-inset-top))}
.ttl{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.logo{width:40px;height:40px;border-radius:11px;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.12)}
.top.gone{display:none}
.hero .who{color:#B9C6D6;font-size:14px}
.sbox{position:relative;margin-top:16px}
.sbox .ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--mut)}
.search{width:100%;min-height:48px;border:0;border-radius:12px;padding:0 46px 0 42px;font-size:16px;background:#fff;color:#14243A;font-family:var(--ff)}
.search:focus{outline:2px solid var(--green);outline-offset:1px}
main{max-width:640px;margin:0 auto;padding:18px 16px 130px;display:flex;flex-direction:column;gap:14px}
.offl{max-width:640px;margin:12px auto 0;padding:0 16px}.offl div{display:flex;gap:8px;align-items:center;background:var(--amberbg);color:var(--amber);font-weight:600;font-size:13px;padding:10px 14px;border-radius:12px}
.offl[hidden]{display:none}
.chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px 2px}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;min-height:40px;padding:0 14px;border-radius:999px;border:0;background:var(--card);box-shadow:inset 0 0 0 1px var(--line2);color:var(--ink2);font-size:13.5px;font-weight:600;cursor:pointer}
.chip.on{background:var(--navy);color:#fff;box-shadow:none}
.sh{display:flex;justify-content:space-between;align-items:baseline;margin:8px 2px -4px;font-family:var(--fh);font-weight:600;font-size:16px}
.sh span{font-family:var(--ff);font-weight:500;font-size:13px;color:var(--mut)}
.card{background:var(--card);border-radius:var(--r);box-shadow:0 1px 2px rgba(20,36,58,.05),0 0 0 1px var(--line);overflow:hidden}
.pad{padding:16px}
.ch{display:flex;align-items:center;gap:10px;padding:14px 16px 4px;font-family:var(--fh);font-weight:600;font-size:15px}
.ch .ic{width:20px;height:20px;color:var(--nfg)}
.ch .r{margin-left:auto;font-family:var(--ff);font-weight:500;font-size:13px;color:var(--mut)}
.row{display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 16px;border:0;border-top:1px solid var(--line);width:100%;background:none;text-align:left;cursor:pointer;color:inherit;transition:background .15s}
.row:first-child,.ch+.row{border-top:0}
.row:active{background:var(--bg)}
.row.off{opacity:.5}
.sq{width:40px;height:40px;border-radius:12px;background:var(--bg);color:var(--ink2);display:grid;place-items:center;flex:none}.sq .ic{width:20px;height:20px}.sq.a{background:var(--amberbg);color:var(--amber)}
.stl{margin-top:8px}
.row .tx{flex:1;min-width:0}
.nm{font-family:var(--fh);font-weight:600;font-size:16px;line-height:1.25}
.sm{font-size:13px;color:var(--mut);margin-top:2px}
.sm .ic{width:14px;height:14px;margin-right:4px}
.go{color:var(--line2);width:20px;height:20px}
.st{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}
.st .ic{width:14px;height:14px}
.st.n{background:var(--navybg);color:var(--nfg)}.st.g{background:var(--greenbg);color:var(--green-d)}.st.r{background:var(--redbg);color:var(--red)}.st.a{background:var(--amberbg);color:var(--amber)}.st.m{background:var(--bg);color:var(--mut)}
.prog{margin-top:12px}
.prog .lb{display:flex;justify-content:space-between;font-size:12.5px;color:var(--mut);margin-bottom:6px}.prog .lb b{color:var(--ink);font-weight:600}
.track{height:6px;border-radius:99px;background:var(--line);overflow:hidden}.track i{display:block;height:100%;background:var(--green);border-radius:99px;transition:width .5s cubic-bezier(.16,1,.3,1)}
.track.navy i{background:var(--navy)}.track.late i{background:var(--red)}
.hero .track{background:rgba(255,255,255,.14)}.hero .prog .lb{color:#B9C6D6}.hero .prog .lb b{color:#fff}
.bars{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px}
.ends{display:flex;justify-content:space-between;font-size:12px;color:var(--mut);margin-top:6px}
.facts{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line)}
.facts div{padding:12px 8px;text-align:center}.facts div+div{border-left:1px solid var(--line)}
.facts b{display:block;font-family:var(--fh);font-weight:600;font-size:16px}.facts span{font-size:12px;color:var(--mut)}
.need{display:flex;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid var(--line)}
.ch+.need{border-top:0}
.need .ib{width:40px;height:40px;border-radius:12px;background:var(--navybg);color:var(--nfg);display:grid;place-items:center;flex:none}
.need .ib .ic{width:20px;height:20px}
.need .tx{flex:1;min-width:0}.need .t{font-weight:600;font-size:14.5px}.need .s{font-size:12.5px;color:var(--mut)}
.need .q{font-family:var(--fh);font-weight:600;font-size:20px;min-width:34px;text-align:right}
.foot{display:flex;gap:8px;align-items:flex-start;padding:12px 16px;background:var(--bg);font-size:13px;color:var(--ink2)}
.foot .ic{width:16px;height:16px;margin-top:2px;color:var(--nfg)}
.kv{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:12px 16px;border-top:1px solid var(--line);font-size:14px}
.ch+.kv,.kv:first-child{border-top:0}
.kv .k{color:var(--mut);flex:none}.kv .v{text-align:right;font-weight:600;min-width:0;overflow-wrap:anywhere}.kv .v .sm{font-weight:400}
.mono,.kv .v.mono{font-family:var(--fm);font-size:12.5px;color:var(--mut);font-weight:400}
.ban{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:13.5px;font-weight:500}
.ban .ic{width:18px;height:18px;margin-top:1px}
.ban.a{background:var(--amberbg);color:var(--amber)}.ban.r{background:var(--redbg);color:var(--red)}.ban.g{background:var(--greenbg);color:var(--green-d)}.ban.n{background:var(--navybg);color:var(--nfg)}
.big{display:flex;gap:14px;align-items:center}
.big .ib{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;flex:none}
.big .ib .ic{width:28px;height:28px}
.big .ib.n{background:var(--navybg);color:var(--nfg)}.big .ib.g{background:var(--greenbg);color:var(--green-d)}.big .ib.r{background:var(--redbg);color:var(--red)}.big .ib.m{background:var(--bg);color:var(--mut)}
.big h2,h2.who{margin:0;font-family:var(--fh);font-weight:600;font-size:20px;line-height:1.2}
.mach{padding:14px 16px;border-top:1px solid var(--line)}
.ch+.mach{border-top:0}
.mh{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.mh b{font-family:var(--fh);font-weight:600;font-size:15.5px}
.docs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.doc{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:var(--bg);font-size:13px;min-width:0}
.doc .ic{width:18px;height:18px}
.doc .tx{min-width:0}.doc .t{font-weight:600;font-size:13px;line-height:1.2}.doc .s{font-size:12px;color:var(--mut)}
.doc.ok{background:var(--greenbg)}.doc.ok .ic{color:var(--green-d)}.doc.ok .s{color:var(--green-d)}
.doc.bad{background:var(--redbg)}.doc.bad .ic,.doc.bad .s{color:var(--red)}
.doc.wait .ic{color:var(--nfg)}.doc.none .ic{color:var(--mut)}
.fix{margin-top:8px;font-size:13px;color:var(--red);display:flex;gap:8px}.fix .ic{width:16px;height:16px;margin-top:2px}
.dwn{margin-top:10px;display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:12px;background:var(--amberbg);color:var(--amber);font-size:13.5px}
.dwn .ic{width:18px;height:18px;margin-top:1px}
.miss{padding:10px 16px 10px 46px;border-top:1px solid var(--line);font-size:14px}
.ch+.miss{border-top:0}
.fold>summary{list-style:none;cursor:pointer}.fold>summary::-webkit-details-marker{display:none}
.fold .go{transition:transform .2s}.fold[open] .go{transform:rotate(90deg)}
.feed{padding:12px 16px;border-top:1px solid var(--line);font-size:14px}
.feed .w{font-size:12px;color:var(--mut);font-weight:600;margin-bottom:3px}
.feed .pl{font-size:15px;line-height:1.45}
.rt{padding:14px 16px;border-top:1px solid var(--line)}.rt:first-of-type{border-top:0}
.rt .t{font-family:var(--fh);font-weight:600;font-size:15px}.rt .s{font-size:13px;color:var(--mut);margin-top:2px}
.rate{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px}
.rate button{min-height:44px;border:0;border-radius:12px;background:var(--bg);box-shadow:inset 0 0 0 1px var(--line2);font-family:var(--fh);font-weight:600;font-size:16px;color:var(--ink2);cursor:pointer}
.rate button.on{background:var(--navy);color:#fff;box-shadow:none}.rate button.on.lo{background:#B4382A}
.gnote{width:100%;min-height:96px;border:0;border-radius:12px;padding:12px 14px;font:inherit;font-size:15px;background:var(--bg);box-shadow:inset 0 0 0 1px var(--line2);color:var(--ink);resize:vertical}
.gnote.err{box-shadow:inset 0 0 0 2px var(--red)}
.gsum{display:flex;align-items:center;gap:12px}.gsum .ib{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;flex:none}.gsum .ib .ic{width:26px;height:26px}
.gsum .ib.n{background:var(--navybg);color:var(--nfg)}.gsum .ib.g{background:var(--greenbg);color:var(--green-d)}.gsum .ib.r{background:var(--redbg);color:var(--red)}.gsum .n{font-family:var(--fh);font-weight:700;font-size:34px;line-height:1}.gsum .n small{font-size:16px;color:var(--mut);font-weight:600}
.gline{display:flex;justify-content:space-between;gap:12px;padding:10px 16px;border-top:1px solid var(--line);font-size:14px}.gline b{font-family:var(--fh)}
.full{margin-top:6px}.full>summary{display:inline-flex;align-items:center;min-height:40px;padding-right:12px;font-size:13px;font-weight:600;color:var(--nfg);cursor:pointer}
.full>div p.also{margin:12px 0 4px;padding-top:10px;border-top:1px solid var(--line);font-weight:600;color:var(--fg)}
.full>div{font-size:13px;line-height:1.5;color:var(--mut);padding-top:2px}.full>div p{margin:0 0 6px}.full>div b{color:var(--fg);font-weight:600}
.sbox .clr{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:40px;height:40px;padding:0;border:0;background:none;color:var(--mut);display:flex;align-items:center;justify-content:center;border-radius:10px;cursor:pointer}
.sbox .clr[hidden]{display:none}.sbox .clr .ic{position:static;transform:none;width:18px;height:18px}
.empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 16px;text-align:center;color:var(--mut);font-size:14px}
.empty .ic{width:28px;height:28px;color:var(--line2)}
.dock{position:fixed;left:0;right:0;bottom:0;z-index:5;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--card);box-shadow:0 -1px 0 var(--line),0 -8px 24px rgba(20,36,58,.06)}
.dock .in{max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
.dock .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 18px;border-radius:14px;border:0;background:var(--navy);color:#fff;font-family:var(--fh);font-weight:600;font-size:16px;cursor:pointer;width:100%;transition:transform .12s,opacity .2s}
.btn:active{transform:scale(.98)}.btn .ic{width:20px;height:20px}
.btn.green{background:var(--fill)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line2);min-height:46px;font-size:15px}
.btn.txt{background:none;color:var(--red);min-height:44px;font-size:14px;font-family:var(--ff);font-weight:600}
.btn[disabled]{opacity:.45;cursor:default;transform:none}
.note{font-size:12.5px;color:var(--mut);text-align:center}
.err{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;background:var(--redbg);color:var(--red);border-radius:14px;font-size:13.5px;font-weight:500}
.err .ic{width:18px;height:18px;margin-top:1px}
.sk{height:64px;border-top:1px solid var(--line);background:linear-gradient(90deg,var(--card),var(--bg),var(--card));background-size:200% 100%;animation:sk 1.2s infinite}
.sk:first-child{border-top:0}
@keyframes sk{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.sk{animation:none}.track i,.btn,.row,.bk{transition:none}}
</style>
</head><body>
<header class="top"><div class="in"><button class="bk" id="bk" hidden aria-label="Back"></button><div style="min-width:0"><div class="tt" id="tt"><span class="brand">CIMS</span></div><div class="ts" id="ts"></div></div><span class="tk" id="tk"></span></div></header>
<div id="heroslot"></div>
<div class="offl" id="offl" hidden><div>No signal. What you see was loaded earlier.</div></div>
<main id="main"><div class="card"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div></main>
<div id="dockslot"></div>
<script>window.__IC=` + JSON.stringify(ICONS) + String.raw`;</script>
<script>
(function () {
  "use strict";
  var S = { me: null, today: null, ships: null, brand: "All", q: "", brief: {} };
  var IC = window.__IC || {};
  var $ = function (id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ic(n, cls) { return (IC[n] || "").replace("<svg ", '<svg class="ic' + (cls ? " " + cls : "") + '" '); }
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtD(d, withYear) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); if (p.length < 3) return esc(d); var s = MON[Number(p[1]) - 1] + " " + Number(p[2]); return withYear || p[0] !== String(S.today || "").slice(0, 4) ? s + ", " + p[0] : s; }
  function todayLong() { var t = S.today ? new Date(S.today + "T12:00:00") : new Date(); return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][t.getDay()] + ", " + MON[t.getMonth()] + " " + t.getDate(); }
  function nameOf(email) { var e = String(email || "").split("@")[0].split("."); return e.map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""; }).join(" "); }
  function first(n) { return String(n || "").split(" ")[0]; }
  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
  function pct(a, b) { return b > 0 ? Math.max(0, Math.min(100, Math.round(a * 100 / b))) : 0; }
  function whenUtc(v) { var d = new Date(v); if (isNaN(d)) return ""; return MON[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) + " UTC"; }
  function left(v) { var ms = Date.parse(v) - Date.now(); if (isNaN(ms)) return ""; if (ms <= 0) return "past due"; var h = Math.floor(ms / 3600000); return h >= 1 ? h + " h left" : Math.max(1, Math.round(ms / 60000)) + " min left"; }

  function top(t, s, k, kcls, back) {
    document.querySelector(".top").classList.toggle("gone", !t);
    $("tt").textContent = t || "";
    $("ts").textContent = s || ""; $("ts").hidden = !s;
    var tk = $("tk"); tk.className = "tk" + (kcls ? " " + kcls : ""); tk.innerHTML = k || "";
    $("bk").hidden = !back;
  }
  function hero(html, cls) { $("heroslot").innerHTML = html ? '<section class="hero' + (cls ? " " + cls : "") + '"><div class="in">' + html + "</div></section>" : ""; }
  function dock(html) { $("dockslot").innerHTML = html ? '<div class="dock"><div class="in">' + html + "</div></div>" : ""; }
  function skel(n) { var h = '<div class="card">'; for (var i = 0; i < (n || 3); i++) h += '<div class="sk"></div>'; return h + "</div>"; }
  function prog(label, a, b, cls) { return '<div class="prog"><div class="lb"><span>' + label + "</span><b>" + a + " of " + b + '</b></div><div class="track' + (cls ? " " + cls : "") + '"><i style="width:' + pct(a, b) + '%"></i></div></div>'; }

  function api(u) {
    return fetch(u, { credentials: "same-origin", cache: "no-store" }).then(function (r) {
      if (r.status === 401) { location.href = "/login"; throw new Error("signed out"); }
      return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status)); return j; });
    });
  }
  function post(u, body) {
    return fetch(u, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { if (r.status === 401) { location.href = "/login"; throw new Error("signed out"); } return r.json().then(function (j) { j._status = r.status; return j; }); });
  }
  var WHY = { no_ship_mailbox: "No printshop mailbox for this ship in the ship contacts.", hon_unavailable: "HON did not answer. The machines and the OBP list come from it; try again in a minute.",
    no_presses: "HON's register has no press for this ship.", already_open: "A request is already open for this crew.", not_sent: "The email did not go. Nothing was sent; try again.", crew_not_found: "This crew is not in the console." };
  function fail(e) { hero(""); $("main").innerHTML = '<div class="err">' + ic("warning-circle") + "<span>Could not load: " + esc(e && e.message || e) + ". Reopen to try again.</span></div>"; dock(""); }

  // One status word per request, said the same way on every screen.
  function reqStatus(r) {
    if (!r) return "";
    if (r.grade != null) return '<span class="st ' + (r.grade <= 3 ? "r" : "g") + '">' + ic("f:seal-check") + "Graded " + r.grade + "/5</span>";
    if (r.status === "complete") return '<span class="st g">' + ic("f:seal-check") + "Docs in</span>";
    if (r.status === "sent" && (r.overdue || (r.due && Date.parse(r.due) < Date.now()))) return '<span class="st r">' + ic("f:warning-circle") + "Overdue</span>";
    if (r.status === "sent") return '<span class="st n">' + ic("hourglass-medium") + "Waiting" + (r.due ? " · " + esc(left(r.due)) : "") + "</span>";
    if (r.status === "draft") return '<span class="st m">Draft</span>';
    return "";
  }

  /* ---------------- A1 · Ships ---------------- */
  function brandOf(s) { return s.brand === "Royal" ? "Royal Caribbean" : (s.brand || ""); }
  function shipRow(s, openReq) {
    var who = s.aboard.length ? ic("user") + s.aboard.map(function (c) { return esc(c.name); }).join(", ") : "Nobody aboard per the TDG file";
    /* one crew aboard: the row already names him, so it opens his briefing (Miguel, 15 Oct 2026) */
    var go = openReq && s.last ? ' data-go="q=' + esc(s.last.id) + '"' : ' data-ship="' + esc(s.ship) + '"' + (s.aboard.length === 1 ? ' data-sc="' + esc(s.aboard[0].sc) + '"' : "");
    return '<button class="row' + (s.aboard.length || openReq ? "" : " off") + '"' + go + '><div class="tx"><div class="nm">' + esc(s.ship) + '</div><div class="sm">' + (openReq && s.last ? ic("user") + esc(s.last.crew) : who) + "</div>" + (openReq ? '<div class="stl">' + reqStatus(s.last) + "</div>" : "") + "</div>" + ic("caret-right", "go") + "</button>";
  }
  function shipsView() {
    top("", "", "", "", false); dock("");
    hero('<div class="ttl"><img class="logo" src="/apple-touch-icon.png" alt="CIMS"><h1>Printshop audit</h1></div><div class="who">' + (S.me ? esc(nameOf(S.me)) + " · " : "") + esc(todayLong()) + '</div><div class="sbox">' + ic("magnifying-glass") + '<input class="search" id="q" type="search" placeholder="Search ship or crew" autocomplete="off" value="' + esc(S.q) + '"><button class="clr" id="qx" aria-label="Clear search"' + (S.q ? "" : " hidden") + ">" + ic("x") + '</button></div>', "home");
    var qi = $("q"), qx = $("qx");
    qi.addEventListener("input", function () { S.q = qi.value; qx.hidden = !S.q; shipsList(); });
    qx.addEventListener("click", function () { S.q = ""; qi.value = ""; qx.hidden = true; shipsList(); qi.focus(); });
    shipsList();
  }
  function shipsList() {
    if (!S.ships) { $("main").innerHTML = skel(4); return; }
    var brands = ["All", "Royal Caribbean", "Celebrity", "Azamara"];
    var q = S.q.toLowerCase().trim();
    var list = S.ships.filter(function (s) {
      if (S.brand !== "All" && brandOf(s) !== S.brand) return false;
      if (!q) return true;
      return (s.ship + " " + s.aboard.map(function (c) { return c.name; }).join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    var open = list.filter(function (s) { return s.last && (s.last.status === "sent" || s.last.status === "complete"); });
    var rest = list.slice().sort(function (a, b) { return (b.aboard.length > 0) - (a.aboard.length > 0) || a.ship.localeCompare(b.ship); });
    var h = '<div class="chips">' + brands.map(function (b) { return '<button class="chip' + (S.brand === b ? " on" : "") + '" data-brand="' + esc(b) + '">' + esc(b) + "</button>"; }).join("") + "</div>";
    if (open.length) {
      h += '<div class="sh">Open requests<span>' + open.length + "</span></div>";
      h += '<div class="card">' + open.map(function (s) { return shipRow(s, true); }).join("") + "</div>";
    }
    h += '<div class="sh">' + (open.length ? "All ships" : "Ships") + "<span>" + rest.length + "</span></div>";
    h += '<div class="card">';
    if (!rest.length) h += '<div class="empty">' + ic("boat") + "No ship matches " + (q ? "“" + esc(S.q) + "”" : "this filter") + ".</div>";
    h += rest.map(function (s) { return shipRow(s, false); }).join("");
    h += "</div>";
    $("main").innerHTML = h;
  }

  /* ---------------- Who ---------------- */
  function contractBar(c) {
    if (!c.signOn || !c.signOff) return "";
    var tot = Math.max(1, days(c.signOn, c.signOff)), d = Math.max(0, days(c.signOn, S.today));
    return '<div class="prog"><div class="track' + (d > tot ? " late" : "") + '"><i style="width:' + pct(d, tot) + '%"></i></div><div class="ends"><span>' + fmtD(c.signOn) + "</span><span>" + (c.heldByFile ? "past " : "") + fmtD(c.signOff) + "</span></div></div>";
  }
  function shipView(ship) {
    var s = (S.ships || []).filter(function (x) { return x.ship === ship; })[0];
    if (!s) { go(""); return; }
    if (s.aboard.length === 1) { location.replace("#b=" + encodeURIComponent(s.ship) + "|" + encodeURIComponent(s.aboard[0].sc)); return; }
    top(s.ship, brandOf(s), "", "", true); hero(""); dock("");
    var h = '<div class="sh">Who are you auditing?</div><div class="card">';
    if (!s.aboard.length) h += '<div class="empty">' + ic("user") + "The TDG file has nobody aboard " + esc(s.ship) + ".</div>";
    s.aboard.forEach(function (c) {
      var day = c.signOn ? Math.max(0, days(c.signOn, S.today)) : null;
      h += '<button class="row" data-sc="' + esc(c.sc) + '" data-ship="' + esc(s.ship) + '" style="align-items:flex-start"><div class="tx"><div class="nm">' + esc(c.name) + '</div><div class="sm">' + esc(c.contract) + (day != null ? " · day " + day : "") + "</div>" + contractBar(c) + "</div>" + ic("caret-right", "go") + "</button>";
    });
    $("main").innerHTML = h + "</div>";
  }

  /* ---------------- A2 · The briefing ---------------- */
  var KIND = { feedback: "Feedback", intel: "Field intel", review: "Shipboard review", note: "Note", comment: "Comment" };
  function needCard(fn, machines, lines) {
    var m = machines == null ? "" : machines;
    return '<div class="card"><div class="ch">' + ic("list-checks") + "What " + esc(fn) + ' sends before you arrive</div>' +
      '<div class="need"><span class="ib">' + ic("printer") + '</span><div class="tx"><div class="t">Pattern 43</div><div class="s">12 pages, one per machine</div></div><span class="q">' + m + "</span></div>" +
      '<div class="need"><span class="ib">' + ic("files") + '</span><div class="tx"><div class="t">Machine Management List</div><div class="s">The long report with the life %, one per machine</div></div><span class="q">' + m + "</span></div>" +
      '<div class="need"><span class="ib">' + ic("package") + '</span><div class="tx"><div class="t">Blind count</div><div class="s">Every OBP part, counted without seeing the system</div></div><span class="q">' + (lines == null ? "" : lines) + "</span></div>" +
      '<div class="foot">' + ic("lock-simple") + "<span>The audit opens only when all of it is in. 24 hours to upload.</span></div></div>";
  }
  /* the stored field-intel summary ("• Summary: … • What happened: …"), one labelled paragraph per bullet */
  function fullReport(t) {
    return String(t || "").split(/\s*•\s*/).filter(function (x) { return x.trim(); }).map(function (x) {
      var m = x.match(/^([A-Z][\w ]{2,30}):\s*([\s\S]*)$/);
      return "<p>" + (m ? "<b>" + esc(m[1]) + ".</b> " + esc(m[2]) : esc(x)) + "</p>";
    }).join("");
  }
  function briefView(ship, sc) {
    top(ship, "Loading the briefing", "", "", true); hero(""); dock("");
    $("main").innerHTML = skel(3);
    var key = ship + "|" + sc; S.view = key;
    var p = S.brief[key] ? Promise.resolve(S.brief[key]) : api("/api/audit/brief?ship=" + encodeURIComponent(ship) + "&sc=" + encodeURIComponent(sc));
    p.then(function (b) {
      S.brief[key] = b; if (!S.today) S.today = b.today;
      if (S.view !== key) return;
      var sh = (S.ships || []).filter(function (x) { return x.ship === ship; })[0];
      top(ship, sh && brandOf(sh) ? brandOf(sh) : "Briefing", "", "", true);
      var c = b.contract || {}, cur = c.current;
      var h = '<div class="card"><div class="pad"><h2 class="who">' + esc(b.crew.name) + '</h2>' + (b.crew.position ? '<div class="sm">' + esc(b.crew.position) + "</div>" : "");
      if (cur && cur.on && cur.off) {
        var late = cur.of && cur.day > cur.of;
        h += '<div class="prog"><div class="lb"><span>Contract</span><b>Day ' + esc(cur.day) + (cur.of ? " of " + esc(cur.of) : "") + '</b></div><div class="track' + (late ? " late" : "") + '"><i style="width:' + pct(cur.day, cur.of || cur.day) + '%"></i></div><div class="ends"><span>On ' + fmtD(cur.on) + "</span><span>" + (cur.held ? "Past sign-off, TDG has them aboard" : "Off " + fmtD(cur.off, true) + (cur.offSource === "projected" ? ", projected" : "")) + "</span></div></div>";
      }
      h += "</div>";
      var done = (String(c.label || "").match(/^(\d+)/) || [])[1]; if (done == null && /^ongoing/i.test(String(c.label || ""))) done = 0;
      h += '<div class="facts"><div><b>' + esc(done != null ? done : "?") + '</b><span>completed</span></div><div><b>' + (cur && cur.day != null ? esc(cur.day) : "?") + '</b><span>days aboard</span></div><div><b>' + (b.audits.length || "None") + "</b><span>past audits</span></div></div></div>";
      if (c.source) h += '<div class="note" style="text-align:left;margin:-6px 4px 0">Contracts: ' + esc(c.source).replace(/(\d{4}-\d{2}-\d{2})/g, function (d) { return fmtD(d, true); }) + "</div>";

      h += needCard(first(b.crew.name), b.machines, b.lines);

      if (b.audits.length) {
        h += '<div class="card"><div class="ch">' + ic("clipboard-text") + "Earlier audits</div>";
        b.audits.forEach(function (a) { h += '<button class="row" data-go="q=' + esc(a.id) + '"><div class="tx"><div class="nm" style="font-size:15px">' + esc(a.ship) + '</div><div class="sm">' + fmtD(a.at, true) + (a.test ? " · test" : "") + "</div></div>" + reqStatus(a) + ic("caret-right", "go") + "</button>"; });
        h += "</div>";
      }
      var feed = b.feed || [];
      h += '<details class="card fold"><summary class="row"><span class="sq">' + ic("chat-circle-text") + '</span><div class="tx"><div class="nm" style="font-size:15px">What others said</div><div class="sm">' + (feed.length ? feed.length + " on record · newest " + fmtD(feed[0].at, true) : "Nothing on record") + "</div></div>" + ic("caret-right", "go") + "</summary>";
      feed.forEach(function (f) {
        h += '<div class="feed"><div class="w">' + esc(KIND[f.kind] || f.kind) + (f.who ? " · " + esc(f.who) : "") + " · " + fmtD(f.at, true) + (f.rating != null ? " · " + esc(f.rating) + "/5" : "") + '</div><div class="pl">' + esc(f.text) + "</div>";
        var more = (f.others || []).map(function (o) { return '<p class="also">Also reported' + (o.who ? " by " + esc(o.who) : "") + " · " + fmtD(o.at, true) + "</p>" + fullReport(o.full); }).join("");
        if ((f.full && f.full.trim() !== String(f.text || "").trim()) || more) h += '<details class="full"><summary>Full report' + (f.others && f.others.length ? " · " + (f.others.length + 1) + " reports" : "") + "</summary><div>" + fullReport(f.full) + more + "</div></details>";
        h += "</div>";
      });
      h += "</details>";
      if (b.checks && b.checks.length) {
        h += '<details class="card fold"><summary class="row"><span class="sq a">' + ic("warning-circle") + '</span><div class="tx"><div class="nm" style="font-size:15px">To check on the crew record</div><div class="sm">' + b.checks.length + " open</div></div>" + ic("caret-right", "go") + "</summary>";
        b.checks.forEach(function (t) { h += '<div class="feed">' + esc(t) + "</div>"; });
        h += "</details>";
      }
      $("main").innerHTML = h;
      S.lastBrief = b;
      if (b.open) dock('<button class="btn" data-go="q=' + esc(b.open) + '">' + ic("hourglass-medium") + "Open the request</button>");
      else dock('<button class="btn green" data-go="r=' + esc(encodeURIComponent(ship)) + "|" + esc(encodeURIComponent(sc)) + '">' + ic("paper-plane-tilt") + "Request the documents</button>");
    }).catch(fail);
  }

  /* ---------------- A3 · The request ---------------- */
  function requestView(ship, sc) {
    top("Request documents", ship, "", "", true); hero(""); dock("");
    $("main").innerHTML = skel(4);
    var key = "r" + ship + "|" + sc; S.view = key;
    api("/api/audit/request/preview?ship=" + encodeURIComponent(ship) + "&sc=" + encodeURIComponent(sc)).then(function (p) {
      if (S.view !== key) return;
      if (p.open) { go("q=" + p.open.id); return; }
      top("Request documents", ship + " · " + p.crew.name, "", "", true);
      var n = p.machines ? p.machines.length : 0;
      var h = "";
      if (!p.live) h += '<div class="ban a">' + ic("f:warning-circle") + "<span>Test mode. The email goes to you only, marked TEST. Nothing reaches the ship until Miguel switches it live.</span></div>";
      if (!p.hon) h += '<div class="err">' + ic("warning-circle") + "<span>" + esc(WHY.hon_unavailable) + "</span></div>";
      h += needCard(first(p.crew.name), n, p.lines);
      if (n) h += '<div class="card"><div class="ch">' + ic("printer") + 'Machines<span class="r">from HON\'s register</span></div>' + p.machines.map(function (m) { return '<div class="kv"><span>' + esc(m.label) + (m.model ? ' <span class="sm">· ' + esc(m.model) + "</span>" : "") + '</span><span class="v mono">' + esc(m.serial) + "</span></div>"; }).join("") + "</div>";
      h += '<div class="card"><div class="ch">' + ic("envelope-simple") + "The email</div>";
      h += '<div class="kv"><span class="k">To</span><span class="v">' + (p.live ? (p.shown ? esc(p.shown) : '<span class="st r">No ship mailbox</span>') : "You, as a test") + (p.live && !p.noPersonal ? '<div class="sm">and a copy to the personal email</div>' : p.live ? '<div class="sm">no personal email on file</div>' : p.shown ? '<div class="sm">live, it goes to ' + esc(p.shown) + "</div>" : "") + "</span></div>";
      h += '<div class="kv"><span class="k">Copy</span><span class="v">' + (p.live ? "Rolando, Ray" : '<span class="sm">nobody in test mode</span>') + "</span></div>";
      h += '<div class="kv"><span class="k">Due</span><span class="v">' + esc(whenUtc(p.dueAt)) + '<div class="sm">24 hours from sending</div></span></div>';
      h += '<div class="kv"><span class="k">Inventory</span><span class="v">' + (p.lines == null ? "?" : esc(p.lines)) + ' parts<div class="sm">OBP list' + (p.obpAsOf ? " of " + fmtD(p.obpAsOf, true) : "") + ", on-hand hidden</div></span></div></div>";
      $("main").innerHTML = h;
      var can = p.hon && n > 0 && (p.shown || !p.live);
      dock('<button class="btn green" id="sendreq"' + (can ? "" : " disabled") + ">" + ic("paper-plane-tilt") + (p.live ? "Send request" : "Send test request to me") + "</button>" + (can || !p.hon ? "" : '<div class="note">' + esc(n === 0 ? WHY.no_presses : WHY.no_ship_mailbox) + "</div>"));
      var btn = $("sendreq");
      if (btn) btn.onclick = function () {
        btn.disabled = true; btn.innerHTML = ic("paper-plane-tilt") + "Sending";
        var contract = S.lastBrief && S.lastBrief.contract ? S.lastBrief.contract.label : null;
        post("/api/audit/request", { ship: ship, sc: sc, contract: contract }).then(function (r) {
          if (r.ok || r.error === "already_open") { S.brief = {}; reloadShips(); go("q=" + r.id); }
          else { btn.disabled = false; btn.innerHTML = ic("arrow-clockwise") + "Try again"; $("main").insertAdjacentHTML("afterbegin", '<div class="err">' + ic("warning-circle") + "<span>" + esc(WHY[r.error] || r.detail || r.error) + "</span></div>"); }
        }).catch(fail);
      };
    }).catch(fail);
  }

  /* ---------------- A6 / A8 · Waiting, then everything is in ---------------- */
  function docCell(s, label) {
    if (!s) return '<div class="doc none">' + ic("cloud-arrow-up") + '<div class="tx"><div class="t">' + label + '</div><div class="s">Not sent</div></div></div>';
    var st = s.read_state;
    if (st === "ok") return '<div class="doc ok">' + ic("f:check-circle") + '<div class="tx"><div class="t">' + label + '</div><div class="s">Read</div></div></div>';
    if (st === "wrong_doc" || st === "unreadable") return '<div class="doc bad">' + ic("f:warning-circle") + '<div class="tx"><div class="t">' + label + '</div><div class="s">' + (st === "wrong_doc" ? "Wrong document" : "Scan again") + "</div></div></div>";
    return '<div class="doc wait">' + ic("hourglass-medium") + '<div class="tx"><div class="t">' + label + '</div><div class="s">Reading</div></div></div>';
  }
  function machDone(m) { return !!m.down || (m.p43 && m.p43.read_state === "ok" && m.mgmt && m.mgmt.read_state === "ok"); }
  function requestDetail(id) {
    top("Request", "", "", "", true); hero(""); dock("");
    $("main").innerHTML = skel(4);
    var key = "q" + id; S.view = key;
    api("/api/audit/request?id=" + encodeURIComponent(id)).then(function (d) {
      if (S.view !== key) return;
      var done = d.status === "complete", sent = d.status === "sent", cancelled = d.status === "cancelled";
      var late = sent && (d.overdueAt || Date.parse(d.dueAt) < Date.now());
      top(d.ship, d.crew, d.grade ? ic("f:seal-check") + "Graded " + d.grade.score + "/5" : done ? ic("f:seal-check") + "Docs in" : late ? "Overdue" : sent ? ic("clock") + esc(left(d.dueAt)) : cancelled ? "Cancelled" : "", done ? "done" : late ? "late" : "", true);
      var md = d.machines.filter(machDone).length, mt = d.machines.length;
      var big = done ? ["g", "f:seal-check", "Everything is in", "Since " + whenUtc(d.completeAt) + ". The assessment went to " + (d.test ? "you (test)." : "Ray, Rolando, Ohji, Jonathan and Miguel.")]
        : cancelled ? ["m", "x", "Request cancelled", "The upload link is closed."]
        : late ? ["r", "f:warning-circle", "Past the deadline", "Was due " + whenUtc(d.dueAt) + ". Resend or give " + first(d.crew) + " 24 more hours."]
        : ["n", "hourglass-medium", "Waiting for " + first(d.crew), "Due " + whenUtc(d.dueAt) + " · sent to " + (d.test ? "you (test)" : d.to)];
      var h = "";
      if (d.test) h += '<div class="ban a">' + ic("f:warning-circle") + "<span>Test request. Every email went to you only.</span></div>";
      h += '<div class="card pad"><div class="big"><span class="ib ' + big[0] + '">' + ic(big[1]) + '</span><div style="min-width:0"><h2>' + esc(big[2]) + '</h2><div class="sm">' + esc(big[3]) + '</div></div></div><div class="bars">' + prog("Machines", md, mt, done ? "" : "navy") + prog("Count", d.count.done, d.count.total, done ? "" : "navy") + "</div></div>";
      var miss = (d.gate && d.gate.missing) || [];
      if (sent && miss.length) h += '<div class="card"><div class="ch">' + ic("list-checks") + 'Still missing<span class="r">' + miss.length + "</span></div>" + miss.map(function (x) { return '<div class="miss">' + esc(x.say) + "</div>"; }).join("") + "</div>";
      h += '<div class="card"><div class="ch">' + ic("printer") + 'Machines<span class="r">' + md + " of " + mt + " in</span></div>";
      d.machines.forEach(function (m) {
        h += '<div class="mach"><div class="mh"><b>' + esc(m.label) + '</b><span class="mono">' + esc(m.serial) + "</span></div>";
        if (m.down) h += '<div class="dwn">' + ic("wrench") + "<span><b>Reported down.</b> " + esc(m.down) + "</span></div>";
        else {
          h += '<div class="docs">' + docCell(m.p43, "Pattern 43") + docCell(m.mgmt, "Mgmt List") + "</div>";
          [m.p43, m.mgmt].forEach(function (s) { if (s && s.read_state !== "ok" && s.read_state !== "pending" && s.say) h += '<div class="fix">' + ic("warning-circle") + "<span>" + esc(s.say) + "</span></div>"; });
        }
        h += "</div>";
      });
      h += "</div>";
      h += '<div class="card"><div class="ch">' + ic("package") + 'Blind count<span class="r">' + d.count.done + " of " + d.count.total + '</span></div><div class="pad" style="padding-top:4px">' + '<div class="track' + (done ? "" : " navy") + '"><i style="width:' + pct(d.count.done, d.count.total) + '%"></i></div>' + (d.extras ? '<div class="sm" style="margin-top:8px">' + d.extras + (d.extras === 1 ? " item found that is" : " items found that are") + " not on the OBP list</div>" : "") + "</div></div>";
      if (d.grade) h = gradeCard(d.grade) + h;
      $("main").innerHTML = h;
      if (done && !d.grade) dock('<button class="btn green" data-go="g=' + esc(id) + '">' + ic("clipboard-text") + "Grade the audit</button>");
      else if (sent) {
        dock('<div class="two"><button class="btn ghost" id="rs">' + ic("arrow-clockwise") + 'Resend</button><button class="btn ghost" id="ex">' + ic("clock") + 'Add 24 h</button></div><button class="btn txt" id="cx">Cancel request</button>');
        var act = function (what, confirmText) { return function () { if (confirmText && !confirm(confirmText)) return; post("/api/audit/request/" + what, { id: id }).then(function (r) { if (!r.ok) alert(WHY[r.error] || r.error || "Not done"); reloadShips(); requestDetail(id); }); }; };
        $("rs").onclick = act("resend", "Send the request again? The old link stops working.");
        $("ex").onclick = act("extend");
        $("cx").onclick = act("cancel", "Cancel this request? The upload link closes.");
      }
    }).catch(fail);
  }
  /* ---------------- A5 · Dexter's grade (15 Oct 2026) ---------------- */
  var RATINGS = [["inventory", "Inventory", "OBP matches the shelf, par kept, parts life tracked"], ["technical", "Technical", "Machines, error codes, maintenance, test prints"], ["collaterals", "Customer collaterals", "Quality of what the ship prints for guests"], ["overall", "Overall", "Leave blank to use the average of the three above"]];
  function scoreOf(g) {
    var ok = function (v) { return v >= 1 && v <= 5 ? v : null; };
    if (ok(g.overall)) return { score: g.overall, from: "overall" };
    var p = [g.inventory, g.technical, g.collaterals].filter(ok);
    return p.length ? { score: Math.floor(p.reduce(function (a, b) { return a + b; }, 0) / p.length), from: "average" } : { score: null, from: null };
  }
  function gradeCard(g) {
    var h = '<div class="card"><div class="pad"><div class="gsum"><span class="ib ' + (g.score <= 3 ? "r" : "g") + '">' + ic("f:seal-check") + '</span><div><div class="n">' + esc(g.score) + "<small> / 5</small></div>" + '<div class="sm">Audit score · ' + (g.from === "overall" ? "Overall rating" : "average of the ratings, rounded down") + " · filed " + fmtD(g.at, true) + "</div></div></div></div>";
    RATINGS.forEach(function (r) { var v = g[r[0]]; h += '<div class="gline"><span>' + esc(r[1]) + "</span><b>" + (v ? esc(v) + " / 5" : "Not given") + "</b></div>"; });
    if (g.note) h += '<div class="feed"><div class="w">What needs to improve</div><div class="pl">' + esc(g.note) + "</div></div>";
    return h + "</div>";
  }
  function gradeView(id) {
    top("Grade the audit", "", "", "", true); hero(""); dock("");
    $("main").innerHTML = skel(4);
    var key = "g" + id; S.view = key;
    var G = { inventory: null, technical: null, collaterals: null, overall: null, note: "" };
    api("/api/audit/request?id=" + encodeURIComponent(id)).then(function (d) {
      if (S.view !== key) return;
      if (d.grade || d.status !== "complete") { go("q=" + id); return; }
      top(d.ship, d.crew, "", "", true);
      var h = '<div class="card">';
      RATINGS.forEach(function (r) {
        h += '<div class="rt"><div class="t">' + esc(r[1]) + (r[0] === "overall" ? ' <span class="sm">· optional</span>' : "") + '</div><div class="s">' + esc(r[2]) + '</div><div class="rate" data-k="' + r[0] + '">';
        for (var n = 1; n <= 5; n++) h += '<button type="button" data-v="' + n + '" aria-label="' + esc(r[1]) + " " + n + '">' + n + "</button>";
        h += "</div></div>";
      });
      h += "</div>";
      h += '<div class="card pad"><div class="t" style="font-family:var(--fh);font-weight:600">What needs to improve</div><div class="sm" id="nh" style="margin:2px 0 10px">Required when any rating is 3 or below.</div><textarea class="gnote" id="gn" placeholder="What you saw, and what was agreed with ' + esc(first(d.crew)) + '"></textarea></div>';
      h += '<div class="card pad"><div class="gsum"><span class="ib n" id="gi">' + ic("clipboard-text") + '</span><div><div class="n" id="gs">–<small> / 5</small></div><div class="sm" id="gf">Rate Inventory, Technical and Customer collaterals.</div></div></div></div>';
      $("main").innerHTML = h;
      var draw = function () {
        Array.prototype.forEach.call(document.querySelectorAll(".rate"), function (row) {
          var k = row.getAttribute("data-k");
          Array.prototype.forEach.call(row.children, function (b) { var v = +b.getAttribute("data-v"); b.className = (G[k] === v ? "on" : "") + (G[k] === v && v <= 3 ? " lo" : ""); });
        });
        var sc = scoreOf(G), low = RATINGS.some(function (r) { return G[r[0]] != null && G[r[0]] <= 3; });
        var all = G.inventory && G.technical && G.collaterals, noteOk = !low || G.note.trim().length >= 10;
        $("gs").innerHTML = (sc.score == null ? "–" : sc.score) + "<small> / 5</small>";
        $("gf").textContent = !all ? "Rate Inventory, Technical and Customer collaterals." : sc.from === "overall" ? "Score from the Overall rating." : "No Overall: the average of the three, rounded down.";
        $("gi").className = "ib " + (sc.score == null ? "n" : sc.score <= 3 ? "r" : "g");
        $("nh").textContent = low ? "Required: a rating is 3 or below. One sentence, at least 10 characters." : "Optional. Required when any rating is 3 or below.";
        $("gn").classList.toggle("err", low && !noteOk && G.note.length > 0);
        var btn = $("gb"); if (btn) btn.disabled = !(all && noteOk);
      };
      document.querySelectorAll(".rate").forEach(function (row) {
        row.addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          var k = row.getAttribute("data-k"), v = +b.getAttribute("data-v");
          G[k] = G[k] === v && k === "overall" ? null : v; draw();
        });
      });
      $("gn").addEventListener("input", function () { G.note = $("gn").value; draw(); });
      dock('<button class="btn green" id="gb" disabled>' + ic("check") + "File the grade</button>" + '<div class="note">Filed once. It cannot be changed afterwards.</div>');
      $("gb").onclick = function () {
        var sc = scoreOf(G);
        if (!confirm("File " + first(d.crew) + "'s audit with a score of " + sc.score + " / 5? It cannot be changed afterwards.")) return;
        $("gb").disabled = true;
        post("/api/audit/request/grade", { id: id, inventory: G.inventory, technical: G.technical, collaterals: G.collaterals, overall: G.overall, note: G.note }).then(function (r) {
          if (!r.ok) { alert(r.error === "already_filed" ? "This audit was already graded." : r.error === "invalid" ? "Check the ratings and the note." : (r.error || "Not filed")); $("gb").disabled = false; return; }
          reloadShips(); S.brief = {}; history.replaceState(null, "", "#q=" + id); requestDetail(id);
        }).catch(function () { alert("No connection. Nothing was filed; try again."); $("gb").disabled = false; });
      };
      draw();
    }).catch(fail);
  }
  function reloadShips() { api("/api/audit/ships").then(function (r) { S.ships = r.ships; }).catch(function () {}); }

  /* ---------------- router ---------------- */
  function go(h) { location.hash = h; }
  function route() {
    S.view = null; window.scrollTo(0, 0);
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (h.indexOf("s=") === 0) return shipView(h.slice(2));
    if (h.indexOf("b=") === 0) { var p = h.slice(2).split("|"); return briefView(p[0], p[1]); }
    if (h.indexOf("r=") === 0) { var p2 = h.slice(2).split("|"); return requestView(p2[0], p2[1]); }
    if (h.indexOf("q=") === 0) return requestDetail(h.slice(2));
    if (h.indexOf("g=") === 0) return gradeView(h.slice(2));
    shipsView();
  }
  $("bk").innerHTML = ic("caret-left");
  window.addEventListener("hashchange", route);
  $("bk").addEventListener("click", function () { history.length > 1 ? history.back() : go(""); });
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-go]");
    if (g) { if (g.disabled) return; go(g.getAttribute("data-go")); return; }
    var t = e.target.closest("[data-brand],[data-sc],[data-ship]");
    if (!t) return;
    /* a brand chip browses the brand: it clears a search left in the box ("qu" + Azamara showed only Quest, 15 Oct 2026) */
    if (t.hasAttribute("data-brand")) { S.brand = t.getAttribute("data-brand"); if (S.q) { S.q = ""; var qi = $("q"), qx = $("qx"); if (qi) qi.value = ""; if (qx) qx.hidden = true; } shipsList(); return; }
    if (t.hasAttribute("data-sc")) { go("b=" + encodeURIComponent(t.getAttribute("data-ship")) + "|" + encodeURIComponent(t.getAttribute("data-sc"))); return; }
    if (t.hasAttribute("data-ship")) go("s=" + encodeURIComponent(t.getAttribute("data-ship")));
  });
  function net() { $("offl").hidden = navigator.onLine !== false; }
  window.addEventListener("online", net); window.addEventListener("offline", net); net();
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("/audit/sw.js", { scope: location.pathname.indexOf("/audit") === 0 ? "/audit" : "/" }).catch(function () {}); } catch (e) {} }

  route();
  Promise.all([api("/api/me"), api("/api/audit/ships")]).then(function (r) {
    S.me = r[0].email; S.today = r[1].today; S.ships = r[1].ships;
    var h = location.hash.replace(/^#/, ""); if (!h) shipsList(); else if (h.indexOf("s=") === 0) route();
    if (!h) { var w = $("heroslot").querySelector(".who"); if (w) w.textContent = nameOf(S.me) + " · " + todayLong(); }
  }).catch(fail);
})();
</script>
</body></html>`;
