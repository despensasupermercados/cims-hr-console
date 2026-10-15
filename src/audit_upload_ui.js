// PRINTSHOP AUDIT — the seafarer's upload page, v2 (14 Oct 2026; Miguel: "the idea behind is ok, but the UI and UX is
// horrible .. design it better"). Web or phone, no login: the link in his email is the key.
//
// One idea per screen region, read without reading:
//   - the header says the ship, who it is for, the deadline, and two progress bars (machines, count);
//   - each machine is two TILES (Pattern 43, Machine Management List): empty, sending %, reading, read, send again —
//     the tile's colour and icon carry the state, a short sentence carries the fix only when something is wrong;
//   - "Machine won't print?" is a quiet link that opens a reason box (the reason is required);
//   - the count is a filtered list (To count first) with big - / + steppers; it never shows OBP's on-hand;
//   - a bar fixed to the bottom always says what is left, or that everything is in.
// Icons are Phosphor's own glyphs (src/audit_icons.js), inlined so they survive the ship's connection.
// String.raw keeps the client script's backslashes; no backtick or dollar-brace inside (scripts/verify_client_scripts.mjs).
import { ICONS } from "./audit_icons.js";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const HEAD = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="robots" content="noindex"><meta name="theme-color" content="#142D48"><link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">`;

