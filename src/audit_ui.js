// PRINTSHOP AUDIT — the page (14 Oct 2026). Phone first (Dexter's iPhone 17, Safari, Add to Home Screen); the web is
// the same column. Tokens and classes are the approved mock-up's (docs/mockups/audit_20261014/audit_mockup.html, v12).
// String.raw keeps the client script's backslashes literal; nothing in it may use a backtick or a dollar-brace —
// scripts/verify_client_scripts.mjs parses this script on every build and test run.
//
// PR A + B: Ships (A1) and Read, then request (A2). The request button says when it opens; it never pretends.

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
<meta name="theme-color" content="#1B3A5C">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Audit">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/favicon.ico">
<link rel="manifest" id="mf" href="/audit/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@500;600&display=swap" rel="stylesheet">
<style>
:root{--navy:#1B3A5C;--green:#5FB946;--green-d:#3E8E2A;--amber:#B0741A;--red:#BC3B2C;--bg:#EEF1F6;--surface:#FFFFFF;--panel:#F5F7FA;--line:#EBEFF4;--line2:#DCE3EC;--mut:#718096;--fg:#1B2B3F;--greenbg:#EDF6E9;--amberbg:#FBF3E4;--redbg:#FCECE9;--navybg:#E9EFF6;--fh:'Outfit',Arial,Helvetica,sans-serif;--ff:'DM Sans',Arial,Helvetica,sans-serif;--r:14px}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0F1A27;--surface:#172536;--panel:#1C2B3D;--line:#263649;--line2:#33465C;--mut:#9AAAC0;--fg:#E8EEF5;--navy:#22446B;--greenbg:#1C3324;--amberbg:#3A2C12;--redbg:#3C1F1B;--navybg:#1C2F47;color-scheme:dark}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--ff);font-size:15px;line-height:1.45}
.app{max-width:560px;margin:0 auto;min-height:100vh;min-height:100dvh;background:var(--surface);display:flex;flex-direction:column}
@media (min-width:600px){body{padding:24px 16px}.app{min-height:auto;border-radius:24px;overflow:hidden;box-shadow:0 8px 28px rgba(20,45,72,.08)}}
.top{position:sticky;top:0;z-index:5;background:var(--navy);color:#fff;padding:calc(10px + env(safe-area-inset-top)) 14px 11px;display:grid;grid-template-columns:36px 1fr auto;gap:8px;align-items:center}
.bk{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.12);display:grid;place-items:center;font-size:22px;line-height:1;border:0;color:#fff;cursor:pointer}
.bk[hidden]{display:grid;visibility:hidden}
.t{font-family:var(--fh);font-weight:600;font-size:17px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s{font-size:12px;opacity:.75;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k{font-family:var(--fh);font-weight:600;font-size:12px;background:rgba(255,255,255,.14);padding:5px 10px;border-radius:999px;white-space:nowrap}
.scr{padding:14px 14px 24px;display:flex;flex-direction:column;gap:12px;flex:1}
.q{font-size:18px;font-weight:600;line-height:1.25;font-family:var(--fh)}
.hint{font-size:13px;color:var(--mut)}
.search{width:100%;min-height:48px;border:1px solid var(--line2);border-radius:12px;padding:0 14px;font-size:16px;background:var(--panel);color:var(--fg);font-family:var(--ff)}
.hs{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -14px;padding:0 14px 2px}
.hs::-webkit-scrollbar{display:none}
.chip{flex:none;min-height:40px;display:inline-flex;align-items:center;border:1px solid var(--line2);border-radius:999px;padding:0 14px;font-size:14px;font-weight:500;background:var(--surface);color:var(--fg);cursor:pointer;font-family:var(--ff)}
.chip.on{background:var(--navy);border-color:var(--navy);color:#fff}
.card{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);overflow:hidden}
.card.soft{background:var(--panel);border-color:transparent}
.h{padding:12px 14px 6px;font-family:var(--fh);font-size:14px;font-weight:600;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.h .r{font-family:var(--ff);font-weight:500;font-size:12px;color:var(--mut)}
.lrow{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 14px;border-top:1px solid var(--line);cursor:pointer;width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;color:inherit;font:inherit}
.card>.lrow:first-child,.card>.h+.lrow{border-top:0}
.lrow .tx{flex:1;min-width:0}
.nm{font-weight:600;font-size:15px;line-height:1.25}
.sm{font-size:12.5px;color:var(--mut);margin-top:1px}
.rt{text-align:right;font-size:12px;color:var(--mut);white-space:nowrap}
.chev{color:var(--line2);font-size:20px;line-height:1}
.pill{display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;padding:3px 8px;border-radius:999px;line-height:1.4;white-space:nowrap}
.pill.g{background:var(--greenbg);color:var(--green-d)}.pill.a{background:var(--amberbg);color:var(--amber)}.pill.r{background:var(--redbg);color:var(--red)}.pill.n{background:var(--navybg);color:var(--navy)}.pill.m{background:var(--panel);color:var(--mut)}
.grp{display:flex;justify-content:space-between;align-items:baseline;padding:14px 14px 6px;font-size:10.5px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut)}
.kv{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:46px;padding:6px 14px;border-top:1px solid var(--line);font-size:14px}
.kv:first-child{border-top:0}.kv .v{font-weight:600;text-align:right}.kv .v .sm{font-weight:400}
.feed{padding:8px 14px 10px;border-top:1px solid var(--line);font-size:13.5px}
.feed .w{font-size:11.5px;color:var(--mut);font-weight:600;letter-spacing:.3px;margin-bottom:2px}
.fold>summary{list-style:none;cursor:pointer}.fold>summary::-webkit-details-marker{display:none}
.fold[open] .chev{transform:rotate(90deg)}
.si{width:24px;height:24px;border-radius:50%;border:1.5px solid var(--line2);flex:none}
.si.sel{border-color:var(--navy);background:var(--navy);position:relative}
.si.sel:after{content:"";position:absolute;left:8px;top:4px;width:5px;height:10px;border:solid #fff;border-width:0 1.5px 1.5px 0;transform:rotate(45deg)}
.bar{position:sticky;bottom:0;display:flex;flex-direction:column;gap:6px;padding:10px 14px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--surface)}
.btn{display:flex;align-items:center;justify-content:center;min-height:52px;background:var(--green);color:#fff;font-family:var(--fh);font-weight:600;font-size:16px;border-radius:12px;padding:0 16px;border:0;width:100%;cursor:pointer}
.btn.navy{background:var(--navy)}.btn[disabled]{opacity:.45;cursor:default}
.note{font-size:12.5px;color:var(--mut);text-align:center}
.lock{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:var(--navybg);border-radius:12px;font-size:13px;color:var(--navy)}
.empty{padding:28px 14px;text-align:center;color:var(--mut);font-size:14px}
.err{padding:12px 14px;background:var(--redbg);color:var(--red);border-radius:12px;font-size:13.5px}
.offl{background:var(--amberbg);color:var(--amber);font-size:12.5px;font-weight:600;padding:8px 14px}
.offl[hidden]{display:none}
.sk{height:56px;border-top:1px solid var(--line);background:linear-gradient(90deg,var(--panel),var(--surface),var(--panel));background-size:200% 100%;animation:sk 1.2s infinite}
@keyframes sk{to{background-position:-200% 0}}
</style>
</head><body>
<div class="app">
  <header class="top"><button class="bk" id="bk" hidden aria-label="Back">‹</button><div style="min-width:0"><div class="t" id="tt">Printshop audit</div><div class="s" id="ts"></div></div><div class="k" id="tk">Ships</div></header>
  <div class="offl" id="offl" hidden>No signal. What you see was loaded earlier.</div>
  <main class="scr" id="main"><div class="card"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div></main>
  <div id="barslot"></div>
</div>
<script>
(function () {
  "use strict";
  var S = { me: null, today: null, ships: null, brand: "All", q: "", brief: {} };
  var $ = function (id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtD(d, withYear) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); if (p.length < 3) return esc(d); var s = MON[Number(p[1]) - 1] + " " + Number(p[2]); return withYear || p[0] !== String(S.today || "").slice(0, 4) ? s + ", " + p[0] : s; }
  function todayLong() { var t = S.today ? new Date(S.today + "T12:00:00") : new Date(); return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][t.getDay()] + ", " + MON[t.getMonth()] + " " + t.getDate(); }
  function nameOf(email) { var e = String(email || "").split("@")[0].split("."); return e.map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""; }).join(" "); }
  function head(t, s, k, back) { $("tt").textContent = t; $("ts").textContent = s || ""; $("tk").textContent = k || ""; $("bk").hidden = !back; }
  function bar(html) { $("barslot").innerHTML = html ? '<div class="bar">' + html + "</div>" : ""; }
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
  function whenUtc(v) { var d = new Date(v); if (isNaN(d)) return ""; return MON[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) + " UTC"; }
  function fail(e) { $("main").innerHTML = '<div class="err">Could not load: ' + esc(e && e.message || e) + '. Pull down or reopen to try again.</div>'; bar(""); }

  /* ---------------- A1 · Ships ---------------- */
  function brandOf(s) { return s.brand === "Royal" ? "Royal Caribbean" : (s.brand || ""); }
  function shipsView() {
    head("Printshop audit", (S.me ? nameOf(S.me) + " · " : "") + todayLong(), "Ships", false); bar("");
    if (!S.ships) { $("main").innerHTML = '<div class="card"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>'; return; }
    var brands = ["All", "Royal Caribbean", "Celebrity", "Azamara"];
    var q = S.q.toLowerCase();
    var list = S.ships.filter(function (s) {
      if (S.brand !== "All" && brandOf(s) !== S.brand) return false;
      if (!q) return true;
      var hay = (s.ship + " " + s.aboard.map(function (c) { return c.name; }).join(" ")).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var h = '<input class="search" id="q" type="search" placeholder="Search ship or crew" autocomplete="off" value="' + esc(S.q) + '">';
    h += '<div class="hs">' + brands.map(function (b) { return '<button class="chip' + (S.brand === b ? " on" : "") + '" data-brand="' + esc(b) + '">' + esc(b) + "</button>"; }).join("") + "</div>";
    h += '<div class="card">';
    if (!list.length) h += '<div class="empty">No ship matches.</div>';
    list.forEach(function (s) {
      var who = s.aboard.length ? s.aboard.map(function (c) { return esc(c.name); }).join(" · ") + " aboard" : "Nobody aboard per the TDG file";
      var rt = s.last ? fmtD(s.last.at) + '<br><span class="pill ' + (s.last.status === "complete" ? "g" : "n") + '">' + esc(s.last.status === "sent" ? "waiting" : s.last.status === "complete" ? "docs in" : s.last.status) + "</span>" : '<span class="pill m">No request yet</span>';
      h += '<button class="lrow" data-ship="' + esc(s.ship) + '"' + (s.aboard.length ? "" : ' style="opacity:.55"') + '><div class="tx"><div class="nm">' + esc(s.ship) + '</div><div class="sm">' + who + '</div></div><div class="rt">' + rt + '</div><span class="chev">›</span></button>';
    });
    h += "</div><div class=\"hint\">Who is aboard comes from the TDG file, as on the Keyman board. Earlier audits from Microsoft Forms arrive with the import.</div>";
    $("main").innerHTML = h;
    var qi = $("q");
    qi.addEventListener("input", function () { S.q = qi.value; var pos = qi.selectionStart; shipsView(); var n = $("q"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} });
  }

  /* ---------------- pick the person ---------------- */
  function shipView(ship) {
    var s = (S.ships || []).filter(function (x) { return x.ship === ship; })[0];
    if (!s) { go(""); return; }
    head(s.ship, brandOf(s), "Setup", true); bar("");
    var h = '<div class="q">Who are you auditing?</div><div class="card">';
    if (!s.aboard.length) h += '<div class="empty">The TDG file has nobody aboard ' + esc(s.ship) + '.</div>';
    s.aboard.forEach(function (c) {
      var day = c.signOn ? Math.max(0, Math.round((Date.parse(S.today) - Date.parse(c.signOn)) / 86400000)) : null;
      h += '<button class="lrow" data-sc="' + esc(c.sc) + '" data-ship="' + esc(s.ship) + '"><div class="tx"><div class="nm">' + esc(c.name) + '</div><div class="sm">' + esc(c.contract) + (day != null ? " · day " + day : "") + (c.signOff ? " · off " + (c.heldByFile ? "past " : "~") + fmtD(c.signOff) : "") + '</div></div><span class="si"></span></button>';
    });
    h += "</div>";
    $("main").innerHTML = h;
  }

  /* ---------------- A2 · Read, then request ---------------- */
  var KIND = { feedback: "Feedback", intel: "Field intel", review: "Shipboard review", note: "Note", comment: "Comment" };
  function briefView(ship, sc) {
    head(ship, "Loading the briefing…", "Setup", true);
    $("main").innerHTML = '<div class="card"><div class="sk"></div><div class="sk"></div></div>';
    bar("");
    var key = ship + "|" + sc; S.view = key;
    var p = S.brief[key] ? Promise.resolve(S.brief[key]) : api("/api/audit/brief?ship=" + encodeURIComponent(ship) + "&sc=" + encodeURIComponent(sc));
    p.then(function (b) {
      S.brief[key] = b;
      if (S.view !== key) return;
      head(ship, b.crew.name, "Setup", true);
      var c = b.contract || {}, cur = c.current;
      var h = '<div class="card"><div class="lrow" style="cursor:default;background:var(--navybg)"><div class="tx"><div class="nm">' + esc(b.crew.name) + '</div><div class="sm">' + esc(c.label) + (b.crew.position ? " · " + esc(b.crew.position) : "") + '</div></div><span class="si sel"></span></div>';
      if (cur) {
        h += '<div class="kv"><span>Aboard</span><span class="v">' + esc(cur.ship) + ' <span class="sm">· since ' + fmtD(cur.on) + "</span></span></div>";
        h += '<div class="kv"><span>Contract</span><span class="v">day ' + esc(cur.day) + (cur.of ? " of " + esc(cur.of) : "") + "</span></div>";
        if (cur.off) h += '<div class="kv"><span>Sign-off</span><span class="v">' + (cur.held ? '<span class="pill a">past · TDG has them aboard</span> ' : "") + fmtD(cur.off, true) + (cur.offSource === "projected" ? ' <span class="sm">· projected</span>' : "") + "</span></div>";
      }
      if (c.source) h += '<div class="kv"><span class="sm">Count</span><span class="v"><span class="sm">' + esc(c.source).replace(/(\d{4}-\d{2}-\d{2})/g, function (d) { return fmtD(d, true); }) + "</span></span></div>";
      h += "</div>";

      h += '<div class="card"><div class="h">Earlier audits <span class="r">' + (b.audits.length ? b.audits.length : "") + "</span></div>";
      if (!b.audits.length) h += '<div class="feed"><span class="sm">None in the console yet. The 61 Forms audits arrive with the import.</span></div>';
      b.audits.forEach(function (a) { h += '<div class="kv"><span>' + esc(a.ship) + ' <span class="sm">· ' + fmtD(a.at, true) + '</span></span><span class="v"><span class="pill ' + (a.status === "complete" ? "g" : "n") + '">' + esc(a.status) + "</span></span></div>"; });
      h += "</div>";

      var feed = b.feed || [];
      h += '<details class="card fold"><summary class="lrow"><div class="tx"><div class="nm">What others said</div><div class="sm">' + (feed.length ? feed.length + " · newest " + fmtD(feed[0].at, true) : "Nothing on record") + '</div></div><span class="chev">›</span></summary>';
      feed.forEach(function (f) { h += '<div class="feed"><div class="w">' + esc(KIND[f.kind] || f.kind) + (f.who ? " · " + esc(f.who) : "") + " · " + fmtD(f.at, true) + (f.rating != null ? " · " + esc(f.rating) + "/5" : "") + "</div>" + esc(f.text) + "</div>"; });
      h += "</details>";

      if (b.checks && b.checks.length) {
        h += '<details class="card fold"><summary class="lrow"><div class="tx"><div class="nm">To check</div><div class="sm">' + b.checks.length + ' open on the crew record</div></div><span class="chev">›</span></summary>';
        b.checks.forEach(function (t) { h += '<div class="feed">' + esc(t) + "</div>"; });
        h += "</details>";
      }
      h += '<div class="lock"><span>🔒</span><span>The audit opens only when the documents are in: Pattern 43 and the Management List for every machine, and the inventory counted blind.</span></div>';
      $("main").innerHTML = h;
      S.lastBrief = b;
      if (b.open) bar('<button class="btn navy" data-go="q=' + esc(b.open) + '">Open the request</button>');
      else bar('<button class="btn navy" data-go="r=' + esc(encodeURIComponent(ship)) + "|" + esc(encodeURIComponent(sc)) + '">Request the documents</button>');
    }).catch(fail);
  }

  /* ---------------- A3 · The request ---------------- */
  function requestView(ship, sc) {
    head("Request documents", ship, "Setup", true); bar("");
    $("main").innerHTML = '<div class="card"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>';
    var key = "r" + ship + "|" + sc; S.view = key;
    api("/api/audit/request/preview?ship=" + encodeURIComponent(ship) + "&sc=" + encodeURIComponent(sc)).then(function (p) {
      if (S.view !== key) return;
      head("Request documents", ship + " · " + p.crew.name, "Setup", true);
      if (p.open) { go("q=" + p.open.id); return; }
      var n = p.machines ? p.machines.length : 0;
      var h = '<div class="q">' + esc(p.crew.name.split(" ")[0]) + " uploads before you arrive</div>";
      if (!p.live) h += '<div class="lock" style="background:var(--amberbg);color:var(--amber)"><span>⚑</span><span>Test mode. The email goes to you only, marked TEST. Nothing reaches the ship until Miguel switches it live.</span></div>';
      if (!p.hon) h += '<div class="err">' + esc(WHY.hon_unavailable) + "</div>";
      h += '<div class="card">';
      h += '<div class="kv"><span>Pattern 43</span><span class="v">' + n + ' <span class="sm">· one per machine</span></span></div>';
      h += '<div class="kv"><span>Machine Management List</span><span class="v">' + n + ' <span class="sm">· one per machine</span></span></div>';
      h += '<div class="kv"><span>Inventory count</span><span class="v">' + (p.lines == null ? "?" : p.lines) + ' <span class="sm">· lines, blind</span></span></div></div>';
      if (p.machines && p.machines.length) h += '<div class="card"><div class="h">Machines <span class="r">from HON\'s register</span></div>' + p.machines.map(function (m) { return '<div class="kv"><span>' + esc(m.label) + '</span><span class="v"><span class="sm">' + esc(m.serial) + "</span></span></div>"; }).join("") + "</div>";
      h += '<div class="card">';
      h += '<div class="kv"><span>To</span><span class="v">' + (p.shown ? esc(p.shown) + ' <span class="sm">· ship mailbox</span>' : '<span class="pill r">no ship mailbox</span>') + (p.noPersonal ? '<br><span class="sm">no personal email on file</span>' : '<br><span class="sm">+ a copy to his personal email</span>') + "</span></div>";
      h += '<div class="kv"><span>Due</span><span class="v">24 h <span class="sm">· ' + esc(whenUtc(p.dueAt)) + "</span></span></div>";
      h += '<div class="kv"><span>Copy</span><span class="v"><span class="sm">Rolando · Ray</span></span></div></div>';
      h += '<div class="lock"><span>🔒</span><span>The audit opens when everything is in. No "start anyway".</span></div>';
      $("main").innerHTML = h;
      var can = p.hon && n > 0 && (p.shown || !p.live);
      bar('<button class="btn" id="sendreq"' + (can ? "" : " disabled") + ">" + (p.live ? "Send request" : "Send test request to me") + "</button>" + (can ? "" : '<div class="note">' + esc(!p.hon ? WHY.hon_unavailable : n === 0 ? WHY.no_presses : WHY.no_ship_mailbox) + "</div>"));
      var btn = $("sendreq");
      if (btn) btn.onclick = function () {
        btn.disabled = true; btn.textContent = "Sending…";
        var contract = S.lastBrief && S.lastBrief.contract ? S.lastBrief.contract.label : null;
        post("/api/audit/request", { ship: ship, sc: sc, contract: contract }).then(function (r) {
          if (r.ok || r.error === "already_open") { S.brief = {}; S.ships = null; reloadShips(); go("q=" + r.id); }
          else { btn.disabled = false; btn.textContent = "Try again"; $("main").insertAdjacentHTML("afterbegin", '<div class="err">' + esc(WHY[r.error] || r.detail || r.error) + "</div>"); }
        }).catch(fail);
      };
    }).catch(fail);
  }

  /* ---------------- A6 / A8 · Waiting, then unlocked ---------------- */
  var STATE = { ok: ["ok", "Read"], pending: ["", "Reading"], failed: ["", "Reading"], wrong_doc: ["bad", "Wrong document"], unreadable: ["bad", "Scan again"] };
  function requestDetail(id) {
    head("Request", "", "Waiting", true); bar("");
    var key = "q" + id; S.view = key;
    api("/api/audit/request?id=" + encodeURIComponent(id)).then(function (d) {
      if (S.view !== key) return;
      var done = d.status === "complete";
      head(d.ship, d.crew, done ? "Unlocked" : d.status === "cancelled" ? "Cancelled" : "Waiting", true);
      var h = "";
      if (d.test) h += '<div class="lock" style="background:var(--amberbg);color:var(--amber)"><span>⚑</span><span>Test request. Every email went to you only.</span></div>';
      if (done) h += '<div class="lock" style="background:var(--greenbg);color:var(--green-d)"><span>✓</span><span><b>Everything is in</b> · ' + esc(whenUtc(d.completeAt)) + ". The assessment email went to " + (d.test ? "you" : "Ray, Rolando, Ohji, Jonathan and Miguel") + ".</span></div>";
      else if (d.status === "sent") h += '<div class="lock"><span>🔒</span><span>Due ' + esc(whenUtc(d.dueAt)) + (d.overdueAt ? ' · <b style="color:var(--red)">overdue</b>' : "") + ". Sent to " + esc(d.test ? "you (test)" : d.to) + ".</span></div>";
      h += '<div class="card"><div class="h">Machines</div>';
      d.machines.forEach(function (m) {
        var cell = function (s, label) { if (!s) return '<span class="pill m">' + label + " · not sent</span>"; var st = STATE[s.read_state] || ["", s.read_state]; return '<span class="pill ' + (st[0] === "ok" ? "g" : st[0] === "bad" ? "r" : "n") + '">' + label + " · " + st[1] + "</span>"; };
        h += '<div class="lrow" style="cursor:default;align-items:flex-start"><div class="tx"><div class="nm">' + esc(m.label) + '</div><div class="sm">' + esc(m.serial) + "</div>" +
          (m.down ? '<div class="sm" style="color:var(--red);font-weight:600;margin-top:4px">Down · ' + esc(m.down) + "</div>" : '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' + cell(m.p43, "Pattern 43") + cell(m.mgmt, "Mgmt list") + "</div>" +
          ((m.p43 && m.p43.read_state !== "ok" && m.p43.say) ? '<div class="sm" style="margin-top:4px">' + esc(m.p43.say) + "</div>" : "") + ((m.mgmt && m.mgmt.read_state !== "ok" && m.mgmt.say) ? '<div class="sm" style="margin-top:4px">' + esc(m.mgmt.say) + "</div>" : "")) + "</div></div>";
      });
      h += "</div>";
      h += '<div class="card"><div class="kv"><span>Inventory count</span><span class="v">' + d.count.done + " of " + d.count.total + (d.extras ? ' <span class="sm">· ' + d.extras + " not on the list</span>" : "") + "</span></div></div>";
      if (!done && d.gate && d.gate.missing && d.gate.missing.length && d.status === "sent") h += '<details class="card fold"><summary class="lrow"><div class="tx"><div class="nm">Still missing</div><div class="sm">' + d.gate.missing.length + ' items</div></div><span class="chev">›</span></summary>' + d.gate.missing.map(function (x) { return '<div class="feed">' + esc(x.say) + "</div>"; }).join("") + "</details>";
      $("main").innerHTML = h;
      if (done) bar('<button class="btn" disabled>Start the audit</button><div class="note">The audit steps on the ship arrive with the next update.</div>');
      else if (d.status === "sent") {
        bar('<div style="display:flex;gap:8px"><button class="btn navy" id="rs">Resend</button><button class="btn navy" id="ex">+24 hours</button></div><button class="btn" style="background:none;color:var(--red);min-height:40px" id="cx">Cancel request</button>');
        var act = function (what, confirmText) { return function () { if (confirmText && !confirm(confirmText)) return; post("/api/audit/request/" + what, { id: id }).then(function (r) { if (!r.ok) alert(r.error || "Not done"); requestDetail(id); }); }; };
        $("rs").onclick = act("resend", "Send the request again? The old link stops working.");
        $("ex").onclick = act("extend");
        $("cx").onclick = act("cancel", "Cancel this request? The upload link closes.");
      } else bar("");
    }).catch(fail);
  }
  function reloadShips() { api("/api/audit/ships").then(function (r) { S.ships = r.ships; }).catch(function () {}); }

  /* ---------------- router ---------------- */
  function go(h) { location.hash = h; }
  function route() {
    S.view = null;
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (h.indexOf("s=") === 0) return shipView(h.slice(2));
    if (h.indexOf("b=") === 0) { var p = h.slice(2).split("|"); return briefView(p[0], p[1]); }
    if (h.indexOf("r=") === 0) { var p2 = h.slice(2).split("|"); return requestView(p2[0], p2[1]); }
    if (h.indexOf("q=") === 0) return requestDetail(h.slice(2));
    shipsView();
  }
  window.addEventListener("hashchange", route);
  $("bk").addEventListener("click", function () { history.length > 1 ? history.back() : go(""); });
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-go]");
    if (g) { go(g.getAttribute("data-go")); return; }
    var t = e.target.closest("[data-brand],[data-sc],[data-ship]");
    if (!t) return;
    if (t.hasAttribute("data-brand")) { S.brand = t.getAttribute("data-brand"); shipsView(); return; }
    if (t.hasAttribute("data-sc")) { go("b=" + encodeURIComponent(t.getAttribute("data-ship")) + "|" + encodeURIComponent(t.getAttribute("data-sc"))); return; }
    if (t.hasAttribute("data-ship")) go("s=" + encodeURIComponent(t.getAttribute("data-ship")));
  });
  function net() { $("offl").hidden = navigator.onLine !== false; }
  window.addEventListener("online", net); window.addEventListener("offline", net); net();
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("/audit/sw.js", { scope: location.pathname.indexOf("/audit") === 0 ? "/audit" : "/" }).catch(function () {}); } catch (e) {} }

  route();
  Promise.all([api("/api/me"), api("/api/audit/ships")]).then(function (r) {
    S.me = r[0].email; S.today = r[1].today; S.ships = r[1].ships; route();
  }).catch(fail);
})();
</script>
</body></html>`;
