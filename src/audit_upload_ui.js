// PRINTSHOP OPS AUDIT — the seafarer's upload page, v3 (20 Oct 2026, the approved canvas 45Hsjnr7Vr6f1BPussctg3, board
// "Crew"; Miguel: "1. yes"). Web or phone, no login: the link in the email is the key.
//
// One page, three things to send, in the order the crew does them:
//   - Pattern 43 and the Machine Management List, one row per press, each row its own file input: empty, sending %,
//     reading, read, send again (the fix in one sentence only when something is wrong);
//   - the shelf count: a filtered list (To count first, a search), one box per line; it never shows OBP's on-hand;
//   - "Machine won't print?": the reason is required, and it counts as explained;
//   - then Send, once everything is in: the request never closes on the last keystroke.
// The design system is the console's audit app's (src/audit_ui_css.js): one sheet, the same names.
// String.raw keeps the client script's backslashes; no backtick or dollar-brace inside (scripts/verify_client_scripts.mjs).
import { ICONS } from "./audit_icons.js";
import { AUDIT_NAME, markSvg } from "./audit_brand.js";
import { AUDIT_CSS } from "./audit_ui_css.js";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const HEAD = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="robots" content="noindex"><meta name="theme-color" content="#FFFFFF"><link rel="icon" href="/audit/favicon.ico"><link rel="apple-touch-icon" href="/audit/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">`;

const PAGE_CSS = String.raw`
.crew-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:28px;align-items:start}
.main-col{gap:16px}
.side-col{position:sticky;top:88px}
.task{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;padding:20px 22px;align-items:start}
.up{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px dashed var(--line2);background:var(--bg);cursor:pointer}
.up input{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0;width:100%}
.up.ok{border:1.5px solid transparent;background:var(--greenbg)}
.up.bad{border:1.5px solid var(--redm);background:var(--redbg)}
.up.dn{border:1.5px solid transparent;background:var(--amberbg);cursor:default}
.up.busy{border-style:solid;cursor:default}
.up .fn{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.up .prog{grid-column:1 / -1}
.asx{border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:grid;gap:8px;font-size:13.5px;line-height:1.45}
.asx.m{border-color:var(--amberm,var(--line));background:var(--amberbg)}
.asx .t{font-weight:700;color:var(--ink)}.asx .k{font-weight:700;color:var(--mut);font-size:11.5px;letter-spacing:.6px;text-transform:uppercase;display:block}
.fixl{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;font-weight:600;color:var(--red)}.fixl .ic{width:16px;height:16px;margin-top:2px}
.cat{padding:12px 24px 6px;font-size:12.5px;font-weight:600;color:var(--mut);background:var(--soft)}
.cline{display:grid;grid-template-columns:minmax(0,1fr) 88px;gap:14px;align-items:center;padding:12px 24px}
.cline .qty.on{border-color:var(--green);background:var(--greenbg)}
.fld2{display:flex;align-items:center;gap:10px;height:48px;border:1px solid var(--line2);border-radius:12px;background:var(--card);padding:0 12px;color:var(--mut)}
.fld2 input{border:0;outline:0;flex:1;min-width:0;font:inherit;font-size:16px;color:var(--ink);background:transparent}
.fld2:focus-within{box-shadow:0 0 0 2px var(--green)}
.addx{display:grid;grid-template-columns:minmax(0,1fr) 88px auto;gap:8px;padding:12px 24px}
.downs{gap:14px}
.acc{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.acc-i{border-top:1px solid var(--lines)}.acc-i:first-child{border-top:0}
.acc-q{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:52px;padding:12px 18px;border:0;background:none;text-align:left;font-weight:600;font-size:14.5px;color:var(--ink);cursor:pointer}
.acc-pm{width:26px;height:26px;border-radius:8px;background:var(--quiet);display:flex;align-items:center;justify-content:center;flex:none;color:var(--nfg)}.acc-pm .ic{width:14px;height:14px}
.acc-a{padding:0 18px 16px;font-size:14px;line-height:1.55;color:var(--txt);margin:0}
.duec{background:var(--quiet);color:var(--nfg)}.duec.late{background:var(--redbg);color:var(--red)}.duec.done{background:var(--greenbg);color:var(--greend)}
.donecard{display:flex;gap:16px;align-items:center}
@media (max-width:900px){.crew-grid{grid-template-columns:minmax(0,1fr)}.side-col{position:static}}
@media (max-width:760px){
.task{padding:18px;gap:14px;grid-template-columns:minmax(0,1fr)}
.task>.fi{display:none}
.appbar .brand b{font-size:16px}
.cline{padding:12px 18px;grid-template-columns:minmax(0,1fr) 76px}
.cat{padding:12px 18px 6px}
.addx{padding:12px 18px;grid-template-columns:minmax(0,1fr) 76px}
.addx .btn{grid-column:1 / -1}
.list-foot .btn{flex:1 1 100%}
}
`;

export function auditUploadHtml({ token, ship, crew }) {
  return HEAD(AUDIT_NAME + " · " + ship) + "<style>" + AUDIT_CSS + PAGE_CSS + `</style></head><body>
<header class="appbar"><div class="appbar-in"><span class="brand">${markSvg(36)}<b>${esc(AUDIT_NAME)}</b></span><span class="chip duec" id="due"></span></div></header>
<div id="testslot"></div>
<main class="wrap"><section class="crew-grid"><div class="sec main-col" id="main"><div class="sec"><span class="eyebrow">Before the audit</span><h1 class="h1">${esc(ship)}</h1><p class="lead">${esc(crew || "")}</p></div><div class="card clip"><div class="sk"></div><div class="sk"></div></div></div><aside class="sec side-col" id="side"></aside></section></main>
<div id="dockslot"></div><div class="toast" id="toast"></div>
<script>window.__T=${JSON.stringify(String(token))};window.__IC=${JSON.stringify(ICONS)};</script>
<script>` + SCRIPT + `</script></body></html>`;
}

export function auditClosedHtml(why) {
  const msg = why === "cancelled" ? "This request was cancelled. Nothing more is needed." : why === "expired" ? "This link has expired. Ask Dexter or Onboard Support for a new one." : "This link is not valid. Use the newest email you received.";
  return HEAD(AUDIT_NAME) + "<style>" + AUDIT_CSS + PAGE_CSS + `</style></head><body><header class="appbar"><div class="appbar-in"><span class="brand">${markSvg(36)}<b>${esc(AUDIT_NAME)}</b></span></div></header>
<main class="wrap"><section class="card pad sec tight" style="max-width:640px"><span class="eyebrow">Link closed</span><h1 class="h2">Nothing to send here</h1><p class="lead">${esc(msg)}</p></section></main></body></html>`;
}

const SCRIPT = String.raw`
(function () {
  "use strict";
  var T = window.__T, IC = window.__IC || {}, S = null, busy = {}, pend = {}, openDown = {}, timer = null, filter = "todo", picked = false, find = "", addOpen = false, faq = 0;
  var $ = function (id) { return document.getElementById(id); };
  function ic(n, cls) { return (IC[n] || "").replace("<svg ", '<svg class="ic' + (cls ? " " + cls : "") + '" '); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function first(n) { return String(n || "").split(" ")[0]; }
  function when(v) { var d = new Date(v); if (isNaN(d)) return ""; return MON[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) + " UTC"; }
  function left(v) { var h = (Date.parse(v) - Date.now()) / 36e5; if (isNaN(h)) return ""; if (h <= 0) return "Past the deadline"; return h < 1 ? Math.round(h * 60) + " min left" : h < 48 ? Math.floor(h) + " h left" : "Due " + when(v).split(",")[0]; }
  function toast(t) { var e = $("toast"); e.textContent = t; e.className = "toast on"; clearTimeout(e._t); e._t = setTimeout(function () { e.className = "toast"; }, 2800); }
  function q(p) { return p + (p.indexOf("?") < 0 ? "?" : "&") + "t=" + encodeURIComponent(T); }
  function api(p, body, keep) {
    return fetch(q(p), body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: !!keep })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok && !j.say) j.say = j.error || ("HTTP " + r.status); return j; }); })
      .catch(function () { return { ok: false, say: "No connection. Your numbers on this page are kept; try again." }; });
  }
  function typing() { var a = document.activeElement; return !!(a && a.getAttribute && (a.getAttribute("data-part") || a.getAttribute("data-reason") || a.id === "xt" || a.id === "xn" || a.id === "find")); }
  function load(soft) { return api("/api/audit/u/state").then(function (j) { if (j && j.machines) { S = j; if (soft && typing() && S.status === "sent") { head(); dock(); progress(); } else draw(); } else { $("main").innerHTML = '<div class="card pad"><p class="txt">' + esc(j.say || j.error || "Could not load.") + "</p></div>"; } }); }

  function mDone(m) { return !!m.down || !!(m.p43 && m.p43.read_state === "ok" && m.mgmt && m.mgmt.read_state === "ok"); }
  function counted(l) { var v = S.counted[l.part_no]; return v !== undefined && v !== null && v !== ""; }
  function kindDone(kind) { return S.machines.every(function (m) { return m.down || (m[kind] && m[kind].read_state === "ok"); }); }
  function doneN() { return (kindDone("p43") ? 1 : 0) + (kindDone("mgmt") ? 1 : 0) + (S.lines.length && S.lines.every(counted) ? 1 : 0); }
  function head() {
    var d = $("due"), lf = left(S.dueAt);
    if (S.status !== "sent") { d.className = "chip duec done"; d.innerHTML = ic("f:check-circle") + "Everything is in"; }
    else { d.className = "chip duec" + (lf === "Past the deadline" ? " late" : ""); d.innerHTML = ic("clock") + esc(lf); }
  }
  function progress() { var p = $("prog"); if (!p) return; var n = doneN(); p.innerHTML = '<div class="sec-hd"><b class="h4">' + n + ' of 3 done</b><span class="xs">Saved as you go</span></div><div class="prog"><i style="width:' + Math.round(n * 100 / 3) + '%"></i></div>'; var c = $("countchip"); if (c) { var k = S.lines.filter(counted).length; c.textContent = k + " of " + S.lines.length; c.className = "chip " + (k === S.lines.length ? "g" : "m"); } }
  function sendBtn() {
    if (S.status !== "sent") return "";
    var miss = S.gate.missing || [];
    return S.gate.open ? '<button type="button" class="btn green" id="submit">Send to ' + esc(first(S.auditor)) + "</button>"
      : '<button type="button" class="btn off" disabled>Send to ' + esc(first(S.auditor)) + " · " + miss.length + (miss.length === 1 ? " thing" : " things") + " left</button>";
  }
  function dock() {
    $("dockslot").innerHTML = S.status === "sent" ? '<div class="dock">' + sendBtn() + (S.gate.open ? '<div class="note">Check your numbers first. You cannot change them after.</div>' : "") + "</div>" : "";
    var sc = $("sendcard"); if (sc) sc.innerHTML = '<div class="sec-hd"><b class="h4">' + (S.gate.open ? "All in. Check your numbers, then send." : "All in? Check your numbers, then send.") + '</b><span class="xs">You cannot change it after</span></div>'
      + (S.gate.open ? "" : '<p class="sm">Still to do: ' + esc((S.gate.missing || []).join(" · ")) + "</p>") + '<div class="cta">' + sendBtn() + "</div>";
  }

  /* one press, one document: the row is its own file input */
  function upRow(m, kind) {
    var s = m[kind], k = m.serial + "|" + kind, b = busy[k], label = esc(m.label) + (m.model ? " · " + esc(m.model) : "");
    var cls = "up", chip, sub, bar = "";
    if (m.down) { cls += " dn"; chip = '<span class="chip a">Reported down</span>'; sub = "Explained: " + esc(m.down); }
    else if (b) { cls += " busy"; chip = '<span class="chip n">' + (b.pct != null ? "Sending " + b.pct + "%" : esc(b.text)) + "</span>"; sub = b.pct != null ? "Keep this page open" : "HON is reading it"; if (b.pct != null) bar = '<div class="prog"><i style="width:' + b.pct + '%;background:var(--navy)"></i></div>'; }
    else if (!s) { chip = '<span class="chip m">' + ic("cloud-arrow-up") + "Choose file</span>"; sub = kind === "p43" ? "12 pages, one PDF" : "Print it from the machine, then scan it"; }
    else if (s.read_state === "ok") { cls += " ok"; chip = '<span class="chip g">' + ic("b:check") + "Received</span>"; sub = '<span class="fn" title="' + esc(s.filename || "") + '">' + esc(s.filename || "") + "</span>"; }
    else if (s.read_state === "pending") { cls += " busy"; chip = '<span class="chip n">Reading</span>'; sub = '<span class="fn" title="' + esc(s.filename || "") + '">' + esc(s.filename || "") + "</span>"; }
    else if (s.read_state === "failed") { cls += " busy"; chip = '<span class="chip n">Trying again</span>'; sub = '<span class="fn" title="' + esc(s.filename || "") + '">' + esc(s.filename || "") + "</span>"; }
    else { cls += " bad"; chip = '<span class="chip r">Send again</span>'; sub = '<span class="fn" title="' + esc(s.filename || "") + '">' + esc(s.filename || "") + "</span>"; }
    var input = (S.status === "sent" && !m.down && !b && !(s && s.read_state === "pending")) ? '<input type="file" accept="application/pdf,image/*" aria-label="' + (kind === "p43" ? "Pattern 43" : "Machine Management List") + " for " + esc(m.label) + '" data-serial="' + esc(m.serial) + '" data-kind="' + kind + '">' : "";
    var fix = s && (s.read_state === "wrong_doc" || s.read_state === "unreadable") && !b && s.say ? '<div class="fixl">' + ic("f:warning-circle") + "<span>" + esc(s.say) + "</span></div>" : "";
    return '<label class="' + cls + '">' + input + '<div style="min-width:0"><b>' + label + '</b><div class="xs">' + sub + "</div></div>" + chip + bar + "</label>" + fix + (kind === "p43" && !m.down && !b ? assess(s) : "");
  }
  /* what the scan shows, told to the crew the moment it is read (R1, Miguel 23 Oct 2026): built by the server from HON's
     measurement (audit_read.p43Assess); the page only draws it */
  function assess(s) {
    var a = s && s.read_state === "ok" && s.assess; if (!a) return "";
    if (a.state === "clean") return '<div class="asx"><span class="t">' + esc(a.head) + "</span></div>";
    return '<div class="asx m"><span class="t">' + esc(a.head) + "</span>" + a.items.map(function (i) {
      return '<div><b>' + esc(i.title) + "</b>" + i.lines.map(function (l) { return '<div style="margin-top:6px"><span class="k">' + esc(l[0]) + "</span>" + esc(l[1]) + "</div>"; }).join("") + "</div>";
    }).join("") + (a.after ? '<div class="sm">' + esc(a.after) + "</div>" : "") + "</div>";
  }
  function docTask(kind, icn, cls, title, sub) {
    var live = S.machines.filter(function (m) { return !m.down; }), ok = live.filter(function (m) { return m[kind] && m[kind].read_state === "ok"; }).length;
    var bad = live.some(function (m) { var s = m[kind]; return s && (s.read_state === "wrong_doc" || s.read_state === "unreadable"); });
    var chip = !live.length ? '<span class="chip a">Every press down</span>' : ok === live.length ? '<span class="chip g">' + ic("b:check") + "Received</span>" : bad ? '<span class="chip r">Send again</span>' : '<span class="chip m">' + ok + " of " + live.length + "</span>";
    return '<div class="card task"><span class="fi' + (cls ? " " + cls : "") + '">' + ic(icn) + '</span><div class="sec tight" style="min-width:0"><div class="hstack" style="justify-content:space-between"><b class="h3">' + title + "</b>" + chip + '</div><p class="sm">' + sub + "</p>"
      + S.machines.map(function (m) { return upRow(m, kind); }).join("") + "</div></div>";
  }
  /* the rows alone: a search redraws them under the box, never the box (a redrawn box closes the phone's keyboard) */
  function rowsHtml(rows, f, dis) {
    var h = "", cat = null;
    if (!rows.length) h += '<div class="pad-m line-t"><p class="sm">' + (f ? "No line matches." : filter === "todo" ? "Every line is counted." : "Nothing here yet.") + "</p></div>";
    rows.forEach(function (l) {
      if ((l.category || "Other") !== cat) { cat = l.category || "Other"; h += '<div class="cat line-t">' + esc(cat) + "</div>"; }
      var v = S.counted[l.part_no], has = v !== undefined && v !== null && v !== "";
      h += '<div class="cline line-t"><div style="min-width:0"><b>' + esc(l.description || l.part_no) + '</b><div class="xs">' + esc(l.part_no) + '</div></div><label class="qty' + (has ? " on" : "") + '"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" aria-label="Count for ' + esc(l.description || l.part_no) + '" data-part="' + esc(l.part_no) + '" value="' + (has ? esc(v) : "") + '" placeholder="–"' + dis + "></label></div>";
    });
    if (filter !== "done" && !f && S.extras.length) { h += '<div class="cat line-t">Not on the list</div>'; S.extras.forEach(function (x) { h += '<div class="cline line-t"><div style="min-width:0"><b>' + esc(x.text) + '</b><div class="xs">Found on the shelf</div></div><b class="h4" style="text-align:center">' + esc(x.counted == null ? "–" : x.counted) + "</b></div>"; }); }
    return h;
  }
  function rowsFor() {
    var all = S.lines, rows = filter === "todo" ? all.filter(function (l) { return !counted(l); }) : filter === "done" ? all.filter(counted) : all, f = find.toLowerCase().trim();
    if (f) rows = rows.filter(function (l) { return ((l.description || "") + " " + l.part_no).toLowerCase().indexOf(f) >= 0; });
    return rowsHtml(rows, f, S.status !== "sent" ? " disabled" : "");
  }
  function countList() {
    var all = S.lines, todo = all.filter(function (l) { return !counted(l); }), done = all.length - todo.length;
    if (filter === "todo" && !todo.length && !picked) filter = "all"; // nothing left to count: show the count, not an empty list
    var rows = filter === "todo" ? todo : filter === "done" ? all.filter(counted) : all, f = find.toLowerCase().trim();
    if (f) rows = rows.filter(function (l) { return ((l.description || "") + " " + l.part_no).toLowerCase().indexOf(f) >= 0; });
    var dis = S.status !== "sent" ? " disabled" : "";
    var h = '<div class="card clip"><div class="pad-m sec tight"><div class="sec-hd"><b class="h3">The list · ' + all.length + ' lines from OBP</b><span class="xs">' + (todo.length ? todo.length + " to count" : "All counted") + "</span></div>"
      + '<label class="fld2">' + ic("magnifying-glass") + '<input id="find" type="search" aria-label="Find a part" placeholder="Find a part or number" value="' + esc(find) + '" autocomplete="off"></label>'
      + '<div class="pills"><button type="button" class="pill' + (filter === "todo" ? " on" : "") + '" data-f="todo">To count · ' + todo.length + '</button><button type="button" class="pill' + (filter === "all" ? " on" : "") + '" data-f="all">All · ' + all.length + '</button><button type="button" class="pill' + (filter === "done" ? " on" : "") + '" data-f="done">Counted · ' + done + "</button></div></div>";
    h += '<div id="crows">' + rowsHtml(rows, f, dis) + "</div>";
    if (S.status === "sent") {
      if (addOpen) h += '<div class="addx line-t"><label class="fld2"><input id="xt" placeholder="What it is" aria-label="What it is"></label><label class="qty"><input id="xn" type="text" inputmode="numeric" placeholder="Qty" aria-label="How many"></label><button type="button" class="btn pri s" id="xadd">Add</button></div>';
      h += '<div class="pad-m line-t hstack list-foot" style="justify-content:space-between"><button type="button" class="ul" id="xopen">' + (addOpen ? "Close" : "Found something not on the list?") + "</button>" + (todo.length ? '<button type="button" class="btn pri s" id="nextc">Next to count' + ic("arrow-right") + "</button>" : "") + "</div>";
    }
    return h + "</div>";
  }
  function downs() {
    if (S.status !== "sent" && !S.machines.some(function (m) { return m.down; })) return "";
    var h = '<div class="card pad-m sec downs"><div class="hstack" style="flex-wrap:nowrap;align-items:flex-start"><span class="fi r s">' + ic("wrench") + '</span><div style="flex:1 1 200px;min-width:0"><b class="h4">Machine won&#8217;t print?</b><div class="sm">Say why. That counts as explained, and ' + esc(first(S.auditor)) + " checks it on board.</div></div></div>";
    S.machines.forEach(function (m) {
      if (m.down) { h += '<div class="hstack" style="justify-content:space-between"><span class="sm"><b>' + esc(m.label) + "</b> reported down: &#8220;" + esc(m.down) + "&#8221;</span>" + (S.status === "sent" ? '<button type="button" class="btn ghost s" data-undown="' + esc(m.serial) + '">It prints again</button>' : "") + "</div>"; return; }
      if (S.status !== "sent") return;
      if (openDown[m.serial]) h += '<div class="sec tight"><label class="lbl"><span class="xs b">Why won&#8217;t ' + esc(m.label) + ' print?</span><textarea class="ta" data-reason="' + esc(m.serial) + '" placeholder="Error code, what you tried, engineer called">' + esc(pend["r" + m.serial] || "") + '</textarea></label><div class="why" id="err' + esc(m.serial) + '"></div><div class="cta"><button type="button" class="btn pri s" data-savedown="' + esc(m.serial) + '">Report it down</button><button type="button" class="btn ghost s" data-canceldown="' + esc(m.serial) + '">Cancel</button></div></div>';
      else h += '<div class="hstack" style="justify-content:space-between"><span class="sm">' + esc(m.label) + (m.model ? " · " + esc(m.model) : "") + '</span><button type="button" class="btn ghost s" data-opendown="' + esc(m.serial) + '">Report it down</button></div>';
    });
    return h + "</div>";
  }
  function side() {
    var FAQ = [["Which management list?", "The MACHINE Management List, 52 pages, printed from the press. Not the User Management List, 5 pages: it carries no part life."],
      ["The file is big. Will it go?", "Send it anyway, up to 24 MB. Each file saves on its own; if the connection drops, choose it again from here."],
      ["Why can&#8217;t I see OBP&#8217;s number?", "So the count is what is on the shelf today. Type the total for every line; 0 counts, blank does not."],
      ["A machine is down", "Tap &#8220;Report it down&#8221; and say why. That counts as explained, and " + esc(first(S.auditor)) + " checks it on board."]];
    return '<div class="navy sec hide-m"><span class="eyebrow">Due ' + esc(when(S.dueAt)) + '</span><b class="h3">' + esc(S.auditor) + " audits " + esc(S.ship) + '&#8217;s print shop</b><p class="sm">Each file is read the moment it lands. This page saves as you go.</p></div>'
      + '<div class="acc">' + FAQ.map(function (x, i) { var o = faq === i; return '<div class="acc-i' + (o ? " open" : "") + '"><button type="button" class="acc-q" data-faq="' + i + '" aria-expanded="' + o + '"><span>' + x[0] + '</span><span class="acc-pm">' + ic(o ? "b:minus" : "b:plus") + "</span></button>" + (o ? '<p class="acc-a">' + x[1] + "</p>" : "") + "</div>"; }).join("") + "</div>"
      + '<div class="help"><span class="fi a s">' + ic("chat-circle") + '</span><div class="t"><b class="h4">Stuck?</b><span class="sm">Reply to the email you got. It reaches the CIMS team.</span></div></div>';
  }
  function draw() {
    head();
    $("testslot").innerHTML = S.test ? '<div class="offl"><div>' + ic("f:warning-circle") + "Test mode. This page is real; the request went to the auditor only.</div></div>" : "";
    var fn = esc(first(S.crew)), af = esc(first(S.auditor));
    var h = '<div class="sec"><span class="eyebrow">Before ' + af + "&#8217;s visit</span>";
    if (S.status !== "sent") {
      h += '<h1 class="h1">Everything is in, ' + fn + '</h1><p class="lead">' + esc(S.auditor) + " has been told. Thank you. Nothing more is needed from this page.</p></div>"
        + '<div class="card pad-m donecard"><span class="fi">' + ic("b:check") + '</span><div><b class="h4">Sent</b><div class="sm">' + S.machines.length + (S.machines.length === 1 ? " press" : " presses") + " · " + S.lines.filter(counted).length + " of " + S.lines.length + " lines counted</div></div></div>";
      $("main").innerHTML = h + countList(); $("side").innerHTML = side(); dock(); return;
    }
    h += '<h1 class="h1">Hi ' + fn + ", three things for " + af + '</h1><p class="lead">Send them by ' + esc(when(S.dueAt)) + ". " + af + " reads them before coming aboard, and only you see this page.</p></div>";
    h += '<div class="card pad-m sec tight" id="prog"></div>';
    h += docTask("p43", "file-text", "", "Pattern 43", "One 12-page scan per press");
    h += docTask("mgmt", "list", "n", "Machine Management List", "The Machine list, 52 pages: print it from the press, then scan it");
    var k = S.lines.filter(counted).length;
    h += '<div class="card task"><span class="fi a">' + ic("package") + '</span><div class="sec tight" style="min-width:0"><div class="hstack" style="justify-content:space-between"><b class="h3">Count the shelf</b><span class="chip ' + (k === S.lines.length ? "g" : "m") + '" id="countchip">' + k + " of " + S.lines.length + '</span></div><p class="sm">Every OBP line. Type the total on the shelf; 0 counts.</p></div></div>';
    h += countList() + downs() + '<div class="card pad-m sec tight hide-m" id="sendcard"></div>';
    $("main").innerHTML = h; $("side").innerHTML = side(); progress(); dock();
  }

  function send(file, serial, kind) {
    var k = serial + "|" + kind;
    if (file.size > 24 * 1024 * 1024) { toast("The file is " + Math.round(file.size / 1048576) + " MB; the limit is 24 MB. Scan at a lower resolution."); return; }
    busy[k] = { pct: 0 }; draw();
    var x = new XMLHttpRequest();
    x.open("POST", q("/api/audit/u/upload?serial=" + encodeURIComponent(serial) + "&kind=" + kind));
    x.setRequestHeader("Content-Type", file.type || "application/pdf");
    x.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "file")); // a header is Latin-1 only: "Dexter’s scan.pdf" threw
    x.upload.onprogress = function (e) { if (e.lengthComputable) { busy[k] = { pct: Math.round(e.loaded / e.total * 100) }; draw(); } };
    x.onerror = function () { delete busy[k]; draw(); toast("No connection. Choose the file again."); };
    x.onload = function () {
      var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
      if (!j.ok) { delete busy[k]; draw(); toast(j.say || j.error || "Not sent"); return; }
      busy[k] = { text: kind === "mgmt" ? "Reading" : "Measuring" }; draw();
      api("/api/audit/u/read?id=" + encodeURIComponent(j.id), {}).then(function () { delete busy[k]; load(); });
    };
    x.send(file);
  }
  // One save at a time, and every caller learns whether the numbers landed (true / false): Send waits for the save
  // already on its way and goes only once nothing is left unsaved (23 Oct 2026 review: the 800 ms auto-save had already
  // taken the numbers, so Send found nothing queued and filed the request ahead of the crew's last count). The keepalive
  // save on leaving the page goes at once, never behind the queue.
  var saving = Promise.resolve(true);
  function flush(keep) {
    if (keep) return saveOnce(true);
    saving = saving.then(function () { return saveOnce(false); }, function () { return saveOnce(false); });
    return saving;
  }
  function saveOnce(keep) {
    var counts = {}, any = false;
    Object.keys(pend).forEach(function (k) { if (k.indexOf("c:") === 0) { counts[k.slice(2)] = pend[k]; delete pend[k]; any = true; } });
    if (!any) return Promise.resolve(true);
    return api("/api/audit/u/count", { counts: counts }, keep).then(function (j) {
      if (j && j.ok === false) {
        // not saved: the numbers go back in the queue (a newer keystroke wins) and are tried again
        Object.keys(counts).forEach(function (p) { if (!("c:" + p in pend)) pend["c:" + p] = counts[p]; });
        toast(j.say || "Not saved"); clearTimeout(timer); timer = setTimeout(flush, 5000); return false;
      }
      return load(true).then(function () { return true; }, function () { return true; });
    });
  }
  function setCount(part, v) {
    S.counted[part] = v === "" ? null : Number(v);
    pend["c:" + part] = v;
    var inp = document.querySelector('input[data-part="' + part + '"]'); if (inp) { if (inp.value !== v) inp.value = v; var b = inp.closest(".qty"); if (b) b.className = "qty" + (v === "" ? "" : " on"); }
    head(); progress(); clearTimeout(timer); timer = setTimeout(flush, 800);
  }

  document.addEventListener("change", function (e) { var t = e.target; if (t.type === "file" && t.files && t.files[0]) send(t.files[0], t.getAttribute("data-serial"), t.getAttribute("data-kind")); });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute("data-part")) { t.value = t.value.replace(/[^0-9]/g, "").slice(0, 5); setCount(t.getAttribute("data-part"), t.value); }
    if (t.getAttribute && t.getAttribute("data-reason")) pend["r" + t.getAttribute("data-reason")] = t.value;
    if (t.id === "find") { find = t.value; var cr = $("crows"); if (cr) cr.innerHTML = rowsFor(); }
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-f")) { flush(); filter = t.getAttribute("data-f"); picked = true; draw(); return; }
    if (t.hasAttribute("data-faq")) { var i = Number(t.getAttribute("data-faq")); faq = faq === i ? -1 : i; $("side").innerHTML = side(); return; }
    if (t.id === "xopen") { addOpen = !addOpen; draw(); var xt = $("xt"); if (xt) xt.focus(); return; }
    if (t.id === "nextc") { var all = document.querySelectorAll("input[data-part]"), n = null; for (var j = 0; j < all.length && !n; j++) if (!all[j].value) n = all[j]; if (n) { n.scrollIntoView({ block: "center", behavior: "smooth" }); n.focus(); } return; }
    if (t.hasAttribute("data-opendown")) { openDown[t.getAttribute("data-opendown")] = 1; draw(); var ta = document.querySelector('[data-reason="' + t.getAttribute("data-opendown") + '"]'); if (ta) ta.focus(); return; }
    if (t.hasAttribute("data-canceldown")) { delete openDown[t.getAttribute("data-canceldown")]; draw(); return; }
    if (t.hasAttribute("data-savedown")) {
      var sn = t.getAttribute("data-savedown"), r = (pend["r" + sn] || "").trim();
      if (!r) { $("err" + sn).textContent = "Write why it is down."; return; }
      api("/api/audit/u/down", { serial: sn, reason: r, down: true }).then(function (j) { if (j.ok) { delete openDown[sn]; delete pend["r" + sn]; load(); } else toast(j.say || "Not saved"); });
      return;
    }
    if (t.hasAttribute("data-undown")) { api("/api/audit/u/down", { serial: t.getAttribute("data-undown"), down: false }).then(load); return; }
    if (t.id === "submit") {
      t.disabled = true;
      flush().then(function (saved) {
        if (!saved) { t.disabled = false; return; } // the save said why (its toast); nothing is sent with a number missing
        return api("/api/audit/u/submit", {}).then(function (j) { if (j && j.ok) load(); else { t.disabled = false; toast((j && j.say) || "Not sent"); load(); } });
      });
      return;
    }
    if (t.id === "xadd") {
      var tx = $("xt").value.trim(); if (!tx) { toast("Write the item"); return; }
      api("/api/audit/u/count", { extras: [{ text: tx, counted: $("xn").value }] }).then(function (j) { if (j.ok) { addOpen = false; load(); } else toast(j.say || "Not saved"); });
    }
  });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(true); });
  window.addEventListener("pagehide", function () { flush(true); }); // keepalive: a plain fetch is dropped on unload
  load();
})();
`;