const CSS = String.raw`<style>
:root{--nfg:#1B3A5C;--fill:#2F7A22;--navy:#1B3A5C;--deep:#142D48;--green:#5FB946;--green-d:#2F7A22;--greenbg:#EEF7EA;--red:#B4382A;--redbg:#FCEDEA;--amber:#9A6412;--amberbg:#FBF3E4;
--ink:#14243A;--ink2:#46566B;--mut:#5B6A7D;--line:#E6EBF1;--line2:#D3DCE6;--bg:#F2F5F9;--card:#FFFFFF;--fh:'Outfit',Helvetica,Arial,sans-serif;--ff:'DM Sans',Helvetica,Arial,sans-serif;--fm:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--r:16px}
@media (prefers-color-scheme:dark){:root{--nfg:#9CC0E8;--navy:#2B5A8C;--ink:#E9EEF5;--ink2:#B6C2D2;--mut:#8C9AAE;--line:#24344A;--line2:#2F4259;--bg:#0D1828;--card:#14233A;--greenbg:#16301F;--redbg:#3A1C18;--amberbg:#352812;--green-d:#7CCB66;--red:#F08A7C;--amber:#E2AE5A}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--ff);font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased}
.ic{width:1.15em;height:1.15em;flex:none;vertical-align:-.18em}
button{font:inherit;color:inherit}
.top{background:var(--deep);color:#fff;padding:calc(16px + env(safe-area-inset-top)) 16px 18px}
.top .in{max-width:1048px;margin:0 auto}
.brand{display:flex;justify-content:space-between;align-items:center;font-family:var(--fh);font-weight:700;font-size:13px;letter-spacing:4px;opacity:.9}
.due{display:inline-flex;align-items:center;gap:6px;font-family:var(--ff);font-size:12.5px;letter-spacing:0;font-weight:600;background:rgba(255,255,255,.1);padding:6px 11px;border-radius:999px}
.due.late{background:#B4382A}
.top h1{font-family:var(--fh);font-weight:600;font-size:30px;letter-spacing:-.4px;margin:18px 0 2px;line-height:1.1}
.top .who{color:#B9C6D6;font-size:14px}
.bars{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}
.bar .lb{display:flex;justify-content:space-between;font-size:12.5px;color:#B9C6D6;margin-bottom:6px}.bar .lb b{color:#fff;font-weight:600}
.track{height:6px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden}.track i{display:block;height:100%;background:var(--green);border-radius:99px;transition:width .5s cubic-bezier(.16,1,.3,1)}
main{max-width:1080px;margin:0 auto;padding:22px 16px 120px;display:grid;gap:28px}
@media (min-width:900px){main{grid-template-columns:1.05fr 1fr;align-items:start;padding-top:28px}}
.sec h2{font-family:var(--fh);font-weight:600;font-size:20px;margin:0;display:flex;align-items:center;gap:10px}
.sec h2 .n{width:26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;font-size:13px;display:grid;place-items:center;flex:none}
.sec .sub{color:var(--mut);font-size:13.5px;margin:4px 0 14px 36px}
.mach{background:var(--card);border-radius:var(--r);padding:16px;margin-bottom:12px;box-shadow:0 1px 2px rgba(20,36,58,.05),0 0 0 1px var(--line)}
.mh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:12px}
.mh b{font-family:var(--fh);font-weight:600;font-size:17px}.mh .sn{font-family:var(--fm);font-size:12px;color:var(--mut)}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tile{position:relative;overflow:hidden;min-height:118px;border-radius:14px;border:1.5px dashed var(--line2);background:var(--bg);padding:12px;display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;text-align:left;transition:transform .12s,border-color .2s,background .2s}
.tile:active{transform:scale(.985)}
.tile input{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0}
.tile .t{font-family:var(--fh);font-weight:600;font-size:14.5px;line-height:1.2}.tile .s{font-size:12px;color:var(--mut);margin-top:2px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.tile .s.fn{display:block;white-space:nowrap;text-overflow:ellipsis}
.tile .st{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--nfg)}
.tile .st .ic{width:18px;height:18px}
.tile.ok{border:1.5px solid transparent;background:var(--greenbg)}.tile.ok .st{color:var(--green-d)}
.tile.bad{border:1.5px solid var(--red);background:var(--redbg)}.tile.bad .st{color:var(--red)}
.tile.busy{border:1.5px solid var(--line2);cursor:default}
.tile.busy:after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);background-size:220% 100%;animation:sh 1.3s infinite linear}
@keyframes sh{from{background-position:120% 0}to{background-position:-120% 0}}
.tile .pg{position:absolute;left:0;bottom:0;height:4px;background:var(--navy);transition:width .2s}
.fix{display:flex;gap:10px;align-items:flex-start;margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--redbg);color:var(--red);font-size:13.5px;font-weight:500}
.fix .ic{width:18px;height:18px;margin-top:1px}
.dn{margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.lnk{background:none;border:0;padding:0;min-height:44px;color:var(--mut);font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.down{margin-top:2px;border-radius:12px;background:var(--amberbg);padding:12px}
.down .row{display:flex;align-items:center;gap:8px;color:var(--amber);font-weight:600;font-size:14px}
.down textarea{width:100%;margin-top:10px;border:1px solid var(--line2);border-radius:10px;padding:10px 12px;font:inherit;min-height:64px;background:var(--card);color:var(--ink);resize:vertical}
.down .act{display:flex;gap:8px;margin-top:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;border:0;background:var(--navy);color:#fff;font-family:var(--fh);font-weight:600;font-size:15px;cursor:pointer;transition:transform .12s}
.btn:active{transform:scale(.98)}.btn.ghost{background:transparent;color:var(--ink2);box-shadow:inset 0 0 0 1px var(--line2)}
.err{color:var(--red);font-size:12.5px;font-weight:600;margin-top:6px}
.filters{display:flex;gap:8px;margin:0 0 12px 36px;flex-wrap:wrap}
.chip{min-height:40px;padding:0 14px;border-radius:999px;border:0;background:var(--card);box-shadow:inset 0 0 0 1px var(--line2);color:var(--ink2);font-size:13.5px;font-weight:600;cursor:pointer}
.chip.on{background:var(--navy);color:#fff;box-shadow:none}
.list{background:var(--card);border-radius:var(--r);box-shadow:0 1px 2px rgba(20,36,58,.05),0 0 0 1px var(--line);overflow:hidden}
.cat{padding:14px 16px 6px;font-size:12px;font-weight:600;color:var(--mut)}
.ln{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:10px 12px 10px 16px;border-top:1px solid var(--line)}
.cat+.ln{border-top:0}
.ln .nm{font-weight:600;font-size:14.5px;line-height:1.25}.ln .pn{font-family:var(--fm);font-size:11.5px;color:var(--mut);margin-top:2px}
.ln.done .nm:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:8px;vertical-align:2px}
.step{display:flex;align-items:center;border-radius:12px;box-shadow:inset 0 0 0 1px var(--line2);overflow:hidden}
.step button{width:44px;height:44px;border:0;background:transparent;display:grid;place-items:center;color:var(--ink2);cursor:pointer}
.step button:active{background:var(--bg)}
.step input{width:52px;height:44px;border:0;border-left:1px solid var(--line);border-right:1px solid var(--line);text-align:center;font-family:var(--fh);font-weight:600;font-size:18px;color:var(--ink);background:transparent;-moz-appearance:textfield}
.ln.done .step{box-shadow:inset 0 0 0 1.5px var(--green)}
.empty{padding:22px 16px;text-align:center;color:var(--mut);font-size:14px}
.add{display:grid;grid-template-columns:1fr 80px auto;gap:8px;padding:12px;border-top:1px solid var(--line)}
.add input{min-height:44px;border:1px solid var(--line2);border-radius:10px;padding:0 12px;font:inherit;background:var(--card);color:var(--ink);min-width:0}
.xt{display:flex;justify-content:space-between;padding:10px 16px;border-top:1px solid var(--line);font-size:14px}
.dock{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--card);box-shadow:0 -1px 0 var(--line),0 -8px 24px rgba(20,36,58,.06);z-index:5}
.dock .in{max-width:1048px;margin:0 auto;display:flex;align-items:center;gap:12px}
.dock .msg{flex:1;min-width:0;font-size:14px}.dock .msg b{font-family:var(--fh);font-size:16px;display:block}
.dock .msg span{color:var(--mut);font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dock.done{background:var(--fill);color:#fff}.dock.done .msg span{color:#E3F2DD}
.dock .ic.big{width:28px;height:28px}
.test{max-width:1080px;margin:14px auto 0;padding:0 16px}.test div{background:var(--amberbg);color:var(--amber);font-weight:600;font-size:13px;padding:10px 14px;border-radius:12px}
.toast{position:fixed;left:50%;bottom:96px;transform:translate(-50%,8px);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:999px;font-size:13.5px;opacity:0;transition:.2s;pointer-events:none;z-index:9;max-width:90vw}.toast.on{opacity:1;transform:translate(-50%,0)}
.sk{height:118px;border-radius:14px;background:var(--line);opacity:.6}
@media (max-width:360px){.tiles{grid-template-columns:1fr}.tile{min-height:92px}.filters,.sec .sub{margin-left:0}.ln{grid-template-columns:1fr;gap:8px}.ln .step{justify-self:end}.add{grid-template-columns:1fr 64px auto}}
@media (prefers-reduced-motion:reduce){.tile.busy:after{animation:none}.track i,.tile{transition:none}}
</style>`;

