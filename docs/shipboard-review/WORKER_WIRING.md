# SBM Review — worker.js wiring (Phase A)

`src/worker.js` (318 KB) exceeds the GitHub MCP tool limits, so the branch
`feat/shipboard-review` ships the module, migration and tests **without**
touching worker.js. This document is the exact wiring diff, verified locally:
with it applied, **`npm test` = 207/207 green** (181 baseline + 26 new
`test/sbm.test.js`). Apply it via the GitHub web editor (or any local
checkout) as the final step of the Phase A merge.

Ordering: merge the branch first (module + migration are inert without the
wiring), run `wrangler d1 migrations apply` on staging, apply this diff, then
promote per CLAUDE.md §4/§9. `ensureSbm()` also self-creates the tables
(ensureFb pattern), so a wiring-before-migration window cannot 500.

Invariants respected (CLAUDE.md §11):
- All three routes sit **inside the existing error-boundary wrapper**
  (`return await (async () => { ... })();`) — hunks 2 and 3 are inside it.
- The cron call is wrapped in its own `.catch(...)` so a sweep failure can
  never break `processIntelInbox` / movements / auto-send.
- No changes to `src/bonus.js`, auth logic, or any existing test. No seval
  writes anywhere (Phase B).

## Hunks and their grep anchors

| # | Where | Find the anchor with | Insert |
|---|---|---|---|
| 1 | module imports/installs (top of file) | `grep -n 'installAutoSend' src/worker.js` | `import { installSbm } ...` after the auto_send import; `const _sbm = installSbm({...})` after the `_runAutoSend` const |
| 2 | public routes, after the /fb block | `grep -n '/api/feedback/submit' src/worker.js` | `/sbm` GET + `/api/sbm/submit` POST (public, token-authenticated) |
| 3 | session-gated /api/ block | `grep -n '/api/feedback/score' src/worker.js` | `/api/sbm/crew` (existing session auth: unauthenticated requests already got the 401 above) |
| 4 | `async scheduled(event, env, ctx)` | `grep -n '_runAutoSend(env, event)' src/worker.js` | guarded `_sbm.sbmDailySweep(env)` |
| 5 | crew tab, below Contract history (inside the APP_HTML template literal) | `grep -n 'No Keyman contract history on file' src/worker.js` | "Manager Feedback" section + `loadSbmCards()` renderer |

Hunk 5 lives inside the APP_HTML **template literal**: client-side escapes are
written `…`-style (consumed at template evaluation, so the browser gets
the real character inside a string literal), there are no
backticks or `${` in the inserted client code, and `test/client_script_syntax.test.js`
parses the shipped inline script — it is green with this diff.

## The exact unified diff (3 lines of context per hunk)

