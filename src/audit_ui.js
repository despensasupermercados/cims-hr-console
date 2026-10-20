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
  /* how long something took between two instants: hours and minutes inside a day, else months and days (never a day count) */
  function took(a, b) {
    var ms = Date.parse(b) - Date.parse(a); if (isNaN(ms) || ms < 0) return "";
    if (ms < 864e5) { var h = Math.floor(ms / 36e5), mi = Math.round((ms % 36e5) / 6e4); return h ? h + (h === 1 ? " hour" : " hours") + (mi ? " " + mi + (mi === 1 ? " minute" : " minutes") : "") : Math.max(1, mi) + (mi === 1 ? " minute" : " minutes"); }
    return md(a, b);
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
    if (r.status === "sent") return '<span class="chip n">Waiting' + (r.due ? " · " + esc(left(r.due)) : "") + "</span>";
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
    var sameDay = false, gap = r.in && r.sent ? took(r.sent, r.in) : "";
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

  /* ---------------- A2 · The briefing (canvas board "Briefing") ----------------
     Whose contract (two aboard: pick one, an audit belongs to one contract), where the request stands, the contract in
     four numbers and its relay, what others said, the rush orders, the ship's audits and its open follow-ups. */
  var KIND = { feedback: "Feedback", intel: "Field report", review: "Shipboard review", note: "Note", comment: "Comment", audit: "Audit" };
  var OFF_SRC = { tdg: "TDG's date", rita: "Rita's date", card: "the reliever's sign-on", projected: "projected" };
  /* ONE PERSON AT A TIME PER SHIP (Miguel, 20 Oct 2026: "we do 1 person at the time per ship"): while another seafarer's
     request is open on this ship, there is no Request button, only the way to it */
  function stop(t) { return /[.!?]$/.test(t) ? t : t + "."; } /* "A.J." ends its own sentence */
  function busyLine(openCrew, crew) { return "One audit at a time per ship: file " + esc(first(openCrew)) + "'s, then ask " + esc(stop(first(crew))); }
  function shipBusy(ship, openCrew, crew, id) {
    return '<button type="button" class="btn pri" data-go="q=' + esc(id) + '">Open ' + esc(first(openCrew)) + "'s request</button>" + '<div class="note">' + busyLine(openCrew, crew) + "</div>";
  }
  function shipBusyCard(ship, openCrew, crew, id) {
    return '<section class="navy sec"><span class="eyebrow">One audit at a time per ship</span><h2 class="h3">' + esc(first(crew)) + " waits for " + esc(first(openCrew)) + "'s audit</h2>"
      + '<p class="sm">' + esc(first(openCrew)) + "'s request on " + esc(ship) + " is still open. File " + esc(first(openCrew)) + "'s, then ask " + esc(first(crew)) + " in a separate request.</p>"
      + '<div class="cta"><button type="button" class="btn white" data-go="q=' + esc(id) + '">Open ' + esc(first(openCrew)) + "'s request</button></div></section>";
  }
  /* where a request stands, as a list of steps: asked, due (or documents in), the audit on board, filed */
  function reqSteps(o) {
    var st = function (cls, dot, t) { return '<div class="ck' + (cls ? " " + cls : "") + '"><span class="' + dot + '">' + (dot === "c" ? ic("b:check") : "") + "</span><span>" + t + "</span></div>"; };
    var asked = st("", "c", "Asked" + (o.asked ? " · " + fmtD(o.asked) : ""));
    if (o.graded) return asked + st("", "c", "Documents in" + (o.inAt ? " · " + fmtD(o.inAt) : "")) + st("", "c", "Audit on board") + st("", "c", "Filed" + (o.gradedAt ? " · " + fmtD(o.gradedAt) : "") + (o.score != null ? " · " + esc(o.score) + "/5" : ""));
    if (o.status === "complete") return asked + st("", "c", "Documents in" + (o.inAt ? " · " + fmtD(o.inAt) : "")) + st("cur", "o on", "Audit on board") + st("todo", "o", "Filed");
    if (o.status === "draft") return st("cur", "o on", "Being sent") + st("todo", "o", "Documents in") + st("todo", "o", "Audit on board") + st("todo", "o", "Filed");
    return asked + (o.late ? st("bad", "o red", "Due " + (o.due ? fmtD(o.due) + " · " : "") + "passed") : st("cur", "o on", o.due ? "Due " + esc(whenUtc(o.due)) + " · " + esc(left(o.due)) : "Waiting for the documents"))
      + st("todo", "o", "Documents in") + st("todo", "o", "Audit on board") + st("todo", "o", "Filed");
  }
  function lateOf(r) { return r.status === "sent" && (!!r.overdue || (r.due && Date.parse(r.due) < Date.now())); }
  function slotChip(s) {
    if (s.state === "answered") return '<span class="chip g">Answered' + (s.at ? " " + fmtD(s.at) : "") + "</span>";
    if (s.state === "pending") return '<span class="chip n">Asked' + (s.at ? " " + fmtD(s.at) : "") + "</span>";
    if (s.state === "na") return '<span class="chip m">Not applicable</span>';
    return '<span class="chip m">Not asked</span>';
  }
  /* the stored field-intel summary ("• Summary: … • What happened: …"), one labelled paragraph per bullet */
  function fullReport(t) {
    return String(t || "").split(/\s*•\s*/).filter(function (x) { return x.trim(); }).map(function (x) {
      var m = x.match(/^([A-Z][\w ]{2,30}):\s*([\s\S]*)$/);
      return "<p>" + (m ? "<b>" + esc(m[1]) + ".</b> " + esc(m[2]) : esc(x)) + "</p>";
    }).join("");
  }
  function feedRow(f, i) {
    var others = f.others || [], n = others.length + 1;
    var dates = others.map(function (o) { return fmtD(o.at); }).filter(Boolean);
    var chips = '<span class="chip ' + (f.kind === "intel" ? "n" : "m") + '">' + esc(KIND[f.kind] || f.kind) + "</span>" + (others.length ? '<span class="chip m">' + n + " reports · one incident</span>" : "") + (f.rating != null ? '<span class="chip m">' + esc(f.rating) + "/5</span>" : "");
    var more = others.map(function (o) { return '<p class="also">Also reported' + (o.who ? " by " + esc(o.who) : "") + (o.at ? " · " + fmtD(o.at, true) : "") + "</p>" + fullReport(o.full); }).join("");
    var hasFull = (f.full && f.full.trim() !== String(f.text || "").trim()) || more;
    return '<div class="feed' + (i ? " line-t" : "") + '"><div class="fd-date"><b class="h4">' + (fmtD(f.at) || "No date") + "</b>" + (dates.length ? '<span class="xs">and ' + dates.join(", ") + "</span>" : "") + "</div>"
      + '<div class="sec tight"><div class="hstack"><b>' + esc(f.who || "Not named") + "</b>" + chips + "</div>" + '<p class="txt">' + esc(f.text) + "</p>"
      + (hasFull ? '<details class="rd"><summary class="ul"><span class="o1">' + (others.length ? (n === 2 ? "Read both reports" : "Read all " + n + " reports") : "Read the full report") + '</span><span class="o2">Hide the report' + (others.length ? "s" : "") + '</span></summary><div class="full">' + fullReport(f.full) + more + "</div></details>" : "")
      + "</div></div>";
  }
  function rushOrders(r, who) {
    if (!r || !r.count) return "";
    var rows = r.orders.map(function (o) {
      var names = o.items.map(function (i) { return i.name; }), what = (names[0] || "Parts") + (names.length > 1 ? " +" + (names.length - 1) : "");
      var whose = o.reason !== "vessel" ? '<span class="chip m">' + esc(o.tag) + "</span>"
        : o.his === true ? '<span class="chip r">' + esc(who) + "&#8217;s miss</span>" + (o.why ? '<div class="xs">' + esc(o.why) + "</div>" : "")
        : o.his === false ? '<span class="chip m">Another crew&#8217;s miss</span>' + (o.owner || o.why ? '<div class="xs">' + esc([o.owner, o.why].filter(Boolean).join(" · ")) + "</div>" : "")
        : '<span class="chip a">Check whose miss it is</span>';
      return '<tr><td data-l="Ordered">' + fmtD(o.at) + '</td><td class="full" data-l="Parts"><b>' + esc(what) + '</b><div class="xs">' + esc([o.ref, o.by ? "placed by " + o.by : ""].filter(Boolean).join(" · ")) + "</div>" + (o.note ? '<div class="xs">&#8220;' + esc(o.note) + "&#8221;</div>" : "") + '</td><td class="full" data-l="Tag">' + (o.reason === "vessel" ? '<div class="xs" style="margin-bottom:4px">' + esc(o.tag) + "</div>" : "") + whose + '</td><td class="n" data-l="Total">' + usd(o.total) + (o.rush > 0 ? '<div class="xs">' + usd(o.rush) + " freight &amp; customs</div>" : "") + "</td></tr>";
    }).join("");
    return '<section class="card clip"><div class="pad-m sec-hd"><h2 class="h3">Rush orders this contract</h2><span class="sm">Tagged as a miss on the order portal · ' + fmtD(r.from) + " to " + (r.to ? fmtD(r.to) : "today") + "</span></div>"
      + '<table class="tbl cards line-t"><thead><tr><th>Ordered</th><th>Parts</th><th>Tag</th><th class="n">Total</th></tr></thead><tbody>' + rows + "</tbody></table></section>";
  }
  function usd(v) { var n = Number(v) || 0; return n > 0 && n < 1 ? "&lt;$1" : "$" + Math.round(n).toLocaleString("en-US"); }
  function briefAside(b, ship, sc, mine) {
    var fn = esc(first(b.crew.name));
    if (b.shipOpen) return shipBusyCard(ship, b.shipOpen.crew, b.crew.name, b.shipOpen.id);
    if (mine) {
      var late = lateOf(mine);
      var tag = mine.grade != null ? "Audited this contract" : mine.status === "complete" ? "Documents in" : late ? "Past the deadline" : mine.status === "draft" ? "Being sent" : "Waiting on " + fn;
      var t = mine.grade != null ? "Score " + esc(mine.grade) + "/5" : mine.status === "complete" ? "Ready for the visit" : late ? fn + " has not sent everything" : "The request is out";
      var cta = mine.grade != null ? '<button type="button" class="btn white" data-go="q=' + esc(mine.id) + '">Open the audit</button>'
        : mine.status === "complete" ? '<div class="cta hide-m"><button type="button" class="btn green" data-go="a=' + esc(mine.id) + '|1">Start the audit</button><button type="button" class="btn white" data-go="q=' + esc(mine.id) + '">Read the documents</button></div><button type="button" class="arrow only-m" data-go="q=' + esc(mine.id) + '">Read the documents' + ic("arrow-right") + "</button>"
        : '<div class="cta"><button type="button" class="btn white" data-go="q=' + esc(mine.id) + '">Open the request</button></div>';
      return '<section class="navy sec"><span class="eyebrow">' + tag + '</span><h2 class="h3">' + t + '</h2><div class="sec tight">'
        + reqSteps({ asked: mine.at, status: mine.status, late: late, due: mine.due, inAt: mine.complete, graded: mine.grade != null, gradedAt: mine.gradedAt, score: mine.grade }) + "</div>" + cta + "</section>";
    }
    return '<section class="navy sec"><span class="eyebrow">The audit</span><h2 class="h3">Ask ' + fn + " for the documents</h2>"
      + '<p class="sm">Pattern 43 and the Machine Management List from each press, and a blind count of every OBP line. 24 hours to send them; the audit opens once everything is in.</p>'
      + '<div class="cta hide-m"><button type="button" class="btn green" data-go="r=' + esc(encodeURIComponent(ship)) + "|" + esc(encodeURIComponent(sc)) + '">Request the documents</button></div></section>';
  }
  /* a screen opened straight from a link reads the ships list too (the brand, who is aboard): one wave, never a wait for ever */
  function withShips(p) { return S.ships ? p : Promise.all([p, api("/api/audit/ships").then(function (r) { if (!S.ships) { S.ships = r.ships; S.today = S.today || r.today; S.counts = r.counts || S.counts; keepShips(r); } }).catch(function () {})]).then(function (x) { return x[0]; }); }
  function briefView(ship, sc) {
    chrome(""); dock("");
    $("main").innerHTML = skel(3);
    var key = ship + "|" + sc; S.view = key;
    var p = S.brief[key] ? Promise.resolve(S.brief[key]) : api("/api/audit/brief?ship=" + encodeURIComponent(ship) + "&sc=" + encodeURIComponent(sc));
    withShips(p).then(function (b) {
      S.brief[key] = b; if (!S.today) S.today = b.today;
      if (S.view !== key) return;
      var sh = (S.ships || []).filter(function (x) { return x.ship === ship; })[0], aboard = sh ? sh.aboard : [];
      var fn = esc(first(b.crew.name)), c = b.contract || {}, cur = c.current;
      // THIS contract's request: the open one, else the latest asked on or after the sign-on (an audit belongs to its contract)
      var mine = (b.audits || []).filter(function (a) { return !a.test && a.status !== "cancelled" && (b.open ? a.id === b.open : !cur || !cur.on || String(a.at || "") >= cur.on); })[0] || null;
      var brand = sh ? custOf(sh) : "";
      var others = aboard.filter(function (x) { return x.sc !== sc; });
      var leadT = aboard.length > 1 ? (aboard.length === 2 ? "Two" : aboard.length) + " printer specialists are aboard. An audit belongs to one contract: pick whose."
        : esc(b.crew.name) + (b.crew.position ? ", " + esc(b.crew.position) : "") + ". An audit belongs to this contract.";
      var picks = "";
      if (aboard.length > 1) {
        picks = '<div class="picks" role="group" aria-label="Who you are auditing">' + aboard.map(function (x) {
          var on = x.sc === sc, cn = contractNo(x);
          var line = [cn ? cn.charAt(0).toUpperCase() + cn.slice(1) : "", x.signOn ? "since " + fmtD(x.signOn) : "", x.heldByFile ? "past the sign-off" : x.signOff ? "signs off " + fmtD(x.signOff) : ""].filter(Boolean).join(" · ");
          var chip = x.audit && (x.audit.open || x.audit.grade != null) ? reqChip(x.audit) : b.shipOpen && x.sc !== (sh.last && sh.last.sc) && sh.open ? '<span class="chip n">Waits for ' + esc(first(b.shipOpen.crew)) + "&#8217;s audit</span>" : sh && sh.open && sh.last && sh.last.sc !== x.sc ? '<span class="chip n">Waits for ' + esc(first(sh.last.crew)) + "&#8217;s audit</span>" : "";
          return '<button type="button" class="pick' + (on ? " on" : "") + '"' + (on ? "" : ' data-go="b=' + esc(encodeURIComponent(ship)) + "|" + esc(encodeURIComponent(x.sc)) + '"') + ' aria-pressed="' + on + '"><span class="radio"><i></i></span><span class="pk-main"><b class="h4">' + esc(x.name) + '</b><span class="sm">' + line + "</span>" + (chip ? '<span class="only-m" style="margin-top:6px">' + chip + "</span>" : "") + "</span>" + (chip ? '<span class="hide-m">' + chip + "</span>" : "") + "</button>";
        }).join("") + "</div>";
      }
      var h = '<section class="split">' + head({ back: ["#", (custName(brand) || "All") + " ships"], eyebrow: (brandOf(sh || {}) ? brandOf(sh) + " · " : "") + "Ship briefing", title: esc(ship), lead: leadT, more: picks })
        + briefAside(b, ship, sc, mine) + "</section>";

      // the contract in four numbers, each with where it comes from
      var done = (String(c.label || "").match(/^(\d+)/) || [])[1], onNo = (String(c.label || "").match(/on contract (\d+)/) || [])[1];
      var srcShort = c.source ? String(c.source).replace(/as of (\d{4}-\d{2}-\d{2})/, function (m, d) { return fmtD(d); }) : "";
      var aboardFor = cur && cur.on ? md(cur.on, S.today) : "";
      var stats = [
        (function () { var me = aboard.filter(function (x) { return x.sc === sc; })[0], bn = me ? (String(me.contract || "").match(/on contract (\d+)/) || [])[1] : null;
          return onNo ? { v: "Contract " + onNo, k: done + " completed" + (srcShort ? " · " + esc(srcShort) : "") } : bn ? { v: "Contract " + bn, k: "Not in TDG&#8217;s count file · per the Keyman board" } : { v: cur ? "On contract" : "Not aboard", k: "Count not on file" }; })(),
        { v: cur && cur.on ? (aboardFor || "Since today") : "–", k: cur && cur.on ? "Aboard since " + fmtD(cur.on) : "No running contract" },
        { v: cur && cur.off ? fmtD(cur.off) : "–", k: cur && cur.held ? "Past the sign-off · TDG has them aboard" : cur && cur.off ? "Signs off · " + esc(OFF_SRC[cur.offSource] || "per the board") : "No sign-off on file" },
        { v: b.rush && b.rush.from ? String(b.rush.count || 0) : "–", k: b.rush && b.rush.from ? "Rush orders this contract" : "Rush orders · the portal did not answer" },
      ];
      h += '<section class="stats" style="--n:4">' + stats.map(function (s) { return '<div><span class="v">' + s.v + '</span><span class="k">' + s.k + "</span></div>"; }).join("") + "</section>";

      // the relay: who handed the seat over, this contract to today, who takes it next
      if (cur && cur.on) {
        var rl = b.relay || {}, bf = rl.before, af = rl.after, tot = cur.off ? Math.max(1, days(cur.on, cur.off)) : 0, gone = days(cur.on, S.today);
        var afTdg = af && (af.src === "tdg" || af.src === "tdg_earmark" || af.tdg);
        var afSub = !af ? (cur.offSource === "projected" ? "Projected sign-off, " + (brand === "Azamara" ? "5" : "7") + " months" : "") : (af.on ? (af.on <= S.today ? "Aboard since " + fmtD(af.on) : "Signs on " + fmtD(af.on)) : "No dates yet") + (afTdg ? " · in TDG" : af.told ? " · told Joy" : af.src === "earmark" ? " · console plan" : "");
        h += '<section class="card pad sec"><div class="sec-hd"><h2 class="h3">The contract</h2><span class="sm">Keyman board · ' + fmtD(S.today) + '</span></div><div class="relay">'
          + '<div class="rl-end"><span class="xs">Took over from</span><b class="h4">' + (bf ? esc(bf.name) : "Not on record") + '</b><span class="xs">' + (bf && bf.off ? (bf.off <= S.today ? "Signed off " : "Signs off ") + fmtD(bf.off) : "") + "</span></div>"
          + '<div class="rl-mid"><div class="prog"><i style="width:' + (cur.held || (cur.off && cur.off < S.today) ? "100%;background:var(--redm)" : pct(gone, tot || gone) + "%") + '"></i></div><div class="xs rl-d"><span>' + fmtD(cur.on) + '</span><span class="b">Today · aboard ' + esc(aboardFor || "since today") + "</span><span>" + (cur.off ? fmtD(cur.off) : "") + "</span></div></div>"
          + '<div class="rl-end r"><span class="xs">Hands over to</span><b class="h4">' + (af ? esc(af.name) : "No reliever yet") + '</b><span class="xs">' + esc(afSub) + "</span></div></div></section>";
      }

      // what others said: who has been asked, then the feed, newest first
      var feed = b.feed || [];
      h += '<section class="sec"><div class="sec-hd"><h2 class="h2">What others said</h2><span class="sm">' + (feed.length ? fn + "&#8217;s record · newest first" : "Nothing on record") + "</span></div>";
      if ((b.slots || []).length) h += '<div class="slots">' + b.slots.map(function (s) { return '<div class="slot"><span class="xs">' + esc(s.label) + "</span>" + slotChip(s) + "</div>"; }).join("") + "</div>";
      h += feed.length ? '<div class="card clip">' + feed.map(feedRow).join("") + "</div>" : '<div class="card pad"><p class="sm">Nothing recorded on ' + fn + " yet: no feedback, field report, note or shipboard review.</p></div>";
      h += "</section>";

      // three facts about the ship and this contract
      var r = b.rush, sa = b.shipAudits || [], fu = b.followups || [];
      var rushT = !r || !r.from ? ["Not read", "The order portal did not answer. Nothing is assumed."] : !r.count ? ["None", fmtD(r.from) + " to today, from the order portal."] : [r.count + (r.count === 1 ? " order · " : " orders · ") + usd(r.total), (r.his.count ? r.his.count + " charged to " + fn : "None charged to " + fn) + " · listed below"];
      var lastA = sa[0];
      h += '<section class="grid3">'
        + '<div class="card feat rowm"><span class="fi' + (r && r.his && r.his.count ? " r" : "") + '">' + ic("shopping-cart") + '</span><span class="xs">Rush orders this contract</span><b class="h3">' + rushT[0] + '</b><p class="sm">' + rushT[1] + "</p></div>"
        + '<div class="card feat rowm"><span class="fi n">' + ic("list") + '</span><span class="xs">Audits of ' + esc(ship) + '</span><b class="h3">' + (lastA ? (sa.length === 1 ? "1 filed" : sa.length + " filed") : "None filed yet") + '</b><p class="sm">' + (lastA ? "Last: " + esc(lastA.crew || "") + ", " + fmtD(lastA.at, true) + (lastA.score != null ? " · score " + esc(lastA.score) + "/5" : "") : "The 61 Forms audits are not imported yet.") + "</p></div>"
        + '<div class="card feat rowm"><span class="fi a">' + ic("flag") + '</span><span class="xs">Open follow-ups</span><b class="h3">' + (fu.length ? fu.length + " open" : "None") + '</b><p class="sm">' + (fu.length ? esc(fu[0].text) + (fu[0].owner ? " · " + esc(fu[0].owner) : "") + (fu[0].due ? " · due " + fmtD(fu[0].due) : "") : "Nothing carried over from an earlier audit of " + esc(ship) + ".") + "</p></div>"
        + "</section>";
      h += rushOrders(r, first(b.crew.name));
      h += '<section class="help"><span class="fi n">' + ic("user") + '</span><div class="t"><b class="h4">Everything else on ' + fn + '</b><span class="sm">Documents, travel, notes and every earlier contract are on the profile in the HR console.</span></div><a class="arrow" href="https://cims.work/#crew/' + esc(encodeURIComponent(sc)) + '" target="_blank" rel="noopener">Open the profile' + ic("arrow-right") + "</a></section>";
      $("main").innerHTML = h;
      S.lastBrief = b;
      if (b.shipOpen) dock(shipBusy(ship, b.shipOpen.crew, b.crew.name, b.shipOpen.id));
      else if (mine && mine.grade == null && mine.status === "complete") dock('<button type="button" class="btn green" data-go="a=' + esc(mine.id) + '|1">Start the audit</button>');
      else if (mine && mine.grade == null) dock('<button type="button" class="btn pri" data-go="q=' + esc(mine.id) + '">Open the request</button>');
      else if (!mine) dock('<button type="button" class="btn green" data-go="r=' + esc(encodeURIComponent(ship)) + "|" + esc(encodeURIComponent(sc)) + '">Request the documents</button>');
    }).catch(function (e) { if (S.view === key) fail(e); }); // a late error never replaces the screen moved on to
  }

  /* ---------------- A3 · The ask (canvas board "Ask") ----------------
     What the seafarer sends, the email that asks for it, and every condition the request needs, each ticked or not. */
  function aboardOf(ship, sc) { var s = (S.ships || []).filter(function (x) { return x.ship === ship; })[0]; return s ? (s.aboard || []).filter(function (x) { return x.sc === sc; })[0] || null : null; }
  function sendRow(icn, cls, t, s) { return '<div class="send line-t"><span class="fi' + (cls ? " " + cls : "") + '">' + ic(icn) + '</span><div><b class="h4">' + t + '</b><p class="sm">' + s + "</p></div></div>"; }
  function sendsCard(fn, presses, lines) {
    return '<div class="card clip"><div class="pad-m sec-hd"><h2 class="h3">What ' + fn + ' sends</h2><span class="sm">Each file is read the moment it lands</span></div>'
      + sendRow("file-text", "", "Pattern 43", "One 12-page scan per press" + (presses ? ", " + presses + " in all" : "") + ". Read for white dots, lines and density, colour by colour.")
      + sendRow("list", "n", "Machine Management List", "Printed from each press and scanned: the Machine list (52 pages), not the User list (5 pages). Read for parts past their rated life.")
      + sendRow("package", "a", "The shelf count", (lines ? "All " + lines + " OBP lines. " : "Every OBP line. ") + fn + " types what is on the shelf and never sees OBP&#8217;s number.") + "</div>";
  }
  function requestView(ship, sc) {
    chrome(""); dock("");
    $("main").innerHTML = skel(4);
    var key = "r" + ship + "|" + sc; S.view = key;
    withShips(api("/api/audit/request/preview?ship=" + encodeURIComponent(ship) + "&sc=" + encodeURIComponent(sc))).then(function (p) {
      if (S.view !== key) return;
      if (p.open) { location.replace("#q=" + p.open.id); return; }
      var fn = esc(first(p.crew.name)), sh = (S.ships || []).filter(function (x) { return x.ship === ship; })[0] || {}, x = aboardOf(ship, sc);
      var back = ["b=" + encodeURIComponent(ship) + "|" + encodeURIComponent(sc), ship + " briefing"];
      if (p.shipOpen) {
        $("main").innerHTML = '<section class="split">' + head({ back: back, eyebrow: (brandOf(sh) ? brandOf(sh) + " · " : "") + ship, title: "Ask " + fn + " for the documents", lead: busyLine(p.shipOpen.crew, p.crew.name) }) + shipBusyCard(ship, p.shipOpen.crew, p.crew.name, p.shipOpen.id) + "</section>";
        dock(shipBusy(ship, p.shipOpen.crew, p.crew.name, p.shipOpen.id)); return;
      }
      var n = p.machines ? p.machines.length : 0, lines = p.lines || 0;
      var who = x ? [contractNo(x) ? contractNo(x).charAt(0).toUpperCase() + contractNo(x).slice(1) : "", x.signOn ? "aboard since " + fmtD(x.signOn) : "", x.heldByFile ? "past the sign-off" : x.signOff ? "signs off " + fmtD(x.signOff) + (md(S.today, x.signOff) ? ", in " + esc(md(S.today, x.signOff)) : "") : ""].filter(Boolean).join(" · ") : "";
      var can = p.hon && n > 0 && lines > 0 && (p.shown || !p.live);
      var ck = function (ok, t) { return '<div class="ck"><span class="' + (ok ? "c" : "x") + '">' + ic(ok ? "b:check" : "b:x") + "</span><span>" + t + "</span></div>"; };
      var checks = ck(true, fn + " is aboard " + esc(ship) + " per the board")
        + (!p.hon ? ck(false, "HON did not answer: the presses and the OBP list come from it") : ck(n > 0, n ? n + (n === 1 ? " press" : " presses") + " on HON&#8217;s register" : "No press on HON&#8217;s register for " + esc(ship))
          + ck(lines > 0, lines ? "OBP list" + (p.obpAsOf ? " of " + fmtD(p.obpAsOf) : "") + " · " + lines + " lines" : "No OBP list on HON: nothing to count"))
        + (p.live ? ck(!!p.shown, p.shown ? "The ship&#8217;s printshop mailbox is on file" : "No printshop mailbox for " + esc(ship) + " in the ship contacts") : "")
        + ck(true, "No open request for " + esc(ship));
      var copy = p.live ? [p.noPersonal ? "" : fn + "&#8217;s personal email (never shown)"].concat((p.copyNames || []).map(esc)).filter(Boolean).join(" · ") : "Nobody: test mode";
      var aside = '<aside class="card pad sec"><div class="sec-hd"><h2 class="h3">The email</h2>' + (!p.live ? '<span class="chip a">Test mode</span>' : can ? '<span class="chip g">Ready to send</span>' : '<span class="chip r">Cannot go yet</span>') + "</div>"
        + (!p.live ? '<p class="sm">Test mode: the email goes to you only, marked TEST. Nothing reaches the ship.</p>' : "")
        + "<div>" + '<div class="kv"><span>To</span><span class="b">' + (p.live ? (p.shown ? esc(p.shown) : "No ship mailbox") : "You, as a test" + (p.shown ? '<div class="sm">live, it goes to ' + esc(p.shown) + "</div>" : "")) + "</span></div>"
        + '<div class="kv"><span>Copy</span><span>' + copy + "</span></div>"
        + '<div class="kv"><span>Replies go to</span><span>' + esc(p.replyTo || "you") + "</span></div>"
        + '<div class="kv"><span>Due</span><span>24 hours after it goes' + (p.remindAt ? " · a reminder at hour " + esc(p.remindAt) : "") + "</span></div></div>"
        + '<div class="sec tight line-t" style="padding-top:16px">' + checks + "</div>"
        + '<button type="button" class="btn pri hide-m sendreq"' + (can ? "" : " disabled") + ">" + (p.live ? "Send the request" : "Send the test request to me") + ic("paper-plane-tilt") + "</button>"
        + '<p class="xs">Nobody aboard, no OBP list, or no address on file: the request cannot go, and this card says which.</p></aside>';
      var h = '<section class="split"><div class="sec">' + head({ back: back, eyebrow: (brandOf(sh) ? brandOf(sh) + " · " : "") + ship, title: "Ask " + fn + " for the documents", lead: fn + " sends them from the ship within 24 hours. The audit opens once everything is in; there is no start without them." }).replace(/^<div class="sec">|<\/div>$/g, "")
        + '<div class="who-card"><span class="fi n">' + ic("user") + '</span><div style="min-width:0"><b class="h4">' + esc(p.crew.name) + "</b>" + (who ? '<div class="sm">' + who + "</div>" : "") + "</div></div>"
        + sendsCard(fn, n, lines) + "</div>" + aside + "</section>";
      if (!p.hon) h += '<div class="err">' + ic("warning-circle") + "<span>" + esc(WHY.hon_unavailable) + "</span></div>";
      if (n) h += '<section class="card clip"><div class="sec-hd pad-m"><h2 class="h3">' + esc(ship) + '&#8217;s presses</h2><span class="sm">HON&#8217;s machine register</span></div>'
        + p.machines.map(function (m) { return '<div class="press-row line-t"><span class="fi n s">' + ic("printer") + '</span><div><b>' + esc(m.label) + '</b><div class="sm">' + esc([m.model, m.serial].filter(Boolean).join(" · ")) + '</div></div><span class="chip m">2 files</span></div>'; }).join("")
        + '<div class="pad-m line-t soft"><p class="sm">A press that is down: ' + fn + " says why, and that counts as explained. You check it on board.</p></div></section>";
      h += '<section class="help"><span class="fi a">' + ic("chat-circle") + '</span><div class="t"><b class="h4">Questions from the ship reach ' + esc(p.replyTo || "you") + '</b><span class="sm">Replies to the request email go to ' + esc(first(p.replyTo || "you")) + ((p.copyNames || []).length > 1 ? "; " + (p.copyNames || []).slice(1).map(function (c) { return esc(first(c)); }).join(", ") + " in copy." : ".") + "</span></div></section>";
      $("main").innerHTML = h;
      dock('<button type="button" class="btn pri sendreq"' + (can ? "" : " disabled") + ">" + (p.live ? "Send the request" : "Send the test request to me") + ic("paper-plane-tilt") + "</button>");
      var btns = document.querySelectorAll ? document.querySelectorAll(".sendreq") : [];
      var send = function () {
        for (var i = 0; i < btns.length; i++) { btns[i].disabled = true; btns[i].innerHTML = "Sending"; }
        var bf = S.brief[ship + "|" + sc]; // THIS seafarer's briefing, never the last one drawn
        var contract = bf && bf.contract ? bf.contract.label : null;
        post("/api/audit/request", { ship: ship, sc: sc, contract: contract }).then(function (r) {
          if (r.ok || r.error === "already_open") { S.brief = {}; reloadShips(); location.replace("#q=" + r.id); }
          else if (r.error === "ship_busy") { S.brief = {}; reloadShips(); requestView(ship, sc); }
          else {
            for (var i = 0; i < btns.length; i++) { btns[i].disabled = false; btns[i].innerHTML = "Try again" + ic("arrow-clockwise"); }
            $("main").insertAdjacentHTML("afterbegin", '<div class="err">' + ic("warning-circle") + "<span>" + esc(WHY[r.error] || r.detail || r.error) + "</span></div>");
          }
        }).catch(function (e) { if (S.view === key) fail(e); }); // a late error never replaces the screen moved on to
      };
      for (var i = 0; i < btns.length; i++) btns[i].onclick = send;
    }).catch(function (e) { if (S.view === key) fail(e); }); // a late error never replaces the screen moved on to
  }

  /* ---------------- A6 / A8 · The request (canvas board "Request") ----------------
     Waiting, past the deadline, or everything is in: what came in per document, and once in, what the documents said
     (each item to confirm on board). Filed: the audit. */
  function machDone(m) { return !!m.down || (m.p43 && m.p43.read_state === "ok" && m.mgmt && m.mgmt.read_state === "ok"); }
  function docTile(d, kind, name, icn, cls) {
    var live = d.machines.filter(function (m) { return !m.down; }), slots = live.map(function (m) { return m[kind]; });
    var ok = slots.filter(function (s) { return s && s.read_state === "ok"; }).length, bad = slots.filter(function (s) { return s && (s.read_state === "wrong_doc" || s.read_state === "unreadable" || s.read_state === "failed"); }).length;
    var wait = slots.filter(function (s) { return s && s.read_state === "pending"; }).length, none = slots.filter(function (s) { return !s; }).length, late = lateOf({ status: d.status, overdue: d.overdueAt, due: d.dueAt });
    var chip = !live.length ? '<span class="chip m">Every press down</span>' : ok === live.length ? '<span class="chip g">Read</span>' : bad ? '<span class="chip r">Send again</span>' : none && late ? '<span class="chip r">Missing</span>' : wait ? '<span class="chip n">Reading</span>' : '<span class="chip m">' + (ok + wait) + " of " + live.length + " in</span>";
    var each = d.machines.map(function (m) { var s = m[kind], st = m.down ? "down" : !s ? "not sent" : s.read_state === "ok" ? "read" : s.read_state === "pending" ? "reading" : s.read_state === "wrong_doc" ? "wrong document" : "scan again"; return (d.machines.length > 1 ? esc(m.label) + " " : "") + st; });
    var one = d.machines[0] || {}, s1 = one[kind];
    var line = d.machines.length > 1 ? each.join(" · ") : one.down ? "Reported down: &#8220;" + esc(one.down) + "&#8221;" : !s1 ? "Nothing yet from the ship" : s1.read_state === "ok" ? "Received " + fmtD(s1.at) + " · read by HON" : s1.read_state === "pending" ? "Received " + fmtD(s1.at) + " · HON is reading it" : esc(s1.say || "Send it again");
    return '<div class="card feat rowm"><div class="hstack" style="justify-content:space-between;align-items:flex-start"><span class="fi' + (cls ? " " + cls : "") + '">' + ic(icn) + "</span>" + chip + '</div><b class="h3">' + name + '</b><p class="sm">' + line + "</p></div>";
  }
  function countTile(d, done) {
    var late = lateOf({ status: d.status, overdue: d.overdueAt, due: d.dueAt }), c = d.count, left = c.total - c.done;
    return '<div class="card feat rowm"><div class="hstack" style="justify-content:space-between;align-items:flex-start"><span class="fi a">' + ic("package") + '</span><span class="chip ' + (c.done === c.total ? "g" : late ? "r" : "m") + '">' + c.done + " of " + c.total + '</span></div><b class="h3">The shelf count</b>'
      + '<p class="sm">' + (c.done === c.total ? (done ? "Counted blind and sent" + (d.completeAt ? " " + fmtD(d.completeAt) : "") : "Every line counted") : left + (left === 1 ? " line " : " lines ") + (late ? "not counted" : "still to count")) + (d.extras ? " · " + d.extras + (d.extras === 1 ? " item" : " items") + " not on the OBP list" : "") + "</p>"
      + '<div class="prog"><i style="width:' + pct(c.done, c.total) + "%;background:" + (c.done === c.total ? "var(--green)" : late ? "var(--redm)" : "var(--navy)") + '"></i></div></div>';
  }
  /* what the documents said, per press and for the count: each item comes up in the audit to confirm on board */
  function beforeSec(v) {
    var h = '<section class="sec"><div class="sec-hd"><h2 class="h2">Before the visit</h2><span class="sm">Read by HON · each item to confirm on board</span></div>';
    (v.machines || []).forEach(function (m) {
      var items = (m.p43 && m.p43.items) || [], life = m.life || [];
      h += '<div class="card pad sec"><div class="hstack"><span class="fi">' + ic("printer") + '</span><div style="min-width:0"><b class="h3">' + esc(m.label) + '</b><div class="sm">' + esc([m.model, m.serial].filter(Boolean).join(" · ")) + "</div></div></div>";
      if (m.down) h += '<div class="finding"><div class="hstack"><span class="chip a">Reported down</span><b class="h4">&#8220;' + esc(m.down) + '&#8221;</b></div><p class="sm">Verify on board: running again, or still down.</p></div>';
      else {
        h += items.length ? items.map(function (i) { return '<div class="finding"><div class="hstack"><span class="chip a">Pattern 43</span><b class="h4">' + esc(sentence(i.head)) + "</b></div>" + (i.where || i.detail ? '<p class="txt">' + esc(i.where || i.detail) + "</p>" : "") + (i.check ? '<p class="sm">Observation · ' + esc(i.check) + "</p>" : "") + "</div>"; }).join("")
          : '<div class="finding ok"><div class="hstack"><span class="chip g">Pattern 43</span><b class="h4">' + (m.p43 ? "No mark found" : "Not read") + "</b></div></div>";
        h += life.length ? '<div class="finding"><div class="hstack"><span class="chip a">Management list</span><b class="h4">' + life.length + (life.length === 1 ? " part" : " parts") + ' past its rated life</b></div><p class="txt">' + life.map(function (x) { return esc(AR.partName(x.name)) + " " + esc(x.pct) + "%"; }).join(" · ") + "</p></div>"
          : '<div class="finding ok"><div class="hstack"><span class="chip g">Management list</span><b class="h4">No part past its rated life</b></div></div>';
        if (items.length || life.length) h += '<p class="txt"><b>Recommendation:</b> have this machine looked at. Parts are changed on copy quality, not on a count.</p>';
      }
      h += "</div>";
    });
    var diff = (v.count && v.count.diff) || [], extras = (v.count && v.count.extras) || [], parts = v.parts || [];
    var counted = parts.filter(function (p) { return p.counted != null; }).length, gaps = diff.filter(function (x) { return x.kind === "gap"; }), timing = diff.filter(function (x) { return x.kind === "timing"; });
    var nm = first(v.crew);
    h += '<div class="card clip"><div class="pad-m sec tight"><div class="sec-hd"><h3 class="h3">The shelf count against OBP</h3><span class="sm">' + esc(nm) + "&#8217;s blind count" + (v.completeAt ? " of " + fmtD(v.completeAt) : "") + (v.count && v.count.asOf ? " · OBP of " + fmtD(v.count.asOf) : "") + "</span></div>"
      + '<div class="minis"><div><b class="h3">' + counted + '</b><span class="xs">lines counted</span></div><div><b class="h3">' + Math.max(0, counted - diff.length) + '</b><span class="xs">matched OBP</span></div><div><b class="h3">' + timing.length + '</b><span class="xs">one off the day OBP moved</span></div><div><b class="h3"' + (gaps.length + extras.length ? ' style="color:var(--amber)"' : "") + ">" + (gaps.length + extras.length) + '</b><span class="xs">to check on board</span></div></div></div>';
    if (diff.length || extras.length) {
      h += '<table class="tbl cards line-t"><thead><tr><th>Part</th><th class="n">' + esc(nm) + '</th><th class="n">OBP</th><th>Reading</th></tr></thead><tbody>'
        + diff.map(function (x) { return '<tr><td class="full"><b>' + esc(x.description || x.part_no) + '</b><div class="xs">' + esc(x.part_no) + '</div></td><td class="n" data-l="' + esc(nm) + '">' + esc(x.counted) + '</td><td class="n" data-l="OBP">' + esc(x.obp) + '</td><td class="full" data-l="Reading">' + (x.kind === "gap" ? '<span class="chip a">Check on board</span>' : '<span class="chip g">Timing</span><div class="xs">OBP moved the line ' + (x.obpMoved ? fmtD(x.obpMoved) : "the same day") + "</div>") + "</td></tr>"; }).join("")
        + extras.map(function (x) { return '<tr><td class="full"><b>' + esc(x.text) + '</b><div class="xs">Found on the shelf, not on the OBP list</div></td><td class="n" data-l="' + esc(nm) + '">' + esc(x.counted == null ? "–" : x.counted) + '</td><td class="n" data-l="OBP">–</td><td class="full" data-l="Reading"><span class="chip a">Not in OBP</span></td></tr>'; }).join("")
        + "</tbody></table>";
    }
    h += '<div class="pad-m line-t soft"><p class="sm">The 1 Oct rule: a line one unit off on the day OBP moved it is timing, not a finding. Everything else is checked on the shelf.</p></div></div>';
    var downs = (v.machines || []).filter(function (m) { return m.down; }), fus = v.followups || [];
    h += '<div class="grid2"><div class="card feat rowm"><span class="fi n">' + ic("wrench") + '</span><b class="h4">Presses reported down</b><p class="sm">' + (downs.length ? downs.map(function (m) { return esc(m.label) + ": &#8220;" + esc(m.down) + "&#8221;"; }).join(" · ") : "None. Every press was running when " + esc(nm) + " scanned.") + "</p></div>"
      + '<div class="card feat rowm"><span class="fi a">' + ic("flag") + '</span><b class="h4">Follow-ups from the last audit</b><p class="sm">' + (fus.length ? fus.map(function (f) { return esc(f.text) + (f.owner ? " · " + esc(f.owner) : "") + (f.due ? " · due " + fmtD(f.due) : ""); }).join("<br>") : "None open for this ship.") + "</p></div></div>";
    return h + "</section>";
  }
  function requestDetail(id) {
    chrome(""); dock("");
    $("main").innerHTML = skel(4);
    var key = "q" + id; S.view = key;
    withShips(api("/api/audit/request?id=" + encodeURIComponent(id))).then(function (d) {
      if (S.view !== key) return;
      var done = d.status === "complete", sent = d.status === "sent", cancelled = d.status === "cancelled", fn = esc(first(d.crew));
      var late = lateOf({ status: d.status, overdue: d.overdueAt, due: d.dueAt });
      var sh = (S.ships || []).filter(function (x) { return x.ship === d.ship; })[0] || {};
      var inN = d.machines.filter(machDone).length, mt = d.machines.length;
      var gap = d.completeAt && d.sentAt ? took(d.sentAt, d.completeAt) : "";
      var title = d.grade ? esc(d.ship) + " is audited" : done ? esc(d.ship) + " is ready for the visit" : cancelled ? "Request cancelled" : late ? fn + " has not sent everything" : "Waiting on " + fn + " · " + inN + " of " + mt + (mt === 1 ? " press" : " presses") + " in";
      var leadT = d.grade ? "Filed " + fmtD(d.grade.at, true) + ". Score " + esc(d.grade.score) + "/5, " + (d.grade.from === "overall" ? "the Overall rating." : "the average of the ratings, rounded down.")
        : done ? fn + " sent everything" + (d.completeAt ? " on " + fmtD(d.completeAt) : "") + (gap ? ", " + esc(gap) + " after it was asked" : "") + ". This is what the documents said."
        : cancelled ? "The upload link is closed. Nothing more comes in."
        : late ? "Due " + esc(whenUtc(d.dueAt)) + ". " + ((d.gate && d.gate.missing) || []).length + " things still missing."
        : "Asked " + fmtD(d.sentAt) + ". Due " + esc(whenUtc(d.dueAt)) + ", " + esc(left(d.dueAt)) + ". Each file is read as it lands.";
      var back = d.sc ? ["b=" + encodeURIComponent(d.ship) + "|" + encodeURIComponent(d.sc), d.ship + " briefing"] : ["#", "All ships"];
      var more = (late ? '<div class="alert">' + ic("clock") + "<div><b>Past the deadline</b><div class=\"sm\">" + "A reminder goes to " + fn + " at hour 12, and you are told when the deadline passes. The audit stays locked until everything is in.</div></div></div>" : "")
        + (d.test ? '<div class="alert" style="background:var(--amberbg);color:var(--amber)">' + ic("f:warning-circle") + '<div><b>Test request</b><div class="sm" style="color:inherit">Every email went to you only. A test request cannot be graded.</div></div></div>' : "");
      var tag = d.grade ? "Filed" : done ? "Documents in" : cancelled ? "Cancelled" : late ? "Past the deadline" : "Waiting on " + fn;
      var steps = cancelled ? '<div class="ck"><span class="x">' + ic("b:x") + "</span><span>Cancelled" + (d.status === "cancelled" ? "" : "") + "</span></div>"
        : reqSteps({ asked: d.sentAt, status: d.status, late: late, due: d.dueAt, inAt: d.completeAt, graded: !!d.grade, gradedAt: d.grade && d.grade.at, score: d.grade && d.grade.score });
      var pend = lsGet("aud:p:" + id), at = lsGet("aud:s:" + id) || 1, started = !!lsGet("aud:d:" + id);
      var startBtn = done && !d.grade && !d.test && !pend ? '<button type="button" class="btn green" data-go="a=' + esc(id) + "|" + at + '">' + (started ? "Continue the audit · " + esc(AR.STEPS[at - 1].title) : "Start the audit") + "</button>" : "";
      var aside = '<aside class="navy sec"><span class="eyebrow">' + tag + '</span><div class="sec tight">' + steps + "</div>"
        + (startBtn ? '<div class="cta hide-m">' + startBtn + "</div>" : "")
        + (sent ? '<div class="cta"><button type="button" class="btn green s" id="rs">Resend the email</button><button type="button" class="btn white s" id="ex">Extend 24 hours</button><button type="button" class="btn redtxt s" id="cx" style="color:#F2A99D">Cancel</button></div><p class="xs">A resend waits 15 minutes after the last email. Each one keeps the link ' + fn + " already has.</p>" : "")
        + "</aside>";
      var h = (pend && !d.grade ? '<div class="kept">' + ic("cloud-slash") + "<span>The audit is filed on this phone. It sends itself when there is signal.</span></div>" : "")
        + '<section class="split">' + head({ back: back, eyebrow: (brandOf(sh) ? brandOf(sh) + " · " : "") + d.ship + " · the request", title: title, lead: leadT, more: more }) + aside + "</section>";
      if (!cancelled) {
        var downs = d.machines.filter(function (m) { return m.down; }).length;
        h += '<section class="sec"><div class="sec-hd"><h2 class="h2">What came in</h2><span class="sm">' + (mt === 1 ? esc(d.machines[0].label) + " · " + esc([d.machines[0].model, d.machines[0].serial].filter(Boolean).join(" · ")) : mt + " presses" + (downs ? " · " + downs + " reported down" : "")) + "</span></div>"
          + '<div class="grid3">' + docTile(d, "p43", "Pattern 43", "file-text", "") + docTile(d, "mgmt", "Machine Management List", "list", "n") + countTile(d, done) + "</div>";
        var fixes = []; d.machines.forEach(function (m) { [m.p43, m.mgmt].forEach(function (s) { if (s && s.read_state !== "ok" && s.read_state !== "pending" && s.say) fixes.push((mt > 1 ? esc(m.label) + ": " : "") + esc(s.say)); }); });
        if (fixes.length) h += fixes.map(function (t) { return '<div class="finding">' + '<div class="hstack"><span class="chip a">To send again</span></div><p class="txt">' + t + "</p></div>"; }).join("");
        h += "</section>";
      }
      if (d.grade) h += gradeCard(d.grade);
      h += '<div id="beforeslot"></div>';
      $("main").innerHTML = h;
      if (done) (d.grade ? api("/api/audit/visit?id=" + encodeURIComponent(id)) : loadVisit(id)).then(function (v) {
        if (S.view !== key) return;
        if (d.grade) $("beforeslot").innerHTML = filedCard(v);
        else { S.v[id] = v; $("beforeslot").innerHTML = beforeSec(v); }
      }).catch(function () {});
      if (startBtn) dock(startBtn);
      else if (sent) dock('<button type="button" class="btn ghost" id="exd">Extend 24 h</button><button type="button" class="btn pri" id="rsd">Resend</button>');
      if (sent) {
        /* one action at a time: a double tap on Extend added 48 hours, a double Resend sent two emails */
        var busy = false, ids = ["rs", "ex", "cx", "rsd", "exd"], btns = function (on) { ids.forEach(function (k) { var b = $(k); if (b) b.disabled = on; }); };
        var act = function (what, confirmText) { return function () {
          if (busy || (confirmText && !confirm(confirmText))) return;
          busy = true; btns(true);
          post("/api/audit/request/" + what, { id: id }).then(function (r) { if (!r.ok) alert(WHY[r.error] || r.detail || r.error || "Not done"); S.brief = {}; reloadShips(); requestDetail(id); })
            .catch(function () { busy = false; btns(false); alert("No connection. Nothing was changed; try again."); });
        }; };
        var on = function (k, f) { var b = $(k); if (b) b.onclick = f; };
        on("rs", act("resend", "Send the request again? The link " + first(d.crew) + " has keeps working."));
        on("rsd", act("resend", "Send the request again? The link " + first(d.crew) + " has keeps working."));
        on("ex", act("extend")); on("exd", act("extend"));
        on("cx", act("cancel", "Cancel this request? The upload link closes."));
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
  /* ONE way to answer in the audit (Miguel, 19 Oct 2026, three screens: "the dual thing .. not my favorite"). A row starts in its
     normal state with a green tick; one tap marks what is wrong (red, the word in a pill), a second tap takes it back. The
     redesign of 20 Oct 2026 draws it as the canvas's tap row: the tick, the label over its line, the word. */
  function tapBtn(o) {
    var tk = o.tk, mark = tk === "c" ? ic("b:check") : tk === "x" ? ic("b:x") : tk === "w" ? ic("b:exclamation-mark") : "";
    return '<button type="button" class="tap' + (o.bad ? " bad" : "") + '" data-a="' + o.act + '" data-k="' + esc(o.key) + '"' + (o.attrs || "") + ' aria-pressed="' + !!o.pressed + '"><span class="tk ' + tk + '">' + mark + '</span><span class="tl"><b>' + esc(o.label) + "</b>" + (o.sub ? '<span class="xs">' + o.sub + "</span>" : "") + "</span>" + (o.word ? '<span class="pill-s ' + o.pill + '">' + esc(o.word) + "</span>" : "") + "</button>";
  }
  function itemRow(act, key, label, sub, missing, prevMissing, times) {
    return tapBtn({ act: act, key: key, label: label, sub: sub ? esc(sub) : "", bad: missing, pressed: missing, tk: missing ? "x" : "c",
      word: missing ? (times > 1 ? AR.ordinal(times) + " time" : "Missing") : prevMissing ? "Missing last time" : "", pill: missing ? "r" : "m" });
  }
  /* words = [normal, wrong]: the normal word is printed (muted) only where the label names a problem ("Not seen" beside a
     Pattern 43 mark). obs: an observation to confirm, not a fault (the Pattern 43 mark): an open circle until seen, then amber. */
  function tapRow(act, key, label, sub, bad, words, attrs, obs) {
    return tapBtn({ act: act, key: key, label: label, sub: sub, bad: bad && !obs, pressed: bad, attrs: attrs, tk: obs ? (bad ? "w" : "o") : bad ? "x" : "c",
      word: bad ? words[1] : words[0], pill: bad ? (obs ? "a" : "r") : "m" });
  }
  var CHECK_SAY = { test: "Test pattern prints clean", scan: "Scan to email works", collab: "Collaboration works" };
  function prevMissing(v, k) { return !!(v.previous && (v.previous.missing || []).indexOf(k) >= 0); }
  function timesFor(v, k) { return prevMissing(v, k) ? ((v.previous.repeat || {})[k] || 1) + 1 : 1; }
  function toggle(list, k) { var i = list.indexOf(k); if (i >= 0) list.splice(i, 1); else list.push(k); }
  function rateRow(act, k, cur, label, blank) {
    var h = '<div class="scale' + (blank ? " six" : "") + '" role="group" aria-label="' + esc(label) + '">';
    for (var n = 1; n <= 5; n++) h += '<button type="button" class="sc' + (cur === n ? " on" + (n <= 3 && act !== "disp" ? " lo" : "") : "") + '" data-a="' + act + '" data-k="' + k + '" data-v="' + n + '" aria-pressed="' + (cur === n) + '" aria-label="' + esc(label) + " " + n + '">' + n + "</button>";
    if (blank) h += '<button type="button" class="sc blank' + (cur == null ? " on" : "") + '" data-a="' + act + '-blank" data-k="' + k + '" aria-pressed="' + (cur == null) + '">Blank</button>';
    return h + "</div>";
  }
  function box(field, val, ph, rows) { return '<textarea class="ta' + (rows === 1 ? " one" : "") + '" rows="2" data-f="' + field + '" placeholder="' + esc(ph || "") + '">' + esc(val || "") + "</textarea>"; }
  function whyMsg(probs, field) { var p = probs.filter(function (x) { return x.field === field; })[0]; return p && S.err.show ? '<div class="why">' + ic("warning-circle") + "<span>" + esc(p.say) + "</span></div>" : ""; }
  function lbl(t, inner) { return '<label class="lbl"><span class="xs b">' + t + "</span>" + inner + "</label>"; }

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
    var sent = (v.photos || []).filter(function (p) { return p.step === step; }), wait = (S.pq[v.id] || []).filter(function (p) { return p.step === step; }), n = sent.length + wait.length;
    var h = '<div class="card clip"><div class="grp"><span>Photos</span><em>' + (n ? n + (wait.length ? " · " + wait.length + " wait for signal" : "") : "optional") + "</em></div>";
    if (n) {
      h += '<div class="phs">';
      sent.forEach(function (p) { h += '<a class="th" href="/api/audit/visit/photo?f=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener" style="background-image:url(&quot;/api/audit/visit/photo?f=' + encodeURIComponent(p.id) + '&quot;)" aria-label="Photo"></a>'; });
      wait.forEach(function (p) { var u = p._u || (p._u = URL.createObjectURL(p.blob)); h += '<span class="th q" style="background-image:url(&quot;' + u + '&quot;)" title="Waits for signal"></span>'; });
      h += "</div>";
    }
    return h + '<div class="pad-m line-t"><label class="btn ghost s">' + ic("camera") + 'Take a photo<input class="vh" type="file" accept="image/*" capture="environment" data-photo="' + step + '"></label></div></div>';
  }

  /* ---- the steps (0 = before you start: what the documents said; 1–7 = AR.STEPS) ---- */
  var STEP = {};
  STEP.before = function (v) {
    var b = v.before || [];
    var h = b.length ? b.map(function (x) { return '<div class="card pad-m sec tight"><div class="hstack"><span class="chip ' + (x.tone === "a" ? "a" : "m") + '">' + (x.step === "inventory" ? "Count" : "Machines") + '</span><b class="h4">' + esc(x.t) + '</b></div><p class="sm">' + esc(x.s) + "</p></div>"; }).join("")
      : '<div class="card pad-m sec tight"><div class="hstack"><span class="chip g">The documents</span><b class="h4">Nothing found</b></div><p class="sm">Pattern 43 clean, no part past its rated life, the count agrees with OBP.</p></div>';
    return h + '<p class="sm">Every step saves on this phone as you tap. No signal: it is kept here and sent when the server answers.</p><button type="button" class="ul" data-go="q=' + esc(v.id) + '">Open what the documents said</button>';
  };
  STEP.workstation = function (v, d) {
    /* ONE list, everything present until Dexter taps it (Miguel, 19 Oct 2026: "i dont like this game of dual stuff .. make it
       one .. defaulted to all present .. so he can mark what is not there"). */
    var miss = d.ws.missing, h = "";
    AR.WORKSTATION.forEach(function (g) {
      var n = g.items.filter(function (i) { return miss.indexOf(i.key) >= 0; }).length;
      h += '<div class="card clip"><div class="grp"><span>' + esc(g.grp) + "</span><em" + (n ? ' class="bad">' + n + " missing" : ">" + g.items.length + " of " + g.items.length) + "</em></div>";
      g.items.forEach(function (i) { h += itemRow("ws", i.key, i.label, i.sub, miss.indexOf(i.key) >= 0, prevMissing(v, i.key), timesFor(v, i.key)); });
      h += "</div>";
    });
    return h + photoStrip(v, "workstation");
  };
  function machState(d, m) {
    var a = d.hw.machines[m.serial] || {};
    return a.down === "still" ? "down" : (AR.MACHINE_CHECKS.some(function (c) { return (a.checks || {})[c.key] === "finding"; }) || a.p43 === "seen") ? "problem" : "ok";
  }
  STEP.machines = function (v, d, probs) {
    var h = '<div class="card clip">' + tapRow("labeled", "all", "All hardware labeled", "", d.hw.labeled === false, ["", "Not labeled"]) + "</div>";
    v.machines.forEach(function (m) {
      var a = d.hw.machines[m.serial] || (d.hw.machines[m.serial] = { checks: {}, p43: null, down: null, note: "" });
      var stillDown = a.down === "still", ms = machState(d, m), finding = ms === "problem";
      h += '<div class="card clip"><div class="grp"><span>' + esc(m.label) + (m.model || m.serial ? " · " + esc([m.model, m.serial].filter(Boolean).join(" · ")) : "") + "</span>" + (ms === "down" ? '<span class="pill-s r">Down</span>' : finding ? '<span class="pill-s r">Problem</span>' : '<span class="pill-s ok">Working</span>') + "</div>";
      var ser = ' data-s="' + esc(m.serial) + '"';
      if (m.down) h += tapRow("down", "x", "Reported down by " + first(v.crew), "&#8220;" + esc(m.down) + "&#8221;", stillDown, ["Running now", "Still down"], ser);
      if (!stillDown) {
        AR.MACHINE_CHECKS.forEach(function (c) { h += tapRow("chk", c.key, CHECK_SAY[c.key] || c.label, "", a.checks[c.key] === "finding", ["", "Problem"], ser); });
        var items = (m.p43 && m.p43.items) || [];
        if (items.length) {
          var one = items.length === 1 ? items[0] : null;
          var sub = (one ? esc([one.where, one.part ? "points to " + sentence(one.part) : ""].filter(Boolean).join(" · ")) + "<br>" : items.map(function (it) { return esc(sentence(it.head)); }).join("<br>") + "<br>") + "Pattern 43 showed it. Print one and look; Rolando confirms.";
          h += tapRow("p43", "x", one ? sentence(one.head) : items.length + " Pattern 43 marks", sub, a.p43 === "seen", ["Not seen", "Seen"], ser, true);
        }
        if (!m.down) h += (m.life || []).length
          ? '<div class="info line-t"><span class="xs">Management list · ' + m.life.length + (m.life.length === 1 ? " part" : " parts") + ' past rated life · information</span><span class="sm">' + m.life.map(function (x) { return esc(AR.partName(x.name)) + " " + esc(x.pct) + "%" + (x.cover ? " (" + esc(x.cover) + ")" : " (not on the OBP list)"); }).join(" · ") + ". Copy quality decides, never the counter.</span></div>"
          : '<div class="info line-t"><span class="xs">Management list</span><span class="sm">No part past its rated life. Parts are changed on copy quality, not on a count.</span></div>';
      }
      if (finding || stillDown) h += '<div class="pad-m line-t sec tight">' + lbl("What you found" + (finding ? " · required" : ""), box("m:" + m.serial, a.note, "One sentence, what you saw on " + m.label)) + whyMsg(probs, "note:" + m.serial) + "</div>";
      h += "</div>";
    });
    var tm = d.hw.tools.missing;
    h += '<div class="card clip"><div class="grp"><span>Tools not on inventory</span><em' + (tm.length ? ' class="bad">' + tm.length + " missing" : ">" + AR.TOOLS.length + " of " + AR.TOOLS.length) + "</em></div>";
    AR.TOOLS.forEach(function (t) { h += itemRow("tool", t.key, t.label, "", tm.indexOf(t.key) >= 0, prevMissing(v, t.key), timesFor(v, t.key)); });
    return h + "</div>" + photoStrip(v, "machines");
  };
  function partOf(v, pn) { return (v.parts || []).filter(function (p) { return p.part_no === pn; })[0] || { part_no: pn }; }
  function lineRow(v, d, pn, obp, crew, kindTxt) {
    var L = d.inv.lines[pn] || {}, p = partOf(v, pn), shelf = L.shelf == null ? "" : L.shelf;
    var diff = obp == null ? NaN : (L.shelf != null ? L.shelf : crew) - obp;
    return '<div class="iline line-t"><div style="min-width:0"><b>' + esc(p.description || pn) + '</b><div class="xs">' + esc(pn) + " · " + esc(first(v.crew)) + " " + esc(crew == null ? "–" : crew) + " · OBP " + esc(obp == null ? "–" : obp) + (kindTxt ? " · " + esc(kindTxt) : "") + '</div></div><span class="d' + diffCls(diff) + '" data-obp="' + esc(obp == null ? "" : obp) + '" data-crew="' + esc(crew == null ? "" : crew) + '" title="Shelf against OBP">' + diffTxt(diff) + '</span><label class="qty' + (L.shelf != null ? " on" : "") + '"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" data-shelf="' + esc(pn) + '" value="' + esc(shelf) + '" placeholder="' + esc(crew == null ? "" : crew) + '" aria-label="On the shelf, ' + esc(p.description || pn) + '"></label></div>';
  }
  function diffCls(diff) { return diff > 0 ? " p" : !diff ? " z" : ""; }
  function diffTxt(diff) { return isNaN(diff) ? "–" : !diff ? "0" : (diff > 0 ? "+" : "−") + Math.abs(diff); }
  /* the answer to "Does the OBP match the shelf?" is read from the lines (AR.obpMatches), never a second control */
  function obpVerdict(v, d) {
    var off = v.count.diff.filter(function (x) { return x.kind === "gap" && !AR.obpMatches({ inv: { lines: d.inv.lines, added: [] } }, { diff: [x] }); }).length
      + d.inv.added.filter(function (a) { return !AR.obpMatches({ inv: { lines: {}, added: [a] } }, { diff: [], obp: ctxOf(v).obp }); }).length;
    var tot = v.count.total || 0;
    return '<div class="card pad-m measure" id="obpv"><span class="fi' + (off ? " a" : "") + '">' + ic("package") + '</span><div><b class="h3">' + (off ? "OBP is off on " + off + (off === 1 ? " line" : " lines") : "OBP matches the shelf") + '</b><div class="sm">' + esc(first(v.crew)) + "&#8217;s count, with the shelf you type where it differs" + (tot ? ": " + Math.max(0, tot - off) + " of " + tot + " lines match" : "") + "</div></div></div>";
  }
  STEP.inventory = function (v, d, probs) {
    var gaps = v.count.diff.filter(function (x) { return x.kind === "gap"; }), timing = v.count.diff.filter(function (x) { return x.kind === "timing"; }), ex = v.count.extras, fn = esc(first(v.crew));
    var h = obpVerdict(v, d);
    h += '<div class="card clip"><div class="grp"><span>' + fn + "&#8217;s count against OBP" + (v.count.asOf ? " of " + fmtD(v.count.asOf) : "") + " · type what the shelf holds</span><em>" + (gaps.length + d.inv.added.length) + "</em></div>";
    if (!gaps.length && !d.inv.added.length) h += '<div class="info line-t"><span class="sm">' + fn + "&#8217;s count agrees with OBP on every line.</span></div>";
    gaps.forEach(function (x) { h += lineRow(v, d, x.part_no, x.obp, x.counted); });
    d.inv.added.forEach(function (a) { var p = partOf(v, a.part_no); h += lineRow(v, d, a.part_no, p.obp, p.counted, "added by you") + whyMsg(probs, "added:" + a.part_no); });
    if (timing.length) h += '<details class="rd info line-t"><summary><span class="xs">Timing · not counted</span><span class="sm" style="display:block">' + timing.length + (timing.length === 1 ? " line" : " lines") + " one unit off on the day OBP moved " + (timing.length === 1 ? "it" : "them") + ": " + esc(timing.map(function (x) { return x.description || x.part_no; }).join(", ")) + '. Flagged only if it does not close. <span class="ul" style="min-height:0;display:inline"><span class="o1">Check them anyway</span><span class="o2">Hide</span></span></span></summary>'
      + timing.map(function (x) { return lineRow(v, d, x.part_no, x.obp, x.counted, "timing"); }).join("") + "</details>";
    h += '<div class="pad-m line-t sec tight"><div class="search" style="height:48px;box-shadow:none">' + ic("magnifying-glass") + '<input id="addq" type="search" placeholder="Add a line: part or name" autocomplete="off" value="' + esc(S.addq || "") + '" aria-label="Add a line"></div><div id="addr"></div></div></div>';
    if (ex.length) {
      h += '<div class="card clip"><div class="grp"><span>Repair items not in OBP · from ' + fn + "&#8217;s count</span><em>" + ex.length + "</em></div>";
      ex.forEach(function (x) { h += tapRow("rep", x.id, x.text, x.counted != null ? fn + " counted " + esc(x.counted) : "", d.inv.repairs[x.id] === "not_found", ["", "Not found"]); });
      h += "</div>";
    }
    h += '<div class="card pad-m">' + lbl("Note on the stock · optional", box("inv-note", d.inv.note, "Anything else the counts do not say")) + "</div>";
    return h + photoStrip(v, "inventory");
  };
  function addResults(v, d) {
    var q = String(S.addq || "").toLowerCase().trim(), out = $("addr"); if (!out) return;
    if (q.length < 2) { out.innerHTML = ""; return; }
    var have = {}; v.count.diff.forEach(function (x) { if (x.kind === "gap") have[x.part_no] = 1; }); d.inv.added.forEach(function (a) { have[a.part_no] = 1; });
    var hits = (v.parts || []).filter(function (p) { return !have[p.part_no] && (p.part_no + " " + (p.description || "")).toLowerCase().indexOf(q) >= 0; }).slice(0, 6);
    out.innerHTML = hits.length ? '<div class="card clip">' + hits.map(function (p) { return tapBtn({ act: "addline", key: p.part_no, label: p.description || p.part_no, sub: esc(p.part_no) + " · OBP " + esc(p.obp == null ? "–" : p.obp) + " · counted " + esc(p.counted == null ? "–" : p.counted), tk: "o", word: "Add", pill: "m" }); }).join("") + "</div>" : '<p class="sm">No OBP line matches.</p>';
  }
  STEP.ratings = function (v, d, probs) {
    var h = "";
    ["inventory", "technical", "collaterals"].forEach(function (k) {
      var t = AR.RATING_TEXT[k], r = d.rt[k];
      h += '<div class="card pad-m sec tight"><b class="h4">' + esc(t.label) + '</b><span class="xs">' + esc(t.hint) + "</span>" + rateRow("rt", k, r, t.label) + whyMsg(probs, k);
      if (r != null && r <= 3) h += lbl("Say why · required", box("why:" + k, d.rt.why[k], "One sentence")) + whyMsg(probs, "why:" + k);
      h += "</div>";
    });
    return h;
  };
  STEP.crew = function (v, d, probs) {
    var fn = esc(first(v.crew)), h = '<div class="card pad-m sec tight"><div class="sec-hd"><b class="h4">Training needed</b><span class="xs">Tap what ' + fn + ' needs · nothing tapped, none needed</span></div><div class="pills wrapit">';
    AR.TRAINING.forEach(function (t) { var on = d.crew.training.indexOf(t.key) >= 0; h += '<button type="button" class="pill' + (on ? " on" : "") + '" data-a="train" data-k="' + t.key + '" aria-pressed="' + on + '">' + esc(t.label) + "</button>"; });
    h += '<button type="button" class="pill' + (S.trainOther || d.crew.trainingOther ? " on" : "") + '" data-a="train-other">+ Other</button></div>';
    if (S.trainOther || d.crew.trainingOther) h += '<input class="fld" data-f="train-other" placeholder="Which training" value="' + esc(d.crew.trainingOther) + '" maxlength="120" aria-label="Which training">';
    h += "</div>";
    var pm = d.crew.ppe.missing;
    h += '<div class="card clip"><div class="grp"><span>Uniform &amp; PPE · the HON app</span><em' + (pm.length ? ' class="bad">' + pm.length + " missing" : ">" + AR.PPE.length + " of " + AR.PPE.length) + "</em></div>";
    AR.PPE.forEach(function (p) { var was = v.previous && v.previous.sameCrew && (v.previous.ppeMissing || []).indexOf(p.key) >= 0; h += itemRow("ppe", p.key, p.label, "", pm.indexOf(p.key) >= 0, was, 1); });
    h += tapRow("hon", "x", "Uses the HON app", "", d.crew.hon === "no", ["", "Not in use"]) + "</div>";
    var t = AR.RATING_TEXT.dispatch;
    h += '<div class="card pad-m sec tight"><div class="sec-hd"><b class="h4">' + esc(t.label) + '</b><span class="chip m">For Rita · in no score</span></div><span class="xs">' + esc(t.hint) + "</span>" + rateRow("disp", "dispatch", d.crew.dispatch, t.label) + "</div>";
    return h + photoStrip(v, "crew");
  };
  function scoreWhy(d) {
    var e = AR.evalOf(d), r = d.rt;
    if (e.score.score == null) return "Rate the three on the Ratings step first.";
    return e.score.from === "overall" ? "The Overall rating you gave." : "Overall left blank: the average of " + r.inventory + ", " + r.technical + " and " + r.collaterals + ", rounded down.";
  }
  STEP.overall = function (v, d, probs) {
    var o = d.ov.overall, e = AR.evalOf(d), t = AR.RATING_TEXT.overall, fn = esc(first(v.crew));
    var h = '<div class="card pad-m sec tight"><div class="sec-hd"><b class="h4">' + esc(t.label) + '</b><span class="xs">Optional</span></div>' + rateRow("ov", "overall", o, t.label, true)
      + '<p class="xs">' + (e.score.score == null ? "Rate the three on the Ratings step first." : "Audit score " + esc(e.score.score) + " / 5 · " + esc(scoreWhy(d))) + "</p>";
    if (o != null && o <= 3) h += lbl("Say why · required", box("ov-why", d.ov.why, "One sentence")) + whyMsg(probs, "why");
    h += "</div>";
    h += '<div class="card pad-m sec">' + lbl("Strengths", box("strengths", d.ov.strengths, "What " + first(v.crew) + " does well")) + whyMsg(probs, "strengths")
      + lbl("To improve", box("improve", d.ov.improve, "What needs to change")) + whyMsg(probs, "improve")
      + lbl("Agreed with " + fn + " · optional", box("agreed", d.ov.agreed, "What you agreed with " + first(v.crew))) + "</div>";
    var f = d.ov.followup, rb = !!d.ov.recommendBlock;
    h += '<div class="card clip">' + tapBtn({ act: "block", key: "x", label: "Recommend for Oasis / Icon class", sub: rb ? "" : "Tap to recommend", pressed: rb, tk: rb ? "c" : "o", word: rb ? "Recommended" : "Not now", pill: rb ? "ok" : "m" })
      + tapBtn({ act: "fu", key: "x", label: "Needs a follow-up", sub: f ? "Who owns it, by when" : "Tap to add one", pressed: !!f, tk: f ? "c" : "o", word: f ? "Follow-up" : "None", pill: f ? "ok" : "m" });
    if (f) {
      var owners = AR.FOLLOW_OWNERS.concat([first(v.crew)]);
      h += '<div class="pad-m line-t sec tight"><span class="xs b">Who</span><div class="pills wrapit">' + owners.map(function (n) { return '<button type="button" class="pill' + (f.owner === n ? " on" : "") + '" data-a="fu-owner" data-k="' + esc(n) + '" aria-pressed="' + (f.owner === n) + '">' + esc(n) + "</button>"; }).join("") + "</div>" + whyMsg(probs, "fu_owner")
        + lbl("By", '<input class="fld" type="date" data-f="fu-due" value="' + esc(f.due || "") + '" min="' + esc(v.today) + '">') + whyMsg(probs, "fu_due")
        + lbl("What", box("fu-text", f.text, "What has to happen")) + whyMsg(probs, "fu_text") + "</div>";
    }
    return h + "</div>";
  };
  STEP.review = function (v, d, probs) {
    var e = AR.evalOf(d), sc = e.score.score, fn = esc(first(v.crew));
    var h = '<div class="navy score"><div class="ring"><b class="h">' + (sc == null ? "–" : esc(sc)) + '</b><span class="of">/5</span></div><div class="sec tight"><b class="h3">' + (sc == null ? "Not rated yet" : "Score " + esc(sc) + " of 5") + '</b><span class="sm">' + esc(scoreWhy(d)) + "</span></div></div>";
    if (probs.length) h += '<div class="alert">' + ic("warning-circle") + "<div><b>" + probs.length + (probs.length === 1 ? " answer missing" : " answers missing") + '</b><div class="sm">' + esc(probs[0].say) + '</div><button type="button" class="ul" style="color:inherit" data-step="' + stepNo(probs[0].step) + '">Go to ' + esc(AR.STEPS[stepNo(probs[0].step) - 1].title) + "</button></div></div>";
    var ws = d.ws.missing, tools = d.hw.tools.missing;
    var finds = v.machines.filter(function (m) { return machState(d, m) !== "ok"; });
    var off = v.count.diff.filter(function (x) { return x.kind === "gap" && !AR.obpMatches({ inv: { lines: d.inv.lines, added: [] } }, { diff: [x] }); }).length + d.inv.added.length;
    var nf = Object.keys(d.inv.repairs || {}).filter(function (k) { return d.inv.repairs[k] === "not_found"; }).length;
    var tr = (d.crew.training || []).map(function (k) { var t = AR.TRAINING.filter(function (x) { return x.key === k; })[0]; return t ? t.label : k; }); if (d.crew.trainingOther) tr.push(d.crew.trainingOther);
    var pm = (d.crew.ppe.missing || []).map(labelOf), fu = d.ov.followup;
    var rows = [
      [1, "Workstation", ws.length ? "Missing: " + ws.map(labelOf).join(", ") : "Everything present"],
      [2, "Machines & tools", (finds.length ? finds.map(function (m) { return m.label + (machState(d, m) === "down" ? " down" : " · a problem"); }).join(", ") : "Every press working") + (tools.length ? " · tools missing: " + tools.map(labelOf).join(", ") : "") + (d.hw.labeled === false ? " · not labeled" : "")],
      [3, "Inventory", (off ? "OBP is off on " + off + (off === 1 ? " line" : " lines") : "OBP matches the shelf") + (nf ? " · " + nf + " repair " + (nf === 1 ? "item" : "items") + " not found" : "")],
      [4, "Ratings", ["inventory", "technical", "collaterals"].map(function (k) { return ({ inventory: "Inventory", technical: "Technical", collaterals: "Collaterals" })[k] + " " + (d.rt[k] == null ? "–" : d.rt[k]); }).join(" · ")],
      [5, "Crew", (tr.length ? "Training: " + tr.join(", ") : "No training needed") + (pm.length ? " · missing: " + pm.join(", ") : "") + (d.crew.hon === "no" ? " · HON app not in use" : "") + (d.crew.dispatch != null ? " · dispatch " + d.crew.dispatch + "/5" : "")],
      [6, "Overall", (d.ov.overall != null ? "Overall " + d.ov.overall + "/5" : "Overall blank") + (fu ? " · follow-up to " + (fu.owner || "nobody yet") + (fu.due ? " by " + fmtD(fu.due) : "") : "") + (d.ov.recommendBlock ? " · recommended for Oasis / Icon" : "")],
    ];
    h += '<div class="card clip">' + rows.map(function (r) { return '<div class="rv line-t"><div style="min-width:0"><b class="h4">' + esc(r[1]) + '</b><div class="sm">' + esc(r[2]) + '</div></div><button type="button" class="btn quiet s" data-step="' + r[0] + '">Edit</button></div>'; }).join("") + "</div>";
    if (v.followups.length) {
      h += '<div class="card clip"><div class="grp"><span>Still open on ' + esc(v.ship) + "</span><em>tap what is fixed</em></div>";
      v.followups.forEach(function (f) {
        var fixed = (d.close[f.id] || "open") === "fixed", late = f.due && f.due < v.today, times = (f.carried || 0) + 1;
        h += tapBtn({ act: "close", key: f.id, label: f.text, sub: esc(f.owner) + (f.due ? " · by " + fmtD(f.due, true) : "") + " · " + esc(f.crew || "") + ", " + fmtD(f.at, true), pressed: fixed, tk: fixed ? "c" : "o",
          word: fixed ? "Fixed" : times > 1 ? AR.ordinal(times) + " time" : late ? "Overdue" : "Still open", pill: fixed ? "ok" : times > 1 || late ? "r" : "a" });
      });
      h += "</div>";
    }
    var again = d.ws.missing.concat(d.hw.tools.missing).filter(function (k) { return prevMissing(v, k); });
    if (again.length) h += '<div class="alert">' + ic("f:warning-circle") + "<div><b>Missing again since the last visit</b><div class=\"sm\">" + esc(again.map(labelOf).join(", ")) + ".</div></div></div>";
    var sent = (v.photos || []).length, wait = (S.pq[v.id] || []).length;
    var went = [fn + "&#8217;s Score Card: Dexter&#8217;s audit factor reads the score"];
    if (fu) went.push("The follow-up to " + esc(fu.owner || "…") + (fu.due ? ", by " + fmtD(fu.due, true) : ""));
    if (sent + wait) went.push(sent + wait + (sent + wait === 1 ? " photo" : " photos") + " to the audit&#8217;s files" + (wait ? " · " + wait + " wait for signal" : ""));
    went.push("The next audit of " + esc(v.ship) + " opens with what is missing and still open");
    h += '<div class="card pad-m sec tight"><span class="xs b">Where it goes</span>' + went.map(function (t) { return '<div class="wl"><span class="tk c">' + ic("b:check") + '</span><span class="sm">' + t + "</span></div>"; }).join("")
      + '<div class="wl"><span class="tk o"></span><span class="sm">Never to the crew.</span></div></div>';
    h += '<div class="card pad-m"><div class="hstack" style="flex-wrap:nowrap;align-items:flex-start"><span class="fi n s">' + ic("wifi-slash") + '</span><div style="flex:1;min-width:0"><b class="h4">No signal? File anyway</b><div class="sm">It is kept on this phone and sent when the server answers. Filed once; it cannot be changed after.</div></div></div></div>';
    return h;
  };
  function labelOf(k) { var all = []; AR.WORKSTATION.forEach(function (g) { all = all.concat(g.items); }); all = all.concat(AR.TOOLS, AR.PPE); var x = all.filter(function (i) { return i.key === k; })[0]; return x ? x.label : k; }
  function stepNo(key) { for (var i = 0; i < AR.STEPS.length; i++) if (AR.STEPS[i].key === key) return i + 1; return 7; }
  function sentence(t) { t = String(t || "").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); }

  /* the side of the stepper on a wide screen: what the documents said, the seafarer, the ship's last audit */
  function visitSide(v) {
    var b = v.before || [], fn = first(v.crew), x = aboardOf(v.ship, v.sc);
    var h = '<aside class="sec side hide-m"><div class="card pad-m sec tight"><span class="xs b">From the documents' + (v.completeAt ? " · " + fmtD(v.completeAt) : "") + "</span>"
      + (b.length ? b.map(function (i) { return '<div class="wl"><span class="tk ' + (i.tone === "a" ? "w" : "c") + '">' + ic(i.tone === "a" ? "b:exclamation-mark" : "b:check") + '</span><span class="sm">' + esc(i.t) + "</span></div>"; }).join("") : '<div class="wl"><span class="tk c">' + ic("b:check") + '</span><span class="sm">Nothing found in the documents</span></div>')
      + '<button type="button" class="ul" data-go="q=' + esc(v.id) + '">Open what the documents said</button></div>';
    h += '<div class="card pad-m sec tight"><span class="xs b">' + esc(v.crew) + "</span>";
    if (x) {
      var tot = x.signOn && x.signOff ? Math.max(1, days(x.signOn, x.signOff)) : 0;
      h += '<span class="sm">' + esc([contractNo(x) ? contractNo(x).charAt(0).toUpperCase() + contractNo(x).slice(1) : "", x.signOn ? "aboard " + (md(x.signOn, S.today) || "since today") : "", x.signOff ? "signs off " + fmtD(x.signOff) : ""].filter(Boolean).join(" · ")) + "</span>"
        + (tot ? '<div class="prog thin"><i style="width:' + pct(days(x.signOn, S.today), tot) + '%"></i></div>' : "");
    }
    h += (v.sc ? '<button type="button" class="ul" data-go="b=' + esc(encodeURIComponent(v.ship)) + "|" + esc(encodeURIComponent(v.sc)) + '">Open the briefing</button>' : "") + "</div>";
    var p = v.previous;
    h += '<div class="card pad-m sec tight"><span class="xs b">Last audit of ' + esc(v.ship) + '</span><span class="sm">' + (p ? esc(p.crew || "") + ", " + fmtD(p.at, true) + ((p.missing || []).length ? " · " + p.missing.length + " missing then" : " · nothing missing") : "None: nothing carried over.") + (v.followups.length ? " · " + v.followups.length + (v.followups.length === 1 ? " follow-up" : " follow-ups") + " still open" : "") + "</span></div>";
    return h + "</aside>";
  }
  function stepSum(key, v, d) {
    if (key === "workstation") { var n = d.ws.missing.length; return n ? '<span class="chip r">' + n + " missing</span>" : '<span class="chip g">All present</span>'; }
    if (key === "machines") { var f = v.machines.filter(function (m) { return machState(d, m) !== "ok"; }).length; return f ? '<span class="chip r">' + f + (f === 1 ? " press with a problem" : " presses with a problem") + "</span>" : '<span class="chip g">Every press working</span>'; }
    return "";
  }
  function stepView(id, n) {
    n = Number(n); n = isNaN(n) ? 1 : Math.max(0, Math.min(7, n));
    var key = "a" + id + "|" + n; S.view = key; S.err = {}; S.addq = "";
    chrome(""); dock("");
    $("main").innerHTML = skel(4);
    withShips(S.v[id] ? Promise.resolve(S.v[id]) : loadVisit(id)).then(function (v) {
      if (S.view !== key) return;
      S.v[id] = v;
      /* the gate, once more: no audit before the documents are in; a filed one is the record; a TEST request is a rehearsal */
      if (v.filed || v.status !== "complete" || v.test) { location.replace("#q=" + id); return; }
      var d = draftOf(id, v); keep(id, d);
      var st = n ? AR.STEPS[n - 1] : { key: "before" }, ctx = ctxOf(v), fn = esc(first(v.crew));
      var titles = ["Before you start"].concat(AR.STEPS.map(function (t) { return t.title; })); titles[7] = "Review and file";
      var hints = ["What " + fn + "&#8217;s documents said, each to confirm on board.", "Everything starts present. Tap only what is missing; tap it again to put it back.", "Everything starts as working. Tap only what is wrong; tap it again to put it back.",
        fn + "&#8217;s blind count against OBP. Type a number only where the shelf is not " + fn + "&#8217;s count.", "1 to 5. A 3 or below needs one sentence.", "Training, uniform and PPE, the HON app, dispatch.", "What you and " + fn + " agreed, and who follows up.", "Filed once, with every photo. It cannot be changed afterwards."];
      var draw = function () {
        if (S.view !== key) return;
        var y = window.scrollY, probs = AR.visitProblems(d, ctx, v.today), mine = probs.filter(function (p) { return p.step === st.key; });
        var okAt = function (i) { return i === 0 || !probs.some(function (p) { return stepNo(p.step) === i; }); };
        var rail = '<nav class="rail card hide-m" aria-label="Audit steps"><div class="rail-hd"><b class="h4">' + esc(v.ship) + " · " + fn + '</b><span class="xs">The audit on board</span></div>'
          + titles.map(function (t, i) { var done = i < n && okAt(i); return '<button type="button" class="rs' + (i === n ? " cur" : done ? " done" : "") + '" data-step="' + i + '"' + (i === n ? ' aria-current="step"' : "") + '><span class="rn">' + (done ? ic("b:check") : i === 0 ? "i" : i) + '</span><span class="rt">' + esc(t) + "</span></button>"; }).join("") + "</nav>";
        var bars = titles.map(function (t, i) { return '<i class="' + (i === n ? "cur" : i < n ? "done" : "") + '"></i>'; }).join("");
        var stepOf = n ? "Step " + n + " of 7" : "Before you start";
        var body = STEP[st.key](v, d, st.key === "review" ? probs : mine);
        var back = '<button type="button" class="btn ghost" id="sb2">' + ic("arrow-left") + "Back</button>";
        var next = n < 7 ? '<button type="button" class="btn pri" id="sn2">' + (n === 0 ? "Start · Workstation" : n === 6 ? "Review" : "Next · " + esc(AR.STEPS[n].short)) + ic("arrow-right") + "</button>"
          : '<button type="button" class="btn green" id="sf2"' + (probs.length || S.filing ? " disabled" : "") + ">" + (S.filing ? "Filing" : "File the audit") + "</button>";
        $("main").innerHTML = (v._offline ? '<div class="kept">' + ic("cloud-slash") + "<span>No signal. Working from the copy on this phone; everything you do is kept.</span></div>" : "")
          + '<section class="visit">' + rail + '<div class="sec stage"><div class="only-m mhd"><div class="mhd-top"><span class="xs b">' + stepOf + '</span><span class="xs">' + esc(v.ship) + " · " + fn + '</span></div><div class="bars">' + bars + "</div></div>"
          + '<div class="sec tight"><div class="hstack hide-m"><span class="eyebrow">' + stepOf + "</span>" + stepSum(st.key, v, d) + '</div><h1 class="h2">' + esc(titles[n]) + '</h1><p class="sm">' + hints[n] + "</p>" + (stepSum(st.key, v, d) ? '<div class="only-m">' + stepSum(st.key, v, d) + "</div>" : "") + "</div>"
          + body + '<div class="navrow hide-m">' + back + '<span style="flex:1"></span>' + next + "</div>" + (n === 7 ? '<p class="xs hide-m">' + (probs.length ? esc(probs[0].say) : "Filed once. It cannot be changed afterwards.") + "</p>" : "") + "</div>" + visitSide(v) + "</section>";
        if (st.key === "inventory") addResults(v, d);
        window.scrollTo(0, y);
        if (n < 7) dock('<button type="button" class="btn ghost" id="sb">Back</button><button type="button" class="btn pri" id="sn">' + (n === 0 ? "Start" : n === 6 ? "Review" : "Next · " + esc(AR.STEPS[n].short)) + "</button>");
        else dock('<button type="button" class="btn ghost" id="sb">Back</button><button type="button" class="btn green" id="sf"' + (probs.length || S.filing ? " disabled" : "") + ">" + (S.filing ? "Filing" : "File the audit") + "</button>" + '<div class="note">' + (probs.length ? esc(probs[0].say) : "Filed once. It cannot be changed afterwards.") + "</div>");
        var onBack = function () { location.replace(n === 0 ? "#q=" + id : "#a=" + id + "|" + (n - 1)); };
        var onNext = function () {
          /* the answers as they are NOW: typing does not redraw, so the list drawn with the screen can be stale */
          var left = n ? AR.visitProblems(d, ctx, v.today).filter(function (p) { return p.step === st.key; }) : [];
          if (left.length) { S.err.show = true; draw(); var w = document.querySelector(".why"); if (w) w.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
          location.replace("#a=" + id + "|" + (n + 1));
        };
        ["sb", "sb2"].forEach(function (k) { if ($(k)) $(k).onclick = onBack; });
        ["sn", "sn2"].forEach(function (k) { if ($(k)) $(k).onclick = onNext; });
        ["sf", "sf2"].forEach(function (k) { if ($(k)) $(k).onclick = function () { fileAudit(id, v, d); }; });
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
        else if (a === "ov-blank") d.ov.overall = null;
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
          var row = t.closest(".iline"), dc = row && row.querySelector(".d");
          if (dc) { var o = dc.getAttribute("data-obp"), cr = dc.getAttribute("data-crew"), base = L.shelf != null ? L.shelf : cr === "" ? NaN : Number(cr), df = o === "" ? NaN : base - Number(o); dc.className = "d" + diffCls(df); dc.textContent = diffTxt(df); }
          var q = t.closest(".qty"); if (q) q.className = "qty" + (L.shelf != null ? " on" : "");
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
    if (h.indexOf("a=") === 0) { var p3 = h.slice(2).split("|"); lsSet("aud:s:" + p3[0], Math.max(1, Number(p3[1]) || 1)); return stepView(p3[0], p3[1]); }
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