export function auditUploadHtml({ token, ship, crew }) {
  return HEAD("Printshop audit · " + ship) + CSS + `</head><body>
<header class="top"><div class="in"><div class="brand"><span>CIMS</span><span class="due" id="due"></span></div>
<h1>${esc(ship)}</h1><div class="who" id="who">${esc(crew || "")}</div>
<div class="bars"><div class="bar"><div class="lb"><span>Machines</span><b id="mp"></b></div><div class="track"><i id="mt" style="width:0"></i></div></div>
<div class="bar"><div class="lb"><span>Count</span><b id="cp"></b></div><div class="track"><i id="ct" style="width:0"></i></div></div></div></div></header>
<div id="testslot"></div>
<main id="main"><section class="sec"><div class="sk"></div></section></main>
<div class="dock" id="dock" hidden></div><div class="toast" id="toast"></div>
<script>window.__T=${JSON.stringify(String(token))};window.__IC=${JSON.stringify(ICONS)};</script>
<script>` + SCRIPT + `</script></body></html>`;
}

export function auditClosedHtml(why) {
  const msg = why === "cancelled" ? "This request was cancelled. Nothing more is needed." : why === "expired" ? "This link has expired. Ask Dexter or Onboard Support for a new one." : "This link is not valid. Use the newest email you received.";
  return HEAD("Printshop audit") + CSS + `</head><body><header class="top"><div class="in"><div class="brand"><span>CIMS</span></div><h1>Link closed</h1><div class="who">${esc(msg)}</div></div></header></body></html>`;
}