```diff
diff --git a/src/worker.js b/src/worker.js
index 359cec3..c53f0de 100644
--- a/src/worker.js
+++ b/src/worker.js
@@ -27,9 +27,14 @@ import { runMaria, rankCrewMatches } from "./maria.js";
 import { installAck } from "./signoff_ack.js";
 import { installInstr } from "./signoff_instructions.js";
 import { installAutoSend } from "./auto_send.js";
+import { installSbm } from "./sbm.js";
 const _autoInstr = installInstr({ json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF, sendViaMailer });
 const _autoAck = installAck({ json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF, sendViaMailer });
 const _runAutoSend = installAutoSend({ sendInstructionsFor: _autoInstr.sendInstructionsFor, sendSignoffLinkFor: _autoAck.sendSignoffLinkFor, sendViaMailer, BOARD_LEGS: autoSendBoardLegs, ORIGIN: "https://cims.work", DIGEST_TO: ["Miguel.Sanmartin@dg3.com"], DIGEST_CC: ["Rita.Berenyi@dg3.com"] });
+// Shipboard Management Review (Phase A): survey page, submit, T-7/T-4 sweep,
+// crew cards. Same install pattern as auto-send. NO money code here -- the
+// Score Card / sEval integration is a separate human-approved Phase B PR.
+const _sbm = installSbm({ sendViaMailer, logActivity, SECTIONS: rotationSections, VESSEL_REF, ORIGIN: "https://cims.work" });
 // Live legs for auto-timing: the SAME resolved dates the Keyman board displays
 // and billing uses (rotationSections), NOT the historical keyman_contract3.
 async function autoSendBoardLegs(env) {
@@ -137,6 +142,10 @@ export default {
       if (p === "/api/feedback/form")    return apiFeedbackForm(env, url);
       if (p === "/api/feedback/submit" && request.method === "POST") return apiFeedbackSubmit(request, env);
 
+      // ---- public shipboard management review (token-authenticated, no login) ----
+      if (p === "/sbm")                  return _sbm.sbmFormPage(request, env, url);
+      if (p === "/api/sbm/submit" && request.method === "POST") return _sbm.sbmSubmit(request, env);
+
       // ---- everything below requires a session ----
       const session = await getSession(request, env);
       { const _a = await installAck({ json, htmlResponse, signToken, verifyToken, sha256hex, logActivity, applyOverride, VESSEL_REF, sendViaMailer })(p, request, env, url, session); if (_a) return _a; }
@@ -175,6 +184,7 @@ export default {
         if (p === "/api/feedback/crew")  return apiFeedbackCrew(env, url);
         if (p === "/api/feedback/board") return apiFeedbackBoard(env);
         if (p === "/api/feedback/score" && request.method === "POST") return apiFeedbackScore(request, env, session);
+        if (p === "/api/sbm/crew")       return json(await _sbm.sbmCrewCards(env, url.searchParams.get("id")));
         if (p === "/api/score/queue")    return apiScoreQueue(env, url);
         if (p === "/api/intel/inbox")    return apiIntelInbox(env);
         if (p === "/api/intel/ingest" && request.method === "POST") return apiIntelIngest(request, env, session);
@@ -220,6 +230,8 @@ export default {
     if (ctx && ctx.waitUntil) ctx.waitUntil(processIntelInbox(env, 25));
     if (ctx && ctx.waitUntil) ctx.waitUntil(maybeSendMovements(env, event));
     if (ctx && ctx.waitUntil) ctx.waitUntil(_runAutoSend(env, event));
+    // SBM review sweep (T-7 invite / T-4 reminder). Guarded so a sweep failure can never break the existing cron.
+    if (ctx && ctx.waitUntil) ctx.waitUntil(_sbm.sbmDailySweep(env).catch(function (e) { console.error("sbm_sweep", (e && e.stack) || e); }));
   }
 };
 
@@ -3230,9 +3242,28 @@ async function openCrew(id){
   if(!ct.length)h+='<p class=muted style="text-align:left;padding:8px 2px">No Keyman contract history on file.</p>';
   else h+='<table class=tbl><thead><tr><th>#</th><th>Ship</th><th>Sign on</th><th>Sign off</th><th>Basis</th></tr></thead><tbody>'
     +ct.map(function(x){var off=x.act||x.proj||'—';var basis=x.act?'<span class="cchip ok">actual</span>':(x.proj?'<span class="cchip royal">projected</span>':'<span class="cchip amber">open</span>');return '<tr><td>'+x.seq+'</td><td>'+(x.ship||'—')+'</td><td>'+x.on+'</td><td>'+off+'</td><td>'+basis+'</td></tr>';}).join('')+'</tbody></table>';
+  h+='<div class=zlabel style="margin-top:16px">Manager Feedback</div><div id=sbmcards><p class=muted style="text-align:left;padding:8px 2px">Loading…</p></div>';
   h+='</div>';
   $('#view').innerHTML=h;
   document.querySelectorAll('#view .rf').forEach(function(b){b.onclick=function(){reqFeedback(b.getAttribute('data-role'));};});
+  loadSbmCards(c.agency_id);
+}
+// Shipboard Management Review responses -> permanent "Manager Feedback" cards (below Contract history).
+async function loadSbmCards(id){
+  var el=document.getElementById('sbmcards'); if(!el)return;
+  function ev(v){return String(v==null?'':v).replace(/[&<>"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];});}
+  try{
+    var r=await (await fetch('/api/sbm/crew?id='+encodeURIComponent(id))).json();
+    var cards=(r&&r.cards)||[];
+    if(!cards.length){el.innerHTML='<p class=muted style="text-align:left;padding:8px 2px">No shipboard management reviews yet.</p>';return;}
+    el.innerHTML=cards.map(function(x){
+      var qs=[['Smart with work',x.q_business],['Guests come first',x.q_guests],['Helps us grow',x.q_grow],['Acts with care',x.q_integrity],['Team player',x.q_teams],['High energy',x.q_energy],['Final thoughts',x.q_final]]
+        .filter(function(pr){return pr[1];}).map(function(pr){return '<div style="margin-top:6px;font-size:13px"><span class=csub>'+pr[0]+':</span> “'+ev(pr[1])+'”</div>';}).join('');
+      return '<div class="card" style="max-width:none;margin-bottom:10px;border-left:3px solid var(--navy)">'
+        +'<div class=csub>'+ev(x.ship||'—')+' · '+ev(x.brand||'—')+' · '+ev((x.contract_signon||'?')+' → '+(x.contract_signoff||'?'))+' · submitted '+ev(String(x.submitted_at||'').slice(0,10))+'</div>'
+        +'<div style="font-weight:700;margin-top:4px">Overall '+ev(x.rating)+'/5</div>'+qs+'</div>';
+    }).join('');
+  }catch(e){el.innerHTML='<p class=muted style="text-align:left;padding:8px 2px">Could not load shipboard reviews.</p>';}
 }
 async function reqFeedback(role){
   $('#fbout').textContent='Creating link…';
```

