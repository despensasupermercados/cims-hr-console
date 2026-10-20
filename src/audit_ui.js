// PRINTSHOP AUDIT — Dexter's page, v2 (14 Oct 2026; Miguel: "the idea behind is ok, but the UI and UX is horrible ..
// design it better"). Phone first (Dexter's iPhone 17, Safari, Add to Home Screen); the web is the same column.
// The same design language as the seafarer's upload page (src/audit_upload_ui.js): a deep navy header that says where
// you are, white cards on a grey page, Phosphor icons (src/audit_icons.js, generated, never hand-drawn), status said in
// sentence case with an icon and a colour, a progress bar wherever there is a "N of M", one primary button at the
// bottom. Screens: Ships (open requests first) -> who -> the briefing -> the request -> waiting / everything is in ->
// the audit on the ship, seven steps (19 Oct 2026) -> the filed audit.
// String.raw keeps the client script's backslashes literal; nothing in it may use a backtick or a dollar-brace —
// scripts/verify_client_scripts.mjs parses this script on every build and test run.
import { ICONS } from "./audit_icons.js";
import { AUDIT_RULES_JS } from "./audit_steps.js";
import { AUDIT_NAME, AUDIT_SHORT, markSvg } from "./audit_brand.js";
import { AUDIT_CSS } from "./audit_ui_css.js";