const SCRIPT = String.raw`
(function () {
  "use strict";
  var T = window.__T, IC = window.__IC || {}, S = null, busy = {}, pend = {}, openDown = {}, timer = null, filter = "todo", picked = false;
  var $ = function (id) { return document.getElementById(id); };
  function ic(n, cls) { return (IC[n] || "").replace("<svg ", '<svg class="ic' + (cls ? " " + cls : "") + '" '); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function left(v) { var h = (Date.parse(v) - Date.now()) / 36e5; if (isNaN(h)) return ""; if (h <= 0) return "Overdue"; return h < 1 ? Math.round(h * 60) + " min left" : Math.floor(h) + " h left"; }
  function toast(t) { var e = $("toast"); e.textContent = t; e.className = "toast on"; clearTimeout(e._t); e._t = setTimeout(function () { e.className = "toast"; }, 2800); }
  function q(p) { return p + (p.indexOf("?") < 0 ? "?" : "&") + "t=" + encodeURIComponent(T); }
  function api(p, body) {
    return fetch(q(p), body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok && !j.say) j.say = j.error || ("HTTP " + r.status); return j; }); })
      .catch(function () { return { ok: false, say: "No connection. Your numbers on this page are kept; try again." }; });
  }
  function typing() { var a = document.activeElement; return !!(a && a.getAttribute && (a.getAttribute("data-part") || a.getAttribute("data-reason") || a.id === "xt" || a.id === "xn")); }
  function load(soft) { return api("/api/audit/u/state").then(function (j) { if (j && j.machines) { S = j; if (soft && typing() && S.status === "sent") { head(); dock(); } else draw(); } else { $("main").innerHTML = '<section class="sec"><div class="empty">' + esc(j.say || j.error || "Could not load.") + "</div></section>"; } }); }

  function mDone(m) { return !!m.down || !!(m.p43 && m.p43.read_state === "ok" && m.mgmt && m.mgmt.read_state === "ok"); }
  function counted(l) { var v = S.counted[l.part_no]; return v !== undefined && v !== null && v !== ""; }
  function head() {
    $("who").textContent = S.crew + " · for " + S.auditor + "'s visit";
    var d = $("due"); var lf = left(S.dueAt); d.innerHTML = (S.status !== "sent" ? ic("f:check-circle") + "<span>Done</span>" : ic("clock") + "<span>" + esc(lf) + "</span>"); d.className = "due" + (lf === "Overdue" && S.status === "sent" ? " late" : "");
    var md = S.machines.filter(mDone).length, cd = S.lines.filter(counted).length;
    $("mp").textContent = md + " of " + S.machines.length; $("mt").style.width = (S.machines.length ? md / S.machines.length * 100 : 0) + "%";
    $("cp").textContent = cd + " of " + S.lines.length; $("ct").style.width = (S.lines.length ? cd / S.lines.length * 100 : 0) + "%";
  }
  function dock() {
    var el = $("dock"); el.hidden = false;
    if (S.status !== "sent" || S.gate.open) { el.className = "dock done"; el.innerHTML = '<div class="in">' + ic("f:check-circle", "big") + '<div class="msg"><b>Everything is in.</b><span>' + esc(S.auditor) + " has been told. Thank you.</span></div></div>"; return; }
    var miss = S.gate.missing || [];
    el.className = "dock"; el.innerHTML = '<div class="in"><div class="msg"><b>' + miss.length + (miss.length === 1 ? " thing" : " things") + ' left</b><span>' + esc(miss.join(" · ")) + "</span></div></div>";
  }

  function tile(m, kind, title, sub) {
    var s = m[kind], k = m.serial + "|" + kind, b = busy[k];
    var cls = "tile", st, extra = "";
    if (b) { cls += " busy"; st = (b.pct != null ? ic("cloud-arrow-up") + "Sending " + b.pct + "%" : ic("hourglass-medium") + esc(b.text)); if (b.pct != null) extra = '<i class="pg" style="width:' + b.pct + '%"></i>'; }
    else if (!s) { st = ic("cloud-arrow-up") + "Add file"; }
    else if (s.read_state === "ok") { cls += " ok"; st = ic("f:check-circle") + "Read"; }
    else if (s.read_state === "pending" || s.read_state === "failed") { cls += " busy"; st = ic("hourglass-medium") + "Reading…"; }
    else { cls += " bad"; st = ic("f:warning-circle") + "Send again"; }
    var input = (S.status === "sent" && !b && !(s && (s.read_state === "pending" || s.read_state === "failed"))) ? '<input type="file" accept="application/pdf,image/*" aria-label="' + esc(title) + ' for ' + esc(m.label) + '" data-serial="' + esc(m.serial) + '" data-kind="' + kind + '">' : "";
    return '<label class="' + cls + '">' + input + '<div><div class="t">' + title + '</div>' + (s && s.filename && !b ? '<div class="s fn" title="' + esc(s.filename) + '">' + esc(s.filename) + "</div>" : '<div class="s">' + sub + "</div>") + '</div><div class="st">' + st + "</div>" + extra + "</label>";
  }
  function machine(m) {
    var h = '<div class="mach"><div class="mh"><b>' + esc(m.label) + '</b><span class="sn">' + esc(m.serial) + "</span></div>";
    if (m.down) {
      h += '<div class="down"><div class="row">' + ic("wrench") + "Reported down</div><div style=\"margin-top:6px;font-size:14px\">" + esc(m.down) + "</div>";
      if (S.status === "sent") h += '<div class="act"><button class="btn ghost" data-undown="' + esc(m.serial) + '">It prints again</button></div>';
      return h + "</div></div>";
    }
    h += '<div class="tiles">' + tile(m, "p43", "Pattern 43", "12 pages, one PDF") + tile(m, "mgmt", "Machine Management List", "the long report with life\u00a0%") + "</div>";
    [m.p43, m.mgmt].forEach(function (s) { if (s && (s.read_state === "wrong_doc" || s.read_state === "unreadable") && !busy[m.serial + "|" + (s === m.p43 ? "p43" : "mgmt")]) h += '<div class="fix">' + ic("f:warning-circle") + "<span>" + esc(s.say) + "</span></div>"; });
    if (S.status === "sent") {
      if (openDown[m.serial]) h += '<div class="down" style="margin-top:12px"><div class="row">' + ic("wrench") + 'Why won\'t it print?</div><textarea data-reason="' + esc(m.serial) + '" placeholder="Error code, what you tried, engineer called">' + esc(pend["r" + m.serial] || "") + '</textarea><div class="err" id="err' + esc(m.serial) + '"></div><div class="act"><button class="btn" data-savedown="' + esc(m.serial) + '">Report down</button><button class="btn ghost" data-canceldown="' + esc(m.serial) + '">Cancel</button></div></div>';
      else h += '<div class="dn"><span></span><button class="lnk" data-opendown="' + esc(m.serial) + '">Machine won\'t print?</button></div>';
    }
    return h + "</div>";
  }
  function countList() {
    var all = S.lines, todo = all.filter(function (l) { return !counted(l); }), done = all.length - todo.length;
    if (filter === "todo" && !todo.length && !picked) filter = "all"; // nothing left to count: show the count, not an empty list
    var rows = filter === "todo" ? todo : filter === "done" ? all.filter(counted) : all;
    var h = '<div class="filters"><button class="chip' + (filter === "todo" ? " on" : "") + '" data-f="todo">To count ' + todo.length + '</button><button class="chip' + (filter === "done" ? " on" : "") + '" data-f="done">Counted ' + done + '</button><button class="chip' + (filter === "all" ? " on" : "") + '" data-f="all">All ' + all.length + "</button></div>";
    h += '<div class="list">';
    if (!rows.length) h += '<div class="empty">' + (filter === "todo" ? "Every line is counted." : "Nothing here yet.") + "</div>";
    var cat = null;
    rows.forEach(function (l) {
      if ((l.category || "Other") !== cat) { cat = l.category || "Other"; h += '<div class="cat">' + esc(cat) + "</div>"; }
      var v = S.counted[l.part_no]; var has = v !== undefined && v !== null && v !== "";
      var dis = S.status !== "sent" ? " disabled" : "";
      h += '<div class="ln' + (has ? " done" : "") + '"><div><div class="nm">' + esc(l.description || l.part_no) + '</div><div class="pn">' + esc(l.part_no) + '</div></div><div class="step"><button data-dec="' + esc(l.part_no) + '" aria-label="One less"' + dis + ">" + ic("minus") + '</button><input inputmode="numeric" pattern="[0-9]*" maxlength="5" aria-label="Count for ' + esc(l.description || l.part_no) + '" data-part="' + esc(l.part_no) + '" value="' + (has ? esc(v) : "") + '"' + dis + '><button data-inc="' + esc(l.part_no) + '" aria-label="One more"' + dis + ">" + ic("plus") + "</button></div></div>";
    });
    if (filter !== "done") {
      if (S.extras.length) { h += '<div class="cat">Not on the list</div>'; S.extras.forEach(function (x) { h += '<div class="xt"><span>' + esc(x.text) + "</span><b>" + esc(x.counted == null ? "" : x.counted) + "</b></div>"; }); }
      if (S.status === "sent") h += '<div class="add"><input id="xt" placeholder="Other item"><input id="xn" inputmode="numeric" placeholder="Qty"><button class="btn ghost" id="xadd">' + ic("plus") + "</button></div>";
    }
    return h + "</div>";
  }
  function draw() {
    head();
    $("testslot").innerHTML = S.test ? '<div class="test"><div>Test mode. This page is real; the request went to the auditor only.</div></div>' : "";
    var h = '<section class="sec"><h2><span class="n">1</span>Machines</h2><div class="sub">Two files each. Read the moment they land.</div>' + S.machines.map(machine).join("") + "</section>";
    h += '<section class="sec"><h2><span class="n">2</span>Count</h2><div class="sub">Count the shelf, type the total. 0 counts.</div>' + countList() + "</section>";
    $("main").innerHTML = h; dock();
  }

  function send(file, serial, kind) {
    var k = serial + "|" + kind;
    if (file.size > 24 * 1024 * 1024) { toast("The file is " + Math.round(file.size / 1048576) + " MB; the limit is 24 MB. Scan at a lower resolution."); return; }
    busy[k] = { pct: 0 }; draw();
    var x = new XMLHttpRequest();
    x.open("POST", q("/api/audit/u/upload?serial=" + encodeURIComponent(serial) + "&kind=" + kind));
    x.setRequestHeader("Content-Type", file.type || "application/pdf");
    x.setRequestHeader("X-File-Name", file.name || "file");
    x.upload.onprogress = function (e) { if (e.lengthComputable) { busy[k] = { pct: Math.round(e.loaded / e.total * 100) }; var t = document.querySelector('[data-serial="' + serial + '"][data-kind="' + kind + '"]'); draw(); } };
    x.onerror = function () { delete busy[k]; draw(); toast("No connection. Choose the file again."); };
    x.onload = function () {
      var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
      if (!j.ok) { delete busy[k]; draw(); toast(j.say || j.error || "Not sent"); return; }
      busy[k] = { text: kind === "mgmt" ? "Reading…" : "Measuring…" }; draw();
      api("/api/audit/u/read?id=" + encodeURIComponent(j.id), {}).then(function () { delete busy[k]; load(); });
    };
    x.send(file);
  }
  function flush() {
    var counts = {}, any = false;
    Object.keys(pend).forEach(function (k) { if (k.indexOf("c:") === 0) { counts[k.slice(2)] = pend[k]; delete pend[k]; any = true; } });
    if (!any) return Promise.resolve();
    return api("/api/audit/u/count", { counts: counts }).then(function (j) { if (j && j.ok === false) toast(j.say || "Not saved"); else return load(true); });
  }
  function setCount(part, v) {
    S.counted[part] = v === "" ? null : Number(v);
    pend["c:" + part] = v;
    var inp = document.querySelector('input[data-part="' + part + '"]'); if (inp) { inp.value = v; var row = inp.closest(".ln"); if (row) row.className = "ln" + (v === "" ? "" : " done"); }
    head(); clearTimeout(timer); timer = setTimeout(flush, 800);
  }

  document.addEventListener("change", function (e) { var t = e.target; if (t.type === "file" && t.files && t.files[0]) send(t.files[0], t.getAttribute("data-serial"), t.getAttribute("data-kind")); });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute("data-part")) { t.value = t.value.replace(/[^0-9]/g, "").slice(0, 5); setCount(t.getAttribute("data-part"), t.value); }
    if (t.getAttribute && t.getAttribute("data-reason")) pend["r" + t.getAttribute("data-reason")] = t.value;
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-f")) { flush(); filter = t.getAttribute("data-f"); picked = true; draw(); return; }
    if (t.hasAttribute("data-inc") || t.hasAttribute("data-dec")) {
      var p = t.getAttribute("data-inc") || t.getAttribute("data-dec"), cur = S.counted[p]; cur = cur == null || cur === "" ? 0 : Number(cur);
      var n = t.hasAttribute("data-inc") ? Math.min(99999, cur + 1) : Math.max(0, cur - 1);
      setCount(p, String(n)); return;
    }
    if (t.hasAttribute("data-opendown")) { openDown[t.getAttribute("data-opendown")] = 1; draw(); var ta = document.querySelector('[data-reason="' + t.getAttribute("data-opendown") + '"]'); if (ta) ta.focus(); return; }
    if (t.hasAttribute("data-canceldown")) { delete openDown[t.getAttribute("data-canceldown")]; draw(); return; }
    if (t.hasAttribute("data-savedown")) {
      var sn = t.getAttribute("data-savedown"), r = (pend["r" + sn] || "").trim();
      if (!r) { $("err" + sn).textContent = "Write why it is down."; return; }
      api("/api/audit/u/down", { serial: sn, reason: r, down: true }).then(function (j) { if (j.ok) { delete openDown[sn]; delete pend["r" + sn]; load(); } else toast(j.say || "Not saved"); });
      return;
    }
    if (t.hasAttribute("data-undown")) { api("/api/audit/u/down", { serial: t.getAttribute("data-undown"), down: false }).then(load); return; }
    if (t.id === "xadd") {
      var tx = $("xt").value.trim(); if (!tx) { toast("Write the item"); return; }
      api("/api/audit/u/count", { extras: [{ text: tx, counted: $("xn").value }] }).then(function (j) { if (j.ok) load(); else toast(j.say || "Not saved"); });
    }
  });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
  load();
})();
`;