## Behaviour notes for the reviewer

- **Recipients are config, not code.** The sweep resolves the shipboard-manager
  address from `sbm_config`: `recipient:<ship>` first, then `recipient:<brand>`
  (`Royal Caribbean` / `Celebrity` / `Azamara`). With neither configured it
  skips and logs — nothing is sent, nothing errors, no request row is created.
  Since **no recipients are seeded** (list pending from Miguel, spec §11.1),
  wiring this in is safe: the pipeline stays dormant until `sbm_config` rows
  exist. That is the Phase A go-live switch.
- **Exact-day triggers, per spec:** invite fires only when a live sign-off is
  exactly T-7; the reminder only when a `sent` request is exactly T-4. The
  hourly cron gives many chances the same day (idempotent via
  `UNIQUE(agency_id, contract_signoff)` and status transitions), but a cron
  outage spanning a full calendar day means that leg's invite is skipped, by
  design — no retroactive blast, mirroring the auto-send seeding philosophy.
- **Invite mail failure = no request row** (auto_send "log only on success"
  rule), so the same day can retry on later cron ticks.
- **The reminder re-derives the identical single-use link** (same HMAC payload
  -> same token), so invite and reminder point at one link and the DB stores
  only the sha256 hash.

## Open items (blocking go-live, not merge)

1. Per-ship / per-brand shipboard-manager email list -> `sbm_config`
   `recipient:*` rows (spec §11.1). Pipeline dormant until then.
2. Team distribution list -> `sbm_config` key `team_list` (spec §11.2).
3. Ship mailbox addresses for the crew-facing copy -> `sbm_config`
   `shipmail:<ship>` (optional; copy silently skipped when absent).
4. Celebrity `#33415C` / Azamara `#0E8C8C` accents are the spec placeholders —
   confirm before those brands go live (spec §11.5).
5. Historical MS Forms import (spec §11.3) is NOT part of this branch.
6. There is no console editor for `sbm_config` yet — rows go in via the D1
   console for the pilot; a settings UI can follow.