export const AUDIT_MANIFEST = (onAuditHost) => JSON.stringify({
  name: AUDIT_NAME, short_name: AUDIT_SHORT, start_url: onAuditHost ? "/" : "/audit", scope: onAuditHost ? "/" : "/audit",
  display: "standalone", background_color: "#EEF1F6", theme_color: "#1B3A5C",
  icons: [{ src: "/audit/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/audit/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/audit/icon-180.png", sizes: "180x180", type: "image/png" }],
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
<title>Printshop Ops Audit</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#142D48">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Ops Audit">
<link rel="apple-touch-icon" href="/audit/icon-180.png">
<link rel="icon" href="/audit/favicon.ico">
<link rel="manifest" id="mf" href="/audit/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">
<style>` + AUDIT_CSS + String.raw`</style>
</head><body>
<header class="appbar"><div class="appbar-in"><a class="brand" href="#" aria-label="Printshop Ops Audit, home">` + markSvg(36) + String.raw`<b>Printshop Ops Audit</b></a><span class="who" id="who"></span><button class="ib" id="ibh" data-go="hist" aria-label="History" title="History"></button><button class="ib" id="ibf" data-go="fu" aria-label="Follow-ups" title="Follow-ups"></button></div></header>
<div class="offl" id="offl" hidden><div>No signal. What you see was loaded earlier.</div></div>
<main class="wrap" id="main"><div class="card clip"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div></main>
<div id="dockslot"></div>
<script>window.__IC=` + JSON.stringify(ICONS) + String.raw`;window.__MARK=` + JSON.stringify(markSvg(40)) + String.raw`;</script>
<script>` + AUDIT_RULES_JS + String.raw`</script>
<script>
(function () {
  "use strict";
  var S = { me: null, today: null, ships: null, counts: null, hist: null, hf: "All", q: "", brief: {}, cust: null, shut: {}, more: {} };
  var IC = window.__IC || {};
  var $ = function (id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ic(n, cls) { return (IC[n] || "").replace("<svg ", '<svg class="ic' + (cls ? " " + cls : "") + '" '); }
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtD(d, withYear) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); if (p.length < 3) return esc(d); var s = MON[Number(p[1]) - 1] + " " + Number(p[2]); return withYear || p[0] !== String(S.today || "").slice(0, 4) ? s + ", " + esc(p[0]) : s; }
  function first(n) { return String(n || "").split(" ")[0]; }
  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
  /* time is said in months and days, never a day count (Miguel, 16 Oct 2026: "we dont count days .. never .. 4m 27days"):
     calendar months from the dates, then the days left, month-end clamped (Jul 31 -> Mar 1 = 7 mo 1 d) */
  function md(a, b) {
    a = String(a || "").slice(0, 10); b = String(b || "").slice(0, 10);
    if (!/^\d{4}-\d\d-\d\d$/.test(a) || !/^\d{4}-\d\d-\d\d$/.test(b) || b < a) return "";
    var m = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)), d = +b.slice(8, 10) - +a.slice(8, 10);
    if (d < 0) { m--; var ay = +a.slice(0, 4), am = +a.slice(5, 7) - 1 + m, ad = Math.min(+a.slice(8, 10), new Date(Date.UTC(ay, am + 1, 0)).getUTCDate()); d = Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(ay, am, ad)) / 864e5); }
    return m ? m + " mo" + (d ? " " + d + " d" : "") : d + " d";
  }
  function pct(a, b) { return b > 0 ? Math.max(0, Math.min(100, Math.round(a * 100 / b))) : 0; }
  function whenUtc(v) { var d = new Date(v); if (isNaN(d)) return ""; return MON[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) + " UTC"; }
  function left(v) { var ms = Date.parse(v) - Date.now(); if (isNaN(ms)) return ""; if (ms <= 0) return "past due"; var h = Math.floor(ms / 3600000); return h >= 1 ? h + " h left" : Math.max(1, Math.round(ms / 60000)) + " min left"; }

  /* THE SHELL (the redesign of 20 Oct 2026, canvas 45Hsjnr7Vr6f1BPussctg3): a white app bar with the mark and the name,
     who is signed in and today, History and Follow-ups as two icon buttons; every screen draws its own head inside the
     page. The main action sits in the page on a computer and in a bar at the bottom on a phone (dock). */
  function meName() { var s = String(S.me || "").split("@")[0]; return s.split(/[._]+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(" "); }
  function chrome(on) {
    var nm = first(meName());
    $("who").textContent = (nm ? nm + " · " : "") + (S.today ? fmtD(S.today, true) : "");
    $("ibh").className = "ib" + (on === "hist" ? " on" : "");
    $("ibf").className = "ib" + (on === "fu" ? " on" : "");
    var n = S.counts && S.counts.openFollowups ? S.counts.openFollowups : 0, b = $("fub");
    if (b) { b.hidden = !n; b.textContent = n ? String(n) : ""; }
    $("ibf").setAttribute("aria-label", n ? "Follow-ups, " + n + " open" : "Follow-ups");
  }
  function head(o) {
    return '<div class="sec' + (o.tight ? " tight" : "") + '">' + (o.back ? '<button type="button" class="arrow" data-go="' + esc(o.back[0]) + '">' + ic("arrow-left") + esc(o.back[1]) + "</button>" : "")
      + (o.eyebrow ? '<span class="eyebrow">' + esc(o.eyebrow) + "</span>" : "") + (o.title ? '<h1 class="h1">' + o.title + "</h1>" : "") + (o.lead ? '<p class="lead">' + o.lead + "</p>" : "") + (o.more || "") + "</div>";
  }
  function top() {} /* the screens not redrawn yet; removed with the last of them */
  function hero() {}
  function dock(html) { $("dockslot").innerHTML = html ? '<div class="dock">' + html + "</div>" : ""; }
  function skel(n) { var h = '<div class="card clip">'; for (var i = 0; i < (n || 3); i++) h += '<div class="sk"></div>'; return h + "</div>"; }
  function prog(label, a, b, cls) { return '<div class="sec tight"><div class="hstack" style="justify-content:space-between"><span class="xs">' + label + '</span><span class="xs b">' + a + " of " + b + '</span></div><div class="prog"><i style="width:' + pct(a, b) + '%' + (cls === "late" ? ";background:var(--redm)" : cls === "navy" ? ";background:var(--navy)" : "") + '"></i></div></div>'; }

  /* Every read has a ceiling (19 Oct 2026, Miguel: "something is broken or taking way to long to load"). A request that
     never answers (a stalled connection, a laptop woken from sleep) left the home on its placeholders for ever: fetch has
     no limit of its own. Past the ceiling it fails the way a lost connection does (a TypeError), so a screen that falls
     back to what the phone kept does so, and the others say it with Try again. */
  function api(u, ms) {
    ms = ms || 30000;
    var ctl = typeof AbortController === "function" ? new AbortController() : null, tm = null;
    var req = fetch(u, { credentials: "same-origin", cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (r.status === 401) { location.href = "/login"; throw new Error("signed out"); }
      return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status)); return j; });
    });
    var limit = new Promise(function (ok, no) { tm = setTimeout(function () { if (ctl) ctl.abort(); no(new TypeError("no answer in " + Math.round(ms / 1000) + " s")); }, ms); });
    return Promise.race([req, limit]).then(function (v) { clearTimeout(tm); return v; }, function (e) { clearTimeout(tm); throw e; });
  }
  function post(u, body) {
    return fetch(u, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { if (r.status === 401) { location.href = "/login"; throw new Error("signed out"); } return r.json().then(function (j) { j._status = r.status; return j; }); });
  }
  var WHY = { no_ship_mailbox: "No printshop mailbox for this ship in the ship contacts.", hon_unavailable: "HON did not answer. The machines and the OBP list come from it; try again in a minute.",
    no_presses: "HON's register has no press for this ship.", already_open: "A request is already open for this crew.", not_sent: "The email did not go. Nothing was sent; try again.", crew_not_found: "This crew is not in the console.", no_obp_list: "HON has no OBP stock list for this ship, so there is nothing to count.", not_aboard: "The board does not have this seafarer aboard this ship." };
  /* a lost connection reads as one, never the browser's "Failed to fetch" */
  function why(e) { var m = String((e && e.message) || e || ""); return e && e.name === "TypeError" && m.indexOf("no answer") !== 0 ? "no connection" : m; }
  function fail(e) { $("main").innerHTML = '<div class="err">' + ic("warning-circle") + "<span>Could not load: " + esc(why(e)) + ".</span>" + '<button class="retry" data-retry>Try again</button></div>'; dock(""); }

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

  /* ---------------- A1 · The landing (canvas board "Main") ----------------
     Pick the customer, and its ships line up by what Dexter has to do: contracts ending within 30 days with no audit
     first, then every other contract not audited, then the ones audited this contract, then the hulls nobody is aboard.
     An audit belongs to the contract it was asked in (Miguel, 16 Oct 2026): the server says it per seafarer (audit). */
  var CUSTS = [["Royal", "Royal Caribbean"], ["Celebrity", "Celebrity"], ["Azamara", "Azamara"], ["NCL", "NCL"]];
  function brandOf(s) { return s.brand === "Royal" ? "Royal Caribbean" : (s.brand || ""); }
  function custOf(s) { return s.brand || "Other"; }
  function custName(k) { for (var i = 0; i < CUSTS.length; i++) if (CUSTS[i][0] === k) return CUSTS[i][1]; return k; }
  function contractNo(c) { var m = /on contract (\d+)/i.exec(c.contract || ""); return m ? "contract " + m[1] : String(c.contract || "").toLowerCase(); }
  /* the seafarer a ship's line is about: the one aboard longest, whose contract ends first; the other is "with" them */
  function lead(s) { return (s.aboard || []).slice().sort(function (a, b) { return String(a.signOn || "9999").localeCompare(String(b.signOn || "9999")); })[0] || null; }
  function bandOf(s) {
    var c = lead(s); if (!c) return "empty";
    if (c.audit && c.audit.grade != null) return "done";
    if (c.heldByFile || (c.signOff && c.signOff < S.today)) return "soon";
    if (c.signOff && S.today && days(S.today, c.signOff) <= 30) return "soon";
    return "later";
  }
  function goOf(s) { var c = lead(s); return c ? ' data-ship="' + esc(s.ship) + '" data-sc="' + esc(c.sc) + '"' : ""; }
  function reqChip(r) {
    if (!r) return "";
    if (r.grade != null) return '<span class="chip ' + (r.grade <= 3 ? "r" : "g") + '">Score ' + esc(r.grade) + "/5</span>";
    if (r.status === "complete") return '<span class="chip n">Documents in</span>';
    if (r.status === "sent" && (r.overdue || (r.due && Date.parse(r.due) < Date.now()))) return '<span class="chip r">Past the deadline</span>';
    if (r.status === "sent") return '<span class="chip n">Waiting · ' + esc(left(r.due)) + "</span>";
    if (r.status === "draft") return '<span class="chip m">Being sent</span>';
    return "";
  }
  function shipLine(s) {
    var c = lead(s), band = bandOf(s);
    if (!c) return '<div class="frow off"><div style="min-width:0"><b class="h4">' + esc(s.ship) + '</b><div class="sm">Nobody aboard per the TDG file</div></div><div class="mid"></div><div class="end"><span class="chip m">Nobody aboard</span></div></div>';
    var others = s.aboard.filter(function (x) { return x.sc !== c.sc; });
    var chips = (c.audit && c.audit.grade == null ? reqChip(c.audit) : "") + (others.length ? '<span class="chip m">' + (others.length + 1) + " aboard</span>" : "");
    var who = esc(c.name) + (contractNo(c) ? " · " + esc(contractNo(c)) : "") + (others.length ? " · with " + others.map(function (o) { return esc(o.name) + (o.signOn ? " since " + fmtD(o.signOn) : ""); }).join(", ") : "");
    var past = c.heldByFile || (c.signOff && c.signOff < S.today), tot = c.signOn && c.signOff ? Math.max(1, days(c.signOn, c.signOff)) : 0;
    var p = past ? 100 : tot ? pct(days(c.signOn, S.today), tot) : 0, inSpan = c.signOff && !past ? md(S.today, c.signOff) : "";
    var bar = past ? "var(--redm)" : band === "soon" ? "var(--amberm)" : "var(--green)";
    var leftT = c.signOn ? "Aboard " + (md(c.signOn, S.today) || "since today") : "";
    var rightT = past ? "Was due " + fmtD(c.signOff) + " · TDG still has them aboard" : c.signOff ? "Ends " + fmtD(c.signOff) : "";
    var end = band === "done" ? reqChip(c.audit) : past ? '<span class="chip r">Past the sign-off</span>' : inSpan ? '<span class="chip ' + (band === "soon" ? "a" : "m") + '">Ends in ' + esc(inSpan) + "</span>" : "";
    return '<button type="button" class="frow"' + goOf(s) + '><div style="min-width:0"><div class="hstack" style="gap:8px"><b class="h4">' + esc(s.ship) + "</b>" + chips + '</div><div class="sm ell">' + who + "</div></div>"
      + '<div class="mid"><div class="xs mid-t"><span>' + esc(leftT) + "</span><span>" + esc(rightT) + (inSpan ? '<span class="m-inl"> · in ' + esc(inSpan) + "</span>" : "") + '</span></div><div class="prog thin"><i style="width:' + p + "%;background:" + bar + '"></i></div></div>'
      + '<div class="end">' + end + '<span class="chev">' + ic("caret-right") + "</span></div></button>";
  }
  function soonest(a, b) { var x = lead(a), y = lead(b); return String(x && x.signOff || "9999").localeCompare(String(y && y.signOff || "9999")) || a.ship.localeCompare(b.ship); }
  function group(key, dot, title, sub, list, cap, startShut) {
    if (!list.length && key !== "done") return "";
    var shut = S.shut[key] == null ? !!startShut : S.shut[key], more = !!S.more[key], canMore = !!cap && list.length > cap, off = !list.length;
    var h = '<div class="card clip"><div class="grp-hd"><span class="dot ' + dot + '"></span><div><b class="h4">' + esc(title) + '</b><div class="sm">' + sub + "</div></div>"
      + '<button type="button" class="fold' + (off ? " off" : shut ? " shut" : "") + '"' + (off ? " disabled" : ' data-fold="' + key + '"') + ' aria-label="' + (off ? "Nothing to open" : (shut ? "Open " : "Fold ") + esc(title)) + '" aria-expanded="' + (!shut && !off) + '">' + ic("caret-down") + "</button></div>";
    if (!shut && !off) {
      h += (canMore && !more ? list.slice(0, cap) : list).map(shipLine).join("");
      if (canMore) h += '<button type="button" class="more" data-more="' + key + '">' + (more ? "Show fewer" : "Show all " + list.length) + ic("arrow-right") + "</button>";
    }
    return h + "</div>";
  }
  function inProgress(list) {
    if (!list.length) return "";
    if (list.length > 1) {
      return '<section class="navy sec"><span class="eyebrow">In progress · ' + list.length + ' requests</span><h2 class="h2">One request open per ship</h2><div class="ipl">'
        + list.map(function (s) { var r = s.last; return '<button type="button" class="ipr arrow" data-go="q=' + esc(r.id) + '" style="min-height:0;font-weight:400"><span><b class="h4">' + esc(s.ship) + '</b><span class="sm" style="display:block">' + esc(r.crew) + "</span></span>" + reqChip(r) + "</button>"; }).join("") + "</div></section>";
    }
    var s = list[0], r = s.last, fn = esc(first(r.crew)), c = (s.aboard || []).filter(function (x) { return x.sc === r.sc; })[0];
    var late = r.status === "sent" && (r.overdue || (r.due && Date.parse(r.due) < Date.now()));
    var title = r.status === "complete" ? esc(s.ship) + " is ready for the visit" : late ? fn + " has not sent everything" : r.status === "sent" ? "Waiting on " + fn + "'s documents" : esc(s.ship) + ": the request is being sent";
    var sameDay = r.in && r.sent && r.in === r.sent, gap = r.in && r.sent ? md(r.sent, r.in) : "";
    var leadT = r.status === "complete" ? esc(r.crew) + " sent everything" + (r.in ? " on " + fmtD(r.in) : "") + (sameDay ? ", the day it was asked." : gap ? ", " + esc(gap) + " after it was asked." : ".") + (c && c.signOff ? " The contract ends " + fmtD(c.signOff) + (md(S.today, c.signOff) ? ", in " + esc(md(S.today, c.signOff)) : "") + "." : "")
      : r.status === "sent" ? "Asked " + fmtD(r.sent || r.at) + "." + (r.due ? (late ? " The deadline passed " + esc(whenUtc(r.due)) + "." : " Due " + esc(whenUtc(r.due)) + ", " + esc(left(r.due)) + ".") : "") : "";
    var cta = r.status === "complete"
      ? '<button type="button" class="btn green" data-go="a=' + esc(r.id) + '|1">Start the audit</button><button type="button" class="btn white" data-go="b=' + esc(encodeURIComponent(s.ship)) + "|" + esc(encodeURIComponent(r.sc)) + '">See the briefing' + ic("arrow-right") + "</button>"
      : '<button type="button" class="btn white" data-go="q=' + esc(r.id) + '">Open the request' + ic("arrow-right") + "</button>";
    var st = function (cls, dot, t) { return '<div class="ck ' + cls + '"><span class="' + dot + '">' + (dot === "c" ? ic("b:check") : "") + "</span><span>" + t + "</span></div>"; };
    var steps = st("", "c", "Asked" + ((r.sent || r.at) ? " · " + fmtD(r.sent || r.at) : ""))
      + (r.status === "complete" ? st("", "c", "Documents in" + (r.in ? " · " + fmtD(r.in) : "")) : st("cur", "o on", r.due ? "Documents · due " + fmtD(r.due) : "Documents"))
      + st(r.status === "complete" ? "cur" : "todo", r.status === "complete" ? "o on" : "o", "Audit on board") + st("todo", "o", "Filed");
    return '<section class="navy inprog"><div class="sec tight"><span class="eyebrow">In progress · 1 request</span><h2 class="h2">' + title + '</h2><p class="lead">' + leadT + '</p><div class="cta" style="margin-top:8px">' + cta + '</div></div><div class="steps">' + steps + "</div></section>";
  }
  function custTiles(byCust, keys) {
    return '<section class="tiles' + (keys.length % 2 ? " odd" : "") + '" aria-label="Customers" style="--n:' + Math.max(1, Math.min(4, keys.length)) + '">' + keys.map(function (k) {
      var list = byCust[k], crewed = list.filter(function (s) { return lead(s); }).length, soon = list.filter(function (s) { return bandOf(s) === "soon"; }).length;
      return '<button type="button" class="tile' + (S.cust === k ? " on" : "") + '" data-cust="' + esc(k) + '" aria-pressed="' + (S.cust === k) + '"><span class="tile-top"><b class="tile-name">' + esc(custName(k)) + "</b></span>"
        + '<span class="sm">' + list.length + (list.length === 1 ? " ship" : " ships") + " · " + (crewed === list.length ? "all crewed" : crewed + " crewed") + "</span>"
        + '<span class="tile-alert ' + (soon ? "a" : "g") + '">' + (soon ? soon + (soon === 1 ? " ends" : " end") + " within 30 days" : "Nothing ends within 30 days") + "</span></button>";
    }).join("") + "</section>";
  }
  function greeting() { var h = new Date().getHours(), nm = first(meName()); return (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + (nm ? ", " + nm : ""); }
  /* the head and the search box are drawn once; typing redraws the list under them, never the box (a redrawn box closes
     the phone's keyboard) */
  function shipsView() {
    S.view = "home"; chrome(""); dock("");
    $("main").innerHTML = '<section class="sec" style="max-width:760px"><span class="eyebrow" id="greet">' + esc(greeting()) + '</span><h1 class="h1">Which customer are we auditing?</h1><p class="lead">Pick one and its ships line up by what is due. Or search any ship or crew across every customer.</p>'
      + '<div class="search">' + ic("magnifying-glass") + '<input id="q" type="search" placeholder="Search ship or crew" aria-label="Search ship or crew" autocomplete="off" value="' + esc(S.q) + '"><button type="button" class="clr" id="qx" aria-label="Clear search"' + (S.q ? "" : " hidden") + ">" + ic("x") + '</button></div></section><div class="sec" id="lres" style="gap:40px"></div>';
    var qi = $("q"), qx = $("qx");
    if (qi && qi.addEventListener) qi.addEventListener("input", function () { S.q = qi.value; if (qx) qx.hidden = !S.q; shipsList(); });
    if (qx && qx.addEventListener) qx.addEventListener("click", function () { S.q = ""; qi.value = ""; qx.hidden = true; shipsList(); if (qi.focus) qi.focus(); });
    shipsList();
  }
  function shipsList() {
    var q = S.q.toLowerCase().trim(), h = keptLine();
    if (!S.ships) { $("lres").innerHTML = h + (S.slow ? '<div class="kept">' + ic("hourglass-medium") + "<span>Still loading the ships.</span></div>" : "") + skel(4); return; }
    var byCust = {}, keys = [];
    S.ships.forEach(function (s) { var k = custOf(s); if (!byCust[k]) { byCust[k] = []; keys.push(k); } byCust[k].push(s); });
    keys.sort(function (a, b) { var ia = CUSTS.map(function (c) { return c[0]; }).indexOf(a), ib = CUSTS.map(function (c) { return c[0]; }).indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    if (!S.cust || !byCust[S.cust]) S.cust = keys.filter(function (k) { return byCust[k].some(function (s) { return bandOf(s) === "soon"; }); })[0] || keys[0];
    h += custTiles(byCust, keys);
    if (q) {
      var hits = S.ships.filter(function (s) { return (s.ship + " " + s.aboard.map(function (c) { return c.name; }).join(" ")).toLowerCase().indexOf(q) >= 0; }).sort(soonest);
      h += '<section class="sec"><div class="sec-hd"><h2 class="h2">' + (hits.length ? hits.length + (hits.length === 1 ? " ship matches" : " ships match") : "No ship matches") + " “" + esc(S.q) + "”</h2>" + '<span class="sm">Across every customer</span></div>'
        + (hits.length ? '<div class="card clip">' + hits.map(shipLine).join("") + "</div>" : '<div class="card"><div class="empty">' + ic("boat") + "Try a ship or a crew name.</div></div>") + "</section>";
    } else {
      h += inProgress(S.ships.filter(function (s) { return s.open && s.last; }));
      var mine = byCust[S.cust] || [], by = function (b) { return mine.filter(function (s) { return bandOf(s) === b; }).sort(soonest); };
      var soon = by("soon"), later = by("later"), done = by("done"), empty = by("empty");
      h += '<section class="sec"><div class="sec-hd"><h2 class="h2">' + esc(custName(S.cust)) + ' ships</h2><span class="sm">An audit belongs to the contract: each line says whether this contract has one</span></div>'
        + group("soon", "a", "Ends within 30 days, not audited", soon.length + (soon.length === 1 ? " contract" : " contracts") + " · soonest first · ask for documents now", soon, 0, false)
        + group("later", "m", "Not audited this contract", later.length + " · soonest sign-off first", later, 5, false)
        + group("done", "g", "Audited this contract", done.length ? done.length + " · with the score" : "None yet · a filed audit moves the ship here with its score", done, 0, false)
        + group("empty", "m", "Nobody aboard", empty.map(function (s) { return esc(s.ship); }).join(", ") + " · per the TDG file", empty, 0, true)
        + "</section>";
    }
    $("lres").innerHTML = h;
  }

  /* ---------------- Who: an old link to a ship opens the briefing of the seafarer whose contract ends first ---------------- */
  function contractBar(c) {
    if (!c.signOn || !c.signOff) return "";
    var tot = Math.max(1, days(c.signOn, c.signOff)), d = Math.max(0, days(c.signOn, S.today));
    return '<div class="prog thin"><i style="width:' + pct(d, tot) + "%" + (d > tot ? ";background:var(--redm)" : "") + '"></i></div>';
  }
  function shipView(ship) {
    if (!S.ships) { chrome(""); dock(""); $("main").innerHTML = skel(3); return; }
    var s = S.ships.filter(function (x) { return x.ship === ship; })[0], c = s && lead(s);
    if (!s || !c) { location.replace("#"); return; }
    location.replace("#b=" + encodeURIComponent(s.ship) + "|" + encodeURIComponent(c.sc));
  }

  /* ---------------- A2 · The briefing ---------------- */
  var KIND = { feedback: "Feedback", intel: "Field intel", review: "Shipboard review", note: "Note", comment: "Comment" };
  /* ONE PERSON AT A TIME PER SHIP (Miguel, 20 Oct 2026: "we do 1 person at the time per ship"): while another seafarer's
     request is open on this ship, there is no Request button, only the way to it */
  function stop(t) { return /[.!?]$/.test(t) ? t : t + "."; } /* "A.J." ends its own sentence */
  function shipBusy(ship, openCrew, crew, id) {
    return '<div class="note" style="margin:0 0 10px">One audit at a time per ship: file ' + esc(first(openCrew)) + "'s, then ask " + esc(stop(first(crew))) + "</div>"
      + '<button class="btn" data-go="q=' + esc(id) + '">' + ic("hourglass-medium") + "Open " + esc(first(openCrew)) + "'s request</button>";
  }
  function shipBusyCard(ship, openCrew) {
    return '<div class="card"><div class="empty">' + ic("hourglass-medium") + "<span>" + esc(first(openCrew)) + "'s request is still open on " + esc(ship) + ".</span></div></div>";
  }
  function needCard(fn, machines, lines) {
    var q = function (v) { return v == null ? "" : '<span class="q">' + esc(v) + "</span>"; };
    return '<div class="card"><div class="ch">' + ic("list-checks") + "What " + esc(fn) + ' sends before you arrive</div>' +
      '<div class="need"><span class="ib">' + ic("printer") + '</span><div class="tx"><div class="t">Pattern 43</div><div class="s">12 pages, one per machine</div></div>' + q(machines) + "</div>" +
      '<div class="need"><span class="ib">' + ic("files") + '</span><div class="tx"><div class="t">Machine Management List</div><div class="s">The long report with the life %, one per machine</div></div>' + q(machines) + "</div>" +
      '<div class="need"><span class="ib">' + ic("package") + '</span><div class="tx"><div class="t">Blind count</div><div class="s">Every OBP part, counted without seeing the system</div></div>' + q(lines) + "</div>" +
      '<div class="foot">' + ic("lock-simple") + "<span>The audit opens only when all of it is in. 24 hours to upload.</span></div></div>";
  }
  /* Rush orders this contract (src/rush_orders.js): what the order portal tagged as a MISS on this ship while he was
     aboard, and what it cost. A vessel-side miss says whose it is, by the Score Card's own rule. No read = no card. */
  var RUSH_IC = { vessel: "f:warning-circle", equipment: "wrench", shore: "anchor" };
  function usd(v) { var n = Number(v) || 0; return n > 0 && n < 1 ? "<$1" : "$" + Math.round(n).toLocaleString("en-US"); }
  function rushCard(r, ship, who) {
    if (!r || !r.from) return "";
    var h = '<div class="card rush"><div class="ch">' + ic("truck") + "Rush orders this contract" + (r.count ? '<span class="r">' + usd(r.total) + "</span>" : "") + "</div>";
    if (!r.count) {
      h += '<div class="need"><span class="ib g">' + ic("f:check-circle") + '</span><div class="tx"><div class="t">None</div><div class="s">No order tagged as a miss for ' + esc(ship) + " since " + fmtD(r.from) + ".</div></div></div>";
    } else {
      h += '<div class="facts"><div><b>' + r.count + "</b><span>" + (r.count === 1 ? "rush order" : "rush orders") + "</span></div><div><b>" + usd(r.rush) + "</b><span>freight &amp; customs</span></div>" +
        '<div' + (r.his.count ? ' class="bad"' : "") + "><b>" + r.his.count + "</b><span>charged to " + esc(who) + "</span></div></div>";
      r.orders.forEach(function (o) {
        var names = o.items.map(function (i) { return i.name; });
        var what = (names[0] || "Parts") + (names.length > 1 ? " +" + (names.length - 1) : "");
        var tag = o.reason === "vessel" ? (o.his === true ? '<b class="rd">' + esc(o.tag) + "</b>" : o.his === null ? '<b class="am">' + esc(o.tag) + "</b>" : esc(o.tag)) : esc(o.tag);
        h += '<details><summary class="need"><span class="ib ' + (o.reason === "vessel" && o.his ? "r" : "") + '">' + ic(RUSH_IC[o.reason] || "truck") + '</span><div class="tx"><div class="t">' + fmtD(o.at) + " · " + esc(what) + '</div><div class="s">' + tag + "</div></div>" + '<span class="q">' + usd(o.total) + "</span>" + ic("caret-right", "go") + "</summary>";
        if (o.reason === "vessel") {
          var v = o.his === true ? '<b class="rd">' + esc(who) + "&#8217;s miss</b>" + (o.why ? " · " + esc(o.why) : "")
            : o.his === false ? "Another crew&#8217;s miss" + (o.owner ? ": " + esc(o.owner) : "") + (o.why ? " · " + esc(o.why) : "")
            : '<b class="am">Check whose miss it is</b>';
          h += '<div class="it vd"><span class="n">' + v + "</span></div>";
        }
        if (o.by) h += '<div class="it"><span class="n">Placed by ' + esc(o.by) + "</span></div>";
        if (o.note) h += '<div class="it"><span class="n">&#8220;' + esc(o.note) + "&#8221;</span></div>";
        o.items.forEach(function (i) { h += '<div class="it"><span class="n">' + esc(i.name) + '</span><span class="v">' + esc(i.qty) + " · " + usd(i.value) + "</span></div>"; });
        if (o.rush > 0) h += '<div class="it"><span class="n">Freight &amp; customs</span><span class="v">' + usd(o.rush) + "</span></div>";
        h += '<div class="it ref"><span class="n mono">' + esc(o.ref) + "</span></div></details>";
      });
    }
    h += '<div class="foot">' + ic("clock") + "<span>Orders tagged as a miss on the order portal for " + esc(ship) + ", " + fmtD(r.from) + " to " + (r.to ? fmtD(r.to) : "today") + ". Totals include freight and customs.</span></div></div>";
    return h;
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
        h += '<div class="prog"><div class="lb"><span>Contract</span><b>' + esc(md(cur.on, S.today) || "0 d") + '</b></div><div class="track' + (late ? " late" : "") + '"><i style="width:' + pct(cur.day, cur.of || cur.day) + '%"></i></div><div class="ends"><span>On ' + fmtD(cur.on) + "</span><span>" + (cur.held ? "Past sign-off, TDG has them aboard" : "Off " + fmtD(cur.off, true) + (cur.offSource === "projected" ? ", projected" : "")) + "</span></div></div>";
      }
      h += "</div>";
      var done = (String(c.label || "").match(/^(\d+)/) || [])[1]; if (done == null && /^ongoing/i.test(String(c.label || ""))) done = 0;
      h += '<div class="facts"><div><b>' + esc(done != null ? done : "?") + '</b><span>completed</span></div><div><b>' + (cur && cur.off && md(S.today, cur.off) ? esc(md(S.today, cur.off)) : cur && cur.on ? "Past" : "?") + '</b><span>' + (cur && cur.off && md(S.today, cur.off) ? "to go" : "sign-off") + '</span></div><div><b>' + (b.audits.length || "None") + "</b><span>past audits</span></div></div></div>";
      if (c.source) h += '<div class="note" style="text-align:left;margin:-6px 16px 0">Contracts: ' + esc(c.source).replace(/(\d{4}-\d{2}-\d{2})/g, function (d) { return fmtD(d, true); }) + "</div>";

      h += needCard(first(b.crew.name), b.machines, b.lines);

      if (b.audits.length) {
        h += '<div class="card"><div class="ch">' + ic("clipboard-text") + "Earlier audits</div>";
        b.audits.forEach(function (a) { h += '<button class="row" data-go="q=' + esc(a.id) + '"><div class="tx"><div class="nm" style="font-size:15px">' + esc(a.ship) + '</div><div class="sm">' + fmtD(a.at, true) + (a.test ? " · test" : "") + "</div></div>" + reqStatus(a) + ic("caret-right", "go") + "</button>"; });
        h += "</div>";
      }
      h += rushCard(b.rush, ship, first(b.crew.name));
      var feed = b.feed || [];
      h += '<details class="card fold"><summary class="row"><span class="sq">' + ic("chat-circle-text") + '</span><div class="tx"><div class="nm" style="font-size:15px">What others said</div><div class="sm">' + (feed.length ? feed.length + " on record · newest " + fmtD(feed[0].at, true) : "Nothing on record") + "</div></div>" + ic("caret-right", "go") + "</summary>";
      feed.forEach(function (f) {
        h += '<div class="feed"><div class="w">' + esc(KIND[f.kind] || f.kind) + (f.who ? " · " + esc(f.who) : "") + " · " + fmtD(f.at, true) + (f.rating != null ? " · " + esc(f.rating) + "/5" : "") + '</div><div class="pl">' + esc(f.text) + "</div>";
        var more = (f.others || []).map(function (o) { return '<p class="also">Also reported' + (o.who ? " by " + esc(o.who) : "") + " · " + fmtD(o.at, true) + "</p>" + fullReport(o.full); }).join("");
        if ((f.full && f.full.trim() !== String(f.text || "").trim()) || more) h += '<details class="full"><summary>Full report' + (f.others && f.others.length ? " · " + (f.others.length + 1) + " reports" : "") + "</summary><div>" + fullReport(f.full) + more + "</div></details>";
        h += "</div>";
      });
      h += "</details>";
      $("main").innerHTML = h;
      S.lastBrief = b;
      if (b.open) dock('<button class="btn" data-go="q=' + esc(b.open) + '">' + ic("hourglass-medium") + "Open the request</button>");
      else if (b.shipOpen) dock(shipBusy(ship, b.shipOpen.crew, b.crew.name, b.shipOpen.id));
      else dock('<button class="btn green" data-go="r=' + esc(encodeURIComponent(ship)) + "|" + esc(encodeURIComponent(sc)) + '">' + ic("paper-plane-tilt") + "Request the documents</button>");
    }).catch(function (e) { if (S.view === key) fail(e); }); // a late error never replaces the screen moved on to
  }

  /* ---------------- A3 · The request ---------------- */
  function requestView(ship, sc) {
    top("Request documents", ship, "", "", true); hero(""); dock("");
    $("main").innerHTML = skel(4);
    var key = "r" + ship + "|" + sc; S.view = key;
    api("/api/audit/request/preview?ship=" + encodeURIComponent(ship) + "&sc=" + encodeURIComponent(sc)).then(function (p) {
      if (S.view !== key) return;
      if (p.open) { location.replace("#q=" + p.open.id); return; }
      top("Request documents", ship + " · " + p.crew.name, "", "", true);
      if (p.shipOpen) { $("main").innerHTML = shipBusyCard(ship, p.shipOpen.crew); dock(shipBusy(ship, p.shipOpen.crew, p.crew.name, p.shipOpen.id)); return; }
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
        var bf = S.brief[ship + "|" + sc]; // THIS seafarer's briefing, never the last one drawn
        var contract = bf && bf.contract ? bf.contract.label : null;
        post("/api/audit/request", { ship: ship, sc: sc, contract: contract }).then(function (r) {
          if (r.ok || r.error === "already_open") { S.brief = {}; reloadShips(); location.replace("#q=" + r.id); }
          else if (r.error === "ship_busy") { S.brief = {}; reloadShips(); $("main").innerHTML = shipBusyCard(ship, r.crew); dock(shipBusy(ship, r.crew, p.crew.name, r.id)); }
          else { btn.disabled = false; btn.innerHTML = ic("arrow-clockwise") + "Try again"; $("main").insertAdjacentHTML("afterbegin", '<div class="err">' + ic("warning-circle") + "<span>" + esc(WHY[r.error] || r.detail || r.error) + "</span></div>"); }
        }).catch(function (e) { if (S.view === key) fail(e); }); // a late error never replaces the screen moved on to
      };
    }).catch(function (e) { if (S.view === key) fail(e); }); // a late error never replaces the screen moved on to
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
      var pend = lsGet("aud:p:" + id);
      if (pend && !d.grade) h = '<div class="ban a">' + ic("cloud-slash") + "<span>The audit is filed on this phone. It sends itself when there is signal.</span></div>" + h;
      $("main").innerHTML = h;
      /* A8: once the documents are in, what they found leads the screen (each item comes up in the audit to confirm);
         once filed, the audit itself */
      if (done) (d.grade ? api("/api/audit/visit?id=" + encodeURIComponent(id)) : loadVisit(id)).then(function (v) {
        if (S.view !== key) return;
        if (d.grade) { var gc = $("main").querySelector(".card"); if (gc) gc.insertAdjacentHTML("afterend", filedCard(v)); }
        else { S.v[id] = v; $("main").insertAdjacentHTML("afterbegin", beforeCard(v)); }
      }).catch(function () {});
      var at = lsGet("aud:s:" + id) || 1, started = !!lsGet("aud:d:" + id);
      if (done && !d.grade && !d.test) dock(pend ? "" : '<button class="btn green" data-go="a=' + esc(id) + "|" + at + '">' + ic("clipboard-text") + (started ? "Continue the audit · " + esc(AR.STEPS[at - 1].title) : "Start the audit") + "</button>");
      else if (sent) {
        dock('<div class="two"><button class="btn ghost" id="rs">' + ic("arrow-clockwise") + 'Resend</button><button class="btn ghost" id="ex">' + ic("clock") + 'Add 24 h</button></div><button class="btn txt" id="cx">Cancel request</button>');
        /* one action at a time: a double tap on Add 24 h added 48, a double Resend sent two emails */
        var busy = false, btns = function (on) { ["rs", "ex", "cx"].forEach(function (k) { var b = $(k); if (b) b.disabled = on; }); };
        var act = function (what, confirmText) { return function () {
          if (busy || (confirmText && !confirm(confirmText))) return;
          busy = true; btns(true);
          post("/api/audit/request/" + what, { id: id }).then(function (r) { if (!r.ok) alert(WHY[r.error] || r.detail || r.error || "Not done"); S.brief = {}; reloadShips(); requestDetail(id); })
            .catch(function () { busy = false; btns(false); alert("No connection. Nothing was changed; try again."); });
        }; };
        $("rs").onclick = act("resend", "Send the request again? The old link stops working.");
        $("ex").onclick = act("extend");
        $("cx").onclick = act("cancel", "Cancel this request? The upload link closes.");
      }
    }).catch(function (e) { if (S.view === key) fail(e); }); // a late error never replaces the screen moved on to
  }
  /* ---------------- Dexter's grade, as filed (15 Oct 2026; since 19 Oct the audit's Ratings and Overall steps) ---------------- */
  var RATINGS = [["inventory", "Inventory", "OBP matches the shelf, par kept, parts life tracked"], ["technical", "Technical", "Machines, error codes, maintenance, test prints"], ["collaterals", "Customer collaterals", "Quality of what the ship prints for guests"], ["overall", "Overall", "Leave blank to use the average of the three above"]];
  function gradeCard(g) {
    var h = '<div class="card"><div class="pad"><div class="gsum"><span class="ib ' + (g.score <= 3 ? "r" : "g") + '">' + ic("f:seal-check") + '</span><div><div class="n">' + esc(g.score) + "<small> / 5</small></div>" + '<div class="sm">Audit score · ' + (g.from === "overall" ? "Overall rating" : "average of the ratings, rounded down") + " · filed " + fmtD(g.at, true) + "</div></div></div></div>";
    RATINGS.forEach(function (r) { var v = g[r[0]]; h += '<div class="gline"><span>' + esc(r[1]) + "</span><b>" + (v ? esc(v) + " / 5" : "Not given") + "</b></div>"; });
    if (g.note) h += '<div class="feed"><div class="w">What needs to improve</div><div class="pl">' + esc(g.note) + "</div></div>";
    return h + "</div>";
  }
  function keepShips(r) { lsSet("aud:ships", { at: new Date().toISOString(), today: r.today || null, ships: r.ships, counts: r.counts || null }); }
  function keptWhen(at) {
    var d = new Date(at); if (isNaN(d.getTime())) return "earlier";
    var t = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2), n = new Date();
    return d.toDateString() === n.toDateString() ? t : MON[d.getMonth()] + " " + d.getDate() + ", " + t;
  }
  function keptLine() {
    if (!S.keptAt || !(S.loadErr || S.slow)) return "";
    if (S.loadErr) return '<div class="kept bad">' + ic("cloud-slash") + "<span>Could not update: " + esc(S.loadErr) + ". This is the list from " + esc(keptWhen(S.keptAt)) + '.</span><button class="retry" data-retry>Try again</button></div>';
    return '<div class="kept">' + ic("arrow-clockwise") + "<span>Updating. This is the list from " + esc(keptWhen(S.keptAt)) + ".</span></div>";
  }
  /* the boot read: a ceiling of 15 s, one more try before anything is said, "Still loading" past 3 s */
  function loadHome(again) {
    S.loadErr = null;
    var slow = setTimeout(function () { S.slow = true; if (S.view === "home") shipsList(); }, 3000);
    Promise.all([api("/api/me", 15000), api("/api/audit/ships", 15000)]).then(function (r) {
      clearTimeout(slow); S.slow = false; S.keptAt = null;
      S.me = r[0].email; lsSet("aud:me", S.me); S.today = r[1].today; S.ships = r[1].ships; S.counts = r[1].counts || null; keepShips(r[1]);
      chrome(S.cur === "hist" ? "hist" : S.cur === "fu" ? "fu" : ""); var gr = $("greet"); if (gr && S.view === "home") gr.textContent = greeting();
      if (S.view === "home") shipsList(); else if ((S.cur || "").indexOf("s=") === 0) route(); else if (S.cur === "hist" && S.hist) historyList();
    }, function (e) {
      clearTimeout(slow);
      if (e && e.message === "signed out") return;
      if (!again) return loadHome(true);
      S.slow = false; S.loadErr = why(e);
      if (S.ships) { if (S.view === "home") shipsList(); }
      else if (S.view === "home" || (S.cur || "").indexOf("s=") === 0) fail(e);
    });
  }
  function reloadShips() { S.hist = null; api("/api/audit/ships").then(function (r) { S.ships = r.ships; S.counts = r.counts || S.counts; keepShips(r); }).catch(function () {}); }

  /* ================= B · the audit on the ship (B1–B7), 19 Oct 2026 =================
     Seven steps, one per screen (docs/AUDIT_DESIGN.md Phase B, mock-up v12). The rules that hold Next and File are
     audit_steps.js itself, serialized into this page as window.AR — the server re-checks with the same functions.
     The draft lives on this phone at every tap (localStorage), photos wait in IndexedDB for signal, and a filing made
     without signal is kept and sent when the phone sees the server. */
  var AR = window.AR;
  S.v = {}; S.pq = {}; S.err = {}; /* the photo queue; S.q is the home's search text */
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function loadVisit(id) {
    return api("/api/audit/visit?id=" + encodeURIComponent(id)).then(function (v) { lsSet("aud:v:" + id, v); return v; })
      .catch(function (e) { var c = lsGet("aud:v:" + id); if (c && (navigator.onLine === false || e instanceof TypeError)) { c._offline = true; return c; } throw e; });
  }
  function draftOf(id, v) {
    var d = lsGet("aud:d:" + id);
    if (!d || d.v !== AR.VISIT_VERSION) d = AR.startVisit(ctxOf(v));
    AR.fillVisit(d, ctxOf(v));
    if (!d.openedAt) d.openedAt = new Date().toISOString();
    return d;
  }
  function keep(id, d) { if (!lsSet("aud:d:" + id, d)) toast("This phone could not keep the draft. Keep the app open until you file."); }
  function ctxOf(v) { var obp = {}; (v.parts || []).forEach(function (p) { obp[p.part_no] = p.obp; }); return { machines: v.machines, diff: v.count.diff, extras: v.count.extras, followups: v.followups, obp: obp }; }
  function toast(t) { var n = $("toast"); if (!n) { n = document.createElement("div"); n.id = "toast"; n.className = "toast"; document.body.appendChild(n); } n.textContent = t; n.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(function () { n.classList.remove("on"); }, 3600); }
  function stepBar(n) { var h = ""; for (var i = 1; i <= 7; i++) h += '<button class="' + (i <= n ? "on" : "") + '" data-step="' + i + '" aria-label="Step ' + i + ": " + esc(AR.STEPS[i - 1].title) + '"></button>'; $("stp").innerHTML = h; $("stp").hidden = false; }
  function rateRow(act, k, cur, label) { var h = '<div class="rate">'; for (var n = 1; n <= 5; n++) h += '<button type="button" data-a="' + act + '" data-k="' + k + '" data-v="' + n + '" class="' + (cur === n ? "on" + (n <= 3 ? " lo" : "") : "") + '" aria-pressed="' + (cur === n) + '" aria-label="' + esc(label) + " " + n + '">' + n + "</button>"; return h + "</div>"; }
  function box(field, val, ph, rows) { return '<textarea class="gnote' + (rows === 1 ? " one" : "") + '" data-f="' + field + '" placeholder="' + esc(ph || "") + '">' + esc(val || "") + "</textarea>"; }
  function whyMsg(probs, field) { var p = probs.filter(function (x) { return x.field === field; })[0]; return p && S.err.show ? '<div class="why">' + ic("warning-circle") + esc(p.say) + "</div>" : ""; }
  function itemRow(act, key, label, sub, missing, prevMissing, times) {
    var pill = missing ? (times > 1 ? '<span class="st r">' + esc(AR.ordinal(times)) + " time</span>" : '<span class="st r">Missing</span>') : prevMissing ? '<span class="st m">Missing last time</span>' : "";
    return '<button type="button" class="itm' + (missing ? " miss" : "") + '" data-a="' + act + '" data-k="' + esc(key) + '" aria-pressed="' + !!missing + '"><span class="tx">' + esc(label) + (sub ? ' <span class="sub">· ' + esc(sub) + "</span>" : "") + "</span>" + pill + ic(missing ? "f:x-circle" : "f:check-circle", missing ? "bad" : "ok") + "</button>";
  }
  /* ONE way to answer in the audit (Miguel, 19 Oct 2026, three screens: "the dual thing .. not my favorite"). A row starts in its
     normal state and says so; one tap marks what is wrong (red), a second tap takes it back. words = [normal, wrong]: the normal
     word is printed (muted) only where the label names a problem ("Not seen" beside a Pattern 43 mark). */
  function tapRow(act, key, label, sub, bad, words, attrs) {
    var pill = bad ? '<span class="st r">' + esc(words[1]) + "</span>" : words[0] ? '<span class="st m">' + esc(words[0]) + "</span>" : "";
    return '<button type="button" class="itm' + (bad ? " miss" : "") + '" data-a="' + act + '" data-k="' + esc(key) + '"' + (attrs || "") + ' aria-pressed="' + !!bad + '"><span class="tx">' + esc(label) + (sub ? '<span class="sm">' + sub + "</span>" : "") + "</span>" + pill + ic(bad ? "f:x-circle" : "f:check-circle", bad ? "bad" : "ok") + "</button>";
  }
  var CHECK_SAY = { test: "Test pattern prints clean", scan: "Scan to email works", collab: "Collaboration works" };
  function prevMissing(v, k) { return !!(v.previous && (v.previous.missing || []).indexOf(k) >= 0); }
  function timesFor(v, k) { return prevMissing(v, k) ? ((v.previous.repeat || {})[k] || 1) + 1 : 1; }
  function toggle(list, k) { var i = list.indexOf(k); if (i >= 0) list.splice(i, 1); else list.push(k); }

  /* ---- photos: shrunk on the phone (1600px, JPEG), queued in IndexedDB, sent when there is signal ---- */
  var IDB = null;
  function idb() {
    if (IDB) return IDB;
    IDB = new Promise(function (res, rej) { try { var r = indexedDB.open("cims-audit", 1); r.onupgradeneeded = function () { r.result.createObjectStore("photos", { keyPath: "k" }); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; } catch (e) { rej(e); } });
    IDB.catch(function () {});
    return IDB;
  }
  function idbDo(mode, fn) { return idb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction("photos", mode), st = tx.objectStore("photos"), out = fn(st); tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; tx.onerror = function () { rej(tx.error); }; }); }); }
  function queued(rid) { return idbDo("readonly", function (st) { return st.getAll(); }).then(function (all) { return (all || []).filter(function (r) { return r.rid === rid; }); }).catch(function () { return S.pq[rid] || []; }); }
  function shrink(file) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, 1600 / Math.max(w, h || 1));
        var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { res(b && b.size ? b : file); }, "image/jpeg", 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }
  function addPhoto(rid, step, file) {
    return shrink(file).then(function (b) {
      var rec = { k: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), rid: rid, step: step, type: b.type || file.type || "image/jpeg", blob: b, at: new Date(file.lastModified || Date.now()).toISOString() };
      (S.pq[rid] = S.pq[rid] || []).push(rec);
      return idbDo("readwrite", function (st) { return st.put(rec); }).catch(function () { toast("This phone cannot keep photos offline. Keep the app open until it is sent."); }).then(function () { return flushPhotos(rid); });
    });
  }
  function flushPhotos(rid) {
    if (flushPhotos._busy) return Promise.resolve();
    flushPhotos._busy = true;
    return queued(rid).then(function (list) {
      S.pq[rid] = list;
      var chain = Promise.resolve();
      list.forEach(function (rec) {
        chain = chain.then(function () {
          return fetch("/api/audit/visit/photo?id=" + encodeURIComponent(rid) + "&step=" + encodeURIComponent(rec.step) + "&k=" + encodeURIComponent(rec.k), { method: "POST", credentials: "same-origin", headers: { "Content-Type": rec.type, "X-Taken-At": rec.at }, body: rec.blob })
            .then(function (r) { return r.json(); }).then(function (j) {
              if (!j || !j.ok) return;
              var v = S.v[rid]; if (v && !v.photos.some(function (p) { return p.id === j.id; })) { v.photos.push({ id: j.id, step: rec.step, at: new Date().toISOString() }); lsSet("aud:v:" + rid, v); }
              S.pq[rid] = (S.pq[rid] || []).filter(function (x) { return x.k !== rec.k; });
              return idbDo("readwrite", function (st) { return st.delete(rec.k); }).catch(function () {});
            }).catch(function () {});
        });
      });
      return chain;
    }).then(function () { flushPhotos._busy = false; if (S.redraw) S.redraw(); }, function () { flushPhotos._busy = false; });
  }
  function photoStrip(v, step) {
    var sent = (v.photos || []).filter(function (p) { return p.step === step; }), wait = (S.pq[v.id] || []).filter(function (p) { return p.step === step; });
    var h = '<div class="card"><div class="ch">' + ic("camera") + 'Photos<span class="r">' + (sent.length + wait.length ? sent.length + wait.length + (wait.length ? " · " + wait.length + " waits for signal" : "") : "optional") + "</span></div>";
    if (sent.length || wait.length) {
      h += '<div class="phs">';
      sent.forEach(function (p) { h += '<a class="th" href="/api/audit/visit/photo?f=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener" style="background-image:url(&quot;/api/audit/visit/photo?f=' + encodeURIComponent(p.id) + '&quot;)" aria-label="Photo"></a>'; });
      wait.forEach(function (p) { var u = p._u || (p._u = URL.createObjectURL(p.blob)); h += '<span class="th q" style="background-image:url(&quot;' + u + '&quot;)" title="Waits for signal"></span>'; });
      h += "</div>";
    }
    return h + '<div class="pad" style="padding-top:8px"><label class="btn ghost">' + ic("camera") + 'Take photo<input class="vh" type="file" accept="image/*" capture="environment" data-photo="' + step + '"></label></div></div>';
  }

  /* ---- A8 · the documents are in: what they found, as items the audit will ask to confirm ---- */
  function beforeCard(v) {
    var b = v.before || [];
    var h = '<div class="card"><div class="ch">' + ic("list-checks") + 'Before the visit<span class="r">from the documents</span></div>';
    if (!b.length) h += '<div class="need"><span class="ib">' + ic("f:check-circle") + '</span><div class="tx"><div class="t">Nothing found in the documents</div><div class="s">Pattern 43 clean, no part past rated life, the count agrees with OBP</div></div></div>';
    b.forEach(function (x) { h += '<div class="need"><span class="ib ' + (x.tone === "a" ? "a" : "") + '">' + ic(x.step === "inventory" ? "package" : "printer") + '</span><div class="tx"><div class="t">' + esc(x.t) + '</div><div class="s">' + esc(x.s) + "</div></div></div>"; });
    return h + '<div class="foot">' + ic("clipboard-text") + "<span>Each one comes up in the audit for you to confirm on board.</span></div></div>";
  }

  /* ---- the steps ---- */
  var STEP = {};
  STEP.workstation = function (v, d, probs) {
    /* ONE list, everything present until Dexter taps it (Miguel, 19 Oct 2026: "i dont like this game of dual stuff .. make it
       one .. defaulted to all present .. so he can mark what is not there"). The line under the question only says the state. */
    var miss = d.ws.missing, h = '<div><div class="q">What is not on the desktop?</div><div class="hint">Everything starts as present. Tap only what is missing; tap it again to put it back.</div>'
      + '<div class="wsum' + (miss.length ? " bad" : "") + '">' + ic(miss.length ? "f:x-circle" : "f:check-circle") + (miss.length ? miss.length + " missing" : "All present") + "</div></div>";
    h += '<div class="card">';
    AR.WORKSTATION.forEach(function (g) {
      var n = g.items.filter(function (i) { return miss.indexOf(i.key) >= 0; }).length;
      h += '<div class="grp"><span>' + esc(g.grp) + "</span><em" + (n ? ' class="bad">' + n + " missing" : ">" + g.items.length + " of " + g.items.length) + "</em></div>";
      /* a group of short names with no sub-line (the bookmarks) is a grid of cells: six rows read as a list nobody scans */
      if (g.items.length >= 4 && g.items.every(function (i) { return !i.sub; })) {
        h += '<div class="cells">' + g.items.map(function (i) { var bad = miss.indexOf(i.key) >= 0; return '<button type="button" class="cell' + (bad ? " bad" : " ok") + '" data-a="ws" data-k="' + esc(i.key) + '" aria-pressed="' + bad + '">' + ic(bad ? "f:x-circle" : "f:check-circle") + esc(i.label) + (bad && prevMissing(v, i.key) ? " · " + esc(AR.ordinal(timesFor(v, i.key))) : "") + "</button>"; }).join("") + "</div>";
      } else g.items.forEach(function (i) { h += itemRow("ws", i.key, i.label, i.sub, miss.indexOf(i.key) >= 0, prevMissing(v, i.key), timesFor(v, i.key)); });
    });
    return h + "</div>" + photoStrip(v, "workstation");
  };
  STEP.machines = function (v, d, probs) {
    var h = '<div><div class="q">What is not working?</div><div class="hint">Everything starts as working. Tap only what is wrong; tap it again to put it back.</div></div>';
    h += '<div class="card">' + tapRow("labeled", "all", "All hardware labeled", "", d.hw.labeled === false, ["", "Not labeled"]) + "</div>";
    v.machines.forEach(function (m) {
      var a = d.hw.machines[m.serial] || (d.hw.machines[m.serial] = { checks: {}, p43: null, down: null, note: "" });
      var stillDown = a.down === "still", finding = AR.MACHINE_CHECKS.some(function (c) { return a.checks[c.key] === "finding"; }) || a.p43 === "seen";
      var pill = stillDown ? '<span class="st r">Down</span>' : finding ? '<span class="st r">Problem</span>' : '<span class="st g">Working</span>';
      h += '<div class="card"><div class="mach"><div class="mh"><b>' + esc(m.label) + (m.model ? ' <span class="sm" style="display:inline">· ' + esc(m.model) + "</span>" : "") + "</b>" + pill + '</div><div class="mono">' + esc(m.serial) + "</div></div>";
      var ser = ' data-s="' + esc(m.serial) + '"';
      if (m.down) h += tapRow("down", "x", "Reported down by " + first(v.crew), "“" + esc(m.down) + "”", stillDown, ["Running now", "Still down"], ser);
      if (!stillDown) {
        AR.MACHINE_CHECKS.forEach(function (c) { h += tapRow("chk", c.key, CHECK_SAY[c.key] || c.label, "", a.checks[c.key] === "finding", ["", "Problem"], ser); });
        var items = (m.p43 && m.p43.items) || [];
        if (items.length) {
          var one = items.length === 1 ? items[0] : null;
          var sub = (one ? esc([one.where, one.part ? "points to " + sentence(one.part) : ""].filter(Boolean).join(" · ")) + "<br>" : items.map(function (it) { return esc(sentence(it.head)); }).join("<br>") + "<br>") + "Pattern 43 showed it. Print one and look; Rolando confirms.";
          h += tapRow("p43", "x", one ? sentence(one.head) : items.length + " Pattern 43 marks", sub, a.p43 === "seen", ["Not seen", "Seen"], ser);
        }
        if ((m.life || []).length) {
          h += '<div class="fnd a">' + ic("clock") + "<div><b>" + m.life.length + (m.life.length === 1 ? " part" : " parts") + " past rated life · information</b>";
          m.life.forEach(function (x) { h += '<span class="src">' + esc(AR.partName(x.name)) + " " + esc(x.pct) + "%" + (x.cover ? " · " + esc(x.cover).replace(/ (\d)/g, "&nbsp;$1") : " · not on the OBP list") + "</span>"; });
          h += '<span class="src">Copy quality decides, never the counter. Have the part on board for when it goes.</span></div></div>';
        }
      }
      if (finding || stillDown) h += '<div class="pad" style="padding-top:4px"><div class="lab">What you found' + (finding ? " · required" : "") + "</div>" + box("m:" + m.serial, a.note, "One sentence, what you saw on " + m.label) + whyMsg(probs, "note:" + m.serial) + "</div>";
      h += "</div>";
    });
    var tm = d.hw.tools.missing;
    h += '<div class="card"><div class="grp"><span>Tools not on inventory</span><em' + (tm.length ? ' class="bad">' + tm.length + " missing" : ">" + AR.TOOLS.length + " of " + AR.TOOLS.length) + "</em></div>";
    AR.TOOLS.forEach(function (t) { h += itemRow("tool", t.key, t.label, "", tm.indexOf(t.key) >= 0, prevMissing(v, t.key), timesFor(v, t.key)); });
    return h + "</div>" + photoStrip(v, "machines");
  };
  function partOf(v, pn) { return (v.parts || []).filter(function (p) { return p.part_no === pn; })[0] || { part_no: pn }; }
  function lineRow(v, d, pn, obp, crew, kindTxt) {
    var L = d.inv.lines[pn] || {}, p = partOf(v, pn), shelf = L.shelf == null ? "" : L.shelf;
    var diff = obp == null ? NaN : (L.shelf != null ? L.shelf : crew) - obp;
    return '<div class="ln"><div class="tx"><div class="nm">' + esc(p.description || pn) + '</div><div class="mono">' + esc(pn) + '</div><div class="num">OBP <b>' + esc(obp) + "</b> · " + esc(first(v.crew)) + " <b>" + esc(crew == null ? "–" : crew) + "</b>" + (kindTxt ? " · " + esc(kindTxt) : "") + '</div></div><span class="d' + diffCls(diff) + '" data-obp="' + esc(obp) + '" data-crew="' + esc(crew == null ? "" : crew) + '">' + diffTxt(diff) + '</span><label class="shelf"><span>Shelf</span><input inputmode="numeric" pattern="[0-9]*" maxlength="5" data-shelf="' + esc(pn) + '" value="' + esc(shelf) + '" placeholder="' + esc(crew == null ? "" : crew) + '" aria-label="On the shelf"></label></div>';
  }
  function diffCls(diff) { return diff > 0 ? " p" : !diff ? " z" : ""; }
  function diffTxt(diff) { return isNaN(diff) ? "–" : !diff ? "0" : (diff > 0 ? "+" : "−") + Math.abs(diff); }
  /* the answer to "Does the OBP match the shelf?" is read from the lines (AR.obpMatches), never a second control */
  function obpVerdict(v, d) {
    var off = v.count.diff.filter(function (x) { return x.kind === "gap" && !AR.obpMatches({ inv: { lines: d.inv.lines, added: [] } }, { diff: [x] }); }).length
      + d.inv.added.filter(function (a) { return !AR.obpMatches({ inv: { lines: {}, added: [a] } }, { diff: [], obp: ctxOf(v).obp }); }).length;
    return '<div class="wsum' + (off ? " bad" : "") + '" id="obpv">' + ic(off ? "f:x-circle" : "f:check-circle") + (off ? "OBP is off on " + off + (off === 1 ? " line" : " lines") : "OBP matches the shelf") + "</div>";
  }
  STEP.inventory = function (v, d, probs) {
    var gaps = v.count.diff.filter(function (x) { return x.kind === "gap"; }), timing = v.count.diff.filter(function (x) { return x.kind === "timing"; }), ex = v.count.extras;
    var h = '<div><div class="q">Does the OBP match the shelf?</div><div class="hint">' + esc(first(v.crew)) + " counted " + esc(v.count.total) + " lines blind" + (gaps.length ? " · " + gaps.length + " differ" : " · all agree") + (ex.length ? " · " + ex.length + " not in OBP" : "") + (v.count.asOf ? " · OBP of " + fmtD(v.count.asOf, true) : "") + "</div>"
      + (gaps.length || d.inv.added.length ? '<div class="hint">Count each line on the shelf. Type a number only where the shelf is not ' + esc(first(v.crew)) + "'s count.</div>" : "") + obpVerdict(v, d) + "</div>";
    h += '<div class="card"><div class="ch">' + ic("package") + 'Lines to check on the shelf<span class="r">' + (gaps.length + d.inv.added.length) + "</span></div>";
    if (!gaps.length && !d.inv.added.length) h += '<div class="empty" style="padding:14px 16px">' + ic("f:check-circle") + "The crew's count agrees with OBP on every line.</div>";
    gaps.forEach(function (x) { h += lineRow(v, d, x.part_no, x.obp, x.counted); });
    d.inv.added.forEach(function (a) { var p = partOf(v, a.part_no); var L = d.inv.lines[a.part_no]; h += lineRow(v, d, a.part_no, p.obp, p.counted, "added by you") + whyMsg(probs, "added:" + a.part_no); });
    h += '<div class="addl"><div class="sbox" style="margin:0">' + ic("magnifying-glass") + '<input class="search" id="addq" type="search" placeholder="+ Add a line: part or description" autocomplete="off" value="' + esc(S.addq || "") + '"></div><div id="addr"></div></div></div>';
    if (timing.length) {
      h += '<details class="card fold"><summary class="row"><span class="sq">' + ic("clock") + '</span><div class="tx"><div class="nm" style="font-size:15px">One unit off, OBP moved that day</div><div class="sm">' + timing.length + " · timing (1 Oct rule), flagged only if it does not close</div></div>" + ic("caret-right", "go") + "</summary>";
      timing.forEach(function (x) { h += lineRow(v, d, x.part_no, x.obp, x.counted, "timing"); });
      h += "</details>";
    }
    if (ex.length) {
      h += '<div class="card"><div class="ch">' + ic("wrench") + 'Repair items not in OBP<span class="r">from ' + esc(first(v.crew)) + "'s count</span></div>";
      ex.forEach(function (x) { h += tapRow("rep", x.id, x.text, x.counted != null ? esc(first(v.crew)) + " counted " + esc(x.counted) : "", d.inv.repairs[x.id] === "not_found", ["", "Not found"]); });
      h += "</div>";
    }
    h += '<div class="card pad"><div class="lab">Note on the stock · optional</div>' + box("inv-note", d.inv.note, "Anything else the counts do not say") + "</div>";
    return h + photoStrip(v, "inventory");
  };
  function addResults(v, d) {
    var q = String(S.addq || "").toLowerCase().trim(), out = $("addr"); if (!out) return;
    if (q.length < 2) { out.innerHTML = ""; return; }
    var have = {}; v.count.diff.forEach(function (x) { if (x.kind === "gap") have[x.part_no] = 1; }); d.inv.added.forEach(function (a) { have[a.part_no] = 1; });
    var hits = (v.parts || []).filter(function (p) { return !have[p.part_no] && (p.part_no + " " + (p.description || "")).toLowerCase().indexOf(q) >= 0; }).slice(0, 6);
    out.innerHTML = hits.length ? hits.map(function (p) { return '<button type="button" class="row" data-a="addline" data-k="' + esc(p.part_no) + '" style="min-height:52px"><div class="tx"><div class="nm" style="font-size:14.5px">' + esc(p.description || p.part_no) + '</div><div class="sm">' + esc(p.part_no) + " · OBP " + esc(p.obp == null ? "–" : p.obp) + " · counted " + esc(p.counted == null ? "–" : p.counted) + "</div></div>" + ic("plus", "go") + "</button>"; }).join("") : '<div class="sm" style="padding:8px 2px">No OBP line matches.</div>';
  }
  STEP.ratings = function (v, d, probs) {
    var h = "";
    ["inventory", "technical", "collaterals"].forEach(function (k) {
      var t = AR.RATING_TEXT[k], r = d.rt[k];
      h += '<div class="card pad"><div class="q">' + esc(t.label) + '</div><div class="hint">' + esc(t.hint) + "</div>" + rateRow("rt", k, r, t.label) + whyMsg(probs, k);
      if (r != null && r <= 3) h += '<div class="lab" style="margin-top:12px">Say why · required</div>' + box("why:" + k, d.rt.why[k], "One sentence") + whyMsg(probs, "why:" + k);
      h += "</div>";
    });
    return h;
  };
  STEP.crew = function (v, d, probs) {
    var h = '<div class="card pad"><div class="q">Training needed</div><div class="hint">Tap what ' + esc(first(v.crew)) + ' needs. Nothing tapped: no training needed.</div><div class="chips" style="margin-top:10px">';
    AR.TRAINING.forEach(function (t) { var on = d.crew.training.indexOf(t.key) >= 0; h += '<button type="button" class="chip' + (on ? " on" : "") + '" data-a="train" data-k="' + t.key + '" aria-pressed="' + on + '">' + esc(t.label) + "</button>"; });
    h += '<button type="button" class="chip' + (S.trainOther || d.crew.trainingOther ? " on" : "") + '" data-a="train-other">+ Other</button></div>';
    if (S.trainOther || d.crew.trainingOther) h += '<input class="field" data-f="train-other" placeholder="Which training" value="' + esc(d.crew.trainingOther) + '" maxlength="120">';
    h += "</div>";
    var pm = d.crew.ppe.missing;
    h += '<div class="card"><div class="grp"><span>Uniform &amp; PPE</span><em' + (pm.length ? ' class="bad">' + pm.length + " missing" : ">" + AR.PPE.length + " of " + AR.PPE.length) + "</em></div>";
    AR.PPE.forEach(function (p) { var was = v.previous && v.previous.sameCrew && (v.previous.ppeMissing || []).indexOf(p.key) >= 0; h += itemRow("ppe", p.key, p.label, "", pm.indexOf(p.key) >= 0, was, 1); });
    h += "</div>" + '<div class="card">' + tapRow("hon", "x", "Uses the HON app", "", d.crew.hon === "no", ["", "Not in use"]) + "</div>";
    var t = AR.RATING_TEXT.dispatch;
    h += '<div class="card pad"><div class="q">' + esc(t.label) + ' <span class="sm" style="display:inline">· optional</span></div><div class="hint">' + esc(t.hint) + "</div>" + rateRow("disp", "dispatch", d.crew.dispatch, t.label) + "</div>";
    return h + photoStrip(v, "crew");
  };
  STEP.overall = function (v, d, probs) {
    var o = d.ov.overall, e = AR.evalOf(d), t = AR.RATING_TEXT.overall;
    var h = '<div class="card pad"><div class="q">' + esc(t.label) + ' <span class="sm" style="display:inline">· optional</span></div>' + rateRow("ov", "overall", o, t.label) + '<div class="anch"><span>Needs intervention</span><span>Runs itself</span></div>';
    h += '<div class="scoreln">' + (e.score.score == null ? "Rate the three on the Ratings step first." : "Audit score <b>" + e.score.score + " / 5</b> · " + (e.score.from === "overall" ? "from the Overall rating" : "no Overall: the average of the three, rounded down")) + "</div>";
    if (o != null && o <= 3) h += '<div class="lab" style="margin-top:12px">Say why · required</div>' + box("ov-why", d.ov.why, "One sentence") + whyMsg(probs, "why");
    h += "</div>";
    h += '<div class="card pad"><div class="lab">Strengths</div>' + box("strengths", d.ov.strengths, "What " + first(v.crew) + " does well") + whyMsg(probs, "strengths") +
      '<div class="lab" style="margin-top:14px">To improve</div>' + box("improve", d.ov.improve, "What needs to change") + whyMsg(probs, "improve") +
      '<div class="lab" style="margin-top:14px">Agreed with the crew · optional</div>' + box("agreed", d.ov.agreed, "What you agreed with " + first(v.crew)) + "</div>";
    var f = d.ov.followup;
    h += '<div class="card"><button type="button" class="tog" data-a="block" aria-pressed="' + !!d.ov.recommendBlock + '"><span>Recommend for Oasis / Icon class</span><i class="sw' + (d.ov.recommendBlock ? " on" : "") + '"></i></button>' +
      '<button type="button" class="tog" data-a="fu" aria-pressed="' + !!f + '"><span>Needs follow-up</span><i class="sw' + (f ? " on" : "") + '"></i></button>';
    if (f) {
      var owners = AR.FOLLOW_OWNERS.concat([first(v.crew)]);
      h += '<div class="pad" style="padding-top:4px"><div class="lab">Who</div><div class="chips">' + owners.map(function (n) { return '<button type="button" class="chip' + (f.owner === n ? " on" : "") + '" data-a="fu-owner" data-k="' + esc(n) + '" aria-pressed="' + (f.owner === n) + '">' + esc(n) + "</button>"; }).join("") + "</div>" + whyMsg(probs, "fu_owner") +
        '<div class="lab" style="margin-top:12px">By</div><input class="field" type="date" data-f="fu-due" value="' + esc(f.due || "") + '" min="' + esc(v.today) + '">' + whyMsg(probs, "fu_due") +
        '<div class="lab" style="margin-top:12px">What</div>' + box("fu-text", f.text, "What has to happen") + whyMsg(probs, "fu_text") + "</div>";
    }
    return h + "</div>";
  };
  STEP.review = function (v, d, probs) {
    var e = AR.evalOf(d), tile = function (val, label, main) { return '<div class="tile' + (main ? " main" : "") + '"><b>' + (val == null ? "–" : esc(val)) + "</b><small>" + esc(label) + "</small></div>"; };
    var h = '<div class="tiles">' + tile(d.ov.overall, "Overall", true) + tile(d.rt.inventory, "Inventory") + tile(d.rt.technical, "Technical") + tile(d.rt.collaterals, "Collaterals") + tile(d.crew.dispatch, "Dispatch") + "</div>";
    h += '<div class="card pad"><div class="gsum"><span class="ib ' + (e.score.score == null ? "n" : e.score.score <= 3 ? "r" : "g") + '">' + ic("f:seal-check") + '</span><div><div class="n">' + (e.score.score == null ? "–" : esc(e.score.score)) + '<small> / 5</small></div><div class="sm">Audit score · ' + (e.score.from === "overall" ? "the Overall rating" : e.score.from ? "average of the three, rounded down" : "not rated yet") + "</div></div></div></div>";
    var ws = d.ws.missing.length, tools = d.hw.tools.missing.length, finds = v.machines.filter(function (m) { var a = d.hw.machines[m.serial] || {}; return a.down === "still" || a.p43 === "seen" || AR.MACHINE_CHECKS.some(function (c) { return (a.checks || {})[c.key] === "finding"; }); }).length;
    var lines = v.count.diff.filter(function (x) { return x.kind === "gap"; }).length + d.inv.added.length;
    var sum = [ws + (ws === 1 ? " missing item" : " missing items"), finds + (finds === 1 ? " finding" : " findings"), lines + (lines === 1 ? " OBP line" : " OBP lines"), tools + (tools === 1 ? " tool" : " tools") + " missing"].join(" · ");
    var low = ["inventory", "technical", "collaterals"].filter(function (k) { return d.rt[k] != null && d.rt[k] <= 3; }).map(function (k) { return AR.RATING_TEXT[k].label; });
    if (d.ov.overall != null && d.ov.overall <= 3) low.push("Overall");
    var sent = (v.photos || []).length, wait = (S.pq[v.id] || []).length;
    h += '<div class="card">';
    h += '<button type="button" class="itm" data-step="' + (probs.length ? stepNo(probs[0].step) : 7) + '"><span class="tx">' + (probs.length ? probs.length + (probs.length === 1 ? " answer missing" : " answers missing") : "Every step answered") + '<span class="sm">' + esc(probs.length ? probs[0].say : sum) + "</span></span>" + ic(probs.length ? "f:warning-circle" : "f:check-circle", probs.length ? "bad" : "ok") + "</button>";
    if (low.length) h += '<div class="itm"><span class="tx">Comment on the ' + (low.length === 1 ? "low rating" : low.length + " low ratings") + '<span class="sm">' + esc(low.join(" · ")) + "</span></span>" + ic("f:check-circle", "ok") + "</div>";
    h += '<div class="itm"><span class="tx">' + (sent + wait ? sent + wait + (sent + wait === 1 ? " photo" : " photos") + (wait ? " · " + wait + " waits for signal" : "") : "No photos") + '<span class="sm">' + (wait ? "The audit files now; the photos follow when there is signal." : "Photos are optional.") + "</span></span>" + ic(wait ? "f:warning-circle" : "f:check-circle", wait ? "warn" : "ok") + "</div></div>";
    if (v.followups.length) {
      h += '<div class="card"><div class="ch">' + ic("flag") + 'Still open on this ship<span class="r">tap what is fixed</span></div>';
      v.followups.forEach(function (f) {
        var c = d.close[f.id] || "open", late = f.due && f.due < v.today, times = (f.carried || 0) + 1;
        var fixed = c === "fixed";
        h += '<button type="button" class="itm" data-a="close" data-k="' + esc(f.id) + '" aria-pressed="' + fixed + '"><span class="tx">' + esc(f.text) + '<span class="sm">' + esc(f.owner) + (f.due ? " · by " + fmtD(f.due, true) : "") + " · " + esc(f.crew || "") + ", " + fmtD(f.at, true) + "</span></span>"
          + (fixed ? '<span class="st g">Fixed</span>' : times > 1 ? '<span class="st r">' + esc(AR.ordinal(times)) + " time</span>" : late ? '<span class="st r">Overdue</span>' : '<span class="st a">Still open</span>') + ic(fixed ? "f:check-circle" : "circle", fixed ? "ok" : "") + "</button>";
      });
      h += "</div>";
    }
    var again = d.ws.missing.concat(d.hw.tools.missing).filter(function (k) { return prevMissing(v, k); });
    if (again.length) h += '<div class="ban r">' + ic("f:warning-circle") + "<span>Missing again since the last visit: " + esc(again.map(labelOf).join(", ")) + ".</span></div>";
    var fu = d.ov.followup;
    h += '<div class="card soft"><div class="ch">' + ic("paper-plane-tilt") + 'Where it goes</div><div class="went">' +
      '<i class="y">' + ic("check") + "</i><span>" + esc(first(v.crew)) + "'s Score Card · Dexter's audit factor reads the score</span>" +
      (fu ? '<i class="y">' + ic("check") + "</i><span>Follow-up to " + esc(fu.owner || "…") + (fu.due ? " · by " + fmtD(fu.due, true) : "") + "</span>" : "") +
      (sent + wait ? '<i class="y">' + ic("check") + "</i><span>Photos · audit bucket · " + esc(v.ship) + "</span>" : "") +
      '<i class="y">' + ic("check") + "</i><span>The next audit of " + esc(v.ship) + " opens with what is missing and still open</span>" +
      '<i class="n">' + ic("minus") + "</i><span>Never to the crew.</span></div></div>";
    return h;
  };
  function labelOf(k) { var all = []; AR.WORKSTATION.forEach(function (g) { all = all.concat(g.items); }); all = all.concat(AR.TOOLS, AR.PPE); var x = all.filter(function (i) { return i.key === k; })[0]; return x ? x.label : k; }
  function stepNo(key) { for (var i = 0; i < AR.STEPS.length; i++) if (AR.STEPS[i].key === key) return i + 1; return 7; }
  function sentence(t) { t = String(t || "").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); }

  function stepView(id, n) {
    n = Math.max(1, Math.min(7, Number(n) || 1));
    var key = "a" + id + "|" + n; S.view = key; S.err = {}; S.addq = "";
    top(AR.STEPS[n - 1].title, "", n + " / 7", "", true); hero(""); dock("");
    $("main").innerHTML = skel(4);
    (S.v[id] ? Promise.resolve(S.v[id]) : loadVisit(id)).then(function (v) {
      if (S.view !== key) return;
      S.v[id] = v;
      /* the gate, once more: no audit before the documents are in; a filed one is the record; a TEST request is a rehearsal */
      if (v.filed || v.status !== "complete" || v.test) { location.replace("#q=" + id); return; }
      var d = draftOf(id, v); keep(id, d);
      var st = AR.STEPS[n - 1], ctx = ctxOf(v);
      top(st.title, v.ship + " · " + v.crew, n + " / 7", n === 7 ? "done" : "", true);
      stepBar(n);
      var draw = function () {
        if (S.view !== key) return;
        var y = window.scrollY, probs = AR.visitProblems(d, ctx, v.today), mine = probs.filter(function (p) { return p.step === st.key; });
        $("main").innerHTML = (v._offline ? '<div class="ban a">' + ic("cloud-slash") + "<span>No signal. Working from the copy on this phone; everything you do is kept.</span></div>" : "") + STEP[st.key](v, d, st.key === "review" ? probs : mine);
        if (st.key === "inventory") addResults(v, d);
        window.scrollTo(0, y);
        if (n < 7) dock('<div class="two nx"><button class="btn ghost" id="sb">' + ic("caret-left") + 'Back</button><button class="btn" id="sn">' + (n === 6 ? "Review" : "Next · " + esc(AR.STEPS[n].short)) + ic("caret-right") + "</button></div>");
        else dock('<div class="two nx"><button class="btn ghost" id="sb">' + ic("caret-left") + 'Back</button><button class="btn green" id="sf"' + (probs.length || S.filing ? " disabled" : "") + ">" + ic("check") + (S.filing ? "Filing" : "File audit") + "</button></div>" + '<div class="note">' + (probs.length ? esc(probs[0].say) : "Filed once. It cannot be changed afterwards.") + "</div>");
        $("sb").onclick = function () { location.replace(n === 1 ? "#q=" + id : "#a=" + id + "|" + (n - 1)); };
        if ($("sn")) $("sn").onclick = function () {
          /* the answers as they are NOW: typing does not redraw, so the list drawn with the screen can be stale */
          var left = AR.visitProblems(d, ctx, v.today).filter(function (p) { return p.step === st.key; });
          if (left.length) { S.err.show = true; draw(); var w = document.querySelector(".why"); if (w) w.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
          location.replace("#a=" + id + "|" + (n + 1));
        };
        if ($("sf")) $("sf").onclick = function () { fileAudit(id, v, d); };
      };
      S.redraw = draw;
      var M = $("main");
      M.onclick = function (ev) {
        var b = ev.target.closest("[data-a]"); if (!b) return;
        var a = b.getAttribute("data-a"), k = b.getAttribute("data-k"), s = b.getAttribute("data-s");
        if (a === "ws") toggle(d.ws.missing, k);
        else if (a === "labeled") d.hw.labeled = d.hw.labeled === false;
        else if (a === "down") d.hw.machines[s].down = d.hw.machines[s].down === "still" ? "running" : "still";
        else if (a === "p43") d.hw.machines[s].p43 = d.hw.machines[s].p43 === "seen" ? "not_seen" : "seen";
        else if (a === "chk") { var mc = d.hw.machines[s].checks; if (mc[k] === "finding") delete mc[k]; else mc[k] = "finding"; }
        else if (a === "tool") toggle(d.hw.tools.missing, k);
        else if (a === "addline") { d.inv.added.push({ part_no: k, shelf: null }); S.addq = ""; }
        else if (a === "rep") d.inv.repairs[k] = d.inv.repairs[k] === "not_found" ? "confirmed" : "not_found";
        else if (a === "rt") { var r = Number(b.getAttribute("data-v")); d.rt[k] = d.rt[k] === r ? null : r; }
        else if (a === "train") toggle(d.crew.training, k);
        else if (a === "train-other") { S.trainOther = !(S.trainOther || d.crew.trainingOther); if (!S.trainOther) d.crew.trainingOther = ""; }
        else if (a === "ppe") toggle(d.crew.ppe.missing, k);
        else if (a === "hon") d.crew.hon = d.crew.hon === "no" ? "yes" : "no";
        else if (a === "disp") { var r2 = Number(b.getAttribute("data-v")); d.crew.dispatch = d.crew.dispatch === r2 ? null : r2; }
        else if (a === "ov") { var r3 = Number(b.getAttribute("data-v")); d.ov.overall = d.ov.overall === r3 ? null : r3; }
        else if (a === "block") d.ov.recommendBlock = !d.ov.recommendBlock;
        else if (a === "fu") d.ov.followup = d.ov.followup ? null : { owner: "", due: AR.plusDays(v.today, AR.FOLLOW_DAYS), text: "" };
        else if (a === "fu-owner") d.ov.followup.owner = k;
        else if (a === "close") d.close[k] = d.close[k] === "fixed" ? "open" : "fixed";
        else return;
        AR.fillVisit(d, ctx); keep(id, d); draw();
      };
      M.oninput = function (ev) {
        var t = ev.target, f = t.getAttribute("data-f"), sh = t.getAttribute("data-shelf");
        if (t.id === "addq") { S.addq = t.value; addResults(v, d); return; }
        if (sh) {
          var L = d.inv.lines[sh] || (d.inv.lines[sh] = { shelf: null, checked: false }); var val = String(t.value).trim(); L.shelf = /^\d{1,5}$/.test(val) ? Number(val) : null; L.checked = L.shelf != null;
          var ad = d.inv.added.filter(function (x) { return x.part_no === sh; })[0]; if (ad) ad.shelf = L.shelf;
          AR.fillVisit(d, ctx); keep(id, d);
          var row = t.closest(".ln"), dc = row && row.querySelector(".d");
          if (dc) { var o = dc.getAttribute("data-obp"), cr = dc.getAttribute("data-crew"), base = L.shelf != null ? L.shelf : cr === "" ? NaN : Number(cr), df = o === "" ? NaN : base - Number(o); dc.className = "d" + diffCls(df); dc.textContent = diffTxt(df); }
          var vd = $("obpv"); if (vd) vd.outerHTML = obpVerdict(v, d);
          return;
        }
        if (!f) return;
        if (f.indexOf("m:") === 0) d.hw.machines[f.slice(2)].note = t.value;
        else if (f === "inv-note") d.inv.note = t.value;
        else if (f.indexOf("why:") === 0) d.rt.why[f.slice(4)] = t.value;
        else if (f === "train-other") d.crew.trainingOther = t.value;
        else if (f === "ov-why") d.ov.why = t.value;
        else if (f === "strengths" || f === "improve" || f === "agreed") d.ov[f] = t.value;
        else if (f === "fu-due") d.ov.followup.due = t.value;
        else if (f === "fu-text") d.ov.followup.text = t.value;
        keep(id, d);
      };
      /* a typed number redraws on leaving the box (the diff and the tick follow it), never while typing */
      M.onchange = function (ev) { var t = ev.target; if (t.getAttribute("data-shelf") || t.getAttribute("data-f") === "fu-due") draw(); if (t.getAttribute("data-photo")) { var file = t.files && t.files[0]; t.value = ""; if (file) { toast("Photo kept on this phone. Sending."); addPhoto(id, t.getAttribute("data-photo"), file).then(draw); } } };
      queued(id).then(function (q) { S.pq[id] = q; draw(); if (q.length && navigator.onLine !== false) flushPhotos(id); });
    }).catch(function (e) { if (S.view === key) fail(e); }); // a late error never replaces the screen moved on to
  }

  /* ---- filing: once; without signal it is kept on the phone and sent when the server answers ---- */
  function fileAudit(id, v, d) {
    var e = AR.evalOf(d);
    if (!confirm("File " + first(v.crew) + "'s audit with a score of " + e.score.score + " / 5? It cannot be changed afterwards.")) return;
    S.filing = true; if (S.redraw) S.redraw();
    var body = { id: id, visit: d };
    sendFiling(body).then(function (r) {
      S.filing = false;
      if (r.pending) { lsSet("aud:p:" + id, { body: body, at: new Date().toISOString() }); toast("No signal. The audit is filed on this phone and sends when there is signal."); location.replace("#q=" + id); return; }
      if (!r.ok && r.error !== "already_filed") {
        if (r.problems && r.problems.length) { S.err.show = true; alert("Not filed: " + r.problems[0].say); location.replace("#a=" + id + "|" + stepNo(r.problems[0].step)); return; }
        alert("Not filed: " + (r.detail || r.error || "try again")); if (S.redraw) S.redraw(); return;
      }
      done(id);
      if (r.error === "already_filed") alert("This audit was already filed.");
      if (S.prev && S.prev.indexOf("q=" + id) === 0) history.back(); else location.replace("#q=" + id);
    });
  }
  function sendFiling(body) {
    return post("/api/audit/request/grade", body).catch(function () { return { pending: true }; });
  }
  function done(id) { lsSet("aud:d:" + id, null); lsSet("aud:v:" + id, null); lsSet("aud:p:" + id, null); delete S.v[id]; S.brief = {}; reloadShips(); }
  function flushFilings() {
    var keys = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("aud:p:") === 0) keys.push(k); } } catch (e) { return; }
    keys.forEach(function (k) {
      var p = lsGet(k); if (!p || !p.body) { lsSet(k, null); return; }
      sendFiling(p.body).then(function (r) {
        if (r.pending) return;
        if (r.ok || r.error === "already_filed") { done(p.body.id); toast("The audit kept on this phone is filed."); if (S.cur === "q=" + p.body.id) route(); return; }
        /* refused (an answer the server needs): never re-sent for ever — the draft is still on the phone to finish */
        lsSet(k, null); toast("The audit kept on this phone was not filed: " + ((r.problems && r.problems[0] && r.problems[0].say) || r.error || "open it and file again") + ".");
        if (S.cur === "q=" + p.body.id) route();
      });
    });
    Object.keys(S.pq).forEach(function (rid) { if ((S.pq[rid] || []).length) flushPhotos(rid); });
  }
  window.addEventListener("online", flushFilings);

  /* ---- the filed audit, read back on the request ---- */
  function filedCard(v) {
    var F = v.filed, D = F && F.data; if (!D) return "";
    var h = "", line = function (k, val) { return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + val + "</span></div>"; };
    var miss = (D.ws.missing || []).concat(D.hw.tools.missing || []).map(function (k) { var t = (D.repeat || {})[k] || 1; return esc(labelOf(k)) + (t > 1 ? ' <span class="st r">' + esc(AR.ordinal(t)) + " time</span>" : ""); });
    h += '<div class="card"><div class="ch">' + ic("clipboard-text") + 'The audit<span class="r">' + fmtD(F.grade.at, true) + "</span></div>";
    h += line("Missing", miss.length ? miss.join("<br>") : "Nothing");
    h += line("Hardware labeled", D.hw.labeled === false ? '<span class="st r">No</span>' : "Yes");
    ((D.ctx && D.ctx.machines) || v.machines).forEach(function (m) {
      var a = (D.hw.machines || {})[m.serial] || {}, bad = AR.MACHINE_CHECKS.filter(function (c) { return (a.checks || {})[c.key] === "finding"; }).map(function (c) { return c.label; });
      if (a.p43 === "seen") bad.push("Pattern 43 mark seen");
      h += line(m.label, (a.down === "still" ? '<span class="st r">Down</span>' : bad.length ? '<span class="st r">' + esc(bad.join(" · ")) + "</span>" : '<span class="st g">Pass</span>') + (a.note ? '<div class="sm">' + esc(a.note) + "</div>" : ""));
    });
    var lines = Object.keys(D.inv.lines || {}).filter(function (k) { return D.inv.lines[k].shelf != null || D.inv.lines[k].checked; });
    h += line("OBP vs shelf", D.inv.accurate ? "Accurate" : '<span class="st a">Discrepancies</span>' + (lines.length ? '<div class="sm">' + lines.map(function (k) { var L = D.inv.lines[k]; return esc(k) + (L.shelf != null ? " · shelf " + esc(L.shelf) : " · checked") ; }).join("<br>") + "</div>" : ""));
    var tr = (D.crew.training || []).map(function (k) { var t = AR.TRAINING.filter(function (x) { return x.key === k; })[0]; return t ? t.label : k; }); if (D.crew.trainingOther) tr.push(D.crew.trainingOther);
    h += line("Training needed", tr.length ? esc(tr.join(" · ")) : "None");
    var ppe = (D.crew.ppe.missing || []).map(function (k) { var t = AR.PPE.filter(function (x) { return x.key === k; })[0]; return t ? t.label : k; });
    h += line("Uniform & PPE", ppe.length ? '<span class="st r">' + esc(ppe.join(" · ")) + " missing</span>" : "Complete");
    h += line("HON app", { yes: "In use", no: '<span class="st a">Not in use</span>', na: "N/A" }[D.crew.hon] || "–");
    if (D.crew.dispatch != null) h += line("Dispatch", esc(D.crew.dispatch) + " / 5");
    if (D.ov.recommendBlock) h += line("Oasis / Icon class", "Recommended");
    h += "</div>";
    h += '<div class="card">' + [["Strengths", D.ov.strengths], ["To improve", D.ov.improve], ["Agreed with the crew", D.ov.agreed]].filter(function (x) { return x[1]; }).map(function (x) { return '<div class="feed"><div class="w">' + esc(x[0]) + '</div><div class="pl">' + esc(x[1]) + "</div></div>"; }).join("") + "</div>";
    if ((F.followups || []).length) h += '<div class="card"><div class="ch">' + ic("flag") + "Follow-up</div>" + F.followups.map(function (f) { return '<div class="kv"><span class="k">' + esc(f.owner) + (f.due ? " · " + fmtD(f.due, true) : "") + '</span><span class="v">' + esc(f.text) + '<div class="sm">' + (f.status === "fixed" ? "Fixed " + fmtD(f.closed_at, true) : "Open") + "</div></span></div>"; }).join("") + "</div>";
    if ((v.photos || []).length) h += '<div class="card"><div class="ch">' + ic("camera") + 'Photos<span class="r">' + v.photos.length + '</span></div><div class="phs">' + v.photos.map(function (p) { return '<a class="th" href="/api/audit/visit/photo?f=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener" style="background-image:url(&quot;/api/audit/visit/photo?f=' + encodeURIComponent(p.id) + '&quot;)" aria-label="Photo"></a>'; }).join("") + "</div></div>";
    return h;
  }

  /* ---------------- History · Follow-ups (19 Oct 2026; docs/AUDIT_DESIGN.md "History", W1's rail) ----------------
     Every filed audit by ship, crew and date, and every follow-up with its state. The page reads what the filing wrote and
     decides nothing. A follow-up closes from the list when it was done before the next visit; it says who closed it. */
  function shipBrand(ship) { var s = (S.ships || []).filter(function (x) { return x.ship === ship; })[0]; return s ? brandOf(s) : ""; }
  function byName(e) {
    var s = String(e || ""), open = s.indexOf("(open site") >= 0;
    s = s.replace(/\s*\(open site[^)]*\)/, "").split("@")[0];
    var n = s.split(/[._]+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
    return (n || "Someone") + (open ? " · open site" : "");
  }
  /* one rating as a square: 3 or below is the problem line everywhere in the audit (it needs a sentence, it is 0 on the
     Score Card); the dispatch rating is Rita's, about the travel, never the specialist's, so it is never coloured */
  function gq(label, v, plain) { return '<span class="gi"><b class="gq' + (v == null ? " x" : plain ? " p" : v <= 3 ? " lo" : "") + '">' + (v == null ? "–" : esc(v)) + "</b>" + esc(label) + "</span>"; }
  function visitWhen(a) {
    var o = String(a.openedAt || "").slice(0, 10), f = String(a.filedAt || "").slice(0, 10);
    if (!o || o === f) return fmtD(f, true);
    if (o.slice(0, 7) === f.slice(0, 7)) return MON[+o.slice(5, 7) - 1] + " " + +o.slice(8, 10) + "–" + +f.slice(8, 10) + ", " + esc(f.slice(0, 4));
    return fmtD(o) + " – " + fmtD(f, true);
  }
  function loadHist() {
    return api("/api/audit/history").then(function (r) {
      S.hist = r;
      S.counts = { filed: r.audits.length, openFollowups: r.followups.filter(function (f) { return f.status === "open"; }).length };
      return r;
    });
  }
  function historyView() {
    top("History", "Every filed audit", "", "", true); hero(""); dock("");
    $("main").innerHTML = S.hist ? "" : skel(4);
    if (S.hist) historyList();
    var at = S.cur;
    loadHist().then(function () { if (S.cur === at) historyList(); }).catch(function (e) { if (S.cur === at && !S.hist) fail(e); });
  }
  function historyList() {
    var H = S.hist, f = S.hf || "All";
    if (!H.audits.length) { $("main").innerHTML = '<div class="card"><div class="empty">' + ic("clipboard-text") + "No audit filed yet.<span>An audit is filed from its request, once the crew's documents are in.</span></div></div>"; return; }
    var list = H.audits.filter(function (a) {
      if (f === "Follow-up open") return a.followups.open > 0;
      return f === "All" || shipBrand(a.ship) === f;
    });
    var h = '<div class="chips">' + ["All", "Royal Caribbean", "Celebrity", "Azamara", "Follow-up open"].map(function (c) { return '<button class="chip' + (f === c ? " on" : "") + '" aria-pressed="' + (f === c) + '" data-hf="' + esc(c) + '">' + esc(c === "Royal Caribbean" ? "Royal" : c) + "</button>"; }).join("") + "</div>";
    var span = list.length ? fmtD(list[list.length - 1].filedAt, true) + (list.length > 1 ? " → " + fmtD(list[0].filedAt, true) : "") : "";
    h += '<div class="sh">' + (list.length === 1 ? "1 audit" : list.length + " audits") + "<span>" + span + "</span></div>";
    if (!list.length) { $("main").innerHTML = h + '<div class="card"><div class="empty">' + ic("clipboard-text") + "No audit matches this filter.</div></div>"; return; }
    h += '<div class="card">' + list.map(function (a) {
      var R = a.ratings, miss = a.missing ? a.missing.ws.concat(a.missing.tools, a.missing.ppe || []) : null, tags = [];
      /* a comma between items: a label can carry its own " · " ("SOPs · ordering & transfers") */
      var missTxt = miss == null ? "Graded before the audit had steps · nothing recorded on the desk, the tools or the uniform"
        : miss.length ? "Missing: " + miss.map(function (k) { var t = (a.repeat || {})[k] || 1; return esc(labelOf(k)) + (t > 1 ? " (" + esc(AR.ordinal(t)) + " time)" : ""); }).join(", ")
        : "Nothing missing on the desk, the tools or the uniform";
      if (a.followups.open) tags.push('<span class="st a">' + ic("flag") + (a.followups.open === 1 ? "Follow-up open" : a.followups.open + " follow-ups open") + "</span>");
      else if (a.followups.fixed) tags.push('<span class="st g">' + ic("flag") + "Follow-up fixed</span>");
      if (a.photos) tags.push('<span class="st m">' + ic("camera") + a.photos + (a.photos === 1 ? " photo" : " photos") + "</span>");
      return '<button class="row" data-go="q=' + esc(a.id) + '" style="align-items:flex-start"><div class="tx">'
        + '<div class="mh"><div class="nm">' + esc(a.ship) + '</div><span class="st ' + (a.score <= 3 ? "r" : "g") + '">' + ic("f:seal-check") + esc(a.score) + "/5</span></div>"
        + '<div class="sm">' + (a.crew ? esc(a.crew) + " · " : "") + '<span class="nw">' + visitWhen(a) + "</span></div>"
        + '<div class="grd">' + gq("Inventory", R.inventory) + gq("Technical", R.technical) + gq("Collaterals", R.collaterals) + gq("Overall", R.overall) + (R.dispatch != null ? gq("Dispatch", R.dispatch, true) : "") + "</div>"
        + '<div class="sm" style="margin-top:6px">' + missTxt + "</div>"
        + (tags.length ? '<div class="stl">' + tags.join("") + "</div>" : "")
        + "</div>" + ic("caret-right", "go") + "</button>";
    }).join("") + "</div>";
    $("main").innerHTML = h;
  }
  function followupsView() {
    top("Follow-ups", "Asked at an audit, open until done", "", "", true); hero(""); dock("");
    $("main").innerHTML = S.hist ? "" : skel(3);
    if (S.hist) followupsList();
    var at = S.cur;
    loadHist().then(function () { if (S.cur === at) followupsList(); }).catch(function (e) { if (S.cur === at && !S.hist) fail(e); });
  }
  function fuItem(f, today) {
    var late = f.status === "open" && f.due && f.due < today, times = (f.carried || 0) + 1;
    var pill = f.status === "fixed" ? '<span class="st g">' + ic("f:check-circle") + "Fixed</span>"
      : times > 1 ? '<span class="st r">' + esc(AR.ordinal(times)) + " time</span>" : late ? '<span class="st r">Overdue</span>' : '<span class="st a">Open</span>';
    var h = '<div class="pad fu"><div class="mh"><b>' + esc(f.text) + "</b>" + pill + "</div>"
      + '<div class="sm">' + esc(f.owner) + (f.due ? " · by " + fmtD(f.due, true) : " · no date set") + "</div>"
      + '<div class="sm">' + esc(f.ship) + (f.crew ? " · " + esc(f.crew) : "") + " · asked " + fmtD(f.createdAt, true) + "</div>";
    if (f.status === "fixed") h += '<div class="sm">Fixed ' + fmtD(f.closedAt, true) + " by " + esc(byName(f.closedBy)) + (f.closedOnVisit ? " at the next audit" : " from this list") + "</div>";
    h += '<div class="fubtn"><button class="btn ghost" data-go="q=' + esc(f.request) + '">Open audit</button>'
      + (f.status === "open" ? '<button class="btn" data-fix="' + esc(f.id) + '">Mark fixed</button>' : "") + "</div>";
    return h + "</div>";
  }
  function followupsList() {
    var F = S.hist.followups, today = S.hist.today || S.today;
    var open = F.filter(function (f) { return f.status === "open"; }).sort(function (a, b) {
      var la = !!(a.due && a.due < today), lb = !!(b.due && b.due < today);
      return (lb - la) || String(a.due || "9999").localeCompare(String(b.due || "9999")) || String(a.createdAt).localeCompare(String(b.createdAt));
    });
    var fixed = F.filter(function (f) { return f.status === "fixed"; }).sort(function (a, b) { return String(b.closedAt || "").localeCompare(String(a.closedAt || "")); });
    var h = '<div class="sh">Open<span>' + open.length + "</span></div>";
    h += open.length ? '<div class="card">' + open.map(function (f) { return fuItem(f, today); }).join("") + "</div>"
      : '<div class="card"><div class="empty">' + ic("f:check-circle") + "Nothing open.<span>A follow-up is asked in the audit's last step, with an owner and a date.</span></div></div>";
    if (fixed.length) h += '<details class="card fold"><summary class="row"><span class="sq">' + ic("f:check-circle") + '</span><div class="tx"><div class="nm" style="font-size:15px">Fixed</div><div class="sm">' + fixed.length + " · newest first</div></div>" + ic("caret-right", "go") + "</summary>" + fixed.map(function (f) { return fuItem(f, today); }).join("") + "</details>";
    $("main").innerHTML = h;
  }
  /* two taps: the first asks, the second closes (a follow-up closed by a stray thumb would never come back at the next visit) */
  function fixFollowup(b) {
    if (b.disabled) return;
    var reset = function () { b.disabled = false; b.classList.remove("sure"); b.textContent = "Mark fixed"; };
    if (!b.classList.contains("sure")) {
      b.classList.add("sure"); b.innerHTML = ic("check") + "Confirm";
      setTimeout(function () { if (b.isConnected && !b.disabled && b.classList.contains("sure")) reset(); }, 4000);
      return;
    }
    b.disabled = true; b.innerHTML = "Saving…";
    var at = S.cur;
    post("/api/audit/followup/close", { id: b.getAttribute("data-fix") }).then(function (r) {
      if (r.ok || r.error === "already_closed") { toast(r.ok ? "Marked fixed." : "It was already closed."); reloadShips(); if (S.cur === at) followupsView(); return; }
      reset(); toast("Not saved: " + (r.error || "try again") + ".");
    }).catch(function () { reset(); toast("No signal. Nothing was saved; try again."); });
  }

  /* ---------------- router ---------------- */
  function go(h) { location.hash = h; }
  function route() {
    S.view = null; window.scrollTo(0, 0);
    var raw = location.hash.replace(/^#/, ""), h;
    try { h = decodeURIComponent(raw); } catch (e) { h = raw; }
    S.prev = S.cur; S.cur = h;
    if (h.indexOf("s=") === 0) return shipView(h.slice(2));
    if (h.indexOf("b=") === 0) { var p = h.slice(2).split("|"); return briefView(p[0], p[1]); }
    if (h.indexOf("r=") === 0) { var p2 = h.slice(2).split("|"); return requestView(p2[0], p2[1]); }
    if (h.indexOf("q=") === 0) return requestDetail(h.slice(2));
    if (h.indexOf("a=") === 0) { var p3 = h.slice(2).split("|"); lsSet("aud:s:" + p3[0], Number(p3[1]) || 1); return stepView(p3[0], p3[1]); }
    /* the 15 Oct grade screen is the audit's Ratings step now: an old link opens the audit */
    if (h.indexOf("g=") === 0) { location.replace("#a=" + h.slice(2) + "|1"); return; }
    if (h === "hist") return historyView();
    if (h === "fu") return followupsView();
    shipsView();
  }
  $("ibh").innerHTML = ic("clock-counter-clockwise");
  $("ibf").innerHTML = ic("flag") + '<span class="bdg" id="fub" hidden></span>';
  window.addEventListener("hashchange", route);
  document.addEventListener("click", function (e) {
    var sp = e.target.closest("[data-step]");
    if (sp && S.cur && S.cur.indexOf("a=") === 0) { location.replace("#a=" + S.cur.slice(2).split("|")[0] + "|" + sp.getAttribute("data-step")); return; }
    if (e.target.closest("[data-retry]")) { location.reload(); return; }
    var g = e.target.closest("[data-go]");
    if (g) { if (g.disabled) return; go(g.getAttribute("data-go")); return; }
    var hf = e.target.closest("[data-hf]");
    if (hf) { S.hf = hf.getAttribute("data-hf"); historyList(); return; }
    var fx = e.target.closest("[data-fix]");
    if (fx) { fixFollowup(fx); return; }
    var fo = e.target.closest("[data-fold]");
    if (fo) { var fk = fo.getAttribute("data-fold"), wasShut = fo.className.indexOf("shut") >= 0; S.shut[fk] = !wasShut; shipsList(); return; }
    var mo = e.target.closest("[data-more]");
    if (mo) { var mk = mo.getAttribute("data-more"); S.more[mk] = !S.more[mk]; shipsList(); return; }
    var t = e.target.closest("[data-cust],[data-sc],[data-ship]");
    if (!t) return;
    /* a customer tile browses the customer: it clears a search left in the box ("qu" + Azamara showed only Quest, 15 Oct 2026) */
    if (t.hasAttribute("data-cust")) { S.cust = t.getAttribute("data-cust"); lsSet("aud:cust", S.cust); if (S.q) { S.q = ""; var qi = $("q"), qx = $("qx"); if (qi) qi.value = ""; if (qx) qx.hidden = true; } shipsList(); return; }
    if (t.hasAttribute("data-sc")) { go("b=" + encodeURIComponent(t.getAttribute("data-ship")) + "|" + encodeURIComponent(t.getAttribute("data-sc"))); return; }
    if (t.hasAttribute("data-ship")) go("s=" + encodeURIComponent(t.getAttribute("data-ship")));
  });
  function net() { $("offl").hidden = navigator.onLine !== false; }
  window.addEventListener("online", net); window.addEventListener("offline", net); net();
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("/audit/sw.js", { scope: location.pathname.indexOf("/audit") === 0 ? "/audit" : "/" }).catch(function () {}); } catch (e) {} }

  /* The home paints at once from the last list this phone was given, and the fresh one replaces it about a second
     later (19 Oct 2026: the page waited on the whole fleet's board before drawing a row). The kept list is said only
     while the fresh one is late or failed: "Updating", or "Could not update" with Try again. */
  var kept = lsGet("aud:ships");
  if (kept && Array.isArray(kept.ships)) { S.ships = kept.ships; S.counts = kept.counts || null; S.today = kept.today || null; S.keptAt = kept.at || null; }
  S.cust = lsGet("aud:cust") || null; S.me = lsGet("aud:me") || null;
  route();
  flushFilings();
  loadHome(false);
})();
</script>
</body></html>`;
