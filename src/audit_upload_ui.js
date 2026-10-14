// PRINTSHOP AUDIT — the seafarer's upload page (A5 + A5b of the approved mock-up, 14 Oct 2026). Web or phone, no login:
// the link in his email is the key. Per machine: Pattern 43 and the MACHINE Management List, each read by HON the moment
// it lands, so a wrong document is caught while he is at the press. A machine that will not print is marked down with a
// reason. Then the blind count: every OBP line, no on-hand shown ("dont show him what is on hand"), 0 is a count.
// String.raw keeps the client script's backslashes; no backtick or dollar-brace inside (scripts/verify_client_scripts.mjs).
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const HEAD = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="robots" content="noindex"><meta name="theme-color" content="#1B3A5C"><link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@500;600&display=swap" rel="stylesheet">`;

const CSS = String.raw`<style>
:root{--navy:#1B3A5C;--green:#5FB946;--green-d:#3E8E2A;--amber:#B0741A;--red:#BC3B2C;--bg:#EEF1F6;--surface:#FFFFFF;--panel:#F5F7FA;--line:#EBEFF4;--line2:#DCE3EC;--mut:#718096;--fg:#1B2B3F;--greenbg:#EDF6E9;--amberbg:#FBF3E4;--redbg:#FCECE9;--navybg:#E9EFF6;--fh:'Outfit',Arial,Helvetica,sans-serif;--ff:'DM Sans',Arial,Helvetica,sans-serif}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--ff);font-size:15px;line-height:1.45}
.app{max-width:720px;margin:0 auto;min-height:100vh;background:var(--surface)}
@media (min-width:760px){body{padding:24px 16px}.app{min-height:auto;border-radius:20px;overflow:hidden;box-shadow:0 8px 28px rgba(20,45,72,.08)}}
.top{background:var(--navy);color:#fff;padding:calc(14px + env(safe-area-inset-top)) 18px 14px;border-top:4px solid var(--green)}
.wm{font-family:var(--fh);font-weight:600;font-size:16px;letter-spacing:4px}.wm small{display:block;font-family:var(--ff);font-size:9px;letter-spacing:2px;opacity:.6;font-weight:500}
.top h1{font-family:var(--fh);font-weight:600;font-size:22px;margin:10px 0 2px}.top .s{font-size:13px;opacity:.8}
.scr{padding:16px 16px 28px;display:flex;flex-direction:column;gap:14px}
.test{background:var(--amberbg);color:var(--amber);font-weight:600;font-size:13px;padding:10px 14px;border-radius:12px}
.grp{font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut);margin:6px 2px -4px;display:flex;justify-content:space-between}
.grp em{font-style:normal;letter-spacing:0;text-transform:none;font-size:12.5px}
.card{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface)}
.mh{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;background:var(--panel)}
.mh b{font-family:var(--fh);font-size:16px;font-weight:600}.mh .sn{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--mut)}
.up{display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid var(--line)}
.up .tx{flex:1;min-width:0}.up .nm{font-weight:600}.up .sm{font-size:12.5px;color:var(--mut);margin-top:2px}
.up .sm.bad{color:var(--red);font-weight:600}.up .sm.ok{color:var(--green-d)}
.pick{position:relative;overflow:hidden;flex:none;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--line2);background:var(--surface);color:var(--navy);font-family:var(--fh);font-weight:600;font-size:14px;display:inline-flex;align-items:center;cursor:pointer}
.pick input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;font-size:0}
.pick.primary{background:var(--navy);color:#fff;border-color:var(--navy)}
.si{width:24px;height:24px;border-radius:50%;border:1.5px solid var(--line2);flex:none;position:relative}
.si.ok{border-color:var(--green)}.si.ok:after{content:"";position:absolute;left:8px;top:4px;width:5px;height:10px;border:solid var(--green-d);border-width:0 1.5px 1.5px 0;transform:rotate(45deg)}
.si.bad{border-color:var(--red);background:var(--redbg)}.si.bad:after{content:"!";position:absolute;inset:0;display:grid;place-items:center;color:var(--red);font-weight:700;font-size:13px}
.si.busy{border-color:var(--navy);border-top-color:transparent;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.down{padding:10px 14px 12px;border-top:1px solid var(--line)}
.down label{display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer;min-height:36px}
.down textarea{width:100%;margin-top:8px;border:1px solid #E9D4A3;background:var(--amberbg);border-radius:10px;padding:10px 12px;font:inherit;min-height:60px;color:var(--fg)}
.down .err{color:var(--red);font-size:12.5px;font-weight:600;margin-top:4px}
.ln{display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid var(--line);min-height:56px}
.ln .tx{flex:1;min-width:0}.ln .nm{font-weight:600;font-size:14.5px}.ln .pn{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--mut)}
.ln input{width:84px;min-height:44px;border:1px solid var(--line2);border-radius:10px;text-align:center;font-family:var(--fh);font-size:18px;font-weight:600;color:var(--fg);background:var(--surface)}
.ln input.done{border-color:var(--green);background:var(--greenbg)}
.cat{padding:10px 14px 4px;font-size:11px;font-weight:600;letter-spacing:1.1px;text-transform:uppercase;color:var(--mut);background:var(--panel);border-top:1px solid var(--line)}
.add{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--line)}
.add input{flex:1;min-height:44px;border:1px solid var(--line2);border-radius:10px;padding:0 12px;font:inherit}.add input.n{flex:0 0 84px;text-align:center}
.btn{min-height:44px;border:0;border-radius:10px;background:var(--navy);color:#fff;font-family:var(--fh);font-weight:600;font-size:14px;padding:0 16px;cursor:pointer}
.state{border-radius:14px;padding:14px 16px;font-size:14px}
.state.wait{background:var(--navybg);color:var(--navy)}.state.done{background:var(--greenbg);color:var(--green-d);font-weight:600}
.state ul{margin:6px 0 0;padding-left:18px}
.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--fg);color:#fff;padding:10px 16px;border-radius:999px;font-size:13.5px;opacity:0;transition:opacity .2s;pointer-events:none}.toast.on{opacity:1}
.foot{text-align:center;color:var(--mut);font-size:12px;padding:6px 0 0}
</style>`;

export function auditUploadHtml({ token, ship, crew }) {
  return HEAD("Printshop audit · " + ship) + CSS + `</head><body><div class="app">
<header class="top"><div class="wm">CIMS<small>Printshop audit</small></div><h1>${esc(ship)}</h1><div class="s" id="sub">${esc(crew || "")}</div></header>
<main class="scr" id="main"><div class="state wait">Loading…</div></main></div><div class="toast" id="toast"></div>
<script>window.__T=${JSON.stringify(String(token))};</script>
<script>` + SCRIPT + `</script></body></html>`;
}

export function auditClosedHtml(why) {
  const msg = why === "cancelled" ? "This request was cancelled. Nothing more is needed." : why === "expired" ? "This link has expired. Ask Dexter or Onboard Support for a new one." : "This link is not valid. Use the newest email you received.";
  return HEAD("Printshop audit") + CSS + `</head><body><div class="app"><header class="top"><div class="wm">CIMS<small>Printshop audit</small></div><h1>Link closed</h1></header><main class="scr"><div class="state wait">${esc(msg)}</div></main></div></body></html>`;
}

const SCRIPT = String.raw`
(function () {
  "use strict";
  var T = window.__T, S = null, busy = {}, pending = {}, timer = null;
  var $ = function (id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function when(v) { var d = new Date(v); if (isNaN(d)) return ""; return MON[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) + " UTC"; }
  function toast(t) { var e = $("toast"); e.textContent = t; e.className = "toast on"; clearTimeout(e._t); e._t = setTimeout(function () { e.className = "toast"; }, 2600); }
  function q(p) { return p + (p.indexOf("?") < 0 ? "?" : "&") + "t=" + encodeURIComponent(T); }
  function api(p, body) {
    return fetch(q(p), body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok && !j.say) j.say = j.error || ("HTTP " + r.status); return j; }); })
      .catch(function () { return { ok: false, say: "No connection. Your work on this page is kept; try again." }; });
  }
  // A soft load never redraws under the crew's fingers: while a count box or a reason has the focus, only the counters
  // and the "still to do" box change.
  function typing() { var a = document.activeElement; return !!(a && a.hasAttribute && (a.hasAttribute("data-part") || a.hasAttribute("data-reason") || a.id === "xt" || a.id === "xn")); }
  function bits() {
    var done = S.lines.filter(function (l) { var v = S.counted[l.part_no]; return v !== undefined && v !== null && v !== ""; }).length;
    var c = $("cntprog"); if (c) c.textContent = done + " of " + S.lines.length + " counted";
    var g = $("gatebox"); if (g) g.innerHTML = gateHtml();
  }
  function gateHtml() { return S.status !== "sent" ? "" : S.gate.open ? '<div class="state done">Everything is in.</div>' : '<div class="state wait"><b>Still to do</b><ul>' + S.gate.missing.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"; }
  function load(soft) { return api("/api/audit/u/state").then(function (j) { if (j && j.machines) { S = j; if (soft && typing() && S.status === "sent") bits(); else draw(); } else { $("main").innerHTML = '<div class="state wait">' + esc(j.say || j.error || "Could not load.") + "</div>"; } }); }

  function slotRow(m, kind, label, hint) {
    var s = m[kind], k = m.serial + "|" + kind, b = busy[k];
    var icon = b ? "busy" : !s ? "" : s.read_state === "ok" ? "ok" : (s.read_state === "pending" || s.read_state === "failed") ? "busy" : "bad";
    var line = b ? esc(b) : !s ? esc(hint) : (s.read_state === "ok" ? '<span class="sm ok">' + esc(s.say) + "</span>" : (s.read_state === "wrong_doc" || s.read_state === "unreadable") ? '<span class="sm bad">' + esc(s.say) + "</span>" : esc(s.say || "Reading…"));
    var cls = (!s || (s.read_state !== "ok" && s.read_state !== "pending" && s.read_state !== "failed")) ? "pick primary" : "pick";
    var btn = S.status !== "sent" ? "" : '<span class="' + cls + '">' + (s ? "Replace" : "Choose file") + '<input type="file" accept="application/pdf,image/*" data-serial="' + esc(m.serial) + '" data-kind="' + kind + '"></span>';
    return '<div class="up"><span class="si ' + icon + '"></span><div class="tx"><div class="nm">' + label + "</div><div class=\"sm\">" + (s && s.filename ? esc(s.filename) + " · " : "") + "</div><div class=\"sm\">" + line + "</div></div>" + btn + "</div>";
  }
  function draw() {
    $("sub").textContent = S.crew + " · for " + S.auditor + "'s visit · by " + when(S.dueAt);
    var h = "";
    if (S.test) h += '<div class="test">Test mode. This page is real, the request went to the auditor only.</div>';
    if (S.status !== "sent") h += '<div class="state done">Everything is in. ' + esc(S.auditor) + " has been told. Thank you.</div>";
    var md = S.machines.filter(function (m) { return m.down || (m.p43 && m.p43.read_state === "ok" && m.mgmt && m.mgmt.read_state === "ok"); }).length;
    h += '<div class="grp"><span>Machines</span><em>' + md + " of " + S.machines.length + " done</em></div>";
    S.machines.forEach(function (m) {
      h += '<div class="card"><div class="mh"><div><b>' + esc(m.label) + '</b><div class="sn">' + esc(m.serial) + (m.model ? " · " + esc(m.model) : "") + "</div></div>" + (m.down ? '<span class="sm bad" style="font-size:12.5px;color:var(--red);font-weight:600">Down</span>' : "") + "</div>";
      if (!m.down) {
        h += slotRow(m, "p43", "Pattern 43", "12 pages, scanned as one PDF");
        h += slotRow(m, "mgmt", "Machine Management List", "The long report with the life %, as one PDF");
      }
      var open = !!m.down || !!pending["d" + m.serial];
      h += '<div class="down"><label><input type="checkbox" data-down="' + esc(m.serial) + '"' + (open ? " checked" : "") + (S.status !== "sent" ? " disabled" : "") + "> This machine will not print</label>";
      if (open) h += '<textarea data-reason="' + esc(m.serial) + '" placeholder="Why is it down? (required)"' + (S.status !== "sent" ? " disabled" : "") + ">" + esc(m.down || pending["r" + m.serial] || "") + '</textarea><div class="err" id="err' + esc(m.serial) + '"></div>';
      h += "</div></div>";
    });
    var done = S.lines.filter(function (l) { var v = S.counted[l.part_no]; return v !== undefined && v !== null && v !== ""; }).length;
    h += '<div class="grp"><span>Inventory count</span><em id="cntprog">' + done + " of " + S.lines.length + " counted</em></div>";
    h += '<div class="card"><div class="up" style="border-top:0"><div class="tx"><div class="sm">Count the shelf and type the total for every line. 0 is a count. The page saves as you type.</div></div></div>';
    var cat = null;
    S.lines.forEach(function (l) {
      if ((l.category || "Other") !== cat) { cat = l.category || "Other"; h += '<div class="cat">' + esc(cat) + "</div>"; }
      var v = S.counted[l.part_no];
      h += '<div class="ln"><div class="tx"><div class="nm">' + esc(l.description || l.part_no) + '</div><div class="pn">' + esc(l.part_no) + '</div></div><input inputmode="numeric" pattern="[0-9]*" maxlength="5" data-part="' + esc(l.part_no) + '" value="' + (v === undefined || v === null ? "" : esc(v)) + '"' + (v !== undefined && v !== null ? ' class="done"' : "") + (S.status !== "sent" ? " disabled" : "") + "></div>";
    });
    h += '<div class="cat">Not on the list</div>';
    S.extras.forEach(function (x) { h += '<div class="ln"><div class="tx"><div class="nm">' + esc(x.text) + "</div></div><b>" + esc(x.counted == null ? "" : x.counted) + "</b></div>"; });
    if (S.status === "sent") h += '<div class="add"><input id="xt" placeholder="Item and part number"><input id="xn" class="n" inputmode="numeric" placeholder="Qty"><button class="btn" id="xadd">Add</button></div>';
    h += "</div>";
    h += '<div id="gatebox">' + gateHtml() + "</div>";
    h += '<div class="foot">CIMS · audit.cims.work</div>';
    $("main").innerHTML = h;
  }

  function send(file, serial, kind) {
    var k = serial + "|" + kind;
    if (file.size > 24 * 1024 * 1024) { toast("The file is " + Math.round(file.size / 1048576) + " MB; the limit is 24 MB. Scan at a lower resolution."); return; }
    busy[k] = "Sending… 0%"; draw();
    var x = new XMLHttpRequest();
    x.open("POST", q("/api/audit/u/upload?serial=" + encodeURIComponent(serial) + "&kind=" + kind));
    x.setRequestHeader("Content-Type", file.type || "application/pdf");
    x.setRequestHeader("X-File-Name", file.name || "file");
    x.upload.onprogress = function (e) { if (e.lengthComputable) { busy[k] = "Sending… " + Math.round(e.loaded / e.total * 100) + "%"; draw(); } };
    x.onerror = function () { delete busy[k]; draw(); toast("No connection. Choose the file again."); };
    x.onload = function () {
      var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
      if (!j.ok) { delete busy[k]; draw(); toast(j.say || j.error || "Not sent"); return; }
      busy[k] = kind === "mgmt" ? "Reading the list… up to two minutes" : "Measuring the 12 pages…"; draw();
      api("/api/audit/u/read?id=" + encodeURIComponent(j.id), {}).then(function (r) {
        delete busy[k];
        if (r && r.say) toast(r.say.length > 90 ? r.say.slice(0, 90) + "…" : r.say);
        load();
      });
    };
    x.send(file);
  }
  function flush() {
    var counts = {}, any = false;
    Object.keys(pending).forEach(function (k) { if (k.indexOf("c:") === 0) { counts[k.slice(2)] = pending[k]; delete pending[k]; any = true; } });
    if (!any) return Promise.resolve();
    return api("/api/audit/u/count", { counts: counts }).then(function (j) { if (j && j.ok === false) toast(j.say || "Not saved"); else return load(true); });
  }

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.type === "file" && t.files && t.files[0]) send(t.files[0], t.getAttribute("data-serial"), t.getAttribute("data-kind"));
    if (t.hasAttribute("data-down")) {
      var sn = t.getAttribute("data-down");
      if (t.checked) { pending["d" + sn] = 1; draw(); var ta = document.querySelector('[data-reason="' + sn + '"]'); if (ta) ta.focus(); }
      else { delete pending["d" + sn]; api("/api/audit/u/down", { serial: sn, down: false }).then(load); }
    }
  });
  document.addEventListener("focusout", function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute("data-reason")) {
      var sn = t.getAttribute("data-reason"), r = t.value.trim();
      pending["r" + sn] = t.value;
      if (!r) { var er = $("err" + sn); if (er) er.textContent = "Write why the machine is down."; return; }
      api("/api/audit/u/down", { serial: sn, reason: r, down: true }).then(function (j) { if (j.ok) { delete pending["d" + sn]; delete pending["r" + sn]; toast("Saved"); load(); } else toast(j.say || "Not saved"); });
    }
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute("data-part")) {
      t.value = t.value.replace(/[^0-9]/g, "").slice(0, 5);
      pending["c:" + t.getAttribute("data-part")] = t.value;
      t.className = t.value === "" ? "" : "done";
      clearTimeout(timer); timer = setTimeout(flush, 900);
    }
  });
  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "xadd") {
      var tx = $("xt").value.trim(); if (!tx) { toast("Write the item"); return; }
      api("/api/audit/u/count", { extras: [{ text: tx, counted: $("xn").value }] }).then(function (j) { if (j.ok) load(); else toast(j.say || "Not saved"); });
    }
  });
  window.addEventListener("beforeunload", function () { if (Object.keys(pending).some(function (k) { return k.indexOf("c:") === 0; })) flush(); });
  load();
})();
`;
